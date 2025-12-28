import Application from "./application-v1.mjs";
import FilePicker from "@client/applications/apps/file-picker.mjs";
import TextEditor from "@client/applications/ux/text-editor.mjs";

/**
 * @import * as TinyMCE from "tinymce";
 * @import * as ProseMirror from "prosemirror-view";
 * @import {ApplicationV1Options} from "../api/application-v1.mjs";
 */

/**
 * @typedef FormApplicationOptions
 * @property {boolean} [closeOnSubmit=true]     Whether to automatically close the application when it's contained
 *                                              form is submitted.
 * @property {boolean} [submitOnChange=false]   Whether to automatically submit the contained HTML form when an input
 *                                              or select element is changed.
 * @property {boolean} [submitOnClose=false]    Whether to automatically submit the contained HTML form when the
 *                                              application window is manually closed.
 * @property {boolean} [editable=true]          Whether the application form is editable - if true, it's fields will
 *                                              be unlocked and the form can be submitted. If false, all form fields
 *                                              will be disabled and the form cannot be submitted.
 * @property {boolean} [sheetConfig=false]      Support configuration of the sheet type used for this application.
 */

/**
 * An abstract pattern for defining an Application responsible for updating some object using an HTML form
 *
 * A few critical assumptions:
 * 1) This application is used to only edit one object at a time
 * 2) The template used contains one (and only one) HTML form as it's outermost element
 * 3) This abstract layer has no knowledge of what is being updated, so the implementation must define _updateObject
 *
 * @abstract
 * @deprecated since V13
 */
export default class FormApplication extends Application {
  /**
   * @param {object} object                    Some object which is the target data structure to be updated by the form.
   * @param {FormApplicationOptions & ApplicationV1Options} [options] Additional options which modify the rendering of
   *                                                                  the sheet.
   */
  constructor(object={}, options={}) {
    super(options);

    /**
     * The object target which we are using this form to modify
     * @type {*}
     */
    this.object = object;

    /**
     * A convenience reference to the form HTMLElement
     * @type {HTMLElement}
     */
    this.form = null;

    /**
     * Keep track of any mce editors which may be active as part of this form
     * The values of this object are inner-objects with references to the MCE editor and other metadata
     * @type {Record<string, object>}
     */
    this.editors = {};
  }

  /**
   * An array of custom element tag names that should be listened to for changes.
   * @type {string[]}
   * @protected
   */
  static get _customElements() {
    return Object.values(foundry.applications.elements).reduce((arr, el) => {
      if ( el.tagName ) arr.push(el.tagName);
      return arr;
    }, []);
  }

  /* -------------------------------------------- */

  /**
   * Assign the default options which are supported by the document edit sheet.
   * In addition to the default options object supported by the parent Application class, the Form Application
   * supports the following additional keys and values:
   *
   * @returns {ApplicationV1Options & FormApplicationOptions} The default options for this FormApplication class
   */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["form"],
      closeOnSubmit: true,
      editable: true,
      sheetConfig: false,
      submitOnChange: false,
      submitOnClose: false
    });
  }

  /* -------------------------------------------- */

  /**
   * Is the Form Application currently editable?
   * @type {boolean}
   */
  get isEditable() {
    return this.options.editable;
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /**
   * @inheritdoc
   * @returns {object|Promise<object>}
   */
  getData(_options) {
    return {
      object: this.object,
      options: this.options,
      title: this.title
    };
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _render(force, options) {

    // Identify the focused element
    let focus = this.element.find(":focus");
    focus = focus.length ? focus[0] : null;

    // Render the application and restore focus
    await super._render(force, options);
    if ( focus && focus.name ) {
      const input = this.form?.[focus.name];
      if ( input && (input.focus instanceof Function) ) input.focus();
    }
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _renderInner(...args) {
    const html = await super._renderInner(...args);
    this.form = html.filter((_i, el) => el instanceof HTMLFormElement)[0];
    if ( !this.form ) this.form = html.find("form")[0];
    return html;
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /** @inheritdoc */
  _activateCoreListeners(html) {
    super._activateCoreListeners(html);
    if ( !this.form ) return;
    if ( !this.isEditable ) {
      return this._disableFields(this.form);
    }
    this.form.onsubmit = this._onSubmit.bind(this);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  activateListeners(html) {
    super.activateListeners(html);
    if ( !this.isEditable ) return;
    const changeElements = ["input", "select", "textarea"].concat(this.constructor._customElements);
    html.on("change", changeElements.join(","), this._onChangeInput.bind(this));
    html.find(".editor-content[data-edit]").each((_i, div) => this._activateEditor(div));
    html.find("button.file-picker").click(this._activateFilePicker.bind(this));
    if ( this._priorState <= this.constructor.RENDER_STATES.NONE ) html.find("[autofocus]")[0]?.focus();
  }

  /* -------------------------------------------- */

  /**
   * If the form is not editable, disable its input fields
   * @param {HTMLElement} form    The form HTML
   * @protected
   */
  _disableFields(form) {
    const inputs = ["INPUT", "SELECT", "TEXTAREA", "BUTTON"];
    for ( const i of inputs ) {
      for ( const el of form.getElementsByTagName(i) ) {
        if ( i === "TEXTAREA" ) el.readOnly = true;
        else el.disabled = true;
      }
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle standard form submission steps
   * @param {Event} event               The submit event which triggered this handler
   * @param {object} options
   * @param {object | null} [options.updateData] Additional specific data keys/values which override or extend the
   *                                             contents of the parsed form. This can be used to update other flags or
   *                                             data fields at the same time as processing a form submission to avoid
   *                                             multiple database operations.
   * @param {boolean} [options.preventClose]     Override the standard behavior of whether to close the form on submit
   * @param {boolean} [options.preventRender]   Prevent the application from re-rendering as a result of form submission
   * @returns {Promise}                 A promise which resolves to the validated update data
   * @protected
   */
  async _onSubmit(event, {updateData=null, preventClose=false, preventRender=false}={}) {
    event.preventDefault();

    // Prevent double submission
    const states = this.constructor.RENDER_STATES;
    if ( (this._state === states.NONE) || !this.isEditable || this._submitting ) return false;
    this._submitting = true;

    // Process the form data
    const formData = this._getSubmitData(updateData);

    // Handle the form state prior to submission
    let closeForm = this.options.closeOnSubmit && !preventClose;
    const priorState = this._state;
    if ( preventRender ) this._state = states.RENDERING;
    if ( closeForm ) this._state = states.CLOSING;

    // Trigger the object update
    try {
      await this._updateObject(event, formData);
    }
    catch(err) {
      console.error(err);
      closeForm = false;
      this._state = priorState;
    }

    // Restore flags and optionally close the form
    this._submitting = false;
    if ( preventRender ) this._state = priorState;
    if ( closeForm ) await this.close({submit: false, force: true});
    return formData;
  }

  /* -------------------------------------------- */

  /**
   * Get an object of update data used to update the form's target object
   * @param {object} updateData     Additional data that should be merged with the form data
   * @returns {object}               The prepared update data
   * @protected
   */
  _getSubmitData(updateData={}) {
    if ( !this.form ) throw new Error("The FormApplication subclass has no registered form element");
    const fd = new foundry.applications.ux.FormDataExtended(this.form, {editors: this.editors});
    let data = fd.object;
    if ( updateData ) data = foundry.utils.flattenObject(foundry.utils.mergeObject(data, updateData));
    return data;
  }

  /* -------------------------------------------- */

  /**
   * Handle changes to an input element, submitting the form if options.submitOnChange is true.
   * Do not preventDefault in this handler as other interactions on the form may also be occurring.
   * @param {Event} event  The initial change event
   * @protected
   */
  async _onChangeInput(event) {

    // Saving a <prose-mirror> element
    if ( event.currentTarget.matches("prose-mirror") ) return this._onSubmit(event);

    // Ignore inputs inside an editor environment
    if ( event.currentTarget.closest(".editor.prosemirror, .editor.tinymce") ) return;

    // Handle changes to specific input types
    const el = event.target;
    if ( (el.type === "color") && el.dataset.edit ) this._onChangeColorPicker(event);
    else if ( el.type === "range" ) this._onChangeRange(event);

    // Maybe submit the form
    if ( this.options.submitOnChange ) {
      return this._onSubmit(event);
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle the change of a color picker input which enters it's chosen value into a related input field
   * @param {Event} event   The color picker change event
   * @protected
   */
  _onChangeColorPicker(event) {
    const input = event.target;
    input.form[input.dataset.edit].value = input.value;
  }

  /* -------------------------------------------- */

  /**
   * Handle changes to a range type input by propagating those changes to the sibling range-value element
   * @param {Event} event  The initial change event
   * @protected
   */
  _onChangeRange(event) {
    const field = event.target.parentElement.querySelector(".range-value");
    if ( field ) {
      if ( field.tagName === "INPUT" ) field.value = event.target.value;
      else field.innerHTML = event.target.value;
    }
  }

  /* -------------------------------------------- */

  /**
   * This method is called upon form submission after form data is validated
   * @param {Event} event       The initial triggering submission event
   * @param {object} formData   The object of validated form data with which to update the object
   * @returns {Promise}         A Promise which resolves once the update operation has completed
   * @abstract
   */
  async _updateObject(event, formData) {
    throw new Error("A subclass of the FormApplication must implement the _updateObject method.");
  }

  /* -------------------------------------------- */
  /*  TinyMCE Editor                              */
  /* -------------------------------------------- */

  /**
   * Activate a named TinyMCE text editor
   * @param {string} name             The named data field which the editor modifies.
   * @param {object} options          Editor initialization options passed to
   *                                  {@link foundry.applications.ux.TextEditor.create}.
   * @param {string} initialContent   Initial text content for the editor area.
   * @returns {Promise<TinyMCE.Editor|ProseMirror.EditorView>}
   */
  async activateEditor(name, options={}, initialContent="") {
    const editor = this.editors[name];
    if ( !editor ) throw new Error(`${name} is not a registered editor name!`);
    options = foundry.utils.mergeObject(editor.options, options);
    if ( !options.fitToSize ) options.height = options.target.offsetHeight;
    if ( editor.hasButton ) editor.button.style.display = "none";
    const instance = editor.instance = editor.mce = await TextEditor.implementation.create(options, initialContent
      || editor.initial);
    options.target.closest(".editor")?.classList.add(options.engine ?? "tinymce");
    editor.changed = false;
    editor.active = true;

    // Legacy behavior to support TinyMCE.
    // We could remove this in the future if we drop official support for TinyMCE.
    if ( options.engine !== "prosemirror" ) {
      instance.focus();
      instance.on("change", () => editor.changed = true);
    }
    return instance;
  }

  /* -------------------------------------------- */

  /**
   * Handle saving the content of a specific editor by name
   * @param {string} name                      The named editor to save
   * @param {object} [options]
   * @param {boolean} [options.remove]         Remove the editor after saving its content
   * @param {boolean} [options.preventRender]  Prevent normal re-rendering of the sheet after saving.
   * @returns {Promise<void>}
   */
  async saveEditor(name, {remove=true, preventRender}={}) {
    const editor = this.editors[name];
    if ( !editor || !editor.instance ) throw new Error(`${name} is not an active editor name!`);
    editor.active = false;
    const instance = editor.instance;
    const event = new Event("submit", {cancelable: true});
    await this._onSubmit(event, { preventRender });

    // Remove the editor
    if ( remove ) {
      instance.destroy();
      editor.instance = editor.mce = null;
      if ( editor.hasButton ) editor.button.style.display = "block";
      this.render();
    }
    editor.changed = false;
  }

  /* -------------------------------------------- */

  /**
   * Activate an editor instance present within the form
   * @param {HTMLElement} div  The element which contains the editor
   * @protected
   */
  _activateEditor(div) {

    // Get the editor content div
    const name = div.dataset.edit;
    const engine = div.dataset.engine || "tinymce";
    const collaborate = div.dataset.collaborate === "true";
    const button = div.previousElementSibling;
    const hasButton = button && button.classList.contains("editor-edit");
    const wrap = div.parentElement.parentElement;
    const wc = div.closest(".window-content");

    // Determine the preferred editor height
    const heights = [wrap.offsetHeight, wc ? wc.offsetHeight : null];
    if ( div.offsetHeight > 0 ) heights.push(div.offsetHeight);
    const height = Math.min(...heights.filter(h => Number.isFinite(h)));

    // Get initial content
    const options = {
      target: div,
      fieldName: name,
      save_onsavecallback: () => this.saveEditor(name),
      height, engine, collaborate
    };
    if ( engine === "prosemirror" ) options.plugins = this._configureProseMirrorPlugins(name, {remove: hasButton});

    // Define the editor configuration
    const initial = foundry.utils.getProperty(this.object, name);
    const editor = this.editors[name] = {
      options,
      target: name,
      button: button,
      hasButton: hasButton,
      mce: null,
      instance: null,
      active: !hasButton,
      changed: false,
      initial
    };

    // Activate the editor immediately, or upon button click
    const activate = () => {
      editor.initial = foundry.utils.getProperty(this.object, name);
      this.activateEditor(name, {}, editor.initial);
    };
    if ( hasButton ) button.onclick = activate;
    else activate();
  }

  /* -------------------------------------------- */

  /**
   * Configure ProseMirror plugins for this sheet.
   * @param {string} name                    The name of the editor.
   * @param {object} [options]               Additional options to configure the plugins.
   * @param {boolean} [options.remove=true]  Whether the editor should destroy itself on save.
   * @returns {object}
   * @protected
   */
  _configureProseMirrorPlugins(name, {remove=true}={}) {
    return {
      menu: ProseMirror.ProseMirrorMenu.build(ProseMirror.defaultSchema, {
        destroyOnSave: remove,
        onSave: () => this.saveEditor(name, {remove})
      }),
      keyMaps: ProseMirror.ProseMirrorKeyMaps.build(ProseMirror.defaultSchema, {
        onSave: () => this.saveEditor(name, {remove})
      })
    };
  }

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /** @inheritdoc */
  async close(options={}) {
    const states = Application.RENDER_STATES;
    if ( this._state === states.CLOSED ) return;
    if ( !options.force && ![states.RENDERED, states.ERROR].includes(this._state) ) return;

    // Trigger saving of the form
    const submit = options.submit ?? this.options.submitOnClose;
    if ( submit ) await this.submit({preventClose: true, preventRender: true});

    // Close any open FilePicker instances
    for ( const fp of (this.#filepickers) ) fp.close();
    this.#filepickers.length = 0;
    for ( const fp of this.element[0].querySelectorAll("file-picker") ) fp.picker?.close();

    // Close any open MCE editors
    for ( const ed of Object.values(this.editors) ) {
      if ( ed.mce ) ed.mce.destroy();
    }
    this.editors = {};

    // Close the application itself
    return super.close(options);
  }

  /* -------------------------------------------- */

  /**
   * Submit the contents of a Form Application, processing its content as defined by the Application
   * @param {object} [options] Options passed to the _onSubmit event handler
   * @returns {Promise<this>}  Return a self-reference for convenient method chaining
   */
  async submit(options={}) {
    if ( this._submitting ) return this;
    const submitEvent = new Event("submit", {cancelable: true});
    await this._onSubmit(submitEvent, options);
    return this;
  }

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  get filepickers() {
    foundry.utils.logCompatibilityWarning("FormApplication#filepickers is deprecated and replaced by the <file-picker>"
      + "HTML element", {since: 12, until: 14, once: true});
    return this.#filepickers;
  }

  #filepickers = [];

  /**
   * @deprecated since v12
   * @ignore
   */
  _activateFilePicker(event) {
    foundry.utils.logCompatibilityWarning("FormApplication#_activateFilePicker is deprecated without replacement",
      {since: 12, until: 14, once: true});
    event.preventDefault();
    const options = this._getFilePickerOptions(event);
    const fp = new FilePicker.implementation(options);
    this.#filepickers.push(fp);
    return fp.browse();
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  _getFilePickerOptions(event) {
    foundry.utils.logCompatibilityWarning("FormApplication#_getFilePickerOptions is deprecated without replacement",
      {since: 12, until: 14, once: true});
    const button = event.currentTarget;
    const target = button.dataset.target;
    const field = button.form[target] || null;
    return {
      field: field,
      type: button.dataset.type,
      current: field?.value ?? "",
      button: button,
      callback: this._onSelectFile.bind(this)
    };
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  _onSelectFile(_selection, _filePicker) {}
}

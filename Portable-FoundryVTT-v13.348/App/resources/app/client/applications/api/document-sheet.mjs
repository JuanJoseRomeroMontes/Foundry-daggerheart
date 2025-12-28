import ApplicationV2 from "./application.mjs";
import {DOCUMENT_OWNERSHIP_LEVELS} from "@common/constants.mjs";
import HTMLSecretBlockElement from "../elements/secret-block.mjs";
import FilePicker from "../apps/file-picker.mjs";

/**
 * @import Document from "@common/abstract/document.mjs";
 * @import {DatabaseCreateOperation, DatabaseUpdateOperation} from "@common/abstract/_types.mjs";
 * @import {ApplicationClickAction, ApplicationConfiguration, ApplicationRenderOptions} from "../_types.mjs";
 * @import FormDataExtended from "../ux/form-data-extended.mjs";
 */

/**
 * @typedef DocumentSheetConfiguration
 * @property {Document} document          The Document instance associated with this sheet
 * @property {number} viewPermission      A permission level in CONST.DOCUMENT_OWNERSHIP_LEVELS
 * @property {number} editPermission      A permission level in CONST.DOCUMENT_OWNERSHIP_LEVELS
 * @property {boolean} canCreate          Can this sheet class be used to create a new Document?
 * @property {boolean} sheetConfig        Allow sheet configuration as a header button
 */

/**
 * @typedef DocumentSheetRenderOptions
 * @property {string} renderContext       A string with the format "{operation}{documentName}" providing context
 * @property {object} renderData          Data describing the document modification that occurred
 */

/**
 * The Application class is responsible for rendering an HTMLElement into the Foundry Virtual Tabletop user interface.
 * @extends {ApplicationV2<
 *  ApplicationConfiguration & DocumentSheetConfiguration,
 *  ApplicationRenderOptions & DocumentSheetRenderOptions
 * >}
 */
export default class DocumentSheetV2 extends ApplicationV2 {
  /** @inheritDoc */
  constructor(options, ...args) {
    options = new.target._migrateConstructorParams(options, args);
    super(options);
    this.#document = options.document;
  }

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    id: "{id}",
    classes: ["sheet"],
    tag: "form",  // Document sheets are forms by default
    document: null,
    viewPermission: DOCUMENT_OWNERSHIP_LEVELS.LIMITED,
    editPermission: DOCUMENT_OWNERSHIP_LEVELS.OWNER,
    canCreate: false,
    sheetConfig: true,
    actions: {
      configureSheet: DocumentSheetV2.#onConfigureSheet,
      copyUuid: {handler: DocumentSheetV2.#onCopyUuid, buttons: [0, 2]},
      editImage: DocumentSheetV2.#onEditImage,
      importDocument: DocumentSheetV2.#onImportDocument
    },
    form: {
      handler: this.#onSubmitDocumentForm,
      submitOnChange: false,
      closeOnSubmit: false
    },
    window: {
      controls: [{
        icon: "fa-solid fa-gear",
        label: "SHEETS.ConfigureSheet",
        action: "configureSheet",
        visible: DocumentSheetV2.#canConfigureSheet
      }]
    }
  };

  /* -------------------------------------------- */

  /**
   * The Document instance associated with the application
   * @type {ClientDocument}
   */
  get document() {
    return this.#document;
  }

  #document;

  /* -------------------------------------------- */

  /** @override */
  get title() {
    const {constructor: cls, id, name, type} = this.document;
    const prefix = cls.hasTypeData && type !== "base" ? CONFIG[cls.documentName].typeLabels[type] : cls.metadata.label;
    return `${game.i18n.localize(prefix)}: ${name || id}`;
  }

  /* -------------------------------------------- */

  /**
   * Is this Document sheet visible to the current User?
   * This is governed by the viewPermission threshold configured for the class.
   * @type {boolean}
   */
  get isVisible() {
    return this.document.testUserPermission(game.user, this.options.viewPermission);
  }

  /* -------------------------------------------- */

  /**
   * Is this Document sheet editable by the current User?
   * This is governed by the editPermission threshold configured for the class.
   * @type {boolean}
   */
  get isEditable() {
    if ( this.document.pack ) {
      const pack = game.packs.get(this.document.pack);
      if ( pack.locked ) return false;
    }
    return this.document.testUserPermission(game.user, this.options.editPermission);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _initializeApplicationOptions(options) {
    options = super._initializeApplicationOptions(options);
    const suffix = options.document.uuid ?? foundry.utils.randomID();
    options.uniqueId = `${this.constructor.name}-${suffix.replaceAll(".", "-")}`;
    const theme = foundry.applications.apps.DocumentSheetConfig.getSheetThemeForDocument(options.document);
    if ( theme && !options.classes.includes("themed") ) options.classes.push("themed", `theme-${theme}`);
    return options;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  *_headerControlButtons() {
    for ( const control of super._headerControlButtons() ) {
      if ( ("ownership" in control) && !this.document.testUserPermission(game.user, control.ownership) ) continue;
      yield control;
    }
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _configureRenderOptions(options) {
    super._configureRenderOptions(options);

    // If the Document's name was changed, update the window title.
    if ( this.hasFrame && options.renderContext && options.renderData?.name ) {
      options.window = Object.assign(options.window ?? {}, {title: this.title});
    }
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const document = this.document;
    return Object.assign(context, {
      document,
      source: document._source,
      fields: document.schema.fields,
      editable: this.isEditable,
      user: game.user,
      rootId: document.collection?.has(document.id) ? this.id : foundry.utils.randomID()
    });
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _renderFrame(options) {
    const frame = await super._renderFrame(options);
    if ( !this.hasFrame ) return frame;

    // Add form options
    if ( this.options.tag === "form" ) frame.autocomplete = "off";

    // Add document ID copy
    if ( this.document.id ) {
      const copyLabel = game.i18n.localize("SHEETS.CopyUuid");
      const copyId = `
        <button type="button" class="header-control fa-solid fa-passport icon" data-action="copyUuid"
                data-tooltip="${copyLabel}" aria-label="${copyLabel}"></button>
      `;
      this.window.close.insertAdjacentHTML("beforebegin", copyId);
    }

    // Add compendium import
    const { documentName, isEmbedded, inCompendium } = this.document;
    if ( (documentName !== "Folder") && !isEmbedded && inCompendium ) {
      this.window.close.insertAdjacentHTML("beforebegin", `
        <button type="button" class="header-control fa-solid fa-download icon" data-action="importDocument"
                data-tooltip="Import" aria-label="${game.i18n.localize("Import")}"></button>
      `);
    }

    return frame;
  }

  /* -------------------------------------------- */

  /**
   * Disable or reenable all form fields in this application.
   * @param {boolean} disabled Should the fields be disabled?
   * @protected
   */
  _toggleDisabled(disabled) {
    const form = this.form;
    if ( !this.form ) return;
    const framed = this.options.window.frame;
    for ( const element of form.elements ) {
      if ( !framed || element.closest(".window-content") ) element.disabled = disabled;
    }
    const contentEl = framed ? form.querySelector(".window-content") : form;
    for ( const input of contentEl.querySelectorAll("input[type=image]") ) {
      input.disabled = disabled; // By specification, these are not included in a HTMLFormControlsCollection
    }
    for ( const img of contentEl.querySelectorAll("img[data-edit]") ) {
      img.classList.toggle("disabled", disabled);
    }
  }

  /* -------------------------------------------- */
  /*  Application Life-Cycle Events               */
  /* -------------------------------------------- */

  /** @override */
  _canRender(_options) {
    if ( !this.isVisible ) throw new Error(game.i18n.format("SHEETS.DocumentSheetPrivate", {
      type: game.i18n.localize(this.document.constructor.metadata.label)
    }));
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    this.document.apps[this.id] = this;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onRender(context, options) {
    await super._onRender(context, options);
    if ( !this.isEditable ) this._toggleDisabled(true);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onClose(options) {
    super._onClose(options);
    delete this.document.apps[this.id];
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /**
   * Whether it's possible to configure this Document's sheet.
   * @this {DocumentSheetV2}
   * @returns {boolean}
   */
  static #canConfigureSheet() {
    if ( !this.options.sheetConfig || !this.isEditable ) return false;
    const document = this.#document;
    return !!document.collection?.has(document.id) && !document.flags.core?.sheetLock;
  }

  /* -------------------------------------------- */

  /**
   * Handle click events to configure the sheet used for this document.
   * @param {PointerEvent} event
   * @this {DocumentSheetV2}
   */
  static #onConfigureSheet(event) {
    event.stopPropagation(); // Don't trigger other events
    if ( event.detail > 1 ) return; // Ignore repeated clicks

    const docSheetConfigWidth = foundry.applications.apps.DocumentSheetConfig.DEFAULT_OPTIONS.position.width;
    new foundry.applications.apps.DocumentSheetConfig({
      document: this.document,
      position: {
        top: this.position.top + 40,
        left: this.position.left + ((this.position.width - docSheetConfigWidth) / 2)
      }
    }).render({ force: true });
  }

  /* -------------------------------------------- */

  /**
   * Handle click events to copy the UUID of this document to clipboard.
   * @param {PointerEvent} event
   * @this {DocumentSheetV2}
   */
  static #onCopyUuid(event) {
    event.preventDefault(); // Don't open context menu
    event.stopPropagation(); // Don't trigger other events
    if ( event.detail > 1 ) return; // Ignore repeated clicks
    const id = event.button === 2 ? this.document.id : this.document.uuid;
    const type = event.button === 2 ? "id" : "uuid";
    const label = game.i18n.localize(this.document.constructor.metadata.label);
    game.clipboard.copyPlainText(id);
    ui.notifications.info("DOCUMENT.IdCopiedClipboard", {format: {label, type, id}});
  }

  /**
   * Edit a Document image.
   * @this {DocumentSheetV2}
   * @type {ApplicationClickAction}
   */
  static async #onEditImage(_event, target) {
    if ( target.nodeName !== "IMG" ) {
      throw new Error("The editImage action is available only for IMG elements.");
    }
    const attr = target.dataset.edit;
    const current = foundry.utils.getProperty(this.document._source, attr);
    const defaultArtwork = this.document.constructor.getDefaultArtwork?.(this.document._source) ?? {};
    const defaultImage = foundry.utils.getProperty(defaultArtwork, attr);
    const fp = new FilePicker.implementation({
      current,
      type: "image",
      redirectToRoot: defaultImage ? [defaultImage] : [],
      callback: path => {
        target.src = path;
        if ( this.options.form.submitOnChange ) {
          const submit = new Event("submit", {cancelable: true});
          this.form.dispatchEvent(submit);
        }
      },
      position: {
        top: this.position.top + 40,
        left: this.position.left + 10
      }
    });
    await fp.browse();
  }

  /* -------------------------------------------- */

  /**
   * Handle importing a document from a compendium pack.
   * @this {DocumentSheetV2}
   */
  static async #onImportDocument() {
    await this.close();
    const { documentName, collection, id } = this.document;
    return game.collections.get(documentName).importFromCompendium(collection, id);
  }

  /* -------------------------------------------- */
  /*  Form Submission                             */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _onChangeForm(formConfig, event) {
    if ( event.target instanceof HTMLSecretBlockElement ) return this._onRevealSecret(event);
    super._onChangeForm(formConfig, event);
  }

  /* -------------------------------------------- */

  /**
   * Handle toggling the revealed state of a secret embedded in some content.
   * @param {Event} event  The triggering event.
   * @protected
   */
  _onRevealSecret(event) {
    const editor = event.target.closest("prose-mirror");
    if ( !editor?.name ) return;
    const content = foundry.utils.getProperty(this.document, editor.name);
    const modified = event.target.toggleRevealed(content);
    this.document.update({ [editor.name]: modified });
  }

  /* -------------------------------------------- */

  /**
   * Process form submission for the sheet.
   * @this {DocumentSheetV2}                      The handler is called with the application as its bound scope
   * @param {SubmitEvent} event                   The originating form submission event
   * @param {HTMLFormElement} form                The form element that was submitted
   * @param {FormDataExtended} formData           Processed data for the submitted form
   * @param {object} [options]                    Additional options provided by a manual submit call. All options
   *                                              except `options.updateData` are forwarded along to _processSubmitData.
   * @param {object} [options.updateData]         Additional data passed in if this form is submitted manually which
   *                                              should be merged with prepared formData.
   * @returns {Promise<void>}
   */
  static async #onSubmitDocumentForm(event, form, formData, options={}) {
    if ( !this.isEditable ) return;
    const {updateData, ...updateOptions} = options;
    const submitData = this._prepareSubmitData(event, form, formData, updateData);
    await this._processSubmitData(event, form, submitData, updateOptions);
  }

  /* -------------------------------------------- */

  /**
   * Prepare data used to update the Document upon form submission.
   * This data is cleaned and validated before being returned for further processing.
   * @param {SubmitEvent} event                   The originating form submission event
   * @param {HTMLFormElement} form                The form element that was submitted
   * @param {FormDataExtended} formData           Processed data for the submitted form
   * @param {object} [updateData]                 Additional data passed in if this form is submitted manually which
   *                                              should be merged with prepared formData.
   * @returns {object}                            Prepared submission data as an object
   * @throws {Error}                              Subclasses may throw validation errors here to prevent form submission
   * @protected
   */
  _prepareSubmitData(event, form, formData, updateData) {
    const submitData = this._processFormData(event, form, formData);
    if ( updateData ) {
      foundry.utils.mergeObject(submitData, updateData, {performDeletions: true});
      foundry.utils.mergeObject(submitData, updateData, {performDeletions: false});
    }
    this.document.validate({changes: submitData, clean: true, fallback: false});
    return submitData;
  }

  /* -------------------------------------------- */

  /**
   * Customize how form data is extracted into an expanded object.
   * @param {SubmitEvent|null} event              The originating form submission event
   * @param {HTMLFormElement} form                The form element that was submitted
   * @param {FormDataExtended} formData           Processed data for the submitted form
   * @returns {object}                            An expanded object of processed form data
   * @throws {Error}                              Subclasses may throw validation errors here to prevent form submission
   * @protected
   */
  _processFormData(event, form, formData) {
    return foundry.utils.expandObject(formData.object);
  }

  /* -------------------------------------------- */

  /**
   * Submit a document update or creation request based on the processed form data.
   * @param {SubmitEvent} event                   The originating form submission event
   * @param {HTMLFormElement} form                The form element that was submitted
   * @param {object} submitData                   Processed and validated form data to be used for a document update
   * @param {Partial<DatabaseCreateOperation|DatabaseUpdateOperation>} [options] Additional options altering the request
   * @returns {Promise<void>}
   * @protected
   */
  async _processSubmitData(event, form, submitData, options={}) {
    const document = this.#document;
    if ( document.collection?.has(document.id) ) {
      await document.update(submitData, options);
    }
    else if ( this.options.canCreate ) {
      const {parent, pack} = document;
      const operation = Object.assign(options, {parent, pack, keepId: true});
      const created = await document.constructor.create(submitData, operation);
      if ( created ) {
        if ( !document.id && document.rendered ) document.object.destroy({children: true});
        this.#document = created;
      }
      else throw new Error("Failed to create document.");
    }
    else {
      throw new Error(`Document creation from ${this.constructor.name} is not supported.`);
    }
  }

  /* -------------------------------------------- */
  /*  Deprecation and Compatibility               */
  /* -------------------------------------------- */

  /**
   * Provide a deprecation path for converted V1 document sheets.
   * @param {unknown} first The first parameter received by this class's constructor
   * @param {unknown[]} rest Any additional parameters received
   * @returns {Partial<ApplicationConfiguration & DocumentSheetConfiguration>}
   * @internal
   */
  static _migrateConstructorParams(first, rest) {
    if ( (first instanceof Object) && (first.document instanceof foundry.abstract.Document) ) {
      return first;
    }

    // Probably using V1 constructor args, but make sure the first is in fact a Document.
    if ( !(first instanceof foundry.abstract.Document) ) {
      throw new Error("A DocumentSheetV2 application must be provided a Document instance.");
    }

    // Warn, create a new partial configuration object, and recover at least some of the other options.
    const message = [
      `DocumentSheet V1 arguments passed to a ${this.name} constructor`,
      "the first argument must be an options object with a document property."
    ].join(": ");
    foundry.utils.logCompatibilityWarning(message, {since: 13, until: 15});
    const options = {document: first};
    const legacyOptions = rest[1] instanceof Object ? rest[1] : {};
    if ( typeof legacyOptions.title === "string" ) options.window = {title: legacyOptions.title};
    const positionKeys = ["top", "left", "width", "height", "scale", "zIndex"];
    options.position = positionKeys.reduce((position, key) => {
      if ( legacyOptions[key] !== undefined ) position[key] = legacyOptions[key];
      return position;
    }, {});
    return options;
  }
}

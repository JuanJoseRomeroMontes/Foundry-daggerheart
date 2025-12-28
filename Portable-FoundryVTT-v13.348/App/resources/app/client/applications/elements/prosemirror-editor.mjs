import AbstractFormInputElement from "./form-element.mjs";
import TextEditor from "../ux/text-editor.mjs";

/**
 * @import {FormInputConfig} from "../../../common/data/_types.mjs";
 * @import ProseMirrorEditor from "@client/applications/ux/prosemirror-editor.mjs";
 */

/**
 * @typedef ProseMirrorInputConfig
 * @property {boolean} toggled            Is this editor toggled (true) or always active (false)
 * @property {string} [enriched]          If the editor is toggled, provide the enrichedHTML which is displayed while
 *                                        the editor is not active.
 * @property {boolean} collaborate        Does this editor instance support collaborative editing?
 * @property {boolean} compact            Should the editor be presented in compact mode?
 * @property {string} documentUUID        A Document UUID. Required for collaborative editing
 * @property {number} [height]            The height of the editor in pixels
 */

/**
 * @typedef HTMLProseMirrorOptions
 * @property {boolean} [toggled]  Whether the editor's active state is toggled or always active.
 * @property {string} [enriched]  If the editor is toggled, provide enriched HTML which is displayed while the editor is
 *                                not active.
 * @property {string} value       The raw value to edit.
 */

/**
 * A custom HTML element responsible displaying a ProseMirror rich text editor.
 * @extends {AbstractFormInputElement<string>}
 * @fires {Event} open                       Fired when an editor is initialized in the DOM and ready.
 * @fires {Event} close                      Fired when a toggled editor is deactivated.
 * @fires {Event} save                       Fired when the editor is saved.
 * @fires {ProseMirrorPluginsEvent} plugins  Fired when an editor's plugins are being configured.
 */
export default class HTMLProseMirrorElement extends AbstractFormInputElement {
  constructor({ enriched, toggled, value }={}) {
    super();

    // Initialize raw content
    this._setValue(value || this.getAttribute("value") || "");
    this.removeAttribute("value");

    // Initialize enriched content
    this.#toggled = toggled ?? this.hasAttribute("toggled");
    this.#enriched = enriched || this.innerHTML;
  }

  /** @override */
  static tagName = "prose-mirror";

  /** @inheritDoc */
  static observedAttributes = super.observedAttributes.concat("open");

  /**
   * Is the editor in active edit mode?
   * @type {boolean}
   */
  #active = false;

  /**
   * The ProseMirror editor instance.
   * @type {ProseMirrorEditor}
   */
  #editor;

  /**
   * Current editor contents
   * @type {HTMLDivElement}
   */
  #content;

  /**
   * The child element that is currently the target of a pointerdown event.
   * @type {HTMLElement|null}
   */
  #pointerdown = null;

  /**
   * Does this editor function via a toggle button? Or is it always active?
   * @type {boolean}
   */
  #toggled;

  /**
   * Enriched content which is optionally used if the editor is toggled.
   * @type {string}
   */
  #enriched;

  /**
   * An optional edit button which activates edit mode for the editor
   * @type {HTMLButtonElement|null}
   */
  #button = null;

  /**
   * Whether the editor is currently open. Always true for non-toggled editors.
   * @type {boolean}
   */
  get open() {
    if ( !this.#toggled ) return true;
    return this.hasAttribute("open");
  }

  set open(open) {
    if ( !open && !this.#toggled ) return;
    this.toggleAttribute("open", open);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  attributeChangedCallback(attrName, oldValue, newValue) {
    switch ( attrName ) {
      case "open":
        if ( newValue === null ) {
          if ( this.#active ) this.#save();
        }
        else if ( !this.#active ) this.#activateEditor();
        break;
      default: super.attributeChangedCallback(attrName, oldValue, newValue);
    }
  }

  /* -------------------------------------------- */

  /**
   * Actions to take when the custom element is removed from the document.
   */
  disconnectedCallback() {
    if ( this.#active ) {
      this.#save();
      if ( !this.#toggled ) this.#editor?.destroy();
    }
    super.disconnectedCallback();
  }

  /* -------------------------------------------- */

  /** @override */
  _buildElements() {
    this.classList.add("editor", "prosemirror", "inactive");
    const elements = [];
    this.#content = document.createElement("div");
    this.#content.className = "editor-content";
    this._primaryInput = this.#content;
    elements.push(this.#content);
    if ( this.#toggled ) {
      this.#button = document.createElement("button");
      this.#button.type = "button";
      this.#button.className = "icon toggle";
      this.#button.innerHTML = '<i class="fa-solid fa-pen-to-square"></i>';
      elements.push(this.#button);
    }
    return elements;
  }

  /* -------------------------------------------- */

  /** @override */
  _refresh() {
    if ( this.#active || !this.#content ) return; // It is not safe to replace the content while the editor is active
    if ( this.#toggled ) this.#content.innerHTML = this.#enriched ?? this._value;
    else this.#content.innerHTML = this._value;
  }

  /* -------------------------------------------- */

  /** @override */
  _activateListeners() {
    if ( this.#toggled ) {
      const { abortSignal: signal } = this;
      this.#button.addEventListener("click", this.#onClickButton.bind(this), { signal });
      this.addEventListener("pointerdown", this.#onPointerDown.bind(this), { signal, passive: true });
      this.addEventListener("pointerup", this.#onPointerUp.bind(this), { signal, passive: true });
      this.addEventListener("dragend", this.#onDragEnd.bind(this), { signal, passive: true });
    }
    else this.open = true;
  }

  /* -------------------------------------------- */

  /** @override */
  _getValue() {
    if ( this.#active ) return ProseMirror.dom.serializeString(this.#editor.view.state.doc.content);
    return this._value;
  }

  /* -------------------------------------------- */

  /**
   * Activate the ProseMirror editor.
   * @returns {Promise<void>}
   */
  async #activateEditor() {

    // If the editor was toggled, replace with raw editable content
    if ( this.#toggled ) this.#content.innerHTML = this._value;

    // Create the TextEditor instance
    const document = await foundry.utils.fromUuid(this.dataset.documentUuid ?? this.dataset.documentUUID);
    this.#editor = await TextEditor.implementation.create({
      engine: "prosemirror",
      plugins: this._configurePlugins(),
      fieldName: this.name,
      collaborate: this.hasAttribute("collaborate"),
      target: this.#content,
      document,
      props: {editable: () => !this.disabled}
    }, this._getValue());

    // Toggle active state
    this.#active = true;
    if ( this.#button ) this.#button.disabled = true;
    this.classList.add("active");
    this.classList.remove("inactive");
    this.dispatchEvent(new Event("open"), { bubbles: true, cancelable: true });
  }

  /* -------------------------------------------- */

  /**
   * Configure ProseMirror editor plugins.
   * @returns {Record<string, ProseMirror.Plugin>}
   * @protected
   */
  _configurePlugins() {
    const plugins = {
      menu: ProseMirror.ProseMirrorMenu.build(ProseMirror.defaultSchema, {
        compact: this.hasAttribute("compact"),
        destroyOnSave: this.#toggled,
        onSave: this.#save.bind(this)
      }),
      keyMaps: ProseMirror.ProseMirrorKeyMaps.build(ProseMirror.defaultSchema, {
        onSave: this.#save.bind(this)
      })
    };
    const event = new ProseMirrorPluginsEvent(plugins);
    this.dispatchEvent(event);
    if ( event.defaultPrevented ) return {};
    return plugins;
  }

  /* -------------------------------------------- */

  /**
   * Handle clicking the editor activation button.
   * @param {PointerEvent} event  The triggering event.
   */
  #onClickButton(event) {
    event.preventDefault();
    this.open = true;
  }

  /* -------------------------------------------- */

  /**
   * Handle the conclusion of a drag event for some child.
   */
  #onDragEnd() {
    this.#pointerdown = null;
  }

  /* -------------------------------------------- */

  /**
   * Handle a pointerdown event on some child.
   * @param {PointerEvent} event  The triggering event.
   */
  #onPointerDown(event) {
    this.#pointerdown = event.target;
  }

  /* -------------------------------------------- */

  /**
   * Handle a pointerup event on some child.
   * @param {PointerEvent} event  The triggering event.
   */
  async #onPointerUp(event) {
    if ( !this.#pointerdown ) return;
    const inactiveEditor = this.disabled && !this.#active;
    const isClick = this.#pointerdown.contains(event.target);
    const isContentLink = this.#pointerdown.closest("a[data-link]");

    // If this editor is in an untoggled state and is disabled, simulate click events on child content links, as they
    // otherwise fail to bubble up to the global content link listener.
    if ( inactiveEditor && isClick && isContentLink ) {
      const doc = await foundry.utils.fromUuid(event.target.closest("a[data-link]").dataset.uuid);
      doc?._onClickDocumentLink(event);
    }

    this.#pointerdown = null;
  }

  /* -------------------------------------------- */

  /**
   * Handle saving the editor content.
   * Store new parsed HTML into the _value attribute of the element.
   * If the editor is toggled, also deactivate editing mode.
   */
  #save() {
    const save = new Event("save", { bubbles: true, cancelable: true });
    this.dispatchEvent(save);
    if ( save.defaultPrevented ) return;

    const value = ProseMirror.dom.serializeString(this.#editor.view.state.doc.content);
    if ( value !== this._value ) {
      this._setValue(value);
      this.dispatchEvent(new Event("change", {bubbles: true, cancelable: true}));
    }

    // Deactivate a toggled editor
    if ( this.#toggled ) {
      this.#button.disabled = this.disabled;
      this.#active = false;
      this.open = false;
      this.#editor.destroy();
      this.classList.remove("active");
      this.classList.add("inactive");
      this.replaceChildren(this.#button, this.#content);
      this._refresh();
      this.dispatchEvent(new Event("close", {bubbles: true, cancelable: true}));
    }
  }

  /* -------------------------------------------- */

  /** @override */
  _toggleDisabled(disabled) {
    if ( this.#toggled ) this.#button.disabled = disabled || this.#active;
    if ( this.#editor ) this.#editor.view.updateState(this.#editor.view.state);
  }

  /* -------------------------------------------- */
  /*  Public API                                  */
  /* -------------------------------------------- */

  /**
   * Determine if the editor has unsaved changes.
   * @returns {boolean}
   */
  isDirty() {
    return this.#editor?.isDirty() ?? false;
  }

  /* -------------------------------------------- */
  /*  Factory Methods                             */
  /* -------------------------------------------- */

  /**
   * Create a HTMLProseMirrorElement using provided configuration data.
   * @param {FormInputConfig & ProseMirrorInputConfig} config
   * @returns {HTMLProseMirrorElement}
   */
  static create(config) {
    const { enriched, toggled, value } = config;
    const editor = new this({ enriched, toggled, value });
    editor.name = config.name;

    // Configure editor properties
    foundry.applications.fields.setInputAttributes(editor, config);
    editor.toggleAttribute("collaborate", config.collaborate ?? false);
    editor.toggleAttribute("compact", config.compact ?? false);
    editor.toggleAttribute("toggled", config.toggled ?? false);
    if ( "documentUUID" in config ) Object.assign(editor.dataset, {
      documentUuid: config.documentUUID,
      documentUUID: config.documentUUID
    });
    if ( Number.isNumeric(config.height) ) editor.style.height = `${config.height}px`;

    // Un-enriched content gets temporarily assigned to the value property of the element
    editor.setAttribute("value", config.value ?? "");

    // Enriched content gets temporarily assigned as the innerHTML of the element
    if ( config.toggled && config.enriched ) editor.innerHTML = config.enriched;
    return editor;
  }
}

/**
 * A custom event class for configuring ProseMirror plugins.
 * @extends {CustomEvent}
 */
class ProseMirrorPluginsEvent extends CustomEvent {
  /**
   * @param {Record<string, ProseMirror.Plugin>} plugins  The plugins supplied to the ProseMirror instance.
   */
  constructor(plugins) {
    super("plugins", { detail: plugins, bubbles: true, cancelable: true });
  }

  /* -------------------------------------------- */

  /**
   * The currently configured plugins.
   * @type {Record<string, ProseMirror.Plugin>}
   */
  get plugins() {
    return this.detail;
  }
}

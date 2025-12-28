import {Compartment, EditorSelection} from "@codemirror/state";
import {setInputAttributes} from "../../forms/fields.mjs";
import AbstractFormInputElement from "../form-element.mjs";
import {configureIndentExtensions, HIGHLIGHT_STYLE, LANGUAGES} from "./extensions.mjs";
import {default as EditorView} from "./view.mjs";

/**
 * @import {CodeMirrorInputConfig, CodeMirrorLanguage, FormInputConfig} from "@common/data/_types.mjs";
 * @import {Point} from "@common/_types.mjs";
 */

/**
 * @typedef HTMLCodeMirrorOptions
 * @property {string} [value]  The initial editor contents.
 */

/**
 * A custom HTML element responsible for displaying a CodeMirror rich text editor.
 * @extends {AbstractFormInputElement<string>}
 */
export default class HTMLCodeMirrorElement extends AbstractFormInputElement {
  /**
   * @param {HTMLCodeMirrorOptions} [options]
   */
  constructor({ value }={}) {
    super();
    this._setValue(value ?? this.innerText);
    this.innerText = "";
  }

  /**
   * @override
   * @type {"code-mirror"}
   */
  static tagName = "code-mirror";

  /** @inheritDoc */
  static observedAttributes = super.observedAttributes.concat("language", "indent", "nowrap");

  /* -------------------------------------------- */

  /**
   * The CodeMirror view instance
   * @type {EditorView|null}
   */
  #view = null;

  /**
   * Compartment for dynamically swapping extensions
   * @type {Record<"language"|"indent"|"nowrap"|"disabled", Compartment>}
   */
  #compartments = {
    language: new Compartment(),
    indent: new Compartment(),
    nowrap: new Compartment(),
    disabled: new Compartment()
  };

  /**
   * The position of the cursor.
   * @type {number|null}
   */
  get cursor() {
    const cursor = this.#view?.state.selection.main.from;
    return Number.isFinite(cursor) ? cursor : null;
  }

  /** The "dirty" state of the editor (whether unreported changes have been made) */
  #dirty = false;

  /**
   * This element's language attribute or its default if no value is set
   * @type {CodeMirrorLanguage}
   */
  get language() {
    return this.getAttribute("language") ?? "";
  }

  /**
   * Set this element's language attribute.
   * @param {CodeMirrorLanguage} value
   */
  set language(value) {
    this.setAttribute("language", value);
  }

  /**
   * This element's indent attribute, which determines the number of spaces added upon pressing the TAB key.
   * A value of 0 disables this feature entirely.
   * @returns {number}
   */
  get indent() {
    return this.hasAttribute("indent")
      ? Number(this.getAttribute("indent")) || 0
      : 2;
  }

  /**
   * Set this element's indent attribute.
   * @param {number} value
   */
  set indent(value) {
    this.setAttribute("indent", String(Number(value) || 0));
  }

  /**
   * Whether the editor is externally managed by some other process that takes responsibility for its contents and for
   * firing events. If not set, the editor will fire its own events.
   * @type {boolean}
   */
  get managed() {
    return this.hasAttribute("managed");
  }

  /**
   * Set the editor's managed attribute.
   * @param {boolean} value
   */
  set managed(value) {
    this.toggleAttribute("managed", value);
  }

  /**
   * The element's nowrap attribute, which if present disables line-wrapping
   * @returns {boolean}
   */
  get nowrap() {
    return this.hasAttribute("nowrap");
  }

  /**
   * Set this element's nowrap attribute.
   * @param {boolean} value
   */
  set nowrap(value) {
    this.toggleAttribute("nowrap", value);
  }

  /* -------------------------------------------- */

  /**
   * @param {boolean} disabled
   * @protected
   * @override
   */
  _toggleDisabled(disabled) {
    const extension = EditorView.editable.of(!disabled);
    this.#view?.dispatch({effects: this.#compartments.disabled.reconfigure(extension)});
  }

  /* -------------------------------------------- */

  /** @override */
  _getValue() {
    return this.#view?.state.doc.toString() ?? super._getValue();
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _setValue(value) {
    super._setValue(value);
    this.#view?.dispatch({changes: {from: 0, to: this.#view.state.doc.length, insert: value}});
  }

  /* -------------------------------------------- */

  /**
   * Set the language for the view, swapping out its supporting extensions
   * @param {CodeMirrorLanguage} language
   */
  #setLanguage(language) {
    const extensions = LANGUAGES[language || "plain"];
    if ( !extensions ) throw new Error(`Language "${language}" is not supported.`);
    this.#view?.dispatch({effects: this.#compartments.language.reconfigure(extensions)});
  }

  /* -------------------------------------------- */

  /**
   * Set the number of columns added upon pressing the TAB key.
   * A value of 0 will disable this feature entirely.
   * @param {number} indent
   */
  #setIndent(indent) {
    const extensions = configureIndentExtensions(indent);
    this.#view?.dispatch({effects: this.#compartments.indent.reconfigure(extensions)});
  }

  /* -------------------------------------------- */

  /**
   * Set whether the editor view should not wrap lines.
   * @param {boolean} value
   */
  #setNowrap(value) {
    const extension = EditorView.lineWrapping;
    this.#view?.dispatch({effects: this.#compartments.nowrap.reconfigure(value ? [] : extension)});
  }

  /* -------------------------------------------- */

  /**
   * Given screen co-ordinates, returns the position in the editor's text content at those co-ordinates.
   * @param {Point} coords  The screen co-ordinates.
   * @returns {number}
   */
  posAtCoords(coords) {
    return this.#view.posAtCoords(coords);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  scrollTo(x, y) {
    if ( typeof x === "object" ) y = x?.top;
    if ( !Number.isFinite(y) ) return;
    const selection = EditorSelection.create([EditorSelection.cursor(y)]);
    this.#view?.dispatch({ selection, scrollIntoView: true });
  }

  /* -------------------------------------------- */
  /*  Element Lifecycle                           */
  /* -------------------------------------------- */

  /** @inheritDoc */
  connectedCallback() {
    this.#view = new EditorView({
      doc: this._getValue(),
      extensions: [
        this.#compartments.language.of(LANGUAGES[this.language || "plain"]),
        this.#compartments.indent.of(configureIndentExtensions(this.indent)),
        this.#compartments.nowrap.of(this.nowrap ? [] : EditorView.lineWrapping),
        this.#compartments.disabled.of(EditorView.editable.of(!this.disabled)),
        HIGHLIGHT_STYLE,
        // Set the editor to dirty on any change to it contents
        EditorView.updateListener.of(update => {
          if ( update.docChanged ) this.#dirty = true;
        }),
        EditorView.domEventHandlers({
          blur: this.#onBlur.bind(this),
          drop: this.#onDrop.bind(this)
        })
      ]
    });
    return super.connectedCallback();
  }

  /* -------------------------------------------- */

  /** @override */
  _buildElements() {
    this._primaryInput = this.#view.dom.querySelector("[contenteditable=true]");
    return [this.#view.dom];
  }

  /* -------------------------------------------- */

  /** Emulate a form change event if the editor is dirty. */
  #onBlur() {
    if ( !this.#dirty || this.managed ) return;
    const form = this.closest("form");
    const event = new Event("change");
    Object.defineProperties(event, {
      target: {value: this, enumerable: true},
      currentTarget: {value: form, enumerable: true}
    });
    form?.dispatchEvent(event);
    this.#dirty = false;
  }

  /* -------------------------------------------- */

  /**
   * Prevent default CodeMirror drop handling.
   */
  #onDrop() {
    return true;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  attributeChangedCallback(attrName, oldValue, newValue) {
    switch (attrName) {
      case "language":
        this.#setLanguage(newValue);
        break;
      case "indent":
        this.#setIndent(Number(newValue) || 0);
        break;
      case "nowrap":
        this.#setNowrap(newValue !== null);
        break;
      default:
        super.attributeChangedCallback(attrName, oldValue, newValue);
    }
  }

  /* -------------------------------------------- */

  /**
   * Call for garbage collection upon this element being removed from the DOM.
   */
  disconnectedCallback() {
    this.#view?.destroy();
    super.disconnectedCallback();
  }

  /* -------------------------------------------- */

  /**
   * Create an HTMLCodeMirrorElement element for a StringField (typically a JSONField or JavascriptField).
   * @param {FormInputConfig<string> & CodeMirrorInputConfig} config
   * @returns {HTMLCodeMirrorElement}
   */
  static create(config) {
    const element = new this({value: config.value});
    element.language = config.language ?? "";
    element.indent = config.indent ?? 2;
    if ( config.name ) element.name = config.name;
    element.innerHTML = foundry.utils.escapeHTML(config.value ?? "");
    setInputAttributes(element, config);
    return element;
  }
}

import FilePicker from "../apps/file-picker.mjs";
import AbstractFormInputElement from "./form-element.mjs";

/**
 * @import {FormInputConfig} from "@common/data/_types.mjs";
 */

/**
 * @typedef FilePickerInputConfig
 * @property {FilePickerOptions.type} [type]
 * @property {string} [placeholder]
 * @property {boolean} [noupload]
 */

/**
 * A custom HTML element responsible for rendering a file input field and associated FilePicker button.
 * @extends {AbstractFormInputElement<string>}
 */
export default class HTMLFilePickerElement extends AbstractFormInputElement {

  /** @override */
  static tagName = "file-picker";

  /**
   * The file path selected.
   * @type {HTMLInputElement}
   */
  input;

  /**
   * A button to open the file picker interface.
   * @type {HTMLButtonElement}
   */
  button;

  /**
   * A reference to the FilePicker application instance originated by this element.
   * @type {FilePicker}
   */
  picker;

  /* -------------------------------------------- */

  /**
   * A type of file which can be selected in this field.
   * @see {@link foundry.applications.apps.FilePicker.FILE_TYPES}
   * @type {FilePickerOptions.type}
   */
  get type() {
    return this.getAttribute("type") ?? "any";
  }

  set type(value) {
    if ( !FilePicker.FILE_TYPES.includes(value) ) throw new Error(`Invalid type "${value}" provided which must be a `
      + "value in FilePicker.FILE_TYPES");
    this.setAttribute("type", value);
  }

  /* -------------------------------------------- */

  /**
   * Prevent uploading new files as part of this element's FilePicker dialog.
   * @type {boolean}
   */
  get noupload() {
    return this.hasAttribute("noupload");
  }

  set noupload(value) {
    this.toggleAttribute("noupload", value === true);
  }

  /* -------------------------------------------- */

  /** @override */
  _buildElements() {

    // Initialize existing value
    this._value ??= this.getAttribute("value") || this.innerText || "";
    this.removeAttribute("value");

    // Create an input field
    const elements = [];
    this.input = this._primaryInput = document.createElement("input");
    this.input.className = "image";
    this.input.type = "text";
    this.input.placeholder = this.getAttribute("placeholder") ?? "path/to/file.ext";
    elements.push(this.input);

    // Disallow browsing for some users
    if ( game.world && !game.user.can("FILES_BROWSE") ) return elements;

    // Create a FilePicker button
    this.button = document.createElement("button");
    this.button.className = "fa-solid fa-file-import fa-fw icon";
    this.button.type = "button";
    this.button.dataset.tooltip = "FILES.BrowseTooltip";
    this.button.setAttribute("aria-label", this.button.dataset.tooltip);
    this.button.tabIndex = -1;
    elements.push(this.button);
    return elements;
  }

  /* -------------------------------------------- */

  /** @override */
  _refresh() {
    this.input.value = this._value;
  }

  /* -------------------------------------------- */

  /** @override */
  _toggleDisabled(disabled) {
    this.input.disabled = disabled;
    if ( this.button ) this.button.disabled = disabled;
  }

  /* -------------------------------------------- */

  /** @override */
  _activateListeners() {
    this.input.addEventListener("input", () => this._value = this.input.value);
    this.button?.addEventListener("click", this.#onClickButton.bind(this));
  }

  /* -------------------------------------------- */

  /**
   * Handle clicks on the button element to render the FilePicker UI.
   * @param {PointerEvent} event      The initiating click event
   */
  #onClickButton(event) {
    event.preventDefault();
    this.picker = new FilePicker.implementation({
      type: this.type,
      current: this.value,
      allowUpload: !this.noupload,
      callback: src => this.value = src
    });
    return this.picker.browse();
  }

  /* -------------------------------------------- */

  /**
   * Create a HTMLFilePickerElement using provided configuration data.
   * @param {FormInputConfig<string> & FilePickerInputConfig} config
   */
  static create(config) {
    const picker = document.createElement(this.tagName);
    picker.name = config.name;
    picker.setAttribute("value", config.value || "");
    picker.type = config.type;
    picker.noupload = config.noupload;
    foundry.applications.fields.setInputAttributes(picker, config);
    return picker;
  }
}

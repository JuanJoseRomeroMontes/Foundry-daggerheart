import AbstractFormInputElement from "./form-element.mjs";
import Color from "@common/utils/color.mjs";

/**
 * @import {FormInputConfig} from "@common/data/_types.mjs";
 */

/**
 * A class designed to standardize the behavior for a hue selector UI component.
 * @extends {AbstractFormInputElement<number>}
 */
export default class HTMLHueSelectorSlider extends AbstractFormInputElement {

  /** @override */
  static tagName = "hue-slider";

  /**
   * The color range associated with this element.
   * @type {HTMLInputElement|null}
   */
  #input;

  /* -------------------------------------------- */

  /** @override */
  _buildElements() {

    // Initialize existing value
    this._setValue(this.getAttribute("value"));

    // Build elements
    this.#input = this._primaryInput = document.createElement("input");
    this.#input.className = "color-range";
    this.#input.type = "range";
    this.#input.min = "0";
    this.#input.max = "360";
    this.#input.step = "1";
    this.#input.value = this._value * 360;
    return [this.#input];
  }

  /* -------------------------------------------- */

  /**
   * Refresh the active state of the custom element.
   * @protected
   */
  _refresh() {
    if ( !this.#input ) return;
    this.#input.style.setProperty("--color-thumb", Color.fromHSL([this._value, 1, 0.5]).css);
  }

  /* -------------------------------------------- */

  /**
   * Activate event listeners which add dynamic behavior to the custom element.
   * @protected
   */
  _activateListeners() {
    this.#input.oninput = this.#onInputColorRange.bind(this);
  }

  /* -------------------------------------------- */

  /**
   * Update the thumb and the value.
   * @param {FormDataEvent} event
   */
  #onInputColorRange(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
    this.value = this.#input.value / 360;
  }

  /* -------------------------------------------- */
  /*  Form Handling                               */
  /* -------------------------------------------- */

  /** @override */
  _setValue(value) {
    value = Number(value);
    if ( !value.between(0, 1) ) throw new Error("The value of a hue-slider must be on the range [0,1]");
    this._value = value;
    this.setAttribute("value", String(value));
  }

  /* -------------------------------------------- */

  /** @override */
  _toggleDisabled(disabled) {
    this.#input.disabled = disabled;
  }

  /* -------------------------------------------- */

  /**
   * Create a HTMLHueSelectorSlider using provided configuration data.
   * @param {FormInputConfig} config
   * @returns {HTMLHueSelectorSlider}
   */
  static create(config) {
    const slider = document.createElement(HTMLHueSelectorSlider.tagName);
    if ( config.name ) slider.name = config.name;
    if ( Number.isFinite(config.value) ) slider.value = config.value;
    foundry.applications.fields.setInputAttributes(slider, config);
    return slider;
  }
}

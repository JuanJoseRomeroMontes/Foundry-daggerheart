import AbstractFormInputElement from "./form-element.mjs";
import HTMLStringTagsElement from "./string-tags.mjs";

/**
 * @import {FormInputConfig} from "../../../common/data/_types.mjs";
 */

/**
 * An abstract base class designed to standardize the behavior for a multi-select UI component.
 * Multi-select components return an array of values as part of form submission.
 * Different implementations may provide different experiences around how inputs are presented to the user.
 * @extends {AbstractFormInputElement<Set<string>>}
 */
export class AbstractMultiSelectElement extends AbstractFormInputElement {
  /**
   * Predefined <option> and <optgroup> elements which were defined in the original HTML.
   * @type {(HTMLOptionElement|HTMLOptGroupElement)[]}
   * @protected
   */
  _options = [];

  /**
   * An object which maps option values to displayed labels.
   * @type {Record<string, string>}
   * @protected
   */
  _choices = {};

  /** @override */
  _value = new Set();

  /* -------------------------------------------- */

  /** @inheritDoc */
  connectedCallback() {
    // Initialize existing value.
    if ( this.matches(":scope:has(> option, > optgroup)") ) this._initialize();
    super.connectedCallback();
  }

  /* -------------------------------------------- */

  /**
   * Preserve existing <option> and <optgroup> elements which are defined in the original HTML.
   * @protected
   */
  _initialize() {
    this._options = [...this.children];
    for ( const option of this.querySelectorAll("option") ) {
      if ( !option.value ) continue; // Skip predefined options which are already blank
      this._choices[option.value] = option.innerText;
      if ( option.selected ) {
        this._value.add(option.value);
        option.selected = false;
      }
    }
  }

  /* -------------------------------------------- */

  /**
   * Mark a choice as selected.
   * @param {string} value      The value to add to the chosen set
   */
  select(value) {
    const exists = this._value.has(value);
    if ( !exists ) {
      if ( !(value in this._choices) ) {
        throw new Error(`"${value}" is not an option allowed by this multi-select element`);
      }
      this._value.add(value);
      this.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
      this._refresh();
    }
  }

  /* -------------------------------------------- */

  /**
   * Mark a choice as un-selected.
   * @param {string} value      The value to delete from the chosen set
   */
  unselect(value) {
    const exists = this._value.has(value);
    if ( exists ) {
      this._value.delete(value);
      this.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
      this._refresh();
    }
  }

  /* -------------------------------------------- */
  /*  Form Handling                               */
  /* -------------------------------------------- */

  /** @override */
  _getValue() {
    return Array.from(this._value);
  }

  /** @override */
  _setValue(value) {
    if ( !Array.isArray(value) ) {
      throw new Error("The value assigned to a multi-select element must be an array.");
    }
    if ( value.some(v => !(v in this._choices)) ) {
      throw new Error("The values assigned to a multi-select element must all be valid options.");
    }
    this._value.clear();
    for ( const v of value ) this._value.add(v);
  }
}

/* -------------------------------------------- */

/**
 * Provide a multi-select workflow using a select element as the input mechanism.
 *
 * @example Multi-Select HTML Markup
 * ```html
 * <multi-select name="select-many-things">
 *   <optgroup label="Basic Options">
 *     <option value="foo">Foo</option>
 *     <option value="bar">Bar</option>
 *     <option value="baz">Baz</option>
 *   </optgroup>
 *   <optgroup label="Advanced Options">
 *    <option value="fizz">Fizz</option>
 *     <option value="buzz">Buzz</option>
 *   </optgroup>
 * </multi-select>
 * ```
 */
export class HTMLMultiSelectElement extends AbstractMultiSelectElement {

  /** @override */
  static tagName = "multi-select";

  /**
   * A select element used to choose options.
   * @type {HTMLSelectElement}
   */
  #select;

  /**
   * A display element which lists the chosen options.
   * @type {HTMLDivElement}
   */
  #tags;

  /* -------------------------------------------- */

  /** @override */
  _buildElements() {

    // Create select element
    this.#select = this._primaryInput = document.createElement("select");
    this.#select.insertAdjacentHTML("afterbegin", '<option value=""></option>');
    this.#select.append(...this._options);

    // Create a div element for display
    this.#tags = document.createElement("div");
    this.#tags.className = "tags input-element-tags";
    return [this.#tags, this.#select];
  }

  /* -------------------------------------------- */

  /** @override */
  _refresh() {

    // Update the displayed tags
    const tags = Array.from(this._value).map(id => {
      return HTMLStringTagsElement.renderTag(id, this._choices[id], this.editable);
    });
    this.#tags.replaceChildren(...tags);

    // Disable selected options
    for ( const option of this.#select.querySelectorAll("option") ) {
      option.disabled = this._value.has(option.value);
    }
  }

  /* -------------------------------------------- */

  /** @override */
  _activateListeners() {
    this.#select.addEventListener("change", this.#onChangeSelect.bind(this));
    this.#tags.addEventListener("click", this.#onClickTag.bind(this));
  }

  /* -------------------------------------------- */

  /**
   * Handle changes to the Select input, marking the selected option as a chosen value.
   * @param {Event} event         The change event on the select element
   */
  #onChangeSelect(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const select = event.currentTarget;
    if ( !select.value ) return; // Ignore selection of the blank value
    this.select(select.value);
    select.value = "";
  }

  /* -------------------------------------------- */

  /**
   * Handle click events on a tagged value, removing it from the chosen set.
   * @param {PointerEvent} event    The originating click event on a chosen tag
   */
  #onClickTag(event) {
    event.preventDefault();
    if ( !event.target.classList.contains("remove") || !this.editable ) return;
    const tag = event.target.closest(".tag");
    this.unselect(tag.dataset.key);
  }

  /* -------------------------------------------- */

  /** @override */
  _toggleDisabled(disabled) {
    this.#select.disabled = disabled;
  }

  /* -------------------------------------------- */

  /**
   * Create a HTMLMultiSelectElement using provided configuration data.
   * @param {FormInputConfig<string[]> & Omit<SelectInputConfig, "blank">} config
   * @returns {HTMLMultiSelectElement}
   */
  static create(config) {
    return foundry.applications.fields.createMultiSelectInput(config);
  }
}

/* -------------------------------------------- */

/**
 * Provide a multi-select workflow as a grid of input checkbox elements.
 *
 * @example Multi-Checkbox HTML Markup
 * ```html
 * <multi-checkbox name="check-many-boxes">
 *   <optgroup label="Basic Options">
 *     <option value="foo">Foo</option>
 *     <option value="bar">Bar</option>
 *     <option value="baz">Baz</option>
 *   </optgroup>
 *   <optgroup label="Advanced Options">
 *    <option value="fizz">Fizz</option>
 *     <option value="buzz">Buzz</option>
 *   </optgroup>
 * </multi-checkbox>
 * ```
 */
export class HTMLMultiCheckboxElement extends AbstractMultiSelectElement {

  /** @override */
  static tagName = "multi-checkbox";

  /**
   * The checkbox elements used to select inputs
   * @type {HTMLInputElement[]}
   */
  #checkboxes;

  /* -------------------------------------------- */

  /** @override */
  _buildElements() {
    this.#checkboxes = [];
    const children = [];
    for ( const option of this._options ) {
      if ( option instanceof HTMLOptGroupElement ) children.push(this.#buildGroup(option));
      else children.push(this.#buildOption(option));
    }
    return children;
  }

  /* -------------------------------------------- */

  /**
   * Translate an input <optgroup> element into a <fieldset> of checkboxes.
   * @param {HTMLOptGroupElement} optgroup    The originally configured optgroup
   * @returns {HTMLFieldSetElement}           The created fieldset grouping
   */
  #buildGroup(optgroup) {

    // Create fieldset group
    const group = document.createElement("fieldset");
    group.classList.add("checkbox-group");
    const legend = document.createElement("legend");
    legend.innerText = optgroup.label;
    group.append(legend);

    // Add child options
    for ( const option of optgroup.children ) {
      if ( option instanceof HTMLOptionElement ) {
        group.append(this.#buildOption(option));
      }
    }
    return group;
  }

  /* -------------------------------------------- */

  /**
   * Build an input <option> element into a <label class="checkbox"> element.
   * @param {HTMLOptionElement} option      The originally configured option
   * @returns {HTMLLabelElement}            The created labeled checkbox element
   */
  #buildOption(option) {
    const label = document.createElement("label");
    label.classList.add("checkbox");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = option.value;
    checkbox.checked = this._value.has(option.value);
    checkbox.disabled = this.disabled;
    label.append(checkbox, option.innerText);
    this.#checkboxes.push(checkbox);
    return label;
  }

  /* -------------------------------------------- */

  /** @override */
  _refresh() {
    for ( const checkbox of this.#checkboxes ) {
      checkbox.checked = this._value.has(checkbox.value);
    }
  }

  /* -------------------------------------------- */

  /** @override */
  _activateListeners() {
    for ( const checkbox of this.#checkboxes ) {
      checkbox.addEventListener("change", this.#onChangeCheckbox.bind(this));
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle changes to a checkbox input, marking the selected option as a chosen value.
   * @param {Event} event         The change event on the checkbox input element
   */
  #onChangeCheckbox(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const checkbox = event.currentTarget;
    if ( checkbox.checked ) this.select(checkbox.value);
    else this.unselect(checkbox.value);
  }

  /* -------------------------------------------- */

  /** @override */
  _toggleDisabled(disabled) {
    for ( const checkbox of this.#checkboxes ) {
      checkbox.disabled = disabled;
    }
  }
}


/**
 * An extension of the native FormData implementation.
 *
 * This class functions the same way that the default FormData does, but it is more opinionated about how
 * input fields of certain types should be evaluated and handled.
 *
 * It also adds support for certain Foundry VTT specific concepts including:
 *  Support for defined data types and type conversion
 *  Support for TinyMCE editors
 *  Support for editable HTML elements
 *
 * @extends {FormData}
 *
 * @param {HTMLFormElement} form          The form being processed
 * @param {object} options                Options which configure form processing
 * @param {Record<string, object>} [options.editors]      A record of TinyMCE editor metadata objects, indexed by their update key
 * @param {Record<string, string>} [options.dtypes]       A mapping of data types for form fields
 * @param {boolean} [options.disabled=false]      Include disabled fields?
 * @param {boolean} [options.readonly=false]      Include readonly fields?
 */
export default class FormDataExtended extends FormData {
  constructor(form, {dtypes={}, editors={}, disabled=false, readonly=true}={}) {
    super();

    /**
     * A mapping of data types requested for each form field.
     * @type {{string, string}}
     */
    this.dtypes = dtypes;

    /**
     * A record of TinyMCE editors which are linked to this form.
     * @type {Record<string, object>}
     */
    this.editors = editors;

    /**
     * The object representation of the form data, available once processed.
     * @type {object}
     */
    Object.defineProperty(this, "object", {value: {}, writable: false, enumerable: false});

    // Process the provided form
    this.process(form, {disabled, readonly});
  }

  /* -------------------------------------------- */

  /**
   * Process the HTML form element to populate the FormData instance.
   * @param {HTMLFormElement} form    The HTML form being processed
   * @param {object} options          Options forwarded from the constructor
   */
  process(form, options) {
    this.#processFormFields(form, options);
    this.#processEditableHTML(form, options);
    this.#processEditors();

    // Emit the formdata event for compatibility with the parent FormData class
    form.dispatchEvent(new FormDataEvent("formdata", {formData: this}));
  }

  /* -------------------------------------------- */

  /**
   * Assign a value to the FormData instance which always contains JSON strings.
   * Also assign the cast value in its preferred data type to the parsed object representation of the form data.
   * @param {string} name     The field name
   * @param {any} value       The raw extracted value from the field
   * @override
   */
  set(name, value) {
    this.object[name] = value;
    if ( value instanceof Array ) value = JSON.stringify(value);
    super.set(name, value);
  }

  /* -------------------------------------------- */

  /**
   * Append values to the form data, adding them to an array.
   * @param {string} name     The field name to append to the form
   * @param {any} value       The value to append to the form data
   * @override
   */
  append(name, value) {
    if ( name in this.object ) {
      if ( !Array.isArray(this.object[name]) ) this.object[name] = [this.object[name]];
    }
    else this.object[name] = [];
    this.object[name].push(value);
    super.append(name, value);
  }

  /* -------------------------------------------- */

  /**
   * Process all standard HTML form field elements from the form.
   * @param {HTMLFormElement} form    The form being processed
   * @param {object} options          Options forwarded from the constructor
   * @param {boolean} [options.disabled]    Process disabled fields?
   * @param {boolean} [options.readonly]    Process readonly fields?
   */
  #processFormFields(form, {disabled, readonly}={}) {
    if ( !disabled && form.hasAttribute("disabled") ) return;
    const mceEditorIds = Object.values(this.editors).map(e => e.mce?.id);
    for ( const element of form.elements ) {
      const name = element.name;

      // Skip fields which are unnamed or already handled
      if ( !name || this.has(name) ) continue;

      // Skip buttons and editors
      if ( (element.tagName === "BUTTON") || mceEditorIds.includes(name) ) continue;

      // Skip disabled or read-only fields
      if ( !disabled && element.matches(":disabled") ) continue;
      if ( !readonly && element.readOnly ) continue;

      // Extract and process the value of the field
      const field = form.elements.namedItem(name);
      const value = this.#getFieldValue(name, field);
      this.set(name, value);
    }
  }

  /* -------------------------------------------- */

  /**
   * Process editable HTML elements (ones with a [data-edit] attribute).
   * @param {HTMLFormElement} form    The form being processed
   * @param {object} options          Options forwarded from the constructor
   * @param {boolean} [options.disabled]    Process disabled fields?
   * @param {boolean} [options.readonly]    Process readonly fields?
   */
  #processEditableHTML(form, {disabled, readonly}={}) {
    const editableElements = form.querySelectorAll("[data-edit]");
    for ( const element of editableElements ) {
      const name = element.dataset.edit;
      if ( this.has(name) || (name in this.editors) ) continue;
      if ( (!disabled && element.disabled) || (!readonly && element.readOnly) ) continue;
      let value;
      if (element.tagName === "IMG") value = element.getAttribute("src");
      else value = element.innerHTML.trim();
      this.set(name, value);
    }
  }

  /* -------------------------------------------- */

  /**
   * Process TinyMCE editor instances which are present in the form.
   */
  #processEditors() {
    for ( const [name, editor] of Object.entries(this.editors) ) {
      if ( !editor.instance ) continue;
      if ( editor.options.engine === "tinymce" ) {
        const content = editor.instance.getContent();
        this.delete(editor.mce.id); // Delete hidden MCE inputs
        this.set(name, content);
      } else if ( editor.options.engine === "prosemirror" ) {
        this.set(name, ProseMirror.dom.serializeString(editor.instance.view.state.doc.content));
      }
    }
  }

  /* -------------------------------------------- */

  /**
   * Obtain the parsed value of a field conditional on its element type and requested data type.
   * @param {string} name                       The field name being processed
   * @param {HTMLElement|RadioNodeList} field   The HTML field or a RadioNodeList of multiple fields
   * @returns {*}                               The processed field value
   */
  #getFieldValue(name, field) {

    // Multiple elements with the same name
    if ( field instanceof RadioNodeList ) {
      const fields = Array.from(field);
      if ( fields.every(f => f.type === "radio") ) {
        const chosen = fields.find(f => f.checked);
        return chosen ? this.#getFieldValue(name, chosen) : undefined;
      }
      return Array.from(field).map(f => this.#getFieldValue(name, f));
    }

    // Record requested data type
    const dataType = field.dataset.dtype || this.dtypes[name];

    // Checkbox
    if ( field.type === "checkbox" ) {

      // Non-boolean checkboxes with an explicit value attribute yield that value or null
      if ( field.hasAttribute("value") && (dataType !== "Boolean") ) {
        return this.#castType(field.checked ? field.value : null, dataType);
      }

      // Otherwise, true or false based on the checkbox checked state
      return this.#castType(field.checked, dataType);
    }

    // Number and Range
    if ( ["number", "range"].includes(field.type) ) {
      if ( field.value === "" ) return null;
      else return this.#castType(field.value, dataType || "Number");
    }

    // Multi-Select
    if ( field.type === "select-multiple" ) {
      return Array.from(field.options).reduce((chosen, opt) => {
        if ( opt.selected ) chosen.push(this.#castType(opt.value, dataType));
        return chosen;
      }, []);
    }

    // Radio Select
    if ( field.type === "radio" ) {
      return field.checked ? this.#castType(field.value, dataType) : null;
    }

    // Other field types
    return this.#castType(field.value, dataType);
  }

  /* -------------------------------------------- */

  /**
   * Cast a processed value to a desired data type.
   * @param {any} value         The raw field value
   * @param {string} dataType   The desired data type
   * @returns {any}             The resulting data type
   */
  #castType(value, dataType) {
    if ( value instanceof Array ) return value.map(v => this.#castType(v, dataType));
    if ( [undefined, null].includes(value) || (dataType === "String") ) return value;

    // Boolean
    if ( dataType === "Boolean" ) {
      if ( value === "false" ) return false;
      return Boolean(value);
    }

    // Number
    else if ( dataType === "Number" ) {
      if ( (value === "") || (value === "null") ) return null;
      return Number(value);
    }

    // Serialized JSON
    else if ( dataType === "JSON" ) {
      return JSON.parse(value);
    }

    // Other data types
    if ( window[dataType] instanceof Function ) {
      try {
        return window[dataType](value);
      } catch(err) {
        console.warn(`The form field value "${value}" was not able to be cast to the requested data type ${dataType}`);
      }
    }
    return value;
  }
}

/**
 * This module contains data field classes which are used to define a data schema.
 * A data field is responsible for cleaning, validation, and initialization of the value assigned to it.
 * Each data field extends the {@link foundry.data.fields.DataField} class to implement logic specific to its
 * contained data type.
 * @module fields
 */

import {
  ALL_DOCUMENT_TYPES,
  BASE_DOCUMENT_TYPE,
  DOCUMENT_OWNERSHIP_LEVELS,
  FILE_CATEGORIES
} from "../constants.mjs";
import {
  isColorString,
  isValidId,
  isJSON,
  hasFileExtension,
  isBase64Data
} from "./validators.mjs";
import {
  applySpecialKeys,
  deepClone,
  diffObject,
  getType,
  isDeletionKey,
  isEmpty,
  isSubclass,
  mergeObject,
  parseUuid,
  randomID
} from "../utils/helpers.mjs";
import {DataModelValidationFailure} from "./validation-failure.mjs";
import SingletonEmbeddedCollection from "../abstract/singleton-collection.mjs";
import EmbeddedCollection from "../abstract/embedded-collection.mjs";
import EmbeddedCollectionDelta from "../abstract/embedded-collection-delta.mjs";
import {AsyncFunction, Color} from "../utils/_module.mjs";

/**
 * @import {EffectChangeData} from "../documents/_types.mjs";
 * @import {
 *   ArrayFieldOptions,
 *   ChoiceInputConfig,
 *   CodeMirrorInputConfig,
 *   DataFieldContext,
 *   DataFieldOptions,
 *   DataFieldValidationOptions,
 *   DocumentStats,
 *   DocumentUUIDFieldOptions,
 *   FilePathFieldOptions,
 *   FormGroupConfig,
 *   FormInputConfig,
 *   JavaScriptFieldOptions,
 *   NumberFieldOptions,
 *   StringFieldInputConfig,
 *   StringFieldOptions
 * } from "./_types.mjs";
 * @import {Document, DataModel} from "../abstract/_module.mjs";
 * @import {DataSchema, DataModelUpdateOptions} from "../abstract/_types.mjs";
 * @import {FormSelectOption} from "../../client/applications/forms/fields.mjs"
 */

/* ---------------------------------------- */
/*  Abstract Data Field                     */
/* ---------------------------------------- */

/**
 * An abstract class that defines the base pattern for a data field within a data schema.
 * @property {string} name                The name of this data field within the schema that contains it.
 * @mixes DataFieldOptions
 */
class DataField {
  /**
   * @param {DataFieldOptions} [options]    Options which configure the behavior of the field
   * @param {DataFieldContext} [context]    Additional context which describes the field
   */
  constructor(options={}, {name, parent}={}) {
    this.name = name;
    this.parent = parent;
    this.options = options;
    for ( const k in this.constructor._defaults ) {
      this[k] = k in this.options ? this.options[k] : this.constructor._defaults[k];
    }
  }

  /**
   * The field name of this DataField instance.
   * This is assigned by SchemaField#initialize.
   * @internal
   */
  name;

  /**
   * A reference to the parent schema to which this DataField belongs.
   * This is assigned by SchemaField#initialize.
   * @internal
   */
  parent;

  /**
   * The initially provided options which configure the data field
   * @type {DataFieldOptions}
   */
  options;

  /**
   * Whether this field defines part of a Document/Embedded Document hierarchy.
   * @type {boolean}
   */
  static hierarchical = false;

  /**
   * Does this field type contain other fields in a recursive structure?
   * Examples of recursive fields are SchemaField, ArrayField, or TypeDataField
   * Examples of non-recursive fields are StringField, NumberField, or ObjectField
   * @type {boolean}
   */
  static recursive = false;

  /**
   * Default parameters for this field type
   * @returns {DataFieldOptions}
   * @protected
   */
  static get _defaults() {
    return {
      required: false,
      nullable: false,
      initial: undefined,
      readonly: false,
      gmOnly: false,
      label: "",
      hint: "",
      validationError: "is not a valid value"
    };
  }

  /**
   * A dot-separated string representation of the field path within the parent schema.
   * @type {string}
   */
  get fieldPath() {
    return [this.parent?.fieldPath, this.name].filterJoin(".");
  }

  /**
   * Apply a function to this DataField which propagates through recursively to any contained data schema.
   * @param {string|Function} fn          The function to apply
   * @param {*} value                     The current value of this field
   * @param {object} [options={}]         Additional options passed to the applied function
   * @returns {object}                    The results object
   */
  apply(fn, value, options={}) {
    if ( typeof fn === "string" ) fn = this[fn];
    return fn.call(this, value, options);
  }

  /* -------------------------------------------- */

  /**
   * Add types of the source to the data if they are missing.
   * @param {*} source                           The source data
   * @param {*} changes                          The partial data
   * @param {object} [options]                   Additional options
   * @param {object} [options.source]            The root data model source
   * @param {object} [options.changes]           The root data model changes
   * @internal
   */
  _addTypes(source, changes, options) {}

  /* -------------------------------------------- */

  /**
   * Recursively traverse a schema and retrieve a field specification by a given path
   * @param {string[]} path             The field path as an array of strings
   * @returns {DataField|undefined}     The corresponding DataField definition for that field, or undefined
   * @internal
   */
  _getField(path) {
    return path.length ? undefined : this;
  }

  /* -------------------------------------------- */
  /*  Field Cleaning                              */
  /* -------------------------------------------- */

  /**
   * Coerce source data to ensure that it conforms to the correct data type for the field.
   * Data coercion operations should be simple and synchronous as these are applied whenever a DataModel is constructed.
   * For one-off cleaning of user-provided input the sanitize method should be used.
   * @param {*} value           An initial requested value
   * @param {object} [options]  Additional options for how the field is cleaned
   * @param {boolean} [options.partial]   Whether to perform partial cleaning?
   * @param {object} [options.source]     The root data model being cleaned
   * @returns {*}               The cast value
   */
  clean(value, options={}) {

    // Get an initial value for the field
    if ( value === undefined ) return this.getInitialValue(options.source);

    // Keep allowed special values
    try {
      const isValid = this._validateSpecial(value);
      if ( isValid === true ) return value;
    } catch(err) {
      return this.getInitialValue(options.source);
    }

    // Cast a provided value to the correct type
    value = this._cast(value);

    // Cleaning logic specific to the DataField.
    return this._cleanType(value, options);
  }

  /* -------------------------------------------- */

  /**
   * Apply any cleaning logic specific to this DataField type.
   * @param {*} value           The appropriately coerced value.
   * @param {object} [options]  Additional options for how the field is cleaned.
   * @returns {*}               The cleaned value.
   * @protected
   */
  _cleanType(value, options) {
    return value;
  }

  /* -------------------------------------------- */

  /**
   * Cast a non-default value to ensure it is the correct type for the field
   * @param {*} value       The provided non-default value
   * @returns {*}           The standardized value
   * @protected
   */
  _cast(value) {
    return value;
  }

  /* -------------------------------------------- */

  /**
   * Attempt to retrieve a valid initial value for the DataField.
   * @param {object} data   The source data object for which an initial value is required
   * @returns {*}           A proposed initial value
   */
  getInitialValue(data) {
    if ( this.initial instanceof Function ) return this.initial(data);  // Explicit function
    else if ( this.initial !== undefined ) return this.initial;         // Explicit value
    if ( !this.required ) return undefined;                             // Prefer undefined if non-required
    if ( this.nullable ) return null;                                   // Prefer explicit null
    return undefined;                                                   // Otherwise undefined
  }

  /* -------------------------------------------- */

  /**
   * Export the current value of the field into a serializable object.
   * @param {*} value                   The initialized value of the field
   * @returns {*}                       An exported representation of the field
   */
  toObject(value) {
    return value;
  }

  /* -------------------------------------------- */
  /*  Field Validation                            */
  /* -------------------------------------------- */

  /**
   * Validate a candidate input for this field, ensuring it meets the field requirements.
   * A validation failure can be provided as a raised Error (with a string message), by returning false, or by returning
   * a DataModelValidationFailure instance.
   * A validator which returns true denotes that the result is certainly valid and further validations are unnecessary.
   * @param {*} value                                  The initial value
   * @param {DataFieldValidationOptions} [options={}]  Options which affect validation behavior
   * @returns {DataModelValidationFailure|void}        Returns a DataModelValidationFailure if a validation failure
   *                                                   occurred.
   */
  validate(value, options={}) {
    const validators = [this._validateSpecial, this._validateType];
    if ( this.options.validate ) validators.push(this.options.validate);
    try {
      for ( const validator of validators ) {
        const isValid = validator.call(this, value, options);
        if ( isValid === true ) return undefined;
        if ( isValid === false ) {
          return new DataModelValidationFailure({
            invalidValue: value,
            message: this.validationError,
            unresolved: true
          });
        }
        if ( isValid instanceof DataModelValidationFailure ) return isValid;
      }
    } catch(err) {
      return new DataModelValidationFailure({invalidValue: value, message: err.message, unresolved: true});
    }
  }

  /* -------------------------------------------- */

  /**
   * Special validation rules which supersede regular field validation.
   * This validator screens for certain values which are otherwise incompatible with this field like null or undefined.
   * @param {*} value               The candidate value
   * @returns {boolean|void}        A boolean to indicate with certainty whether the value is valid.
   *                                Otherwise, return void.
   * @throws {Error}                May throw a specific error if the value is not valid
   * @protected
   */
  _validateSpecial(value) {

    // Allow null values for explicitly nullable fields
    if ( value === null ) {
      if ( this.nullable ) return true;
      else throw new Error("may not be null");
    }

    // Allow undefined if the field is not required
    if ( value === undefined ) {
      if ( this.required ) throw new Error("may not be undefined");
      else return true;
    }
  }

  /* -------------------------------------------- */

  /**
   * A default type-specific validator that can be overridden by child classes
   * @param {*} value                                    The candidate value
   * @param {DataFieldValidationOptions} [options={}]    Options which affect validation behavior
   * @returns {boolean|DataModelValidationFailure|void}  A boolean to indicate with certainty whether the value is
   *                                                     valid, or specific DataModelValidationFailure information,
   *                                                     otherwise void.
   * @throws                                             May throw a specific error if the value is not valid
   * @protected
   */
  _validateType(value, options={}) {}

  /* -------------------------------------------- */

  /**
   * Certain fields may declare joint data validation criteria.
   * This method will only be called if the field is designated as recursive.
   * @param {object} data       Candidate data for joint model validation
   * @param {object} options    Options which modify joint model validation
   * @throws  An error if joint model validation fails
   * @internal
   */
  _validateModel(data, options={}) {}

  /* -------------------------------------------- */
  /*  Initialization and Updates                  */
  /* -------------------------------------------- */

  /**
   * Initialize the original source data into a mutable copy for the DataModel instance.
   * @param {*} value                   The source value of the field
   * @param {Object} model              The DataModel instance that this field belongs to
   * @param {object} [options]          Initialization options
   * @returns {*}                       An initialized copy of the source data
   */
  initialize(value, model, options={}) {
    return value;
  }

  /* -------------------------------------------- */

  /**
   * Update the source data for a DataModel which includes this DataField.
   * This method is responsible for modifying the provided source data as well as updating the tracked diff included
   * in provided metadata.
   * @param {object} source               Source data of the DataModel which should be updated. This object is always
   *                                      a partial node of source data, relative to which this field belongs.
   * @param {string} key                  The name of this field within the context of the source data.
   * @param {any} value                   The candidate value that should be applied as an update.
   * @param {object} difference           The accumulated diff that is recursively populated as the model traverses
   *                                      through its schema fields.
   * @param {DataModelUpdateOptions} options Options which modify how this update workflow is performed.
   * @throws {Error}                      An error if the requested update cannot be performed.
   * @internal
   */
  _updateDiff(source, key, value, difference, options) {
    const current = source[key];
    if ( value === current ) return;
    difference[key] = value;
    source[key] = value;
  }

  /* -------------------------------------------- */

  /**
   * Commit a prepared update to DataModel#_source.
   * @param {object} source               The parent source object within which the `key` field exists
   * @param {string} key                  The named field in source to commit
   * @param {object} value                The new value of the field which should be committed to source
   * @param {object} diff                 The reported change to the field
   * @param {DataModelUpdateOptions} options Options which modify how this update workflow is performed.
   * @internal
   */
  _updateCommit(source, key, value, diff, options) {
    source[key] = value;
  }

  /* -------------------------------------------- */
  /*  Form Field Integration                      */
  /* -------------------------------------------- */

  /**
   * Does this form field class have defined form support?
   * @type {boolean}
   */
  static get hasFormSupport() {
    return this.prototype._toInput !== DataField.prototype._toInput;
  }

  /* -------------------------------------------- */

  /**
   * Render this DataField as an HTML element.
   * @param {FormInputConfig} config        Form element configuration parameters
   * @throws {Error}                        An Error if this DataField subclass does not support input rendering
   * @returns {HTMLElement|HTMLCollection}  A rendered HTMLElement for the field
   */
  toInput(config={}) {
    const inputConfig = {name: this.fieldPath, ...config};
    if ( inputConfig.input instanceof Function ) return config.input(this, inputConfig);
    return this._toInput(inputConfig);
  }

  /* -------------------------------------------- */

  // eslint-disable-next-line jsdoc/require-returns-check
  /**
   * Render this DataField as an HTML element.
   * Subclasses should implement this method rather than the public toInput method which wraps it.
   * @param {FormInputConfig} config        Form element configuration parameters
   * @throws {Error}                        An Error if this DataField subclass does not support input rendering
   * @returns {HTMLElement|HTMLCollection}  A rendered HTMLElement for the field
   * @protected
   */
  _toInput(config) {
    throw new Error(`The ${this.constructor.name} class does not implement the _toInput method`);
  }

  /* -------------------------------------------- */

  /**
   * Render this DataField as a standardized form-group element.
   * @param {FormGroupConfig} groupConfig   Configuration options passed to the wrapping form-group
   * @param {FormInputConfig} inputConfig   Input element configuration options passed to DataField#toInput
   * @returns {HTMLDivElement}              The rendered form group element
   */
  toFormGroup(groupConfig={}, inputConfig={}) {
    if ( groupConfig.widget instanceof Function ) return groupConfig.widget(this, groupConfig, inputConfig);
    groupConfig.label ??= this.label ?? this.fieldPath;
    groupConfig.hint ??= this.hint;
    groupConfig.input ??= this.toInput(inputConfig);
    return foundry.applications.fields.createFormGroup(groupConfig);
  }

  /* -------------------------------------------- */
  /*  Active Effect Integration                   */
  /* -------------------------------------------- */

  /**
   * Apply an ActiveEffectChange to this field.
   * @param {*} value                  The field's current value.
   * @param {DataModel} model          The model instance.
   * @param {EffectChangeData} change  The change to apply.
   * @returns {*}                      The updated value.
   */
  applyChange(value, model, change) {
    const delta = this._castChangeDelta(change.value);
    switch ( change.mode ) {
      case CONST.ACTIVE_EFFECT_MODES.ADD: return this._applyChangeAdd(value, delta, model, change);
      case CONST.ACTIVE_EFFECT_MODES.MULTIPLY: return this._applyChangeMultiply(value, delta, model, change);
      case CONST.ACTIVE_EFFECT_MODES.OVERRIDE: return this._applyChangeOverride(value, delta, model, change);
      case CONST.ACTIVE_EFFECT_MODES.UPGRADE: return this._applyChangeUpgrade(value, delta, model, change);
      case CONST.ACTIVE_EFFECT_MODES.DOWNGRADE: return this._applyChangeDowngrade(value, delta, model, change);
    }
    return this._applyChangeCustom(value, delta, model, change);
  }

  /* -------------------------------------------- */

  /**
   * Cast a change delta into an appropriate type to be applied to this field.
   * @param {*} delta  The change delta.
   * @returns {*}
   * @internal
   */
  _castChangeDelta(delta) {
    return this._cast(delta);
  }

  /* -------------------------------------------- */

  /**
   * Apply an ADD change to this field.
   * @param {*} value                  The field's current value.
   * @param {*} delta                  The change delta.
   * @param {DataModel} model          The model instance.
   * @param {EffectChangeData} change  The original change data.
   * @returns {*}                      The updated value.
   * @protected
   */
  _applyChangeAdd(value, delta, model, change) {
    return value + delta;
  }

  /* -------------------------------------------- */

  /**
   * Apply a MULTIPLY change to this field.
   * @param {*} value                  The field's current value.
   * @param {*} delta                  The change delta.
   * @param {DataModel} model          The model instance.
   * @param {EffectChangeData} change  The original change data.
   * @returns {*}                      The updated value.
   * @protected
   */
  _applyChangeMultiply(value, delta, model, change) {}

  /* -------------------------------------------- */

  /**
   * Apply an OVERRIDE change to this field.
   * @param {*} value                  The field's current value.
   * @param {*} delta                  The change delta.
   * @param {DataModel} model          The model instance.
   * @param {EffectChangeData} change  The original change data.
   * @returns {*}                      The updated value.
   * @protected
   */
  _applyChangeOverride(value, delta, model, change) {
    return delta;
  }

  /* -------------------------------------------- */

  /**
   * Apply an UPGRADE change to this field.
   * @param {*} value                  The field's current value.
   * @param {*} delta                  The change delta.
   * @param {DataModel} model          The model instance.
   * @param {EffectChangeData} change  The original change data.
   * @returns {*}                      The updated value.
   * @protected
   */
  _applyChangeUpgrade(value, delta, model, change) {}

  /* -------------------------------------------- */

  /**
   * Apply a DOWNGRADE change to this field.
   * @param {*} value                  The field's current value.
   * @param {*} delta                  The change delta.
   * @param {DataModel} model          The model instance.
   * @param {EffectChangeData} change  The original change data.
   * @returns {*}                      The updated value.
   * @protected
   */
  _applyChangeDowngrade(value, delta, model, change) {}

  /* -------------------------------------------- */

  /**
   * Apply a CUSTOM change to this field.
   * @param {*} value                  The field's current value.
   * @param {*} delta                  The change delta.
   * @param {DataModel} model          The model instance.
   * @param {EffectChangeData} change  The original change data.
   * @returns {*}                      The updated value.
   * @protected
   */
  _applyChangeCustom(value, delta, model, change) {
    const preHook = foundry.utils.getProperty(model, change.key);
    Hooks.call("applyActiveEffect", model, change, value, delta, {});
    const postHook = foundry.utils.getProperty(model, change.key);
    if ( postHook !== preHook ) return postHook;
  }
}

/* -------------------------------------------- */
/*  Data Schema Field                           */
/* -------------------------------------------- */

/**
 * A special class of {@link foundry.data.fields.DataField} which defines a data schema.
 */
class SchemaField extends DataField {
  /**
   * @param {DataSchema} fields                 The contained field definitions
   * @param {DataFieldOptions} [options]        Options which configure the behavior of the field
   * @param {DataFieldContext} [context]        Additional context which describes the field
   */
  constructor(fields, options, context={}) {
    super(options, context);
    this.fields = this._initialize(fields);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  static get _defaults() {
    return Object.assign(super._defaults, {required: true, nullable: false});
  }

  /** @override */
  static recursive = true;

  /* -------------------------------------------- */

  /**
   * The contained field definitions.
   * @type {DataSchema}
   */
  fields;

  /* -------------------------------------------- */

  /**
   * Initialize and validate the structure of the provided field definitions.
   * @param {DataSchema} fields     The provided field definitions
   * @returns {DataSchema}          The validated schema
   * @protected
   */
  _initialize(fields) {
    if ( getType(fields) !== "Object" ) {
      throw new Error("A DataSchema must be an object with string keys and DataField values.");
    }
    fields = {...fields};
    for ( const [name, field] of Object.entries(fields) ) {
      if ( name === "_source" ) throw new Error('"_source" is not a valid name for a field of a SchemaField.');
      if ( !(field instanceof DataField) ) {
        throw new Error(`The "${name}" field is not an instance of the DataField class.`);
      }
      if ( field.parent !== undefined ) {
        throw new Error(`The "${field.fieldPath}" field already belongs to some other parent and may not be reused.`);
      }
      field.name = name;
      field.parent = this;
    }
    return fields;
  }

  /* -------------------------------------------- */
  /*  Schema Iteration                            */
  /* -------------------------------------------- */

  /**
   * Iterate over a SchemaField by iterating over its fields.
   * @type {Iterable<DataField>}
   */
  *[Symbol.iterator]() {
    for ( const field of Object.values(this.fields) ) {
      yield field;
    }
  }

  /**
   * An array of field names which are present in the schema.
   * @returns {string[]}
   */
  keys() {
    return Object.keys(this.fields);
  }

  /**
   * An array of DataField instances which are present in the schema.
   * @returns {DataField[]}
   */
  values() {
    return Object.values(this.fields);
  }

  /**
   * An array of [name, DataField] tuples which define the schema.
   * @returns {Array<[string, DataField]>}
   */
  entries() {
    return Object.entries(this.fields);
  }

  /**
   * Test whether a certain field name belongs to this schema definition.
   * @param {string} fieldName    The field name
   * @returns {boolean}           Does the named field exist in this schema?
   */
  has(fieldName) {
    return Object.hasOwn(this.fields, fieldName);
  }

  /**
   * Get a DataField instance from the schema by name.
   * @param {string} fieldName    The field name
   * @returns {DataField|void}    The DataField instance or undefined
   */
  get(fieldName) {
    if ( !this.has(fieldName) ) return;
    return this.fields[fieldName];
  }

  /**
   * Traverse the schema, obtaining the DataField definition for a particular field.
   * @param {string[]|string} fieldName       A field path like ["abilities", "strength"] or "abilities.strength"
   * @returns {DataField|undefined}           The corresponding DataField definition for that field, or undefined
   */
  getField(fieldName) {
    let path;
    if ( typeof fieldName === "string" ) path = fieldName.split(".");
    else if ( Array.isArray(fieldName) ) path = fieldName.slice();
    else throw new Error("A field path must be an array of strings or a dot-delimited string");
    return this._getField(path);
  }

  /** @override */
  _getField(path) {
    if ( !path.length ) return this;
    const field = this.get(path.shift());
    return field?._getField(path);
  }

  /* -------------------------------------------- */
  /*  Data Field Methods                          */
  /* -------------------------------------------- */

  /** @override */
  getInitialValue(data) {
    const initial = super.getInitialValue(data);
    if ( this.required && (initial === undefined) ) return this._cleanType({});
    return initial;
  }

  /* -------------------------------------------- */

  /** @override */
  _cast(value) {
    return getType(value) === "Object" ? value : {};
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _cleanType(data, options={}) {
    options.source = options.source || data;

    // Clean each field which belongs to the schema
    for ( const [name, field] of this.entries() ) {
      const k = `==${name}`;
      if ( k in data ) {
        data[k] = field.clean(applySpecialKeys(data[k]), {...options, partial: false});
      } else if ( !options.partial || (name in data) ) {
        data[name] = field.clean(data[name], options);
      }
    }

    // Delete any keys which do not belong to the schema
    for ( const k in data ) {
      if ( this.has(k) ) continue;
      if ( isDeletionKey(k) ) {
        const key = k.slice(2);
        if ( this.has(key) ) continue;
      }
      delete data[k];
    }
    return data;
  }

  /* -------------------------------------------- */

  /** @override */
  initialize(value, model, options={}) {
    if ( !value ) return value;
    const data = {};
    for ( const [name, field] of this.entries() ) {
      const v = field.initialize(value[name], model, options);

      // Readonly fields
      if ( field.readonly ) {
        Object.defineProperty(data, name, {value: v, writable: false});
      }

      // Getter fields
      else if ( (typeof v === "function") && !v.prototype ) {
        Object.defineProperty(data, name, {get: v, set() {}, configurable: true});
      }

      // Writable fields
      else data[name] = v;
    }
    return data;
  }

  /* -------------------------------------------- */

  /**
   * The SchemaField#update method plays a special role of recursively dispatching DataField#update operations to the
   * constituent fields within the schema.
   * @override
   */
  _updateDiff(source, key, value, difference, options) {

    // * -> undefined, or * -> null
    if ( (value === undefined) || (value === null) || ((options.recursive === false) && (key !== "_source")) ) {
      value = applySpecialKeys(value);
      if ( options.recursive === false ) value = this.clean(value);
      super._updateDiff(source, key, value, difference, options);
      return;
    }

    // Pass type to fields
    const hasTypeData = this.fields.system instanceof TypeDataField;
    if ( hasTypeData && (("==type" in value) || ("-=type" in value)) ) {
      throw new Error("The type of a Document cannot be updated with ==type or -=type");
    }

    // {} -> {}, undefined -> {}, or null -> {}
    source[key] ||= {};
    source = source[key];
    const schemaDiff = difference[key] = {};
    for ( const [k, v] of Object.entries(value) ) {
      let name = k;
      const specialKey = isDeletionKey(k);
      if ( specialKey ) name = k.slice(2);

      // Require the changed field to exist
      const field = this.get(name);
      if ( !field ) continue;

      // Special operations for deletion or forced replacement
      if ( specialKey ) {
        if ( k[0] === "-" ) {
          if ( v !== null ) throw new Error("Removing a key using the -= deletion syntax requires the value of that"
            + " deletion key to be null, for example {-=key: null}");
          if ( name in source ) {
            schemaDiff[k] = v;
            delete source[name];
          }
        }
        else if ( k[0] === "=" ) schemaDiff[k] = source[name] = applySpecialKeys(v);
        continue;
      }

      // Perform field-specific update
      field._updateDiff(source, k, v, schemaDiff, options);
    }

    if ( hasTypeData && ("type" in schemaDiff) && !(("==system" in value) || (("system" in value) && (options.recursive === false))) ) {
      throw new Error("The type of a Document can be changed only if the system field is force-replaced (==) or updated with {recursive: false}");
    }

    // No updates applied
    if ( isEmpty(schemaDiff) ) delete difference[key];
  }

  /* -------------------------------------------- */

  /** @override */
  _updateCommit(source, key, value, diff, options) {
    const s = source[key];

    // Special Cases: * -> undefined, * -> null, undefined -> *, null -> *
    if ( !s || !value ) {
      source[key] = value;
      return;
    }

    // Clear system field if the type changed
    const hasTypeData = this.fields.system instanceof TypeDataField;
    if ( hasTypeData && ("type" in diff) ) s.system = undefined;

    // Update fields in source which changed in the diff
    for ( let [k, d] of Object.entries(diff) ) {
      k = isDeletionKey(k) ? k.slice(2) : k;
      const field = this.get(k);
      if ( !field ) continue;
      field._updateCommit(s, k, value[k], d, options);
    }
  }

  /* -------------------------------------------- */

  /** @override */
  _validateType(data, options={}) {
    if ( !(data instanceof Object) ) throw new Error("must be an object");
    options.source = options.source || data;
    const schemaFailure = new DataModelValidationFailure();
    for ( const [name, field] of this.entries() ) {
      for ( const prefix of ["", "-=", "=="] ) {
        const key = prefix + name;
        if ( (prefix || options.partial) && !(key in data) ) continue;

        // Validate the field's current value
        let value = data[key];
        if ( prefix === "-=" ) {
          if ( value !== null ) throw new Error("Removing a key using the -= deletion syntax requires the value of that"
            + " deletion key to be null, for example {-=key: null}");
          value = undefined;
        }
        const failure = field.validate(value, options);

        // Failure may be permitted if fallback replacement is allowed
        if ( failure ) {
          schemaFailure.fields[key] = failure;

          // If the field internally applied fallback logic
          if ( !failure.unresolved ) continue;

          // If fallback is allowed at the schema level
          if ( options.fallback && !prefix ) {
            const initial = field.getInitialValue(options.source);
            const fallbackFailure = field.validate(initial, {fallback: false, source: options.source});
            if ( fallbackFailure ) failure.unresolved = schemaFailure.unresolved = true;
            else {
              data[name] = failure.fallback = initial;
              failure.unresolved = false;
            }
          }

          // Otherwise the field-level failure is unresolved
          else failure.unresolved = schemaFailure.unresolved = true;
        }
      }
    }
    if ( !isEmpty(schemaFailure.fields) ) return schemaFailure;
  }

  /* ---------------------------------------- */

  /** @override */
  _validateModel(changes, options={}) {
    options.source = options.source || changes;
    if ( !changes ) return;
    for ( const [name, field] of this.entries() ) {
      const change = changes[name];  // May be nullish
      if ( change && field.constructor.recursive ) field._validateModel(change, options);
    }
  }

  /* -------------------------------------------- */

  /** @override */
  toObject(value) {
    if ( (value === undefined) || (value === null) ) return value;
    const data = {};
    for ( const [name, field] of this.entries() ) {
      data[name] = field.toObject(value[name]);
    }
    return data;
  }

  /* -------------------------------------------- */

  /** @override */
  apply(fn, data={}, options={}) {

    // Apply to this SchemaField
    const thisFn = typeof fn === "string" ? this[fn] : fn;
    thisFn?.call(this, data, options);
    if ( !data || (typeof data !== "object") ) return data; // Do not recurse for non-object types or null

    // Recursively apply to inner fields
    const results = {};
    for ( const [key, field] of this.entries() ) {
      if ( options.partial && !(key in data) ) continue;
      const r = field.apply(fn, data[key], options);
      if ( !options.filter || !isEmpty(r) ) results[key] = r;
    }
    return results;
  }

  /* -------------------------------------------- */

  /** @override */
  _addTypes(source, changes, options={}) {
    if ( getType(source) !== "Object" ) return;
    if ( getType(changes) !== "Object" ) return;
    options.source ??= source;
    options.changes ??= changes;
    const hasTypeData = this.fields.system instanceof TypeDataField;
    if ( hasTypeData ) {
      if ( "type" in changes ) changes.type ??= this.fields.type.getInitialValue(source);
      else changes.type = source.type;
    }
    for ( const key in changes ) {
      const field = this.get(key);
      field?._addTypes(source[key], changes[key], options);
    }
  }

  /* -------------------------------------------- */

  /**
   * Migrate this field's candidate source data.
   * @param {object} sourceData   Candidate source data of the root model
   * @param {any} fieldData       The value of this field within the source data
   */
  migrateSource(sourceData, fieldData) {
    if ( getType(fieldData) !== "Object" ) return;
    for ( const key in fieldData ) {
      const isDeletion = isDeletionKey(key);
      if ( isDeletion && (key[0] === "-") ) continue;
      const field = this.get(isDeletion ? key.slice(2) : key);
      if ( !field || !(field.migrateSource instanceof Function) ) continue;
      field.migrateSource(sourceData, fieldData[key]);
    }
  }
}

/* -------------------------------------------- */
/*  Basic Field Types                           */
/* -------------------------------------------- */

/**
 * A subclass of {@link foundry.data.fields.DataField} which deals with boolean-typed data.
 */
class BooleanField extends DataField {

  /** @inheritdoc */
  static get _defaults() {
    return Object.assign(super._defaults, {required: true, nullable: false, initial: false});
  }

  /** @override */
  _cast(value) {
    if ( typeof value === "string" ) return value === "true";
    if ( typeof value === "object" ) return false;
    return Boolean(value);
  }

  /** @override */
  _validateType(value) {
    if (typeof value !== "boolean") throw new Error("must be a boolean");
  }

  /** @override */
  _toInput(config) {
    config.value ??= this.initial;
    return foundry.applications.fields.createCheckboxInput(config);
  }

  /* -------------------------------------------- */
  /*  Active Effect Integration                   */
  /* -------------------------------------------- */

  /** @override */
  _applyChangeAdd(value, delta, model, change) {
    return value || delta;
  }

  /** @override */
  _applyChangeMultiply(value, delta, model, change) {
    return value && delta;
  }

  /** @override */
  _applyChangeUpgrade(value, delta, model, change) {
    return delta > value ? delta : value;
  }

  /** @override */
  _applyChangeDowngrade(value, delta, model, change) {
    return delta < value ? delta : value;
  }
}

/* ---------------------------------------- */

/**
 * A subclass of {@link foundry.data.fields.DataField} which deals with number-typed data.
 *
 * @property {number} min                 A minimum allowed value
 * @property {number} max                 A maximum allowed value
 * @property {number} step                A permitted step size
 * @property {boolean} integer=false      Must the number be an integer?
 * @property {boolean} positive=false     Must the number be positive?
 * @property {number[]|object|Function} [choices] An array of values or an object of values/labels which represent
 *                                        allowed choices for the field. A function may be provided which dynamically
 *                                        returns the array of choices.
 */
class NumberField extends DataField {
  /**
   * @param {NumberFieldOptions} options  Options which configure the behavior of the field
   * @param {DataFieldContext} [context]  Additional context which describes the field
   */
  constructor(options={}, context={}) {
    super(options, context);
    // If choices are provided, the field should not be null by default
    if ( this.choices ) {
      this.nullable = options.nullable ?? false;
    }
    if ( Number.isFinite(this.min) && Number.isFinite(this.max) && (this.min > this.max) ) {
      throw new Error("NumberField minimum constraint cannot exceed its maximum constraint");
    }
  }

  /** @inheritdoc */
  static get _defaults() {
    return Object.assign(super._defaults, {
      nullable: true,
      min: undefined,
      max: undefined,
      step: undefined,
      integer: false,
      positive: false,
      choices: undefined
    });
  }

  /* -------------------------------------------- */

  /** @override */
  _cast(value) {
    return this.nullable && (value === "") ? null : Number(value);
  }

  /** @inheritdoc */
  _cleanType(value, options) {
    value = super._cleanType(value, options);
    if ( typeof value !== "number" ) return value;
    if ( this.integer ) value = Math.round(value);
    if ( Number.isFinite(this.step) ) {
      let base = 0;
      if ( Number.isFinite(this.min) ) value = Math.max(value, base = this.min);
      value = value.toNearest(this.step, "round", base);
      if ( Number.isFinite(this.max) ) value = Math.min(value, this.max.toNearest(this.step, "floor", base));
    } else {
      if ( Number.isFinite(this.min) ) value = Math.max(value, this.min);
      if ( Number.isFinite(this.max) ) value = Math.min(value, this.max);
    }
    return value;
  }

  /** @override */
  _validateType(value) {
    if ( typeof value !== "number" ) throw new Error("must be a number");
    if ( this.positive && (value <= 0) ) throw new Error("must be a positive number");
    if ( Number.isFinite(this.min) && (value < this.min) ) throw new Error(`must be at least ${this.min}`);
    if ( Number.isFinite(this.max) && (value > this.max) ) throw new Error(`must be at most ${this.max}`);
    if ( Number.isFinite(this.step) && (value.toNearest(this.step, "round", Number.isFinite(this.min) ? this.min : 0) !== value) ) {
      if ( Number.isFinite(this.min) && (this.min !== 0) ) throw new Error(`must be an increment of ${this.step} after subtracting ${this.min}`);
      else throw new Error(`must be an increment of ${this.step}`);
    }
    if ( this.choices && !this.#isValidChoice(value) ) throw new Error(`${value} is not a valid choice`);
    if ( this.integer ) {
      if ( !Number.isInteger(value) ) throw new Error("must be an integer");
    }
    else if ( !Number.isFinite(value) ) throw new Error("must be a finite number");
  }

  /**
   * Test whether a provided value is a valid choice from the allowed choice set
   * @param {number} value      The provided value
   * @returns {boolean}         Is the choice valid?
   */
  #isValidChoice(value) {
    let choices = this.choices;
    if ( choices instanceof Function ) choices = choices();
    if ( choices instanceof Array ) return choices.includes(value);
    return String(value) in choices;
  }

  /* -------------------------------------------- */
  /*  Form Field Integration                      */
  /* -------------------------------------------- */

  /** @override */
  _toInput(config) {
    config.min ??= this.min;
    config.max ??= this.max;
    config.step ??= this.step;
    if ( config.value === undefined ) config.value = this.getInitialValue({});
    if ( this.integer ) {
      if ( Number.isNumeric(config.value) ) config.value = Math.round(config.value);
      config.step ??= 1;
    }
    if ( this.positive && Number.isFinite(config.step) ) config.min ??= config.step;

    // Number Select
    config.choices ??= this.choices;
    StringField._prepareChoiceConfig(config);
    if ( config.options ) {
      config.dataset ||= {};
      config.dataset.dtype = "Number";
      return foundry.applications.fields.createSelectInput(config);
    }

    // Range Slider
    if ( ["min", "max", "step"].every(k => config[k] !== undefined) && (config.type !== "number") ) {
      return foundry.applications.elements.HTMLRangePickerElement.create(config);
    }

    // Number Input
    return foundry.applications.fields.createNumberInput(config);
  }

  /* -------------------------------------------- */
  /*  Active Effect Integration                   */
  /* -------------------------------------------- */

  /** @override */
  _applyChangeMultiply(value, delta, model, change) {
    return value * delta;
  }

  /** @override */
  _applyChangeUpgrade(value, delta, model, change) {
    return delta > value ? delta : value;
  }

  /** @override */
  _applyChangeDowngrade(value, delta, model, change) {
    return delta < value ? delta : value;
  }
}

/* ---------------------------------------- */

/**
 * A subclass of {@link foundry.data.fields.DataField} which deals with string-typed data.
 */
class StringField extends DataField {
  /**
   * @param {StringFieldOptions} [options]  Options which configure the behavior of the field
   * @param {DataFieldContext} [context]    Additional context which describes the field
   */
  constructor(options={}, context={}) {
    super(options, context);

    // If choices are provided, the field should not be null or blank by default
    if ( this.choices ) {
      this.nullable = options.nullable ?? false;
      this.blank = options.blank ?? false;
    }
  }

  /** @inheritdoc */
  static get _defaults() {
    return Object.assign(super._defaults, {blank: true, trim: true, choices: undefined, textSearch: false});
  }

  /**
   * Is the string allowed to be blank (empty)?
   * @type {boolean}
   */
  blank = this.blank;

  /**
   * Should any provided string be trimmed as part of cleaning?
   * @type {boolean}
   */
  trim = this.trim;

  /**
   * An array of values or an object of values/labels which represent
   * allowed choices for the field. A function may be provided which dynamically
   * returns the array of choices.
   * @type {string[]|object|Function}
   */
  choices = this.choices;

  /**
   * Is this string field a target for text search?
   * @type {boolean}
   */
  textSearch = this.textSearch;

  /* -------------------------------------------- */

  /** @inheritdoc */
  clean(value, options) {
    if ( (typeof value === "string") && this.trim ) value = value.trim(); // Trim input strings
    return super.clean(value, options);
  }

  /* -------------------------------------------- */

  /** @override */
  getInitialValue(data) {
    const initial = super.getInitialValue(data);
    if ( this.blank && this.required && !initial ) return "";  // Prefer blank to null for required fields
    return initial;
  }

  /* -------------------------------------------- */

  /** @override */
  _cast(value) {
    return String(value);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _validateSpecial(value) {
    if ( value === "" ) {
      if ( this.blank ) return true;
      else throw new Error("may not be a blank string");
    }
    return super._validateSpecial(value);
  }

  /* -------------------------------------------- */

  /** @override */
  _validateType(value) {
    if ( typeof value !== "string" ) throw new Error("must be a string");
    else if ( this.choices ) {
      if ( this._isValidChoice(value) ) return true;
      else throw new Error(`${value} is not a valid choice`);
    }
  }

  /* -------------------------------------------- */

  /**
   * Test whether a provided value is a valid choice from the allowed choice set
   * @param {string} value      The provided value
   * @returns {boolean}         Is the choice valid?
   * @protected
   */
  _isValidChoice(value) {
    let choices = this.choices;
    if ( choices instanceof Function ) choices = choices();
    if ( choices instanceof Array ) return choices.includes(value);
    return String(value) in choices;
  }

  /* -------------------------------------------- */
  /*  Form Field Integration                      */
  /* -------------------------------------------- */

  /**
   * Prepare form input configuration to accept a limited choice set of options.
   * @param {FormInputConfig & Partial<ChoiceInputConfig>} [config]
   * @internal
   */
  static _prepareChoiceConfig(config) {
    if ( config.options || !("choices" in config) ) return;
    let choices;
    try {
      choices = typeof config.choices === "function" ? config.choices() : config.choices;
    } catch(error) {
      logger.error(error);
    }

    // Prepare options array - only accept arrays or records
    if ( (typeof choices === "object") && (choices !== null) ) {
      config.options = [];
      for ( const [value, entry] of Object.entries(choices) ) {
        const choice = {value, ...StringField.#getChoiceFromEntry(entry, config)};
        config.options.push(choice);
      }
    }

    // Remove consumed options
    delete config.choices;
    delete config.valueAttr;
    delete config.labelAttr;
  }

  /* -------------------------------------------- */

  /**
   * Convert a choice entry into a standardized FormSelectOption
   * @param {string|object} entry
   * @param {{labelAttr?: string; valueAttr?: string; localize?: boolean}} options
   * @returns {FormSelectOption}
   */
  static #getChoiceFromEntry(entry, {labelAttr="label", valueAttr, localize}) {
    const choice = {};
    if ( foundry.utils.getType(entry) === "Object" ) {
      if ( valueAttr && (valueAttr in entry) ) choice.value = entry[valueAttr];
      if ( labelAttr && (labelAttr in entry) ) choice.label = entry[labelAttr];
      for ( const k of ["group", "disabled", "rule"] ) {
        if ( k in entry ) choice[k] = entry[k];
      }
    }
    else choice.label = String(entry);
    if ( localize && choice.label ) choice.label = game.i18n.localize(choice.label);
    return choice;
  }

  /* -------------------------------------------- */

  /**
   * @param {FormInputConfig & StringFieldInputConfig} config
   * @override
   */
  _toInput(config) {
    if ( config.value === undefined ) config.value = this.getInitialValue({});
    config.choices ??= this.choices;

    // Choice Select
    StringField._prepareChoiceConfig(config);
    if ( config.options ) {
      if ( this.blank || this.nullable || !this.required ) config.blank ??= "";
      return foundry.applications.fields.createSelectInput(config);
    }

    // One of several options for element type
    switch ( config.elementType ?? "input" ) {
      case "input":
        return foundry.applications.fields.createTextInput(config);
      case "textarea":
        return foundry.applications.fields.createTextareaInput(config);
      case "file-picker":
        return foundry.applications.elements.HTMLFilePickerElement.create(config);
      case "prose-mirror":
        return foundry.applications.elements.HTMLProseMirrorElement.create(config);
      case "code-mirror":
        return foundry.applications.elements.HTMLCodeMirrorElement.create(config);
      default:
        throw new Error(`Unrecognized element type for StringField input: ${config.elementType}`);
    }
  }
}

/* ---------------------------------------- */

/**
 * A subclass of DataField which deals with object-typed data.
 */
class ObjectField extends DataField {

  /** @inheritdoc */
  static get _defaults() {
    return Object.assign(super._defaults, {required: true, nullable: false});
  }

  /* -------------------------------------------- */

  /** @override */
  getInitialValue(data) {
    const initial = super.getInitialValue(data);
    if ( this.required && (initial === undefined) ) return {};
    return initial;
  }

  /* -------------------------------------------- */

  /** @override */
  _cast(value) {
    if ( value.toObject instanceof Function ) value = value.toObject();
    return getType(value) === "Object" ? value : {};
  }

  /** @override */
  initialize(value, model, options={}) {
    if ( !value ) return value;
    return deepClone(value);
  }

  /* ---------------------------------------- */

  /** @override */
  _updateDiff(source, key, value, difference, options) {

    // {} -> {}, null -> {}, undefined -> {}
    if ( (getType(value) === "Object") && (options.recursive !== false) ) {
      if ( getType(source[key]) !== "Object" ) source[key] = {};
      const diff = diffObject(source[key], value, {deletionKeys: true});
      if ( isEmpty(diff) ) return;
      difference[key] = diff;
      mergeObject(source[key], value, {insertKeys: true, insertValues: true, performDeletions: true});
    }

    // {} -> null or {} -> undefined
    else super._updateDiff(source, key, applySpecialKeys(value), difference, options);
  }

  /* ---------------------------------------- */

  /** @inheritDoc */
  _updateCommit(source, key, value, diff, options) {
    const s = source[key];

    // Special Cases: * -> undefined, * -> null, undefined -> *, null -> *
    if ( !s || !value || Object.isSealed(s) ) {
      source[key] = value;
      return;
    }

    for ( const k of Object.keys(s) ) {
      if ( !(k in value) ) delete s[k];
    }
    Object.assign(s, value);
  }

  /* ---------------------------------------- */

  /** @override */
  toObject(value) {
    return deepClone(value);
  }

  /** @override */
  _validateType(value, options={}) {
    if ( getType(value) !== "Object" ) throw new Error("must be an object");
  }
}

/* -------------------------------------------- */

/**
 * A subclass of ObjectField that represents a mapping of keys to the provided DataField type.
 */
export class TypedObjectField extends ObjectField {
  /**
   * @param {DataField} element             The value type of each entry in this object.
   * @param {DataFieldOptions} [options]    Options which configure the behavior of the field.
   * @param {DataFieldContext} [context]    Additional context which describes the field
   */
  constructor(element, options, context) {
    super(options, context);
    if ( !(element instanceof DataField) ) throw new Error("The element must be a DataField");
    if ( element.parent !== undefined ) throw new Error("The element DataField already has a parent");
    element.name ||= "element";
    element.parent = this;
    this.element = element;
  }

  /* -------------------------------------------- */

  /**
   * The value type of each entry in this object.
   * @type {DataField}
   */
  element;

  /* -------------------------------------------- */

  /** @override */
  static recursive = true;

  /* -------------------------------------------- */

  /** @inheritDoc */
  static get _defaults() {
    return mergeObject(super._defaults, {validateKey: undefined});
  }

  /* -------------------------------------------- */

  /** @override */
  _cleanType(data, options) {
    options.source = options.source || data;
    for ( const key in data ) {
      const isDeletion = isDeletionKey(key);
      const k = isDeletion ? key.slice(2) : key;
      if ( this.validateKey?.(k) === false ) {
        delete data[key];
        continue;
      }
      if ( isDeletion && (key[0] === "-") ) continue;
      data[key] = this.element.clean(data[key], options);
    }
    return data;
  }

  /* -------------------------------------------- */

  /** @override */
  _validateType(data, options={}) {
    if ( foundry.utils.getType(data) !== "Object" ) throw new Error("must be an object");
    options.source = options.source || data;
    const mappingFailure = new DataModelValidationFailure();
    for ( const key in data ) {
      if ( key.startsWith("-=") ) continue;

      // Validate the field's current value
      const value = data[key];
      const failure = this.element.validate(value, options);

      // Failure may be permitted if fallback replacement is allowed
      if ( failure ) {
        mappingFailure.fields[key] = failure;

        // If the field internally applied fallback logic
        if ( !failure.unresolved ) continue;

        // If fallback is allowed at the object level
        if ( options.fallback && !key.startsWith("==") ) {
          const initial = this.element.getInitialValue(options.source);
          if ( this.element.validate(initial, {source: options.source}) === undefined ) {  // Ensure initial is valid
            data[key] = initial;
            failure.fallback = initial;
            failure.unresolved = false;
          }
          else failure.unresolved = mappingFailure.unresolved = true;
        }

        // Otherwise the field-level failure is unresolved
        else failure.unresolved = mappingFailure.unresolved = true;
      }
    }
    if ( !foundry.utils.isEmpty(mappingFailure.fields) ) return mappingFailure;
  }

  /* -------------------------------------------- */

  /** @override */
  _validateModel(changes, options={}) {
    options.source = options.source || changes;
    if ( !changes ) return;
    for ( const key in changes ) {
      const change = changes[key];  // May be nullish
      if ( change && this.element.constructor.recursive ) this.element._validateModel(change, options);
    }
  }

  /* -------------------------------------------- */

  /** @override */
  initialize(value, model, options={}) {
    const object = {};
    for ( const key in value ) object[key] = this.element.initialize(value[key], model, options);
    return object;
  }

  /* -------------------------------------------- */

  /** @override */
  _updateDiff(source, key, value, difference, options) {

    // * -> undefined, or * -> null
    if ( (value === undefined) || (value === null) || (options.recursive === false) ) {
      super._updateDiff(source, key, value, difference, options);
      return;
    }

    // {} -> {}, undefined -> {}, or null -> {}
    source[key] ||= {};
    value ||= {};
    source = source[key];
    const schemaDiff = difference[key] = {};
    for ( const [k, v] of Object.entries(value) ) {
      let name = k;
      const specialKey = isDeletionKey(k);
      if ( specialKey ) name = k.slice(2);

      // Special operations for deletion or forced replacement
      if ( specialKey ) {
        if ( k[0] === "-" ) {
          if ( v !== null ) throw new Error("Removing a key using the -= deletion syntax requires the value of that"
            + " deletion key to be null, for example {-=key: null}");
          if ( name in source ) {
            schemaDiff[k] = v;
            delete source[name];
          }
        }
        else if ( k[0] === "=" ) schemaDiff[k] = source[name] = applySpecialKeys(v);
        continue;
      }

      // Perform type-specific update
      this.element._updateDiff(source, k, v, schemaDiff, options);
    }

    // No updates applied
    if ( isEmpty(schemaDiff) ) delete difference[key];
  }

  /* -------------------------------------------- */

  /** @override */
  _updateCommit(source, key, value, diff, options) {
    const s = source[key];

    // Special Cases: * -> undefined, * -> null, undefined -> *, null -> *
    if ( !s || !value || Object.isSealed(s) ) {
      source[key] = value;
      return;
    }

    // Remove keys which no longer exist in the new value
    for ( const k of Object.keys(s) ) {
      if ( !(k in value) ) delete s[k];
    }

    // Update fields in source which changed in the diff
    for ( let [k, d] of Object.entries(diff) ) {
      if ( isDeletionKey(k) ) {
        if ( k[0] === "-" ) continue;
        k = k.slice(2);
      }
      this.element._updateCommit(s, k, value[k], d, options);
    }
  }

  /* -------------------------------------------- */

  /** @override */
  toObject(value) {
    if ( (value === undefined) || (value === null) ) return value;
    const object = {};
    for ( const key in value ) object[key] = this.element.toObject(value[key]);
    return object;
  }

  /* -------------------------------------------- */

  /** @override */
  apply(fn, data={}, options={}) {

    // Apply to this TypedObjectField
    const thisFn = typeof fn === "string" ? this[fn] : fn;
    thisFn?.call(this, data, options);

    // Recursively apply to inner fields
    const results = {};
    for ( const key in data ) {
      const r = this.element.apply(fn, data[key], options);
      if ( !options.filter || !isEmpty(r) ) results[key] = r;
    }
    return results;
  }

  /* -------------------------------------------- */

  /** @override */
  _addTypes(source, changes, options={}) {
    if ( (getType(source) !== "Object") || (getType(changes) !== "Object") ) return;
    for ( const key in changes ) this.element._addTypes(source[key], changes[key], options);
  }

  /* -------------------------------------------- */

  /** @override */
  _getField(path) {
    if ( path.length === 0 ) return this;
    if ( path.shift() !== this.element.name ) return undefined;
    return this.element._getField(path);
  }

  /* -------------------------------------------- */

  /**
   * Migrate this field's candidate source data.
   * @param {object} sourceData   Candidate source data of the root model
   * @param {any} fieldData       The value of this field within the source data
   */
  migrateSource(sourceData, fieldData) {
    if ( !(this.element.migrateSource instanceof Function) ) return;
    if ( getType(fieldData) !== "Object" ) return;
    for ( const key in fieldData ) {
      if ( key.startsWith("-=") ) continue;
      this.element.migrateSource(sourceData, fieldData[key]);
    }
  }
}

/* -------------------------------------------- */

/**
 * A subclass of {@link foundry.data.fields.DataField} which deals with array-typed data.
 * @template [ElementType=DataField]
 * @property {number} min     The minimum number of elements.
 * @property {number} max     The maximum number of elements.
 */
class ArrayField extends DataField {
  /**
   * @param {ElementType} element          The type of element contained in the Array
   * @param {ArrayFieldOptions} [options]  Options which configure the behavior of the field
   * @param {DataFieldContext} [context]   Additional context which describes the field
   */
  constructor(element, options={}, context={}) {
    super(options, context);
    this.element = this.constructor._validateElementType(element);
    if ( this.element instanceof DataField ) {
      this.element.name ||= "element";
      this.element.parent = this;
    }
    if ( this.min > this.max ) throw new Error("ArrayField minimum length cannot exceed maximum length");
  }

  /* ---------------------------------------- */

  /**
   * The data type of each element in this array
   * @type {ElementType}
   */
  element;

  /* ---------------------------------------- */

  /** @inheritdoc */
  static get _defaults() {
    return Object.assign(super._defaults, {
      required: true,
      nullable: false,
      empty: true,
      exact: undefined,
      min: 0,
      max: Infinity
    });
  }

  /* ---------------------------------------- */

  /** @override */
  static recursive = true;

  /* ---------------------------------------- */

  /**
   * Validate the contained element type of the ArrayField
   * @param {*} element        The type of Array element
   * @returns {ElementType}    The validated element type
   * @throws                   An error if the element is not a valid type
   * @protected
   */
  static _validateElementType(element) {
    if ( !(element instanceof DataField) ) {
      throw new Error(`${this.name} must have a DataField as its contained element`);
    }
    if ( element.parent !== undefined ) throw new Error("The element DataField already has a parent");
    return element;
  }

  /* -------------------------------------------- */

  /** @override */
  getInitialValue(data) {
    const initial = super.getInitialValue(data);
    if ( this.required && (initial === undefined) ) return [];
    return initial;
  }

  /* ---------------------------------------- */

  /** @override */
  _validateModel(changes, options) {
    if ( !this.element.constructor.recursive ) return;
    for ( const element of changes ) {
      this.element._validateModel(element, options);
    }
  }

  /* ---------------------------------------- */

  /** @override */
  _cast(value) {
    const t = getType(value);
    if ( t === "Object" ) {
      const arr = [];
      for ( const [k, v] of Object.entries(value) ) {
        const i = Number(k);
        if ( Number.isInteger(i) && (i >= 0) ) arr[i] = v;
      }
      return arr;
    }
    else if ( t === "Set" ) return Array.from(value);
    return value instanceof Array ? value : [value];
  }

  /** @override */
  _cleanType(value, options) {
    // Force partial as false for array cleaning. Arrays are updated by replacing the entire array, so partial data
    // must be initialized.
    return value.map(v => this.element.clean(v, { ...options, partial: false }));
  }

  /** @override */
  _validateType(value, options={}) {
    if ( !(value instanceof Array) ) throw new Error("must be an Array");
    if ( value.length < this.min ) throw new Error(`cannot have fewer than ${this.min} elements`);
    if ( value.length > this.max ) throw new Error(`cannot have more than ${this.max} elements`);
    return this._validateElements(value, options);
  }

  /**
   * Validate every element of the ArrayField
   * @param {Array} value                         The array to validate
   * @param {DataFieldValidationOptions} options  Validation options
   * @returns {DataModelValidationFailure|void}   A validation failure if any of the elements failed validation,
   *                                              otherwise void.
   * @protected
   */
  _validateElements(value, options) {
    const arrayFailure = new DataModelValidationFailure();
    for ( let i=0; i<value.length; i++ ) {
      // Force partial as false for array validation. Arrays are updated by replacing the entire array, so there cannot
      // be partial data in the elements.
      const failure = this._validateElement(value[i], { ...options, partial: false });
      if ( failure ) {
        arrayFailure.elements.push({id: i, failure});
        arrayFailure.unresolved ||= failure.unresolved;
      }
    }
    if ( arrayFailure.elements.length ) return arrayFailure;
  }

  /**
   * Validate a single element of the ArrayField.
   * @param {*} value                       The value of the array element
   * @param {DataFieldValidationOptions} options  Validation options
   * @returns {DataModelValidationFailure}  A validation failure if the element failed validation
   * @protected
   */
  _validateElement(value, options) {
    return this.element.validate(value, options);
  }

  /** @override */
  initialize(value, model, options={}) {
    if ( !value ) return value;
    return value.map(v => this.element.initialize(v, model, options));
  }

  /* ---------------------------------------- */

  /** @override */
  _updateDiff(source, key, value, difference, options) {
    const current = source[key];
    value = applySpecialKeys(value);
    if ( (value === current) || value?.equals(current) ) return;
    source[key] = value;
    difference[key] = deepClone(value);
  }

  /* ---------------------------------------- */

  /**
   * Commit array field changes by replacing array contents while preserving the array reference itself.
   * @override
   */
  _updateCommit(source, key, value, diff, options) {
    const s = source[key];

    // Special Cases: * -> undefined, * -> null, undefined -> *, null -> *
    if ( !s || !value ) {
      source[key] = value;
      return;
    }

    s.length = 0;
    s.push(...value);
  }

  /* ---------------------------------------- */

  /** @override */
  toObject(value) {
    if ( !value ) return value;
    return value.map(v => this.element.toObject(v));
  }

  /** @override */
  apply(fn, value=[], options={}) {

    // Apply to this ArrayField
    const thisFn = typeof fn === "string" ? this[fn] : fn;
    thisFn?.call(this, value, options);
    if ( !Array.isArray(value) ) return value; // Do not recurse for non-array types

    // Recursively apply to array elements
    const results = [];
    if ( !value.length && options.initializeArrays ) value = [undefined];
    for ( const v of value ) {
      const r = this.element.apply(fn, v, options);
      if ( !options.filter || !isEmpty(r) ) results.push(r);
    }
    return results;
  }

  /** @override */
  _getField(path) {
    if ( path.length === 0 ) return this;
    if ( path.shift() !== this.element.name ) return undefined;
    return this.element._getField(path);
  }

  /**
   * Migrate this field's candidate source data.
   * @param {object} sourceData   Candidate source data of the root model
   * @param {any} fieldData       The value of this field within the source data
   */
  migrateSource(sourceData, fieldData) {
    if ( !(this.element.migrateSource instanceof Function) ) return;
    if ( getType(fieldData) !== "Array" ) return;
    for ( const entry of fieldData ) this.element.migrateSource(sourceData, entry);
  }

  /* -------------------------------------------- */
  /*  Active Effect Integration                   */
  /* -------------------------------------------- */

  /** @override */
  _castChangeDelta(raw) {
    let delta;
    try {
      delta = JSON.parse(raw);
      delta = Array.isArray(delta) ? delta : [delta];
    } catch(_err) {
      delta = [raw];
    }
    return delta.map(value => this.element._castChangeDelta(value));
  }

  /** @override */
  _applyChangeAdd(value, delta, model, change) {
    value.push(...delta);
    return value;
  }
}

/* -------------------------------------------- */
/*  Specialized Field Types                     */
/* -------------------------------------------- */

/**
 * A subclass of {@link foundry.data.fields.ArrayField} which supports a set of contained elements.
 * Elements in this set are treated as fungible and may be represented in any order or discarded if invalid.
 */
class SetField extends ArrayField {

  /** @override */
  _validateElements(value, options) {
    const setFailure = new DataModelValidationFailure();
    for ( let i=value.length-1; i>=0; i-- ) {  // Iterate backwards so we can splice as we go
      const failure = this._validateElement(value[i], options);
      if ( failure ) {
        setFailure.elements.unshift({id: i, failure});

        // The failure may have been internally resolved by fallback logic
        if ( !failure.unresolved && failure.fallback ) continue;

        // If fallback is allowed, remove invalid elements from the set
        if ( options.fallback ) {
          value.splice(i, 1);
          failure.dropped = true;
        }

        // Otherwise the set failure is unresolved
        else setFailure.unresolved = true;
      }
    }

    // Return a record of any failed set elements
    if ( setFailure.elements.length ) {
      if ( options.fallback && !setFailure.unresolved ) setFailure.fallback = value;
      return setFailure;
    }
  }

  /** @override */
  initialize(value, model, options={}) {
    if ( !value ) return value;
    return new Set(super.initialize(value, model, options));
  }

  /** @override */
  toObject(value) {
    if ( !value ) return value;
    return Array.from(value).map(v => this.element.toObject(v));
  }

  /* -------------------------------------------- */
  /*  Form Field Integration                      */
  /* -------------------------------------------- */

  /** @override */
  _toInput(config) {
    const element = this.element;

    // Document UUIDs
    if ( element instanceof DocumentUUIDField ) {
      Object.assign(config, {type: element.type, single: false});
      return foundry.applications.elements.HTMLDocumentTagsElement.create(config);
    }

    // Multi-Select Input
    if ( element.choices && !config.options ) {
      config.choices ??= element.choices;
      StringField._prepareChoiceConfig(config);
    }
    if ( config.options ) {
      if ( element instanceof NumberField ) mergeObject(config, {dataset: {dtype: "Number"}});
      return foundry.applications.fields.createMultiSelectInput(config);
    }

    // Arbitrary String Tags
    if ( element instanceof StringField ) return foundry.applications.elements.HTMLStringTagsElement.create(config);
    throw new Error(`SetField#toInput is not supported for a ${element.constructor.name} element type`);
  }

  /* -------------------------------------------- */
  /*  Active Effect Integration                   */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _castChangeDelta(raw) {
    return new Set(super._castChangeDelta(raw));
  }

  /** @override */
  _applyChangeAdd(value, delta, model, change) {
    for ( const element of delta ) value.add(element);
    return value;
  }
}

/* ---------------------------------------- */

/**
 * A subclass of {@link foundry.data.fields.SchemaField} which embeds some other DataModel definition as an inner
 * object.
 */
class EmbeddedDataField extends SchemaField {
  /**
   * @param {typeof DataModel} model          The class of DataModel which should be embedded in this field
   * @param {DataFieldOptions} [options]      Options which configure the behavior of the field
   * @param {DataFieldContext} [context]      Additional context which describes the field
   */
  constructor(model, options={}, context={}) {
    if ( !isSubclass(model, foundry.abstract.DataModel) ) {
      throw new Error("An EmbeddedDataField must specify a DataModel class as its type");
    }

    // Create an independent copy of the model schema
    const fields = model.defineSchema();
    super(fields, options, context);

    /**
     * The base DataModel definition which is contained in this field.
     * @type {typeof DataModel}
     */
    this.model = model;
  }

  /** @inheritdoc */
  clean(value, options) {
    return super.clean(value, {...options, source: value});
  }

  /** @override */
  _cast(value) {
    if ( value.toObject instanceof Function ) value = value.toObject();
    return getType(value) === "Object" ? value : {};
  }

  /** @inheritdoc */
  validate(value, options) {
    return super.validate(value, {...options, source: value});
  }

  /** @override */
  initialize(value, model, options={}) {
    if ( !value ) return value;
    // FIXME it should be unnecessary to construct a new instance of the model every time we initialize.
    const m = new this.model(value, {parent: model, ...options});
    Object.defineProperty(m, "schema", {value: this});
    return m;
  }

  /** @override */
  toObject(value) {
    if ( !value ) return value;
    return value.toObject(false);
  }

  /** @override */
  migrateSource(sourceData, fieldData) {
    if ( getType(fieldData) !== "Object" ) return;
    this.model.migrateDataSafe(fieldData);
  }

  /** @override */
  _validateModel(changes, options) {
    this.model.validateJoint(changes);
  }
}

/* ---------------------------------------- */

/**
 * A subclass of {@link foundry.data.fields.ArrayField} which supports an embedded Document collection.
 * Invalid elements will be dropped from the collection during validation rather than failing for the field entirely.
 * @extends {ArrayField<typeof Document>}
 */
class EmbeddedCollectionField extends ArrayField {
  /**
   * @param {typeof Document} element     The type of Document which belongs to this embedded collection
   * @param {DataFieldOptions} [options]  Options which configure the behavior of the field
   * @param {DataFieldContext} [context]  Additional context which describes the field
   */
  constructor(element, options={}, context={}) {
    super(element, options, context);
    this.readonly = true; // Embedded collections are always immutable
  }

  /** @override */
  static _validateElementType(element) {
    if ( isSubclass(element, foundry.abstract.Document) ) return element;
    throw new Error("An EmbeddedCollectionField must specify a Document subclass as its type");
  }

  /**
   * The Collection implementation to use when initializing the collection.
   * @type {typeof EmbeddedCollection}
   */
  static get implementation() {
    return EmbeddedCollection;
  }

  /** @override */
  static hierarchical = true;

  /**
   * A reference to the DataModel subclass of the embedded document element
   * @type {typeof Document}
   */
  get model() {
    return this.element.implementation;
  }

  /**
   * The DataSchema of the contained Document model.
   * @type {SchemaField}
   */
  get schema() {
    return this.model.schema;
  }

  /** @inheritDoc */
  _cast(value) {
    if ( getType(value) !== "Map" ) return super._cast(value);
    const arr = [];
    for ( const [id, v] of value.entries() ) {
      if ( !("_id" in v) ) v._id = id;
      arr.push(v);
    }
    return super._cast(arr);
  }

  /* -------------------------------------------- */

  /** @override */
  _cleanType(value, options={}) {
    if ( options.recursive === false ) options = {...options, partial: false};
    return value.map(v => this._cleanElement(v, options));
  }

  /* -------------------------------------------- */

  /**
   * Clean data for an individual element in the collection.
   * @param {object} value      Unclean data for the candidate embedded record
   * @param {object} options    Options which control how data is cleaned
   * @returns {object}          Cleaned data for the candidate embedded record
   * @protected
   */
  _cleanElement(value, options={}) {
    if ( !options.partial ) value._id ||= randomID(16); // Should this be left to the server side?
    return this.schema.clean(value, {...options, source: value});
  }

  /* -------------------------------------------- */

  /** @override */
  _validateElements(value, options) {
    const collectionFailure = new DataModelValidationFailure();
    for ( const v of value ) {
      const failure = this.schema.validate(v, {...options, source: v});
      if ( failure && !options.dropInvalidEmbedded ) {
        collectionFailure.elements.push({id: v._id, name: v.name, failure});
        collectionFailure.unresolved ||= failure.unresolved;
      }
    }
    if ( collectionFailure.elements.length ) return collectionFailure;
  }

  /* -------------------------------------------- */

  /** @override */
  initialize(value, model, options={}) {
    const collection = model.collections[this.name];
    collection.initialize(options);
    return collection;
  }

  /* -------------------------------------------- */

  /**
   * Dry-run an update of an EmbeddedCollection, modifying the contents of the safe copy of the source data.
   * @override
   */
  _updateDiff(source, key, value, difference, options) {
    if ( !Array.isArray(value) ) return;

    // Non-recursive updates replace the entire array
    if ( options.recursive === false ) {
      value = applySpecialKeys(value);
      source[key] = value;
      difference[key] = deepClone(value);
      return;
    }

    // Otherwise create or diff individual array members
    const sourceIdMap = {};
    for ( const obj of source[key] ?? [] ) sourceIdMap[obj._id] = obj;
    const diffArray = difference[key] = [];
    for ( const v of value ) {

      // Get the diff for each existing record
      const existing = sourceIdMap[v._id];
      if ( existing ) {
        const elementDiff = {};
        const typeChanged = "type" in v;
        this.schema._addTypes(existing, v);
        this.schema._updateDiff({_source: existing}, "_source", v, elementDiff, options);
        const d = elementDiff._source || {};
        if ( !isEmpty(d) ) {
          d._id = v._id;
          diffArray.push(d);
        }
        if ( !typeChanged ) delete v.type;
      }

      // Create new records using cleaned data
      else {
        const created = this._cleanElement(applySpecialKeys(v), {partial: false});
        source[key].push(created);
        diffArray.push(created);
      }
    }
    if ( !diffArray.length ) delete difference[key];
  }

  /* -------------------------------------------- */

  /** @override */
  _updateCommit(source, key, value, diff, options) {
    const src = source[key];

    // Special Cases: * -> undefined, * -> null, undefined -> *, null -> *
    if ( !src || !value ) {
      source[key] = value;
      return;
    }

    // Map the existing source objects
    const existing = {};
    for ( const obj of src ) existing[obj._id] = obj;
    const changed = {};
    for ( const obj of diff ) changed[obj._id] = obj;

    // Reconstruct the source array, retaining object references
    src.length = 0;
    for ( const obj of value ) {
      const prior = existing[obj._id];
      if ( prior ) {
        const d = changed[obj._id];
        if ( d ) this.schema._updateCommit({_source: prior}, "_source", obj, d, options);
        src.push(prior);
      }
      else src.push(obj);
    }
  }

  /* -------------------------------------------- */

  /** @override */
  toObject(value) {
    return value.toObject(false);
  }

  /** @override */
  apply(fn, value=[], options={}) {

    // Include this field in the options since it's not introspectable from the SchemaField
    options = {...options, collection: this};

    // Apply to this EmbeddedCollectionField
    const thisFn = typeof fn === "string" ? this[fn] : fn;
    thisFn?.call(this, value, options);

    // Recursively apply to inner fields
    const results = [];
    if ( !value.length && options.initializeArrays ) value = [undefined];
    for ( const v of value ) {
      const r = this.schema.apply(fn, v, options);
      if ( !options.filter || !isEmpty(r) ) results.push(r);
    }
    return results;
  }

  /**
   * Migrate this field's candidate source data.
   * @param {object} sourceData   Candidate source data of the root model
   * @param {any} fieldData       The value of this field within the source data
   */
  migrateSource(sourceData, fieldData) {
    if ( !Array.isArray(fieldData) ) return;
    for ( const entry of fieldData ) {
      if ( getType(entry) !== "Object" ) continue;
      this.model.migrateDataSafe(entry);
    }
  }

  /* -------------------------------------------- */
  /*  Embedded Document Operations                */
  /* -------------------------------------------- */

  /**
   * Return the embedded document(s) as a Collection.
   * @param {Document} parent  The parent document.
   * @returns {DocumentCollection}
   */
  getCollection(parent) {
    return parent[this.name];
  }
}

/* -------------------------------------------- */

/**
 * A subclass of {@link foundry.data.fields.EmbeddedCollectionField} which manages a collection of delta objects
 * relative to another collection.
 */
class EmbeddedCollectionDeltaField extends EmbeddedCollectionField {
  /** @override */
  static get implementation() {
    return EmbeddedCollectionDelta;
  }

  /* -------------------------------------------- */

  /** @override */
  _cleanElement(value, options={}) {
    const schema = value._tombstone ? foundry.data.TombstoneData.schema : this.schema;
    if ( !value._tombstone && !options.partial ) value._id ||= randomID(16); // Should this be left to the server side?
    return schema.clean(value, {...options, source: value});
  }

  /* -------------------------------------------- */

  /** @override */
  _validateElements(value, options) {
    const collectionFailure = new DataModelValidationFailure();
    for ( const v of value ) {
      const validationOptions = {...options, source: v};
      const schema = v._tombstone ? foundry.data.TombstoneData.schema : this.schema;
      const failure = schema.validate(v, validationOptions);
      if ( failure && !options.dropInvalidEmbedded ) {
        collectionFailure.elements.push({id: v._id, name: v.name, failure});
        collectionFailure.unresolved ||= failure.unresolved;
      }
    }
    if ( collectionFailure.elements.length ) return collectionFailure;
  }
}

/* -------------------------------------------- */

/**
 * A subclass of {@link foundry.data.fields.EmbeddedDataField} which supports a single embedded Document.
 */
class EmbeddedDocumentField extends EmbeddedDataField {
  /**
   * @param {typeof Document} model       The type of Document which is embedded.
   * @param {DataFieldOptions} [options]  Options which configure the behavior of the field.
   * @param {DataFieldContext} [context]  Additional context which describes the field
   */
  constructor(model, options={}, context={}) {
    if ( !isSubclass(model, foundry.abstract.Document) ) {
      throw new Error("An EmbeddedDocumentField must specify a Document subclass as its type.");
    }
    super(model.implementation, options, context);
  }

  /** @inheritdoc */
  static get _defaults() {
    return Object.assign(super._defaults, {nullable: true});
  }

  /** @override */
  static hierarchical = true;

  /** @override */
  initialize(value, model, options={}) {
    if ( !value ) return value;
    if ( model[this.name] ) {
      model[this.name]._initialize(options);
      return model[this.name];
    }
    const m = new this.model(value, {...options, parent: model, parentCollection: this.name});
    Object.defineProperty(m, "schema", {value: this});
    return m;
  }

  /* -------------------------------------------- */
  /*  Embedded Document Operations                */
  /* -------------------------------------------- */

  /**
   * Return the embedded document(s) as a Collection.
   * @param {Document} parent  The parent document.
   * @returns {Collection<string, Document>}
   */
  getCollection(parent) {
    const collection = new SingletonEmbeddedCollection(this.name, parent, []);
    const doc = parent[this.name];
    if ( !doc ) return collection;
    collection.set(doc.id, doc);
    return collection;
  }
}

/* -------------------------------------------- */
/*  Special Field Types                         */
/* -------------------------------------------- */

/**
 * A subclass of {@link foundry.data.fields.StringField} which provides the primary _id for a Document.
 * The field may be initially null, but it must be non-null when it is saved to the database.
 */
class DocumentIdField extends StringField {

  /** @inheritdoc */
  static get _defaults() {
    return Object.assign(super._defaults, {
      required: true,
      blank: false,
      nullable: true,
      readonly: true,
      validationError: "is not a valid Document ID string"
    });
  }

  /** @override */
  _cast(value) {
    if ( value instanceof foundry.abstract.Document ) return value._id;
    else return String(value);
  }

  /** @override */
  _validateType(value, options) {
    if ( !isValidId(value) ) throw new Error("must be a valid 16-character alphanumeric ID");
  }
}

/* ---------------------------------------- */

/**
 * A subclass of {@link foundry.data.fields.StringField} which supports referencing some other Document by its UUID.
 * This field may not be blank, but may be null to indicate that no UUID is referenced.
 */
class DocumentUUIDField extends StringField {
  /**
   * @param {DocumentUUIDFieldOptions} [options] Options which configure the behavior of the field
   * @param {DataFieldContext} [context]    Additional context which describes the field
   */
  constructor(options, context) {
    super(options, context);
  }

  /** @inheritdoc */
  static get _defaults() {
    return Object.assign(super._defaults, {
      required: true,
      blank: false,
      nullable: true,
      initial: null,
      type: undefined,
      embedded: undefined
    });
  }

  /** @override */
  _validateType(value) {
    const p = parseUuid(value);
    if ( this.type ) {
      if ( p.type !== this.type ) throw new Error(`Invalid document type "${p.type}" which must be a "${this.type}"`);
    }
    else if ( p.type && !ALL_DOCUMENT_TYPES.includes(p.type) ) throw new Error(`Invalid document type "${p.type}"`);
    if ( (this.embedded === true) && !p.embedded.length ) throw new Error("must be an embedded document");
    if ( (this.embedded === false) && p.embedded.length ) throw new Error("may not be an embedded document");
    if ( !isValidId(p.documentId) ) throw new Error(`Invalid document ID "${p.documentId}"`);
  }

  /* -------------------------------------------- */
  /*  Form Field Integration                      */
  /* -------------------------------------------- */

  /** @override */
  _toInput(config) {
    Object.assign(config, {type: this.type, single: true});
    return foundry.applications.elements.HTMLDocumentTagsElement.create(config);
  }
}

/* ---------------------------------------- */

/**
 * A special class of {@link foundry.data.fields.StringField} field which references another DataModel by its id.
 * This field may also be null to indicate that no foreign model is linked.
 */
class ForeignDocumentField extends DocumentIdField {
  /**
   * @param {typeof Document} model  The foreign DataModel class definition which this field links to
   * @param {StringFieldOptions} [options]    Options which configure the behavior of the field
   * @param {DataFieldContext} [context]      Additional context which describes the field
   */
  constructor(model, options={}, context={}) {
    super(options, context);
    if ( !isSubclass(model, foundry.abstract.DataModel) ) {
      throw new Error("A ForeignDocumentField must specify a DataModel subclass as its type");
    }
    /**
     * A reference to the model class which is stored in this field
     * @type {typeof Document}
     */
    this.model = model;
  }

  /** @inheritdoc */
  static get _defaults() {
    return Object.assign(super._defaults, {nullable: true, readonly: false, idOnly: false});
  }

  /** @override */
  _cast(value) {
    if ( typeof value === "string" ) return value;
    if ( (value instanceof this.model) ) return value._id;
    throw new Error(`The value provided to a ForeignDocumentField must be a ${this.model.name} instance.`);
  }

  /** @inheritdoc */
  initialize(value, model, options={}) {
    if ( this.idOnly ) return value;
    if ( model?.pack && !foundry.utils.isSubclass(this.model, foundry.documents.BaseFolder) ) return null;
    if ( !game.collections ) return value; // Server-side
    return () => this.model?.get(value, {pack: model?.pack, ...options}) ?? null;
  }

  /** @inheritdoc */
  toObject(value) {
    return value?._id ?? value;
  }

  /* -------------------------------------------- */
  /*  Form Field Integration                      */
  /* -------------------------------------------- */

  /** @override */
  _toInput(config) {
    config.choices ??= this.choices;

    // Prepare passed choices
    StringField._prepareChoiceConfig(config);

    // Prepare visible Document instances as options
    const collection = game.collections.get(this.model.documentName);
    if ( collection && !config.options ) {
      const current = collection.get(config.value);
      let hasCurrent = false;
      const options = collection.reduce((arr, doc) => {
        if ( !doc.visible ) return arr;
        if ( doc === current ) hasCurrent = true;
        arr.push({value: doc.id, label: doc.name});
        return arr;
      }, []);
      if ( current && !hasCurrent ) options.unshift({value: config.value, label: current.name});
      config.options = options;
    }

    // Allow blank
    if ( !this.required || this.nullable ) config.blank ??= "";

    // Create select input
    return foundry.applications.fields.createSelectInput(config);
  }
}

/* -------------------------------------------- */

/**
 * A special {@link foundry.data.fields.StringField} which records a standardized CSS color string.
 */
class ColorField extends StringField {

  /** @inheritdoc */
  static get _defaults() {
    return Object.assign(super._defaults, {nullable: true, initial: null, blank: false});
  }

  /** @override */
  initialize(value, model, options={}) {
    if ( (value === null) || (value === undefined) ) return value;
    return Color.from(value);
  }

  /** @override */
  _cast(value) {
    return Color.from(value).css;
  }

  /** @inheritdoc */
  _validateType(value, options) {
    if ( !isColorString(value) ) throw new Error("must be a valid color string");
    return super._validateType(value, options);
  }

  /* -------------------------------------------- */
  /*  Form Field Integration                      */
  /* -------------------------------------------- */

  /** @override */
  _toInput(config) {
    if ( (config.placeholder === undefined) && !this.nullable && !(this.initial instanceof Function) ) {
      config.placeholder = this.initial;
    }
    return foundry.applications.elements.HTMLColorPickerElement.create(config);
  }
}

/* -------------------------------------------- */

/**
 * A special {@link foundry.data.fields.StringField} which records a file path or inline base64 data.
 *
 * When using the `FilePathField` in a data model that is persisted to the database, for example a Document sub-type, it is essential to declare this field in the package manifest so that it receives proper server-side validation of its contents.
 * See {@link foundry.packages.types.ServerSanitizationFields} for information about this structure.
 *
 * @property {string[]} categories      A set of categories in CONST.FILE_CATEGORIES which this field supports
 * @property {boolean} base64=false     Is embedded base64 data supported in lieu of a file path?
 * @property {boolean} texture=false    Does the file path field allow specifying a virtual file path which must begin
 *                                      with the "#" character?
 * @property {boolean} wildcard=false   Does this file path field allow wildcard characters?
 */
class FilePathField extends StringField {
  /**
   * @param {FilePathFieldOptions} [options]  Options which configure the behavior of the field
   * @param {DataFieldContext} [context]      Additional context which describes the field
   */
  constructor(options={}, context={}) {
    super(options, context);
    if ( this.categories.includes("MEDIA") ) {
      foundry.utils.logCompatibilityWarning('The "MEDIA" file category is deprecated. '
        + "Use CONST.MEDIA_FILE_CATEGORIES instead.", {since: 13, until: 15, once: true});
      this.categories = Array.from(new Set(this.categories.filter(c => c !== "MEDIA").concat(CONST.MEDIA_FILE_CATEGORIES)));
      if ( "categories" in this.options ) this.options.categories = this.categories;
    }
    if ( !this.categories.length || this.categories.some(c => !(c in FILE_CATEGORIES)) ) {
      throw new Error("The categories of a FilePathField must be keys in CONST.FILE_CATEGORIES");
    }
  }

  /** @inheritdoc */
  static get _defaults() {
    return Object.assign(super._defaults, {
      categories: [],
      base64: false,
      wildcard: false,
      virtual: false,
      nullable: true,
      blank: false,
      initial: null
    });
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _validateType(value) {

    // Wildcard or virtual paths
    if ( this.virtual && (value[0] === "#") && value.length > 1 ) return true;
    if ( this.wildcard && value.includes("*") ) return true;

    // Allowed extension or base64
    const isValid = this.categories.some(c => {
      const category = FILE_CATEGORIES[c];
      if ( hasFileExtension(value, Object.keys(category)) ) return true;
      return isBase64Data(value, Object.values(category));
    });

    // Throw an error for invalid paths
    if ( !isValid ) {
      let err = "does not have a valid file extension";
      if ( this.base64 ) err += " or provide valid base64 data";
      throw new Error(err);
    }
  }

  /* -------------------------------------------- */
  /*  Form Field Integration                      */
  /* -------------------------------------------- */

  /** @override */
  _toInput(config) {
    // FIXME: This logic is fragile and would require a mapping between CONST.FILE_CATEGORIES and FilePicker.TYPES
    config.type = this.categories.length === 1 ? this.categories[0].toLowerCase() : "any";
    return foundry.applications.elements.HTMLFilePickerElement.create(config);
  }
}

/* -------------------------------------------- */

/**
 * A special {@link foundry.data.fields.NumberField} which represents an angle of rotation in degrees between 0 and 360.
 * @property {boolean} normalize Whether the angle should be normalized to [0,360) before being clamped to [0,360]. The
 *                               default is true.
 */
class AngleField extends NumberField {
  constructor(options={}, context={}) {
    super(options, context);
    if ( "base" in this.options ) this.base = this.options.base;
  }

  /** @inheritdoc */
  static get _defaults() {
    return Object.assign(super._defaults, {
      required: true,
      nullable: false,
      initial: 0,
      normalize: true,
      min: 0,
      max: 360,
      validationError: "is not a number between 0 and 360"
    });
  }

  /** @inheritdoc */
  _cast(value) {
    value = super._cast(value);
    if ( !this.normalize ) return value;
    value = Math.normalizeDegrees(value);
    /** @deprecated since v12 */
    if ( (this.#base === 360) && (value === 0) ) value = 360;
    return value;
  }

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  get base() {
    const msg = "The AngleField#base is deprecated in favor of AngleField#normalize.";
    foundry.utils.logCompatibilityWarning(msg, {since: 12, until: 14});
    return this.#base;
  }

  /**
   * @deprecated since v12
   * @ignore
   */
  set base(v) {
    const msg = "The AngleField#base is deprecated in favor of AngleField#normalize.";
    foundry.utils.logCompatibilityWarning(msg, {since: 12, until: 14});
    this.#base = v;
  }

  /**
   * @deprecated since v12
   * @ignore
   */
  #base = 0;
}

/* -------------------------------------------- */

/**
 * A special {@link foundry.data.fields.NumberField} represents a number between 0 and 1.
 */
class AlphaField extends NumberField {
  static get _defaults() {
    return Object.assign(super._defaults, {
      required: true,
      nullable: false,
      initial: 1,
      min: 0,
      max: 1,
      validationError: "is not a number between 0 and 1"
    });
  }
}

/* -------------------------------------------- */

/**
 * A special {@link foundry.data.fields.NumberField} represents a number between 0 (inclusive) and 1 (exclusive).
 * Its values are normalized (modulo 1) to the range [0, 1) instead of being clamped.
 */
class HueField extends NumberField {
  static get _defaults() {
    return Object.assign(super._defaults, {
      required: true,
      nullable: false,
      initial: 0,
      min: 0,
      max: 1,
      validationError: "is not a number between 0 (inclusive) and 1 (exclusive)"
    });
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _cast(value) {
    value = super._cast(value) % 1;
    if ( value < 0 ) value += 1;
    return value;
  }

  /* -------------------------------------------- */

  /** @override */
  _toInput(config) {
    return foundry.applications.elements.HTMLHueSelectorSlider.create(config);
  }
}

/* -------------------------------------------- */

/**
 * A special {@link foundry.data.fields.ForeignDocumentField} which defines the original author of a document.
 * This can only be changed later by GM users.
 */
class DocumentAuthorField extends ForeignDocumentField {

  /** @inheritdoc */
  static get _defaults() {
    return Object.assign(super._defaults, {
      nullable: false,
      gmOnly: true,
      label: "Author",
      initial: () => game.user?.id
    });
  }
}

/* -------------------------------------------- */

/**
 * A special {@link foundry.data.fields.ObjectField} which captures a mapping of User IDs to Document permission levels.
 */
class DocumentOwnershipField extends ObjectField {

  /** @inheritdoc */
  static get _defaults() {
    return Object.assign(super._defaults, {
      initial: {default: DOCUMENT_OWNERSHIP_LEVELS.NONE},
      validationError: "is not a mapping of user IDs and document permission levels",
      gmOnly: true
    });
  }

  /** @override */
  _validateType(value) {
    for ( const [k, v] of Object.entries(value) ) {
      if ( k.startsWith("-=") ) return isValidId(k.slice(2)) && (v === null);   // Allow removals
      if ( (k !== "default") && !isValidId(k) ) return false;
      if ( !Object.values(DOCUMENT_OWNERSHIP_LEVELS).includes(v) ) return false;
    }
  }
}

/* -------------------------------------------- */

/**
 * A special {@link foundry.data.fields.StringField} which contains serialized JSON data.
 */
class JSONField extends StringField {
  constructor(options, context) {
    super(options, context);
    this.blank = false;
    this.trim = false;
    this.choices = undefined;
  }

  /** @inheritdoc */
  static get _defaults() {
    return Object.assign(super._defaults, {
      blank: false,
      trim: false,
      initial: undefined,
      validationError: "is not a valid JSON string"
    });
  }

  /** @inheritdoc */
  clean(value, options) {
    if ( value === "" ) return '""';  // Special case for JSON fields
    return super.clean(value, options);
  }

  /** @override */
  _cast(value) {
    if ( (typeof value !== "string") || !isJSON(value) ) return JSON.stringify(value);
    return value;
  }

  /** @override */
  _validateType(value, options) {
    if ( (typeof value !== "string") || !isJSON(value) ) throw new Error("must be a serialized JSON string");
  }

  /** @override */
  initialize(value, model, options={}) {
    if ( (value === undefined) || (value === null) ) return value;
    return JSON.parse(value);
  }

  /** @override */
  toObject(value) {
    if ( (value === undefined) || (this.nullable && (value === null)) ) return value;
    return JSON.stringify(value);
  }

  /* -------------------------------------------- */
  /*  Form Field Integration                      */
  /* -------------------------------------------- */

  /**
   * @param {FormInputConfig & CodeMirrorInputConfig} config
   * @override
   */
  _toInput(config) {
    config.language = "json";
    config.indent ??= 2;
    config.value = foundry.data.validators.isJSON(config.value)
      ? JSON.stringify(JSON.parse(config.value), null, config.indent)
      : JSON.stringify(config.value, null, config.indent);
    return foundry.applications.elements.HTMLCodeMirrorElement.create(config);
  }
}

/* -------------------------------------------- */

/**
 * A special subclass of {@link foundry.data.fields.DataField} which can contain any value of any type.
 * Any input is accepted and is treated as valid.
 * It is not recommended to use this class except for very specific circumstances.
 */
class AnyField extends DataField {

  /** @override */
  _validateType(value) {
    return true;
  }
}


/* -------------------------------------------- */

/**
 * A subclass of {@link foundry.data.fields.StringField} which contains a sanitized HTML string.
 * This class does not override any StringField behaviors, but is used by the server-side to identify fields which
 * require sanitization of user input.
 *
 * When using the `HTMLField` in a data model that is persisted to the database, for example a Document sub-type, it is essential to declare this field in the package manifest so that it receives proper server-side validation of its contents.
 * See {@link foundry.packages.types.ServerSanitizationFields} for information about this structure.
 */
class HTMLField extends StringField {

  /** @inheritDoc */
  static get _defaults() {
    return Object.assign(super._defaults, {required: true, blank: true});
  }

  /** @inheritDoc */
  toFormGroup(groupConfig={}, inputConfig={}) {
    groupConfig.stacked ??= inputConfig.elementType !== "input";
    return super.toFormGroup(groupConfig, inputConfig);
  }

  /** @inheritDoc */
  _toInput(config) {
    config.elementType ??= "prose-mirror";
    return super._toInput(config);
  }
}

/* ---------------------------------------- */

/**
 * A subclass of {@link foundry.data.fields.NumberField} which is used for storing integer sort keys.
 */
class IntegerSortField extends NumberField {
  /** @inheritdoc */
  static get _defaults() {
    return Object.assign(super._defaults, {
      required: true,
      nullable: false,
      integer: true,
      initial: 0
    });
  }
}
/* ---------------------------------------- */

/**
 * A subclass of {@link foundry.data.fields.TypedObjectField} that is used specifically for the Document "flags" field.
 */
class DocumentFlagsField extends TypedObjectField {
  /**
   * @param {DataFieldOptions} [options]    Options which configure the behavior of the field
   * @param {DataFieldContext} [context]    Additional context which describes the field
   */
  constructor(options, context) {
    super(new ObjectField(), options, context);
  }

  /** @inheritdoc */
  static get _defaults() {
    return Object.assign(super._defaults, {validateKey: foundry.packages.BasePackage.validateId});
  }
}

/* ---------------------------------------- */

/**
 * A subclass of {@link foundry.data.fields.SchemaField} which stores document metadata in the _stats field.
 * @mixes DocumentStats
 */
class DocumentStatsField extends SchemaField {
  /**
   * @param {DataFieldOptions} [options]        Options which configure the behavior of the field
   * @param {DataFieldContext} [context]        Additional context which describes the field
   */
  constructor(options={}, context={}) {
    super({
      coreVersion: new StringField({required: true, blank: false, nullable: true, initial: () => game.release.version}),
      systemId: new StringField({required: true, blank: false, nullable: true, initial: () => game.system?.id ?? null}),
      systemVersion: new StringField({
        required: true,
        blank: false,
        nullable: true,
        initial: () => game.system?.version ?? null
      }),
      createdTime: new NumberField(),
      modifiedTime: new NumberField(),
      lastModifiedBy: new ForeignDocumentField(foundry.documents.BaseUser, {idOnly: true}),
      compendiumSource: new DocumentUUIDField(),
      duplicateSource: new DocumentUUIDField(),
      exportSource: new SchemaField({
        worldId: new StringField({required: true, blank: false, nullable: true}),
        uuid: new DocumentUUIDField({initial: undefined}),
        coreVersion: new StringField({required: true, blank: false, nullable: true}),
        systemId: new StringField({required: true, blank: false, nullable: true}),
        systemVersion: new StringField({required: true, blank: false, nullable: true})
      }, {nullable: true})
    }, options, context);
  }

  /**
   * All Document stats.
   * @type {string[]}
   */
  static fields = [
    "coreVersion", "systemId", "systemVersion", "createdTime", "modifiedTime", "lastModifiedBy", "compendiumSource",
    "duplicateSource", "exportSource"
  ];

  /**
   * These fields are managed by the server and are ignored if they appear in creation or update data.
   * @type {string[]}
   */
  static managedFields = ["coreVersion", "systemId", "systemVersion", "createdTime", "modifiedTime", "lastModifiedBy"];

  /* -------------------------------------------- */

  /**
   * Migrate deprecated core flags to `_stats` properties.
   * @param {typeof Document} document
   * @param {object} source
   * @internal
   */
  static _migrateData(document, source) {

    /**
     * Migrate flags.core.sourceId.
     * @deprecated since v12
     */
    document._addDataFieldMigration(source, "flags.core.sourceId", "_stats.compendiumSource");

    /**
     * Migrate flags.exportSource.
     * @deprecated since v13
     */
    if ( source.flags ) {
      document._addDataFieldMigration(source, "flags.exportSource", "_stats.exportSource", d => {
        const exportSource = foundry.utils.getProperty(d, "flags.exportSource");
        if ( !exportSource ) return null;
        return {
          worldId: exportSource.world ?? null,
          uuid: null,
          coreVersion: exportSource.coreVersion ?? null,
          systemId: exportSource.system ?? null,
          systemVersion: exportSource.systemVersion ?? null
        };
      });
    }
  }

  /* -------------------------------------------- */

  /**
   * Shim the deprecated core flag `exportSource` on Document source data.
   * @param {typeof Document} document
   * @param {object} source
   * @param {object} [options]
   * @internal
   */
  static _shimData(document, source, options) {
    if ( source.flags ) {
      /**
       * Shim flags.exportSource.
       * @deprecated since v13
       */
      Object.defineProperty(source.flags, "exportSource", {
        get: () => {
          document._logDataFieldMigration("flags.exportSource", "_stats.exportSource", {since: 13, until: 15});
          const exportSource = source._stats.exportSource;
          if ( !exportSource ) return undefined;
          return {
            world: exportSource.worldId,
            coreVersion: exportSource.coreVersion,
            system: exportSource.systemId,
            systemVersion: exportSource.systemVersion
          };
        },
        configurable: true,
        enumerable: false
      });
    }
  }

  /* -------------------------------------------- */

  /**
   * Shim the deprecated core flag `exportSource` on Documents.
   * @param {typeof Document} document
   * @internal
   */
  static _shimDocument(document) {
    /**
     * Shim flags.exportSource.
     * @deprecated since v13
     */
    Object.defineProperty(document.flags, "exportSource", {
      get: () => {
        document.constructor._logDataFieldMigration("flags.exportSource", "_stats.exportSource", {since: 13, until: 15});
        const exportSource = document._stats.exportSource;
        if ( !exportSource ) return undefined;
        return {
          world: exportSource.worldId,
          coreVersion: exportSource.coreVersion,
          system: exportSource.systemId,
          systemVersion: exportSource.systemVersion
        };
      },
      configurable: true,
      enumerable: false
    });
  }
}

/* ---------------------------------------- */

/**
 * A subclass of {@link foundry.data.fields.StringField} that is used specifically for the Document "type" field.
 */
class DocumentTypeField extends StringField {
  /**
   * @param {typeof Document} documentClass  The base document class which belongs in this field
   * @param {StringFieldOptions} [options]  Options which configure the behavior of the field
   * @param {DataFieldContext} [context]    Additional context which describes the field
   */
  constructor(documentClass, options={}, context={}) {
    options.choices = () => documentClass.TYPES;
    options.validationError = `is not a valid type for the ${documentClass.documentName} Document class`;
    super(options, context);
  }

  /** @inheritdoc */
  static get _defaults() {
    return Object.assign(super._defaults, {required: true, nullable: false, blank: false});
  }

  /** @override */
  _validateType(value, options) {
    if ( (typeof value !== "string") || !value ) throw new Error("must be a non-blank string");
    if ( this._isValidChoice(value) ) return true;
    // Allow unrecognized types if we are allowed to fallback (non-strict validation)
    if (options.fallback ) return true;
    throw new Error(`"${value}" ${this.options.validationError}`);
  }
}

/* ---------------------------------------- */

/**
 * A subclass of {@link foundry.data.fields.ObjectField} which supports a type-specific data object.
 */
class TypeDataField extends ObjectField {
  /**
   * @param {typeof Document} document      The base document class which belongs in this field
   * @param {DataFieldOptions} [options]    Options which configure the behavior of the field
   * @param {DataFieldContext} [context]    Additional context which describes the field
   */
  constructor(document, options={}, context={}) {
    super(options, context);
    /**
     * The canonical document name of the document type which belongs in this field
     * @type {typeof Document}
     */
    this.document = document;
  }

  /** @inheritdoc */
  static get _defaults() {
    return Object.assign(super._defaults, {required: true});
  }

  /** @override */
  static recursive = true;

  /**
   * Return the package that provides the sub-type for the given model.
   * @param {DataModel} model       The model instance created for this sub-type.
   * @returns {System|Module|null}
   */
  static getModelProvider(model) {
    const document = model.parent;
    if ( !document ) return null;
    const documentClass = document.constructor;
    const documentName = documentClass.documentName;
    const type = document.type;

    // Unrecognized type
    if ( !documentClass.TYPES.includes(type) ) return null;

    // Core-defined sub-type
    const coreTypes = documentClass.metadata.coreTypes;
    if ( coreTypes.includes(type) ) return null;

    // System-defined sub-type
    const systemTypes = game.system.documentTypes[documentName];
    if ( systemTypes && (type in systemTypes) ) return game.system;

    // Module-defined sub-type
    const moduleId = type.substring(0, type.indexOf("."));
    return game.modules.get(moduleId) ?? null;
  }

  /**
   * A convenience accessor for the name of the document type associated with this TypeDataField
   * @type {string}
   */
  get documentName() {
    return this.document.documentName;
  }

  /**
   * Get the DataModel definition that should be used for this type of document.
   * @param {string} type              The Document instance type
   * @returns {typeof DataModel|null}  The DataModel class or null
   */
  getModelForType(type) {
    if ( !type ) return null;
    return globalThis.CONFIG?.[this.documentName]?.dataModels?.[type] ?? null;
  }

  /** @override */
  getInitialValue(data) {
    const initial = super.getInitialValue(data); // ObjectField could return this.initial, undefined, null, or {}
    if ( getType(initial) === "Object" ) return this._cleanType(initial, {partial: false, source: data});
    return initial;
  }

  /** @override */
  _cleanType(value, options) {
    if ( !(typeof value === "object") ) value = {};

    // Use a defined DataModel
    const type = options.source?.type;
    const cls = this.getModelForType(type);
    if ( cls ) return cls.cleanData(value, {...options, source: value});
    if ( options.partial ) return value;

    // Use the defined template.json
    const template = game?.model[this.documentName]?.[type] || {};
    const insertKeys = (type === BASE_DOCUMENT_TYPE) || !game?.system?.strictDataCleaning;
    return mergeObject(template, value, {insertKeys, inplace: false});
  }

  /** @override */
  initialize(value, model, options={}) {
    const cls = this.getModelForType(model._source.type);
    if ( cls ) {
      const instance = new cls(value, {parent: model, ...options});
      if ( !("modelProvider" in instance) ) Object.defineProperty(instance, "modelProvider", {
        value: this.constructor.getModelProvider(instance),
        writable: false
      });
      return instance;
    }
    return deepClone(value);
  }

  /* ---------------------------------------- */

  /** @inheritDoc */
  _updateDiff(source, key, value, difference, options) {
    const cls = this.getModelForType(source.type);
    if ( cls ) cls.schema._updateDiff(source, key, value, difference, options);
    else super._updateDiff(source, key, value, difference, options);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _updateCommit(source, key, value, diff, options) {
    const cls = this.getModelForType(source.type);
    if ( cls ) cls.schema._updateCommit(source, key, value, diff, options);
    else super._updateCommit(source, key, value, diff, options);
  }

  /* ---------------------------------------- */

  /** @inheritdoc */
  _validateType(data, options={}) {
    const result = super._validateType(data, options);
    if ( result !== undefined ) return result;
    const cls = this.getModelForType(options.source?.type);
    const schema = cls?.schema;
    return schema?.validate(data, {...options, source: data});
  }

  /* ---------------------------------------- */

  /** @override */
  _validateModel(changes, options={}) {
    const cls = this.getModelForType(options.source?.type);
    return cls?.validateJoint(changes);
  }

  /* ---------------------------------------- */

  /** @override */
  toObject(value) {
    return value.toObject instanceof Function ? value.toObject(false) : deepClone(value);
  }

  /* -------------------------------------------- */

  /** @override */
  _addTypes(source, changes, options={}) {
    const cls = this.getModelForType(options.changes?.type ?? options.source?.type);
    cls?.schema._addTypes(source, changes, options);
  }

  /* -------------------------------------------- */

  /**
   * Migrate this field's candidate source data.
   * @param {object} sourceData   Candidate source data of the root model
   * @param {any} fieldData       The value of this field within the source data
   */
  migrateSource(sourceData, fieldData) {
    if ( getType(fieldData) !== "Object" ) return;
    const cls = this.getModelForType(sourceData.type);
    if ( cls ) cls.migrateDataSafe(fieldData);
  }
}

/* ---------------------------------------- */

/**
 * A subclass of {@link foundry.data.fields.DataField} that defines a union of schema-constrained objects discriminable
 * via a `type` property.
 */
class TypedSchemaField extends DataField {
  /**
   * @param {Record<string, DataSchema|SchemaField|typeof DataModel>} types The different types this field can represent
   * @param {DataFieldOptions} [options]                                    Options for configuring the field
   * @param {DataFieldContext} [context]                                    Additional context describing the field
   */
  constructor(types, options, context) {
    super(options, context);
    this.types = this.#configureTypes(types);
  }

  /* ---------------------------------------- */

  /** @inheritdoc */
  static get _defaults() {
    return Object.assign(super._defaults, {required: true});
  }

  /* ---------------------------------------- */

  /** @override */
  static recursive = true;

  /* ---------------------------------------- */

  /**
   * The types of this field.
   * @type {{[type: string]: SchemaField}}
   */
  types;

  /* -------------------------------------------- */

  /**
   * Initialize and validate the structure of the provided type definitions.
   * @param {{[type: string]: DataSchema|SchemaField|typeof DataModel}} types The provided field definitions
   * @returns {{[type: string]: SchemaField}}                                 The validated fields
   */
  #configureTypes(types) {
    if ( (typeof types !== "object") ) {
      throw new Error("A DataFields must be an object with string keys and DataField values.");
    }
    types = {...types};
    for ( let [type, field] of Object.entries(types) ) {
      if ( isSubclass(field, foundry.abstract.DataModel) ) field = new EmbeddedDataField(field, {name: type});
      if ( getType(field) === "Object" ) {
        const schema = {...field};
        if ( !("type" in schema) ) {
          schema.type = new StringField({required: true, blank: false, initial: type,
            validate: value => value === type, validationError: `must be equal to "${type}"`});
        }
        field = new SchemaField(schema, {name: type});
      }
      if ( !(field instanceof SchemaField) ) {
        throw new Error(`The "${type}" field is not an instance of the SchemaField class or a subclass of DataModel.`);
      }
      field.name ??= type;
      if ( field.name !== type ) throw new Error(`The name of the "${this.fieldPath}.${type}" field must be "${type}".`);
      if ( field.parent !== undefined ) {
        throw new Error(`The "${field.fieldPath}" field already belongs to some other parent and may not be reused.`);
      }
      types[type] = field;
      field.parent = this;
      if ( !field.required ) throw new Error(`The "${field.fieldPath}" field must be required.`);
      if ( field.nullable ) throw new Error(`The "${field.fieldPath}" field must not be nullable.`);
      const typeField = field.fields.type;
      if ( !(typeField instanceof StringField) ) throw new Error(`The "${field.fieldPath}" field must have a "type" StringField.`);
      if ( !typeField.required ) throw new Error(`The "${typeField.fieldPath}" field must be required.`);
      if ( typeField.nullable ) throw new Error(`The "${typeField.fieldPath}" field must not be nullable.`);
      if ( typeField.blank ) throw new Error(`The "${typeField.fieldPath}" field must not be blank.`);
      if ( typeField.validate(type, {fallback: false}) !== undefined ) throw new Error(`"${type}" must be a valid type of "${typeField.fieldPath}".`);
    }
    return types;
  }

  /* -------------------------------------------- */

  /**
   * Get the schema for the given type.
   * @param {*} type
   * @returns {SchemaField|void}
   */
  #getTypeSchema(type) {
    if ( typeof type !== "string" ) return;
    if ( !Object.hasOwn(this.types, type) ) return;
    return this.types[type];
  }

  /* ---------------------------------------- */

  /** @override */
  _getField(path) {
    if ( !path.length ) return this;
    return this.#getTypeSchema(path.shift())?._getField(path);
  }

  /* -------------------------------------------- */
  /*  Data Field Methods                          */
  /* -------------------------------------------- */

  /** @override */
  _cleanType(value, options) {
    const schema = this.#getTypeSchema(value?.type);
    if ( !schema ) return value;
    return schema.clean(value, options);
  }

  /* ---------------------------------------- */

  /** @override */
  _cast(value) {
    if ( value.toObject instanceof Function ) value = value.toObject();
    return getType(value) === "Object" ? value : {};
  }

  /* ---------------------------------------- */

  /** @override */
  _validateSpecial(value) {
    const result = super._validateSpecial(value);
    if ( result !== undefined ) return result;
    const schema = this.#getTypeSchema(value?.type);
    if ( !schema ) throw new Error("does not have a valid type");
  }

  /* ---------------------------------------- */

  /** @override */
  _validateType(value, options) {
    return this.types[value.type].validate(value, options);
  }

  /* ---------------------------------------- */

  /** @override */
  initialize(value, model, options) {
    const schema = this.#getTypeSchema(value?.type);
    if ( !schema ) return value;
    return schema.initialize(value, model, options);
  }

  /* ---------------------------------------- */

  /** @inheritDoc */
  _updateDiff(source, key, value, difference, options) {
    const sourceType = source[key]?.type;
    const valueType = value?.type;
    if ( value && (("==type" in value) || ("-=type" in value)) ) throw new Error("The type of a TypedSchemaField cannot be updated with ==type or -=type");
    if ( sourceType && valueType && (sourceType !== valueType) && (options.recursive !== false) ) {
      throw new Error("The type of a TypedSchemaField can be changed only by forced replacement (==) of the entire field value or with {recursive: false}");
    }
    const schema = this.#getTypeSchema(valueType);
    if ( schema ) schema._updateDiff(source, key, value, difference, options);
    else super._updateDiff(source, key, applySpecialKeys(value), difference, options);
  }

  /* ---------------------------------------- */

  /** @inheritDoc */
  _updateCommit(source, key, value, diff, options) {
    const schema = this.#getTypeSchema(value?.type);
    if ( schema ) {
      if ( "type" in diff ) source[key] = undefined;
      schema._updateCommit(source, key, value, diff, options);
    }
    else super._updateCommit(source, key, value, diff, options);
  }

  /* ---------------------------------------- */

  /** @override */
  toObject(value) {
    if ( !value ) return value;
    return this.#getTypeSchema(value.type)?.toObject(value) ?? value;
  }

  /* -------------------------------------------- */

  /** @override */
  apply(fn, data={}, options={}) {

    // Apply to this TypedSchemaField
    const thisFn = typeof fn === "string" ? this[fn] : fn;
    thisFn?.call(this, data, options);

    // Apply to the schema of the type
    const schema = this.#getTypeSchema(data.type);
    return schema?.apply(fn, data, options) ?? {};
  }

  /* -------------------------------------------- */

  /** @override */
  _addTypes(source, changes, options={}) {
    if ( getType(source) !== "Object" ) return;
    if ( getType(changes) !== "Object" ) return;
    const type = changes.type ??= source.type;
    this.#getTypeSchema(type)?._addTypes(source, changes, options);
  }

  /* -------------------------------------------- */

  /**
   * Migrate this field's candidate source data.
   * @param {object} sourceData   Candidate source data of the root model
   * @param {any} fieldData       The value of this field within the source data
   */
  migrateSource(sourceData, fieldData) {
    if ( getType(fieldData) !== "Object" ) return;
    const schema = this.#getTypeSchema(fieldData.type);
    const canMigrate = schema?.migrateSource instanceof Function;
    if ( canMigrate ) schema.migrateSource(sourceData, fieldData);
  }
}

/* ---------------------------------------- */

/**
 * A subclass of {@link foundry.data.fields.StringField} which contains JavaScript code.
 */
class JavaScriptField extends StringField {
  /**
   * @param {JavaScriptFieldOptions} [options] Options which configure the behavior of the field
   * @param {DataFieldContext} [context]    Additional context which describes the field
   */
  constructor(options, context) {
    super(options, context);
    this.choices = undefined;
  }

  /** @inheritdoc */
  static get _defaults() {
    return Object.assign(super._defaults, {required: true, blank: true, nullable: false, async: false});
  }

  /** @inheritdoc */
  _validateType(value, options) {
    const result = super._validateType(value, options);
    if ( result !== undefined ) return result;
    try {
      new (this.async ? AsyncFunction : Function)(value);
    } catch(err) {
      const scope = this.async ? "an asynchronous" : "a synchronous";
      err.message = `must be valid JavaScript for ${scope} scope:\n${err.message}`;
      throw new Error(err);
    }
  }

  /* -------------------------------------------- */
  /*  Form Field Integration                      */
  /* -------------------------------------------- */

  /** @override */
  toFormGroup(groupConfig={}, inputConfig={}) {
    groupConfig.stacked ??= true;
    return super.toFormGroup(groupConfig, inputConfig);
  }

  /**
   * @param {FormInputConfig & CodeMirrorInputConfig} config
   * @override
   */
  _toInput(config) {
    config.language = "javascript";
    config.indent ??= 2;
    return foundry.applications.elements.HTMLCodeMirrorElement.create(config);
  }
}

// Exports need to be at the bottom so that class names appear correctly in JSDoc
export {
  AlphaField,
  AngleField,
  AnyField,
  ArrayField,
  BooleanField,
  ColorField,
  DataField,
  DocumentAuthorField,
  DocumentIdField,
  DocumentOwnershipField,
  DocumentFlagsField,
  DocumentStatsField,
  DocumentTypeField,
  DocumentUUIDField,
  EmbeddedDataField,
  EmbeddedCollectionField,
  EmbeddedCollectionDeltaField,
  EmbeddedDocumentField,
  FilePathField,
  ForeignDocumentField,
  HTMLField,
  HueField,
  IntegerSortField,
  JavaScriptField,
  JSONField,
  NumberField,
  ObjectField,
  TypedSchemaField,
  SchemaField,
  SetField,
  StringField,
  TypeDataField
};

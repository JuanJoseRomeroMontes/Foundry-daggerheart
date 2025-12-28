import {
  deepClone,
  expandObject,
  getType,
  isDeletionKey,
  isEmpty,
  mergeObject
} from "../utils/helpers.mjs";
import {SchemaField, EmbeddedDataField, EmbeddedCollectionField} from "../data/fields.mjs";
import {DataModelValidationFailure} from "../data/validation-failure.mjs";

/**
 * @import {DataField} from "../data/fields.mjs";
 * @import {DataModelConstructionContext, DataModelFromSourceOptions, DataModelUpdateOptions,
 *   DataModelValidationOptions, DataSchema} from "./_types.mjs";
 */

/**
 * An abstract class which is a fundamental building block of numerous structures and concepts in Foundry Virtual
 * Tabletop. Data models perform several essential roles:
 *
 * * A static schema definition that all instances of that model adhere to.
 * * A workflow for data migration, cleaning, validation, and initialization such that provided input data is structured
 *   according to the rules of the model's declared schema.
 * * A workflow for transacting differential updates to the instance data and serializing its data into format suitable
 *   for storage or transport.
 *
 * DataModel subclasses can be used for a wide variety of purposes ranging from simple game settings to high complexity
 * objects like `Scene` documents. Data models are often nested; see the {@link DataModel.parent} property for more.
 *
 * @abstract
 * @template {object} [ModelData=object]
 * @template {DataModelConstructionContext} [ModelContext=DataModelConstructionContext]
 */
export default class DataModel {
  /**
   * @param {Partial<ModelData>} [data={}] Initial data used to construct the data object. The provided object will be
   *                                       owned by the constructed model instance and may be mutated.
   * @param {ModelContext} [options={}]    Context and data validation options which affects initial model construction.
   */
  constructor(data={}, {parent=null, strict=true, ...options}={}) {

    // Parent model
    Object.defineProperty(this, "parent", {
      value: (() => {
        if ( parent === null ) return null;
        if ( parent instanceof DataModel ) return parent;
        throw new Error("The provided parent must be a DataModel instance");
      })(),
      writable: false,
      enumerable: false
    });

    // Source data
    Object.defineProperty(this, "_source", {
      value: this._initializeSource(data, {strict, ...options}),
      writable: false,
      enumerable: false
    });
    Object.seal(this._source);

    // Additional subclass configurations
    this._configure(options);

    // Data validation and initialization
    const fallback = options.fallback ?? !strict;
    const dropInvalidEmbedded = options.dropInvalidEmbedded ?? !strict;
    this.validate({strict, fallback, dropInvalidEmbedded, fields: true, joint: true});
    this._initialize({strict, ...options});
  }

  /**
   * Configure the data model instance before validation and initialization workflows are performed.
   * @param {object} [options] Additional options modifying the configuration
   * @protected
   */
  _configure(options={}) {}

  /* -------------------------------------------- */

  /**
   * The source data object for this DataModel instance.
   * Once constructed, the source object is sealed such that no keys may be added nor removed.
   * @type {ModelData}
   * @public
   */
  _source;

  /**
   * The defined and cached Data Schema for all instances of this DataModel.
   * @type {SchemaField}
   * @internal
   */
  static _schema;

  /**
   * An immutable reverse-reference to a parent DataModel to which this model belongs.
   * @type {DataModel|null}
   */
  parent;

  /* ---------------------------------------- */
  /*  Data Schema                             */
  /* ---------------------------------------- */

  /**
   * Define the data schema for models of this type.
   * The schema is populated the first time it is accessed and cached for future reuse.
   *
   * The schema, through its fields, provide the essential cleaning, validation, and initialization methods to turn the
   * {@link _source} values into direct properties of the data model. The schema is a static property of the model and
   * is reused by all instances to perform validation.
   *
   * The schemas defined by the core software in classes like {@link foundry.documents.BaseActor} are validated by the
   * server, where user code does not run. However, almost all documents have a `flags` field to store data, and many
   * have a `system` field that can be configured to be a {@link foundry.abstract.TypeDataModel} instance. Those models
   * are *not* constructed on the server and rely purely on client-side code, which means certain extra-sensitive fields
   * must be also be registered through your package manifest. {@link foundry.packages.types.ServerSanitizationFields}
   *
   * @returns {DataSchema}
   * @abstract
   *
   * @example
   * ```js
   * class SomeModel extends foundry.abstract.DataModel {
   *   static defineSchema() {
   *     return {
   *       foo: new foundry.data.fields.StringField()
   *     }
   *   }
   * }
   *
   * class AnotherModel extends SomeModel {
   *   static defineSchema() {
   *     // Inheritance and object oriented principles apply to schema definition
   *     const schema = super.defineSchema()
   *
   *     schema.bar = new foundry.data.fields.NumberField()
   *
   *     return schema;
   *   }
   * }
   * ```
   */
  static defineSchema() {
    throw new Error(`The ${this.name} subclass of DataModel must define its Document schema`);
  }

  /* ---------------------------------------- */

  /**
   * The Data Schema for all instances of this DataModel.
   * @type {SchemaField}
   */
  static get schema() {
    if ( this.hasOwnProperty("_schema") ) return this._schema;
    const schema = new SchemaField(Object.freeze(this.defineSchema()));
    Object.defineProperty(this, "_schema", {value: schema, writable: false});
    return schema;
  }

  /* ---------------------------------------- */

  /**
   * Define the data schema for this document instance.
   * @type {SchemaField}
   */
  get schema() {
    return this.constructor.schema;
  }

  /* ---------------------------------------- */

  /**
   * Is the current state of this DataModel invalid?
   * The model is invalid if there is any unresolved failure.
   * @type {boolean}
   */
  get invalid() {
    return Object.values(this.#validationFailures).some(f => f?.unresolved);
  }

  /**
   * An array of validation failure instances which may have occurred when this instance was last validated.
   * @type {{fields: DataModelValidationFailure|null, joint: DataModelValidationFailure|null}}
   */
  get validationFailures() {
    return this.#validationFailures;
  }

  #validationFailures = Object.seal({fields: null, joint: null });

  /**
   * A set of localization prefix paths which are used by this DataModel. This provides an alternative to defining the
   * `label` and `hint` property of each field by having foundry map the labels to a structure inside the path
   * provided by the prefix.
   *
   * @type {string[]}
   *
   * @example
   * JavaScript class definition and localization call.
   * ```js
   * class MyDataModel extends foundry.abstract.DataModel {
   *   static defineSchema() {
   *     return {
   *       foo: new foundry.data.fields.StringField(),
   *       bar: new foundry.data.fields.NumberField()
   *     };
   *   }
   *   static LOCALIZATION_PREFIXES = ["MYMODULE.MYDATAMODEL"];
   * }
   *
   * Hooks.on("i18nInit", () => {
   *   // Foundry will attempt to automatically localize models registered for a document subtype, so this step is only
   *   // needed for other data model usage, e.g. for a Setting.
   *   Localization.localizeDataModel(MyDataModel);
   * });
   * ```
   *
   * JSON localization file
   * ```json
   * {
   *   "MYMODULE": {
   *     "MYDATAMODEL": {
   *       "FIELDS" : {
   *         "foo": {
   *           "label": "Foo",
   *           "hint": "Instructions for foo"
   *         },
   *         "bar": {
   *           "label": "Bar",
   *           "hint": "Instructions for bar"
   *         }
   *       }
   *     }
   *   }
   * }
   * ```
   */
  static LOCALIZATION_PREFIXES = [];

  /* ---------------------------------------- */
  /*  Data Cleaning Methods                   */
  /* ---------------------------------------- */

  /**
   * Initialize the source data for a new DataModel instance.
   * One-time migrations and initial cleaning operations are applied to the source data.
   * @param {object|DataModel} data   The candidate source data from which the model will be constructed
   * @param {object} [options]        Options provided to the model constructor
   * @returns {object}                Migrated and cleaned source data which will be stored to the model instance,
   *                                  which is the same object as the `data` argument
   * @protected
   */
  _initializeSource(data, options={}) {
    if ( data instanceof DataModel ) data = data.toObject();

    // Migrate old data to the new format
    data = this.constructor.migrateDataSafe(data);
    const dt = getType(data);
    if ( dt !== "Object" ) {
      throw new Error(`${this.constructor.name} was incorrectly constructed with a ${dt} instead of an object.`);
    }

    // Clean data and apply shims for backwards compatibility
    data = this.constructor.cleanData(data);
    return this.constructor.shimData(data);
  }

  /* ---------------------------------------- */

  /**
   * Clean a data source object to conform to a specific provided schema.
   * @param {object} [source]         The source data object
   * @param {object} [options={}]     Additional options which are passed to field cleaning methods
   * @returns {object}                The cleaned source data, which is the same object as the `source` argument
   */
  static cleanData(source={}, options={}) {
    return this.schema.clean(source, options);
  }

  /* ---------------------------------------- */
  /*  Data Initialization                     */
  /* ---------------------------------------- */

  /**
   * A generator that orders the DataFields in the DataSchema into an expected initialization order.
   * @returns {Generator<[string,DataField]>}
   * @yields {DataField}
   * @protected
   */
  static *_initializationOrder() {
    for ( const entry of this.schema.entries() ) yield entry;
  }

  /* ---------------------------------------- */

  /**
   * Initialize the instance by copying data from the source object to instance attributes.
   * This mirrors the workflow of SchemaField#initialize but with some added functionality.
   * @param {object} [options]        Options provided to the model constructor
   * @protected
   */
  _initialize(options={}) {
    for ( const [name, field] of this.constructor._initializationOrder() ) {
      const sourceValue = this._source[name];

      // Field initialization
      const value = field.initialize(sourceValue, this, options);

      // Special handling for Document IDs.
      if ( (name === "_id") && (!Object.getOwnPropertyDescriptor(this, "_id") || (this._id === null)) ) {
        Object.defineProperty(this, name, {value, writable: false, configurable: true});
      }

      // Readonly fields
      else if ( field.readonly ) {
        if ( this[name] !== undefined ) continue;
        Object.defineProperty(this, name, {value, writable: false});
      }

      // Getter fields
      else if ( value instanceof Function ) {
        Object.defineProperty(this, name, {get: value, set() {}, configurable: true});
      }

      // Writable fields
      else this[name] = value;
    }
  }

  /* ---------------------------------------- */

  /**
   * Reset the state of this data instance back to mirror the contained source data, erasing any changes.
   */
  reset() {
    this._initialize();
  }

  /* ---------------------------------------- */

  /**
   * Clone a model, creating a new data model by combining current data with provided overrides.
   * @param {object} [data={}]             Additional data which overrides current document data at the time of creation
   * @param {DataModelConstructionContext} [context={}]          Context options passed to the data model constructor
   * @returns {DataModel|Promise<DataModel>} The cloned instance
   */
  clone(data={}, context={}) {
    data = mergeObject(this.toObject(), data, {insertKeys: false, performDeletions: true, inplace: true});
    return new this.constructor(data, {parent: this.parent, ...context});
  }

  /* ---------------------------------------- */
  /*  Data Validation Methods                 */
  /* ---------------------------------------- */

  /**
   * Validate the data contained in the document to check for type and content.
   * If changes are provided, missing types are added to it before cleaning and validation.
   * This mutates the provided changes. This function throws an error if data within the document is not valid.
   * @param {DataModelValidationOptions} options    Options which modify how the model is validated
   * @returns {boolean}                             Whether the data source or proposed change is reported as valid.
   *                                                A boolean is always returned if validation is non-strict.
   * @throws {Error}                                An error thrown if validation is strict and a failure occurs.
   */
  validate({changes, clean=false, fallback=false, dropInvalidEmbedded=false, strict=true,
    fields=true, joint}={}) {
    let source = changes ?? this._source;

    // Determine whether we are performing partial or joint validation
    joint = joint ?? !changes;
    const partial = !joint;

    // Add types where missing in a set of partial changes
    if ( partial ) {
      if ( !clean ) source = deepClone(source);
      this.schema._addTypes(this._source, source);
    }

    // Optionally clean the data before validating
    if ( clean ) this.constructor.cleanData(source, {partial});

    // Validate individual fields in the data or in a specific change-set, throwing errors if validation fails
    if ( fields ) {
      this.#validationFailures.fields = null;
      const failure = this.schema.validate(source, {partial, fallback, dropInvalidEmbedded});
      if ( failure ) {
        const id = this._source._id ? `[${this._source._id}] ` : "";
        failure.message = `${this.constructor.name} ${id}validation errors:`;
        this.#validationFailures.fields = failure;
        if ( strict && failure.unresolved ) throw failure.asError();
        else logger.warn(failure.asError());
      }
    }

    // Perform joint document-level validations which consider all fields together
    if ( joint ) {
      this.#validationFailures.joint = null;
      try {
        this.schema._validateModel(source);     // Validate inner models
        this.constructor.validateJoint(source); // Validate this model
      } catch(err) {
        const id = this._source._id ? `[${this._source._id}] ` : "";
        const message = [this.constructor.name, id, `Joint Validation Error:\n${err.message}`].filterJoin(" ");
        const failure = new DataModelValidationFailure({message, unresolved: true});
        this.#validationFailures.joint = failure;
        if ( strict ) throw failure.asError();
        else logger.warn(failure.asError());
      }
    }
    return !this.invalid;
  }

  /* ---------------------------------------- */

  /**
   * Evaluate joint validation rules which apply validation conditions across multiple fields of the model.
   * Field-specific validation rules should be defined as part of the DataSchema for the model.
   * This method allows for testing aggregate rules which impose requirements on the overall model.
   * @param {object} data     Candidate data for the model
   * @throws {Error}          An error if a validation failure is detected
   */
  static validateJoint(data) {}

  /* ---------------------------------------- */
  /*  Data Management                         */
  /* ---------------------------------------- */

  /**
   * Update the DataModel locally by applying an object of changes to its source data.
   * The provided changes are expanded, cleaned, validated, and stored to the source data object for this model.
   * The provided changes argument is mutated in this process.
   * The source data is then re-initialized to apply those changes to the prepared data.
   * The method returns an object of differential changes which modified the original data.
   *
   * @param {object} changes                  New values which should be applied to the data model
   * @param {DataModelUpdateOptions} options  Options which determine how the new data is merged
   * @returns {object}                        An object containing differential keys and values that were changed
   * @throws {DataModelValidationError}       An error if the requested data model changes were invalid
   */
  updateSource(changes={}, options={}) {
    const rootKey = "_source";
    const rootDiff = {[rootKey]: {}};

    // Expand the object, if dot-notation keys are provided
    if ( Object.keys(changes).some(k => /\./.test(k)) ) {
      const expandedChanges = expandObject(changes);
      for ( const key in changes ) delete changes[key];
      Object.assign(changes, expandedChanges);
    }

    // Clean proposed changes
    this.schema._addTypes(this._source, changes);
    this.constructor.cleanData(changes, {partial: true});

    // Perform updates on the safe copy of source data
    const copy = this.#prepareSafeSource(changes);
    this.schema._updateDiff({_source: copy}, rootKey, changes, rootDiff, options);
    const diff = rootDiff[rootKey] || {};
    if ( isEmpty(diff) ) return diff;

    // Validate final field-level changes only on the subset of fields which changed
    const typeChanged = "type" in diff;
    this.validate({changes: diff, fields: true, joint: false, strict: true});
    if ( !typeChanged ) delete diff.type;

    // Validate the final model on the safe copy of changes
    this.validate({changes: copy, fields: false, joint: true, strict: true});

    // If this is not a dry run, enact the final changes
    if ( !options.dryRun ) {
      this.schema._updateCommit(this, rootKey, copy, diff, options);
      this._initialize();
    }

    // Return the diff of enacted changes
    return diff;
  }

  /* ---------------------------------------- */

  /**
   * Prepare a mutation-safe version of the source data.
   * The resulting object contains a copy of the source data for any field present in the proposed set of model changes.
   * For fields not present in the proposed changes, the resulting object directly references the true source.
   * This approach is used because of superior performance for complex data structures.
   * @param {object} changes
   * @returns {object}
   */
  #prepareSafeSource(changes) {
    const copy = {};
    for ( const k of Object.keys(changes) ) {
      const key = isDeletionKey(k) ? k.slice(2) : k;
      if ( key in this._source ) copy[key] = deepClone(this._source[key]); // Copy for changed fields
    }
    for ( const k of Object.keys(this._source) ) {
      if ( !(k in copy) ) copy[k] = this._source[k]; // Direct reference for unchanged fields
    }
    return copy;
  }

  /* ---------------------------------------- */
  /*  Serialization and Storage               */
  /* ---------------------------------------- */

  /**
   * Copy and transform the DataModel into a plain object.
   * Draw the values of the extracted object from the data source (by default) otherwise from its transformed values.
   * @param {boolean} [source=true]     Draw values from the underlying data source rather than transformed values
   * @returns {object}                  The extracted primitive object
   */
  toObject(source=true) {
    if ( source ) return deepClone(this._source);

    // We have use the schema of the class instead of the schema of the instance to prevent an infinite recursion:
    // the EmbeddedDataField replaces the schema of its model instance with itself
    // and EmbeddedDataField#toObject calls DataModel#toObject.
    return this.constructor.schema.toObject(this);
  }

  /* ---------------------------------------- */

  /**
   * Extract the source data for the DataModel into a simple object format that can be serialized.
   * @returns {object}          The document source data expressed as a plain object
   */
  toJSON() {
    return this.toObject(true);
  }

  /* -------------------------------------------- */

  /**
   * Create a new instance of this DataModel from a source record.
   * The source is presumed to be trustworthy and is not strictly validated.
   * @param {object} source    Initial document data which comes from a trusted source.
   * @param {Omit<DataModelConstructionContext, "strict"> & DataModelFromSourceOptions} [context]
   *                           Model construction context
   * @returns {DataModel}
   */
  static fromSource(source, {strict=false, ...context}={}) {
    return new this(source, {strict, ...context});
  }

  /* ---------------------------------------- */

  /**
   * Create a DataModel instance using a provided serialized JSON string.
   * @param {string} json       Serialized document data in string format
   * @returns {DataModel}       A constructed data model instance
   */
  static fromJSON(json) {
    return this.fromSource(JSON.parse(json));
  }

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /**
   * Migrate candidate source data for this DataModel which may require initial cleaning or transformations.
   * @param {object} source           The candidate source data from which the model will be constructed
   * @returns {object}                Migrated source data, which is the same object as the `source` argument
   */
  static migrateData(source) {
    this.schema.migrateSource(source, source);
    return source;
  }

  /* ---------------------------------------- */

  /**
   * Wrap data migration in a try/catch which attempts it safely
   * @param {object} source           The candidate source data from which the model will be constructed
   * @returns {object}                Migrated source data, which is the same object as the `source` argument
   */
  static migrateDataSafe(source) {
    try {
      this.migrateData(source);
    } catch(err) {
      err.message = `Failed data migration for ${this.name}: ${err.message}`;
      logger.warn(err);
    }
    return source;
  }

  /* ---------------------------------------- */

  /**
   * Take data which conforms to the current data schema and add backwards-compatible accessors to it in order to
   * support older code which uses this data.
   * @param {object} data         Data which matches the current schema
   * @param {object} [options={}] Additional shimming options
   * @param {boolean} [options.embedded=true] Apply shims to embedded models?
   * @returns {object}            Data with added backwards-compatible properties, which is the same object as
   *                              the `data` argument
   */
  static shimData(data, {embedded=true}={}) {
    if ( Object.isSealed(data) ) return data;
    const schema = this.schema;
    if ( embedded ) {
      for ( const [name, value] of Object.entries(data) ) {
        const field = schema.get(name);
        if ( (field instanceof EmbeddedDataField) && !Object.isSealed(value) ) {
          data[name] = field.model.shimData(value || {});
        }
        else if ( field instanceof EmbeddedCollectionField ) {
          for ( const d of (value || []) ) {
            if ( !Object.isSealed(d) ) field.model.shimData(d);
          }
        }
      }
    }
    return data;
  }
}

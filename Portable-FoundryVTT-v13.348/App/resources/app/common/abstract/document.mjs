import DataModel from "./data.mjs";
import {getDefiningClass, getProperty, hasProperty, setProperty, mergeObject, deleteProperty} from "../utils/helpers.mjs";
import {BASE_DOCUMENT_TYPE, DOCUMENT_OWNERSHIP_LEVELS, USER_PERMISSIONS, USER_ROLES} from "../constants.mjs";
import {logCompatibilityWarning} from "../utils/logging.mjs";
import {SchemaField} from "../data/fields.mjs";

/**
 * @import DatabaseBackend from "./backend.mjs";
 * @import BaseUser from "../documents/user.mjs";
 * @import {
 *   DatabaseCreateOperation,
 *   DatabaseGetOperation,
 *   DatabaseUpdateOperation,
 *   DatabaseDeleteOperation,
 *   DocumentCloneOptions,
 *   DocumentClassMetadata
 * } from "./_types.mjs";
 * @import {DocumentConstructionContext} from "./_types.mjs";
 * @import {DocumentOwnershipLevel, DocumentOwnershipNumber} from "../constants.mjs";
 * @import {DocumentFlags, DocumentStats} from "../data/_types.mjs";
 */

/**
 * An extension of the base DataModel which defines a Document.
 * Documents are special in that they are persisted to the database and referenced by _id.
 * @abstract
 *
 * @template {object} [DocumentData=object] Initial data from which to construct the Document
 * @template {DocumentConstructionContext} [DocumentContext=DocumentConstructionContext] Construction context options
 *
 * @property {string|null} _id                    The document identifier, unique within its Collection, or null if the
 *                                                Document has not yet been assigned an identifier
 * @property {string} [name]                      Documents typically have a human-readable name
 * @property {DataModel} [system]                 Certain document types may have a system data model which contains
 *                                                subtype-specific data defined by the game system or a module
 * @property {DocumentStats} [_stats]             Primary document types have a _stats object which provides metadata
 *                                                about their status
 * @property {DocumentFlags} flags                Documents each have an object of arbitrary flags which are used by
 *                                                systems or modules to store additional Document-specific data
 * @extends {DataModel<DocumentData, DocumentContext>}
 */
export default class Document extends DataModel {

  /** @override */
  _configure({pack=null, parentCollection=null}={}) {
    /**
     * An immutable reverse-reference to the name of the collection that this Document exists in on its parent, if any.
     * @type {string|null}
     */
    Object.defineProperty(this, "parentCollection", {
      value: this._getParentCollection(parentCollection),
      writable: false
    });

    /**
     * An immutable reference to a containing Compendium collection to which this Document belongs.
     * @type {string|null}
     */
    Object.defineProperty(this, "pack", {
      value: (() => {
        if ( typeof pack === "string" ) return pack;
        if ( this.parent?.pack ) return this.parent.pack;
        if ( pack === null ) return null;
        throw new Error("The provided compendium pack ID must be a string");
      })(),
      writable: false
    });

    // Construct Embedded Collections
    const collections = {};
    for ( const [fieldName, field] of Object.entries(this.constructor.hierarchy) ) {
      if ( !field.constructor.implementation ) continue;
      const data = this._source[fieldName];
      const c = collections[fieldName] = new field.constructor.implementation(fieldName, this, data);
      Object.defineProperty(this, fieldName, {value: c, writable: false});
    }

    /**
     * A mapping of embedded Document collections which exist in this model.
     * @type {Record<string, EmbeddedCollection>}
     */
    Object.defineProperty(this, "collections", {value: Object.seal(collections), writable: false});
  }

  /* ---------------------------------------- */

  /**
   * Ensure that all Document classes share the same schema of their base declaration.
   * @type {SchemaField}
   * @override
   */
  static get schema() {
    if ( this._schema ) return this._schema;
    const base = this.baseDocument;
    if ( !base.hasOwnProperty("_schema") ) {
      const schema = new SchemaField(Object.freeze(base.defineSchema()));
      Object.defineProperty(base, "_schema", {value: schema, writable: false});
    }
    Object.defineProperty(this, "_schema", {value: base._schema, writable: false});
    return base._schema;
  }

  /* -------------------------------------------- */

  /** @override */
  static *_initializationOrder() {
    const hierarchy = this.hierarchy;

    // Initialize non-hierarchical fields first
    for ( const [name, field] of this.schema.entries() ) {
      if ( name in hierarchy ) continue;
      yield [name, field];
    }

    // Initialize hierarchical fields last
    for ( const [name, field] of Object.entries(hierarchy) ) {
      yield [name, field];
    }
  }

  /* -------------------------------------------- */
  /*  Model Configuration                         */
  /* -------------------------------------------- */

  /**
   * Default metadata which applies to each instance of this Document type.
   * @type {Readonly<DocumentClassMetadata>}
   */
  static metadata = Object.freeze({
    name: "Document",
    label: "DOCUMENT.Document",
    coreTypes: [BASE_DOCUMENT_TYPE],
    collection: "documents",
    embedded: {},
    hasTypeData: false,
    indexed: false,
    compendiumIndexFields: [],
    permissions: {
      view: "LIMITED",      // At least limited permission is required to view the Document
      create: "ASSISTANT",  // Assistants or Gamemasters can create Documents
      update: "OWNER",      // Document owners can update Documents (this includes GM users)
      delete: "ASSISTANT"   // Assistants or Gamemasters can delete Documents
    },
    preserveOnImport: ["_id", "sort", "ownership", "folder"],
    /*
     * The metadata has to include the version of this Document schema, which needs to be increased
     * whenever the schema is changed such that Document data created before this version
     * would come out different if `fromSource(data).toObject()` was applied to it so that
     * we always vend data to client that is in the schema of the current core version.
     * The schema version needs to be bumped if
     *   - a field was added or removed,
     *   - the class/type of any field was changed,
     *   - the casting or cleaning behavior of any field class was changed,
     *   - the data model of an embedded data field was changed,
     *   - certain field properties are changed (e.g. required, nullable, blank, ...), or
     *   - there have been changes to cleanData or migrateData of the Document.
     *
     * Moreover, the schema version needs to be bumped if the sanitization behavior
     * of any field in the schema was changed.
     */
    schemaVersion: undefined
  });

  /* -------------------------------------------- */

  /** @override */
  static LOCALIZATION_PREFIXES = ["DOCUMENT"];

  /* -------------------------------------------- */

  /**
   * The database backend used to execute operations and handle results.
   * @type {DatabaseBackend}
   */
  static get database() {
    return globalThis.CONFIG.DatabaseBackend;
  }

  /* -------------------------------------------- */

  /**
   * Return a reference to the configured subclass of this base Document type.
   * @type {typeof Document}
   */
  static get implementation() {
    return globalThis.CONFIG[this.documentName]?.documentClass || this;
  }

  /* -------------------------------------------- */

  /**
   * The base document definition that this document class extends from.
   * @type {typeof Document}
   */
  static get baseDocument() {
    let cls;
    let parent = this;
    while ( parent ) {
      cls = parent;
      parent = Object.getPrototypeOf(cls);
      if ( parent === Document ) return cls;
    }
    throw new Error(`Base Document class identification failed for "${this.documentName}"`);
  }

  /* -------------------------------------------- */

  /**
   * The named collection to which this Document belongs.
   * @type {string}
   */
  static get collectionName() {
    return this.metadata.collection;
  }

  get collectionName() {
    return this.constructor.collectionName;
  }

  /* -------------------------------------------- */

  /**
   * The canonical name of this Document type, for example "Actor".
   * @type {string}
   */
  static get documentName() {
    return this.metadata.name;
  }

  get documentName() {
    return this.constructor.documentName;
  }

  /* ---------------------------------------- */

  /**
   * The allowed types which may exist for this Document class.
   * @type {string[]}
   */
  static get TYPES() {
    return Object.keys(game.model[this.metadata.name]);
  }

  /* -------------------------------------------- */

  /**
   * Does this Document support additional subtypes?
   * @type {boolean}
   */
  static get hasTypeData() {
    return this.metadata.hasTypeData;
  }

  /* -------------------------------------------- */
  /*  Model Properties                            */
  /* -------------------------------------------- */

  /**
   * The Embedded Document hierarchy for this Document.
   * @returns {Readonly<Record<string, EmbeddedCollectionField|EmbeddedDocumentField>>}
   */
  static get hierarchy() {
    const hierarchy = {};
    for ( const [fieldName, field] of this.schema.entries() ) {
      if ( field.constructor.hierarchical ) hierarchy[fieldName] = field;
    }
    Object.defineProperty(this, "hierarchy", {value: Object.freeze(hierarchy), writable: false});
    return hierarchy;
  }

  /* -------------------------------------------- */

  /**
   * Identify the collection in a parent Document that this Document belongs to, if any.
   * @param {string|null} [parentCollection]  An explicitly provided parent collection name.
   * @returns {string|null}
   * @internal
   */
  _getParentCollection(parentCollection) {
    if ( !this.parent ) return null;
    if ( parentCollection ) return parentCollection;
    return this.parent.constructor.getCollectionName(this.documentName);
  }

  /**
   * The canonical identifier for this Document.
   * @type {string|null}
   */
  get id() {
    return this._id;
  }

  /**
   * A reference to the Compendium Collection containing this Document, if any, and otherwise null.
   * @returns {CompendiumCollection|null}
   * @abstract
   */
  get compendium() {
    throw new Error("A subclass of Document must implement this getter.");
  }

  /**
   * Is this document embedded within a parent document?
   * @returns {boolean}
   */
  get isEmbedded() {
    return !!(this.parent && this.parentCollection);
  }

  /**
   * Is this document in a compendium?
   * @returns {boolean}
   */
  get inCompendium() {
    return !!this.pack;
  }

  /* -------------------------------------------- */

  /**
   * A Universally Unique Identifier (uuid) for this Document instance.
   * @type {string}
   */
  get uuid() {
    return foundry.utils.buildUuid(this);
  }

  /* ---------------------------------------- */
  /*  Model Permissions                       */
  /* ---------------------------------------- */

  /**
   * Test whether a given User has sufficient permissions to create Documents of this type in general. This does not
   * guarantee that the User is able to create all Documents of this type, as certain document-specific requirements
   * may also be present.
   *
   * Generally speaking, this method is used to verify whether a User should be presented with the option to create
   * Documents of this type in the UI.
   *
   * @param {BaseUser} user       The User being tested
   * @returns {boolean}           Does the User have a sufficient role to create?
   */
  static canUserCreate(user) {
    const perm = this.metadata.permissions.create;

    // Require a custom User permission
    if ( perm in USER_PERMISSIONS ) return user.hasPermission(perm);

    // Require a specific User role
    if ( perm in USER_ROLES ) return user.hasRole(perm);

    // Construct a sample Document
    let doc;
    try {
      doc = this.fromSource(this.cleanData(), {strict: true});
    } catch(err) {
      return false;
    }

    // Use a specialized permission test function
    if ( perm instanceof Function ) return doc.canUserModify(user, "create");

    // Require Document ownership
    if ( perm in DOCUMENT_OWNERSHIP_LEVELS ) return doc.testUserPermission(user, perm);
    return false;
  }

  /* ---------------------------------------- */

  /**
   * Get the explicit permission level that a User has over this Document, a value in CONST.DOCUMENT_OWNERSHIP_LEVELS.
   * Compendium content ignores the ownership field in favor of User role-based ownership. Otherwise, Documents use
   * granular per-User ownership definitions and Embedded Documents defer to their parent ownership.
   *
   * This method returns the value recorded in Document ownership, regardless of the User's role, for example a
   * GAMEMASTER user might still return a result of NONE if they are not explicitly denoted as having a level.
   *
   * To test whether a user has a certain capability over the document, testUserPermission should be used.
   *
   * @param {BaseUser} [user=game.user] The User being tested
   * @returns {DocumentOwnershipNumber} A numeric permission level from {@link CONST.DOCUMENT_OWNERSHIP_LEVELS}
   */
  getUserLevel(user) {
    user ||= game.user;
    if ( this.pack ) return this.compendium.getUserLevel(user);               // Compendium User role
    if ( this.schema.has("ownership") ) {
      const level = this.ownership[user.id] ?? this.ownership.default ?? DOCUMENT_OWNERSHIP_LEVELS.NONE;
      if ( level !== DOCUMENT_OWNERSHIP_LEVELS.INHERIT ) return level;        // Defer inherited for Embedded
    }
    if ( this.parent ) return this.parent.getUserLevel(user);                 // Embedded Documents
    return DOCUMENT_OWNERSHIP_LEVELS.NONE;                                    // Otherwise, NONE
  }

  /* ---------------------------------------- */

  /**
   * Test whether a certain User has a requested permission level (or greater) over the Document
   * @param {BaseUser} user                 The User being tested
   * @param {DocumentOwnershipLevel} permission The permission level from DOCUMENT_OWNERSHIP_LEVELS to test
   * @param {object} options                Additional options involved in the permission test
   * @param {boolean} [options.exact=false] Require the exact permission level requested?
   * @returns {boolean}                     Does the user have this permission level over the Document?
   */
  testUserPermission(user, permission, {exact=false}={}) {
    const perms = DOCUMENT_OWNERSHIP_LEVELS;
    let level;
    if ( user.isGM ) level = perms.OWNER;
    else if ( user.isBanned ) level = perms.NONE;
    else level = this.getUserLevel(user);
    const target = (typeof permission === "string") ? (perms[permission] ?? perms.OWNER) : permission;
    return exact ? level === target : level >= target;
  }

  /* ---------------------------------------- */

  /**
   * Test whether a given User has permission to perform some action on this Document
   * @param {BaseUser} user             The User attempting modification
   * @param {string} action             The attempted action
   * @param {object} [data]             Data involved in the attempted action
   * @returns {boolean}                 Does the User have permission?
   */
  canUserModify(user, action, data={}) {
    const permissions = this.constructor.metadata.permissions;
    const perm = permissions[action];

    // Use a specialized permission test function
    if ( perm instanceof Function ) return perm(user, this, data);

    // Require a custom User permission
    if ( perm in USER_PERMISSIONS ) return user.hasPermission(perm);

    // Require a specific User role
    if ( perm in USER_ROLES ) return user.hasRole(perm);

    // Require Document ownership
    if ( perm in DOCUMENT_OWNERSHIP_LEVELS ) return this.testUserPermission(user, perm);
    return false;
  }

  /* ---------------------------------------- */
  /*  Model Methods                           */
  /* ---------------------------------------- */

  /**
   * Clone a document, creating a new document by combining current data with provided overrides.
   * The cloned document is ephemeral and not yet saved to the database.
   * @param {object} [data={}]    Additional data which overrides current document data at the time of creation
   * @param {DocumentConstructionContext & DocumentCloneOptions} [context]
   *                                          Additional context options passed to the create method
   * @returns {Document|Promise<Document>}    The cloned Document instance
   */
  clone(data={}, context={}) {
    const {save=false, keepId=false, addSource=false, ...remaining} = context;
    context = remaining;
    context.parent = this.parent;
    context.pack = this.pack;
    context.strict = false;
    data = mergeObject(this.toObject(), data, {insertKeys: false, performDeletions: true, inplace: true});
    if ( !keepId ) delete data._id;
    if ( addSource ) {
      data._stats.duplicateSource = this.uuid;
      data._stats.exportSource = null;
    }
    return save ? this.constructor.create(data, context) : new this.constructor(data, context);
  }

  /* -------------------------------------------- */

  /**
   * For Documents which include game system data, migrate the system data object to conform to its latest data model.
   * The data model is defined by the template.json specification included by the game system.
   * @returns {object}              The migrated system data object
   */
  migrateSystemData() {
    if ( !this.constructor.hasTypeData ) {
      throw new Error(`The ${this.documentName} Document does not include a TypeDataField.`);
    }
    if ( (this.system instanceof DataModel) && !(this.system.modelProvider instanceof foundry.packages.BaseSystem) ) {
      throw new Error(`The ${this.documentName} Document does not have system-provided package data.`);
    }
    const model = game.model[this.documentName]?.[this.type] ?? {};
    return mergeObject(model, this.system, {
      insertKeys: false,
      insertValues: true,
      enforceTypes: false,
      overwrite: true,
      inplace: false
    });
  }

  /* ---------------------------------------- */

  /** @inheritDoc */
  toObject(source=true) {
    const data = super.toObject(source);
    return this.constructor.shimData(data);
  }

  /* -------------------------------------------- */
  /*  Database Operations                         */
  /* -------------------------------------------- */

  /**
   * Create multiple Documents using provided input data.
   * Data is provided as an array of objects where each individual object becomes one new Document.
   *
   * @param {Array<object|Document>} data  An array of data objects or existing Documents to persist.
   * @param {Partial<Omit<DatabaseCreateOperation, "data">>} [operation={}]  Parameters of the requested creation
   *                                  operation
   * @returns {Promise<Document[]>}        An array of created Document instances
   *
   * @example Create a single Document
   * ```js
   * const data = [{name: "New Actor", type: "character", img: "path/to/profile.jpg"}];
   * const created = await Actor.implementation.createDocuments(data);
   * ```
   *
   * @example Create multiple Documents
   * ```js
   * const data = [{name: "Tim", type: "npc"], [{name: "Tom", type: "npc"}];
   * const created = await Actor.implementation.createDocuments(data);
   * ```
   *
   * @example Create multiple embedded Documents within a parent
   * ```js
   * const actor = game.actors.getName("Tim");
   * const data = [{name: "Sword", type: "weapon"}, {name: "Breastplate", type: "equipment"}];
   * const created = await Item.implementation.createDocuments(data, {parent: actor});
   * ```
   *
   * @example Create a Document within a Compendium pack
   * ```js
   * const data = [{name: "Compendium Actor", type: "character", img: "path/to/profile.jpg"}];
   * const created = await Actor.implementation.createDocuments(data, {pack: "mymodule.mypack"});
   * ```
   */
  static async createDocuments(data=[], operation={}) {
    if ( operation.parent?.pack ) operation.pack = operation.parent.pack;
    operation.data = data;
    const created = await this.database.create(this.implementation, operation);

    /** @deprecated since v12 */
    if ( getDefiningClass(this, "_onCreateDocuments") !== Document ) {
      foundry.utils.logCompatibilityWarning("The Document._onCreateDocuments static method is deprecated in favor of "
        + "Document._onCreateOperation", {since: 12, until: 14});
      await this._onCreateDocuments(created, operation);
    }
    return created;
  }

  /* -------------------------------------------- */

  /**
   * Update multiple Document instances using provided differential data.
   * Data is provided as an array of objects where each individual object updates one existing Document.
   *
   * @param {object[]} updates          An array of differential data objects, each used to update a single Document
   * @param {Partial<Omit<DatabaseUpdateOperation, "updates">>} [operation={}] Parameters of the database update
   *                                    operation
   * @returns {Promise<Document[]>}     An array of updated Document instances
   *
   * @example Update a single Document
   * ```js
   * const updates = [{_id: "12ekjf43kj2312ds", name: "Timothy"}];
   * const updated = await Actor.implementation.updateDocuments(updates);
   * ```
   *
   * @example Update multiple Documents
   * ```js
   * const updates = [{_id: "12ekjf43kj2312ds", name: "Timothy"}, {_id: "kj549dk48k34jk34", name: "Thomas"}]};
   * const updated = await Actor.implementation.updateDocuments(updates);
   * ```
   *
   * @example Update multiple embedded Documents within a parent
   * ```js
   * const actor = game.actors.getName("Timothy");
   * const updates = [{_id: sword.id, name: "Magic Sword"}, {_id: shield.id, name: "Magic Shield"}];
   * const updated = await Item.implementation.updateDocuments(updates, {parent: actor});
   * ```
   *
   * @example Update Documents within a Compendium pack
   * ```js
   * const actor = await pack.getDocument(documentId);
   * const updated = await Actor.implementation.updateDocuments([{_id: actor.id, name: "New Name"}],
   *   {pack: "mymodule.mypack"});
   * ```
   */
  static async updateDocuments(updates=[], operation={}) {
    if ( operation.parent?.pack ) operation.pack = operation.parent.pack;
    operation.updates = updates;
    const updated = await this.database.update(this.implementation, operation);

    /** @deprecated since v12 */
    if ( getDefiningClass(this, "_onUpdateDocuments") !== Document ) {
      foundry.utils.logCompatibilityWarning("The Document._onUpdateDocuments static method is deprecated in favor of "
        + "Document._onUpdateOperation", {since: 12, until: 14});
      await this._onUpdateDocuments(updated, operation);
    }
    return updated;
  }

  /* -------------------------------------------- */

  /**
   * Delete one or multiple existing Documents using an array of provided ids.
   * Data is provided as an array of string ids for the documents to delete.
   *
   * @param {string[]} ids              An array of string ids for the documents to be deleted
   * @param {Partial<Omit<DatabaseDeleteOperation, "ids">>} [operation={}]  Parameters of the database deletion
   *                                    operation
   * @returns {Promise<Document[]>}     An array of deleted Document instances
   *
   * @example Delete a single Document
   * ```js
   * const tim = game.actors.getName("Tim");
   * const deleted = await Actor.implementation.deleteDocuments([tim.id]);
   * ```
   *
   * @example Delete multiple Documents
   * ```js
   * const tim = game.actors.getName("Tim");
   * const tom = game.actors.getName("Tom");
   * const deleted = await Actor.implementation.deleteDocuments([tim.id, tom.id]);
   * ```
   *
   * @example Delete multiple embedded Documents within a parent
   * ```js
   * const tim = game.actors.getName("Tim");
   * const sword = tim.items.getName("Sword");
   * const shield = tim.items.getName("Shield");
   * const deleted = await Item.implementation.deleteDocuments([sword.id, shield.id], parent: actor});
   * ```
   *
   * @example Delete Documents within a Compendium pack
   * ```js
   * const actor = await pack.getDocument(documentId);
   * const deleted = await Actor.implementation.deleteDocuments([actor.id], {pack: "mymodule.mypack"});
   * ```
   */
  static async deleteDocuments(ids=[], operation={}) {
    if ( operation.parent?.pack ) operation.pack = operation.parent.pack;
    operation.ids = ids;
    const deleted = await this.database.delete(this.implementation, operation);

    /** @deprecated since v12 */
    if ( getDefiningClass(this, "_onDeleteDocuments") !== Document ) {
      foundry.utils.logCompatibilityWarning("The Document._onDeleteDocuments static method is deprecated in favor of "
        + "Document._onDeleteOperation", {since: 12, until: 14});
      await this._onDeleteDocuments(deleted, operation);
    }
    return deleted;
  }

  /* -------------------------------------------- */

  /**
   * Create a new Document using provided input data, saving it to the database.
   * @see {@link Document.createDocuments}
   * @param {object|Document|(object|Document)[]} [data={}] Initial data used to create this Document, or a Document
   *                                                        instance to persist.
   * @param {Partial<Omit<DatabaseCreateOperation, "data">>} [operation={}]  Parameters of the creation operation
   * @returns {Promise<Document | Document[] | undefined>}        The created Document instance(s)
   *
   * @example Create a World-level Item
   * ```js
   * const data = [{name: "Special Sword", type: "weapon"}];
   * const created = await Item.implementation.create(data);
   * ```
   *
   * @example Create an Actor-owned Item
   * ```js
   * const data = [{name: "Special Sword", type: "weapon"}];
   * const actor = game.actors.getName("My Hero");
   * const created = await Item.implementation.create(data, {parent: actor});
   * ```
   *
   * @example Create an Item in a Compendium pack
   * ```js
   * const data = [{name: "Special Sword", type: "weapon"}];
   * const created = await Item.implementation.create(data, {pack: "mymodule.mypack"});
   * ```
   */
  static async create(data={}, operation={}) {
    const isArray = Array.isArray(data);
    const createData = isArray ? data : [data];
    const created = await this.createDocuments(createData, operation);
    return isArray ? created : created.shift();
  }

  /* -------------------------------------------- */

  /**
   * Update this Document using incremental data, saving it to the database.
   * @see {@link Document.updateDocuments}
   * @param {object} [data={}]          Differential update data which modifies the existing values of this document
   * @param {Partial<Omit<DatabaseUpdateOperation, "updates">>} [operation={}]  Parameters of the update operation
   * @returns {Promise<Document|undefined>}       The updated Document instance, or undefined not updated
   */
  async update(data={}, operation={}) {
    data._id = this.id;
    operation.parent = this.parent;
    operation.pack = this.pack;
    const updates = await this.constructor.updateDocuments([data], operation);
    return updates.shift();
  }

  /* -------------------------------------------- */

  /**
   * Delete this Document, removing it from the database.
   * @see {@link Document.deleteDocuments}
   * @param {Partial<Omit<DatabaseDeleteOperation, "ids">>} [operation={}]  Parameters of the deletion operation
   * @returns {Promise<Document|undefined>}       The deleted Document instance, or undefined if not deleted
   */
  async delete(operation={}) {
    operation.parent = this.parent;
    operation.pack = this.pack;
    const deleted = await this.constructor.deleteDocuments([this.id], operation);
    return deleted.shift();
  }

  /* -------------------------------------------- */

  /**
   * Get a World-level Document of this type by its id.
   * @param {string} documentId         The Document ID
   * @param {DatabaseGetOperation} [operation={}] Parameters of the get operation
   * @returns {Document|null}  The retrieved Document, or null
   */
  static get(documentId, operation={}) {
    if ( !documentId ) return null;
    if ( operation.pack ) {
      const pack = game.packs.get(operation.pack);
      return pack?.index.get(documentId) || null;
    }
    else {
      const collection = game.collections?.get(this.documentName);
      return collection?.get(documentId) || null;
    }
  }

  /* -------------------------------------------- */
  /*  Embedded Operations                         */
  /* -------------------------------------------- */

  /**
   * A compatibility method that returns the appropriate name of an embedded collection within this Document.
   * @param {string} name    An existing collection name or a document name.
   * @returns {string|null}  The provided collection name if it exists, the first available collection for the
   *                         document name provided, or null if no appropriate embedded collection could be found.
   * @example Passing an existing collection name.
   * ```js
   * Actor.implementation.getCollectionName("items");
   * // returns "items"
   * ```
   *
   * @example Passing a document name.
   * ```js
   * Actor.implementation.getCollectionName("Item");
   * // returns "items"
   * ```
   */
  static getCollectionName(name) {
    if ( name in this.hierarchy ) return name;
    for ( const [collectionName, field] of Object.entries(this.hierarchy) ) {
      if ( field.model.documentName === name ) return collectionName;
    }
    return null;
  }

  /* -------------------------------------------- */

  /**
   * Obtain a reference to the Array of source data within the data object for a certain embedded Document name
   * @param {string} embeddedName   The name of the embedded Document type
   * @returns {DocumentCollection}  The Collection instance of embedded Documents of the requested type
   */
  getEmbeddedCollection(embeddedName) {
    const collectionName = this.constructor.getCollectionName(embeddedName);
    if ( !collectionName ) {
      throw new Error(`${embeddedName} is not a valid embedded Document within the ${this.documentName} Document`);
    }
    const field = this.constructor.hierarchy[collectionName];
    return field.getCollection(this);
  }

  /* -------------------------------------------- */

  /**
   * Get an embedded document by its id from a named collection in the parent document.
   * @param {string} embeddedName              The name of the embedded Document type
   * @param {string} id                        The id of the child document to retrieve
   * @param {object} [options]                 Additional options which modify how embedded documents are retrieved
   * @param {boolean} [options.strict=false]   Throw an Error if the requested id does not exist. See Collection#get
   * @param {boolean} [options.invalid=false]  Allow retrieving an invalid Embedded Document.
   * @returns {Document}                       The retrieved embedded Document instance, or undefined
   * @throws If the embedded collection does not exist, or if strict is true and the Embedded Document could not be
   *         found.
   */
  getEmbeddedDocument(embeddedName, id, {invalid=false, strict=false}={}) {
    const collection = this.getEmbeddedCollection(embeddedName);
    return collection.get(id, {invalid, strict});
  }

  /* -------------------------------------------- */

  /**
   * Create multiple embedded Document instances within this parent Document using provided input data.
   * @see {@link Document.createDocuments}
   * @param {string} embeddedName                     The name of the embedded Document type
   * @param {object[]} data                           An array of data objects used to create multiple documents
   * @param {DatabaseCreateOperation} [operation={}]  Parameters of the database creation workflow
   * @returns {Promise<Document[]>}                   An array of created Document instances
   */
  async createEmbeddedDocuments(embeddedName, data=[], operation={}) {
    this.getEmbeddedCollection(embeddedName); // Validation only
    operation.parent = this;
    operation.pack = this.pack;
    const cls = getDocumentClass(embeddedName);
    return cls.createDocuments(data, operation);
  }

  /* -------------------------------------------- */

  /**
   * Update multiple embedded Document instances within a parent Document using provided differential data.
   * @see {@link Document.updateDocuments}
   * @param {string} embeddedName                     The name of the embedded Document type
   * @param {object[]} updates                        An array of differential data objects, each used to update a
   *                                                  single Document
   * @param {DatabaseUpdateOperation} [operation={}]  Parameters of the database update workflow
   * @returns {Promise<Document[]>}                   An array of updated Document instances
   */
  async updateEmbeddedDocuments(embeddedName, updates=[], operation={}) {
    this.getEmbeddedCollection(embeddedName); // Validation only
    operation.parent = this;
    operation.pack = this.pack;
    const cls = getDocumentClass(embeddedName);
    return cls.updateDocuments(updates, operation);
  }

  /* -------------------------------------------- */

  /**
   * Delete multiple embedded Document instances within a parent Document using provided string ids.
   * @see {@link Document.deleteDocuments}
   * @param {string} embeddedName                     The name of the embedded Document type
   * @param {string[]} ids                            An array of string ids for each Document to be deleted
   * @param {DatabaseDeleteOperation} [operation={}]  Parameters of the database deletion workflow
   * @returns {Promise<Document[]>}                   An array of deleted Document instances
   */
  async deleteEmbeddedDocuments(embeddedName, ids, operation={}) {
    this.getEmbeddedCollection(embeddedName); // Validation only
    operation.parent = this;
    operation.pack = this.pack;
    const cls = getDocumentClass(embeddedName);
    return cls.deleteDocuments(ids, operation);
  }

  /* -------------------------------------------- */

  /**
   * Iterate over all embedded Documents that are hierarchical children of this Document.
   * @param {string} [_parentPath]                      A parent field path already traversed
   * @yields {[string, Document]}
   */
  * traverseEmbeddedDocuments(_parentPath) {
    for ( const [fieldName, field] of Object.entries(this.constructor.hierarchy) ) {
      const fieldPath = _parentPath ? `${_parentPath}.${fieldName}` : fieldName;

      // Singleton embedded document
      if ( field instanceof foundry.data.fields.EmbeddedDocumentField ) {
        const document = this[fieldName];
        if ( document ) {
          yield [fieldPath, document];
          yield* document.traverseEmbeddedDocuments(fieldPath);
        }
      }

      // Embedded document collection
      else if ( field instanceof foundry.data.fields.EmbeddedCollectionField ) {
        const collection = this[fieldName];
        const isDelta = field instanceof foundry.data.fields.EmbeddedCollectionDeltaField;
        for ( const document of collection.values() ) {
          if ( isDelta && !collection.manages(document.id) ) continue;
          yield [fieldPath, document];
          yield* document.traverseEmbeddedDocuments(fieldPath);
        }
      }
    }
  }

  /* -------------------------------------------- */
  /*  Flag Operations                             */
  /* -------------------------------------------- */

  /**
   * Get the value of a "flag" for this document
   * See the setFlag method for more details on flags
   *
   * @param {string} scope        The flag scope which namespaces the key
   * @param {string} key          The flag key
   * @returns {*}                 The flag value
   */
  getFlag(scope, key) {
    const scopes = this.constructor.database.getFlagScopes();
    if ( !scopes.includes(scope) ) throw new Error(`Flag scope "${scope}" is not valid or not currently active`);

    /** @deprecated since v12 */
    if ( (scope === "core") && (key === "sourceId") ) {
      foundry.utils.logCompatibilityWarning("The core.sourceId flag has been deprecated. "
        + "Please use the _stats.compendiumSource property instead.", { since: 12, until: 14 });
      return this._stats?.compendiumSource;
    }

    if ( !this.flags || !(scope in this.flags) ) return undefined;
    return getProperty(this.flags?.[scope], key);
  }

  /* -------------------------------------------- */

  /**
   * Assign a "flag" to this document.
   * Flags represent key-value type data which can be used to store flexible or arbitrary data required by either
   * the core software, game systems, or user-created modules.
   *
   * Each flag should be set using a scope which provides a namespace for the flag to help prevent collisions.
   *
   * Flags set by the core software use the "core" scope.
   * Flags set by game systems or modules should use the canonical name attribute for the module
   * Flags set by an individual world should "world" as the scope.
   *
   * Flag values can assume almost any data type. Setting a flag value to null will delete that flag.
   *
   * @param {string} scope        The flag scope which namespaces the key
   * @param {string} key          The flag key
   * @param {*} value             The flag value
   * @returns {Promise<Document>} A Promise resolving to the updated document
   */
  async setFlag(scope, key, value) {
    const scopes = this.constructor.database.getFlagScopes();
    if ( !scopes.includes(scope) ) throw new Error(`Flag scope "${scope}" is not valid or not currently active`);
    return this.update({
      flags: {
        [scope]: {
          [key]: value
        }
      }
    });
  }

  /* -------------------------------------------- */

  /**
   * Remove a flag assigned to the document
   * @param {string} scope        The flag scope which namespaces the key
   * @param {string} key          The flag key
   * @returns {Promise<Document>} The updated document instance
   */
  async unsetFlag(scope, key) {
    const scopes = this.constructor.database.getFlagScopes();
    if ( !scopes.includes(scope) ) throw new Error(`Flag scope "${scope}" is not valid or not currently active`);
    const head = key.split(".");
    const tail = `-=${head.pop()}`;
    key = ["flags", scope, ...head, tail].join(".");
    return this.update({[key]: null});
  }

  /* -------------------------------------------- */
  /*  Database Creation Operations                */
  /* -------------------------------------------- */

  /**
   * Pre-process a creation operation for a single Document instance. Pre-operation events only occur for the client
   * which requested the operation.
   *
   * Modifications to the pending Document instance must be performed using {@link updateSource}.
   *
   * @param {object} data               The initial data object provided to the document creation request
   * @param {object} options            Additional options which modify the creation request
   * @param {BaseUser} user             The User requesting the document creation
   * @returns {Promise<boolean|void>}   Return false to exclude this Document from the creation operation
   * @protected
   */
  async _preCreate(data, options, user) {}

  /**
   * Post-process a creation operation for a single Document instance. Post-operation events occur for all connected
   * clients.
   *
   * @param {object} data                         The initial data object provided to the document creation request
   * @param {object} options                      Additional options which modify the creation request
   * @param {string} userId                       The id of the User requesting the document update
   * @protected
   */
  _onCreate(data, options, userId) {}

  /**
   * Pre-process a creation operation, potentially altering its instructions or input data. Pre-operation events only
   * occur for the client which requested the operation.
   *
   * This batch-wise workflow occurs after individual {@link _preCreate} workflows and provides a final pre-flight check
   * before a database operation occurs.
   *
   * Modifications to pending documents must mutate the documents array or alter individual document instances using
   * {@link updateSource}.
   *
   * @param {Document[]} documents                Pending document instances to be created
   * @param {DatabaseCreateOperation} operation   Parameters of the database creation operation
   * @param {BaseUser} user                       The User requesting the creation operation
   * @returns {Promise<boolean|void>}             Return false to cancel the creation operation entirely
   * @protected
   */
  static async _preCreateOperation(documents, operation, user) {}

  /**
   * Post-process a creation operation, reacting to database changes which have occurred. Post-operation events occur
   * for all connected clients.
   *
   * This batch-wise workflow occurs after individual {@link _onCreate} workflows.
   *
   * @param {Document[]} documents                The Document instances which were created
   * @param {DatabaseCreateOperation} operation   Parameters of the database creation operation
   * @param {BaseUser} user                       The User who performed the creation operation
   * @returns {Promise<void>}
   * @protected
   */
  static async _onCreateOperation(documents, operation, user) {}

  /* -------------------------------------------- */
  /*  Database Update Operations                  */
  /* -------------------------------------------- */

  /**
   * Pre-process an update operation for a single Document instance. Pre-operation events only occur for the client
   * which requested the operation.
   *
   * @param {object} changes            The candidate changes to the Document
   * @param {object} options            Additional options which modify the update request
   * @param {BaseUser} user             The User requesting the document update
   * @returns {Promise<boolean|void>}   A return value of false indicates the update operation should be cancelled.
   * @protected
   */
  async _preUpdate(changes, options, user) {}

  /**
   * Post-process an update operation for a single Document instance. Post-operation events occur for all connected
   * clients.
   *
   * @param {object} changed            The differential data that was changed relative to the documents prior values
   * @param {object} options            Additional options which modify the update request
   * @param {string} userId             The id of the User requesting the document update
   * @protected
   */
  _onUpdate(changed, options, userId) {}

  /**
   * Pre-process an update operation, potentially altering its instructions or input data. Pre-operation events only
   * occur for the client which requested the operation.
   *
   * This batch-wise workflow occurs after individual {@link _preUpdate} workflows and provides a final pre-flight check
   * before a database operation occurs.
   *
   * Modifications to the requested updates are performed by mutating the data array of the operation.
   *
   * @param {Document[]} documents                Document instances to be updated
   * @param {DatabaseUpdateOperation} operation   Parameters of the database update operation
   * @param {BaseUser} user                       The User requesting the update operation
   * @returns {Promise<boolean|void>}             Return false to cancel the update operation entirely
   * @protected
   */
  static async _preUpdateOperation(documents, operation, user) {}

  /**
   * Post-process an update operation, reacting to database changes which have occurred. Post-operation events occur
   * for all connected clients.
   *
   * This batch-wise workflow occurs after individual {@link _onUpdate} workflows.
   *
   * @param {Document[]} documents                The Document instances which were updated
   * @param {DatabaseUpdateOperation} operation   Parameters of the database update operation
   * @param {BaseUser} user                       The User who performed the update operation
   * @returns {Promise<void>}
   * @protected
   */
  static async _onUpdateOperation(documents, operation, user) {}

  /* -------------------------------------------- */
  /*  Database Delete Operations                  */
  /* -------------------------------------------- */

  /**
   * Pre-process a deletion operation for a single Document instance. Pre-operation events only occur for the client
   * which requested the operation.
   *
   * @param {object} options            Additional options which modify the deletion request
   * @param {BaseUser} user             The User requesting the document deletion
   * @returns {Promise<boolean|void>}   A return value of false indicates the deletion operation should be cancelled.
   * @protected
   */
  async _preDelete(options, user) {}

  /**
   * Post-process a deletion operation for a single Document instance. Post-operation events occur for all connected
   * clients.
   *
   * @param {object} options            Additional options which modify the deletion request
   * @param {string} userId             The id of the User requesting the document update
   * @protected
   */
  _onDelete(options, userId) {}

  /**
   * Pre-process a deletion operation, potentially altering its instructions or input data. Pre-operation events only
   * occur for the client which requested the operation.
   *
   * This batch-wise workflow occurs after individual {@link _preDelete} workflows and provides a final pre-flight check
   * before a database operation occurs.
   *
   * Modifications to the requested deletions are performed by mutating the operation object.
   * {@link updateSource}.
   *
   * @param {Document[]} documents                Document instances to be deleted
   * @param {DatabaseDeleteOperation} operation   Parameters of the database update operation
   * @param {BaseUser} user                       The User requesting the deletion operation
   * @returns {Promise<boolean|void>}             Return false to cancel the deletion operation entirely
   * @protected
   */
  static async _preDeleteOperation(documents, operation, user) {}

  /**
   * Post-process a deletion operation, reacting to database changes which have occurred. Post-operation events occur
   * for all connected clients.
   *
   * This batch-wise workflow occurs after individual {@link _onDelete} workflows.
   *
   * @param {Document[]} documents                The Document instances which were deleted
   * @param {DatabaseDeleteOperation} operation   Parameters of the database deletion operation
   * @param {BaseUser} user                       The User who performed the deletion operation
   * @returns {Promise<void>}
   * @protected
   */
  static async _onDeleteOperation(documents, operation, user) {}

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /**
   * A reusable helper for adding migration shims.
   * @param {object} data                       The data object being shimmed
   * @param {{[oldKey: string]: string}} shims  The mapping of old keys to new keys
   * @param {object} [options]                  Options passed to {@link foundry.utils.logCompatibilityWarning}
   * @param {string} [options.warning]          The deprecation message
   * @param {any} [options.value]               The value of the shim
   * @internal
   */
  static _addDataFieldShims(data, shims, options) {
    for ( const [oldKey, newKey] of Object.entries(shims) ) {
      this._addDataFieldShim(data, oldKey, newKey, options);
    }
  }

  /* ---------------------------------------- */

  /**
   * A reusable helper for adding a migration shim
   * The value of the data can be transformed during the migration by an optional application function.
   * @param {object} data               The data object being shimmed
   * @param {string} oldKey             The old field name
   * @param {string} newKey             The new field name
   * @param {object} [options]          Options passed to {@link foundry.utils.logCompatibilityWarning}
   * @param {string} [options.warning]  The deprecation message
   * @param {any} [options.value]       The value of the shim
   * @internal
   */
  static _addDataFieldShim(data, oldKey, newKey, options={}) {
    if ( hasProperty(data, oldKey) ) return;
    let oldTarget = data;
    let oldTargetKey = oldKey;
    if ( oldKey.includes(".") ) {
      const parts = oldKey.split(".");
      oldTarget = getProperty(data, parts.slice(0, -1).join("."));
      oldTargetKey = parts.at(-1);
    }
    Object.defineProperty(oldTarget, oldTargetKey, {
      get: () => {
        if ( options.warning ) logCompatibilityWarning(options.warning, options);
        else this._logDataFieldMigration(oldKey, newKey, options);
        return ("value" in options) ? options.value : getProperty(data, newKey);
      },
      set: value => {
        if ( newKey ) setProperty(data, newKey, value);
      },
      configurable: true
    });
  }

  /* ---------------------------------------- */

  /**
   * Define a simple migration from one field name to another.
   * The value of the data can be transformed during the migration by an optional application function.
   * @param {object} data     The data object being migrated
   * @param {string} oldKey   The old field name
   * @param {string} newKey   The new field name
   * @param {(data: object) => any} [apply]  An application function, otherwise the old value is applied
   * @returns {boolean}       Whether a migration was applied.
   * @internal
   */
  static _addDataFieldMigration(data, oldKey, newKey, apply) {
    if ( !hasProperty(data, newKey) && hasProperty(data, oldKey) ) {
      let oldTarget = data;
      let oldTargetKey = oldKey;
      if ( oldKey.includes(".") ) {
        const parts = oldKey.split(".");
        oldTarget = getProperty(data, parts.slice(0, -1).join("."));
        oldTargetKey = parts.at(-1);
      }
      const oldProp = Object.getOwnPropertyDescriptor(oldTarget, oldTargetKey);
      if ( oldProp && !oldProp.writable ) return false;
      setProperty(data, newKey, apply ? apply(data) : getProperty(data, oldKey));
      deleteProperty(data, oldKey);
      return true;
    }
    return false;
  }

  /* ---------------------------------------- */

  /**
   * Log a compatbility warning for the data field migration.
   * @param {string} oldKey       The old field name
   * @param {string} newKey       The new field name
   * @param {object} [options]    Options passed to {@link foundry.utils.logCompatibilityWarning}
   * @internal
   */
  static _logDataFieldMigration(oldKey, newKey, options={}) {
    const msg = `You are accessing ${this.name}#${oldKey} which has been migrated to ${this.name}#${newKey}`;
    logCompatibilityWarning(msg, options);
  }

  /* ---------------------------------------- */

  /**
   * @callback RecursiveFieldClearCallback
   * @param {object} data       The (partial) Document data.
   * @param {string} fieldName  The name of the field to clear.
   */

  /**
   * Clear the fields from the given Document data recursively.
   * @param {object} data                                     The (partial) Document data
   * @param {string[]} fieldNames                             The fields that are cleared
   * @param {object} [options]
   * @param {RecursiveFieldClearCallback} [options.callback]  A callback that is invoked on each field in order to clear
   *                                                          it.
   * @internal
   */
  static _clearFieldsRecursively(data, fieldNames, options={}) {
    if ( fieldNames.length === 0 ) return;
    const { callback } = options;
    for ( const fieldName of fieldNames ) {
      if ( typeof callback === "function" ) callback(data, fieldName);
      else deleteProperty(data, fieldName);
    }
    for ( const [collectionName, field] of Object.entries(this.hierarchy) ) {
      const collection = data[collectionName];
      if ( !collection ) continue;
      if ( field instanceof foundry.data.fields.EmbeddedDocumentField ) {
        field.model._clearFieldsRecursively(collection, fieldNames, options);
        continue;
      }
      for ( const embeddedData of collection ) {
        if ( embeddedData._tombstone ) continue;
        field.model._clearFieldsRecursively(embeddedData, fieldNames, options);
      }
    }
  }

  /* ---------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  static async _onCreateDocuments(documents, operation) {}

  /**
   * @deprecated since v12
   * @ignore
   */
  static async _onUpdateDocuments(documents, operation) {}

  /**
   * @deprecated since v12
   * @ignore
   */
  static async _onDeleteDocuments(documents, operation) {}
}

import Collection from "../utils/collection.mjs";
import {randomID} from "../utils/helpers.mjs";

/**
 * @import DataModel from "./data.mjs";
 * @import Document from "./document.mjs";
 * @import {DatabaseAction, DatabaseOperation} from "./_types.mjs";
 * @import BaseUser from "../documents/user.mjs";
 * @import {DocumentConstructionContext} from "./_types.mjs";
 */

/**
 * An extension of the Collection.
 * Used for the specific task of containing embedded Document instances within a parent Document.
 * @template {Document} TDocument
 * @extends Collection<string, TDocument>
 */
export default class EmbeddedCollection extends Collection {
  /**
   * @param {string} name           The name of this collection in the parent Document.
   * @param {Document} parent       The parent Document instance to which this collection belongs.
   * @param {object[]} sourceArray  The source data array for the collection in the parent Document data.
   */
  constructor(name, parent, sourceArray) {
    if ( typeof name !== "string" ) throw new Error("The signature of EmbeddedCollection has changed in v11.");
    super();
    Object.defineProperties(this, {
      _source: {value: sourceArray, writable: false},
      documentClass: {value: parent.constructor.hierarchy[name].model, writable: false},
      name: {value: name, writable: false},
      model: {value: parent, writable: false}
    });
  }

  /**
   * The Document implementation used to construct instances within this collection.
   * @type {typeof Document}
   */
  documentClass;

  /**
   * The Document name of Documents stored in this collection.
   * @returns {string|void}
   */
  get documentName() {
    return this.documentClass?.documentName;
  }

  /**
   * The name of this collection in the parent Document.
   * @type {string}
   */
  name;

  /**
   * The parent Document to which this EmbeddedCollection instance belongs.
   * @type {Document}
   */
  model; // TODO: Should we rename this property parentDocument?

  /**
   * Has this embedded collection been initialized as a one-time workflow?
   * @type {boolean}
   * @protected
   */
  _initialized = false;

  /**
   * The source data array from which the embedded collection is created
   * @type {object[]}
   * @public
   */
  _source;

  /**
   * Record the set of document ids where the Document was not initialized because of invalid source data
   * @type {Set<string>}
   */
  invalidDocumentIds = new Set();

  /**
   * A cache of this collection's contents grouped by subtype
   * @type {Record<string, TDocument[]>|null}
   */
  #documentsByType = null;

  /* -------------------------------------------- */

  /**
   * This collection's contents grouped by subtype, lazily (re-)computed as needed.
   * If the document type does not support subtypes, all will be in the "base" group.
   * @type {Record<string, TDocument[]>}
   */
  get documentsByType() {
    if ( this.#documentsByType ) return this.#documentsByType;
    const typeName = this.documentClass.metadata.name;
    const types = Object.fromEntries(game.documentTypes[typeName].map(t => [t, []]));
    for ( const document of this.values() ) {
      types[document._source.type ?? "base"]?.push(document);
    }
    return this.#documentsByType = types;
  }

  /* -------------------------------------------- */
  /*  Collection Initialization                   */
  /* -------------------------------------------- */

  /**
   * Initialize the EmbeddedCollection by synchronizing its Document instances with existing _source data.
   * Importantly, this method does not make any modifications to the _source array.
   * It is responsible for creating, updating, or removing Documents from the Collection.
   * @param {DocumentConstructionContext} [options]  Initialization options.
   */
  initialize(options={}) {
    this._initialized = false;
    this.#documentsByType = null;

    // Re-initialize all records in source
    const initializedIds = new Set();
    for ( const obj of this._source ) {
      const doc = this._initializeDocument(obj, options);
      if ( doc ) initializedIds.add(doc.id);
    }

    // Remove documents that no longer exist in source
    if ( this.size !== initializedIds.size ) {
      for ( const k of this.keys() ) {
        if ( !initializedIds.has(k) ) this.delete(k, {modifySource: false});
      }
    }
    this._initialized = true;
  }

  /* -------------------------------------------- */

  /**
   * Initialize an embedded document and store it in the collection.
   * The document may already exist, in which case we are reinitializing it with new _source data.
   * The document may not yet exist, in which case we create a new Document instance using the provided source.
   *
   * @param {object} data                    The Document data.
   * @param {DocumentConstructionContext} [options]  Initialization options.
   * @returns {TDocument|null}               The initialized document or null if no document was initialized
   * @protected
   */
  _initializeDocument(data, options) {
    let doc = this.get(data._id);

    // Re-initialize an existing document
    if ( doc ) {
      doc._initialize(options);
      return doc;
    }

    // Create a new document
    if ( !data._id ) data._id = randomID(16); // TODO should this throw an error?
    try {
      doc = this.createDocument(data, options);
      super.set(doc.id, doc);
    } catch(err) {
      this._handleInvalidDocument(data._id, err, options);
      return null;
    }
    return doc;
  }

  /* -------------------------------------------- */

  /**
   * Instantiate a Document for inclusion in the Collection.
   * @param {object} data       The Document data.
   * @param {DocumentConstructionContext} [context]  Document creation context.
   * @returns {TDocument}
   */
  createDocument(data, context={}) {
    return new this.documentClass(data, {
      ...context,
      parent: this.model,
      parentCollection: this.name,
      pack: this.model.pack
    });
  }

  /* -------------------------------------------- */

  /**
   * Log warnings or errors when a Document is found to be invalid.
   * @param {string} id                      The invalid Document's ID.
   * @param {Error} err                      The validation error.
   * @param {object} [options]               Options to configure invalid Document handling.
   * @param {boolean} [options.strict=true]  Whether to throw an error or only log a warning.
   * @protected
   */
  _handleInvalidDocument(id, err, {strict=true}={}) {
    const documentName = this.documentClass.documentName;
    const parent = this.model;
    this.invalidDocumentIds.add(id);

    // Wrap the error with more information
    const uuid = foundry.utils.buildUuid({id, documentName, parent});
    const msg = `Failed to initialize ${documentName} [${uuid}]:\n${err.message}`;
    const error = new Error(msg, {cause: err});

    if ( strict ) globalThis.logger.error(error);
    else globalThis.logger.warn(error);
    if ( strict ) {
      globalThis.Hooks?.onError(`${this.constructor.name}#_initializeDocument`, error, {id, documentName});
    }
  }

  /* -------------------------------------------- */
  /*  Collection Methods                          */
  /* -------------------------------------------- */

  /**
   * Get a document from the EmbeddedCollection by its ID.
   * @param {string} id                         The ID of the Embedded Document to retrieve.
   * @param {object} [options]                  Additional options to configure retrieval.
   * @param {boolean} [options.strict=false]    Throw an Error if the requested Embedded Document does not exist.
   * @param {boolean} [options.invalid=false]   Allow retrieving an invalid Embedded Document.
   * @returns {TDocument}                       The retrieved document instance, or undefined
   * @throws {Error}                            If strict is true and the Embedded Document cannot be found.
   */
  get(id, {invalid=false, strict=false}={}) {
    let result = super.get(id);
    if ( !result && invalid ) result = this.getInvalid(id, { strict: false });
    if ( !result && strict ) throw new Error(`${this.constructor.documentName} id [${id}] does not exist in the `
      + `${this.constructor.name} collection.`);
    return result;
  }

  /* ---------------------------------------- */

  /**
   * Add a document to the collection.
   * @param {string} key                           The embedded Document ID.
   * @param {TDocument} value                      The embedded Document instance.
   * @param {object} [options]                     Additional options to the set operation.
   * @param {boolean} [options.modifySource=true]  Whether to modify the collection's source as part of the operation.
   * */
  set(key, value, {modifySource=true, ...options}={}) {
    if ( modifySource ) this._set(key, value, options);
    if ( super.get(key) !== value ) this.#documentsByType = null;
    return super.set(key, value);
  }

  /* -------------------------------------------- */

  /**
   * Modify the underlying source array to include the Document.
   * @param {string} key      The Document ID key.
   * @param {Document} value  The Document.
   * @protected
   */
  _set(key, value) {
    if ( this.has(key) || this.invalidDocumentIds.has(key) ) this._source.findSplice(d => d._id === key, value._source);
    else this._source.push(value._source);
  }

  /* ---------------------------------------- */

  /**
   * Remove a document from the collection.
   * @param {string} key                           The embedded Document ID.
   * @param {object} [options]                     Additional options to the delete operation.
   * @param {boolean} [options.modifySource=true]  Whether to modify the collection's source as part of the operation.
   * */
  delete(key, {modifySource=true, ...options}={}) {
    if ( modifySource ) this._delete(key, options);
    const result = super.delete(key);
    if ( result ) this.#documentsByType = null;
    return result;
  }

  /* -------------------------------------------- */

  /**
   * Remove the value from the underlying source array.
   * @param {string} key        The Document ID key.
   * @param {object} [options]  Additional options to configure deletion behavior.
   * @protected
   */
  _delete(key, options={}) {
    if ( this.has(key) || this.invalidDocumentIds.has(key) ) this._source.findSplice(d => d._id === key);
  }

  /* ---------------------------------------- */

  /**
   * Obtain a temporary Document instance for a document id which currently has invalid source data.
   * @param {string} id                      A document ID with invalid source data.
   * @param {object} [options]               Additional options to configure retrieval.
   * @param {boolean} [options.strict=true]  Throw an Error if the requested ID is not in the set of invalid IDs for
   *                                         this collection.
   * @returns {TDocument|void}               An in-memory instance for the invalid Document
   * @throws If strict is true and the requested ID is not in the set of invalid IDs for this collection.
   */
  getInvalid(id, {strict=true}={}) {
    if ( !this.invalidDocumentIds.has(id) ) {
      if ( strict ) throw new Error(`${this.constructor.documentName} id [${id}] is not in the set of invalid ids`);
      return;
    }
    const data = this._source.find(d => d._id === id);
    return this.documentClass.fromSource(foundry.utils.deepClone(data), {parent: this.model});
  }

  /* ---------------------------------------- */

  /**
   * Convert the EmbeddedCollection to an array of simple objects.
   * @param {boolean} [source=true]     Draw data for contained Documents from the underlying data source?
   * @returns {object[]}                The extracted array of primitive objects
   */
  toObject(source=true) {
    const arr = [];
    for ( const doc of this.values() ) {
      arr.push(doc.toObject(source));
    }
    return arr;
  }

  /* -------------------------------------------- */

  /**
   * Follow-up actions to take when a database operation modifies Documents in this EmbeddedCollection.
   * @param {DatabaseAction} action         The database action performed
   * @param {TDocument[]} documents         The array of modified Documents
   * @param {any[]} result                  The result of the database operation
   *
   * @param {DatabaseOperation} operation   Database operation details
   * @param {BaseUser} user                 The User who performed the operation
   * @internal
   */
  _onModifyContents(action, documents, result, operation, user) {
    // Propagate upwards to the parent collection
    const parentResult = action === "delete" ? [this.toObject()] : result;
    this.model?.collection?._onModifyContents?.("update", [this.model], [{[this.name]: parentResult}], operation, user);
  }
}

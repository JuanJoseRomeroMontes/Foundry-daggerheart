import Hooks from "@client/helpers/hooks.mjs";
import Collection from "@common/utils/collection.mjs";

/**
 * @import {Application, ApplicationV2} from "@client/applications/api/_module.mjs";
 * @import {SearchableField} from "@client/_types.mjs";
 * @import Document from "@common/abstract/document.mjs";
 * @import {DatabaseAction, DatabaseOperation} from "@common/abstract/_types.mjs";
 * @import User from "../user.mjs";
 */

/**
 * An abstract subclass of the Collection container which defines a collection of Document instances.
 * @abstract
 * @category Collections
 * @template {Document} TDocument
 * @extends Collection<string, TDocument>
 */
export default class DocumentCollection extends Collection {
  /**
   * @param {object[]} data      An array of data objects from which to create document instances
   */
  constructor(data=[]) {
    super();

    /**
     * The source data array from which the Documents in the WorldCollection are created
     * @type {object[]}
     * @internal
     */
    Object.defineProperty(this, "_source", {
      value: data,
      writable: false
    });

    /**
     * An Array of application references which will be automatically updated when the collection content changes
     * @type {(Application|ApplicationV2)[]}
     */
    this.apps = [];

    // Initialize data
    this._initialize();
  }

  /* -------------------------------------------- */

  /**
   * Initialize the DocumentCollection by constructing any initially provided Document instances
   * @protected
   */
  _initialize() {
    this.clear();
    for ( const d of this._source ) {
      let doc;
      if ( game.issues ) game.issues._countDocumentSubType(this.documentClass, d);
      try {
        doc = this.documentClass.fromSource(d, {strict: true, dropInvalidEmbedded: true});
        super.set(doc.id, doc);
      } catch(err) {
        this.invalidDocumentIds.add(d._id);
        if ( game.issues ) game.issues._trackValidationFailure(this, d, err);
        Hooks.onError(`${this.constructor.name}#_initialize`, err, {
          msg: `Failed to initialize ${this.documentName} [${d._id}]`,
          log: "error",
          id: d._id
        });
      }
    }
  }

  /* -------------------------------------------- */
  /*  Collection Properties                       */
  /* -------------------------------------------- */

  /**
   * A reference to the Document class definition which is contained within this DocumentCollection.
   * @type {typeof Document}
   */
  get documentClass() {
    return foundry.utils.getDocumentClass(this.documentName);
  }

  /** @inheritDoc */
  get documentName() {
    const name = this.constructor.documentName;
    if ( !name ) throw new Error("A subclass of DocumentCollection must define its static documentName");
    return name;
  }

  /**
   * The base Document type which is contained within this DocumentCollection
   * @type {string}
   */
  static documentName;

  /**
   * Record the set of document ids where the Document was not initialized because of invalid source data
   * @type {Set<string>}
   */
  invalidDocumentIds = new Set();

  /**
   * The Collection class name
   * @type {string}
   */
  get name() {
    return this.constructor.name;
  }

  /* -------------------------------------------- */
  /*  Collection Methods                          */
  /* -------------------------------------------- */

  /**
   * Instantiate a Document for inclusion in the Collection.
   * @param {object} data       The Document data.
   * @param {object} [context]  Document creation context.
   * @returns {TDocument}
   */
  createDocument(data, context={}) {
    return new this.documentClass(data, context);
  }

  /* -------------------------------------------- */

  /**
   * Obtain a temporary Document instance for a document id which currently has invalid source data.
   * @param {string} id                      A document ID with invalid source data.
   * @param {object} [options]               Additional options to configure retrieval.
   * @param {boolean} [options.strict=true]  Throw an Error if the requested ID is not in the set of invalid IDs for
   *                                         this collection.
   * @returns {TDocument|void}               An in-memory instance for the invalid Document
   * @throws {Error}                         If strict is true and the requested ID is not in the set of invalid IDs
   *                                         for this collection.
   */
  getInvalid(id, {strict=true}={}) {
    if ( !this.invalidDocumentIds.has(id) ) {
      if ( strict ) throw new Error(`${this.constructor.documentName} id [${id}] is not in the set of invalid ids`);
      return;
    }
    const data = this._source.find(d => d._id === id);
    return this.documentClass.fromSource(foundry.utils.deepClone(data));
  }

  /* -------------------------------------------- */

  /**
   * Get an element from the DocumentCollection by its ID.
   * @param {string} id                        The ID of the Document to retrieve.
   * @param {object} [options]                 Additional options to configure retrieval.
   * @param {boolean} [options.strict=false]   Throw an Error if the requested Document does not exist.
   * @param {boolean} [options.invalid=false]  Allow retrieving an invalid Document.
   * @returns {TDocument}
   * @throws {Error}                           If strict is true and the Document cannot be found.
   */
  get(id, {invalid=false, strict=false}={}) {
    let result = super.get(id);
    if ( !result && invalid ) result = this.getInvalid(id, { strict: false });
    if ( !result && strict ) throw new Error(`${this.constructor.documentName} id [${id}] does not exist in the `
      + `${this.constructor.name} collection.`);
    return result;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  set(id, document) {
    const cls = this.documentClass;
    if (!(document instanceof cls)) {
      throw new Error(`You may only push instances of ${cls.documentName} to the ${this.name} collection`);
    }
    const replacement = this.has(document.id);
    super.set(document.id, document);
    if ( replacement ) this._source.findSplice(e => e._id === id, document.toObject());
    else this._source.push(document.toObject());
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  delete(id) {
    super.delete(id);
    const removed = this._source.findSplice(e => e._id === id);
    return !!removed;
  }

  /* -------------------------------------------- */

  /**
   * Render any Applications associated with this DocumentCollection.
   * @param {boolean} [force=false]     Force rendering
   * @param {object} [options={}]       Optional options
   */
  render(force=false, options={}) {
    for ( const app of this.apps ) {
      const opts = foundry.utils.deepClone(options);
      if ( app instanceof foundry.applications.api.ApplicationV2 ) {
        opts.force = force;
        app.render(opts);
      }
      else app.render(force, opts);
    }
  }

  /* -------------------------------------------- */

  /**
   * The cache of search fields for each data model
   * @type {Map<string, Record<string, SearchableField>>}
   */
  static #dataModelSearchFieldsCache = new Map();

  /**
   * Get the searchable fields for a given document or index, based on its data model
   * @param {string} documentName         The document name
   * @param {string} [type]               A document subtype
   * @returns {Record<string, SearchableField>} A record of searchable DataField definitions
   */
  static getSearchableFields(documentName, type) {
    const searchFields = DocumentCollection.#getSearchableFields(documentName);
    if ( type ) {
      const systemFields = DocumentCollection.#getSearchableFields(documentName, type);
      if ( !foundry.utils.isEmpty(systemFields) ) Object.assign(searchFields, systemFields);
    }
    return searchFields;
  }

  /* -------------------------------------------- */

  /**
   * Identify and cache the searchable fields for a DataModel.
   * @param {string} documentName
   * @param {string} [type]
   * @returns {Record<string, SearchableField>}
   */
  static #getSearchableFields(documentName, type) {
    const isSubtype = !!type;
    const cacheName = isSubtype ? `${documentName}.${type}` : documentName;

    // If this already exists in the cache, return it
    const cached = DocumentCollection.#dataModelSearchFieldsCache.get(cacheName);
    if ( cached ) return cached;

    // Reference the Document model
    const docConfig = CONFIG[documentName];
    if ( !docConfig ) throw new Error(`Could not find configuration for ${documentName}`);
    const model = isSubtype ? docConfig.dataModels?.[type] : docConfig.documentClass;
    if ( !model ) return {};

    // Get fields for the base model
    let searchFields = {};
    model.schema.apply(function() {
      if ( (this instanceof foundry.data.fields.StringField) && this.textSearch ) searchFields[this.fieldPath] = this;
    });
    searchFields = foundry.utils.expandObject(searchFields);
    DocumentCollection.#dataModelSearchFieldsCache.set(cacheName, searchFields);
    return searchFields;
  }

  /* -------------------------------------------- */

  /**
   * Find all Documents which match a given search term using a full-text search against their indexed HTML fields
   * and their name. If filters are provided, results are filtered to only those that match the provided values.
   * @param {object} search                      An object configuring the search
   * @param {string} [search.query]              A case-insensitive search string
   * @param {FieldFilter[]} [search.filters]     An array of filters to apply
   * @param {string[]} [search.exclude]          An array of document IDs to exclude from search results
   * @returns {TDocument[]|object[]}
   */
  search({query= "", filters=[], exclude=[]}) {
    query = foundry.applications.ux.SearchFilter.cleanQuery(query);
    const regex = new RegExp(RegExp.escape(query), "i");

    // Iterate over all index members or documents
    const results = [];
    for ( const doc of this.index ?? this.contents ) {
      if ( exclude.includes(doc._id) ) continue; // Explicitly exclude this document
      let matched = !query;

      // Do a full-text search against any searchable fields based on metadata
      if ( query ) {
        const searchFields = DocumentCollection.getSearchableFields(this.documentName, doc.type);
        const match = DocumentCollection.#searchTextFields(doc, searchFields, regex);
        if ( !match ) continue; // Query did not match, no need to continue
        matched = true;
      }

      // Apply filters
      for ( const filter of filters ) {
        const match = foundry.applications.ux.SearchFilter.evaluateFilter(doc, filter);
        if ( !match ) {
          matched = false;
          break; // Filter did not match, no need to continue
        }
      }
      if ( matched ) results.push(doc);
    }
    return results;
  }

  /* -------------------------------------------- */

  /**
   * Recursively search text fields.
   * @param {object} data
   * @param {Record<string, SearchableField>} searchFields
   * @param {RegExp} rgx
   * @param {DOMParser} [domParser]
   */
  static #searchTextFields(data, searchFields, rgx, domParser) {
    for ( const [k, field] of Object.entries(searchFields) ) {
      let v = data[k];
      if ( !v ) continue;
      if ( typeof v === "string" ) {
        if ( field instanceof foundry.data.fields.HTMLField ) {
          domParser ??= new DOMParser();
          // TODO: Ideally we would search the text content of enriched HTML
          v = domParser.parseFromString(v, "text/html").body.textContent;
        }
        if ( foundry.applications.ux.SearchFilter.testQuery(rgx, v) ) return true;
      }
      else if ( Array.isArray(v) ) {
        if ( v.some(x => foundry.applications.ux.SearchFilter.testQuery(rgx, x)) ) return true;
      }
      else if ( typeof v === "object" ) {
        const m = DocumentCollection.#searchTextFields(v, field, rgx, domParser);
        if ( m ) return true;
      }
    }
    return false;
  }

  /* -------------------------------------------- */
  /*  Database Operations                         */
  /* -------------------------------------------- */

  /**
   * Update all objects in this DocumentCollection with a provided transformation.
   * Conditionally filter to only apply to Entities which match a certain condition.
   * @param {Function|object} transformation    An object of data or function to apply to all matched objects
   * @param {Function|null}  condition          A function which tests whether to target each object
   * @param {object} [options]                  Additional options passed to Document.updateDocuments
   * @returns {Promise<TDocument[]>}            An array of updated data once the operation is complete
   */
  async updateAll(transformation, condition=null, options={}) {
    const hasTransformer = transformation instanceof Function;
    if ( !hasTransformer && (foundry.utils.getType(transformation) !== "Object") ) {
      throw new Error("You must provide a data object or transformation function");
    }
    const hasCondition = condition instanceof Function;
    const updates = [];
    for ( const doc of this ) {
      if ( hasCondition && !condition(doc) ) continue;
      const update = hasTransformer ? transformation(doc) : foundry.utils.deepClone(transformation);
      update._id = doc.id;
      updates.push(update);
    }
    return this.documentClass.updateDocuments(updates, options);
  }

  /* -------------------------------------------- */

  /**
   * Follow-up actions to take when a database operation modifies Documents in this DocumentCollection.
   * @param {DatabaseAction} action                   The database action performed
   * @param {TDocument[]} documents                   The array of modified Documents
   * @param {any[]} result                            The result of the database operation
   * @param {DatabaseOperation} operation             Database operation details
   * @param {User} user                               The User who performed the operation
   * @internal
   */
  _onModifyContents(action, documents, result, operation, user) {
    if ( operation.render && !operation.parent && documents.length ) {
      this.render(false, {renderContext: `${action}${documents[0].documentName}`, renderData: result});
    }
  }
}

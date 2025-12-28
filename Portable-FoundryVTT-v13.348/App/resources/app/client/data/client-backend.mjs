import DatabaseBackend from "@common/abstract/backend.mjs";
import SocketInterface from "../helpers/socket-interface.mjs";
import Hooks from "../helpers/hooks.mjs";
import {getDocumentClass} from "../utils/helpers.mjs";
import TokenDocument from "../documents/token.mjs";
import Actor from "../documents/actor.mjs";

/**
 * @import {
 *   DatabaseAction,
 *   DatabaseOperation,
 *   DatabaseGetOperation,
 *   DatabaseCreateOperation,
 *   DatabaseUpdateOperation,
 *   DatabaseDeleteOperation,
 *   DocumentSocketRequest
 * } from "@common/abstract/_types.mjs";
 * @import DocumentSocketResponse from "@common/abstract/socket.mjs";
 * @import Collection from "@common/utils/collection.mjs";
 * @import User from "../documents/user.mjs";
 */

/**
 * The client-side database backend implementation which handles Document modification operations.
 */
export default class ClientDatabaseBackend extends DatabaseBackend {

  /* -------------------------------------------- */
  /*  Get Operations                              */
  /* -------------------------------------------- */

  /**
   * @override
   * @ignore
   */
  async _getDocuments(documentClass, operation, user) {
    const request = ClientDatabaseBackend.#buildRequest(documentClass, "get", operation);
    const response = await ClientDatabaseBackend.#dispatchRequest(request);
    if ( operation.index ) return response.result;
    return response.result.map(data => documentClass.fromSource(data, {pack: operation.pack}));
  }

  /* -------------------------------------------- */
  /*  Create Operations                           */
  /* -------------------------------------------- */

  /**
   * @override
   * @ignore
   */
  async _createDocuments(documentClass, operation, user) {
    user ||= game.user;
    await ClientDatabaseBackend.#preCreateDocumentArray(documentClass, operation, user);
    if ( !operation.data.length ) return [];
    /** @deprecated since v12 */
    // Legacy support for temporary creation option
    if ( "temporary" in operation ) {
      foundry.utils.logCompatibilityWarning("It is no longer supported to create temporary documents using the "
        + "Document.createDocuments API. Use the new Document() constructor instead.", {since: 12, until: 14});
      if ( operation.temporary ) return operation.data;
    }
    const request = ClientDatabaseBackend.#buildRequest(documentClass, "create", operation);
    const response = await ClientDatabaseBackend.#dispatchRequest(request);
    return this.#handleCreateDocuments(response);
  }

  /* -------------------------------------------- */

  /**
   * Perform a standardized pre-creation workflow for all Document types.
   * This workflow mutates the operation data array.
   * @param {typeof ClientDocument} documentClass
   * @param {DatabaseCreateOperation} operation
   * @param {User} user
   */
  static async #preCreateDocumentArray(documentClass, operation, user) {
    const {data, noHook, pack, parent, ...options} = operation;
    const type = documentClass.documentName;
    const toCreate = [];
    const documents = [];
    for ( let d of data ) {

      // Clean input data
      d = ( d instanceof foundry.abstract.DataModel ) ? d.toObject() : foundry.utils.expandObject(d);
      d = documentClass.migrateData(d);
      const createData = foundry.utils.deepClone(d); // Copy for later passing original input data to preCreate

      // Create pending document
      let doc;
      try {
        doc = new documentClass(createData, {parent, pack});
      } catch(err) {
        Hooks.onError("ClientDatabaseBackend##preCreateDocumentArray", err, {id: d._id, log: "error", notify: "error"});
        continue;
      }

      // Call per-document workflows
      let documentAllowed = await doc._preCreate(d, options, user) ?? true;
      documentAllowed &&= (noHook || Hooks.call(`preCreate${type}`, doc, d, options, user.id));
      if ( documentAllowed === false ) {
        console.debug(`${CONST.vtt} | ${type} creation prevented by _preCreate`);
        continue;
      }
      documents.push(doc);
      toCreate.push(d);
    }
    operation.data = toCreate;
    if ( !documents.length ) return;

    // Call final pre-operation workflow
    Object.assign(operation, options); // Hooks may have changed options
    const operationAllowed = await documentClass._preCreateOperation(documents, operation, user);
    if ( operationAllowed === false ) {
      console.debug(`${CONST.vtt} | ${type} creation operation prevented by _preCreateOperation`);
      operation.data = [];
    }
    else operation.data = documents;
  }

  /* -------------------------------------------- */

  /**
   * Handle a SocketResponse from the server when one or multiple documents were created.
   * @param {foundry.abstract.DocumentSocketResponse} response  A document modification socket response
   * @returns {Promise<ClientDocument[]>}  An Array of created Document instances
   */
  async #handleCreateDocuments(response) {
    const {type, operation, result, userId} = response;
    const documentClass = getDocumentClass(type);
    const parent = /** @type {ClientDocument|null} */ operation.parent = await this._getParent(operation);
    const collection = ClientDatabaseBackend.#getCollection(documentClass, operation);
    const user = game.users.get(userId);
    const {pack, parentUuid, syntheticActorUpdate, ...options} = operation;
    operation.data = response.result; // Record created data objects back to the operation

    // Initial descendant document events
    const preArgs = [result, options, userId];
    parent?._dispatchDescendantDocumentEvents("preCreate", collection.name, preArgs);

    // Create documents and prepare post-creation callback functions
    const callbacks = result.map(data => {
      const doc = collection.createDocument(data, {parent, pack});
      collection.set(doc.id, doc, options);
      return () => {
        doc._onCreate(data, options, userId);
        Hooks.callAll(`create${type}`, doc, options, userId);
        return doc;
      };
    });
    parent?.reset();
    let documents = callbacks.map(fn => fn());

    // Call post-operation workflows
    const postArgs = [documents, result, options, userId];
    parent?._dispatchDescendantDocumentEvents("onCreate", collection.name, postArgs);
    await documentClass._onCreateOperation(documents, operation, user);
    collection._onModifyContents("create", documents, result, operation, user);

    // Log and return result
    if ( CONFIG.debug.documents ) this._logOperation("Created", type, documents, {level: "info", parent, pack});
    if ( syntheticActorUpdate ) documents = ClientDatabaseBackend.#adjustActorDeltaResponse(documents);
    return documents;
  }

  /* -------------------------------------------- */
  /*  Update Operations                           */
  /* -------------------------------------------- */

  /**
   * @override
   * @ignore
   */
  async _updateDocuments(documentClass, operation, user) {
    user ||= game.user;
    await ClientDatabaseBackend.#preUpdateDocumentArray(documentClass, operation, user);
    if ( !operation.updates.length ) return [];
    const request = ClientDatabaseBackend.#buildRequest(documentClass, "update", operation);
    const response = await ClientDatabaseBackend.#dispatchRequest(request);
    return this.#handleUpdateDocuments(response);
  }

  /* -------------------------------------------- */

  /**
   * Perform a standardized pre-update workflow for all Document types.
   * This workflow mutates the operation updates array.
   * @param {typeof ClientDocument} documentClass
   * @param {DatabaseUpdateOperation} operation
   * @param {User} user
   */
  static async #preUpdateDocumentArray(documentClass, operation, user) {
    const collection = ClientDatabaseBackend.#getCollection(documentClass, operation);
    const type = documentClass.documentName;
    const {updates, restoreDelta, noHook, pack, parent, ...options} = operation;

    // Ensure all Documents which are update targets have been loaded
    await ClientDatabaseBackend.#loadCompendiumDocuments(collection, updates);

    // Iterate over requested changes
    const toUpdate = [];
    const documents = [];
    for ( const update of updates ) {
      if ( !update._id ) throw new Error("You must provide an _id for every object in the update data Array.");

      // Retrieve the target document and the request changes
      let changes;
      if ( update instanceof foundry.abstract.DataModel ) changes = update.toObject();
      else changes = foundry.utils.expandObject(update);
      const doc = collection.get(update._id, {strict: true, invalid: true});

      // Migrate provided changes, including document sub-type
      const addType = ("type" in doc) && !("type" in changes);
      documentClass.schema._addTypes(doc._source, changes);
      changes = documentClass.migrateData(changes);

      // Use the original update object if it was expanded
      if ( changes !== update ) {
        for ( const key in update ) delete update[key];
        changes = Object.assign(update, changes);
      }

      // Perform pre-update operations
      let documentAllowed = await doc._preUpdate(changes, options, user) ?? true;
      documentAllowed &&= (noHook || Hooks.call(`preUpdate${type}`, doc, changes, options, user.id));
      if ( documentAllowed === false ) {
        console.debug(`${CONST.vtt} | ${type} update prevented during pre-update`);
        continue;
      }

      // Attempt updating the document to validate the changes
      let diff = {};
      try {
        diff = doc.updateSource(changes, {dryRun: true, fallback: false, restoreDelta, recursive: options.recursive});
      } catch(err) {
        ui.notifications.error(err.message.split("] ").pop());
        Hooks.onError("ClientDatabaseBackend##preUpdateDocumentArray", err, {id: doc.id, log: "error"});
        continue;
      }

      // Retain only the differences against the current source
      if ( options.diff ) {
        if ( foundry.utils.isEmpty(diff) ) continue;
        diff._id = doc.id;
        changes = diff;
      }
      // TODO: We don't strip out the types added for TypedSchemaFields by the updateSource call above
      // that didn't actually change. Is this a problem? #11865
      else if ( addType ) delete changes.type;
      documents.push(doc);
      toUpdate.push(changes);
    }
    operation.updates = toUpdate;
    if ( !toUpdate.length ) return;

    // Call final pre-operation workflow
    Object.assign(operation, options); // Hooks may have changed options
    const operationAllowed = await documentClass._preUpdateOperation(documents, operation, user);
    if ( operationAllowed === false ) {
      console.debug(`${CONST.vtt} | ${type} creation operation prevented by _preUpdateOperation`);
      operation.updates = [];
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle a SocketResponse from the server when one or multiple documents were updated.
   * @param {foundry.abstract.DocumentSocketResponse} response  A document modification socket response
   * @returns {Promise<ClientDocument[]>}  An Array of updated Document instances
   */
  async #handleUpdateDocuments(response) {
    const {type, operation, result, userId} = response;
    const documentClass = getDocumentClass(type);
    const parent = /** @type {ClientDocument|null} */ operation.parent = await this._getParent(operation);
    const collection = ClientDatabaseBackend.#getCollection(documentClass, operation);
    const user = game.users.get(userId);
    const {pack, parentUuid, syntheticActorUpdate, ...options} = operation;
    operation.updates = response.result; // Record update data objects back to the operation

    // Ensure all Documents which are update targets have been loaded.
    await ClientDatabaseBackend.#loadCompendiumDocuments(collection, operation.updates);

    // Pre-operation actions
    const preArgs = [result, options, userId];
    parent?._dispatchDescendantDocumentEvents("preUpdate", collection.name, preArgs);

    // Perform updates and create a callback function for each document
    const callbacks = [];
    const changes = [];
    for ( let change of result ) {
      const doc = collection.get(change._id, {strict: false});
      if ( !doc ) continue;
      change = doc.updateSource(change, options);
      change._id = doc.id;
      collection.set(doc.id, doc, options);
      callbacks.push(() => {
        change = documentClass.shimData(change);
        doc._onUpdate(change, options, userId);
        Hooks.callAll(`update${type}`, doc, change, options, userId);
        changes.push(change);
        return doc;
      });
    }
    parent?.reset();
    let documents = callbacks.map(fn => fn());
    operation.updates = changes;

    // Post-operation actions
    const postArgs = [documents, changes, options, userId];
    parent?._dispatchDescendantDocumentEvents("onUpdate", collection.name, postArgs);
    await documentClass._onUpdateOperation(documents, operation, user);
    collection._onModifyContents("update", documents, changes, operation, user);

    // Log and return result
    if ( CONFIG.debug.documents ) this._logOperation("Updated", type, documents, {level: "debug", parent, pack});
    if ( syntheticActorUpdate ) documents = ClientDatabaseBackend.#adjustActorDeltaResponse(documents);
    return documents;
  }

  /* -------------------------------------------- */
  /*  Delete Operations                           */
  /* -------------------------------------------- */

  /**
   * @override
   * @ignore
   */
  async _deleteDocuments(documentClass, operation, user) {
    user ||= game.user;
    await ClientDatabaseBackend.#preDeleteDocumentArray(documentClass, operation, user);
    if ( !operation.ids.length ) return operation.ids;
    const request = ClientDatabaseBackend.#buildRequest(documentClass, "delete", operation);
    const response = await ClientDatabaseBackend.#dispatchRequest(request);
    return this.#handleDeleteDocuments(response);
  }

  /* -------------------------------------------- */

  /**
   * Perform a standardized pre-delete workflow for all Document types.
   * This workflow mutates the operation ids array.
   * @param {typeof ClientDocument} documentClass
   * @param {DatabaseDeleteOperation} operation
   * @param {User} user
   */
  static async #preDeleteDocumentArray(documentClass, operation, user) {
    const {ids: explicitIds, deleteAll, noHook, pack, parent, ...options} = operation;
    const collection = ClientDatabaseBackend.#getCollection(documentClass, operation);
    const type = documentClass.documentName;

    // Ensure all Documents which are deletion targets have been loaded
    const ids = deleteAll ? Array.from(collection.index?.keys() ?? collection.keys()) : explicitIds;
    await ClientDatabaseBackend.#loadCompendiumDocuments(collection, ids);

    // Iterate over ids requested for deletion
    const toDelete = [];
    const documents = [];
    for ( const id of ids ) {
      const doc = collection.get(id, {strict: true, invalid: true});
      let documentAllowed = await doc._preDelete(options, user) ?? true;
      documentAllowed &&= (noHook || Hooks.call(`preDelete${type}`, doc, options, user.id));
      if ( documentAllowed === false ) {
        console.debug(`${CONST.vtt} | ${type} deletion prevented during pre-delete`);
        continue;
      }
      toDelete.push(id);
      documents.push(doc);
    }
    operation.ids = toDelete;
    if ( !toDelete.length ) return;

    // Call final pre-operation workflow
    Object.assign(operation, options); // Hooks may have changed options
    const operationAllowed = await documentClass._preDeleteOperation(documents, operation, user);
    if ( operationAllowed === false ) {
      console.debug(`${CONST.vtt} | ${type} creation operation prevented by _preDeleteOperation`);
      operation.ids = [];
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle a SocketResponse from the server where Documents are deleted.
   * @param {DocumentSocketResponse} response  A document modification socket response
   * @returns {Promise<ClientDocument[]>}  An Array of deleted Document instances
   */
  async #handleDeleteDocuments(response) {
    const {type, operation, result, userId} = response;
    const documentClass = getDocumentClass(type);
    const parent = /** @type {ClientDocument|null} */ operation.parent = await this._getParent(operation);
    const collection = ClientDatabaseBackend.#getCollection(documentClass, operation);
    const user = game.users.get(userId);
    const {deleteAll, pack, parentUuid, syntheticActorUpdate, ...options} = operation;
    operation.ids = response.result; // Record deleted document ids back to the operation

    await ClientDatabaseBackend.#loadCompendiumDocuments(collection, operation.ids);

    // Pre-operation actions
    const preArgs = [result, options, userId];
    parent?._dispatchDescendantDocumentEvents("preDelete", collection.name, preArgs);

    // Perform deletions and create a callback function for each document
    const callbacks = [];
    const ids = [];
    for ( const id of result ) {
      const doc = collection.get(id, {strict: false});
      if ( !doc ) continue;
      collection.delete(id);
      callbacks.push(() => {
        doc._onDelete(options, userId);
        Hooks.callAll(`delete${type}`, doc, options, userId);
        ids.push(id);
        return doc;
      });
    }
    parent?.reset();
    let documents = callbacks.map(fn => fn());
    operation.ids = ids;

    // Post-operation actions
    const postArgs = [documents, ids, options, userId];
    parent?._dispatchDescendantDocumentEvents("onDelete", collection.name, postArgs);
    await documentClass._onDeleteOperation(documents, operation, user);
    collection._onModifyContents("delete", documents, ids, operation, user);

    // Log and return result
    if ( CONFIG.debug.documents ) this._logOperation("Deleted", type, documents, {level: "info", parent, pack});
    if ( syntheticActorUpdate ) documents = ClientDatabaseBackend.#adjustActorDeltaResponse(documents);
    return documents;
  }

  /* -------------------------------------------- */
  /*  Socket Workflows                            */
  /* -------------------------------------------- */

  /**
   * Activate the Socket event listeners used to receive responses from events which modify database documents
   * @param {io.Socket} socket                           The active game socket
   * @internal
   * @ignore
   */
  activateSocketListeners(socket) {
    socket.on("modifyDocument", this.#onModifyDocument.bind(this));
  }

  /* -------------------------------------------- */

  /**
   * Handle a socket response broadcast back from the server.
   * @param {DocumentSocketResponse} response  A document modification socket response
   */
  #onModifyDocument(response) {
    switch ( response.action ) {
      case "create":
        this.#handleCreateDocuments(response);
        break;
      case "update":
        this.#handleUpdateDocuments(response);
        break;
      case "delete":
        this.#handleDeleteDocuments(response);
        break;
      default:
        throw new Error(`Invalid Document modification action ${response.action} provided`);
    }

    // Update user last activity
    const user = game.users.get(response.userId);
    if ( user ) user.lastActivityTime = Date.now();
  }

  /* -------------------------------------------- */
  /*  Helper Methods                              */
  /* -------------------------------------------- */

  /** @inheritDoc */
  getFlagScopes() {
    if ( this.#flagScopes ) return this.#flagScopes;
    const scopes = ["core", "world", game.system.id];
    for ( const module of game.modules ) {
      if ( module.active ) scopes.push(module.id);
    }
    return this.#flagScopes = scopes;
  }

  /**
   * A cached array of valid flag scopes which can be read and written.
   * @type {string[]}
   */
  #flagScopes;

  /* -------------------------------------------- */

  /** @inheritDoc */
  getCompendiumScopes() {
    return Array.from(game.packs.keys());
  }

  /* -------------------------------------------- */

  /** @override */
  _log(level, message) {
    globalThis.logger[level](`${CONST.vtt} | ${message}`);
  }

  /* -------------------------------------------- */

  /**
   * Obtain the document collection for a given Document class and database operation.
   * @param {typeof ClientDocument} documentClass   The Document class being operated upon
   * @param {object} operation                The database operation being performed
   * @param {ClientDocument|null} operation.parent  A parent Document, if applicable
   * @param {string|null} operation.pack        A compendium pack identifier, if applicable
   * @returns {DocumentCollection|CompendiumCollection}  The relevant collection instance for this request
   */
  static #getCollection(documentClass, {parent, pack}) {
    const documentName = documentClass.documentName;
    if ( parent ) return parent.getEmbeddedCollection(documentName);
    if ( pack ) {
      const collection = game.packs.get(pack);
      return documentName === "Folder" ? collection.folders : collection;
    }
    return game.collections.get(documentName);
  }

  /* -------------------------------------------- */

  /**
   * Structure a database operation as a web socket request.
   * @param {typeof ClientDocument} documentClass
   * @param {DatabaseAction} action
   * @param {DatabaseOperation} operation
   * @returns {DocumentSocketRequest}
   */
  static #buildRequest(documentClass, action, operation) {
    const request = {type: documentClass.documentName, action, operation};
    if ( operation.parent ) { // Don't send full parent data
      operation.parentUuid = operation.parent.uuid;
      ClientDatabaseBackend.#adjustActorDeltaRequest(documentClass, request);
      delete operation.parent;
    }
    return request;
  }

  /* -------------------------------------------- */

  /**
   * Dispatch a document modification socket request to the server.
   * @param {DocumentSocketRequest} request
   * @returns {DocumentSocketResponse}
   */
  static async #dispatchRequest(request) {
    const responseData = await SocketInterface.dispatch("modifyDocument", request);
    return new foundry.abstract.DocumentSocketResponse(responseData);
  }

  /* -------------------------------------------- */

  /**
   * Ensure the given list of documents is loaded into the compendium collection so that they can be retrieved by
   * subsequent operations.
   * @param {Collection} collection        The candidate collection.
   * @param {object[]|string[]} documents  An array of update deltas, or IDs, depending on the operation.
   */
  static async #loadCompendiumDocuments(collection, documents) {
    // Ensure all Documents which are update targets have been loaded
    if ( collection instanceof foundry.documents.collections.CompendiumCollection ) {
      const ids = documents.reduce((arr, doc) => {
        const id = doc._id ?? doc;
        if ( id && !collection.has(id) ) arr.push(id);
        return arr;
      }, []);
      await collection.getDocuments({_id__in: ids});
    }
  }

  /* -------------------------------------------- */
  /*  Token and ActorDelta Special Case           */
  /* -------------------------------------------- */

  /**
   * Augment a database operation with alterations needed to support ActorDelta and TokenDocuments.
   * @param {typeof ClientDocument} documentClass    The document class being operated upon
   * @param {DocumentSocketRequest} request                     The document modification socket request
   */
  static #adjustActorDeltaRequest(documentClass, request) {
    const operation = request.operation;
    const parent = operation.parent;

    // Translate updates to a token actor to the token's ActorDelta instead.
    if ( foundry.utils.isSubclass(documentClass, Actor) && (parent instanceof TokenDocument) ) {
      request.type = "ActorDelta";
      if ( "updates" in operation ) operation.updates[0]._id = parent.delta.id;
      operation.syntheticActorUpdate = true;
    }

    // Translate operations on a token actor's embedded children to the token's ActorDelta instead.
    const token = ClientDatabaseBackend.#getTokenAncestor(parent);
    if ( token && !(parent instanceof TokenDocument) ) {
      const {embedded} = foundry.utils.parseUuid(parent?.uuid) ?? {};
      if ( !embedded ) throw new Error(`Failed to parse uuid "${parent?.uuid}"`);
      operation.parentUuid = [token.delta.uuid, embedded?.slice(4).join(".")].filterJoin(".");
    }
  }

  /* -------------------------------------------- */

  /**
   * Retrieve a Document's Token ancestor, if it exists.
   * @param {ClientDocument|null} parent        The parent Document
   * @returns {TokenDocument|null}              The Token ancestor, or null
   */
  static #getTokenAncestor(parent) {
    if ( !parent ) return null;
    if ( parent instanceof TokenDocument ) return parent;
    return ClientDatabaseBackend.#getTokenAncestor(parent.parent);
  }

  /* -------------------------------------------- */

  /**
   * Build a CRUD response.
   * @param {ActorDelta[]} documents   An array of ActorDelta documents modified by a database workflow
   * @returns {ClientDocument[]}       The modified ActorDelta documents mapped to their synthetic Actor
   */
  static #adjustActorDeltaResponse(documents) {
    return documents.map(delta => delta.syntheticActor);
  }
}

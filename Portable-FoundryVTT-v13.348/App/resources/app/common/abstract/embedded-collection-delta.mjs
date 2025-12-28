import EmbeddedCollection from "./embedded-collection.mjs";

/**
 * @import { DataModelUpdateOptions } from "./_types.mjs";
 */

/**
 * An embedded collection delta contains delta source objects that can be compared against other objects inside a base
 * embedded collection, and generate new embedded Documents by combining them.
 * @template {Document} TDocument
 * @extends EmbeddedCollection<string, TDocument>
 */
export default class EmbeddedCollectionDelta extends EmbeddedCollection {
  /**
   * Maintain a list of IDs that are managed by this collection delta to distinguish from those IDs that are inherited
   * from the base collection.
   * @type {Set<string>}
   */
  #managedIds = new Set();

  /* -------------------------------------------- */

  /**
   * Maintain a list of IDs that are tombstone Documents.
   * @type {Set<string>}
   */
  #tombstones = new Set();

  /* -------------------------------------------- */

  /**
   * A convenience getter to return the corresponding base collection.
   * @type {EmbeddedCollection}
   */
  get baseCollection() {
    return this.model.getBaseCollection?.(this.name);
  }

  /* -------------------------------------------- */

  /**
   * A convenience getter to return the corresponding synthetic collection.
   * @type {EmbeddedCollection}
   */
  get syntheticCollection() {
    return this.model.syntheticActor?.getEmbeddedCollection(this.name);
  }

  /* -------------------------------------------- */

  /**
   * Determine whether a given ID is managed directly by this collection delta or inherited from the base collection.
   * @param {string} key  The Document ID.
   * @returns {boolean}
   */
  manages(key) {
    return this.#managedIds.has(key);
  }

  /* -------------------------------------------- */

  /**
   * Determine whether a given ID exists as a tombstone Document in the collection delta.
   * @param {string} key  The Document ID.
   * @returns {boolean}
   */
  isTombstone(key) {
    return this.#tombstones.has(key);
  }

  /* -------------------------------------------- */
  /*  Collection Initialization                   */
  /* -------------------------------------------- */

  /** @override */
  initialize({full=false, ...options} = {}) {
    const sc = this.syntheticCollection;
    this._initialized = false;
    this.#tombstones.clear();
    this.#managedIds.clear();
    if ( full ) this.clear();

    // Register tombstones and add custom managed records
    const initializedIds = new Set();
    for ( const obj of this._source ) {
      if ( obj._tombstone ) {
        this.#tombstones.add(obj._id);
        this.#managedIds.add(obj._id);
        continue;
      }
      let doc = sc?.get(obj._id);
      if ( doc ) super.set(doc.id, doc, {modifySource: false});
      else doc = this._initializeDocument(obj, options);
      if ( doc ) {
        initializedIds.add(doc.id);
        this.#managedIds.add(doc.id);
      }
    }

    // Add non-tombstone documents from the base collection
    if ( this.baseCollection?.size ) {
      for ( const baseDoc of this.baseCollection ) {
        if ( this.#managedIds.has(baseDoc.id) ) continue; // Skip managed Documents.
        let doc = sc?.get(baseDoc.id);
        if ( doc ) super.set(doc.id, doc, {modifySource: false});
        else doc = this._initializeDocument(baseDoc, options);
        if ( doc ) initializedIds.add(doc.id);
      }
    }

    // Remove any documents that no longer exist in source
    if ( this.size !== initializedIds.size ) {
      for ( const k of this.keys() ) {
        if ( !initializedIds.has(k) ) super.delete(k, {modifySource: false});
      }
    }

    this._initialized = true;
  }

  /* -------------------------------------------- */

  /** @override */
  createDocument(data, context={}) {
    return new this.documentClass(data, {
      ...context,
      parent: this.model.syntheticActor ?? this.model,
      parentCollection: this.name,
      pack: this.model.pack
    });
  }

  /* -------------------------------------------- */

  /**
   * Restore a Document so that it is no longer managed by the collection delta and instead inherits from the base
   * Document.
   * @param {string} id            The Document ID.
   * @returns {Promise<TDocument>} The restored Document.
   */
  async restoreDocument(id) {
    const docs = await this.restoreDocuments([id]);
    return docs.shift();
  }

  /* -------------------------------------------- */

  /**
   * Restore the given Documents so that they are no longer managed by the collection delta and instead inherit directly
   * from their counterparts in the base Actor.
   * @param {string[]} ids           The IDs of the Documents to restore.
   * @returns {Promise<TDocument[]>} An array of updated Document instances.
   */
  async restoreDocuments(ids) {
    if ( !this.model.syntheticActor ) return [];
    const baseActor = this.model.parent.baseActor;
    const embeddedName = this.documentClass.documentName;
    const {deltas, tombstones} = ids.reduce((obj, id) => {
      if ( !this.manages(id) ) return obj;
      const doc = baseActor.getEmbeddedCollection(this.name).get(id);
      if ( this.isTombstone(id) ) obj.tombstones.push(doc.toObject());
      else obj.deltas.push(doc.toObject());
      return obj;
    }, {deltas: [], tombstones: []});

    // For the benefit of downstream CRUD workflows, we emulate events from the perspective of the synthetic Actor.
    // Restoring an Item to the version on the base Actor is equivalent to updating that Item on the synthetic Actor
    // with the version of the Item on the base Actor.
    // Restoring an Item that has been deleted on the synthetic Actor is equivalent to creating a new Item on the
    // synthetic Actor with the contents of the version on the base Actor.
    // On the ActorDelta, those Items are removed from this collection delta so that they are once again 'linked' to the
    // base Actor's Item, as though they had never been modified from the original in the first place.

    let updated = [];
    if ( deltas.length ) {
      updated = await this.model.syntheticActor.updateEmbeddedDocuments(embeddedName, deltas, {
        diff: false, recursive: false, restoreDelta: true
      });
    }

    let created = [];
    if ( tombstones.length ) {
      created = await this.model.syntheticActor.createEmbeddedDocuments(embeddedName, tombstones, {
        keepId: true, restoreDelta: true
      });
    }

    return updated.concat(created);
  }

  /* -------------------------------------------- */

  /**
   * Prepare changes to this delta collection.
   * @param {object[]} changes                Candidate source changes.
   * @param {DataModelUpdateOptions} options  Options which determine how the new data is merged.
   * @internal
   */
  _prepareDeltaUpdate(changes, options) {
    for ( const change of changes ) {
      // If this entry is already managed, the update can be applied as normal.
      if ( !change._id || this.manages(change._id) ) continue;

      // Otherwise we must first adopt entry from the base collection.
      const existing = this.baseCollection.get(change._id)?._source;
      if ( existing ) foundry.utils.mergeObject(change, existing, {
        performDeletions: true,
        overwrite: false
      });
    }
  }

  /* -------------------------------------------- */
  /*  Collection Methods                          */
  /* -------------------------------------------- */

  /** @inheritdoc */
  set(key, value, options={}) {
    super.set(key, value, options);
    this.syntheticCollection?.set(key, value, options);
  }

  /* -------------------------------------------- */

  /** @override */
  _set(key, value, {restoreDelta=false}={}) {
    if ( restoreDelta ) return this._delete(key, {restoreDelta});
    if ( this.manages(key) ) this._source.findSplice(d => d._id === key, value._source);
    else this._source.push(value._source);
    this.#managedIds.add(key);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  delete(key, options={}) {
    super.delete(key, options);
    this.syntheticCollection?.delete(key, options);
  }

  /* -------------------------------------------- */

  /** @override */
  _delete(key, {restoreDelta=false}={}) {
    if ( !this.baseCollection ) return;

    // Remove the document from this collection, if it exists.
    if ( this.manages(key) ) {
      this._source.findSplice(entry => entry._id === key);
      this.#managedIds.delete(key);
      this.#tombstones.delete(key);
    }

    // If the document exists in the base collection, push a tombstone in its place.
    if ( !restoreDelta && this.baseCollection.has(key) ) {
      this._source.push({_id: key, _tombstone: true});
      this.#managedIds.add(key);
      this.#tombstones.add(key);
    }
  }
}

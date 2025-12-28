/**
 * @import {StringTreeEntryFilter, StringTreeNode, WordTreeEntry} from "@common/utils/_types.mjs";
 */


/**
 * This class is responsible for indexing all documents available in the world.
 * Stores documents using a word tree structure that allows for efficient searching.
 */
export default class DocumentIndex {
  constructor() {
    /**
     * A collection of WordTree structures for each document type.
     * @type {Record<string, WordTree>}
     */
    Object.defineProperty(this, "trees", {value: {}});

    /**
     * A reverse-lookup of a document's UUID to its parent node in the word tree.
     * @type {Record<string, StringTreeNode>}
     */
    Object.defineProperty(this, "uuids", {value: {}});
  }

  /**
   * While we are indexing, we store a Promise that resolves when the indexing is complete.
   * @type {Promise<void>|null}
   */
  #ready = null;

  /* -------------------------------------------- */

  /**
   * Returns a Promise that resolves when the indexing process is complete.
   * @returns {Promise<void>|null}
   */
  get ready() {
    return this.#ready;
  }

  /* -------------------------------------------- */

  /**
   * Index all available documents in the world and store them in a word tree.
   * @returns {Promise<void>}
   */
  async index() {
    // Conclude any existing indexing.
    await this.#ready;
    const indexedCollections = CONST.WORLD_DOCUMENT_TYPES.filter(c => {
      const documentClass = foundry.utils.getDocumentClass(c);
      return documentClass.metadata.indexed && documentClass.schema.has("name");
    });
    // TODO: Consider running this process in a web worker.
    const start = performance.now();
    return this.#ready = new Promise(resolve => {
      for ( const documentName of indexedCollections ) {
        this._indexWorldCollection(documentName);
      }

      for ( const pack of game.packs ) {
        if ( !indexedCollections.includes(pack.documentName) ) continue;
        this._indexCompendium(pack);
      }

      resolve();
      console.debug(`${CONST.vtt} | Document indexing complete in ${performance.now() - start}ms.`);
    });
  }

  /* -------------------------------------------- */

  /**
   * Return entries that match the given string prefix.
   * @param {string} prefix                     The prefix.
   * @param {object} [options]                  Additional options to configure behaviour.
   * @param {string[]} [options.documentTypes]  Optionally provide an array of document types. Only entries of that type
   *                                            will be searched for.
   * @param {number} [options.limit=10]         The maximum number of items per document type to retrieve. It is
   *                                            important to set this value as very short prefixes will naturally match
   *                                            large numbers of entries.
   * @param {StringTreeEntryFilter} [options.filterEntries]         A filter function to apply to each candidate entry.
   * @param {DOCUMENT_OWNERSHIP_LEVELS|string} [options.ownership]  Only return entries that the user meets this
   *                                                                ownership level for.
   * @returns {Record<string, WordTreeEntry[]>} A number of entries that have the given prefix, grouped by document
   *                                            type.
   */
  lookup(prefix, {limit=10, documentTypes=[], ownership, filterEntries}={}) {
    const types = documentTypes.length ? documentTypes : Object.keys(this.trees);
    if ( ownership !== undefined ) {
      const originalFilterEntries = filterEntries ?? (() => true);
      filterEntries = entry => {
        return originalFilterEntries(entry) && DocumentIndex.#filterEntryForOwnership(entry, ownership);
      };
    }
    const results = {};
    for ( const type of types ) {
      results[type] = [];
      const tree = this.trees[type];
      if ( !tree ) continue;
      results[type].push(...tree.lookup(prefix, { limit, filterEntries }));
    }
    return results;
  }

  /* -------------------------------------------- */

  /**
   * Add an entry to the index.
   * @param {Document} doc  The document entry.
   */
  addDocument(doc) {
    if ( !doc.constructor.metadata?.indexed ) return;
    if ( doc.pack ) {
      if ( doc.isEmbedded ) return; // Only index primary documents inside compendium packs
      const pack = game.packs.get(doc.pack);
      const index = pack.index.get(doc.id);
      if ( index ) this._addLeaf(index, {pack});
    }
    else this._addLeaf(doc);
  }

  /* -------------------------------------------- */

  /**
   * Remove an entry from the index.
   * @param {Document} doc  The document entry.
   */
  removeDocument(doc) {
    const node = this.uuids[doc.uuid];
    if ( !node ) return;
    node[foundry.utils.StringTree.leaves].findSplice(e => e.uuid === doc.uuid);
    delete this.uuids[doc.uuid];
  }

  /* -------------------------------------------- */

  /**
   * Replace an entry in the index with an updated one.
   * @param {Document} doc  The document entry.
   */
  replaceDocument(doc) {
    this.removeDocument(doc);
    this.addDocument(doc);
  }

  /* -------------------------------------------- */

  /**
   * Add a leaf node to the word tree index.
   * @param {Document|object} doc                  The document or compendium index entry to add.
   * @param {object} [options]                     Additional information for indexing.
   * @param {CompendiumCollection} [options.pack]  The compendium that the index belongs to.
   * @protected
   */
  _addLeaf(doc, {pack}={}) {
    const entry = {entry: doc, documentName: doc.documentName, uuid: doc.uuid};
    if ( pack ) foundry.utils.mergeObject(entry, {
      documentName: pack.documentName,
      uuid: `Compendium.${pack.collection}.${doc._id}`,
      pack: pack.collection
    });
    const tree = this.trees[entry.documentName] ??= new foundry.utils.WordTree();
    this.uuids[entry.uuid] = tree.addLeaf(doc.name, entry);
  }

  /* -------------------------------------------- */

  /**
   * Aggregate the compendium index and add it to the word tree index.
   * @param {CompendiumCollection} pack  The compendium pack.
   * @protected
   */
  _indexCompendium(pack) {
    for ( const entry of pack.index ) {
      this._addLeaf(entry, {pack});
    }
  }

  /* -------------------------------------------- */

  /**
   * Add all of a parent document's embedded documents to the index.
   * @param {Document} parent  The parent document.
   * @protected
   */
  _indexEmbeddedDocuments(parent) {
    const embedded = parent.constructor.metadata.embedded;
    for ( const embeddedName of Object.keys(embedded) ) {
      if ( !CONFIG[embeddedName].documentClass.metadata.indexed ) continue;
      for ( const doc of parent[embedded[embeddedName]] ) {
        this._addLeaf(doc);
      }
    }
  }

  /* -------------------------------------------- */

  /**
   * Aggregate all documents and embedded documents in a world collection and add them to the index.
   * @param {string} documentName  The name of the documents to index.
   * @protected
   */
  _indexWorldCollection(documentName) {
    const cls = CONFIG[documentName].documentClass;
    const collection = cls.metadata.collection;
    for ( const doc of game[collection] ) {
      this._addLeaf(doc);
      this._indexEmbeddedDocuments(doc);
    }
  }

  /* -------------------------------------------- */
  /*  Helpers                                     */
  /* -------------------------------------------- */

  /**
   * Check if the given entry meets the given ownership requirements.
   * @param {WordTreeEntry} entry                         The candidate entry.
   * @param {DOCUMENT_OWNERSHIP_LEVELS|string} ownership  The ownership.
   * @returns {boolean}
   */
  static #filterEntryForOwnership({ uuid, pack }, ownership) {
    if ( pack ) return game.packs.get(pack)?.testUserPermission(game.user, ownership);
    return foundry.utils.fromUuidSync(uuid)?.testUserPermission(game.user, ownership);
  }
}

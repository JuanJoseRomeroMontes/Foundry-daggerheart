import DocumentCollection from "./document-collection.mjs";
import DirectoryCollectionMixin from "./directory-collection-mixin.mjs";
import {getDocumentClass} from "../../utils/helpers.mjs";

/**
 * @import Collection from "@common/utils/collection.mjs";
 * @import Document from "@common/abstract/document.mjs";
 * @import DocumentDirectory from "../../applications/sidebar/document-directory.mjs";
 * @import CompendiumCollection from "../collections/compendium-collection.mjs";
 * @import {FromCompendiumOptions} from "../../_types.mjs";
 * @import Folder from "../folder.mjs";
 */

/**
 * A collection of world-level Document objects with a singleton instance per primary Document type.
 * Each primary Document type has an associated subclass of WorldCollection which contains them.
 * @template {Document} TDocument
 * @extends DocumentCollection<TDocument>
 * @abstract
 * @category Collections
 *
 * @see {@link foundry.Game#collections}
 */
export default class WorldCollection extends DirectoryCollectionMixin(DocumentCollection) {

  /**
   * Reference the set of Folders which contain documents in this collection
   * @type {Collection<string, Folder>}
   */
  get folders() {
    if ( !game.folders ) return new foundry.utils.Collection();
    return game.folders.reduce((collection, folder) => {
      if (folder.type === this.documentName) {
        collection.set(folder.id, folder);
      }
      return collection;
    }, new foundry.utils.Collection());
  }

  /**
   * Return a reference to the SidebarDirectory application for this WorldCollection.
   * @type {DocumentDirectory}
   */
  get directory() {
    const doc = getDocumentClass(this.constructor.documentName);
    return ui[doc.metadata.collection];
  }

  /* -------------------------------------------- */

  /**
   * Return a reference to the singleton instance of this WorldCollection, or null if it has not yet been created.
   * @type {WorldCollection}
   */
  static get instance() {
    return game.collections.get(this.documentName);
  }

  /* -------------------------------------------- */
  /*  Collection Methods                          */
  /* -------------------------------------------- */

  /** @override */
  _getVisibleTreeContents(entry) {
    return this.contents.filter(c => c.visible);
  }

  /* -------------------------------------------- */

  /**
   * Import a Document from a Compendium collection, adding it to the current World.
   * @param {CompendiumCollection} pack The CompendiumCollection instance from which to import
   * @param {string} id             The ID of the compendium entry to import
   * @param {object} [updateData]   Optional additional data used to modify the imported Document before it is created
   * @param {object} [options]      Optional arguments passed to the
   *                                {@link foundry.documents.abstract.WorldCollection#fromCompendium} and
   *                                {@link foundry.abstract.Document.create} methods
   * @returns {Promise<TDocument>}  The imported Document instance
   */
  async importFromCompendium(pack, id, updateData={}, options={}) {
    const cls = this.documentClass;
    if (pack.documentName !== cls.documentName) {
      throw new Error(`The ${pack.documentName} Document type provided by Compendium ${pack.collection} is incorrect for this Collection`);
    }

    // Prepare the source data from which to create the Document
    const document = await pack.getDocument(id);
    const sourceData = this.fromCompendium(document, options);
    const createData = foundry.utils.mergeObject(sourceData, updateData);

    // Create the Document
    console.log(`${CONST.vtt} | Importing ${cls.documentName} ${document.name} from ${pack.collection}`);
    this.directory.activate();
    options.fromCompendium = true;
    return this.documentClass.create(createData, options);
  }

  /* -------------------------------------------- */

  /**
   * Apply data transformations when importing a Document from a Compendium pack
   * @param {TDocument|object} document        The source Document, or a plain data object
   * @param {FromCompendiumOptions} [options]  Additional options which modify how the document is imported
   * @returns {object}                         The processed data ready for world Document creation
   */
  fromCompendium(document, {clearFolder=false, clearState=true, clearSort=true, clearOwnership=true, keepId=false,
    ...rest}={}) {
    /** @deprecated since v12 */
    if ( "addFlags" in rest ) {
      foundry.utils.logCompatibilityWarning("The addFlags option for WorldCompendium#fromCompendium has been removed. ",
        { since: 12, until: 14 });
    }

    // Prepare the data structure
    let data = document;
    if (document instanceof foundry.abstract.Document) {
      data = document.toObject();
      if ( document.pack ) foundry.utils.setProperty(data, "_stats.compendiumSource", document.uuid);
    }

    // Eliminate certain fields
    if ( !keepId ) delete data._id;
    if ( clearFolder ) delete data.folder;
    if ( clearSort ) delete data.sort;
    if ( clearOwnership ) {
      const hadOwnership = "ownership" in data;
      document.constructor._clearFieldsRecursively(data, ["ownership"]);
      if ( hadOwnership ) {
        data.ownership = {
          default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE,
          [game.user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER
        };
      }
    }
    if ( clearState ) delete data.active;
    return data;
  }

  /* -------------------------------------------- */
  /*  Sheet Registration Methods                  */
  /* -------------------------------------------- */

  /**
   * Register a Document sheet class as a candidate which can be used to display Documents of a given type.
   * See {@link foundry.applications.apps.DocumentSheetConfig.registerSheet} for details.
   * @param {Array<*>} args      Arguments forwarded to the DocumentSheetConfig.registerSheet method
   *
   * @example Register a new ActorSheet subclass for use with certain Actor types.
   * ```js
   * foundry.documents.collections.Actors.registerSheet("dnd5e", ActorSheet5eCharacter, {
   *   types: ["character],
   *   makeDefault: true
   * });
   * ```
   */
  static registerSheet(...args) {
    foundry.applications.apps.DocumentSheetConfig.registerSheet(getDocumentClass(this.documentName), ...args);
  }

  /* -------------------------------------------- */

  /**
   * Unregister a Document sheet class, removing it from the list of available sheet Applications to use.
   * See {@link foundry.applications.apps.DocumentSheetConfig.unregisterSheet} for detauls.
   * @param {Array<*>} args      Arguments forwarded to the DocumentSheetConfig.unregisterSheet method
   *
   * @example Deregister the default ActorSheet subclass to replace it with others.
   * ```js
   * foundry.documents.collections.Actors.unregisterSheet("core", ActorSheet);
   * ```
   */
  static unregisterSheet(...args) {
    foundry.applications.apps.DocumentSheetConfig.unregisterSheet(getDocumentClass(this.documentName), ...args);
  }

  /* -------------------------------------------- */

  /**
   * Return an array of currently registered sheet classes for this Document type.
   * @type {DocumentSheet[]}
   */
  static get registeredSheets() {
    const sheets = new Set();
    for ( const t of Object.values(CONFIG[this.documentName].sheetClasses) ) {
      for ( const s of Object.values(t) ) sheets.add(s.cls);
    }
    return Array.from(sheets);
  }
}

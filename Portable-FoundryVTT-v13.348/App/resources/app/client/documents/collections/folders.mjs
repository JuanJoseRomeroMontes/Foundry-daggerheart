import WorldCollection from "../abstract/world-collection.mjs";
import JournalSheet from "@client/appv1/sheets/journal-sheet.mjs";

/** @import Folder from "../folder.mjs"; */

/**
 * The singleton collection of Folder documents which exist within the active World.
 * This Collection is accessible within the Game object as game.folders.
 * @extends {WorldCollection<Folder>}
 * @category Collections
 *
 * @see {@link foundry.documents.Folder}: The Folder document
 */
export default class Folders extends WorldCollection {

  /** @override */
  static documentName = "Folder";

  /**
   * Track which Folders are currently expanded in the UI
   * @type {Record<string, boolean>}
   * @internal
   */
  _expanded = {};

  /* -------------------------------------------- */

  /** @override */
  _onModifyContents(action, documents, result, operation, user) {
    this.initializeTree();
    const folderTypes = new Set(documents.map(f => f.type));
    for ( const type of folderTypes ) {
      if ( type === "Compendium" ) {
        game.packs.initializeTree();
        if ( operation.render && !operation.parent ) ui.compendium.render(false);
      } else {
        const collection = game.collections.get(type);
        collection.initializeTree();
        if ( operation.render && !operation.parent ) {
          collection.render(false, {renderContext: `${action}${this.documentName}`, renderData: result});
        }
      }
      if ( folderTypes.has("JournalEntry") ) this.#refreshJournalEntrySheets();
    }
  }

  /* -------------------------------------------- */

  /**
   * Refresh the display of any active JournalSheet instances where the folder list will change.
   */
  #refreshJournalEntrySheets() {
    for ( const app of Object.values(ui.windows) ) {
      if ( !(app instanceof JournalSheet) ) continue;
      app.submit();
    }
  }

  /* -------------------------------------------- */

  /** @override */
  render(force, options={}) {
    console.warn("The Folders collection is not directly rendered");
  }
}

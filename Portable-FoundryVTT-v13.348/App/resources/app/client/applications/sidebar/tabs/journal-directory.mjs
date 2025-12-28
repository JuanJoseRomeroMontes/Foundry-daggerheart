import DocumentDirectory from "../document-directory.mjs";

/**
 * @import JournalEntry from "@client/documents/journal-entry.mjs";
 */

/**
 * The World Journal.
 * @extends {DocumentDirectory<JournalEntry>}
 */
export default class JournalDirectory extends DocumentDirectory {

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    collection: "JournalEntry"
  };

  /** @override */
  static tabName = "journal";

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _getEntryContextOptions() {
    return [
      ...super._getEntryContextOptions(),
      {
        name: "SIDEBAR.JumpPin",
        icon: '<i class="fa-solid fa-crosshairs"></i>',
        condition: li => !!this.collection.get(li.dataset.entryId)?.sceneNote,
        callback: li => this.collection.get(li.dataset.entryId)?.panToNote()
      }
    ];
  }
}

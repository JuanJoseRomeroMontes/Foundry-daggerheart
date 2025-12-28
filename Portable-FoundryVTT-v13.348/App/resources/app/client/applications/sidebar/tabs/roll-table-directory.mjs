import DocumentDirectory from "../document-directory.mjs";

/**
 * @import RollTable from "@client/documents/roll-table.mjs";
 */

/**
 * The World RollTable directory listing.
 * @extends {DocumentDirectory<RollTable>}
 */
export default class RollTableDirectory extends DocumentDirectory {
  /** @override */
  static DEFAULT_OPTIONS = {
    collection: "RollTable"
  };

  /** @override */
  static tabName = "tables";

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _getEntryContextOptions() {
    return [
      {
        name: "TABLE.ACTIONS.DrawResult",
        icon: '<i class="fa-solid fa-dice-d20"></i>',
        callback: li => {
          const table = this.collection.get(li.dataset.entryId);
          table.draw({ roll: true, displayChat: true });
        }
      },
      ...super._getEntryContextOptions()
    ];
  }
}

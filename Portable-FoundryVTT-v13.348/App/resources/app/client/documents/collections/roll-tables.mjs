import WorldCollection from "../abstract/world-collection.mjs";

/** @import RollTable from "../roll-table.mjs" */

/**
 * The singleton collection of RollTable documents which exist within the active World.
 * This Collection is accessible within the Game object as game.tables.
 * @extends {WorldCollection<RollTable>}
 * @category Collections
 *
 * @see {@link foundry.documents.RollTable}: The RollTable document
 * @see {@link foundry.applications.sidebar.tabs.RollTableDirectory}: The RollTableDirectory
 *   sidebar directory
 */
export default class RollTables extends WorldCollection {

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /** @override */
  static documentName = "RollTable";

  /* -------------------------------------------- */

  /** @override */
  get directory() {
    return ui.tables;
  }

  /* -------------------------------------------- */

  /**
   * Register world settings related to RollTable documents
   */
  static registerSettings() {

    // Show Player Cursors
    game.settings.register("core", "animateRollTable", {
      name: "TABLE.AnimateSetting",
      hint: "TABLE.AnimateSettingHint",
      scope: "world",
      config: true,
      type: new foundry.data.fields.BooleanField({initial: true})
    });
  }
}

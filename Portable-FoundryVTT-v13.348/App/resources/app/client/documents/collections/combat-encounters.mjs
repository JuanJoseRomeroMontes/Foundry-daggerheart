import WorldCollection from "../abstract/world-collection.mjs";

/**
 * @import Combat from "../combat.mjs";
 */

/**
 * The singleton collection of Combat documents which exist within the active World.
 * This Collection is accessible within the Game object as game.combats.
 * @extends {WorldCollection<Combat>}
 * @category Collections
 *
 * @see {@link foundry.documents.Combat}: The Combat document
 * @see {@link foundry.applications.sidebar.tabs.CombatTracker}: The CombatTracker sidebar directory
 */
export default class CombatEncounters extends WorldCollection {

  /** @override */
  static documentName = "Combat";

  /* -------------------------------------------- */

  /**
   * Provide the settings object which configures the Combat document
   * @type {object}
   */
  static get settings() {
    return game.settings.get("core", foundry.documents.Combat.CONFIG_SETTING);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  get directory() {
    return ui.combat;
  }

  /* -------------------------------------------- */

  /**
   * Get an Array of Combat instances which apply to the current canvas scene
   * @type {Combat[]}
   */
  get combats() {
    return this.filter(c => (c.scene === null) || (c.scene === game.scenes.current));
  }

  /* -------------------------------------------- */

  /**
   * The currently active Combat instance.
   * @type {Combat}
   */
  get active() {
    return this.combats.find(c => c.active && (!c.scene || (c.scene === game.scenes.current)));
  }

  /* -------------------------------------------- */

  /**
   * The currently viewed Combat encounter
   * @type {Combat|null}
   */
  get viewed() {
    return ui.combat?.viewed ?? null;
  }
}

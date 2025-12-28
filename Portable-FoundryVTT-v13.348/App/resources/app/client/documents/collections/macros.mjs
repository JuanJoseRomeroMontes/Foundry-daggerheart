import WorldCollection from "../abstract/world-collection.mjs";

/** @import Macro from "../macro.mjs" */

/**
 * The singleton collection of Macro documents which exist within the active World.
 * This Collection is accessible within the Game object as game.macros.
 * @extends {WorldCollection<Macro>}
 * @category Collections
 *
 * @see {@link foundry.documents.Macro}: The Macro document
 * @see {@link foundry.applications.sidebar.tabs.MacroDirectory}: The MacroDirectory sidebar directory
 */
export default class Macros extends WorldCollection {

  /** @override */
  static documentName = "Macro";

  /* -------------------------------------------- */

  /** @override */
  get directory() {
    return ui.macros;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  fromCompendium(document, options={}) {
    const data = super.fromCompendium(document, options);
    if ( options.clearOwnership ) data.author = game.user.id;
    return data;
  }
}

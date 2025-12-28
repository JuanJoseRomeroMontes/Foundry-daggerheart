import DocumentDirectory from "../document-directory.mjs";

/**
 * @import Cards from "@client/documents/cards.mjs";
 */

/**
 * The World Cards directory listing.
 * @extends {DocumentDirectory<Cards>}
 */
export default class CardsDirectory extends DocumentDirectory {

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    collection: "Cards"
  };

  /** @override */
  static tabName = "cards";

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _getEntryContextOptions() {
    const options = super._getEntryContextOptions();
    const duplicate = options.find(o => o.name === "SIDEBAR.Duplicate");
    duplicate.condition = li => {
      if ( !game.user.isGM ) return false;
      const cards = this.collection.get(li.dataset.entryId);
      return cards.canClone;
    };
    return options;
  }
}

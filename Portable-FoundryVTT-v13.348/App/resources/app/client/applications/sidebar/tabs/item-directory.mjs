import DocumentDirectory from "../document-directory.mjs";

/**
 * @import Item from "@client/documents/item.mjs";
 */

/**
 * The World Item directory listing.
 * @extends {DocumentDirectory<Item>}
 */
export default class ItemDirectory extends DocumentDirectory {

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    collection: "Item"
  };

  /** @override */
  static tabName = "items";

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _getEntryContextOptions() {
    const options = super._getEntryContextOptions();
    return [{
      name: "ITEM.ViewArt",
      icon: '<i class="fa-solid fa-image"></i>',
      condition: li => {
        const item = game.items.get(li.dataset.entryId);
        const { img } = item.constructor.getDefaultArtwork(item._source);
        return item.img !== img;
      },
      callback: li => {
        const item = game.items.get(li.dataset.entryId);
        new foundry.applications.apps.ImagePopout({
          src: item.img,
          uuid: item.uuid,
          window: { title: item.name }
        }).render({ force: true });
      }
    }].concat(options);
  }
}

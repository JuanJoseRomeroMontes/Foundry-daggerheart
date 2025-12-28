import WorldCollection from "../abstract/world-collection.mjs";

/** @import Item from "../item.mjs"; */

/**
 * The singleton collection of Item documents which exist within the active World.
 * This Collection is accessible within the Game object as game.items.
 * @extends {WorldCollection<Item>}
 * @category Collections
 *
 * @see {@link foundry.documents.Item}: The Item document
 * @see {@link foundry.applications.sidebar.tabs.ItemDirectory}: The ItemDirectory sidebar directory
 */
export default class Items extends WorldCollection {

  /** @override */
  static documentName = "Item";
}

import Collection from "@common/utils/collection.mjs";
import DirectoryCollectionMixin from "../abstract/directory-collection-mixin.mjs";

/**
 * @import {CompendiumCollection} from "./_module.mjs";
 * @import Folder from "../folder.mjs";
 */

/**
 * A mapping of CompendiumCollection instances, one per Compendium pack
 * @extends {Collection<string, CompendiumCollection>}
 * @category Collections
 */
export default class CompendiumPacks extends DirectoryCollectionMixin(Collection) {

  /**
   * The Collection class name
   * @type {string}
   */
  get name() {
    return this.constructor.name;
  }

  /* -------------------------------------------- */

  /**
   * Get a Collection of Folders which contain Compendium Packs
   * @returns {Collection<string, Folder>}
   */
  get folders() {
    return game.folders.reduce((collection, folder) => {
      if ( folder.type === "Compendium" ) {
        collection.set(folder.id, folder);
      }
      return collection;
    }, new foundry.utils.Collection());
  }

  /* -------------------------------------------- */

  /** @override */
  _getVisibleTreeContents() {
    return this.contents.filter(pack => pack.visible);
  }

  /* -------------------------------------------- */

  /** @override */
  static _sortAlphabetical(a, b) {
    if ( a.metadata && b.metadata ) return a.metadata.label.localeCompare(b.metadata.label, game.i18n.lang);
    else return super._sortAlphabetical(a, b);
  }
}

import DocumentCollection from "../abstract/document-collection.mjs";

/**
 * @import Folder from "../folder.mjs";
 * @import CompendiumCollection from "./compendium-collection.mjs";
 */

/**
 * A Collection of Folder documents within a Compendium pack.
 * @extends {DocumentCollection<Folder>}
 * @category Collections
 */
export default class CompendiumFolderCollection extends DocumentCollection {
  constructor(pack, data=[]) {
    super(data);
    this.pack = pack;
  }

  /**
   * The CompendiumCollection instance that contains this CompendiumFolderCollection
   * @type {CompendiumCollection}
   */
  pack;

  /* -------------------------------------------- */

  /** @inheritDoc */
  get documentName() {
    return "Folder";
  }

  /* -------------------------------------------- */

  /** @override */
  render(force, options) {
    this.pack.render(force, options);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async updateAll(transformation, condition=null, options={}) {
    options.pack = this.collection;
    return super.updateAll(transformation, condition, options);
  }

  /* -------------------------------------------- */

  /** @override */
  _onModifyContents(action, documents, result, operation, user) {
    this.pack._onModifyContents(action, documents, result, operation, user);
  }
}

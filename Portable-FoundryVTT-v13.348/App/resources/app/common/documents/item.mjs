import Document from "../abstract/document.mjs";
import {mergeObject} from "../utils/helpers.mjs";
import * as fields from "../data/fields.mjs";

/**
 * @import {ItemData} from "./_types.mjs";
 * @import {DocumentPermissionTest} from "@common/abstract/_types.mjs";
 */

/**
 * The Item Document.
 * Defines the DataSchema and common behaviors for a Item which are shared between both client and server.
 * @extends {Document<ItemData>}
 * @mixes ItemData
 * @category Documents
 */
export default class BaseItem extends Document {

  /* -------------------------------------------- */
  /*  Model Configuration                         */
  /* -------------------------------------------- */

  /** @inheritdoc */
  static metadata = Object.freeze(mergeObject(super.metadata, {
    name: "Item",
    collection: "items",
    hasTypeData: true,
    indexed: true,
    compendiumIndexFields: ["_id", "name", "img", "type", "sort", "folder"],
    embedded: {ActiveEffect: "effects"},
    label: "DOCUMENT.Item",
    labelPlural: "DOCUMENT.Items",
    permissions: {
      create: BaseItem.#canCreate,
      delete: "OWNER"
    },
    schemaVersion: "13.341"
  }, {inplace: false}));

  /* ---------------------------------------- */

  /** @inheritdoc */
  static defineSchema() {
    const {BaseActiveEffect, BaseFolder} = foundry.documents;
    return {
      _id: new fields.DocumentIdField(),
      name: new fields.StringField({required: true, blank: false, textSearch: true}),
      type: new fields.DocumentTypeField(this),
      img: new fields.FilePathField({categories: ["IMAGE"], initial: data => {
        return this.implementation.getDefaultArtwork(data).img;
      }}),
      system: new fields.TypeDataField(this),
      effects: new fields.EmbeddedCollectionField(BaseActiveEffect),
      folder: new fields.ForeignDocumentField(BaseFolder),
      sort: new fields.IntegerSortField(),
      ownership: new fields.DocumentOwnershipField(),
      flags: new fields.DocumentFlagsField(),
      _stats: new fields.DocumentStatsField()
    };
  }

  /* ---------------------------------------- */

  /**
   * The default icon used for newly created Item documents
   * @type {string}
   */
  static DEFAULT_ICON = "icons/svg/item-bag.svg";

  /* -------------------------------------------- */

  /**
   * Determine default artwork based on the provided item data.
   * @param {ItemData} itemData  The source item data.
   * @returns {{img: string}}    Candidate item image.
   */
  static getDefaultArtwork(itemData) {
    return { img: this.DEFAULT_ICON };
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _initialize(options) {
    super._initialize(options);
    fields.DocumentStatsField._shimDocument(this);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  getUserLevel(user) {
    // Embedded Items require a special exception because they ignore their own ownership field.
    if ( this.parent ) return this.parent.getUserLevel(user);
    return super.getUserLevel(user);
  }

  /* -------------------------------------------- */

  /** @override */
  static canUserCreate(user) {
    return user.hasPermission("ITEM_CREATE");
  }

  /* -------------------------------------------- */

  /**
   * Is a User able to create a new Item?
   * Embedded Items depend on Actor ownership.
   * Otherwise, the ITEM_CREATE permission is required.
   * @type {DocumentPermissionTest}
   */
  static #canCreate(user, doc) {
    if ( doc.parent ) return doc.parent.testUserPermission(user, "OWNER");
    return user.hasPermission("ITEM_CREATE");
  }

  /* -------------------------------------------- */


  /** @inheritDoc */
  static migrateData(source) {
    fields.DocumentStatsField._migrateData(this, source);
    return super.migrateData(source);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  static shimData(source, options) {
    fields.DocumentStatsField._shimData(this, source, options);
    return super.shimData(source, options);
  }
}

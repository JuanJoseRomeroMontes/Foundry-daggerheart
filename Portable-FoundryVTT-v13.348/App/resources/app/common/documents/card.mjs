import Document from "../abstract/document.mjs";
import {mergeObject} from "../utils/helpers.mjs";
import * as fields from "../data/fields.mjs";
import * as CONST from "../constants.mjs";

/**
 * @import {CardData} from "./_types.mjs";
 * @import {DocumentPermissionTest} from "@common/abstract/_types.mjs";
 */

/**
 * The Card Document.
 * Defines the DataSchema and common behaviors for a Card which are shared between both client and server.
 * @extends {Document<CardData>}
 * @mixes CardData
 * @category Documents
 */
export default class BaseCard extends Document {

  /* -------------------------------------------- */
  /*  Model Configuration                         */
  /* -------------------------------------------- */

  /** @inheritdoc */
  static metadata = Object.freeze(mergeObject(super.metadata, {
    name: "Card",
    collection: "cards",
    hasTypeData: true,
    indexed: true,
    label: "DOCUMENT.Card",
    labelPlural: "DOCUMENT.CardPlural",
    permissions: {
      create: this.#canCreate,
      update: this.#canUpdate,
      delete: "OWNER"
    },
    compendiumIndexFields: ["name", "type", "suit", "sort"],
    schemaVersion: "13.341"
  }, {inplace: false}));

  /** @inheritdoc */
  static defineSchema() {
    return {
      _id: new fields.DocumentIdField(),
      name: new fields.StringField({required: true, blank: false, textSearch: true}),
      description: new fields.HTMLField(),
      type: new fields.DocumentTypeField(this, {initial: CONST.BASE_DOCUMENT_TYPE}),
      system: new fields.TypeDataField(this),
      suit: new fields.StringField({required: true}),
      value: new fields.NumberField({required: true}),
      back: new fields.SchemaField({
        name: new fields.StringField(),
        text: new fields.HTMLField(),
        img: new fields.FilePathField({categories: ["IMAGE", "VIDEO"]})
      }),
      faces: new fields.ArrayField(new fields.SchemaField({
        name: new fields.StringField(),
        text: new fields.HTMLField(),
        img: new fields.FilePathField({categories: ["IMAGE", "VIDEO"], initial: () => this.DEFAULT_ICON})
      })),
      face: new fields.NumberField({required: true, initial: null, integer: true, min: 0}),
      drawn: new fields.BooleanField(),
      origin: new fields.ForeignDocumentField(foundry.documents.BaseCards),
      width: new fields.NumberField({integer: true, positive: true}),
      height: new fields.NumberField({integer: true, positive: true}),
      rotation: new fields.AngleField(),
      sort: new fields.IntegerSortField(),
      flags: new fields.DocumentFlagsField(),
      _stats: new fields.DocumentStatsField()
    };
  }

  /**
   * The default icon used for a Card face that does not have a custom image set
   * @type {string}
   */
  static DEFAULT_ICON = "icons/svg/card-joker.svg";

  /** @override */
  static LOCALIZATION_PREFIXES = ["DOCUMENT", "CARD"];

  /* -------------------------------------------- */

  /**
   * Is a User able to create a new Card within this parent?
   * @type {DocumentPermissionTest}
   */
  static #canCreate(user, doc, data) {
    if ( user.isGM ) return true;                             // GM users can always create
    if ( doc.parent.type !== "deck" ) return true;            // Users can pass cards to card hands or piles
    return doc.parent.testUserPermission(user, "OWNER");      // Otherwise require owner permission of the parent document
  }

  /* -------------------------------------------- */

  /**
   * Is a user able to update an existing Card?
   * @type {DocumentPermissionTest}
   */
  static #canUpdate(user, doc, data) {
    if ( user.isGM ) return true;                               // GM users can always update
    const wasDrawn = new Set(["drawn", "_id"]);                 // Users can draw cards from a deck
    if ( new Set(Object.keys(data)).equals(wasDrawn) ) return true;
    return doc.parent.testUserPermission(user, "OWNER");        // Otherwise require owner permission of the parent document
  }
}

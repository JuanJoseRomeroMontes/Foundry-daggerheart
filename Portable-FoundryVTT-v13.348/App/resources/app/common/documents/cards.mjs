import Document from "../abstract/document.mjs";
import {mergeObject} from "../utils/helpers.mjs";
import * as fields from "../data/fields.mjs";

/**
 * @import {CardsData} from "./_types.mjs";
 */

/**
 * The Cards Document.
 * Defines the DataSchema and common behaviors for a Cards Document which are shared between both client and server.
 * @extends {Document<CardsData>}
 * @mixes CardsData
 * @category Documents
 */
export default class BaseCards extends Document {

  /* -------------------------------------------- */
  /*  Model Configuration                         */
  /* -------------------------------------------- */

  /** @inheritdoc */
  static metadata = Object.freeze(mergeObject(super.metadata, {
    name: "Cards",
    collection: "cards",
    indexed: true,
    compendiumIndexFields: ["_id", "name", "description", "img", "type", "sort", "folder"],
    embedded: {Card: "cards"},
    hasTypeData: true,
    label: "DOCUMENT.Cards",
    labelPlural: "DOCUMENT.CardsPlural",
    permissions: {
      create: "CARDS_CREATE",
      delete: "OWNER"
    },
    coreTypes: ["deck", "hand", "pile"],
    schemaVersion: "13.341"
  }, {inplace: false}));

  /** @inheritdoc */
  static defineSchema() {
    const {BaseCard, BaseFolder} = foundry.documents;
    return {
      _id: new fields.DocumentIdField(),
      name: new fields.StringField({required: true, blank: false, textSearch: true}),
      type: new fields.DocumentTypeField(this),
      description: new fields.HTMLField({textSearch: true}),
      img: new fields.FilePathField({categories: ["IMAGE", "VIDEO"], initial: () => this.DEFAULT_ICON}),
      system: new fields.TypeDataField(this),
      cards: new fields.EmbeddedCollectionField(BaseCard),
      width: new fields.NumberField({integer: true, positive: true}),
      height: new fields.NumberField({integer: true, positive: true}),
      rotation: new fields.AngleField(),
      displayCount: new fields.BooleanField(),
      folder: new fields.ForeignDocumentField(BaseFolder),
      sort: new fields.IntegerSortField(),
      ownership: new fields.DocumentOwnershipField(),
      flags: new fields.DocumentFlagsField(),
      _stats: new fields.DocumentStatsField()
    };
  }

  /** @override */
  static LOCALIZATION_PREFIXES = ["DOCUMENT", "CARDS"];

  /**
   * The default icon used for a cards stack that does not have a custom image set
   * @type {string}
   */
  static DEFAULT_ICON = "icons/svg/card-hand.svg";

  /* -------------------------------------------- */

  /** @inheritDoc */
  _initialize(options) {
    super._initialize(options);
    fields.DocumentStatsField._shimDocument(this);
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

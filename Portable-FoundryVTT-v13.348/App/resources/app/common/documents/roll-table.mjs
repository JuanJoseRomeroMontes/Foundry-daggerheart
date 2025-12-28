import Document from "../abstract/document.mjs";
import {mergeObject} from "../utils/helpers.mjs";
import * as fields from "../data/fields.mjs";

/**
 * @import {RollTableData} from "./_types.mjs";
 */

/**
 * The RollTable Document.
 * Defines the DataSchema and common behaviors for a RollTable which are shared between both client and server.
 * @extends {Document<RollTableData>}
 * @mixes RollTableData
 * @category Documents
 */
export default class BaseRollTable extends Document {

  /* -------------------------------------------- */
  /*  Model Configuration                         */
  /* -------------------------------------------- */

  /** @inheritDoc */
  static metadata = Object.freeze(mergeObject(super.metadata, {
    name: "RollTable",
    collection: "tables",
    indexed: true,
    compendiumIndexFields: ["_id", "name", "description", "img", "sort", "folder"],
    embedded: {TableResult: "results"},
    label: "DOCUMENT.RollTable",
    labelPlural: "DOCUMENT.RollTables",
    schemaVersion: "13.341"
  }, {inplace: false}));

  /** @override */
  static LOCALIZATION_PREFIXES = ["DOCUMENT", "TABLE"];

  /**
   * The default icon used for newly created Macro documents
   * @type {string}
   */
  static DEFAULT_ICON = "icons/svg/d20-grey.svg";

  /* -------------------------------------------- */

  /** @inheritDoc */
  static defineSchema() {
    const {BaseTableResult, BaseFolder} = foundry.documents;
    return {
      _id: new fields.DocumentIdField(),
      name: new fields.StringField({required: true, blank: false, textSearch: true}),
      img: new fields.FilePathField({categories: ["IMAGE"], initial: () => this.DEFAULT_ICON}),
      description: new fields.HTMLField({textSearch: true}),
      results: new fields.EmbeddedCollectionField(BaseTableResult),
      formula: new fields.StringField(),
      replacement: new fields.BooleanField({initial: true}),
      displayRoll: new fields.BooleanField({initial: true}),
      folder: new fields.ForeignDocumentField(BaseFolder),
      sort: new fields.IntegerSortField(),
      ownership: new fields.DocumentOwnershipField(),
      flags: new fields.DocumentFlagsField(),
      _stats: new fields.DocumentStatsField()
    };
  }

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

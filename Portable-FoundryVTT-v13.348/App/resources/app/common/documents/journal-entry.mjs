import Document from "../abstract/document.mjs";
import {mergeObject} from "../utils/helpers.mjs";
import * as fields from "../data/fields.mjs";

/**
 * @import {JournalEntryData} from "./_types.mjs";
 */

/**
 * The JournalEntry Document.
 * Defines the DataSchema and common behaviors for a JournalEntry which are shared between both client and server.
 * @extends {Document<JournalEntryData>}
 * @mixes JournalEntryData
 * @category Documents
 */
export default class BaseJournalEntry extends Document {

  /* -------------------------------------------- */
  /*  Model Configuration                         */
  /* -------------------------------------------- */

  /** @inheritdoc */
  static metadata = Object.freeze(mergeObject(super.metadata, {
    name: "JournalEntry",
    collection: "journal",
    indexed: true,
    compendiumIndexFields: ["_id", "name", "sort", "folder"],
    embedded: {
      JournalEntryCategory: "categories",
      JournalEntryPage: "pages"
    },
    label: "DOCUMENT.JournalEntry",
    labelPlural: "DOCUMENT.JournalEntries",
    permissions: {
      create: "JOURNAL_CREATE",
      delete: "OWNER"
    },
    schemaVersion: "13.341"
  }, {inplace: false}));

  /** @inheritdoc */
  static defineSchema() {
    const {BaseJournalEntryPage, BaseJournalEntryCategory, BaseFolder} = foundry.documents;
    return {
      _id: new fields.DocumentIdField(),
      name: new fields.StringField({required: true, blank: false, textSearch: true}),
      pages: new fields.EmbeddedCollectionField(BaseJournalEntryPage),
      folder: new fields.ForeignDocumentField(BaseFolder),
      categories: new fields.EmbeddedCollectionField(BaseJournalEntryCategory),
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

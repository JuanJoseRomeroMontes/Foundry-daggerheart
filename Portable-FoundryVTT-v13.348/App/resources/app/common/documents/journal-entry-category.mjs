import Document from "../abstract/document.mjs";
import { mergeObject } from "../utils/helpers.mjs";
import * as fields from "../data/fields.mjs";

/**
 * @import {JournalEntryCategoryData} from "./_types.mjs";
 */

/**
 * An embedded Document that represents a category in a JournalEntry.
 * Defines the DataSchema and common behaviors for a JournalEntryCategory which are shared between both client and
 * server.
 * @extends {Document<JournalEntryCategoryData>}
 * @mixes JournalEntryCategoryData
 * @category Documents
 */
export default class BaseJournalEntryCategory extends Document {

  /* -------------------------------------------- */
  /*  Model Configuration                         */
  /* -------------------------------------------- */

  /** @inheritDoc */
  static metadata = Object.freeze(mergeObject(super.metadata, {
    name: "JournalEntryCategory",
    collection: "categories",
    label: "DOCUMENT.JournalEntryCategory",
    labelPlural: "DOCUMENT.JournalEntryCategories",
    isEmbedded: true,
    schemaVersion: "13.341"
  }, { inplace: false }));

  /** @override */
  static defineSchema() {
    return {
      _id: new fields.DocumentIdField(),
      name: new fields.StringField({ required: true, blank: true, textSearch: true }),
      sort: new fields.IntegerSortField(),
      flags: new fields.DocumentFlagsField(),
      _stats: new fields.DocumentStatsField()
    };
  }
}

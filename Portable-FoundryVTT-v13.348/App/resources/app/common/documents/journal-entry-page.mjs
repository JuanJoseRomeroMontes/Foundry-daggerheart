import Document from "../abstract/document.mjs";
import {mergeObject} from "../utils/helpers.mjs";
import * as fields from "../data/fields.mjs";
import * as CONST from "../constants.mjs";

/**
 * @import {JournalEntryPageData} from "./_types.mjs";
 */

/**
 * The JournalEntryPage Document.
 * Defines the DataSchema and common behaviors for a JournalEntryPage which are shared between both client and server.
 * @extends {Document<JournalEntryPageData>}
 * @mixes JournalEntryPageData
 * @category Documents
 */
export default class BaseJournalEntryPage extends Document {

  /* -------------------------------------------- */
  /*  Model Configuration                         */
  /* -------------------------------------------- */

  /** @inheritdoc */
  static metadata = Object.freeze(mergeObject(super.metadata, {
    name: "JournalEntryPage",
    collection: "pages",
    hasTypeData: true,
    indexed: true,
    label: "DOCUMENT.JournalEntryPage",
    labelPlural: "DOCUMENT.JournalEntryPages",
    coreTypes: ["text", "image", "pdf", "video"],
    compendiumIndexFields: ["name", "type", "sort"],
    permissions: {
      create: "OWNER",
      delete: "OWNER"
    },
    schemaVersion: "13.341"
  }, {inplace: false}));

  /** @inheritdoc */
  static defineSchema() {
    return {
      _id: new fields.DocumentIdField(),
      name: new fields.StringField({required: true, blank: false, label: "JOURNALENTRYPAGE.PageTitle", textSearch: true}),
      type: new fields.DocumentTypeField(this, {initial: "text"}),
      system: new fields.TypeDataField(this),
      title: new fields.SchemaField({
        show: new fields.BooleanField({initial: true}),
        level: new fields.NumberField({required: true, initial: 1, min: 1, max: 6, integer: true, nullable: false})
      }),
      image: new fields.SchemaField({
        caption: new fields.StringField({required: false, initial: undefined})
      }),
      text: new fields.SchemaField({
        content: new fields.HTMLField({required: false, initial: undefined, textSearch: true}),
        markdown: new fields.StringField({required: false, initial: undefined}),
        format: new fields.NumberField({label: "JOURNALENTRYPAGE.Format",
          initial: CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML, choices: Object.values(CONST.JOURNAL_ENTRY_PAGE_FORMATS)})
      }),
      video: new fields.SchemaField({
        controls: new fields.BooleanField({initial: true}),
        loop: new fields.BooleanField({required: false, initial: undefined}),
        autoplay: new fields.BooleanField({required: false, initial: undefined}),
        volume: new fields.AlphaField({required: true, step: 0.01, initial: .5}),
        timestamp: new fields.NumberField({required: false, min: 0, initial: undefined}),
        width: new fields.NumberField({required: false, positive: true, integer: true, initial: undefined}),
        height: new fields.NumberField({required: false, positive: true, integer: true, initial: undefined})
      }),
      src: new fields.StringField({required: false, blank: false, nullable: true, initial: null,
        label: "JOURNALENTRYPAGE.Source"}),
      category: new fields.DocumentIdField({readonly: false}),
      sort: new fields.IntegerSortField(),
      ownership: new fields.DocumentOwnershipField({initial: {default: CONST.DOCUMENT_OWNERSHIP_LEVELS.INHERIT}}),
      flags: new fields.DocumentFlagsField(),
      _stats: new fields.DocumentStatsField()
    };
  }
}

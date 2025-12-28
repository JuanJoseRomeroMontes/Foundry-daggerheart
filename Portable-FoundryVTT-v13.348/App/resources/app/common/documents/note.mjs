import Document from "../abstract/document.mjs";
import {mergeObject} from "../utils/helpers.mjs";
import * as fields from "../data/fields.mjs";
import * as CONST from "../constants.mjs";
import {TextureData} from "../data/data.mjs";

/**
 * @import {NoteData} from "./_types.mjs";
 * @import {DocumentPermissionTest} from "@common/abstract/_types.mjs";
 */

/**
 * The Note Document.
 * Defines the DataSchema and common behaviors for a Note which are shared between both client and server.
 * @extends {Document<NoteData>}
 * @mixes NoteData
 * @category Documents
 */
export default class BaseNote extends Document {

  /* -------------------------------------------- */
  /*  Model Configuration                         */
  /* -------------------------------------------- */

  /** @inheritdoc */
  static metadata = Object.freeze(mergeObject(super.metadata, {
    name: "Note",
    collection: "notes",
    label: "DOCUMENT.Note",
    labelPlural: "DOCUMENT.Notes",
    permissions: {
      create: BaseNote.#canCreate,
      delete: "OWNER"
    },
    schemaVersion: "13.341"
  }, {inplace: false}));

  /** @inheritdoc */
  static defineSchema() {
    const {BaseJournalEntry, BaseJournalEntryPage} = foundry.documents;
    return {
      _id: new fields.DocumentIdField(),
      entryId: new fields.ForeignDocumentField(BaseJournalEntry, {idOnly: true}),
      pageId: new fields.ForeignDocumentField(BaseJournalEntryPage, {idOnly: true}),
      x: new fields.NumberField({required: true, integer: true, nullable: false, initial: 0}),
      y: new fields.NumberField({required: true, integer: true, nullable: false, initial: 0}),
      elevation: new fields.NumberField({required: true, nullable: false, initial: 0}),
      sort: new fields.NumberField({required: true, integer: true, nullable: false, initial: 0}),
      texture: new TextureData({}, {categories: ["IMAGE"],
        initial: {src: () => this.DEFAULT_ICON, anchorX: 0.5, anchorY: 0.5, fit: "contain"}}),
      iconSize: new fields.NumberField({required: true, nullable: false, integer: true, min: 32, initial: 40,
        validationError: "must be an integer greater than 32"}),
      text: new fields.StringField({textSearch: true}),
      fontFamily: new fields.StringField({required: true,
        initial: () => globalThis.CONFIG?.defaultFontFamily || "Signika"}),
      fontSize: new fields.NumberField({required: true, nullable: false, integer: true, min: 8, max: 128, initial: 32,
        validationError: "must be an integer between 8 and 128"}),
      textAnchor: new fields.NumberField({required: true, choices: Object.values(CONST.TEXT_ANCHOR_POINTS),
        initial: CONST.TEXT_ANCHOR_POINTS.BOTTOM, validationError: "must be a value in CONST.TEXT_ANCHOR_POINTS"}),
      textColor: new fields.ColorField({required: true, nullable: false, initial: "#ffffff"}),
      global: new fields.BooleanField(),
      flags: new fields.DocumentFlagsField()
    };
  }

  /** @override */
  static LOCALIZATION_PREFIXES = ["DOCUMENT", "NOTE"];

  /**
   * The default icon used for newly created Note documents.
   * @type {string}
   */
  static DEFAULT_ICON = "icons/svg/book.svg";

  /* -------------------------------------------- */
  /*  Model Methods                               */
  /* -------------------------------------------- */

  /** @inheritDoc */
  getUserLevel(user) {
    if ( this.page ) return this.page.getUserLevel(user);
    if ( this.entry ) return this.entry.getUserLevel(user);
    return super.getUserLevel(user);
  }

  /* -------------------------------------------- */

  /** @override */
  static canUserCreate(user) {
    return user.hasPermission("NOTE_CREATE");
  }

  /* -------------------------------------------- */

  /**
   * To create a Note document, the player must have both the NOTE_CREATE permission and at least OBSERVER
   * permission over the referenced JournalEntry.
   * @type {DocumentPermissionTest}
   */
  static #canCreate(user, doc) {
    if ( !user.hasPermission("NOTE_CREATE") ) return false;
    if ( doc._source.entryId ) return doc.entry.testUserPermission(user, "OBSERVER");
    return true;
  }
}

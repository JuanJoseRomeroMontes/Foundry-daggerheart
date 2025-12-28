import Document from "../abstract/document.mjs";
import {mergeObject} from "../utils/helpers.mjs";
import * as CONST from "../constants.mjs";
import * as fields from "../data/fields.mjs";

/**
 * @import {FolderData} from "./_types.mjs";
 */

/**
 * The Folder Document.
 * Defines the DataSchema and common behaviors for a Folder which are shared between both client and server.
 * @extends {Document<FolderData>}
 * @mixes FolderData
 * @category Documents
 */
export default class BaseFolder extends Document {

  /* ---------------------------------------- */
  /*  Model Configuration                     */
  /* ---------------------------------------- */

  /** @inheritdoc */
  static metadata = Object.freeze(mergeObject(super.metadata, {
    name: "Folder",
    collection: "folders",
    label: "DOCUMENT.Folder",
    labelPlural: "DOCUMENT.Folders",
    coreTypes: CONST.FOLDER_DOCUMENT_TYPES,
    schemaVersion: "13.341"
  }, {inplace: false}));

  /** @inheritdoc */
  static defineSchema() {
    return {
      _id: new fields.DocumentIdField(),
      name: new fields.StringField({required: true, blank: false, textSearch: true}),
      type: new fields.DocumentTypeField(this),
      description: new fields.HTMLField({textSearch: true}),
      folder: new fields.ForeignDocumentField(BaseFolder),
      sorting: new fields.StringField({required: true, initial: "a", choices: this.SORTING_MODES}),
      sort: new fields.IntegerSortField(),
      color: new fields.ColorField(),
      flags: new fields.DocumentFlagsField(),
      _stats: new fields.DocumentStatsField()
    };
  }

  /** @override */
  static LOCALIZATION_PREFIXES = ["DOCUMENT", "FOLDER"];

  /** @inheritdoc */
  static validateJoint(data) {
    if ( (data.folder !== null) && (data.folder === data._id) ) {
      throw new Error("A Folder may not contain itself");
    }
  }

  /**
   * Allow folder sorting modes
   * @type {string[]}
   */
  static SORTING_MODES = ["a", "m"];

  /* -------------------------------------------- */

  /** @override */
  static get(documentId, options={}) {
    if ( !documentId ) return null;
    if ( !options.pack ) return super.get(documentId, options);
    const pack = game.packs.get(options.pack);
    if ( !pack ) {
      console.error(`The ${this.name} model references a non-existent pack ${options.pack}.`);
      return null;
    }
    return pack.folders.get(documentId);
  }
}

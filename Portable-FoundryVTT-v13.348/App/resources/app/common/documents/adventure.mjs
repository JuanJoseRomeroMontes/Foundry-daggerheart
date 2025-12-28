import Document from "../abstract/document.mjs";
import {mergeObject} from "../utils/helpers.mjs";
import * as fields from "../data/fields.mjs";

/**
 * @import {AdventureData} from "./_types.mjs";
 */

/**
 * The Adventure Document.
 * Defines the DataSchema and common behaviors for an Adventure which are shared between both client and server.
 * @extends {Document<AdventureData>}
 * @mixes AdventureData
 * @category Documents
 */
export default class BaseAdventure extends Document {

  /* -------------------------------------------- */
  /*  Model Configuration                         */
  /* -------------------------------------------- */

  /** @inheritdoc */
  static metadata = Object.freeze(mergeObject(super.metadata, {
    name: "Adventure",
    collection: "adventures",
    compendiumIndexFields: ["_id", "name", "description", "img", "sort", "folder"],
    label: "DOCUMENT.Adventure",
    labelPlural: "DOCUMENT.Adventures",
    schemaVersion: "13.341"
  }, {inplace: false}));

  /** @inheritdoc */
  static defineSchema() {
    const documents = foundry.documents;
    return {
      _id: new fields.DocumentIdField(),
      name: new fields.StringField({required: true, blank: false, textSearch: true}),
      img: new fields.FilePathField({categories: ["IMAGE"]}),
      caption: new fields.HTMLField(),
      description: new fields.HTMLField({textSearch: true}),
      actors: new fields.SetField(new fields.EmbeddedDataField(documents.BaseActor)),
      combats: new fields.SetField(new fields.EmbeddedDataField(documents.BaseCombat)),
      items: new fields.SetField(new fields.EmbeddedDataField(documents.BaseItem)),
      journal: new fields.SetField(new fields.EmbeddedDataField(documents.BaseJournalEntry)),
      scenes: new fields.SetField(new fields.EmbeddedDataField(documents.BaseScene)),
      tables: new fields.SetField(new fields.EmbeddedDataField(documents.BaseRollTable)),
      macros: new fields.SetField(new fields.EmbeddedDataField(documents.BaseMacro)),
      cards: new fields.SetField(new fields.EmbeddedDataField(documents.BaseCards)),
      playlists: new fields.SetField(new fields.EmbeddedDataField(documents.BasePlaylist)),
      folders: new fields.SetField(new fields.EmbeddedDataField(documents.BaseFolder)),
      folder: new fields.ForeignDocumentField(documents.BaseFolder),
      sort: new fields.IntegerSortField(),
      flags: new fields.DocumentFlagsField(),
      _stats: new fields.DocumentStatsField()
    };
  }

  /** @override */
  static LOCALIZATION_PREFIXES = ["DOCUMENT", "ADVENTURE"];

  /* -------------------------------------------- */
  /*  Model Properties                            */
  /* -------------------------------------------- */

  /**
   * An array of the fields which provide imported content from the Adventure.
   * @type {Record<string, typeof Document>}
   */
  static get contentFields() {
    const content = {};
    for ( const field of this.schema ) {
      if ( field instanceof fields.SetField ) content[field.name] = field.element.model.implementation;
    }
    return content;
  }

  /**
   * Provide a thumbnail image path used to represent the Adventure document.
   * @type {string}
   */
  get thumbnail() {
    return this.img;
  }
}

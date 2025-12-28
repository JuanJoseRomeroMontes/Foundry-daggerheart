import Document from "../abstract/document.mjs";
import {mergeObject} from "../utils/helpers.mjs";
import * as CONST from "../constants.mjs";
import * as fields from "../data/fields.mjs";

/**
 * @import {PlaylistData} from "./_types.mjs";
 */

/**
 * The Playlist Document.
 * Defines the DataSchema and common behaviors for a Playlist which are shared between both client and server.
 * @extends {Document<PlaylistData>}
 * @mixes PlaylistData
 * @category Documents
 */
export default class BasePlaylist extends Document {

  /* -------------------------------------------- */
  /*  Model Configuration                         */
  /* -------------------------------------------- */

  /** @inheritdoc */
  static metadata = Object.freeze(mergeObject(super.metadata, {
    name: "Playlist",
    collection: "playlists",
    indexed: true,
    compendiumIndexFields: ["_id", "name", "description", "sort", "folder"],
    embedded: {PlaylistSound: "sounds"},
    label: "DOCUMENT.Playlist",
    labelPlural: "DOCUMENT.Playlists",
    permissions: {
      create: "PLAYLIST_CREATE",
      delete: "OWNER"
    },
    schemaVersion: "13.341"
  }, {inplace: false}));

  /** @inheritdoc */
  static defineSchema() {
    const {BasePlaylistSound, BaseFolder} = foundry.documents;
    return {
      _id: new fields.DocumentIdField(),
      name: new fields.StringField({required: true, blank: false, textSearch: true}),
      description: new fields.StringField({textSearch: true}),
      sounds: new fields.EmbeddedCollectionField(BasePlaylistSound),
      channel: new fields.StringField({required: true, choices: CONST.AUDIO_CHANNELS, initial: "music", blank: false}),
      mode: new fields.NumberField({required: true, choices: Object.values(CONST.PLAYLIST_MODES),
        initial: CONST.PLAYLIST_MODES.SEQUENTIAL, validationError: "must be a value in CONST.PLAYLIST_MODES"}),
      playing: new fields.BooleanField(),
      fade: new fields.NumberField({integer: true, positive: true}),
      folder: new fields.ForeignDocumentField(BaseFolder),
      sorting: new fields.StringField({required: true, choices: Object.values(CONST.PLAYLIST_SORT_MODES),
        initial: CONST.PLAYLIST_SORT_MODES.ALPHABETICAL,
        validationError: "must be a value in CONST.PLAYLIST_SORTING_MODES"}),
      seed: new fields.NumberField({integer: true, min: 0}),
      sort: new fields.IntegerSortField(),
      ownership: new fields.DocumentOwnershipField(),
      flags: new fields.DocumentFlagsField(),
      _stats: new fields.DocumentStatsField()
    };
  }

  /* -------------------------------------------- */

  /** @override */
  static LOCALIZATION_PREFIXES = ["DOCUMENT", "PLAYLIST"];

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

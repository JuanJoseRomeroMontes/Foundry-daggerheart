import Document from "../abstract/document.mjs";
import {mergeObject} from "../utils/helpers.mjs";
import * as fields from "../data/fields.mjs";
import * as CONST from "../constants.mjs";

/**
 * @import {PlaylistSoundData} from "./_types.mjs";
 */

/**
 * The PlaylistSound Document.
 * Defines the DataSchema and common behaviors for a PlaylistSound which are shared between both client and server.
 * @extends {Document<PlaylistSoundData>}
 * @mixes PlaylistSoundData
 * @category Documents
 */
export default class BasePlaylistSound extends Document {

  /* -------------------------------------------- */
  /*  Model Configuration                         */
  /* -------------------------------------------- */

  /** @inheritdoc */
  static metadata = Object.freeze(mergeObject(super.metadata, {
    name: "PlaylistSound",
    collection: "sounds",
    indexed: true,
    label: "DOCUMENT.PlaylistSound",
    labelPlural: "DOCUMENT.PlaylistSounds",
    compendiumIndexFields: ["name", "sort"],
    schemaVersion: "13.341",
    permissions: {
      ...super.metadata.permissions,
      create: "OWNER",
      update: "OWNER",
      delete: "OWNER"
    }
  }, {inplace: false}));

  /** @inheritdoc */
  static defineSchema() {
    return {
      _id: new fields.DocumentIdField(),
      name: new fields.StringField({required: true, blank: false, textSearch: true}),
      description: new fields.StringField(),
      path: new fields.FilePathField({categories: ["AUDIO"]}),
      channel: new fields.StringField({required: true, choices: CONST.AUDIO_CHANNELS, initial: "", blank: true}),
      playing: new fields.BooleanField(),
      pausedTime: new fields.NumberField({min: 0}),
      repeat: new fields.BooleanField(),
      volume: new fields.AlphaField({initial: 0.5, step: 0.01}),
      fade: new fields.NumberField({integer: true, min: 0}),
      sort: new fields.IntegerSortField(),
      flags: new fields.DocumentFlagsField()
    };
  }

  /** @override */
  static LOCALIZATION_PREFIXES = ["DOCUMENT", "PLAYLIST_SOUND"];
}

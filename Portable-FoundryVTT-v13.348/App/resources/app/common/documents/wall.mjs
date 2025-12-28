import Document from "../abstract/document.mjs";
import {mergeObject} from "../utils/helpers.mjs";
import * as CONST from "../constants.mjs";
import * as fields from "../data/fields.mjs";

/**
 * @import {WallData} from "./_types.mjs";
 * @import {DocumentPermissionTest} from "@common/abstract/_types.mjs";
 */

/**
 * The Wall Document.
 * Defines the DataSchema and common behaviors for a Wall which are shared between both client and server.
 * @extends {Document<WallData>}
 * @mixes WallData
 * @category Documents
 */
export default class BaseWall extends Document {

  /* -------------------------------------------- */
  /*  Model Configuration                         */
  /* -------------------------------------------- */

  /** @inheritDoc */
  static metadata = Object.freeze(mergeObject(super.metadata, {
    name: "Wall",
    collection: "walls",
    label: "DOCUMENT.Wall",
    labelPlural: "DOCUMENT.Walls",
    permissions: {
      update: this.#canUpdate
    },
    schemaVersion: "13.341"
  }, {inplace: false}));

  /** @inheritDoc */
  static defineSchema() {
    const choices = [
      ["senseTypes", CONST.WALL_SENSE_TYPES, "SenseTypes"],
      ["moveTypes", CONST.WALL_MOVEMENT_TYPES, "SenseTypes"],
      ["directions", CONST.WALL_DIRECTIONS, "Directions"],
      ["doorTypes", CONST.WALL_DOOR_TYPES, "DoorTypes"],
      ["doorStates", CONST.WALL_DOOR_STATES, "DoorStates"]
    ].reduce((outer, [key, record, labelObj]) => {
      outer[key] = Object.entries(record).reduce((inner, [labelKey, value]) => {
        inner[value] = `WALL.${labelObj}.${labelKey}`;
        return inner;
      }, {});
      return outer;
    }, {});
    return {
      _id: new fields.DocumentIdField(),
      c: new fields.ArrayField(new fields.NumberField({required: true, integer: true, nullable: false}), {
        validate: c => (c.length === 4),
        validationError: "must be a length-4 array of integer coordinates"}),
      light: new fields.NumberField({required: true, choices: choices.senseTypes,
        initial: CONST.WALL_SENSE_TYPES.NORMAL,
        validationError: "must be a value in CONST.WALL_SENSE_TYPES"}),
      move: new fields.NumberField({required: true, choices: choices.moveTypes,
        initial: CONST.WALL_MOVEMENT_TYPES.NORMAL,
        validationError: "must be a value in CONST.WALL_MOVEMENT_TYPES"}),
      sight: new fields.NumberField({required: true, choices: choices.senseTypes,
        initial: CONST.WALL_SENSE_TYPES.NORMAL,
        validationError: "must be a value in CONST.WALL_SENSE_TYPES"}),
      sound: new fields.NumberField({required: true, choices: choices.senseTypes,
        initial: CONST.WALL_SENSE_TYPES.NORMAL,
        validationError: "must be a value in CONST.WALL_SENSE_TYPES"}),
      dir: new fields.NumberField({required: true, choices: choices.directions,
        initial: CONST.WALL_DIRECTIONS.BOTH,
        validationError: "must be a value in CONST.WALL_DIRECTIONS"}),
      door: new fields.NumberField({required: true, choices: choices.doorTypes,
        initial: CONST.WALL_DOOR_TYPES.NONE,
        validationError: "must be a value in CONST.WALL_DOOR_TYPES"}),
      ds: new fields.NumberField({required: true, choices: choices.doorStates,
        initial: CONST.WALL_DOOR_STATES.CLOSED,
        validationError: "must be a value in CONST.WALL_DOOR_STATES"}),
      doorSound: new fields.StringField({required: false, blank: true, initial: undefined}),
      threshold: new fields.SchemaField({
        light: new fields.NumberField({required: true, nullable: true, initial: null, positive: true}),
        sight: new fields.NumberField({required: true, nullable: true, initial: null, positive: true}),
        sound: new fields.NumberField({required: true, nullable: true, initial: null, positive: true}),
        attenuation: new fields.BooleanField()
      }),
      animation: new fields.SchemaField({
        direction: new fields.NumberField({choices: [-1, 1], initial: 1}),
        double: new fields.BooleanField({initial: false}),
        duration: new fields.NumberField({positive: true, integer: true, initial: 750}),
        flip: new fields.BooleanField({initial: false}),
        strength: new fields.NumberField({initial: 1.0, min: 0, max: 2.0, step: 0.05}),
        texture: new fields.FilePathField({categories: ["IMAGE"], virtual: true}),
        type: new fields.StringField({initial: "swing", blank: true}) // Allow any value to be persisted
      }, {required: true, nullable: true, initial: null}),
      flags: new fields.DocumentFlagsField()
    };
  }

  /** @override */
  static LOCALIZATION_PREFIXES = ["DOCUMENT", "WALL"];

  /* -------------------------------------------- */

  /**
   * Is a user able to update an existing Wall?
   * @type {DocumentPermissionTest}
   */
  static #canUpdate(user, doc, data) {
    if ( user.isGM ) return true;                     // GM users can do anything
    const dsOnly = Object.keys(data).every(k => ["_id", "ds"].includes(k));
    if ( dsOnly && (doc.ds !== CONST.WALL_DOOR_STATES.LOCKED) && (data.ds !== CONST.WALL_DOOR_STATES.LOCKED) ) {
      return user.hasRole("PLAYER");                  // Players may open and close unlocked doors
    }
    return false;
  }
}

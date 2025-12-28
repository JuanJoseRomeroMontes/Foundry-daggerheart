import Document from "../abstract/document.mjs";
import {mergeObject} from "../utils/helpers.mjs";
import * as fields from "../data/fields.mjs";

/**
 * @import {RegionBehaviorData} from "./_types.mjs";
 * @import {DocumentPermissionTest} from "@common/abstract/_types.mjs";
 */

/**
 * The RegionBehavior Document.
 * Defines the DataSchema and common behaviors for a RegionBehavior which are shared between both client and server.
 * @extends {Document<RegionBehaviorData>}
 * @mixes RegionBehaviorData
 * @category Documents
 */
export default class BaseRegionBehavior extends Document {

  /* -------------------------------------------- */
  /*  Model Configuration                         */
  /* -------------------------------------------- */

  /** @inheritdoc */
  static metadata = Object.freeze(mergeObject(super.metadata, {
    name: "RegionBehavior",
    collection: "behaviors",
    label: "DOCUMENT.RegionBehavior",
    labelPlural: "DOCUMENT.RegionBehaviors",
    coreTypes: ["adjustDarknessLevel", "displayScrollingText", "executeMacro", "executeScript", "modifyMovementCost", "pauseGame", "suppressWeather", "teleportToken", "toggleBehavior"],
    hasTypeData: true,
    isEmbedded: true,
    permissions: {
      create: this.#canCreate,
      update: this.#canUpdate
    },
    schemaVersion: "13.341"
  }, {inplace: false}));

  /** @inheritdoc */
  static defineSchema() {
    return {
      _id: new fields.DocumentIdField(),
      name: new fields.StringField({required: true, blank: true, textSearch: true}),
      type: new fields.DocumentTypeField(this),
      system: new fields.TypeDataField(this),
      disabled: new fields.BooleanField(),
      flags: new fields.DocumentFlagsField(),
      _stats: new fields.DocumentStatsField()
    };
  }

  /** @override */
  static LOCALIZATION_PREFIXES = ["DOCUMENT", "BEHAVIOR"];

  /* -------------------------------------------- */

  /** @override */
  static canUserCreate(user) {
    return user.isGM;
  }

  /* ---------------------------------------- */

  /**
   * Is a user able to create the RegionBehavior document?
   * @type {DocumentPermissionTest}
   */
  static #canCreate(user, doc) {
    if ( (doc._source.type === "executeScript") && !user.hasPermission("MACRO_SCRIPT") ) return false;
    return user.isGM;
  }

  /* ---------------------------------------- */

  /**
   * Is a user able to update the RegionBehavior document?
   * @type {DocumentPermissionTest}
   */
  static #canUpdate(user, doc, data) {
    if ( (((doc._source.type === "executeScript") && ("system" in data) && ("source" in data.system))
      || (data.type === "executeScript")) && !user.hasPermission("MACRO_SCRIPT") ) return false;
    return user.isGM;
  }
}

import Document from "../abstract/document.mjs";
import {mergeObject} from "../utils/helpers.mjs";
import * as fields from "../data/fields.mjs";
import BaseUser from "./user.mjs";

/**
 * @import {SettingData} from "./_types.mjs";
 * @import {DocumentPermissionTest} from "@common/abstract/_types.mjs";
 */

/**
 * The Setting Document.
 * Defines the DataSchema and common behaviors for a Setting which are shared between both client and server.
 * @extends {Document<SettingData>}
 * @mixes SettingData
 * @category Documents
 */
export default class BaseSetting extends Document {

  /* -------------------------------------------- */
  /*  Model Configuration                         */
  /* -------------------------------------------- */

  /** @inheritdoc */
  static metadata = Object.freeze(mergeObject(super.metadata, {
    name: "Setting",
    collection: "settings",
    label: "DOCUMENT.Setting",
    labelPlural: "DOCUMENT.Settings",
    permissions: {
      create: this.#canModify,
      update: this.#canModify,
      delete: this.#canModify
    },
    schemaVersion: "13.341"
  }, {inplace: false}));

  /** @inheritdoc */
  static defineSchema() {
    return {
      _id: new fields.DocumentIdField(),
      key: new fields.StringField({required: true, nullable: false, blank: false,
        validate: k => k.split(".").length >= 2,
        validationError: "must have the format {scope}.{field}"}),
      value: new fields.JSONField({required: true, nullable: true, initial: null}),
      user: new fields.ForeignDocumentField(BaseUser, {idOnly: true}),
      _stats: new fields.DocumentStatsField()
    };
  }

  /* -------------------------------------------- */

  /**
   * The settings that only full GMs can modify.
   * @type {string[]}
   */
  static #GAMEMASTER_ONLY_KEYS = ["core.permissions"];

  /* -------------------------------------------- */

  /**
   * The settings that assistant GMs can modify regardless of their permission.
   * @type {string[]}
   */
  static #ALLOWED_ASSISTANT_KEYS = ["core.time", "core.combatTrackerConfig", "core.sheetClasses", "core.scrollingStatusText",
    "core.tokenDragPreview", "core.adventureImports", "core.gridDiagonals", "core.gridTemplates", "core.coneTemplateType"];

  /* -------------------------------------------- */

  /** @override */
  static canUserCreate(user) {
    return user.hasPermission("SETTINGS_MODIFY");
  }

  /* -------------------------------------------- */

  /**
   * Define special rules which allow certain settings to be updated.
   * @type {DocumentPermissionTest}
   */
  static #canModify(user, doc, data) {
    if ( BaseSetting.#GAMEMASTER_ONLY_KEYS.includes(doc._source.key)
      && (!("key" in data) || BaseSetting.#GAMEMASTER_ONLY_KEYS.includes(data.key)) ) return user.hasRole("GAMEMASTER");
    const sourceUser = doc._source.user;
    const targetUser = data?.user;
    const sourceMatch = !sourceUser || (sourceUser === user.id);
    const targetMatch = !targetUser || (targetUser === user.id);
    if ( sourceUser || targetUser ) return user.isGM || (sourceMatch && targetMatch);
    if ( user.hasPermission("SETTINGS_MODIFY") ) return true;
    if ( !user.isGM ) return false;
    return BaseSetting.#ALLOWED_ASSISTANT_KEYS.includes(doc._source.key)
      && (!("key" in data) || BaseSetting.#ALLOWED_ASSISTANT_KEYS.includes(data.key));
  }
}

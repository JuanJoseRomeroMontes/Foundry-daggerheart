import Document from "../abstract/document.mjs";
import {mergeObject} from "../utils/helpers.mjs";
import * as CONST from "../constants.mjs";
import * as fields from "../data/fields.mjs";

/**
 * @import {MeasuredTemplateData} from "./_types.mjs";
 * @import {DocumentPermissionTest} from "@common/abstract/_types.mjs";
 */

/**
 * The MeasuredTemplate Document.
 * Defines the DataSchema and common behaviors for a MeasuredTemplate which are shared between both client and server.
 * @extends {Document<MeasuredTemplateData>}
 * @mixes MeasuredTemplateData
 * @category Documents
 */
export default class BaseMeasuredTemplate extends Document {

  /* -------------------------------------------- */
  /*  Model Configuration                         */
  /* -------------------------------------------- */

  /** @inheritdoc */
  static metadata = mergeObject(super.metadata, {
    name: "MeasuredTemplate",
    collection: "templates",
    label: "DOCUMENT.MeasuredTemplate",
    labelPlural: "DOCUMENT.MeasuredTemplates",
    isEmbedded: true,
    permissions: {
      create: this.#canCreate,
      delete: "OWNER"
    },
    schemaVersion: "13.341"
  }, {inplace: false});

  /** @inheritdoc */
  static defineSchema() {
    return {
      _id: new fields.DocumentIdField(),
      author: new fields.DocumentAuthorField(foundry.documents.BaseUser),
      t: new fields.StringField({required: true, choices: Object.values(CONST.MEASURED_TEMPLATE_TYPES),
        initial: CONST.MEASURED_TEMPLATE_TYPES.CIRCLE,
        validationError: "must be a value in CONST.MEASURED_TEMPLATE_TYPES"
      }),
      x: new fields.NumberField({required: true, integer: true, nullable: false, initial: 0}),
      y: new fields.NumberField({required: true, integer: true, nullable: false, initial: 0}),
      elevation: new fields.NumberField({required: true, nullable: false, initial: 0}),
      sort: new fields.NumberField({required: true, integer: true, nullable: false, initial: 0}),
      distance: new fields.NumberField({required: true, nullable: false, initial: 0, min: 0}),
      direction: new fields.AngleField(),
      angle: new fields.AngleField({normalize: false}),
      width: new fields.NumberField({required: true, nullable: false, initial: 0, min: 0, step: 0.01}),
      borderColor: new fields.ColorField({nullable: false, initial: "#000000"}),
      fillColor: new fields.ColorField({nullable: false, initial: () => game.user?.color.css || "#ffffff"}),
      texture: new fields.FilePathField({categories: ["IMAGE", "VIDEO"]}),
      hidden: new fields.BooleanField(),
      flags: new fields.DocumentFlagsField()
    };
  }

  /** @override */
  static LOCALIZATION_PREFIXES = ["DOCUMENT", "TEMPLATE"];

  /* ---------------------------------------- */

  /**
   * Is a user able to create a new MeasuredTemplate?
   * @type {DocumentPermissionTest}
   */
  static #canCreate(user, doc) {
    if ( !user.isGM && (doc._source.author !== user.id) ) return false;
    return user.hasPermission("TEMPLATE_CREATE");
  }

  /* -------------------------------------------- */
  /*  Model Methods                               */
  /* -------------------------------------------- */

  /** @inheritDoc */
  getUserLevel(user) {
    user ||= game.user;
    if ( user.id === this._source.author ) return CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
    return super.getUserLevel(user);
  }

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /** @inheritdoc */
  static migrateData(data) {
    /**
     * V12 migration from user to author
     * @deprecated since v12
     */
    this._addDataFieldMigration(data, "user", "author");
    return super.migrateData(data);
  }

  /* ---------------------------------------- */

  /** @inheritdoc */
  static shimData(data, options) {
    this._addDataFieldShim(data, "user", "author", {since: 12, until: 14});
    return super.shimData(data, options);
  }

  /* ---------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  get user() {
    this.constructor._logDataFieldMigration("user", "author", {since: 12, until: 14});
    return this.author;
  }
}

import Document from "../abstract/document.mjs";
import {mergeObject} from "../utils/helpers.mjs";
import * as CONST from "../constants.mjs";
import * as fields from "../data/fields.mjs";

/**
 * @import {MacroData} from "./_types.mjs";
 * @import {DocumentPermissionTest} from "@common/abstract/_types.mjs";
 */

/**
 * The Macro Document.
 * Defines the DataSchema and common behaviors for a Macro which are shared between both client and server.
 * @extends {Document<MacroData>}
 * @mixes MacroData
 * @category Documents
 */
export default class BaseMacro extends Document {

  /* -------------------------------------------- */
  /*  Model Configuration                         */
  /* -------------------------------------------- */

  /** @inheritdoc */
  static metadata = Object.freeze(mergeObject(super.metadata, {
    name: "Macro",
    collection: "macros",
    indexed: true,
    compendiumIndexFields: ["_id", "name", "img", "sort", "folder"],
    label: "DOCUMENT.Macro",
    labelPlural: "DOCUMENT.Macros",
    coreTypes: Object.values(CONST.MACRO_TYPES),
    permissions: {
      create: this.#canCreate,
      update: this.#canUpdate,
      delete: "OWNER"
    },
    schemaVersion: "13.341"
  }, {inplace: false}));

  /** @inheritdoc */
  static defineSchema() {
    const {BaseUser, BaseFolder} = foundry.documents;
    return {
      _id: new fields.DocumentIdField(),
      name: new fields.StringField({required: true, blank: false, textSearch: true}),
      type: new fields.DocumentTypeField(this, {initial: CONST.MACRO_TYPES.CHAT}),
      author: new fields.DocumentAuthorField(BaseUser),
      img: new fields.FilePathField({categories: ["IMAGE"], initial: () => this.DEFAULT_ICON}),
      scope: new fields.StringField({required: true, choices: CONST.MACRO_SCOPES, initial: CONST.MACRO_SCOPES[0],
        validationError: "must be a value in CONST.MACRO_SCOPES"}),
      command: new fields.StringField({required: true, blank: true}),
      folder: new fields.ForeignDocumentField(BaseFolder),
      sort: new fields.IntegerSortField(),
      ownership: new fields.DocumentOwnershipField(),
      flags: new fields.DocumentFlagsField(),
      _stats: new fields.DocumentStatsField()
    };
  }

  /** @override */
  static LOCALIZATION_PREFIXES = ["DOCUMENT", "MACRO"];

  /**
   * The default icon used for newly created Macro documents.
   * @type {string}
   */
  static DEFAULT_ICON = "icons/svg/dice-target.svg";

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

  /* -------------------------------------------- */
  /*  Model Methods                               */
  /* -------------------------------------------- */

  /** @override */
  static validateJoint(data) {
    if ( data.type !== CONST.MACRO_TYPES.SCRIPT ) return;
    const field = new fields.JavaScriptField({ async: true });
    const failure = field.validate(data.command);
    if ( failure ) throw failure.asError();
  }

  /* -------------------------------------------- */

  /** @override */
  static canUserCreate(user) {
    return user.hasRole("PLAYER");
  }

  /* ---------------------------------------- */

  /**
   * Is a user able to create the Macro document?
   * @type {DocumentPermissionTest}
   */
  static #canCreate(user, doc) {
    if ( !user.isGM && (doc._source.author !== user.id) ) return false;
    if ( (doc._source.type === "script") && !user.hasPermission("MACRO_SCRIPT") ) return false;
    return user.hasRole("PLAYER");
  }

  /* ---------------------------------------- */

  /**
   * Is a user able to update the Macro document?
   * @type {DocumentPermissionTest}
   */
  static #canUpdate(user, doc, data) {
    if ( !user.hasPermission("MACRO_SCRIPT") ) {
      if ( (data.type === "script") || (data["==type"] === "script") ) return false;
      if ( (doc._source.type === "script") && ("command" in data) ) return false;
    }
    return doc.testUserPermission(user, "OWNER");
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  getUserLevel(user) {
    user ||= game.user;
    if ( user.id === this._source.author ) return CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
    return super.getUserLevel(user);
  }

  /* -------------------------------------------- */
  /*  Database Event Handlers                     */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async _preCreate(data, options, user) {
    const allowed = await super._preCreate(data, options, user);
    if ( allowed === false ) return false;
    this.updateSource({author: user.id});
  }
}

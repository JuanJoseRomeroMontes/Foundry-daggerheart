import Document from "../abstract/document.mjs";
import * as CONST from "../constants.mjs";
import * as fields from "../data/fields.mjs";
import {mergeObject} from "../utils/helpers.mjs";

/**
 * @import {ActiveEffectData} from "./_types.mjs";
 */

/**
 * The ActiveEffect Document.
 * Defines the DataSchema and common behaviors for an ActiveEffect which are shared between both client and server.
 * @extends {Document<ActiveEffectData>}
 * @mixes ActiveEffectData
 * @category Documents
 */
export default class BaseActiveEffect extends Document {

  /* -------------------------------------------- */
  /*  Model Configuration                         */
  /* -------------------------------------------- */

  /** @inheritdoc */
  static metadata = Object.freeze(mergeObject(super.metadata, {
    name: "ActiveEffect",
    collection: "effects",
    hasTypeData: true,
    label: "DOCUMENT.ActiveEffect",
    labelPlural: "DOCUMENT.ActiveEffects",
    schemaVersion: "13.341",
    permissions: {
      create: "OWNER",
      delete: "OWNER"
    }
  }, {inplace: false}));

  /* -------------------------------------------- */

  /** @inheritdoc */
  static defineSchema() {
    return {
      _id: new fields.DocumentIdField(),
      name: new fields.StringField({required: true, blank: false, textSearch: true}),
      img: new fields.FilePathField({categories: ["IMAGE"]}),
      type: new fields.DocumentTypeField(this, {initial: CONST.BASE_DOCUMENT_TYPE}),
      system: new fields.TypeDataField(this),
      changes: new fields.ArrayField(new fields.SchemaField({
        key: new fields.StringField({required: true}),
        value: new fields.StringField({required: true}),
        mode: new fields.NumberField({required: true, nullable: false, integer: true,
          initial: CONST.ACTIVE_EFFECT_MODES.ADD}),
        priority: new fields.NumberField()
      })),
      disabled: new fields.BooleanField(),
      duration: new fields.SchemaField({
        startTime: new fields.NumberField({initial: null}),
        seconds: new fields.NumberField({integer: true, min: 0}),
        combat: new fields.ForeignDocumentField(foundry.documents.BaseCombat),
        rounds: new fields.NumberField({integer: true, min: 0}),
        turns: new fields.NumberField({integer: true, min: 0}),
        startRound: new fields.NumberField({integer: true, min: 0}),
        startTurn: new fields.NumberField({integer: true, min: 0})
      }),
      description: new fields.HTMLField({textSearch: true}),
      origin: new fields.StringField({nullable: true, blank: false, initial: null}),
      tint: new fields.ColorField({nullable: false, initial: "#ffffff"}),
      transfer: new fields.BooleanField({initial: true}),
      statuses: new fields.SetField(new fields.StringField({required: true, blank: false})),
      sort: new fields.IntegerSortField(),
      flags: new fields.DocumentFlagsField(),
      _stats: new fields.DocumentStatsField()
    };
  }

  /* -------------------------------------------- */

  /** @override */
  static LOCALIZATION_PREFIXES = ["DOCUMENT", "EFFECT"];

  /* -------------------------------------------- */
  /*  Database Event Handlers                     */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async _preCreate(data, options, user) {
    const allowed = await super._preCreate(data, options, user);
    if ( allowed === false ) return false;
    if ( this.parent instanceof foundry.documents.BaseActor ) {
      this.updateSource({transfer: false});
    }
  }

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /** @inheritDoc */
  static migrateData(data) {
    /**
     * icon -> img
     * @deprecated since v12
     */
    this._addDataFieldMigration(data, "icon", "img");
    return super.migrateData(data);
  }

  /* ---------------------------------------- */

  /** @inheritdoc */
  static shimData(data, options) {
    this._addDataFieldShim(data, "icon", "img", {since: 12, until: 14});
    return super.shimData(data, options);
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  get icon() {
    this.constructor._logDataFieldMigration("icon", "img", {since: 12, until: 14, once: true});
    return this.img;
  }

  /**
   * @deprecated since v12
   * @ignore
   */
  set icon(value) {
    this.constructor._logDataFieldMigration("icon", "img", {since: 12, until: 14, once: true});
    this.img = value;
  }
}

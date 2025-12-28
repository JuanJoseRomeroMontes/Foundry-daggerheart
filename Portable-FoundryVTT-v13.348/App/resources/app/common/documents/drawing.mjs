import Document from "../abstract/document.mjs";
import {mergeObject} from "../utils/helpers.mjs";
import * as fields from "../data/fields.mjs";
import * as CONST from "../constants.mjs";
import {ShapeData} from "../data/data.mjs";

/**
 * @import {DrawingData} from "./_types.mjs";
 * @import {DocumentPermissionTest} from "@common/abstract/_types.mjs";
 */

/**
 * The Drawing Document.
 * Defines the DataSchema and common behaviors for a Drawing which are shared between both client and server.
 * @extends {Document<DrawingData>}
 * @mixes DrawingData
 * @category Documents
 */
export default class BaseDrawing extends Document {

  /* ---------------------------------------- */
  /*  Model Configuration                     */
  /* ---------------------------------------- */

  /** @inheritdoc */
  static metadata = Object.freeze(mergeObject(super.metadata, {
    name: "Drawing",
    collection: "drawings",
    label: "DOCUMENT.Drawing",
    labelPlural: "DOCUMENT.Drawings",
    isEmbedded: true,
    permissions: {
      create: this.#canCreate,
      delete: "OWNER"
    },
    schemaVersion: "13.341"
  }, {inplace: false}));

  /* -------------------------------------------- */

  /** @override */
  static LOCALIZATION_PREFIXES = ["DOCUMENT", "DRAWING"];

  /* ---------------------------------------- */

  /** @inheritDoc */
  static defineSchema() {
    const fillTypeChoices = Object.entries(CONST.DRAWING_FILL_TYPES).reduce((types, [key, value]) => {
      types[value] = `DRAWING.FillType${key.titleCase()}`;
      return types;
    }, {});
    return {
      _id: new fields.DocumentIdField(),
      author: new fields.DocumentAuthorField(foundry.documents.BaseUser),
      shape: new fields.EmbeddedDataField(ShapeData),
      x: new fields.NumberField({required: true, nullable: false, initial: 0}),
      y: new fields.NumberField({required: true, nullable: false, initial: 0}),
      elevation: new fields.NumberField({required: true, nullable: false, initial: 0}),
      sort: new fields.NumberField({required: true, integer: true, nullable: false, initial: 0}),
      rotation: new fields.AngleField(),
      bezierFactor: new fields.AlphaField({initial: 0, label: "DRAWING.SmoothingFactor", max: 0.5,
        hint: "DRAWING.SmoothingFactorHint"}),
      fillType: new fields.NumberField({
        required: true,
        nullable: false,
        initial: CONST.DRAWING_FILL_TYPES.NONE,
        choices: fillTypeChoices,
        label: "DRAWING.FillTypes",
        validationError: "must be a value in CONST.DRAWING_FILL_TYPES"
      }),
      fillColor: new fields.ColorField({nullable: false, initial: () => game.user?.color.css || "#ffffff", label: "DRAWING.FillColor"}),
      fillAlpha: new fields.AlphaField({initial: 0.5, label: "DRAWING.FillOpacity"}),
      strokeWidth: new fields.NumberField({nullable: false, integer: true, initial: 8, min: 0, label: "DRAWING.LineWidth"}),
      strokeColor: new fields.ColorField({nullable: false, initial: () => game.user?.color.css || "#ffffff", label: "DRAWING.StrokeColor"}),
      strokeAlpha: new fields.AlphaField({initial: 1, label: "DRAWING.LineOpacity"}),
      texture: new fields.FilePathField({categories: ["IMAGE"], label: "DRAWING.FillTexture"}),
      text: new fields.StringField({label: "DRAWING.TextLabel"}),
      fontFamily: new fields.StringField({blank: false, label: "DRAWING.FontFamily",
        initial: () => globalThis.CONFIG?.defaultFontFamily || "Signika"}),
      fontSize: new fields.NumberField({nullable: false, integer: true, min: 8, max: 256, initial: 48, label: "DRAWING.FontSize",
        validationError: "must be an integer between 8 and 256"}),
      textColor: new fields.ColorField({nullable: false, initial: "#ffffff", label: "DRAWING.TextColor"}),
      textAlpha: new fields.AlphaField({label: "DRAWING.TextOpacity"}),
      hidden: new fields.BooleanField(),
      locked: new fields.BooleanField(),
      interface: new fields.BooleanField(),
      flags: new fields.DocumentFlagsField()
    };
  }

  /* ---------------------------------------- */

  /**
   * Validate whether the drawing has some visible content (as required by validation).
   * @param {Partial<Pick<DrawingData, "shape">> & Pick<DrawingData, "text"|"textAlpha"|"fillType"|"fillAlpha"
   *   |"strokeWidth"|"strokeAlpha">} data
   * @returns {boolean}
   * @internal
   */
  static _validateVisibleContent(data) {
    let isEmpty;
    switch ( data.shape?.type ) {
      case "r":
      case "e": isEmpty = (data.shape.width <= data.strokeWidth) || (data.shape.height <= data.strokeWidth); break;
      case "p": isEmpty = ((data.shape.width === 0) && (data.shape.height === 0)) || (data.shape.points.length < 4); break;
      case "c": isEmpty = (data.shape.radius <= (data.strokeWidth / 2)); break;
    }
    if ( isEmpty ) return false;
    const hasText = (data.text !== "") && (data.textAlpha > 0);
    const hasFill = (data.fillType !== CONST.DRAWING_FILL_TYPES.NONE) && (data.fillAlpha > 0);
    const hasLine = (data.strokeWidth > 0) && (data.strokeAlpha > 0);
    return hasText || hasFill || hasLine;
  }

  /* ---------------------------------------- */

  /** @inheritdoc */
  static validateJoint(data) {
    if ( !BaseDrawing._validateVisibleContent(data) ) {
      throw new Error(game.i18n.localize("DRAWING.JointValidationError"));
    }
  }

  /* -------------------------------------------- */

  /** @override */
  static canUserCreate(user) {
    return user.hasPermission("DRAWING_CREATE");
  }

  /* ---------------------------------------- */

  /**
   * Is a user able to create a new Drawing?
   * @type {DocumentPermissionTest}
   */
  static #canCreate(user, doc) {
    if ( !user.isGM && (doc._source.author !== user.id) ) return false;
    return user.hasPermission("DRAWING_CREATE");
  }

  /* ---------------------------------------- */
  /*  Model Methods                           */
  /* ---------------------------------------- */

  /** @inheritDoc */
  getUserLevel(user) {
    user ||= game.user;
    if ( user.id === this._source.author ) return CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
    return super.getUserLevel(user);
  }

  /* ---------------------------------------- */
  /*  Deprecations and Compatibility          */
  /* ---------------------------------------- */

  /** @inheritdoc */
  static migrateData(data) {
    /**
     * V12 migration to elevation and sort fields
     * @deprecated since v12
     */
    this._addDataFieldMigration(data, "z", "elevation");
    return super.migrateData(data);
  }

  /* ---------------------------------------- */

  /** @inheritdoc */
  static shimData(data, options) {
    this._addDataFieldShim(data, "z", "elevation", {since: 12, until: 14});
    return super.shimData(data, options);
  }

  /* ---------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  get z() {
    this.constructor._logDataFieldMigration("z", "elevation", {since: 12, until: 14});
    return this.elevation;
  }
}

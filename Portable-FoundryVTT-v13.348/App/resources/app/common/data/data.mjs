/**
 * The collection of data schema and document definitions for primary documents which are shared between the both the
 * client and the server.
 * @module data
 */

import DataModel from "../abstract/data.mjs";
import * as fields from "./fields.mjs";
import * as utils from "../utils/_module.mjs";

/**
 * @import {EmbeddedCollectionDelta} from "../abstract/_module.mjs";
 * @import BaseActor from "../documents/actor.mjs";
 * @import {PrototypeTokenData} from "@common/documents/_types.mjs";
 * @import {TextureDataFitMode} from "../constants.mjs";
 * @import {DataFieldOptions, FilePathFieldOptions, LightAnimationData} from "./_types.mjs";
 */

/**
 * A reusable document structure for the internal data used to render the appearance of a light source.
 * This is re-used by both the AmbientLightData and TokenData classes.
 *
 * @property {boolean} negative           Is this light source a negative source? (i.e. darkness source)
 * @property {number} priority            The priority of this source
 * @property {number} alpha               An opacity for the emitted light, if any
 * @property {number} angle               The angle of emission for this point source
 * @property {number} bright              The allowed radius of bright vision or illumination
 * @property {number} color               A tint color for the emitted light, if any
 * @property {number} coloration          The coloration technique applied in the shader
 * @property {number} contrast            The amount of contrast this light applies to the background texture
 * @property {number} dim                 The allowed radius of dim vision or illumination
 * @property {number} attenuation         Fade the difference between bright, dim, and dark gradually?
 * @property {number} luminosity          The luminosity applied in the shader
 * @property {number} saturation          The amount of color saturation this light applies to the background texture
 * @property {number} shadows             The depth of shadows this light applies to the background texture
 * @property {LightAnimationData} animation  An animation configuration for the source
 * @property {{min: number, max: number}} darkness  A darkness range (min and max) for which the source should be active
 */
class LightData extends DataModel {
  static defineSchema() {
    return {
      negative: new fields.BooleanField(),
      priority: new fields.NumberField({required: true, nullable: false, integer: true, initial: 0, min: 0}),
      alpha: new fields.AlphaField({initial: 0.5}),
      angle: new fields.AngleField({initial: 360, normalize: false}),
      bright: new fields.NumberField({required: true, nullable: false, initial: 0, min: 0, step: 0.01}),
      color: new fields.ColorField({}),
      coloration: new fields.NumberField({required: true, integer: true, initial: 1}),
      dim: new fields.NumberField({required: true, nullable: false, initial: 0, min: 0, step: 0.01}),
      attenuation: new fields.AlphaField({initial: 0.5}),
      luminosity: new fields.NumberField({required: true, nullable: false, initial: 0.5, min: 0, max: 1}),
      saturation: new fields.NumberField({required: true, nullable: false, initial: 0, min: -1, max: 1}),
      contrast: new fields.NumberField({required: true, nullable: false, initial: 0, min: -1, max: 1}),
      shadows: new fields.NumberField({required: true, nullable: false, initial: 0, min: 0, max: 1}),
      animation: new fields.SchemaField({
        type: new fields.StringField({nullable: true, blank: false, initial: null}),
        speed: new fields.NumberField({required: true, nullable: false, integer: true, initial: 5, min: 0, max: 10,
          validationError: "Light animation speed must be an integer between 0 and 10"}),
        intensity: new fields.NumberField({required: true, nullable: false, integer: true, initial: 5, min: 1, max: 10,
          validationError: "Light animation intensity must be an integer between 1 and 10"}),
        reverse: new fields.BooleanField()
      }),
      darkness: new fields.SchemaField({
        min: new fields.AlphaField({initial: 0}),
        max: new fields.AlphaField({initial: 1})
      }, {
        validate: d => (d.min ?? 0) <= (d.max ?? 1),
        validationError: "darkness.max may not be less than darkness.min"
      })
    };
  }

  /** @override */
  static LOCALIZATION_PREFIXES = ["LIGHT"];

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /** @inheritDoc */
  static migrateData(data) {
    /**
     * Migration of negative luminosity
     * @deprecated since v12
     */
    const luminosity = data.luminosity;
    if ( luminosity < 0) {
      data.luminosity = 1 - luminosity;
      data.negative = true;
    }
    return super.migrateData(data);
  }
}

/* ---------------------------------------- */

/**
 * A data model intended to be used as an inner EmbeddedDataField which defines a geometric shape.
 *
 * @property {string} type                The type of shape, a value in ShapeData.TYPES.
 *                                        For rectangles, the x/y coordinates are the top-left corner.
 *                                        For circles, the x/y coordinates are the center of the circle.
 *                                        For polygons, the x/y coordinates are the first point of the polygon.
 * @property {number|null} width          For rectangles, the pixel width of the shape.
 * @property {number|null} height         For rectangles, the pixel width of the shape.
 * @property {number|null} radius         For circles, the pixel radius of the shape.
 * @property {number[]} [points]          For polygons, the array of polygon coordinates which comprise the shape.
 */
class ShapeData extends DataModel {
  static defineSchema() {
    return {
      type: new fields.StringField({required: true, blank: false, choices: Object.values(this.TYPES), initial: "r"}),
      width: new fields.NumberField({required: true, integer: true, min: 0, label: "Width"}),
      height: new fields.NumberField({required: true, integer: true, min: 0, label: "Height"}),
      radius: new fields.NumberField({required: true, integer: true, positive: true}),
      points: new fields.ArrayField(new fields.NumberField({required: true, nullable: false}))
    };
  }

  /**
   * The primitive shape types which are supported
   * @enum {string}
   */
  static TYPES = {
    RECTANGLE: "r",
    CIRCLE: "c",
    ELLIPSE: "e",
    POLYGON: "p"
  };
}

/* ---------------------------------------- */

/**
 * A data model intended to be used as an inner EmbeddedDataField which defines a geometric shape.
 * @abstract
 *
 * @property {string} type                                          The type of shape, a value in BaseShapeData.TYPES
 * @property {boolean} [hole=false]                                 Is this shape a hole?
 */
class BaseShapeData extends DataModel {

  /**
   * The possible shape types.
   * @type {Readonly<{
   *   rectangle: RectangleShapeData,
   *   circle: CircleShapeData,
   *   ellipse: EllipseShapeData,
   *   polygon: PolygonShapeData
   * }>}
   */
  static get TYPES() {
    return BaseShapeData.#TYPES ??= Object.freeze({
      [RectangleShapeData.TYPE]: RectangleShapeData,
      [CircleShapeData.TYPE]: CircleShapeData,
      [EllipseShapeData.TYPE]: EllipseShapeData,
      [PolygonShapeData.TYPE]: PolygonShapeData
    });
  }

  static #TYPES;

  /* -------------------------------------------- */

  /**
   * The type of this shape.
   * @type {string}
   */
  static TYPE = "";

  /* -------------------------------------------- */

  /** @override */
  static defineSchema() {
    return {
      type: new fields.StringField({required: true, blank: false, initial: this.TYPE,
        validate: value => value === this.TYPE, validationError: `must be equal to "${this.TYPE}"`}),
      hole: new fields.BooleanField()
    };
  }
}

/* -------------------------------------------- */

/**
 * The data model for a rectangular shape.
 *
 * @property {number} x               The top-left x-coordinate in pixels before rotation.
 * @property {number} y               The top-left y-coordinate in pixels before rotation.
 * @property {number} width           The width of the rectangle in pixels.
 * @property {number} height          The height of the rectangle in pixels.
 * @property {number} rotation        The rotation around the center of the rectangle in degrees.
 */
class RectangleShapeData extends BaseShapeData {

  static {
    Object.defineProperty(this, "TYPE", {value: "rectangle"});
  }

  /** @inheritdoc */
  static defineSchema() {
    return Object.assign(super.defineSchema(), {
      x: new fields.NumberField({required: true, nullable: false, initial: undefined}),
      y: new fields.NumberField({required: true, nullable: false, initial: undefined}),
      width: new fields.NumberField({required: true, nullable: false, initial: undefined, positive: true}),
      height: new fields.NumberField({required: true, nullable: false, initial: undefined, positive: true}),
      rotation: new fields.AngleField()
    });
  }
}

/* -------------------------------------------- */

/**
 * The data model for a circle shape.
 *
 * @property {number} x         The x-coordinate of the center point in pixels.
 * @property {number} y         The y-coordinate of the center point in pixels.
 * @property {number} radius    The radius of the circle in pixels.
 */
class CircleShapeData extends BaseShapeData {

  static {
    Object.defineProperty(this, "TYPE", {value: "circle"});
  }

  /** @inheritdoc */
  static defineSchema() {
    return Object.assign(super.defineSchema(), {
      x: new fields.NumberField({required: true, nullable: false, initial: undefined}),
      y: new fields.NumberField({required: true, nullable: false, initial: undefined}),
      radius: new fields.NumberField({required: true, nullable: false, initial: undefined, positive: true})
    });
  }
}

/* -------------------------------------------- */

/**
 * The data model for an ellipse shape.
 *
 * @property {number} x               The x-coordinate of the center point in pixels.
 * @property {number} y               The y-coordinate of the center point in pixels.
 * @property {number} radiusX         The x-radius of the circle in pixels.
 * @property {number} radiusY         The y-radius of the circle in pixels.
 * @property {number} rotation        The rotation around the center of the rectangle in degrees.
 */
class EllipseShapeData extends BaseShapeData {

  static {
    Object.defineProperty(this, "TYPE", {value: "ellipse"});
  }

  /** @inheritdoc */
  static defineSchema() {
    return Object.assign(super.defineSchema(), {
      x: new fields.NumberField({required: true, nullable: false, initial: undefined}),
      y: new fields.NumberField({required: true, nullable: false, initial: undefined}),
      radiusX: new fields.NumberField({required: true, nullable: false, initial: undefined, positive: true}),
      radiusY: new fields.NumberField({required: true, nullable: false, initial: undefined, positive: true}),
      rotation: new fields.AngleField()
    });
  }
}

/* -------------------------------------------- */

/**
 * The data model for a polygon shape.
 *
 * @property {number[]} points      The points of the polygon ([x0, y0, x1, y1, ...]).
 *                                  The polygon must not be self-intersecting.
 */
class PolygonShapeData extends BaseShapeData {

  static {
    Object.defineProperty(this, "TYPE", {value: "polygon"});
  }

  /** @inheritdoc */
  static defineSchema() {
    return Object.assign(super.defineSchema(), {
      points: new fields.ArrayField(new fields.NumberField({required: true, nullable: false, initial: undefined}),
        {validate: value => {
          if ( value.length % 2 !== 0 ) throw new Error("must have an even length");
          if ( value.length < 6 ) throw new Error("must have at least 3 points");
        }})
    });
  }
}

/* ---------------------------------------- */

/**
 * A {@link foundry.data.fields.SchemaField} subclass used to represent texture data.
 * @property {string|null} src            The URL of the texture source.
 * @property {number} anchorX             The X coordinate of the texture anchor.
 * @property {number} anchorY             The Y coordinate of the texture anchor.
 * @property {number} scaleX              The scale of the texture in the X dimension.
 * @property {number} scaleY              The scale of the texture in the Y dimension.
 * @property {number} offsetX             The X offset of the texture with (0,0) in the top left.
 * @property {number} offsetY             The Y offset of the texture with (0,0) in the top left.
 * @property {TextureDataFitMode} fit     The texture fit mode.
 * @property {number} rotation            An angle of rotation by which this texture is rotated around its center.
 * @property {string} tint                The tint applied to the texture.
 * @property {number} alphaThreshold      Only pixels with an alpha value at or above this value are consider solid
 *                                        w.r.t. to occlusion testing and light/weather blocking.
 */
class TextureData extends fields.SchemaField {
  /**
   * @param {DataFieldOptions} options        Options which are forwarded to the SchemaField constructor
   * @param {Pick<FilePathFieldOptions, "categories"|"initial"|"wildcard"|"label">} srcOptions
   *                                          Additional options for the src field
   */
  constructor(options={}, {categories=["IMAGE", "VIDEO"], initial={}, wildcard=false, label=""}={}) {
    /** @deprecated since v12 */
    if ( typeof initial === "string" ) {
      const msg = "Passing the initial value of the src field as a string is deprecated. Pass {src} instead.";
      utils.logCompatibilityWarning(msg, {since: 12, until: 14});
      initial = {src: initial};
    }
    super({
      src: new fields.FilePathField({required: true, categories, initial: initial.src ?? null, label,
        virtual: !wildcard, wildcard}),
      anchorX: new fields.NumberField({required: true, nullable: false, initial: initial.anchorX ?? 0}),
      anchorY: new fields.NumberField({required: true, nullable: false, initial: initial.anchorY ?? 0}),
      offsetX: new fields.NumberField({required: true, nullable: false, integer: true, initial: initial.offsetX ?? 0}),
      offsetY: new fields.NumberField({required: true, nullable: false, integer: true, initial: initial.offsetY ?? 0}),
      fit: new fields.StringField({required: true, initial: initial.fit ?? "fill", choices: CONST.TEXTURE_DATA_FIT_MODES}),
      scaleX: new fields.NumberField({required: true, nullable: false, initial: initial.scaleX ?? 1}),
      scaleY: new fields.NumberField({required: true, nullable: false, initial: initial.scaleY ?? 1}),
      rotation: new fields.AngleField({initial: initial.rotation ?? 0}),
      tint: new fields.ColorField({required: true, nullable: false, initial: initial.tint ?? "#ffffff"}),
      alphaThreshold: new fields.AlphaField({nullable: false, initial: initial.alphaThreshold ?? 0})
    }, options);
  }
}

/* ---------------------------------------- */

/**
 * Extend the base TokenData to define a PrototypeToken which exists within a parent Actor.
 * @extends DataModel<PrototypeTokenData>
 * @property {boolean} randomImg      Does the prototype token use a random wildcard image?
 */
class PrototypeToken extends DataModel {
  constructor(data={}, options={}) {
    super(data, options);
    Object.defineProperty(this, "apps", {value: {}});
  }

  /** @override */
  static defineSchema() {
    const schema = foundry.documents.BaseToken.defineSchema();
    const excluded = ["_id", "actorId", "delta", "x", "y", "elevation", "shape", "sort", "hidden", "locked",
      "_movementHistory", "_regions"];
    for ( const fieldName of excluded ) {
      delete schema[fieldName];
    }
    schema.name.textSearch = schema.name.options.textSearch = false;
    schema.randomImg = new fields.BooleanField();
    schema.appendNumber = new fields.BooleanField();
    schema.prependAdjective = new fields.BooleanField();
    return schema;
  }

  /** @override */
  static LOCALIZATION_PREFIXES = ["DOCUMENT", "TOKEN"];

  /**
   * The Actor which owns this Prototype Token
   * @type {BaseActor}
   */
  get actor() {
    return this.parent;
  }

  /** @inheritdoc */
  toObject(source=true) {
    const data = super.toObject(source);
    data.actorId = this.document?.id;
    return data;
  }

  /** @ignore */
  static get database() {
    return globalThis.CONFIG.DatabaseBackend;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _initializeSource(data, options={}) {
    if ( data instanceof PrototypeToken ) data = data.toObject();
    PrototypeTokenOverrides.applyOverrides(data, this.parent?.type);
    return super._initializeSource(data, options);
  }

  /* -------------------------------------------- */
  /*  Document Compatibility Methods              */
  /* -------------------------------------------- */

  /**
   * @see {@link foundry.abstract.Document#update}
   * @ignore
   */
  update(data, options) {
    return this.actor.update({prototypeToken: data}, options);
  }

  /* -------------------------------------------- */

  /**
   * @see {@link foundry.abstract.Document#getFlag}
   * @ignore
   */
  getFlag(...args) {
    return foundry.abstract.Document.prototype.getFlag.call(this, ...args);
  }

  /* -------------------------------------------- */

  /**
   * @see {@link foundry.abstract.Document#getFlag}
   * @ignore
   */
  setFlag(...args) {
    return foundry.abstract.Document.prototype.setFlag.call(this, ...args);
  }

  /* -------------------------------------------- */

  /**
   * @see {@link foundry.abstract.Document#unsetFlag}
   * @ignore
   */
  async unsetFlag(...args) {
    return foundry.abstract.Document.prototype.unsetFlag.call(this, ...args);
  }

  /* -------------------------------------------- */

  /**
   * @see {@link foundry.abstract.Document#testUserPermission}
   * @ignore
   */
  testUserPermission(user, permission, {exact=false}={}) {
    return this.actor.testUserPermission(user, permission, {exact});
  }

  /* -------------------------------------------- */

  /**
   * @see {@link foundry.documents.BaseActor#isOwner}
   * @ignore
   */
  get isOwner() {
    return this.actor.isOwner;
  }
}

/* -------------------------------------------- */

/**
 * The data model for the the core.prototypeTokenOverrides setting.
 */
class PrototypeTokenOverrides extends DataModel {
  /** @override */
  static defineSchema() {
    const labelFor = n => `TOKEN.FIELDS.${n}.label`;
    return getDocumentClass("Actor").TYPES.reduce((types, type) => {
      const prototypeSchema = PrototypeToken.defineSchema();

      // Select a subset of the prototype schema, make all non-recursive fields nullable, and set an initial of null.
      const subSchema = {
        sight: new fields.SchemaField({
          enabled: new fields.BooleanField({required: false, initial: undefined, label: labelFor("sight.enabled")})
        }),
        ring: new fields.SchemaField({
          enabled: new fields.BooleanField({required: false, initial: undefined, label: labelFor("ring.enabled")})
        }),
        turnMarker: prototypeSchema.turnMarker
      };
      for ( const fieldName of ["displayName", "displayBars", "disposition", "lockRotation"] ) {
        const field = prototypeSchema[fieldName];
        field.label = labelFor(fieldName);
        field.required = false;
        field.initial = undefined;
        subSchema[fieldName] = field;
      }
      for (const field of Object.values(subSchema.turnMarker.fields)) {
        field.label = labelFor(`turnMarker.${field.name}`);
        field.required = false;
        field.initial = undefined;
      }
      types[type] = new fields.SchemaField(subSchema);
      return types;
    }, {});
  }

  /* -------------------------------------------- */

  /**
   * Localize all non-recursive data fields on first load of the application.
   * @param {fields.DataField[]} [fields] Subfields of a recursive field
   * @param {Record<string, string>} [cache] A running cache of localization results
   */
  static localizeFields(fields, cache={}) {
    const Cls = PrototypeTokenOverrides;
    if ( Cls.#localized ) return;
    fields ??= Object.values(Cls.schema.fields).flatMap(f => Object.values(f.fields));
    for ( const field of fields ) {
      if ( field instanceof foundry.data.fields.SchemaField ) {
        Cls.localizeFields(Object.values(field.fields, cache));
        continue;
      }
      field.label = (cache[field.label] ??= game.i18n.localize(field.label));
    }
    if ( !fields ) Cls.#localized = true;
  }

  /* -------------------------------------------- */

  /** @override */
  static LOCALIZATION_PREFIXES = ["TOKEN"];

  /**
   * The named of the world setting that stores the prototype token overrides
   * @type {"prototypeTokenOverrides"}
   */
  static SETTING = "prototypeTokenOverrides";

  /**
   * A cached copy of the currently-configured overrides
   * @returns {PrototypeTokenOverrides}
   */
  static get overrides() {
    return this.#overrides ??= game.settings.get("core", PrototypeTokenOverrides.SETTING);
  }

  /**
   * Set or clear the cached overrides.
   * @param {PrototypeTokenOverrides|null} value
   */
  static set overrides(value) {
    this.#overrides = value;
  }

  /**
   * @type {PrototypeTokenOverrides|null}
   */
  static #overrides = null;

  /** Have the fields been localized? Done later since this model may be initialized before i18n is ready. */
  static #localized = false;

  /* -------------------------------------------- */

  /**
   * Apply configured overrides to prototype token data.
   * @param {object} source The prototype token source data on which to operate
   * @param {string} [actorType] The prototype parent's actor type: used to retrieve type-specific overrides
   */
  static applyOverrides(source, actorType) {
    if ( !game.settings || !game.model ) return; // Server-side or Setup
    const setting = PrototypeTokenOverrides.overrides;
    const global = utils.flattenObject(setting.base);
    const typed = utils.flattenObject(setting[actorType] ?? {});
    for ( const [path, baseValue] of Object.entries(global) ) {
      const override = typed[path] ?? baseValue;
      if ( override !== undefined ) utils.setProperty(source, path, override);
    }
  }

  /* -------------------------------------------- */

  /**
   * Apply configured overrides to all Actor documents within the World.
   */
  static applyAll() {
    PrototypeTokenOverrides.#overrides = null;
    for ( const actor of game.actors ) {
      this.applyOverrides(actor.prototypeToken._source, actor.type);
      actor.prototypeToken.reset();
      actor.render();
    }
  }
}

/* -------------------------------------------- */

/**
 * A minimal data model used to represent a tombstone entry inside an {@link foundry.abstract.EmbeddedCollectionDelta}.
 *
 * @property {string} _id              The _id of the base Document that this tombstone represents.
 * @property {boolean} _tombstone      A property that identifies this entry as a tombstone.
 */
class TombstoneData extends DataModel {
  /** @override */
  static defineSchema() {
    return {
      _id: new fields.DocumentIdField(),
      _tombstone: new fields.BooleanField({initial: true, validate: v => v === true, validationError: "must be true"})
    };
  }
}

// Exports need to be at the bottom so that class names appear correctly in JSDoc
export {
  LightData,
  PrototypeToken,
  PrototypeTokenOverrides,
  ShapeData,
  BaseShapeData,
  RectangleShapeData,
  CircleShapeData,
  EllipseShapeData,
  PolygonShapeData,
  TextureData,
  TombstoneData
};

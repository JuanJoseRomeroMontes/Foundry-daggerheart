import DataModel from "@common/abstract/data.mjs";
import {LIGHTING_LEVELS} from "@common/constants.mjs";
import * as fields from "@client/data/fields.mjs";
import PointVisionSource from "../sources/point-vision-source.mjs";

/**
 * A Vision Mode which can be selected for use by a Token.
 * The selected Vision Mode alters the appearance of various aspects of the canvas while that Token is the POV.
 */
export default class VisionMode extends DataModel {
  /**
   * Construct a Vision Mode using provided configuration parameters and callback functions.
   * @param {object} data             Data which fulfills the model defined by the VisionMode schema.
   * @param {object} [options]        Additional options passed to the DataModel constructor.
   */
  constructor(data={}, options={}) {
    super(data, options);
    this.animated = options.animated ?? false;
  }

  /** @inheritDoc */
  static defineSchema() {
    const shaderSchema = () => new fields.SchemaField({
      shader: new fields.ShaderField(),
      uniforms: new fields.ObjectField()
    });
    const lightingSchema = () => new fields.SchemaField({
      visibility: new fields.NumberField({
        initial: this.LIGHTING_VISIBILITY.ENABLED,
        choices: Object.values(this.LIGHTING_VISIBILITY)
      }),
      postProcessingModes: new fields.ArrayField(new fields.StringField()),
      uniforms: new fields.ObjectField()
    });

    // Return model schema
    return {
      id: new fields.StringField({blank: false}),
      label: new fields.StringField({blank: false}),
      tokenConfig: new fields.BooleanField({initial: true}),
      canvas: new fields.SchemaField({
        shader: new fields.ShaderField(),
        uniforms: new fields.ObjectField()
      }),
      lighting: new fields.SchemaField({
        background: lightingSchema(),
        coloration: lightingSchema(),
        illumination: lightingSchema(),
        darkness: lightingSchema(),
        levels: new fields.ObjectField({
          validate: o => {
            const values = Object.values(LIGHTING_LEVELS);
            return Object.entries(o).every(([k, v]) => values.includes(Number(k)) && values.includes(v));
          },
          validationError: "may only contain a mapping of keys from VisionMode.LIGHTING_LEVELS"
        }),
        multipliers: new fields.ObjectField({
          validate: o => {
            const values = Object.values(LIGHTING_LEVELS);
            return Object.entries(o).every(([k, v]) => values.includes(Number(k)) && Number.isFinite(v));
          },
          validationError: "must provide a mapping of keys from VisionMode.LIGHTING_LEVELS to numeric multiplier values"
        })
      }),
      vision: new fields.SchemaField({
        background: shaderSchema(),
        coloration: shaderSchema(),
        illumination: shaderSchema(),
        darkness: new fields.SchemaField({
          adaptive: new fields.BooleanField({initial: true})
        }),
        defaults: new fields.SchemaField({
          color: new fields.ColorField({required: false, initial: undefined}),
          attenuation: new fields.AlphaField({required: false, initial: undefined}),
          brightness: new fields.NumberField({required: false, initial: undefined, nullable: false, min: -1, max: 1}),
          saturation: new fields.NumberField({required: false, initial: undefined, nullable: false, min: -1, max: 1}),
          contrast: new fields.NumberField({required: false, initial: undefined, nullable: false, min: -1, max: 1})
        }),
        preferred: new fields.BooleanField({initial: false})
      })
    };
  }

  /**
   * The lighting illumination levels which are supported.
   * @enum {number}
   */
  static LIGHTING_LEVELS = LIGHTING_LEVELS;

  /**
   * Flags for how each lighting channel should be rendered for the currently active vision modes:
   * - Disabled: this lighting layer is not rendered, the shaders does not decide.
   * - Enabled: this lighting layer is rendered normally, and the shaders can choose if they should be rendered or not.
   * - Required: the lighting layer is rendered, the shaders does not decide.
   * @enum {number}
   */
  static LIGHTING_VISIBILITY = {
    DISABLED: 0,
    ENABLED: 1,
    REQUIRED: 2
  };

  /**
   * A flag for whether this vision source is animated
   * @type {boolean}
   */
  animated = false;

  /**
   * Does this vision mode enable light sources?
   * True unless it disables lighting entirely.
   * @type {boolean}
   */
  get perceivesLight() {
    const {background, illumination, coloration} = this.lighting;
    return !!(background.visibility || illumination.visibility || coloration.visibility);
  }

  /**
   * Special activation handling that could be implemented by VisionMode subclasses
   * @param {PointVisionSource} source   Activate this VisionMode for a specific source
   * @abstract
   */
  _activate(source) {}

  /**
   * Special deactivation handling that could be implemented by VisionMode subclasses
   * @param {PointVisionSource} source   Deactivate this VisionMode for a specific source
   * @abstract
   */
  _deactivate(source) {}

  /**
   * Special handling which is needed when this Vision Mode is activated for a PointVisionSource.
   * @param {PointVisionSource} source   Activate this VisionMode for a specific source
   */
  activate(source) {
    if ( source._visionModeActivated ) return;
    source._visionModeActivated = true;
    this._activate(source);
  }

  /**
   * Special handling which is needed when this Vision Mode is deactivated for a PointVisionSource.
   * @param {PointVisionSource} source   Deactivate this VisionMode for a specific source
   */
  deactivate(source) {
    if ( !source._visionModeActivated ) return;
    source._visionModeActivated = false;
    this._deactivate(source);
  }

  /**
   * An animation function which runs every frame while this Vision Mode is active.
   * @param {number} dt         The deltaTime passed by the PIXI Ticker
   */
  animate(dt) {
    return PointVisionSource.prototype.animateTime.call(this, dt);
  }
}

/**
 * Kept here for full compatibility
 * @deprecated since v13 until v14
 * @ignore
 */
export {ShaderField} from "@client/data/fields.mjs";

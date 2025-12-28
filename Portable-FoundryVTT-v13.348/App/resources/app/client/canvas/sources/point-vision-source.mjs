import RenderedEffectSource from "./rendered-effect-source.mjs";
import PointEffectSourceMixin from "./point-effect-source.mjs";
import {LIGHTING_LEVELS} from "../../../common/constants.mjs";
import BackgroundVisionShader from "../rendering/shaders/vision/background-vision.mjs";
import ColorationVisionShader from "../rendering/shaders/vision/coloration-vision.mjs";
import IlluminationVisionShader from "../rendering/shaders/vision/illumination-vision.mjs";
import Color from "@common/utils/color.mjs";

/**
 * @import {BaseEffectSourceData} from "./base-effect-source.mjs";
 * @import {RenderedEffectSourceData} from "./rendered-effect-source.mjs";
 */

/**
 * @typedef VisionSourceData
 * @property {number} contrast            The amount of contrast
 * @property {number} attenuation         Strength of the attenuation between bright, dim, and dark
 * @property {number} saturation          The amount of color saturation
 * @property {number} brightness          The vision brightness.
 * @property {string} visionMode          The vision mode.
 * @property {number} lightRadius         The range of light perception.
 * @property {boolean} blinded            Is this vision source blinded?
 */

/**
 * A specialized subclass of RenderedEffectSource which represents a source of point-based vision.
 * @extends {RenderedEffectSource<BaseEffectSourceData & RenderedEffectSourceData & VisionSourceData, PointSourcePolygon>}
 */
export default class PointVisionSource extends PointEffectSourceMixin(RenderedEffectSource) {

  /** @inheritdoc */
  static sourceType = "sight";

  /** @override */
  static _initializeShaderKeys = ["visionMode", "blinded"];

  /** @override */
  static _refreshUniformsKeys = ["radius", "color", "attenuation", "brightness", "contrast", "saturation", "visionMode"];

  /**
   * The corresponding lighting levels for dim light.
   * @type {number}
   * @protected
   */
  static _dimLightingLevel = LIGHTING_LEVELS.DIM;

  /**
   * The corresponding lighting levels for bright light.
   * @type {number}
   * @protected
   */
  static _brightLightingLevel = LIGHTING_LEVELS.BRIGHT;

  /** @inheritdoc */
  static EDGE_OFFSET = -2;

  /** @override */
  static effectsCollection = "visionSources";

  /** @inheritDoc */
  static defaultData = {
    ...super.defaultData,
    contrast: 0,
    attenuation: 0.5,
    saturation: 0,
    brightness: 0,
    visionMode: "basic",
    lightRadius: null
  }

  /** @override */
  static get _layers() {
    return {
      background: {
        defaultShader: BackgroundVisionShader,
        blendMode: "MAX_COLOR"
      },
      coloration: {
        defaultShader: ColorationVisionShader,
        blendMode: "SCREEN"
      },
      illumination: {
        defaultShader: IlluminationVisionShader,
        blendMode: "MAX_COLOR"
      }
    };
  }

  /* -------------------------------------------- */
  /*  Vision Source Attributes                    */
  /* -------------------------------------------- */

  /**
   * The vision mode linked to this VisionSource
   * @type {VisionMode|null}
   */
  visionMode = null;

  /**
   * The vision mode activation flag for handlers
   * @type {boolean}
   * @internal
   */
  _visionModeActivated = false;

  /**
   * The unconstrained LOS polygon.
   * @type {PointSourcePolygon}
   */
  los;

  /**
   * The polygon of light perception.
   * @type {PointSourcePolygon}
   */
  light;

  /* -------------------------------------------- */

  /**
   * An alias for the shape of the vision source.
   * @type {PointSourcePolygon|PIXI.Polygon}
   */
  get fov() {
    return this.shape;
  }

  /* -------------------------------------------- */

  /**
   * If this vision source background is rendered into the lighting container.
   * @type {boolean}
   */
  get preferred() {
    return this.visionMode?.vision.preferred;
  }

  /* -------------------------------------------- */

  /**
   * Is the rendered source animated?
   * @type {boolean}
   */
  get isAnimated() {
    return this.active && this.data.animation && this.visionMode?.animated;
  }

  /* -------------------------------------------- */

  /**
   * Light perception radius of this vision source, taking into account if the source is blinded.
   * @type {number}
   */
  get lightRadius() {
    return this.#hasBlindedVisionMode ? 0 : (this.data.lightRadius ?? 0);
  }

  /* -------------------------------------------- */

  /** @override */
  get radius() {
    return (this.#hasBlindedVisionMode ? this.data.externalRadius : this.data.radius) ?? 0;
  }

  /* -------------------------------------------- */
  /*  Point Vision Source Blinded Management      */
  /* -------------------------------------------- */

  /**
   * Is this source temporarily blinded?
   * @type {boolean}
   */
  get isBlinded() {
    return (this.data.radius === 0) && ((this.data.lightRadius === 0) || !this.visionMode?.perceivesLight)
      || Object.values(this.blinded).includes(true);
  };

  /**
   * Records of blinding strings with a boolean value.
   * By default, if any of this record is true, the source is blinded.
   * @type {Record<string, boolean>}
   */
  blinded = {};

  /**
   * Data overrides that could happen with blindness vision mode.
   * @type {object}
   */
  visionModeOverrides = {};

  /* -------------------------------------------- */

  /**
   * Update darkness blinding according to darkness sources collection.
   */
  #updateBlindedState() {
    const condition = darknessSource => this.priority <= darknessSource.priority;
    this.blinded.darkness = canvas.effects.testInsideDarkness(this.origin, {condition});
  }

  /* -------------------------------------------- */

  /**
   * To know if blindness vision mode is configured for this source.
   * Note: Convenient method used to avoid calling this.blinded which is costly.
   * @returns {boolean}
   */
  get #hasBlindedVisionMode() {
    return this.visionMode === CONFIG.Canvas.visionModes.blindness;
  }

  /* -------------------------------------------- */
  /*  Vision Source Initialization                */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _initialize(data) {
    super._initialize(data);
    this.data.lightRadius ??= canvas.dimensions.maxR;
    if ( this.data.lightRadius > 0 ) this.data.lightRadius = Math.max(this.data.lightRadius, this.data.externalRadius);
    if ( this.data.radius > 0 ) this.data.radius = Math.max(this.data.radius, this.data.externalRadius);
    if ( !(this.data.visionMode in CONFIG.Canvas.visionModes) ) this.data.visionMode = "basic";
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _createShapes() {
    this._updateVisionMode();
    super._createShapes();
    this.los = this.shape;
    this.light = this._createLightPolygon();
    this.shape = this._createRestrictedPolygon();
  }

  /* -------------------------------------------- */

  /**
   * Responsible for assigning the Vision Mode and calling the activation and deactivation handlers.
   * @protected
   */
  _updateVisionMode() {
    const previousVM = this.visionMode;
    this.visionMode = CONFIG.Canvas.visionModes[this.data.visionMode];

    // Check blinding conditions
    this.#updateBlindedState();

    // Apply vision mode according to conditions
    if ( this.isBlinded ) this.visionMode = CONFIG.Canvas.visionModes.blindness;

    // Process vision mode overrides for blindness
    const defaults = this.visionMode.vision.defaults;
    const data = this.data;
    const applyOverride = prop => this.#hasBlindedVisionMode && (defaults[prop] !== undefined) ? defaults[prop] : data[prop];
    const blindedColor = applyOverride("color");
    this.visionModeOverrides.colorRGB = blindedColor !== null ? Color.from(blindedColor).rgb : null;
    this.visionModeOverrides.brightness = applyOverride("brightness");
    this.visionModeOverrides.contrast = applyOverride("contrast");
    this.visionModeOverrides.saturation = applyOverride("saturation");
    this.visionModeOverrides.attenuation = applyOverride("attenuation");

    // Process deactivation and activation handlers
    if ( this.visionMode !== previousVM ) previousVM?.deactivate(this);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _configure(changes) {
    this.visionMode.activate(this);
    super._configure(changes);
    this.animation.animation = this.visionMode.animate;
  }

  /* -------------------------------------------- */

  /** @override */
  _configureLayer(layer, layerId) {
    const vmUniforms = this.visionMode.vision[layerId].uniforms;
    layer.vmUniforms = Object.entries(vmUniforms);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _getPolygonConfiguration() {
    return Object.assign(super._getPolygonConfiguration(), {
      radius: this.data.disabled || this.suppressed ? 0 : (this.blinded.darkness
        ? this.data.externalRadius : canvas.dimensions.maxR),
      useThreshold: true
    });
  }

  /* -------------------------------------------- */

  /**
   * Creates the polygon that represents light perception.
   * If the light perception radius is unconstrained, no new polygon instance is created;
   * instead the LOS polygon of this vision source is returned.
   * @returns {PointSourcePolygon}    The new polygon or `this.los`.
   * @protected
   */
  _createLightPolygon() {
    return this.#createConstrainedPolygon(this.lightRadius);
  }

  /* -------------------------------------------- */

  /**
   * Create a restricted FOV polygon by limiting the radius of the unrestricted LOS polygon.
   * If the vision radius is unconstrained, no new polygon instance is created;
   * instead the LOS polygon of this vision source is returned.
   * @returns {PointSourcePolygon}    The new polygon or `this.los`.
   * @protected
   */
  _createRestrictedPolygon() {
    return this.#createConstrainedPolygon(this.radius || this.data.externalRadius);
  }

  /* -------------------------------------------- */

  /**
   * Create a constrained polygon by limiting the radius of the unrestricted LOS polygon.
   * If the radius is unconstrained, no new polygon instance is created;
   * instead the LOS polygon of this vision source is returned.
   * @param {number} radius           The radius to constraint to.
   * @returns {PointSourcePolygon}    The new polygon or `this.los`.
   */
  #createConstrainedPolygon(radius) {
    if ( radius >= this.los.config.radius ) return this.los;
    const {x, y} = this.data;
    const circle = new PIXI.Circle(x, y, radius);
    return this.los.applyConstraint(circle);
  }

  /* -------------------------------------------- */
  /*  Shader Management                           */
  /* -------------------------------------------- */

  /** @override */
  _configureShaders() {
    const vm = this.visionMode.vision;
    const shaders = {};
    for ( const layer in this.layers ) {
      shaders[layer] = vm[`${layer.toLowerCase()}`]?.shader || this.layers[layer].defaultShader;
    }
    return shaders;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _updateColorationUniforms() {
    super._updateColorationUniforms();
    const shader = this.layers.coloration.shader;
    if ( !shader ) return;
    const u = shader?.uniforms;
    const d = shader.constructor.defaultUniforms;
    u.colorEffect = this.visionModeOverrides.colorRGB ?? d.colorEffect;
    u.useSampler = true;
    const vmUniforms = this.layers.coloration.vmUniforms;
    if ( vmUniforms.length ) this._updateVisionModeUniforms(shader, vmUniforms);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _updateIlluminationUniforms() {
    super._updateIlluminationUniforms();
    const shader = this.layers.illumination.shader;
    if ( !shader ) return;
    shader.uniforms.useSampler = false; // We don't need to use the background sampler into vision illumination
    const vmUniforms = this.layers.illumination.vmUniforms;
    if ( vmUniforms.length ) this._updateVisionModeUniforms(shader, vmUniforms);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _updateBackgroundUniforms() {
    super._updateBackgroundUniforms();
    const shader = this.layers.background.shader;
    if ( !shader ) return;
    const u = shader.uniforms;
    u.technique = 0;
    u.contrast = this.visionModeOverrides.contrast;
    u.useSampler = true;
    const vmUniforms = this.layers.background.vmUniforms;
    if ( vmUniforms.length ) this._updateVisionModeUniforms(shader, vmUniforms);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _updateCommonUniforms(shader) {
    const u = shader.uniforms;
    const d = shader.constructor.defaultUniforms;
    const c = canvas.colors;

    // Passing common environment values
    u.computeIllumination = true;
    u.darknessLevel = canvas.environment.darknessLevel;
    c.ambientBrightest.applyRGB(u.ambientBrightest);
    c.ambientDarkness.applyRGB(u.ambientDarkness);
    c.ambientDaylight.applyRGB(u.ambientDaylight);
    u.weights[0] = canvas.environment.weights.dark;
    u.weights[1] = canvas.environment.weights.halfdark;
    u.weights[2] = canvas.environment.weights.dim;
    u.weights[3] = canvas.environment.weights.bright;
    u.dimLevelCorrection = this.constructor._dimLightingLevel;
    u.brightLevelCorrection = this.constructor._brightLightingLevel;

    // Vision values
    const attenuation = this.visionModeOverrides.attenuation;
    u.attenuation = Math.max(attenuation, 0.0125);
    const brightness = this.visionModeOverrides.brightness;
    u.brightness = (brightness + 1) / 2;
    u.saturation = this.visionModeOverrides.saturation;
    u.linkedToDarknessLevel = this.visionMode.vision.darkness.adaptive;

    // Other values
    u.elevation = this.data.elevation;
    u.screenDimensions = canvas.screenDimensions;
    u.colorTint = this.visionModeOverrides.colorRGB ?? d.colorTint;

    // Textures
    if ( !u.depthTexture ) u.depthTexture = canvas.masks.depth.renderTexture;
    if ( !u.primaryTexture ) u.primaryTexture = canvas.primary.renderTexture;
    if ( !u.darknessLevelTexture ) u.darknessLevelTexture = canvas.effects.illumination.renderTexture;
  }

  /* -------------------------------------------- */

  /**
   * Update layer uniforms according to vision mode uniforms, if any.
   * @param {AdaptiveVisionShader} shader        The shader being updated.
   * @param {Record<string, any>} vmUniforms     The targeted layer.
   * @protected
   */
  _updateVisionModeUniforms(shader, vmUniforms) {
    const shaderUniforms = shader.uniforms;
    for ( const [uniform, value] of vmUniforms ) {
      if ( Array.isArray(value) ) {
        const u = (shaderUniforms[uniform] ??= []);
        for ( const i in value ) u[i] = value[i];
      }
      else shaderUniforms[uniform] = value;
    }
  }
}

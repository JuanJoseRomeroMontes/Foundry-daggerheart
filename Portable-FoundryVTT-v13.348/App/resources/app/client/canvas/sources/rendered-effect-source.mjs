import BaseEffectSource from "./base-effect-source.mjs";
import PointSourceMesh from "../containers/elements/point-source-mesh.mjs";
import {LIGHTING_LEVELS} from "@common/constants.mjs";
import Color from "@common/utils/color.mjs";
import Hooks from "@client/helpers/hooks.mjs";

/**
 * @import {LightingLevel} from "@common/constants.mjs"
 * @import {AdaptiveBackgroundShader, AdaptiveColorationShader, AdaptiveDarknessShader, AdaptiveIlluminationShader,
 *   AdaptiveLightingShader} from "../rendering/shaders/_module.mjs";
 * @import {BaseEffectSourceData} from "./base-effect-source.mjs";
 */

/**
 * @typedef RenderedEffectSourceData
 * @property {object} animation           An animation configuration for the source
 * @property {number|null} color          A color applied to the rendered effect
 * @property {number|null} seed           An integer seed to synchronize (or de-synchronize) animations
 * @property {boolean} preview            Is this source a temporary preview?
 */

/**
 * @typedef RenderedEffectSourceAnimationConfig
 * @property {string} [label]                                   The human-readable (localized) label for the animation
 * @property {Function} [animation]                             The animation function that runs every frame
 * @property {AdaptiveIlluminationShader} [illuminationShader]  A custom illumination shader used by this animation
 * @property {AdaptiveColorationShader} [colorationShader]      A custom coloration shader used by this animation
 * @property {AdaptiveBackgroundShader} [backgroundShader]      A custom background shader used by this animation
 * @property {AdaptiveDarknessShader} [darknessShader]          A custom darkness shader used by this animation
 * @property {number} [seed]                                    The animation seed
 * @property {number} [time]                                    The animation time
 */

/**
 * @typedef RenderedEffectLayerConfig
 * @property {typeof AdaptiveLightingShader} defaultShader      The default shader used by this layer
 * @property {PIXI.BLEND_MODES} blendMode                       The blend mode used by this layer
 */

/**
 * An abstract class which extends the base PointSource to provide common functionality for rendering.
 * This class is extended by both the LightSource and VisionSource subclasses.
 * @extends {BaseEffectSource<BaseEffectSourceData & RenderedEffectSourceData>}
 * @abstract
 */
export default class RenderedEffectSource extends BaseEffectSource {

  /**
   * Keys of the data object which require shaders to be re-initialized.
   * @type {string[]}
   * @protected
   */
  static _initializeShaderKeys = ["animation.type"];

  /**
   * Keys of the data object which require uniforms to be refreshed.
   * @type {string[]}
   * @protected
   */
  static _refreshUniformsKeys = [];

  /**
   * Layers handled by this rendered source.
   * @type {Record<string, RenderedEffectLayerConfig>}
   * @protected
   */
  static get _layers() {
    return {};
  }

  /**
   * The offset in pixels applied to create soft edges.
   * @type {number}
   */
  static EDGE_OFFSET = -8;

  /** @inheritDoc */
  static defaultData = {
    ...super.defaultData,
    animation: {},
    seed: null,
    preview: false,
    color: null
  };

  /* -------------------------------------------- */
  /*  Rendered Source Attributes                  */
  /* -------------------------------------------- */

  /**
   * The animation configuration applied to this source
   * @type {RenderedEffectSourceAnimationConfig}
   */
  animation = {};

  /**
   * @typedef RenderedEffectSourceLayer
   * @property {boolean} active             Is this layer actively rendered?
   * @property {boolean} reset              Do uniforms need to be reset?
   * @property {boolean} suppressed         Is this layer temporarily suppressed?
   * @property {PointSourceMesh} mesh       The rendered mesh for this layer
   * @property {AdaptiveLightingShader} shader  The shader instance used for the layer
   */

  /**
   * Track the status of rendering layers
   * @type {{
   *  background: RenderedEffectSourceLayer,
   *  coloration: RenderedEffectSourceLayer,
   *  illumination: RenderedEffectSourceLayer
   * }}
   */
  layers = Object.entries(this.constructor._layers).reduce((obj, [layer, config]) => {
    obj[layer] = {active: true, reset: true, suppressed: false,
      mesh: undefined, shader: undefined, defaultShader: config.defaultShader,
      vmUniforms: undefined, blendMode: config.blendMode};
    return obj;
  }, {});

  /**
   * Array of update uniforms functions.
   * @type {Function[]}
   */
  #updateUniformsFunctions = (() => {
    const initializedFunctions = [];
    for ( const layer in this.layers ) {
      const fn = this[`_update${layer.titleCase()}Uniforms`];
      if ( fn ) initializedFunctions.push(fn);
    }
    return initializedFunctions;
  })();

  /**
   * The color of the source as an RGB vector.
   * @type {[number, number, number]|null}
   */
  colorRGB = null;

  /**
   * PIXI Geometry generated to draw meshes.
   * @type {PIXI.Geometry|null}
   * @protected
   */
  _geometry = null;

  /* -------------------------------------------- */
  /*  Source State                                */
  /* -------------------------------------------- */

  /**
   * Is the rendered source animated?
   * @type {boolean}
   */
  get isAnimated() {
    return this.active && this.data.animation?.type;
  }

  /**
   * Has the rendered source at least one active layer?
   * @type {boolean}
   */
  get hasActiveLayer() {
    return this.#hasActiveLayer;
  }

  #hasActiveLayer = false;

  /**
   * Is this RenderedEffectSource a temporary preview?
   * @returns {boolean}
   */
  get isPreview() {
    return !!this.data.preview;
  }

  /* -------------------------------------------- */
  /*  Rendered Source Properties                  */
  /* -------------------------------------------- */

  /**
   * A convenience accessor to the background layer mesh.
   * @type {PointSourceMesh}
   */
  get background() {
    return this.layers.background.mesh;
  }

  /**
   * A convenience accessor to the coloration layer mesh.
   * @type {PointSourceMesh}
   */
  get coloration() {
    return this.layers.coloration.mesh;
  }

  /**
   * A convenience accessor to the illumination layer mesh.
   * @type {PointSourceMesh}
   */
  get illumination() {
    return this.layers.illumination.mesh;
  }

  /* -------------------------------------------- */
  /*  Rendered Source Initialization              */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _initialize(data) {
    super._initialize(data);
    const color = Color.from(this.data.color ?? null);
    this.data.color = color.valid ? color.valueOf() : null;
    const seed = this.data.seed ?? this.animation.seed ?? Math.floor(Math.random() * 100000);
    this.animation = this.data.animation = {seed, ...this.data.animation};

    // Initialize the color attributes
    const hasColor = this._flags.hasColor = (this.data.color !== null);
    if ( hasColor ) Color.applyRGB(color, this.colorRGB ??= [0, 0, 0]);
    else this.colorRGB = null;

    // We need to update the hasColor uniform attribute immediately
    for ( const layer of Object.values(this.layers) ) {
      if ( layer.shader ) layer.shader.uniforms.hasColor = hasColor;
    }
  }

  /* -------------------------------------------- */

  /**
   * Decide whether to render soft edges with a blur.
   * @protected
   */
  _initializeSoftEdges() {
    this._flags.renderSoftEdges = canvas.performance.lightSoftEdges && !this.isPreview;
  }

  /* -------------------------------------------- */

  /** @override */
  _configure(changes) {
    // To know if we need a first time initialization of the shaders
    const initializeShaders = !this._geometry;

    // Configure soft edges
    this._initializeSoftEdges();

    // Initialize meshes using the computed shape
    this.#initializeMeshes();

    // Initialize shaders
    if ( initializeShaders || this.constructor._initializeShaderKeys.some(k => k in changes) ) {
      this.#initializeShaders();
    }

    // Refresh uniforms
    else if ( this.constructor._refreshUniformsKeys.some(k => k in changes) ) {
      for ( const config of Object.values(this.layers) ) {
        config.reset = true;
      }
    }

    // Update the visible state the layers
    this.#updateVisibleLayers();
  }

  /* -------------------------------------------- */

  /**
   * Configure which shaders are used for each rendered layer.
   * @returns {Record<string, typeof AdaptiveLightingShader>}
   *   An object whose keys are layer identifiers and whose values are shader classes.
   * @protected
   */
  _configureShaders() {
    const a = this.animation;
    const shaders = {};
    for ( const layer in this.layers ) {
      shaders[layer] = a[`${layer.toLowerCase()}Shader`] || this.layers[layer].defaultShader;
    }
    return shaders;
  }

  /* -------------------------------------------- */

  /**
   * Specific configuration for a layer.
   * @param {object} layer
   * @param {string} layerId
   * @protected
   */
  _configureLayer(layer, layerId) {}

  /* -------------------------------------------- */

  /**
   * Initialize the shaders used for this source, swapping to a different shader if the animation has changed.
   */
  #initializeShaders() {
    const shaders = this._configureShaders();
    for ( const [layerId, layer] of Object.entries(this.layers) ) {
      layer.shader = RenderedEffectSource.#createShader(shaders[layerId], layer.mesh);
      this._configureLayer(layer, layerId);
    }
    this.#updateUniforms();
    Hooks.callAll(`initialize${this.constructor.name}Shaders`, this);
  }

  /* -------------------------------------------- */

  /**
   * Create a new shader using a provider shader class
   * @param {typeof AdaptiveLightingShader} cls   The shader class to create
   * @param {PointSourceMesh} container           The container which requires a new shader
   * @returns {AdaptiveLightingShader}            The shader instance used
   */
  static #createShader(cls, container) {
    const current = container.shader;
    if ( current?.constructor === cls ) return current;
    const shader = cls.create({
      primaryTexture: canvas.primary.renderTexture
    });
    shader.container = container;
    container.shader = shader;
    container.uniforms = shader.uniforms;
    if ( current ) current.destroy();
    return shader;
  }

  /* -------------------------------------------- */

  /**
   * Initialize the geometry and the meshes.
   */
  #initializeMeshes() {
    this._updateGeometry();
    if ( !this._flags.initializedMeshes ) this.#createMeshes();
  }

  /* -------------------------------------------- */

  /**
   * Create meshes for each layer of the RenderedEffectSource that is drawn to the canvas.
   */
  #createMeshes() {
    if ( !this._geometry ) return;
    const shaders = this._configureShaders();
    for ( const [l, layer] of Object.entries(this.layers) ) {
      layer.mesh = this.#createMesh(shaders[l]);
      layer.mesh.blendMode = PIXI.BLEND_MODES[layer.blendMode];
      layer.shader = layer.mesh.shader;
    }
    this._flags.initializedMeshes = true;
  }

  /* -------------------------------------------- */

  /**
   * Create a new Mesh for this source using a provided shader class
   * @param {typeof AdaptiveLightingShader} shaderCls   The shader class used for this mesh
   * @returns {PointSourceMesh}                         The created Mesh
   */
  #createMesh(shaderCls) {
    const state = new PIXI.State();
    const mesh = new PointSourceMesh(this._geometry, shaderCls.create(), state);
    mesh.drawMode = PIXI.DRAW_MODES.TRIANGLES;
    mesh.uniforms = mesh.shader.uniforms;
    mesh.cullable = true;
    return mesh;
  }

  /* -------------------------------------------- */

  /**
   * Create the geometry for the source shape that is used in shaders and compute its bounds for culling purpose.
   * Triangulate the form and create buffers.
   * @protected
   * @abstract
   */
  _updateGeometry() {}

  /* -------------------------------------------- */
  /*  Rendered Source Canvas Rendering            */
  /* -------------------------------------------- */

  /**
   * Render the containers used to represent this light source within the LightingLayer
   * @returns {Record<string, PIXI.Mesh|null>}
   */
  drawMeshes() {
    const meshes = {};
    for ( const layerId of Object.keys(this.layers) ) {
      meshes[layerId] = this._drawMesh(layerId);
    }
    return meshes;
  }

  /* -------------------------------------------- */

  /**
   * Create a Mesh for a certain rendered layer of this source.
   * @param {string} layerId            The layer key in layers to draw
   * @returns {PIXI.Mesh|null}          The drawn mesh for this layer, or null if no mesh is required
   * @protected
   */
  _drawMesh(layerId) {
    const layer = this.layers[layerId];
    const mesh = layer.mesh;

    if ( layer.reset ) {
      const fn = this[`_update${layerId.titleCase()}Uniforms`];
      fn.call(this);
    }
    if ( !layer.active ) {
      mesh.visible = false;
      return null;
    }

    // Update the mesh
    const {x, y} = this.data;
    mesh.position.set(x, y);
    mesh.visible = mesh.renderable = true;
    return layer.mesh;
  }

  /* -------------------------------------------- */
  /*  Rendered Source Refresh                     */
  /* -------------------------------------------- */

  /** @override */
  _refresh() {
    this.#updateUniforms();
    this.#updateVisibleLayers();
  }

  /* -------------------------------------------- */

  /**
   * Update uniforms for all rendered layers.
   */
  #updateUniforms() {
    for ( const updateUniformsFunction of this.#updateUniformsFunctions ) updateUniformsFunction.call(this);
  }

  /* -------------------------------------------- */

  /**
   * Update the visible state of the component channels of this RenderedEffectSource.
   */
  #updateVisibleLayers() {
    const active = this.active;
    let hasActiveLayer = false;
    for ( const layer of Object.values(this.layers) ) {
      layer.active = active && (layer.shader?.isRequired !== false);
      if ( layer.active ) hasActiveLayer = true;
    }
    this.#hasActiveLayer = hasActiveLayer;
  }

  /* -------------------------------------------- */

  /**
   * Update shader uniforms used by every rendered layer.
   * @param {AbstractBaseShader} shader
   * @protected
   */
  _updateCommonUniforms(shader) {}

  /* -------------------------------------------- */

  /**
   * Update shader uniforms used for the background layer.
   * @protected
   */
  _updateBackgroundUniforms() {
    const shader = this.layers.background.shader;
    if ( !shader ) return;
    this._updateCommonUniforms(shader);
  }

  /* -------------------------------------------- */

  /**
   * Update shader uniforms used for the coloration layer.
   * @protected
   */
  _updateColorationUniforms() {
    const shader = this.layers.coloration.shader;
    if ( !shader ) return;
    this._updateCommonUniforms(shader);
  }

  /* -------------------------------------------- */

  /**
   * Update shader uniforms used for the illumination layer.
   * @protected
   */
  _updateIlluminationUniforms() {
    const shader = this.layers.illumination.shader;
    if ( !shader ) return;
    this._updateCommonUniforms(shader);
  }

  /* -------------------------------------------- */
  /*  Rendered Source Destruction                 */
  /* -------------------------------------------- */

  /** @override */
  _destroy() {
    for ( const layer of Object.values(this.layers) ) layer.mesh?.destroy();
    this._geometry?.destroy();
  }

  /* -------------------------------------------- */
  /*  Animation Functions                         */
  /* -------------------------------------------- */

  /**
   * Animate the PointSource, if an animation is enabled and if it currently has rendered containers.
   * @param {number} dt         Delta time.
   */
  animate(dt) {
    if ( !this.isAnimated ) return;
    const {animation, ...options} = this.animation;
    return animation?.call(this, dt, options);
  }

  /* -------------------------------------------- */

  /**
   * Generic time-based animation used for Rendered Point Sources.
   * @param {number} dt           Delta time.
   * @param {object} [options]    Options which affect the time animation
   * @param {number} [options.speed=5]            The animation speed, from 0 to 10
   * @param {number} [options.intensity=5]        The animation intensity, from 1 to 10
   * @param {boolean} [options.reverse=false]     Reverse the animation direction
   */
  animateTime(dt, {speed=5, intensity=5, reverse=false}={}) {

    // Determine the animation timing
    let t = canvas.app.ticker.lastTime;
    if ( reverse ) t *= -1;
    this.animation.time = ( (speed * t) / 5000 ) + this.animation.seed;

    // Update uniforms
    for ( const layer of Object.values(this.layers) ) {
      const u = layer.mesh.uniforms;
      u.time = this.animation.time;
      u.intensity = intensity;
    }
  }
  /* -------------------------------------------- */
  /*  Static Helper Methods                       */
  /* -------------------------------------------- */

  /**
   * Get corrected level according to level and active vision mode data.
   * @param {LightingLevel} level  The lighting level (one of {@link CONST.LIGHTING_LEVELS})
   * @returns {number} The corrected level.
   */
  static getCorrectedLevel(level) {
    // Retrieving the lighting mode and the corrected level, if any
    const lightingOptions = canvas.visibility.visionModeData?.activeLightingOptions;
    return (lightingOptions?.levels?.[level]) ?? level;
  }

  /* -------------------------------------------- */

  /**
   * Get corrected color according to level, dim color, bright color and background color.
   * @param {LightingLevel} level The lighting level (one of {@link CONST.LIGHTING_LEVELS})
   * @param {Color} colorDim
   * @param {Color} colorBright
   * @param {Color} [colorBackground]
   * @returns {Color}
   */
  static getCorrectedColor(level, colorDim, colorBright, colorBackground) {
    colorBackground ??= canvas.colors.background;

    // Returning the corrected color according to the lighting options
    const levels = LIGHTING_LEVELS;
    switch ( this.getCorrectedLevel(level) ) {
      case levels.HALFDARK:
      case levels.DIM: return colorDim;
      case levels.BRIGHT:
      case levels.DARKNESS: return colorBright;
      case levels.BRIGHTEST: return canvas.colors.ambientBrightest;
      case levels.UNLIT: return colorBackground;
      default: return colorDim;
    }
  }
}

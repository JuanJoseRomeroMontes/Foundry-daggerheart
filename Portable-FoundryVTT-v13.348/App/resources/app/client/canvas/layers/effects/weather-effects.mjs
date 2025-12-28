import FullCanvasObjectMixin from "../../containers/advanced/full-canvas-mixin.mjs";
import CanvasLayer from "../base/canvas-layer.mjs";
import PrimaryCanvasGroup from "../../groups/primary.mjs";
import VoidFilter from "../../rendering/filters/void.mjs";
import WeatherOcclusionMaskFilter from "../../rendering/filters/weather-occlusion-mask.mjs";
import Hooks from "@client/helpers/hooks.mjs";

/**
 * A CanvasLayer for displaying visual effects like weather, transitions, flashes, or more.
 */
export default class WeatherEffects extends FullCanvasObjectMixin(CanvasLayer) {
  constructor() {
    super();
    this.#initializeFilters();
    this.mask = canvas.masks.scene;
    this.sortableChildren = true;
    this.eventMode = "none";
  }

  /**
   * The container in which effects are added.
   * @type {PIXI.Container}
   */
  weatherEffects;

  /* -------------------------------------------- */

  /**
   * The container in which suppression meshed are added.
   * @type {PIXI.Container}
   */
  suppression;

  /* -------------------------------------------- */

  /** @override */
  get hookName() {
    return WeatherEffects.name;
  }

  /* -------------------------------------------- */

  /**
   * Initialize the inverse occlusion and the void filters.
   */
  #initializeFilters() {
    this.#suppressionFilter = VoidFilter.create();
    this.occlusionFilter = WeatherOcclusionMaskFilter.create({
      occlusionTexture: canvas.masks.depth.renderTexture
    });
    this.#suppressionFilter.enabled = this.occlusionFilter.enabled = false;
    // FIXME: this does not produce correct results for weather effects that are configured
    // with the occlusion filter disabled and use a different blend mode than SCREEN
    this.#suppressionFilter.blendMode = PIXI.BLEND_MODES.SCREEN;
    this.occlusionFilter.elevation = this.#elevation;
    this.filterArea = canvas.app.renderer.screen;
    this.filters = [this.occlusionFilter, this.#suppressionFilter];
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  static get layerOptions() {
    return foundry.utils.mergeObject(super.layerOptions, {name: "effects"});
  }

  /* -------------------------------------------- */

  /**
   * Array of weather effects linked to this weather container.
   * @type {Map<string,(ParticleEffect|WeatherShaderEffect)[]>}
   */
  effects = new Map();

  /**
   * @typedef WeatherTerrainMaskConfiguration
   * @property {boolean} enabled                          Enable or disable this mask.
   * @property {number[]} channelWeights                  An RGBA array of channel weights applied to the mask texture.
   * @property {boolean} [reverse=false]                  If the mask should be reversed.
   * @property {PIXI.Texture|PIXI.RenderTexture} texture  A texture which defines the mask region.
   */

  /**
   * A default configuration of the terrain mask that is automatically applied to any shader-based weather effects.
   * This configuration is automatically passed to WeatherShaderEffect#configureTerrainMask upon construction.
   * @type {WeatherTerrainMaskConfiguration}
   */
  terrainMaskConfig;

  /**
   * @typedef WeatherOcclusionMaskConfiguration
   * @property {boolean} enabled                          Enable or disable this mask.
   * @property {number[]} channelWeights                  An RGBA array of channel weights applied to the mask texture.
   * @property {boolean} [reverse=false]                  If the mask should be reversed.
   * @property {PIXI.Texture|PIXI.RenderTexture} texture  A texture which defines the mask region.
   */

  /**
   * A default configuration of the terrain mask that is automatically applied to any shader-based weather effects.
   * This configuration is automatically passed to WeatherShaderEffect#configureTerrainMask upon construction.
   * @type {WeatherOcclusionMaskConfiguration}
   */
  occlusionMaskConfig;

  /**
   * The inverse occlusion mask filter bound to this container.
   * @type {WeatherOcclusionMaskFilter}
   */
  occlusionFilter;

  /**
   * The filter that is needed for suppression if the occlusion filter isn't enabled.
   * @type {VoidFilter}
   */
  #suppressionFilter;

  /* -------------------------------------------- */

  /**
   * The elevation of this object.
   * @type {number}
   * @default Infinity
   */
  get elevation() {
    return this.#elevation;
  }

  set elevation(value) {
    if ( (typeof value !== "number") || Number.isNaN(value) ) {
      throw new Error("WeatherEffects#elevation must be a numeric value.");
    }
    if ( value === this.#elevation ) return;
    this.#elevation = value;
    if ( this.parent ) this.parent.sortDirty = true;
  }

  #elevation = Infinity;

  /* -------------------------------------------- */

  /**
   * A key which resolves ties amongst objects at the same elevation of different layers.
   * @type {number}
   * @default PrimaryCanvasGroup.SORT_LAYERS.WEATHER
   */
  get sortLayer() {
    return this.#sortLayer;
  }

  set sortLayer(value) {
    if ( (typeof value !== "number") || Number.isNaN(value) ) {
      throw new Error("WeatherEffects#sortLayer must be a numeric value.");
    }
    if ( value === this.#sortLayer ) return;
    this.#sortLayer = value;
    if ( this.parent ) this.parent.sortDirty = true;
  }

  #sortLayer = PrimaryCanvasGroup.SORT_LAYERS.WEATHER;

  /* -------------------------------------------- */

  /**
   * A key which resolves ties amongst objects at the same elevation within the same layer.
   * @type {number}
   * @default 0
   */
  get sort() {
    return this.#sort;
  }

  set sort(value) {
    if ( (typeof value !== "number") || Number.isNaN(value) ) {
      throw new Error("WeatherEffects#sort must be a numeric value.");
    }
    if ( value === this.#sort ) return;
    this.#sort = value;
    if ( this.parent ) this.parent.sortDirty = true;
  }

  #sort = 0;

  /* -------------------------------------------- */

  /**
   * A key which resolves ties amongst objects at the same elevation within the same layer and same sort.
   * @type {number}
   * @default 0
   */
  get zIndex() {
    return this._zIndex;
  }

  set zIndex(value) {
    if ( (typeof value !== "number") || Number.isNaN(value) ) {
      throw new Error("WeatherEffects#zIndex must be a numeric value.");
    }
    if ( value === this._zIndex ) return;
    this._zIndex = value;
    if ( this.parent ) this.parent.sortDirty = true;
  }

  /* -------------------------------------------- */
  /*  Weather Effect Rendering                    */
  /* -------------------------------------------- */

  /** @override */
  async _draw(options) {
    const effect = CONFIG.weatherEffects[canvas.scene.weather];
    this.weatherEffects = this.addChild(new PIXI.Container());
    this.suppression = this.addChild(new PIXI.Container());
    for ( const event of ["childAdded", "childRemoved"] ) {
      this.suppression.on(event, () => {
        this.#suppressionFilter.enabled = !this.occlusionFilter.enabled && !!this.suppression.children.length;
      });
    }
    this.initializeEffects(effect);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _tearDown(options) {
    this.clearEffects();
    return super._tearDown(options);
  }

  /* -------------------------------------------- */
  /*  Weather Effect Management                   */
  /* -------------------------------------------- */

  /**
   * Initialize the weather container from a weather config object.
   * @param {object} [weatherEffectsConfig]        Weather config object (or null/undefined to clear the container).
   */
  initializeEffects(weatherEffectsConfig) {
    this.#destroyEffects();
    Hooks.callAll("initializeWeatherEffects", this, weatherEffectsConfig);
    this.#constructEffects(weatherEffectsConfig);
  }

  /* -------------------------------------------- */

  /**
   * Clear the weather container.
   */
  clearEffects() {
    this.initializeEffects(null);
  }

  /* -------------------------------------------- */

  /**
   * Destroy all effects associated with this weather container.
   */
  #destroyEffects() {
    if ( this.effects.size === 0 ) return;
    for ( const effect of this.effects.values() ) effect.destroy();
    this.effects.clear();
  }

  /* -------------------------------------------- */

  /**
   * Construct effects according to the weather effects config object.
   * @param {object} [weatherEffectsConfig]        Weather config object (or null/undefined to clear the container).
   */
  #constructEffects(weatherEffectsConfig) {
    if ( !weatherEffectsConfig ) {
      this.#suppressionFilter.enabled = this.occlusionFilter.enabled = false;
      return;
    }
    const effects = weatherEffectsConfig.effects;
    let zIndex = 0;

    // Enable a layer-wide occlusion filter unless it is explicitly disabled by the effect configuration
    const useOcclusionFilter = weatherEffectsConfig.filter?.enabled !== false;
    if ( useOcclusionFilter ) {
      WeatherEffects.configureOcclusionMask(this.occlusionFilter, this.occlusionMaskConfig || {enabled: true});
      if ( this.terrainMaskConfig ) WeatherEffects.configureTerrainMask(this.occlusionFilter, this.terrainMaskConfig);
      this.occlusionFilter.blendMode = weatherEffectsConfig.filter?.blendMode ?? PIXI.BLEND_MODES.NORMAL;
      this.occlusionFilter.enabled = true;
      this.#suppressionFilter.enabled = false;
    }
    else {
      this.#suppressionFilter.enabled = !!this.suppression.children.length;
    }

    // Create each effect
    for ( const effect of effects ) {
      const requiredPerformanceLevel = Number.isNumeric(effect.performanceLevel) ? effect.performanceLevel : 0;
      if ( canvas.performance.mode < requiredPerformanceLevel ) {
        console.debug(`Skipping weather effect ${effect.id}. The client performance level ${canvas.performance.mode}`
          + ` is less than the required performance mode ${requiredPerformanceLevel} for the effect`);
        continue;
      }

      // Construct the effect container
      let ec;
      try {
        ec = new effect.effectClass(effect.config, effect.shaderClass);
      } catch(err) {
        err.message = `Failed to construct weather effect: ${err.message}`;
        console.error(err);
        continue;
      }

      // Configure effect container
      ec.zIndex = effect.zIndex ?? zIndex++;
      ec.blendMode = effect.blendMode ?? PIXI.BLEND_MODES.NORMAL;

      // Apply effect-level occlusion and terrain masking only if we are not using a layer-wide filter
      if ( effect.shaderClass && !useOcclusionFilter ) {
        WeatherEffects.configureOcclusionMask(ec.shader, this.occlusionMaskConfig || {enabled: true});
        if ( this.terrainMaskConfig ) WeatherEffects.configureTerrainMask(ec.shader, this.terrainMaskConfig);
      }

      // Add to the layer, register the effect, and begin play
      this.weatherEffects.addChild(ec);
      this.effects.set(effect.id, ec);
      ec.play();
    }
  }

  /* -------------------------------------------- */

  /**
   * Set the occlusion uniforms for this weather shader.
   * @param {PIXI.Shader} context                       The shader context
   * @param {WeatherOcclusionMaskConfiguration} config  Occlusion masking options
   * @protected
   */
  static configureOcclusionMask(context, {enabled=false, channelWeights=[0, 0, 1, 0], reverse=false, texture}={}) {
    if ( !(context instanceof PIXI.Shader) ) return;
    const uniforms = context.uniforms;
    if ( texture !== undefined ) uniforms.occlusionTexture = texture;
    else uniforms.occlusionTexture ??= canvas.masks.depth.renderTexture;
    uniforms.useOcclusion = enabled;
    uniforms.occlusionWeights = channelWeights;
    uniforms.reverseOcclusion = reverse;
    if ( enabled && !uniforms.occlusionTexture ) {
      console.warn(`The occlusion configuration for the weather shader ${context.constructor.name} is enabled but`
        + " does not have a valid texture");
      uniforms.useOcclusion = false;
    }
  }

  /* -------------------------------------------- */

  /**
   * Set the terrain uniforms for this weather shader.
   * @param {PIXI.Shader} context                     The shader context
   * @param {WeatherTerrainMaskConfiguration} config  Terrain masking options
   * @protected
   */
  static configureTerrainMask(context, {enabled=false, channelWeights=[1, 0, 0, 0], reverse=false, texture}={}) {
    if ( !(context instanceof PIXI.Shader) ) return;
    const uniforms = context.uniforms;
    if ( texture !== undefined ) {
      uniforms.terrainTexture = texture;
      const terrainMatrix = new PIXI.TextureMatrix(texture);
      terrainMatrix.update();
      uniforms.terrainUvMatrix.copyFrom(terrainMatrix.mapCoord);
    }
    uniforms.useTerrain = enabled;
    uniforms.terrainWeights = channelWeights;
    uniforms.reverseTerrain = reverse;
    if ( enabled && !uniforms.terrainTexture ) {
      console.warn(`The terrain configuration for the weather shader ${context.constructor.name} is enabled but`
        + " does not have a valid texture");
      uniforms.useTerrain = false;
    }
  }
}

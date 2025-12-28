import CanvasGroupMixin from "./canvas-group-mixin.mjs";
import Color from "@common/utils/color.mjs";
import Hooks from "../../helpers/hooks.mjs";

/**
 * @typedef CanvasEnvironmentConfig
 * @property {ColorSource} [backgroundColor]              The background canvas color
 * @property {ColorSource} [brightestColor]               The brightest ambient color
 * @property {ColorSource} [darknessColor]                The color of darkness
 * @property {ColorSource} [daylightColor]                The ambient daylight color
 * @property {ColorSource} [fogExploredColor]             The color applied to explored areas
 * @property {ColorSource} [fogUnexploredColor]           The color applied to unexplored areas
 * @property {SceneEnvironmentData} [environment]         The scene environment data
 */

/**
 * A container group which contains the primary canvas group and the effects canvas group.
 * @category Canvas
 */
export default class EnvironmentCanvasGroup extends CanvasGroupMixin(PIXI.Container) {
  constructor(...args) {
    super(...args);
    this.eventMode = "static";

    /**
     * The global light source attached to the environment
     * @type {GlobalLightSource}
     */
    Object.defineProperty(this, "globalLightSource", {
      value: new CONFIG.Canvas.globalLightSourceClass({object: this, sourceId: "globalLight"}),
      configurable: false,
      enumerable: true,
      writable: false
    });
  }

  /** @override */
  static groupName = "environment";

  /** @override */
  static tearDownChildren = false;

  /**
   * The scene darkness level.
   * @type {number}
   */
  #darknessLevel;

  /**
   * Colors exposed by the manager.
   * @enum {Color}
   */
  colors = {
    darkness: undefined,
    halfdark: undefined,
    background: undefined,
    dim: undefined,
    bright: undefined,
    ambientBrightest: undefined,
    ambientDaylight: undefined,
    ambientDarkness: undefined,
    sceneBackground: undefined,
    fogExplored: undefined,
    fogUnexplored: undefined
  };

  /**
   * Weights used by the manager to compute colors.
   * @enum {number}
   */
  weights = {
    dark: undefined,
    halfdark: undefined,
    dim: undefined,
    bright: undefined
  };

  /**
   * Fallback colors.
   * @enum {Color}
   */
  static #fallbackColors = {
    darknessColor: 0x242448,
    daylightColor: 0xEEEEEE,
    brightestColor: 0xFFFFFF,
    backgroundColor: 0x999999,
    fogUnexplored: 0x000000,
    fogExplored: 0x000000
  };

  /**
   * Contains a list of subscribed function for darkness handler.
   * @type {PIXI.EventBoundary}
   */
  #eventBoundary;

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * Get the darkness level of this scene.
   * @returns {number}
   */
  get darknessLevel() {
    return this.#darknessLevel;
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @override */
  async _draw(options) {
    await super._draw(options);
    this.#eventBoundary = new PIXI.EventBoundary(this);
    this.initialize();
  }

  /* -------------------------------------------- */
  /*  Ambience Methods                            */
  /* -------------------------------------------- */

  /**
   * @typedef {PIXI.FederatedEvent} CanvasEnvironmentDarknessChangeEvent
   * @param {"darknessChange"} type
   * @param {{darknessLevel: number, priorDarknessLevel: number}} environmentData
   */

  /**
   * @callback CanvasEnvironmentDarknessChange
   * @param {CanvasEnvironmentDarknessChangeEvent} event
   */

  /**
   * Initialize the scene environment options.
   * @param {CanvasEnvironmentConfig} config
   * @fires {hookEvents:initializeCanvasEnvironment}
   * @fires {CanvasEnvironmentDarknessChange}
   */
  initialize(config={}) {

    // Call environment initialization hooks
    Hooks.call("configureCanvasEnvironment", config);

    // Destructure configured parameters
    const {backgroundColor, brightestColor, darknessColor, daylightColor, fogExploredColor,
      fogUnexploredColor, darknessLevel, environment={}} = config;
    const scene = canvas.scene;

    // Update base ambient colors, and darkness level
    const fbc = EnvironmentCanvasGroup.#fallbackColors;
    this.colors.ambientDarkness = Color.from(darknessColor ?? CONFIG.Canvas.darknessColor ?? fbc.darknessColor);
    this.colors.ambientDaylight = Color.from(daylightColor
      ?? (scene.tokenVision ? (CONFIG.Canvas.daylightColor ?? fbc.daylightColor) : 0xFFFFFF));
    this.colors.ambientBrightest = Color.from(brightestColor ?? CONFIG.Canvas.brightestColor ?? fbc.brightestColor);

    /**
     * @deprecated since v12
     */
    if ( darknessLevel !== undefined ) {
      const msg = "config.darknessLevel parameter into EnvironmentCanvasGroup#initialize is deprecated."
        + " You should pass the darkness level into config.environment.darknessLevel";
      foundry.utils.logCompatibilityWarning(msg, {since: 12, until: 14, once: true});
      environment.darknessLevel = darknessLevel;
    }

    // Darkness Level Control
    const priorDarknessLevel = this.#darknessLevel ?? 0;
    const dl = environment.darknessLevel ?? scene.environment.darknessLevel;
    const darknessChanged = (dl !== this.#darknessLevel);
    this.#darknessLevel = scene.environment.darknessLevel = dl;

    // Update weights
    Object.assign(this.weights, CONFIG.Canvas.lightLevels ?? {
      dark: 0,
      halfdark: 0.5,
      dim: 0.25,
      bright: 1
    });

    // Compute colors
    this.#configureColors({fogExploredColor, fogUnexploredColor, backgroundColor});

    // Configure the scene environment
    this.#configureEnvironment(environment);

    // Update primary cached container and renderer clear color with scene background color
    canvas.app.renderer.background.color = this.colors.rendererBackground;
    canvas.primary._backgroundColor = this.colors.sceneBackground.rgb;

    // Dispatching the darkness change event
    if ( darknessChanged ) {
      const event = new PIXI.FederatedEvent(this.#eventBoundary);
      event.type = "darknessChange";
      event.environmentData = {
        darknessLevel: this.#darknessLevel,
        priorDarknessLevel
      };
      this.dispatchEvent(event);
    }

    // Push a perception update to refresh lighting and sources with the new computed color values
    canvas.perception.update({
      refreshPrimary: true,
      refreshLighting: true,
      refreshVision: true
    });

    // Call environment initialization hooks
    Hooks.callAll("initializeCanvasEnvironment");
  }

  /* -------------------------------------------- */

  /**
   * Configure all colors pertaining to a scene.
   * @param {object} [options={}]                      Preview options.
   * @param {ColorSource} [options.fogExploredColor]   A preview fog explored color.
   * @param {ColorSource} [options.fogUnexploredColor] A preview fog unexplored color.
   * @param {ColorSource} [options.backgroundColor]    The background canvas color.
   */
  #configureColors({fogExploredColor, fogUnexploredColor, backgroundColor}={}) {
    const scene = canvas.scene;
    const fbc = EnvironmentCanvasGroup.#fallbackColors;

    // Compute the middle ambient color
    this.colors.background = this.colors.ambientDarkness.mix(this.colors.ambientDaylight, 1.0 - this.darknessLevel);

    // Compute dark ambient colors
    this.colors.darkness = this.colors.ambientDarkness.mix(this.colors.background, this.weights.dark);
    this.colors.halfdark = this.colors.darkness.mix(this.colors.background, this.weights.halfdark);

    // Compute light ambient colors
    this.colors.bright =
      this.colors.background.mix(this.colors.ambientBrightest, this.weights.bright);
    this.colors.dim = this.colors.background.mix(this.colors.bright, this.weights.dim);

    // Compute fog colors
    const cfg = CONFIG.Canvas;
    const sfc = scene.fog.colors;
    const uc = Color.from(fogUnexploredColor ?? sfc.unexplored ?? cfg.unexploredColor ?? fbc.fogUnexplored);
    this.colors.fogUnexplored = this.colors.background.multiply(uc);
    const ec = Color.from(fogExploredColor ?? sfc.explored ?? cfg.exploredColor ?? fbc.fogExplored);
    this.colors.fogExplored = this.colors.background.multiply(ec);

    // Compute scene background color
    const sceneBG = Color.from(backgroundColor ?? scene?.backgroundColor ?? fbc.backgroundColor);
    this.colors.sceneBackground = sceneBG;
    this.colors.rendererBackground = sceneBG.multiply(this.colors.background);
  }

  /* -------------------------------------------- */

  /**
   * Configure the ambience filter for scene ambient lighting.
   * @param {SceneEnvironmentData} [environment] The scene environment data object.
   */
  #configureEnvironment(environment={}) {
    const currentEnvironment = canvas.scene.toObject().environment;

    /**
     * @type {SceneEnvironmentData}
     */
    const data = foundry.utils.mergeObject(environment, currentEnvironment, {
      inplace: false,
      insertKeys: true,
      insertValues: true,
      overwrite: false
    });

    // First configure the ambience filter
    this.#configureAmbienceFilter(data);

    // Then configure the global light
    this.#configureGlobalLight(data);
  }

  /* -------------------------------------------- */

  /**
   * Configure the ambience filter.
   * @param {SceneEnvironmentData} environment
   * @param {boolean} environment.cycle                  The cycle option.
   * @param {EnvironmentData} environment.base           The base environement data.
   * @param {EnvironmentData} environment.dark           The dark environment data.
   */
  #configureAmbienceFilter({cycle, base, dark}) {
    const ambienceFilter = canvas.primary._ambienceFilter;
    if ( !ambienceFilter ) return;
    const u = ambienceFilter.uniforms;

    // Assigning base ambience parameters
    const bh = Color.fromHSL([base.hue, 1, 0.5]).linear;
    Color.applyRGB(bh, u.baseTint);
    u.baseLuminosity = base.luminosity;
    u.baseShadows = base.shadows;
    u.baseIntensity = base.intensity;
    u.baseSaturation = base.saturation;
    const baseAmbienceHasEffect = (base.luminosity !== 0) || (base.shadows > 0)
      || (base.intensity > 0) || (base.saturation !== 0);

    // Assigning dark ambience parameters
    const dh = Color.fromHSL([dark.hue, 1, 0.5]).linear;
    Color.applyRGB(dh, u.darkTint);
    u.darkLuminosity = dark.luminosity;
    u.darkShadows = dark.shadows;
    u.darkIntensity = dark.intensity;
    u.darkSaturation = dark.saturation;
    const darkAmbienceHasEffect = ((dark.luminosity !== 0) || (dark.shadows > 0)
      || (dark.intensity > 0) || (dark.saturation !== 0)) && cycle;

    // Assigning the cycle option
    u.cycle = cycle;

    // Darkness level texture
    u.darknessLevelTexture = canvas.effects.illumination.renderTexture;

    // Enable ambience filter if it is impacting visuals
    ambienceFilter.enabled = baseAmbienceHasEffect || darkAmbienceHasEffect;
  }

  /* -------------------------------------------- */

  /**
   * Configure the global light.
   * @param {SceneEnvironmentData} environment
   * @param {GlobalLightData} environment.globalLight
   */
  #configureGlobalLight({globalLight}) {
    const maxR = canvas.dimensions.maxR * 1.2;
    const globalLightData = foundry.utils.mergeObject({
      z: -Infinity,
      elevation: Infinity,
      dim: globalLight.bright ? 0 : maxR,
      bright: globalLight.bright ? maxR : 0,
      disabled: !globalLight.enabled
    }, globalLight, {overwrite: false});
    this.globalLightSource.initialize(globalLightData);
    this.globalLightSource.add();
  }

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  get darknessPenalty() {
    const msg = "EnvironmentCanvasGroup#darknessPenalty is deprecated without replacement. "
      + "The darkness penalty is no longer applied on light and vision sources.";
    foundry.utils.logCompatibilityWarning(msg, {since: 12, until: 14});
    return 0;
  }
}

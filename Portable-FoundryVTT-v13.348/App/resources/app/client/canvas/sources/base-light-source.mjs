import RenderedEffectSource from "./rendered-effect-source.mjs";
import {LIGHTING_LEVELS} from "../../../common/constants.mjs";
import AdaptiveBackgroundShader from "../rendering/shaders/lighting/background-lighting.mjs";
import AdaptiveColorationShader from "../rendering/shaders/lighting/coloration-lighting.mjs";
import AdaptiveIlluminationShader from "../rendering/shaders/lighting/illumination-lighting.mjs";
import SmoothNoise from "../animation/smooth-noise.mjs";

/**
 * @import {BaseEffectSourceData} from "./base-effect-source.mjs";
 * @import {RenderedEffectSourceData} from "./rendered-effect-source.mjs";
 */

/**
 * @typedef LightSourceData
 * @property {number} alpha               An opacity for the emitted light, if any
 * @property {number} bright              The allowed radius of bright vision or illumination
 * @property {number} coloration          The coloration technique applied in the shader
 * @property {number} contrast            The amount of contrast this light applies to the background texture
 * @property {number} dim                 The allowed radius of dim vision or illumination
 * @property {number} attenuation         Strength of the attenuation between bright, dim, and dark
 * @property {number} luminosity          The luminosity applied in the shader
 * @property {number} saturation          The amount of color saturation this light applies to the background texture
 * @property {number} shadows             The depth of shadows this light applies to the background texture
 * @property {boolean} vision             Whether or not this source provides a source of vision
 */

/**
 * A specialized subclass of BaseEffectSource which deals with the rendering of light or darkness.
 * @extends {RenderedEffectSource<BaseEffectSourceData & RenderedEffectSourceData & LightSourceData>}
 * @abstract
 */
export default class BaseLightSource extends RenderedEffectSource {

  /** @override */
  static sourceType = "light";

  /** @override */
  static _initializeShaderKeys = ["animation.type", "walls"];

  /** @override */
  static _refreshUniformsKeys = ["dim", "bright", "attenuation", "alpha", "coloration", "color", "contrast",
    "saturation", "shadows", "luminosity"];

  /**
   * The corresponding lighting levels for dim light.
   * @type {number}
   * @protected
   */
  static _dimLightingLevel = LIGHTING_LEVELS.DIM;

  /**
   * The corresponding lighting levels for bright light.
   * @type {string}
   * @protected
   */
  static _brightLightingLevel = LIGHTING_LEVELS.BRIGHT;

  /**
   * The corresponding animation config.
   * @type {LightSourceAnimationConfig}
   * @protected
   */
  static get ANIMATIONS() {
    return CONFIG.Canvas.lightAnimations;
  }

  /** @override */
  static get _layers() {
    return {
      background: {
        defaultShader: AdaptiveBackgroundShader,
        blendMode: "MAX_COLOR"
      },
      coloration: {
        defaultShader: AdaptiveColorationShader,
        blendMode: "SCREEN"
      },
      illumination: {
        defaultShader: AdaptiveIlluminationShader,
        blendMode: "MAX_COLOR"
      }
    };
  }

  /** @inheritDoc */
  static defaultData = {
    ...super.defaultData,
    alpha: 0.5,
    bright: 0,
    coloration: 1,
    contrast: 0,
    dim: 0,
    attenuation: 0.5,
    luminosity: 0.5,
    saturation: 0,
    shadows: 0,
    vision: false
  }

  /* -------------------------------------------- */
  /*  Internal Animation Properties               */
  /* -------------------------------------------- */

  /**
   * Internal animation data, which could track various specific animation data.
   * @type {object}
   */
  #animationData = {};

  /* -------------------------------------------- */
  /*  Light Source Attributes                     */
  /* -------------------------------------------- */

  /**
   * A ratio of dim:bright as part of the source radius
   * @type {number}
   */
  ratio = 1;

  /* -------------------------------------------- */
  /*  Light Source Initialization                 */
  /* -------------------------------------------- */

  /** @override */
  _initialize(data) {
    super._initialize(data);
    const animationConfig = foundry.utils.deepClone(this.constructor.ANIMATIONS[this.data.animation.type] || {});
    this.animation = Object.assign(this.data.animation, animationConfig);
  }

  /* -------------------------------------------- */
  /*  Shader Management                           */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _updateColorationUniforms() {
    super._updateColorationUniforms();
    const u = this.layers.coloration.shader?.uniforms;
    if ( !u ) return;

    // Adapting color intensity to the coloration technique
    switch ( this.data.coloration ) {
      case 0: // Legacy
              // Default 0.25 -> Legacy technique needs quite low intensity default to avoid washing background
        u.colorationAlpha = Math.pow(this.data.alpha, 2);
        break;
      case 4: // Color burn
      case 5: // Internal burn
      case 6: // External burn
      case 9: // Invert absorption
              // Default 0.5 -> These techniques are better at low color intensity
        u.colorationAlpha = this.data.alpha;
        break;
      default:
        // Default 1 -> The remaining techniques use adaptive lighting,
        // which produces interesting results in the [0, 2] range.
        u.colorationAlpha = this.data.alpha * 2;
    }

    u.useSampler = this.data.coloration > 0;  // Not needed for legacy coloration (technique id 0)

    // Flag uniforms as updated
    this.layers.coloration.reset = false;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _updateIlluminationUniforms() {
    super._updateIlluminationUniforms();
    const u = this.layers.illumination.shader?.uniforms;
    if ( !u ) return;
    u.useSampler = false;

    // Flag uniforms as updated
    const i = this.layers.illumination;
    i.reset = i.suppressed = false;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _updateBackgroundUniforms() {
    super._updateBackgroundUniforms();
    const u = this.layers.background.shader?.uniforms;
    if ( !u ) return;

    canvas.colors.background.applyRGB(u.colorBackground);
    u.backgroundAlpha = this.data.alpha;
    u.useSampler = true;

    // Flag uniforms as updated
    this.layers.background.reset = false;
  }

  /* -------------------------------------------- */

  /** @override */
  _updateCommonUniforms(shader) {
    const u = shader.uniforms;
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
    u.dimLevelCorrection = this.constructor.getCorrectedLevel(this.constructor._dimLightingLevel);
    u.brightLevelCorrection = this.constructor.getCorrectedLevel(this.constructor._brightLightingLevel);

    // Passing advanced color correction values
    u.luminosity = this.data.luminosity;
    u.exposure = this.data.luminosity * 2.0 - 1.0;
    u.contrast = (this.data.contrast < 0 ? this.data.contrast * 0.5 : this.data.contrast);
    u.saturation = this.data.saturation;
    u.shadows = this.data.shadows;
    u.hasColor = this._flags.hasColor;
    u.ratio = this.ratio;
    u.technique = this.data.coloration;
    // Graph: https://www.desmos.com/calculator/e7z0i7hrck
    // mapping [0,1] attenuation user value to [0,1] attenuation shader value
    if ( this.cachedAttenuation !== this.data.attenuation ) {
      this.computedAttenuation = (Math.cos(Math.PI * Math.pow(this.data.attenuation, 1.5)) - 1) / -2;
      this.cachedAttenuation = this.data.attenuation;
    }
    u.attenuation = this.computedAttenuation;
    u.elevation = this.data.elevation;
    u.color = this.colorRGB ?? shader.constructor.defaultUniforms.color;

    // Passing screenDimensions to use screen size render textures
    u.screenDimensions = canvas.screenDimensions;
    if ( !u.depthTexture ) u.depthTexture = canvas.masks.depth.renderTexture;
    if ( !u.primaryTexture ) u.primaryTexture = canvas.primary.renderTexture;
    if ( !u.darknessLevelTexture ) u.darknessLevelTexture = canvas.effects.illumination.renderTexture;
  }

  /* -------------------------------------------- */
  /*  Animation Functions                         */
  /* -------------------------------------------- */

  /**
   * An animation with flickering ratio and light intensity.
   * @param {number} dt                       Delta time
   * @param {object} [options={}]             Additional options which modify the flame animation
   * @param {number} [options.speed=5]        The animation speed, from 0 to 10
   * @param {number} [options.intensity=5]    The animation intensity, from 1 to 10
   * @param {boolean} [options.reverse=false] Reverse the animation direction
   */
  animateTorch(dt, {speed=5, intensity=5, reverse=false} = {}) {
    this.animateFlickering(dt, {speed, intensity, reverse, amplification: intensity / 5});
  }

  /* -------------------------------------------- */

  /**
   * An animation with flickering ratio and light intensity
   * @param {number} dt                                 Delta time
   * @param {object} [options={}]                       Additional options which modify the flame animation
   * @param {number} [options.speed=5]                  The animation speed, from 0 to 10
   * @param {number} [options.intensity=5]              The animation intensity, from 1 to 10
   * @param {number} [options.amplification=1]          Noise amplification (>1) or dampening (<1)
   * @param {boolean} [options.reverse=false]           Reverse the animation direction
   */
  animateFlickering(dt, {speed=5, intensity=5, reverse=false, amplification=1} = {}) {
    this.animateTime(dt, {speed, intensity, reverse});

    // Create the noise object for the first frame
    const amplitude = amplification * 0.45;
    /** @type {SmoothNoise} */
    const noise = this.#animationData.noise ??= new SmoothNoise({amplitude: amplitude, scale: 3, maxReferences: 2048});

    // Update amplitude
    if ( noise.amplitude !== amplitude ) noise.amplitude = amplitude;

    // Create noise from animation time. Range [0.0, 0.45]
    let n = noise.generate(this.animation.time);

    // Update brightnessPulse and ratio with some noise in it
    const co = this.layers.coloration.shader;
    const il = this.layers.illumination.shader;
    co.uniforms.brightnessPulse = il.uniforms.brightnessPulse = 0.55 + n;    // Range [0.55, 1.0 <* amplification>]
    co.uniforms.ratio = il.uniforms.ratio = (this.ratio * 0.9) + (n * 0.222);// Range [ratio * 0.9, ratio * ~1.0 <* amplification>]
  }

  /* -------------------------------------------- */

  /**
   * A basic "pulse" animation which expands and contracts.
   * @param {number} dt                           Delta time
   * @param {object} [options={}]                 Additional options which modify the pulse animation
   * @param {number} [options.speed=5]              The animation speed, from 0 to 10
   * @param {number} [options.intensity=5]          The animation intensity, from 1 to 10
   * @param {boolean} [options.reverse=false]       Reverse the animation direction
   */
  animatePulse(dt, {speed=5, intensity=5, reverse=false}={}) {

    // Determine the animation timing
    let t = canvas.app.ticker.lastTime;
    if ( reverse ) t *= -1;
    this.animation.time = ((speed * t)/5000) + this.animation.seed;

    // Define parameters
    const i = (10 - intensity) * 0.1;
    const w = 0.5 * (Math.cos(this.animation.time * 2.5) + 1);
    const wave = (a, b, w) => ((a - b) * w) + b;

    // Pulse coloration
    const co = this.layers.coloration.shader;
    co.uniforms.intensity = intensity;
    co.uniforms.time = this.animation.time;
    co.uniforms.pulse = wave(1.2, i, w);

    // Pulse illumination
    const il = this.layers.illumination.shader;
    il.uniforms.intensity = intensity;
    il.uniforms.time = this.animation.time;
    il.uniforms.ratio = wave(this.ratio, this.ratio * i, w);
  }

  /* -------------------------------------------- */

  /**
   * A sound-reactive animation that uses bass/mid/treble blending to control certain shader uniforms.
   * "speed" is interpreted as how quickly we adapt to changes in audio. No time-based pulsing is used by default,
   * but we incorporate dt into smoothing so that behavior is consistent across varying frame rates.
   *
   * @param {number} dt                       The delta time since the last frame, in milliseconds.
   * @param {object} [options={}]             Additional options for customizing the audio reaction.
   * @param {number} [options.speed=5]        A smoothing factor in [0..10], effectively updates/second.
   * @param {number} [options.intensity=5]    A blend factor in [0..10] that transitions from bass (near 0) to treble (near 10)
   *                                          Mid frequencies dominate around intensity=5.
   * @param {boolean} [options.reverse=false] Whether to invert the final amplitude as 1 - amplitude.
   */
  animateSoundPulse(dt, {speed=5, intensity=5, reverse=false}={}) {
    this.#animationData.reactiveSoundAmplitude ??= 0;

    // Capture bass, mid, treble
    let bassVal = Math.pow(game.audio.getMaxBandLevel("bass", {ignoreVolume: true}), 1.5);
    let midVal  = Math.pow(game.audio.getMaxBandLevel("mid",  {ignoreVolume: true}), 1.5);
    let trebVal = Math.pow(game.audio.getMaxBandLevel("treble",{ignoreVolume: true}), 1.5);

    // Blend frequencies: 0 => bass, 5 => mid, 10 => treble (approximatly)
    const i = Math.clamp(intensity, 0, 10) / 10;
    const finalVal = (i <= 0.5)
      ? Math.mix(bassVal, midVal, i * 2)
      : Math.mix(midVal, trebVal, (i - 0.5) * 2);

    // Apply exponential smoothing with dt to ensure consistent animation speed across different frame rates
    const smoothing = 1 - Math.exp(-speed * dt * 0.085);

    // Smooth amplitude toward finalVal
    this.#animationData.reactiveSoundAmplitude += (finalVal - this.#animationData.reactiveSoundAmplitude) * smoothing;

    // Optionally invert amplitude
    let amplitude = reverse ? 1 - this.#animationData.reactiveSoundAmplitude : this.#animationData.reactiveSoundAmplitude;
    amplitude = amplitude * this.ratio;

    // Update your shader uniforms
    const co = this.layers.coloration.shader;
    co.uniforms.intensity = intensity;
    co.uniforms.pulse = amplitude;

    const il = this.layers.illumination.shader;
    il.uniforms.intensity = intensity;
    il.uniforms.ratio = Math.clamp(amplitude * 1.11, 0, 1);
  }

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  get isDarkness() {
    const msg = "BaseLightSource#isDarkness is now obsolete. Use DarknessSource instead.";
    foundry.utils.logCompatibilityWarning(msg, { since: 12, until: 14});
    return false;
  }
}

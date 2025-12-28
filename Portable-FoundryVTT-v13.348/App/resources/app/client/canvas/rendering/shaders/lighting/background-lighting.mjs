import AdaptiveLightingShader from "./base-lighting.mjs";
import {LightData} from "../../../../../common/data/data.mjs";
import VisionMode from "../../../perception/vision-mode.mjs";

/**
 * The default coloration shader used by standard rendering and animations.
 * A fragment shader which creates a solid light source.
 */
export default class AdaptiveBackgroundShader extends AdaptiveLightingShader {

  /**
   * Memory allocations for the Adaptive Background Shader
   * @type {string}
   */
  static SHADER_HEADER = `
  ${this.FRAGMENT_UNIFORMS}
  ${this.VERTEX_FRAGMENT_VARYINGS}
  ${this.FRAGMENT_FUNCTIONS}
  ${this.CONSTANTS}
  ${this.SWITCH_COLOR}
  `;

  /** @inheritdoc */
  static fragmentShader = `
  ${this.SHADER_HEADER}
  ${this.PERCEIVED_BRIGHTNESS}

  void main() {
    ${this.FRAGMENT_BEGIN}
    ${this.ADJUSTMENTS}
    ${this.BACKGROUND_TECHNIQUES}
    ${this.FALLOFF}
    ${this.FRAGMENT_END}
  }`;

  /** @override */
  static defaultUniforms = {
    technique: 1,
    contrast: 0,
    shadows: 0,
    saturation: 0,
    intensity: 5,
    attenuation: 0.5,
    exposure: 0,
    ratio: 0.5,
    color: [1, 1, 1],
    colorBackground: [1, 1, 1],
    screenDimensions: [1, 1],
    time: 0,
    useSampler: true,
    primaryTexture: null,
    depthTexture: null,
    darknessLevelTexture: null,
    depthElevation: 1,
    ambientBrightest: [1, 1, 1],
    ambientDarkness: [0, 0, 0],
    ambientDaylight: [1, 1, 1],
    weights: [0, 0, 0, 0],
    dimLevelCorrection: 1,
    brightLevelCorrection: 2,
    computeIllumination: false,
    globalLight: false,
    globalLightThresholds: [0, 0]
  };

  static {
    const initial = LightData.cleanData();
    this.defaultUniforms.technique = initial.coloration;
    this.defaultUniforms.contrast = initial.contrast;
    this.defaultUniforms.shadows = initial.shadows;
    this.defaultUniforms.saturation = initial.saturation;
    this.defaultUniforms.intensity = initial.animation.intensity;
    this.defaultUniforms.attenuation = initial.attenuation;
  }

  /**
   * Flag whether the background shader is currently required.
   * Check vision modes requirements first, then
   * if key uniforms are at their default values, we don't need to render the background container.
   * @type {boolean}
   */
  get isRequired() {
    const vs = canvas.visibility.lightingVisibility;

    // Checking if a vision mode is forcing the rendering
    if ( vs.background === VisionMode.LIGHTING_VISIBILITY.REQUIRED ) return true;

    // Checking if disabled
    if ( vs.background === VisionMode.LIGHTING_VISIBILITY.DISABLED ) return false;

    // Then checking keys
    const keys = ["contrast", "saturation", "shadows", "exposure", "technique"];
    return keys.some(k => this.uniforms[k] !== this.constructor.defaultUniforms[k]);
  }
}

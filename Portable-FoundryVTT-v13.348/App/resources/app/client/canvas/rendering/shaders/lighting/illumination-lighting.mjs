import AdaptiveLightingShader from "./base-lighting.mjs";
import {LightData} from "../../../../../common/data/data.mjs";
import VisionMode from "../../../perception/vision-mode.mjs";

/**
 * The default coloration shader used by standard rendering and animations.
 * A fragment shader which creates a solid light source.
 */
export default class AdaptiveIlluminationShader extends AdaptiveLightingShader {

  /** @override */
  static FRAGMENT_END = `
  gl_FragColor = vec4(mix(computedBackgroundColor, finalColor, depth), 1.0);
  `;

  /**
   * The adjustments made into fragment shaders
   * @type {string}
   */
  static get ADJUSTMENTS() {
    return `
      vec3 changedColor = finalColor;\n
      ${this.SATURATION}
      ${this.EXPOSURE}
      ${this.SHADOW}
      finalColor = changedColor;\n`;
  }

  /** @override */
  static EXPOSURE = `
    // Computing exposure with illumination
    if ( exposure > 0.0 ) {
      // Diminishing exposure for illumination by a factor 2 (to reduce the "inflating radius" visual problem)
      float quartExposure = exposure * 0.25;
      float attenuationStrength = attenuation * 0.25;
      float lowerEdge = 0.98 - attenuationStrength;
      float upperEdge = 1.02 + attenuationStrength;
      float finalExposure = quartExposure *
                            (1.0 - smoothstep(ratio * lowerEdge, clamp(ratio * upperEdge, 0.0001, 1.0), dist)) +
                            quartExposure;
      changedColor *= (1.0 + finalExposure);
    }
    else if ( exposure != 0.0 ) changedColor *= (1.0 + exposure);
  `;

  /**
   * Memory allocations for the Adaptive Illumination Shader
   * @type {string}
   */
  static SHADER_HEADER = `
  ${this.FRAGMENT_UNIFORMS}
  ${this.VERTEX_FRAGMENT_VARYINGS}
  ${this.FRAGMENT_FUNCTIONS}
  ${this.CONSTANTS}
  ${this.SWITCH_COLOR}
  `;

  /** @override */
  static fragmentShader = `
  ${this.SHADER_HEADER}
  ${this.PERCEIVED_BRIGHTNESS}

  void main() {
    ${this.FRAGMENT_BEGIN}
    ${this.TRANSITION}
    ${this.ADJUSTMENTS}
    ${this.FALLOFF}
    ${this.FRAGMENT_END}
  }`;

  /** @inheritDoc */
  static defaultUniforms = {
    technique: 1,
    shadows: 0,
    saturation: 0,
    intensity: 5,
    attenuation: 0.5,
    contrast: 0,
    exposure: 0,
    ratio: 0.5,
    darknessLevel: 0,
    color: [1, 1, 1],
    colorBackground: [1, 1, 1],
    colorDim: [1, 1, 1],
    colorBright: [1, 1, 1],
    screenDimensions: [1, 1],
    time: 0,
    useSampler: false,
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
   * Flag whether the illumination shader is currently required.
   * @type {boolean}
   */
  get isRequired() {
    const vs = canvas.visibility.lightingVisibility;

    // Checking if disabled
    if ( vs.illumination === VisionMode.LIGHTING_VISIBILITY.DISABLED ) return false;

    // For the moment, we return everytimes true if we are here
    return true;
  }
}

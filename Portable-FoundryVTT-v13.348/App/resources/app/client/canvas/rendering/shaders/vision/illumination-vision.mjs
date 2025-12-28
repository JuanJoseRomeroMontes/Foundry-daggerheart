import AdaptiveVisionShader from "./base-vision.mjs";
import {LightData} from "../../../../../common/data/data.mjs";

/**
 * The default illumination shader used for vision sources
 */
export default class IlluminationVisionShader extends AdaptiveVisionShader {

  /** @override */
  static FRAGMENT_END = `
  gl_FragColor = vec4(mix(computedBackgroundColor, finalColor, depth), 1.0);
  `;

  /**
   * Transition between bright and dim colors, if requested
   * @type {string}
   */
  static VISION_COLOR = `
  finalColor = computedVisionColor;
  `;

  /**
   * The adjustments made into fragment shaders
   * @type {string}
   */
  static get ADJUSTMENTS() {
    return `
      vec3 changedColor = finalColor;\n
      ${this.SATURATION}
      finalColor = changedColor;\n`;
  }

  /**
   * Memory allocations for the Adaptive Illumination Shader
   * @type {string}
   */
  static SHADER_HEADER = `
  ${this.FRAGMENT_UNIFORMS}
  ${this.VERTEX_FRAGMENT_VARYINGS}
  ${this.FRAGMENT_FUNCTIONS}
  ${this.CONSTANTS}
  `;

  /** @inheritdoc */
  static fragmentShader = `
  ${this.SHADER_HEADER}
  ${this.PERCEIVED_BRIGHTNESS}

  void main() {
    ${this.FRAGMENT_BEGIN}
    ${this.VISION_COLOR}
    ${this.ILLUMINATION_TECHNIQUES}
    ${this.ADJUSTMENTS}
    ${this.FALLOFF}
    ${this.FRAGMENT_END}
  }`;

  /** @inheritdoc */
  static defaultUniforms = {
    technique: LightData.cleanData().initial,
    attenuation: 0,
    exposure: 0,
    saturation: 0,
    darknessLevel: 0,
    colorVision: [1, 1, 1],
    colorTint: [1, 1, 1],
    colorBackground: [1, 1, 1],
    screenDimensions: [1, 1],
    time: 0,
    useSampler: false,
    linkedToDarknessLevel: true,
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
    globalLight: false,
    globalLightThresholds: [0, 0]
  };
}

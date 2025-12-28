import AdaptiveVisionShader from "./base-vision.mjs";

/**
 * The default coloration shader used for vision sources.
 */
export default class ColorationVisionShader extends AdaptiveVisionShader {

  /** @override */
  static EXPOSURE = "";

  /** @override */
  static CONTRAST = "";

  /**
   * Memory allocations for the Adaptive Coloration Shader
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
    finalColor = colorEffect;
    ${this.COLORATION_TECHNIQUES}
    ${this.ADJUSTMENTS}
    ${this.FALLOFF}
    ${this.FRAGMENT_END}
  }`;

  /** @inheritdoc */
  static defaultUniforms = {
    technique: 0,
    saturation: 0,
    attenuation: 0,
    colorEffect: [0, 0, 0],
    colorBackground: [0, 0, 0],
    colorTint: [1, 1, 1],
    time: 0,
    screenDimensions: [1, 1],
    useSampler: true,
    primaryTexture: null,
    linkedToDarknessLevel: true,
    depthTexture: null,
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

  /**
   * Flag whether the coloration shader is currently required.
   * If key uniforms are at their default values, we don't need to render the coloration container.
   * @type {boolean}
   */
  get isRequired() {
    const keys = ["saturation", "colorEffect"];
    return keys.some(k => this.uniforms[k] !== this.constructor.defaultUniforms[k]);
  }
}

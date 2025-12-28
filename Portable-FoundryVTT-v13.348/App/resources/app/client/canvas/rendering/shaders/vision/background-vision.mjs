import AdaptiveVisionShader from "./base-vision.mjs";

/**
 * The default background shader used for vision sources
 */
export default class BackgroundVisionShader extends AdaptiveVisionShader {

  /** @inheritdoc */
  static FRAGMENT_END = `
  finalColor *= colorTint;
  if ( linkedToDarknessLevel ) finalColor = mix(baseColor.rgb, finalColor, computedDarknessLevel);
  ${super.FRAGMENT_END}
  `;

  /**
   * Memory allocations for the Adaptive Background Shader
   * @type {string}
   */
  static SHADER_HEADER = `
  ${this.FRAGMENT_UNIFORMS}
  ${this.VERTEX_FRAGMENT_VARYINGS}
  ${this.FRAGMENT_FUNCTIONS}
  ${this.CONSTANTS}`;

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

  /** @inheritdoc */
  static defaultUniforms = {
    technique: 0,
    saturation: 0,
    contrast: 0,
    attenuation: 0.10,
    exposure: 0,
    darknessLevel: 0,
    colorVision: [1, 1, 1],
    colorTint: [1, 1, 1],
    colorBackground: [1, 1, 1],
    screenDimensions: [1, 1],
    time: 0,
    useSampler: true,
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

  /**
   * Flag whether the background shader is currently required.
   * If key uniforms are at their default values, we don't need to render the background container.
   * @type {boolean}
   */
  get isRequired() {
    const keys = ["contrast", "saturation", "colorTint", "colorVision"];
    return keys.some(k => this.uniforms[k] !== this.constructor.defaultUniforms[k]);
  }
}

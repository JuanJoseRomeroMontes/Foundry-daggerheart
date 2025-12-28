import AdaptiveLightingShader from "./base-lighting.mjs";
import {LightData} from "../../../../../common/data/data.mjs";
import VisionMode from "../../../perception/vision-mode.mjs";

/**
 * The default coloration shader used by standard rendering and animations.
 * A fragment shader which creates a light source.
 */
export default class AdaptiveColorationShader extends AdaptiveLightingShader {

  /** @override */
  static FRAGMENT_END = `
  gl_FragColor = vec4(finalColor * depth, 1.0);
  `;

  /**
   * The adjustments made into fragment shaders
   * @type {string}
   */
  static get ADJUSTMENTS() {
    return `
      vec3 changedColor = finalColor;\n
      ${this.SATURATION}
      ${this.SHADOW}
      finalColor = changedColor;\n`;
  }

  /** @override */
  static SHADOW = `
    // Computing shadows
    if ( shadows != 0.0 ) {
      float shadowing = mix(1.0, smoothstep(0.25, 0.35, perceivedBrightness(baseColor.rgb)), shadows);
      // Applying shadow factor
      changedColor *= shadowing;
    }
  `;

  /**
   * Memory allocations for the Adaptive Coloration Shader
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
    finalColor = color * colorationAlpha;
    ${this.COLORATION_TECHNIQUES}
    ${this.ADJUSTMENTS}
    ${this.FALLOFF}
    ${this.FRAGMENT_END}
  }`;

  /** @inheritdoc */
  static defaultUniforms = {
    technique: 1,
    shadows: 0,
    contrast: 0,
    saturation: 0,
    colorationAlpha: 1,
    intensity: 5,
    attenuation: 0.5,
    ratio: 0.5,
    color: [1, 1, 1],
    time: 0,
    hasColor: false,
    screenDimensions: [1, 1],
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
   * Flag whether the coloration shader is currently required.
   * @type {boolean}
   */
  get isRequired() {
    const vs = canvas.visibility.lightingVisibility;

    // Checking if a vision mode is forcing the rendering
    if ( vs.coloration === VisionMode.LIGHTING_VISIBILITY.REQUIRED ) return true;

    // Checking if disabled
    if ( vs.coloration === VisionMode.LIGHTING_VISIBILITY.DISABLED ) return false;

    // Otherwise, we need the coloration if it has color
    return this.constructor.forceDefaultColor || this.uniforms.hasColor;
  }
}

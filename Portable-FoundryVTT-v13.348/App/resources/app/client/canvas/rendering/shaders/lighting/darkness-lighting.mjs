import AdaptiveLightingShader from "./base-lighting.mjs";
import {LightData} from "../../../../../common/data/data.mjs";
import Color from "../../../../../common/utils/color.mjs";
import VisionMode from "../../../perception/vision-mode.mjs";

/**
 * The default coloration shader used by standard rendering and animations.
 * A fragment shader which creates a solid light source.
 */
export default class AdaptiveDarknessShader extends AdaptiveLightingShader {

  /** @override */
  update() {
    super.update();
    this.uniforms.darknessLevel = canvas.environment.darknessLevel;
  }

  /* -------------------------------------------- */

  /**
   * Flag whether the darkness shader is currently required.
   * Check vision modes requirements first, then
   * if key uniforms are at their default values, we don't need to render the background container.
   * @type {boolean}
   */
  get isRequired() {
    const vs = canvas.visibility.lightingVisibility;

    // Checking if darkness layer is disabled
    if ( vs.darkness === VisionMode.LIGHTING_VISIBILITY.DISABLED ) return false;

    // Otherwise, returns true in every circumstances
    return true;
  }

  /* -------------------------------------------- */
  /*  GLSL Statics                                */
  /* -------------------------------------------- */

  /** @override */
  static defaultUniforms = {
    intensity: 5,
    color: Color.from("#8651d5").rgb,
    screenDimensions: [1, 1],
    time: 0,
    primaryTexture: null,
    depthTexture: null,
    visionTexture: null,
    darknessLevelTexture: null,
    depthElevation: 1,
    ambientBrightest: [1, 1, 1],
    ambientDarkness: [0, 0, 0],
    ambientDaylight: [1, 1, 1],
    weights: [0, 0, 0, 0],
    dimLevelCorrection: 1,
    brightLevelCorrection: 2,
    borderDistance: 0,
    darknessLevel: 0,
    computeIllumination: false,
    globalLight: false,
    globalLightThresholds: [0, 0],
    enableVisionMasking: false
  };

  static {
    const initial = LightData.cleanData();
    this.defaultUniforms.intensity = initial.animation.intensity;
  }

  /* -------------------------------------------- */

  /**
   * Shader final
   * @type {string}
   */
  static FRAGMENT_END = `
  gl_FragColor = vec4(finalColor, 1.0) * depth;
  `;

  /* -------------------------------------------- */

  /**
   * Initialize fragment with common properties
   * @type {string}
   */
  static FRAGMENT_BEGIN = `
  ${this.COMPUTE_ILLUMINATION}
  float dist = distance(vUvs, vec2(0.5)) * 2.0;
  vec4 depthColor = texture2D(depthTexture, vSamplerUvs);
  float depth = smoothstep(0.0, 1.0, vDepth) * 
                step(depthColor.g, depthElevation) * 
                step(depthElevation, (254.5 / 255.0) - depthColor.r) *
                (enableVisionMasking ? 1.0 - step(texture2D(visionTexture, vSamplerUvs).r, 0.0) : 1.0) *
                (1.0 - smoothstep(borderDistance, 1.0, dist));
  vec4 baseColor = texture2D(primaryTexture, vSamplerUvs);
  vec3 finalColor = baseColor.rgb;
  `;

  /* -------------------------------------------- */

  /**
   * Memory allocations for the Adaptive Background Shader
   * @type {string}
   */
  static SHADER_HEADER = `
  ${this.FRAGMENT_UNIFORMS}
  ${this.VERTEX_FRAGMENT_VARYINGS}
  ${this.FRAGMENT_FUNCTIONS}
  ${this.CONSTANTS}
  `;

  /* -------------------------------------------- */

  /** @inheritdoc */
  static fragmentShader = `
  ${this.SHADER_HEADER}
  ${this.PERCEIVED_BRIGHTNESS}

  void main() {
    ${this.FRAGMENT_BEGIN}
    finalColor *= (mix(color, color * 0.33, darknessLevel) * colorationAlpha);
    ${this.FRAGMENT_END}
  }`;
}

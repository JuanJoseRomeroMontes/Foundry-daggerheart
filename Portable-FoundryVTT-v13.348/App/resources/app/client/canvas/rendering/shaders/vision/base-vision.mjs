import AdaptiveLightingShader from "../lighting/base-lighting.mjs";

/**
 * This class defines an interface which all adaptive vision shaders extend.
 */
export default class AdaptiveVisionShader extends AdaptiveLightingShader {

  /** @inheritDoc */
  static FRAGMENT_FUNCTIONS = `
  ${super.FRAGMENT_FUNCTIONS}
  vec3 computedVisionColor;
  `;

  /* -------------------------------------------- */

  /** @override */
  static EXPOSURE = `
    // Computing exposed color for background
    if ( exposure != 0.0 ) {
      changedColor *= (1.0 + exposure);
    }`;

  /* -------------------------------------------- */

  /** @inheritDoc */
  static COMPUTE_ILLUMINATION = `
  ${super.COMPUTE_ILLUMINATION}
  if ( computeIllumination ) computedVisionColor = mix(computedDimColor, computedBrightColor, brightness);
  else computedVisionColor = colorVision;
  `;

  /* -------------------------------------------- */

  // FIXME: need to redeclare fragment begin here to take into account COMPUTE_ILLUMINATION
  //        Do not work without this redeclaration.
  /** @override */
  static FRAGMENT_BEGIN = `
  ${this.COMPUTE_ILLUMINATION}
  float dist = distance(vUvs, vec2(0.5)) * 2.0;
  vec4 depthColor = texture2D(depthTexture, vSamplerUvs);
  float depth = smoothstep(0.0, 1.0, vDepth) * step(depthColor.g, depthElevation) * step(depthElevation, (254.5 / 255.0) - depthColor.r);
  vec4 baseColor = useSampler ? texture2D(primaryTexture, vSamplerUvs) : vec4(1.0);
  vec3 finalColor = baseColor.rgb;
  `;

  /* -------------------------------------------- */

  /** @override */
  static SHADOW = "";

  /* -------------------------------------------- */
  /*  Shader Techniques for vision                */
  /* -------------------------------------------- */

  /**
   * A mapping of available shader techniques
   * @type {Record<string, ShaderTechnique>}
   */
  static SHADER_TECHNIQUES = {
    LEGACY: {
      id: 0,
      label: "LIGHT.AdaptiveLuminance",
      coloration: `
      float reflection = perceivedBrightness(baseColor);
      finalColor *= reflection;`
    }
  };
}

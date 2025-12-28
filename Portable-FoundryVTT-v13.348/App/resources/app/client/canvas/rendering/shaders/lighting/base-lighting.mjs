import AbstractBaseShader from "../base-shader.mjs";

/**
 * @typedef ShaderTechnique
 * @property {number} id                       The numeric identifier of the technique
 * @property {string} label                    The localization string that labels the technique
 * @property {string} [coloration]             The coloration shader fragment when the technique is used
 * @property {string} [illumination]           The illumination shader fragment when the technique is used
 * @property {string} [background]             The background shader fragment when the technique is used
 */

/**
 * This class defines an interface which all adaptive lighting shaders extend.
 */
export default class AdaptiveLightingShader extends AbstractBaseShader {

  /**
   * Has this lighting shader a forced default color?
   * @type {boolean}
   */
  static forceDefaultColor = false;

  /* -------------------------------------------- */

  /** Called before rendering. */
  update() {
    this.uniforms.depthElevation = canvas.masks.depth.mapElevation(this.uniforms.elevation ?? 0);
  }

  /* -------------------------------------------- */

  /**
   * Common attributes for vertex shaders.
   * @type {string}
   */
  static VERTEX_ATTRIBUTES = `
  attribute vec2 aVertexPosition;
  attribute float aDepthValue;
  `;

  /**
   * Common uniforms for vertex shaders.
   * @type {string}
   */
  static VERTEX_UNIFORMS = `
  uniform mat3 translationMatrix;
  uniform mat3 projectionMatrix;
  uniform float rotation;
  uniform float angle;
  uniform float radius;
  uniform float depthElevation;
  uniform vec2 screenDimensions;
  uniform vec2 resolution;
  uniform vec3 origin;
  uniform vec3 dimensions;
  `;

  /**
   * Common varyings shared by vertex and fragment shaders.
   * @type {string}
   */
  static VERTEX_FRAGMENT_VARYINGS = `
  varying vec2 vUvs;
  varying vec2 vSamplerUvs;
  varying float vDepth;
  `;

  /**
   * Common functions used by the vertex shaders.
   * @type {string}
   * @abstract
   */
  static VERTEX_FUNCTIONS = "";

  /**
   * Common uniforms shared by fragment shaders.
   * @type {string}
   */
  static FRAGMENT_UNIFORMS = `
  uniform int technique;
  uniform bool useSampler;
  uniform bool hasColor;
  uniform bool computeIllumination;
  uniform bool linkedToDarknessLevel;
  uniform bool enableVisionMasking;
  uniform bool globalLight;
  uniform float attenuation;
  uniform float borderDistance;
  uniform float contrast;
  uniform float shadows;
  uniform float exposure;
  uniform float saturation;
  uniform float intensity;
  uniform float brightness;
  uniform float luminosity;
  uniform float pulse;
  uniform float brightnessPulse;
  uniform float backgroundAlpha;
  uniform float illuminationAlpha;
  uniform float colorationAlpha;
  uniform float ratio;
  uniform float time;
  uniform float darknessLevel;
  uniform float darknessPenalty;
  uniform vec2 globalLightThresholds;
  uniform vec3 color;
  uniform vec3 colorBackground;
  uniform vec3 colorVision;
  uniform vec3 colorTint;
  uniform vec3 colorEffect;
  uniform vec3 colorDim;
  uniform vec3 colorBright;
  uniform vec3 ambientDaylight;
  uniform vec3 ambientDarkness;
  uniform vec3 ambientBrightest;
  uniform int dimLevelCorrection;
  uniform int brightLevelCorrection;
  uniform vec4 weights;
  uniform sampler2D primaryTexture;
  uniform sampler2D depthTexture;
  uniform sampler2D darknessLevelTexture;
  uniform sampler2D visionTexture;

  // Shared uniforms with vertex shader
  uniform ${PIXI.settings.PRECISION_VERTEX} float rotation;
  uniform ${PIXI.settings.PRECISION_VERTEX} float angle;
  uniform ${PIXI.settings.PRECISION_VERTEX} float radius;
  uniform ${PIXI.settings.PRECISION_VERTEX} float depthElevation;
  uniform ${PIXI.settings.PRECISION_VERTEX} vec2 resolution;
  uniform ${PIXI.settings.PRECISION_VERTEX} vec2 screenDimensions;
  uniform ${PIXI.settings.PRECISION_VERTEX} vec3 origin;
  uniform ${PIXI.settings.PRECISION_VERTEX} vec3 dimensions;
  uniform ${PIXI.settings.PRECISION_VERTEX} mat3 translationMatrix;
  uniform ${PIXI.settings.PRECISION_VERTEX} mat3 projectionMatrix;
  `;

  /**
   * Common functions used by the fragment shaders.
   * @type {string}
   * @abstract
   */
  static FRAGMENT_FUNCTIONS = `
  #define DARKNESS -2
  #define HALFDARK -1
  #define UNLIT 0
  #define DIM 1
  #define BRIGHT 2
  #define BRIGHTEST 3
  
  vec3 computedDimColor;
  vec3 computedBrightColor;
  vec3 computedBackgroundColor;
  float computedDarknessLevel;
  
  vec3 getCorrectedColor(int level) {
    if ( (level == HALFDARK) || (level == DIM) ) {
      return computedDimColor;
    } else if ( (level == BRIGHT) || (level == DARKNESS) ) {
      return computedBrightColor;
    } else if ( level == BRIGHTEST ) {
      return ambientBrightest;
    } else if ( level == UNLIT ) {
      return computedBackgroundColor;
    } 
    return computedDimColor;
  }
  `;

  /** @inheritdoc */
  static CONSTANTS = `
    ${super.CONSTANTS}
    const float INVTHREE = 1.0 / 3.0;
    const vec2 PIVOT = vec2(0.5);
    const vec4 ALLONES = vec4(1.0);
  `;

  /** @inheritdoc */
  static vertexShader = `
  ${this.VERTEX_ATTRIBUTES}
  ${this.VERTEX_UNIFORMS}
  ${this.VERTEX_FRAGMENT_VARYINGS}
  ${this.VERTEX_FUNCTIONS}

  void main() {
    vec3 tPos = translationMatrix * vec3(aVertexPosition, 1.0);
    vUvs = aVertexPosition * 0.5 + 0.5;
    vDepth = aDepthValue;
    vSamplerUvs = tPos.xy / screenDimensions;
    gl_Position = vec4((projectionMatrix * tPos).xy, 0.0, 1.0);
  }`;

  /* -------------------------------------------- */
  /*  GLSL Helper Functions                       */
  /* -------------------------------------------- */

  /**
   * Construct adaptive shader according to shader type
   * @param {string} shaderType  shader type to construct : coloration, illumination, background, etc.
   * @returns {string}           the constructed shader adaptive block
   */
  static getShaderTechniques(shaderType) {
    let shader = "";
    let index = 0;
    for ( let technique of Object.values(this.SHADER_TECHNIQUES) ) {
      if ( technique[shaderType] ) {
        let cond = `if ( technique == ${technique.id} )`;
        if ( index > 0 ) cond = `else ${cond}`;
        shader += `${cond} {${technique[shaderType]}\n}\n`;
        index++;
      }
    }
    return shader;
  }

  /* -------------------------------------------- */

  /**
   * The coloration technique coloration shader fragment
   * @type {string}
   */
  static get COLORATION_TECHNIQUES() {
    return this.getShaderTechniques("coloration");
  }

  /* -------------------------------------------- */

  /**
   * The coloration technique illumination shader fragment
   * @type {string}
   */
  static get ILLUMINATION_TECHNIQUES() {
    return this.getShaderTechniques("illumination");
  }

  /* -------------------------------------------- */

  /**
   * The coloration technique background shader fragment
   * @type {string}
   */
  static get BACKGROUND_TECHNIQUES() {
    return this.getShaderTechniques("background");
  }

  /* -------------------------------------------- */

  /**
   * The adjustments made into fragment shaders
   * @type {string}
   */
  static get ADJUSTMENTS() {
    return `vec3 changedColor = finalColor;\n
    ${this.CONTRAST}
    ${this.SATURATION}
    ${this.EXPOSURE}
    ${this.SHADOW}
    if ( useSampler ) finalColor = changedColor;`;
  }

  /* -------------------------------------------- */

  /**
   * Contrast adjustment
   * @type {string}
   */
  static CONTRAST = `
    // Computing contrasted color
    if ( contrast != 0.0 ) {
      changedColor = (changedColor - 0.5) * (contrast + 1.0) + 0.5;
    }`;

  /* -------------------------------------------- */

  /**
   * Saturation adjustment
   * @type {string}
   */
  static SATURATION = `
    // Computing saturated color
    if ( saturation != 0.0 ) {
      vec3 grey = vec3(perceivedBrightness(changedColor));
      changedColor = mix(grey, changedColor, 1.0 + saturation);
    }`;

  /* -------------------------------------------- */

  /**
   * Exposure adjustment
   * @type {string}
   */
  static EXPOSURE = `
    // Computing exposed color for background
    if ( exposure > 0.0 ) {
      float halfExposure = exposure * 0.5;
      float attenuationStrength = attenuation * 0.25;
      float lowerEdge = 0.98 - attenuationStrength;
      float upperEdge = 1.02 + attenuationStrength;
      float finalExposure = halfExposure *
                            (1.0 - smoothstep(ratio * lowerEdge, clamp(ratio * upperEdge, 0.0001, 1.0), dist)) +
                            halfExposure;
      changedColor *= (1.0 + finalExposure);
    }
    `;

  /* -------------------------------------------- */

  /**
   * Switch between an inner and outer color, by comparing distance from center to ratio
   * Apply a strong gradient between the two areas if attenuation uniform is set to true
   * @type {string}
   */
  static SWITCH_COLOR = `
    vec3 switchColor( in vec3 innerColor, in vec3 outerColor, in float dist ) {
      float attenuationStrength = attenuation * 0.7;
      float lowerEdge = 0.99 - attenuationStrength;
      float upperEdge = 1.01 + attenuationStrength;
      return mix(innerColor, outerColor, smoothstep(ratio * lowerEdge, clamp(ratio * upperEdge, 0.0001, 1.0), dist));
    }`;

  /* -------------------------------------------- */

  /**
   * Shadow adjustment
   * @type {string}
   */
  static SHADOW = `
    // Computing shadows
    if ( shadows != 0.0 ) {
      float shadowing = mix(1.0, smoothstep(0.50, 0.80, perceivedBrightness(changedColor)), shadows);
      // Applying shadow factor
      changedColor *= shadowing;
    }`;

  /* -------------------------------------------- */

  /**
   * Transition between bright and dim colors, if requested
   * @type {string}
   */
  static TRANSITION = `
  finalColor = switchColor(computedBrightColor, computedDimColor, dist);`;

  /**
   * Incorporate falloff if a attenuation uniform is requested
   * @type {string}
   */
  static FALLOFF = `
  if ( attenuation != 0.0 ) depth *= smoothstep(1.0, 1.0 - attenuation, dist);
  `;

  /**
   * Compute illumination uniforms
   * @type {string}
   */
  static COMPUTE_ILLUMINATION = `
  float weightDark = weights.x;
  float weightHalfdark = weights.y;
  float weightDim = weights.z;
  float weightBright = weights.w;
  
  if ( computeIllumination ) {
    computedDarknessLevel = texture2D(darknessLevelTexture, vSamplerUvs).r;  
    computedBackgroundColor = mix(ambientDaylight, ambientDarkness, computedDarknessLevel);
    computedBrightColor = mix(computedBackgroundColor, ambientBrightest, weightBright);
    computedDimColor = mix(computedBackgroundColor, computedBrightColor, weightDim);
    
    // Apply lighting levels
    vec3 correctedComputedBrightColor = getCorrectedColor(brightLevelCorrection);
    vec3 correctedComputedDimColor = getCorrectedColor(dimLevelCorrection);
    computedBrightColor = correctedComputedBrightColor;
    computedDimColor = correctedComputedDimColor;
  }
  else {
    computedBackgroundColor = colorBackground;
    computedDimColor = colorDim;
    computedBrightColor = colorBright;
    computedDarknessLevel = darknessLevel;
  }

  computedDimColor = max(computedDimColor, computedBackgroundColor);
  computedBrightColor = max(computedBrightColor, computedBackgroundColor);

  if ( globalLight && ((computedDarknessLevel < globalLightThresholds[0]) || (computedDarknessLevel > globalLightThresholds[1])) ) discard;
  `;

  /**
   * Initialize fragment with common properties
   * @type {string}
   */
  static FRAGMENT_BEGIN = `
  ${this.COMPUTE_ILLUMINATION}
  float dist = distance(vUvs, vec2(0.5)) * 2.0;
  vec4 depthColor = texture2D(depthTexture, vSamplerUvs);
  float depth = smoothstep(0.0, 1.0, vDepth) * (globalLight ? 1.0 : step(depthColor.g, depthElevation) * step(depthElevation, (254.5 / 255.0) - depthColor.r));
  vec4 baseColor = useSampler ? texture2D(primaryTexture, vSamplerUvs) : vec4(1.0);
  vec3 finalColor = baseColor.rgb;
  `;

  /**
   * Shader final
   * @type {string}
   */
  static FRAGMENT_END = `
  gl_FragColor = vec4(finalColor, 1.0) * depth;
  `;

  /* -------------------------------------------- */
  /*  Shader Techniques for lighting              */
  /* -------------------------------------------- */

  /**
   * A mapping of available shader techniques
   * @type {Record<string, ShaderTechnique>}
   */
  static SHADER_TECHNIQUES = {
    LEGACY: {
      id: 0,
      label: "LIGHT.LegacyColoration"
    },
    LUMINANCE: {
      id: 1,
      label: "LIGHT.AdaptiveLuminance",
      coloration: `
      float reflection = perceivedBrightness(baseColor);
      finalColor *= reflection;`
    },
    INTERNAL_HALO: {
      id: 2,
      label: "LIGHT.InternalHalo",
      coloration: `
      float reflection = perceivedBrightness(baseColor);
      finalColor = switchColor(finalColor, finalColor * reflection, dist);`
    },
    EXTERNAL_HALO: {
      id: 3,
      label: "LIGHT.ExternalHalo",
      coloration: `
      float reflection = perceivedBrightness(baseColor);
      finalColor = switchColor(finalColor * reflection, finalColor, dist);`
    },
    COLOR_BURN: {
      id: 4,
      label: "LIGHT.ColorBurn",
      coloration: `
      float reflection = perceivedBrightness(baseColor);
      finalColor = (finalColor * (1.0 - sqrt(reflection))) / clamp(baseColor.rgb * 2.0, 0.001, 0.25);`
    },
    INTERNAL_BURN: {
      id: 5,
      label: "LIGHT.InternalBurn",
      coloration: `
      float reflection = perceivedBrightness(baseColor);
      finalColor = switchColor((finalColor * (1.0 - sqrt(reflection))) / clamp(baseColor.rgb * 2.0, 0.001, 0.25), finalColor * reflection, dist);`
    },
    EXTERNAL_BURN: {
      id: 6,
      label: "LIGHT.ExternalBurn",
      coloration: `
      float reflection = perceivedBrightness(baseColor);
      finalColor = switchColor(finalColor * reflection, (finalColor * (1.0 - sqrt(reflection))) / clamp(baseColor.rgb * 2.0, 0.001, 0.25), dist);`
    },
    LOW_ABSORPTION: {
      id: 7,
      label: "LIGHT.LowAbsorption",
      coloration: `
      float reflection = perceivedBrightness(baseColor);
      reflection *= smoothstep(0.35, 0.75, reflection);
      finalColor *= reflection;`
    },
    HIGH_ABSORPTION: {
      id: 8,
      label: "LIGHT.HighAbsorption",
      coloration: `
      float reflection = perceivedBrightness(baseColor);
      reflection *= smoothstep(0.55, 0.85, reflection);
      finalColor *= reflection;`
    },
    INVERT_ABSORPTION: {
      id: 9,
      label: "LIGHT.InvertAbsorption",
      coloration: `
      float r = reversePerceivedBrightness(baseColor);
      finalColor *= (r * r * r * r * r);`
    },
    NATURAL_LIGHT: {
      id: 10,
      label: "LIGHT.NaturalLight",
      coloration: `
      float reflection = perceivedBrightness(baseColor);
      finalColor *= reflection;`,
      background: `
      float ambientColorIntensity = perceivedBrightness(computedBackgroundColor);
      vec3 mutedColor = mix(finalColor, 
                            finalColor * mix(color, computedBackgroundColor, ambientColorIntensity), 
                            backgroundAlpha);
      finalColor = mix( finalColor,
                        mutedColor,
                        computedDarknessLevel);`
    }
  };

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  getDarknessPenalty(darknessLevel, luminosity) {
    const msg = "AdaptiveLightingShader#getDarknessPenalty is deprecated without replacement. " +
      "The darkness penalty is no longer applied on light and vision sources.";
    foundry.utils.logCompatibilityWarning(msg, {since: 12, until: 14});
    return 0;
  }
}

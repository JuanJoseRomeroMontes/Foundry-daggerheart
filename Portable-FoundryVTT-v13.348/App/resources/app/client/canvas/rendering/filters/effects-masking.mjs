import AbstractBaseMaskFilter from "./base-mask-filter.mjs";

/**
 * This filter handles masking and post-processing for visual effects.
 */
export default class VisualEffectsMaskingFilter extends AbstractBaseMaskFilter {
  /** @override */
  static create({postProcessModes, ...initialUniforms}={}) {
    const fragmentShader = this.fragmentShader(postProcessModes);
    const uniforms = {...this.defaultUniforms, ...initialUniforms};
    return new this(this.vertexShader, fragmentShader, uniforms);
  }

  /**
   * Code to determine which post-processing effect is applied in this filter.
   * @type {string[]}
   */
  #postProcessModes;

  /* -------------------------------------------- */

  /**
   * Masking modes.
   * @enum {number}
   */
  static FILTER_MODES = Object.freeze({
    BACKGROUND: 0,
    ILLUMINATION: 1,
    COLORATION: 2
  });

  /* -------------------------------------------- */

  /** @override */
  static defaultUniforms = {
    tint: [1, 1, 1],
    screenDimensions: [1, 1],
    enableVisionMasking: true,
    visionTexture: null,
    darknessLevelTexture: null,
    exposure: 0,
    contrast: 0,
    saturation: 0,
    mode: 0,
    ambientDarkness: [0, 0, 0],
    ambientDaylight: [1, 1, 1],
    replacementColor: [0, 0, 0]
  };

  /* -------------------------------------------- */

  /**
   * Update the filter shader with new post-process modes.
   * @param {string[]} [postProcessModes=[]]   New modes to apply.
   * @param {object} [uniforms={}]             Uniforms value to update.
   */
  updatePostprocessModes(postProcessModes=[], uniforms={}) {

    // Update shader uniforms
    for ( const [uniform, value] of Object.entries(uniforms) ) {
      if ( uniform in this.uniforms ) this.uniforms[uniform] = value;
    }

    // Update the shader program if post-processing modes have changed
    if ( postProcessModes.equals(this.#postProcessModes) ) return;
    this.#postProcessModes = postProcessModes;
    this.program = PIXI.Program.from(this.constructor.vertexShader,
      this.constructor.fragmentShader(this.#postProcessModes));
  }

  /* -------------------------------------------- */

  /**
   * Remove all post-processing modes and reset some key uniforms.
   */
  reset() {
    this.#postProcessModes = [];
    this.program = PIXI.Program.from(this.constructor.vertexShader,
      this.constructor.fragmentShader());
    const uniforms = ["tint", "exposure", "contrast", "saturation"];
    for ( const uniform of uniforms ) {
      this.uniforms[uniform] = this.constructor.defaultUniforms[uniform];
    }
  }

  /* -------------------------------------------- */

  /** @override */
  apply(filterManager, input, output, clear, currentState) {
    const c = canvas.colors;
    const u = this.uniforms;
    if ( u.mode === this.constructor.FILTER_MODES.ILLUMINATION ) {
      c.ambientDarkness.applyRGB(u.ambientDarkness);
      c.ambientDaylight.applyRGB(u.ambientDaylight);
    }
    super.apply(filterManager, input, output, clear, currentState);
  }

  /* -------------------------------------------- */

  /**
   * Filter post-process techniques.
   * @enum {{id: string, glsl: string}}
   */
  static POST_PROCESS_TECHNIQUES = {
    EXPOSURE: {
      id: "EXPOSURE",
      glsl: `if ( exposure != 0.0 ) {
        finalColor.rgb *= (1.0 + exposure);
      }`
    },
    CONTRAST: {
      id: "CONTRAST",
      glsl: `if ( contrast != 0.0 ) {
        finalColor.rgb = (finalColor.rgb - 0.5) * (contrast + 1.0) + 0.5;
      }`
    },
    SATURATION: {
      id: "SATURATION",
      glsl: `if ( saturation != 0.0 ) {
        float reflection = perceivedBrightness(finalColor.rgb);
        finalColor.rgb = mix(vec3(reflection), finalColor.rgb, 1.0 + saturation) * finalColor.a;
      }`
    }
  };

  /* -------------------------------------------- */

  /**
   * Memory allocations and headers for the VisualEffectsMaskingFilter
   * @returns {string}                   The filter header according to the filter mode.
   */
  static fragmentHeader = `
    varying vec2 vTextureCoord;
    varying vec2 vMaskTextureCoord;
    uniform float contrast;
    uniform float saturation;
    uniform float exposure;
    uniform vec3 ambientDarkness;
    uniform vec3 ambientDaylight;
    uniform vec3 replacementColor;
    uniform vec3 tint;
    uniform sampler2D uSampler;
    uniform sampler2D visionTexture;
    uniform sampler2D darknessLevelTexture;
    uniform bool enableVisionMasking;
    uniform int mode;
    vec4 baseColor;
    vec4 finalColor;
    ${this.CONSTANTS}
    ${this.PERCEIVED_BRIGHTNESS}

    vec4 getReplacementColor() {
      if ( mode == 0 ) return vec4(0.0);
      if ( mode == 2 ) return vec4(replacementColor, 1.0);
      float darknessLevel = texture2D(darknessLevelTexture, vMaskTextureCoord).r;
      return vec4(mix(ambientDaylight, ambientDarkness, darknessLevel), 1.0);
    }
    `;

  /* -------------------------------------------- */

  /**
   * The fragment core code.
   * @type {string}
   */
  static fragmentCore = `
    // Get the base color from the filter sampler
    finalColor = texture2D(uSampler, vTextureCoord);

    // Handling vision masking
    if ( enableVisionMasking ) {
      finalColor = mix( getReplacementColor(),
                        finalColor,
                        texture2D(visionTexture, vMaskTextureCoord).r);
    }
    `;

  /* -------------------------------------------- */

  /**
   * Construct filter post-processing code according to provided value.
   * @param {string[]} postProcessModes  Post-process modes to construct techniques.
   * @returns {string}                   The constructed shader code for post-process techniques.
   */
  static fragmentPostProcess(postProcessModes=[]) {
    return postProcessModes.reduce((s, t) => s + (this.POST_PROCESS_TECHNIQUES[t].glsl ?? ""), "");
  }

  /* -------------------------------------------- */

  /**
   * Specify the fragment shader to use according to mode
   * @param {string[]} postProcessModes
   * @returns {string}
   * @override
   */
  static fragmentShader(postProcessModes=[]) {
    return `
    ${this.fragmentHeader}
    void main() {
      ${this.fragmentCore}
      ${this.fragmentPostProcess(postProcessModes)}
      if ( enableVisionMasking ) finalColor *= vec4(tint, 1.0);
      gl_FragColor = finalColor;
    }
    `;
  }
}

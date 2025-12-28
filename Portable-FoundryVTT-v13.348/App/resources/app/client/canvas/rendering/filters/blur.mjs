/**
 * Apply a vertical or horizontal gaussian blur going inward by using alpha as the penetrating channel.
 * @param {boolean} horizontal      If the pass is horizontal (true) or vertical (false).
 * @param {number} [strength=8]     Strength of the blur (distance of sampling).
 * @param {number} [quality=4]      Number of passes to generate the blur. More passes = Higher quality = Lower Perf.
 * @param {number} [resolution=PIXI.Filter.defaultResolution]  Resolution of the filter.
 * @param {number} [kernelSize=5]   Number of kernels to use. More kernels = Higher quality = Lower Perf.
 */
export class AlphaBlurFilterPass extends PIXI.Filter {
  constructor(horizontal, strength=8, quality=4, resolution=PIXI.Filter.defaultResolution, kernelSize=5) {
    const vertSrc = AlphaBlurFilterPass.vertTemplate(kernelSize, horizontal);
    const fragSrc = AlphaBlurFilterPass.fragTemplate(kernelSize);
    super(vertSrc, fragSrc);
    this.horizontal = horizontal;
    this.strength = strength;
    this.passes = quality;
    this.resolution = resolution;
  }

  /**
   * If the pass is horizontal (true) or vertical (false).
   * @type {boolean}
   */
  horizontal;

  /**
   * Strength of the blur (distance of sampling).
   * @type {number}
   */
  strength;

  /**
   * The number of passes to generate the blur.
   * @type {number}
   */
  passes;

  /* -------------------------------------------- */

  /**
   * The quality of the filter is defined by its number of passes.
   * @returns {number}
   */
  get quality() {
    return this.passes;
  }

  set quality(value) {
    this.passes = value;
  }

  /* -------------------------------------------- */

  /**
   * The strength of the blur filter in pixels.
   * @returns {number}
   */
  get blur() {
    return this.strength;
  }

  set blur(value) {
    this.padding = 1 + (Math.abs(value) * 2);
    this.strength = value;
  }

  /* -------------------------------------------- */

  /**
   * The kernels containing the gaussian constants.
   * @type {Record<number, number[]>}
   */
  static GAUSSIAN_VALUES = {
    5: [0.153388, 0.221461, 0.250301],
    7: [0.071303, 0.131514, 0.189879, 0.214607],
    9: [0.028532, 0.067234, 0.124009, 0.179044, 0.20236],
    11: [0.0093, 0.028002, 0.065984, 0.121703, 0.175713, 0.198596],
    13: [0.002406, 0.009255, 0.027867, 0.065666, 0.121117, 0.174868, 0.197641],
    15: [0.000489, 0.002403, 0.009246, 0.02784, 0.065602, 0.120999, 0.174697, 0.197448]
  };

  /* -------------------------------------------- */

  /**
   * The fragment template generator
   * @param {number} kernelSize   The number of kernels to use.
   * @returns {string}            The generated fragment shader.
   */
  static fragTemplate(kernelSize) {
    return `
    varying vec2 vBlurTexCoords[${kernelSize}];
    varying vec2 vTextureCoords;
    uniform sampler2D uSampler;

    void main(void) {
        vec4 finalColor = vec4(0.0);
        ${this.generateBlurFragSource(kernelSize)}
        finalColor.rgb *= clamp(mix(-1.0, 1.0, finalColor.a), 0.0, 1.0);
        gl_FragColor = finalColor;
    }
    `;
  }

  /* -------------------------------------------- */

  /**
   * The vertex template generator
   * @param {number} kernelSize   The number of kernels to use.
   * @param {boolean} horizontal  If the vertex should handle horizontal or vertical pass.
   * @returns {string}            The generated vertex shader.
   */
  static vertTemplate(kernelSize, horizontal) {
    return `
    attribute vec2 aVertexPosition;
    uniform mat3 projectionMatrix;
    uniform float strength;
    varying vec2 vBlurTexCoords[${kernelSize}];
    varying vec2 vTextureCoords;
    uniform vec4 inputSize;
    uniform vec4 outputFrame;
    
    vec4 filterVertexPosition( void ) {
        vec2 position = aVertexPosition * max(outputFrame.zw, vec2(0.)) + outputFrame.xy;
        return vec4((projectionMatrix * vec3(position, 1.0)).xy, 0.0, 1.0);
    }
    
    vec2 filterTextureCoord( void ) {
        return aVertexPosition * (outputFrame.zw * inputSize.zw);
    }
        
    void main(void) {
        gl_Position = filterVertexPosition();
        vec2 textureCoord = vTextureCoords = filterTextureCoord();
        ${this.generateBlurVertSource(kernelSize, horizontal)}
    }
    `;
  }

  /* -------------------------------------------- */

  /**
   * Generating the dynamic part of the blur in the fragment
   * @param {number} kernelSize   The number of kernels to use.
   * @returns {string}            The dynamic blur part.
   */
  static generateBlurFragSource(kernelSize) {
    const kernel = AlphaBlurFilterPass.GAUSSIAN_VALUES[kernelSize];
    const halfLength = kernel.length;
    let value;
    let blurLoop = "";
    for ( let i = 0; i < kernelSize; i++ ) {
      blurLoop += `finalColor += texture2D(uSampler, vBlurTexCoords[${i.toString()}])`;
      value = i >= halfLength ? kernelSize - i - 1 : i;
      blurLoop += ` * ${kernel[value].toString()};\n`;
    }
    return blurLoop;
  }

  /* -------------------------------------------- */

  /**
   * Generating the dynamic part of the blur in the vertex
   * @param {number} kernelSize   The number of kernels to use.
   * @param {boolean} horizontal  If the vertex should handle horizontal or vertical pass.
   * @returns {string}            The dynamic blur part.
   */
  static generateBlurVertSource(kernelSize, horizontal) {
    const halfLength = Math.ceil(kernelSize / 2);
    let blurLoop = "";
    for ( let i = 0; i < kernelSize; i++ ) {
      const khl = i - (halfLength - 1);
      blurLoop += horizontal
        ? `vBlurTexCoords[${i.toString()}] = textureCoord + vec2(${khl}.0 * strength, 0.0);`
        : `vBlurTexCoords[${i.toString()}] = textureCoord + vec2(0.0, ${khl}.0 * strength);`;
      blurLoop += "\n";
    }
    return blurLoop;
  }

  /* -------------------------------------------- */

  /** @override */
  apply(filterManager, input, output, clearMode) {

    // Define strength
    const ow = output ? output.width : filterManager.renderer.width;
    const oh = output ? output.height : filterManager.renderer.height;
    this.uniforms.strength = (this.horizontal ? (1 / ow) * (ow / input.width) : (1 / oh) * (oh / input.height))
      * this.strength / this.passes;

    // Single pass
    if ( this.passes === 1 ) {
      return filterManager.applyFilter(this, input, output, clearMode);
    }

    // Multi-pass
    const renderTarget = filterManager.getFilterTexture();
    const renderer = filterManager.renderer;

    let flip = input;
    let flop = renderTarget;

    // Initial application
    this.state.blend = false;
    filterManager.applyFilter(this, flip, flop, PIXI.CLEAR_MODES.CLEAR);

    // Additional passes
    for ( let i = 1; i < this.passes - 1; i++ ) {
      filterManager.bindAndClear(flip, PIXI.CLEAR_MODES.BLIT);
      this.uniforms.uSampler = flop;
      const temp = flop;
      flop = flip;
      flip = temp;
      renderer.shader.bind(this);
      renderer.geometry.draw(5);
    }

    // Final pass and return filter texture
    this.state.blend = true;
    filterManager.applyFilter(this, flop, output, clearMode);
    filterManager.returnFilterTexture(renderTarget);
  }
}

/* -------------------------------------------- */

/**
 * Apply a gaussian blur going inward by using alpha as the penetrating channel.
 * @param {number} [strength=8]     Strength of the blur (distance of sampling).
 * @param {number} [quality=4]      Number of passes to generate the blur. More passes = Higher quality = Lower Perf.
 * @param {number} [resolution=PIXI.Filter.defaultResolution]  Resolution of the filter.
 * @param {number} [kernelSize=5]   Number of kernels to use. More kernels = Higher quality = Lower Perf.
 */
export default class AlphaBlurFilter extends PIXI.Filter {
  constructor(strength=8, quality=4, resolution=PIXI.Filter.defaultResolution, kernelSize=5) {
    super();
    this.blurXFilter = new AlphaBlurFilterPass(true, strength, quality, resolution, kernelSize);
    this.blurYFilter = new AlphaBlurFilterPass(false, strength, quality, resolution, kernelSize);
    this.resolution = resolution;
    this._repeatEdgePixels = false;
    this.quality = quality;
    this.blur = strength;
  }

  /* -------------------------------------------- */

  /** @override */
  apply(filterManager, input, output, clearMode) {
    const xStrength = Math.abs(this.blurXFilter.strength);
    const yStrength = Math.abs(this.blurYFilter.strength);

    // Blur both directions
    if ( xStrength && yStrength ) {
      const renderTarget = filterManager.getFilterTexture();
      this.blurXFilter.apply(filterManager, input, renderTarget, PIXI.CLEAR_MODES.CLEAR);
      this.blurYFilter.apply(filterManager, renderTarget, output, clearMode);
      filterManager.returnFilterTexture(renderTarget);
    }

    // Only vertical
    else if ( yStrength ) this.blurYFilter.apply(filterManager, input, output, clearMode);

    // Only horizontal
    else this.blurXFilter.apply(filterManager, input, output, clearMode);
  }

  /* -------------------------------------------- */

  /**
   * Update the filter padding according to the blur strength value (0 if _repeatEdgePixels is active)
   */
  updatePadding() {
    this.padding = this._repeatEdgePixels ? 0
      : Math.max(Math.abs(this.blurXFilter.strength), Math.abs(this.blurYFilter.strength)) * 2;
  }

  /* -------------------------------------------- */

  /**
   * The amount of blur is forwarded to the X and Y filters.
   * @type {number}
   */
  get blur() {
    return this.blurXFilter.blur;
  }

  set blur(value) {
    this.blurXFilter.blur = this.blurYFilter.blur = value;
    this.updatePadding();
  }

  /* -------------------------------------------- */

  /**
   * The quality of blur defines the number of passes used by subsidiary filters.
   * @type {number}
   */
  get quality() {
    return this.blurXFilter.quality;
  }

  set quality(value) {
    this.blurXFilter.quality = this.blurYFilter.quality = value;
  }

  /* -------------------------------------------- */

  /**
   * Whether to repeat edge pixels, adding padding to the filter area.
   * @type {boolean}
   */
  get repeatEdgePixels() {
    return this._repeatEdgePixels;
  }

  set repeatEdgePixels(value) {
    this._repeatEdgePixels = value;
    this.updatePadding();
  }

  /* -------------------------------------------- */

  /**
   * Provided for completeness with PIXI.BlurFilter
   * @type {number}
   */
  get blurX() {
    return this.blurXFilter.blur;
  }

  set blurX(value) {
    this.blurXFilter.blur = value;
    this.updatePadding();
  }

  /* -------------------------------------------- */

  /**
   * Provided for completeness with PIXI.BlurFilter
   * @type {number}
   */
  get blurY() {
    return this.blurYFilter.blur;
  }

  set blurY(value) {
    this.blurYFilter.blur = value;
    this.updatePadding();
  }

  /* -------------------------------------------- */

  /**
   * Provided for completeness with PIXI.BlurFilter
   * @type {number}
   */
  get blendMode() {
    return this.blurYFilter.blendMode;
  }

  set blendMode(value) {
    this.blurYFilter.blendMode = value;
  }
}

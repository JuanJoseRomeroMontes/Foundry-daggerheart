import AbstractBaseMaskFilter from "./base-mask-filter.mjs";

/**
 * Apply visibility coloration according to the baseLine color.
 * Uses very lightweight gaussian vertical and horizontal blur filter passes.
 */
export default class VisibilityFilter extends AbstractBaseMaskFilter {
  constructor(...args) {
    super(...args);

    // Handling inner blur filters configuration
    const b = canvas.blur;
    if ( b.enabled ) {
      const resolution = PIXI.Filter.defaultResolution;
      this.#blurXFilter = new b.blurPassClass(true, b.strength, b.passes, resolution, b.kernels);
      this.#blurYFilter = new b.blurPassClass(false, b.strength, b.passes, resolution, b.kernels);
    }

    // Handling fog overlay texture matrix
    this.#overlayTex = this.uniforms.overlayTexture;
    if ( this.#overlayTex && !this.#overlayTex.uvMatrix ) {
      this.#overlayTex.uvMatrix = new PIXI.TextureMatrix(this.#overlayTex.uvMatrix, 0.0);
    }
  }

  /**
   * Horizontal inner blur filter
   * @type {AlphaBlurFilterPass}
   */
  #blurXFilter;

  /**
   * Vertical inner blur filter
   * @type {AlphaBlurFilterPass}
   */
  #blurYFilter;

  /**
   * Optional fog overlay texture
   * @type {PIXI.Texture|undefined}
   */
  #overlayTex;

  /** @override */
  static defaultUniforms = {
    exploredColor: [1, 1, 1],
    unexploredColor: [0, 0, 0],
    screenDimensions: [1, 1],
    visionTexture: null,
    primaryTexture: null,
    overlayTexture: null,
    overlayMatrix: new PIXI.Matrix(),
    hasOverlayTexture: false
  };

  /** @override */
  static create(initialUniforms={}, options={}) {
    const uniforms = {...this.defaultUniforms, ...initialUniforms};
    return new this(this.vertexShader, this.fragmentShader(options), uniforms);
  }

  static vertexShader = `
  attribute vec2 aVertexPosition;
  uniform mat3 projectionMatrix;
  uniform mat3 overlayMatrix;
  varying vec2 vTextureCoord;
  varying vec2 vMaskTextureCoord;
  varying vec2 vOverlayCoord;
  varying vec2 vOverlayTilingCoord;
  uniform vec4 inputSize;
  uniform vec4 outputFrame;
  uniform vec4 dimensions;
  uniform vec2 screenDimensions;
  uniform bool hasOverlayTexture;

  vec4 filterVertexPosition( void ) {
    vec2 position = aVertexPosition * max(outputFrame.zw, vec2(0.)) + outputFrame.xy;
    return vec4((projectionMatrix * vec3(position, 1.0)).xy, 0.0, 1.0);
  }

  vec2 filterTextureCoord( void ) {
    return aVertexPosition * (outputFrame.zw * inputSize.zw);
  }
  
  vec2 overlayTilingTextureCoord( void ) {
    if ( hasOverlayTexture ) return vOverlayCoord * (dimensions.xy / dimensions.zw);
    return vOverlayCoord;
  }
  
  // getting normalized coord for a screen sized mask render texture
  vec2 filterMaskTextureCoord( in vec2 textureCoord ) {
    return (textureCoord * inputSize.xy + outputFrame.xy) / screenDimensions;
  }

  void main(void) {
    gl_Position = filterVertexPosition();
    vTextureCoord = filterTextureCoord();
    vMaskTextureCoord = filterMaskTextureCoord(vTextureCoord);
    vOverlayCoord = (overlayMatrix * vec3(vTextureCoord, 1.0)).xy;
    vOverlayTilingCoord = overlayTilingTextureCoord();
  }`;

  /** @override */
  static fragmentShader(options) { return `
    varying vec2 vTextureCoord;
    varying vec2 vMaskTextureCoord;
    varying vec2 vOverlayCoord;
    varying vec2 vOverlayTilingCoord;
    uniform sampler2D uSampler;
    uniform sampler2D primaryTexture;
    uniform sampler2D overlayTexture;
    uniform vec3 unexploredColor;
    uniform vec3 backgroundColor;
    uniform bool hasOverlayTexture;
    ${options.persistentVision ? ``
    : `uniform sampler2D visionTexture;
     uniform vec3 exploredColor;`}
    ${this.CONSTANTS}
    ${this.PERCEIVED_BRIGHTNESS}
    
    // To check if we are out of the bound
    float getClip(in vec2 uv) {
      return step(3.5,
         step(0.0, uv.x) +
         step(0.0, uv.y) +
         step(uv.x, 1.0) +
         step(uv.y, 1.0));
    }
    
    // Unpremultiply fog texture
    vec4 unPremultiply(in vec4 pix) {
      if ( !hasOverlayTexture || (pix.a == 0.0) ) return pix;
      return vec4(pix.rgb / pix.a, pix.a);
    }
  
    void main() {
      float r = texture2D(uSampler, vTextureCoord).r;               // Revealed red channel from the filter texture
      ${options.persistentVision ? `` : `float v = texture2D(visionTexture, vMaskTextureCoord).r;`} // Vision red channel from the vision cached container
      vec4 baseColor = texture2D(primaryTexture, vMaskTextureCoord);// Primary cached container renderTexture color
      vec4 fogColor = hasOverlayTexture 
                      ? texture2D(overlayTexture, vOverlayTilingCoord) * getClip(vOverlayCoord)
                      : baseColor;      
      fogColor = unPremultiply(fogColor);
      
      // Compute fog exploration colors
      ${!options.persistentVision
    ? `float reflec = perceivedBrightness(baseColor.rgb);
      vec4 explored = vec4(min((exploredColor * reflec) + (baseColor.rgb * exploredColor), vec3(1.0)), 0.5);`
    : ``}
      vec4 unexplored = hasOverlayTexture
                        ? mix(vec4(unexploredColor, 1.0), vec4(fogColor.rgb * backgroundColor, 1.0), fogColor.a)
                        : vec4(unexploredColor, 1.0);
  
      // Mixing components to produce fog of war
      ${options.persistentVision
    ? `gl_FragColor = mix(unexplored, vec4(0.0), r);`
    : `vec4 fow = mix(unexplored, explored, max(r,v));
       gl_FragColor = mix(fow, vec4(0.0), v);`}
      
      // Output the result
      gl_FragColor.rgb *= gl_FragColor.a;
    }`
  }

  /**
   * Set the blur strength
   * @param {number} value    blur strength
   */
  set blur(value) {
    if ( this.#blurXFilter ) this.#blurXFilter.blur = this.#blurYFilter.blur = value;
  }

  get blur() {
    return this.#blurYFilter?.blur;
  }

  /** @override */
  apply(filterManager, input, output, clear) {
    this.calculateMatrix(filterManager);
    if ( canvas.blur.enabled ) {
      // Get temporary filter textures
      const firstRenderTarget = filterManager.getFilterTexture();
      // Apply inner filters
      this.state.blend = false;
      this.#blurXFilter.apply(filterManager, input, firstRenderTarget, PIXI.CLEAR_MODES.NONE);
      this.#blurYFilter.apply(filterManager, firstRenderTarget, input, PIXI.CLEAR_MODES.NONE);
      this.state.blend = true;
      // Inform PIXI that temporary filter textures are not more necessary
      filterManager.returnFilterTexture(firstRenderTarget);
    }
    // Apply visibility
    super.apply(filterManager, input, output, clear);
  }

  /**
   * Calculate the fog overlay sprite matrix.
   * @param {PIXI.FilterSystem} filterManager
   */
  calculateMatrix(filterManager) {
    if ( !this.uniforms.hasOverlayTexture || !this.#overlayTex ) return;
    if ( this.#overlayTex && !this.#overlayTex.uvMatrix ) {
      this.#overlayTex.uvMatrix = new PIXI.TextureMatrix(this.#overlayTex.uvMatrix, 0.0);
    }
    this.#overlayTex.uvMatrix.update();
    const mat = filterManager.calculateSpriteMatrix(this.uniforms.overlayMatrix, canvas.visibility.visibilityOverlay);
    this.uniforms.overlayMatrix = mat.prepend(this.#overlayTex.uvMatrix.mapCoord);
  }
}

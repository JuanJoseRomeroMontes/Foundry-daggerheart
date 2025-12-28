/**
 * @import SpriteMesh from "../elements/sprite-mesh.mjs";
 */

/**
 * A special type of PIXI.Container which draws its contents to a cached RenderTexture.
 * This is accomplished by overriding the Container#render method to draw to our own special RenderTexture.
 */
export default class CachedContainer extends PIXI.Container {
  /**
   * Construct a CachedContainer.
   * @param {PIXI.Sprite|SpriteMesh} [sprite]  A specific sprite to bind to this CachedContainer and its renderTexture.
   */
  constructor(sprite) {
    super();
    const renderer = canvas.app?.renderer;

    /**
     * The RenderTexture that is the render destination for the contents of this Container
     * @type {PIXI.RenderTexture}
     */
    this.#renderTexture = this.createRenderTexture();

    // Bind a sprite to the container
    if ( sprite ) this.sprite = sprite;

    // Listen for resize events
    this.#onResize = this.#resize.bind(this, renderer);
    renderer.on("resize", this.#onResize);
  }

  /**
   * The texture configuration to use for this cached container
   * @type {{multisample: PIXI.MSAA_QUALITY, scaleMode: PIXI.SCALE_MODES, format: PIXI.FORMATS, mipmap: PIXI.MIPMAP_MODES}}
   * @abstract
   */
  static textureConfiguration = {};

  /**
   * A bound resize function which fires on the renderer resize event.
   * @type {function(PIXI.Renderer)}
   */
  #onResize;

  /**
   * A map of render textures, linked to their render function and an optional RGBA clear color.
   * @type {Map<PIXI.RenderTexture,{renderFunction: Function, clearColor: number[]}>}
   * @protected
   */
  _renderPaths = new Map();

  /**
   * An object which stores a reference to the normal renderer target and source frame.
   * We track this so we can restore them after rendering our cached texture.
   * @type {{sourceFrame: PIXI.Rectangle, renderTexture: PIXI.RenderTexture}}
   */
  #backup = {
    renderTexture: undefined,
    sourceFrame: canvas.app.renderer.screen.clone()
  };

  /**
   * An RGBA array used to define the clear color of the RenderTexture
   * @type {number[]}
   */
  clearColor = [0, 0, 0, 1];

  /**
   * Should our Container also be displayed on screen, in addition to being drawn to the cached RenderTexture?
   * @type {boolean}
   */
  displayed = false;

  /**
   * If true, the Container is rendered every frame.
   * If false, the Container is rendered only if {@link CachedContainer#renderDirty} is true.
   * @type {boolean}
   */
  autoRender = true;

  /**
   * Does the Container need to be rendered?
   * Set to false after the Container is rendered.
   * @type {boolean}
   */
  renderDirty = true;

  /* ---------------------------------------- */

  /**
   * The primary render texture bound to this cached container.
   * @type {PIXI.RenderTexture}
   */
  get renderTexture() {
    return this.#renderTexture;
  }

  #renderTexture;

  /* ---------------------------------------- */

  /**
   * Set the alpha mode of the cached container render texture.
   * @param {PIXI.ALPHA_MODES} mode
   */
  set alphaMode(mode) {
    this.#renderTexture.baseTexture.alphaMode = mode;
    this.#renderTexture.baseTexture.update();
  }

  /* ---------------------------------------- */

  /**
   * A PIXI.Sprite or SpriteMesh which is bound to this CachedContainer.
   * The RenderTexture from this Container is associated with the Sprite which is automatically rendered.
   * @type {PIXI.Sprite|SpriteMesh}
   */
  get sprite() {
    return this.#sprite;
  }

  set sprite(sprite) {
    if ( sprite instanceof PIXI.Sprite || sprite instanceof foundry.canvas.containers.SpriteMesh ) {
      sprite.texture = this.renderTexture;
      this.#sprite = sprite;
    }
    else if ( sprite ) {
      throw new Error("You may only bind a PIXI.Sprite or a SpriteMesh as the render target for a CachedContainer.");
    }
  }

  #sprite;

  /* ---------------------------------------- */

  /**
   * Create a render texture, provide a render method and an optional clear color.
   * @param {object} [options={}]                 Optional parameters.
   * @param {Function} [options.renderFunction]   Render function that will be called to render into the RT.
   * @param {number[]} [options.clearColor]       An optional clear color to clear the RT before rendering into it.
   * @returns {PIXI.RenderTexture}              A reference to the created render texture.
   */
  createRenderTexture({renderFunction, clearColor}={}) {
    const renderOptions = {};
    const renderer = canvas.app.renderer;
    const conf = this.constructor.textureConfiguration;
    const pm = canvas.performance.mode;

    // Disabling linear filtering by default for low/medium performance mode
    const defaultScaleMode = (pm > CONST.CANVAS_PERFORMANCE_MODES.MED)
      ? PIXI.SCALE_MODES.LINEAR
      : PIXI.SCALE_MODES.NEAREST;

    // Creating the render texture
    const renderTexture = PIXI.RenderTexture.create({
      width: renderer.screen.width,
      height: renderer.screen.height,
      resolution: renderer.resolution,
      multisample: conf.multisample ?? renderer.multisample,
      scaleMode: conf.scaleMode ?? defaultScaleMode,
      format: conf.format ?? PIXI.FORMATS.RGBA
    });
    renderOptions.renderFunction = renderFunction;            // Binding the render function
    renderOptions.clearColor = clearColor;                    // Saving the optional clear color
    this._renderPaths.set(renderTexture, renderOptions);      // Push into the render paths
    this.renderDirty = true;

    // Return a reference to the render texture
    return renderTexture;
  }

  /* ---------------------------------------- */

  /**
   * Remove a previously created render texture.
   * @param {PIXI.RenderTexture} renderTexture   The render texture to remove.
   * @param {boolean} [destroy=true]             Should the render texture be destroyed?
   */
  removeRenderTexture(renderTexture, destroy=true) {
    this._renderPaths.delete(renderTexture);
    if ( destroy ) renderTexture?.destroy(true);
    this.renderDirty = true;
  }

  /* ---------------------------------------- */

  /**
   * Clear the cached container, removing its current contents.
   * @param {boolean} [destroy=true]    Tell children that we should destroy texture as well.
   * @returns {this}         A reference to the cleared container for chaining.
   */
  clear(destroy=true) {
    foundry.canvas.Canvas.clearContainer(this, destroy);
    return this;
  }

  /* ---------------------------------------- */

  /** @inheritdoc */
  destroy(options) {
    if ( this.#onResize ) canvas.app.renderer.off("resize", this.#onResize);
    for ( const [rt] of this._renderPaths ) rt?.destroy(true);
    this._renderPaths.clear();
    super.destroy(options);
  }

  /* ---------------------------------------- */

  /** @inheritdoc */
  render(renderer) {
    if ( !this.renderable ) return;                           // Skip updating the cached texture
    if ( this.autoRender || this.renderDirty ) {
      this.renderDirty = false;
      this.#bindPrimaryBuffer(renderer);                      // Bind the primary buffer (RT)
      super.render(renderer);                                 // Draw into the primary buffer
      this.#renderSecondary(renderer);                        // Draw into the secondary buffer(s)
      this.#bindOriginalBuffer(renderer);                     // Restore the original buffer
    }
    this.#sprite?.render(renderer);                           // Render the bound sprite
    if ( this.displayed ) super.render(renderer);             // Optionally draw to the screen
  }

  /* ---------------------------------------- */

  /**
   * Custom rendering for secondary render textures
   * @param {PIXI.Renderer} renderer    The active canvas renderer.
   * @protected
   */
  #renderSecondary(renderer) {
    if ( this._renderPaths.size <= 1 ) return;
    // Bind the render texture and call the custom render method for each render path
    for ( const [rt, ro] of this._renderPaths ) {
      if ( !ro.renderFunction ) continue;
      this.#bind(renderer, rt, ro.clearColor);
      ro.renderFunction.call(this, renderer);
    }
  }

  /* ---------------------------------------- */

  /**
   * Bind the primary render texture to the renderer, replacing and saving the original buffer and source frame.
   * @param {PIXI.Renderer} renderer      The active canvas renderer.
   */
  #bindPrimaryBuffer(renderer) {

    // Get the RenderTexture to bind
    const tex = this.renderTexture;
    const rt = renderer.renderTexture;

    // Backup the current render target
    this.#backup.renderTexture = rt.current;
    this.#backup.sourceFrame.copyFrom(rt.sourceFrame);

    // Bind the render texture
    this.#bind(renderer, tex);
  }

  /* ---------------------------------------- */

  /**
   * Bind a render texture to this renderer.
   * Must be called after bindPrimaryBuffer and before bindInitialBuffer.
   * @param {PIXI.Renderer} renderer     The active canvas renderer.
   * @param {PIXI.RenderTexture} tex     The texture to bind.
   * @param {number[]} [clearColor]      A custom clear color.
   * @protected
   */
  #bind(renderer, tex, clearColor) {
    const rt = renderer.renderTexture;

    // Bind our texture to the renderer
    renderer.batch.flush();
    rt.bind(tex, undefined, undefined);
    rt.clear(clearColor ?? this.clearColor);

    // Enable Filters which are applied to this Container to apply to our cached RenderTexture
    const fs = renderer.filter.defaultFilterStack;
    if ( fs.length > 1 ) {
      fs[fs.length - 1].renderTexture = tex;
    }
  }

  /* ---------------------------------------- */

  /**
   * Remove the render texture from the Renderer, re-binding the original buffer.
   * @param {PIXI.Renderer} renderer      The active canvas renderer.
   */
  #bindOriginalBuffer(renderer) {
    renderer.batch.flush();

    // Restore Filters to apply to the original RenderTexture
    const fs = renderer.filter.defaultFilterStack;
    if ( fs.length > 1 ) {
      fs[fs.length - 1].renderTexture = this.#backup.renderTexture;
    }

    // Re-bind the original RenderTexture to the renderer
    renderer.renderTexture.bind(this.#backup.renderTexture, this.#backup.sourceFrame, undefined);
    this.#backup.renderTexture = undefined;
  }

  /* ---------------------------------------- */

  /**
   * Resize bound render texture(s) when the dimensions or resolution of the Renderer have changed.
   * @param {PIXI.Renderer} renderer      The active canvas renderer.
   */
  #resize(renderer) {
    for ( const [rt] of this._renderPaths ) CachedContainer.resizeRenderTexture(renderer, rt);
    if ( this.#sprite ) this.#sprite._boundsID++; // Inform PIXI that bounds need to be recomputed for this sprite mesh
    this.renderDirty = true;
  }

  /* ---------------------------------------- */

  /**
   * Resize a render texture passed as a parameter with the renderer.
   * @param {PIXI.Renderer} renderer    The active canvas renderer.
   * @param {PIXI.RenderTexture} rt     The render texture to resize.
   */
  static resizeRenderTexture(renderer, rt) {
    const screen = renderer?.screen;
    if ( !rt || !screen ) return;
    if ( rt.baseTexture.resolution !== renderer.resolution ) rt.baseTexture.resolution = renderer.resolution;
    if ( (rt.width !== screen.width) || (rt.height !== screen.height) ) rt.resize(screen.width, screen.height);
  }
}

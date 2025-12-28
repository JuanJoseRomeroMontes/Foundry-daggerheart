import CachedContainer from "./containers/advanced/cached-container.mjs";

/**
 * Provide the necessary methods to get a snapshot of the framebuffer into a render texture.
 * Class meant to be used as a singleton.
 * Created with the precious advices of dev7355608.
 */
export default class FramebufferSnapshot {
  constructor() {
    /**
     * The RenderTexture that is the render destination for the framebuffer snapshot.
     * @type {PIXI.RenderTexture}
     */
    this.framebufferTexture = FramebufferSnapshot.#createRenderTexture();

    // Listen for resize events
    canvas.app.renderer.on("resize", () => this.#hasResized = true);
  }

  /**
   * To know if we need to update the texture.
   * @type {boolean}
   */
  #hasResized = true;

  /**
   * A placeholder for temporary copy.
   * @type {PIXI.Rectangle}
   */
  #tempSourceFrame = new PIXI.Rectangle();

  /* ---------------------------------------- */

  /**
   * Get the framebuffer texture snapshot.
   * @param {PIXI.Renderer} renderer    The renderer for this context.
   * @returns {PIXI.RenderTexture}      The framebuffer snapshot.
   */
  getFramebufferTexture(renderer) {
    // Need resize?
    if ( this.#hasResized ) {
      CachedContainer.resizeRenderTexture(renderer, this.framebufferTexture);
      this.#hasResized = false;
    }

    // Flush batched operations before anything else
    renderer.batch.flush();

    const fb = renderer.framebuffer.current;
    const vf = this.#tempSourceFrame.copyFrom(renderer.renderTexture.viewportFrame);

    // Inverted Y in the case of canvas
    if ( !fb ) vf.y = renderer.view.height - (vf.y + vf.height);

    // Empty viewport
    if ( !(vf.width > 0 && vf.height > 0) ) return PIXI.Texture.WHITE;

    // Computing bounds of the source
    let srcX = vf.x;
    let srcY = vf.y;
    let srcX2 = srcX + vf.width;
    let srcY2 = srcY + vf.height;

    // Inverted Y in the case of canvas
    if ( !fb ) {
      srcY = renderer.view.height - 1 - srcY;
      srcY2 = srcY - vf.height;
    }

    // Computing bounds of the destination
    let dstX = 0;
    let dstY = 0;
    let dstX2 = vf.width;
    let dstY2 = vf.height;

    // Preparing the gl context
    const gl = renderer.gl;
    const framebufferSys = renderer.framebuffer;
    const currentFramebuffer = framebufferSys.current;

    // Binding our render texture to the framebuffer
    framebufferSys.bind(this.framebufferTexture.framebuffer, framebufferSys.viewport);
    // Current framebuffer is binded as a read framebuffer (to prepare the blit)
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fb?.glFramebuffers[framebufferSys.CONTEXT_UID].framebuffer);
    // Blit current framebuffer into our render texture
    gl.blitFramebuffer(srcX, srcY, srcX2, srcY2, dstX, dstY, dstX2, dstY2, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    // Restore original behavior
    framebufferSys.bind(currentFramebuffer, framebufferSys.viewport);

    return this.framebufferTexture;
  }

  /* ---------------------------------------- */

  /**
   * Create a render texture, provide a render method and an optional clear color.
   * @returns {PIXI.RenderTexture}              A reference to the created render texture.
   */
  static #createRenderTexture() {
    const renderer = canvas.app?.renderer;
    return PIXI.RenderTexture.create({
      width: renderer?.screen.width ?? window.innerWidth,
      height: renderer?.screen.height ?? window.innerHeight,
      resolution: renderer.resolution ?? PIXI.settings.RESOLUTION
    });
  }
}

import CachedContainer from "../../containers/advanced/cached-container.mjs";

/**
 * @import {CanvasVisionContainerSight} from "../_types.mjs"
 * @import {CanvasVisionContainerLight} from "../_types.mjs"
 * @import {CanvasVisionContainerDarkness} from "../_types.mjs"
 * @import {CanvasVisionContainer} from "../_types.mjs"
 */

/**
 * The vision mask which contains the current line-of-sight texture.
 * @category Canvas
 */
export default class CanvasVisionMask extends CachedContainer {

  /** @override */
  static textureConfiguration = {
    scaleMode: PIXI.SCALE_MODES.NEAREST,
    format: PIXI.FORMATS.RED,
    multisample: PIXI.MSAA_QUALITY.NONE
  };

  /** @override */
  clearColor = [0, 0, 0, 0];

  /** @override */
  autoRender = false;

  /**
   * The current vision Container.
   * @type {CanvasVisionContainer}
   */
  vision;

  /**
   * The BlurFilter which applies to the vision mask texture.
   * This filter applies a NORMAL blend mode to the container.
   * @type {AlphaBlurFilter}
   */
  blurFilter;

  /* -------------------------------------------- */

  /**
   * Create the BlurFilter for the VisionMask container.
   * @returns {AlphaBlurFilter}
   */
  #createBlurFilter() {
    // Initialize filters properties
    this.filters ??= [];
    this.filterArea = null;

    // Check if the canvas blur is disabled and return without doing anything if necessary
    const b = canvas.blur;
    this.filters.findSplice(f => f === this.blurFilter);
    if ( !b.enabled ) return;

    // Create the new filter
    const f = this.blurFilter = new b.blurClass(b.strength, b.passes, PIXI.Filter.defaultResolution, b.kernels);
    f.blendMode = PIXI.BLEND_MODES.NORMAL;
    this.filterArea = canvas.app.renderer.screen;
    this.filters.push(f);
    return canvas.addBlurFilter(this.blurFilter);
  }

  /* -------------------------------------------- */

  async draw() {
    this.#createBlurFilter();
  }

  /* -------------------------------------------- */

  /**
   * Initialize the vision mask with the los and the fov graphics objects.
   * @param {PIXI.Container} vision         The vision container to attach
   * @returns {CanvasVisionContainer}
   */
  attachVision(vision) {
    return this.vision = this.addChild(vision);
  }

  /* -------------------------------------------- */

  /**
   * Detach the vision mask from the cached container.
   * @returns {CanvasVisionContainer} The detached vision container.
   */
  detachVision() {
    const vision = this.vision;
    this.removeChild(vision);
    this.vision = undefined;
    return vision;
  }
}

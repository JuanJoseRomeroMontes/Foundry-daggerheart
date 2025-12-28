import CanvasLayer from "../base/canvas-layer.mjs";
import VoidFilter from "../../rendering/filters/void.mjs";

/**
 * A layer of background alteration effects which change the appearance of the primary group render texture.
 * @category Canvas
 */
export default class CanvasBackgroundAlterationEffects extends CanvasLayer {
  constructor() {
    super();

    /**
     * A collection of effects which provide background vision alterations.
     * @type {PIXI.Container}
     */
    this.vision = this.addChild(new PIXI.Container());
    this.vision.sortableChildren = true;

    /**
     * A collection of effects which provide background preferred vision alterations.
     * @type {PIXI.Container}
     */
    this.visionPreferred = this.addChild(new PIXI.Container());
    this.visionPreferred.sortableChildren = true;

    /**
     * A collection of effects which provide other background alterations.
     * @type {PIXI.Container}
     */
    this.lighting = this.addChild(new PIXI.Container());
    this.lighting.sortableChildren = true;
  }

  /* -------------------------------------------- */

  /** @override */
  async _draw(options) {

    // Add the background vision filter
    const vf = this.vision.filter = new VoidFilter();
    vf.blendMode = PIXI.BLEND_MODES.NORMAL;
    vf.enabled = false;
    this.vision.filters = [vf];
    this.vision.filterArea = canvas.app.renderer.screen;

    // Add the background preferred vision filter
    const vpf = this.visionPreferred.filter = new VoidFilter();
    vpf.blendMode = PIXI.BLEND_MODES.NORMAL;
    vpf.enabled = false;
    this.visionPreferred.filters = [vpf];
    this.visionPreferred.filterArea = canvas.app.renderer.screen;

    // Add the background lighting filter
    const maskingFilter = CONFIG.Canvas.visualEffectsMaskingFilter;
    const lf = this.lighting.filter = maskingFilter.create({
      visionTexture: canvas.masks.vision.renderTexture,
      darknessLevelTexture: canvas.effects.illumination.renderTexture,
      mode: maskingFilter.FILTER_MODES.BACKGROUND
    });
    lf.blendMode = PIXI.BLEND_MODES.NORMAL;
    this.lighting.filters = [lf];
    this.lighting.filterArea = canvas.app.renderer.screen;
    canvas.effects.visualEffectsMaskingFilters.add(lf);
  }

  /* -------------------------------------------- */

  /** @override */
  async _tearDown(options) {
    canvas.effects.visualEffectsMaskingFilters.delete(this.lighting?.filter);
    this.clear();
  }

  /* -------------------------------------------- */

  /**
   * Clear background alteration effects vision and lighting containers
   */
  clear() {
    this.vision.removeChildren();
    this.visionPreferred.removeChildren();
    this.lighting.removeChildren();
  }
}

import CanvasLayer from "../base/canvas-layer.mjs";

/**
 * A CanvasLayer for displaying coloration visual effects
 * @category Canvas
 */
export default class CanvasColorationEffects extends CanvasLayer {
  constructor() {
    super();
    this.sortableChildren = true;
    this.#background = this.addChild(new PIXI.LegacyGraphics());
    this.#background.zIndex = -Infinity;
  }

  /**
   * Temporary solution for the "white scene" bug (foundryvtt/foundryvtt#9957).
   * @type {PIXI.LegacyGraphics}
   */
  #background;

  /**
   * The filter used to mask visual effects on this layer
   * @type {VisualEffectsMaskingFilter}
   */
  filter;

  /* -------------------------------------------- */

  /**
   * Clear coloration effects container
   */
  clear() {
    this.removeChildren();
    this.addChild(this.#background);
  }

  /* -------------------------------------------- */

  /** @override */
  async _draw(options) {
    const maskingFilter = CONFIG.Canvas.visualEffectsMaskingFilter;
    this.filter = maskingFilter.create({
      visionTexture: canvas.masks.vision.renderTexture,
      darknessLevelTexture: canvas.effects.illumination.renderTexture,
      mode: maskingFilter.FILTER_MODES.COLORATION
    });
    this.filter.blendMode = PIXI.BLEND_MODES.ADD;
    this.filterArea = canvas.app.renderer.screen;
    this.filters = [this.filter];
    canvas.effects.visualEffectsMaskingFilters.add(this.filter);
    this.#background.clear().beginFill().drawShape(canvas.dimensions.rect).endFill();
  }

  /* -------------------------------------------- */

  /** @override */
  async _tearDown(options) {
    canvas.effects.visualEffectsMaskingFilters.delete(this.filter);
    this.#background.clear();
  }
}

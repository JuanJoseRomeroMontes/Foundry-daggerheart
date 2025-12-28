import Color from "@common/utils/color.mjs";

/**
 * An extension of the default PIXI.Text object which forces double resolution.
 * At default resolution Text often looks blurry or fuzzy.
 */
export default class PreciseText extends PIXI.Text {
  constructor(...args) {
    super(...args);
    this._autoResolution = false;
    this._resolution = 2;
  }

  /**
   * Prepare a TextStyle object which merges the canvas defaults with user-provided options
   * @param {object} [options={}]   Additional options merged with the default TextStyle
   * @param {number} [options.anchor]       A text anchor point from CONST.TEXT_ANCHOR_POINTS
   * @returns {PIXI.TextStyle}      The prepared TextStyle
   */
  static getTextStyle({anchor, ...options}={}) {
    const style = CONFIG.canvasTextStyle.clone();
    for ( const [k, v] of Object.entries(options) ) {
      if ( v !== undefined ) style[k] = v;
    }

    // Positioning
    if ( !("align" in options) ) {
      if ( anchor === CONST.TEXT_ANCHOR_POINTS.LEFT ) style.align = "right";
      else if ( anchor === CONST.TEXT_ANCHOR_POINTS.RIGHT ) style.align = "left";
    }

    // Adaptive Stroke
    if ( !("stroke" in options) ) {
      const fill = Color.from(style.fill);
      style.stroke = fill.hsv[2] > 0.6 ? 0x000000 : 0xFFFFFF;
    }
    return style;
  }
}

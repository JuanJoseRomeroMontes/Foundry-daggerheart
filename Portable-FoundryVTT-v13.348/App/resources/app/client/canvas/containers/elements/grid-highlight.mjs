/**
 * A special Graphics class which handles Grid layer highlighting
 * @extends {PIXI.Graphics}
 */
export default class GridHighlight extends PIXI.smooth.SmoothGraphics {
  constructor(name, ...args) {
    super(...args);

    /**
     * Track the Grid Highlight name
     * @type {string}
     */
    this.name = name;

    /**
     * Track distinct positions which have already been highlighted
     * @type {Set}
     */
    this.positions = new Set();
  }

  /* -------------------------------------------- */

  /**
   * Record a position that is highlighted and return whether or not it should be rendered
   * @param {number} x    The x-coordinate to highlight
   * @param {number} y    The y-coordinate to highlight
   * @return {boolean}    Whether or not to draw the highlight for this location
   */
  highlight(x, y) {
    let key = `${x},${y}`;
    if ( this.positions.has(key) ) return false;
    this.positions.add(key);
    return true;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  clear() {
    this.positions = new Set();
    return super.clear();
  }


  /* -------------------------------------------- */

  /** @inheritdoc */
  destroy(...args) {
    delete canvas.interface.grid.highlightLayers[this.name];
    return super.destroy(...args);
  }
}

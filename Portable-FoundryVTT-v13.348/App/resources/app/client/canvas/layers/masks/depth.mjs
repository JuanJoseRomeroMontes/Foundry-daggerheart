import CachedContainer from "../../containers/advanced/cached-container.mjs";
import Canvas from "../../board.mjs";

/**
 * The depth mask which contains a mapping of elevation. Needed to know if we must render objects according to depth.
 * Red channel: Lighting occlusion (top).
 * Green channel: Lighting occlusion (bottom).
 * Blue channel: Weather occlusion.
 * @category Canvas
 */
export default class CanvasDepthMask extends CachedContainer {
  constructor(...args) {
    super(...args);
    this.#createDepth();
  }

  /**
   * Container in which roofs are rendered with depth data.
   * @type {PIXI.Container}
   */
  roofs;

  /** @override */
  static textureConfiguration = {
    scaleMode: PIXI.SCALE_MODES.NEAREST,
    format: PIXI.FORMATS.RGB,
    multisample: PIXI.MSAA_QUALITY.NONE
  };

  /** @override */
  clearColor = [0, 0, 0, 0];

  /**
   * Update the elevation-to-depth mapping?
   * @type {boolean}
   * @internal
   */
  _elevationDirty = false;

  /**
   * The elevations of the elevation-to-depth mapping.
   * Supported are up to 255 unique elevations.
   * @type {Float64Array}
   */
  #elevations = new Float64Array([-Infinity]);

  /* -------------------------------------------- */

  /**
   * Map an elevation to a value in the range [0, 1] with 8-bit precision.
   * The depth-rendered object are rendered with these values into the render texture.
   * @param {number} elevation    The elevation in distance units
   * @returns {number}            The value for this elevation in the range [0, 1] with 8-bit precision
   */
  mapElevation(elevation) {
    const E = this.#elevations;
    if ( elevation < E[0] ) return 0;
    let i = 0;
    let j = E.length - 1;
    while ( i < j ) {
      const k = (i + j + 1) >> 1;
      const e = E[k];
      if ( e <= elevation ) i = k;
      else j = k - 1;
    }
    return (i + 1) / 255;
  }

  /* -------------------------------------------- */

  /**
   * Update the elevation-to-depth mapping.
   * Needs to be called after the children have been sorted
   * and the canvas transform phase.
   * @internal
   */
  _update() {
    if ( !this._elevationDirty ) return;
    this._elevationDirty = false;
    const elevations = [];
    const children = canvas.primary.children;
    for ( let i = 0, n = children.length; i < n; i++ ) {
      const child = children[i];
      if ( !child.shouldRenderDepth ) continue;
      const elevation = child.elevation;
      if ( elevation === elevations.at(-1) ) continue;
      elevations.push(elevation);
    }
    if ( !elevations.length ) elevations.push(-Infinity);
    else elevations.length = Math.min(elevations.length, 255);
    this.#elevations = new Float64Array(elevations);
  }

  /* -------------------------------------------- */

  /**
   * Initialize the depth mask with the roofs container and token graphics.
   */
  #createDepth() {
    this.roofs = this.addChild(this.#createRoofsContainer());
  }

  /* -------------------------------------------- */

  /**
   * Create the roofs container.
   * @returns {PIXI.Container}
   */
  #createRoofsContainer() {
    const c = new PIXI.Container();
    const render = renderer => {
      // Render the depth of each primary canvas object
      for ( const pco of canvas.primary.children ) {
        pco.renderDepthData?.(renderer);
      }
    };
    c.render = render.bind(c);
    return c;
  }

  /* -------------------------------------------- */

  /**
   * Clear the depth mask.
   * @override
   */
  clear() {
    Canvas.clearContainer(this.roofs, false);
    return this;
  }
}

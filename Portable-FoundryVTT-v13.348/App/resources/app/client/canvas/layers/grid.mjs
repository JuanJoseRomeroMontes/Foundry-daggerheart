import {GridHighlight, GridMesh} from "../containers/_module.mjs";
import Ray from "../geometry/shapes/ray.mjs";
import {GridShader} from "../rendering/shaders/_module.mjs";
import CanvasLayer from "./base/canvas-layer.mjs";

/**
 * A CanvasLayer responsible for drawing a square grid
 */
export default class GridLayer extends CanvasLayer {

  /**
   * The grid mesh.
   * @type {GridMesh}
   */
  mesh;

  /**
   * The Grid Highlight container
   * @type {PIXI.Container}
   */
  highlight;

  /**
   * Map named highlight layers
   * @type {Record<string, GridHighlight>}
   */
  highlightLayers = {};

  /* -------------------------------------------- */

  /** @inheritdoc */
  static get layerOptions() {
    return foundry.utils.mergeObject(super.layerOptions, {name: "grid"});
  }

  /* -------------------------------------------- */

  /** @override */
  static get instance() {
    return canvas.interface.grid;
  }

  /* -------------------------------------------- */

  /** @override */
  async _draw(options) {
    // Draw the highlight layer
    this.highlightLayers = {};
    this.highlight = this.addChild(new PIXI.Container());
    this.highlight.sortableChildren = true;

    // Draw the grid
    this.mesh = this.addChild(await this._drawMesh());
    // Initialize the mesh appeareance
    this.initializeMesh(canvas.grid);
  }

  /* -------------------------------------------- */

  /**
   * Creates the grid mesh.
   * @returns {Promise<GridMesh>}
   * @protected
   */
  async _drawMesh() {
    return new GridMesh().initialize({
      type: canvas.grid.type,
      width: canvas.dimensions.width,
      height: canvas.dimensions.height,
      size: canvas.dimensions.size
    });
  }

  /* -------------------------------------------- */

  /**
   * Initialize the grid mesh appearance and configure the grid shader.
   * @param {object} options
   * @param {string} [options.style]         The grid style
   * @param {number} [options.thickness]     The grid thickness
   * @param {string} [options.color]         The grid color
   * @param {number} [options.alpha]         The grid alpha
   */
  initializeMesh({style, thickness, color, alpha}={}) {
    const {shaderClass, shaderOptions} = CONFIG.Canvas.gridStyles[style] ?? {};
    this.mesh.initialize({thickness, color, alpha});
    this.mesh.setShaderClass(shaderClass ?? GridShader);
    this.mesh.shader.configure(shaderOptions ?? {});
  }

  /* -------------------------------------------- */
  /*  Grid Highlighting Methods
  /* -------------------------------------------- */

  /**
   * Define a new Highlight graphic
   * @param {string} name     The name for the referenced highlight layer
   */
  addHighlightLayer(name) {
    const layer = this.highlightLayers[name];
    if ( !layer || layer._destroyed ) {
      this.highlightLayers[name] = this.highlight.addChild(new GridHighlight(name));
    }
    return this.highlightLayers[name];
  }

  /* -------------------------------------------- */

  /**
   * Clear a specific Highlight graphic
   * @param {string} name     The name for the referenced highlight layer
   */
  clearHighlightLayer(name) {
    const layer = this.highlightLayers[name];
    if ( layer ) layer.clear();
  }

  /* -------------------------------------------- */

  /**
   * Destroy a specific Highlight graphic
   * @param {string} name     The name for the referenced highlight layer
   */
  destroyHighlightLayer(name) {
    const layer = this.highlightLayers[name];
    if ( layer ) {
      this.highlight.removeChild(layer);
      layer.destroy();
    }
  }

  /* -------------------------------------------- */

  /**
   * Obtain the highlight layer graphic by name
   * @param {string} name     The name for the referenced highlight layer
   */
  getHighlightLayer(name) {
    return this.highlightLayers[name];
  }

  /* -------------------------------------------- */

  /**
   * Add highlighting for a specific grid position to a named highlight graphic
   * @param {string} name                        The name for the referenced highlight layer
   * @param {object} options
   *                               - If gridless you need to pass `shape` but not `x` and `y`.
   *                               - If not gridless you need to pass `x` and `y`, but not `shape`.
   * @param {number} [options.x]                 The x-coordinate of the highlighted position
   * @param {number} [options.y]                 The y-coordinate of the highlighted position
   * @param {PIXI.ColorSource} [options.color=0x33BBFF]    The fill color of the highlight
   * @param {PIXI.ColorSource|null} [options.border=null]  The border color of the highlight
   * @param {number} [options.alpha=0.25]        The opacity of the highlight
   * @param {PIXI.Polygon} [options.shape=null]  A predefined shape to highlight
   */
  highlightPosition(name, {x, y, color=0x33BBFF, border=null, alpha=0.25, shape=null}) {
    const layer = this.highlightLayers[name];
    if ( !layer ) return;
    const grid = canvas.grid;
    if ( grid.type !== CONST.GRID_TYPES.GRIDLESS ) {
      if ( !layer.highlight(x, y) ) return;
      const cx = x + (grid.sizeX / 2);
      const cy = y + (grid.sizeY / 2);
      const points = grid.getShape();
      for ( const point of points ) {
        point.x += cx;
        point.y += cy;
      }
      shape = new PIXI.Polygon(points);
    } else if ( !shape ) return;
    layer.beginFill(color, alpha);
    if ( border !== null ) layer.lineStyle(canvas.grid.thickness, border, Math.min(alpha * 1.5, 1.0));
    layer.drawShape(shape).endFill();
  }

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  get type() {
    const msg = "GridLayer#type is deprecated. Use canvas.grid.type instead.";
    foundry.utils.logCompatibilityWarning(msg, {since: 12, until: 14, once: true});
    return canvas.grid.type;
  }

  /* -------------------------------------------- */


  /**
   * @deprecated since v12
   * @ignore
   */
  get size() {
    const msg = "GridLayer#size is deprecated. Use canvas.grid.size instead.";
    foundry.utils.logCompatibilityWarning(msg, {since: 12, until: 14, once: true});
    return canvas.grid.size;
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  get grid() {
    const msg = "GridLayer#grid is deprecated. Use canvas.grid instead.";
    foundry.utils.logCompatibilityWarning(msg, {since: 12, until: 14, once: true});
    return canvas.grid;
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  isNeighbor(r0, c0, r1, c1) {
    const msg = "GridLayer#isNeighbor is deprecated. Use canvas.grid.testAdjacency instead.";
    foundry.utils.logCompatibilityWarning(msg, {since: 12, until: 14, once: true});
    return canvas.grid.testAdjacency({i: r0, j: c0}, {i: r1, j: c1});
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  get w() {
    const msg = "GridLayer#w is deprecated in favor of canvas.grid.sizeX.";
    foundry.utils.logCompatibilityWarning(msg, {since: 12, until: 14, once: true});
    return canvas.grid.sizeX;
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  get h() {
    const msg = "GridLayer#h is deprecated in favor of canvas.grid.sizeY.";
    foundry.utils.logCompatibilityWarning(msg, {since: 12, until: 14, once: true});
    return canvas.grid.sizeY;
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  get isHex() {
    const msg = "GridLayer#isHex is deprecated. Use canvas.grid.isHexagonal instead.";
    foundry.utils.logCompatibilityWarning(msg, {since: 12, until: 14, once: true});
    return canvas.grid.isHexagonal;
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  getTopLeft(x, y) {
    const msg = "GridLayer#getTopLeft is deprecated. Use canvas.grid.getTopLeftPoint instead.";
    foundry.utils.logCompatibilityWarning(msg, {since: 12, until: 14, once: true});
    return canvas.grid.getTopLeft(x, y);
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  getCenter(x, y) {
    const msg = "GridLayer#getCenter is deprecated. Use canvas.grid.getCenterPoint instead.";
    foundry.utils.logCompatibilityWarning(msg, {since: 12, until: 14, once: true});
    return canvas.grid.getCenter(x, y);
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  getSnappedPosition(x, y, interval=1, options={}) {
    const msg = "GridLayer#getSnappedPosition is deprecated. Use canvas.grid.getSnappedPoint instead.";
    foundry.utils.logCompatibilityWarning(msg, {since: 12, until: 14, once: true});
    if ( interval === 0 ) return {x: Math.round(x), y: Math.round(y)};
    return canvas.grid.getSnappedPosition(x, y, interval, options);
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  measureDistance(origin, target, options={}) {
    const msg = "GridLayer#measureDistance is deprecated. "
      + "Use canvas.grid.measurePath instead, which returns grid distance (gridSpaces: true) and Euclidean distance (gridSpaces: false).";
    foundry.utils.logCompatibilityWarning(msg, {since: 12, until: 14, once: true});
    const ray = new Ray(origin, target);
    const segments = [{ray}];
    return canvas.grid.measureDistances(segments, options)[0];
  }
}

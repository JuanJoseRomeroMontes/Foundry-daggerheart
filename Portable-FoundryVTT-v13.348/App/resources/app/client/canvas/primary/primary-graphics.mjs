import PrimaryCanvasObjectMixin from "./primary-canvas-object.mjs";

/**
 * A basic PCO which is handling drawings of any shape.
 * @extends {PIXI.smooth.SmoothGraphics}
 * @mixes PrimaryCanvasObject
 *
 * @param {object} [options]                               A config object
 * @param {PIXI.smooth.SmoothGraphicsGeometry} [options.geometry] A geometry passed to the graphics.
 * @param {string|null} [options.name]                     The name of the PCO.
 * @param {*} [options.object]                             Any object that owns this PCO.
 */
export default class PrimaryGraphics extends PrimaryCanvasObjectMixin(PIXI.smooth.SmoothGraphics) {
  constructor(options) {
    let geometry;
    if ( options instanceof PIXI.smooth.SmoothGraphicsGeometry ) {
      geometry = options;
      options = {};
    } else if ( options instanceof Object ) {
      geometry = options.geometry;
    } else {
      options = {};
    }
    super(geometry);
    this.name = options.name ?? null;
    this.object = options.object ?? null;
  }

  /* -------------------------------------------- */

  /**
   * A temporary point used by this class.
   * @type {PIXI.Point}
   */
  static #TEMP_POINT = new PIXI.Point();

  /* -------------------------------------------- */

  /**
   * The dirty ID of the geometry.
   * @type {number}
   */
  #geometryDirty = -1;

  /* -------------------------------------------- */

  /**
   * Does the geometry contain points?
   * @type {boolean}
   */
  #geometryContainsPoints = false;

  /* -------------------------------------------- */

  /** @override */
  _calculateCanvasBounds() {
    this.finishPoly();
    const geometry = this._geometry;
    if ( !geometry.graphicsData.length ) return;
    const { minX, minY, maxX, maxY } = geometry.bounds;
    this._canvasBounds.addFrameMatrix(this.canvasTransform, minX, minY, maxX, maxY);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  updateCanvasTransform() {
    if ( this.#geometryDirty !== this._geometry.dirty ) {
      this.#geometryDirty = this._geometry.dirty;
      this.#geometryContainsPoints = false;
      const graphicsData = this._geometry.graphicsData;
      for ( let i = 0; i < graphicsData.length; i++ ) {
        const data = graphicsData[i];
        if ( data.shape && data.fillStyle.visible ) {
          this.#geometryContainsPoints = true;
          break;
        }
      }
      this._canvasBoundsID++;
    }
    super.updateCanvasTransform();
  }

  /* -------------------------------------------- */

  /** @override */
  containsCanvasPoint(point) {
    if ( !this.#geometryContainsPoints ) return false;
    if ( !this.canvasBounds.contains(point.x, point.y) ) return false;
    point = this.canvasTransform.applyInverse(point, PrimaryGraphics.#TEMP_POINT);
    return this._geometry.containsPoint(point);
  }
}

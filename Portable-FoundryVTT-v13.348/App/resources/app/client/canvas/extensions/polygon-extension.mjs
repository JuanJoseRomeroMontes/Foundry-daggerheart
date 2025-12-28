import {CLIPPER_SCALING_FACTOR} from "../../../common/constants.mjs";

/**
 * Extend PIXI Polygon with new methods.
 */
export default function extendPIXIPolygon() {

  /**
   * Test whether the polygon is has a positive signed area.
   * Using a y-down axis orientation, this means that the polygon is "clockwise".
   * @type {boolean}
   */
  Object.defineProperties(PIXI.Polygon.prototype, {
    isPositive: {
      get: function() {
        if ( this._isPositive !== undefined ) return this._isPositive;
        if ( this.points.length < 6 ) return undefined;
        return this._isPositive = this.signedArea() > 0;
      }
    },
    _isPositive: {value: undefined, writable: true, enumerable: false}
  });

  /* -------------------------------------------- */

  /**
   * Clear the cached signed orientation.
   */
  PIXI.Polygon.prototype.clearCache = function() {
    this._isPositive = undefined;
  };

  /* -------------------------------------------- */

  /**
   * Compute the signed area of polygon using an approach similar to ClipperLib.Clipper.Area.
   * The math behind this is based on the Shoelace formula. https://en.wikipedia.org/wiki/Shoelace_formula.
   * The area is positive if the orientation of the polygon is positive.
   * @returns {number}              The signed area of the polygon
   */
  PIXI.Polygon.prototype.signedArea = function() {
    const points = this.points;
    const ln = points.length;
    if ( ln < 6 ) return 0;

    // Compute area
    let area = 0;
    let x1 = points[ln - 2];
    let y1 = points[ln - 1];
    for ( let i = 0; i < ln; i += 2 ) {
      const x2 = points[i];
      const y2 = points[i + 1];
      area += (x2 - x1) * (y2 + y1);
      x1 = x2;
      y1 = y2;
    }

    // Negate the area because in Foundry canvas, y-axis is reversed
    // See https://sourceforge.net/p/jsclipper/wiki/documentation/#clipperlibclipperorientation
    // The 1/2 comes from the Shoelace formula
    return area * -0.5;
  };

  /* -------------------------------------------- */

  /**
   * Reverse the order of the polygon points in-place, replacing the points array into the polygon.
   * Note: references to the old points array will not be affected.
   * @returns {PIXI.Polygon}      This polygon with its orientation reversed
   */
  PIXI.Polygon.prototype.reverseOrientation = function() {
    const reversed_pts = [];
    const pts = this.points;
    const ln = pts.length - 2;
    for ( let i = ln; i >= 0; i -= 2 ) reversed_pts.push(pts[i], pts[i + 1]);
    this.points = reversed_pts;
    if ( this._isPositive !== undefined ) this._isPositive = !this._isPositive;
    return this;
  };

  /* -------------------------------------------- */

  /**
   * Add a de-duplicated point to the Polygon.
   * @param {Point} point         The point to add to the Polygon
   * @returns {PIXI.Polygon}      A reference to the polygon for method chaining
   */
  PIXI.Polygon.prototype.addPoint = function({x, y} = {}) {
    const l = this.points.length;
    if ( (x === this.points[l - 2]) && (y === this.points[l - 1]) ) return this;
    this.points.push(x, y);
    this.clearCache();
    return this;
  };

  /* -------------------------------------------- */

  /**
   * Return the bounding box for a PIXI.Polygon.
   * The bounding rectangle is normalized such that the width and height are non-negative.
   * @returns {PIXI.Rectangle}    The bounding PIXI.Rectangle
   */
  PIXI.Polygon.prototype.getBounds = function() {
    if ( this.points.length < 2 ) return new PIXI.Rectangle(0, 0, 0, 0);
    let maxX;
    let maxY;
    let minX = maxX = this.points[0];
    let minY = maxY = this.points[1];
    for ( let i = 3; i < this.points.length; i += 2 ) {
      const x = this.points[i - 1];
      const y = this.points[i];
      if ( x < minX ) minX = x;
      else if ( x > maxX ) maxX = x;
      if ( y < minY ) minY = y;
      else if ( y > maxY ) maxY = y;
    }
    return new PIXI.Rectangle(minX, minY, maxX - minX, maxY - minY);
  };

  /* -------------------------------------------- */

  /**
   * @typedef ClipperPoint
   * @property {number} X
   * @property {number} Y
   */

  /**
   * Construct a PIXI.Polygon instance from an array of clipper points [{X,Y}, ...].
   * @param {ClipperPoint[]} points                 An array of points returned by clipper
   * @param {object} [options]                      Options which affect how canvas points are generated
   * @param {number} [options.scalingFactor=1]        A scaling factor used to preserve floating point precision
   * @returns {PIXI.Polygon}                        The resulting PIXI.Polygon
   */
  PIXI.Polygon.fromClipperPoints = function(points, {scalingFactor = 1} = {}) {
    const polygonPoints = [];
    for ( const point of points ) {
      polygonPoints.push(point.X / scalingFactor, point.Y / scalingFactor);
    }
    return new PIXI.Polygon(polygonPoints);
  };

  /* -------------------------------------------- */

  /**
   * Convert a PIXI.Polygon into an array of clipper points [{X,Y}, ...].
   * Note that clipper points must be rounded to integers.
   * In order to preserve some amount of floating point precision, an optional scaling factor may be provided.
   * @param {object} [options]                  Options which affect how clipper points are generated
   * @param {number} [options.scalingFactor=1]    A scaling factor used to preserve floating point precision
   * @returns {ClipperPoint[]}                  An array of points to be used by clipper
   */
  PIXI.Polygon.prototype.toClipperPoints = function({scalingFactor = 1} = {}) {
    const points = [];
    for ( let i = 1; i < this.points.length; i += 2 ) {
      points.push({
        X: Math.round(this.points[i - 1] * scalingFactor),
        Y: Math.round(this.points[i] * scalingFactor)
      });
    }
    return points;
  };

  /* -------------------------------------------- */

  /**
   * Determine whether the PIXI.Polygon is closed, defined by having the same starting and ending point.
   * @type {boolean}
   */
  Object.defineProperty(PIXI.Polygon.prototype, "isClosed", {
    get: function() {
      const ln = this.points.length;
      if ( ln < 4 ) return false;
      return (this.points[0] === this.points[ln - 2]) && (this.points[1] === this.points[ln - 1]);
    },
    enumerable: false
  });

  /* -------------------------------------------- */
  /*  Intersection Methods                        */
  /* -------------------------------------------- */

  /**
   * Intersect this PIXI.Polygon with another PIXI.Polygon using the clipper library.
   * @param {PIXI.Polygon} other        Another PIXI.Polygon
   * @param {object} [options]          Options which configure how the intersection is computed
   * @param {number} [options.clipType]       The clipper clip type
   * @param {number} [options.scalingFactor=CONST.CLIPPER_SCALING_FACTOR]
   *   A scaling factor passed to Polygon#toClipperPoints to preserve precision
   * @returns {PIXI.Polygon}       The intersected polygon
   */
  PIXI.Polygon.prototype.intersectPolygon = function(other, {clipType,
    scalingFactor=CLIPPER_SCALING_FACTOR} = {}) {
    const otherPts = other.toClipperPoints({scalingFactor});
    const solution = this.intersectClipper(otherPts, {clipType, scalingFactor});
    return PIXI.Polygon.fromClipperPoints(solution.length ? solution[0] : [], {scalingFactor});
  };

  /* -------------------------------------------- */

  /**
   * Intersect this PIXI.Polygon with an array of ClipperPoints.
   * @param {ClipperPoint[]} clipperPoints    Array of clipper points generated by PIXI.Polygon.toClipperPoints()
   * @param {object} [options]                Options which configure how the intersection is computed
   * @param {number} [options.clipType]         The clipper clip type
   * @param {number} [options.scalingFactor=1]  A scaling factor passed to Polygon#toClipperPoints to preserve precision
   * @returns {ClipperPoint[]}                The resulting ClipperPaths
   */
  PIXI.Polygon.prototype.intersectClipper = function(clipperPoints, {clipType, scalingFactor=1} = {}) {
    clipType ??= ClipperLib.ClipType.ctIntersection;
    const c = new ClipperLib.Clipper();
    c.AddPath(this.toClipperPoints({scalingFactor}), ClipperLib.PolyType.ptSubject, true);
    c.AddPath(clipperPoints, ClipperLib.PolyType.ptClip, true);
    const solution = new ClipperLib.Paths();
    c.Execute(clipType, solution);
    return solution;
  };

  /* -------------------------------------------- */

  /**
   * Intersect this PIXI.Polygon with a PIXI.Circle.
   * For now, convert the circle to a Polygon approximation and use intersectPolygon.
   * In the future we may replace this with more specialized logic which uses the line-circle intersection formula.
   * @param {PIXI.Circle} circle        A PIXI.Circle
   * @param {object} [options]          Options which configure how the intersection is computed
   * @param {number} [options.density]    The number of points which defines the density of approximation
   * @param {number} [options.scalingFactor=CONST.CLIPPER_SCALING_FACTOR]
   *   A scaling factor passed to Polygon#toClipperPoints to preserve precision
   * @param {number} [options.clipType]       The clipper clip type
   * @returns {PIXI.Polygon}            The intersected polygon
   */
  PIXI.Polygon.prototype.intersectCircle = function(circle, options) {
    return circle.intersectPolygon(this, options);
  };

  /* -------------------------------------------- */

  /**
   * Intersect this PIXI.Polygon with a PIXI.Rectangle.
   * For now, convert the rectangle to a Polygon and use intersectPolygon.
   * In the future we may replace this with more specialized logic which uses the line-line intersection formula.
   * @param {PIXI.Rectangle} rect       A PIXI.Rectangle
   * @param {object} [options]          Options which configure how the intersection is computed
   * @returns {PIXI.Polygon}            The intersected polygon
   */
  PIXI.Polygon.prototype.intersectRectangle = function(rect, options) {
    return rect.intersectPolygon(this, options);
  };
}

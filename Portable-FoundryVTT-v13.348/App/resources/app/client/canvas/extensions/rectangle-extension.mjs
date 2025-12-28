import { CLIPPER_SCALING_FACTOR } from "../../../common/constants.mjs";
import WeilerAthertonClipper from "../geometry/weiler-atherton-clipping.mjs";

/**
 * Extend PIXI.Rectangle with new methods.
 */
export default function extendPIXIRectangle() {

  /**
   * Bit code labels splitting a rectangle into zones, based on the Cohen-Sutherland algorithm.
   * See https://en.wikipedia.org/wiki/Cohen%E2%80%93Sutherland_algorithm
   *          left    central   right
   * top      1001    1000      1010
   * central  0001    0000      0010
   * bottom   0101    0100      0110
   * @enum {number}
   */
  PIXI.Rectangle.CS_ZONES = {
    INSIDE: 0x0000,
    LEFT: 0x0001,
    RIGHT: 0x0010,
    TOP: 0x1000,
    BOTTOM: 0x0100,
    TOPLEFT: 0x1001,
    TOPRIGHT: 0x1010,
    BOTTOMRIGHT: 0x0110,
    BOTTOMLEFT: 0x0101
  };

  /* -------------------------------------------- */

  /**
   * Calculate center of this rectangle.
   * @type {Point}
   */
  Object.defineProperty(PIXI.Rectangle.prototype, "center", {
    get: function() {
      return {x: this.x + (this.width * 0.5), y: this.y + (this.height * 0.5)};
    }
  });

  /* -------------------------------------------- */

  /**
   * Return the bounding box for a PIXI.Rectangle.
   * The bounding rectangle is normalized such that the width and height are non-negative.
   * @returns {PIXI.Rectangle}
   */
  PIXI.Rectangle.prototype.getBounds = function() {
    let {x, y, width, height} = this;
    x = width > 0 ? x : x + width;
    y = height > 0 ? y : y + height;
    return new PIXI.Rectangle(x, y, Math.abs(width), Math.abs(height));
  };

  /* -------------------------------------------- */

  /**
   * Determine if a point is on or nearly on this rectangle.
   * @param {Point} p           Point to test
   * @returns {boolean}         Is the point on the rectangle boundary?
   */
  PIXI.Rectangle.prototype.pointIsOn = function(p) {
    const CSZ = PIXI.Rectangle.CS_ZONES;
    return this._getZone(p) === CSZ.INSIDE && this._getEdgeZone(p) !== CSZ.INSIDE;
  };

  /* -------------------------------------------- */

  /**
   * Calculate the rectangle Zone for a given point located around, on, or in the rectangle.
   * See https://en.wikipedia.org/wiki/Cohen%E2%80%93Sutherland_algorithm
   * This differs from _getZone in how points on the edge are treated: they are not considered inside.
   * @param {Point} point                   A point to test for location relative to the rectangle
   * @returns {PIXI.Rectangle.CS_ZONES}     Which edge zone does the point belong to?
   */
  PIXI.Rectangle.prototype._getEdgeZone = function(point) {
    const CSZ = PIXI.Rectangle.CS_ZONES;
    let code = CSZ.INSIDE;
    if ( point.x < this.x || point.x.almostEqual(this.x) ) code |= CSZ.LEFT;
    else if ( point.x > this.right || point.x.almostEqual(this.right) ) code |= CSZ.RIGHT;
    if ( point.y < this.y || point.y.almostEqual(this.y) ) code |= CSZ.TOP;
    else if ( point.y > this.bottom || point.y.almostEqual(this.bottom) ) code |= CSZ.BOTTOM;
    return code;
  };

  /* -------------------------------------------- */

  /**
   * Get all the points (corners) for a polygon approximation of a rectangle between two points on the rectangle.
   * The two points can be anywhere in 2d space on or outside the rectangle.
   * The starting and ending side are based on the zone of the corresponding a and b points.
   * (See PIXI.Rectangle.CS_ZONES.)
   * This is the rectangular version of PIXI.Circle.prototype.pointsBetween, and is similarly used
   * to draw the portion of the shape between two intersection points on that shape.
   * @param { Point } a   A point on or outside the rectangle, representing the starting position.
   * @param { Point } b   A point on or outside the rectangle, representing the starting position.
   * @returns { Point[]}  Points returned are clockwise from start to end.
   */
  PIXI.Rectangle.prototype.pointsBetween = function(a, b) {
    const CSZ = PIXI.Rectangle.CS_ZONES;

    // Assume the point could be outside the rectangle but not inside (which would be undefined).
    const zoneA = this._getEdgeZone(a);
    if ( !zoneA ) return [];
    const zoneB = this._getEdgeZone(b);
    if ( !zoneB ) return [];

    // If on the same wall, return none if end is counterclockwise to start.
    if ( zoneA === zoneB && foundry.utils.orient2dFast(this.center, a, b) <= 0 ) return [];
    let z = zoneA;
    const pts = [];
    for ( let i = 0; i < 4; i += 1 ) {
      if ( (z & CSZ.LEFT) ) {
        if ( z !== CSZ.TOPLEFT ) pts.push({x: this.left, y: this.top});
        z = CSZ.TOP;
      }
      else if ( (z & CSZ.TOP) ) {
        if ( z !== CSZ.TOPRIGHT ) pts.push({x: this.right, y: this.top});
        z = CSZ.RIGHT;
      }
      else if ( (z & CSZ.RIGHT) ) {
        if ( z !== CSZ.BOTTOMRIGHT ) pts.push({x: this.right, y: this.bottom});
        z = CSZ.BOTTOM;
      }
      else if ( (z & CSZ.BOTTOM) ) {
        if ( z !== CSZ.BOTTOMLEFT ) pts.push({x: this.left, y: this.bottom});
        z = CSZ.LEFT;
      }
      if ( z & zoneB ) break;
    }
    return pts;
  };

  /* -------------------------------------------- */

  /**
   * Get all intersection points for a segment A|B
   * Intersections are sorted from A to B.
   * @param {Point} a   Endpoint A of the segment
   * @param {Point} b   Endpoint B of the segment
   * @returns {Point[]} Array of intersections or empty if no intersection.
   *  If A|B is parallel to an edge of this rectangle, returns the two furthest points on
   *  the segment A|B that are on the edge.
   *  The return object's t0 property signifies the location of the intersection on segment A|B.
   *  This will be NaN if the segment is a point.
   *  The return object's t1 property signifies the location of the intersection on the rectangle edge.
   *  The t1 value is measured relative to the intersecting edge of the rectangle.
   */
  PIXI.Rectangle.prototype.segmentIntersections = function(a, b) {

    // The segment is collinear with a vertical edge
    if ( a.x.almostEqual(b.x) && (a.x.almostEqual(this.left) || a.x.almostEqual(this.right)) ) {
      const minY1 = Math.min(a.y, b.y);
      const minY2 = Math.min(this.top, this.bottom);
      const maxY1 = Math.max(a.y, b.y);
      const maxY2 = Math.max(this.top, this.bottom);
      const minIxY = Math.max(minY1, minY2);
      const maxIxY = Math.min(maxY1, maxY2);

      // Test whether the two segments intersect
      const pointIntersection = minIxY.almostEqual(maxIxY);
      if ( pointIntersection || (minIxY < maxIxY) ) {
        // Determine t-values of the a|b segment intersections (t0) and the rectangle edge (t1).
        const distAB = Math.abs(b.y - a.y);
        const distRect = this.height;
        const y = (b.y - a.y) > 0 ? a.y : b.y;
        const rectY = a.x.almostEqual(this.right) ? this.top : this.bottom;
        const minRes = {x: a.x, y: minIxY, t0: (minIxY - y) / distAB, t1: Math.abs((minIxY - rectY) / distRect)};

        // If true, the a|b segment is nearly a point and t0 is likely NaN.
        if ( pointIntersection ) return [minRes];

        // Return in order nearest a, nearest b
        const maxRes = {x: a.x, y: maxIxY, t0: (maxIxY - y) / distAB, t1: Math.abs((maxIxY - rectY) / distRect)};
        return Math.abs(minIxY - a.y) < Math.abs(maxIxY - a.y)
          ? [minRes, maxRes]
          : [maxRes, minRes];
      }
    }

    // The segment is collinear with a horizontal edge
    else if ( a.y.almostEqual(b.y) && (a.y.almostEqual(this.top) || a.y.almostEqual(this.bottom)) ) {
      const minX1 = Math.min(a.x, b.x);
      const minX2 = Math.min(this.right, this.left);
      const maxX1 = Math.max(a.x, b.x);
      const maxX2 = Math.max(this.right, this.left);
      const minIxX = Math.max(minX1, minX2);
      const maxIxX = Math.min(maxX1, maxX2);

      // Test whether the two segments intersect
      const pointIntersection = minIxX.almostEqual(maxIxX);
      if ( pointIntersection || (minIxX < maxIxX) ) {
        // Determine t-values of the a|b segment intersections (t0) and the rectangle edge (t1).
        const distAB = Math.abs(b.x - a.x);
        const distRect = this.width;
        const x = (b.x - a.x) > 0 ? a.x : b.x;
        const rectX = a.y.almostEqual(this.top) ? this.left : this.right;
        const minRes = {x: minIxX, y: a.y, t0: (minIxX - x) / distAB, t1: Math.abs((minIxX - rectX) / distRect)};

        // If true, the a|b segment is nearly a point and t0 is likely NaN.
        if ( pointIntersection ) return [minRes];

        // Return in order nearest a, nearest b
        const maxRes = {x: maxIxX, y: a.y, t0: (maxIxX - x) / distAB, t1: Math.abs((maxIxX - rectX) / distRect)};
        return Math.abs(minIxX - a.x) < Math.abs(maxIxX - a.x) ? [minRes, maxRes] : [maxRes, minRes];
      }
    }

    // Follows structure of lineSegmentIntersects
    const zoneA = this._getZone(a);
    const zoneB = this._getZone(b);
    if ( !(zoneA | zoneB) ) return []; // Bitwise OR is 0: both points inside rectangle.

    // Regular AND: one point inside, one outside
    // Otherwise, both points outside
    const zones = !(zoneA && zoneB) ? [zoneA || zoneB] : [zoneA, zoneB];

    // If 2 zones, line likely intersects two edges.
    // It is possible to have a line that starts, for example, at center left and moves to center top.
    // In this case it may not cross the rectangle.
    if ( zones.length === 2 && !this.lineSegmentIntersects(a, b) ) return [];
    const CSZ = PIXI.Rectangle.CS_ZONES;
    const lsi = foundry.utils.lineSegmentIntersects;
    const lli = foundry.utils.lineLineIntersection;
    const {leftEdge, rightEdge, bottomEdge, topEdge} = this;
    const ixs = [];
    for ( const z of zones ) {
      let ix;
      if ( (z & CSZ.LEFT)
        && lsi(leftEdge.A, leftEdge.B, a, b) ) ix = lli(a, b, leftEdge.A, leftEdge.B);
      if ( !ix && (z & CSZ.RIGHT)
        && lsi(rightEdge.A, rightEdge.B, a, b) ) ix = lli(a, b, rightEdge.A, rightEdge.B);
      if ( !ix && (z & CSZ.TOP)
        && lsi(topEdge.A, topEdge.B, a, b) ) ix = lli(a, b, topEdge.A, topEdge.B);
      if ( !ix && (z & CSZ.BOTTOM)
        && lsi(bottomEdge.A, bottomEdge.B, a, b) ) ix = lli(a, b, bottomEdge.A, bottomEdge.B);

      // The ix should always be a point by now
      if ( !ix ) throw new Error("PIXI.Rectangle.prototype.segmentIntersections returned an unexpected null point.");
      ixs.push(ix);
    }
    return ixs;
  };

  /* -------------------------------------------- */

  /**
   * Compute the intersection of this Rectangle with some other Rectangle.
   * @param {PIXI.Rectangle} other      Some other rectangle which intersects this one
   * @returns {PIXI.Rectangle}          The intersected rectangle
   */
  PIXI.Rectangle.prototype.intersection = function(other) {
    const x0 = this.x < other.x ? other.x : this.x;
    const x1 = this.right > other.right ? other.right : this.right;
    const y0 = this.y < other.y ? other.y : this.y;
    const y1 = this.bottom > other.bottom ? other.bottom : this.bottom;
    return new PIXI.Rectangle(x0, y0, x1 - x0, y1 - y0);
  };

  /* -------------------------------------------- */

  /**
   * Convert this PIXI.Rectangle into a PIXI.Polygon
   * @returns {PIXI.Polygon}      The Rectangle expressed as a PIXI.Polygon
   */
  PIXI.Rectangle.prototype.toPolygon = function() {
    const points = [this.left, this.top, this.right, this.top, this.right, this.bottom, this.left, this.bottom];
    return new PIXI.Polygon(points);
  };

  /* -------------------------------------------- */

  /**
   * Get the left edge of this rectangle.
   * The returned edge endpoints are oriented clockwise around the rectangle.
   * @type {{A: Point, B: Point}}
   */
  Object.defineProperty(PIXI.Rectangle.prototype, "leftEdge", {
    get: function() {
      return {A: {x: this.left, y: this.bottom}, B: {x: this.left, y: this.top}};
    }
  });

  /* -------------------------------------------- */

  /**
   * Get the right edge of this rectangle.
   * The returned edge endpoints are oriented clockwise around the rectangle.
   * @type {{A: Point, B: Point}}
   */
  Object.defineProperty(PIXI.Rectangle.prototype, "rightEdge", {
    get: function() {
      return {A: {x: this.right, y: this.top}, B: {x: this.right, y: this.bottom}};
    }
  });

  /* -------------------------------------------- */

  /**
   * Get the top edge of this rectangle.
   * The returned edge endpoints are oriented clockwise around the rectangle.
   * @type {{A: Point, B: Point}}
   */
  Object.defineProperty(PIXI.Rectangle.prototype, "topEdge", {
    get: function() {
      return {A: {x: this.left, y: this.top}, B: {x: this.right, y: this.top}};
    }
  });

  /* -------------------------------------------- */

  /**
   * Get the bottom edge of this rectangle.
   * The returned edge endpoints are oriented clockwise around the rectangle.
   * @type {{A: Point, B: Point}}
   */
  Object.defineProperty(PIXI.Rectangle.prototype, "bottomEdge", {
    get: function() {
      return {A: {x: this.right, y: this.bottom}, B: {x: this.left, y: this.bottom}};
    }
  });

  /* -------------------------------------------- */

  /**
   * Calculate the rectangle Zone for a given point located around or in the rectangle.
   * https://en.wikipedia.org/wiki/Cohen%E2%80%93Sutherland_algorithm
   *
   * @param {Point} p     Point to test for location relative to the rectangle
   * @returns {PIXI.Rectangle.CS_ZONES}
   */
  PIXI.Rectangle.prototype._getZone = function(p) {
    const CSZ = PIXI.Rectangle.CS_ZONES;
    let code = CSZ.INSIDE;

    if ( p.x < this.x ) code |= CSZ.LEFT;
    else if ( p.x > this.right ) code |= CSZ.RIGHT;

    if ( p.y < this.y ) code |= CSZ.TOP;
    else if ( p.y > this.bottom ) code |= CSZ.BOTTOM;

    return code;
  };

  /**
   * Test whether a line segment AB intersects this rectangle.
   * @param {Point} a                       The first endpoint of segment AB
   * @param {Point} b                       The second endpoint of segment AB
   * @param {object} [options]              Options affecting the intersect test.
   * @param {boolean} [options.inside]      If true, a line contained within the rectangle will
   *                                        return true.
   * @returns {boolean} True if intersects.
   */
  PIXI.Rectangle.prototype.lineSegmentIntersects = function(a, b, {inside = false} = {}) {
    const zoneA = this._getZone(a);
    const zoneB = this._getZone(b);

    if ( !(zoneA | zoneB) ) return inside; // Bitwise OR is 0: both points inside rectangle.
    if ( zoneA & zoneB ) return false; // Bitwise AND is not 0: both points share outside zone
    if ( !(zoneA && zoneB) ) return true; // Regular AND: one point inside, one outside

    // Line likely intersects, but some possibility that the line starts at, say, center left
    // and moves to center top which means it may or may not cross the rectangle
    const CSZ = PIXI.Rectangle.CS_ZONES;
    const lsi = foundry.utils.lineSegmentIntersects;

    // If the zone is a corner, like top left, test one side and then if not true, test
    // the other. If the zone is on a side, like left, just test that side.
    const leftEdge = this.leftEdge;
    if ( (zoneA & CSZ.LEFT) && lsi(leftEdge.A, leftEdge.B, a, b) ) return true;

    const rightEdge = this.rightEdge;
    if ( (zoneA & CSZ.RIGHT) && lsi(rightEdge.A, rightEdge.B, a, b) ) return true;

    const topEdge = this.topEdge;
    if ( (zoneA & CSZ.TOP) && lsi(topEdge.A, topEdge.B, a, b) ) return true;

    const bottomEdge = this.bottomEdge;
    if ( (zoneA & CSZ.BOTTOM) && lsi(bottomEdge.A, bottomEdge.B, a, b) ) return true;

    return false;
  };

  /* -------------------------------------------- */

  /**
   * Intersect this PIXI.Rectangle with a PIXI.Polygon.
   * Currently uses the clipper library.
   * In the future we may replace this with more specialized logic which uses the line-line intersection formula.
   * @param {PIXI.Polygon} polygon      A PIXI.Polygon
   * @param {object} [options]          Options which configure how the intersection is computed
   * @param {number} [options.clipType]             The clipper clip type
   * @param {number} [options.scalingFactor=CONST.CLIPPER_SCALING_FACTOR]
   *   A scaling factor passed to Polygon#toClipperPoints for precision
   * @param {string} [options.weilerAtherton=true]  Use the Weiler-Atherton algorithm. Otherwise, use Clipper.
   * @param {boolean} [options.canMutate]           If the WeilerAtherton constructor could mutate or not
   * @returns {PIXI.Polygon}       The intersected polygon
   */
  PIXI.Rectangle.prototype.intersectPolygon = function(polygon, {
    clipType,
    scalingFactor=CLIPPER_SCALING_FACTOR,
    canMutate,
    weilerAtherton = true
  } = {}) {
    if ( !this.width || !this.height ) return new PIXI.Polygon([]);
    clipType ??= ClipperLib.ClipType.ctIntersection;

    // Use Weiler-Atherton for efficient intersection or union
    if ( weilerAtherton && polygon.isPositive ) {
      const res = WeilerAthertonClipper.combine(polygon, this, {clipType, canMutate, scalingFactor});
      if ( !res.length ) return new PIXI.Polygon([]);
      return res[0];
    }

    // Use Clipper polygon intersection
    return polygon.intersectPolygon(this.toPolygon(), {clipType, canMutate, scalingFactor});
  };

  /* -------------------------------------------- */

  /**
   * Intersect this PIXI.Rectangle with an array of ClipperPoints. Currently, uses the clipper library.
   * In the future we may replace this with more specialized logic which uses the line-line intersection formula.
   * @param {ClipperPoint[]} clipperPoints An array of ClipperPoints generated by PIXI.Polygon.toClipperPoints()
   * @param {object} [options]            Options which configure how the intersection is computed
   * @param {number} [options.clipType]       The clipper clip type
   * @param {number} [options.scalingFactor=1]  A scaling factor passed to Polygon#toClipperPoints to preserve precision
   * @returns {ClipperPoint[]}            The array of intersection points
   */
  PIXI.Rectangle.prototype.intersectClipper = function(clipperPoints, {clipType, scalingFactor=1} = {}) {
    if ( !this.width || !this.height ) return [];
    return this.toPolygon().intersectClipper(clipperPoints, {clipType, scalingFactor});
  };

  /* -------------------------------------------- */

  /**
   * Determine whether some other Rectangle overlaps with this one.
   * This check differs from the parent class Rectangle#intersects test because it is true for adjacency (zero area).
   * @param {PIXI.Rectangle} other  Some other rectangle against which to compare
   * @returns {boolean}             Do the rectangles overlap?
   */
  PIXI.Rectangle.prototype.overlaps = function(other) {
    return (other.right >= this.left)
      && (other.left <= this.right)
      && (other.bottom >= this.top)
      && (other.top <= this.bottom);
  };

  /* -------------------------------------------- */

  /**
   * Normalize the width and height of the rectangle in-place, enforcing that those dimensions be positive.
   * @returns {PIXI.Rectangle}
   */
  PIXI.Rectangle.prototype.normalize = function() {
    if ( this.width < 0 ) {
      this.x += this.width;
      this.width = Math.abs(this.width);
    }
    if ( this.height < 0 ) {
      this.y += this.height;
      this.height = Math.abs(this.height);
    }
    return this;
  };

  /* -------------------------------------------- */

  /**
   * Fits this rectangle around this rectangle rotated around the given pivot counterclockwise by the given angle in
   * radians.
   * @param {number} radians           The angle of rotation.
   * @param {PIXI.Point} [pivot]       An optional pivot point (normalized).
   * @returns {PIXI.Rectangle}         This rectangle.
   */
  PIXI.Rectangle.prototype.rotate = function(radians, pivot) {
    if ( radians === 0 ) return this;
    return this.constructor.fromRotation(this.x, this.y, this.width, this.height, radians, pivot, this);
  };

  /* -------------------------------------------- */

  /**
   * Create normalized rectangular bounds given a rectangle shape and an angle of central rotation.
   * @param {number} x                 The top-left x-coordinate of the un-rotated rectangle
   * @param {number} y                 The top-left y-coordinate of the un-rotated rectangle
   * @param {number} width             The width of the un-rotated rectangle
   * @param {number} height            The height of the un-rotated rectangle
   * @param {number} radians           The angle of rotation about the center
   * @param {PIXI.Point} [pivot]       An optional pivot point (if not provided, the pivot is the centroid)
   * @param {PIXI.Rectangle} [_outRect] (Internal)
   * @returns {PIXI.Rectangle}         The constructed rotated rectangle bounds
   */
  PIXI.Rectangle.fromRotation = function(x, y, width, height, radians, pivot, _outRect) {
    const cosAngle = Math.cos(radians);
    const sinAngle = Math.sin(radians);

    // Create the output rect if necessary
    _outRect ??= new PIXI.Rectangle();

    // Is it possible to do with the simple computation?
    if ( pivot === undefined || ((pivot.x === 0.5) && (pivot.y === 0.5)) ) {
      _outRect.height = (height * Math.abs(cosAngle)) + (width * Math.abs(sinAngle));
      _outRect.width = (height * Math.abs(sinAngle)) + (width * Math.abs(cosAngle));
      _outRect.x = x + ((width - _outRect.width) / 2);
      _outRect.y = y + ((height - _outRect.height) / 2);
      return _outRect;
    }

    // Calculate the pivot point in absolute coordinates
    const pivotX = x + (width * pivot.x);
    const pivotY = y + (height * pivot.y);

    // Calculate vectors from pivot to the rectangle's corners
    const tlX = x - pivotX;
    const tlY = y - pivotY;
    const trX = x + width - pivotX;
    const trY = y - pivotY;
    const blX = x - pivotX;
    const blY = y + height - pivotY;
    const brX = x + width - pivotX;
    const brY = y + height - pivotY;

    // Apply rotation to the vectors
    const rTlX = (cosAngle * tlX) - (sinAngle * tlY);
    const rTlY = (sinAngle * tlX) + (cosAngle * tlY);
    const rTrX = (cosAngle * trX) - (sinAngle * trY);
    const rTrY = (sinAngle * trX) + (cosAngle * trY);
    const rBlX = (cosAngle * blX) - (sinAngle * blY);
    const rBlY = (sinAngle * blX) + (cosAngle * blY);
    const rBrX = (cosAngle * brX) - (sinAngle * brY);
    const rBrY = (sinAngle * brX) + (cosAngle * brY);

    // Find the new corners of the bounding rectangle
    const minX = Math.min(rTlX, rTrX, rBlX, rBrX);
    const minY = Math.min(rTlY, rTrY, rBlY, rBrY);
    const maxX = Math.max(rTlX, rTrX, rBlX, rBrX);
    const maxY = Math.max(rTlY, rTrY, rBlY, rBrY);

    // Assign the new computed bounding box
    _outRect.x = pivotX + minX;
    _outRect.y = pivotY + minY;
    _outRect.width = maxX - minX;
    _outRect.height = maxY - minY;
    return _outRect;
  };
}

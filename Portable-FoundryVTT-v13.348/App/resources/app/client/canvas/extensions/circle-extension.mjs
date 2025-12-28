import WeilerAthertonClipper from "../geometry/weiler-atherton-clipping.mjs";


/**
 * Extend PIXI.Circle with new methods.
 */
export default function extendPIXICircle() {
  /**
   * Determine the center of the circle.
   * Trivial, but used to match center method for other shapes.
   * @type {PIXI.Point}
   */
  Object.defineProperty(PIXI.Circle.prototype, "center", {
    get: function() {
      return new PIXI.Point(this.x, this.y);
    }
  });

  /* -------------------------------------------- */

  /**
   * Determine if a point is on or nearly on this circle.
   * @param {Point} point       Point to test
   * @param {number} epsilon    Tolerated margin of error
   * @returns {boolean}         Is the point on the circle within the allowed tolerance?
   */
  PIXI.Circle.prototype.pointIsOn = function(point, epsilon = 1e-08) {
    const dist2 = Math.pow(point.x - this.x, 2) + Math.pow(point.y - this.y, 2);
    const r2 = Math.pow(this.radius, 2);
    return dist2.almostEqual(r2, epsilon);
  };

  /* -------------------------------------------- */

  /**
   * Get all intersection points on this circle for a segment A|B
   * Intersections are sorted from A to B.
   * @param {Point} a             The first endpoint on segment A|B
   * @param {Point} b             The second endpoint on segment A|B
   * @returns {Point[]}           Points where the segment A|B intersects the circle
   */
  PIXI.Circle.prototype.segmentIntersections = function(a, b) {
    const ixs = foundry.utils.lineCircleIntersection(a, b, this, this.radius);
    return ixs.intersections;
  };

  /* -------------------------------------------- */

  /**
   * Calculate an x,y point on this circle's circumference given an angle
   * 0: due east
   * π / 2: due south
   * π or -π: due west
   * -π/2: due north
   * @param {number} angle      Angle of the point, in radians
   * @returns {Point}           The point on the circle at the given angle
   */
  PIXI.Circle.prototype.pointAtAngle = function(angle) {
    return {
      x: this.x + (this.radius * Math.cos(angle)),
      y: this.y + (this.radius * Math.sin(angle))
    };
  };

  /* -------------------------------------------- */

  /**
   * Get all the points for a polygon approximation of this circle between two points.
   * The two points can be anywhere in 2d space. The intersection of this circle with the line from this circle center
   * to the point will be used as the start or end point, respectively.
   * This is used to draw the portion of the circle (the arc) between two intersection points on this circle.
   * @param {Point} a             Point in 2d space representing the start point
   * @param {Point} b             Point in 2d space representing the end point
   * @param {object} [options]    Options passed on to the pointsForArc method
   * @returns { Point[]}          An array of points arranged clockwise from start to end
   */
  PIXI.Circle.prototype.pointsBetween = function(a, b, options) {
    const fromAngle = Math.atan2(a.y - this.y, a.x - this.x);
    const toAngle = Math.atan2(b.y - this.y, b.x - this.x);
    return this.pointsForArc(fromAngle, toAngle, {includeEndpoints: false, ...options});
  };

  /* -------------------------------------------- */

  /**
   * Get the points that would approximate a circular arc along this circle, given a starting and ending angle.
   * Points returned are clockwise. If from and to are the same, a full circle will be returned.
   * @param {number} fromAngle     Starting angle, in radians. π is due north, π/2 is due east
   * @param {number} toAngle       Ending angle, in radians
   * @param {object} [options]     Options which affect how the circle is converted
   * @param {number} [options.density]           The number of points which defines the density of approximation
   * @param {boolean} [options.includeEndpoints]  Whether to include points at the circle where the arc starts and ends
   * @returns {Point[]}             An array of points along the requested arc
   */
  PIXI.Circle.prototype.pointsForArc = function(fromAngle, toAngle, {density, includeEndpoints = true} = {}) {
    const pi2 = 2 * Math.PI;
    density ??= this.constructor.approximateVertexDensity(this.radius);
    const points = [];
    const delta = pi2 / density;
    if ( includeEndpoints ) points.push(this.pointAtAngle(fromAngle));

    // Determine number of points to add
    let dAngle = toAngle - fromAngle;
    while ( dAngle <= 0 ) dAngle += pi2; // Angles may not be normalized, so normalize total.
    const nPoints = Math.round(dAngle / delta);

    // Construct padding rays (clockwise)
    for ( let i = 1; i < nPoints; i++ ) points.push(this.pointAtAngle(fromAngle + (i * delta)));
    if ( includeEndpoints ) points.push(this.pointAtAngle(toAngle));
    return points;
  };

  /* -------------------------------------------- */

  /**
   * Approximate this PIXI.Circle as a PIXI.Polygon
   * @param {object} [options]      Options forwarded on to the pointsForArc method
   * @returns {PIXI.Polygon}        The Circle expressed as a PIXI.Polygon
   */
  PIXI.Circle.prototype.toPolygon = function(options) {
    const points = this.pointsForArc(0, 0, options);
    points.pop(); // Drop the repeated endpoint
    return new PIXI.Polygon(points);
  };

  /* -------------------------------------------- */

  /**
   * The recommended vertex density for the regular polygon approximation of a circle of a given radius.
   * Small radius circles have fewer vertices. The returned value will be rounded up to the nearest integer.
   * See the formula described at:
   * https://math.stackexchange.com/questions/4132060/compute-number-of-regular-polgy-sides-to-approximate-circle-to-defined-precision
   * @param {number} radius     Circle radius
   * @param {number} [epsilon]  The maximum tolerable distance between an approximated line segment and the true radius.
   *                            A larger epsilon results in fewer points for a given radius.
   * @returns {number}          The number of points for the approximated polygon
   */
  PIXI.Circle.approximateVertexDensity = function(radius, epsilon = 1) {
    return Math.ceil(Math.PI / Math.sqrt(2 * (epsilon / radius)));
  };

  /* -------------------------------------------- */

  /**
   * Intersect this PIXI.Circle with a PIXI.Polygon.
   * @param {PIXI.Polygon} polygon      A PIXI.Polygon
   * @param {object} [options]          Options which configure how the intersection is computed
   * @param {number} [options.density]              The number of points which defines the density of approximation
   * @param {number} [options.scalingFactor=CONST.CLIPPER_SCALING_FACTOR]
   *   A scaling factor passed to Polygon#toClipperPoints to preserve precision
   * @param {number} [options.clipType]             The clipper clip type
   * @param {string} [options.weilerAtherton=true]  Use the Weiler-Atherton algorithm. Otherwise, use Clipper.
   * @returns {PIXI.Polygon}            The intersected polygon
   */
  PIXI.Circle.prototype.intersectPolygon = function(polygon, {
    density,
    clipType,
    weilerAtherton = true,
    ...options
  } = {}) {
    if ( !this.radius ) return new PIXI.Polygon([]);
    clipType ??= ClipperLib.ClipType.ctIntersection;

    // Use Weiler-Atherton for efficient intersection or union
    if ( weilerAtherton && polygon.isPositive ) {
      const res = WeilerAthertonClipper.combine(polygon, this, {clipType, density, ...options});
      if ( !res.length ) return new PIXI.Polygon([]);
      return res[0];
    }

    // Otherwise, use Clipper polygon intersection
    const approx = this.toPolygon({density});
    return polygon.intersectPolygon(approx, {clipType, ...options});
  };

  /* -------------------------------------------- */

  /**
   * Intersect this PIXI.Circle with an array of ClipperPoints.
   * Convert the circle to a Polygon approximation and use intersectPolygon.
   * In the future we may replace this with more specialized logic which uses the line-circle intersection formula.
   * @param {ClipperPoint[]} clipperPoints  Array of ClipperPoints generated by PIXI.Polygon.toClipperPoints()
   * @param {object} [options]              Options which configure how the intersection is computed
   * @param {number} [options.density]      The number of points which defines the density of approximation
   * @param {number} [options.scalingFactor=1]  A scaling factor passed to Polygon#toClipperPoints to preserve precision
   * @returns {ClipperPoint[]}                The intersected polygon
   */
  PIXI.Circle.prototype.intersectClipper = function(clipperPoints, {density, ...options} = {}) {
    if ( !this.radius ) return [];
    const approx = this.toPolygon({density});
    return approx.intersectClipper(clipperPoints, options);
  };
}

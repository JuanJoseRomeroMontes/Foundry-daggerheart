import Ray from "./ray.mjs";

/**
 * A special class of Polygon which implements a limited angle of emission for a Point Source.
 * The shape is defined by a point origin, radius, angle, and rotation.
 * The shape is further customized by a configurable density which informs the approximation.
 * An optional secondary externalRadius can be provided which adds supplementary visibility outside the primary angle.
 */
export default class LimitedAnglePolygon extends PIXI.Polygon {
  constructor(origin, {radius, angle=360, rotation=0, density, externalRadius=0} = {}) {
    super([]);

    /**
     * The origin point of the Polygon
     * @type {Point}
     */
    this.origin = origin;

    /**
     * The radius of the emitted cone.
     * @type {number}
     */
    this.radius = radius;

    /**
     * The angle of the Polygon in degrees.
     * @type {number}
     */
    this.angle = angle;

    /**
     * The direction of rotation at the center of the emitted angle in degrees.
     * @type {number}
     */
    this.rotation = rotation;

    /**
     * The density of rays which approximate the cone, defined as rays per PI.
     * @type {number}
     */
    this.density = density ?? PIXI.Circle.approximateVertexDensity(this.radius);

    /**
     * An optional "external radius" which is included in the polygon for the supplementary area outside the cone.
     * @type {number}
     */
    this.externalRadius = externalRadius;

    /**
     * The angle of the left (counter-clockwise) edge of the emitted cone in radians.
     * @type {number}
     */
    this.aMin = Math.normalizeRadians(Math.toRadians(this.rotation + 90 - (this.angle / 2)));

    /**
     * The angle of the right (clockwise) edge of the emitted cone in radians.
     * @type {number}
     */
    this.aMax = this.aMin + Math.toRadians(this.angle);

    // Generate polygon points
    this.#generatePoints();
  }

  /**
   * The bounding box of the circle defined by the externalRadius, if any
   * @type {PIXI.Rectangle}
   */
  externalBounds;

  /* -------------------------------------------- */

  /**
   * Generate the points of the LimitedAnglePolygon using the provided configuration parameters.
   */
  #generatePoints() {
    const {x, y} = this.origin;

    // Construct polygon points for the primary angle
    const primaryAngle = this.aMax - this.aMin;
    const nPrimary = Math.ceil((primaryAngle * this.density) / (2 * Math.PI));
    const dPrimary = primaryAngle / nPrimary;
    for ( let i=0; i<=nPrimary; i++ ) {
      const pad = Ray.fromAngle(x, y, this.aMin + (i * dPrimary), this.radius);
      this.points.push(pad.B.x, pad.B.y);
    }

    // Add secondary angle
    if ( this.externalRadius ) {
      const secondaryAngle = (2 * Math.PI) - primaryAngle;
      const nSecondary = Math.ceil((secondaryAngle * this.density) / (2 * Math.PI));
      const dSecondary = secondaryAngle / nSecondary;
      for ( let i=0; i<=nSecondary; i++ ) {
        const pad = Ray.fromAngle(x, y, this.aMax + (i * dSecondary), this.externalRadius);
        this.points.push(pad.B.x, pad.B.y);
      }
      this.externalBounds = (new PIXI.Circle(x, y, this.externalRadius)).getBounds();
    }

    // No secondary angle
    else {
      this.points.unshift(x, y);
      this.points.push(x, y);
    }
  }

  /* -------------------------------------------- */

  /**
   * Restrict the edges which should be included in a PointSourcePolygon based on this specialized shape.
   * We use two tests to jointly keep or reject edges.
   * 1. If this shape uses an externalRadius, keep edges which collide with the bounding box of that circle.
   * 2. Keep edges which are contained within or collide with one of the primary angle boundary rays.
   * @param {Point} a             The first edge vertex
   * @param {Point} b             The second edge vertex
   * @returns {boolean}           Should the edge be included in the PointSourcePolygon computation?
   * @internal
   */
  _includeEdge(a, b) {

    // 1. If this shape uses an externalRadius, keep edges which collide with the bounding box of that circle.
    if ( this.externalBounds?.lineSegmentIntersects(a, b, {inside: true}) ) return true;

    // 2. Keep edges which are contained within or collide with one of the primary angle boundary rays.
    const roundPoint = p => ({x: Math.round(p.x), y: Math.round(p.y)});
    const rMin = Ray.fromAngle(this.origin.x, this.origin.y, this.aMin, this.radius);
    roundPoint(rMin.B);
    const rMax = Ray.fromAngle(this.origin.x, this.origin.y, this.aMax, this.radius);
    roundPoint(rMax.B);

    // If either vertex is inside, keep the edge
    if ( LimitedAnglePolygon.pointBetweenRays(a, rMin, rMax, this.angle) ) return true;
    if ( LimitedAnglePolygon.pointBetweenRays(b, rMin, rMax, this.angle) ) return true;

    // If both vertices are outside, test whether the edge collides with one (either) of the limiting rays
    if ( foundry.utils.lineSegmentIntersects(rMin.A, rMin.B, a, b) ) return true;
    if ( foundry.utils.lineSegmentIntersects(rMax.A, rMax.B, a, b) ) return true;

    // Otherwise, the edge can be discarded
    return false;
  }

  /* -------------------------------------------- */

  /**
   * Test whether a vertex lies between two boundary rays.
   * If the angle is greater than 180, test for points between rMax and rMin (inverse).
   * Otherwise, keep vertices that are between the rays directly.
   * @param {Point} point             The candidate point
   * @param {PolygonRay} rMin         The counter-clockwise bounding ray
   * @param {PolygonRay} rMax         The clockwise bounding ray
   * @param {number} angle            The angle being tested, in degrees
   * @returns {boolean}               Is the vertex between the two rays?
   */
  static pointBetweenRays(point, rMin, rMax, angle) {
    const ccw = foundry.utils.orient2dFast;
    if ( angle > 180 ) {
      const outside = (ccw(rMax.A, rMax.B, point) <= 0) && (ccw(rMin.A, rMin.B, point) >= 0);
      return !outside;
    }
    return (ccw(rMin.A, rMin.B, point) <= 0) && (ccw(rMax.A, rMax.B, point) >= 0);
  }
}

/**
 * @import {RayIntersection} from "../_types.mjs"
 * @import {LineIntersection} from "@common/utils/_types.mjs";
 */

/**
 * A ray for the purposes of computing sight and collision
 * Given points A[x,y] and B[x,y]
 *
 * Slope-Intercept form:
 * y = a + bx
 * y = A.y + ((B.y - A.Y) / (B.x - A.x))x
 *
 * Parametric form:
 * R(t) = (1-t)A + tB
 *
 * @param {Point} A      The origin of the Ray
 * @param {Point} B      The destination of the Ray
 */
export default class Ray {
  constructor(A, B) {

    /**
     * The origin point, {x, y}
     * @type {Point}
     */
    this.A = A;

    /**
     * The destination point, {x, y}
     * @type {Point}
     */
    this.B = B;

    /**
     * The origin y-coordinate
     * @type {number}
     */
    this.y0 = A.y;

    /**
     * The origin x-coordinate
     * @type {number}
     */
    this.x0 = A.x;

    /**
     * The horizontal distance of the ray, x1 - x0
     * @type {number}
     */
    this.dx = B.x - A.x;

    /**
     * The vertical distance of the ray, y1 - y0
     * @type {number}
     */
    this.dy = B.y - A.y;

    /**
     * The slope of the ray, dy over dx
     * @type {number}
     */
    this.slope = this.dy / this.dx;
  }

  /* -------------------------------------------- */
  /*  Attributes                                  */
  /* -------------------------------------------- */

  /**
   * The cached angle, computed lazily in Ray#angle
   * @type {number}
   */
  #angle;

  /**
   * The cached distance, computed lazily in Ray#distance
   * @type {number}
   */
  #distance;

  /* -------------------------------------------- */

  /**
   * The normalized angle of the ray in radians on the range (-PI, PI).
   * The angle is computed lazily (only if required) and cached.
   * @type {number}
   */
  get angle() {
    if ( this.#angle === undefined ) this.#angle = Math.atan2(this.dy, this.dx);
    return this.#angle;
  }

  set angle(value) {
    this.#angle = Number(value);
  }

  /* -------------------------------------------- */

  /**
   * A normalized bounding rectangle that encompasses the Ray
   * @type {PIXI.Rectangle}
   */
  get bounds() {
    return new PIXI.Rectangle(this.A.x, this.A.y, this.dx, this.dy).normalize();
  }

  /* -------------------------------------------- */

  /**
   * The distance (length) of the Ray in pixels.
   * The distance is computed lazily (only if required) and cached.
   * @type {number}
   */
  get distance() {
    if ( this.#distance === undefined ) this.#distance = Math.hypot(this.dx, this.dy);
    return this.#distance;
  }
  set distance(value) {
    this.#distance = Number(value);
  }

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /**
   * A factory method to construct a Ray from an origin point, an angle, and a distance
   * @param {number} x          The origin x-coordinate
   * @param {number} y          The origin y-coordinate
   * @param {number} radians    The ray angle in radians
   * @param {number} distance   The distance of the ray in pixels
   * @returns {Ray}             The constructed Ray instance
   */
  static fromAngle(x, y, radians, distance) {
    const dx = Math.cos(radians);
    const dy = Math.sin(radians);
    const ray = this.fromArrays([x, y], [x + (dx * distance), y + (dy * distance)]);
    ray.#angle = Math.normalizeRadians(radians); // Store the angle, cheaper to compute here
    ray.#distance = distance; // Store the distance, cheaper to compute here
    return ray;
  }

  /* -------------------------------------------- */

  /**
   * A factory method to construct a Ray from points in array format.
   * @param {number[]} A    The origin point [x,y]
   * @param {number[]} B    The destination point [x,y]
   * @returns {Ray}         The constructed Ray instance
   */
  static fromArrays(A, B) {
    return new this({x: A[0], y: A[1]}, {x: B[0], y: B[1]});
  }

  /* -------------------------------------------- */

  /**
   * Project the Array by some proportion of it's initial distance.
   * Return the coordinates of that point along the path.
   * @param {number} t    The distance along the Ray
   * @returns {Object}    The coordinates of the projected point
   */
  project(t) {
    return {
      x: this.A.x + (t * this.dx),
      y: this.A.y + (t * this.dy)
    };
  }

  /* -------------------------------------------- */

  /**
   * Create a Ray by projecting a certain distance towards a known point.
   * @param {Point} origin      The origin of the Ray
   * @param {Point} point       The point towards which to project
   * @param {number} distance   The distance of projection
   * @returns {Ray}
   */
  static towardsPoint(origin, point, distance) {
    const dx = point.x - origin.x;
    const dy = point.y - origin.y;
    const t = distance / Math.hypot(dx, dy);
    return new this(origin, {
      x: origin.x + (t * dx),
      y: origin.y + (t * dy)
    });
  }

  /* -------------------------------------------- */

  /**
   * Create a Ray by projecting a certain squared-distance towards a known point.
   * @param {Point} origin      The origin of the Ray
   * @param {Point} point       The point towards which to project
   * @param {number} distance2  The squared distance of projection
   * @returns {Ray}
   */
  static towardsPointSquared(origin, point, distance2) {
    const dx = point.x - origin.x;
    const dy = point.y - origin.y;
    const t = Math.sqrt(distance2 / (Math.pow(dx, 2) + Math.pow(dy, 2)));
    return new this(origin, {
      x: origin.x + (t * dx),
      y: origin.y + (t * dy)
    });
  }

  /* -------------------------------------------- */

  /**
   * Reverse the direction of the Ray, returning a second Ray
   * @returns {Ray}
   */
  reverse() {
    const r = new Ray(this.B, this.A);
    r.#distance = this.#distance;
    r.#angle = Math.PI - this.#angle;
    return r;
  }

  /* -------------------------------------------- */

  /**
   * Create a new ray which uses the same origin point, but a slightly offset angle and distance
   * @param {number} offset       An offset in radians which modifies the angle of the original Ray
   * @param {number} [distance]   A distance the new ray should project, otherwise uses the same distance.
   * @return {Ray}                A new Ray with an offset angle
   */
  shiftAngle(offset, distance) {
    return this.constructor.fromAngle(this.x0, this.y0, this.angle + offset, distance || this.distance);
  }

  /* -------------------------------------------- */

  /**
   * Find the point I[x,y] and distance t* on ray R(t) which intersects another ray.
   * @see {@link foundry.utils.lineSegmentIntersection}
   *
   * @param {[number, number, number, number]} coords An array of four coordinates `[x1, y1, x2, y2]`.
   * @returns {LineIntersection|null}   The intersection result from foundry.utils.lineSegmentIntersection
   *   or `null` if no intersection was found.
   */
  intersectSegment(coords) {
    return foundry.utils.lineSegmentIntersection(this.A, this.B, {x: coords[0], y: coords[1]}, {x: coords[2], y: coords[3]});
  }
}

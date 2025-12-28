/**
 * @import {LineCircleIntersection, LineIntersection} from "./_types.mjs";
 */

/**
 * Determine the relative orientation of three points in two-dimensional space.
 * The result is also an approximation of twice the signed area of the triangle defined by the three points.
 * This method is fast - but not robust against issues of floating point precision. Best used with integer coordinates.
 * Adapted from https://github.com/mourner/robust-predicates.
 * @param {Point} a     An endpoint of segment AB, relative to which point C is tested
 * @param {Point} b     An endpoint of segment AB, relative to which point C is tested
 * @param {Point} c     A point that is tested relative to segment AB
 * @returns {number}    The relative orientation of points A, B, and C
 *                      A positive value if the points are in counter-clockwise order (C lies to the left of AB)
 *                      A negative value if the points are in clockwise order (C lies to the right of AB)
 *                      Zero if the points A, B, and C are collinear.
 */
export function orient2dFast(a, b, c) {
  return (a.y - c.y) * (b.x - c.x) - (a.x - c.x) * (b.y - c.y);
}

/* -------------------------------------------- */

/**
 * Quickly test whether the line segment AB intersects with the line segment CD.
 * This method does not determine the point of intersection, for that use lineLineIntersection.
 * @param {Point} a                   The first endpoint of segment AB
 * @param {Point} b                   The second endpoint of segment AB
 * @param {Point} c                   The first endpoint of segment CD
 * @param {Point} d                   The second endpoint of segment CD
 * @returns {boolean}                 Do the line segments intersect?
 */
export function lineSegmentIntersects(a, b, c, d) {

  // First test the orientation of A and B with respect to CD to reject collinear cases
  const xa = foundry.utils.orient2dFast(a, b, c);
  const xb = foundry.utils.orient2dFast(a, b, d);
  if ( !xa && !xb ) return false;
  const xab = (xa * xb) <= 0;

  // Also require an intersection of CD with respect to AB
  const xcd = (foundry.utils.orient2dFast(c, d, a) * foundry.utils.orient2dFast(c, d, b)) <= 0;
  return xab && xcd;
}

/* -------------------------------------------- */

/**
 * An internal helper method for computing the intersection between two infinite-length lines.
 * Adapted from http://paulbourke.net/geometry/pointlineplane/.
 * @param {Point} a                   The first endpoint of segment AB
 * @param {Point} b                   The second endpoint of segment AB
 * @param {Point} c                   The first endpoint of segment CD
 * @param {Point} d                   The second endpoint of segment CD
 * @param {object} [options]          Options which affect the intersection test
 * @param {boolean} [options.t1=false]    Return the optional vector distance from C to D on CD
 * @returns {LineIntersection|null}   An intersection point, or null if no intersection occurred
 */
export function lineLineIntersection(a, b, c, d, {t1=false}={}) {

  // If either line is length 0, they cannot intersect
  if (((a.x === b.x) && (a.y === b.y)) || ((c.x === d.x) && (c.y === d.y))) return null;

  // Check denominator - avoid parallel lines where d = 0
  const dnm = ((d.y - c.y) * (b.x - a.x) - (d.x - c.x) * (b.y - a.y));
  if (dnm === 0) return null;

  // Vector distances
  const t0 = ((d.x - c.x) * (a.y - c.y) - (d.y - c.y) * (a.x - c.x)) / dnm;
  t1 = t1 ? ((b.x - a.x) * (a.y - c.y) - (b.y - a.y) * (a.x - c.x)) / dnm : undefined;

  // Return the point of intersection
  return {
    x: a.x + t0 * (b.x - a.x),
    y: a.y + t0 * (b.y - a.y),
    t0: t0,
    t1: t1
  }
}

/* -------------------------------------------- */

/**
 * An internal helper method for computing the intersection between two finite line segments.
 * Adapted from http://paulbourke.net/geometry/pointlineplane/
 * @param {Point} a                   The first endpoint of segment AB
 * @param {Point} b                   The second endpoint of segment AB
 * @param {Point} c                   The first endpoint of segment CD
 * @param {Point} d                   The second endpoint of segment CD
 * @param {number} [epsilon]          A small epsilon which defines a tolerance for near-equality
 * @returns {LineIntersection|null}   An intersection point, or null if no intersection occurred
 */
export function lineSegmentIntersection(a, b, c, d, epsilon=1e-8) {

  // If either line is length 0, they cannot intersect
  if (((a.x === b.x) && (a.y === b.y)) || ((c.x === d.x) && (c.y === d.y))) return null;

  // Check denominator - avoid parallel lines where d = 0
  const dnm = ((d.y - c.y) * (b.x - a.x) - (d.x - c.x) * (b.y - a.y));
  if (dnm === 0) return null;

  // Vector distance from a
  const t0 = ((d.x - c.x) * (a.y - c.y) - (d.y - c.y) * (a.x - c.x)) / dnm;
  if ( !Number.between(t0, 0-epsilon, 1+epsilon) ) return null;

  // Vector distance from c
  const t1 = ((b.x - a.x) * (a.y - c.y) - (b.y - a.y) * (a.x - c.x)) / dnm;
  if ( !Number.between(t1, 0-epsilon, 1+epsilon) ) return null;

  // Return the point of intersection and the vector distance from both line origins
  return {
    x: a.x + t0 * (b.x - a.x),
    y: a.y + t0 * (b.y - a.y),
    t0: Math.clamp(t0, 0, 1),
    t1: Math.clamp(t1, 0, 1)
  }
}

/* -------------------------------------------- */

/**
 * Determine the intersection between a line segment and a circle.
 * @param {Point} a                   The first vertex of the segment
 * @param {Point} b                   The second vertex of the segment
 * @param {Point} center              The center of the circle
 * @param {number} radius             The radius of the circle
 * @param {number} epsilon            A small tolerance for floating point precision
 * @returns {LineCircleIntersection}  The intersection of the segment AB with the circle
 */
export function lineCircleIntersection(a, b, center, radius, epsilon=1e-8) {
  const r2 = Math.pow(radius, 2);
  let intersections = [];

  // Test whether endpoint A is contained
  const ar2 = Math.pow(a.x - center.x, 2) + Math.pow(a.y - center.y, 2);
  const aInside = ar2 < r2 - epsilon;

  // Test whether endpoint B is contained
  const br2 = Math.pow(b.x - center.x, 2) + Math.pow(b.y - center.y, 2);
  const bInside = br2 < r2 - epsilon;

  // Find quadratic intersection points
  const contained = aInside && bInside;
  if ( !contained ) intersections = quadraticIntersection(a, b, center, radius, epsilon);

  // Return the intersection data
  return {
    aInside,
    bInside,
    contained,
    outside: !contained && !intersections.length,
    tangent: !aInside && !bInside && intersections.length === 1,
    intersections
  };
}

/* -------------------------------------------- */

/**
 * Identify the point closest to C on segment AB
 * @param {Point} c     The reference point C
 * @param {Point} a     Point A on segment AB
 * @param {Point} b     Point B on segment AB
 * @returns {Point}     The closest point to C on segment AB
 */
export function closestPointToSegment(c, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (( dx === 0 ) && ( dy === 0 )) {
    throw new Error("Zero-length segment AB not supported");
  }
  const u = (((c.x - a.x) * dx) + ((c.y - a.y) * dy)) / (dx * dx + dy * dy);
  if ( u < 0 ) return a;
  if ( u > 1 ) return b;
  else return {
    x: a.x + (u * dx),
    y: a.y + (u * dy)
  }
}

/* -------------------------------------------- */

/**
 * Determine the points of intersection between a line segment (p0,p1) and a circle.
 * There will be zero, one, or two intersections
 * See https://math.stackexchange.com/a/311956.
 * @param {Point} p0            The initial point of the line segment
 * @param {Point} p1            The terminal point of the line segment
 * @param {Point} center        The center of the circle
 * @param {number} radius       The radius of the circle
 * @param {number} [epsilon=0]  A small tolerance for floating point precision
 */
export function quadraticIntersection(p0, p1, center, radius, epsilon=0) {
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;

  // Quadratic terms where at^2 + bt + c = 0
  const a = Math.pow(dx, 2) + Math.pow(dy, 2);
  const b = (2 * dx * (p0.x - center.x)) + (2 * dy * (p0.y - center.y));
  const c = Math.pow(p0.x - center.x, 2) + Math.pow(p0.y - center.y, 2) - Math.pow(radius, 2);

  // Discriminant
  let disc2 = Math.pow(b, 2) - (4 * a * c);
  if ( disc2.almostEqual(0) ) disc2 = 0; // segment endpoint touches the circle; 1 intersection
  else if ( disc2 < 0 ) return []; // no intersections

  // Roots
  const disc = Math.sqrt(disc2);
  const t1 = (-b - disc) / (2 * a);

  // If t1 hits (between 0 and 1) it indicates an "entry"
  const intersections = [];
  if ( t1.between(0-epsilon, 1+epsilon) ) {
    intersections.push({
      x: p0.x + (dx * t1),
      y: p0.y + (dy * t1)
    });
  }
  if ( !disc2 ) return intersections; // 1 intersection

  // If t2 hits (between 0 and 1) it indicates an "exit"
  const t2 = (-b + disc) / (2 * a);
  if ( t2.between(0-epsilon, 1+epsilon) ) {
    intersections.push({
      x: p0.x + (dx * t2),
      y: p0.y + (dy * t2)
    });
  }
  return intersections;
}

/* -------------------------------------------- */

/**
 * Calculate the centroid non-self-intersecting closed polygon.
 * See https://en.wikipedia.org/wiki/Centroid#Of_a_polygon.
 * @param {Point[]|number[]} points    The points of the polygon
 * @returns {Point}                    The centroid of the polygon
 */
export function polygonCentroid(points) {
  const n = points.length;
  if ( n === 0 ) return {x: 0, y: 0};
  let x = 0;
  let y = 0;
  let a = 0;
  if ( typeof points[0] === "number" ) {
    let x0 = points[n - 2];
    let y0 = points[n - 1];
    for ( let i = 0; i < n; i += 2 ) {
      const x1 = points[i];
      const y1 = points[i + 1];
      const z = (x0 * y1) - (x1 * y0);
      x += (x0 + x1) * z;
      y += (y0 + y1) * z;
      x0 = x1;
      y0 = y1;
      a += z;
    }
  } else {
    let {x: x0, y: y0} = points[n - 1];
    for ( let i = 0; i < n; i++ ) {
      const {x: x1, y: y1} = points[i];
      const z = (x0 * y1) - (x1 * y0);
      x += (x0 + x1) * z;
      y += (y0 + y1) * z;
      x0 = x1;
      y0 = y1;
      a += z;
    }
  }
  a *= 3;
  x /= a;
  y /= a;
  return {x, y};
}

/* -------------------------------------------- */

/**
 * Test whether the circle given by the center and radius intersects the path (open or closed).
 * @param {Point[]|number[]} points    The points of the path
 * @param {boolean} close              If true, the edge from the last to the first point is tested
 * @param {Point} center               The center of the circle
 * @param {number} radius              The radius of the circle
 * @returns {boolean}                  Does the circle intersect the path?
 */
export function pathCircleIntersects(points, close, center, radius) {
  const n = points.length;
  if ( n === 0 ) return false;
  const {x: cx, y: cy} = center;
  const rr = radius * radius;
  let i;
  let x0;
  let y0;
  if ( typeof points[0] === "number" ) {
    if ( close ) {
      i = 0;
      x0 = points[n - 2];
      y0 = points[n - 1];
    } else {
      i = 2;
      x0 = points[0];
      y0 = points[1];
    }
    for ( ; i < n; i += 2 ) {
      const x1 = points[i];
      const y1 = points[i + 1];
      let dx = cx - x0;
      let dy = cy - y0;
      const nx = x1 - x0;
      const ny = y1 - y0;
      const t = Math.clamp(((dx * nx) + (dy * ny)) / ((nx * nx) + (ny * ny)), 0, 1);
      dx = (t * nx) - dx;
      dy = (t * ny) - dy;
      if ( (dx * dx) + (dy * dy) <= rr ) return true;
      x0 = x1;
      y0 = y1;
    }
  } else {
    if ( close ) {
      i = 0;
      ({x: x0, y: y0} = points[n - 1]);
    } else {
      i = 1;
      ({x: x0, y: y0} = points[0]);
    }
    for ( ; i < n; i++ ) {
      const {x: x1, y: y1} = points[i];
      let dx = cx - x0;
      let dy = cy - y0;
      const nx = x1 - x0;
      const ny = y1 - y0;
      const t = Math.clamp(((dx * nx) + (dy * ny)) / ((nx * nx) + (ny * ny)), 0, 1);
      dx = (t * nx) - dx;
      dy = (t * ny) - dy;
      if ( (dx * dx) + (dy * dy) <= rr ) return true;
      x0 = x1;
      y0 = y1;
    }
  }
  return false;
}

/* -------------------------------------------- */

/**
 * Test whether two circles (with position and radius) intersect.
 * @param {number} x0    x center coordinate of circle A.
 * @param {number} y0    y center coordinate of circle A.
 * @param {number} r0    radius of circle A.
 * @param {number} x1    x center coordinate of circle B.
 * @param {number} y1    y center coordinate of circle B.
 * @param {number} r1    radius of circle B.
 * @returns {boolean}    True if the two circles intersect, false otherwise.
 */
export function circleCircleIntersects(x0, y0, r0, x1, y1, r1) {
  return Math.hypot(x0 - x1, y0 - y1) <= (r0 + r1);
}


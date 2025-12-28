import PointSourcePolygon from "./shapes/source-polygon.mjs";

/**
 * An implementation of the Weiler Atherton algorithm for clipping polygons.
 * This currently only handles combinations that will not result in any holes.
 * Support may be added for holes in the future.
 *
 * This algorithm is faster than the Clipper library for this task because it relies on the unique properties of the
 * circle, ellipse, or convex simple clip object.
 * It is also more precise in that it uses the actual intersection points between the circle/ellipse and polygon,
 * instead of relying on the polygon approximation of the circle/ellipse to find the intersection points.
 *
 * For more explanation of the underlying algorithm, see:
 * https://en.wikipedia.org/wiki/Weiler%E2%80%93Atherton_clipping_algorithm
 * https://www.geeksforgeeks.org/weiler-atherton-polygon-clipping-algorithm
 * https://h-educate.in/weiler-atherton-polygon-clipping-algorithm/
 */
export default class WeilerAthertonClipper {
  /**
   * Construct a WeilerAthertonClipper instance used to perform the calculation.
   * @param {PIXI.Polygon} polygon    Polygon to clip
   * @param {PIXI.Rectangle|PIXI.Circle} clipObject  Object used to clip the polygon
   * @param {number} clipType         Type of clip to use
   * @param {object} clipOpts         Object passed to the clippingObject methods toPolygon and pointsBetween
   */
  constructor(polygon, clipObject, clipType, clipOpts) {
    if ( !polygon.isPositive ) {
      const msg = "WeilerAthertonClipper#constructor needs a subject polygon with a positive signed area.";
      throw new Error(msg);
    }
    clipType ??= this.constructor.CLIP_TYPES.INTERSECT;
    clipOpts ??= {};
    this.polygon = polygon;
    this.clipObject = clipObject;
    this.config = { clipType, clipOpts };
  }

  /**
   * The supported clip types.
   * Values are equivalent to those in ClipperLib.ClipType.
   * @enum {number}
   */
  static CLIP_TYPES = Object.freeze({
    INTERSECT: 0,
    UNION: 1
  });

  /**
   * The supported intersection types.
   * @enum {number}
   */
  static INTERSECTION_TYPES = Object.freeze({
    OUT_IN: -1,
    IN_OUT: 1,
    TANGENT: 0
  });

  /** @type {PIXI.Polygon} */
  polygon;

  /** @type {PIXI.Rectangle|PIXI.Circle} */
  clipObject;

  /**
   * Configuration settings
   * @type {object} [config]
   * @param {WeilerAthertonClipper.CLIP_TYPES} [config.clipType]     One of CLIP_TYPES
   * @param {object} [config.clipOpts]      Object passed to the clippingObject methods
   *                                        toPolygon and pointsBetween
   */
  config = {};

  /* -------------------------------------------- */

  /**
   * Union a polygon and clipObject using the Weiler Atherton algorithm.
   * @param {PIXI.Polygon} polygon                    Polygon to clip
   * @param {PIXI.Rectangle|PIXI.Circle} clipObject   Object to clip against the polygon
   * @param {object} clipOpts                         Options passed to the clipping object
   *                                                  methods toPolygon and pointsBetween
   * @returns {PIXI.Polygon[]}
   */
  static union(polygon, clipObject, clipOpts = {}) {
    return this.combine(polygon, clipObject, {clipType: this.CLIP_TYPES.UNION, ...clipOpts});
  }

  /* -------------------------------------------- */

  /**
   * Intersect a polygon and clipObject using the Weiler Atherton algorithm.
   * @param {PIXI.Polygon} polygon                    Polygon to clip
   * @param {PIXI.Rectangle|PIXI.Circle} clipObject   Object to clip against the polygon
   * @param {object} clipOpts                         Options passed to the clipping object
   *                                                  methods toPolygon and pointsBetween
   * @returns {PIXI.Polygon[]}
   */
  static intersect(polygon, clipObject, clipOpts = {}) {
    return this.combine(polygon, clipObject, {clipType: this.CLIP_TYPES.INTERSECT, ...clipOpts});
  }

  /* -------------------------------------------- */

  /**
   * Clip a given clipObject using the Weiler-Atherton algorithm.
   *
   * At the moment, this will return a single PIXI.Polygon in the array unless clipType is a union and the polygon
   * and clipObject do not overlap, in which case the [polygon, clipObject.toPolygon()] array will be returned.
   * If this algorithm is expanded in the future to handle holes, an array of polygons may be returned.
   *
   * @param {PIXI.Polygon} polygon                    Polygon to clip
   * @param {PIXI.Rectangle|PIXI.Circle} clipObject   Object to clip against the polygon
   * @param {object} options                          Options which configure how the union or intersection is computed
   * @param {number} options.clipType                 One of {@link foundry.canvas.geometry.WeilerAthertonClipper.CLIP_TYPES}
   * @param {boolean} [options.canMutate] If the WeilerAtherton constructor could mutate or not the subject polygon points
   *
   * - Any additional properties in `options` (besides clipType and canMutate)
   *   are captured by the rest operator (`...clipOpts`) and passed to the WeilerAthertonClipper constructor.
   *
   * @returns {PIXI.Polygon[]}                        Array of polygons and clipObjects
   */
  static combine(polygon, clipObject, {clipType, canMutate, ...clipOpts}={}) {
    if ( (clipType !== this.CLIP_TYPES.INTERSECT) && (clipType !== this.CLIP_TYPES.UNION) ) {
      throw new Error("The Weiler-Atherton clipping algorithm only supports INTERSECT or UNION clip types.");
    }
    if ( canMutate && !polygon.isPositive ) polygon.reverseOrientation();
    const wa = new this(polygon, clipObject, clipType, clipOpts);
    const trackingArray = wa.#buildPointTrackingArray();
    if ( !trackingArray.length ) return this.testForEnvelopment(polygon, clipObject, clipType, clipOpts);
    return wa.#combineNoHoles(trackingArray);
  }

  /* -------------------------------------------- */

  /**
   * Clip the polygon with the clipObject, assuming no holes will be created.
   * For a union or intersect with no holes, a single pass through the intersections will
   * build the resulting union shape.
   * @param {PolygonVertex[]} trackingArray   Array of linked points and intersections
   * @returns {[PIXI.Polygon]}
   */
  #combineNoHoles(trackingArray) {
    const clipType = this.config.clipType;
    const ln = trackingArray.length;
    let prevIx = trackingArray[ln - 1];
    let wasTracingPolygon = (prevIx.type === this.constructor.INTERSECTION_TYPES.OUT_IN) ^ clipType;
    const newPoly = new PIXI.Polygon();
    for ( let i = 0; i < ln; i += 1 ) {
      const ix = trackingArray[i];
      this.#processIntersection(ix, prevIx, wasTracingPolygon, newPoly);
      wasTracingPolygon = !wasTracingPolygon;
      prevIx = ix;
    }
    return [newPoly];
  }

  /* -------------------------------------------- */

  /**
   * Given an intersection and the previous intersection, fill the points
   * between the two intersections, in clockwise order.
   * @param {PolygonVertex} ix            Intersection to process
   * @param {PolygonVertex} prevIx        Previous intersection to process
   * @param {boolean} wasTracingPolygon   Whether we were tracing the polygon (true) or the clipObject (false).
   * @param {PIXI.Polygon} newPoly        The new polygon that results from this clipping operation
   */
  #processIntersection(ix, prevIx, wasTracingPolygon, newPoly) {
    const clipOpts = this.config.clipOpts;
    const pts = wasTracingPolygon ? ix.leadingPoints : this.clipObject.pointsBetween(prevIx, ix, clipOpts);
    for ( const pt of pts ) newPoly.addPoint(pt);
    newPoly.addPoint(ix);
  }

  /* -------------------------------------------- */

  /**
   * Test if one shape envelops the other. Assumes the shapes do not intersect.
   *  1. Polygon is contained within the clip object. Union: clip object; Intersect: polygon
   *  2. Clip object is contained with polygon. Union: polygon; Intersect: clip object
   *  3. Polygon and clip object are outside one another. Union: both; Intersect: null
   * @param {PIXI.Polygon} polygon                    Polygon to clip
   * @param {PIXI.Rectangle|PIXI.Circle} clipObject   Object to clip against the polygon
   * @param {WeilerAthertonClipper.CLIP_TYPES} clipType One of CLIP_TYPES
   * @param {object} clipOpts                         Clip options which are forwarded to toPolygon methods
   * @returns {PIXI.Polygon[]}  Returns the polygon, the clipObject.toPolygon(), both, or neither.
   */
  static testForEnvelopment(polygon, clipObject, clipType, clipOpts) {
    const points = polygon.points;
    if ( points.length < 6 ) return [];
    const union = clipType === this.CLIP_TYPES.UNION;

    // Option 1: Polygon contained within clipObject
    // We search for the first point of the polygon that is not on the boundary of the clip object.
    // One of these points can be used to determine whether the polygon is contained in the clip object.
    // If all points of the polygon are on the boundary of the clip object, which is either a circle
    // or a rectangle, then the polygon is contained within the clip object.
    let polygonInClipObject = true;
    for ( let i = 0; i < points.length; i += 2 ) {
      const point = { x: points[i], y: points[i + 1] };
      if ( !clipObject.pointIsOn(point) ) {
        polygonInClipObject = clipObject.contains(point.x, point.y);
        break;
      }
    }
    if ( polygonInClipObject ) return union ? [clipObject.toPolygon(clipOpts)] : [polygon];

    // Option 2: ClipObject contained within polygon
    const center = clipObject.center;

    // PointSourcePolygons need to have a bounds defined in order for polygon.contains to work.
    if ( polygon instanceof PointSourcePolygon ) polygon.bounds ??= polygon.getBounds();

    const clipObjectInPolygon = polygon.contains(center.x, center.y);
    if ( clipObjectInPolygon ) return union ? [polygon] : [clipObject.toPolygon(clipOpts)];

    // Option 3: Neither contains the other
    return union ? [polygon, clipObject.toPolygon(clipOpts)] : [];
  }

  /* -------------------------------------------- */

  /**
   * Construct an array of intersections between the polygon and the clipping object.
   * The intersections follow clockwise around the polygon.
   * Round all intersections and polygon vertices to the nearest pixel (integer).
   * @returns {Point[]}
   */
  #buildPointTrackingArray() {
    const labeledPoints = this.#buildIntersectionArray();
    if ( !labeledPoints.length ) return [];
    return WeilerAthertonClipper.#consolidatePoints(labeledPoints);
  }

  /* -------------------------------------------- */

  /**
   * Construct an array that holds all the points of the polygon with all the intersections with the clipObject
   * inserted, in correct position moving clockwise.
   * If an intersection and endpoint are nearly the same, prefer the intersection.
   * Intersections are labeled with isIntersection and type = out/in or in/out. Tangents are removed.
   * @returns {Point[]} Labeled array of points
   */
  #buildIntersectionArray() {
    const { polygon, clipObject } = this;
    const points = polygon.points;
    const ln = points.length;
    if ( ln < 6 ) return []; // Minimum 3 Points required

    // Need to start with a non-intersecting point on the polygon.
    let startIdx = -1;
    let a;
    for ( let i = 0; i < ln; i += 2 ) {
      a = { x: points[i], y: points[i + 1] };
      if ( !clipObject.pointIsOn(a) ) {
        startIdx = i;
        break;
      }
    }
    if ( !~startIdx ) return []; // All intersections, so all tangent

    // For each edge a|b, find the intersection point(s) with the clipObject.
    // Add intersections and endpoints to the pointsIxs array, taking care to avoid duplicating
    // points. For example, if the intersection equals a, add only the intersection, not both.
    let previousInside = clipObject.contains(a.x, a.y);
    let numPrevIx = 0;
    let lastIx = undefined;
    let secondLastIx = undefined;
    const pointsIxs = [a];
    const types = this.constructor.INTERSECTION_TYPES;
    const nIter = startIdx + ln + 2; // Add +2 to close the polygon.
    for ( let i = startIdx + 2; i < nIter; i += 2 ) {
      const j = i >= ln ? i % ln : i; // Circle back around the points as necessary.
      const b = { x: points[j], y: points[j + 1] };
      const ixs = clipObject.segmentIntersections(a, b);
      const ixsLn = ixs.length;
      let bIsIx = false;
      if ( ixsLn ) {
        bIsIx = b.x.almostEqual(ixs[ixsLn - 1].x) && b.y.almostEqual(ixs[ixsLn - 1].y);

        // If the intersection equals the current b, get that intersection next iteration.
        if ( bIsIx ) ixs.pop();

        // Determine whether the intersection is out-->in or in-->out
        numPrevIx += ixs.length;
        for ( const ix of ixs ) {
          ix.isIntersection = true;
          ix.type = lastIx ? -lastIx.type : previousInside ? types.IN_OUT : types.OUT_IN;
          secondLastIx = lastIx;
          lastIx = ix;
        }
        pointsIxs.push(...ixs);
      }

      // If b is an intersection, we will return to it next iteration.
      if ( bIsIx ) {
        a = b;
        continue;
      }

      // Each intersection represents a move across the clipObject border.
      // Count them and determine if we are now inside or outside the clipObject.
      if ( numPrevIx ) {
        const isInside = clipObject.contains(b.x, b.y);
        const changedSide = isInside ^ previousInside;
        const isOdd = numPrevIx & 1;

        // If odd number of intersections, should switch. e.g., outside --> ix --> inside
        // If even number of intersections, should stay same. e.g., outside --> ix --> ix --> outside.
        if ( isOdd ^ changedSide ) {
          if ( numPrevIx === 1 ) lastIx.isIntersection = false;
          else {
            secondLastIx.isIntersection = false;
            lastIx.type = secondLastIx.type;
          }
        }
        previousInside = isInside;
        numPrevIx = 0;
        secondLastIx = undefined;
        lastIx = undefined;
      }
      pointsIxs.push(b);
      a = b;
    }
    return pointsIxs;
  }

  /* -------------------------------------------- */

  /**
   * Given an array of labeled points, consolidate into a tracking array of intersections,
   * where each intersection contains its array of leadingPoints.
   * @param {Point[]} labeledPoints   Array of points, from _buildLabeledIntersectionsArray
   * @returns {Point[]} Array of intersections
   */
  static #consolidatePoints(labeledPoints) {

    // Locate the first intersection
    const startIxIdx = labeledPoints.findIndex(pt => pt.isIntersection);
    if ( !~startIxIdx ) return []; // No intersections, so no tracking array
    const labeledLn = labeledPoints.length;
    let leadingPoints = [];
    const trackingArray = [];

    // Closed polygon, so use the last point to circle back
    for ( let i = 0; i < labeledLn; i += 1 ) {
      const j = (i + startIxIdx) % labeledLn;
      const pt = labeledPoints[j];
      if ( pt.isIntersection ) {
        pt.leadingPoints = leadingPoints;
        leadingPoints = [];
        trackingArray.push(pt);
      } else leadingPoints.push(pt);
    }

    // Add leading points to first intersection
    trackingArray[0].leadingPoints = leadingPoints;
    return trackingArray;
  }
}

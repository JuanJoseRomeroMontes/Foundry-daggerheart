/**
 * @import {PlaceableObject} from "@client/canvas/placeables/_module.mjs";
 * @import {WallThresholdData} from "@common/documents/_types.mjs";
 * @import {Point} from "@common/_types.mjs";
 * @import {WallDirection, WallRestrictionType, WallSenseType} from "@common/constants.mjs";
 * @import {LineIntersection} from "@common/utils/_types.mjs";
 * @import PolygonVertex from "./vertex.mjs";
 * @import {EdgeType} from "../_types.mjs";
 */

/**
 * A data structure used to represent potential edges used by the ClockwiseSweepPolygon.
 * Edges are not polygon-specific, meaning they can be reused across many polygon instances.
 */
export default class Edge {
  /**
   * Construct an Edge by providing the following information.
   * @param {Point} a                     The first endpoint of the edge
   * @param {Point} b                     The second endpoint of the edge
   * @param {object} [options]            Additional options which describe the edge
   * @param {string} [options.id]                 A string used to uniquely identify this edge
   * @param {PlaceableObject} [options.object]    A PlaceableObject that is responsible for this edge, if any
   * @param {EdgeType} [options.type]             The type of edge
   * @param {WallSenseType} [options.light]       How this edge restricts light
   * @param {WallSenseType} [options.move]        How this edge restricts movement
   * @param {WallSenseType} [options.sight]       How this edge restricts sight
   * @param {WallSenseType} [options.sound]       How this edge restricts sound
   * @param {WallDirection} [options.direction=0] A direction of effect for the edge
   * @param {WallThresholdData} [options.threshold] Configuration of threshold data for this edge
   * @param {number} [options.priority=0] A source priority for this edge. Typically zero unless this edge was
   *                                      contributed by a high-priority source.
   */
  constructor(a, b, {id, object, direction, type, light, move, sight, sound, threshold, priority}={}) {
    this.a = new PIXI.Point(a.x, a.y);
    this.b = new PIXI.Point(b.x, b.y);
    this.id = id ?? object?.id ?? undefined;
    this.object = object;
    this.type = type || "wall";
    this.direction = direction ?? CONST.WALL_DIRECTIONS.BOTH;
    this.light = light ?? CONST.WALL_SENSE_TYPES.NONE;
    this.move = move ?? CONST.WALL_SENSE_TYPES.NONE;
    this.sight = sight ?? CONST.WALL_SENSE_TYPES.NONE;
    this.sound = sound ?? CONST.WALL_SENSE_TYPES.NONE;
    this.threshold = threshold;
    this.priority = priority ?? 0;

    // Record the edge orientation arranged from top-left to bottom-right
    const isSE = b.x === a.x ? b.y > a.y : b.x > a.x;
    if ( isSE ) {
      this.nw = a;
      this.se = b;
    }
    else {
      this.nw = b;
      this.se = a;
    }
    this.bounds = new PIXI.Rectangle(this.nw.x, this.nw.y, this.se.x - this.nw.x, this.se.y - this.nw.y);
  }

  /* -------------------------------------------- */

  /**
   * The first endpoint of the edge.
   * @type {PIXI.Point}
   */
  a;

  /**
   * The second endpoint of the edge.
   * @type {PIXI.Point}
   */
  b;

  /**
   * The endpoint of the edge which is oriented towards the top-left.
   */
  nw;

  /**
   * The endpoint of the edge which is oriented towards the bottom-right.
   */
  se;

  /**
   * The rectangular bounds of the edge. Used by the quadtree.
   * @type {PIXI.Rectangle}
   */
  bounds;

  /**
   * The direction of effect for the edge.
   * @type {WallDirection}
   */
  direction;

  /**
   * A string used to uniquely identify this edge.
   * @type {string}
   */
  id;

  /**
   * How this edge restricts light.
   * @type {WallSenseType}
   */
  light;

  /**
   * How this edge restricts movement.
   * @type {WallSenseType}
   */
  move;

  /**
   * How this edge restricts sight.
   * @type {WallSenseType}
   */
  sight;

  /**
   * How this edge restricts sound.
   * @type {WallSenseType}
   */
  sound;

  /**
   * Specialized threshold data for this edge.
   * @type {WallThresholdData}
   */
  threshold;

  /**
   * Record other edges which this one intersects with.
   * @type {{edge: Edge, intersection: LineIntersection}[]}
   */
  intersections = [];

  /**
   * A PolygonVertex instance.
   * Used as part of ClockwiseSweepPolygon computation.
   * @type {PolygonVertex}
   */
  vertexA;

  /**
   * A PolygonVertex instance.
   * Used as part of ClockwiseSweepPolygon computation.
   * @type {PolygonVertex}
   */
  vertexB;

  /* -------------------------------------------- */

  /**
   * Is this edge limited for a particular type?
   * @param {WallRestrictionType} type
   * @returns {boolean}
   */
  isLimited(type) {
    return this[type] === CONST.WALL_SENSE_TYPES.LIMITED;
  }

  /* -------------------------------------------- */

  /**
   * Create a copy of the Edge which can be safely mutated.
   * @returns {Edge}
   */
  clone() {
    const clone = new this.constructor(this.a, this.b, this);
    clone.intersections = [...this.intersections];
    clone.vertexA = this.vertexA;
    clone.vertexB = this.vertexB;
    return clone;
  }

  /* -------------------------------------------- */

  /**
   * Get an intersection point between this Edge and another.
   * @param {Edge} other
   * @returns {LineIntersection|void}
   */
  getIntersection(other) {
    if ( this === other ) return;
    const {a: a0, b: b0} = this;
    const {a: a1, b: b1} = other;

    // Ignore edges which share an endpoint
    if ( a0.equals(a1) || a0.equals(b1) || b0.equals(a1) || b0.equals(b1) ) return;

    // Initial fast CCW test for intersection
    if ( !foundry.utils.lineSegmentIntersects(a0, b0, a1, b1) ) return;

    // Slower computation of intersection point
    const i = foundry.utils.lineLineIntersection(a0, b0, a1, b1, {t1: true});
    if ( !i ) return;  // Eliminates co-linear lines, theoretically should not be necessary but just in case
    return i;
  }

  /* -------------------------------------------- */

  /**
   * Test whether to apply a proximity threshold to this edge.
   * If the proximity threshold is met, this edge excluded from perception calculations.
   * @param {string} sourceType     Sense type for the source
   * @param {Point} sourceOrigin    The origin or position of the source on the canvas
   * @param {number} [externalRadius=0] The external radius of the source
   * @returns {boolean}             True if the edge has a threshold greater than 0 for the source type,
   *                                and the source type is within that distance.
   */
  applyThreshold(sourceType, sourceOrigin, externalRadius=0) {
    const d = this.threshold?.[sourceType];
    const t = this[sourceType];
    if ( !d || (t < CONST.WALL_SENSE_TYPES.PROXIMITY) ) return false; // Threshold behavior does not apply
    const proximity = t === CONST.WALL_SENSE_TYPES.PROXIMITY;
    const pt = foundry.utils.closestPointToSegment(sourceOrigin, this.a, this.b);
    const sourceDistance = Math.hypot(pt.x - sourceOrigin.x, pt.y - sourceOrigin.y);
    return proximity ? Math.max(sourceDistance - externalRadius, 0) < d : (sourceDistance + externalRadius) > d;
  }

  /* -------------------------------------------- */

  /**
   * Determine the orientation of this Edge with respect to a reference point.
   * @param {Point} point       Some reference point, relative to which orientation is determined
   * @returns {number}          An orientation in CONST.WALL_DIRECTIONS which indicates whether the Point is left,
   *                            right, or collinear (both) with the Edge
   */
  orientPoint(point) {
    const orientation = foundry.utils.orient2dFast(this.a, this.b, point);
    if ( orientation === 0 ) return CONST.WALL_DIRECTIONS.BOTH;
    return orientation < 0 ? CONST.WALL_DIRECTIONS.LEFT : CONST.WALL_DIRECTIONS.RIGHT;
  }

  /* -------------------------------------------- */
  /*  Intersection Management                     */
  /* -------------------------------------------- */

  /**
   * Identify intersections between a provided iterable of edges.
   * @param {Iterable<Edge>} edges    An iterable of edges
   */
  static identifyEdgeIntersections(edges) {

    // Sort edges by their north-west x value, breaking ties with the south-east x value
    const sorted = [];
    for ( const edge of edges ) {
      edge.intersections.length = 0; // Clear prior intersections
      sorted.push(edge);
    }
    sorted.sort((e1, e2) => (e1.nw.x - e2.nw.x) || (e1.se.x - e2.se.x));

    // Iterate over all known edges, identifying intersections
    const ln = sorted.length;
    for ( let i=0; i<ln; i++ ) {
      const e1 = sorted[i];
      for ( let j=i+1; j<ln; j++ ) {
        const e2 = sorted[j];
        if ( e2.nw.x > e1.se.x ) break; // Segment e2 is entirely right of segment e1
        e1.recordIntersections(e2);
      }
    }
  }

  /* -------------------------------------------- */

  /**
   * Record the intersections between two edges.
   * @param {Edge} other          Another edge to test and record
   */
  recordIntersections(other) {
    if ( other === this ) return;
    const i = this.getIntersection(other);
    if ( !i ) return;
    this.intersections.push({edge: other, intersection: i});
    other.intersections.push({edge: this, intersection: {x: i.x, y: i.y, t0: i.t1, t1: i.t0}});
  }

  /* -------------------------------------------- */

  /**
   * Remove intersections of this edge with all other edges.
   */
  removeIntersections() {
    for ( const {edge: other} of this.intersections ) {
      other.intersections.findSplice(e => e.edge === this);
    }
    this.intersections.length = 0;
  }
}

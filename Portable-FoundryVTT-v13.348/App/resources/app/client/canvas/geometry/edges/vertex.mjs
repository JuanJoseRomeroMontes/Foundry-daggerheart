/**
 * @import {LineIntersection} from "@common/utils/_types.mjs";
 */

/**
 * @typedef PolygonVertexOptions
 * @property {number} [distance]       A known distance from a polygon origin to this vertex.
 * @property {number} [index]          An integer index of this vertex in an ordered sweep.
 * @property {boolean} [round=true]    Whether to round the input {x,y} coordinates provided.
 */

/**
 * A specialized point data structure used to represent vertices in the context of the ClockwiseSweepPolygon.
 * This class is not designed or intended for use outside of that context.
 */
export default class PolygonVertex {
  /**
   * Construct a PolygonVertex by providing {x, y} coordinates and vertex options.
   * @param {number} x                          The x-coordinate of the vertex
   * @param {number} y                          The y-coordinate of the vertex
   * @param {PolygonVertexOptions} [options]    Options which modify vertex context or behavior
   */
  constructor(x, y, {distance, index, round=true}={}) {
    const rx = Math.round(x);
    const ry = Math.round(y);
    this.x = round ? rx : x;
    this.y = round ? ry : y;
    this.key = PolygonVertex.getKey(rx, ry);
    this._distance = distance;
    this._index = index;
  }

  /**
   * The effective maximum texture size that Foundry VTT "ever" has to worry about.
   * @type {number}
   */
  static #MAX_TEXTURE_SIZE = Math.pow(2, 16);

  /**
   * Determine the sort key to use for this vertex, arranging points from north-west to south-east.
   * @param {number} x    The x-coordinate
   * @param {number} y    The y-coordinate
   * @returns {number}    The key used to identify the vertex
   */
  static getKey(x, y) {
    return (this.#MAX_TEXTURE_SIZE * x) + y;
  }

  /**
   * The set of edges which connect to this vertex.
   * This set is initially empty and populated later after vertices are de-duplicated.
   * @type {EdgeSet}
   */
  edges = new Set();

  /**
   * The subset of edges which continue clockwise from this vertex.
   * @type {EdgeSet}
   */
  cwEdges = new Set();

  /**
   * The subset of edges which continue counter-clockwise from this vertex.
   * @type {EdgeSet}
   */
  ccwEdges = new Set();

  /**
   * The set of vertices collinear to this vertex
   * @type {Set<PolygonVertex>}
   */
  collinearVertices = new Set();

  /**
   * Is this vertex an endpoint of one or more edges?
   * @type {boolean}
   */
  isEndpoint;

  /**
   * Does this vertex have a single counterclockwise limiting edge?
   * @type {boolean}
   */
  isLimitingCCW;

  /**
   * Does this vertex have a single clockwise limiting edge?
   * @type {boolean}
   */
  isLimitingCW;

  /**
   * Does this vertex have non-limited edges or 2+ limited edges counterclockwise?
   * @type {boolean}
   */
  isBlockingCCW;

  /**
   * Does this vertex have non-limited edges or 2+ limited edges clockwise?
   * @type {boolean}
   */
  isBlockingCW;

  /**
   * Does this vertex result from an internal collision?
   * @type {boolean}
   */
  isInternal = false;

  /**
   * The maximum restriction imposed by this vertex.
   * @type {number}
   */
  restriction = 0;

  /**
   * Record whether this PolygonVertex has been visited in the sweep
   * @type {boolean}
   * @internal
   */
  _visited = false;

  /**
   * The distance from a polygon origin to this vertex.
   * @type {number|undefined}
   * @internal
   */
  _distance;

  /**
   * The squared distance from a polygon origin to this vertex.
   * @type {number|undefined}
   * @internal
   */
  _d2;

  /**
   * The integer index of this vertex in an ordered sweep.
   * @type {number|undefined}
   * @internal
   */
  _index;

  /**
   * The angle of the ray from the origin to this vertex.
   * @type {number|undefined}
   * @internal
   */
  _angle;

  /**
   * The line intersection coordinates of the two edges that create this vertex.
   * @type {LineIntersection|undefined}
   * @internal
   */
  _intersectionCoordinates;

  /* -------------------------------------------- */

  /**
   * Is this vertex limited in type?
   * @returns {boolean}
   */
  get isLimited() {
    return this.restriction === CONST.WALL_SENSE_TYPES.LIMITED;
  }

  /* -------------------------------------------- */

  /**
   * Associate an edge with this vertex.
   * @param {Edge} edge             The edge being attached
   * @param {number} orientation    The orientation of the edge with respect to the origin
   * @param {string} type           The restriction type of polygon being created
   */
  attachEdge(edge, orientation, type) {
    this.edges.add(edge);
    this.restriction = Math.max(this.restriction ?? 0, edge[type]);
    if ( orientation <= 0 ) this.cwEdges.add(edge);
    if ( orientation >= 0 ) this.ccwEdges.add(edge);
    this.#updateFlags(type);
  }

  /* -------------------------------------------- */

  /**
   * Update flags for whether this vertex is limiting or blocking in certain direction.
   * @param {string} type
   */
  #updateFlags(type) {
    const classify = edges => {
      const s = edges.size;
      if ( s === 0 ) return {isLimiting: false, isBlocking: false};
      if ( s > 1 ) return {isLimiting: false, isBlocking: true};
      else {
        const isLimiting = edges.first().isLimited(type);
        return {isLimiting, isBlocking: !isLimiting};
      }
    };

    // Flag endpoint
    this.isEndpoint = this.edges.some(edge => {
      return (edge.vertexA || edge.a).equals(this) || (edge.vertexB || edge.b).equals(this);
    });

    // Flag CCW edges
    const ccwFlags = classify(this.ccwEdges);
    this.isLimitingCCW = ccwFlags.isLimiting;
    this.isBlockingCCW = ccwFlags.isBlocking;

    // Flag CW edges
    const cwFlags = classify(this.cwEdges);
    this.isLimitingCW = cwFlags.isLimiting;
    this.isBlockingCW = cwFlags.isBlocking;
  }

  /* -------------------------------------------- */

  /**
   * Is this vertex the same point as some other vertex?
   * @param {PolygonVertex} other   Some other vertex
   * @returns {boolean}             Are they the same point?
   */
  equals(other) {
    return this.key === other.key;
  }

  /* -------------------------------------------- */

  /**
   * Construct a PolygonVertex instance from some other Point structure.
   * @param {Point} point                     The point
   * @param {PolygonVertexOptions} [options]  Additional options that apply to this vertex
   * @returns {PolygonVertex}                 The constructed vertex
   */
  static fromPoint(point, options) {
    return new this(point.x, point.y, options);
  }
}

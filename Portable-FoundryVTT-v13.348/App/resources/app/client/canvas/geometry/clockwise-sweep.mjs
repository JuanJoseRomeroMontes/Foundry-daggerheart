import PointSourcePolygon from "./shapes/source-polygon.mjs";
import PolygonVertex from "./edges/vertex.mjs";
import CollisionResult from "./edges/collision.mjs";
import Ray from "./shapes/ray.mjs";

/**
 * @import {VertexMap} from "./_types.mjs"
 * @import {EdgeSet} from "./_types.mjs"
 * @import {PolygonRay} from "./_types.mjs"
 * @import {ClockwiseSweepPolygonConfig} from "./_types.mjs"
 */

/**
 * A PointSourcePolygon implementation that uses CCW (counter-clockwise) geometry orientation.
 * Sweep around the origin, accumulating collision points based on the set of active walls.
 * This algorithm was created with valuable contributions from https://github.com/caewok
 * @extends {PointSourcePolygon<PointSourcePolygonConfig & ClockwiseSweepPolygonConfig>}
 */
export default class ClockwiseSweepPolygon extends PointSourcePolygon {

  /**
   * A mapping of vertices which define potential collision points
   * @type {VertexMap}
   */
  vertices = new Map();

  /**
   * The set of edges which define potential boundaries of the polygon
   * @type {EdgeSet}
   */
  edges = new Set();

  /**
   * A collection of rays which are fired at vertices
   * @type {PolygonRay[]}
   */
  rays = [];

  /**
   * The squared maximum distance of a ray that is needed for this Scene.
   * @type {number}
   */
  #rayDistance2;

  /* -------------------------------------------- */
  /*  Getters/Setters                             */
  /* -------------------------------------------- */

  /**
   * Is this polygon using inner bounds?
   * @type {boolean}
   */
  get useInnerBounds() {
    return this.#useInnerBounds;
  }

  #useInnerBounds = false;

  /* -------------------------------------------- */
  /*  Initialization                              */
  /* -------------------------------------------- */

  /** @inheritDoc */
  initialize(origin, config) {
    super.initialize(origin, config);

    // Compute ray distance 2
    this.#rayDistance2 = Math.pow(canvas.dimensions.maxR, 2);

    // Define priority and validate it is a numeric
    config.priority ??= 0;
    if ( !Number.isNumeric(config.priority) ) throw new Error("config.priority must be a number.");

    // Determine edge types if necessary
    config.edgeTypes ??= this._determineEdgeTypes(config.type, config.priority, config);

    // For convenience and speed up access
    this.#useInnerBounds = (config.edgeTypes?.innerBounds?.mode === 2);

    // Compute the bounding box
    config.boundingBox ??= this._defineBoundingBox();
  }

  /* -------------------------------------------- */

  /**
   * Determine the edge types and their manner of inclusion for this polygon instance.
   * @param {string} type
   * @param {number} priority
   * @param {object} [config={}]           Optional polygon config which may include deprecated properties
   * @returns {Record<EdgeType, {priority: number, mode: 0|1|2}>}
   * @protected
   */
  _determineEdgeTypes(type, priority, config={}) {
    const et = config.edgeOptions ?? {};
    const edgeTypes = {};
    const addEdgeType = (name, fallback, p=priority) => {
      const v = et[name];
      if ( v === false ) return;
      else edgeTypes[name] = {mode: fallback, priority: p};
    };

    addEdgeType("wall", 1, -Infinity);
    let boundsType = et.outerBounds === false ? null : "outerBounds";


    /** @deprecated since v13 */
    if ( "useInnerBounds" in config ) {
      foundry.utils.logCompatibilityWarning(
        "config.useInnerBounds is now deprecated, replaced by edgeTypes polygon configuration behaviors.",
        {since: 13, until: 15, once: true}
      );
      if ( config.useInnerBounds && et.innerBounds !== false ) boundsType = "innerBounds";
      delete config.useInnerBounds;
    }

    switch ( type ) {
      case "universal": // TODO: deprecate universal type in v14
        delete edgeTypes.wall;
        break;

      case "sight":
        const insideScene = canvas.dimensions.sceneRect.contains(this.origin.x, this.origin.y);
        if ( insideScene && (et.innerBounds !== false) ) boundsType = "innerBounds";
        addEdgeType("darkness", 1);
        break;

      case "light":
        addEdgeType("darkness", 1);
        break;

      case "darkness":
        addEdgeType("light", 1, priority + 1);
        break;
    }

    if ( boundsType ) edgeTypes[boundsType] = {mode: 2, priority: -Infinity};

    /** @deprecated since v13 */
    if ( "includeDarkness" in config ) {
      foundry.utils.logCompatibilityWarning(
        "config.includeDarkness is now deprecated, replaced by edgeTypes polygon configuration behaviors.",
        {since: 13, until: 15, once: true}
      );
      if ( config.includeDarkness ) addEdgeType("darkness", 1);
      delete config.includeDarkness;
    }

    return edgeTypes;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  clone() {
    const poly = super.clone();
    for ( const attr of ["vertices", "edges", "rays", "#rayDistance2"] ) { // Shallow clone only
      poly[attr] = this[attr];
    }
    return poly;
  }

  /* -------------------------------------------- */
  /*  Computation                                 */
  /* -------------------------------------------- */

  /** @inheritdoc */
  _compute() {

    // Clear prior data
    this.points = [];
    this.rays = [];
    this.vertices.clear();
    this.edges.clear();

    // Step 1 - Identify candidate edges
    this._identifyEdges();

    // Step 2 - Construct vertex mapping
    this._identifyVertices();

    // Step 3 - Radial sweep over endpoints
    this._executeSweep();

    // Step 4 - Constrain with boundary shapes
    this._constrainBoundaryShapes();
  }

  /* -------------------------------------------- */
  /*  Edge Configuration                          */
  /* -------------------------------------------- */

  /**
   * Retrieves the super-set of walls that could potentially apply to this polygon.
   * Utilizes a custom collision test and the Quadtree to obtain candidate edges efficiently.
   * @protected
   */
  _identifyEdges() {
    const bounds = this.config.boundingBox;
    const edgeTypes = this.config.edgeTypes;

    // Prepare collision function
    const collisionTest = edge => this._testEdgeInclusion(edge, edgeTypes);

    // Retrieve only the edges that intersect with the bounding box and pass the collision test
    const matchedEdges = canvas.edges.getEdges(bounds, {
      includeOuterBounds: !this.useInnerBounds,
      includeInnerBounds: this.useInnerBounds,
      collisionTest
    });

    // Add identified edges to the set
    for ( const edge of matchedEdges ) this.edges.add(edge.clone());
  }

  /* -------------------------------------------- */

  /**
   * Test whether a wall should be included in the computed polygon for a given origin and type
   * @param {Edge} edge                     The Edge being considered
   * @param {Record<EdgeType, {priority: number, mode: 0|1|2}>} edgeTypes Which types of edges are being used?
   *                                                                        0=no, 1=maybe, 2=always
   * @returns {boolean}                     Should the edge be included?
   * @protected
   */
  _testEdgeInclusion(edge, edgeTypes) {
    const { type, boundaryShapes, useThreshold, wallDirectionMode, externalRadius } = this.config;

    // Only include edges of the appropriate type
    const edgeType = edgeTypes[edge.type];
    const m = edgeType?.mode;
    if ( !m ) return false;
    if ( m === 2 ) return true;

    // Exclude edges with a lower priority than required for this polygon
    if ( edge.priority < edgeType.priority ) return false;

    // Specific boundary shapes may impose additional requirements
    for ( const shape of boundaryShapes ) {
      if ( shape._includeEdge && !shape._includeEdge(edge.a, edge.b) ) return false;
    }

    // Ignore edges which do not block this polygon type
    if ( edge[type] === CONST.WALL_SENSE_TYPES.NONE ) return false;

    // Ignore edges which are collinear with the origin
    const side = edge.orientPoint(this.origin);
    if ( !side ) return false;

    // Ignore one-directional walls which are facing away from the origin
    const wdm = PointSourcePolygon.WALL_DIRECTION_MODES;
    if ( edge.direction && (wallDirectionMode !== wdm.BOTH) ) {
      if ( (wallDirectionMode === wdm.NORMAL) === (side === edge.direction) ) return false;
    }

    // Ignore threshold walls which do not satisfy their required proximity
    if ( useThreshold ) return !edge.applyThreshold(type, this.origin, externalRadius);
    return true;
  }

  /* -------------------------------------------- */

  /**
   * Compute the aggregate bounding box which is the intersection of all boundary shapes.
   * Round and pad the resulting rectangle by 1 pixel to ensure it always contains the origin.
   * @returns {PIXI.Rectangle}
   * @protected
   */
  _defineBoundingBox() {
    let b = this.useInnerBounds ? canvas.dimensions.sceneRect : canvas.dimensions.rect;
    for ( const shape of this.config.boundaryShapes ) {
      b = b.intersection(shape.getBounds());
    }
    return new PIXI.Rectangle(b.x, b.y, b.width, b.height).normalize().ceil().pad(1);
  }

  /* -------------------------------------------- */
  /*  Vertex Identification                       */
  /* -------------------------------------------- */

  /**
   * Consolidate all vertices from identified edges and register them as part of the vertex mapping.
   * @protected
   */
  _identifyVertices() {
    const edgeMap = new Map();
    for ( const edge of this.edges ) {
      edgeMap.set(edge.id, edge);

      // Create or reference vertex A
      const ak = PolygonVertex.getKey(edge.a.x, edge.a.y);
      if ( this.vertices.has(ak) ) edge.vertexA = this.vertices.get(ak);
      else {
        edge.vertexA = new PolygonVertex(edge.a.x, edge.a.y);
        this.vertices.set(ak, edge.vertexA);
      }

      // Create or reference vertex B
      const bk = PolygonVertex.getKey(edge.b.x, edge.b.y);
      if ( this.vertices.has(bk) ) edge.vertexB = this.vertices.get(bk);
      else {
        edge.vertexB = new PolygonVertex(edge.b.x, edge.b.y);
        this.vertices.set(bk, edge.vertexB);
      }

      // Learn edge orientation with respect to the origin and ensure B is clockwise of A
      const o = foundry.utils.orient2dFast(this.origin, edge.vertexA, edge.vertexB);
      if ( o > 0 ) Object.assign(edge, {vertexA: edge.vertexB, vertexB: edge.vertexA}); // Reverse vertices
      if ( o !== 0 ) { // Attach non-collinear edges
        edge.vertexA.attachEdge(edge, -1, this.config.type);
        edge.vertexB.attachEdge(edge, 1, this.config.type);
      }
    }

    // Add edge intersections
    this._identifyIntersections(edgeMap);
  }

  /* -------------------------------------------- */

  /**
   * Add additional vertices for intersections between edges.
   * @param {Map<string, Edge>} edgeMap
   * @protected
   */
  _identifyIntersections(edgeMap) {
    const processed = new Set();
    for ( const edge of this.edges ) {
      for ( const x of edge.intersections ) {

        // Is the intersected edge also included in the polygon?
        const other = edgeMap.get(x.edge.id);
        if ( !other || processed.has(other) ) continue;
        const i = x.intersection;

        // Register the intersection point as a vertex
        const vk = PolygonVertex.getKey(Math.round(i.x), Math.round(i.y));
        let v = this.vertices.get(vk);
        if ( !v ) {
          v = new PolygonVertex(i.x, i.y);
          v._intersectionCoordinates = i;
          this.vertices.set(vk, v);
        }

        // Attach edges to the intersection vertex
        // Due to rounding, it is possible for an edge to be completely cw or ccw or only one of the two
        // We know from _identifyVertices that vertex B is clockwise of vertex A for every edge.
        // It is important that we use the true intersection coordinates (i) for this orientation test.
        if ( !v.edges.has(edge) ) {
          const dir = foundry.utils.orient2dFast(this.origin, edge.vertexB, i) < 0 ? 1    // Edge is fully CCW of v
            : (foundry.utils.orient2dFast(this.origin, edge.vertexA, i) > 0 ? -1 : 0);    // Edge is fully CW of v
          v.attachEdge(edge, dir, this.config.type);
        }
        if ( !v.edges.has(other) ) {
          const dir = foundry.utils.orient2dFast(this.origin, other.vertexB, i) < 0 ? 1   // Other is fully CCW of v
            : (foundry.utils.orient2dFast(this.origin, other.vertexA, i) > 0 ? -1 : 0);   // Other is fully CW of v
          v.attachEdge(other, dir, this.config.type);
        }
      }
      processed.add(edge);
    }
  }

  /* -------------------------------------------- */
  /*  Radial Sweep                                */
  /* -------------------------------------------- */

  /**
   * Execute the sweep over wall vertices
   * @protected
   */
  _executeSweep() {

    // Initialize the set of active walls
    const activeEdges = this._initializeActiveEdges();

    // Sort vertices from clockwise to counter-clockwise and begin the sweep
    const vertices = this._sortVertices();

    // Iterate through the vertices, adding polygon points
    let i = 1;
    for ( const vertex of vertices ) {
      if ( vertex._visited ) continue;
      vertex._index = i++;
      this.#updateActiveEdges(vertex, activeEdges);

      // Include collinear vertices in this iteration of the sweep, treating their edges as active also
      const hasCollinear = vertex.collinearVertices.size > 0;
      if ( hasCollinear ) {
        this.#includeCollinearVertices(vertex, vertex.collinearVertices);
        for ( const cv of vertex.collinearVertices ) {
          cv._index = i++;
          this.#updateActiveEdges(cv, activeEdges);
        }
      }

      // Determine the result of the sweep for the given vertex
      this._determineSweepResult(vertex, activeEdges, hasCollinear);
    }

    // Remove collinearity between the starting and ending points
    this.#closePoints();
  }

  /* -------------------------------------------- */

  /**
   * Include collinear vertices until they have all been added.
   * Do not include the original vertex in the set.
   * @param {PolygonVertex} vertex  The current vertex
   * @param {PolygonVertexSet} collinearVertices
   */
  #includeCollinearVertices(vertex, collinearVertices) {
    for ( const cv of collinearVertices) {
      for ( const ccv of cv.collinearVertices ) {
        collinearVertices.add(ccv);
      }
    }
    collinearVertices.delete(vertex);
  }

  /* -------------------------------------------- */

  /**
   * Update active edges at a given vertex
   * Remove counter-clockwise edges which have now concluded.
   * Add clockwise edges which are ongoing or beginning.
   * @param {PolygonVertex} vertex   The current vertex
   * @param {EdgeSet} activeEdges    A set of currently active edges
   */
  #updateActiveEdges(vertex, activeEdges) {
    for ( const ccw of vertex.ccwEdges ) {
      if ( !vertex.cwEdges.has(ccw) ) activeEdges.delete(ccw);
    }
    for ( const cw of vertex.cwEdges ) {
      if ( cw.vertexA._visited && cw.vertexB._visited ) continue; // Safeguard in case we have already visited the edge
      activeEdges.add(cw);
    }
    vertex._visited = true; // Record that we have already visited this vertex
  }

  /* -------------------------------------------- */

  /**
   * Determine the initial set of active edges as those which intersect with the initial ray
   * @returns {EdgeSet}             A set of initially active edges
   * @protected
   */
  _initializeActiveEdges() {
    const initial = {x: Math.round(this.origin.x - this.#rayDistance2), y: this.origin.y};
    const edges = new Set();
    for ( const edge of this.edges ) {
      const x = foundry.utils.lineSegmentIntersects(this.origin, initial, edge.vertexA, edge.vertexB);
      if ( x ) edges.add(edge);
    }
    return edges;
  }

  /* -------------------------------------------- */

  /**
   * Sort vertices clockwise from the initial ray (due west).
   * @returns {PolygonVertex[]}             The array of sorted vertices
   * @protected
   */
  _sortVertices() {
    const size = this.vertices.size;
    if ( !size ) return [];

    const origin = this.origin;

    // Preallocate an array of the exact size
    const vertices = new Array(size);
    const valuesVertices = this.vertices.values();
    let i = 0;

    // Precompute angle and squared distance
    for ( const vertex of valuesVertices ) {
      // Use the true intersection coordinates if available
      const p = vertex._intersectionCoordinates || vertex;

      // Calculate dx, dy relative to the origin such that West => angle = 0
      const dx = origin.x - p.x;
      const dy = origin.y - p.y;

      // Determine the raw angle in the range [-PI, PI], then shift into [0, 2PI)
      const rawAngle = Math.atan2(dy, dx);
      vertex._angle = (rawAngle + (2 * Math.PI)) % (2 * Math.PI);

      // Compute squared distance (if it's not already set)
      vertex._d2 ||= (dx * dx) + (dy * dy);

      // Add to the preallocated array
      vertices[i++] = vertex;
    }

    // Sort by angle first, then by squared distance
    vertices.sort((a, b) => {
      const angleDiff = a._angle - b._angle;
      if ( angleDiff !== 0 ) return angleDiff;
      return a._d2 - b._d2;
    });

    // Handle collinearity
    let groupStart; // Index of where a collinear run starts

    for ( let j = 1; j < vertices.length; j++ ) {
      const prev = vertices[j - 1];
      const curr = vertices[j];

      // Check if current vertex is collinear with the previous
      if ( curr._angle.almostEqual(prev._angle, 1e-12) ) {
        if ( groupStart === undefined ) groupStart = j - 1;
      }
      else if ( groupStart !== undefined ) {
        this.#unifyCollinearGroup(vertices, groupStart, j - 1);
        groupStart = undefined;
      }
    }

    // If there is a trailing group that extends to the end
    if ( groupStart !== undefined ) this.#unifyCollinearGroup(vertices, groupStart, vertices.length - 1);

    return vertices;
  }

  /* -------------------------------------------- */

  /**
   * Attach all vertices in the range [start..end] to one another as collinear.
   * It is using i < j, so each pair is only processed once. Each pair is still stored symmetrically.
   * @param {PolygonVertex[]} verts   A sorted array of vertices
   * @param {number} start            Index where the collinear group starts
   * @param {number} end              Index where the collinear group ends (inclusive)
   */
  #unifyCollinearGroup(verts, start, end) {
    // If the group is only one vertex, nothing to do
    if ( end <= start ) return;

    for ( let i = start; i < end; i++ ) {
      const vi = verts[i];
      for ( let j = i + 1; j <= end; j++ ) {
        const vj = verts[j];
        // Record each as collinear with the other
        vi.collinearVertices.add(vj);
        vj.collinearVertices.add(vi);
      }
    }
  }

  /* -------------------------------------------- */

  /**
   * Test whether a target vertex is behind some closer active edge.
   * If the vertex is to the left of the edge, is must be behind the edge relative to origin.
   * If the vertex is collinear with the edge, it should be considered "behind" and ignored.
   * We know edge.vertexA is ccw to edge.vertexB because of the logic in _identifyVertices.
   * @param {PolygonVertex} vertex      The target vertex
   * @param {EdgeSet} activeEdges       The set of active edges
   * @returns {{isBehind: boolean, wasLimited: boolean}} Is the target vertex behind some closer edge?
   * @protected
   */
  _isVertexBehindActiveEdges(vertex, activeEdges) {
    let wasLimited = false;
    for ( const edge of activeEdges ) {
      if ( vertex.edges.has(edge) ) continue;
      if ( foundry.utils.orient2dFast(edge.vertexA, edge.vertexB, vertex) > 0 ) {
        if ( ( edge.isLimited(this.config.type) ) && !wasLimited ) wasLimited = true;
        else return {isBehind: true, wasLimited};
      }
    }
    return {isBehind: false, wasLimited};
  }

  /* -------------------------------------------- */

  /**
   * Determine the result for the sweep at a given vertex
   * @param {PolygonVertex} vertex      The target vertex
   * @param {EdgeSet} activeEdges       The set of active edges
   * @param {boolean} hasCollinear      Are there collinear vertices behind the target vertex?
   * @protected
   */
  _determineSweepResult(vertex, activeEdges, hasCollinear=false) {

    // Determine whether the target vertex is behind some other active edge
    const {isBehind, wasLimited} = this._isVertexBehindActiveEdges(vertex, activeEdges);

    // Case 1 - Some vertices can be ignored because they are behind other active edges
    if ( isBehind ) return;

    // Construct the CollisionResult object
    const result = new CollisionResult({
      target: vertex,
      cwEdges: vertex.cwEdges,
      ccwEdges: vertex.ccwEdges,
      isLimited: vertex.isLimited,
      isBehind,
      wasLimited
    });

    // Case 2 - No counter-clockwise edge, so begin a new edge
    // Note: activeEdges always contain the vertex edge, so never empty
    const nccw = vertex.ccwEdges.size;
    if ( !nccw ) {
      this._switchEdge(result, activeEdges);
      result.collisions.forEach(pt => this.addPoint(pt));
      return;
    }

    // Case 3 - Limited edges in both directions
    // We can only guarantee this case if we don't have collinear endpoints
    const ccwLimited = !result.wasLimited && vertex.isLimitingCCW;
    const cwLimited = !result.wasLimited && vertex.isLimitingCW;
    if ( !hasCollinear && cwLimited && ccwLimited ) return;

    // Case 4 - Non-limited edges in both directions
    if ( !ccwLimited && !cwLimited && nccw && vertex.cwEdges.size ) {
      result.collisions.push(result.target);
      this.addPoint(result.target);
      return;
    }

    // Case 5 - Otherwise switching edges or edge types
    this._switchEdge(result, activeEdges);
    result.collisions.forEach(pt => this.addPoint(pt));
  }

  /* -------------------------------------------- */

  /**
   * Switch to a new active edge.
   * Moving from the origin, a collision that first blocks a side must be stored as a polygon point.
   * Subsequent collisions blocking that side are ignored. Once both sides are blocked, we are done.
   *
   * Collisions that limit a side will block if that side was previously limited.
   *
   * If neither side is blocked and the ray internally collides with a non-limited edge, n skip without adding polygon
   * endpoints. Sight is unaffected before this edge, and the internal collision can be ignored.
   *
   * @param {CollisionResult} result    The pending collision result
   * @param {EdgeSet} activeEdges       The set of currently active edges
   * @protected
   */
  _switchEdge(result, activeEdges) {
    const origin = this.origin;

    // Construct the ray from the origin
    const ray = Ray.towardsPointSquared(origin, result.target, this.#rayDistance2);
    ray.result = result;
    this.rays.push(ray); // For visualization and debugging

    // Create a sorted array of collisions containing the target vertex, other collinear vertices, and collision points
    const vertices = [result.target, ...result.target.collinearVertices];
    const keys = new Set();
    for ( const v of vertices ) {
      keys.add(v.key);
      v._d2 ??= Math.pow(v.x - origin.x, 2) + Math.pow(v.y - origin.y, 2);
    }
    this.#addInternalEdgeCollisions(vertices, keys, ray, activeEdges);
    vertices.sort((a, b) => a._d2 - b._d2);

    // As we iterate over intersection points we will define the insertion method
    let insert = undefined;
    const c = result.collisions;
    for ( const x of vertices ) {

      if ( x.isInternal ) {  // Handle internal collisions
        // If neither side yet blocked and this is a non-limited edge, return
        if ( !result.blockedCW && !result.blockedCCW && !x.isLimited ) return;

        // Assume any edge is either limited or normal, so if not limited, must block. If already limited, must block
        result.blockedCW ||= !x.isLimited || result.limitedCW;
        result.blockedCCW ||= !x.isLimited || result.limitedCCW;
        result.limitedCW = true;
        result.limitedCCW = true;

      } else { // Handle true endpoints
        result.blockedCW ||= (result.limitedCW && x.isLimitingCW) || x.isBlockingCW;
        result.blockedCCW ||= (result.limitedCCW && x.isLimitingCCW) || x.isBlockingCCW;
        result.limitedCW ||= x.isLimitingCW;
        result.limitedCCW ||= x.isLimitingCCW;
      }

      // Define the insertion method and record a collision point
      if ( result.blockedCW ) {
        insert ||= c.unshift;
        if ( !result.blockedCWPrev ) insert.call(c, x);
      }
      if ( result.blockedCCW ) {
        insert ||= c.push;
        if ( !result.blockedCCWPrev ) insert.call(c, x);
      }

      // Update blocking flags
      if ( result.blockedCW && result.blockedCCW ) return;
      result.blockedCWPrev ||= result.blockedCW;
      result.blockedCCWPrev ||= result.blockedCCW;
    }
  }

  /* -------------------------------------------- */

  /**
   * Identify the collision points between an emitted Ray and a set of active edges.
   * @param {PolygonVertex[]} vertices      Active vertices
   * @param {Set<number>} keys              Active vertex keys
   * @param {PolygonRay} ray                The candidate ray to test
   * @param {EdgeSet} activeEdges           The set of edges to check for collisions against the ray
   */
  #addInternalEdgeCollisions(vertices, keys, ray, activeEdges) {
    for ( const edge of activeEdges ) {
      if ( keys.has(edge.vertexA.key) || keys.has(edge.vertexB.key) ) continue;
      const x = foundry.utils.lineLineIntersection(ray.A, ray.B, edge.vertexA, edge.vertexB);
      if ( !x ) continue;
      const c = PolygonVertex.fromPoint(x, {round: false});
      c.attachEdge(edge, 0, this.config.type);
      c.isInternal = true;
      c._d2 = Math.pow(x.x - ray.A.x, 2) + Math.pow(x.y - ray.A.y, 2);
      vertices.push(c);
    }
  }

  /* -------------------------------------------- */
  /*  Collision Testing                           */
  /* -------------------------------------------- */

  /** @override */
  _testCollision(ray, mode) {
    const {debug, type} = this.config;

    // Identify candidate edges
    this._identifyEdges();

    // Identify collision points
    let collisions = new Map();
    for ( const edge of this.edges ) {
      const x = foundry.utils.lineSegmentIntersection(this.origin, ray.B, edge.a, edge.b);
      if ( !x || (x.t0 <= 0) ) continue;
      if ( (mode === "any") && (!edge.isLimited(type) || collisions.size) ) return true;
      let c = PolygonVertex.fromPoint(x, {distance: x.t0});
      if ( collisions.has(c.key) ) c = collisions.get(c.key);
      else collisions.set(c.key, c);
      c.attachEdge(edge, 0, type);
    }
    if ( mode === "any" ) return false;

    // Sort collisions
    collisions = Array.from(collisions.values()).sort((a, b) => a._distance - b._distance);
    if ( collisions[0]?.isLimited ) collisions.shift();

    // Visualize result
    if ( debug ) this._visualizeCollision(ray, collisions);

    // Return collision result
    if ( mode === "all" ) return collisions;
    else return collisions[0] || null;
  }

  /* -------------------------------------------- */
  /*  Visualization                               */
  /* -------------------------------------------- */

  /** @override */
  visualize() {
    const dg = canvas.controls.debug;
    dg.clear();

    // Text debugging
    if ( !canvas.controls.debug.debugText ) {
      canvas.controls.debug.debugText = canvas.controls.addChild(new PIXI.Container());
    }
    const text = canvas.controls.debug.debugText;
    text.removeChildren().forEach(c => c.destroy({children: true}));

    // Define limitation colors
    const limitColors = {
      [CONST.WALL_SENSE_TYPES.NONE]: 0x77E7E8,
      [CONST.WALL_SENSE_TYPES.NORMAL]: 0xFFFFBB,
      [CONST.WALL_SENSE_TYPES.LIMITED]: 0x81B90C,
      [CONST.WALL_SENSE_TYPES.PROXIMITY]: 0xFFFFBB,
      [CONST.WALL_SENSE_TYPES.DISTANCE]: 0xFFFFBB
    };

    // Draw boundary shapes
    for ( const constraint of this.config.boundaryShapes ) {
      dg.lineStyle(2, 0xFF4444, 1.0).beginFill(0xFF4444, 0.10).drawShape(constraint).endFill();
    }

    // Draw the final polygon shape
    dg.beginFill(0x00AAFF, 0.25).drawShape(this).endFill();

    // Draw candidate edges
    for ( const edge of this.edges ) {
      const c = limitColors[edge[this.config.type]];
      dg.lineStyle(4, c).moveTo(edge.a.x, edge.a.y).lineTo(edge.b.x, edge.b.y);
    }

    // Draw vertices
    for ( const vertex of this.vertices.values() ) {
      const r = vertex.restriction;
      if ( r ) dg.lineStyle(1, 0x000000).beginFill(limitColors[r]).drawCircle(vertex.x, vertex.y, 8).endFill();
      if ( vertex._index ) {
        const t = text.addChild(new PIXI.Text(String(vertex._index), CONFIG.canvasTextStyle));
        t.position.set(vertex.x, vertex.y);
      }
    }

    // Draw emitted rays
    for ( const ray of this.rays ) {
      const r = ray.result;
      if ( r ) {
        dg.lineStyle(2, 0x00FF00, r.collisions.length ? 1.0 : 0.33).moveTo(ray.A.x, ray.A.y)
          .lineTo(ray.B.x, ray.B.y);
        for ( const c of r.collisions ) {
          dg.lineStyle(1, 0x000000).beginFill(0xFF0000).drawCircle(c.x, c.y, 6).endFill();
        }
      }
    }
    return dg;
  }

  /* -------------------------------------------- */

  /**
   * Visualize the polygon, displaying its computed area, rays, and collision points
   * @param {Ray} ray
   * @param {PolygonVertex[]} collisions
   * @protected
   */
  _visualizeCollision(ray, collisions) {
    const dg = canvas.controls.debug;
    dg.clear();
    const limitColors = {
      [CONST.WALL_SENSE_TYPES.NONE]: 0x77E7E8,
      [CONST.WALL_SENSE_TYPES.NORMAL]: 0xFFFFBB,
      [CONST.WALL_SENSE_TYPES.LIMITED]: 0x81B90C,
      [CONST.WALL_SENSE_TYPES.PROXIMITY]: 0xFFFFBB,
      [CONST.WALL_SENSE_TYPES.DISTANCE]: 0xFFFFBB
    };

    // Draw edges
    for ( const edge of this.edges.values() ) {
      const c = limitColors[edge[this.config.type]];
      dg.lineStyle(4, c).moveTo(edge.a.x, edge.b.y).lineTo(edge.b.x, edge.b.y);
    }

    // Draw the attempted ray
    dg.lineStyle(4, 0x0066CC).moveTo(ray.A.x, ray.A.y).lineTo(ray.B.x, ray.B.y);

    // Draw collision points
    for ( const x of collisions ) {
      dg.lineStyle(1, 0x000000).beginFill(0xFF0000).drawCircle(x.x, x.y, 6).endFill();
    }
  }

  /* -------------------------------------------- */

  /**
   * This function has been adapted from Clipper's CleanPolygon function.
   * When adding a new point to the polygon, check for collinearity with prior points to cull unnecessary points.
   * This also removes spikes where we traverse points (a, b, a).
   * We also enforce a minimum distance between two points, or a minimum perpendicular distance between three almost
   * collinear points.
   * @override
   */
  addPoint({x, y}) {
    const MIN_DISTANCE_SQUARED = 0.25 ** 2;
    const points = this.points;
    const n = points.length;

    // If we have no points yet, add the next point
    if ( n === 0 ) {
      points.push(x, y);
      return this;
    }

    // If we have exactly one point already, add the next point if greater than the minimum required distance
    if ( n === 2 ) {
      const dx = points[n - 2] - x;
      const dy = points[n - 1] - y;
      if ( (dx * dx) + (dy * dy) >= MIN_DISTANCE_SQUARED ) points.push(x, y);
      return this;
    }

    // Get the last two points
    let x1 = x;
    let y1 = y;
    let x2 = points[n - 2];
    let y2 = points[n - 1];
    let x3 = points[n - 4];
    let y3 = points[n - 3];

    // If necessary, swap the points such that the point (x1, y1) lies geometrically between (x2, y2) and (x3, y3)
    if ( Math.abs(x1 - x2) > Math.abs(y1 - y2) ) {
      if ( (x1 > x2) !== (x1 < x3) ) {
        if ( (x2 > x1) === (x2 < x3) ) [x1, y1, x2, y2] = [x2, y2, x1, y1];
        else [x1, y1, x2, y2, x3, y3] = [x3, y3, x1, y1, x2, y2];
      }
    }
    else if ( (y1 > y2) !== (y1 < y3) ) {
      if ( (y2 > y1) === (y2 < y3) ) [x1, y1, x2, y2] = [x2, y2, x1, y1];
      else [x1, y1, x2, y2, x3, y3] = [x3, y3, x1, y1, x2, y2];
    }

    // Calculate the squared perpendicular distance of (x1, y1) from the line [(x2, y2), (x3, y3)]
    // If the perpendicular distance is equal to or greater than the minimum distance, add the next point
    const a = y2 - y3;
    const b = x3 - x2;
    const c = (a * (x1 - x2)) + (b * (y1 - y2));
    const distanceSquared = (c * c) / ((a * a) + (b * b));
    if ( distanceSquared >= MIN_DISTANCE_SQUARED ) {
      points.push(x, y);
      return this;
    }

    // Otherwise drop the last point, which is almost collinear with the second to last and the next point.
    // The last point is either between the second to last and the next point and almost collinear or a thin spike.
    // Only add the next point if it is sufficiently distant from the new last point.
    const dx = points[n - 4] - x;
    const dy = points[n - 3] - y;
    points.length -= 2;
    if ( (dx * dx) + (dy * dy) >= MIN_DISTANCE_SQUARED ) points.push(x, y);
    return this;
  }

  /* -------------------------------------------- */

  /**
   * Remove duplicate or collinear points between the first and last points.
   */
  #closePoints() {
    const points = this.points;

    // If we have two or fewer points, the polygon is empty
    if ( points.length < 6 ) {
      points.length = 0;
      return;
    }

    // Add the first two points from the beginning to the end
    const [x1, y1, x2, y2] = points;
    this.addPoint({x: x1, y: y1});
    this.addPoint({x: x2, y: y2});

    // Now replace the first two points with the last two points, which are then removed
    const n = points.length;
    [points[0], points[1], points[2], points[3]] = [points[n - 4], points[n - 3], points[n - 2], points[n - 1]];
    points.length -= 4;
  }
}

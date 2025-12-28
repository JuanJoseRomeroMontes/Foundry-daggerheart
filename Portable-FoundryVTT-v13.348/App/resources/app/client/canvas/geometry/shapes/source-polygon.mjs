import LimitedAnglePolygon from "./limited-angle-polygon.mjs";
import Ray from "./ray.mjs";

/**
 * @import {Point, ElevatedPoint} from "../../../../common/_types.mjs"
 * @import {PointSourcePolygonType} from "../_types.mjs"
 * @import {PointSourcePolygonConfig} from "../_types.mjs"
 */

/**
 * An extension of Polygon which is used to represent the line of sight for a point source.
 * @template {PointSourcePolygonConfig} PolygonConfig
 */
export default class PointSourcePolygon extends PIXI.Polygon {
  /**
   * Customize how wall direction of one-way walls is applied
   * @enum {number}
   */
  static WALL_DIRECTION_MODES = Object.freeze({
    NORMAL: 0,
    REVERSED: 1,
    BOTH: 2
  });

  /**
   * The rectangular bounds of this polygon
   * @type {PIXI.Rectangle}
   */
  bounds = new PIXI.Rectangle(0, 0, 0, 0);

  /**
   * The origin point of the source polygon.
   * @type {ElevatedPoint}
   */
  origin;

  /**
   * The configuration of this polygon.
   * @type {PolygonConfig}
   */
  config = {};

  /* -------------------------------------------- */

  /**
   * An indicator for whether this polygon is constrained by some boundary shape?
   * @type {boolean}
   */
  get isConstrained() {
    return this.config.boundaryShapes.length > 0;
  }

  /* -------------------------------------------- */

  /**
   * Benchmark the performance of polygon computation for this source
   * @param {number} iterations                 The number of test iterations to perform
   * @param {Point|ElevatedPoint} origin        The origin point to benchmark
   * @param {PolygonConfig} config              The polygon configuration to benchmark
   */
  static benchmark(iterations, origin, config) {
    const f = () => this.create(foundry.utils.deepClone(origin), foundry.utils.deepClone(config));
    Object.defineProperty(f, "name", {value: `${this.name}.construct`, configurable: true});
    return foundry.utils.benchmark(f, iterations);
  }

  /* -------------------------------------------- */

  /**
   * Compute the polygon given a point origin and radius
   * @param {Point|ElevatedPoint} origin            The origin source point. The elevation defaults to
   *                                                the elevation of config.source if passed and otherwise 0.
   * @param {PolygonConfig} [config={}]             Configuration options which customize the polygon computation
   * @returns {PointSourcePolygon}                  The computed polygon instance
   */
  static create(origin, config={}) {
    const poly = new this();
    poly.initialize(origin, config);
    poly.compute();
    return this.applyThresholdAttenuation(poly);
  }

  /* -------------------------------------------- */

  /**
   * Create a clone of this polygon.
   * This overrides the default PIXI.Polygon#clone behavior.
   * @override
   * @returns {PointSourcePolygon}    A cloned instance
   */
  clone() {
    const poly = new this.constructor([...this.points]);
    poly.config = foundry.utils.deepClone(this.config);
    poly.origin = {...this.origin};
    poly.bounds = this.bounds.clone();
    return poly;
  }

  /* -------------------------------------------- */
  /*  Polygon Computation                         */
  /* -------------------------------------------- */

  /**
   * Compute the polygon using the origin and configuration options.
   * @returns {PointSourcePolygon}    The computed polygon
   */
  compute() {
    let t0 = performance.now();
    const {x, y} = this.origin;
    const {width, height} = canvas.dimensions;
    const {angle, debug, radius} = this.config;

    if ( !(x >= 0 && x <= width && y >= 0 && y <= height) ) {
      console.warn("The polygon cannot be computed because its origin is out of the scene bounds.");
      this.points.length = 0;
      this.bounds = new PIXI.Rectangle(0, 0, 0, 0);
      return this;
    }

    // Skip zero-angle or zero-radius polygons
    if ( (radius === 0) || (angle === 0) ) {
      this.points.length = 0;
      this.bounds = new PIXI.Rectangle(0, 0, 0, 0);
      return this;
    }

    // Clear the polygon bounds
    this.bounds = undefined;

    // Delegate computation to the implementation
    this._compute();

    // Cache the new polygon bounds
    this.bounds = this.getBounds();

    // Debugging and performance metrics
    if ( debug ) {
      let t1 = performance.now();
      console.log(`Created ${this.constructor.name} in ${Math.round(t1 - t0)}ms`);
      this.visualize();
    }
    return this;
  }

  /**
   * Perform the implementation-specific computation
   * @protected
   */
  _compute() {
    throw new Error("Each subclass of PointSourcePolygon must define its own _compute method");
  }

  /* -------------------------------------------- */

  /**
   * Customize the provided configuration object for this polygon type.
   * @param {Point|ElevatedPoint} origin          The provided polygon origin. The elevation defaults to
   *                                              the elevation of config.source if passed and otherwise 0.
   * @param {PolygonConfig} config                The provided configuration object
   */
  initialize(origin, config) {
    // Polygon origin
    this.origin = {
      x: Math.round(origin.x),
      y: Math.round(origin.y),
      elevation: origin.elevation ?? config.source?.elevation ?? 0
    };

    // Configure radius
    const cfg = this.config = config;
    const maxR = canvas.dimensions.maxR;
    cfg.radius = Math.min(cfg.radius ?? maxR, maxR);
    cfg.hasLimitedRadius = (cfg.radius > 0) && (cfg.radius < maxR);
    cfg.density = cfg.density ?? PIXI.Circle.approximateVertexDensity(cfg.radius);

    // Configure angle
    cfg.angle = cfg.angle ?? 360;
    cfg.rotation = cfg.rotation ?? 0;
    cfg.hasLimitedAngle = cfg.angle !== 360;

    // Customize wall direction
    cfg.wallDirectionMode ??= PointSourcePolygon.WALL_DIRECTION_MODES.NORMAL;

    // Configure threshold
    cfg.useThreshold ??= false;

    // Boundary Shapes
    cfg.boundaryShapes ||= [];
    if ( cfg.hasLimitedAngle ) this.#configureLimitedAngle();
    else if ( cfg.hasLimitedRadius ) this.#configureLimitedRadius();
    if ( CONFIG.debug.polygons ) cfg.debug = true;
  }

  /* -------------------------------------------- */

  /**
   * Configure a limited angle and rotation into a triangular polygon boundary shape.
   */
  #configureLimitedAngle() {
    this.config.boundaryShapes.push(new LimitedAnglePolygon(this.origin, this.config));
  }

  /* -------------------------------------------- */

  /**
   * Configure a provided limited radius as a circular polygon boundary shape.
   */
  #configureLimitedRadius() {
    this.config.boundaryShapes.push(new PIXI.Circle(this.origin.x, this.origin.y, this.config.radius));
  }

  /* -------------------------------------------- */

  /**
   * Apply a constraining boundary shape to an existing PointSourcePolygon.
   * Return a new instance of the polygon with the constraint applied.
   * The new instance is only a "shallow clone", as it shares references to component properties with the original.
   * @param {PIXI.Circle|PIXI.Rectangle|PIXI.Polygon} constraint      The constraining boundary shape
   * @param {object} [intersectionOptions]                            Options passed to the shape intersection method
   * @returns {PointSourcePolygon}                                    A new constrained polygon
   */
  applyConstraint(constraint, intersectionOptions={}) {

    // Enhance polygon configuration data using knowledge of the constraint
    const poly = this.clone();
    poly.config.boundaryShapes.push(constraint);
    if ( (constraint instanceof PIXI.Circle) && (constraint.x === this.origin.x) && (constraint.y === this.origin.y) ) {
      if ( poly.config.radius <= constraint.radius ) return poly;
      poly.config.radius = constraint.radius;
      poly.config.density = intersectionOptions.density ??= PIXI.Circle.approximateVertexDensity(constraint.radius);
      if ( constraint.radius === 0 ) {
        poly.points.length = 0;
        poly.bounds.x = poly.bounds.y = poly.bounds.width = poly.bounds.height = 0;
        return poly;
      }
    }
    if ( !poly.points.length ) return poly;
    // Apply the constraint and return the constrained polygon
    const c = constraint.intersectPolygon(poly, intersectionOptions);
    poly.points = c.points;
    poly.bounds = poly.getBounds();
    return poly;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  contains(x, y) {
    return this.bounds.contains(x, y) && super.contains(x, y);
  }

  /* -------------------------------------------- */
  /*  Polygon Boundary Constraints                */
  /* -------------------------------------------- */

  /**
   * Constrain polygon points by applying boundary shapes.
   * @protected
   */
  _constrainBoundaryShapes() {
    const {density, boundaryShapes} = this.config;
    if ( (this.points.length < 6) || !boundaryShapes.length ) return;
    let constrained = this;
    const intersectionOptions = {density};
    for ( const c of boundaryShapes ) {
      constrained = c.intersectPolygon(constrained, intersectionOptions);
    }
    this.points = constrained.points;
  }

  /* -------------------------------------------- */
  /*  Collision Testing                           */
  /* -------------------------------------------- */

  /**
   * Test whether a Ray between the origin and destination points would collide with a boundary of this Polygon.
   * A valid wall restriction type is compulsory and must be passed into the config options.
   * @param {Point|ElevatedPoint} origin            An origin point. The elevation defaults to
   *                                                the elevation of config.source if passed and otherwise 0.
   * @param {Point|ElevatedPoint} destination       A destination point. The elevation defaults to the elevation
   *                                                of the origin.
   * @param {PolygonConfig} config                  The configuration that defines a certain Polygon type
   * @param {"any"|"all"|"closest"} [config.mode]   The collision mode to test: "any", "all", or "closest"
   * @returns {boolean|PolygonVertex|PolygonVertex[]|null} The collision result depends on the mode of the test:
   *                                                * any: returns a boolean for whether any collision occurred
   *                                                * all: returns a sorted array of PolygonVertex instances
   *                                                * closest: returns a PolygonVertex instance or null
   */
  static testCollision(origin, destination, {mode="all", ...config}={}) {
    if ( !CONST.WALL_RESTRICTION_TYPES.includes(config.type) ) {
      throw new Error("A valid wall restriction type is required for testCollision.");
    }
    const x0 = Math.round(origin.x);
    const y0 = Math.round(origin.y);
    const x1 = Math.round(destination.x);
    const y1 = Math.round(destination.y);
    const ray = new Ray({x: x0, y: y0}, {x: x1, y: y1});
    config.boundaryShapes ||= [];
    config.boundaryShapes.push(ray.bounds);
    const poly = new this();
    poly.initialize(origin, config);
    destination = {x: x1, y: y1, elevation: destination.elevation ?? poly.origin.elevation};
    return poly._testCollision(ray, mode, destination);
  }

  /* -------------------------------------------- */

  /**
   * Determine the set of collisions which occurs for a Ray.
   * @param {Ray} ray                           The Ray to test
   * @param {"any"|"all"|"closest"} mode        The collision mode being tested
   * @param {ElevatedPoint} destination         The destination
   * @returns {boolean|PolygonVertex|PolygonVertex[]|null} The collision test result
   * @protected
   * @abstract
   */
  _testCollision(ray, mode, destination) {
    throw new Error(`The ${this.constructor.name} class must implement the _testCollision method`);
  }

  /* -------------------------------------------- */
  /*  Visualization and Debugging                 */
  /* -------------------------------------------- */

  /**
   * Visualize the polygon, displaying its computed area and applied boundary shapes.
   * @returns {PIXI.Graphics|undefined}     The rendered debugging shape
   */
  visualize() {
    if ( !this.points.length ) return;
    const dg = canvas.controls.debug;
    dg.clear();
    for ( const constraint of this.config.boundaryShapes ) {
      dg.lineStyle(2, 0xFFFFFF, 1.0).beginFill(0xAAFF00).drawShape(constraint).endFill();
    }
    dg.lineStyle(2, 0xFFFFFF, 1.0).beginFill(0xFFAA99, 0.25).drawShape(this).endFill();
    return dg;
  }

  /* -------------------------------------------- */

  /**
   * Determine if the shape is a complete circle.
   * The config object must have an angle and a radius properties.
   */
  isCompleteCircle() {
    const { radius, angle, density } = this.config;
    if ( radius === 0 ) return true;
    if ( angle < 360 || (this.points.length !== (density * 2)) ) return false;
    const shapeArea = Math.abs(this.signedArea());
    const circleArea = (0.5 * density * Math.sin(2 * Math.PI / density)) * (radius ** 2);
    return circleArea.almostEqual(shapeArea, 1e-5);
  }

  /* -------------------------------------------- */
  /*  Threshold Polygons                          */
  /* -------------------------------------------- */

  /**
   * Augment a PointSourcePolygon by adding additional coverage for shapes permitted by threshold walls.
   * @param {PointSourcePolygon} polygon        The computed polygon
   * @returns {PointSourcePolygon}              The augmented polygon
   */
  static applyThresholdAttenuation(polygon) {
    const config = polygon.config;
    if ( !config.useThreshold ) return polygon;

    // Identify threshold walls and confirm whether threshold augmentation is required
    const {nAttenuated, edges} = PointSourcePolygon.#getThresholdEdges(polygon.origin, config);
    if ( !nAttenuated ) return polygon;

    // Create attenuation shapes for all threshold walls
    const attenuationShapes = PointSourcePolygon.#createThresholdShapes(polygon, edges);
    if ( !attenuationShapes.length ) return polygon;

    // Compute a second polygon which does not enforce threshold walls
    const noThresholdPolygon = new this();
    noThresholdPolygon.initialize(polygon.origin, {...config, useThreshold: false});
    noThresholdPolygon.compute();

    // Combine the unrestricted polygon with the attenuation shapes
    const combined = PointSourcePolygon.#combineThresholdShapes(noThresholdPolygon, attenuationShapes);
    polygon.points = combined.points;
    polygon.bounds = polygon.getBounds();
    return polygon;
  }

  /* -------------------------------------------- */

  /**
   * Identifies edges in the Scene that include an active threshold.
   * Utilizes the Quadtree for efficient spatial querying to retrieve relevant edges.
   * @param {ElevatedPoint} origin The origin point from which to calculate thresholds.
   * @param {object} config Configuration object containing threshold parameters.
   * @param {string} config.type The type of the source.
   * @param {number} config.radius The radius of the source.
   * @param {number} config.externalRadius The external radius of the source.
   * @returns {{edges: Set<Edge>, nAttenuated: number}} An object containing the array of
   *   edges that meet the threshold criteria and the total attenuation value.
   */
  static #getThresholdEdges(origin, config) {
    let nAttenuated = 0;

    // Define a bounding box based on the origin and radius to query the Quadtree
    const bounds = new PIXI.Rectangle(origin.x - config.radius, origin.y - config.radius,
      config.radius * 2, config.radius * 2);

    // Define a collision test that ensures only threshold edges are returned
    const collisionTest = edge => edge.applyThreshold(config.type, origin, config.externalRadius);

    // Retrieve candidate edges within the defined bounding box using the Quadtree
    const edges = canvas.edges.getEdges(bounds, {includeOuterBounds: false, collisionTest});

    // Iterate over each candidate edge
    for ( const edge of edges ) nAttenuated += edge.threshold.attenuation;
    return {edges, nAttenuated};
  }

  /* -------------------------------------------- */

  /**
   * @typedef {ClipperPoint[]} ClipperPoints
   */

  /**
   * For each threshold wall that this source passes through construct a shape representing the attenuated source.
   * The attenuated shape is a circle with a radius modified by origin proximity to the threshold wall.
   * Intersect the attenuated shape against the LOS with threshold walls considered.
   * The result is the LOS for the attenuated light source.
   * @param {PointSourcePolygon} thresholdPolygon   The computed polygon with thresholds applied
   * @param {Set<Edge>} edges                       The identified set of threshold walls
   * @returns {ClipperPoints[]}                     The resulting array of intersected threshold shapes
   */
  static #createThresholdShapes(thresholdPolygon, edges) {
    const cps = thresholdPolygon.toClipperPoints();
    const origin = thresholdPolygon.origin;
    const {radius, externalRadius, type} = thresholdPolygon.config;
    const shapes = [];

    // Iterate over threshold walls
    for ( const edge of edges ) {
      let thresholdShape;

      // Create attenuated shape
      if ( edge.threshold.attenuation ) {
        const r = PointSourcePolygon.#calculateThresholdAttenuation(edge, origin, radius, externalRadius, type);
        if ( !r.outside ) continue;
        thresholdShape = new PIXI.Circle(origin.x, origin.y, r.inside + r.outside);
      }

      // No attenuation, use the full circle
      else thresholdShape = new PIXI.Circle(origin.x, origin.y, radius);

      // Intersect each shape against the LOS
      const ix = thresholdShape.intersectClipper(cps, {convertSolution: false});
      if ( ix.length && ix[0].length > 2 ) shapes.push(ix[0]);
    }
    return shapes;
  }

  /* -------------------------------------------- */

  /**
   * Calculate the attenuation of the source as it passes through the threshold wall.
   * The distance of perception through the threshold wall depends on proximity of the source from the wall.
   * @param {Edge} edge         The Edge for which this threshold applies
   * @param {ElevatedPoint} origin  Origin point on the canvas for this source
   * @param {number} radius     Radius to use for this source, before considering attenuation
   * @param {number} externalRadius The external radius of the source
   * @param {string} type       Sense type for the source
   * @returns {{inside: number, outside: number}} The inside and outside portions of the radius
   */
  static #calculateThresholdAttenuation(edge, origin, radius, externalRadius, type) {
    const d = edge.threshold?.[type];
    if ( !d ) return { inside: radius, outside: radius };
    const proximity = edge[type] === CONST.WALL_SENSE_TYPES.PROXIMITY;

    // Find the closest point on the threshold wall to the source.
    // Calculate the proportion of the source radius that is "inside" and "outside" the threshold wall.
    const pt = foundry.utils.closestPointToSegment(origin, edge.a, edge.b);
    const inside = Math.hypot(pt.x - origin.x, pt.y - origin.y);
    const outside = radius - inside;
    if ( (outside < 0) || outside.almostEqual(0) ) return { inside, outside: 0 };

    // Attenuate the radius outside the threshold wall based on source proximity to the wall.
    const sourceDistance = proximity ? Math.max(inside - externalRadius, 0) : (inside + externalRadius);
    const percentDistance = sourceDistance / d;
    const pInv = proximity ? 1 - percentDistance : Math.min(1, percentDistance - 1);
    const a = (pInv / (2 * (1 - pInv))) * CONFIG.Wall.thresholdAttenuationMultiplier;
    return { inside, outside: Math.min(a * d, outside) };
  }

  /* -------------------------------------------- */

  /**
   * Union the attenuated shape-LOS intersections with the closed LOS.
   * The portion of the light sources "inside" the threshold walls are not modified from their default radius or shape.
   * Clipper can union everything at once. Use a positive fill to avoid checkerboard; fill any overlap.
   * @param {PointSourcePolygon} los    The LOS polygon with threshold walls inactive
   * @param {ClipperPoints[]} shapes    Attenuation shapes for threshold walls
   * @returns {PIXI.Polygon}            The combined LOS polygon with threshold shapes
   */
  static #combineThresholdShapes(los, shapes) {
    const c = new ClipperLib.Clipper();
    const combined = [];
    const cPaths = [los.toClipperPoints(), ...shapes];
    c.AddPaths(cPaths, ClipperLib.PolyType.ptSubject, true);
    const p = ClipperLib.PolyFillType.pftPositive;
    c.Execute(ClipperLib.ClipType.ctUnion, combined, p, p);
    return PIXI.Polygon.fromClipperPoints(combined.length ? combined[0] : []);
  }
}

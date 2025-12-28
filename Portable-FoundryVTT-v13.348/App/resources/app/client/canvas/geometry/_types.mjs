/**
 * @import {PointEffectSource} from "@client/canvas/sources/_module.mjs";
 */

/**
 * @typedef ClipperPoint
 * @property {number} X
 * @property {number} Y
 */

/* -------------------------------------------- */

/**
 * @typedef {"wall"|"darkness"|"light"|"innerBounds"|"outerBounds"} EdgeType
 * @typedef {Record<EdgeType, boolean>} EdgeOptions
 */

// TODO: "universal" type will be deprecated in v14
/**
 * @typedef {"light"|"darkness"|"sight"|"sound"|"move"|"universal"} PointSourcePolygonType
 */

/**
 * @typedef PointSourcePolygonConfig
 * @property {PointSourcePolygonType} type  The type of polygon being computed
 * @property {number} [angle=360]   The angle of emission, if limited
 * @property {number} [density]     The desired density of padding rays, a number per PI
 * @property {number} [radius]      A limited radius of the resulting polygon
 * @property {number} [rotation]    The direction of facing, required if the angle is limited
 * @property {number} [wallDirectionMode] Customize how wall direction of one-way walls is applied
 * @property {boolean} [useThreshold=false] Compute the polygon with threshold wall constraints applied
 * @property {boolean} [debug]      Display debugging visualization and logging for the polygon
 * @property {PointEffectSource} [source] The object (if any) that spawned this polygon.
 * @property {Array<PIXI.Rectangle|PIXI.Circle|PIXI.Polygon>} [boundaryShapes] Limiting polygon boundary shapes
 * @property {boolean} [hasLimitedRadius] Does this polygon have a limited radius?
 * @property {boolean} [hasLimitedAngle] Does this polygon have a limited angle?
 * @property {PIXI.Rectangle} [boundingBox] The computed bounding box for the polygon
 */

/* -------------------------------------------- */

/**
 * @typedef ClockwiseSweepPolygonConfig
 * @property {number} [priority=0]    Optional priority when it comes to ignore edges from darkness and light sources
 * @property {Record<EdgeType, {priority: number, mode: 0|1|2}>} [edgeTypes] Edge types configuration object. This is
 * @property {EdgeOptions} [edgeOptions] Deactivate/Activate specific edge types behaviors
 * not required by most polygons and will be inferred based on the polygon type and priority.
 * @example
 * How modes are working:
 * - 0=no     : The edges of this type are rejected and not processed (equivalent of not having an edgeType.)
 * - 1=maybe  : The edges are processed and tested for inclusion.
 * - 2=always : The edges are automatically included.
 */

/* -------------------------------------------- */

/**
 * @typedef RayIntersection
 * @property {number} x     The x-coordinate of intersection
 * @property {number} y     The y-coordinate of intersection
 * @property {number} t0    The proximity to the Ray origin, as a ratio of distance
 * @property {number} t1    The proximity to the Ray destination, as a ratio of distance
 */

/* -------------------------------------------- */

/**
 * @typedef QuadtreeObject
 * @property {PIXI.Rectangle} r
 * @property {*} t
 * @property {Set<Quadtree>} [n]
 */

/* -------------------------------------------- */

/**
 * @typedef {Map<number,PolygonVertex>} VertexMap
 */

/**
 * @typedef {Set<Edge>} EdgeSet
 */

/**
 * @typedef {Ray} PolygonRay
 * @property {CollisionResult} result
 */

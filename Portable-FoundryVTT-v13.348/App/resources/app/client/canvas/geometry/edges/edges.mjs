import Edge from "./edge.mjs";
import {CanvasQuadtree} from "../quad-tree.mjs";
import Hooks from "@client/helpers/hooks.mjs";

/**
 * A specialized Map class that manages all edges used to restrict perception in a Scene.
 * Integrates with a Quadtree for efficient spatial queries.
 * @extends {Map<string, Edge>}
 */
export default class CanvasEdges extends Map {
  constructor() {
    super();
    this.#quadtree = new CanvasQuadtree({
      maxObjects: CanvasEdges.#QUADTREE_MAX_OBJECTS,
      maxDepth: CanvasEdges.#QUADTREE_MAX_DEPTH
    });
  }

  /**
   * Maximum number of objects per node in the Quadtree.
   * @type {number}
   */
  static #QUADTREE_MAX_OBJECTS = 100;

  /**
   * Maximum depth of the Quadtree.
   * @type {number}
   */
  static #QUADTREE_MAX_DEPTH = 6;

  /* -------------------------------------------- */

  /**
   * Edges representing the outer boundaries of the game canvas.
   * @type {Edge[]}
   */
  #outerBounds = [];

  /**
   * Edges representing the inner boundaries of the scene rectangle.
   * @type {Edge[]}
   */
  #innerBounds = [];

  /**
   * Internal Quadtree instance for spatial indexing of edges.
   * @type {Quadtree}
   */
  #quadtree;

  /* -------------------------------------------- */

  /**
   * Clear content and initializes the quadtree.
   */
  initialize() {
    this.clear();

    // Wall Documents
    for ( /** @type {Wall} */ const wall of canvas.walls.placeables ) wall.initializeEdge();

    // Canvas Boundaries
    this.#defineBoundaries();

    // Darkness Sources
    for ( const source of canvas.effects.darknessSources ) {
      for ( const edge of source.edges ) this.set(edge.id, edge);
    }

    // Initialize Programmatic Edges via Hooks
    Hooks.callAll("initializeEdges");
  }

  /* -------------------------------------------- */

  /**
   * @override
   */
  set(key, value) {
    // If the key already exists, remove the old Edge from the Quadtree
    if ( this.has(key) ) {
      const oldEdge = this.get(key);
      const inQuadtree = (oldEdge.type !== "outerBounds") && (oldEdge.type !== "innerBounds");
      if ( inQuadtree ) this.#quadtree.remove(oldEdge);
      this.#quadtree.remove(oldEdge);
    }
    super.set(key, value);

    // We need to normalize bounds (only if necessary)
    let bounds = value.bounds;
    if ( (bounds.width < 0) || (bounds.height < 0) ) bounds = bounds.getBounds();

    // Insert the new Edge into the Quadtree
    const inQuadtree = (value.type !== "outerBounds") && (value.type !== "innerBounds");
    if ( inQuadtree ) this.#quadtree.insert({t: value, r: bounds});
    return this;
  }

  /* -------------------------------------------- */

  /** @override */
  delete(key) {
    const edge = this.get(key);
    if ( edge ) {
      const inQuadtree = (edge.type !== "outerBounds") && (edge.type !== "innerBounds");
      if ( inQuadtree ) this.#quadtree.remove(edge);
      return super.delete(key);
    }
    return false;
  }

  /* -------------------------------------------- */

  /** @override */
  clear() {
    super.clear();
    this.#quadtree.clear();
    this.#outerBounds.length = 0;
    this.#innerBounds.length = 0;
    return this;
  }

  /* -------------------------------------------- */

  /**
   * Incrementally refreshes edges by computing intersections between all registered edges.
   * Utilizes the Quadtree to optimize the intersection detection process.
   */
  refresh() {
    Edge.identifyEdgeIntersections(this.values());
  }

  /* -------------------------------------------- */

  /**
   * Defines Edge instances for the outer and inner canvas boundary rectangles.
   * These special edges are not added to the quadtree and the map.
   */
  #defineBoundaries() {
    const d = canvas.dimensions;

    /**
     * Creates boundary edges for a given rectangle.
     * @param {string} type The type of boundary ("outerBounds" or "innerBounds").
     * @param {PIXI.Rectangle} r The rectangle defining the boundary.
     * @returns {Edge[]} An array of four Edge instances representing the boundary.
     */
    const define = (type, r) => {
      const top = new Edge({x: r.x, y: r.y}, {x: r.right, y: r.y}, {id: `${type}.top`, type});
      const right = new Edge({x: r.right, y: r.y}, {x: r.right, y: r.bottom}, {id: `${type}.right`, type});
      const bottom = new Edge({x: r.right, y: r.bottom}, {x: r.x, y: r.bottom}, {id: `${type}.bottom`, type});
      const left = new Edge({x: r.x, y: r.bottom}, {x: r.x, y: r.y}, {id: `${type}.left`, type});
      this.set(top.id, top);
      this.set(right.id, right);
      this.set(bottom.id, bottom);
      this.set(left.id, left);
      return [top, right, bottom, left];
    };

    // Define Outer Canvas Bounds
    this.#outerBounds = define("outerBounds", d.rect);

    // Define Inner Canvas Bounds if there is padding
    if ( d.rect.x === d.sceneRect.x ) this.#innerBounds = this.#outerBounds;
    else this.#innerBounds = define("innerBounds", d.sceneRect);
  }

  /* -------------------------------------------- */

  /**
   * Retrieves edges that intersect with a given rectangle.
   * Utilizes the Quadtree for efficient spatial querying.
   * @param {PIXI.Rectangle} rect The rectangle to query against.
   * @param {object} options
   * @param {boolean} [options.includeInnerBounds=false] Should inner bounds be added?
   * @param {boolean} [options.includeOuterBounds=true] Should outer bounds be added?
   * @param {Function} [options.collisionTest] Collision function to test edge inclusion.
   * @returns {Set<Edge>} A set of Edge instances that intersect with the provided rectangle.
   */
  getEdges(rect, {includeInnerBounds=false, includeOuterBounds=true, collisionTest}={}) {
    const edges = this.#quadtree.getObjects(rect, collisionTest ? {collisionTest: o => collisionTest(o.t)} : {});
    if ( includeInnerBounds ) {
      for ( const inner of this.#innerBounds ) edges.add(inner);
    }
    if ( includeOuterBounds ) {
      for ( const outer of this.#outerBounds ) edges.add(outer);
    }
    return edges;
  }
}

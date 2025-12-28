/**
 * @import {QuadtreeObject} from "../_types.mjs"
 */

/**
 * A Quadtree implementation that supports collision detection for rectangles.
 *
 * @param {PIXI.Rectangle} bounds                The outer bounds of the region
 * @param {object} [options]                Additional options which configure the Quadtree
 * @param {number} [options.maxObjects=20]  The maximum number of objects per node
 * @param {number} [options.maxDepth=4]     The maximum number of levels within the root Quadtree
 * @param {number} [options._depth=0]       The depth level of the sub-tree. For internal use
 * @param {number} [options._root]          The root of the quadtree. For internal use
 */
export default class Quadtree {
  constructor(bounds, {maxObjects=20, maxDepth=4, _depth=0, _root}={}) {
    /**
     * Bounding rectangle of the quadtree.
     * @type {PIXI.Rectangle|{x: number, y: number, width: number, height: number}}
     * @protected
     */
    this._bounds = new PIXI.Rectangle(bounds.x ?? 0, bounds.y ?? 0, bounds.width ?? 0, bounds.height ?? 0);

    /**
     * The maximum number of objects allowed within this node before it must split
     * @type {number}
     */
    this.maxObjects = maxObjects;

    /**
     * The maximum number of levels that the base quadtree is allowed
     * @type {number}
     */
    this.maxDepth = maxDepth;

    /**
     * The depth of this node within the root Quadtree
     * @type {number}
     */
    this.depth = _depth;

    /**
     * The objects contained at this level of the tree
     * @type {QuadtreeObject[]}
     */
    this.objects = [];

    /**
     * Children of this node
     * @type {Quadtree[]}
     */
    this.nodes = [];

    /**
     * The root Quadtree
     * @type {Quadtree}
     */
    this.root = _root || this;
  }

  /**
   * A constant that enumerates the index order of the quadtree nodes from top-left to bottom-right.
   * @enum {number}
   */
  static INDICES = {tl: 0, tr: 1, bl: 2, br: 3};

  /* -------------------------------------------- */
  /*  Getters/Setters                             */
  /* -------------------------------------------- */

  /**
   * The bounding rectangle of the region
   * @type {PIXI.Rectangle}
   */
  get bounds() {
    return this._bounds;
  }
  set bounds(newBounds) {
    // Replace our internal reference with a clone to avoid side effects
    this._bounds = newBounds.clone();
    // Rebuild Quadtree
    const all = this.all;
    this.clear();
    for ( const obj of all ) this.insert(obj);
  }

  /* -------------------------------------------- */

  /**
   * The width of the bounding rectangle
   * @type {number}
   */
  get width() {
    return this._bounds.width;
  }
  set width(w) {
    if ( w === this._bounds.width ) return;
    this.setDimensions(w, this._bounds.height);
  }

  /* -------------------------------------------- */

  /**
   * The height of the bounding rectangle
   * @type {number}
   */
  get height() {
    return this._bounds.height;
  }
  set height(h) {
    if ( h === this._bounds.height ) return;
    this.setDimensions(this._bounds.width, h);
  }

  /* -------------------------------------------- */

  /**
   * The x-coordinate of the bounding rectangle
   * @type {number}
   */
  get x() {
    return this._bounds.x;
  }
  set x(x) {
    if ( x === this._bounds.x ) return;
    this.setPosition(x, this._bounds.y);
  }

  /* -------------------------------------------- */

  /**
   * The y-coordinate of the bounding rectangle
   * @type {number}
   */
  get y() {
    return this._bounds.y;
  }
  set y(y) {
    if ( y === this._bounds.y ) return;
    this.setPosition(this._bounds.x, y);
  }

  /* -------------------------------------------- */

  /**
   * Return an array of all the objects in the Quadtree (recursive)
   * @returns {QuadtreeObject[]}
   */
  get all() {
    if ( this.nodes.length ) {
      return this.nodes.flatMap(n => n.all);
    }
    return this.objects;
  }

  /* -------------------------------------------- */
  /*  Bounds Management                           */
  /* -------------------------------------------- */

  /**
   * Re-position the bounding rectangle of this Quadtree, clear existing data, and re-insert all objects.
   * Useful if the Quadtree needs to move.
   * @param {number} x            The new x-coordinate of the bounding rectangle
   * @param {number} y            The new y-coordinate of the bounding rectangle
   * @returns {Quadtree}          This Quadtree for method chaining
   */
  setPosition(x, y) {
    this._bounds.x = x;
    this._bounds.y = y;
    const all = this.all;
    this.clear();
    for ( const obj of all ) this.insert(obj);
    return this;
  }

  /* -------------------------------------------- */

  /**
   * Re-dimension the bounding rectangle of this Quadtree, clear existing data, and re-insert all objects.
   * Useful if the underlying canvas or region is resized.
   * @param {number} width        The new width of the bounding rectangle
   * @param {number} height       The new height of the bounding rectangle
   * @returns {Quadtree}          This Quadtree for method chaining
   */
  setDimensions(width, height) {
    this._bounds.width = width;
    this._bounds.height = height;
    const all = this.all;
    this.clear();
    for ( const obj of all ) this.insert(obj);
    return this;
  }

  /* -------------------------------------------- */
  /*  Tree Management                             */
  /* -------------------------------------------- */

  /**
   * Split this node into 4 sub-nodes.
   * @returns {Quadtree}     The split Quadtree
   */
  split() {
    const b = this._bounds;
    const w = b.width / 2;
    const h = b.height / 2;
    const options = {
      maxObjects: this.maxObjects,
      maxDepth: this.maxDepth,
      _depth: this.depth + 1,
      _root: this.root
    };

    // Create child quadrants
    this.nodes[Quadtree.INDICES.tl] = new Quadtree(new PIXI.Rectangle(b.x, b.y, w, h), options);
    this.nodes[Quadtree.INDICES.tr] = new Quadtree(new PIXI.Rectangle(b.x+w, b.y, w, h), options);
    this.nodes[Quadtree.INDICES.bl] = new Quadtree(new PIXI.Rectangle(b.x, b.y+h, w, h), options);
    this.nodes[Quadtree.INDICES.br] = new Quadtree(new PIXI.Rectangle(b.x+w, b.y+h, w, h), options);

    // Assign current objects to child nodes
    for ( const o of this.objects ) {
      o.n.delete(this);
      this.insert(o);
    }
    this.objects = [];
    return this;
  }

  /* -------------------------------------------- */
  /*  Object Management                           */
  /* -------------------------------------------- */

  /**
   * Clear the quadtree of all existing contents
   * @returns {Quadtree}     The cleared Quadtree
   */
  clear() {
    this.objects = [];
    for ( const n of this.nodes ) {
      n.clear();
    }
    this.nodes = [];
    return this;
  }

  /* -------------------------------------------- */

  /**
   * Add a rectangle object to the tree
   * @param {QuadtreeObject} obj  The object being inserted
   * @returns {Quadtree[]} The Quadtree nodes the object was added to.
   */
  insert(obj) {
    obj.n = obj.n || new Set();

    // If we will exceeded the maximum objects we need to split
    if ( (this.objects.length === this.maxObjects - 1) && (this.depth < this.maxDepth) ) {
      if ( !this.nodes.length ) this.split();
    }

    // If this node has children, recursively insert
    if ( this.nodes.length ) {
      const nodes = this.getChildNodes(obj.r);
      return nodes.reduce((arr, n) => arr.concat(n.insert(obj)), []);
    }

    // Otherwise store the object here
    obj.n.add(this);
    this.objects.push(obj);
    return [this];
  }

  /* -------------------------------------------- */

  /**
   * Remove an object from the quadtree
   * @param {*} target     The quadtree target being removed
   * @returns {Quadtree}   The Quadtree for method chaining
   */
  remove(target) {
    this.objects.findSplice(o => o.t === target);
    for ( const n of this.nodes ) {
      n.remove(target);
    }
    return this;
  }

  /* -------------------------------------------- */

  /**
   * Remove an existing object from the quadtree and re-insert it with a new position
   * @param {QuadtreeObject} obj  The object being inserted
   * @returns {Quadtree[]}        The Quadtree nodes the object was added to
   */
  update(obj) {
    this.remove(obj.t);
    return this.insert(obj);
  }

  /* -------------------------------------------- */
  /*  Target Identification                       */
  /* -------------------------------------------- */

  /**
   * Get all the objects which could collide with the provided rectangle
   * @param {PIXI.Rectangle} rect    The normalized target rectangle
   * @param {object} [options]                    Options affecting the collision test.
   * @param {Function} [options.collisionTest]    Function to further refine objects to return
   *   after a potential collision is found. Parameters are the object and rect, and the
   *   function should return true if the object should be added to the result set.
   * @param {Set} [options._s]                    The existing result set, for internal use.
   * @returns {Set}           The objects in the Quadtree which represent potential collisions
   */
  getObjects(rect, {collisionTest, _s}={}) {
    const objects = _s || new Set();

    // Recursively retrieve objects from child nodes
    if ( this.nodes.length ) {
      const nodes = this.getChildNodes(rect);
      for ( const n of nodes ) {
        n.getObjects(rect, {collisionTest, _s: objects});
      }
    }

    // Otherwise, retrieve from this node
    else {
      for ( const o of this.objects ) {
        if ( rect.overlaps(o.r) && (!collisionTest || collisionTest(o, rect)) ) objects.add(o.t);
      }
    }

    // Return the result set
    return objects;
  }

  /* -------------------------------------------- */

  /**
   * Obtain the leaf nodes to which a target rectangle belongs.
   * This traverses the quadtree recursively obtaining the final nodes which have no children.
   * @param {PIXI.Rectangle} rect  The target rectangle.
   * @returns {Quadtree[]} The Quadtree nodes to which the target rectangle belongs
   */
  getLeafNodes(rect) {
    if ( !this.nodes.length ) return [this];
    const nodes = this.getChildNodes(rect);
    return nodes.reduce((arr, n) => arr.concat(n.getLeafNodes(rect)), []);
  }

  /* -------------------------------------------- */

  /**
   * Obtain the child nodes within the current node which a rectangle belongs to.
   * Note that this function is not recursive, it only returns nodes at the current or child level.
   * @param {PIXI.Rectangle} rect  The target rectangle.
   * @returns {Quadtree[]}         The Quadtree nodes to which the target rectangle belongs
   */
  getChildNodes(rect) {

    // If this node has no children, use it
    if ( !this.nodes.length ) return [this];

    // Prepare data
    const nodes = [];
    const hx = this._bounds.x + (this._bounds.width / 2);
    const hy = this._bounds.y + (this._bounds.height / 2);

    // Determine orientation relative to the node
    const startTop = rect.y <= hy;
    const startLeft = rect.x <= hx;
    const endBottom = (rect.y + rect.height) > hy;
    const endRight = (rect.x + rect.width) > hx;

    // Top-left
    if ( startLeft && startTop ) nodes.push(this.nodes[Quadtree.INDICES.tl]);

    // Top-right
    if ( endRight && startTop ) nodes.push(this.nodes[Quadtree.INDICES.tr]);

    // Bottom-left
    if ( startLeft && endBottom ) nodes.push(this.nodes[Quadtree.INDICES.bl]);

    // Bottom-right
    if ( endRight && endBottom ) nodes.push(this.nodes[Quadtree.INDICES.br]);
    return nodes;
  }

  /* -------------------------------------------- */

  /**
   * Identify all nodes which are adjacent to this one within the parent Quadtree.
   * @returns {Quadtree[]}
   */
  getAdjacentNodes() {
    const bounds = this._bounds.clone().pad(1);
    return this.root.getLeafNodes(bounds);
  }

  /* -------------------------------------------- */

  /**
   * Visualize the nodes and objects in the quadtree
   * @param {boolean} [objects]    Visualize the rectangular bounds of objects in the Quadtree. Default is false.
   */
  visualize({objects=false}={}) {
    const debug = canvas.controls.debug;
    if ( this.depth === 0 ) debug.clear().endFill();
    debug.lineStyle(2, 0x00FF00, 0.5).drawRect(
      this._bounds.x,
      this._bounds.y,
      this._bounds.width,
      this._bounds.height
    );
    if ( objects ) {
      for ( const o of this.objects ) {
        debug.lineStyle(2, 0xFF0000, 0.5).drawRect(
          o.r.x,
          o.r.y,
          Math.max(o.r.width, 1),
          Math.max(o.r.height, 1)
        );
      }
    }
    for ( const n of this.nodes ) {
      n.visualize({objects});
    }
  }
}

/* -------------------------------------------- */

/**
 * A subclass of Quadtree specifically intended for classifying the location of objects on the game canvas.
 */
export class CanvasQuadtree extends Quadtree {
  /**
   * Create a CanvasQuadtree which references canvas.dimensions.rect.
   * We pass an empty object to the parent, then override _bounds.
   * @param {object} [options] Additional options passed to the parent Quadtree.
   */
  constructor(options={}) {
    super({}, options);

    // Define a dynamic property named _bounds which always returns canvas.dimensions.rect
    // If the canvas is not ready, return a zero rectangle to avoid errors.
    Object.defineProperty(this, "_bounds", {
      configurable: true,
      enumerable: true,
      get: () => {
        if ( canvas?.dimensions?.rect ) return canvas.dimensions.rect;
        return new PIXI.Rectangle(0, 0, 0, 0);
      },
      // Provide a setter to gracefully ignore or handle attempts to assign _bounds
      set: (newBounds) => {
        console.warn("CanvasQuadtree ignores direct assignment to _bounds; it always uses canvas.dimensions.rect.");
      }
    });
  }
}

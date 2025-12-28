import {CLIPPER_SCALING_FACTOR} from "../../../common/constants.mjs";

/**
 * @import {Point} from "@common/_types.mjs";
 */

/**
 * The node of a {@link foundry.data.regionShapes.RegionPolygonTree}.
 */
export class RegionPolygonTreeNode {

  /**
   * Create a RegionPolygonTreeNode.
   * @param {RegionPolygonTreeNode|null} parent    The parent node.
   * @internal
   */
  constructor(parent) {
    this.#parent = parent;
    this.#children = [];
    this.#depth = parent ? parent.depth + 1 : 0;
    this.#isHole = this.#depth % 2 === 0;
    if ( parent ) parent.#children.push(this);
    else {
      this.#polygon = null;
      this.#clipperPath = null;
    }
  }

  /* -------------------------------------------- */

  /**
   * Create a node from the Clipper path and add it to the children of the parent.
   * @param {ClipperLib.IntPoint[]} clipperPath              The clipper path of this node.
   * @param {RegionPolygonTreeNode|null} parent    The parent node or `null` if root.
   * @internal
   */
  static _fromClipperPath(clipperPath, parent) {
    const node = new RegionPolygonTreeNode(parent);
    if ( parent ) node.#clipperPath = clipperPath;
    return node;
  }

  /* -------------------------------------------- */

  /**
   * The parent of this node or `null` if this is the root node.
   * @type {RegionPolygonTreeNode|null}
   */
  get parent() {
    return this.#parent;
  }

  #parent;

  /* -------------------------------------------- */

  /**
   * The children of this node.
   * @type {ReadonlyArray<RegionPolygonTreeNode>}
   */
  get children() {
    return this.#children;
  }

  #children;

  /* -------------------------------------------- */

  /**
   * The depth of this node.
   * The depth of the root node is 0.
   * @type {number}
   */
  get depth() {
    return this.#depth;
  }

  #depth;

  /* -------------------------------------------- */

  /**
   * Is this a hole?
   * The root node is a hole.
   * @type {boolean}
   */
  get isHole() {
    return this.#isHole;
  }

  #isHole;

  /* -------------------------------------------- */

  /**
   * The Clipper path of this node.
   * It is empty in case of the root node.
   * @type {ReadonlyArray<ClipperLib.IntPoint>|null}
   */
  get clipperPath() {
    return this.#clipperPath;
  }

  #clipperPath;

  /* -------------------------------------------- */

  /**
   * The polygon of this node.
   * It is `null` in case of the root node.
   * @type {PIXI.Polygon|null}
   */
  get polygon() {
    let polygon = this.#polygon;
    if ( polygon === undefined ) polygon = this.#polygon = this.#createPolygon();
    return polygon;
  }

  #polygon;

  /* -------------------------------------------- */

  /**
   * The points of the polygon ([x0, y0, x1, y1, ...]).
   * They are `null` in case of the root node.
   * @type {ReadonlyArray<number>|null}
   */
  get points() {
    const polygon = this.polygon;
    if ( !polygon ) return null;
    return polygon.points;
  }

  /* -------------------------------------------- */

  /**
   * The bounds of the polygon.
   * They are `null` in case of the root node.
   * @type {PIXI.Rectangle|null}
   */
  get bounds() {
    let bounds = this.#bounds;
    if ( bounds === undefined ) bounds = this.#bounds = this.polygon?.getBounds() ?? null;
    return bounds;
  }

  #bounds;

  /* -------------------------------------------- */

  /**
   * Iterate over recursively over the children in depth-first order.
   * @yields {RegionPolygonTreeNode}
   */
  *[Symbol.iterator]() {
    for ( const child of this.children ) {
      yield child;
      yield *child;
    }
  }

  /* -------------------------------------------- */

  /**
   * Test whether given point is contained within this node.
   * @param {Point} point    The point.
   * @returns {boolean}
   */
  testPoint(point) {
    return this.#testPoint(point) === 2;
  }

  /* -------------------------------------------- */

  /**
   * Test point containment.
   * @param {Point} point    The point.
   * @returns {0|1|2}        - 0: not contained within the polygon of this node.
   *                         - 1: contained within the polygon of this node but also contained
   *                              inside the polygon of a sub-node that is a hole.
   *                         - 2: contained within the polygon of this node and not contained
   *                              inside any polygon of a sub-node that is a hole.
   */
  #testPoint(point) {
    const {x, y} = point;
    if ( this.parent ) {
      if ( !this.bounds.contains(x, y) || !this.polygon.contains(x, y) ) return 0;
    }
    const children = this.children;
    for ( let i = 0, n = children.length; i < n; i++ ) {
      const result = children[i].#testPoint(point);
      if ( result !== 0 ) return result;
    }
    return this.isHole ? 1 : 2;
  }

  /* -------------------------------------------- */

  /**
   * Test circle containment/intersection with this node.
   * @param {Point} center     The center point of the circle.
   * @param {number} radius    The radius of the circle.
   * @returns {-1|0|1}          - -1: the circle is in the exterior and does not intersect the boundary.
   *                            - 0: the circle is intersects the boundary.
   *                            - 1: the circle is in the interior and does not intersect the boundary.
   */
  testCircle(center, radius) {
    switch ( this.#testCircle(center, radius) ) {
      case 2: return 1;
      case 3: return 0;
      default: return -1;
    }
  }

  /* -------------------------------------------- */

  /**
   * Test circle containment/intersection with this node.
   * @param {Point} center     The center point of the circle.
   * @param {number} radius    The radius of the circle.
   * @returns {0|1|2|3}         - 0: does not intersect the boundary or interior of this node.
   *                            - 1: contained within the polygon of this node but also contained
   *                                 inside the polygon of a sub-node that is a hole.
   *                            - 2: contained within the polygon of this node and not contained
   *                                 inside any polygon of a sub-node that is a hole.
   *                            - 3: intersects the boundary of this node or any sub-node.
   */
  #testCircle(center, radius) {
    if ( this.parent ) {
      const {x, y} = center;

      // Test whether the circle intersects the bounds of this node
      const {left, right, top, bottom} = this.bounds;
      if ( (x < left - radius) || (x > right + radius) || (y < top - radius) || (y > bottom + radius) ) return 0;

      // Test whether the circle intersects any edge of the polygon of this node
      const intersects = foundry.utils.pathCircleIntersects(this.points, true, center, radius);
      if ( intersects ) return 3;

      // Test whether the circle is completely outside of the polygon
      const inside = this.polygon.contains(x, y);
      if ( !inside ) return 0;
    }

    // Test the children of this node now that we know that the circle is
    // completely inside of the polygon of this node
    const children = this.children;
    for ( let i = 0, n = children.length; i < n; i++ ) {
      const result = children[i].#testCircle(center, radius);
      if ( result !== 0 ) return result;
    }
    return this.isHole ? 1 : 2;
  }

  /* -------------------------------------------- */

  /**
   * Create the polygon of this node.
   * @returns {PIXI.Polygon|null}
   */
  #createPolygon() {
    if ( !this.parent ) return null;
    const polygon = PIXI.Polygon.fromClipperPoints(this.clipperPath, {scalingFactor: CLIPPER_SCALING_FACTOR});
    polygon._isPositive = !this.isHole;
    return polygon;
  }
}

/* -------------------------------------------- */

/**
 * The polygon tree of a Region.
 */
export class RegionPolygonTree extends RegionPolygonTreeNode {

  /**
   * Create a RegionPolygonTree.
   * @internal
   */
  constructor() {
    super(null);
  }

  /* -------------------------------------------- */

  /**
   * Create the tree from a Clipper polygon tree.
   * @param {ClipperLib.PolyTree} clipperPolyTree
   * @internal
   */
  static _fromClipperPolyTree(clipperPolyTree) {
    const visit = (clipperPolyNode, parent) => {
      const clipperPath = clipperPolyNode.Contour();
      const node = RegionPolygonTreeNode._fromClipperPath(clipperPath, parent);
      clipperPolyNode.Childs().forEach(child => visit(child, node));
      return node;
    };
    const tree = new RegionPolygonTree();
    clipperPolyTree.Childs().forEach(child => visit(child, tree));
    return tree;
  }
}

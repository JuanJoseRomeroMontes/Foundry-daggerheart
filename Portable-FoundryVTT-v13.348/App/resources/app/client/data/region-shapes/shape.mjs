import {CircleShapeData, EllipseShapeData, PolygonShapeData, RectangleShapeData} from "@common/data/data.mjs";
import {CLIPPER_SCALING_FACTOR} from "@common/constants.mjs";

/**
 * @import {BaseShapeData} from "@common/data/data.mjs";
 */

/**
 * A shape of a {@link foundry.documents.RegionDocument}.
 * @template {BaseShapeData} [ShapeData=BaseShapeData]
 * @abstract
 */
export class RegionShape {

  /**
   * Create a RegionShape.
   * @param {ShapeData} data    The shape data.
   * @internal
   */
  constructor(data) {
    this.#data = data;
  }

  /* -------------------------------------------- */

  /**
   * Create the RegionShape from the shape data.
   * @param {CircleShapeData|EllipseShapeData|PolygonShapeData|RectangleShapeData} data    The shape data.
   * @returns {RegionShape}
   */
  static create(data) {
    switch ( data.type ) {
      case "circle": return new RegionCircleShape(data);
      case "ellipse": return new RegionEllipseShape(data);
      case "polygon": return new RegionPolygonShape(data);
      case "rectangle": return new RegionRectangleShape(data);
      default: throw new Error("Invalid shape type");
    }
  }

  /* -------------------------------------------- */

  /**
   * The data of this shape.
   * It is owned by the shape and must not be modified.
   * @type {ShapeData}
   */
  get data() {
    return this.#data;
  }

  #data;

  /* -------------------------------------------- */

  /**
   * Is this a hole?
   * @type {boolean}
   */
  get isHole() {
    return this.data.hole;
  }

  /* -------------------------------------------- */

  /**
   * The Clipper paths of this shape.
   * The winding numbers are 1 or 0.
   * @type {ReadonlyArray<ReadonlyArray<ClipperLib.IntPoint>>}
   */
  get clipperPaths() {
    return this.#clipperPaths ??= ClipperLib.Clipper.PolyTreeToPaths(this.clipperPolyTree);
  }

  #clipperPaths;

  /* -------------------------------------------- */

  /**
   * The Clipper polygon tree of this shape.
   * @type {ClipperLib.PolyTree}
   */
  get clipperPolyTree() {
    let clipperPolyTree = this.#clipperPolyTree;
    if ( !clipperPolyTree ) {
      clipperPolyTree = this._createClipperPolyTree();
      if ( Array.isArray(clipperPolyTree) ) {
        const clipperPolyNode = new ClipperLib.PolyNode();
        clipperPolyNode.m_polygon = clipperPolyTree;
        clipperPolyTree = new ClipperLib.PolyTree();
        clipperPolyTree.AddChild(clipperPolyNode);
        clipperPolyTree.m_AllPolys.push(clipperPolyNode);
      }
      this.#clipperPolyTree = clipperPolyTree;
    }
    return clipperPolyTree;
  }

  #clipperPolyTree;

  /* -------------------------------------------- */

  /**
   * Create the Clipper polygon tree of this shape.
   * This function may return a single positively-orientated and non-selfintersecting Clipper path instead of a tree,
   * which is automatically converted to a Clipper polygon tree.
   * This function is called only once. It is not called if the shape is empty.
   * @returns {ClipperLib.PolyTree|ClipperLib.IntPoint[]}
   * @protected
   * @abstract
   */
  _createClipperPolyTree() {
    throw new Error("A subclass of the RegionShape must implement the _createClipperPolyTree method.");
  }
}

/* -------------------------------------------- */

/**
 * A circle of a {@link foundry.documents.RegionDocument}.
 * @extends {RegionShape<CircleShapeData>}
 */
export class RegionCircleShape extends RegionShape {
  /**
   * @param {CircleShapeData} data   The circle shape data.
   */
  constructor(data) {
    if ( !(data instanceof CircleShapeData) ) throw new Error("Invalid shape data");
    super(data);
  }

  /* -------------------------------------------- */

  /**
   * The vertex density epsilon used to create a polygon approximation of the circle.
   * @type {number}
   */
  static #VERTEX_DENSITY_EPSILON = 1;

  /* -------------------------------------------- */

  /** @override */
  _createClipperPolyTree() {
    const data = this.data;
    const x = data.x * CLIPPER_SCALING_FACTOR;
    const y = data.y * CLIPPER_SCALING_FACTOR;
    const radius = data.radius * CLIPPER_SCALING_FACTOR;
    const epsilon = RegionCircleShape.#VERTEX_DENSITY_EPSILON * CLIPPER_SCALING_FACTOR;
    const density = PIXI.Circle.approximateVertexDensity(radius, epsilon);
    const path = new Array(density);
    for ( let i = 0; i < density; i++ ) {
      const angle = 2 * Math.PI * (i / density);
      path[i] = new ClipperLib.IntPoint(
        Math.round(x + (Math.cos(angle) * radius)),
        Math.round(y + (Math.sin(angle) * radius))
      );
    }
    return path;
  }
}

/* -------------------------------------------- */

/**
 * An ellipse of a {@link foundry.documents.RegionDocument}.
 * @extends {RegionShape<EllipseShapeData>}
 */
export class RegionEllipseShape extends RegionShape {
  /**
   * @param {EllipseShapeData} data   The ellipse shape data.
   */
  constructor(data) {
    if ( !(data instanceof EllipseShapeData) ) throw new Error("Invalid shape data");
    super(data);
  }

  /* -------------------------------------------- */

  /**
   * The vertex density epsilon used to create a polygon approximation of the circle.
   * @type {number}
   */
  static #VERTEX_DENSITY_EPSILON = 1;

  /* -------------------------------------------- */

  /** @override */
  _createClipperPolyTree() {
    const data = this.data;
    const x = data.x * CLIPPER_SCALING_FACTOR;
    const y = data.y * CLIPPER_SCALING_FACTOR;
    const radiusX = data.radiusX * CLIPPER_SCALING_FACTOR;
    const radiusY = data.radiusY * CLIPPER_SCALING_FACTOR;
    const epsilon = RegionEllipseShape.#VERTEX_DENSITY_EPSILON * CLIPPER_SCALING_FACTOR;
    const density = PIXI.Circle.approximateVertexDensity((radiusX + radiusY) / 2, epsilon);
    const rotation = Math.toRadians(data.rotation);
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const path = new Array(density);
    for ( let i = 0; i < density; i++ ) {
      const angle = 2 * Math.PI * (i / density);
      const dx = Math.cos(angle) * radiusX;
      const dy = Math.sin(angle) * radiusY;
      path[i] = new ClipperLib.IntPoint(
        Math.round(x + ((cos * dx) - (sin * dy))),
        Math.round(y + ((sin * dx) + (cos * dy)))
      );
    }
    return path;
  }
}

/* -------------------------------------------- */

/**
 * A polygon of a {@link foundry.documents.RegionDocument}.
 * @extends {RegionShape<PolygonShapeData>}
 */
export class RegionPolygonShape extends RegionShape {
  /**
   * @param {PolygonShapeData} data   The polygon shape data.
   */
  constructor(data) {
    if ( !(data instanceof PolygonShapeData) ) throw new Error("Invalid shape data");
    super(data);
  }

  /* -------------------------------------------- */

  /** @override */
  _createClipperPolyTree() {
    const points = this.data.points;
    const path = new Array(points.length / 2);
    for ( let i = 0, j = 0; i < path.length; i++ ) {
      path[i] = new ClipperLib.IntPoint(
        Math.round(points[j++] * CLIPPER_SCALING_FACTOR),
        Math.round(points[j++] * CLIPPER_SCALING_FACTOR)
      );
    }
    if ( !ClipperLib.Clipper.Orientation(path) ) path.reverse();
    return path;
  }
}

/* -------------------------------------------- */

/**
 * A rectangle of a {@link foundry.documents.RegionDocument}.
 * @extends {RegionShape<RectangleShapeData>}
 */
export class RegionRectangleShape extends RegionShape {
  /**
   * @param {RectangleShapeData} data   The rectangle shape data.
   */
  constructor(data) {
    if ( !(data instanceof RectangleShapeData) ) throw new Error("Invalid shape data");
    super(data);
  }

  /* -------------------------------------------- */

  /** @override */
  _createClipperPolyTree() {
    let p0;
    let p1;
    let p2;
    let p3;
    const {x, y, width, height, rotation} = this.data;
    let x0 = x * CLIPPER_SCALING_FACTOR;
    let y0 = y * CLIPPER_SCALING_FACTOR;
    let x1 = (x + width) * CLIPPER_SCALING_FACTOR;
    let y1 = (y + height) * CLIPPER_SCALING_FACTOR;

    // The basic non-rotated case
    if ( rotation === 0 ) {
      x0 = Math.round(x0);
      y0 = Math.round(y0);
      x1 = Math.round(x1);
      y1 = Math.round(y1);
      p0 = new ClipperLib.IntPoint(x0, y0);
      p1 = new ClipperLib.IntPoint(x1, y0);
      p2 = new ClipperLib.IntPoint(x1, y1);
      p3 = new ClipperLib.IntPoint(x0, y1);
    }

    // The more complex rotated case
    else {
      const tx = (x0 + x1) / 2;
      const ty = (y0 + y1) / 2;
      x0 -= tx;
      y0 -= ty;
      x1 -= tx;
      y1 -= ty;
      const angle = Math.toRadians(rotation);
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const x00 = Math.round((cos * x0) - (sin * y0) + tx);
      const y00 = Math.round((sin * x0) + (cos * y0) + ty);
      const x10 = Math.round((cos * x1) - (sin * y0) + tx);
      const y10 = Math.round((sin * x1) + (cos * y0) + ty);
      const x11 = Math.round((cos * x1) - (sin * y1) + tx);
      const y11 = Math.round((sin * x1) + (cos * y1) + ty);
      const x01 = Math.round((cos * x0) - (sin * y1) + tx);
      const y01 = Math.round((sin * x0) + (cos * y1) + ty);
      p0 = new ClipperLib.IntPoint(x00, y00);
      p1 = new ClipperLib.IntPoint(x10, y10);
      p2 = new ClipperLib.IntPoint(x11, y11);
      p3 = new ClipperLib.IntPoint(x01, y01);
    }
    return [p0, p1, p2, p3];
  }
}

import BaseGrid from "./base.mjs";
import {GRID_DIAGONALS, GRID_TYPES, MOVEMENT_DIRECTIONS} from "../constants.mjs";
import {logCompatibilityWarning} from "../utils/logging.mjs";

/**
 * @import {HexagonalGridConfiguration, GridOffset2D, GridOffset3D, HexagonalGridCube2D, HexagonalGridCube3D,
 *   HexagonalGridCoordinates2D, HexagonalGridCoordinates3D} from "./_types.mjs"
 * @import {Point, ElevatedPoint} from "../_types.mjs"
 * @import {GridDiagonalRule} from "../constants.mjs"
 */

/**
 * The hexagonal grid class.
 * @extends {BaseGrid<HexagonalGridCoordinates2D, HexagonalGridCoordinates3D>}
 */
export default class HexagonalGrid extends BaseGrid {
  /**
   * The hexagonal grid constructor.
   * @param {HexagonalGridConfiguration} config   The grid configuration
   */
  constructor(config) {
    super(config);
    const {columns, even} = config;

    // Set the type and size of the grid
    let type;
    if ( columns ) {
      if ( even ) type = GRID_TYPES.HEXEVENQ;
      else type = GRID_TYPES.HEXODDQ;
      this.sizeX *= (2 * Math.SQRT1_3);
    } else {
      if ( even ) type = GRID_TYPES.HEXEVENR;
      else type = GRID_TYPES.HEXODDR;
      this.sizeY *= (2 * Math.SQRT1_3);
    }

    /**
     * @override
     * @readonly
     */
    this.type = type;

    /**
     * Is this grid column-based (flat-topped) or row-based (pointy-topped)?
     * @type {boolean}
     * @readonly
     */
    this.columns = !!columns;

    /**
     * Is this grid even or odd?
     * @type {boolean}
     * @readonly
     */
    this.even = !!even;

    /**
     * The rule for diagonal measurement (see {@link CONST.GRID_DIAGONALS}).
     * @type {GridDiagonalRule}
     * @readonly
     */
    this.diagonals = config.diagonals ?? GRID_DIAGONALS.EQUIDISTANT;
  }

  /* -------------------------------------------- */

  /** @override */
  getOffset(coords) {
    if ( coords.i !== undefined ) {
      const {i, j, k} = coords;
      return k !== undefined ? {i, j, k}: {i, j};
    }
    const cube = coords.q !== undefined ? coords : this.pointToCube(coords);
    return this.cubeToOffset(HexagonalGrid.cubeRound(cube));
  }

  /* -------------------------------------------- */

  /** @override */
  getOffsetRange({x, y, width, height}) {
    const x0 = x;
    const y0 = y;
    const {i: i00, j: j00} = this.getOffset({x: x0, y: y0});
    if ( !((width > 0) && (height > 0)) ) return [i00, j00, i00, j00];
    const x1 = x + width;
    const y1 = y + height;
    const {i: i01, j: j01} = this.getOffset({x: x1, y: y0});
    const {i: i10, j: j10} = this.getOffset({x: x0, y: y1});
    const {i: i11, j: j11} = this.getOffset({x: x1, y: y1});
    let i0 = Math.min(i00, i01, i10, i11);
    let j0 = Math.min(j00, j01, j10, j11);
    let i1 = Math.max(i00, i01, i10, i11) + 1;
    let j1 = Math.max(j00, j01, j10, j11) + 1;
    // While the corners of the rectangle are included in this range, the edges of the rectangle might
    // intersect rows or columns outside of the range. So we need to expand the range if necessary.
    if ( this.columns ) {
      if ( (i00 === i01) && (j00 < j01) && (!(j00 % 2) !== this.even) && (y0 < i00 * this.sizeY) ) i0--;
      if ( (i10 === i11) && (j10 < j11) && (!(j00 % 2) === this.even) && (y1 > (i10 + 0.5) * this.sizeY) ) i1++;
      if ( (j00 === j10) && (i00 < i10) && (x0 < ((j00 * 0.75) + 0.25) * this.sizeX) ) j0--;
      if ( (j01 === j11) && (i01 < i11) && (x1 > ((j01 * 0.75) + 0.75) * this.sizeX) ) j1++;
    } else {
      if ( (j00 === j10) && (i00 < i10) && (!(i00 % 2) !== this.even) && (x0 < j00 * this.sizeX) ) j0--;
      if ( (j01 === j11) && (i01 < i11) && (!(i00 % 2) === this.even) && (x1 > (j01 + 0.5) * this.sizeX) ) j1++;
      if ( (i00 === i01) && (j00 < j01) && (y0 < ((i00 * 0.75) + 0.25) * this.sizeY) ) i0--;
      if ( (i10 === i11) && (j10 < j11) && (y1 > ((i10 * 0.75) + 0.75) * this.sizeY) ) i1++;
    }
    return [i0, j0, i1, j1];
  }

  /* -------------------------------------------- */

  /** @override */
  getAdjacentOffsets(coords) {
    return this.getAdjacentCubes(coords).map(cube => this.getOffset(cube));
  }

  /* -------------------------------------------- */

  /** @override */
  testAdjacency(coords1, coords2) {
    const c1 = this.getCube(coords1);
    const c2 = this.getCube(coords2);
    const d0 = HexagonalGrid.cubeDistance(c1, c2);
    if ( c1.k === undefined ) return d0 === 1;
    if ( d0 > 1 ) return false;
    const d1 = Math.abs(c1.k - c2.k);
    if ( d1 > 1 ) return false;
    if ( this.diagonals === GRID_DIAGONALS.ILLEGAL ) return d0 + d1 === 1;
    return d0 + d1 !== 0;
  }

  /* -------------------------------------------- */

  /** @override */
  getShiftedOffset(coords, direction) {
    const offset = this.getOffset(coords);
    if ( this.columns ) {
      if ( !(direction & MOVEMENT_DIRECTIONS.LEFT) !== !(direction & MOVEMENT_DIRECTIONS.RIGHT) ) {
        const even = (offset.j % 2 === 0) === this.even;
        if ( (even && (direction & MOVEMENT_DIRECTIONS.UP)) || (!even && (direction & MOVEMENT_DIRECTIONS.DOWN)) ) {
          direction &= ~(MOVEMENT_DIRECTIONS.UP | MOVEMENT_DIRECTIONS.DOWN);
        }
      }
    } else {
      if ( !(direction & MOVEMENT_DIRECTIONS.UP) !== !(direction & MOVEMENT_DIRECTIONS.DOWN) ) {
        const even = (offset.i % 2 === 0) === this.even;
        if ( (even && (direction & MOVEMENT_DIRECTIONS.LEFT)) || (!even && (direction & MOVEMENT_DIRECTIONS.RIGHT)) ) {
          direction &= ~(MOVEMENT_DIRECTIONS.LEFT | MOVEMENT_DIRECTIONS.RIGHT);
        }
      }
    }
    let di = 0;
    let dj = 0;
    let dk = 0;
    if ( direction & MOVEMENT_DIRECTIONS.UP ) di--;
    if ( direction & MOVEMENT_DIRECTIONS.DOWN ) di++;
    if ( direction & MOVEMENT_DIRECTIONS.LEFT ) dj--;
    if ( direction & MOVEMENT_DIRECTIONS.RIGHT ) dj++;
    if ( direction & MOVEMENT_DIRECTIONS.DESCEND ) dk--;
    if ( direction & MOVEMENT_DIRECTIONS.ASCEND ) dk++;
    if ( (((Math.abs(di) | Math.abs(dj)) + Math.abs(dk)) > 1) && (this.diagonals === GRID_DIAGONALS.ILLEGAL) ) {
      // Diagonal movement is not allowed
      di = 0;
      dj = 0;
      dk = 0;
    }
    offset.i += di;
    offset.j += dj;
    if ( offset.k !== undefined ) offset.k += dk;
    return offset;
  }

  /* -------------------------------------------- */

  /** @override */
  getShiftedPoint(point, direction) {
    const center = this.getCenterPoint(point);
    const shifted = this.getCenterPoint(this.getShiftedOffset(center, direction));
    shifted.x = point.x + (shifted.x - center.x);
    shifted.y = point.y + (shifted.y - center.y);
    if ( point.elevation !== undefined ) {
      shifted.elevation = point.elevation + (shifted.elevation - center.elevation);
    }
    return shifted;
  }

  /* -------------------------------------------- */

  /**
   * Returns the cube coordinates of the grid space corresponding to the given coordinates.
   * @overload
   * @param {HexagonalGridCoordinates2D} coords    The coordinates
   * @returns {HexagonalGridCube2D}                The cube coordinates
   */
  /**
   * @overload
   * @param {HexagonalGridCoordinates3D} coords    The coordinates
   * @returns {HexagonalGridCube3D}                The cube coordinates
   */
  getCube(coords) {
    if ( coords.i !== undefined ) return this.offsetToCube(coords);
    const cube = coords.q !== undefined ? coords : this.pointToCube(coords);
    return HexagonalGrid.cubeRound(cube);
  }

  /* -------------------------------------------- */

  /**
   * Returns the cube coordinates of grid spaces adjacent to the one corresponding to the given coordinates.
   * @overload
   * @param {HexagonalGridCoordinates2D} coords   The coordinates
   * @returns {HexagonalGridCube2D[]}             The adjacent cube coordinates
   */
  /**
   * @overload
   * @param {HexagonalGridCoordinates3D} coords   The coordinates
   * @returns {HexagonalGridCube3D[]}             The adjacent cube coordinates
   */
  getAdjacentCubes(coords) {
    const {q, r, s, k} = this.getCube(coords);
    return k !== undefined ? [
      {q: q - 1, r, s: s + 1, k: k - 1},
      {q: q - 1, r, s: s + 1, k},
      {q: q - 1, r, s: s + 1, k: k + 1},
      {q: q - 1, r: r + 1, s, k: k - 1},
      {q: q - 1, r: r + 1, s, k},
      {q: q - 1, r: r + 1, s, k: k + 1},
      {q, r: r - 1, s: s + 1, k: k - 1},
      {q, r: r - 1, s: s + 1, k},
      {q, r: r - 1, s: s + 1, k: k + 1},
      {q, r, s, k: k - 1},
      {q, r, s, k: k + 1},
      {q, r: r + 1, s: s - 1, k: k - 1},
      {q, r: r + 1, s: s - 1, k},
      {q, r: r + 1, s: s - 1, k: k + 1},
      {q: q + 1, r: r - 1, s, k: k - 1},
      {q: q + 1, r: r - 1, s, k},
      {q: q + 1, r: r - 1, s, k: k + 1},
      {q: q + 1, r, s: s - 1, k: k - 1},
      {q: q + 1, r, s: s - 1, k},
      {q: q + 1, r, s: s - 1, k: k + 1}
    ] : [
      {q: q - 1, r, s: s + 1},
      {q: q - 1, r: r + 1, s},
      {q, r: r - 1, s: s + 1},
      {q, r: r + 1, s: s - 1},
      {q: q + 1, r: r - 1, s},
      {q: q + 1, r, s: s - 1}
    ];
  }

  /* -------------------------------------------- */

  /**
   * Returns the cube coordinates of the grid space corresponding to the given coordinates
   * shifted by one grid space in the given direction.
   * @overload
   * @param {HexagonalGridCoordinates2D} coords    The coordinates
   * @param {number} direction                     The direction (see {@link CONST.MOVEMENT_DIRECTIONS})
   * @returns {HexagonalGridCube2D}                The cube coordinates
   */
  /**
   * @overload
   * @param {HexagonalGridCoordinates3D} coords    The coordinates
   * @param {number} direction                     The direction (see {@link CONST.MOVEMENT_DIRECTIONS})
   * @returns {HexagonalGridCube3D}                The cube coordinates
   */
  getShiftedCube(coords, direction) {
    return this.getCube(this.getShiftedOffset(coords, direction));
  }

  /* -------------------------------------------- */

  /** @override */
  getTopLeftPoint(coords) {
    if ( coords.i !== undefined ) {
      const {i, j, k} = coords;
      let x;
      let y;
      const size = this.size;
      if ( this.columns ) {
        x = (2 * Math.SQRT1_3) * ((0.75 * j) * size);
        const even = (j + 1) % 2 === 0;
        y = (i - (this.even === even ? 0.5 : 0)) * size;
      } else {
        y = (2 * Math.SQRT1_3) * ((0.75 * i) * size);
        const even = (i + 1) % 2 === 0;
        x = (j - (this.even === even ? 0.5 : 0)) * size;
      }
      return k !== undefined ? {x, y, elevation: k * this.distance} : {x, y};
    }
    const {q, r, k} = HexagonalGrid.cubeRound(coords.q !== undefined ? coords : this.pointToCube(coords));
    let x;
    let y;
    const size = this.size;
    if ( this.columns ) {
      x = (Math.SQRT3 / 2) * (q * size);
      y = ((0.5 * (q - (this.even ? 0 : 1))) + r) * size;
    } else {
      y = (Math.SQRT3 / 2) * (r * size);
      x = ((0.5 * (r - (this.even ? 0 : 1))) + q) * size;
    }
    return k !== undefined ? {x, y, elevation: k * this.distance} : {x, y};
  }

  /* -------------------------------------------- */

  /** @override */
  getCenterPoint(coords) {
    if ( coords.i !== undefined ) {
      const {i, j, k} = coords;
      let x;
      let y;
      const size = this.size;
      if ( this.columns ) {
        x = (2 * Math.SQRT1_3) * (((0.75 * j) + 0.5) * size);
        const even = (j + 1) % 2 === 0;
        y = (i + (this.even === even ? 0 : 0.5)) * size;
      } else {
        y = (2 * Math.SQRT1_3) * (((0.75 * i) + 0.5) * size);
        const even = (i + 1) % 2 === 0;
        x = (j + (this.even === even ? 0 : 0.5)) * size;
      }
      return k !== undefined ? {x, y, elevation: (k + 0.5) * this.distance} : {x, y};
    }
    const cube = HexagonalGrid.cubeRound(coords.q !== undefined ? coords : this.pointToCube(coords));
    if ( cube.k !== undefined ) cube.k += 0.5;
    return this.cubeToPoint(cube);
  }

  /* -------------------------------------------- */

  /** @override */
  getShape() {
    const scaleX = this.sizeX / 4;
    const scaleY = this.sizeY / 4;
    if ( this.columns ) {
      const x0 = -2 * scaleX;
      const x1 = -scaleX;
      const x2 = scaleX;
      const x3 = 2 * scaleX;
      const y0 = -2 * scaleY;
      const y1 = 2 * scaleY;
      return [{x: x0, y: 0}, {x: x1, y: y0}, {x: x2, y: y0}, {x: x3, y: 0}, {x: x2, y: y1}, {x: x1, y: y1}];
    } else {
      const y0 = -2 * scaleY;
      const y1 = -scaleY;
      const y2 = scaleY;
      const y3 = 2 * scaleY;
      const x0 = -2 * scaleX;
      const x1 = 2 * scaleX;
      return [{x: 0, y: y0}, {x: x1, y: y1}, {x: x1, y: y2}, {x: 0, y: y3}, {x: x0, y: y2}, {x: x0, y: y1}];
    }
  }

  /* -------------------------------------------- */

  /** @override */
  getVertices(coords) {
    const {i, j} = this.getOffset(coords);
    const scaleX = this.sizeX / 4;
    const scaleY = this.sizeY / 4;
    if ( this.columns ) {
      const x = 3 * j;
      const x0 = x * scaleX;
      const x1 = (x + 1) * scaleX;
      const x2 = (x + 3) * scaleX;
      const x3 = (x + 4) * scaleX;
      const even = (j + 1) % 2 === 0;
      const y = (4 * i) - (this.even === even ? 2 : 0);
      const y0 = y * scaleY;
      const y1 = (y + 2) * scaleY;
      const y2 = (y + 4) * scaleY;
      return [{x: x0, y: y1}, {x: x1, y: y0}, {x: x2, y: y0}, {x: x3, y: y1}, {x: x2, y: y2}, {x: x1, y: y2}];
    } else {
      const y = 3 * i;
      const y0 = y * scaleY;
      const y1 = (y + 1) * scaleY;
      const y2 = (y + 3) * scaleY;
      const y3 = (y + 4) * scaleY;
      const even = (i + 1) % 2 === 0;
      const x = (4 * j) - (this.even === even ? 2 : 0);
      const x0 = x * scaleX;
      const x1 = (x + 2) * scaleX;
      const x2 = (x + 4) * scaleX;
      return [{x: x1, y: y0}, {x: x2, y: y1}, {x: x2, y: y2}, {x: x1, y: y3}, {x: x0, y: y2}, {x: x0, y: y1}];
    }
  }

  /* -------------------------------------------- */

  /** @override */
  getSnappedPoint(point, {mode, resolution=1}) {
    if ( mode & ~0xFFF3 ) throw new Error("Invalid snapping mode");
    if ( mode === 0 ) {
      return point.elevation !== undefined ? {x: point.x, y: point.y, elevation: point.elevation}
        : {x: point.x, y: point.y};
    }

    let nearest;
    let distance;
    const keepNearest = candidate => {
      if ( !nearest ) return nearest = candidate;
      const {x, y} = point;
      distance ??= ((nearest.x - x) ** 2) + ((nearest.y - y) ** 2);
      const d = ((candidate.x - x) ** 2) + ((candidate.y - y) ** 2);
      if ( d < distance ) {
        nearest = candidate;
        distance = d;
      }
      return nearest;
    };

    // Symmetries and identities
    if ( this.columns ) {
      // Top-Left = Bottom-Left
      if ( mode & 0x50 ) mode |= 0x50; // Vertex
      if ( mode & 0x500 ) mode |= 0x500; // Corner
      // Top-Right = Bottom-Right
      if ( mode & 0xA0 ) mode |= 0xA0; // Vertex
      if ( mode & 0xA00 ) mode |= 0xA00; // Corner
      // Left Side = Right Vertex
      if ( mode & 0x4000 ) mode |= 0xA0;
      // Right Side = Left Vertex
      if ( mode & 0x8000 ) mode |= 0x50;
    } else {
      // Top-Left = Top-Right
      if ( mode & 0x30 ) mode |= 0x30; // Vertex
      if ( mode & 0x300 ) mode |= 0x300; // Corner
      // Bottom-Left = Bottom-Right
      if ( mode & 0xC0 ) mode |= 0xC0; // Vertex
      if ( mode & 0xC00 ) mode |= 0xC00; // Corner
      // Top Side = Bottom Vertex
      if ( mode & 0x1000 ) mode |= 0xC0;
      // Bottom Side = Top Vertex
      if ( mode & 0x2000 ) mode |= 0x30;
    }

    // Only top/bottom or left/right edges
    if ( !(mode & 0x2) ) {
      if ( this.columns ) {
        // Top/Left side (= edge)
        if ( mode & 0x3000 ) keepNearest(this.#snapToTopOrBottom(point, resolution));
      } else {
        // Left/Right side (= edge)
        if ( mode & 0xC000 ) keepNearest(this.#snapToLeftOrRight(point, resolution));
      }
    }

    // Any vertex (plus edge/center)
    if ( (mode & 0xF0) === 0xF0 ) {
      switch ( mode & 0x3 ) {
        case 0x0: keepNearest(this.#snapToVertex(point, resolution)); break;
        case 0x1: keepNearest(this.#snapToVertexOrCenter(point, resolution)); break;
        case 0x2: keepNearest(this.#snapToEdgeOrVertex(point, resolution)); break;
        case 0x3: keepNearest(this.#snapToEdgeOrVertexOrCenter(point, resolution)); break;
      }
    }
    // A specific vertex
    else if ( mode & 0xF0 ) {
      // Center
      if ( (mode & 0x3) === 0x1 ) {
        keepNearest(this.#snapToSpecificVertexOrCenter(point, !(mode & 0x10), resolution));
      } else {
        // Edge and/or center
        switch ( mode & 0x3 ) {
          case 0x2: keepNearest(this.#snapToEdge(point, resolution)); break;
          case 0x3: keepNearest(this.#snapToEdgeOrCenter(point, resolution)); break;
        }

        // A combination of specific vertices and corners that results in a rectangular grid
        if ( ((mode & 0xF0) ^ ((mode & 0xF00) >> 4)) === 0xF0 ) {
          return keepNearest(this.#snapToRectangularGrid(point, !(mode & 0x100), resolution));
        }

        keepNearest(this.#snapToSpecificVertex(point, !(mode & 0x10), resolution));
      }
    }
    // Edges and/or centers
    else {
      switch ( mode & 0x3 ) {
        case 0x1: keepNearest(this.#snapToCenter(point, resolution)); break;
        case 0x2: keepNearest(this.#snapToEdge(point, resolution)); break;
        case 0x3: keepNearest(this.#snapToEdgeOrCenter(point, resolution)); break;
      }
    }

    // Any corner
    if ( (mode & 0xF00) === 0xF00 ) {
      keepNearest(this.#snapToCorner(point, resolution));
    }
    // A specific corner
    else if ( mode & 0xF00 ) {
      keepNearest(this.#snapToSpecificCorner(point, !(mode & 0x100), resolution));
    }

    return point.elevation === undefined ? nearest
      : {x: nearest.x, y: nearest.y, elevation: Math.round((point.elevation / this.distance) + 1e-8) * this.distance};
  }

  /* -------------------------------------------- */

  /**
   * Snap the point to the nearest center of a hexagon.
   * @param {Point} point          The point
   * @param {number} resolution    The grid resolution
   * @param {number} [dx=0]        The x-translation of the grid
   * @param {number} [dy=0]        The y-translation of the grid
   * @param {boolean} [columns]    Flat-top instead of pointy-top?
   * @param {boolean} [even]       Start at a full grid space?
   * @param {number} [size]        The size of a grid space
   * @returns {Point}              The snapped point
   */
  #snapToCenter({x, y}, resolution, dx=0, dy=0, columns=this.columns, even=this.even, size=this.size) {

    // Subdivide the hex grid
    const grid = HexagonalGrid.#TEMP_GRID;
    grid.columns = columns;
    grid.size = size / resolution;
    if ( columns ) {
      grid.type = GRID_TYPES.HEXODDQ;
      grid.sizeX = grid.size * (2 * Math.SQRT1_3);
      grid.sizeY = grid.size;
    } else {
      grid.type = GRID_TYPES.HEXODDR;
      grid.sizeX = grid.size;
      grid.sizeY = grid.size * (2 * Math.SQRT1_3);
    }

    // Align the subdivided grid with this hex grid
    if ( columns ) {
      dx += ((size - grid.size) * Math.SQRT1_3);
      if ( even ) dy += (size / 2);
    } else {
      if ( even ) dx += (size / 2);
      dy += ((size - grid.size) * Math.SQRT1_3);
    }

    // Get the snapped center point for the subdivision
    const point = HexagonalGrid.#TEMP_POINT;
    point.x = x - dx;
    point.y = y - dy;
    const snapped = grid.getCenterPoint(point);
    snapped.x += dx;
    snapped.y += dy;
    return snapped;
  }

  /* -------------------------------------------- */

  /**
   * Snap the point to the nearest vertex of a hexagon.
   * @param {Point} point          The point
   * @param {number} resolution    The grid resolution
   * @param {number} [dx=0]        The x-offset of the grid
   * @param {number} [dy=0]        The y-offset of the grid
   * @returns {Point}              The snapped point
   */
  #snapToVertex(point, resolution, dx, dy) {
    const center = this.#snapToCenter(point, resolution, dx, dy);
    const {x: x0, y: y0} = center;
    let angle = Math.atan2(point.y - y0, point.x - x0);
    if ( this.columns ) angle = Math.round(angle / (Math.PI / 3)) * (Math.PI / 3);
    else angle = (Math.floor(angle / (Math.PI / 3)) + 0.5) * (Math.PI / 3);
    const radius = Math.max(this.sizeX, this.sizeY) / (2 * resolution);
    const vertex = center; // Reuse the object
    vertex.x = x0 + (Math.cos(angle) * radius);
    vertex.y = y0 + (Math.sin(angle) * radius);
    return vertex;
  }

  /* -------------------------------------------- */

  /**
   * Snap the point to the nearest vertex or center of a hexagon.
   * @param {Point} point          The point
   * @param {number} resolution    The grid resolution
   * @returns {Point}              The snapped point
   */
  #snapToVertexOrCenter(point, resolution) {
    let size;
    let dx = 0;
    let dy = 0;
    if ( this.columns ) {
      size = this.sizeX / 2;
      dy = size * (Math.SQRT1_3 / 2);
    } else {
      size = this.sizeY / 2;
      dx = size * (Math.SQRT1_3 / 2);
    }
    return this.#snapToCenter(point, resolution, dx, dy, !this.columns, !this.even, size);
  }

  /* -------------------------------------------- */

  /**
   * Snap the point to the nearest edge of a hexagon.
   * @param {Point} point          The point
   * @param {number} resolution    The grid resolution
   * @returns {Point}              The snapped point
   */
  #snapToEdge(point, resolution) {
    const center = this.#snapToCenter(point, resolution);
    const {x: x0, y: y0} = center;
    let angle = Math.atan2(point.y - y0, point.x - x0);
    if ( this.columns ) angle = (Math.floor(angle / (Math.PI / 3)) + 0.5) * (Math.PI / 3);
    else angle = Math.round(angle / (Math.PI / 3)) * (Math.PI / 3);
    const radius = Math.min(this.sizeX, this.sizeY) / (2 * resolution);
    const vertex = center; // Reuse the object
    vertex.x = x0 + (Math.cos(angle) * radius);
    vertex.y = y0 + (Math.sin(angle) * radius);
    return vertex;
  }

  /* -------------------------------------------- */

  /**
   * Snap the point to the nearest edge or center of a hexagon.
   * @param {Point} point          The point
   * @param {number} resolution    The grid resolution
   * @returns {Point}              The snapped point
   */
  #snapToEdgeOrCenter(point, resolution) {
    let size;
    let dx = 0;
    let dy = 0;
    if ( this.columns ) {
      size = this.sizeY / 2;
      dx = size * Math.SQRT1_3;
    } else {
      size = this.sizeX / 2;
      dy = size * Math.SQRT1_3;
    }
    return this.#snapToCenter(point, resolution, dx, dy, this.columns, false, size);
  }

  /* -------------------------------------------- */

  /**
   * Snap the point to the nearest edge or vertex of a hexagon.
   * @param {Point} point          The point
   * @param {number} resolution    The grid resolution
   * @returns {Point}              The snapped point
   */
  #snapToEdgeOrVertex(point, resolution) {
    const {x, y} = point;
    point = this.#snapToCenter(point, resolution);
    const {x: x0, y: y0} = point;
    const dx = x - x0;
    const dy = y - y0;
    let angle = Math.atan2(dy, dx);
    if ( this.columns ) angle = (Math.floor(angle / (Math.PI / 3)) + 0.5) * (Math.PI / 3);
    else angle = Math.round(angle / (Math.PI / 3)) * (Math.PI / 3);
    const s = 2 * resolution;
    let radius1 = this.sizeX / s;
    let radius2 = this.sizeY / s;
    if ( radius1 > radius2 ) [radius1, radius2] = [radius2, radius1];
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const d = (cos * dy) - (sin * dx);
    if ( Math.abs(d) <= radius2 / 4 ) {
      point.x = x0 + (cos * radius1);
      point.y = y0 + (sin * radius1);
    } else {
      angle += ((Math.PI / 6) * Math.sign(d));
      point.x = x0 + (Math.cos(angle) * radius2);
      point.y = y0 + (Math.sin(angle) * radius2);
    }
    return point;
  }

  /* -------------------------------------------- */

  /**
   * Snap the point to the nearest edge, vertex, center of a hexagon.
   * @param {Point} point          The point
   * @param {number} resolution    The grid resolution
   * @returns {Point}              The snapped point
   */
  #snapToEdgeOrVertexOrCenter(point, resolution) {
    const {x, y} = point;
    point = this.#snapToCenter(point, resolution);
    const {x: x0, y: y0} = point;
    const dx = x - x0;
    const dy = y - y0;
    let angle = Math.atan2(dy, dx);
    if ( this.columns ) angle = (Math.floor(angle / (Math.PI / 3)) + 0.5) * (Math.PI / 3);
    else angle = Math.round(angle / (Math.PI / 3)) * (Math.PI / 3);
    const s = 2 * resolution;
    let radius1 = this.sizeX / s;
    let radius2 = this.sizeY / s;
    if ( radius1 > radius2 ) [radius1, radius2] = [radius2, radius1];
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const d1 = (cos * dx) + (sin * dy);
    if ( d1 <= radius1 / 2 ) return point;
    const d2 = (cos * dy) - (sin * dx);
    if ( Math.abs(d2) <= radius2 / 4 ) {
      point.x = x0 + (cos * radius1);
      point.y = y0 + (sin * radius1);
    } else {
      angle += ((Math.PI / 6) * Math.sign(d2));
      point.x = x0 + (Math.cos(angle) * radius2);
      point.y = y0 + (Math.sin(angle) * radius2);
    }
    return point;
  }

  /* -------------------------------------------- */

  /**
   * Snap the point to the nearest corner of a hexagon.
   * @param {Point} point          The point
   * @param {number} resolution    The grid resolution
   * @returns {Point}              The snapped point
   */
  #snapToCorner(point, resolution) {
    let dx = 0;
    let dy = 0;
    const s = 2 * resolution;
    if ( this.columns ) dy = this.sizeY / s;
    else dx = this.sizeX / s;
    return this.#snapToVertex(point, resolution, dx, dy);
  }

  /* -------------------------------------------- */

  /**
   * Snap the point to the nearest top/bottom-left/right vertex of a hexagon.
   * @param {Point} point          The point
   * @param {boolean} other        Bottom-right instead of top-left vertex?
   * @param {number} resolution    The grid resolution
   * @returns {Point}              The snapped point
   */
  #snapToSpecificVertex(point, other, resolution) {
    let dx = 0;
    let dy = 0;
    const s = (other ? -2 : 2) * resolution;
    if ( this.columns ) dx = this.sizeX / s;
    else dy = this.sizeY / s;
    return this.#snapToCenter(point, resolution, dx, dy);
  }

  /* -------------------------------------------- */

  /**
   * Snap the point to the nearest top/bottom-left/right vertex or center of a hexagon.
   * @param {Point} point          The point
   * @param {boolean} other        Bottom-right instead of top-left vertex?
   * @param {number} resolution    The grid resolution
   * @returns {Point}              The snapped point
   */
  #snapToSpecificVertexOrCenter(point, other, resolution) {
    let dx = 0;
    let dy = 0;
    const s = (other ? 2 : -2) * resolution;
    if ( this.columns ) dx = this.sizeX / s;
    else dy = this.sizeY / s;
    return this.#snapToVertex(point, resolution, dx, dy);
  }

  /* -------------------------------------------- */

  /**
   * Snap the point to the nearest top/bottom-left/right corner of a hexagon.
   * @param {Point} point          The point
   * @param {boolean} other        Bottom-right instead of top-left corner?
   * @param {number} resolution    The grid resolution
   * @returns {Point}              The snapped point
   */
  #snapToSpecificCorner(point, other, resolution) {
    let dx = 0;
    let dy = 0;
    const s = (other ? -4 : 4) * resolution;
    if ( this.columns ) dx = this.sizeX / s;
    else dy = this.sizeY / s;
    return this.#snapToCenter(point, resolution, dx, dy);
  }

  /* -------------------------------------------- */

  /**
   * Snap the point to the nearest grid intersection of the rectanglar grid.
   * @param {Point} point          The point
   * @param {boolean} other        Align rectangles with top-left vertices instead of top-left corners?
   * @param {number} resolution    The grid resolution
   * @returns {Point}              The snapped point
   */
  #snapToRectangularGrid(point, other, resolution) {
    const tx = this.sizeX / 2;
    const ty = this.sizeY / 2;
    let sx = tx;
    let sy = ty;
    let dx = 0;
    let dy = 0;
    const d = other ? 1 / 3 : 2 / 3;
    if ( this.columns ) {
      sx *= 1.5;
      dx = d;
    } else {
      sy *= 1.5;
      dy = d;
    }
    sx /= resolution;
    sy /= resolution;
    return {
      x: ((Math.round(((point.x - tx) / sx) + dx) - dx) * sx) + tx,
      y: ((Math.round(((point.y - ty) / sy) + dy) - dy) * sy) + ty
    };
  }

  /**
   * Snap the point to the nearest top/bottom side of the bounds of a hexagon.
   * @param {Point} point          The point
   * @param {number} resolution    The grid resolution
   * @returns {Point}              The snapped point
   */
  #snapToTopOrBottom(point, resolution) {
    return this.#snapToCenter(point, resolution, 0, this.sizeY / (2 * resolution));
  }

  /* -------------------------------------------- */

  /**
   * Snap the point to the nearest left/right side of the bounds of a hexagon.
   * @param {Point} point          The point
   * @param {number} resolution    The grid resolution
   * @returns {Point}              The snapped point
   */
  #snapToLeftOrRight(point, resolution) {
    return this.#snapToCenter(point, resolution, this.sizeX / (2 * resolution), 0);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  calculateDimensions(sceneWidth, sceneHeight, padding) {
    const {columns, size} = this;
    const sizeX = columns ? (2 * size) / Math.SQRT3 : size;
    const sizeY = columns ? size : (2 * size) / Math.SQRT3;
    const strideX = columns ? 0.75 * sizeX : sizeX;
    const strideY = columns ? sizeY : 0.75 * sizeY;

    // Skip padding computation for Scenes which do not include padding
    if ( !padding ) {
      const cols = Math.ceil(((sceneWidth + (columns ? -sizeX / 4 : sizeX / 2)) / strideX) - 1e-6);
      const rows = Math.ceil(((sceneHeight + (columns ? sizeY / 2 : -sizeY / 4)) / strideY) - 1e-6);
      return {width: sceneWidth, height: sceneHeight, x: 0, y: 0, rows, columns: cols};
    }

    // The grid size is equal to the short diagonal of the hexagon, so padding in that axis will divide evenly by the
    // grid size. In the cross-axis, however, the hexagons do not stack but instead interleave. Multiplying the long
    // diagonal by 75% gives us the amount of space each hexagon takes up in that axis without overlapping.
    // Note: Do not replace `* (1 / strideX)` by `/ strideX` and `* (1 / strideY)` by `/ strideY`!
    // It could change the result and therefore break certain scenes.
    let x = Math.ceil((padding * sceneWidth) * (1 / strideX)) * strideX;
    let y = Math.ceil((padding * sceneHeight) * (1 / strideY)) * strideY;
    // Note: The width and height calculation needs rounded x/y. If we were to remove the rounding here,
    // the result of the rounding of the width and height below would change in certain scenes.
    let width = sceneWidth + (2 * Math.round(Math.ceil((padding * sceneWidth) * (1 / strideX)) / (1 / strideX)));
    let height = sceneHeight + (2 * Math.round(Math.ceil((padding * sceneHeight) * (1 / strideY)) / (1 / strideY)));

    // Ensure that the top-left hexagon of the scene rectangle is always a full hexagon for even grids and always a
    // half hexagon for odd grids, by shifting the padding in the main axis by half a hex if the number of hexagons in
    // the cross-axis is odd.
    const crossEven = Math.round(columns ? x / strideX : y / strideY) % 2 === 0;
    if ( !crossEven ) {
      if ( columns ) {
        y += (sizeY / 2);
        height += sizeY;
      } else {
        x += (sizeX / 2);
        width += sizeX;
      }
    }

    // The height (if column orientation) or width (if row orientation) must be a multiple of the grid size, and
    // the last column (if column orientation) or row (if row orientation) must be fully within the bounds.
    // Note: Do not replace `* (1 / strideX)` by `/ strideX` and `* (1 / strideY)` by `/ strideY`!
    // It could change the result and therefore break certain scenes.
    let cols = Math.round(width * (1 / strideX));
    let rows = Math.round(height * (1 / strideY));
    width = cols * strideX;
    height = rows * strideY;
    if ( columns ) {
      rows++;
      width += (sizeX / 4);
    } else {
      cols++;
      height += (sizeY / 4);
    }
    return {width, height, x, y, rows, columns: cols};
  }

  /* -------------------------------------------- */

  /**
   * Calculate the total size of the canvas with padding applied, as well as the top-left coordinates of the inner
   * rectangle that houses the scene. (Legacy)
   * @param {number} columns            Column or row orientation?
   * @param {number} legacySize         The legacy size of the grid.
   * @param {number} sceneWidth         The width of the scene.
   * @param {number} sceneHeight        The height of the scene.
   * @param {number} padding            The percentage of padding.
   * @returns {{width: number, height: number, x: number, y: number, rows: number, columns: number}}
   * @internal
   * @ignore
   */
  static _calculatePreV10Dimensions(columns, legacySize, sceneWidth, sceneHeight, padding) {
    // Note: Do not replace `* (1 / legacySize)` by `/ legacySize`!
    // It could change the result and therefore break certain scenes.
    const x = Math.ceil((padding * sceneWidth) * (1 / legacySize)) * legacySize;
    const y = Math.ceil((padding * sceneHeight) * (1 / legacySize)) * legacySize;
    const width = sceneWidth + (2 * x);
    const height = sceneHeight + (2 * y);
    const size = legacySize * (Math.SQRT3 / 2);
    const sizeX = columns ? legacySize : size;
    const sizeY = columns ? size : legacySize;
    const strideX = columns ? 0.75 * sizeX : sizeX;
    const strideY = columns ? sizeY : 0.75 * sizeY;
    const cols = Math.floor(((width + (columns ? sizeX / 4 : sizeX)) / strideX) + 1e-6);
    const rows = Math.floor(((height + (columns ? sizeY : sizeY / 4)) / strideY) + 1e-6);
    return {width, height, x, y, rows, columns: cols};
  }

  /* -------------------------------------------- */

  /** @override */
  _measurePath(waypoints, {cost}, result) {

    // Convert to (fractional) cube coordinates
    const toCube = coords => {
      if ( coords.x !== undefined ) return this.pointToCube(coords);
      if ( coords.i !== undefined ) return this.offsetToCube(coords);
      return coords;
    };

    // Prepare data for the starting point
    const w0 = waypoints[0];
    let o0 = this.getOffset(w0);
    let c0 = this.offsetToCube(o0);
    let d0 = toCube(w0);
    let p0 = w0.x !== undefined ? w0 : this.cubeToPoint(d0);

    // Iterate over additional path points
    const is3D = o0.k !== undefined;
    const diagonals = this.diagonals;
    let nd = diagonals === GRID_DIAGONALS.ALTERNATING_2 ? 1 : 0;
    let ld = nd;
    for ( let i = 1; i < waypoints.length; i++ ) {
      const w1 = waypoints[i];
      const o1 = this.getOffset(w1);
      const c1 = this.offsetToCube(o1);
      const d1 = toCube(w1);
      const p1 = w1.x !== undefined ? w1 : this.cubeToPoint(d1);
      const cost1 = w1.cost ?? cost;

      // Determine the number of moves total, number of diagonal moves, and cost of the moves
      if ( w1.measure !== false ) {
        let n = HexagonalGrid.cubeDistance(c0, c1);
        let d = 0;
        if ( is3D ) {
          d = Math.abs(c0.k - c1.k);
          if ( n < d ) [n, d] = [d, n];
        }
        let c;
        const nd0 = nd;
        switch ( diagonals ) {
          case GRID_DIAGONALS.EQUIDISTANT: c = n; break;
          case GRID_DIAGONALS.EXACT: c = n + ((Math.SQRT2 - 1) * d); break;
          case GRID_DIAGONALS.APPROXIMATE: c = n + (0.5 * d); break;
          case GRID_DIAGONALS.RECTILINEAR: c = n + d; break;
          case GRID_DIAGONALS.ALTERNATING_1:
          case GRID_DIAGONALS.ALTERNATING_2:
            nd += d;
            c = n + (Math.floor(nd / 2) - Math.floor(nd0 / 2));
            break;
          case GRID_DIAGONALS.ILLEGAL:
            n = n + d;
            d = 0;
            c = n;
            break;
        }

        // Determine the distance of the segment
        let a = HexagonalGrid.cubeDistance(d0, d1);
        let b = 0;
        if ( is3D ) {
          b = Math.abs(d0.k - d1.k);
          if ( a < b ) [a, b] = [b, a];
        }
        let l;
        switch ( diagonals ) {
          case GRID_DIAGONALS.EQUIDISTANT: l = a; break;
          case GRID_DIAGONALS.EXACT: l = a + ((Math.SQRT2 - 1) * b); break;
          case GRID_DIAGONALS.APPROXIMATE: l = a + (0.5 * b); break;
          case GRID_DIAGONALS.ILLEGAL: l = a + b; break;
          case GRID_DIAGONALS.ALTERNATING_1:
          case GRID_DIAGONALS.ALTERNATING_2: {
            const ld0 = ld;
            ld += b;
            l = a + ((Math.abs(((ld - 1) / 2) - Math.floor(ld / 2)) + ((ld - 1) / 2))
              - (Math.abs(((ld0 - 1) / 2) - Math.floor(ld0 / 2)) + ((ld0 - 1) / 2)));
            break;
          }
          case GRID_DIAGONALS.RECTILINEAR: l = a + b; break;
        }
        if ( l.almostEqual(c) ) l = c;

        const segment = result.segments[i - 1];
        segment.distance = l * this.distance;
        if ( (cost1 === undefined) || (c === 0) ) segment.cost = w1.teleport ? 0 : c * this.distance;
        else if ( typeof cost1 === "function" ) segment.cost = w1.teleport ? cost1(o0, o1, c * this.distance, w1)
          : this.#calculateCost(o0, o1, cost1, nd0, w1);
        else segment.cost = Number(cost1);
        segment.spaces = n;
        segment.diagonals = d;
        segment.euclidean = Math.hypot(p0.x - p1.x, p0.y - p1.y, is3D ? (p0.elevation - p1.elevation) / this.distance
          * this.size : 0) / this.size * this.distance;
      }

      o0 = o1;
      c0 = c1;
      d0 = d1;
      p0 = p1;
    }
  }

  /* -------------------------------------------- */

  /**
   * Calculate the cost of the direct path segment.
   * @template SegmentData
   * @overload
   * @param {GridOffset2D} from      The coordinates the segment starts from
   * @param {GridOffset2D} to        The coordinates the segment goes to
   * @param {GridMeasurePathCostFunction2D<SegmentData>} cost    The cost function
   * @param {number} diagonals       The number of diagonal moves that have been performed already
   * @param {SegmentData} segment    The segment data
   * @returns {number}               The cost of the path segment
   */
  /**
   * @overload
   * @param {GridOffset3D} from      The coordinates the segment starts from
   * @param {GridOffset3D} to        The coordinates the segment goes to
   * @param {GridMeasurePathCostFunction3D<SegmentData>} cost    The cost function
   * @param {number} diagonals       The number of diagonal moves that have been performed already
   * @param {SegmentData} segment    The segment data
   * @returns {number}               The cost of the path segment
   */
  #calculateCost(from, to, cost, diagonals, segment) {
    const path = this.getDirectPath([from, to]);
    if ( path.length <= 1 ) return 0;

    // Prepare data for the starting point
    let o0 = path[0];
    let c = 0;

    // Iterate over additional path points
    for ( let i = 1; i < path.length; i++ ) {
      const o1 = path[i];

      // Determine the normalized distance
      let d;
      if ( (o0.k === o1.k) || ((o0.i === o1.i) && (o0.j === o1.j)) ) d = 1;
      else {
        switch ( this.diagonals ) {
          case GRID_DIAGONALS.EQUIDISTANT: d = 1; break;
          case GRID_DIAGONALS.EXACT: d = Math.SQRT2; break;
          case GRID_DIAGONALS.APPROXIMATE: d = 1.5; break;
          case GRID_DIAGONALS.RECTILINEAR: d = 2; break;
          case GRID_DIAGONALS.ALTERNATING_1:
          case GRID_DIAGONALS.ALTERNATING_2:
            d = 1 + (Math.floor((diagonals + 1) / 2) - Math.floor(diagonals / 2));
            break;
        }
        diagonals++;
      }

      // Calculate and accumulate the cost
      c += cost(o0, o1, d * this.distance, segment);

      o0 = o1;
    }

    return c;
  }

  /* -------------------------------------------- */

  /**
   * @see {@link https://www.redblobgames.com/grids/hexagons/#line-drawing}
   * @override
   */
  getDirectPath(waypoints) {
    if ( waypoints.length === 0 ) return [];

    // Prepare data for the starting point
    let c0 = this.getCube(waypoints[0]);
    let {q: q0, r: r0, k: k0} = c0;
    const is3D = k0 !== undefined;
    const path = [this.getOffset(c0)];

    // Iterate over additional path points
    const diagonals = this.diagonals !== GRID_DIAGONALS.ILLEGAL;
    for ( let i = 1; i < waypoints.length; i++ ) {
      const c1 = this.getCube(waypoints[i]);
      const {q: q1, r: r1, s: s0, k: k1} = c1;
      if ( (q0 === q1) && (r0 === r1) && (k0 === k1) ) continue;

      // Walk from (q0, r0, s0, k0) to (q1, r1, s1, k1)
      const dq = q0 - q1;
      const dr = r0 - r1;
      // If the path segment is collinear with some hexagon edge, we need to nudge
      // the cube coordinates in the right direction so that we get a consistent, clean path.
      const EPS = 1e-6;
      let eq = 0;
      let er = 0;
      if ( this.columns ) {
        // Collinear with SE-NW edges
        if ( dq === dr ) {
          // Prefer movement such that we have rotational symmetry with the E-W case at (0, 0, 0)
          er = !((q0 + r0) & 1) === this.even ? EPS : -EPS;
          eq = -er;
        }
        // Collinear with SW-NE edges
        else if ( -2 * dq === dr ) {
          // Prefer movement such that we have rotational symmetry with the E-W case at (0, 0, 0)
          eq = !(r0 & 1) === this.even ? EPS : -EPS;
        }
        // Collinear with E-W edges
        else if ( dq === -2 * dr ) {
          // Move such we don't leave the row that we're in
          er = !(q0 & 1) === this.even ? -EPS : EPS;
        }
      } else {
        // Collinear with SE-NW edges
        if ( dq === dr ) {
          // Prefer movement such that we have rotational symmetry with the S-N case at (0, 0, 0)
          eq = !((q0 + r0) & 1) === this.even ? EPS : -EPS;
          er = -eq;
        }
        // Collinear with SW-NE edges
        else if ( dq === -2 * dr ) {
          // Prefer movement such that we have rotational symmetry with the S-N case at (0, 0, 0)
          er = !(q0 & 1) === this.even ? EPS : -EPS;
        }
        // Collinear with S-N edges
        else if ( -2 * dq === dr ) {
          // Move such we don't leave the column that we're in
          eq = !(r0 & 1) === this.even ? -EPS : EPS;
        }
      }
      const n = HexagonalGrid.cubeDistance(c0, c1);
      if ( is3D ) {
        if ( n !== 0 ) {
          let q = q0;
          let r = r0;
          let s = s0;
          let k = k0;
          let j = 0;
          const sk = k0 < k1 ? 1 : -1;
          if ( diagonals ) {
            const dk = 0 - Math.abs(k0 - k1);
            let e = n + dk;
            for ( ;; ) {
              const e2 = e * 2;
              if ( e2 >= dk ) {
                e += dk;
                j++;

                // Break tries on E-W (if columns) / S-N (if rows) edges
                const t = (j + EPS) / n;
                q = Math.mix(q0, q1, t) + eq;
                r = Math.mix(r0, r1, t) + er;
                s = 0 - q - r;
              }
              if ( e2 <= n ) {
                e += n;
                k += sk;
              }
              if ( (j === n) && (k === k1) ) break;
              path.push(this.getOffset({q, r, s, k}));
            }
          } else {
            const dk1 = Math.abs(k0 - k1) || 1;
            let tc = dk1;
            let tk = n;
            for ( ;; ) {
              if ( tc <= tk ) {
                tc += dk1;
                j++;

                // Break tries on E-W (if columns) / S-N (if rows) edges
                const t = (j + EPS) / n;
                q = Math.mix(q0, q1, t) + eq;
                r = Math.mix(r0, r1, t) + er;
                s = 0 - q - r;
              } else {
                tk += n;
                k += sk;
              }
              if ( (j === n) && (k === k1) ) break;
              path.push(this.getOffset({q, r, s, k}));
            }
          }
          path.push(this.getOffset(c1));
        } else {
          const {i, j} = path.at(-1);
          let k = k0;
          const sk = k0 < k1 ? 1 : -1;
          while ( k !== k1 ) {
            k += sk;
            path.push({i, j, k});
          }
        }
      } else {
        for ( let j = 1; j < n; j++ ) {
          // Break tries on E-W (if columns) / S-N (if rows) edges
          const t = (j + EPS) / n;
          const q = Math.mix(q0, q1, t) + eq;
          const r = Math.mix(r0, r1, t) + er;
          const s = 0 - q - r;
          path.push(this.getOffset({q, r, s}));
        }
        path.push(this.getOffset(c1));
      }

      c0 = c1;
      q0 = q1;
      r0 = r1;
      k0 = k1;
    }

    return path;
  }

  /* -------------------------------------------- */

  /** @override */
  getTranslatedPoint(point, direction, distance) {
    direction = Math.toRadians(direction);
    const dx = Math.cos(direction);
    const dy = Math.sin(direction);
    let q;
    let r;
    if ( this.columns ) {
      q = (2 * Math.SQRT1_3) * dx;
      r = (-0.5 * q) + dy;
    } else {
      r = (2 * Math.SQRT1_3) * dy;
      q = (-0.5 * r) + dx;
    }
    const s = distance / this.distance * this.size / ((Math.abs(r) + Math.abs(q) + Math.abs(q + r)) / 2);
    const x = point.x + (dx * s);
    const y = point.y + (dy * s);
    const elevation = point.elevation;
    return elevation !== undefined ? {x, y, elevation} : {x, y};
  }

  /* -------------------------------------------- */

  /** @override */
  getCircle({x, y}, radius) {
    if ( radius <= 0 ) return [];
    const r = radius / this.distance * this.size;
    if ( this.columns ) {
      const x0 = r * (Math.SQRT3 / 2);
      const x1 = -x0;
      const y0 = r;
      const y1 = y0 / 2;
      const y2 = -y1;
      const y3 = -y0;
      return [{x: x, y: y + y0}, {x: x + x1, y: y + y1}, {x: x + x1, y: y + y2},
        {x: x, y: y + y3}, {x: x + x0, y: y + y2}, {x: x + x0, y: y + y1}];
    } else {
      const y0 = r * (Math.SQRT3 / 2);
      const y1 = -y0;
      const x0 = r;
      const x1 = x0 / 2;
      const x2 = -x1;
      const x3 = -x0;
      return [{x: x + x0, y: y}, {x: x + x1, y: y + y0}, {x: x + x2, y: y + y0},
        {x: x + x3, y: y}, {x: x + x2, y: y + y1}, {x: x + x1, y: y + y1}];
    }
  }

  /* -------------------------------------------- */
  /*  Conversion Functions                        */
  /* -------------------------------------------- */

  /**
   * Round the fractional cube coordinates (q, r, s) / (q, r, s, k).
   * The k-coordinate is floored.
   * @see {@link https://www.redblobgames.com/grids/hexagons/}
   * @overload
   * @param {HexagonalGridCube2D} cube    The fractional cube coordinates
   * @returns {HexagonalGridCube2D}       The rounded integer cube coordinates
   */
  /**
   * @overload
   * @param {HexagonalGridCube3D} cube    The fractional cube coordinates
   * @returns {HexagonalGridCube3D}       The rounded integer cube coordinates
   */
  static cubeRound({q, r, s, k}) {
    let iq = Math.round(q);
    let ir = Math.round(r);
    let is = Math.round(s);
    const dq = Math.abs(iq - q);
    const dr = Math.abs(ir - r);
    const ds = Math.abs(is - s);

    if ( (dq > dr) && (dq > ds) ) {
      iq = -ir - is;
    } else if ( dr > ds ) {
      ir = -iq - is;
    } else {
      is = -iq - ir;
    }

    q = iq | 0;
    r = ir | 0;
    s = is | 0;
    return k !== undefined ? {q, r, s, k: Math.floor(k + 1e-8) | 0} : {q, r, s};
  }

  /* -------------------------------------------- */

  /**
   * Convert point coordinates (x, y) / (x, y, elevation) into cube coordinates (q, r, s) / (q, r, s, k).
   * Inverse of {@link HexagonalGrid#cubeToPoint}.
   * @see {@link https://www.redblobgames.com/grids/hexagons/}
   * @overload
   * @param {Point} point              The point
   * @returns {HexagonalGridCube2D}    The (fractional) cube coordinates
   */
  /**
   * @overload
   * @param {ElevatedPoint} point      The point
   * @returns {HexagonalGridCube3D}    The (fractional) cube coordinates
   */
  pointToCube({x, y, elevation}) {
    let q;
    let r;

    const size = this.size;
    x /= size;
    y /= size;

    if ( this.columns ) {
      q = ((2 * Math.SQRT1_3) * x) - (2 / 3);
      r = (-0.5 * (q + (this.even ? 1 : 0))) + y;
    } else {
      r = ((2 * Math.SQRT1_3) * y) - (2 / 3);
      q = (-0.5 * (r + (this.even ? 1 : 0))) + x;
    }

    const s = 0 - q - r;
    return elevation !== undefined ? {q, r, s, k: elevation / this.distance} : {q, r, s};
  }

  /* -------------------------------------------- */

  /**
   * Convert cube coordinates (q, r, s) / (q, r, s, k) into point coordinates (x, y) / (x, y, elevation).
   * Inverse of {@link HexagonalGrid#pointToCube}.
   * @see {@link https://www.redblobgames.com/grids/hexagons/}
   * @overload
   * @param {HexagonalGridCube2D} cube    The cube coordinates
   * @returns {Point}                     The point coordinates
   */
  /**
   * @overload
   * @param {HexagonalGridCube3D} cube    The cube coordinates
   * @returns {ElevatedPoint}             The point coordinates
   */
  cubeToPoint({q, r, k}) {
    let x;
    let y;

    const size = this.size;
    if ( this.columns ) {
      x = (0.5 * Math.SQRT1_3) * (((3 * q) + 2) * size);
      y = ((0.5 * (q + (this.even ? 1 : 0))) + r) * size;
    } else {
      y = (0.5 * Math.SQRT1_3) * (((3 * r) + 2) * size);
      x = ((0.5 * (r + (this.even ? 1 : 0))) + q) * size;
    }

    return k !== undefined ? {x, y, elevation: k * this.distance} : {x, y};
  }

  /* -------------------------------------------- */

  /**
   * Convert offset coordinates (i, j) / (i, j, k) into integer cube coordinates (q, r, s) / (q, r, s, k).
   * Inverse of {@link HexagonalGrid#cubeToOffset}.
   * @see {@link https://www.redblobgames.com/grids/hexagons/}
   * @overload
   * @param {GridOffset2D} offset      The offset coordinates
   * @returns {HexagonalGridCube2D}    The integer cube coordinates
   */
  /**
   * @overload
   * @param {GridOffset3D} offset      The offset coordinates
   * @returns {HexagonalGridCube3D}    The integer cube coordinates
   */
  offsetToCube({i, j, k}) {
    let q;
    let r;
    if ( this.columns ) {
      q = j;
      r = i - ((j + ((this.even ? 1 : -1) * (j & 1))) >> 1);
    } else {
      q = j - ((i + ((this.even ? 1 : -1) * (i & 1))) >> 1);
      r = i;
    }
    const s = 0 - q - r;
    return k !== undefined ? {q, r, s, k} : {q, r, s};
  }

  /* -------------------------------------------- */

  /**
   * Convert integer cube coordinates (q, r, s) / (q, r, s, k) into offset coordinates (i, j) / (i, j, k).
   * Inverse of {@link HexagonalGrid#offsetToCube}.
   * @see {@link https://www.redblobgames.com/grids/hexagons/}
   * @overload
   * @param {HexagonalGridCube2D} cube    The cube coordinates
   * @returns {GridOffset2D}              The offset coordinates
   */
  /**
   * @overload
   * @param {HexagonalGridCube3D} cube    The cube coordinates
   * @returns {GridOffset3D}              The offset coordinates
   */
  cubeToOffset({q, r, k}) {
    let i;
    let j;
    if ( this.columns ) {
      j = q;
      i = r + ((q + ((this.even ? 1 : -1) * (q & 1))) >> 1);
    } else {
      i = r;
      j = q + ((r + ((this.even ? 1 : -1) * (r & 1))) >> 1);
    }
    return k !== undefined ? {i, j, k} : {i, j};
  }

  /* -------------------------------------------- */

  /**
   * Measure the distance in hexagons between two cube coordinates.
   * @see {@link https://www.redblobgames.com/grids/hexagons/}
   * @param {HexagonalGridCube2D} a    The first cube coordinates
   * @param {HexagonalGridCube2D} b    The second cube coordinates
   * @returns {number}                 The distance between the two cube coordinates in hexagons
   */
  static cubeDistance(a, b) {
    const dq = a.q - b.q;
    const dr = a.r - b.r;
    return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
  }

  /* -------------------------------------------- */

  /**
   * Used by {@link HexagonalGrid#snapToCenter}.
   * @type {Point}
   */
  static #TEMP_POINT = {x: 0, y: 0};

  /* -------------------------------------------- */

  /**
   * Used by {@link HexagonalGrid#snapToCenter}.
   * Always an odd grid!
   * @type {HexagonalGrid}
   */
  static #TEMP_GRID = new HexagonalGrid({size: 1});

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  static get POINTY_HEX_BORDERS() {
    const msg = "HexagonalGrid.POINTY_HEX_BORDERS is deprecated without replacement.";
    logCompatibilityWarning(msg, {since: 12, until: 14, once: true});
    return this.#POINTY_HEX_BORDERS;
  }

  /**
   * @deprecated since v12
   * @ignore
   */
  static #POINTY_HEX_BORDERS = {
    0.5: [[0, 0.25], [0.5, 0], [1, 0.25], [1, 0.75], [0.5, 1], [0, 0.75]],
    1: [[0, 0.25], [0.5, 0], [1, 0.25], [1, 0.75], [0.5, 1], [0, 0.75]],
    2: [
      [.5, 0], [.75, 1/7], [.75, 3/7], [1, 4/7], [1, 6/7], [.75, 1], [.5, 6/7], [.25, 1], [0, 6/7], [0, 4/7],
      [.25, 3/7], [.25, 1/7]
    ],
    3: [
      [.5, .1], [2/3, 0], [5/6, .1], [5/6, .3], [1, .4], [1, .6], [5/6, .7], [5/6, .9], [2/3, 1], [.5, .9], [1/3, 1],
      [1/6, .9], [1/6, .7], [0, .6], [0, .4], [1/6, .3], [1/6, .1], [1/3, 0]
    ],
    4: [
      [.5, 0], [5/8, 1/13], [.75, 0], [7/8, 1/13], [7/8, 3/13], [1, 4/13], [1, 6/13], [7/8, 7/13], [7/8, 9/13],
      [.75, 10/13], [.75, 12/13], [5/8, 1], [.5, 12/13], [3/8, 1], [.25, 12/13], [.25, 10/13], [1/8, 9/13],
      [1/8, 7/13], [0, 6/13], [0, 4/13], [1/8, 3/13], [1/8, 1/13], [.25, 0], [3/8, 1/13]
    ]
  };

  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  static get FLAT_HEX_BORDERS() {
    const msg = "HexagonalGrid.FLAT_HEX_BORDERS is deprecated without replacement.";
    logCompatibilityWarning(msg, {since: 12, until: 14, once: true});
    return this.#FLAT_HEX_BORDERS;
  }

  /**
   * @deprecated since v12
   * @ignore
   */
  static #FLAT_HEX_BORDERS = {
    0.5: [[0, 0.5], [0.25, 0], [0.75, 0], [1, 0.5], [0.75, 1], [0.25, 1]],
    1: [[0, 0.5], [0.25, 0], [0.75, 0], [1, 0.5], [0.75, 1], [0.25, 1]],
    2: [
      [3/7, .25], [4/7, 0], [6/7, 0], [1, .25], [6/7, .5], [1, .75], [6/7, 1], [4/7, 1], [3/7, .75], [1/7, .75],
      [0, .5], [1/7, .25]
    ],
    3: [
      [.4, 0], [.6, 0], [.7, 1/6], [.9, 1/6], [1, 1/3], [.9, .5], [1, 2/3], [.9, 5/6], [.7, 5/6], [.6, 1], [.4, 1],
      [.3, 5/6], [.1, 5/6], [0, 2/3], [.1, .5], [0, 1/3], [.1, 1/6], [.3, 1/6]
    ],
    4: [
      [6/13, 0], [7/13, 1/8], [9/13, 1/8], [10/13, .25], [12/13, .25], [1, 3/8], [12/13, .5], [1, 5/8], [12/13, .75],
      [10/13, .75], [9/13, 7/8], [7/13, 7/8], [6/13, 1], [4/13, 1], [3/13, 7/8], [1/13, 7/8], [0, .75], [1/13, 5/8],
      [0, .5], [1/13, 3/8], [0, .25], [1/13, 1/8], [3/13, 1/8], [4/13, 0]
    ]
  };

  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  static get pointyHexPoints() {
    const msg = "HexagonalGrid.pointyHexPoints is deprecated without replacement.";
    logCompatibilityWarning(msg, {since: 12, until: 14, once: true});
    return this.#POINTY_HEX_BORDERS[1];
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  static get flatHexPoints() {
    const msg = "HexagonalGrid.flatHexPoints is deprecated without replacement.";
    logCompatibilityWarning(msg, {since: 12, until: 14, once: true});
    return this.#FLAT_HEX_BORDERS[1];
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  get hexPoints() {
    const msg = "HexagonalGrid#hexPoints is deprecated without replacement.";
    logCompatibilityWarning(msg, {since: 12, until: 14, once: true});
    return this.columns ? this.constructor.flatHexPoints : this.constructor.pointyHexPoints;
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  getPolygon(x, y, w, h, points) {
    const msg = "HexagonalGrid#getPolygon is deprecated. You can get the shape of the hex with HexagonalGrid#getShape "
      + "and the polygon of any hex with HexagonalGrid#getVertices.";
    logCompatibilityWarning(msg, {since: 12, until: 14, once: true});
    w = w ?? this.sizeX;
    h = h ?? this.sizeY;
    points ??= this.hexPoints;
    const poly = [];
    for ( let i=0; i < points.length; i++ ) {
      poly.push(x + (w * points[i][0]), y + (h * points[i][1]));
    }
    return poly;
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  getBorderPolygon(w, h, p) {
    const msg = "HexagonalGrid#getBorderPolygon is deprecated. "
      + "If you need the shape of a Token, use Token#shape/getShape instead.";
    logCompatibilityWarning(msg, {since: 12, until: 14, once: true});
    const points = this.columns ? this.constructor.FLAT_HEX_BORDERS[w] : this.constructor.POINTY_HEX_BORDERS[w];
    if ( (w !== h) || !points ) return null;
    const p2 = p / 2;
    const p4 = p / 4;
    const r = this.getRect(w, h);
    return this.getPolygon(-p4, -p4, r.width + p2, r.height + p2, points);
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  getRect(w, h) {
    const msg = "HexagonalGrid#getRect is deprecated. If you need the size of a Token, use Token#getSize instead.";
    logCompatibilityWarning(msg, {since: 12, until: 14, once: true});
    if ( !this.columns || (w < 1) ) w *= this.sizeX;
    else w = (this.sizeX * .75 * (w - 1)) + this.sizeX;
    if ( this.columns || (h < 1) ) h *= this.sizeY;
    else h = (this.sizeY * .75 * (h - 1)) + this.sizeY;
    return new PIXI.Rectangle(0, 0, w, h);
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  _adjustSnapForTokenSize(x, y, token) {
    const msg = "HexagonalGrid#_adjustSnapForTokenSize is deprecated.";
    logCompatibilityWarning(msg, {since: 12, until: 14, once: true});
    if ( (token.document.width <= 1) && (token.document.height <= 1) ) {
      const [row, col] = this.getGridPositionFromPixels(x, y);
      const [x0, y0] = this.getPixelsFromGridPosition(row, col);
      return [x0 + (this.sizeX / 2) - (token.w / 2), y0 + (this.sizeY / 2) - (token.h / 2)];
    }

    if ( this.columns && (token.document.height > 1) ) y -= this.sizeY / 2;
    if ( !this.columns && (token.document.width > 1) ) x -= this.sizeX / 2;
    return [x, y];
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  static computeDimensions({columns, size, legacy}) {
    const msg = "HexagonalGrid.computeDimensions is deprecated without replacement.";
    logCompatibilityWarning(msg, {since: 12, until: 14, once: true});

    // Legacy dimensions (deprecated)
    if ( legacy ) {
      if ( columns ) return { width: size, height: (Math.SQRT3 / 2) * size };
      return { width: (Math.SQRT3 / 2) * size, height: size };
    }

    // Columnar orientation
    if ( columns ) return { width: (2 * size) / Math.SQRT3, height: size };

    // Row orientation
    return { width: size, height: (2 * size) / Math.SQRT3 };
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  get columnar() {
    const msg = "HexagonalGrid#columnar is deprecated in favor of HexagonalGrid#columns.";
    logCompatibilityWarning(msg, {since: 12, until: 14, once: true});
    return this.columns;
  }

  /**
   * @deprecated since v12
   * @ignore
   */
  set columnar(value) {
    const msg = "HexagonalGrid#columnar is deprecated in favor of HexagonalGrid#columns.";
    logCompatibilityWarning(msg, {since: 12, until: 14, once: true});
    this.columns = value;
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  getCenter(x, y) {
    const msg = "HexagonalGrid#getCenter is deprecated. Use HexagonalGrid#getCenterPoint instead.";
    logCompatibilityWarning(msg, {since: 12, until: 14, once: true});
    const [x0, y0] = this.getTopLeft(x, y);
    return [x0 + (this.sizeX / 2), y0 + (this.sizeY / 2)];
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  getSnappedPosition(x, y, interval=1, {token}={}) {
    const msg = "HexagonalGrid#getSnappedPosition is deprecated. Use HexagonalGrid#getSnappedPoint instead.";
    logCompatibilityWarning(msg, {since: 12, until: 14, once: true});
    if ( interval === 0 ) return {x: Math.round(x), y: Math.round(y)};

    // At precision 5, return the center or nearest vertex
    if ( interval === 5) {
      const w4 = this.w / 4;
      const h4 = this.h / 4;

      // Distance relative to center
      const [xc, yc] = this.getCenter(x, y);
      const dx = x - xc;
      const dy = y - yc;
      let ox = dx.between(-w4, w4) ? 0 : Math.sign(dx);
      let oy = dy.between(-h4, h4) ? 0 : Math.sign(dy);

      // Closest to the center
      if ( (ox === 0) && (oy === 0) ) return {x: xc, y: yc};

      // Closest vertex based on offset
      if ( this.columns && (ox === 0) ) ox = Math.sign(dx) ?? -1;
      if ( !this.columns && (oy === 0) ) oy = Math.sign(dy) ?? -1;
      const {x: x0, y: y0 } = this.#getClosestVertex(xc, yc, ox, oy);
      return {x: Math.round(x0), y: Math.round(y0)};
    }

    // Start with the closest top-left grid position
    if ( token ) {
      if ( this.columns && (token.document.height > 1) ) y += this.sizeY / 2;
      if ( !this.columns && (token.document.width > 1) ) x += this.sizeX / 2;
    }
    const options = {
      columns: this.columns,
      even: this.even,
      size: this.size,
      width: this.sizeX,
      height: this.sizeY
    };
    const offset = HexagonalGrid.pixelsToOffset({x, y}, options, "round");
    const point = HexagonalGrid.offsetToPixels(offset, options);

    // Adjust pixel coordinate for token size
    let x0 = point.x;
    let y0 = point.y;
    if ( token ) [x0, y0] = this._adjustSnapForTokenSize(x0, y0, token);

    // Snap directly at interval 1
    if ( interval === 1 ) return {x: x0, y: y0};

    // Round the remainder
    const dx = (x - x0).toNearest(this.w / interval);
    const dy = (y - y0).toNearest(this.h / interval);
    return {x: Math.round(x0 + dx), y: Math.round(y0 + dy)};
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  #getClosestVertex(xc, yc, ox, oy) {
    const b = ox + (oy << 2); // Bit shift to make a unique reference
    const vertices = this.columns
      ? {"-1": 0, "-5": 1, "-3": 2, 1: 3, 5: 4, 3: 5}   // Flat hex vertices
      : {"-5": 0, "-4": 1, "-3": 2, 5: 3, 4: 4, 3: 5};  // Pointy hex vertices
    const idx = vertices[b];
    const pt = this.hexPoints[idx];
    return {
      x: (xc - (this.sizeX / 2)) + (pt[0] * this.sizeX),
      y: (yc - (this.sizeY / 2)) + (pt[1] * this.sizeY)
    };
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  #measureDistance(p0, p1) {
    const [i0, j0] = this.getGridPositionFromPixels(p0.x, p0.y);
    const [i1, j1] = this.getGridPositionFromPixels(p1.x, p1.y);
    const c0 = this.getCube({i: i0, j: j0});
    const c1 = this.getCube({i: i1, j: j1});
    return HexagonalGrid.cubeDistance(c0, c1);
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  getGridPositionFromPixels(x, y) {
    const msg = "HexagonalGrid#getGridPositionFromPixels is deprecated. This function is based on the \"brick wall\" grid. "
    + " For getting the offset coordinates of the hex containing the given point use HexagonalGrid#getOffset.";
    logCompatibilityWarning(msg, {since: 12, until: 14, once: true});
    const {row, col} = HexagonalGrid.pixelsToOffset({x, y}, {
      columns: this.columns,
      even: this.even,
      size: this.size,
      width: this.sizeX,
      height: this.sizeY
    });
    return [row, col];
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  getPixelsFromGridPosition(row, col) {
    const msg = "HexagonalGrid#getPixelsFromGridPosition is deprecated. This function is based on the \"brick wall\" grid. "
    + " For getting the top-left coordinates of the hex at the given offset coordinates use HexagonalGrid#getTopLeftPoint.";
    logCompatibilityWarning(msg, {since: 12, until: 14, once: true});
    const {x, y} = HexagonalGrid.offsetToPixels({row, col}, {
      columns: this.columns,
      even: this.even,
      size: this.size,
      width: this.sizeX,
      height: this.sizeY
    });
    return [Math.ceil(x), Math.ceil(y)];
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  shiftPosition(x, y, dx, dy, {token}={}) {
    const msg = "BaseGrid#shiftPosition is deprecated. Use BaseGrid#getShiftedPoint instead.";
    logCompatibilityWarning(msg, {since: 12, until: 14, once: true});
    const [row, col] = this.getGridPositionFromPixels(x, y);

    // Adjust diagonal moves for offset
    const isDiagonal = (dx !== 0) && (dy !== 0);
    if ( isDiagonal ) {

      // Column orientation
      if ( this.columns ) {
        const isEven = ((col+1) % 2 === 0) === this.even;
        if ( isEven && (dy > 0)) dy--;
        else if ( !isEven && (dy < 0)) dy++;
      }

      // Row orientation
      else {
        const isEven = ((row + 1) % 2 === 0) === this.even;
        if ( isEven && (dx > 0) ) dx--;
        else if ( !isEven && (dx < 0 ) ) dx++;
      }
    }
    const [shiftX, shiftY] = this.getPixelsFromGridPosition(row+dy, col+dx);
    if ( token ) return this._adjustSnapForTokenSize(shiftX, shiftY, token);
    return [shiftX, shiftY];
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  measureDistance(origin, target, options) {
    const msg = "HexagonalGrid#measureDistance now returns the same result as GridLayer#measureDistance instead of the cube distance "
      + " (breaking). Use HexagonalGrid#measurePath instead to get the number of steps (cube distance) between the origin and target.";
    logCompatibilityWarning(msg, {since: 12, until: 14, once: true});
    return super.measureDistance(origin, target, options);
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  measureDistances(segments, options={}) {
    const msg = "HexagonalGrid#measureDistances is deprecated. "
      + "Use HexagonalGrid#measurePath instead, which returns grid distance (gridSpaces: true) and Euclidean distance (gridSpaces: false).";
    logCompatibilityWarning(msg, {since: 12, until: 14, once: true});
    if ( !options.gridSpaces ) return super.measureDistances(segments, options);
    return segments.map(s => {
      const r = s.ray;
      return this.#measureDistance(r.A, r.B) * this.distance;
    });
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  _adjustPositionForTokenSize(row, col, token) {
    const msg = "HexagonalGrid#_adjustPositionForTokenSize is deprecated.";
    logCompatibilityWarning(msg, {since: 12, until: 14, once: true});
    if ( this.columns && (token.document.height > 1) ) row++;
    if ( !this.columns && (token.document.width > 1) ) col++;
    return [row, col];
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  static getConfig(type, size) {
    const msg = "HexagonalGrid.getConfig is deprecated without replacement.";
    logCompatibilityWarning(msg, {since: 12, until: 14, once: true});
    const config = {
      columns: [GRID_TYPES.HEXODDQ, GRID_TYPES.HEXEVENQ].includes(type),
      even: [GRID_TYPES.HEXEVENR, GRID_TYPES.HEXEVENQ].includes(type),
      size: size
    };
    const {width, height} = HexagonalGrid.computeDimensions(config);
    config.width = width;
    config.height = height;
    return config;
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  static offsetToCube({row, col}={}, {columns=true, even=false}={}) {
    const msg = "HexagonalGrid.offsetToCube is deprecated. Use HexagonalGrid#offsetToCube instead.";
    logCompatibilityWarning(msg, {since: 12, until: 14, once: true});
    return new HexagonalGrid({size: 100, columns, even}).offsetToCube({i: row, j: col});
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  static cubeToOffset(cube={}, {columns=true, even=false}={}) {
    const msg = "HexagonalGrid.cubeToOffset is deprecated. Use HexagonalGrid#cubeToOffset instead.";
    logCompatibilityWarning(msg, {since: 12, until: 14, once: true});
    const {i: row, j: col} = new HexagonalGrid({size: 100, columns, even}).cubeToOffset(cube);
    return {row, col};
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  static pixelToCube(point, config) {
    const msg = "HexagonalGrid.pixelToCube is deprecated. Use HexagonalGrid#pointToCube instead.";
    logCompatibilityWarning(msg, {since: 12, until: 14, once: true});
    const {x, y} = point ?? {};
    const {size} = config;
    const cx = x / (size / 2);
    const cy = y / (size / 2);

    // Fractional hex coordinates, might not satisfy (fx + fy + fz = 0) due to rounding
    const fr = (2/3) * cx;
    const fq = ((-1/3) * cx) + ((1 / Math.sqrt(3)) * cy);
    const fs = ((-1/3) * cx) - ((1 / Math.sqrt(3)) * cy);

    // Convert to integer triangle coordinates
    const a = Math.ceil(fr - fq);
    const b = Math.ceil(fq - fs);
    const c = Math.ceil(fs - fr);

    // Convert back to cube coordinates
    return {
      q: Math.round((a - c) / 3),
      r: Math.round((c - b) / 3),
      s: Math.round((b - a) / 3)
    };
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  static offsetToPixels({row, col}, {columns, even, width, height}) {
    const msg = "HexagonalGrid.offsetToPixels is deprecated. Use HexagonalGrid#getTopLeftPoint instead.";
    logCompatibilityWarning(msg, {since: 12, until: 14, once: true});
    let x;
    let y;

    // Flat-topped hexes
    if ( columns ) {
      x = Math.ceil(col * (width * 0.75));
      const isEven = (col + 1) % 2 === 0;
      y = Math.ceil((row - (even === isEven ? 0.5 : 0)) * height);
    }

    // Pointy-topped hexes
    else {
      y = Math.ceil(row * (height * 0.75));
      const isEven = (row + 1) % 2 === 0;
      x = Math.ceil((col - (even === isEven ? 0.5 : 0)) * width);
    }

    // Return the pixel coordinate
    return {x, y};
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  static pixelsToOffset({x, y}, config, method="floor") {
    const msg = "HexagonalGrid.pixelsToOffset is deprecated without replacement. This function is based on the \"brick wall\" grid. "
      + " For getting the offset coordinates of the hex containing the given point use HexagonalGrid#getOffset.";
    logCompatibilityWarning(msg, {since: 12, until: 14, once: true});
    const {columns, even, width, height} = config;
    const fn = Math[method];
    let row;
    let col;

    // Columnar orientation
    if ( columns ) {
      col = fn(x / (width * 0.75));
      const isEven = (col + 1) % 2 === 0;
      row = fn((y / height) + (even === isEven ? 0.5 : 0));
    }

    // Row orientation
    else {
      row = fn(y / (height * 0.75));
      const isEven = (row + 1) % 2 === 0;
      col = fn((x / width) + (even === isEven ? 0.5 : 0));
    }
    return {row, col};
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  getAStarPath(start, goal, options) {
    const msg = "HexagonalGrid#getAStarPath is deprecated without replacement.";
    logCompatibilityWarning(msg, {since: 12, until: 14, once: true});
    const costs = new Map();

    // Create a prioritized frontier sorted by increasing cost
    const frontier = [];
    const explore = (hex, from, cost) => {
      const idx = frontier.findIndex(l => l.cost > cost);
      if ( idx === -1 ) frontier.push({hex, cost, from});
      else frontier.splice(idx, 0, {hex, cost, from});
      costs.set(hex, cost);
    };
    explore(start, null, 0);

    // Expand the frontier, exploring towards the goal
    let current;
    let solution;
    while ( frontier.length ) {
      current = frontier.shift();
      if ( current.cost === Infinity ) break;
      if ( current.hex.equals(goal) ) {
        solution = current;
        break;
      }
      for ( const next of current.hex.getNeighbors() ) {
        const deltaCost = next.getTravelCost instanceof Function ? next.getTravelCost(current.hex, options) : 1;
        const newCost = current.cost + deltaCost;     // Total cost of reaching this hex
        if ( costs.get(next) <= newCost ) continue;   // We already made it here in the lowest-cost way
        explore(next, current, newCost);
      }
    }

    // Ensure a path was achieved
    if ( !solution ) {
      throw new Error("No valid path between these positions exists");
    }

    // Return the optimal path and cost
    const path = [];
    let c = solution;
    while ( c.from ) {
      path.unshift(c.hex);
      c = c.from;
    }
    return {from: start, to: goal, cost: solution.cost, path};
  }
}

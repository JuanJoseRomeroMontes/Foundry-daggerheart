import BaseGrid from "./base.mjs";
import {GRID_DIAGONALS, GRID_TYPES, MOVEMENT_DIRECTIONS} from "../constants.mjs";
import {logCompatibilityWarning} from "../utils/logging.mjs";

/**
 * @import {SquareGridConfiguration, GridOffset2D, GridOffset3D, GridCoordinates2D,
 *   GridCoordinates3D} from "./_types.mjs"
 * @import {Point} from "../_types.mjs"
 * @import {GridDiagonalRule} from "../constants.mjs"
 */

/**
 * The square grid class.
 */
export default class SquareGrid extends BaseGrid {
  /**
   * The square grid constructor.
   * @param {SquareGridConfiguration} config   The grid configuration
   */
  constructor(config) {
    super(config);

    /**
     * The rule for diagonal measurement (see {@link CONST.GRID_DIAGONALS}).
     * @type {GridDiagonalRule}
     * @readonly
     */
    this.diagonals = config.diagonals ?? GRID_DIAGONALS.EQUIDISTANT;
  }

  /* -------------------------------------------- */

  /**
   * @override
   * @readonly
   */
  type = GRID_TYPES.SQUARE;

  /* -------------------------------------------- */

  /** @override */
  getOffset(coords) {
    let i = coords.i;
    let j;
    let k;
    if ( i !== undefined ) {
      j = coords.j;
      k = coords.k;
    } else {
      j = Math.floor(coords.x / this.size);
      i = Math.floor(coords.y / this.size);
      if ( coords.elevation !== undefined ) k = Math.floor((coords.elevation / this.distance) + 1e-8);
    }
    return k !== undefined ? {i, j, k} : {i, j};
  }

  /* -------------------------------------------- */

  /** @override */
  getOffsetRange({x, y, width, height}) {
    const i0 = Math.floor(y / this.size);
    const j0 = Math.floor(x / this.size);
    if ( !((width > 0) && (height > 0)) ) return [i0, j0, i0, j0];
    return [i0, j0, Math.ceil((y + height) / this.size) | 0, Math.ceil((x + width) / this.size) | 0];
  }

  /* -------------------------------------------- */

  /** @override */
  getAdjacentOffsets(coords) {
    const {i, j, k} = this.getOffset(coords);

    // 2D
    if ( k === undefined ) {

      // Non-diagonals
      if ( this.diagonals === GRID_DIAGONALS.ILLEGAL ) return [
        {i: i - 1, j},
        {i, j: j - 1},
        {i, j: j + 1},
        {i: i + 1, j}
      ];

      // Diagonals
      return [
        {i: i - 1, j: j - 1},
        {i: i - 1, j},
        {i: i - 1, j: j + 1},
        {i, j: j - 1},
        {i, j: j + 1},
        {i: i + 1, j: j - 1},
        {i: i + 1, j},
        {i: i + 1, j: j + 1}
      ];
    }

    // 3D
    else {

      // Non-diagonals
      if ( this.diagonals === GRID_DIAGONALS.ILLEGAL ) return [
        {i: i - 1, j, k},
        {i, j: j - 1, k},
        {i, j, k: k - 1},
        {i, j, k: k + 1},
        {i, j: j + 1, k},
        {i: i + 1, j, k}
      ];

      // Diagonals
      const offsets = [];
      for ( let di = -1; di <= 1; di++ ) {
        for ( let dj = -1; dj <= 1; dj++ ) {
          for ( let dk = -1; dk <= 1; dk++ ) {
            if ( (di === 0) && (dj === 0) && (dk === 0) ) continue;
            offsets.push({i: i + di, j: j + dj, k: k + dk});
          }
        }
      }
      return offsets;
    }
  }

  /* -------------------------------------------- */

  /** @override */
  testAdjacency(coords1, coords2) {
    const {i: i1, j: j1, k: k1} = this.getOffset(coords1);
    const {i: i2, j: j2, k: k2} = this.getOffset(coords2);
    const di = Math.abs(i1 - i2);
    const dj = Math.abs(j1 - j2);
    const dk = k1 !== undefined ? Math.abs(k1 - k2) : 0;
    const diagonals = this.diagonals !== GRID_DIAGONALS.ILLEGAL;
    return diagonals ? Math.max(di, dj, dk) === 1 : (di + dj + dk) === 1;
  }

  /* -------------------------------------------- */

  /** @override */
  getShiftedOffset(coords, direction) {
    let di = 0;
    let dj = 0;
    let dk = 0;
    if ( direction & MOVEMENT_DIRECTIONS.UP ) di--;
    if ( direction & MOVEMENT_DIRECTIONS.DOWN ) di++;
    if ( direction & MOVEMENT_DIRECTIONS.LEFT ) dj--;
    if ( direction & MOVEMENT_DIRECTIONS.RIGHT ) dj++;
    if ( direction & MOVEMENT_DIRECTIONS.DESCEND ) dk--;
    if ( direction & MOVEMENT_DIRECTIONS.ASCEND ) dk++;
    if ( ((Math.abs(di) + Math.abs(dj) + Math.abs(dk)) > 1) && (this.diagonals === GRID_DIAGONALS.ILLEGAL) ) {
      // Diagonal movement is not allowed
      di = 0;
      dj = 0;
      dk = 0;
    }
    const offset = this.getOffset(coords);
    offset.i += di;
    offset.j += dj;
    if ( offset.k !== undefined ) offset.k += dk;
    return offset;
  }

  /* -------------------------------------------- */

  /** @override */
  getShiftedPoint(point, direction) {
    const topLeft = this.getTopLeftPoint(point);
    const shifted = this.getTopLeftPoint(this.getShiftedOffset(topLeft, direction));
    shifted.x = point.x + (shifted.x - topLeft.x);
    shifted.y = point.y + (shifted.y - topLeft.y);
    if ( shifted.elevation !== undefined ) {
      shifted.elevation = point.elevation + (shifted.elevation - topLeft.elevation);
    }
    return shifted;
  }

  /* -------------------------------------------- */

  /** @override */
  getTopLeftPoint(coords) {
    let i = coords.i;
    let j;
    let k;
    if ( i !== undefined ) {
      j = coords.j;
      k = coords.k;
    } else {
      const {x, y, elevation} = coords;
      j = Math.floor(x / this.size);
      i = Math.floor(y / this.size);
      if ( elevation !== undefined ) k = Math.floor((elevation / this.distance) + 1e-8);
    }
    const x = j * this.size;
    const y = i * this.size;
    if ( k === undefined ) return {x, y};
    const elevation = k * this.distance;
    return {x, y, elevation};
  }

  /* -------------------------------------------- */

  /** @override */
  getCenterPoint(coords) {
    let i = coords.i;
    let j;
    let k;
    if ( i !== undefined ) {
      j = coords.j;
      k = coords.k;
    } else {
      const {x, y, elevation} = coords;
      j = Math.floor(x / this.size);
      i = Math.floor(y / this.size);
      if ( elevation !== undefined ) k = Math.floor((elevation / this.distance) + 1e-8);
    }
    const x = (j + 0.5) * this.size;
    const y = (i + 0.5) * this.size;
    if ( k === undefined ) return {x, y};
    const elevation = (k + 0.5) * this.distance;
    return {x, y, elevation};
  }

  /* -------------------------------------------- */

  /** @override */
  getShape() {
    const s = this.size / 2;
    return [{x: -s, y: -s}, {x: s, y: -s}, {x: s, y: s}, {x: -s, y: s}];
  }

  /* -------------------------------------------- */

  /** @override */
  getVertices(coords) {
    const {i, j} = this.getOffset(coords);
    const x0 = j * this.size;
    const x1 = (j + 1) * this.size;
    const y0 = i * this.size;
    const y1 = (i + 1) * this.size;
    return [{x: x0, y: y0}, {x: x1, y: y0}, {x: x1, y: y1}, {x: x0, y: y1}];
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

    // Any edge = Any side
    if ( !(mode & 0x2) ) {
      // Horizontal (Top/Bottom) side + Vertical (Left/Right) side = Any edge
      if ( (mode & 0x3000) && (mode & 0xC000) ) mode |= 0x2;
      // Horizontal (Top/Bottom) side
      else if ( mode & 0x3000 ) keepNearest(this.#snapToTopOrBottom(point, resolution));
      // Vertical (Left/Right) side
      else if ( mode & 0xC000 ) keepNearest(this.#snapToLeftOrRight(point, resolution));
    }

    // With vertices (= corners)
    if ( mode & 0xFF0 ) {
      switch ( mode & ~0xFFF0 ) {
        case 0x0: keepNearest(this.#snapToVertex(point, resolution)); break;
        case 0x1: keepNearest(this.#snapToVertexOrCenter(point, resolution)); break;
        case 0x2: keepNearest(this.#snapToEdgeOrVertex(point, resolution)); break;
        case 0x3: keepNearest(this.#snapToEdgeOrVertexOrCenter(point, resolution)); break;
      }
    }
    // Without vertices
    else {
      switch ( mode & ~0xFFF0 ) {
        case 0x1: keepNearest(this.#snapToCenter(point, resolution)); break;
        case 0x2: keepNearest(this.#snapToEdge(point, resolution)); break;
        case 0x3: keepNearest(this.#snapToEdgeOrCenter(point, resolution)); break;
      }
    }

    return point.elevation === undefined ? nearest
      : {x: nearest.x, y: nearest.y, elevation: Math.round((point.elevation / this.distance) + 1e-8) * this.distance};
  }

  /* -------------------------------------------- */

  /**
   * Snap the point to the nearest center of a square.
   * @param {Point} point          The point
   * @param {number} resolution    The grid resolution
   * @returns {Point}              The snapped point
   */
  #snapToCenter({x, y}, resolution) {
    const s = this.size / resolution;
    const t = this.size / 2;
    return {
      x: (Math.round((x - t) / s) * s) + t,
      y: (Math.round((y - t) / s) * s) + t
    };
  }

  /* -------------------------------------------- */

  /**
   * Snap the point to the nearest vertex of a square.
   * @param {Point} point          The point
   * @param {number} resolution    The grid resolution
   * @returns {Point}              The snapped point
   */
  #snapToVertex({x, y}, resolution) {
    const s = this.size / resolution;
    const t = this.size / 2;
    return {
      x: ((Math.floor((x - t) / s) + 0.5) * s) + t,
      y: ((Math.floor((y - t) / s) + 0.5) * s) + t
    };
  }

  /* -------------------------------------------- */

  /**
   * Snap the point to the nearest vertex or center of a square.
   * @param {Point} point          The point
   * @param {number} resolution    The grid resolution
   * @returns {Point}              The snapped point
   */
  #snapToVertexOrCenter({x, y}, resolution) {
    const s = this.size / resolution;
    const t = this.size / 2;
    const c0 = (x - t) / s;
    const r0 = (y - t) / s;
    const c1 = Math.round(c0 + r0);
    const r1 = Math.round(r0 - c0);
    return {
      x: ((c1 - r1) * s / 2) + t,
      y: ((c1 + r1) * s / 2) + t
    };
  }

  /* -------------------------------------------- */

  /**
   * Snap the point to the nearest edge of a square.
   * @param {Point} point          The point
   * @param {number} resolution    The grid resolution
   * @returns {Point}              The snapped point
   */
  #snapToEdge({x, y}, resolution) {
    const s = this.size / resolution;
    const t = this.size / 2;
    const c0 = (x - t) / s;
    const r0 = (y - t) / s;
    const c1 = Math.floor(c0 + r0);
    const r1 = Math.floor(r0 - c0);
    return {
      x: ((c1 - r1) * s / 2) + t,
      y: ((c1 + r1 + 1) * s / 2) + t
    };
  }

  /* -------------------------------------------- */

  /**
   * Snap the point to the nearest edge or center of a square.
   * @param {Point} point          The point
   * @param {number} resolution    The grid resolution
   * @returns {Point}              The snapped point
   */
  #snapToEdgeOrCenter({x, y}, resolution) {
    const s = this.size / resolution;
    const t = this.size / 2;
    const c0 = (x - t) / s;
    const r0 = (y - t) / s;
    const x0 = (Math.round(c0) * s) + t;
    const y0 = (Math.round(r0) * s) + t;
    if ( Math.max(Math.abs(x - x0), Math.abs(y - y0)) <= s / 4 ) {
      return {x: x0, y: y0};
    }
    const c1 = Math.floor(c0 + r0);
    const r1 = Math.floor(r0 - c0);
    return {
      x: ((c1 - r1) * s / 2) + t,
      y: ((c1 + r1 + 1) * s / 2) + t
    };
  }

  /* -------------------------------------------- */

  /**
   * Snap the point to the nearest edge or vertex of a square.
   * @param {Point} point          The point
   * @param {number} resolution    The grid resolution
   * @returns {Point}              The snapped point
   */
  #snapToEdgeOrVertex({x, y}, resolution) {
    const s = this.size / resolution;
    const t = this.size / 2;
    const c0 = (x - t) / s;
    const r0 = (y - t) / s;
    const x0 = ((Math.floor(c0) + 0.5) * s) + t;
    const y0 = ((Math.floor(r0) + 0.5) * s) + t;
    if ( Math.max(Math.abs(x - x0), Math.abs(y - y0)) <= s / 4 ) {
      return {x: x0, y: y0};
    }
    const c1 = Math.floor(c0 + r0);
    const r1 = Math.floor(r0 - c0);
    return {
      x: ((c1 - r1) * s / 2) + t,
      y: ((c1 + r1 + 1) * s / 2) + t
    };
  }

  /* -------------------------------------------- */

  /**
   * Snap the point to the nearest edge, vertex, or center of a square.
   * @param {Point} point          The point
   * @param {number} resolution    The grid resolution
   * @returns {Point}              The snapped point
   */
  #snapToEdgeOrVertexOrCenter({x, y}, resolution) {
    const s = this.size / (resolution * 2);
    return {
      x: Math.round(x / s) * s,
      y: Math.round(y / s) * s
    };
  }

  /* -------------------------------------------- */

  /**
   * Snap the point to the nearest top/bottom side of a square.
   * @param {Point} point          The point
   * @param {number} resolution    The grid resolution
   * @returns {Point}              The snapped point
   */
  #snapToTopOrBottom({x, y}, resolution) {
    const s = this.size / resolution;
    const t = this.size / 2;
    return {
      x: (Math.round((x - t) / s) * s) + t,
      y: ((Math.floor((y - t) / s) + 0.5) * s) + t
    };
  }

  /* -------------------------------------------- */

  /**
   * Snap the point to the nearest left/right side of a square.
   * @param {Point} point          The point
   * @param {number} resolution    The grid resolution
   * @returns {Point}              The snapped point
   */
  #snapToLeftOrRight({x, y}, resolution) {
    const s = this.size / resolution;
    const t = this.size / 2;
    return {
      x: ((Math.floor((x - t) / s) + 0.5) * s) + t,
      y: (Math.round((y - t) / s) * s) + t
    };
  }

  /* -------------------------------------------- */

  /** @override */
  _measurePath(waypoints, {cost}, result) {

    // Convert to point coordiantes
    const toPoint = coords => {
      if ( coords.x !== undefined ) return coords;
      return this.getCenterPoint(coords);
    };

    // Prepare data for the starting point
    const w0 = waypoints[0];
    let o0 = this.getOffset(w0);
    let p0 = toPoint(w0);

    // Iterate over additional path points
    const is3D = o0.k !== undefined;
    const diagonals = this.diagonals;
    let l0 = diagonals === GRID_DIAGONALS.ALTERNATING_2 ? 1.0 : 0.0;
    let dx0 = l0;
    let dy0 = l0;
    let dz0 = l0;
    let nd = l0 * 1.5;
    for ( let i = 1; i < waypoints.length; i++ ) {
      const w1 = waypoints[i];
      const o1 = this.getOffset(w1);
      const p1 = toPoint(w1);
      const cost1 = w1.cost ?? cost;

      // Determine the number of moves total, number of diagonal moves, and cost of the moves
      if ( w1.measure !== false ) {
        let di = Math.abs(o0.i - o1.i);
        let dj = Math.abs(o0.j - o1.j);
        if ( di < dj ) [di, dj] = [dj, di];
        let dk = 0;
        if ( is3D ) {
          dk = Math.abs(o0.k - o1.k);
          if ( dj < dk ) [dj, dk] = [dk, dj];
          if ( di < dj ) [di, dj] = [dj, di];
        }
        let n = di; // The number of moves total
        let d = dj; // The number of diagonal moves
        let c; // The cost of the moves
        const nd0 = nd;
        switch ( diagonals ) {
          case GRID_DIAGONALS.EQUIDISTANT: c = di; break;
          case GRID_DIAGONALS.EXACT: c = di + (((Math.SQRT2 - 1) * (dj - dk)) + ((Math.SQRT3 - 1) * dk)); break;
          case GRID_DIAGONALS.APPROXIMATE: c = di + ((0.5 * (dj - dk)) + (0.75 * dk)); break;
          case GRID_DIAGONALS.RECTILINEAR: c = di + (dj + dk); break;
          case GRID_DIAGONALS.ALTERNATING_1:
          case GRID_DIAGONALS.ALTERNATING_2:
            nd += (dj + (0.5 * dk));
            c = di + (Math.floor(nd / 2) - Math.floor(nd0 / 2));
            break;
          case GRID_DIAGONALS.ILLEGAL:
            n = di + (dj + dk);
            d = 0;
            c = n;
            break;
        }

        // Determine the distance of the segment
        let dx = Math.abs(p0.x - p1.x) / this.size;
        let dy = Math.abs(p0.y - p1.y) / this.size;
        if ( dx < dy ) [dx, dy] = [dy, dx];
        let dz = 0;
        if ( is3D ) {
          dz = Math.abs(p0.elevation - p1.elevation) / this.distance;
          if ( dy < dz ) [dy, dz] = [dz, dy];
          if ( dx < dy ) [dx, dy] = [dy, dx];
        }
        let l; // The distance of the segment
        switch ( diagonals ) {
          case GRID_DIAGONALS.EQUIDISTANT: l = dx; break;
          case GRID_DIAGONALS.EXACT: l = dx + (((Math.SQRT2 - 1) * (dy - dz)) + ((Math.SQRT3 - 1) * dz)); break;
          case GRID_DIAGONALS.APPROXIMATE: l = dx + ((0.5 * (dy - dz)) + (0.75 * dz)); break;
          case GRID_DIAGONALS.RECTILINEAR: l = dx + (dy + dz); break;
          case GRID_DIAGONALS.ALTERNATING_1:
          case GRID_DIAGONALS.ALTERNATING_2: {
            dx0 += dx;
            dy0 += dy;
            dz0 += dz;
            const fx = Math.floor(dx0);
            const fy = Math.floor(dy0);
            const fz = Math.floor(dz0);
            const a = fx + (0.5 * fy) + (0.25 * fz);
            const a0 = Math.floor(a);
            const a1 = Math.floor(a + 1);
            const a2 = Math.floor(a + 1.5);
            const a3 = Math.floor(a + 1.75);
            const mx = dx0 - fx;
            const my = dy0 - fy;
            const mz = dz0 - fz;
            const l1 = (a0 * (1 - mx)) + (a1 * (mx - my)) + (a2 * (my - mz)) + (a3 * mz);
            l = l1 - l0;
            l0 = l1;
            break;
          }
          case GRID_DIAGONALS.ILLEGAL: l = dx + (dy + dz); break;
        }
        if ( l.almostEqual(c) ) l = c;

        const segment = result.waypoints[i].backward;
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
      let k;
      const m = (o0.i === o1.i) + (o0.j === o1.j) + (o0.k === o1.k);
      if ( m === 2 ) k = 1;
      else if ( m === 1 ) {
        switch ( this.diagonals ) {
          case GRID_DIAGONALS.EQUIDISTANT: k = 1; break;
          case GRID_DIAGONALS.EXACT: k = Math.SQRT2; break;
          case GRID_DIAGONALS.APPROXIMATE: k = 1.5; break;
          case GRID_DIAGONALS.RECTILINEAR: k = 2; break;
          case GRID_DIAGONALS.ALTERNATING_1:
          case GRID_DIAGONALS.ALTERNATING_2:
            k = 1 + (Math.floor((diagonals + 1) / 2) - Math.floor(diagonals / 2));
            break;
        }
        diagonals += 1;
      } else {
        switch ( this.diagonals ) {
          case GRID_DIAGONALS.EQUIDISTANT: k = 1; break;
          case GRID_DIAGONALS.EXACT: k = Math.SQRT3; break;
          case GRID_DIAGONALS.APPROXIMATE: k = 1.75; break;
          case GRID_DIAGONALS.RECTILINEAR: k = 3; break;
          case GRID_DIAGONALS.ALTERNATING_1:
          case GRID_DIAGONALS.ALTERNATING_2:
            k = 1 + (Math.floor((diagonals + 1.5) / 2) - Math.floor(diagonals / 2));
            break;
        }
        diagonals += 1.5;
      }

      // Calculate and accumulate the cost
      c += cost(o0, o1, k * this.distance, segment);

      o0 = o1;
    }

    return c;
  }

  /* -------------------------------------------- */

  /** @override */
  getDirectPath(waypoints) {
    if ( waypoints.length === 0 ) return [];
    const w0 = waypoints[0];
    if ( (w0.k !== undefined) || (w0.elevation !== undefined) ) return this.#getDirectPath3D(waypoints);
    else return this.#getDirectPath2D(waypoints);
  }

  /* -------------------------------------------- */

  /**
   * Returns the sequence of grid offsets of a shortest, direct path passing through the given waypoints.
   * @see {@link https://en.wikipedia.org/wiki/Bresenham's_line_algorithm}
   * @see {@link https://playtechs.blogspot.com/2007/03/raytracing-on-grid.html}
   * @param {GridCoordinates2D[]} waypoints    The waypoints the path must pass through
   * @returns {GridOffset2D[]}                 The sequence of grid offsets of a shortest, direct path
   */
  #getDirectPath2D(waypoints) {

    // Prepare data for the starting point
    const o0 = this.getOffset(waypoints[0]);
    let {i: i0, j: j0} = o0;
    const path = [o0];

    // Iterate over additional path points
    const diagonals = this.diagonals !== GRID_DIAGONALS.ILLEGAL;
    for ( let i = 1; i < waypoints.length; i++ ) {
      const o1 = this.getOffset(waypoints[i]);
      const {i: i1, j: j1} = o1;
      if ( (i0 === i1) && (j0 === j1) ) continue;

      // Walk from (i0, j0) to (i1, j1)
      const di = Math.abs(i0 - i1);
      const dj = 0 - Math.abs(j0 - j1);
      const si = i0 < i1 ? 1 : -1;
      const sj = j0 < j1 ? 1 : -1;
      let e = di + dj;
      if ( diagonals ) {
        for ( ;; ) {
          const e2 = e * 2;
          if ( e2 >= dj ) {
            e += dj;
            i0 += si;
          }
          if ( e2 <= di ) {
            e += di;
            j0 += sj;
          }
          if ( (i0 === i1) && (j0 === j1) ) break;
          path.push({i: i0, j: j0});
        }
      } else {
        const di2 = 2 * di;
        const dj2 = 2 * dj;
        for ( ;; ) {
          if ( e > 0 ) {
            e += dj2;
            i0 += si;
          } else {
            e += di2;
            j0 += sj;
          }
          if ( (i0 === i1) && (j0 === j1) ) break;
          path.push({i: i0, j: j0});
        }
      }
      path.push(o1);

      i0 = i1;
      j0 = j1;
    }

    return path;
  }

  /* -------------------------------------------- */

  /**
   * Returns the sequence of grid offsets of a shortest, direct path passing through the given waypoints.
   * @see {@link https://www.geeksforgeeks.org/bresenhams-algorithm-for-3-d-line-drawing}
   * @see {@link http://www.cse.yorku.ca/~amana/research/grid.pdf}
   * @param {GridCoordinates3D[]} waypoints    The waypoints the path must pass through
   * @returns {GridOffset3D[]}                 The sequence of grid offsets of a shortest, direct path
   */
  #getDirectPath3D(waypoints) {

    // Prepare data for the starting point
    const o0 = this.getOffset(waypoints[0]);
    let {i: i0, j: j0, k: k0} = o0;
    const path = [o0];

    // Iterate over additional path points
    const diagonals = this.diagonals !== GRID_DIAGONALS.ILLEGAL;
    for ( let i = 1; i < waypoints.length; i++ ) {
      const o1 = this.getOffset(waypoints[i]);
      const {i: i1, j: j1, k: k1} = o1;
      if ( (i0 === i1) && (j0 === j1) && (k0 === k1) ) continue;

      // Walk from (i0, j0, k0) to (i1, j1, k1)
      const di = Math.abs(i0 - i1);
      const dj = Math.abs(j0 - j1);
      const dk = Math.abs(k0 - k1);
      const si = i0 < i1 ? 1 : -1;
      const sj = j0 < j1 ? 1 : -1;
      const sk = k0 < k1 ? 1 : -1;
      if ( diagonals ) {
        const di2 = 2 * di;
        const dj2 = 2 * dj;
        const dk2 = 2 * dk;
        if ( (di >= dj) && (di >= dk) ) {
          let ej = 0 - di;
          let ek = ej;
          for ( ;; ) {
            ej += dj2;
            ek += dk2;
            i0 += si;
            if ( ej >= 0 ) {
              ej -= di2;
              j0 += sj;
            }
            if ( ek >= 0 ) {
              ek -= di2;
              k0 += sk;
            }
            if ( i0 === i1 ) break;
            path.push({i: i0, j: j0, k: k0});
          }
        } else if ( (dj >= di) && (dj >= dk) ) {
          let ei = 0 - dj;
          let ek = ei;
          for ( ;; ) {
            ei += di2;
            ek += dk2;
            j0 += sj;
            if ( ei >= 0 ) {
              ei -= dj2;
              i0 += si;
            }
            if ( ek >= 0 ) {
              ek -= dj2;
              k0 += sk;
            }
            if ( j0 === j1 ) break;
            path.push({i: i0, j: j0, k: k0});
          }
        } else {
          let ei = 0 - dk;
          let ej = ei;
          for ( ;; ) {
            ei += di2;
            ej += dj2;
            k0 += sk;
            if ( ei >= 0 ) {
              ei -= dk2;
              i0 += si;
            }
            if ( ej >= 0 ) {
              ej -= dk2;
              j0 += sj;
            }
            if ( k0 === k1 ) break;
            path.push({i: i0, j: j0, k: k0});
          }
        }
      } else {
        const di1 = di || 1;
        const dj1 = dj || 1;
        const dk1 = dk || 1;
        const tdi = dj1 * dk1;
        const tdj = di1 * dk1;
        const tdk = di1 * dj1;
        const tm = (di1 * dj1 * dk1) + 1;
        let ti = di > 0 ? tdi : tm;
        let tj = dj > 0 ? tdj : tm;
        let tk = dk > 0 ? tdk : tm;
        for ( ;; ) {
          if ( ti < tj ) {
            if ( ti <= tk ) {
              ti += tdi;
              i0 += si;
            } else {
              tk += tdk;
              k0 += sk;
            }
          } else {
            if ( tj <= tk ) {
              tj += tdj;
              j0 += sj;
            } else {
              tk += tdk;
              k0 += sk;
            }
          }
          if ( (i0 === i1) && (j0 === j1) && (k0 === k1) ) break;
          path.push({i: i0, j: j0, k: k0});
        }
      }
      path.push(o1);

      i0 = i1;
      j0 = j1;
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
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    let s = distance / this.distance;
    switch ( this.diagonals ) {
      case GRID_DIAGONALS.EQUIDISTANT: s /= Math.max(adx, ady); break;
      case GRID_DIAGONALS.EXACT: s /= (Math.max(adx, ady) + ((Math.SQRT2 - 1) * Math.min(adx, ady))); break;
      case GRID_DIAGONALS.APPROXIMATE: s /= (Math.max(adx, ady) + (0.5 * Math.min(adx, ady))); break;
      case GRID_DIAGONALS.ALTERNATING_1: {
        let a = Math.max(adx, ady);
        const b = Math.min(adx, ady);
        const t = (2 * a) + b;
        let k = Math.floor(s * b / t);
        if ( (s * b) - (k * t) > a ) {
          a += b;
          k = -1 - k;
        }
        s = (s - k) / a;
        break;
      }
      case GRID_DIAGONALS.ALTERNATING_2: {
        let a = Math.max(adx, ady);
        const b = Math.min(adx, ady);
        const t = (2 * a) + b;
        let k = Math.floor(s * b / t);
        if ( (s * b) - (k * t) > a + b ) {
          k += 1;
        } else {
          a += b;
          k = -k;
        }
        s = (s - k) / a;
        break;
      }
      case GRID_DIAGONALS.RECTILINEAR:
      case GRID_DIAGONALS.ILLEGAL: s /= (adx + ady); break;
    }
    s *= this.size;
    const x = point.x + (dx * s);
    const y = point.y + (dy * s);
    const elevation = point.elevation;
    return elevation !== undefined ? {x, y, elevation} : {x, y};
  }

  /* -------------------------------------------- */

  /** @override */
  getCircle(center, radius) {
    if ( radius <= 0 ) return [];
    switch ( this.diagonals ) {
      case GRID_DIAGONALS.EQUIDISTANT: return this.#getCircleEquidistant(center, radius);
      case GRID_DIAGONALS.EXACT: return this.#getCircleExact(center, radius);
      case GRID_DIAGONALS.APPROXIMATE: return this.#getCircleApproximate(center, radius);
      case GRID_DIAGONALS.ALTERNATING_1: return this.#getCircleAlternating(center, radius, false);
      case GRID_DIAGONALS.ALTERNATING_2: return this.#getCircleAlternating(center, radius, true);
      case GRID_DIAGONALS.RECTILINEAR:
      case GRID_DIAGONALS.ILLEGAL: return this.#getCircleRectilinear(center, radius);
    }
  }

  /* -------------------------------------------- */

  /**
   * Get the circle polygon given the radius in grid units (EQUIDISTANT).
   * @param {Point} center      The center point of the circle.
   * @param {number} radius     The radius in grid units (positive).
   * @returns {Point[]}         The points of the circle polygon.
   */
  #getCircleEquidistant({x, y}, radius) {
    const r = radius / this.distance * this.size;
    const x0 = x + r;
    const x1 = x - r;
    const y0 = y + r;
    const y1 = y - r;
    return [{x: x0, y: y0}, {x: x1, y: y0}, {x: x1, y: y1}, {x: x0, y: y1}];
  }

  /* -------------------------------------------- */

  /**
   * Get the circle polygon given the radius in grid units (EXACT).
   * @param {Point} center      The center point of the circle.
   * @param {number} radius     The radius in grid units (positive).
   * @returns {Point[]}         The points of the circle polygon.
   */
  #getCircleExact({x, y}, radius) {
    const r = radius / this.distance * this.size;
    const s = r / Math.SQRT2;
    return [
      {x: x + r, y},
      {x: x + s, y: y + s},
      {x: x, y: y + r },
      {x: x - s, y: y + s},
      {x: x - r, y},
      {x: x - s, y: y - s},
      {x: x, y: y - r},
      {x: x + s, y: y - s}
    ];
  }

  /* -------------------------------------------- */

  /**
   * Get the circle polygon given the radius in grid units (APPROXIMATE).
   * @param {Point} center      The center point of the circle.
   * @param {number} radius     The radius in grid units (positive).
   * @returns {Point[]}         The points of the circle polygon.
   */
  #getCircleApproximate({x, y}, radius) {
    const r = radius / this.distance * this.size;
    const s = r / 1.5;
    return [
      {x: x + r, y},
      {x: x + s, y: y + s},
      {x: x, y: y + r },
      {x: x - s, y: y + s},
      {x: x - r, y},
      {x: x - s, y: y - s},
      {x: x, y: y - r},
      {x: x + s, y: y - s}
    ];
  }

  /* -------------------------------------------- */

  /**
   * Get the circle polygon given the radius in grid units (ALTERNATING_1/2).
   * @param {Point} center           The center point of the circle.
   * @param {number} radius          The radius in grid units (positive).
   * @param {boolean} firstDouble    2/1/2 instead of 1/2/1?
   * @returns {Point[]}              The points of the circle polygon.
   */
  #getCircleAlternating(center, radius, firstDouble) {
    const r = radius / this.distance;
    const points = [];
    let dx = 0;
    let dy = 0;

    // Generate points of the first quarter
    if ( firstDouble ) {
      points.push({x: r - dx, y: dy});
      dx++;
      dy++;
    }
    for ( ;; ) {
      if ( r - dx <= dy ) {
        [dx, dy] = [dy - 1, dx - 1];
        break;
      }
      points.push({x: r - dx, y: dy});
      dy++;
      if ( r - dx <= dy ) {
        points.push({x: r - dx, y: r - dx});
        if ( dx !== 0 ) {
          points.push({x: dy - 1, y: r - dx});
          [dx, dy] = [dy - 2, dx - 1];
        }
        break;
      }
      points.push({x: r - dx, y: dy});
      dx++;
      dy++;
    }
    for ( ;; ) {
      if ( dx === 0 ) break;
      points.push({x: dx, y: r - dy});
      dx--;
      if ( dx === 0 ) break;
      points.push({x: dx, y: r - dy});
      dx--;
      dy--;
    }

    // Generate the points of the other three quarters by mirroring the first
    const n = points.length;
    for ( let i = 0; i < n; i++ ) {
      const p = points[i];
      points.push({x: -p.y, y: p.x});
    }
    for ( let i = 0; i < n; i++ ) {
      const p = points[i];
      points.push({x: -p.x, y: -p.y});
    }
    for ( let i = 0; i < n; i++ ) {
      const p = points[i];
      points.push({x: p.y, y: -p.x});
    }

    // Scale and center the polygon points
    for ( let i = 0; i < 4 * n; i++ ) {
      const p = points[i];
      p.x = (p.x * this.size) + center.x;
      p.y = (p.y * this.size) + center.y;
    }
    return points;
  }

  /* -------------------------------------------- */

  /**
   * Get the circle polygon given the radius in grid units (RECTILINEAR/ILLEGAL).
   * @param {Point} center      The center point of the circle.
   * @param {number} radius     The radius in grid units (positive).
   * @returns {Point[]}         The points of the circle polygon.
   */
  #getCircleRectilinear({x, y}, radius) {
    const r = radius / this.distance * this.size;
    return [{x: x + r, y}, {x, y: y + r}, {x: x - r, y}, {x, y: y - r}];
  }

  /* -------------------------------------------- */

  /** @override */
  calculateDimensions(sceneWidth, sceneHeight, padding) {
    // Note: Do not replace `* (1 / this.size)` by `/ this.size`!
    // It could change the result and therefore break certain scenes.
    const x = Math.ceil((padding * sceneWidth) * (1 / this.size)) * this.size;
    const y = Math.ceil((padding * sceneHeight) * (1 / this.size)) * this.size;
    const width = sceneWidth + (2 * x);
    const height = sceneHeight + (2 * y);
    const rows = Math.ceil((height / this.size) - 1e-6);
    const columns = Math.ceil((width / this.size) - 1e-6);
    return {width, height, x, y, rows, columns};
  }

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  getCenter(x, y) {
    const msg = "SquareGrid#getCenter is deprecated. Use SquareGrid#getCenterPoint instead.";
    logCompatibilityWarning(msg, {since: 12, until: 14, once: true});
    return this.getTopLeft(x, y).map(c => c + (this.size / 2));
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  getSnappedPosition(x, y, interval=1, options={}) {
    const msg = "SquareGrid#getSnappedPosition is deprecated. "
      + "Use BaseGrid#getSnappedPoint instead for non-Euclidean measurements.";
    logCompatibilityWarning(msg, {since: 12, until: 14, once: true});
    if ( interval === 0 ) return {x: Math.round(x), y: Math.round(y)};
    const [x0, y0] = this.#getNearestVertex(x, y);
    let dx = 0;
    let dy = 0;
    if ( interval !== 1 ) {
      const delta = this.size / interval;
      dx = Math.round((x - x0) / delta) * delta;
      dy = Math.round((y - y0) / delta) * delta;
    }
    return {
      x: Math.round(x0 + dx),
      y: Math.round(y0 + dy)
    };
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  #getNearestVertex(x, y) {
    return [x.toNearest(this.size), y.toNearest(this.size)];
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  getGridPositionFromPixels(x, y) {
    const msg = "BaseGrid#getGridPositionFromPixels is deprecated. Use BaseGrid#getOffset instead.";
    logCompatibilityWarning(msg, {since: 12, until: 14, once: true});
    return [Math.floor(y / this.size), Math.floor(x / this.size)];
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  getPixelsFromGridPosition(row, col) {
    const msg = "BaseGrid#getPixelsFromGridPosition is deprecated. Use BaseGrid#getTopLeftPoint instead.";
    logCompatibilityWarning(msg, {since: 12, until: 14, once: true});
    return [col * this.size, row * this.size];
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  shiftPosition(x, y, dx, dy, options={}) {
    const msg = "BaseGrid#shiftPosition is deprecated. Use BaseGrid#getShiftedPoint instead.";
    logCompatibilityWarning(msg, {since: 12, until: 14, once: true});
    const [row, col] = this.getGridPositionFromPixels(x, y);
    return this.getPixelsFromGridPosition(row+dy, col+dx);
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  measureDistances(segments, options={}) {
    const msg = "SquareGrid#measureDistances is deprecated. "
      + "Use SquareGrid#measurePath instead, which returns grid distance (gridSpaces: true) and Euclidean distance (gridSpaces: false).";
    logCompatibilityWarning(msg, {since: 12, until: 14, once: true});
    if ( !options.gridSpaces ) return super.measureDistances(segments, options);
    return segments.map(s => {
      const r = s.ray;
      const nx = Math.abs(Math.ceil(r.dx / this.size));
      const ny = Math.abs(Math.ceil(r.dy / this.size));

      // Determine the number of straight and diagonal moves
      const nd = Math.min(nx, ny);
      const ns = Math.abs(ny - nx);

      // Linear distance for all moves
      return (nd + ns) * this.distance;
    });
  }
}

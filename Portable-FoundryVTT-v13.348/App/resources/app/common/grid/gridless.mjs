import BaseGrid from "./base.mjs";
import {GRID_TYPES, MOVEMENT_DIRECTIONS} from "../constants.mjs";

/**
 * The gridless grid class.
 */
export default class GridlessGrid extends BaseGrid {

  /**
   * @override
   * @readonly
   */
  type = GRID_TYPES.GRIDLESS;

  /* -------------------------------------------- */

  /** @override */
  calculateDimensions(sceneWidth, sceneHeight, padding) {
    // Note: Do not replace `* (1 / this.size)` by `/ this.size`!
    // It could change the result and therefore break certain scenes.
    const x = Math.ceil((padding * sceneWidth) * (1 / this.size)) * this.size;
    const y = Math.ceil((padding * sceneHeight) * (1 / this.size)) * this.size;
    const width = sceneWidth + (2 * x);
    const height = sceneHeight + (2 * y);
    return {width, height, x, y, rows: Math.ceil(height), columns: Math.ceil(width)};
  }

  /* -------------------------------------------- */

  /** @override */
  getOffset(coords) {
    let i = coords.i;
    if ( i !== undefined ) {
      const {j, k} = coords;
      return k !== undefined ? {i, j, k} : {i, j};
    }
    const {x, y, elevation} = coords;
    i = Math.floor(y) | 0;
    const j = Math.floor(x) | 0;
    if ( elevation === undefined ) return {i, j};
    const k = Math.floor((elevation / this.distance * this.size) + 1e-8) | 0;
    return {i, j, k};
  }

  /* -------------------------------------------- */

  /** @override */
  getOffsetRange({x, y, width, height}) {
    const i0 = Math.floor(y) | 0;
    const j0 = Math.floor(x) | 0;
    if ( !((width > 0) && (height > 0)) ) return [i0, j0, i0, j0];
    return [i0, j0, Math.ceil(y + height) | 0, Math.ceil(x + width) | 0];
  }

  /* -------------------------------------------- */

  /** @override */
  getAdjacentOffsets(coords) {
    return [];
  }

  /* -------------------------------------------- */

  /** @override */
  testAdjacency(coords1, coords2) {
    return false;
  }

  /* -------------------------------------------- */

  /** @override */
  getShiftedOffset(coords, direction) {
    if ( coords.x === undefined ) {
      const {i, j, k} = coords;
      coords = k !== undefined ? {x: j, y: i, elevation: k / this.size * this.distance} : {x: j, y: i};
    }
    return this.getOffset(this.getShiftedPoint(coords, direction));
  }

  /* -------------------------------------------- */

  /** @override */
  getShiftedPoint(point, direction) {
    let di = 0;
    let dj = 0;
    let dk = 0;
    if ( direction & MOVEMENT_DIRECTIONS.UP ) di--;
    if ( direction & MOVEMENT_DIRECTIONS.DOWN ) di++;
    if ( direction & MOVEMENT_DIRECTIONS.LEFT ) dj--;
    if ( direction & MOVEMENT_DIRECTIONS.RIGHT ) dj++;
    if ( direction & MOVEMENT_DIRECTIONS.DESCEND ) dk--;
    if ( direction & MOVEMENT_DIRECTIONS.ASCEND ) dk++;
    const x = point.x + (dj * this.size);
    const y = point.y + (di * this.size);
    const elevation = point.elevation;
    return elevation !== undefined ? {x, y, elevation: elevation + (dk * this.distance)} : {x, y};
  }

  /* -------------------------------------------- */

  /** @override */
  getTopLeftPoint(coords) {
    const i = coords.i;
    if ( i !== undefined ) {
      const {j, k} = coords;
      return k !== undefined ? {x: j, y: i, elevation: k / this.size * this.distance} : {x: j, y: i};
    }
    const {x, y, elevation} = coords;
    return elevation !== undefined ? {x, y, elevation} : {x, y};
  }

  /* -------------------------------------------- */

  /** @override */
  getCenterPoint(coords) {
    const i = coords.i;
    if ( i !== undefined ) {
      const {j, k} = coords;
      return k !== undefined ? {x: j, y: i, elevation: k / this.size * this.distance} : {x: j, y: i};
    }
    const {x, y, elevation} = coords;
    return elevation !== undefined ? {x, y, elevation} : {x, y};
  }

  /* -------------------------------------------- */

  /** @override */
  getShape() {
    return [];
  }

  /* -------------------------------------------- */

  /** @override */
  getVertices(coords) {
    return [];
  }

  /* -------------------------------------------- */

  /** @override */
  getSnappedPoint({x, y, elevation}, behavior) {
    return elevation !== undefined ? {x, y, elevation} : {x, y};
  }

  /* -------------------------------------------- */

  /** @override */
  _measurePath(waypoints, {cost}, result) {

    // Prepare data for the starting point
    const w0 = waypoints[0];
    let o0 = this.getOffset(w0);
    let p0 = this.getCenterPoint(w0);

    // Iterate over additional path points
    const is3D = o0.k !== undefined;
    for ( let i = 1; i < waypoints.length; i++ ) {
      const w1 = waypoints[i];
      const o1 = this.getOffset(w1);
      const p1 = this.getCenterPoint(w1);
      const cost1 = w1.cost ?? cost;

      // Measure segment
      if ( w1.measure !== false ) {
        const segment = result.waypoints[i].backward;
        segment.distance = Math.hypot(p0.x - p1.x, p0.y - p1.y, is3D ? (p0.elevation - p1.elevation) / this.distance
          * this.size : 0) / this.size * this.distance;
        segment.euclidean = segment.distance;
        const offsetDistance = Math.hypot(o0.i - o1.i, o0.j - o1.j, is3D ? o0.k - o1.k : 0) / this.size * this.distance;
        if ( (cost1 === undefined) || (offsetDistance === 0) ) segment.cost = w1.teleport ? 0 : offsetDistance;
        else if ( typeof cost1 === "function" ) segment.cost = cost1(o0, o1, offsetDistance, w1);
        else segment.cost = Number(cost1);
      }

      o0 = o1;
      p0 = p1;
    }
  }

  /* -------------------------------------------- */

  /** @override */
  getDirectPath(waypoints) {
    if ( waypoints.length === 0 ) return [];
    let o0 = this.getOffset(waypoints[0]);
    const path = [o0];
    for ( let i = 1; i < waypoints.length; i++ ) {
      const o1 = this.getOffset(waypoints[i]);
      if ( (o0.i === o1.i) && (o0.j === o1.j) && (o0.k === o1.k) ) continue;
      path.push(o1);
      o0 = o1;
    }
    return path;
  }

  /* -------------------------------------------- */

  /** @override */
  getTranslatedPoint(point, direction, distance) {
    direction = Math.toRadians(direction);
    const dx = Math.cos(direction);
    const dy = Math.sin(direction);
    const s = distance / this.distance * this.size;
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
    const n = Math.max(Math.ceil(Math.PI / Math.acos(Math.max(r - 0.25, 0) / r)), 4);
    const points = new Array(n);
    for ( let i = 0; i < n; i++ ) {
      const a = 2 * Math.PI * (i / n);
      points[i] = {x: x + (Math.cos(a) * r), y: y + (Math.sin(a) * r)};
    }
    return points;
  }

  /* -------------------------------------------- */

  /** @override */
  getCone(origin, radius, direction, angle) {
    if ( (radius <= 0) || (angle <= 0) ) return [];
    if ( angle >= 360 ) return this.getCircle(origin, radius);
    const r = radius / this.distance * this.size;
    const n = Math.max(Math.ceil(Math.PI / Math.acos(Math.max(r - 0.25, 0) / r) * (angle / 360)), 4);
    const a0 = Math.toRadians(direction - (angle / 2));
    const a1 = Math.toRadians(direction + (angle / 2));
    const points = new Array(n + 1);
    const {x, y} = origin;
    points[0] = {x, y};
    for ( let i = 0; i <= n; i++ ) {
      const a = Math.mix(a0, a1, i / n);
      points[i + 1] = {x: x + (Math.cos(a) * r), y: y + (Math.sin(a) * r)};
    }
    return points;
  }
}

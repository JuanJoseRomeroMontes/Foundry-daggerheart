import HexagonalGrid from "./hexagonal.mjs";

/**
 * @import {GridOffset2D, HexagonalGridCube2D, HexagonalGridCoordinates2D} from "./_types.mjs";
 * @import {Point} from "../_types.mjs";
 */

/**
 * A helper class which represents a single hexagon as part of a HexagonalGrid.
 * This class relies on having an active canvas scene in order to know the configuration of the hexagonal grid.
 */
export default class GridHex {
  /**
   * Construct a GridHex instance by providing a hex coordinate.
   * @param {HexagonalGridCoordinates2D} coordinates    The coordinates of the hex to construct
   * @param {HexagonalGrid} grid                        The hexagonal grid instance to which this hex belongs
   */
  constructor(coordinates, grid) {
    if ( !(grid instanceof HexagonalGrid) ) {
      grid = new HexagonalGrid(grid);
      foundry.utils.logCompatibilityWarning("The GridHex class now requires a HexagonalGrid instance to be passed to "
        + "its constructor, rather than a HexagonalGridConfiguration", {since: 12, until: 14});
    }
    if ( "row" in coordinates ) {
      coordinates = {i: coordinates.row, j: coordinates.col};
      foundry.utils.logCompatibilityWarning("The coordinates used to construct the GridHex class are now a GridOffset"
        + " with format {i, j}.", {since: 12, until: 14});
    }

    /**
     * The hexagonal grid to which this hex belongs.
     * @type {HexagonalGrid}
     */
    this.grid = grid;

    /**
     * The cube coordinate of this hex
     * @type {HexagonalGridCube2D}
     */
    this.cube = this.grid.getCube(coordinates);

    /**
     * The offset coordinate of this hex
     * @type {GridOffset2D}
     */
    this.offset = this.grid.cubeToOffset(this.cube);
  }

  /* -------------------------------------------- */

  /**
   * Return a reference to the pixel point in the center of this hexagon.
   * @type {Point}
   */
  get center() {
    return this.grid.getCenterPoint(this.cube);
  }

  /* -------------------------------------------- */

  /**
   * Return a reference to the pixel point of the top-left corner of this hexagon.
   * @type {Point}
   */
  get topLeft() {
    return this.grid.getTopLeftPoint(this.cube);
  }

  /* -------------------------------------------- */

  /**
   * Return the array of hexagons which are neighbors of this one.
   * This result is un-bounded by the confines of the game canvas and may include hexes which are off-canvas.
   * @returns {GridHex[]}
   */
  getNeighbors() {
    return this.grid.getAdjacentCubes(this.cube).map(c => new this.constructor(c, this.grid));
  }

  /* -------------------------------------------- */

  /**
   * Get a neighboring hex by shifting along cube coordinates
   * @param {number} dq     A number of hexes to shift along the q axis
   * @param {number} dr     A number of hexes to shift along the r axis
   * @param {number} ds     A number of hexes to shift along the s axis
   * @returns {GridHex}     The shifted hex
   */
  shiftCube(dq, dr, ds) {
    const {q, r, s} = this.cube;
    return new this.constructor({q: q + dq, r: r + dr, s: s + ds}, this.grid);
  }

  /* -------------------------------------------- */

  /**
   * Return whether this GridHex equals the same position as some other GridHex instance.
   * @param {GridHex} other     Some other GridHex
   * @returns {boolean}         Are the positions equal?
   */
  equals(other) {
    return (this.offset.i === other.offset.i) && (this.offset.j === other.offset.j);
  }
}

import DataModel from "../../common/abstract/data.mjs";
import * as fields from "../../common/data/fields.mjs";

/**
 * @import {TokenMeasureMovementPathOptions, TokenMovementCostFunction} from "../_types.mjs";
 * @import TokenDocument from "@client/documents/token.mjs";
 */

/**
 * The base TerrainData.
 * @template TerrainEffect
 * @abstract
 */
export class BaseTerrainData extends DataModel {

  /**
   * Create the terrain data from the given array of terrain effects.
   * The type of the terrain effects and data is system-defined.
   * The terrain effects are not passed in any particular order.
   * Ownership of the array is passed to this function.
   * This function must return null if the array of terrain effects is empty.
   * @param {TerrainEffect[]} effects                  An array of terrain effects
   * @returns {BaseTerrainData<TerrainEffect>|null}    The terrain data or null
   * @abstract
   */
  static resolveTerrainEffects(effects) {
    throw new Error("A subclass of the BaseTerrainData must implement the resolveTerrainEffects method.");
  }

  /* -------------------------------------------- */

  /**
   * Create the terrain movement cost function for the given token.
   * Only movement cost that is caused by the terrain should be calculated by this function,
   * which includes the base movement cost.
   * Extra movement cost unrelated to terrain must be calculated in
   * {@link foundry.canvas.placeables.Token#_getMovementCostFunction}.
   * In square and hexagonal grids it calculates the cost for single grid space move between two grid space offsets.
   * For tokens that occupy more than one grid space the cost of movement is calculated as the median of all individual
   * grid space moves unless the cost of any of these is infinite, in which case total cost is always infinite.
   * In gridless grids the `from` and `to` parameters of the cost function are top-left offsets.
   * If the movement cost function is undefined, the cost equals the distance moved.
   * @param {TokenDocument} token                          The Token that moves
   * @param {TokenMeasureMovementPathOptions} [options]    Additional options that affect cost calculations
   * @returns {TokenMovementCostFunction|void}
   * @abstract
   */
  static getMovementCostFunction(token, options) {
    throw new Error("A subclass of the BaseTerrainData must implement the getMovementCostFunction method.");
  }

  /* -------------------------------------------- */

  /**
   * Is this terrain data the same as some other terrain data?
   * @param {any} other    Some other terrain data
   * @returns {boolean}    Are the terrain datas equal?
   * @abstract
   */
  equals(other) {
    throw new Error("A subclass of the BaseTerrainData must implement the equals method.");
  }
}

/* -------------------------------------------- */

/**
 * The core TerrainData implementation.
 * @extends {BaseTerrainData<{name: "difficulty", difficulty: number}>}
 *
 * @property {number} difficulty    The difficulty of the terrain (the movement cost multiplier)
 */
export class TerrainData extends BaseTerrainData {
  /** @override */
  static defineSchema() {
    return {
      difficulty: new fields.NumberField({required: true, nullable: true, min: 0, initial: 1})
    };
  }

  /* -------------------------------------------- */

  /** @override */
  static resolveTerrainEffects(effects) {
    let difficulty = 1;
    for ( const effect of effects ) {
      if ( effect.name === "difficulty" ) difficulty *= effect.difficulty;
    }
    if ( difficulty === 1 ) return null;
    return new this({difficulty});
  }

  /* -------------------------------------------- */

  /** @override */
  static getMovementCostFunction(token, options) {
    return (from, to, distance, segment) => distance * (segment.terrain?.difficulty ?? 1);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _initialize(options) {
    super._initialize(options);
    this.difficulty ??= Infinity;
  }

  /* -------------------------------------------- */

  /** @override */
  equals(other) {
    if ( !(other instanceof TerrainData) ) return false;
    return this.difficulty === other.difficulty;
  }
}

import RegionBehaviorType from "./base.mjs";
import {REGION_EVENTS} from "../../../common/constants.mjs";
import * as fields from "../../../common/data/fields.mjs";

/**
 * @import {RegionBehaviorViewedEvent, RegionBehaviorUnviewedEvent,
 *   RegionRegionBoundaryEvent} from "@client/documents/_types.mjs";
 */

/**
 * The data model for a behavior that allows to modify the movement cost within the Region.
 *
 * @property {{[movementAction: string]: number}} difficulties    The difficulty of each movement action
 */
export default class ModifyMovementCostRegionBehaviorType extends RegionBehaviorType {

  /** @override */
  static LOCALIZATION_PREFIXES = ["BEHAVIOR.TYPES.modifyMovementCost", "BEHAVIOR.TYPES.base"];

  /* ---------------------------------------- */

  /** @override */
  static defineSchema() {
    const difficulties = [];
    for ( const [action, {label, deriveTerrainDifficulty}] of Object.entries(CONFIG.Token.movement.actions) ) {
      if ( deriveTerrainDifficulty ) continue;
      difficulties.push({action, label, hint: ""});
    }
    difficulties.at(-1).hint = "BEHAVIOR.TYPES.modifyMovementCost.FIELDS.difficulties.hint";
    return {
      difficulties: new fields.SchemaField(difficulties.reduce((schema, {action, label, hint}) => {
        schema[action] = new fields.NumberField({required: true, nullable: true, initial: 1, step: 0.25,
          min: 0, max: 5, label, hint});
        return schema;
      }, {}))
    };
  }

  /* ---------------------------------------- */

  /**
   * Called when the darkness behavior is viewed.
   * @param {RegionBehaviorViewedEvent} event
   * @this {ModifyMovementCostRegionBehaviorType}
   */
  static async #onBehaviorViewed(event) {
    canvas.tokens.recalculatePlannedMovementPaths();
  }

  /* ---------------------------------------- */

  /**
   * Called when the darkness behavior is unviewed.
   * @param {RegionBehaviorUnviewedEvent} event
   * @this {ModifyMovementCostRegionBehaviorType}
   */
  static async #onBehaviorUnviewed(event) {
    canvas.tokens.recalculatePlannedMovementPaths();
  }

  /* ---------------------------------------- */

  /**
   * Called when the boundary of an event has changed.
   * @param {RegionRegionBoundryEvent} event
   * @this {ModifyMovementCostRegionBehaviorType}
   */
  static async #onRegionBoundary(event) {
    if ( !this.behavior.viewed ) return;
    canvas.tokens.recalculatePlannedMovementPaths();
  }

  /* ---------------------------------------- */

  /** @override */
  static events = {
    [REGION_EVENTS.BEHAVIOR_VIEWED]: this.#onBehaviorViewed,
    [REGION_EVENTS.BEHAVIOR_UNVIEWED]: this.#onBehaviorUnviewed,
    [REGION_EVENTS.REGION_BOUNDARY]: this.#onRegionBoundary
  };

  /* ---------------------------------------- */

  /** @inheritDoc */
  prepareBaseData() {
    super.prepareBaseData();
    const actionConfigs = CONFIG.Token.movement.actions;
    for ( const action in actionConfigs ) {
      if ( action in this._source.difficulties ) continue;
      this.difficulties[action] = actionConfigs[action].deriveTerrainDifficulty(this._source.difficulties);
    }
  }

  /* ---------------------------------------- */

  /** @inheritDoc */
  _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);
    if ( ("system" in changed) && !this.behavior.viewed ) return;
    canvas.tokens.recalculatePlannedMovementPaths();
  }

  /* ---------------------------------------- */

  /** @override */
  _getTerrainEffects(token, segment) {
    const difficulty = this.difficulties[segment.action];
    if ( difficulty === 1 ) return [];
    return [{name: "difficulty", difficulty}];
  }
}

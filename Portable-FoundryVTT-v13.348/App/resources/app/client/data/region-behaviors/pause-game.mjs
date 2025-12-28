import RegionBehaviorType from "./base.mjs";
import {REGION_EVENTS} from "@common/constants.mjs";
import * as fields from "../../../common/data/fields.mjs";

/**
 * @import {RegionMoveInEvent} from "@client/documents/_types.mjs";
 */

/**
 * The data model for a behavior that pauses the game when a player-controlled Token enters the Region.
 *
 * @property {boolean} once    Disable the behavior once a player-controlled Token enters the region?
 */
export default class PauseGameRegionBehaviorType extends RegionBehaviorType {

  /** @override */
  static LOCALIZATION_PREFIXES = ["BEHAVIOR.TYPES.pauseGame", "BEHAVIOR.TYPES.base"];

  /* ---------------------------------------- */

  /** @override */
  static defineSchema() {
    return {
      once: new fields.BooleanField()
    };
  }

  /* ---------------------------------------- */

  /**
   * Pause the game if a player-controlled Token moves into the Region.
   * @param {RegionMoveInEvent} event
   * @this {PauseGameRegionBehaviorType}
   */
  static async #onTokenMoveIn(event) {
    if ( event.user.isGM ) return;
    if ( event.user.isSelf ) event.data.token.stopMovement();
    if ( !game.user.isActiveGM ) return;
    game.togglePause(true, {broadcast: true});
    if ( this.once ) {
      // noinspection ES6MissingAwait
      this.parent.update({disabled: true});
    }
  }

  /* ---------------------------------------- */

  /** @override */
  static events = {
    [REGION_EVENTS.TOKEN_MOVE_IN]: this.#onTokenMoveIn
  };
}


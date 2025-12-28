import RegionBehaviorType from "./base.mjs";
import {REGION_EVENTS} from "../../../common/constants.mjs";
import * as fields from "../../../common/data/fields.mjs";
import RegionBehavior from "@client/documents/region-behavior.mjs";

/**
 * @import {RegionEvent} from "@client/documents/_types.mjs";
 */

/**
 * The data model for a behavior that toggles Region Behaviors when one of the subscribed events occurs.
 *
 * @property {Set<string>} enable     The Region Behavior UUIDs that are enabled.
 * @property {Set<string>} disable    The Region Behavior UUIDs that are disabled.
 */
export default class ToggleBehaviorRegionBehaviorType extends RegionBehaviorType {

  /** @override */
  static LOCALIZATION_PREFIXES = ["BEHAVIOR.TYPES.toggleBehavior", "BEHAVIOR.TYPES.base"];

  /* ---------------------------------------- */

  /** @override */
  static defineSchema() {
    return {
      events: this._createEventsField({events: [
        REGION_EVENTS.TOKEN_ENTER,
        REGION_EVENTS.TOKEN_EXIT,
        REGION_EVENTS.TOKEN_MOVE_IN,
        REGION_EVENTS.TOKEN_MOVE_OUT,
        REGION_EVENTS.TOKEN_TURN_START,
        REGION_EVENTS.TOKEN_TURN_END,
        REGION_EVENTS.TOKEN_ROUND_START,
        REGION_EVENTS.TOKEN_ROUND_END
      ]}),
      enable: new fields.SetField(new fields.DocumentUUIDField({type: "RegionBehavior"})),
      disable: new fields.SetField(new fields.DocumentUUIDField({type: "RegionBehavior"}))
    };
  }

  /* -------------------------------------------- */

  /** @override */
  static validateJoint(data) {
    if ( new Set(data.enable).intersection(new Set(data.disable)).size !== 0 ) {
      throw new Error("A RegionBehavior cannot be both enabled and disabled");
    }
  }

  /* ---------------------------------------- */

  /** @override */
  async _handleRegionEvent(event) {
    if ( event.data.movement && event.user.isSelf ) event.data.token.pauseMovement(this.parent.uuid);
    if ( !game.user.isActiveGM ) return;
    const toggle = async (uuid, disabled) => {
      try {
        const behavior = await foundry.utils.fromUuid(uuid);
        if ( !(behavior instanceof RegionBehavior) ) throw new Error(`${uuid} does not exist`);
        await behavior.update({disabled});
      } catch(err) {
        console.error(err);
      }
    };
    await Promise.allSettled(this.disable.map(uuid => toggle(uuid, true)));
    await Promise.allSettled(this.enable.map(uuid => toggle(uuid, false)));
    if ( event.data.movement ) event.data.token.resumeMovement(event.data.movement.id, this.parent.uuid);
  }
}

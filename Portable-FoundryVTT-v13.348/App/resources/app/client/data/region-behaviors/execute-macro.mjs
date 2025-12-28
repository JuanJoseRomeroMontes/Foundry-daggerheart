import RegionBehaviorType from "./base.mjs";
import * as fields from "@common/data/fields.mjs";

/**
 * @import {RegionEvent} from "@client/documents/_types.mjs";
 */

/**
 * The data model for a behavior that executes a Macro.
 *
 * @property {string} uuid           The Macro UUID.
 */
export default class ExecuteMacroRegionBehaviorType extends RegionBehaviorType {

  /** @override */
  static LOCALIZATION_PREFIXES = ["BEHAVIOR.TYPES.executeMacro", "BEHAVIOR.TYPES.base"];

  /* ---------------------------------------- */

  /** @override */
  static defineSchema() {
    return {
      events: this._createEventsField(),
      uuid: new fields.DocumentUUIDField({type: "Macro"}),
      everyone: new fields.BooleanField()
    };
  }

  /* ---------------------------------------- */

  /** @override */
  async _handleRegionEvent(event) {
    if ( !this.uuid ) return;
    const macro = await foundry.utils.fromUuid(this.uuid);
    if ( !(macro instanceof foundry.documents.Macro) ) {
      console.error(`${this.uuid} does not exist`);
      return;
    }
    if ( !this.#shouldExecute(macro, event.user) ) return;
    const {scene, region, behavior} = this;
    const token = event.data.token;
    const speaker = token
      ? {scene: token.parent?.id ?? null, actor: token.actor?.id ?? null, token: token.id, alias: token.name}
      : {scene: scene.id, actor: null, token: null, alias: region.name};
    await macro.execute({speaker, actor: token?.actor, token: token?.object, scene, region, behavior, event});
  }

  /* ---------------------------------------- */

  /**
   * Should the client execute the macro?
   * @param {Macro} macro    The macro.
   * @param {User} user      The user that triggered the event.
   * @returns {boolean}      Should the client execute the macro?
   */
  #shouldExecute(macro, user) {
    if ( this.everyone ) return true;
    if ( macro.canUserExecute(user) ) return user.isSelf;
    const eligibleUsers = game.users.filter(u => u.active && macro.canUserExecute(u));
    if ( eligibleUsers.length === 0 ) return false;
    eligibleUsers.sort((a, b) => (b.role - a.role) || a.id.compare(b.id));
    const designatedUser = eligibleUsers[0];
    return designatedUser.isSelf;
  }
}

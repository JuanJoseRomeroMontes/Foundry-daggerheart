import RegionBehaviorType from "./base.mjs";
import {REGION_EVENTS} from "@common/constants.mjs";
import * as fields from "@common/data/fields.mjs";
import DialogV2 from "../../applications/api/dialog.mjs";
import {fromUuid, fromUuidSync} from "@client/utils/helpers.mjs";
import RegionDocument from "@client/documents/region.mjs";

/**
 * @import {ElevatedPoint} from "../../_types.mjs";
 * @import TokenDocument from "@client/documents/token.mjs";
 * @import {RegionMoveInEvent} from "@client/documents/_types.mjs";
 */

/**
 * The data model for a behavior that teleports Token that enter the Region to a preset destination Region.
 *
 * @property {RegionDocument} destination    The destination Region the Token is teleported to.
 * @property {boolean} choice                Show teleportation confirmation dialog?
 */
export default class TeleportTokenRegionBehaviorType extends RegionBehaviorType {

  /** @override */
  static LOCALIZATION_PREFIXES = ["BEHAVIOR.TYPES.teleportToken", "BEHAVIOR.TYPES.base"];

  /* ---------------------------------------- */

  /** @override */
  static defineSchema() {
    return {
      destination: new fields.DocumentUUIDField({type: "Region"}),
      choice: new fields.BooleanField()
    };
  }

  /* ---------------------------------------- */

  /**
   * Teleport the Token if it moves into the Region.
   * @param {RegionMoveInEvent} event
   * @this {TeleportTokenRegionBehaviorType}
   */
  static async #onTokenMoveIn(event) {
    if ( !this.destination || (event.data.movement.passed.waypoints.at(-1).action === "displace") ) return;
    const destination = fromUuidSync(this.destination);
    if ( !(destination instanceof RegionDocument) ) {
      console.error(`${this.destination} does not exist`);
      return;
    }
    const token = event.data.token;
    const user = event.user;
    if ( user.isSelf ) token.stopMovement();
    if ( !this.#shouldTeleport(token, destination, user) ) return;

    // When the browser tab is/becomes hidden, don't wait for the movement animation and
    // proceed immediately. Otherwise wait for the movement animation to complete.
    if ( token.rendered && token.object.movementAnimationPromise && !window.document.hidden ) {
      let visibilitychange;
      await Promise.race([token.object.movementAnimationPromise, new Promise(resolve => {
        visibilitychange = event => {
          if ( window.document.hidden ) resolve();
        };
        window.document.addEventListener("visibilitychange", visibilitychange);
      }).finally(() => {
        window.document.removeEventListener("visibilitychange", visibilitychange);
      })]);
    }

    if ( this.choice ) {
      let confirmed;
      if ( user.isSelf ) confirmed = await TeleportTokenRegionBehaviorType.#confirmDialog(token, destination);
      else confirmed = await user.query("confirmTeleportToken", {behaviorUuid: this.parent.uuid, tokenUuid: token.uuid});
      if ( !confirmed ) return;
    }
    await destination.teleportToken(token);

    // View destination scene / Pull the user to the destination scene only if the user is currently viewing the origin
    // scene
    if ( token.parent !== destination.parent ) {
      if ( user.isSelf ) {
        if ( token.parent.isView ) await destination.parent.view();
      } else {
        if ( token.parent.id === user.viewedScene ) await game.socket.emit("pullToScene", destination.parent.id, user.id);
      }
    }
  }

  /* ---------------------------------------- */

  /** @override */
  static events = {
    [REGION_EVENTS.TOKEN_MOVE_IN]: this.#onTokenMoveIn
  };

  /* ---------------------------------------- */

  /**
   * Should the current user teleport the token?
   * @param {TokenDocument} token           The token that is teleported.
   * @param {RegionDocument} destination    The destination region.
   * @param {User} user                     The user that moved the token.
   * @returns {boolean}                     Should the current user teleport the token?
   */
  #shouldTeleport(token, destination, user) {
    const userCanTeleport = (token.parent === destination.parent) || (user.can("TOKEN_CREATE") && user.can("TOKEN_DELETE"));
    if ( userCanTeleport ) return user.isSelf;
    return game.user.isDesignated(u => u.active && u.can("TOKEN_CREATE") && u.can("TOKEN_DELETE") && (!this.choice || u.can("QUERY_USER")));
  }

  /* -------------------------------------------- */

  /**
   * The query handler for teleporation confirmation.
   * @type {(queryData: {behaviorUuid: string; token: tokenUuid}) => Promise<boolean>}
   * @internal
   */
  static _confirmQuery = async ({behaviorUuid, tokenUuid}) => {
    const behavior = await fromUuid(behaviorUuid);
    if ( !behavior || (behavior.type !== "teleportToken") || !behavior.system.destination ) return false;
    const destination = await fromUuid(behavior.system.destination);
    if ( !destination ) return false;
    const token = await fromUuid(tokenUuid);
    if ( !token ) return false;
    return TeleportTokenRegionBehaviorType.#confirmDialog(token, destination);
  };

  /* -------------------------------------------- */

  /**
   * Display a dialog to confirm the teleportation?
   * @param {TokenDocument} token           The token that is teleported.
   * @param {RegionDocument} destination    The destination region.
   * @returns {Promise<boolean>}            The result of the dialog.
   */
  static async #confirmDialog(token, destination) {
    const question = game.i18n.format(`BEHAVIOR.TYPES.teleportToken.${game.user.isGM ? "ConfirmGM" : "Confirm"}`, {
      token: foundry.utils.escapeHTML(token.name),
      region: foundry.utils.escapeHTML(destination.name),
      scene: foundry.utils.escapeHTML(destination.parent.name)
    });
    return DialogV2.confirm({
      window: {title: CONFIG.RegionBehavior.typeLabels.teleportToken},
      content: `<p>${question}</p>`
    });
  }
}

import BasePlaceableHUD from "./placeable-hud.mjs";
import HandlebarsApplicationMixin from "../api/handlebars-application.mjs";
import TokenDocument from "@client/documents/token.mjs";

/**
 * @import Token from "../../canvas/placeables/token.mjs";
 * @import TokenLayer from "../../canvas/layers/tokens.mjs";
 */

/**
 * An implementation of the BasePlaceableHUD base class which renders a heads-up-display interface for Token objects.
 * This interface provides controls for visibility, attribute bars, elevation, status effects, and more.
 * The TokenHUD implementation can be configured and replaced via {@link CONFIG.Token.hudClass}.
 * @extends {BasePlaceableHUD<Token, TokenDocument, TokenLayer>}
 * @mixes HandlebarsApplication
 */
export default class TokenHUD extends HandlebarsApplicationMixin(BasePlaceableHUD) {

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    id: "token-hud",
    actions: {
      combat: TokenHUD.#onToggleCombat,
      target: TokenHUD.#onToggleTarget,
      effect: {handler: TokenHUD.#onToggleEffect, buttons: [0, 2]},
      movementAction: TokenHUD.#onSelectMovementAction
    }
  };

  /** @override */
  static PARTS = {
    hud: {
      root: true,
      template: "templates/hud/token-hud.hbs"
    }
  };

  /* -------------------------------------------- */

  /**
   * Convenience reference to the Actor modified by this TokenHUD.
   * @type {Actor}
   */
  get actor() {
    return this.document?.actor;
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const bar1 = this.document.getBarAttribute("bar1");
    const bar2 = this.document.getBarAttribute("bar2");
    return foundry.utils.mergeObject(context, {
      canConfigure: game.user.can("TOKEN_CONFIGURE"),
      canToggleCombat: ui.combat !== null,
      displayBar1: bar1 && (bar1.type !== "none"),
      bar1Data: bar1,
      displayBar2: bar2 && (bar2.type !== "none"),
      bar2Data: bar2,
      combatClass: this.object.inCombat ? "active" : "",
      targetClass: this.object.targeted.has(game.user) ? "active" : "",
      statusEffects: this._getStatusEffectChoices(),
      movementActions: this._getMovementActionChoices(),
      movementActionsConfig: CONFIG.Token.movement.actions[this.document.movementAction]
    });
  }

  /* -------------------------------------------- */

  /**
   * Get the valid status effect choices.
   * @returns {{[id: string]: {
   *   id: string;
   *   _id: string;
   *   title: string;
   *   src: string;
   *   isActive: boolean;
   *   isOverlay: boolean;
   *   cssClass: string;
   * }}}
   * @protected
   */
  _getStatusEffectChoices() {

    // Include all HUD-enabled status effects
    const choices = {};
    for ( const status of CONFIG.statusEffects ) {
      if ( (status.hud === false) || ((foundry.utils.getType(status.hud) === "Object")
        && (status.hud.actorTypes?.includes(this.document.actor.type) === false)) ) {
        continue;
      }
      choices[status.id] = {
        _id: status._id,
        id: status.id,
        title: game.i18n.localize(status.name ?? /** @deprecated since v12 */ status.label),
        src: status.img ?? /** @deprecated since v12 */ status.icon,
        isActive: false,
        isOverlay: false
      };
    }

    // Update the status of effects which are active for the token actor
    const activeEffects = this.actor?.effects || [];
    for ( const effect of activeEffects ) {
      for ( const statusId of effect.statuses ) {
        const status = choices[statusId];
        if ( !status ) continue;
        if ( status._id ) {
          if ( status._id !== effect.id ) continue;
        } else {
          if ( effect.statuses.size !== 1 ) continue;
        }
        status.isActive = true;
        if ( effect.getFlag("core", "overlay") ) status.isOverlay = true;
        break;
      }
    }

    // Flag status CSS class
    for ( const status of Object.values(choices) ) {
      status.cssClass = [
        status.isActive ? "active" : null,
        status.isOverlay ? "overlay" : null
      ].filterJoin(" ");
    }
    return choices;
  }

  /* -------------------------------------------- */

  /**
   * Get the valid movement action choices.
   * @returns {{[id: string]: {
   *   id: string;
   *   label: string;
   *   [icon]: string;
   *   [img]: string;
   *   isActive: boolean;
   *   cssClass: string;
   * }}}
   * @protected
   */
  _getMovementActionChoices() {
    const currentAction = this.document._source.movementAction;
    const defaultAction = !currentAction ? this.document.movementAction : this.document._inferMovementAction();
    const choices = {
      // Default
      "": {
        id: "",
        label: `${game.i18n.localize("Default")} (${game.i18n.localize(CONFIG.Token.movement.actions[defaultAction].label)})`,
        isActive: currentAction === null,
        cssClass: currentAction === null ? "active" : ""
      }
    };
    for ( const [action, config] of Object.entries(CONFIG.Token.movement.actions) ) {
      if ( !config.canSelect(this.document) && (action !== currentAction) ) continue;
      const isActive = action === currentAction;
      choices[action] = {
        id: action,
        label: game.i18n.localize(config.label),
        icon: config.icon,
        img: config.img,
        isActive,
        cssClass: isActive ? "active" : ""
      };
    }
    return choices;
  }

  /* -------------------------------------------- */

  /** @override */
  _onPosition(position) {
    this.element.classList.toggle("large", this.document.height >= 2);
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _parseAttributeInput(name, attr, input) {
    if ( (name === "bar1") || (name === "bar2") ) {
      attr = this.document.getBarAttribute(name);
      name = attr.attribute;
    }
    return super._parseAttributeInput(name, attr, input);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onSubmit(event, form, formData) {
    // Special submission process for token attribute changes
    if ( (event.type === "change") && ["bar1", "bar2"].includes(event.target.name) ) {
      return this.#onSubmitBar(event, form, formData);
    }

    // Special submission process for token elevation changes
    if ( (event.type === "change") && (event.target.name === "elevation") ) {
      return this.#onSubmitElevation(event, form, formData);
    }

    return super._onSubmit(event, form, formData);
  }

  /* -------------------------------------------- */

  /**
   * Special submission process for token attribute changes.
   * @param {SubmitEvent} event
   * @param {HTMLFormElement} form
   * @param {FormDataExtended} formData
   * @returns {Promise<void>}
   */
  async #onSubmitBar(event, form, formData) {
    const name = event.target.name;
    const input = event.target.value;
    const {attribute, value, delta, isDelta, isBar} = this._parseAttributeInput(name, undefined, input);
    await this.actor?.modifyTokenAttribute(attribute, isDelta ? delta : value, isDelta, isBar);
  }

  /* -------------------------------------------- */

  /**
   * Special submission process for token elevation changes.
   * @param {SubmitEvent} event
   * @param {HTMLFormElement} form
   * @param {FormDataExtended} formData
   * @returns {Promise<void>}
   */
  async #onSubmitElevation(event, form, formData) {
    const origin = this.document._source;
    const elevation = this._parseAttributeInput("elevation", origin.elevation, event.target.value).value;
    const destination = this.object._getHUDMovementPosition(elevation);
    destination.x = Math.round(destination.x ?? origin.x);
    destination.y = Math.round(destination.y ?? origin.y);
    destination.elevation ??= origin.elevation;
    destination.width ??= origin.width;
    destination.height ??= origin.height;
    destination.shape ??= origin.shape;
    destination.action = this.object._getHUDMovementAction();
    if ( canvas.grid.isGridless ) destination.snapped = false;

    // HUD movement is snapped if both the origin and the destination are snapped
    else {
      const snappedOrigin = this.document.getSnappedPosition(origin);
      const snappedDestination = this.document.getSnappedPosition(destination);
      destination.snapped = (origin.x === Math.round(snappedOrigin.x))
        && (origin.y === Math.round(snappedOrigin.y))
        && (origin.elevation.almostEqual(snappedOrigin.elevation))
        && (destination.x === Math.round(snappedDestination.x))
        && (destination.y === Math.round(snappedDestination.y))
        && (destination.elevation.almostEqual(snappedDestination.elevation));
    }
    destination.explicit = false;  // HUD movement does not explicitly place a waypoint
    destination.checkpoint = true;
    await this.document.move(destination);
  }

  /* -------------------------------------------- */

  /**
   * Toggle the combat state of all controlled Tokens.
   * @this {TokenHUD}
   * @param {PointerEvent} event
   * @param {HTMLButtonElement} target
   * @returns {Promise<void>}
   */
  static async #onToggleCombat(event, target) {
    const tokens = canvas.tokens.controlled.map(t => t.document);
    if ( !this.object.controlled ) tokens.push(this.document);
    try {
      if ( this.document.inCombat ) await TokenDocument.implementation.deleteCombatants(tokens);
      else await TokenDocument.implementation.createCombatants(tokens);
    } catch(err) {
      ui.notifications.warn(err.message);
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle toggling a token status effect icon.
   * @this {TokenHUD}
   * @param {PointerEvent} event
   * @param {HTMLButtonElement} target
   * @returns {Promise<void>}
   */
  static async #onToggleEffect(event, target) {
    if ( !this.actor ) {
      ui.notifications.warn("HUD.WarningEffectNoActor", {localize: true});
      return;
    }
    const statusId = target.dataset.statusId;
    await this.actor.toggleStatusEffect(statusId, {
      active: !target.classList.contains("active"),
      overlay: event.button === 2
    });
  }

  /* -------------------------------------------- */

  /**
   * Handle selecting a movement action.
   * @this {TokenHUD}
   * @param {PointerEvent} event
   * @param {HTMLButtonElement} target
   * @returns {Promise<void>}
   */
  static async #onSelectMovementAction(event, target) {
    await this.document.update({movementAction: target.dataset.movementAction || null});
  }

  /* -------------------------------------------- */

  /**
   * Handle toggling the target state for this Token
   * @this {TokenHUD}
   * @param {PointerEvent} event
   * @param {HTMLButtonElement} target
   */
  static #onToggleTarget(event, target) {
    const token = this.object;
    const targeted = !token.isTargeted;
    token.setTarget(targeted, {releaseOthers: false});
    target.classList.toggle("active", targeted);
  }

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /**
   * @deprecated since v13
   * @ignore
   */
  toggleStatusTray(active) {
    foundry.utils.logCompatibilityWarning('TokenHUD#toggleStatusTray has been deprecated in favor of TokenHUD#togglePalette("effects", active?)',
      {since: 13, until: 15, once: true});
    this.togglePalette("effects", active);
  }
}

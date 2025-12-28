import PlaceablesLayer from "./base/placeables-layer.mjs";
import CanvasAnimation from "../animation/canvas-animation.mjs";
import DialogV2 from "../../applications/api/dialog.mjs";
import SceneControls from "../../applications/ui/scene-controls.mjs";
import TokenDocument from "../../documents/token.mjs";
import Actor from "../../documents/actor.mjs";

/**
 * @import {Rectangle, TokenPlannedMovement} from "../../_types.mjs";
 * @import Token from "../placeables/token.mjs";
 * @import User from "@client/documents/user.mjs";
 */

/**
 * The Tokens Container.
 * @category Canvas
 */
export default class TokenLayer extends PlaceablesLayer {
  constructor() {
    super();

    /**
     * The ruler paths.
     * @type {PIXI.Container}
     * @internal
     */
    this._rulerPaths = new PIXI.Container();
    this._rulerPaths.eventMode = "none";
  }

  /* -------------------------------------------- */

  /**
   * The current index position in the tab cycle
   * @type {number|null}
   * @internal
   */
  _tabIndex = null;

  /* -------------------------------------------- */

  /**
   * The Token that the drag workflow was initiated on, if there's a drag workflow in progress.
   * Set in {@link foundry.canvas.placeables.Token#_onDragLeftStart} and
   * {@link foundry.canvas.placeables.Token#_onDragLeftCancel}.
   * @type {Token|null}
   * @internal
   */
  _draggedToken = null;

  /* -------------------------------------------- */

  /**
   * The currently selected movement action override.
   * @type {string|null}
   * @internal
   */
  _dragMovementAction = null;

  /* -------------------------------------------- */

  /** @inheritdoc */
  static get layerOptions() {
    return foundry.utils.mergeObject(super.layerOptions, {
      name: "tokens",
      controllableObjects: true,
      rotatableObjects: true,
      confirmDeleteKey: true,
      zIndex: 200
    });
  }

  /** @inheritdoc */
  static documentName = "Token";

  /* -------------------------------------------- */

  /**
   * The set of tokens that trigger occlusion (a union of {@link CONST.TOKEN_OCCLUSION_MODES}).
   * @type {number}
   */
  get occlusionMode() {
    return this.#occlusionMode;
  }

  set occlusionMode(value) {
    if ( this.#occlusionMode === value ) return;
    this.#occlusionMode = value;
    canvas.perception.update({refreshOcclusion: true});
  }

  #occlusionMode;

  /* -------------------------------------------- */

  /**
   * Called when the fog is explored.
   * @type {function()}
   */
  #onFogExplored = () => this.recalculatePlannedMovementPaths();

  /* -------------------------------------------- */

  /** @inheritdoc */
  get hookName() {
    return TokenLayer.name;
  }

  /* -------------------------------------------- */
  /*  Properties
  /* -------------------------------------------- */

  /** @override */
  get hud() {
    return canvas.hud.token;
  }

  /**
   * An Array of tokens which belong to actors which are owned
   * @type {Token[]}
   */
  get ownedTokens() {
    return this.placeables.filter(t => t.actor && t.actor.isOwner);
  }

  /**
   * A Set of Token objects which currently display a combat turn marker.
   * @type {Set<Token>}
   */
  turnMarkers = new Set();

  /* -------------------------------------------- */
  /*  Methods
  /* -------------------------------------------- */

  /** @override */
  getSnappedPoint(point) {
    const M = CONST.GRID_SNAPPING_MODES;
    return canvas.grid.getSnappedPoint({x: point.x, y: point.y}, {mode: M.TOP_LEFT_CORNER, resolution: 1});
  }

  /* -------------------------------------------- */

  /** @override */
  _prepareKeyboardMovementUpdates(objects, dx, dy, dz) {
    const updates = [];
    const movement = {};
    for ( const object of objects ) {
      updates.push({_id: object.id});
      const waypoint = object._getShiftedPosition(dx, dy, dz);
      waypoint.action = object._getKeyboardMovementAction();
      waypoint.snapped = !canvas.grid.isGridless;  // Keyboard movement should always be snapped in square/hex grids
      waypoint.explicit = false;                   // Keyboard movement does not explicitly place a waypoint
      waypoint.checkpoint = true;
      movement[object.id] = {waypoints: [waypoint], method: "keyboard"};
    }
    return [updates, {movement}];
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _draw(options) {
    this.addChild(this._rulerPaths);
    await super._draw(options);
    this.objects.visible = true;
    // Reset the Tokens layer occlusion mode for the Scene
    const M = CONST.TOKEN_OCCLUSION_MODES;
    this.#occlusionMode = game.user.isGM ? M.CONTROLLED | M.HOVERED | M.HIGHLIGHTED : M.OWNED;
    canvas.app.ticker.add(this.#animate, this);
    canvas.fog.addEventListener("explored", this.#onFogExplored);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _tearDown(options) {
    this.removeChild(this._rulerPaths);
    this.concludeAnimation();
    canvas.fog.removeEventListener("explored", this.#onFogExplored);
    return super._tearDown(options);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _activate() {
    super._activate();
    if ( canvas.controls ) canvas.controls.doors.visible = true;
    this._tabIndex = null;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _deactivate() {
    super._deactivate();
    this.objects.visible = true;
    if ( canvas.controls ) canvas.controls.doors.visible = false;
  }

  /* -------------------------------------------- */

  /**
   * Target all Token instances which fall within a coordinate rectangle.
   * @param {Rectangle} rectangle                    The selection rectangle.
   * @param {object} [options]                      Additional options to configure targeting behaviour.
   * @param {boolean} [options.releaseOthers=true]  Whether or not to release other targeted tokens
   */
  targetObjects({x, y, width, height}, {releaseOthers=true}={}) {
    const targets = [];
    const rectangle = new PIXI.Rectangle(x, y, width, height);
    for ( const token of this.placeables ) {
      if ( !token.visible || !token.renderable || token.document.isSecret ) continue;
      if ( token._overlapsSelection(rectangle) ) targets.push(token.id);
    }
    return this.setTargets(targets, {mode: releaseOthers ? "replace" : "acquire"});
  }

  /* -------------------------------------------- */

  /**
   * Assign multiple token targets
   * @param {string[]|Set<string>} targetIds    The array or set of Token IDs.
   * @param {object} [options]                  Additional options to configure targeting behaviour.
   * @param {"replace"|"acquire"|"release"} [options.mode="replace"]   The mode that determines the targeting behavior.
   *   - `"replace"` (default): Replace the current set of targeted Tokens with provided set of Tokens.
   *   - `"acquire"`: Acquire the given Tokens as targets without releasing already targeted Tokens.
   *   - `"release"`: Release the given Tokens as targets.
   */
  setTargets(targetIds, {mode="replace"}={}) {
    let targets = new Set();
    if ( mode !== "replace" ) {
      for ( const token of game.user.targets ) targets.add(token.id);
    }
    if ( mode === "release" ) {
      for ( const id of targetIds ) targets.delete(id);
    } else {
      for ( const id of targetIds ) {
        const token = this.get(id);
        if ( token ) targets.add(id);
      }
    }
    targets = Array.from(targets);
    game.user.broadcastActivity({targets});
    game.user._onUpdateTokenTargets(targets);
  }

  /* -------------------------------------------- */

  /**
   * Cycle the controlled token by rotating through the list of Owned Tokens that are available within the Scene
   * Tokens are currently sorted in order of their TokenID
   *
   * @param {boolean} forwards  Which direction to cycle. A truthy value cycles forward, while a false value
   *                            cycles backwards.
   * @param {boolean} reset     Restart the cycle order back at the beginning?
   * @returns {Token|null}       The Token object which was cycled to, or null
   */
  cycleTokens(forwards, reset) {
    let next = null;
    if ( reset ) this._tabIndex = null;
    const order = this.#getCycleOrder();

    // If we are not tab cycling, try and jump to the currently controlled or impersonated token
    if ( this._tabIndex === null ) {
      this._tabIndex = 0;

      // Determine the ideal starting point based on controlled tokens or the primary character
      let current = this.controlled.length ? order.find(t => this.controlled.includes(t)) : null;
      if ( !current && game.user.character ) {
        const actorTokens = game.user.character.getActiveTokens();
        current = actorTokens.length ? order.find(t => actorTokens.includes(t)) : null;
      }
      current = current || order[this._tabIndex] || null;

      // Either start cycling, or cancel
      if ( !current ) return null;
      next = current;
    }

    // Otherwise, cycle forwards or backwards
    else {
      if ( forwards ) this._tabIndex = this._tabIndex < (order.length - 1) ? this._tabIndex + 1 : 0;
      else this._tabIndex = this._tabIndex > 0 ? this._tabIndex - 1 : order.length - 1;
      next = order[this._tabIndex];
      if ( !next ) return null;
    }

    // Pan to the token and control it (if possible)
    canvas.animatePan({x: next.center.x, y: next.center.y, duration: 250});
    next.control();
    return next;
  }

  /* -------------------------------------------- */

  /**
   * Get the tab cycle order for tokens by sorting observable tokens based on their distance from top-left.
   * @returns {Token[]}
   */
  #getCycleOrder() {
    const observable = this.placeables.filter(token => {
      if ( game.user.isGM ) return true;
      if ( !token.actor?.testUserPermission(game.user, "OBSERVER") ) return false;
      return !token.document.hidden;
    });
    observable.sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y));
    return observable;
  }

  /* -------------------------------------------- */

  /**
   * Immediately conclude the animation of any/all tokens
   */
  concludeAnimation() {
    this.placeables.forEach(t => t.stopAnimation());
    canvas.app.ticker.remove(this.#animate, this);
  }

  /* -------------------------------------------- */

  /**
   * Animate.
   * @param {number} deltaTime    The delta time
   */
  #animate(deltaTime) {
    this.#animateTargets();
    this.#animateTurnMarkers(deltaTime);
  }

  /* -------------------------------------------- */

  /**
   * Animate targeting arrows on targeted tokens.
   */
  #animateTargets() {
    if ( !game.user.targets.size ) return;
    if ( this._t === undefined ) this._t = 0;
    else this._t += canvas.app.ticker.elapsedMS;
    const duration = 2000;
    const pause = duration * .6;
    const fade = (duration - pause) * .25;
    const minM = .5; // Minimum margin is half the size of the arrow.
    const maxM = 1; // Maximum margin is the full size of the arrow.
    // The animation starts with the arrows halfway across the token bounds, then move fully inside the bounds.
    const rm = maxM - minM;
    const t = this._t % duration;
    let dt = Math.max(0, t - pause) / (duration - pause);
    dt = CanvasAnimation.easeOutCircle(dt);
    const m = t < pause ? minM : minM + (rm * dt);
    const ta = Math.max(0, t - duration + fade);
    const a = 1 - (ta / fade);
    const config = {margin: m, alpha: a, border: {width: 2 * canvas.dimensions.uiScale}};
    for ( const t of game.user.targets ) t._drawTargetArrows(config);
  }

  /* -------------------------------------------- */

  /**
   * Animate the turn markers.
   * @param {number} deltaTime    The delta time
   */
  #animateTurnMarkers(deltaTime) {
    for ( const token of this.turnMarkers ) token.turnMarker?.animate(deltaTime);
  }

  /* -------------------------------------------- */

  /**
   * Recalculate the planned movement paths of all Tokens for the current User.
   */
  recalculatePlannedMovementPaths() {
    const contexts = this._draggedToken?.mouseInteractionManager.interactionData.contexts;
    if ( !contexts ) return;
    for ( const context of Object.values(contexts) ) context.token.recalculatePlannedMovementPath();
  }

  /* -------------------------------------------- */

  /**
   * Handle broadcast planned movement update.
   * @param {User} user    The User the planned movement data belongs to
   * @param {{[tokenId: string]: TokenPlannedMovement|null} | null} plannedMovements    The planned movement data
   * @internal
   */
  _updatePlannedMovements(user, plannedMovements) {

    // Clear all planned movement of this user
    if ( plannedMovements === null ) {
      for ( const token of this.placeables ) {
        if ( user.id in token._plannedMovement ) {
          delete token._plannedMovement[user.id];
          token.renderFlags.set({refreshRuler: true, refreshState: true});
        }
      }
    }

    // Update planned movement of this user
    else {
      for ( const tokenId in plannedMovements ) {
        const token = this.get(tokenId);
        if ( !token ) continue;
        const plannedMovement = plannedMovements[tokenId];

        // Remove planned movement from this token
        if ( plannedMovement === null ) {
          if ( user.id in token._plannedMovement ) {
            delete token._plannedMovement[user.id];
            token.renderFlags.set({refreshRuler: true, refreshState: true});
          }
        }

        // Update planned movement of this token
        else {
          token.renderFlags.set({refreshRuler: true, refreshState: !(user.id in token._plannedMovement)});
          token._plannedMovement[user.id] = plannedMovement;

          // Impute cost and create terrain data
          for ( const waypoints of [
            plannedMovement.foundPath,
            plannedMovement.unreachableWaypoints,
            plannedMovement.history
          ] ) {
            for ( const waypoint of waypoints ) {
              if ( waypoint.terrain ) waypoint.terrain = CONFIG.Token.movement.TerrainData.fromSource(waypoint.terrain);
              waypoint.cost ??= Infinity;
            }
          }
        }
      }
    }
  }

  /* -------------------------------------------- */

  /**
   * Provide an array of Tokens which are eligible subjects for tile occlusion.
   * By default, only tokens which are currently controlled or owned by a player are included as subjects.
   * @returns {Token[]}
   * @protected
   */
  _getOccludableTokens() {
    const M = CONST.TOKEN_OCCLUSION_MODES;
    const mode = this.occlusionMode;
    if ( (mode & M.VISIBLE) || ((mode & M.HIGHLIGHTED) && this.highlightObjects) ) {
      return this.placeables.filter(t => t.visible);
    }
    const tokens = new Set();
    if ( (mode & M.HOVERED) && this.hover ) tokens.add(this.hover);
    if ( mode & M.CONTROLLED ) this.controlled.forEach(t => tokens.add(t));
    if ( mode & M.OWNED ) this.ownedTokens.filter(t => !t.document.hidden).forEach(t => tokens.add(t));
    return Array.from(tokens);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _getMovableObjects(ids, includeLocked) {
    const tokens = super._getMovableObjects(ids, includeLocked);
    return tokens.filter(token => !token._preventKeyboardMovement);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _getCopyableObjects(options) {
    if ( !game.user.can("TOKEN_CREATE") || (options.cut && !game.user.can("TOKEN_DELETE")) ) return [];
    return super._getCopyableObjects(options);
  }

  /* -------------------------------------------- */

  /** @override */
  storeHistory(type, data, options) {

    // Don't store stop/pause/resume/clear movement updates in the history
    if ( options._stopMovement || options._pauseMovement || options._resumeMovement
      || options._clearMovementHistory ) return;

    const undoOptions = {};
    if ( type === "update" ) {

      // Clean actorData and delta updates from the history so changes to those fields are not undone.
      for ( const d of data ) {
        delete d.actorData;
        delete d.delta;
        delete d._movementHistory;
        delete d._regions;
      }

      // Undo movement
      if ( options._movement ) {
        for ( const d of data ) {
          const movement = options._movement[d._id];
          if ( !movement ) continue;
          for ( const key of TokenDocument.MOVEMENT_FIELDS ) delete d[key];

          // Force teleport the token back to the origin
          undoOptions.movement ??= {};
          undoOptions.movement[d._id] = {waypoints: [{...movement.origin, action: "displace"}], method: "undo"};
          undoOptions.diff = false;
          undoOptions.animate = false;

          // Undo movement history
          if ( movement.recorded ) {
            d._movementHistory = movement.history.recorded.waypoints.map(
              waypoint => ({...waypoint, cost: waypoint.cost === Infinity ? null : waypoint.cost}));
          }
        }
      }
    }

    this._storeHistory(type, data, undoOptions);
  }

  /* -------------------------------------------- */

  /** @override */
  _onCycleViewKey(event) {
    if ( (game.activeTool !== "select") || canvas.controls.ruler.active ) return false;
    if ( this._draggedToken ) this.#cycleDragMovementAction(event.shiftKey);
    else {
      const cycled = this.cycleTokens(!event.shiftKey, false);
      if ( !cycled ) canvas.recenter();
    }
    return true;
  }

  /* -------------------------------------------- */

  /** @override */
  async _confirmDeleteKey(documents) {
    let inCombat = false;
    const tokens = new Set(documents);
    for ( const combat of game.combats ) {
      for ( const combatant of combat.combatants ) {
        if ( tokens.has(combatant.token) ) {
          inCombat = true;
          break;
        }
      }
      if ( inCombat ) break;
    }
    if ( !inCombat ) return true;
    const question = game.i18n.localize("AreYouSure");
    const warning = game.i18n.localize("TOKEN.DeleteCombatantWarning");
    return DialogV2.confirm({
      window: {
        title: game.i18n.format("DOCUMENT.Delete", {type: game.i18n.localize(TokenDocument.metadata.label)}) // FIXME: double localization
      },
      content: `<p><strong>${question}</strong> ${warning}</p>`
    });
  }

  /* -------------------------------------------- */

  /** @override */
  static prepareSceneControls() {
    const sc = SceneControls;
    return {
      name: "tokens",
      order: 1,
      title: "CONTROLS.GroupToken",
      icon: "fa-solid fa-user-large",
      onChange: (event, active) => {
        if ( active ) canvas.tokens.activate();
      },
      onToolChange: () => canvas.tokens.setAllRenderFlags({refreshState: true}),
      tools: {
        select: {
          name: "select",
          order: 1,
          title: "CONTROLS.BasicSelect",
          icon: "fa-solid fa-expand",
          toolclip: {
            src: "toolclips/tools/token-select.webm",
            heading: "CONTROLS.BasicSelect",
            items: sc.buildToolclipItems([
              {paragraph: "CONTROLS.BasicSelectP"},
              "selectAlt", "selectMultiple", "move", "rotate", "hud", "sheet",
              game.user.isGM ? "editAlt" : null,
              game.user.isGM ? "delete" : null,
              {heading: "CONTROLS.RulerPlaceWaypoint", reference: "CONTROLS.CtrlClick"},
              {heading: "CONTROLS.RulerRemoveWaypoint", reference: "CONTROLS.RightClick"}
            ])
          }
        },
        target: {
          name: "target",
          order: 2,
          title: "CONTROLS.TargetSelect",
          icon: "fa-solid fa-bullseye",
          toolclip: {
            src: "toolclips/tools/token-target.webm",
            heading: "CONTROLS.TargetSelect",
            items: sc.buildToolclipItems([
              {paragraph: "CONTROLS.TargetSelectP"}, "selectAlt", "selectMultiple"
            ])
          }
        },
        ruler: {
          name: "ruler",
          order: 3,
          title: "CONTROLS.BasicMeasure",
          icon: "fa-solid fa-ruler",
          toolclip: {
            heading: "CONTROLS.BasicMeasure",
            items: sc.buildToolclipItems([
              {heading: "CONTROLS.RulerPlaceWaypoint", reference: "CONTROLS.CtrlClick"},
              {heading: "CONTROLS.RulerRemoveWaypoint", reference: "CONTROLS.RightClick"}
            ])
          }
        },
        unconstrainedMovement: {
          name: "unconstrainedMovement",
          order: 4,
          title: "CONTROLS.UnconstrainedMovement",
          icon: "fa-solid fa-ghost",
          toggle: true,
          active: game.settings.get("core", "unconstrainedMovement"),
          visible: game.user.isGM,
          onChange: (event, toggled) => {
            game.settings.set("core", "unconstrainedMovement", toggled);
          },
          toolclip: {
            heading: "CONTROLS.UnconstrainedMovement",
            items: sc.buildToolclipItems([
              {paragraph: "CONTROLS.UnconstrainedMovementP"}
            ])
          }
        }
      },
      activeTool: "select"
    };
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _highlightObjects(active) {
    super._highlightObjects(active);
    if ( this.occlusionMode & CONST.TOKEN_OCCLUSION_MODES.HIGHLIGHTED ) {
      canvas.perception.update({refreshOcclusion: true});
    }
  }

  /* -------------------------------------------- */

  /**
   * Cycle the drag movement action override.
   * @param {boolean} reverse
   */
  #cycleDragMovementAction(reverse) {
    const token = this._draggedToken.document;
    const currentAction = token.movementAction;
    const actions = Object.entries(CONFIG.Token.movement.actions).reduce((actions, [action, {canSelect}]) => {
      if ( canSelect(token) || (action === currentAction) ) actions.push(action);
      return actions;
    }, []);
    const current = actions.indexOf(this._dragMovementAction ?? token.movementAction);
    if ( current < 0 ) this._dragMovementAction = actions[0];
    else {
      const next = (current + (reverse ? -1 : 1) + actions.length) % actions.length;
      this._dragMovementAction = actions[next];
    }
    this.recalculatePlannedMovementPaths();
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /**
   * Handle dropping of Actor data onto the Scene canvas
   * @param {DragEvent} event
   * @param {{type: "Actor"; uuid: string; x: number; y: number; elevation?: number}} data
   * @internal
   */
  async _onDropActorData(event, data) {

    // Ensure the user has permission to drop the actor and create a Token
    if ( !game.user.can("TOKEN_CREATE") ) {
      return ui.notifications.warn("You do not have permission to create new Tokens!");
    }

    // Validate the drop position
    if ( !canvas.dimensions.rect.contains(data.x, data.y) ) return false;

    // Acquire dropped data and import the actor
    let actor = await Actor.implementation.fromDropData(data);
    if ( !actor.isOwner ) {
      return ui.notifications.warn(`You do not have permission to create a new Token for the ${actor.name} Actor.`);
    }
    if ( actor.inCompendium ) {
      const actorData = game.actors.fromCompendium(actor);
      actor = await Actor.implementation.create(actorData, {fromCompendium: true});
    }

    // Prepare the Token document
    const token = await actor.getTokenDocument({
      hidden: game.user.isGM && event.altKey,
      sort: Math.max(this.getMaxSort() + 1, 0)
    }, {parent: canvas.scene});

    // Set the position of the Token such that its center point is the drop position before snapping
    const position = CONFIG.Token.objectClass._getDropActorPosition(token, {x: data.x, y: data.y,
      elevation: data.elevation}, {snap: !event.shiftKey});
    token.updateSource(position);

    // Submit the Token creation request and activate the Tokens layer (if not already active)
    this.activate();
    return token.constructor.create(token, {parent: canvas.scene});
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onClickLeft(event) {

    // If a token is being dragged, delegate to this token
    if ( this._draggedToken ) return this._draggedToken._onDragClickLeft(event);
    let tool = game.activeTool;

    // If Control is being held, we always want the Tool to be Ruler
    const ruler = canvas.controls.ruler;
    if ( ruler.active ) return ruler._onClickLeft(event);
    if ( CONFIG.Canvas.rulerClass.canMeasure ) tool = "ruler";

    // Tool-specific handling
    switch ( tool ) {
      case "target":
        // Clear targets if Left Click Release is set
        if ( game.settings.get("core", "leftClickRelease") ) {
          game.user._onUpdateTokenTargets([]);
          game.user.broadcastActivity({targets: []});
        }
        break;

      // Prevent default behavior with the Ruler tool
      case "ruler": return;
    }

    // If we don't explicitly return from handling the tool, use the default behavior
    super._onClickLeft(event);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onClickLeft2(event) {

    // If a token is being dragged, delegate to this token
    if ( this._draggedToken ) return this._draggedToken._onDragClickLeft2(event);

    // Otherwise handle the event normally
    super._onClickLeft2(event);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onClickRight(event) {

    // If a token is being dragged, delegate to this token
    if ( this._draggedToken ) return this._draggedToken._onDragClickRight(event);

    // Otherwise handle the event normally
    super._onClickRight(event);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onClickRight2(event) {

    // If a token is being dragged, delegate to this token
    if ( this._draggedToken ) return this._draggedToken._onDragClickRight2(event);

    // Otherwise handle the event normally
    super._onClickRight2(event);
  }

  /* -------------------------------------------- */

  /** @override */
  _onDragLeftCancel(event) {
    // Override so that previews are not cleared
  }

  /* -------------------------------------------- */

  /** @override */
  _onMouseWheel(event) {

    // Prevent wheel rotation during dragging
    if ( this.preview.children.length ) return;

    // Determine the incremental angle of rotation from event data
    const snap = canvas.grid.isHexagonal ? (event.shiftKey ? 60 : 30) : (event.shiftKey ? 45 : 15);
    const delta = snap * Math.sign(event.delta);
    return this.rotateMany({delta, snap});
  }

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  get gridPrecision() {
    // eslint-disable-next-line no-unused-expressions
    super.gridPrecision;
    return 1; // Snap tokens to top-left
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  async toggleCombat(state=true, combat=null, {token=null}={}) {
    foundry.utils.logCompatibilityWarning("TokenLayer#toggleCombat is deprecated in favor of"
      + " TokenDocument.implementation.createCombatants and TokenDocument.implementation.deleteCombatants", {since: 12, until: 14});
    const tokens = this.controlled.map(t => t.document);
    if ( token && !token.controlled && (token.inCombat !== state) ) tokens.push(token.document);
    if ( state ) return TokenDocument.implementation.createCombatants(tokens, {combat});
    else return TokenDocument.implementation.deleteCombatants(tokens, {combat});
  }
}

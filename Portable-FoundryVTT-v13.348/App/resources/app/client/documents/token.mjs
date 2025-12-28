import BaseToken from "@common/documents/token.mjs";
import CanvasDocumentMixin from "./abstract/canvas-document.mjs";
import BaseScene from "@common/documents/scene.mjs";
import {TOKEN_SHAPES, REGION_EVENTS, TOKEN_DISPOSITIONS} from "@common/constants.mjs";
import Hooks from "../helpers/hooks.mjs";

/**
 * @import {DeepReadonly, ElevatedPoint, TokenConstrainMovementPathOptions} from "../_types.mjs";
 * @import {RegionEventType, TokenShapeType} from "@common/constants.mjs";
 * @import {
 *   TokenCompleteMovementWaypoint, TokenGetCompleteMovementPathWaypoint, TokenMeasuredMovementWaypoint,
 *   TokenMeasureMovementPathWaypoint, TokenResumeMovementCallback, TokenMovementContinuationData,
 *   TokenMovementCostFunction, TokenMovementData, TokenMovementOperation, TokenMovementSegmentData,
 *   TokenMovementWaypoint, TokenRegionMovementSegment, TokenSegmentizeMovementWaypoint,
 *   TrackedAttributesDescription, TokenMovementContinuationHandle, TokenMovementMethod,
 TokenMovementCostAggregator
 * } from "./_types.mjs";
 * @import {TokenData, TokenDimensions, TokenPosition} from "@common/documents/_types.mjs";
 * @import {Actor, Combat, Combatant, RegionDocument, User} from "./_module.mjs";
 * @import {DatabaseOperation, DatabaseUpdateOperation} from "@common/abstract/_types.mjs".
 * @import Collection from "@common/utils/collection.mjs";
 * @import DataModel from "@common/abstract/data.mjs";
 * @import {SchemaField} from "@common/data/fields.mjs";
 * @import {BaseGrid, HexagonalGrid} from "@common/grid/_module.mjs";
 * @import {GridMeasurePathResult, GridMeasurePathWaypointData3D} from "@common/grid/_types.mjs";
 */

/**
 * The client-side Token document which extends the common BaseToken document model.
 *
 * The following fields must no be altered from source during data preparation:
 * `x`, `y`, `elevation`, `width`, `height`, `shape`.
 *
 * ### Hook Events
 * - {@link hookEvents.moveToken}
 * - {@link hookEvents.pauseToken}
 * - {@link hookEvents.preMoveToken}
 * - {@link hookEvents.stopToken}
 *
 * @extends BaseToken
 * @mixes CanvasDocumentMixin
 * @category Documents
 *
 * @see {@link foundry.documents.Scene}: The Scene document type which contains Token documents
 * @see {@link foundry.applications.sheets.TokenConfig}: The Token configuration application
 */
export default class TokenDocument extends CanvasDocumentMixin(BaseToken) {

  /**
   * The current movement data of this Token document.
   * @type {DeepReadonly<TokenMovementData>}
   */
  get movement() {
    if ( this.#movement ) return this.#movement;
    const {x, y, elevation, width, height, shape} = this._source;
    return foundry.utils.deepFreeze({
      id: "",
      chain: [],
      origin: {x, y, elevation, width, height, shape},
      destination: {x, y, elevation, width, height, shape},
      passed: {waypoints: [], distance: 0, cost: 0, spaces: 0, diagonals: 0},
      pending: {waypoints: [], distance: 0, cost: 0, spaces: 0, diagonals: 0},
      history: {
        recorded: {waypoints: [], distance: 0, cost: 0, spaces: 0, diagonals: 0},
        unrecorded: {waypoints: [], distance: 0, cost: 0, spaces: 0, diagonals: 0},
        distance: 0, cost: 0, spaces: 0, diagonals: 0
      },
      recorded: false,
      method: "api",
      constrainOptions: {},
      autoRotate: false,
      showRuler: false,
      user: game.user,
      state: "completed",
      updateOptions: {}
    });
  }

  #movement;

  /* -------------------------------------------- */

  /**
   * The movement continuation state of this Token document.
   * @type {TokenMovementContinuationData}
   * @internal
   */
  _movementContinuation = {
    movementId: "",
    continueCounter: 0,
    continued: false,
    continuePromise: Promise.resolve(false),
    waitPromise: Promise.resolve(),
    resolveWaitPromise: undefined,
    postWorkflowPromise: Promise.resolve(),
    states: {}
  };

  /* -------------------------------------------- */

  /**
   * The list of movement operation properties that are writeable in preUpdateMovement.
   * @type {string[]}
   */
  static #WRITEABLE_MOVEMENT_OPERATION_PROPERTIES = ["autoRotate", "showRuler"];


  /* -------------------------------------------- */

  /**
   * Infer the subject texture path if one is existing.
   * @param {string} src        The path to test.
   * @returns {string|null}     The inferred path, or null otherwise.
   */
  static #inferSubjectTexture(src) {
    if ( !src ) return null;
    for ( const [prefix, replacement] of Object.entries(CONFIG.Token.ring.subjectPaths) ) {
      if ( src.startsWith(prefix) ) return src.replace(prefix, replacement);
    }
    return null;
  }

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * A singleton collection which holds a reference to the synthetic token actor by its base actor's ID.
   * @type {Collection<string, Actor>}
   */
  actors = (function() {
    const collection = new foundry.utils.Collection();
    collection.documentClass = foundry.documents.Actor.implementation;
    return collection;
  })();

  /* -------------------------------------------- */

  /**
   * A reference to the Actor this Token modifies.
   * If actorLink is true, then the document is the primary Actor document.
   * Otherwise, the Actor document is a synthetic (ephemeral) document constructed using the Token's ActorDelta.
   * @returns {Actor|null}
   */
  get actor() {
    return (this.isLinked ? this.baseActor : this.delta?.syntheticActor) ?? null;
  }

  /* -------------------------------------------- */

  /**
   * A reference to the base, World-level Actor this token represents.
   * @returns {Actor|null}
   */
  get baseActor() {
    return game.actors.get(this.actorId) ?? null;
  }

  /* -------------------------------------------- */

  /**
   * An indicator for whether the current User has full control over this Token document.
   * @type {boolean}
   */
  get isOwner() {
    if ( game.user.isGM ) return true;
    if ( this.inCompendium ) return super.isOwner;
    return this.actor?.isOwner ?? false;
  }

  /* -------------------------------------------- */

  /**
   * A convenient reference for whether this TokenDocument is linked to the Actor it represents, or is a synthetic copy
   * @type {boolean}
   */
  get isLinked() {
    return this.actorLink;
  }

  /* -------------------------------------------- */

  /**
   * Does this TokenDocument have the SECRET disposition and is the current user lacking the necessary permissions
   * that would reveal this secret?
   * @type {boolean}
   */
  get isSecret() {
    return (this.disposition === TOKEN_DISPOSITIONS.SECRET) && !this.testUserPermission(game.user, "OBSERVER");
  }

  /* -------------------------------------------- */

  /**
   * Return a reference to a Combatant that represents this Token, if one is present in the current encounter.
   * @type {Combatant|null}
   */
  get combatant() {
    return game.combat?.combatants.find(c => c.tokenId === this.id) || null;
  }

  /* -------------------------------------------- */

  /**
   * An indicator for whether this Token is currently involved in the active combat encounter.
   * @type {boolean}
   */
  get inCombat() {
    return !!this.combatant;
  }

  /* -------------------------------------------- */

  /**
   * The movement history.
   * @type {TokenMeasuredMovementWaypoint[]}
   */
  get movementHistory() {
    return this._movementHistory;
  }

  /* -------------------------------------------- */

  /**
   * Check if the document has a distinct subject texture (inferred or explicit).
   * @type {boolean}
   */
  get hasDistinctSubjectTexture() {
    if ( this._source.ring?.subject.texture ) return true;
    return !!TokenDocument.#inferSubjectTexture(this.texture.src);
  }

  /* -------------------------------------------- */

  /**
   * The Regions this Token is currently in.
   * @type {Set<RegionDocument>}
   */
  regions = game._documentsReady ? new Set() : null;

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _initializeSource(data, options) {
    data.shape ??= ((this.parent?.grid ?? BaseScene.defaultGrid).isHexagonal
      ? TOKEN_SHAPES.ELLIPSE_1 : TOKEN_SHAPES.RECTANGLE_1);
    if ( (typeof data.movementAction === "string") && !(data.movementAction in CONFIG.Token.movement.actions) ) {
      data.movementAction = null;
    }
    return super._initializeSource(data, options);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _initialize(options = {}) {
    super._initialize(options);
    this.baseActor?._registerDependentToken(this);
  }

  /* -------------------------------------------- */

  /** @override */
  prepareBaseData() {

    // Initialize regions
    if ( this.regions === null ) {
      this.regions = new Set();
      if ( !this.parent ) return;
      for ( const id of this._source._regions ) {
        const region = this.parent.regions.get(id);
        if ( !region ) continue;
        this.regions.add(region);
        region.tokens.add(this);
      }
    }

    this.name ||= this.actor?.name || "Unknown";
    if ( this.hidden ) this.alpha = Math.min(this.alpha, game.user.isGM ? 0.5 : 0);
    this._movementHistory.forEach(waypoint => waypoint.cost ??= Infinity);
    this.sight.range ??= Infinity;
    this._prepareDetectionModes();
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  prepareEmbeddedDocuments() {
    if ( game._documentsReady && !this._source.delta ) this.updateSource({ delta: { _id: this.id } });
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  prepareDerivedData() {
    if ( this.ring.enabled && !this.ring.subject.texture ) {
      this.ring.subject.texture = this._inferRingSubjectTexture();
    }
    this.movementAction ??= this._inferMovementAction();
  }

  /* -------------------------------------------- */

  /**
   * Infer the subject texture path to use for a token ring.
   * @returns {string}
   * @protected
   */
  _inferRingSubjectTexture() {
    const tex = this.texture.src;
    return TokenDocument.#inferSubjectTexture(tex) ?? tex;
  }

  /* -------------------------------------------- */

  /**
   * Infer the movement action.
   * The default implementation returns `CONFIG.Token.movement.defaultAction`.
   * @returns {string}
   * @protected
   */
  _inferMovementAction() {
    return CONFIG.Token.movement.defaultAction;
  }

  /* -------------------------------------------- */

  /**
   * Prepare detection modes which are available to the Token.
   * Ensure that every Token has the basic sight detection mode configured.
   * @protected
   */
  _prepareDetectionModes() {
    for ( const mode of this.detectionModes ) mode.range ??= Infinity;
    if ( !this.sight.enabled ) return;
    const lightMode = this.detectionModes.find(m => m.id === "lightPerception");
    if ( !lightMode ) this.detectionModes.push({id: "lightPerception", enabled: true, range: Infinity});
    const basicMode = this.detectionModes.find(m => m.id === "basicSight");
    if ( !basicMode ) this.detectionModes.push({id: "basicSight", enabled: true, range: this.sight.range});
  }

  /* -------------------------------------------- */

  /**
   * A helper method to retrieve the underlying data behind one of the Token's attribute bars
   * @param {string} barName                The named bar to retrieve the attribute for
   * @param {object} [options]
   * @param {string} [options.alternative]  An alternative attribute path to get instead of the default one
   * @returns {object|null}                 The attribute displayed on the Token bar, if any
   */
  getBarAttribute(barName, {alternative}={}) {
    const attribute = alternative || this[barName]?.attribute;
    if ( !attribute || !this.actor ) return null;
    const system = this.actor.system;
    const isSystemDataModel = system instanceof foundry.abstract.DataModel;
    const templateModel = game.model.Actor[this.actor.type];

    // Get the current attribute value
    const data = foundry.utils.getProperty(system, attribute);
    if ( (data === null) || (data === undefined) ) return null;

    // Single values
    if ( Number.isNumeric(data) ) {
      let editable = foundry.utils.hasProperty(templateModel, attribute);
      if ( isSystemDataModel ) {
        const field = system.schema.getField(attribute);
        if ( field ) editable = field instanceof foundry.data.fields.NumberField;
      }
      return {type: "value", attribute, value: Number(data), editable};
    }

    // Attribute objects
    else if ( ("value" in data) && ("max" in data) ) {
      let editable = foundry.utils.hasProperty(templateModel, `${attribute}.value`);
      if ( isSystemDataModel ) {
        const field = system.schema.getField(`${attribute}.value`);
        if ( field ) editable = field instanceof foundry.data.fields.NumberField;
      }
      return {type: "bar", attribute, value: parseInt(data.value || 0), max: parseInt(data.max || 0), editable};
    }

    // Otherwise null
    return null;
  }

  /* -------------------------------------------- */

  /**
   * Test whether a Token has a specific status effect.
   * @param {string} statusId     The status effect ID as defined in CONFIG.statusEffects
   * @returns {boolean}           Does the Actor of the Token have this status effect?
   */
  hasStatusEffect(statusId) {
    return this.actor?.statuses.has(statusId) ?? false;
  }

  /* -------------------------------------------- */

  /**
   * Move the Token through the given waypoint(s).
   * @param {Partial<TokenMovementWaypoint> | Partial<TokenMovementWaypoint>[]} waypoints
   *                                       The waypoint(s) to move the Token through
   * @param {Partial<Omit<DatabaseUpdateOperation, "updates"> & {method: TokenMovementMethod;
   *   autoRotate: boolean; showRuler: boolean, constrainOptions: Omit<TokenConstrainMovementPathOptions,
   *   "preview"|"history">}>} [options]    Parameters of the update operation
   * @returns {Promise<boolean>}    A Promise that resolves to true if the Token was moved, otherwise resolves to false
   */
  async move(waypoints, {method, constrainOptions, autoRotate, showRuler, ...options}={}) {
    if ( !Array.isArray(waypoints) ) waypoints = [waypoints];
    else if ( waypoints.length === 0 ) return false;
    const args = {result: false};
    const updated = await this.update({}, {...options, movement: {[this.id]: {waypoints, method, constrainOptions,
      autoRotate, showRuler}}, _movementArguments: args});
    return args.result && !!updated;
  }

  /* -------------------------------------------- */

  /**
   * Undo all recorded movement or the recorded movement corresponding to given movement ID up to the last movement.
   * The token is displaced to the prior recorded position and the movement history it rolled back accordingly.
   * @overload
   * @param {string} [movementId]    The ID of the recorded movement to undo
   * @returns {Promise<boolean>}     True if the movement was undone, otherwise false
   */
  async revertRecordedMovement(movementId) {
    const history = this._source._movementHistory;
    if ( history.length === 0 ) return false;
    movementId ??= history.at(0).movementId;
    const index = history.findIndex(waypoint => waypoint.movementId === movementId);
    if ( index < 0 ) return false;
    const {x, y, elevation, width, height, shape} = history[Math.max(index - 1, 0)];
    const args = {result: false};
    const updated = await this.update({x, y, elevation, width, height, shape,
      _movementHistory: history.slice(0, index)}, {isUndo: true, diff: false, animate: false,
      _movementArguments: args});
    return args.result && !!updated;
  }

  /* -------------------------------------------- */

  /**
   * Resize the token Token such that its center point remains (almost) unchanged. The center point might change
   * slightly because the new (x, y) position is rounded.
   * @param {Partial<TokenDimensions>} dimensions                            The new dimensions
   * @param {Partial<Omit<DatabaseUpdateOperation, "updates">>} [options]    Parameters of the update operation
   * @returns {Promise<boolean>}  A Promise that resolves to true if the Token was resized, otherwise resolves to false
   */
  async resize({width, height, shape}, options) {
    width ??= this._source.width;
    height ??= this._source.height;
    shape ??= this._source.shape;
    const center = this.getCenterPoint(this._source);
    const pivot = this.getCenterPoint({x: 0, y: 0, elevation: 0, width, height, shape});
    const x = Math.round(center.x - pivot.x);
    const y = Math.round(center.y - pivot.y);
    const elevation = center.elevation - pivot.elevation;
    return this.move({x, y, elevation, width, height, shape, action: this.movementAction,
      snapped: false, explicit: false, checkpoint: true}, {...options,
      constrainOptions: {ignoreWalls: true, ignoreCost: true}, autoRotate: false, showRuler: false});
  }

  /* -------------------------------------------- */

  /**
   * Stop the movement of this Token document. The movement cannot be continued after being stopped.
   * Only the User that initiated the movement can stop it.
   * @returns {boolean}    True if the movement was or is stopped, otherwise false
   */
  stopMovement() {
    return this.#stopMovement(true);
  }

  /* -------------------------------------------- */

  /**
   * This function is called on Token documents that are still being moved by a User that just disconnected.
   * @internal
   */
  _stopMovementOnDisconnect() {
    if ( this.movement.user.active ) throw new Error("The User is still connected.");
    this.#stopMovement(false);
  }

  /* -------------------------------------------- */

  /**
   * Stop the movement of this Token document.
   * @param {boolean|Promise<*>} broadcast    Broadcast now? Or broadcast after promise.
   * @returns {boolean}                       True if the movement was or is stopped, otherwise false.
   */
  #stopMovement(broadcast) {
    if ( broadcast && !this.movement.user.isSelf ) throw new Error("Only the User that initiated the movement can stop it.");
    if ( this.movement.state === "stopped" ) return true;
    if ( this.movement.state === "completed" ) return false;
    this.#resetMovementContinuation();
    this.movement.user.movingTokens.delete(this);
    this.#movement = Object.freeze({...this.movement, state: "stopped", pending: Object.freeze({waypoints: Object.freeze([]),
      distance: 0, cost: 0, spaces: 0, diagonals: 0})});
    this._onMovementStopped();
    Hooks.callAll("stopToken", this);
    const movementId = this.movement.id;
    if ( broadcast instanceof Promise ) {
      broadcast.finally(() => this.update({}, {diff: false, noHook: true, _stopMovement: movementId}));
    }
    else if ( broadcast ) this.update({}, {diff: false, noHook: true, _stopMovement: movementId});
    return true;
  }

  /* -------------------------------------------- */

  /**
   * Pause the movement of this Token document. The movement can be resumed after being paused.
   * Only the User that initiated the movement can pause it.
   * Returns a callback that can be used to resume the movement later.
   * Only after all callbacks and keys have been called the movement of the Token is resumed.
   * If the callback is called within the update operation workflow, the movement is resumed after the workflow.
   * @overload
   * @returns {TokenResumeMovementCallback|null}  The callback to resume movement if the movement was or is paused,
   *                                              otherwise null
   * @example
   * ```js
   * // This is an Execute Script Region Behavior that makes the token invisible
   * // On TOKEN_MOVE_IN...
   * if ( !event.user.isSelf ) return;
   * const resumeMovement = event.data.token.pauseMovement();
   * event.data.token.toggleStatusEffect("invisible", {active: true});
   * const resumed = await resumeMovement();
   * ```
   */
  /**
   * Pause the movement of this Token document. The movement can be resumed after being paused.
   * Only the User that initiated the movement can pause it.
   * Returns a promise that resolves to true if the movement was resumed by
   * {@link TokenDocument#resumeMovement} with the same key that was passed to this function.
   * Only after all callbacks and keys have been called the movement of the Token is resumed.
   * If the callback is called within the update operation workflow, the movement is resumed after the workflow.
   * @overload
   * @param {string} key               The key to resume movement with {@link TokenDocument#resumeMovement}
   * @returns {Promise<boolean>|null}  The continuation promise if the movement was paused, otherwise null
   * @example
   * ```js
   * // This is an Execute Script Region Behavior of a pressure plate that activates a trap
   * // On TOKEN_MOVE_IN...
   * if ( event.user.isSelf ) {
   *   event.data.token.pauseMovement(this.parent.uuid);
   * }
   * if ( game.user.isActiveGM ) {
   *   const trapUuid; // The Region Behavior UUID of the trap
   *   const trapBehavior = await fromUuid(trapUuid);
   *   await trapBehavior.update({disabled: false});
   *   event.data.token.resumeMovement(event.data.movement.id, this.parent.uuid);
   * }
   * ```
   */
  pauseMovement(key) {
    const paused = this.#pauseMovement(true);
    if ( !paused ) return null;

    // Create or get continuation callback/promise
    const continuation = this._movementContinuation;
    if ( continuation.continued ) return null;
    continuation.continueCounter++;
    const movementId = this.movement.id;
    const state = continuation.states[movementId] ??= {handles: new Map(), callbacks: [], pending: new Set()};
    /** @type {TokenMovementContinuationHandle} */
    const handle = {movementId, callback: undefined, promise: undefined};
    if ( state.handles.has(key) ) {
      throw new Error(`TokenDocument#pauseMovement was already called with key "${key}" for the current movement`);
    }
    state.handles.set(key ?? Symbol(""), handle);
    const callback = async () => {
      if ( handle.continuePromise ) return handle.continuePromise;
      await continuation.postWorkflowPromise;
      if ( handle.continuePromise ) return handle.continuePromise;
      continuation.continueCounter--;
      if ( continuation.continueCounter !== 0 ) {
        if ( continuation.movementId === handle.movementId ) {
          return handle.continuePromise = continuation.continuePromise;
        }
        return handle.continuePromise = new Promise(resolve => {
          continuation.states[handle.movementId].callbacks.push(resolve);
        });
      }
      return handle.continuePromise = this.#continueMovement(handle.movementId);
    };
    if ( key === undefined ) return handle.callback = callback;
    const promise = new Promise((resolve, reject) => {
      handle.callback = () => callback().then(resolve).catch(reject);
    });
    if ( state.pending.delete(key) ) handle.callback();
    return promise;
  }

  /* -------------------------------------------- */

  /**
   * Pause the movement of this Token document.
   * @param {boolean} broadcast    Broadcast?
   * @returns {boolean}            True if the movement was or is paused, otherwise false.
   */
  #pauseMovement(broadcast) {
    if ( broadcast && !this.movement.user.isSelf ) throw new Error("Only the User that initiated the movement can pause it.");
    if ( this.movement.state === "paused" ) return true;
    if ( this.movement.state !== "pending") return false;
    this.#movement = Object.freeze({...this.movement, state: "paused"});
    this._onMovementPaused();
    Hooks.callAll("pauseToken", this);
    if ( broadcast ) this.update({}, {diff: false, noHook: true, _pauseMovement: this.movement.id});
    return true;
  }

  /* -------------------------------------------- */

  /**
   * Resume the movement given its ID and the key that was passed to {@link TokenDocument#pauseMovement}.
   * @param {string} movementId    The movement ID
   * @param {string} key           The key that was passed to {@link TokenDocument#pauseMovement}
   */
  resumeMovement(movementId, key) {
    if ( this.movement.user.isSelf ) {
      const continuation = this._movementContinuation;
      let state = continuation.states[movementId];
      if ( !state ) {
        if ( this.movement.id !== movementId ) return;
        if ( this.movement.state !== "pending" ) return;
        state = {handles: new Map(), callbacks: [], pending: new Set()};
        continuation.states[movementId] = state;
      }
      const handle = state.handles.get(key);
      if ( handle ) handle.callback();
      else state.pending.add(key);
    }
    else this.update({}, {diff: false, noHook: true, _resumeMovement: [movementId, key]});
  }

  /* -------------------------------------------- */

  /**
   * Continue the movement of this Token document after the current movement animation of the Token is completed.
   * The movement is not continued if the Token's positional state is different from the state associated
   * with the given movement ID.
   * @param {string} movementId     The movement ID
   * @returns {Promise<boolean>}    True if the movement was continued, otherwise false
   */
  async #continueMovement(movementId) {
    const continuation = this._movementContinuation;

    // Check whether the token movement is still in the position we expect it to be
    if ( this.movement.id !== movementId ) return this.#resolveMovementContinuation(movementId, false);

    // Don't continue movement twice
    if ( continuation.continuePromise ) {
      if ( continuation.movementId !== movementId ) {
        continuation.movementId = movementId;
        continuation.continuePromise = null;
        continuation.continuePromise = this.#continueMovement(movementId);
      }
      return continuation.continuePromise;
    }

    // Wait for the movement animation to finish first
    await continuation.waitPromise;

    // Check whether the token movement is still in the position we expect it to be
    if ( this.movement.id !== movementId ) return this.#resolveMovementContinuation(movementId, false);

    // We are continuing the movement
    continuation.continued = true;

    // Check whether the token's movement was stopped
    if ( this.movement.state === "stopped" ) return this.#resolveMovementContinuation(movementId, false);

    // Check whether the token document was deleted
    if ( this.parent?.tokens.get(this.id) !== this ) return this.#resolveMovementContinuation(movementId, false);

    // Continue token movement
    const waypoints = this.movement.pending.waypoints.filter(waypoint => !waypoint.intermediate);
    const {method, autoRotate, showRuler, constrainOptions} = this.movement;
    const updateOptions = foundry.utils.deepClone(this.movement.updateOptions);
    updateOptions.movement = {[this.id]: {waypoints, method, constrainOptions, autoRotate, showRuler}};
    const args = {result: false, movementId: movementId, unrecorded: null,
      chain: [...this.movement.chain, this.movement.id]};
    if ( !this.movement.recorded ) {
      args.unrecorded = this.movement.history.unrecorded.waypoints.concat(this.movement.passed.waypoints);
    }
    updateOptions._movementArguments = args;
    const updated = await this.update({}, updateOptions);
    return this.#resolveMovementContinuation(movementId, args.result && !!updated);
  }

  /* -------------------------------------------- */

  /**
   * Resolve the movement continuation.
   * @param {string} movementId     The movement ID
   * @param {boolean} result        True if the movement was continued, otherwise false
   * @returns {boolean}             The result that was passed
   */
  #resolveMovementContinuation(movementId, result) {
    const continuation = this._movementContinuation;
    const state = continuation.states[movementId];
    if ( !state ) return result;
    delete continuation.states[movementId];
    for ( const handle of state.handles.values() ) handle.continuePromise ??= Promise.resolve(result);
    for ( const callback of state.callbacks ) callback(result);
    return result;
  }

  /* -------------------------------------------- */

  /**
   * Reset the movement continuation.
   */
  #resetMovementContinuation() {
    const continuation = this._movementContinuation;
    if ( continuation.continued ) continuation.continued = false;
    else if ( continuation.movementId ) this.#resolveMovementContinuation(continuation.movementId, false);
    continuation.continueCounter = 0;
    continuation.resolveWaitPromise?.();
    continuation.resolveWaitPromise = undefined;
  }

  /* -------------------------------------------- */

  /**
   * Measure the movement path for this Token.
   * @param {TokenMeasureMovementPathWaypoint[]} waypoints     The waypoints of movement
   * @param {object} [options]                                 Additional measurement options
   * @param {TokenMovementCostFunction} [options.cost]         The function that returns the cost
   *   for a given move between grid spaces (default is the distance travelled along the direct path)
   * @param {TokenMovementCostAggregator} [options.aggregator] The cost aggregator.
   *                                                           Default: `CONFIG.Token.movement.costAggregator`.
   * @returns {GridMeasurePathResult}
   */
  measureMovementPath(waypoints, {cost, aggregator}={}) {
    aggregator ??= CONFIG.Token.movement.costAggregator;
    const grid = this.parent?.grid ?? foundry.documents.BaseScene.defaultGrid;
    const path = [];
    let {x: previousX, y: previousY, elevation: previousElevation,
      width: previousWidth, height: previousHeight, shape: previousShape} = this._source;
    let previousAction = this.movementAction;
    let anchorX;
    let anchorY;

    // Create the path for measurement
    for ( let i = 0; i < waypoints.length; i++ ) {
      let {x=previousX, y=previousY, elevation=previousElevation, width=previousWidth,
        height=previousHeight, shape=previousShape, action=previousAction, terrain=null, cost: c} = waypoints[i];
      x = Math.round(x);
      y = Math.round(y);
      const waypoint = {x, y, elevation, width, height, shape};

      // If in snapped position, use the exact instead of rounded snapped position to prevent measurement inaccuracies
      const snapped = this.getSnappedPosition(waypoint);
      if ( (Math.round(snapped.x) === waypoint.x) && (Math.round(snapped.y) === waypoint.y) ) {
        waypoint.x = snapped.x;
        waypoint.y = snapped.y;
      }

      // Calculate the anchor
      if ( grid.isGridless ) {
        anchorX = 0;
        anchorY = 0;
      } else if ( grid.isSquare ) {
        anchorX = grid.size * (Number.isInteger(width) ? 0.5 : 0.25);
        anchorY = grid.size * (Number.isInteger(height) ? 0.5 : 0.25);
      } else {
        const {anchor} = BaseToken._getHexagonalOffsets(width, height, shape, grid.columns);
        anchorX = grid.sizeX * anchor.x;
        anchorY = grid.sizeY * anchor.y;
      }

      const resize = (i > 0) && ((width !== previousWidth) || (height !== previousHeight) || (shape !== previousShape));
      if ( resize ) {
        const pivot = this.getCenterPoint({x: 0, y: 0, elevation: 0, width, height, shape});
        const center = this.getCenterPoint({x: previousX, y: previousY, elevation: previousElevation,
          width: previousWidth, height: previousHeight, shape: previousShape});
        const waypoint = {x: Math.round(center.x - pivot.x), y: Math.round(center.y - pivot.y),
          elevation: center.elevation - pivot.elevation, width, height, shape};
        const snapped = this.getSnappedPosition(waypoint);
        if ( (Math.round(snapped.x) === waypoint.x) && (Math.round(snapped.y) === waypoint.y) ) {
          waypoint.x = snapped.x;
          waypoint.y = snapped.y;
        }
        waypoint.x += anchorX;
        waypoint.y += anchorY;
        waypoint.action = undefined; // Identify resize segments by undefined action
        waypoint.measure = false; // Resizing segments are not measured
        path.push(waypoint);
      }

      // Measure between anchor points, which lie in the top-left grid offset of the token at this position
      waypoint.x += anchorX;
      waypoint.y += anchorY;
      waypoint.action = action;
      const actionConfig = CONFIG.Token.movement.actions[action] ?? CONFIG.Token.movement.actions.displace;
      waypoint.actionConfig = actionConfig;
      waypoint.teleport = actionConfig.teleport;
      waypoint.measure = actionConfig.measure;
      waypoint.terrain = terrain;
      // TODO: optimize (use the same function for same size)
      waypoint.cost = TokenDocument.#createMovementCostFunction(grid, c ?? cost, aggregator, width, height, shape);

      path.push(waypoint);

      previousX = x;
      previousY = y;
      previousElevation = elevation;
      previousWidth = width;
      previousHeight = height;
      previousShape = shape;
      previousAction = action;
    }

    const result = grid.measurePath(path);
    TokenDocument.#removeResizeSegmentsFromMeasurementResult(path, result);
    return result;
  }

  /* -------------------------------------------- */

  /**
   * Remove waypoints that were added to measure the path correctly.
   * @param {(ElevatedPoint & GridMeasurePathWaypointData3D & TokenMovementSegmentData)[]} path   The measurement path
   * @param {GridMeasurePathResult} result                                                        The measurement result
   */
  static #removeResizeSegmentsFromMeasurementResult(path, result) {
    let removed = false;
    for ( let i = 1; i < path.length - 1; i++ ) {
      if ( path[i].action !== undefined ) continue;

      // This is a waypoint added for resizing
      const {backward: {from}, forward} = result.waypoints[i];
      from.forward = forward;
      forward.from = from;
      removed = true;
    }
    if ( !removed ) return;
    let waypoint = result.waypoints[0];
    result.waypoints.length = 0;
    result.waypoints.push(waypoint);
    result.segments.length = 0;
    while ( waypoint.forward ) {
      waypoint = waypoint.forward.to;
      result.waypoints.push(waypoint);
      result.segments.push(waypoint.backward);
    }
  }

  /* -------------------------------------------- */

  /**
   * Create the cost function for {@link foundry.grid.BaseGrid#measurePath}.
   * The `from` and `to` parameters of the cost function are top-left offsets
   * ({@link foundry.documents.BaseToken##getTopLeftGridOffset}).
   * @param {BaseGrid} grid                                    The grid
   * @param {TokenMovementCostFunction|number|undefined} cost  The cost function for a single step or predetermined cost
   * @param {TokenMovementCostAggregator} aggregator           The cost aggregator
   * @param {number} width                                     The width in grid spaces (positive)
   * @param {number} height                                    The height in grid spaces (positive)
   * @param {TokenShapeType} shape                             The shape (one of {@link CONST.TOKEN_SHAPES})
   * @returns {TokenMovementCostFunction|number|undefined}     The cost function for measuring
   */
  static #createMovementCostFunction(grid, cost, aggregator, width, height, shape) {
    if ( cost === undefined ) return undefined;

    // Predetermined cost
    if ( typeof cost !== "function" ) return Number(cost);

    // In gridless grids we use the cost function directly
    if ( grid.isGridless ) return cost;

    // For 1x1 and 0.5x0.5 token we can use the cost function directly
    if ( (width === height) && (width <= 1) ) return cost;

    // Square grid
    if ( grid.isSquare ) return TokenDocument.#createSquareMovementCostFunction(cost, aggregator, width, height);

    // Hexagonal grid
    return TokenDocument.#createHexagonalMovementCostFunction(grid, cost, aggregator, width, height, shape);
  }

  /* -------------------------------------------- */

  /**
   * Create the cost function for {@link foundry.grid.SquareGrid#measurePath}.
   * @param {TokenMovementCostFunction} cost         The cost function for a single step
   * @param {TokenMovementCostAggregator} aggregator The cost aggregator
   * @param {number} width                           The width in grid spaces (positive)
   * @param {number} height                          The height in grid spaces (positive)
   * @returns {TokenMovementCostFunction}            The combined cost function
   */
  static #createSquareMovementCostFunction(cost, aggregator, width, height) {
    const w = Math.ceil(width);
    const h = Math.ceil(height);
    const results = [];
    for ( let l = w * h; l > 0; l-- ) {
      results.push({from: {i: 0, j: 0, k: 0}, to: {i: 0, j: 0, k: 0}, cost: 0});
    }
    return (from, to, distance, segment) => {
      const {i: i0, j: j0} = from;
      const {i: i1, j: j1} = to;
      for ( let di = 0, l = 0; di < height; di++ ) {
        for ( let dj = 0; dj < width; dj++, l++ ) {
          const result = results[l];
          const {from: o0, to: o1} = result;
          o0.i = i0 + di;
          o0.j = j0 + dj;
          o1.i = i1 + di;
          o1.j = j1 + dj;
          result.cost = cost(o0, o1, distance, segment);
        }
      }
      return aggregator(results, distance, segment);
    };
  }

  /* -------------------------------------------- */

  /**
   * Create the cost function for {@link foundry.grid.HexagonalGrid#measurePath}.
   * @param {HexagonalGrid} grid                       The hexagonal grid
   * @param {TokenMovementCostFunction} cost           The cost function for a single step
   * @param {TokenMovementCostAggregator} aggregator   The cost aggregator
   * @param {number} width                             The width in grid spaces (positive)
   * @param {number} height                            The height in grid spaces (positive)
   * @param {TokenShapeType} shape                     The shape type (one of {@link CONST.TOKEN_SHAPES})
   * @returns {TokenMovementCostFunction}              The combined cost function
   */
  static #createHexagonalMovementCostFunction(grid, cost, aggregator, width, height, shape) {
    const {columns, even} = grid;
    const {even: offsetsEven, odd: offsetsOdd} = BaseToken._getHexagonalOffsets(width, height, shape, columns);
    const results = [];
    for ( let l = offsetsEven.length; l > 0; l-- ) {
      results.push({from: {i: 0, j: 0, k: 0}, to: {i: 0, j: 0, k: 0}, cost: 0});
    }
    return (from, to, distance, segment) => {
      const {i: i0, j: j0} = from;
      const isEven0 = ((columns ? j0 : i0) % 2 === 0) === even;
      const offsets0 = isEven0 ? offsetsEven : offsetsOdd;
      const {i: i1, j: j1} = to;
      const isEven1 = ((columns ? j1 : i1) % 2 === 0) === even;
      const offsets1 = isEven1 ? offsetsEven : offsetsOdd;
      for ( let l = results.length - 1; l >= 0; l-- ) {
        const result = results[l];
        const {from: o0, to: o1} = result;
        const {i: di0, j: dj0} = offsets0[l];
        o0.i = i0 + di0;
        o0.j = j0 + dj0;
        const {i: di1, j: dj1} = offsets1[l];
        o1.i = i1 + di1;
        o1.j = j1 + dj1;
        result.cost = cost(o0, o1, distance, segment);
      }
      return aggregator(results, distance, segment);
    };
  }

  /* -------------------------------------------- */

  /**
   * Get the path of movement with the intermediate steps of the direct path between waypoints.
   * @param {TokenGetCompleteMovementPathWaypoint[]} waypoints    The waypoints of movement
   * @returns {TokenCompleteMovementWaypoint[]}                   The path of movement with all intermediate steps
   */
  getCompleteMovementPath(waypoints) {
    const grid = this.parent?.grid ?? foundry.documents.BaseScene.defaultGrid;
    const path = [];
    let from;
    let {x: previousX, y: previousY, elevation: previousElevation,
      width: previousWidth, height: previousHeight, shape: previousShape} = this._source;
    let previousAction = this.movementAction;

    for ( let i = 0; i < waypoints.length; i++ ) {
      let {x=previousX, y=previousY, elevation=previousElevation, width=previousWidth, height=previousHeight,
        shape=previousShape, action=previousAction, terrain=null, snapped=false, explicit=false,
        checkpoint=false, intermediate=false} = waypoints[i];
      x = Math.round(x);
      y = Math.round(y);
      if ( terrain ) terrain = terrain.clone();
      const to = this._positionToGridOffset({x, y, elevation, width, height, shape});

      if ( (i > 0) && !CONFIG.Token.movement.actions[action].teleport ) {
        let s = 1;
        if ( ((width !== previousWidth) || (height !== previousHeight) || (shape !== previousShape)) ) {
          const pivot = this.getCenterPoint({x: 0, y: 0, elevation: 0, width, height, shape});
          const center = this.getCenterPoint({x: previousX, y: previousY, elevation: previousElevation,
            width: previousWidth, height: previousHeight, shape: previousShape});
          from = this._positionToGridOffset({x: center.x - pivot.x, y: center.y - pivot.y,
            elevation: center.elevation - pivot.elevation, width, height, shape});
          s = 0;
        }
        const dimensions = {width, height, shape};
        const steps = grid.getDirectPath([from, to]);
        for ( ; s < steps.length - 1; s++ ) {
          const offset = steps[s];
          const {x, y, elevation} = this._gridOffsetToPosition(offset, dimensions);
          path.push({x: Math.round(x), y: Math.round(y), elevation, width, height, shape, action,
            terrain: terrain ? terrain.clone() : null, snapped: true, explicit: false, checkpoint: false,
            intermediate: true});
        }
      }

      path.push({x, y, elevation, width, height, shape, action, terrain, snapped, explicit, checkpoint,
        intermediate});

      from = to;
      previousX = x;
      previousY = y;
      previousElevation = elevation;
      previousWidth = width;
      previousHeight = height;
      previousShape = shape;
      previousAction = action;
    }
    return path;
  }

  /* -------------------------------------------- */
  /*  Combat Operations                           */
  /* -------------------------------------------- */

  /**
   * Add or remove this Token from a Combat encounter.
   * @param {object} [options={}]         Additional options passed to TokenDocument.createCombatants or
   *                                      TokenDocument.deleteCombatants
   * @param {boolean} [options.active]      Require this token to be an active Combatant or to be removed.
   *                                        Otherwise, the current combat state of the Token is toggled.
   * @returns {Promise<boolean>}          Is this Token now an active Combatant?
   */
  async toggleCombatant({active, ...options}={}) {
    active ??= !this.inCombat;
    if ( active ) await this.constructor.createCombatants([this], options);
    else await this.constructor.deleteCombatants([this], options);
    return this.inCombat;
  }

  /* -------------------------------------------- */

  /**
   * Create or remove Combatants for an array of provided Token objects.
   * @param {TokenDocument[]} tokens      The tokens which should be added to the Combat
   * @param {object} [options={}]         Options which modify the toggle operation
   * @param {Combat} [options.combat]       A specific Combat instance which should be modified. If undefined, the
   *                                        current active combat will be modified if one exists. Otherwise, a new
   *                                        Combat encounter will be created if the requesting user is a Gamemaster.
   * @returns {Promise<Combatant[]>}      An array of created Combatant documents
   */
  static async createCombatants(tokens, {combat}={}) {

    // Identify the target Combat encounter
    combat ??= game.combats.viewed;
    if ( !combat ) {
      if ( game.user.isGM ) {
        const cls = foundry.utils.getDocumentClass("Combat");
        combat = await cls.create({active: true}, {render: false});
      }
      else throw new Error(game.i18n.localize("COMBAT.NoneActive"));
    }

    // Add tokens to the Combat encounter
    const createData = new Set(tokens).reduce((arr, token) => {
      if ( token.inCombat ) return arr;
      arr.push({tokenId: token.id, sceneId: token.parent.id, actorId: token.actorId, hidden: token.hidden});
      return arr;
    }, []);
    return combat.createEmbeddedDocuments("Combatant", createData);
  }

  /* -------------------------------------------- */

  /**
   * Remove Combatants for the array of provided Tokens.
   * @param {TokenDocument[]} tokens      The tokens which should removed from the Combat
   * @param {object} [options={}]         Options which modify the operation
   * @param {Combat} [options.combat]       A specific Combat instance from which Combatants should be deleted
   * @returns {Promise<Combatant[]>}      An array of deleted Combatant documents
   */
  static async deleteCombatants(tokens, {combat}={}) {
    combat ??= game.combats.viewed;
    const tokenIds = new Set(tokens.map(t => t.id));
    const combatantIds = combat.combatants.reduce((ids, c) => {
      if ( tokenIds.has(c.tokenId) ) ids.push(c.id);
      return ids;
    }, []);
    return combat.deleteEmbeddedDocuments("Combatant", combatantIds);
  }

  /* -------------------------------------------- */
  /*  Actor Data Operations                       */
  /* -------------------------------------------- */

  /**
   * Convenience method to change a token vision mode.
   * @param {string} visionMode                     The vision mode to apply to this token.
   * @param {boolean} [defaults=true]               If the vision mode should be updated with its defaults.
   * @returns {Promise<TokenDocument|undefined>}    The updated Document instance, or undefined not updated.
   */
  async updateVisionMode(visionMode, defaults=true) {
    if ( !(visionMode in CONFIG.Canvas.visionModes) ) {
      throw new Error("The provided vision mode does not exist in CONFIG.Canvas.visionModes");
    }
    const update = {sight: {visionMode: visionMode}};
    if ( defaults ) {
      const defaults = CONFIG.Canvas.visionModes[visionMode].vision.defaults;
      for ( const [key, value] of Object.entries(defaults)) {
        if ( value === undefined ) continue;
        update.sight[key] = value;
      }
    }
    return this.update(update);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  getEmbeddedCollection(embeddedName) {
    if ( this.isLinked ) return super.getEmbeddedCollection(embeddedName);
    switch ( embeddedName ) {
      case "Actor":
        this.actors.set(this.actorId, this.actor);
        return this.actors;
      case "Item":
        return this.actor.items;
      case "ActiveEffect":
        return this.actor.effects;
    }
    return super.getEmbeddedCollection(embeddedName);
  }

  /* -------------------------------------------- */
  /*  Event Handlers                              */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _onCreate(data, options, userId) {

    // Initialize the regions of this token
    for ( const id of this._source._regions ) {
      const region = this.parent.regions.get(id);
      if ( !region ) continue;
      this.regions.add(region);
      region.tokens.add(this);
    }

    super._onCreate(data, options, userId);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _preUpdate(changed, options, user) {
    const allowed = await super._preUpdate(changed, options, user);
    if ( allowed === false ) return false;
    if ( "actorId" in changed ) options.previousActorId = this.actorId;
    await this.#preUpdateMovement(changed, options);
  }

  /* -------------------------------------------- */

  /**
   * Handle movement pre update.
   * @param {object} changed    The candidate changes to the Document
   * @param {object} options    Additional options which modify the update request
   */
  async #preUpdateMovement(changed, options) {

    // Prevent movement history from being changed directly except for explicit reset
    if ( !options.isUndo ) delete changed._movementHistory;
    if ( options._clearMovementHistory ) changed._movementHistory = [];

    // Prepare movement waypoints
    let {waypoints, method, constrainOptions, autoRotate, showRuler} = options.movement?.[this.id] ?? {};
    if ( waypoints && (waypoints.length === 0) ) waypoints = undefined;
    if ( !waypoints && TokenDocument._isMovementUpdate(changed) ) {
      waypoints = TokenDocument.#inferMovementWaypoints(this, changed, options);
    }
    if ( !waypoints ) {
      for ( const k of TokenDocument.MOVEMENT_FIELDS ) delete changed[k];
      return;
    }
    method ??= (options.isPaste ? "paste" : (options.isUndo ? "undo" : "api"));
    if ( !["api", "config", "dragging", "keyboard", "paste", "undo"].includes(method)
      || ((method === "paste") !== !!options.isPaste)
      || ((method === "undo") !== !!options.isUndo) ) {
      throw new Error("Invalid movement method");
    }
    constrainOptions = foundry.utils.deepClone(constrainOptions) ?? {};
    if ( autoRotate !== undefined ) autoRotate = !!autoRotate;
    if ( showRuler !== undefined ) showRuler = !!showRuler;

    // Set default options based on the method of movement
    if ( (method === "paste") || (method === "undo") ) {
      autoRotate = false;
      showRuler = false;
    } else if ( method === "keyboard" ) {
      autoRotate ??= game.settings.get("core", "tokenAutoRotate");
      showRuler ??= false;
    } else if ( method === "dragging" ) {
      autoRotate ??= game.settings.get("core", "tokenAutoRotate");
      showRuler ??= true;
    } else {
      autoRotate ??= false;
      showRuler ??= false;
    }

    // Create post workflow promise if it wasn't already
    options._movement ??= {};
    if ( !options._movement._postWorkflow ) {
      Object.defineProperty(options._movement, "_postWorkflow", {value: {}});
      options._movement._postWorkflow.promise = new Promise(resolve => {
        options._movement._postWorkflow.resolve = resolve;
      });
    }

    // Clean and validate waypoints
    waypoints = this.#cleanAndValiateMovementWaypoints(waypoints);

    // Get the origin of movement
    const origin = Object.freeze({
      x: this._source.x,
      y: this._source.y,
      elevation: this._source.elevation,
      width: this._source.width,
      height: this._source.height,
      shape: this._source.shape
    });

    // Set movement speed based on the animation duration
    foundry.canvas.placeables.Token._configureAnimationMovementSpeed(options, origin, waypoints, this);

    // Generate movement ID
    const movementId = foundry.utils.randomID();

    const recorded = !options.isUndo && this._shouldRecordMovementHistory();
    const recordedHistory = this._source._movementHistory.map(waypoint => ({...waypoint,
      terrain: waypoint.terrain ? CONFIG.Token.movement.TerrainData.fromSource(waypoint.terrain) : null,
      cost: waypoint.cost ?? Infinity}));
    const combined = recordedHistory.concat(recorded ? [] : options._movementArguments?.unrecorded ?? []);

    // Add the initial waypoint or a teleport waypoint if there's a gap if we previously moved without recording
    const previous = combined.at(-1);
    if ( !previous || !TokenDocument.arePositionsEqual(previous, origin) ) {
      const {x, y, elevation, width, height, shape} = origin;
      combined.push({x, y, elevation, width, height, shape, action: previous ? "displace" : waypoints[0].action,
        terrain: null, snapped: false, explicit: false, checkpoint: true, intermediate: false,
        userId: game.user.id, movementId, cost: 0});
    }

    // Set unrecorded history
    const unrecordedHistory = combined.slice(recordedHistory.length);

    // Split the path of movement at the first checkpoint
    let passed;
    let pending;
    let constrained = false;
    if ( options.isPaste || options.isUndo ) [passed, pending] = [waypoints, []];
    else ({passed, pending} = this.#splitMovementPath(origin, waypoints));

    // Regionalize and constrain movement
    if ( !(options.isPaste || options.isUndo) && this.rendered ) {

      // Regionalize the passed movement
      passed = this.object.createTerrainMovementPath([origin, ...passed]);
      passed.shift();

      // Contrain the path of movement
      const [constrainedPath, wasConstrained] = this.object.constrainMovementPath([origin, ...passed],
        {...constrainOptions, preview: false, history: combined});
      if ( wasConstrained ) {
        constrainedPath.shift();
        passed = constrainedPath;
        pending.length = 0;
        constrained = true;
      }
    }

    // Movement was constrained and impossible entirely
    if ( passed.length === 0 ) {
      for ( const k of TokenDocument.MOVEMENT_FIELDS ) delete changed[k];
      if ( options._movementArguments?.movementId === this._movementContinuation.movementId ) {
        this.#stopMovement(options._movement._postWorkflow);
      }
      return;
    }

    // Force destination to be a checkpoint
    const destination = passed.at(-1);
    destination.checkpoint = true;

    // Assign the checkpoint target to the changes object
    for ( const k of TokenDocument.MOVEMENT_FIELDS ) changed[k] = destination[k];

    // Regionalize the pending movement
    if ( (pending.length !== 0) && this.rendered ) {
      pending = this.object.createTerrainMovementPath([destination, ...pending], {preview: true});
      pending.shift();
    }

    // Measure the distances and spaces of the history, passed waypoints, and pending waypoints
    const nonintermediateRecordedHistory = TokenDocument.#filterNonintermediateWaypoints(recordedHistory);
    const nonintermediateUnrecordedHistory = TokenDocument.#filterNonintermediateWaypoints(unrecordedHistory);
    const nonintermediatePassed = passed;
    const nonintermediatePending = pending;
    const [
      recordedHistoryDistance, recordedHistorySpaces, recordedHistoryDiagonals,
      unrecordedHistoryDistance, unrecordedHistorySpaces, unrecordedHistoryDiagonals,
      passedDistance, passedSpaces, passedDiagonals,
      pendingDistance, pendingSpaces, pendingDiagonals
    ] = this.#measureMovementSectionDistances(nonintermediateRecordedHistory, nonintermediateUnrecordedHistory,
      nonintermediatePassed, nonintermediatePending);

    // Add intermediate waypoints
    passed = this.getCompleteMovementPath([origin, ...passed]);
    passed.shift();
    pending = this.getCompleteMovementPath([destination, ...pending]);
    pending.shift();

    // Add the passed waypoints
    for ( const waypoint of passed ) {
      waypoint.userId = game.user.id;
      waypoint.movementId = movementId;
      combined.push(waypoint);
    }

    // Measure movement cost
    let passedCost = 0;
    let pendingCost = 0;
    let measurement;
    if ( this.rendered ) {

      // First measure the true cost of passed waypoints
      measurement = this.object.measureMovementPath(combined);
      for ( let i = combined.length - passed.length; i < combined.length; i++ ) {
        passedCost += combined[i].cost = measurement.waypoints[i].backward.cost;
      }

      // Then add pending waypoints and measure the preview cost of pending waypoints
      if ( pending.length !== 0 ) {
        for ( const waypoint of pending ) {
          waypoint.userId = game.user.id;
          waypoint.movementId = movementId;
          combined.push(waypoint);
        }
        measurement = this.object.measureMovementPath(combined, {preview: true});
        for ( let i = combined.length - pending.length; i < combined.length; i++ ) {
          pendingCost += combined[i].cost = measurement.waypoints[i].backward.cost;
        }
      }
    } else {
      for ( const waypoint of passed ) waypoint.cost = 0;
      for ( const waypoint of pending ) {
        waypoint.userId = game.user.id;
        waypoint.movementId = movementId;
        waypoint.cost = 0;
        combined.push(waypoint);
      }
      measurement = this.measureMovementPath(combined);
    }
    let recordedHistoryCost = 0;
    for ( const waypoint of recordedHistory ) {
      recordedHistoryCost += waypoint.cost;
    }
    let unrecordedHistoryCost = 0;
    for ( const waypoint of unrecordedHistory ) {
      unrecordedHistoryCost += waypoint.cost;
    }

    /**
     * @type {DeepReadonly<Omit<TokenMovementOperation, "autoRotate"|"showRuler">>
     *   & Pick<TokenMovementOperation, "autoRotate"|"showRuler">}
     */
    const move = Object.seal({
      id: movementId,
      chain: options._movementArguments?.chain ?? [],
      origin,
      destination: ({x: destination.x, y: destination.y, elevation: destination.elevation,
        width: destination.width, height: destination.height, shape: destination.shape}),
      passed: {
        waypoints: passed,
        distance: passedDistance,
        cost: passedCost,
        spaces: passedSpaces,
        diagonals: passedDiagonals
      },
      pending: {
        waypoints: pending,
        distance: pendingDistance,
        cost: pendingCost,
        spaces: pendingSpaces,
        diagonals: pendingDiagonals
      },
      history: {
        recorded: {
          waypoints: recordedHistory,
          distance: recordedHistoryDistance,
          cost: recordedHistoryCost,
          spaces: recordedHistorySpaces,
          diagonals: recordedHistoryDiagonals
        },
        unrecorded: {
          waypoints: unrecordedHistory,
          distance: unrecordedHistoryDistance,
          cost: unrecordedHistoryCost,
          spaces: unrecordedHistorySpaces,
          diagonals: unrecordedHistoryDiagonals
        },
        distance: recordedHistoryDistance + unrecordedHistoryDistance,
        cost: recordedHistoryCost + unrecordedHistoryCost,
        spaces: recordedHistorySpaces + unrecordedHistorySpaces,
        diagonals: recordedHistoryDiagonals + unrecordedHistoryDiagonals
      },
      constrained,
      recorded,
      method,
      constrainOptions,
      autoRotate,
      showRuler
    });

    // Freeze non-writeable movement operation properties
    for ( const [key, value] of Object.entries(move) ) {
      if ( TokenDocument.#WRITEABLE_MOVEMENT_OPERATION_PROPERTIES.includes(key) ) continue;
      Object.defineProperty(move, key, {value: foundry.utils.deepFreeze(value)});
    }

    // Allow systems/modules to reject the movement and to modify the operation as needed
    let movementAllowed = (await this._preUpdateMovement(move, options)) ?? true;
    movementAllowed &&= (options.noHook || Hooks.call("preMoveToken", this, move, options));
    if ( movementAllowed === false ) {
      for ( const k of TokenDocument.MOVEMENT_FIELDS ) delete changed[k];
      if ( options._movementArguments?.movementId === this._movementContinuation.movementId ) {
        this.#stopMovement(options._movement._postWorkflow);
      }
      return;
    }

    // Freeze writeable movement operation properties
    for ( const key of TokenDocument.#WRITEABLE_MOVEMENT_OPERATION_PROPERTIES ) {
      Object.defineProperty(move, key, {value: foundry.utils.deepFreeze(move[key])});
    }

    // Automatically set the rotation based of the last nonzero segment if the autoRotate option is set to true
    if ( move.autoRotate ) TokenDocument.#rotateInMovementDirection(this, changed, move);

    // Add a record of movement history to the set of database changes
    if ( recorded ) changed._movementHistory = combined.slice(0, combined.length - pending.length).map(
      waypoint => ({...waypoint, cost: waypoint.cost === Infinity ? null : waypoint.cost}));

    // Record the token movement operation instructions
    Object.defineProperty(options._movement, this.id, {value: move, enumerable: true});

    // Need to disable diffing to force the update to go through even in case when the movement is a loop
    options.diff = false;

    if ( options._movementArguments ) options._movementArguments.result = true;
    if ( options._movementArguments?.movementId !== undefined ) this._movementContinuation.continued = true;
    else this.#resetMovementContinuation();
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onUpdate(changed, options, userId) {

    // If the Actor association has changed, expire the cached Token actor
    if ( ("actorId" in changed) || ("actorLink" in changed) ) {
      const previousActor = game.actors.get(options.previousActorId);
      if ( previousActor ) {
        Object.values(previousActor.apps).forEach(app => app.close({submit: false}));
        previousActor._unregisterDependentToken(this);
      }
      this.delta._createSyntheticActor({ reinitializeCollections: true });
    }

    // Handle region changes
    const priorRegionIds = options._priorRegions?.[this.id];
    if ( priorRegionIds ) this.#onUpdateRegions(priorRegionIds);

    // Handle movement
    this.#onUpdateMovement(changed, options, userId);

    const configs = Object.values(this.apps).filter(app => app instanceof foundry.applications.sheets.TokenConfig);
    configs.forEach(app => {
      if ( app.preview ) options.animate = false;
      app._previewChanges(changed);
    });

    // Post-update the Token itself
    super._onUpdate(changed, options, userId);

    configs.forEach(app => app._previewChanges());
  }

  /* -------------------------------------------- */

  /**
   * Handle changes to the regions this token is in.
   * @param {string[]} priorRegionIds    The IDs of the prior regions
   */
  #onUpdateRegions(priorRegionIds) {

    // Update the regions of this token
    this.regions.clear();
    for ( const id of this._source._regions ) {
      const region = this.parent.regions.get(id);
      if ( !region ) continue;
      this.regions.add(region);
    }

    // Update tokens of regions
    const priorRegions = new Set();
    for ( const id of priorRegionIds ) {
      const region = this.parent.regions.get(id);
      if ( region ) priorRegions.add(region);
    }
    for ( const region of priorRegions ) region.tokens.delete(this);
    for ( const region of this.regions ) region.tokens.add(this);
  }

  /* -------------------------------------------- */

  /**
   * Handle movement.
   * @param {object} changed    The changes
   * @param {object} options    Options which modified the update operation
   * @param {string} userId     The ID of the User who triggered the operation
   */
  #onUpdateMovement(changed, options, userId) {
    /** @type {TokenMovementOperation} */
    const movement = options._movement?.[this.id];

    // Update movement data
    if ( movement ) {

      // Create post workflow promise if it wasn't already
      if ( !options._movement._postWorkflow ) {
        Object.defineProperty(options._movement, "_postWorkflow", {value: {}});
        options._movement._postWorkflow.promise = new Promise(resolve => {
          options._movement._postWorkflow.resolve = resolve;
        });
      }

      // Impute waypoint costs as Infinity if undefined/null and create TerrainData models
      const imputeCostAndCreateTerrainData = waypoints => waypoints.forEach(w => {
        if ( w.terrain ) w.terrain = CONFIG.Token.movement.TerrainData.fromSource(w.terrain);
        w.cost ??= Infinity;
      });
      imputeCostAndCreateTerrainData(movement.passed.waypoints);
      imputeCostAndCreateTerrainData(movement.pending.waypoints);
      imputeCostAndCreateTerrainData(movement.history.recorded.waypoints);
      imputeCostAndCreateTerrainData(movement.history.unrecorded.waypoints);

      // Impute movement costs as Infinity if undefined/null
      movement.passed.cost ??= Infinity;
      movement.pending.cost ??= Infinity;
      movement.history.recorded.cost ??= Infinity;
      movement.history.unrecorded.cost ??= Infinity;
      movement.history.cost ??= Infinity;

      // Freeze movement data
      foundry.utils.deepFreeze(movement);

      // Stop current movement unless chained
      if ( this.movement.id !== movement.chain.at(-1) ) this.#stopMovement(false);

      // Update movement data
      this.#resetMovementContinuation();
      this._movementContinuation.postWorkflowPromise = options._movement._postWorkflow.promise;
      this.movement.user.movingTokens.delete(this);
      const user = game.users.get(userId);
      const state = movement.constrained ? "stopped" : (movement.pending.waypoints.length > 0 ? "pending" : "completed");
      if ( state === "pending" ) user.movingTokens.add(this);
      const {animate, animation, diff, noHook, pan, render, renderSheet, isPaste, isUndo} = options;
      const updateOptions = foundry.utils.deepFreeze({animate, animation, diff, noHook, pan, render, renderSheet,
        isPaste, isUndo});
      this.#movement = Object.freeze({...movement, user, state, updateOptions});
    }

    // Another user stopped movement
    else if ( options._stopMovement ) {
      if ( (options._stopMovement === this.movement.id) && !this.movement.user.isSelf ) this.#stopMovement(false);
    }

    // Another user paused movement
    else if ( options._pauseMovement ) {
      if ( (options._pauseMovement === this.movement.id) && !this.movement.user.isSelf ) this.#pauseMovement(false);
    }

    // Another user resumed movement
    else if ( options._resumeMovement ) {
      if ( this.movement.user.isSelf ) {
        const [movementId, key] = options._resumeMovement;
        this.resumeMovement(movementId, key);
      }
    }

    // Clearing of the movement history stops movement
    else if ( options._clearMovementHistory ) this.#stopMovement(false);

    // The movement was recorded
    if ( "_movementHistory" in changed ) {
      this._onMovementRecorded();
      Hooks.callAll("recordToken", this);
    }
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onDelete(options, userId) {
    this.#stopMovement(false);
    super._onDelete(options, userId);
    this.baseActor?._unregisterDependentToken(this);
  }

  /* -------------------------------------------- */

  /**
   * Identify the Regions the Token currently is or is going to be in after the changes are applied.
   * @param {object} [changes]    The changes that will be applied to this Token
   * @returns {string[]}          The Region IDs this Token is in after the changes are applied (sorted)
   * @internal
   */
  _identifyRegions(changes={}) {
    const regionIds = [];
    for ( const region of this.parent.regions ) {
      const isInside = this.testInsideRegion(region, changes);
      if ( isInside ) regionIds.push(region.id);
    }
    return regionIds.sort();
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  static async _preCreateOperation(documents, operation, user) {
    const allowed = await super._preCreateOperation(documents, operation, user);
    if ( allowed === false ) return false;

    // Wipe movement history and identify the regions the token is in
    for ( const document of documents ) {
      document.updateSource({_movementHistory: [], _regions: document._identifyRegions()});
    }
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  static async _preUpdateOperation(documents, operation, user) {
    const allowed = await super._preUpdateOperation(documents, operation, user);
    if ( allowed === false ) return false;
    TokenDocument.#preUpdateOperationMovement(documents, operation, user);
    TokenDocument.#preUpdateOperationRegions(documents, operation);
  }

  /* -------------------------------------------- */

  /** @type {TOKEN_SHAPES[]} */
  static #VALID_SHAPES = Object.values(TOKEN_SHAPES);

  /** @type {Set<string>} */
  static #VALID_MOVEMENT_WAYPOINT_PROPERTIES = new Set(["x", "y", "elevation", "width", "height", "shape",
    "action", "snapped", "explicit", "checkpoint"]);

  /**
   * Clean and validate movement waypoints.
   * @param {Partial<TokenMovementWaypoint>[]} waypoints    The waypoints
   * @returns {TokenMovementWaypoint[]}                     The cleaned waypoints
   */
  #cleanAndValiateMovementWaypoints(waypoints) {
    waypoints = waypoints.slice();
    const {x, y, elevation, width, height, shape} = this._source;
    let previousWaypoint = {x, y, elevation, width, height, shape, action: this.movementAction};
    for ( let i = 0; i < waypoints.length; i++ ) {
      const waypoint = waypoints[i] = {...waypoints[i]};
      // TODO: create DataModel for this cleaning and validation
      if ( waypoint.x === undefined ) waypoint.x = previousWaypoint.x;
      else if ( typeof waypoint.x !== "number" ) throw new Error("x must be a number");
      else if ( !Number.isFinite(waypoint.x) ) throw new Error("x must be finite");
      else waypoint.x = Math.round(waypoint.x);
      if ( waypoint.y === undefined ) waypoint.y = previousWaypoint.y;
      else if ( typeof waypoint.y !== "number" ) throw new Error("y must be a number");
      else if ( !Number.isFinite(waypoint.y) ) throw new Error("y must be finite");
      else waypoint.y = Math.round(waypoint.y);
      if ( waypoint.elevation === undefined ) waypoint.elevation = previousWaypoint.elevation;
      else if ( typeof waypoint.elevation !== "number" ) throw new Error("elevation must be a number");
      else if ( !Number.isFinite(waypoint.elevation) ) throw new Error("elevation must be finite");
      if ( waypoint.width === undefined ) waypoint.width = previousWaypoint.width;
      else if ( typeof waypoint.width !== "number" ) throw new Error("width must be a number");
      else if ( !Number.isFinite(waypoint.width) ) throw new Error("width must be finite");
      else if ( !(waypoint.width > 0) ) throw new Error("width must be positive");
      if ( waypoint.height === undefined ) waypoint.height = previousWaypoint.height;
      else if ( typeof waypoint.height !== "number" ) throw new Error("height must be a number");
      else if ( !Number.isFinite(waypoint.height) ) throw new Error("height must be finite");
      else if ( !(waypoint.height > 0) ) throw new Error("height must be positive");
      if ( waypoint.shape === undefined ) waypoint.shape = previousWaypoint.shape;
      else if ( !TokenDocument.#VALID_SHAPES.includes(waypoint.shape) ) throw new Error("shape is invalid");
      if ( waypoint.action === undefined ) waypoint.action = previousWaypoint.action;
      else if ( typeof waypoint.action !== "string" ) throw new Error("action must be a string");
      else if ( !(waypoint.action in CONFIG.Token.movement.actions) ) throw new Error("action is invalid");
      if ( waypoint.snapped === undefined ) waypoint.snapped = false;
      else if ( typeof waypoint.snapped !== "boolean" ) throw new Error("snapped must be a boolean");
      if ( waypoint.explicit === undefined ) waypoint.explicit = false;
      else if ( typeof waypoint.explicit !== "boolean" ) throw new Error("explicit must be a boolean");
      if ( waypoint.checkpoint === undefined ) waypoint.checkpoint = false;
      else if ( typeof waypoint.checkpoint !== "boolean" ) throw new Error("checkpoint must be a boolean");
      for ( const key in waypoint ) {
        if ( !TokenDocument.#VALID_MOVEMENT_WAYPOINT_PROPERTIES.has(key) ) delete waypoint[key];
      }
      previousWaypoint = waypoint;
    }
    return waypoints;
  }

  /* -------------------------------------------- */

  /**
   * Finalize movement operation.
   * @param {TokenDocument[]} documents           Document instances to be updated
   * @param {DatabaseUpdateOperation} operation   Parameters of the database update operation
   * @param {User} user                           The User requesting the update operation
   */
  static #preUpdateOperationMovement(documents, operation, user) {
    delete operation.movement;
    operation._movement?._postWorkflow.resolve();
    if ( foundry.utils.isEmpty(operation._movement) ) delete operation._movement;
    delete operation._movementArguments;
    /** @deprecated since v13 */
    delete operation.teleport;
    /** @deprecated since v13 */
    delete operation.forced;
  }

  /* -------------------------------------------- */

  /**
   * Convert a set of {x, y, elevation} changes in a Token document update into an array of waypoints.
   * @param {TokenDocument} document
   * @param {Partial<TokenData>} changes
   * @param {DatabaseUpdateOperation} operation
   * @returns {TokenMovementWaypoint[]}
   */
  static #inferMovementWaypoints(document, changes, operation) {
    const x = changes.x ?? document._source.x;
    const y = changes.y ?? document._source.y;
    const elevation = changes.elevation ?? document._source.elevation;
    const width = changes.width ?? document._source.width;
    const height = changes.height ?? document._source.height;
    const shape = changes.shape ?? document._source.shape;
    /** @deprecated since v13 */
    if ( "teleport" in operation ) {
      foundry.utils.logCompatibilityWarning("DatabaseUpdateOperation#teleport has been deprecated. "
        + "Use DatabaseUpdateOperation#waypoints or TokenDocument#movement instead.", {since: 13, until: 15});
    }
    /** @deprecated since v13 */
    if ( "forced" in operation ) {
      foundry.utils.logCompatibilityWarning("DatabaseUpdateOperation#forced has been deprecated. "
        + "Use DatabaseUpdateOperation#waypoints or TokenDocument#movement instead.", {since: 13, until: 15});
    }
    const action = (operation.teleport === true) || (operation.isPaste === true) ? "displace" : undefined;
    return [{x, y, elevation, width, height, shape, action, snapped: false, explicit: false, checkpoint: true}];
  }

  /* -------------------------------------------- */

  /**
   * Filter nonintermediate waypoints.
   * @param {TokenMeasuredMovementWaypoint[]} waypoints    The waypoints
   * @returns {TokenMovementWaypoint[]}                    The nonintermediate waypoints
   */
  static #filterNonintermediateWaypoints(waypoints) {
    const path = [];
    for ( const {x, y, elevation, width, height, shape, action, snapped, explicit, checkpoint,
      intermediate} of waypoints ) {
      if ( intermediate ) continue;
      path.push({x, y, elevation, width, height, shape, action, snapped, explicit, checkpoint});
    }
    return path;
  }

  /* -------------------------------------------- */

  /**
   * Measure the distances and spaces of each movement path section.
   * @param {TokenPosition[]} recordedHistory      The recorded history waypoints
   * @param {TokenPosition[]} unrecordedHistory    The unrecorded history waypoints
   * @param {TokenPosition[]} passed               The passed waypoints
   * @param {TokenPosition[]} pending              The pending waypoints
   * @returns {[
   *   recordedHistoryDistance: number; recordedHistorySpaces: number; recordedHistoryDiagonals: number;
   *   unrecordedHistoryDistance: number; unrecordedHistorySpaces: number; unrecordedHistoryDiagonals: number;
   *   passedDistance: number; passedSpaces: number; passedDiagonals: number;
   *   pendingDistance: number; pendingSpaces: number; pendingDiagonals: number
   * ]}
   *   The history, passed, and pending distances and spaces
   */
  #measureMovementSectionDistances(recordedHistory, unrecordedHistory, passed, pending) {
    const measurement = this.measureMovementPath([...recordedHistory, ...unrecordedHistory, ...passed,
      ...pending]).waypoints;
    const i0 = recordedHistory.length - 1;
    const i1 = i0 + unrecordedHistory.length;
    const i2 = i1 + passed.length;
    const i3 = i2 + pending.length;
    const recordedHistoryDistance = measurement[i0]?.distance ?? 0;
    const unrecordedHistoryDistance = measurement[i1].distance - recordedHistoryDistance;
    const passedDistance = measurement[i2].distance - (recordedHistoryDistance + unrecordedHistoryDistance);
    const pendingDistance = measurement[i3].distance - (recordedHistoryDistance + unrecordedHistoryDistance
      + passedDistance);
    const recordedHistorySpaces = measurement[i0]?.spaces ?? 0;
    const unrecordedHistorySpaces = measurement[i1].spaces - recordedHistorySpaces;
    const passedSpaces = measurement[i2].spaces - (recordedHistorySpaces + unrecordedHistorySpaces);
    const pendingSpaces = measurement[i3].spaces - (recordedHistorySpaces + unrecordedHistorySpaces + passedSpaces);
    const recordedHistoryDiagonals = measurement[i0]?.diagonals ?? 0;
    const unrecordedHistoryDiagonals = measurement[i1].diagonals - recordedHistoryDiagonals;
    const passedDiagonals = measurement[i2].diagonals - (recordedHistoryDiagonals + unrecordedHistoryDiagonals);
    const pendingDiagonals = measurement[i3].diagonals - (recordedHistoryDiagonals + unrecordedHistoryDiagonals
      + passedDiagonals);
    return [
      recordedHistoryDistance, recordedHistorySpaces, recordedHistoryDiagonals,
      unrecordedHistoryDistance, unrecordedHistorySpaces, unrecordedHistoryDiagonals,
      passedDistance, passedSpaces, passedDiagonals,
      pendingDistance, pendingSpaces, pendingDiagonals
    ];
  }

  /* -------------------------------------------- */

  /**
   * Automatically set the rotation of the Token in the direction of the last nonzero movement segment
   * unless the rotation was explicity changed.
   * @param {TokenDocument} document
   * @param {Partial<TokenData>} changes
   * @param {TokenMovementOperation} movement
   */
  static #rotateInMovementDirection(document, changes, movement) {
    if ( "rotation" in changes ) return;
    const {origin, destination, passed, method} = movement;
    const isUndo = method === "undo";
    let c1 = document.getCenterPoint(destination);
    for ( let i = passed.waypoints.length - 1; i >= 0; i-- ) {
      const waypoint = i > 0 ? passed.waypoints[i - 1] : origin;
      if ( waypoint.intermediate ) continue;
      const c0 = document.getCenterPoint(waypoint);
      const ray = new foundry.canvas.geometry.Ray(c0, c1);
      if ( ray.distance > 0 ) {
        changes.rotation = Math.normalizeDegrees(Math.toDegrees(ray.angle) + (isUndo ? 90 : -90));
        break;
      }
      c1 = c0;
    }
  }

  /* -------------------------------------------- */

  /**
   * Split the given movement path at the first checkpoint.
   * This function adds nonexplict checkpoints to the path for Region that have active Behaviors that subscribe to
   * `TOKEN_MOVE_*` events as necessary.
   * @param {TokenPosition} origin                                                     The origin of movement
   * @param {TokenMovementWaypoint[]} waypoints                                        The waypoints of movement
   * @returns {{passed: TokenMovementWaypoint[]; pending: TokenMovementWaypoint[]}}    The split movement path
   */
  #splitMovementPath(origin, waypoints) {
    const regions = [];

    // Determine the initially active regions and where to add checkpoints
    for ( const region of this.parent.regions ) {

      // We add checkpoints if a region event handler could interact with the movement of this Token
      let toOut = false;
      let toIn = false;

      const E = REGION_EVENTS;
      for ( const behavior of region.behaviors ) {
        if ( behavior.disabled ) continue;
        toIn ||= behavior.hasEvent(E.TOKEN_MOVE_WITHIN) || behavior.hasEvent(E.TOKEN_MOVE_IN)
          || behavior.hasEvent(E.TOKEN_ENTER);
        toOut ||= behavior.hasEvent(E.TOKEN_MOVE_WITHIN) || behavior.hasEvent(E.TOKEN_MOVE_OUT)
          || behavior.hasEvent(E.TOKEN_EXIT);
      }

      const mask = (toOut << 0) | (toIn << 2);
      if ( mask === 0 ) continue;
      regions.push({region, mask});
    }

    const passed = [];
    const pending = [];
    let split = false;
    let previous = origin;
    const distancePixels = this.parent.dimensions.distancePixels;
    for ( let i = 0; i < waypoints.length; i++ ) {
      const current = waypoints[i];

      if ( split ) pending.push(current);
      else {

        // Find region waypoint
        let t0 = Infinity;
        let regionCheckpoint;
        const previousCenter = this.getCenterPoint(previous);
        const segment = [previous, current];
        for ( const data of regions ) {
          const {region, mask} = data;
          for ( const {type, to} of this.segmentizeRegionMovementPath(region, segment) ) {
            if ( mask & (1 << (type + 1)) ) {
              const center = this.getCenterPoint(to);
              const dx = center.x - previousCenter.x;
              const dy = center.y - previousCenter.y;
              const dz = (center.elevation - previousCenter.elevation) * distancePixels;
              const t = (dx * dx) + (dy * dy) + (dz * dz);
              if ( t < t0 ) {
                t0 = t;
                regionCheckpoint = to;
              }
              break;
            }
          }
        }

        if ( regionCheckpoint ) {

          // Skip the region waypoint if it matches the previous movement waypoint
          if ( TokenDocument.arePositionsEqual(regionCheckpoint, previous) && (previous !== origin) ) {
            previous.checkpoint = true;
            pending.push(current);
          }

          // Skip the region waypoint if it matches the current movement waypoint
          else if ( TokenDocument.arePositionsEqual(regionCheckpoint, current) ) {
            current.checkpoint = true;
            passed.push(current);
          }

          else {
            passed.push({x: regionCheckpoint.x, y: regionCheckpoint.y, elevation: regionCheckpoint.elevation,
              width: regionCheckpoint.width, height: regionCheckpoint.height, shape: regionCheckpoint.shape,
              action: current.action, snapped: false, explicit: false, checkpoint: true});
            pending.push(current);
          }

          split = true;
        } else {
          passed.push(current);
          split = current.checkpoint;
        }
      }

      previous = current;
    }

    return {passed, pending};
  }

  /* -------------------------------------------- */

  /**
   * Reject the movement or modify the update operation as needed based on the movement.
   * Called after the movement for this document update has been determined.
   * The waypoints of movement are final and cannot be changed. The movement can only be rejected entirely.
   * @param {DeepReadonly<Omit<TokenMovementOperation, "autoRotate"|"showRuler">>
   *   & Pick<TokenMovementOperation, "autoRotate"|"showRuler">} movement    The pending movement of this Token
   * @param {Partial<DatabaseUpdateOperation>} operation                     The update operation
   * @returns {Promise<boolean|void>}                                        If false, the movement is prevented
   * @protected
   */
  async _preUpdateMovement(movement, operation) {}

  /* -------------------------------------------- */

  /**
   * Post-process an update operation of a movement.
   * @param {DeepReadonly<TokenMovementOperation>} movement    The movement of this Token
   * @param {Partial<DatabaseUpdateOperation>} operation       The update operation
   * @param {User} user                                        The User that requested the update operation
   * @protected
   */
  _onUpdateMovement(movement, operation, user) {}

  /* -------------------------------------------- */

  /**
   * Called when the current movement is stopped.
   * @protected
   */
  _onMovementStopped() {
    if ( this.rendered ) this.object.renderFlags.set({refreshRuler: true});
  }

  /* -------------------------------------------- */

  /**
   * Called when the current movement is paused.
   * @protected
   */
  _onMovementPaused() {
    if ( this.rendered ) this.object.renderFlags.set({refreshRuler: true});
  }

  /* -------------------------------------------- */

  /**
   * Called when the movement is recorded or cleared.
   * @protected
   */
  _onMovementRecorded() {
    if ( this.rendered ) this.object.renderFlags.set({refreshRuler: true});
  }

  /* -------------------------------------------- */

  /**
   * Identify and update the regions this Token is going to be in if necessary.
   * @param {TokenDocument[]} documents           Document instances to be updated
   * @param {DatabaseUpdateOperation} operation   Parameters of the database update operation
   */
  static #preUpdateOperationRegions(documents, operation) {
    for ( let i = 0; i < documents.length; i++ ) {
      const document = documents[i];
      const changes = operation.updates[i];
      if ( document._couldRegionsChange(changes) ) changes._regions = document._identifyRegions(changes);
    }
  }

  /* -------------------------------------------- */

  /** @override */
  static async _onCreateOperation(documents, operation, user) {
    for ( const token of documents ) {
      for ( const region of token.regions ) {
        // noinspection ES6MissingAwait
        region._handleEvent({
          name: REGION_EVENTS.TOKEN_ENTER,
          data: {token, movement: null},
          region,
          user
        });
      }
    }
  }

  /* -------------------------------------------- */

  /**
   * Add deprecated getters for the teleport and forced option.
   * @param {DatabaseUpdateOperation} operation
   * @internal
   * @deprecated since v13
   */
  static _addTeleportAndForcedShims(operation) {
    if ( !operation._movement ) return;
    Object.defineProperties(operation, {
      /** @deprecated since v13 */
      teleport: {
        get() {
          foundry.utils.logCompatibilityWarning("DatabaseUpdateOperation#teleport has been deprecated. "
            + " Override TokenDocument#_onUpdateMovement or hook 'moveToken' to handle movement.", {since: 13, until: 15});
          return Object.values(operation._movement).every(movement => CONFIG.Token.movement.actions[
            movement.passed.waypoints.at(-1).action].teleport);
        },
        configurable: true
      },
      /** @deprecated since v13 */
      forced: {
        get() {
          foundry.utils.logCompatibilityWarning("DatabaseUpdateOperation#forced has been deprecated. "
            + " Override TokenDocument#_onUpdateMovement or hook 'moveToken' to handle movement.", {since: 13, until: 15});
          return Object.values(operation._movement).every(movement => movement.passed.waypoints.at(-1).action === "displace");
        }
      }
    });
  }

  /* -------------------------------------------- */

  /** @override */
  static async _onUpdateOperation(documents, operation, user) {
    TokenDocument._addTeleportAndForcedShims(operation);
    TokenDocument.#onUpdateOperationMovement(documents, operation, user);
    TokenDocument.#onUpdateHandleMoveWithinRegionEvents(documents, operation, user);
    TokenDocument.#onUpdateHandleEnterExitMoveInOutRegionEvents(documents, operation, user);
    // noinspection ES6MissingAwait
    TokenDocument.#onUpdateContinueMovement(documents, operation, user);
  }

  /* -------------------------------------------- */

  /**
   * Handle TOKEN_ENTER, TOKEN_EXIT, TOKEN_MOVE_IN, and TOKEN_MOVE_OUT region events.
   * @param {TokenDocument[]} documents           Document instances to be updated
   * @param {DatabaseUpdateOperation} operation   Parameters of the database update operation
   * @param {User} user                           The User requesting the update operation
   */
  static #onUpdateHandleEnterExitMoveInOutRegionEvents(documents, operation, user) {
    if ( !operation._priorRegions ) return; // Position did not change
    for ( const token of documents ) {
      const priorRegionIds = operation._priorRegions[token.id];
      if ( !priorRegionIds ) continue;
      const priorRegions = new Set();
      for ( const id of priorRegionIds ) {
        const region = token.parent.regions.get(id);
        if ( region ) priorRegions.add(region);
      }
      const addedRegions = token.regions.difference(priorRegions);
      const removedRegions = priorRegions.difference(token.regions);
      const movement = operation._movement?.[token.id] ?? null;
      for ( const region of removedRegions ) {
        // noinspection ES6MissingAwait
        region._handleEvent({
          name: REGION_EVENTS.TOKEN_EXIT,
          data: {token, movement},
          region,
          user
        });
      }
      for ( const region of addedRegions ) {
        // noinspection ES6MissingAwait
        region._handleEvent({
          name: REGION_EVENTS.TOKEN_ENTER,
          data: {token, movement},
          region,
          user
        });
      }
      if ( movement ) {
        for ( const region of removedRegions ) {
          token.#handleMoveRegionEvent(REGION_EVENTS.TOKEN_MOVE_OUT, region, user, movement);
        }
        for ( const region of addedRegions ) {
          token.#handleMoveRegionEvent(REGION_EVENTS.TOKEN_MOVE_IN, region, user, movement);
        }
      }
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle {@link TokenDocument#_onUpdateMovement} and `moveToken` hook calls.
   * @param {TokenDocument[]} documents           Document instances to be updated
   * @param {DatabaseUpdateOperation} operation   Parameters of the database update operation
   * @param {User} user                           The User requesting the update operation
   */
  static #onUpdateOperationMovement(documents, operation, user) {
    if ( !operation._movement ) return;
    for ( const document of documents ) {
      const movement = operation._movement[document.id];
      if ( !movement ) continue;
      document._onUpdateMovement(movement, operation, user);
      Hooks.callAll("moveToken", document, movement, operation, user);
      if ( (document.movement.id === movement.id) && movement.constrained ) {
        document._onMovementStopped();
        Hooks.callAll("stopToken", document);
      }
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle TOKEN_MOVE_WITHIN region events.
   * @param {TokenDocument[]} documents           Document instances to be updated
   * @param {DatabaseUpdateOperation} operation   Parameters of the database update operation
   * @param {User} user                           The User requesting the update operation
   */
  static #onUpdateHandleMoveWithinRegionEvents(documents, operation, user) {
    if ( !operation._movement ) return;
    for ( const token of documents ) {
      const movement = operation._movement[token.id];
      if ( !movement ) continue;
      const priorRegionIds = operation._priorRegions?.[token.id];

      // Don't trigger MOVE_WITHIN events if the token just moved into the region and trigger MOVE_WITHIN
      // events for movement out of the region at the exit position
      if ( priorRegionIds ) {
        for ( const id of priorRegionIds ) {
          const region = token.parent.regions.get(id);
          if ( !region ) continue;
          token.#handleMoveRegionEvent(REGION_EVENTS.TOKEN_MOVE_WITHIN, region, user, movement);
        }
      } else {
        for ( const region of token.regions ) {
          token.#handleMoveRegionEvent(REGION_EVENTS.TOKEN_MOVE_WITHIN, region, user, movement);
        }
      }
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle move region event.
   * @param {Extract<RegionEventType, "tokenMoveIn"|"tokenMoveOut"|"tokenMoveWithin">} name The region event type
   * @param {RegionDocument} region             The region
   * @param {User} user                         The user
   * @param {TokenMovementOperation} movement        The movement operation
   */
  #handleMoveRegionEvent(name, region, user, movement) {
    const token = this;
    const data = {token, movement};
    if ( name !== REGION_EVENTS.TOKEN_MOVE_WITHIN ) {
      Object.defineProperties(data, {
        /** @deprecated since v13 */
        segments: {
          get() {
            const segments = token.segmentizeRegionMovementPath(region, [this.movement.origin,
              ...this.movement.passed.waypoints]);
            Object.defineProperty(this, "segments", {get() {
              foundry.utils.logCompatibilityWarning("The segments property is deprecated. "
                + "Use the passed waypoints instead.", {since: 13, until: 15});
              return segments;
            }});
            return this.segments;
          },
          configurable: true
        },
        /** @deprecated since v13 */
        teleport: {
          get() {
            foundry.utils.logCompatibilityWarning("The teleport property is deprecated. "
              + "Use the action property of the passed waypoints instead.", {since: 13, until: 15});
            return CONFIG.Token.movement.actions[this.movement.passed.waypoints.at(-1).action].teleport;
          }
        },
        /** @deprecated since v13 */
        forced: {
          get() {
            foundry.utils.logCompatibilityWarning("The forced property is deprecated. "
              + "Use the action property of the passed waypoints instead.", {since: 13, until: 15});
            return this.movement.passed.waypoints.at(-1).action === "displace";
          }
        }
      });
    }
    // noinspection ES6MissingAwait
    region._handleEvent({name, data, region, user});
  }

  /* -------------------------------------------- */

  /**
   * Continue movement for tokens which are on a multi-checkpoint path of waypoints.
   * @param {TokenDocument[]} documents           Document instances to be updated
   * @param {DatabaseUpdateOperation} operation   Parameters of the database update operation
   * @param {User} user                           The User requesting the update operation
   * @returns {Promise<void>}                     This function must not be awaited!
   */
  static async #onUpdateContinueMovement(documents, operation, user) {
    if ( !operation._movement ) return;
    operation._movement._postWorkflow?.resolve();
    if ( !user.isSelf ) return; // Movement is continued by the user that initiated it
    const toContinueMaybe = [];
    for ( const token of documents ) {
      const movement = operation._movement[token.id];
      if ( !movement ) continue;
      const movementId = movement.id;

      // Protect against edge cases where movement changed during update workflow
      if ( token.movement.id !== movementId ) continue;

      // No pending movement
      if ( token.movement.state !== "pending" ) continue;

      toContinueMaybe.push({token, movementId});
    }
    if ( !toContinueMaybe.length ) return;

    // Break out of the current update workflow
    await new Promise(resolve => {
      setTimeout(resolve, 0);
    });

    // Continue movement if it was not paused before the movement animation completes
    for ( const {token, movementId} of toContinueMaybe ) {

      // Movement has changed
      if ( token.movement.id !== movementId ) return;

      // No pending movement
      if ( token.movement.state !== "pending" ) return;

      const maybeContinue = () => {

        // Movement has changed
        if ( token.movement.id !== movementId ) return;

        // No pending movement
        if ( token.movement.state !== "pending" ) return;

        token.#continueMovement(movementId);
      };
      // noinspection ES6MissingAwait
      if ( token._movementContinuation.waitPromise ) token._movementContinuation.waitPromise.then(maybeContinue);
      else maybeContinue();
    }
  }

  /* -------------------------------------------- */

  /** @override */
  static async _onDeleteOperation(documents, operation, user) {

    // Handle Region events
    const regionEvents = [];
    for ( const token of documents ) {
      for ( const region of token.regions ) {
        region.tokens.delete(token);
        regionEvents.push({
          name: REGION_EVENTS.TOKEN_EXIT,
          data: {token, movement: null},
          region,
          user
        });
      }
      token.regions.clear();
    }
    for ( const event of regionEvents ) {
      // noinspection ES6MissingAwait
      event.region._handleEvent(event);
    }

    // Update/delete Combatants
    if ( user.isSelf ) foundry.documents.Combat._onDeleteTokens(documents, operation, user);
  }

  /* -------------------------------------------- */

  /**
   * Are these changes moving the Token?
   * @overload
   * @param {object} changes    The (candidate) changes
   * @returns {boolean}         Is movement?
   * @internal
   */
  /**
   * Are these changes moving the Token from the given origin?
   * @overload
   * @param {object} changes          The (candidate) changes
   * @param {TokenPosition} origin    The origin
   * @returns {boolean}               Is movement?
   * @internal
   */
  static _isMovementUpdate(changes, origin) {
    if ( !origin ) return this.MOVEMENT_FIELDS.some(k => k in changes);
    return this.MOVEMENT_FIELDS.some(k => (k in changes) && (changes[k] !== origin[k]));
  }

  /* -------------------------------------------- */

  /**
   * Should the movement of this Token update be recorded in the movement history?
   * Called as part of the preUpdate workflow if the Token is moved.
   * @returns {boolean}    Should the movement of this Token update be recorded in the movement history?
   * @protected
   */
  _shouldRecordMovementHistory() {
    const combatant = this.combatant;
    if ( !combatant ) return false;
    return combatant.parent.started;
  }

  /* -------------------------------------------- */

  /**
   * Clear the movement history of this Token.
   * @returns {Promise<void>}
   */
  async clearMovementHistory() {
    if ( this._source._movementHistory.length === 0 ) return;
    await this.update({}, {diff: false, noHook: true, _clearMovementHistory: true});
  }

  /* -------------------------------------------- */

  /**
   * Is the Token document updated such that the Regions the Token is contained in may change?
   * Called as part of the preUpdate workflow.
   * @param {object} changes    The changes.
   * @returns {boolean}         Could this Token update change Region containment?
   * @protected
   */
  _couldRegionsChange(changes) {
    return TokenDocument._isMovementUpdate(changes);
  }

  /* -------------------------------------------- */

  /**
   * Test whether the Token is inside the Region.
   * This function determines the state of {@link TokenDocument#regions} and
   * {@link foundry.documents.RegionDocument#tokens}.
   * The Token and the Region must be in the same Scene.
   *
   * Implementations of this function are restricted in the following ways:
   *   - If the bounds (given by {@link TokenDocument#getSize}) of the Token do not intersect the
   *     Region, then the Token is not contained within the Region.
   *   - If the Token is inside the Region a particular elevation, then the Token is inside the Region at any elevation
   *     within the elevation range of the Region.
   *   - This function must not use prepared field values that are animated. In particular, it must use the source
   *     instead of prepared values of the following fields: `x`, `y`, `elevation`, `width`, `height`, and `shape`.
   *
   * If this function is overridden, then {@link TokenDocument#segmentizeRegionMovementPath} must be
   * overridden too.
   *
   * If an override of this function uses Token document fields other than `x`, `y`, `elevation`, `width`, `height`, and
   * `shape`, {@link TokenDocument#_couldRegionsChange} must be overridden to return true for changes
   * of these fields. If an override of this function uses non-Token properties other than `Scene#grid.type` and
   * `Scene#grid.size`,
   * {@link foundry.documents.Scene#updateTokenRegions} must be called when any of those properties change.
   * @overload
   * @param {RegionDocument} region                              The region.
   * @returns {boolean}                                          Is inside the Region?
   */
  /**
   * @overload
   * @param {RegionDocument} region                              The region.
   * @param {(Partial<ElevatedPoint & TokenDimensions>)} data    The position and dimensions. Defaults to the values of
   *                                                             the document source.
   * @returns {boolean}                                          Is inside the Region?
   */
  testInsideRegion(region, data={}) {
    if ( !this.parent || (this.parent !== region.parent) ) throw new Error("The Token and the Region must be in the same Scene");
    const {x, y, elevation, width, height, shape} = this._source;
    const inside = region.testPoint(this.getCenterPoint({x, y, elevation, width, height, shape, ...data}));
    return inside;
  }

  /* -------------------------------------------- */

  /**
   * Split the Token movement path through the Region into its segments.
   * The Token and the Region must be in the same Scene.
   *
   * Implementations of this function are restricted in the following ways:
   *   - The segments must go through the waypoints.
   *   - The *from* position matches the *to* position of the succeeding segment.
   *   - The Token must be contained (w.r.t. {@link TokenDocument#testInsideRegion}) within the Region
   *     at the *from* and *to* of MOVE segments.
   *   - The Token must be contained (w.r.t. {@link TokenDocument#testInsideRegion}) within the Region
   *     at the *to* position of ENTER segments.
   *   - The Token must be contained (w.r.t. {@link TokenDocument#testInsideRegion}) within the Region
   *     at the *from* position of EXIT segments.
   *   - The Token must not be contained (w.r.t. {@link TokenDocument#testInsideRegion}) within the
   *     Region at the *from* position of ENTER segments.
   *   - The Token must not be contained (w.r.t. {@link TokenDocument#testInsideRegion}) within the
   *     Region at the *to* position of EXIT segments.
   *   - This function must not use prepared field values that are animated. In particular, it must use the source
   *     instead of prepared values of the following fields: `x`, `y`, `elevation`, `width`, `height`, and `shape`.
   * @param {RegionDocument} region                           The region
   * @param {TokenSegmentizeMovementWaypoint[]} waypoints     The waypoints of movement
   * @returns {TokenRegionMovementSegment[]}                  The movement split into its segments
   */
  segmentizeRegionMovementPath(region, waypoints) {
    if ( !this.parent || (this.parent !== region.parent) ) throw new Error("The Token and the Region must be in the same Scene");
    if ( waypoints.length <= 1 ) return [];
    const samples = [{x: 0, y: 0}];
    const segments = [];
    const source = this._source;
    let {x=source.x, y=source.y, elevation=source.elevation,
      width: previousWidth=source.width, height: previousHeight=source.height,
      shape: previousShape=source.shape, action: previousAction=this.movementAction} = waypoints[0];
    let from = {x, y, elevation};
    for ( let i = 1; i < waypoints.length; i++ ) {
      let {x=from.x, y=from.y, elevation=from.elevation, width=previousWidth, height=previousHeight,
        shape=previousShape, action=previousAction, terrain=null, snapped=false} = waypoints[i];
      x = Math.round(x);
      y = Math.round(y);
      const to = {x, y, elevation, teleport: CONFIG.Token.movement.actions[action].teleport};
      const pivot = this.getCenterPoint({x: 0, y: 0, elevation, width, height, shape});
      samples[0].x = pivot.x;
      samples[0].y = pivot.y;

      if ( (width !== previousWidth) || (height !== previousHeight) || (shape !== previousShape) ) {
        const center = this.getCenterPoint({x: from.x, y: from.y, elevation: from.elevation,
          width: previousWidth, height: previousHeight, shape: previousShape});
        from.x = Math.round(center.x - pivot.x);
        from.y = Math.round(center.y - pivot.y);
        from.elevation = center.elevation - pivot.elevation;
      }

      for ( const segment of region.segmentizeMovementPath([from, to], samples) ) {
        delete segment.teleport;
        segment.action = action;
        segment.terrain = terrain ? terrain.clone() : null;
        segment.snapped = snapped;
        const {from, to} = segment;
        from.width = width;
        from.height = height;
        from.shape = shape;
        to.width = width;
        to.height = height;
        to.shape = shape;
        segments.push(segment);
      }

      from = to;
      previousWidth = width;
      previousHeight = height;
      previousShape = shape;
      previousAction = action;
    }
    return segments;
  }

  /* -------------------------------------------- */
  /*  Actor Delta Operations                      */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _preCreateDescendantDocuments(parent, collection, data, options, userId) {
    // Support the special case descendant document changes within an ActorDelta.
    // The descendant documents themselves are configured to have a synthetic Actor as their parent.
    // We need this to ensure that the ActorDelta receives these events which do not bubble up.
    if ( parent !== this.delta ) this.delta?._handleDeltaCollectionUpdates(parent);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _preUpdateDescendantDocuments(parent, collection, changes, options, userId) {
    if ( parent !== this.delta ) this.delta?._handleDeltaCollectionUpdates(parent);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _preDeleteDescendantDocuments(parent, collection, ids, options, userId) {
    if ( parent !== this.delta ) this.delta?._handleDeltaCollectionUpdates(parent);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onCreateDescendantDocuments(parent, collection, documents, data, options, userId) {
    super._onCreateDescendantDocuments(parent, collection, documents, data, options, userId);
    this._onRelatedUpdate(data, options);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onUpdateDescendantDocuments(parent, collection, documents, changes, options, userId) {
    super._onUpdateDescendantDocuments(parent, collection, documents, changes, options, userId);
    this._onRelatedUpdate(changes, options);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onDeleteDescendantDocuments(parent, collection, documents, ids, options, userId) {
    super._onDeleteDescendantDocuments(parent, collection, documents, ids, options, userId);
    this._onRelatedUpdate({}, options);
  }

  /* -------------------------------------------- */

  /**
   * When the base Actor for a TokenDocument changes, we may need to update its Actor instance
   * @param {object} [update={}]                               The update delta
   * @param {Partial<DatabaseUpdateOperation>} [options={}]    The database operation that was performed
   * @internal
   */
  _onUpdateBaseActor(update={}, options={}) {

    // Update synthetic Actor data
    if ( !this.isLinked && this.delta ) {
      this.delta.updateSyntheticActor();
      for ( const collection of Object.values(this.delta.collections) ) collection.initialize({ full: true });
      this.actor.render(false, {renderContext: "updateActor"});
    }

    this._onRelatedUpdate(update, options);
  }

  /* -------------------------------------------- */

  /**
   * Whenever the token's actor delta changes, or the base actor changes, perform associated refreshes.
   * @param {object|object[]} [update] The update delta
   * @param {Partial<DatabaseOperation>} [operation] The database operation that was performed
   * @protected
   */
  _onRelatedUpdate(update={}, operation={}) {
    // Update tracked Combat resource
    const combatant = this.combatant;
    if ( combatant ) {
      const isActorUpdate = [this, null, undefined].includes(operation.parent);
      const resource = game.combat.settings.resource;
      const updates = Array.isArray(update) ? update : [update];
      if ( isActorUpdate && resource && updates.some(u => foundry.utils.hasProperty(u.system ?? {}, resource)) ) {
        combatant.updateResource();
      }
      ui.combat.render();
    }

    // Trigger redraws on the token
    if ( this.parent.isView ) {
      if ( this.object?.hasActiveHUD ) canvas.tokens.hud.render();
      this.object?.renderFlags.set({refreshBars: true, redrawEffects: true});
      const TokenConfig = foundry.applications.sheets.TokenConfig;
      const configs = foundry.applications.instances.values().filter(a => a instanceof TokenConfig);
      for ( const app of configs ) {
        app.preview?.updateSource({delta: this.toObject().delta}, {diff: false, recursive: false});
        app.preview?.object?.renderFlags.set({refreshBars: true, redrawEffects: true});
      }
    }
  }

  /* -------------------------------------------- */

  /**
   * Get an Array of attribute choices which could be tracked for Actors in the Combat Tracker
   * @param {object|DataModel|typeof DataModel|SchemaField|string} [data]  The object to explore for attributes, or an
   *                                                                       Actor type.
   * @param {string[]} [_path]
   * @returns {TrackedAttributesDescription}
   */
  static getTrackedAttributes(data, _path=[]) {

    // Case 1 - Infer attributes from schema structure.
    if ( (data instanceof foundry.abstract.DataModel) || foundry.utils.isSubclass(data, foundry.abstract.DataModel) ) {
      return this._getTrackedAttributesFromSchema(data.schema, _path);
    }
    if ( data instanceof foundry.data.fields.SchemaField ) return this._getTrackedAttributesFromSchema(data, _path);

    // Case 2 - Infer attributes from object structure.
    if ( ["Object", "Array"].includes(foundry.utils.getType(data)) ) {
      return this._getTrackedAttributesFromObject(data, _path);
    }

    // Case 3 - Retrieve explicitly configured attributes.
    if ( !data || (typeof data === "string") ) {
      const config = this._getConfiguredTrackedAttributes(data);
      if ( config ) return config;
      data = undefined;
    }

    // Track the path and record found attributes
    if ( data !== undefined ) return {bar: [], value: []};

    // Case 4 - Infer attributes from system template.
    const bar = new Set();
    const value = new Set();
    for ( const [type, model] of Object.entries(game.model.Actor) ) {
      const dataModel = CONFIG.Actor.dataModels?.[type];
      const inner = this.getTrackedAttributes(dataModel ?? model, _path);
      inner.bar.forEach(attr => bar.add(attr.join(".")));
      inner.value.forEach(attr => value.add(attr.join(".")));
    }

    return {
      bar: Array.from(bar).map(attr => attr.split(".")),
      value: Array.from(value).map(attr => attr.split("."))
    };
  }

  /* -------------------------------------------- */

  /**
   * Retrieve an Array of attribute choices from a plain object.
   * @param {object} data  The object to explore for attributes.
   * @param {string[]} _path
   * @returns {TrackedAttributesDescription}
   * @protected
   */
  static _getTrackedAttributesFromObject(data, _path=[]) {
    const attributes = {bar: [], value: []};
    // Recursively explore the object
    for ( const [k, v] of Object.entries(data) ) {
      const p = _path.concat([k]);

      // Check objects for both a "value" and a "max"
      if ( v instanceof Object ) {
        if ( k === "_source" ) continue;
        const isBar = ("value" in v) && ("max" in v);
        if ( isBar ) attributes.bar.push(p);
        else {
          const inner = this.getTrackedAttributes(data[k], p);
          attributes.bar.push(...inner.bar);
          attributes.value.push(...inner.value);
        }
      }

      // Otherwise, identify values which are numeric or null
      else if ( Number.isNumeric(v) || (v === null) ) {
        attributes.value.push(p);
      }
    }
    return attributes;
  }

  /* -------------------------------------------- */

  /**
   * Retrieve an Array of attribute choices from a SchemaField.
   * @param {SchemaField} schema  The schema to explore for attributes.
   * @param {string[]} _path
   * @returns {TrackedAttributesDescription}
   * @protected
   */
  static _getTrackedAttributesFromSchema(schema, _path=[]) {
    const attributes = {bar: [], value: []};
    for ( const [name, field] of Object.entries(schema.fields) ) {
      const p = _path.concat([name]);
      if ( field instanceof foundry.data.fields.NumberField ) attributes.value.push(p);
      const isSchema = field instanceof foundry.data.fields.SchemaField;
      const isModel = field instanceof foundry.data.fields.EmbeddedDataField;
      if ( isSchema || isModel ) {
        const schema = isModel ? field.model.schema : field;
        const isBar = schema.has("value") && schema.has("max");
        if ( isBar ) attributes.bar.push(p);
        else {
          const inner = this.getTrackedAttributes(schema, p);
          attributes.bar.push(...inner.bar);
          attributes.value.push(...inner.value);
        }
      }
    }
    return attributes;
  }

  /* -------------------------------------------- */

  /**
   * Retrieve any configured attributes for a given Actor type.
   * @param {string} [type]  The Actor type.
   * @returns {TrackedAttributesDescription|void}
   * @protected
   */
  static _getConfiguredTrackedAttributes(type) {

    // If trackable attributes are not configured fallback to the system template
    if ( foundry.utils.isEmpty(CONFIG.Actor.trackableAttributes) ) return;

    // If the system defines trackableAttributes per type
    let config = foundry.utils.deepClone(CONFIG.Actor.trackableAttributes[type]);

    // Otherwise union all configured trackable attributes
    if ( foundry.utils.isEmpty(config) ) {
      const bar = new Set();
      const value = new Set();
      for ( const attrs of Object.values(CONFIG.Actor.trackableAttributes) ) {
        attrs.bar.forEach(bar.add, bar);
        attrs.value.forEach(value.add, value);
      }
      config = { bar: Array.from(bar), value: Array.from(value) };
    }

    // Split dot-separate attribute paths into arrays
    Object.keys(config).forEach(k => config[k] = config[k].map(attr => attr.split(".")));
    return config;
  }

  /* -------------------------------------------- */

  /**
   * Inspect the Actor data model and identify the set of attributes which could be used for a Token Bar.
   * @param {object} attributes       The tracked attributes which can be chosen from
   * @returns {object}                A nested object of attribute choices to display
   */
  static getTrackedAttributeChoices(attributes) {
    attributes = attributes || this.getTrackedAttributes();
    const barGroup = game.i18n.localize("TOKEN.BarAttributes");
    const valueGroup = game.i18n.localize("TOKEN.BarValues");
    const bars = attributes.bar.map(v => {
      const a = v.join(".");
      return {group: barGroup, value: a, label: a};
    });
    bars.sort((a, b) => a.value.compare(b.value));
    const values = attributes.value.map(v => {
      const a = v.join(".");
      return {group: valueGroup, value: a, label: a};
    });
    values.sort((a, b) => a.value.compare(b.value));
    return bars.concat(values);
  }

  /* -------------------------------------------- */
  /*  Deprecations                                */
  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  async toggleActiveEffect(effectData, {overlay=false, active}={}) {
    foundry.utils.logCompatibilityWarning("TokenDocument#toggleActiveEffect is deprecated in favor of "
      + "Actor#toggleStatusEffect", {since: 12, until: 14});
    if ( !this.actor || !effectData.id ) return false;
    return !!(await this.actor.toggleStatusEffect(effectData.id, {active, overlay}));
  }
}

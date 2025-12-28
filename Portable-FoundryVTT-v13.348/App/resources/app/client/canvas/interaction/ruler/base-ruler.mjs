import User from "@client/documents/user.mjs";
import {GRID_SNAPPING_MODES} from "@common/constants.mjs";
import {RenderFlagsMixin} from "../render-flags.mjs";

/**
 * @import {ElevatedPoint, Point} from "@common/_types.mjs";
 */

/**
 * The ruler that is used to measure distances on the Canvas.
 * @mixes RenderFlagsMixin
 */
export default class BaseRuler extends RenderFlagsMixin() {
  /**
   * @param {User} user    The User for whom to construct the Ruler instance
   */
  constructor(user) {
    super();
    if ( !(user instanceof User) ) throw new Error("The BaseRuler may only be constructed with a User instance.");
    this.#user = user;
  }

  /* -------------------------------------------- */

  /** @override */
  static RENDER_FLAGS = {refresh: {}};

  /* -------------------------------------------- */

  /**
   * Is the Ruler ready to measure?
   * @type {boolean}
   */
  static get canMeasure() {
    return canvas.tokens.active && (game.activeTool === "ruler");
  }

  /* -------------------------------------------- */

  /**
   * Snaps the given point to the grid.
   * @param {Point} point    The point that is to be snapped
   * @returns {Point}        The snapped point
   */
  static getSnappedPoint(point) {
    let mode = GRID_SNAPPING_MODES.CENTER | GRID_SNAPPING_MODES.VERTEX | GRID_SNAPPING_MODES.EDGE_MIDPOINT;
    if ( canvas.grid.isSquare ) mode |= GRID_SNAPPING_MODES.CORNER;
    return canvas.grid.getSnappedPoint({x: point.x, y: point.y}, {mode, resolution: 1});
  }

  /* -------------------------------------------- */

  /**
   * The User who this Ruler belongs to.
   * @type {User}
   */
  get user() {
    return this.#user;
  }

  #user;

  /* -------------------------------------------- */

  /**
   * Is this Ruler active? True, if the path of the Ruler is nonempty.
   * @type {boolean}
   */
  get active() {
    return this.#path.length !== 0;
  }

  /* -------------------------------------------- */

  /**
   * The Ruler is visible if it is active and either not hidden or its User is the current User.
   * @type {boolean}
   */
  get visible() {
    return this.active && (!this.hidden || this.user.isSelf);
  }

  /* -------------------------------------------- */

  /**
   * The sequence of points that the Ruler measures.
   * @type {ReadonlyArray<Readonly<ElevatedPoint>>}
   * @defaultValue []
   */
  get path() {
    return this.#path;
  }

  /**
   * Set the sequence of points that the Ruler measures.
   */
  set path(value) {
    if ( this.#path.equals(value) ) return;
    this.#path = Object.freeze(value.map(({x, y, elevation}) => Object.freeze({x, y, elevation})));
    this._onPathChange();
  }

  #path = [];

  /* -------------------------------------------- */

  /**
   * The first point of the path, or undefined if the path is empty.
   * @type {ElevatedPoint|undefined}
   */
  get origin() {
    return this.#path.at(0);
  }

  /* -------------------------------------------- */

  /**
   * The last point of the path, or undefined if the path is empty.
   * @type {ElevatedPoint|undefined}
   */
  get destination() {
    return this.#path.at(-1);
  }

  /* -------------------------------------------- */

  /**
   * Is this Ruler hidden? If true, only the User of the Ruler can see it.
   * @type {boolean}
   * @defaultValue false
   */
  get hidden() {
    return this.#hidden;
  }

  set hidden(value) {
    if ( this.#hidden === value ) return;
    this.#hidden = value;
    this._onHiddenChange();
  }

  #hidden = false;

  /* -------------------------------------------- */

  /**
   * Called when the Ruler's path has changed.
   * @protected
   */
  _onPathChange() {
    this.refresh();
    if ( this.user.isSelf ) this.#throttleBroadcast();
  }

  /* -------------------------------------------- */

  /**
   * Called when the Ruler becomes hidden or unhidden.
   * @protected
   */
  _onHiddenChange() {
    this.refresh();
    if ( this.user.isSelf ) this.#throttleBroadcast();
  }

  /* -------------------------------------------- */

  /**
   * Reset the path and the hidden state of the Ruler.
   */
  reset() {
    this.path = [];
    this.hidden = false;
  }

  /* -------------------------------------------- */
  /*  Broadcasting                                */
  /* -------------------------------------------- */

  /**
   * A throttled function that broadcasts the Ruler data.
   * @type {() => void}
   */
  #throttleBroadcast = foundry.utils.throttle(this.#broadcast.bind(this), 100);

  /* -------------------------------------------- */

  /**
   * Broadcast the Ruler data.
   */
  #broadcast() {
    this.user.broadcastActivity({ruler: this.user.hasPermission("SHOW_RULER") ? {path: this.#path, hidden: this.#hidden} : null});
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /**
   * Draw the Ruler.
   * @abstract
   */
  async draw() {
    throw new Error("A subclass of the BaseRuler must implement the draw method.");
  }

  /* -------------------------------------------- */

  /**
   * Destroy the Ruler.
   * @abstract
   */
  destroy() {
    throw new Error("A subclass of the BaseRuler must implement the destroy method.");
  }

  /* -------------------------------------------- */

  /**
   * Refresh the Ruler.
   */
  refresh() {
    this.renderFlags.set({refresh: true});
  }

  /* -------------------------------------------- */

  /**
   * Refresh the Ruler.
   * @protected
   * @abstract
   */
  _refresh() {
    throw new Error("A subclass of the BaseRuler must implement the _refresh method.");
  }

  /* -------------------------------------------- */

  /** @override */
  applyRenderFlags() {
    if ( !this.renderFlags.size ) return;
    const flags = this.renderFlags.clear();
    if ( flags.refresh ) this._refresh();
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /**
   * Add a waypoint.
   * @param {Point} point                     The (unsnapped) waypoint
   * @param {object} [options]                Additional options
   * @param {boolean} [options.snap=false]    Snap the added waypoint?
   * @protected
   */
  _addDragWaypoint(point, {snap=false}={}) {
    const {x, y} = point;
    point = {x, y};
    if ( snap ) point = this.constructor.getSnappedPoint(point);
    point.elevation = this.path.at(-1).elevation;
    const lastPoint = this.path.at(-2);
    if ( (lastPoint.x === point.x) && (lastPoint.y === point.y) && (lastPoint.elevation === point.elevation) ) return;
    this.path = [...this.path.slice(0, -1), point, point];
  }

  /* -------------------------------------------- */

  /**
   * Remove the second to last waypoint.
   * @protected
   */
  _removeDragWaypoint() {
    if ( this.path.length > 2 ) this.path = this.path.toSpliced(-2, 1);
    else this.reset();
  }

  /* -------------------------------------------- */

  /**
   * Change the elevation of the destination.
   * @param {number} delta                       The number vertical steps
   * @param {object} [options]                   Additional options
   * @param {boolean} [options.precise=false]    Round elevations to multiples of the grid distance divided by
   *                                             `CONFIG.Canvas.elevationSnappingPrecision`?
   *                                             If false, rounds to multiples of the grid distance.
   * @protected
   */
  _changeDragElevation(delta, {precise=false}={}) {
    const interval = canvas.dimensions.distance / (precise ? CONFIG.Canvas.elevationSnappingPrecision : 1);
    let {x, y, elevation} = this.path.at(-1);
    elevation = (elevation + (delta * interval)).toNearest(interval, delta > 0 ? "floor" : "ceil");
    this.path = [...this.path.slice(0, -1), {x, y, elevation}];
  }

  /* -------------------------------------------- */

  /**
   * Handle the beginning of a new Ruler measurement workflow.
   * @param {PIXI.FederatedEvent} event    The drag start event
   * @protected
   */
  _onDragStart(event) {
    const {origin: {x: x0, y: y0}, destination: {x: x1, y: y1}} = event.interactionData;
    let origin = {x: x0, y: y0};
    let destination = {x: x1, y: y1};
    if ( !event.shiftKey ) {
      origin = this.constructor.getSnappedPoint(origin);
      destination = this.constructor.getSnappedPoint(destination);
    }
    origin.elevation = destination.elevation = 0;
    this.path = [origin, destination];
    this.hidden = event.altKey;
    event.interactionData.cancelled = false;
    event.interactionData.released = false;
  }

  /* -------------------------------------------- */

  /**
   * Handle the end of the Ruler measurement workflow
   * @param {PIXI.FederatedEvent} event    The drag cancel event
   * @returns {boolean|void}               If false, the cancellation of the drag workflow is prevented
   * @protected
   */
  _onDragCancel(event) {
    if ( !event.interactionData.cancelled ) {
      if ( event.interactionData.released ) {
        if ( this.path.length >= 2 ) return false;
      } else if ( this.path.length > 2 ) {
        this._removeDragWaypoint();
        return false;
      }
    }
    this.reset();
  }

  /* -------------------------------------------- */

  /**
   * Handle left-click events on the Canvas during Ruler measurement.
   * @param {PIXI.FederatedEvent} event    The pointer-down event
   * @protected
   */
  _onClickLeft(event) {
    const isCtrl = event.ctrlKey || event.metaKey;
    if ( !isCtrl ) {
      event.interactionData.cancelled = true;
      canvas.mouseInteractionManager.cancel(event);
      return;
    }
    this._addDragWaypoint(event.interactionData.origin, {snap: !event.shiftKey});
  }

  /* -------------------------------------------- */

  /**
   * Handle right-click events on the Canvas during Ruler measurement.
   * @param {PIXI.FederatedEvent} event    The pointer-down event
   * @protected
   */
  _onClickRight(event) {
    this._removeDragWaypoint();
    if ( this.active ) canvas.mouseInteractionManager._dragRight = false;
    else {
      event.interactionData.cancelled = true;
      canvas.mouseInteractionManager.cancel(event);
    }
  }

  /* -------------------------------------------- */

  /**
   * Continue a Ruler measurement workflow for left-mouse movements on the Canvas.
   * @param {PIXI.FederatedEvent} event    The mouse move event
   * @protected
   */
  _onMouseMove(event) {
    if ( !this.active ) return;
    const {x, y} = event.interactionData.destination;
    let point = {x, y};
    if ( !event.shiftKey ) point = this.constructor.getSnappedPoint(point);
    point.elevation = this.path.at(-1).elevation;
    this.path = [...this.path.slice(0, -1), point];
  }

  /* -------------------------------------------- */

  /**
   * Conclude a Ruler measurement workflow by releasing the left-mouse button.
   * @param {PIXI.FederatedEvent} event   The pointer-up event
   * @protected
   */
  _onMouseUp(event) {
    const isCtrl = event.ctrlKey || event.metaKey;
    if ( isCtrl || event.interactionData.released ) {
      if ( !event.interactionData.released ) {
        event.interactionData.released = true;
        event.preventDefault();
      }
    } else {
      event.interactionData.cancelled = true;
      canvas.mouseInteractionManager.cancel(event);
    }
  }

  /* -------------------------------------------- */

  /**
   * Adjust the elevation of Ruler waypoints by scrolling up/down.
   * @param {WheelEvent} event    The mousewheel event
   * @protected
   */
  _onMouseWheel(event) {
    const isCtrl = game.keyboard.isModifierActive("CONTROL"); // We cannot trust event.ctrlKey because of touchpads
    if ( !isCtrl ) return;
    this._changeDragElevation(-Math.sign(event.delta), {precise: event.shiftKey});
  }

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /**
   * @deprecated since v13
   * @ignore
   */
  clear() {
    foundry.utils.logCompatibilityWarning("BaseRuler#clear is deprecated in favor of BaseRuler#reset.",
      {since: 13, until: 15, once: true});
    this.reset();
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v13
   * @ignore
   */
  update(data) {
    foundry.utils.logCompatibilityWarning("BaseRuler#update is deprecated. Set BaseRuler#path and BaseRuler#hidden instead.",
      {since: 13, until: 15, once: true});
    data ??= {path: [], hidden: false};
    if ( "path" in data ) this.path = data.path;
    if ( "hidden" in data ) this.hidden = data.hidden;
  }
}

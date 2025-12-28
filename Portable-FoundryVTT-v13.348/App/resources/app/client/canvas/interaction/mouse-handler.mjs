import {throttle} from "../../../common/utils/helpers.mjs";

/**
 * @import {ControlIcon} from "../containers/_module.mjs";
 */

/**
 * Handle mouse interaction events for a Canvas object.
 * There are three phases of events: hover, click, and drag
 *
 * Hover Events:
 * _handlePointerOver
 *  action: hoverIn
 * _handlePointerOut
 *  action: hoverOut
 *
 * Left Click and Double-Click
 * _handlePointerDown
 *  action: clickLeft
 *  action: clickLeft2
 *  action: unclickLeft
 *
 * Right Click and Double-Click
 * _handleRightDown
 *  action: clickRight
 *  action: clickRight2
 *  action: unclickRight
 *
 * Drag and Drop
 * _handlePointerMove
 *  action: dragLeftStart
 *  action: dragRightStart
 *  action: dragLeftMove
 *  action: dragRightMove
 * _handlePointerUp
 *  action: dragLeftDrop
 *  action: dragRightDrop
 * _handleDragCancel
 *  action: dragLeftCancel
 *  action: dragRightCancel
 */
export default class MouseInteractionManager {
  /**
   * @param {PIXI.DisplayObject} object              The Canvas object (e.g., a Token, Tile, or Drawing) to which
   *                                                 mouse events should be bound.
   * @param {PIXI.Container} layer                   The Canvas Layer that contains the object.
   * @param {object} [permissions={}]                An object of permission checks, keyed by action name, which return
   *                                                 a boolean or invoke a function for whether the action is allowed.
   * @param {object} [callbacks={}]                  An object of callback functions, keyed by action name, which will
   *                                                 be executed during the event workflow (e.g., hoverIn, clickLeft).
   * @param {object} [options={}]                    Additional options that configure interaction behavior.
   * @param {string} [options.target]                If provided, the property name on `object` which references a
   *                                                 {@link foundry.canvas.containers.ControlIcon}.
   *                                                 This is used to set {@link MouseInteractionManager#controlIcon}.
   * @param {number} [options.dragResistance=10]     A minimum number of pixels the mouse must move before a drag is
   *                                                 initiated.
   * @param {PIXI.Application} [options.application] A specific PIXI Application to use for pointer event handling
   *                                                 defaults to `canvas.app` if not provided.
   */
  constructor(object, layer, permissions={}, callbacks={}, options={}) {
    this.#app = options.application ?? canvas.app;
    this.object = object;
    this.layer = layer;
    this.permissions = permissions;
    this.callbacks = callbacks;

    /**
     * Interaction options which configure handling workflows
     * @type {{target: PIXI.DisplayObject, dragResistance: number}}
     */
    this.options = options;

    /**
     * The current interaction state
     * @type {number}
     */
    this.state = this.states.NONE;

    /**
     * Bound interaction data object to populate with custom data.
     * @type {Record<string, any>}
     */
    this.interactionData = {};

    /**
     * The drag handling time
     * @type {number}
     */
    this.dragTime = 0;

    /**
     * The time of the last left-click event
     * @type {number}
     */
    this.lcTime = 0;

    /**
     * The time of the last right-click event
     * @type {number}
     */
    this.rcTime = 0;

    /**
     * A flag for whether we are right-click dragging
     * @type {boolean}
     * @internal
     */
    this._dragRight = false;

    /**
     * An optional ControlIcon instance for the object
     * @type {ControlIcon|null}
     */
    this.controlIcon = this.options.target ? this.object[this.options.target] : null;

    /**
     * The view id pertaining to the PIXI Application.
     * If not provided, default to canvas.app.view.id
     * @type {string}
     */
    this.viewId = this.#app.view.id;
  }

  /**
   * The client position of the last left/right-click.
   * @type {PIXI.Point}
   */
  lastClick = new PIXI.Point();

  /**
   * The PIXI.Application which this manager is being used for.
   * @type {PIXI.Application}
   */
  #app;

  /**
   * Bound handlers which can be added and removed
   * @type {Record<string, Function>}
   */
  #handlers = {};

  /**
   * Enumerate the states of a mouse interaction workflow.
   * 0: NONE - the object is inactive
   * 1: HOVER - the mouse is hovered over the object
   * 2: CLICKED - the object is clicked
   * 3: GRABBED - the object is grabbed
   * 4: DRAG - the object is being dragged
   * 5: DROP - the object is being dropped
   * @enum {number}
   */
  static INTERACTION_STATES = {
    NONE: 0,
    HOVER: 1,
    CLICKED: 2,
    GRABBED: 3,
    DRAG: 4,
    DROP: 5
  };

  /**
   * Enumerate the states of handle outcome.
   * -2: SKIPPED - the handler has been skipped by previous logic
   * -1: DISALLOWED - the handler has dissallowed further process
   *  1: REFUSED - the handler callback has been processed and is refusing further process
   *  2: ACCEPTED - the handler callback has been processed and is accepting further process
   * @enum {number}
   */
  static #HANDLER_OUTCOME = {
    SKIPPED: -2,
    DISALLOWED: -1,
    REFUSED: 1,
    ACCEPTED: 2
  };

  /**
   * The minimum distance, measured in screen-coordinate pixels, that a pointer must move to initiate a drag operation.
   * This default value can be overridden by specifying the `dragResistance` option when invoking the constructor.
   * @type {number}
   */
  static DEFAULT_DRAG_RESISTANCE_PX = 10;

  /**
   * The maximum number of milliseconds between two clicks to be considered a double-click.
   * @type {number}
   */
  static DOUBLE_CLICK_TIME_MS = 250;

  /**
   * The maximum number of pixels between two clicks to be considered a double-click.
   * @type {number}
   */
  static DOUBLE_CLICK_DISTANCE_PX = 5;

  /**
   * The number of milliseconds of mouse click depression to consider it a long press.
   * @type {number}
   */
  static LONG_PRESS_DURATION_MS = 500;

  /**
   * Global timeout for the long-press event.
   * @type {number|null}
   */
  static longPressTimeout = null;

  /* -------------------------------------------- */

  /**
   * Emulate a pointermove event on the main game canvas.
   * This method must be called when an object with the static event mode or any of its parents is transformed
   * or its visibility is changed.
   */
  static emulateMoveEvent() {
    MouseInteractionManager.#emulateMoveEvent();
  }

  static #emulateMoveEvent = throttle(() => {
    const events = canvas.app.renderer.events;
    const rootPointerEvent = events.rootPointerEvent;
    if ( !events.supportsPointerEvents ) return;
    if ( events.supportsTouchEvents && (rootPointerEvent.pointerType === "touch") ) return;
    events.domElement.dispatchEvent(new PointerEvent("pointermove", {
      pointerId: rootPointerEvent.pointerId,
      pointerType: rootPointerEvent.pointerType,
      isPrimary: rootPointerEvent.isPrimary,
      clientX: rootPointerEvent.clientX,
      clientY: rootPointerEvent.clientY,
      pageX: rootPointerEvent.pageX,
      pageY: rootPointerEvent.pageY,
      altKey: rootPointerEvent.altKey,
      ctrlKey: rootPointerEvent.ctrlKey,
      metaKey: rootPointerEvent.metaKey,
      shiftKey: rootPointerEvent.shiftKey
    }));
  }, 10);

  /* -------------------------------------------- */

  /**
   * Get the target.
   * @type {PIXI.DisplayObject}
   */
  get target() {
    return this.options.target ? this.object[this.options.target] : this.object;
  }

  /**
   * Is this mouse manager in a dragging state?
   * @type {boolean}
   */
  get isDragging() {
    return this.state >= this.states.DRAG;
  }

  /* -------------------------------------------- */

  /**
   * Activate interactivity for the handled object
   */
  activate() {

    // Remove existing listeners
    this.state = this.states.NONE;
    this.target.removeAllListeners();

    // Create bindings for all handler functions
    this.#handlers = {
      pointerover: this.#handlePointerOver.bind(this),
      pointerout: this.#handlePointerOut.bind(this),
      pointerdown: this.#handlePointerDown.bind(this),
      pointermove: this.#handlePointerMove.bind(this),
      pointerup: this.#handlePointerUp.bind(this),
      contextmenu: this.#handleDragCancel.bind(this)
    };

    // Activate hover events to start the workflow
    this.#activateHoverEvents();

    // Set the target as interactive
    this.target.eventMode = "static";
    return this;
  }

  /* -------------------------------------------- */

  /**
   * Test whether the current user has permission to perform a step of the workflow
   * @param {string} action     The action being attempted
   * @param {Event|PIXI.FederatedEvent} event The event being handled
   * @returns {boolean}         Can the action be performed?
   */
  can(action, event) {
    const fn = this.permissions[action];
    if ( typeof fn === "boolean" ) return fn;
    if ( fn instanceof Function ) return fn.call(this.object, game.user, event);
    return true;
  }

  /* -------------------------------------------- */

  /**
   * Execute a callback function associated with a certain action in the workflow
   * @param {string} action     The action being attempted
   * @param {Event|PIXI.FederatedEvent} event The event being handled
   * @param {...*} args         Additional callback arguments.
   * @returns {boolean}         A boolean which may indicate that the event was handled by the callback.
   *                            Events which do not specify a callback are assumed to have been handled as no-op.
   */
  callback(action, event, ...args) {
    const fn = this.callbacks[action];
    if ( fn instanceof Function ) {
      this.#assignInteractionData(event);
      return fn.call(this.object, event, ...args) ?? true;
    }
    return true;
  }

  /* -------------------------------------------- */

  /**
   * A reference to the possible interaction states which can be observed
   * @returns {Record<string, number>}
   */
  get states() {
    return this.constructor.INTERACTION_STATES;
  }

  /* -------------------------------------------- */

  /**
   * A reference to the possible interaction states which can be observed
   * @returns {Record<string, number>}
   */
  get handlerOutcomes() {
    return MouseInteractionManager.#HANDLER_OUTCOME;
  }

  /* -------------------------------------------- */
  /*  Listener Activation and Deactivation        */
  /* -------------------------------------------- */

  /**
   * Activate a set of listeners which handle hover events on the target object
   */
  #activateHoverEvents() {
    // Disable and re-register mouseover and mouseout handlers
    this.target.off("pointerover", this.#handlers.pointerover).on("pointerover", this.#handlers.pointerover);
    this.target.off("pointerout", this.#handlers.pointerout).on("pointerout", this.#handlers.pointerout);
  }

  /* -------------------------------------------- */

  /**
   * Activate a new set of listeners for click events on the target object.
   */
  #activateClickEvents() {
    this.#deactivateClickEvents();
    this.target.on("pointerdown", this.#handlers.pointerdown);
    this.target.on("pointerup", this.#handlers.pointerup);
    this.target.on("pointerupoutside", this.#handlers.pointerup);
  }

  /* -------------------------------------------- */

  /**
   * Deactivate event listeners for click events on the target object.
   */
  #deactivateClickEvents() {
    this.target.off("pointerdown", this.#handlers.pointerdown);
    this.target.off("pointerup", this.#handlers.pointerup);
    this.target.off("pointerupoutside", this.#handlers.pointerup);
  }

  /* -------------------------------------------- */

  /**
   * Activate events required for handling a drag-and-drop workflow
   */
  #activateDragEvents() {
    this.#deactivateDragEvents();
    this.layer.on("pointermove", this.#handlers.pointermove);
    if ( !this._dragRight ) {
      this.#app.view.addEventListener("contextmenu", this.#handlers.contextmenu, {capture: true});
    }
  }

  /* -------------------------------------------- */

  /**
   * Deactivate events required for handling drag-and-drop workflow.
   * @param {boolean} [silent]      Set to true to activate the silent mode.
   */
  #deactivateDragEvents(silent) {
    this.layer.off("pointermove", this.#handlers.pointermove);
    this.#app.view.removeEventListener("contextmenu", this.#handlers.contextmenu, {capture: true});
  }

  /* -------------------------------------------- */
  /*  Hover In and Hover Out                      */
  /* -------------------------------------------- */

  /**
   * Handle mouse-over events which activate downstream listeners and do not stop propagation.
   * @param {PIXI.FederatedEvent} event
   */
  #handlePointerOver(event) {
    const action = "hoverIn";
    if ( (this.state !== this.states.NONE) || (event.nativeEvent && (event.nativeEvent.target.id !== this.viewId)) ) {
      return this.#debug(action, event, this.handlerOutcomes.SKIPPED);
    }
    if ( !this.can(action, event) ) return this.#debug(action, event, this.handlerOutcomes.DISALLOWED);

    // Invoke the callback function
    this.state = this.states.HOVER;
    if ( this.callback(action, event) === false ) {
      this.state = this.states.NONE;
      return this.#debug(action, event, this.handlerOutcomes.REFUSED);
    }

    // Activate click events
    this.#activateClickEvents();
    return this.#debug(action, event);
  }

  /* -------------------------------------------- */

  /**
   * Handle mouse-out events which terminate hover workflows and do not stop propagation.
   * @param {PIXI.FederatedEvent} event
   */
  #handlePointerOut(event) {
    if ( event.pointerType === "touch" ) return; // Ignore Touch events
    const action = "hoverOut";
    if ( !this.state.between(this.states.HOVER, this.states.CLICKED)
      || (event.nativeEvent && (event.nativeEvent.target.id !== this.viewId) ) ) {
      return this.#debug(action, event, this.handlerOutcomes.SKIPPED);
    }
    if ( !this.can(action, event) ) return this.#debug(action, event, this.handlerOutcomes.DISALLOWED);

    // Was the mouse-out event handled by the callback?
    const priorState = this.state;
    this.state = this.states.NONE;
    if ( this.callback(action, event) === false ) {
      this.state = priorState;
      return this.#debug(action, event, this.handlerOutcomes.REFUSED);
    }

    // Deactivate click events
    this.#deactivateClickEvents();
    return this.#debug(action, event);
  }

  /* -------------------------------------------- */

  /**
   * Handle mouse-down events which activate downstream listeners.
   * @param {PIXI.FederatedEvent} event
   */
  #handlePointerDown(event) {
    if ( event.button === 0 ) return this.#handleLeftDown(event);
    if ( event.button === 2 ) return this.#handleRightDown(event);
  }

  /* -------------------------------------------- */
  /*  Left Click and Double Click                 */
  /* -------------------------------------------- */

  /**
   * Handle left-click mouse-down events.
   * Stop further propagation only if the event is allowed by either single or double-click.
   * @param {PIXI.FederatedEvent} event
   */
  #handleLeftDown(event) {
    if ( !this.state.between(this.states.HOVER, this.states.DRAG) ) return;

    // Determine double vs single click
    const isDouble = this.#isDoubleClick(event, true);
    this.lcTime = isDouble ? 0 : event.timeStamp;
    this.lastClick.set(event.clientX, event.clientY);

    // Assign origin data
    this.#assignOriginData(event);

    // Activate a timeout to detect long presses
    if ( !isDouble ) {
      clearTimeout(this.constructor.longPressTimeout);
      this.constructor.longPressTimeout = setTimeout(() => {
        this.#handleLongPress(event, this.interactionData.origin);
      }, MouseInteractionManager.LONG_PRESS_DURATION_MS);
    }

    // Dispatch to double and single-click handlers
    if ( isDouble && this.can("clickLeft2", event) ) return this.#handleClickLeft2(event);
    else return this.#handleClickLeft(event);
  }

  /* -------------------------------------------- */

  /**
   * Handle mouse-down which trigger a single left-click workflow.
   * @param {PIXI.FederatedEvent} event
   */
  #handleClickLeft(event) {
    const action = "clickLeft";
    if ( !this.can(action, event) ) return this.#debug(action, event, this.handlerOutcomes.DISALLOWED);
    this._dragRight = false;

    // Was the left-click event handled by the callback?
    const priorState = this.state;
    if ( this.state === this.states.HOVER ) this.state = this.states.CLICKED;
    if ( canvas.currentMouseManager === null ) canvas.currentMouseManager = this;
    if ( this.callback(action, event) === false ) {
      this.state = priorState;
      if ( canvas.currentMouseManager === this ) canvas.currentMouseManager = null;
      return this.#debug(action, event, this.handlerOutcomes.REFUSED);
    }

    // Activate drag event handlers
    if ( (this.state === this.states.CLICKED) && this.can("dragStart", event) ) {
      this.state = this.states.GRABBED;
      this.#activateDragEvents();
    }
    return this.#debug(action, event);
  }

  /* -------------------------------------------- */

  /**
   * Handle mouse-down which trigger a single left-click workflow.
   * @param {PIXI.FederatedEvent} event
   */
  #handleClickLeft2(event) {
    const action = "clickLeft2";
    if ( this.callback(action, event) === false ) return this.#debug(action, event, this.handlerOutcomes.REFUSED);
    return this.#debug(action, event);
  }

  /* -------------------------------------------- */

  /**
   * Handle a long mouse depression to trigger a long-press workflow.
   * @param {PIXI.FederatedEvent}   event   The mousedown event.
   * @param {PIXI.Point}            origin  The original canvas coordinates of the mouse click
   */
  #handleLongPress(event, origin) {
    const action = "longPress";
    if ( this.callback(action, event, origin) === false ) {
      return this.#debug(action, event, this.handlerOutcomes.REFUSED);
    }
    return this.#debug(action, event);
  }

  /* -------------------------------------------- */
  /*  Right Click and Double Click                */
  /* -------------------------------------------- */

  /**
   * Handle right-click mouse-down events.
   * Stop further propagation only if the event is allowed by either single or double-click.
   * @param {PIXI.FederatedEvent} event
   */
  #handleRightDown(event) {
    if ( !this.state.between(this.states.HOVER, this.states.DRAG) ) return;

    // Determine double vs single click
    const isDouble = this.#isDoubleClick(event, false);
    this.rcTime = isDouble ? 0 : event.timeStamp;
    this.lastClick.set(event.clientX, event.clientY);

    // Assign origin data
    this.#assignOriginData(event);

    // Dispatch to double and single-click handlers
    if ( isDouble && this.can("clickRight2", event) ) return this.#handleClickRight2(event);
    else return this.#handleClickRight(event);
  }

  /* -------------------------------------------- */

  /**
   * Handle single right-click actions.
   * @param {PIXI.FederatedEvent} event
   */
  #handleClickRight(event) {
    const action = "clickRight";
    if ( !this.can(action, event) ) return this.#debug(action, event, this.handlerOutcomes.DISALLOWED);
    this._dragRight = true;

    // Was the right-click event handled by the callback?
    const priorState = this.state;
    if ( this.state === this.states.HOVER ) this.state = this.states.CLICKED;
    if ( canvas.currentMouseManager === null ) canvas.currentMouseManager = this;
    if ( this.callback(action, event) === false ) {
      this.state = priorState;
      if ( canvas.currentMouseManager === this ) canvas.currentMouseManager = null;
      return this.#debug(action, event, this.handlerOutcomes.REFUSED);
    }

    // Activate drag event handlers
    if ( (this.state === this.states.CLICKED) && this.can("dragRight", event) ) {
      this.state = this.states.GRABBED;
      this.#activateDragEvents();
    }
    return this.#debug(action, event);
  }

  /* -------------------------------------------- */

  /**
   * Handle double right-click actions.
   * @param {PIXI.FederatedEvent} event
   */
  #handleClickRight2(event) {
    const action = "clickRight2";
    if ( this.callback(action, event) === false ) return this.#debug(action, event, this.handlerOutcomes.REFUSED);
    return this.#debug(action, event);
  }

  /* -------------------------------------------- */
  /*  Drag and Drop                               */
  /* -------------------------------------------- */

  /**
   * Handle mouse movement during a drag workflow
   * @param {PIXI.FederatedEvent} event
   */
  #handlePointerMove(event) {
    if ( !this.state.between(this.states.GRABBED, this.states.DRAG) ) return;

    // Limit dragging to 60 updates per second
    const now = Date.now();
    if ( (now - this.dragTime) < this.#app.ticker.elapsedMS ) return;
    this.dragTime = now;

    // Update interaction data
    const data = this.interactionData;
    data.destination = event.getLocalPosition(this.layer, data.destination);

    // Begin a new drag event
    if ( this.state !== this.states.DRAG ) {
      const dx = event.global.x - data.screenOrigin.x;
      const dy = event.global.y - data.screenOrigin.y;
      const dz = Math.hypot(dx, dy);
      const r = this.options.dragResistance || MouseInteractionManager.DEFAULT_DRAG_RESISTANCE_PX;
      if ( dz >= r ) this.#handleDragStart(event);
    }

    // Continue a drag event
    if ( this.state === this.states.DRAG ) this.#handleDragMove(event);
  }

  /* -------------------------------------------- */

  /**
   * Handle the beginning of a new drag start workflow, moving all controlled objects on the layer
   * @param {PIXI.FederatedEvent} event
   */
  #handleDragStart(event) {
    clearTimeout(this.constructor.longPressTimeout);
    const action = this._dragRight ? "dragRightStart" : "dragLeftStart";
    if ( !this.can(action, event) ) {
      this.#debug(action, event, this.handlerOutcomes.DISALLOWED);
      this.cancel(event);
      return;
    }
    this.state = this.states.DRAG;
    if ( this.callback(action, event) === false ) {
      this.state = this.states.GRABBED;
      return this.#debug(action, event, this.handlerOutcomes.REFUSED);
    }
    return this.#debug(action, event, this.handlerOutcomes.ACCEPTED);
  }

  /* -------------------------------------------- */

  /**
   * Handle the continuation of a drag workflow, moving all controlled objects on the layer
   * @param {PIXI.FederatedEvent} event
   */
  #handleDragMove(event) {
    clearTimeout(this.constructor.longPressTimeout);
    const action = this._dragRight ? "dragRightMove" : "dragLeftMove";
    if ( !this.can(action, event) ) return this.#debug(action, event, this.handlerOutcomes.DISALLOWED);
    const handled = this.callback(action, event);
    return this.#debug(action, event, handled ? this.handlerOutcomes.ACCEPTED : this.handlerOutcomes.REFUSED);
  }

  /* -------------------------------------------- */

  /**
   * Handle mouse up events which may optionally conclude a drag workflow
   * @param {PIXI.FederatedEvent} event
   */
  #handlePointerUp(event) {
    clearTimeout(this.constructor.longPressTimeout);
    // If this is a touch hover event, treat it as a drag
    if ( (this.state === this.states.HOVER) && (event.pointerType === "touch") ) {
      this.state = this.states.DRAG;
    }

    // Save prior state
    const priorState = this.state;

    // Update event data
    this.interactionData.destination = event.getLocalPosition(this.layer, this.interactionData.destination);

    if ( this.state >= this.states.DRAG ) {
      event.stopPropagation();
      if ( event.type.startsWith("right") && !this._dragRight ) return;
      if ( this.state === this.states.DRAG ) this.#handleDragDrop(event);
    }

    // Continue a multi-click drag workflow
    if ( event.defaultPrevented ) {
      this.state = priorState;
      return this.#debug("mouseUp", event, this.handlerOutcomes.SKIPPED);
    }

    // Handle the unclick event
    this.#handleUnclick(event);

    // Cancel the drag workflow
    this.#handleDragCancel(event);
  }

  /* -------------------------------------------- */

  /**
   * Handle the conclusion of a drag workflow, placing all dragged objects back on the layer
   * @param {PIXI.FederatedEvent} event
   */
  #handleDragDrop(event) {
    const action = this._dragRight ? "dragRightDrop" : "dragLeftDrop";
    if ( !this.can(action, event) ) return this.#debug(action, event, this.handlerOutcomes.DISALLOWED);

    // Was the drag-drop event handled by the callback?
    this.state = this.states.DROP;
    if ( this.callback(action, event) === false ) {
      this.state = this.states.DRAG;
      return this.#debug(action, event, this.handlerOutcomes.REFUSED);
    }

    // Update the workflow state
    return this.#debug(action, event);
  }

  /* -------------------------------------------- */

  /**
   * Handle the cancellation of a drag workflow, resetting back to the original state
   * @param {PIXI.FederatedEvent} event
   */
  #handleDragCancel(event) {
    this.cancel(event);
  }

  /* -------------------------------------------- */

  /**
   * Handle the unclick event
   * @param {PIXI.FederatedEvent} event
   */
  #handleUnclick(event) {
    const action = event.button === 0 ? "unclickLeft" : "unclickRight";
    if ( !this.state.between(this.states.CLICKED, this.states.GRABBED) ) {
      return this.#debug(action, event, this.handlerOutcomes.SKIPPED);
    }
    if ( this.callback(action, event) === false ) return this.#debug(action, event, this.handlerOutcomes.REFUSED);
    return this.#debug(action, event);
  }

  /* -------------------------------------------- */

  /**
   * A public method to handle directly an event into this manager, according to its type.
   * Note: drag events are not handled.
   * @param {PIXI.FederatedEvent} event
   * @returns {boolean} Has the event been processed?
   */
  handleEvent(event) {
    switch ( event.type ) {
      case "pointerover":
        this.#handlePointerOver(event);
        break;
      case "pointerout":
        this.#handlePointerOut(event);
        break;
      case "pointerup":
        this.#handlePointerUp(event);
        break;
      case "pointerdown":
        this.#handlePointerDown(event);
        break;
      default:
        return false;
    }
    return true;
  }

  /* -------------------------------------------- */

  /**
   * A public method to cancel a current interaction workflow from this manager.
   * @param {PIXI.FederatedEvent} [event]     The event that initiates the cancellation
   */
  cancel(event) {
    const eventSystem = this.#app.renderer.events;
    const rootBoundary = eventSystem.rootBoundary;
    const createEvent = !event;
    if ( createEvent ) {
      event = rootBoundary.createPointerEvent(eventSystem.pointer, "pointermove", this.target);
      event.defaultPrevented = false;
      event.path = null;
    }
    try {
      const action = this._dragRight ? "dragRightCancel" : "dragLeftCancel";
      const endState = this.state;
      if ( endState <= this.states.HOVER ) return this.#debug(action, event, this.handlerOutcomes.SKIPPED);

      // Dispatch a cancellation callback
      if ( endState >= this.states.DRAG ) {
        if ( this.callback(action, event) === false ) return this.#debug(action, event, this.handlerOutcomes.REFUSED);
      }

      // Continue a multi-click drag workflow if the default event was prevented in the callback
      if ( event.defaultPrevented ) {
        this.state = this.states.DRAG;
        return this.#debug(action, event, this.handlerOutcomes.SKIPPED);
      }

      // Reset the interaction data and state and deactivate drag events
      this.interactionData = {};
      this.state = this.states.HOVER;
      if ( canvas.currentMouseManager === this ) {
        canvas.currentMouseManager = null;
        clearTimeout(this.constructor.longPressTimeout);
      }
      this.#deactivateDragEvents();
      this.#debug(action, event);

      // Check hover state and hover out if necessary
      if ( !rootBoundary.trackingData(event.pointerId).overTargets?.includes(this.target) ) {
        this.#handlePointerOut(event);
      }
    } finally {
      if ( createEvent ) rootBoundary.freeEvent(event);
    }

    // Emulate an event to update the cursor
    if ( createEvent ) MouseInteractionManager.emulateMoveEvent();
  }

  /* -------------------------------------------- */

  /**
   * Display a debug message in the console (if mouse interaction debug is activated).
   * @param {string} action                                   Which action to display?
   * @param {Event|PIXI.FederatedEvent} event                 Which event to display?
   * @param {number} [outcome=this.handlerOutcomes.ACCEPTED]  The handler outcome.
   */
  #debug(action, event, outcome=this.handlerOutcomes.ACCEPTED) {
    if ( CONFIG.debug.mouseInteraction ) {
      const name = this.object.constructor.name;
      const targetName = event.target?.constructor.name;
      const {eventPhase, type, button} = event;
      const state = Object.keys(this.states)[this.state.toString()];
      let msg = `${name} | ${action} | state:${state} | target:${targetName} | phase:${eventPhase} | type:${type} | `
        + `btn:${button} | skipped:${outcome <= -2} | allowed:${outcome > -1} | handled:${outcome > 1}`;
      console.debug(msg);
    }
  }

  /* -------------------------------------------- */

  /**
   * Reset the mouse manager.
   * @param {object} [options]
   * @param {boolean} [options.interactionData=true]    Reset the interaction data?
   * @param {boolean} [options.state=true]              Reset the state?
   */
  reset({interactionData=true, state=true}={}) {
    if ( CONFIG.debug.mouseInteraction ) {
      console.debug(`${this.object.constructor.name} | Reset | interactionData:${interactionData} | state:${state}`);
    }
    if ( interactionData ) this.interactionData = {};
    if ( state ) this.state = MouseInteractionManager.INTERACTION_STATES.NONE;
  }

  /* -------------------------------------------- */

  /**
   * Determine if the current click is a double-click based on timing and distance.
   * @param {PIXI.FederatedEvent} event The mouse event to evaluate.
   * @param {boolean} isLeftClick True for left-click, false for right-click.
   * @returns {boolean} True if the click qualifies as a double-click.
   */
  #isDoubleClick(event, isLeftClick) {
    const {clientX, clientY, timeStamp} = event;
    const lastTime = isLeftClick ? this.lcTime : this.rcTime;
    const maxTime = MouseInteractionManager.DOUBLE_CLICK_TIME_MS;

    // Check time first for an early exit
    if ( (timeStamp - lastTime) > maxTime ) return false;

    const maxDistance = MouseInteractionManager.DOUBLE_CLICK_DISTANCE_PX;
    const distance = Math.hypot(clientX - this.lastClick.x, clientY - this.lastClick.y);

    return distance <= maxDistance;
  }

  /* -------------------------------------------- */

  /**
   * Assign origin data from the layer position, in local position and in screen position.
   * @param {PIXI.FederatedEvent} event The mouse event to evaluate.
   */
  #assignOriginData(event) {
    // Set the origin point from layer local position
    this.interactionData.origin = event.getLocalPosition(this.layer);

    // Set screenOrigin as the screen coordinates of the origin
    this.interactionData.screenOrigin = new PIXI.Point(event.global.x, event.global.y);
  }

  /* -------------------------------------------- */

  /**
   * Assign the interaction data to the event.
   * @param {PIXI.FederatedEvent} event
   */
  #assignInteractionData(event) {
    this.interactionData.object = this.object;
    event.interactionData = this.interactionData;
  }
}

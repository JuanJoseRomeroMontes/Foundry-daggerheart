import {createFontAwesomeIcon} from "../forms/fields.mjs";

/**
 * @import Application from "@client/appv1/api/application-v1.mjs"
 * @import ApplicationV2 from "../api/application.mjs"
 */

/**
 * @typedef DraggableResizeOptions
 * @property {string} [selector]  A CSS selector for the resize handle.
 * @property {boolean} [resizeX=true]  Enable resizing along the X axis.
 * @property {boolean} [resizeY=true]  Enable resizing along the Y axis.
 * @property {boolean} [rtl]           Modify the resizing direction to be right-to-left.
 */

/**
 * A UI utility to make an element draggable.
 */
export default class Draggable {
  /**
   * @param {Application|ApplicationV2} app The Application that is being made draggable.
   * @param {HTMLElement|jQuery} element    The Application's outer-most element.
   * @param {HTMLElement|false} handle      The element that acts as a drag handle. Supply false to disable dragging.
   * @param {boolean|DraggableResizeOptions} resizable  Is the application resizable? Supply an object to configure
   *                                                    resizing behavior or true to have it automatically configured.
   */
  constructor(app, element, handle, resizable) {

    // Setup element data
    this.app = app;
    this.element = element instanceof HTMLElement ? element : element[0];
    this.handle = handle ?? this.element;
    this.resizable = resizable || false;

    // Activate interactivity
    this.activateListeners();
  }

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * The Application being made draggable.
   * @type {Application|ApplicationV2}
   */
  app;

  /**
   * The Application's outer-most element.
   * @type {HTMLElement}
   */
  element;

  /**
   * The drag handle, or false to disable dragging.
   * @type {HTMLElement|false}
   */
  handle;

  /**
   * Registered event handlers.
   * @type {Record<string, Function>}
   */
  handlers = {};

  /**
   * The Application's starting position, pre-drag.
   * @type {object}
   */
  position = null;

  /**
   * Resize configuration.
   * @type {boolean|DraggableResizeOptions}
   */
  resizable;

  /**
   * Record move time for throttling.
   * @type {number}
   */
  #moveTime = 0;

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /**
   * Activate event handling for a Draggable application
   * Attach handlers for floating, dragging, and resizing
   */
  activateListeners() {
    this._activateDragListeners();
    this._activateResizeListeners();
  }

  /* ----------------------------------------- */

  /**
   * Attach handlers for dragging and floating.
   * @protected
   */
  _activateDragListeners() {
    if ( !this.handle ) return;

    // Float to top
    this.handlers.click = ["pointerdown", () => this.app.bringToFront(), {capture: true, passive: true}];
    this.element.addEventListener(...this.handlers.click);

    // Drag handlers
    this.handlers.dragDown = ["pointerdown", e => this._onDragMouseDown(e), false];
    this.handlers.dragMove = ["pointermove", e => this._onDragMouseMove(e), false];
    this.handlers.dragUp = ["pointerup", e => this._onDragMouseUp(e), false];
    this.handle.addEventListener(...this.handlers.dragDown);
    this.handle.classList.add("draggable");
  }

  /* ----------------------------------------- */

  /**
   * Attach handlers for resizing.
   * @protected
   */
  _activateResizeListeners() {
    if ( !this.resizable ) return;
    let handle = this.element.querySelector(this.resizable.selector);
    if ( !handle ) {
      handle = document.createElement("div");
      handle.classList.add("window-resizable-handle");
      handle.append(createFontAwesomeIcon("left-right", {classes: ["fa-rotate-by"]}));
      this.element.appendChild(handle);
    }

    // Register handlers
    this.handlers.resizeDown = ["pointerdown", e => this._onResizeMouseDown(e), false];
    this.handlers.resizeMove = ["pointermove", e => this._onResizeMouseMove(e), false];
    this.handlers.resizeUp = ["pointerup", e => this._onResizeMouseUp(e), false];

    // Attach the click handler and CSS class
    handle.addEventListener(...this.handlers.resizeDown);
    if ( this.handle ) this.handle.classList.add("resizable");
  }

  /* ----------------------------------------- */

  /**
   * Handle the initial mouse click which activates dragging behavior for the application
   * @param {PointerEvent} event
   * @protected
   */
  _onDragMouseDown(event) {
    event.preventDefault();

    // Record initial position
    this.position = foundry.utils.deepClone(this.app.position);
    this._initial = {x: event.clientX, y: event.clientY};

    // Add temporary handlers
    window.addEventListener(...this.handlers.dragMove);
    window.addEventListener(...this.handlers.dragUp);
  }

  /* ----------------------------------------- */

  /**
   * Move the window with the mouse, bounding the movement to ensure the window stays within bounds of the viewport
   * @param {PointerEvent} event
   * @protected
   */
  _onDragMouseMove(event) {
    event.preventDefault();

    // Limit dragging to 60 updates per second
    const now = Date.now();
    if ( (now - this.#moveTime) < (1000/60) ) return;
    this.#moveTime = now;

    // Update application position
    this.app.setPosition({
      left: this.position.left + (event.clientX - this._initial.x),
      top: this.position.top + (event.clientY - this._initial.y)
    });
  }

  /* ----------------------------------------- */

  /**
   * Conclude the dragging behavior when the mouse is release, setting the final position and removing listeners
   * @param {PointerEvent} event
   * @protected
   */
  _onDragMouseUp(event) {
    event.preventDefault();
    window.removeEventListener(...this.handlers.dragMove);
    window.removeEventListener(...this.handlers.dragUp);
  }

  /* ----------------------------------------- */

  /**
   * Handle the initial mouse click which activates dragging behavior for the application
   * @param {PointerEvent} event
   * @protected
   */
  _onResizeMouseDown(event) {
    event.preventDefault();

    // Limit dragging to 60 updates per second
    const now = Date.now();
    if ( (now - this.#moveTime) < (1000/60) ) return;
    this.#moveTime = now;

    // Record initial position
    this.position = foundry.utils.deepClone(this.app.position);
    if ( this.position.height === "auto" ) this.position.height = this.element.clientHeight;
    if ( this.position.width === "auto" ) this.position.width = this.element.clientWidth;
    this._initial = {x: event.clientX, y: event.clientY};

    // Add temporary handlers
    window.addEventListener(...this.handlers.resizeMove);
    window.addEventListener(...this.handlers.resizeUp);
  }

  /* ----------------------------------------- */

  /**
   * Move the window with the mouse, bounding the movement to ensure the window stays within bounds of the viewport
   * @param {PointerEvent} event
   * @protected
   */
  _onResizeMouseMove(event) {
    event.preventDefault();
    const scale = this.app.position.scale ?? 1;
    let deltaX = (event.clientX - this._initial.x) / scale;
    const deltaY = (event.clientY - this._initial.y) / scale;
    if ( this.resizable.rtl === true ) deltaX *= -1;
    const newPosition = {
      width: this.position.width + deltaX,
      height: this.position.height + deltaY
    };
    if ( this.resizable.resizeX === false ) delete newPosition.width;
    if ( this.resizable.resizeY === false ) delete newPosition.height;
    this.app.setPosition(newPosition);
  }

  /* ----------------------------------------- */

  /**
   * Conclude the dragging behavior when the mouse is release, setting the final position and removing listeners
   * @param {PointerEvent} event
   * @protected
   */
  _onResizeMouseUp(event) {
    event.preventDefault();
    window.removeEventListener(...this.handlers.resizeMove);
    window.removeEventListener(...this.handlers.resizeUp);
    this.app._onResize(event);
  }

  /* -------------------------------------------- */
  /*  Factory Methods                             */
  /* -------------------------------------------- */

  /**
   * Retrieve the configured Draggable implementation.
   * @type {typeof Draggable}
   */
  static get implementation() {
    let Class = CONFIG.ux.Draggable;
    if ( !foundry.utils.isSubclass(Class, Draggable) ) {
      console.warn("Configured Draggable override must be a subclass of Draggable.");
      Class = Draggable;
    }
    return Class;
  }
}

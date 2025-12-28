/**
 * @typedef DragDropConfiguration
 * @property {string|null} [dragSelector=null]  The CSS selector used to target draggable elements.
 * @property {string|null} [dropSelector=null]  The CSS selector used to target viable drop targets.
 * @property {Record<"dragstart"|"drop", (selector: string) => boolean>} [permissions]
 *                                         Permission tests for each action
 * @property {Record<
 *  "dragstart"|"dragover"|"drop"|"dragenter"|"dragleave"|"dragend",
 *  (event: DragEvent) => void
 * >} [callbacks]                         Callback functions for each action
 */

/**
 * A controller class for managing drag and drop workflows within an Application instance.
 * The controller manages the following actions: dragstart, dragover, drop.
 *
 * @example Activate drag-and-drop handling for a certain set of elements
 * ```js
 * const dragDrop = new DragDrop({
 *   dragSelector: ".item",
 *   dropSelector: ".items",
 *   permissions: { dragstart: this._canDragStart.bind(this), drop: this._canDragDrop.bind(this) },
 *   callbacks: { dragstart: this._onDragStart.bind(this), drop: this._onDragDrop.bind(this) }
 * });
 * dragDrop.bind(html);
 * ```
 */
export default class DragDrop {
  /**
   * @param {DragDropConfiguration} [config]
   */
  constructor({dragSelector=null, dropSelector=null, permissions={}, callbacks={}}={}) {
    this.dragSelector = dragSelector;
    this.dropSelector = dropSelector;
    this.permissions = permissions;
    this.callbacks = callbacks;
  }

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * A set of callback functions for each action of the drag & drop workflow.
   * @type {Record<"dragstart"|"dragover"|"drop"|"dragenter"|"dragleave"|"dragend", (event: DragEvent) => void>}
   */
  callbacks;

  /**
   * The HTML selector which identifies draggable elements.
   * @type {string|null}
   */
  dragSelector;

  /**
   * The HTML selector which identifies drop targets.
   * @type {string|null}
   */
  dropSelector;

  /**
   * A set of functions to control authorization to begin drag workflows, and drop content.
   * @type {Record<"dragstart"|"drop", (selector: string) => boolean>}
   */
  permissions;

  /* -------------------------------------------- */
  /*  Public API                                  */
  /* -------------------------------------------- */

  /**
   * Bind the DragDrop controller to an HTML application
   * @param {HTMLElement} html    The HTML element to which the handler is bound
   */
  bind(html) {

    // Identify and activate draggable targets
    const canDrag = !!this.dragSelector && this.can("dragstart", this.dragSelector);
    const draggables = this.dragSelector ? html.querySelectorAll(this.dragSelector) : [];
    for ( const element of draggables ) {
      element.setAttribute("draggable", canDrag);
      element.ondragstart = canDrag ? this._handleDragStart.bind(this) : null;
      element.ondragend = canDrag ? this._handleDragEnd.bind(this) : null;
    }

    // Identify and activate drop targets
    const canDrop = this.can("drop", this.dropSelector);
    const droppables = !this.dropSelector || html.matches(this.dropSelector) ? [html]
      : html.querySelectorAll(this.dropSelector);
    for ( const element of droppables ) {
      element.ondragover = canDrop ? this._handleDragOver.bind(this) : null;
      element.ondrop = canDrop ? this._handleDrop.bind(this) : null;
      element.ondragenter = canDrop ? this._handleDragEnter.bind(this) : null;
      element.ondragleave = canDrop ? this._handleDragLeave.bind(this) : null;
    }
    return this;
  }

  /* -------------------------------------------- */

  /**
   * Execute a callback function associated with a certain action in the workflow
   * @param {DragEvent} event   The drag event being handled
   * @param {string} action     The action being attempted
   */
  callback(event, action) {
    const fn = this.callbacks[action];
    if ( fn instanceof Function ) return fn(event);
  }

  /* -------------------------------------------- */

  /**
   * Test whether the current user has permission to perform a step of the workflow
   * @param {string} action     The action being attempted
   * @param {string} selector   The selector being targeted
   * @returns {boolean}          Can the action be performed?
   */
  can(action, selector) {
    const fn = this.permissions[action];
    if ( fn instanceof Function ) return fn(selector);
    return true;
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /**
   * Handle the start of a drag workflow
   * @param {DragEvent} event   The drag event being handled
   * @protected
   */
  _handleDragStart(event) {
    this.callback(event, "dragstart");
    if ( event.dataTransfer.items.length ) event.stopPropagation();
  }

  /* -------------------------------------------- */

  /**
   * Handle a drag workflow ending for any reason.
   * @param {DragEvent} event  The drag event.
   * @protected
   */
  _handleDragEnd(event) {
    this.callback(event, "dragend");
  }

  /* -------------------------------------------- */

  /**
   * Handle entering a drop target while dragging.
   * @param {DragEvent} event  The drag event.
   * @protected
   */
  _handleDragEnter(event) {
    this.callback(event, "dragenter");
  }

  /* -------------------------------------------- */

  /**
   * Handle leaving a drop target while dragging.
   * @param {DragEvent} event  The drag event.
   * @protected
   */
  _handleDragLeave(event) {
    this.callback(event, "dragleave");
  }

  /* -------------------------------------------- */

  /**
   * Handle a dragged element over a droppable target
   * @param {DragEvent} event   The drag event being handled
   * @protected
   */
  _handleDragOver(event) {
    event.preventDefault();
    this.callback(event, "dragover");
    return false;
  }

  /* -------------------------------------------- */

  /**
   * Handle a dragged element dropped on a droppable target
   * @param {DragEvent} event   The drag event being handled
   * @protected
   */
  _handleDrop(event) {
    event.preventDefault();
    return this.callback(event, "drop");
  }

  /* -------------------------------------------- */
  /*  Helpers                                     */
  /* -------------------------------------------- */

  /**
   * A helper to create an image preview element for use during HTML element dragging.
   * @param {HTMLImageElement} img
   * @param {number} width
   * @param {number} height
   * @returns {HTMLDivElement}
   */
  static createDragImage(img, width, height) {
    let div = document.getElementById("drag-preview");

    // Create the drag preview div
    if ( !div ) {
      div = document.createElement("div");
      div.setAttribute("id", "drag-preview");
      const i = document.createElement("img");
      i.classList.add("noborder");
      div.appendChild(i);
      document.body.appendChild(div);
    }

    // Add the preview image
    const i = div.children[0];
    i.src = img.src;
    i.width = width;
    i.height = height;
    return div;
  }

  /* -------------------------------------------- */
  /*  Factory Methods                             */
  /* -------------------------------------------- */

  /**
   * Retrieve the configured DragDrop implementation.
   * @type {typeof DragDrop}
   */
  static get implementation() {
    let Class = CONFIG.ux.DragDrop;
    if ( !foundry.utils.isSubclass(Class, DragDrop) ) {
      console.warn("Configured DragDrop override must be a subclass of DragDrop.");
      Class = DragDrop;
    }
    return Class;
  }
}

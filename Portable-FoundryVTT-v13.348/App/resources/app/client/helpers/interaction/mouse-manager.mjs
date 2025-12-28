/**
 * Management class for Mouse events.
 * @see {@link foundry.Game#mouse}
 */
export default class MouseManager {
  constructor() {
    if ( game.mouse ) throw new Error("You may not re-construct the singleton MouseManager instance.");
  }

  /**
   * The timestamp of the last mousewheel event.
   * @type {number}
   */
  #wheelTime = 0;

  /**
   * Specify a rate limit for mouse wheel to gate repeated scrolling.
   * This is especially important for continuous scrolling mice which emit hundreds of events per second.
   * This designates a minimum number of milliseconds which must pass before another wheel event is handled
   * @type {number}
   */
  static MOUSE_WHEEL_RATE_LIMIT = 50;

  /* -------------------------------------------- */

  /**
   * Begin listening to mouse events.
   * @internal
   */
  _activateListeners() {
    window.addEventListener("wheel", this.#onWheel.bind(this), {passive: false});
  }

  /* -------------------------------------------- */

  /**
   * Master mouse-wheel event handler
   * @param {WheelEvent} event    The mouse wheel event
   */
  #onWheel(event) {

    // Prevent zooming the entire browser window
    if ( event.ctrlKey ) event.preventDefault();

    // Interpret shift+scroll as vertical scroll
    let dy = event.delta = event.deltaY;
    if ( event.shiftKey && (dy === 0) ) {
      dy = event.delta = event.deltaX;
    }
    if ( dy === 0 ) return;

    // Take no actions if the canvas is not hovered
    if ( !canvas.ready ) return;
    const hover = document.elementFromPoint(event.clientX, event.clientY);
    if ( !hover || (hover.id !== "board") ) return;
    event.preventDefault();

    // Identify scroll modifiers
    const isCtrl = game.keyboard.isModifierActive("CONTROL"); // We cannot trust event.ctrlKey because of touchpads
    const isShift = event.shiftKey;

    // Case 1 - active Ruler
    const ruler = canvas.controls.ruler;
    if ( ruler.active && (isCtrl || isShift) ) return ruler._onMouseWheel(event);

    // Case 2 - Token is dragged
    const draggedToken = canvas.tokens._draggedToken;
    if ( draggedToken && (isCtrl || isShift) ) return draggedToken._onDragMouseWheel(event);

    // Case 3 - rotate placeable objects
    const layer = canvas.activeLayer;
    if ( layer?.options?.rotatableObjects && (isCtrl || isShift) ) {
      const hasTarget = layer.options?.controllableObjects ? layer.controlled.length : !!layer.hover;
      if ( hasTarget ) {
        const t = Date.now();
        if ( (t - this.#wheelTime) < this.constructor.MOUSE_WHEEL_RATE_LIMIT ) return;
        this.#wheelTime = t;
        return layer._onMouseWheel(event);
      }
    }

    // Case 4 - zoom the canvas
    canvas._onMouseWheel(event);
  }
}

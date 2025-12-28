/**
 * @import {Rectangle} from "../_types.mjs";
 */

/**
 * A class based on PIXI.Graphics, that allows to create a resize handle in the desired area.
 * @extends PIXI.Graphics
 */
export default class ResizeHandle extends PIXI.smooth.SmoothGraphics {
  /**
   * @param {number[]} offset        A two-element array [xFactor, yFactor] which defines the normalized
   *                                 position of this handle relative to the bounding box.
   * @param {object} [handlers={}]   An object of optional handler functions.
   * @param {Function} [handlers.canDrag] A function determining if this handle can initiate a drag.
   */
  constructor(offset, handlers={}) {
    super();
    this.offset = offset;
    this.handlers = handlers;
    const s = canvas.dimensions.uiScale;
    this.lineStyle(4 * s, 0x000000, 1.0).beginFill(0xFF9829, 1.0).drawCircle(0, 0, 10 * s).endFill();
    this.cursor = "pointer";
  }

  /* -------------------------------------------- */

  /**
   * Track whether the handle is being actively used for a drag workflow
   * @type {boolean}
   */
  active = false;

  /* -------------------------------------------- */

  /**
   * Refresh the position and hit area of this handle based on the provided bounding box.
   * @param {Rectangle} bounds           The bounding box in which this handle operates.
   */
  refresh(bounds) {
    const s = canvas.dimensions.uiScale;
    this.position.set(bounds.x + (bounds.width * this.offset[0]), bounds.y + (bounds.height * this.offset[1]));
    this.hitArea = new PIXI.Rectangle(-16 * s, -16 * s, 32 * s, 32 * s); // Make the handle easier to grab
  }

  /* -------------------------------------------- */

  /**
   * Compute updated dimensions for an object being resized, respecting optional constraints.
   * @param {Rectangle} current                  The current geometric state of the object
   * @param {Rectangle} origin                   The original position and dimensions used for reference
   * @param {object} destination                 The mouse (or pointer) destination coordinates.
   * @param {number} destination.x               The x-coordinate where the pointer was released.
   * @param {number} destination.y               The y-coordinate where the pointer was released.
   * @param {object} [options={}]                Additional options.
   * @param {number|null} [options.aspectRatio]  If provided, a numeric aspect ratio to maintain (width/height).
   * @returns {object} An object containing the adjusted {x, y, width, height}.
   */
  updateDimensions(current, origin, destination, {aspectRatio=null}={}) {
    const s = canvas.dimensions.uiScale;

    // Identify the change in dimensions
    const dx = destination.x - origin.x;
    const dy = destination.y - origin.y;

    // Determine the new width and the new height
    let width = Math.max(origin.width + dx, 24 * s);
    let height = Math.max(origin.height + dy, 24 * s);

    // Constrain the aspect ratio
    if ( aspectRatio ) {
      if ( width >= height ) width = height * aspectRatio;
      else height = width / aspectRatio;
    }

    // Adjust the final points
    return {
      x: current.x,
      y: current.y,
      width: width * Math.sign(current.width),
      height: height * Math.sign(current.height)
    };
  }

  /* -------------------------------------------- */
  /*  Interactivity                               */
  /* -------------------------------------------- */

  /**
   * Activate listeners for pointer events, enabling hover and mouse-down behavior on the resize handle.
   */
  activateListeners() {
    this.off("pointerover").off("pointerout").off("pointerdown")
      .on("pointerover", this._onHoverIn.bind(this))
      .on("pointerout", this._onHoverOut.bind(this))
      .on("pointerdown", this._onMouseDown.bind(this));
    this.eventMode = "static";
  }

  /* -------------------------------------------- */

  /**
   * Handle mouse-over event on a control handle
   * @param {PIXI.FederatedEvent} event   The mouseover event
   * @protected
   */
  _onHoverIn(event) {
    if ( event.nativeEvent && (event.nativeEvent.target.id !== canvas.app.view.id) ) return;
    const handle = event.target;
    handle.scale.set(1.5, 1.5);
  }

  /* -------------------------------------------- */

  /**
   * Handle mouse-out event on a control handle
   * @param {PIXI.FederatedEvent} event   The mouseout event
   * @protected
   */
  _onHoverOut(event) {
    if ( event.nativeEvent && (event.nativeEvent.target.id !== canvas.app.view.id) ) return;
    const handle = event.target;
    handle.scale.set(1.0, 1.0);
  }

  /* -------------------------------------------- */

  /**
   * When we start a drag event - create a preview copy of the Tile for re-positioning
   * @param {PIXI.FederatedEvent} event   The mousedown event
   * @protected
   */
  _onMouseDown(event) {
    if ( this.handlers.canDrag && !this.handlers.canDrag() ) return;
    this.active = true;
  }
}

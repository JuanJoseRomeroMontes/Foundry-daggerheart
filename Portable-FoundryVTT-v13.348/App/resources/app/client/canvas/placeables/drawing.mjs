import PlaceableObject from "./placeable-object.mjs";
import ResizeHandle from "../containers/elements/resize-handle.mjs";
import PreciseText from "../containers/elements/precise-text.mjs";
import MouseInteractionManager from "../interaction/mouse-handler.mjs";
import PrimaryCanvasGroup from "../groups/primary.mjs";
import {ShapeData} from "@common/data/data.mjs";
import {loadTexture} from "../loader.mjs";

/**
 * The Drawing object is an implementation of the PlaceableObject container.
 * Each Drawing is a placeable object in the DrawingsLayer.
 * @category Canvas
 * @see {@link foundry.documents.DrawingDocument}
 * @see {@link foundry.canvas.layers.DrawingsLayer}
 */
export default class Drawing extends PlaceableObject {

  /**
   * The texture that is used to fill this Drawing, if any.
   * @type {PIXI.Texture|null}
   */
  texture = null;

  /**
   * The border frame and resizing handles for the drawing.
   * @type {PIXI.Container}
   */
  frame;

  /**
   * A text label that may be displayed as part of the interface layer for the Drawing.
   * @type {PreciseText|null}
   */
  text = null;

  /**
   * The drawing shape which is rendered as a PIXI.Graphics in the interface or a PrimaryGraphics in the Primary Group.
   * @type {PrimaryGraphics|PIXI.Graphics}
   */
  shape;

  /**
   * An internal timestamp for the previous freehand draw time, to limit sampling.
   * @type {number}
   */
  #drawTime = 0;

  /**
   * An internal flag for the permanent points of the polygon.
   * @type {number[]}
   * @internal
   */
  _fixedPoints;

  /* -------------------------------------------- */

  /** @inheritdoc */
  static embeddedName = "Drawing";

  /** @override */
  static RENDER_FLAGS = {
    redraw: {propagate: ["refresh"]},
    refresh: {propagate: ["refreshState", "refreshTransform", "refreshText", "refreshElevation"], alias: true},
    refreshState: {},
    refreshTransform: {propagate: ["refreshPosition", "refreshRotation", "refreshSize"], alias: true},
    refreshPosition: {},
    refreshRotation: {propagate: ["refreshFrame"]},
    refreshSize: {propagate: ["refreshPosition", "refreshFrame", "refreshShape", "refreshText"]},
    refreshShape: {},
    refreshText: {},
    refreshFrame: {},
    refreshElevation: {},
    /** @deprecated since v12 */
    refreshMesh: {
      propagate: ["refreshTransform", "refreshShape", "refreshElevation"],
      deprecated: {since: 12, until: 14, alias: true}
    }
  };

  /**
   * The rate at which points are sampled (in milliseconds) during a freehand drawing workflow
   * @type {number}
   */
  static FREEHAND_SAMPLE_RATE = 75;

  /**
   * A convenience reference to the possible shape types.
   * @enum {string}
   */
  static SHAPE_TYPES = ShapeData.TYPES;

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * A convenient reference for whether the current User is the author of the Drawing document.
   * @type {boolean}
   */
  get isAuthor() {
    return this.document.isAuthor;
  }

  /* -------------------------------------------- */

  /**
   * Is this Drawing currently visible on the Canvas?
   * @type {boolean}
   */
  get isVisible() {
    return !this.document.hidden || this.isAuthor || game.user.isGM || this.isPreview;
  }

  /* -------------------------------------------- */

  /** @override */
  get bounds() {
    const {x, y, shape, rotation} = this.document;
    return rotation === 0
      ? new PIXI.Rectangle(x, y, shape.width ?? 0, shape.height ?? 0).normalize()
      : PIXI.Rectangle.fromRotation(x, y, shape.width ?? 0, shape.height ?? 0, Math.toRadians(rotation)).normalize();
  }

  /* -------------------------------------------- */

  /** @override */
  get center() {
    const {x, y, shape} = this.document;
    return new PIXI.Point(x + (shape.width / 2), y + (shape.height / 2));
  }

  /* -------------------------------------------- */

  /**
   * A Boolean flag for whether the Drawing utilizes a tiled texture background?
   * @type {boolean}
   */
  get isTiled() {
    return this.document.fillType === CONST.DRAWING_FILL_TYPES.PATTERN;
  }

  /* -------------------------------------------- */

  /**
   * A Boolean flag for whether the Drawing is a Polygon type (either linear or freehand)?
   * @type {boolean}
   */
  get isPolygon() {
    return this.type === Drawing.SHAPE_TYPES.POLYGON;
  }

  /* -------------------------------------------- */

  /**
   * Does the Drawing have text that is displayed?
   * @type {boolean}
   */
  get hasText() {
    return ((this._pendingText !== undefined) || !!this.document.text) && (this.document.fontSize > 0);
  }

  /* -------------------------------------------- */

  /**
   * The shape type that this Drawing represents. A value in Drawing.SHAPE_TYPES.
   * @see {@link Drawing.SHAPE_TYPES}
   * @type {string}
   */
  get type() {
    return this.document.shape.type;
  }

  /* -------------------------------------------- */

  /**
   * The pending text.
   * @type {string}
   * @internal
   */
  _pendingText;

  /* -------------------------------------------- */

  /**
   * The registered keydown listener.
   * @type {Function|null}
   * @internal
   */
  _onkeydown = null;

  /* -------------------------------------------- */

  /**
   * Delete the Drawing if the text is empty once text editing ends?
   * @type {boolean}
   */
  #deleteIfEmptyText = false;

  /* -------------------------------------------- */
  /*  Initial Rendering                           */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _destroy(options) {
    this.#removeDrawing(this);
    this.texture?.destroy();
  }

  /* -------------------------------------------- */

  /** @override */
  async _draw(options) {
    // Load the background texture, if one is defined
    const texture = this.document.texture;
    if ( this._original ) this.texture = this._original.texture?.clone() ?? null;
    else this.texture = texture ? await loadTexture(texture, {fallback: "icons/svg/hazard.svg"}) : null;

    // Create the drawing container in the primary group or in the interface group
    this.shape = this.#addDrawing();
    this.shape.visible = true;

    // Control Border
    this.frame = this.addChild(this.#drawFrame());

    // Drawing text
    this.text = this.hasText ? this.shape.addChild(this.#drawText()) : null;
  }

  /* -------------------------------------------- */

  /**
   * Add a drawing object according to interface configuration.
   * @returns {PIXI.Graphics|PrimaryGraphics}
   */
  #addDrawing() {
    const targetGroup = this.document.interface ? canvas.interface : canvas.primary;
    const removeGroup = this.document.interface ? canvas.primary : canvas.interface;
    removeGroup.removeDrawing(this);
    return targetGroup.addDrawing(this);
  }

  /* -------------------------------------------- */

  /**
   * Remove a drawing object.
   */
  #removeDrawing() {
    canvas.interface.removeDrawing(this);
    canvas.primary.removeDrawing(this);
  }

  /* -------------------------------------------- */

  /**
   * Create elements for the Drawing border and handles
   * @returns {PIXI.Container}
   */
  #drawFrame() {
    const frame = new PIXI.Container();
    frame.eventMode = "passive";
    frame.bounds = new PIXI.Rectangle();
    frame.interaction = frame.addChild(new PIXI.Container());
    frame.interaction.hitArea = frame.bounds;
    frame.interaction.eventMode = "auto";
    frame.border = frame.addChild(new PIXI.Graphics());
    frame.border.eventMode = "none";
    frame.handle = frame.addChild(new ResizeHandle([1, 1]));
    frame.handle.eventMode = "static";
    return frame;
  }

  /* -------------------------------------------- */

  /**
   * Create a PreciseText element to be displayed as part of this drawing.
   * @returns {PreciseText}
   */
  #drawText() {
    const text = new PreciseText(this.document.text || "", this._getTextStyle());
    text.eventMode = "none";
    return text;
  }

  /* -------------------------------------------- */

  /**
   * Get the line style used for drawing the shape of this Drawing.
   * @returns {object}    The line style options (`PIXI.ILineStyleOptions`).
   * @protected
   */
  _getLineStyle() {
    const {strokeWidth, strokeColor, strokeAlpha} = this.document;
    return {width: strokeWidth, color: strokeColor, alpha: strokeAlpha};
  }

  /* -------------------------------------------- */

  /**
   * Get the fill style used for drawing the shape of this Drawing.
   * @returns {object}    The fill style options (`PIXI.IFillStyleOptions`).
   * @protected
   */
  _getFillStyle() {
    const {fillType, fillColor, fillAlpha} = this.document;
    const style = {color: fillColor, alpha: fillAlpha};
    if ( (fillType === CONST.DRAWING_FILL_TYPES.PATTERN) && this.texture?.valid ) style.texture = this.texture;
    else if ( !fillType ) style.alpha = 0;
    return style;
  }

  /* -------------------------------------------- */

  /**
   * Prepare the text style used to instantiate a PIXI.Text or PreciseText instance for this Drawing document.
   * @returns {PIXI.TextStyle}
   * @protected
   */
  _getTextStyle() {
    const {fontSize, fontFamily, textColor, shape} = this.document;
    const stroke = Math.max(Math.round(fontSize / 32), 2);
    return PreciseText.getTextStyle({
      fontFamily: fontFamily || CONFIG.defaultFontFamily,
      fontSize: fontSize,
      fill: textColor,
      strokeThickness: stroke,
      dropShadowBlur: Math.max(Math.round(fontSize / 16), 2),
      align: "center",
      wordWrap: true,
      wordWrapWidth: shape.width ?? 0,
      padding: stroke * 4
    });
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  clone() {
    const c = super.clone();
    c._pendingText = this._pendingText;
    return c;
  }

  /* -------------------------------------------- */
  /*  Incremental Refresh                         */
  /* -------------------------------------------- */

  /** @override */
  _applyRenderFlags(flags) {
    if ( flags.refreshState ) this._refreshState();
    if ( flags.refreshPosition ) this._refreshPosition();
    if ( flags.refreshRotation ) this._refreshRotation();
    if ( flags.refreshShape ) this._refreshShape();
    if ( flags.refreshText ) this._refreshText();
    if ( flags.refreshFrame ) this._refreshFrame();
    if ( flags.refreshElevation ) this._refreshElevation();
  }

  /* -------------------------------------------- */

  /**
   * Refresh the position.
   * @protected
   */
  _refreshPosition() {
    const {x, y, shape: {width, height}} = this.document;
    if ( (this.position.x !== x) || (this.position.y !== y) ) MouseInteractionManager.emulateMoveEvent();
    this.position.set(x, y);
    this.shape.position.set(x + (width / 2), y + (height / 2));
    this.shape.pivot.set(width / 2, height / 2);
    if ( !this.text ) return;
    this.text.position.set(width / 2, height / 2);
    this.text.anchor.set(0.5, 0.5);
  }

  /* -------------------------------------------- */

  /**
   * Refresh the rotation.
   * @protected
   */
  _refreshRotation() {
    const rotation = Math.toRadians(this.document.rotation);
    this.shape.rotation = rotation;
  }

  /* -------------------------------------------- */

  /**
   * Refresh the displayed state of the Drawing.
   * Used to update aspects of the Drawing which change based on the user interaction state.
   * @protected
   */
  _refreshState() {
    const {hidden, locked, sort} = this.document;
    const wasVisible = this.visible;
    this.visible = this.isVisible;
    if ( this.visible !== wasVisible ) MouseInteractionManager.emulateMoveEvent();
    this.alpha = this._getTargetAlpha();
    const colors = CONFIG.Canvas.dispositionColors;
    this.frame.border.tint = this.controlled ? (locked ? colors.HOSTILE : colors.CONTROLLED) : colors.INACTIVE;
    this.frame.border.visible = this.controlled || this.hover || this.layer.highlightObjects;
    this.frame.handle.visible = this.controlled && !locked;
    this.zIndex = this.shape.zIndex = this.controlled ? 2 : this.hover ? 1 : 0;
    this.cursor = this.document.isOwner ? "pointer" : null;
    const oldEventMode = this.eventMode;
    this.eventMode = this.layer.active && (this.controlled || ["select", "text"].includes(game.activeTool)) ? "static" : "none";
    if ( this.eventMode !== oldEventMode ) MouseInteractionManager.emulateMoveEvent();
    this.shape.visible = this.visible;
    this.shape.sort = sort;
    this.shape.sortLayer = PrimaryCanvasGroup.SORT_LAYERS.DRAWINGS;
    this.shape.alpha = this.alpha * (hidden ? 0.5 : 1);
    this.shape.hidden = hidden;
    if ( !this.text ) return;
    this.text.alpha = this.document.textAlpha;
  }

  /* -------------------------------------------- */

  /**
   * Clear and then draw the shape.
   * @protected
   */
  _refreshShape() {
    this.shape.clear();
    this.shape.lineStyle(this._getLineStyle());
    this.shape.beginTextureFill(this._getFillStyle());
    const lineWidth = this.shape.line.width;
    const shape = this.document.shape;
    switch ( shape.type ) {
      case Drawing.SHAPE_TYPES.RECTANGLE:
        this.shape.drawRect(
          lineWidth / 2,
          lineWidth / 2,
          Math.max(shape.width - lineWidth, 0),
          Math.max(shape.height - lineWidth, 0)
        );
        break;
      case Drawing.SHAPE_TYPES.ELLIPSE:
        this.shape.drawEllipse(
          shape.width / 2,
          shape.height / 2,
          Math.max(shape.width - lineWidth, 0) / 2,
          Math.max(shape.height - lineWidth, 0) / 2
        );
        break;
      case Drawing.SHAPE_TYPES.POLYGON: {
        const isClosed = this.document.fillType || (shape.points.slice(0, 2).equals(shape.points.slice(-2)));
        if ( isClosed ) this.shape.drawSmoothedPolygon(shape.points, this.document.bezierFactor * 2);
        else this.shape.drawSmoothedPath(shape.points, this.document.bezierFactor * 2);
        break;
      }
    }
    this.shape.endFill();
    this.shape.line.reset();
  }

  /* -------------------------------------------- */

  /**
   * Update sorting of this Drawing relative to other PrimaryCanvasGroup siblings.
   * Called when the elevation or sort order for the Drawing changes.
   * @protected
   */
  _refreshElevation() {
    this.shape.elevation = this.document.elevation;
  }

  /* -------------------------------------------- */

  /**
   * Refresh the border frame that encloses the Drawing.
   * @protected
   */
  _refreshFrame() {
    const thickness = CONFIG.Canvas.objectBorderThickness * canvas.dimensions.uiScale;

    // Update the frame bounds
    const {shape: {width, height}, rotation} = this.document;
    const bounds = this.frame.bounds;
    bounds.x = 0;
    bounds.y = 0;
    bounds.width = width ?? 0;
    bounds.height = height ?? 0;
    bounds.rotate(Math.toRadians(rotation));
    const minSize = thickness * 0.25;
    if ( bounds.width < minSize ) {
      bounds.x -= ((minSize - bounds.width) / 2);
      bounds.width = minSize;
    }
    if ( bounds.height < minSize ) {
      bounds.y -= ((minSize - bounds.height) / 2);
      bounds.height = minSize;
    }
    MouseInteractionManager.emulateMoveEvent();

    // Draw the border
    const border = this.frame.border;
    border.clear();
    border.lineStyle({width: thickness, color: 0x000000, join: PIXI.LINE_JOIN.ROUND, alignment: 0.75})
      .drawShape(bounds);
    border.lineStyle({width: thickness / 2, color: 0xFFFFFF, join: PIXI.LINE_JOIN.ROUND, alignment: 1})
      .drawShape(bounds);

    // Draw the handle
    this.frame.handle.refresh(bounds);
  }

  /* -------------------------------------------- */

  /**
   * Refresh the content and appearance of text.
   * @protected
   */
  _refreshText() {
    if ( !this.text ) return;
    const {text, textAlpha} = this.document;
    this.text.text = this._pendingText ?? text ?? "";
    this.text.alpha = textAlpha;
    this.text.style = this._getTextStyle();
  }

  /* -------------------------------------------- */
  /*  Interactivity                               */
  /* -------------------------------------------- */

  /**
   * Add a new polygon point to the drawing, ensuring it differs from the last one
   * @param {Point} position            The drawing point to add
   * @param {object} [options]          Options which configure how the point is added
   * @param {boolean} [options.round=false]     Should the point be rounded to integer coordinates?
   * @param {boolean} [options.snap=false]      Should the point be snapped to grid precision?
   * @param {boolean} [options.temporary=false] Is this a temporary control point?
   * @internal
   */
  _addPoint(position, {round=false, snap=false, temporary=false}={}) {
    if ( snap ) position = this.layer.getSnappedPoint(position);
    if ( round ) {
      position.x = Math.round(position.x);
      position.y = Math.round(position.y);
    }

    // Avoid adding duplicate points
    const last = this._fixedPoints.slice(-2);
    const next = [position.x - this.document.x, position.y - this.document.y];
    if ( next.equals(last) ) return;

    // Append the new point and update the shape
    const points = this._fixedPoints.concat(next);
    this.document.shape.updateSource({points});
    if ( !temporary ) {
      this._fixedPoints = points;
      this.#drawTime = Date.now();
    }
  }

  /* -------------------------------------------- */

  /**
   * Remove the last fixed point from the polygon
   * @internal
   */
  _removePoint() {
    this._fixedPoints.splice(-2);
    this.document.shape.updateSource({points: this._fixedPoints});
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onControl(options) {
    super._onControl(options);
    this.enableTextEditing(options);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onRelease(options) {
    super._onRelease(options);
    if ( this._onkeydown ) {
      document.removeEventListener("keydown", this._onkeydown);
      this._onkeydown = null;
    }
    if ( canvas.scene.drawings.has(this.id) ) {
      if ( (this._pendingText === "") && this.#deleteIfEmptyText ) this.document.delete();
      else if ( this._pendingText !== undefined ) {    // Submit pending text
        this.#deleteIfEmptyText = false;
        this.document.update({text: this._pendingText}).then(() => {
          this._pendingText = undefined;
          this.renderFlags.set({redraw: this.hasText === !this.text, refreshText: true});
        });
      }
    }
  }

  /* -------------------------------------------- */

  /** @override */
  _overlapsSelection(rectangle) {
    if ( !this.frame ) return false;
    const localRectangle = new PIXI.Rectangle(
      rectangle.x - this.position.x,
      rectangle.y - this.position.y,
      rectangle.width,
      rectangle.height
    );
    return localRectangle.overlaps(this.frame.bounds);
  }

  /* -------------------------------------------- */

  /**
   * Enable text editing for this drawing.
   * @param {object} [options]
   */
  enableTextEditing(options={}) {
    if ( (game.activeTool === "text") || options.forceTextEditing ) {
      this._pendingText = this.document.text || "";
      this._onkeydown = this.#onDrawingTextKeydown.bind(this);
      document.addEventListener("keydown", this._onkeydown);
      if ( options.isNew ) this.#deleteIfEmptyText = true;
      this.renderFlags.set({refreshPosition: !this.text, refreshText: true});
      this.text ??= this.shape.addChild(this.#drawText());
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle text entry in an active text tool
   * @param {KeyboardEvent} event
   */
  #onDrawingTextKeydown(event) {

    // Ignore events when an input is focused, or when ALT or CTRL modifiers are applied
    if ( event.altKey || event.ctrlKey || event.metaKey ) return;
    if ( game.keyboard.hasFocus ) return;

    // Track refresh or conclusion conditions
    let conclude = false;
    let refresh = false;

    // Enter (submit) or Escape (cancel)
    if ( ["Escape", "Enter"].includes(event.key) ) {
      conclude = true;
    }

    // Deleting a character
    else if ( event.key === "Backspace" ) {
      this._pendingText = this._pendingText.slice(0, -1);
      refresh = true;
    }

    // Typing text (any single char)
    else if ( /^.$/.test(event.key) ) {
      this._pendingText += event.key;
      refresh = true;
    }

    // Stop propagation if the event was handled
    if ( refresh || conclude ) {
      event.preventDefault();
      event.stopPropagation();
    }

    // Conclude the workflow
    if ( conclude ) {
      this.release();
    }

    // Refresh the display
    else if ( refresh ) {
      this.renderFlags.set({refreshText: true});
    }
  }

  /* -------------------------------------------- */
  /*  Document Event Handlers                     */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);

    // Update pending text
    if ( ("text" in changed) && (this._pendingText !== undefined) ) this._pendingText = this.document.text || "";

    // Sort the interface drawings container if necessary
    if ( this.shape?.parent && (("elevation" in changed) || ("sort" in changed)) ) this.shape.parent.sortDirty = true;

    // Refresh the Tile
    this.renderFlags.set({
      redraw: ("interface" in changed) || ("texture" in changed) || (("text" in changed) && (this.hasText === !this.text)),
      refreshState: ("sort" in changed) || ("hidden" in changed) || ("locked" in changed) || ("author" in changed),
      refreshPosition: ("x" in changed) || ("y" in changed),
      refreshRotation: "rotation" in changed,
      refreshSize: ("shape" in changed) && (("width" in changed.shape) || ("height" in changed.shape)),
      refreshElevation: "elevation" in changed,
      refreshShape: ["shape", "bezierFactor", "strokeWidth", "strokeColor", "strokeAlpha",
        "fillType", "fillColor", "fillAlpha"].some(k => k in changed),
      refreshText: ["text", "fontFamily", "fontSize", "textColor", "textAlpha"].some(k => k in changed)
    });
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onDelete(options, userId) {
    super._onDelete(options, userId);
    if ( this._onkeydown ) document.removeEventListener("keydown", this._onkeydown);
  }

  /* -------------------------------------------- */
  /*  Interactivity                               */
  /* -------------------------------------------- */

  /** @inheritDoc */
  activateListeners() {
    super.activateListeners();
    this.frame.handle.off("pointerover").off("pointerout")
      .on("pointerover", this._onHandleHoverIn.bind(this))
      .on("pointerout", this._onHandleHoverOut.bind(this));
  }

  /* -------------------------------------------- */

  /** @override */
  _canControl(user, event) {
    if ( !this.layer.active || this.isPreview ) return false;
    if ( this._creating ) {  // Allow one-time control immediately following creation
      delete this._creating;
      return true;
    }
    if ( this.controlled ) return true;
    if ( !["select", "text"].includes(game.activeTool) ) return false;
    return user.isGM || (user === this.document.author);
  }

  /* -------------------------------------------- */

  /** @override */
  _canConfigure(user, event) {
    return this.controlled;
  }

  /* -------------------------------------------- */

  /**
   * Handle mouse movement which modifies the dimensions of the drawn shape.
   * @param {PIXI.FederatedEvent} event
   * @protected
   */
  _onMouseDraw(event) {
    const {destination, origin} = event.interactionData;
    const isShift = event.shiftKey;
    const isAlt = event.altKey;
    let position = destination;

    // Drag differently depending on shape type
    switch ( this.type ) {

      // Polygon Shapes
      case Drawing.SHAPE_TYPES.POLYGON: {
        const isFreehand = game.activeTool === "freehand";
        let temporary = true;
        if ( isFreehand ) {
          const now = Date.now();
          temporary = (now - this.#drawTime) < this.constructor.FREEHAND_SAMPLE_RATE;
        }
        const snap = !(isShift || isFreehand);
        this._addPoint(position, {snap, temporary});
        break;
      }

      // Other Shapes
      default: {
        if ( !isShift ) position = this.layer.getSnappedPoint(position);
        const shape = this.document.shape;
        const strokeWidth = this.document.strokeWidth;
        let dx = position.x - origin.x;
        let dy = position.y - origin.y;
        if ( Math.abs(dx) <= strokeWidth ) dx = (strokeWidth + 1) * (Math.sign(shape.width) || 1);
        if ( Math.abs(dy) <= strokeWidth ) dy = (strokeWidth + 1) * (Math.sign(shape.height) || 1);
        if ( isAlt ) {
          dx = Math.abs(dy) < Math.abs(dx) ? Math.abs(dy) * Math.sign(dx) : dx;
          dy = Math.abs(dx) < Math.abs(dy) ? Math.abs(dx) * Math.sign(dy) : dy;
        }
        const r = new PIXI.Rectangle(origin.x, origin.y, dx, dy).normalize();
        this.document.updateSource({
          x: r.x,
          y: r.y,
          shape: {
            width: r.width,
            height: r.height
          }
        });
        break;
      }
    }

    // Refresh the display
    this.renderFlags.set({refreshPosition: true, refreshSize: true});
  }

  /* -------------------------------------------- */
  /*  Interactivity                               */
  /* -------------------------------------------- */

  /** @inheritdoc */
  _onClickLeft(event) {
    if ( event.target === this.frame.handle ) {
      event.interactionData.dragHandle = true;
      event.stopPropagation();
      return;
    }
    return super._onClickLeft(event);
  }

  /* -------------------------------------------- */

  /** @override */
  _onDragLeftStart(event) {
    if ( event.interactionData.dragHandle ) return this._onHandleDragStart(event);
    return super._onDragLeftStart(event);
  }

  /* -------------------------------------------- */

  /** @override */
  _onDragLeftMove(event) {
    if ( event.interactionData.dragHandle ) return this._onHandleDragMove(event);
    return super._onDragLeftMove(event);
  }

  /* -------------------------------------------- */

  /** @override */
  _onDragLeftDrop(event) {
    if ( event.interactionData.dragHandle ) return this._onHandleDragDrop(event);
    return super._onDragLeftDrop(event);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onDragLeftCancel(event) {
    if ( event.interactionData.dragHandle ) return this._onHandleDragCancel(event);
    return super._onDragLeftCancel(event);
  }

  /* -------------------------------------------- */
  /*  Resize Handling                             */
  /* -------------------------------------------- */

  /**
   * Handle mouse-over event on a control handle
   * @param {PIXI.FederatedEvent} event   The mouseover event
   * @protected
   */
  _onHandleHoverIn(event) {
    if ( event.nativeEvent && (event.nativeEvent.target.id !== canvas.app.view.id) ) return;
    const handle = event.target;
    handle?.scale.set(1.5, 1.5);
  }

  /* -------------------------------------------- */

  /**
   * Handle mouse-out event on a control handle
   * @param {PIXI.FederatedEvent} event   The mouseout event
   * @protected
   */
  _onHandleHoverOut(event) {
    if ( event.nativeEvent && (event.nativeEvent.target.id !== canvas.app.view.id) ) return;
    const handle = event.target;
    handle?.scale.set(1.0, 1.0);
  }

  /* -------------------------------------------- */

  /**
   * Starting the resize handle drag event, initialize the original data.
   * @param {PIXI.FederatedEvent} event   The mouse interaction event
   * @protected
   */
  _onHandleDragStart(event) {
    event.interactionData.originalData = this.document.toObject();
    const handle = this.frame.handle;
    event.interactionData.handleOrigin = {x: handle.position.x, y: handle.position.y};
  }

  /* -------------------------------------------- */

  /**
   * Handle mousemove while dragging a tile scale handler
   * @param {PIXI.FederatedEvent} event   The mouse interaction event
   * @protected
   */
  _onHandleDragMove(event) {

    // Pan the canvas if the drag event approaches the edge
    canvas._onDragCanvasPan(event);

    // Update Drawing dimensions
    const {destination, origin, handleOrigin, originalData} = event.interactionData;
    let handleDestination = {
      x: handleOrigin.x + (destination.x - origin.x),
      y: handleOrigin.y + (destination.y - origin.y)
    };
    if ( !event.shiftKey ) handleDestination = this.layer.getSnappedPoint(handleDestination);
    let dx = handleDestination.x - handleOrigin.x;
    let dy = handleDestination.y - handleOrigin.y;
    const normalized = Drawing.rescaleDimensions(originalData, dx, dy);
    if ( ["r", "e"].includes(this.document.shape.type) ) {
      const strokeWidth = this.document.strokeWidth;
      if ( Math.abs(dx) <= strokeWidth ) dx = (strokeWidth + 1) * (Math.sign(destination.x - origin.x) || 1);
      if ( Math.abs(dy) <= strokeWidth ) dy = (strokeWidth + 1) * (Math.sign(destination.y - origin.y) || 1);
    }

    // Update the drawing, catching any validation failures
    this.document.updateSource(normalized);
    this.document.rotation = 0;
    this.renderFlags.set({refreshTransform: true});
  }

  /* -------------------------------------------- */

  /**
   * Handle mouseup after dragging a tile scale handler
   * @param {PIXI.FederatedEvent} event   The mouseup event
   * @protected
   */
  _onHandleDragDrop(event) {
    event.interactionData.restoreOriginalData = false;
    const {destination, origin, handleOrigin, originalData} = event.interactionData;
    let handleDestination = {
      x: handleOrigin.x + (destination.x - origin.x),
      y: handleOrigin.y + (destination.y - origin.y)
    };
    if ( !event.shiftKey ) handleDestination = this.layer.getSnappedPoint(handleDestination);
    const dx = handleDestination.x - handleOrigin.x;
    const dy = handleDestination.y - handleOrigin.y;
    const update = Drawing.rescaleDimensions(originalData, dx, dy);
    this.document.update(update, {diff: false})
      .then(() => this.renderFlags.set({refreshTransform: true}));
  }

  /* -------------------------------------------- */

  /**
   * Handle cancellation of a drag event for one of the resizing handles
   * @param {PointerEvent} event            The drag cancellation event
   * @protected
   */
  _onHandleDragCancel(event) {
    if ( event.interactionData.restoreOriginalData !== false ) {
      this.document.updateSource(event.interactionData.originalData);
      this.renderFlags.set({refreshTransform: true});
    }
  }

  /* -------------------------------------------- */

  /**
   * Get a vectorized rescaling transformation for drawing data and dimensions passed in parameter
   * @param {Object} original     The original drawing data
   * @param {number} dx           The pixel distance dragged in the horizontal direction
   * @param {number} dy           The pixel distance dragged in the vertical direction
   * @returns {object}            The adjusted shape data
   */
  static rescaleDimensions(original, dx, dy) {
    let {type, points, width, height} = original.shape;
    width += dx;
    height += dy;
    points = points || [];

    // Rescale polygon points
    if ( type === Drawing.SHAPE_TYPES.POLYGON ) {
      const scaleX = 1 + (original.shape.width > 0 ? dx / original.shape.width : 0);
      const scaleY = 1 + (original.shape.height > 0 ? dy / original.shape.height : 0);
      points = points.map((p, i) => p * (i % 2 ? scaleY : scaleX));
    }

    // Normalize the shape
    return this.normalizeShape({
      x: original.x,
      y: original.y,
      shape: {width: Math.round(width), height: Math.round(height), points}
    });
  }

  /* -------------------------------------------- */

  /**
   * Adjust the location, dimensions, and points of the Drawing before committing the change.
   * @param {object} data   The DrawingData pending update
   * @returns {object}      The adjusted data
   */
  static normalizeShape(data) {

    // Adjust shapes with an explicit points array
    const rawPoints = data.shape.points;
    if ( rawPoints?.length ) {

      // Organize raw points and de-dupe any points which repeated in sequence
      const xs = [];
      const ys = [];
      for ( let i=1; i<rawPoints.length; i+=2 ) {
        const x0 = rawPoints[i-3];
        const y0 = rawPoints[i-2];
        const x1 = rawPoints[i-1];
        const y1 = rawPoints[i];
        if ( (x1 === x0) && (y1 === y0) ) {
          continue;
        }
        xs.push(x1);
        ys.push(y1);
      }

      // Determine minimal and maximal points
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);

      // Normalize points relative to minX and minY
      const points = [];
      for ( let i=0; i<xs.length; i++ ) {
        points.push(xs[i] - minX, ys[i] - minY);
      }

      // Update data
      data.x += minX;
      data.y += minY;
      data.shape.width = maxX - minX;
      data.shape.height = maxY - minY;
      data.shape.points = points;
    }

    // Adjust rectangles
    else {
      const normalized = new PIXI.Rectangle(data.x, data.y, data.shape.width, data.shape.height).normalize();
      data.x = normalized.x;
      data.y = normalized.y;
      data.shape.width = normalized.width;
      data.shape.height = normalized.height;
    }
    return data;
  }
}

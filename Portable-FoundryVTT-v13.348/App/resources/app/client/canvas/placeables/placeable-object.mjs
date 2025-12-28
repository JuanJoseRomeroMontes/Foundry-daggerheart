import {RenderFlagsMixin} from "../interaction/render-flags.mjs";
import MouseInteractionManager from "../interaction/mouse-handler.mjs";
import Hooks from "@client/helpers/hooks.mjs";
import {getDocumentClass, getPlaceableObjectClass} from "@client/utils/helpers.mjs";

/**
 * @import DocumentSheetV2 from "../../applications/api/document-sheet.mjs";
 * @import BaseGrid from "@common/grid/base.mjs";
 * @import PlaceablesLayer from "../layers/base/placeables-layer.mjs";
 * @import ControlIcon from "../containers/elements/control-icon.mjs";
 * @import {Scene, User} from "../../documents/_module.mjs";
 */

/**
 * An Abstract Base Class which defines a Placeable Object which represents a Document placed on the Canvas
 * @category Canvas
 * @abstract
 */
export default class PlaceableObject extends RenderFlagsMixin(PIXI.Container) {
  /**
   * @param {CanvasDocument} document      The Document instance represented by this object
   */
  constructor(document) {
    super();
    if ( !(document instanceof foundry.abstract.Document) || !document.isEmbedded ) {
      throw new Error("You must provide an embedded Document instance as the input for a PlaceableObject");
    }

    /**
     * Retain a reference to the Scene within which this Placeable Object resides
     * @type {Scene}
     */
    this.scene = document.parent;

    /**
     * A reference to the Scene embedded Document instance which this object represents
     * @type {CanvasDocument}
     */
    this.document = document;

    /**
     * A control icon for interacting with the object
     * @type {ControlIcon|null}
     */
    this.controlIcon = null;

    /**
     * A mouse interaction manager instance which handles mouse workflows related to this object.
     * @type {MouseInteractionManager}
     */
    this.mouseInteractionManager = null;

    // Allow objects to be culled when off-screen
    this.cullable = true;
  }

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * Identify the official Document name for this PlaceableObject class
   * @type {string}
   */
  static embeddedName;

  /* -------------------------------------------- */

  /**
   * Return a reference to the configured subclass of this base PlaceableObject type.
   * @type {typeof PlaceableObject}
   */
  static get implementation() {
    return getPlaceableObjectClass(this.embeddedName);
  }

  /* -------------------------------------------- */

  /**
   * The flags declared here are required for all PlaceableObject subclasses to also support.
   * @override
   */
  static RENDER_FLAGS = {
    redraw: {propagate: ["refresh"]},
    refresh: {propagate: ["refreshState"], alias: true},
    refreshState: {}
  };

  /* -------------------------------------------- */

  /**
   * The object that this object is a preview of if this object is a preview.
   * @type {PlaceableObject|undefined}
   */
  get _original() {
    return this.#original;
  }

  /**
   * The object that this object is a preview of if this object is a preview.
   * @type {PlaceableObject|undefined}
   */
  #original;

  /* -------------------------------------------- */

  /**
   * The bounds that the placeable was added to the quadtree with.
   * @type {PIXI.Rectangle}
   */
  #lastQuadtreeBounds;

  /**
   * An internal reference to a Promise in-progress to draw the Placeable Object.
   * @type {Promise<PlaceableObject>}
   */
  #drawing = Promise.resolve(this);

  /**
   * Has this Placeable Object been drawn and is there no drawing in progress?
   * @type {boolean}
   */
  #drawn = false;

  /* -------------------------------------------- */

  /**
   * A convenient reference for whether the current User has full control over the document.
   * @type {boolean}
   */
  get isOwner() {
    return this.document.isOwner;
  }

  /* -------------------------------------------- */

  /**
   * The mouse interaction state of this placeable.
   * @type {MouseInteractionManager.INTERACTION_STATES|undefined}
   */
  get interactionState() {
    return this._original?.mouseInteractionManager?.state ?? this.mouseInteractionManager?.state;
  }

  /* -------------------------------------------- */

  /**
   * The bounding box for this PlaceableObject.
   * This is required if the layer uses a Quadtree, otherwise it is optional
   * @type {PIXI.Rectangle}
   */
  get bounds() {
    throw new Error("Each subclass of PlaceableObject must define its own bounds rectangle");
  }

  /* -------------------------------------------- */

  /**
   * The central coordinate pair of the placeable object based on it's own width and height
   * @type {PIXI.Point}
   */
  get center() {
    const d = this.document;
    if ( ("width" in d) && ("height" in d) ) {
      return new PIXI.Point(d.x + (d.width / 2), d.y + (d.height / 2));
    }
    return new PIXI.Point(d.x, d.y);
  }

  /* -------------------------------------------- */

  /**
   * The id of the corresponding Document which this PlaceableObject represents.
   * @type {string}
   */
  get id() {
    return this.document.id;
  }

  /* -------------------------------------------- */

  /**
   * A unique identifier which is used to uniquely identify elements on the canvas related to this object.
   * @type {string}
   */
  get objectId() {
    let id = `${this.document.documentName}.${this.document.id}`;
    if ( this.isPreview ) id += ".preview";
    return id;
  }

  /* -------------------------------------------- */

  /**
   * The named identified for the source object associated with this PlaceableObject.
   * This differs from the objectId because the sourceId is the same for preview objects as for the original.
   * @type {string}
   */
  get sourceId() {
    return `${this.document.documentName}.${this._original?.id ?? this.document.id ?? "preview"}`;
  }

  /* -------------------------------------------- */

  /**
   * Is this placeable object a temporary preview?
   * @type {boolean}
   */
  get isPreview() {
    return !!this._original || !this.document.id;
  }

  /* -------------------------------------------- */

  /**
   * Does there exist a temporary preview of this placeable object?
   * @type {boolean}
   */
  get hasPreview() {
    return !!this._preview;
  }

  /* -------------------------------------------- */

  /**
   * Provide a reference to the CanvasLayer which contains this PlaceableObject.
   * @type {PlaceablesLayer}
   */
  get layer() {
    return this.document.layer;
  }

  /* -------------------------------------------- */

  /**
   * A document sheet used to configure the properties of this Placeable Object or the Document it represents.
   * @type {DocumentSheetV2}
   */
  get sheet() {
    return this.document.sheet;
  }

  /**
   * An indicator for whether the object is currently controlled
   * @type {boolean}
   */
  get controlled() {
    return this.#controlled;
  }

  #controlled = false;

  /* -------------------------------------------- */

  /**
   * An indicator for whether the object is currently a hover target
   * @type {boolean}
   */
  get hover() {
    return this.#hover;
  }

  set hover(state) {
    this.#hover = typeof state === "boolean" ? state : false;
  }

  #hover = false;

  /* -------------------------------------------- */

  /**
   * Is the HUD display active for this Placeable?
   * @returns {boolean}
   */
  get hasActiveHUD() {
    return this.layer.hud?.object === this;
  }

  /* -------------------------------------------- */

  /**
   * Get the snapped position for a given position or the current position.
   * @param {Point} [position]  The position to be used instead of the current position
   * @returns {Point}           The snapped position
   */
  getSnappedPosition(position) {
    return this.layer.getSnappedPoint(position ?? this);
  }

  /* -------------------------------------------- */

  /**
   * Get the origin used for pasting the copied objects.
   * @param {PlaceableObject[]} copies    The objects that are copied
   * @returns {Point}                     The offset
   * @internal
   */
  static _getCopiedObjectsOrigin(copies) {

    // Get the center of all copies
    const center = {x: 0, y: 0};
    for ( const copy of copies ) {
      const c = copy.center;
      center.x += c.x;
      center.y += c.y;
    }
    center.x /= copies.length;
    center.y /= copies.length;

    // Offset of the destination position relative to the center
    return center;
  }

  /* -------------------------------------------- */

  /**
   * Get the data of the copied object pasted at the position given by the offset.
   * Called by {@link foundry.canvas.layers.PlaceablesLayer#pasteObjects} for each copied object.
   * @param {Point} offset                      The offset relative from the current position to the destination
   * @param {object} [options]                  Options of {@link foundry.canvas.layers.PlaceablesLayer#pasteObjects}
   * @param {boolean} [options.hidden=false]    Paste in a hidden state, if applicable. Default is false.
   * @param {boolean} [options.snap=true]       Snap to the grid. Default is true.
   * @returns {object}                          The update data
   * @internal
   */
  _pasteObject(offset, {hidden=false, snap=true}={}) {
    const {x, y} = this.document;
    let position = {x: x + offset.x, y: y + offset.y};
    const data = this.document.toObject();
    delete data._id;
    data.hidden ||= hidden;
    if ( snap ) {
      if ( this.scene === canvas.scene ) position = this.getSnappedPosition(position);
      else {
        const document = getDocumentClass(this.layer.constructor.documentName).fromSource(data, {parent: canvas.scene});
        const object = new this.layer.constructor.placeableClass(document);
        document._object = object;
        position = object.getSnappedPosition(position);
        object.destroy({children: true});
      }
    }
    const d = canvas.dimensions;
    data.x = Math.clamp(position.x, 0, d.width - 1);
    data.y = Math.clamp(position.y, 0, d.height - 1);
    return data;
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @override */
  applyRenderFlags() {
    if ( !this.renderFlags.size || this._destroyed ) return;
    const flags = this.renderFlags.clear();

    // Full re-draw
    if ( flags.redraw ) {
      this.draw();
      return;
    }

    // Don't refresh until the object is drawn
    if ( !this.#drawn ) return;

    // Incremental refresh
    this._applyRenderFlags(flags);
    Hooks.callAll(`refresh${this.document.documentName}`, this, flags);
  }

  /* -------------------------------------------- */

  /**
   * Apply render flags before a render occurs.
   * @param {Record<string, boolean>} flags  The render flags which must be applied
   * @protected
   */
  _applyRenderFlags(flags) {}

  /* -------------------------------------------- */

  /**
   * Clear the display of the existing object.
   * @returns {this} The cleared object
   */
  clear() {
    this.removeChildren().forEach(c => c.destroy({children: true}));
    return this;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  destroy(options) {
    this.mouseInteractionManager?.cancel();
    MouseInteractionManager.emulateMoveEvent();
    if ( this._original ) this._original._preview = undefined;
    this.document._object = null;
    this.document._destroyed = true;
    if ( this.controlIcon ) this.controlIcon.destroy();
    this.renderFlags.clear();
    Hooks.callAll(`destroy${this.document.documentName}`, this);
    this._destroy(options);
    return super.destroy(options);
  }

  /**
   * The inner _destroy method which may optionally be defined by each PlaceableObject subclass.
   * @param {object} [options]    Options passed to the initial destroy call
   * @protected
   */
  _destroy(options) {}

  /* -------------------------------------------- */

  /**
   * Draw the placeable object into its parent container
   * @param {object} [options]            Options which may modify the draw and refresh workflow
   * @returns {Promise<PlaceableObject>}  The drawn object
   */
  async draw(options={}) {
    return this.#drawing = this.#drawing.finally(async () => {
      this.#drawn = false;
      const wasVisible = this.visible;
      const wasRenderable = this.renderable;
      this.visible = false;
      this.renderable = false;
      this.clear();
      this.mouseInteractionManager?.cancel();
      MouseInteractionManager.emulateMoveEvent();
      await this._draw(options);
      Hooks.callAll(`draw${this.document.documentName}`, this);
      this.renderFlags.set({refresh: true}); // Refresh all flags
      if ( this.id ) this.activateListeners();
      this.visible = wasVisible;
      this.renderable = wasRenderable;
      this.#drawn = true;
      MouseInteractionManager.emulateMoveEvent();
    });
  }

  /**
   * The inner _draw method which must be defined by each PlaceableObject subclass.
   * @param {object} options            Options which may modify the draw workflow
   * @abstract
   * @protected
   */
  async _draw(options) {
    throw new Error(`The ${this.constructor.name} subclass of PlaceableObject must define the _draw method`);
  }

  /* -------------------------------------------- */

  /**
   * Execute a partial draw.
   * @param {() => Promise<void>} fn      The draw function
   * @returns {Promise<PlaceableObject>}  The drawn object
   * @internal
   */
  async _partialDraw(fn) {
    return this.#drawing = this.#drawing.finally(async () => {
      if ( !this.#drawn ) return;
      await fn();
    });
  }

  /* -------------------------------------------- */

  /**
   * Refresh all incremental render flags for the PlaceableObject.
   * This method is no longer used by the core software but provided for backwards compatibility.
   * @param {object} [options]      Options which may modify the refresh workflow
   * @returns {PlaceableObject}     The refreshed object
   */
  refresh(options={}) {
    this.renderFlags.set({refresh: true});
    return this;
  }

  /* -------------------------------------------- */

  /**
   * Update the quadtree.
   * @internal
   */
  _updateQuadtree() {
    const layer = this.layer;
    if ( !layer.quadtree || this.isPreview ) return;
    if ( this.destroyed || this.parent !== layer.objects ) {
      this.#lastQuadtreeBounds = undefined;
      layer.quadtree.remove(this);
      return;
    }
    const bounds = this.bounds;
    if ( !this.#lastQuadtreeBounds
      || bounds.x !== this.#lastQuadtreeBounds.x
      || bounds.y !== this.#lastQuadtreeBounds.y
      || bounds.width !== this.#lastQuadtreeBounds.width
      || bounds.height !== this.#lastQuadtreeBounds.height ) {
      this.#lastQuadtreeBounds = bounds;
      layer.quadtree.update({r: bounds, t: this});
    }
  }

  /* -------------------------------------------- */

  /**
   * Is this PlaceableObject within the selection rectangle?
   * @param {PIXI.Rectangle} rectangle    The selection rectangle
   * @protected
   */
  _overlapsSelection(rectangle) {
    const {x, y} = this.position;
    return rectangle.contains(x, y);
  }

  /* -------------------------------------------- */

  /**
   * Get the target opacity that should be used for a Placeable Object depending on its preview state.
   * @returns {number}
   * @protected
   */
  _getTargetAlpha() {
    const isDragging = this._original?.mouseInteractionManager?.isDragging ?? this.mouseInteractionManager?.isDragging;
    return isDragging ? (this.isPreview ? 0.8 : (this.hasPreview ? 0.4 : 1)) : 1;
  }

  /* -------------------------------------------- */

  /**
   * Register pending canvas operations which should occur after a new PlaceableObject of this type is created
   * @param {object} data
   * @param {object} options
   * @param {string} userId
   * @protected
   */
  _onCreate(data, options, userId) {}

  /* -------------------------------------------- */

  /**
   * Define additional steps taken when an existing placeable object of this type is updated with new data
   * @param {object} changed
   * @param {object} options
   * @param {string} userId
   * @protected
   */
  _onUpdate(changed, options, userId) {
    this._updateQuadtree();
    if ( this.parent && (("elevation" in changed) || ("sort" in changed)) ) this.parent.sortDirty = true;
  }

  /* -------------------------------------------- */

  /**
   * Define additional steps taken when an existing placeable object of this type is deleted
   * @param {object} options
   * @param {string} userId
   * @protected
   */
  _onDelete(options, userId) {
    this.release();
    const layer = this.layer;
    if ( layer.hover === this ) layer.hover = null;
    this.destroy({children: true});
  }

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /**
   * Assume control over a PlaceableObject, flagging it as controlled and enabling downstream behaviors
   * @param {object} [options]                        Additional options which modify the control request
   * @param {boolean} [options.releaseOthers=true]    Release any other controlled objects first
   * @returns {boolean}                               A flag denoting whether control was successful
   */
  control(options={}) {
    if ( !this.layer.options.controllableObjects ) return false;

    // Release other controlled objects
    if ( options.releaseOthers !== false ) {
      for ( const object of this.layer.controlled ) {
        if ( object !== this ) object.release();
      }
    }

    // Bail out if this object is already controlled, or not controllable
    if ( this.#controlled || !this.id ) return true;
    if ( !this._canControl(game.user) ) return false;

    // Toggle control status
    this.#controlled = true;
    this.layer.controlledObjects.set(this.id, this);

    // Trigger follow-up events and fire an on-control Hook
    this._onControl(options);
    Hooks.callAll(`control${this.constructor.embeddedName}`, this, this.#controlled);
    return true;
  }

  /* -------------------------------------------- */

  /**
   * Additional events that trigger once control of the object is established
   * @param {object} options    Optional parameters which apply for specific implementations
   * @protected
   */
  _onControl(options) {
    this.renderFlags.set({refreshState: true});
  }

  /* -------------------------------------------- */

  /**
   * Release control over a PlaceableObject, removing it from the controlled set
   * @param {object} options          Options which modify the releasing workflow
   * @returns {boolean}               A Boolean flag confirming the object was released.
   */
  release(options={}) {
    this.layer.controlledObjects.delete(this.id);
    if ( !this.#controlled ) return true;
    this.#controlled = false;

    // Trigger follow-up events
    this._onRelease(options);

    // Fire an on-release Hook
    Hooks.callAll(`control${this.constructor.embeddedName}`, this, this.#controlled);
    return true;
  }

  /* -------------------------------------------- */

  /**
   * Additional events which trigger once control of the object is released
   * @param {object} options          Options which modify the releasing workflow
   * @protected
   */
  _onRelease(options) {
    const layer = this.layer;
    this.hover = false;
    if ( this === layer.hover ) layer.hover = null;
    if ( this.hasActiveHUD ) layer.hud.close();
    this.renderFlags.set({refreshState: true});
  }

  /* -------------------------------------------- */

  /**
   * Clone the placeable object, returning a new object with identical attributes.
   * The returned object is non-interactive, and has no assigned ID.
   * If you plan to use it permanently you should call the create method.
   * @returns {PlaceableObject}  A new object with identical data
   */
  clone() {
    const cloneDoc = this.document.clone({}, {keepId: true});
    const clone = new this.constructor(cloneDoc);
    cloneDoc._object = clone;
    clone.#original = this;
    clone.#controlled = this.#controlled;
    this._preview = clone;
    return clone;
  }

  /* -------------------------------------------- */

  /**
   * Rotate the PlaceableObject to a certain angle of facing
   * @param {number} angle        The desired angle of rotation
   * @param {number} snap         Snap the angle of rotation to a certain target degree increment
   * @returns {Promise<PlaceableObject>} The rotated object
   */
  async rotate(angle, snap) {
    if ( !this.document.schema.has("rotation") ) return this;
    if ( game.paused && !game.user.isGM ) {
      ui.notifications.warn("GAME.PausedWarning", {localize: true});
      return this;
    }
    const rotation = this._updateRotation({angle, snap});
    await this.document.update({rotation});
    return this;
  }

  /* -------------------------------------------- */

  /**
   * Determine a new angle of rotation for a PlaceableObject either from an explicit angle or from a delta offset.
   * @param {object} options    An object which defines the rotation update parameters
   * @param {number} [options.angle]    An explicit angle, either this or delta must be provided
   * @param {number} [options.delta=0]  A relative angle delta, either this or the angle must be provided
   * @param {number} [options.snap=0]   A precision (in degrees) to which the resulting angle should snap. Default is 0.
   * @returns {number}          The new rotation angle for the object
   * @internal
   */
  _updateRotation({angle, delta=0, snap=0}={}) {
    let degrees = Number.isNumeric(angle) ? angle : this.document.rotation + delta;
    if ( snap > 0 ) degrees = degrees.toNearest(snap);
    return Math.normalizeDegrees(degrees);
  }

  /* -------------------------------------------- */

  /**
   * Obtain a shifted position for the Placeable Object.
   * @param {-1|0|1} dx         The number of grid units to shift along the X-axis
   * @param {-1|0|1} dy         The number of grid units to shift along the Y-axis
   * @param {-1|0|1} dz         The number of grid units to shift along the Z-axis
   * @returns {object}          The shifted target coordinates
   * @internal
   */
  _getShiftedPosition(dx, dy, dz) {
    const snapped = this.getSnappedPosition();
    snapped.elevation = this.document.elevation.toNearest(canvas.grid.distance, "floor");
    return PlaceableObject._getShiftedPosition(dx, dy, dz, this.document, snapped, this.scene.grid);
  }

  /* -------------------------------------------- */

  /**
   * Obtain the shifted position.
   * @param {-1|0|1} dx                 The number of grid units to shift along the X-axis
   * @param {-1|0|1} dy                 The number of grid units to shift along the Y-axis
   * @param {-1|0|1} dz                 The number of grid units to shift along the Z-axis
   * @param {ElevatedPoint} position    The unsnapped position
   * @param {ElevatedPoint} snapped     The snapped position
   * @param {BaseGrid} grid             The grid
   * @returns {ElevatedPoint}           The shifted target coordinates
   * @internal
   */
  static _getShiftedPosition(dx, dy, dz, position, snapped, grid) {
    const D = CONST.MOVEMENT_DIRECTIONS;
    let direction = 0;
    if ( dx < 0 ) {
      if ( position.x <= snapped.x + 0.5 ) direction |= D.LEFT;
    } else if ( dx > 0 ) {
      if ( position.x >= snapped.x - 0.5 ) direction |= D.RIGHT;
    }
    if ( dy < 0 ) {
      if ( position.y <= snapped.y + 0.5 ) direction |= D.UP;
    } else if ( dy > 0 ) {
      if ( position.y >= snapped.y - 0.5 ) direction |= D.DOWN;
    }
    if ( dz < 0 ) {
      if ( position.elevation <= snapped.elevation + 1e-8 ) direction |= D.DESCEND;
    } else if ( dz > 0 ) {
      if ( position.elevation >= snapped.elevation - 1e-8 ) direction |= D.ASCEND;
    }
    let biasX = 0;
    let biasY = 0;
    if ( grid.isHexagonal ) {
      if ( grid.columns ) biasY = 1;
      else biasX = 1;
    }
    const shifted = grid.getShiftedPoint({
      x: snapped.x + biasX,
      y: snapped.y + biasY,
      elevation: snapped.elevation
    }, direction);
    shifted.x -= biasX;
    shifted.y -= biasY;
    shifted.x = Math.round(shifted.x);
    shifted.y = Math.round(shifted.y);
    return shifted;
  }

  /* -------------------------------------------- */
  /*  Interactivity                               */
  /* -------------------------------------------- */

  /**
   * Activate interactivity for the Placeable Object
   */
  activateListeners() {
    const mgr = this._createInteractionManager();
    this.mouseInteractionManager = mgr.activate();
  }

  /* -------------------------------------------- */

  /**
   * Create a standard MouseInteractionManager for the PlaceableObject
   * @protected
   */
  _createInteractionManager() {

    // Handle permissions to perform various actions
    const permissions = {
      hoverIn: this._canHover,
      clickLeft: this._canControl,
      clickLeft2: this._canView,
      clickRight: this._canHUD,
      clickRight2: this._canConfigure,
      dragStart: this._canDrag,
      dragLeftStart: this._canDragLeftStart
    };

    // Define callback functions for each workflow step
    const callbacks = {
      hoverIn: this._onHoverIn,
      hoverOut: this._onHoverOut,
      clickLeft: this._onClickLeft,
      clickLeft2: this._onClickLeft2,
      clickRight: this._onClickRight,
      clickRight2: this._onClickRight2,
      unclickLeft: this._onUnclickLeft,
      unclickRight: this._onUnclickRight,
      dragLeftStart: this.#onDragLeftStart,
      dragLeftMove: this._onDragLeftMove,
      dragLeftDrop: this._onDragLeftDrop,
      dragLeftCancel: this.#onDragLeftCancel,
      dragRightStart: this.#onDragRightStart,
      dragRightMove: this._onDragRightMove,
      dragRightDrop: this._onDragRightDrop,
      dragRightCancel: this.#onDragRightCancel,
      longPress: this._onLongPress
    };

    // Define options
    const options = { target: this.controlIcon ? "controlIcon" : null };

    // Create the interaction manager
    return new MouseInteractionManager(this, canvas.stage, permissions, callbacks, options);
  }

  /* -------------------------------------------- */

  /**
   * Test whether a user can perform a certain interaction regarding a Placeable Object
   * @param {User} user       The User performing the action. Must be equal to `game.user`.
   * @param {"hover"|"control"|"drag"|"view"|"configure"|"HUD"|"create"|"update"|"delete"} action
   *                          The named action being attempted
   * @returns {boolean}       Does the User have rights to perform the action?
   */
  can(user, action) {
    const fn = this[`_can${action.titleCase()}`] ?? this[`_can${action}`];
    return fn ? fn.call(this, user) : false;
  }

  /* -------------------------------------------- */

  /**
   * Can the User access the HUD for this Placeable Object?
   * @param {User} user                      The User performing the action. Always equal to `game.user`.
   * @param {PIXI.FederatedEvent} [event]    The pointer event if this function was called by
   *                                         {@link foundry.canvas.interaction.MouseInteractionManager}.
   * @returns {boolean}
   * @protected
   */
  _canHUD(user, event) {
    return this.isOwner;
  }

  /* -------------------------------------------- */

  /**
   * Does the User have permission to configure the Placeable Object?
   * @param {User} user                      The User performing the action. Always equal to `game.user`.
   * @param {PIXI.FederatedEvent} [event]    The pointer event if this function was called by
   *                                         {@link foundry.canvas.interaction.MouseInteractionManager}.
   * @returns {boolean}
   * @protected
   */
  _canConfigure(user, event) {
    return this.document.canUserModify(user, "update");
  }

  /* -------------------------------------------- */

  /**
   * Does the User have permission to control the Placeable Object?
   * @param {User} user                      The User performing the action. Always equal to `game.user`.
   * @param {PIXI.FederatedEvent} [event]    The pointer event if this function was called by
   *                                         {@link foundry.canvas.interaction.MouseInteractionManager}.
   * @returns {boolean}
   * @protected
   */
  _canControl(user, event) {
    if ( !this.layer.active || this.isPreview ) return false;
    return this.document.canUserModify(user, "update");
  }

  /* -------------------------------------------- */

  /**
   * Does the User have permission to view details of the Placeable Object?
   * @param {User} user                      The User performing the action. Always equal to `game.user`.
   * @param {PIXI.FederatedEvent} [event]    The pointer event if this function was called by
   *                                         {@link foundry.canvas.interaction.MouseInteractionManager}.
   * @returns {boolean}
   * @protected
   */
  _canView(user, event) {
    return this.document.testUserPermission(user, "LIMITED");
  }

  /* -------------------------------------------- */

  /**
   * Does the User have permission to create the underlying Document?
   * @param {User} user                      The User performing the action. Always equal to `game.user`.
   * @param {PIXI.FederatedEvent} [event]    The pointer event if this function was called by
   *                                         {@link foundry.canvas.interaction.MouseInteractionManager}.
   * @returns {boolean}
   * @protected
   */
  _canCreate(user, event) {
    return user.isGM;
  }

  /* -------------------------------------------- */

  /**
   * Does the User have permission to drag this Placeable Object?
   * @param {User} user                      The User performing the action. Always equal to `game.user`.
   * @param {PIXI.FederatedEvent} [event]    The pointer event if this function was called by
   *                                         {@link foundry.canvas.interaction.MouseInteractionManager}.
   * @returns {boolean}
   * @protected
   */
  _canDrag(user, event) {
    return this._canControl(user, event);
  }

  /* -------------------------------------------- */

  /**
   * Does the User have permission to left-click drag this Placeable Object?
   * @param {User} user                      The User performing the action. Always equal to `game.user`.
   * @param {PIXI.FederatedEvent} event      The pointer event
   * @param {{notify: boolean}} [options]    Options, used internally
   * @returns {boolean}
   * @protected
   */
  _canDragLeftStart(user, event, {notify=true}={}) {
    if ( game.paused && !game.user.isGM ) {
      if ( notify ) ui.notifications.warn("GAME.PausedWarning", {localize: true});
      return false;
    }
    if ( this.document.schema.has("locked") && this.document.locked ) {
      if ( notify ) ui.notifications.warn("CONTROLS.ObjectIsLocked",
        {format: {type: game.i18n.localize(this.document.constructor.metadata.label)}});
      return false;
    }
    return true;
  }

  /* -------------------------------------------- */

  /**
   * Does the User have permission to hover on this Placeable Object?
   * @param {User} user                      The User performing the action. Always equal to `game.user`.
   * @param {PIXI.FederatedEvent} [event]    The pointer event if this function was called by
   *                                         {@link foundry.canvas.interaction.MouseInteractionManager}.
   * @returns {boolean}
   * @protected
   */
  _canHover(user, event) {
    return this._canControl(user, event);
  }

  /* -------------------------------------------- */

  /**
   * Does the User have permission to update the underlying Document?
   * @param {User} user                      The User performing the action. Always equal to `game.user`.
   * @param {PIXI.FederatedEvent} [event]    The pointer event if this function was called by
   *                                         {@link foundry.canvas.interaction.MouseInteractionManager}.
   * @returns {boolean}
   * @protected
   */
  _canUpdate(user, event) {
    return this._canControl(user, event);
  }

  /* -------------------------------------------- */

  /**
   * Does the User have permission to delete the underlying Document?
   * @param {User} user                      The User performing the action. Always equal to `game.user`.
   * @param {PIXI.FederatedEvent} [event]    The pointer event if this function was called by
   *                                         {@link foundry.canvas.interaction.MouseInteractionManager}.
   * @returns {boolean}
   * @protected
   */
  _canDelete(user, event) {
    return this._canControl(user, event);
  }

  /* -------------------------------------------- */

  /**
   * Actions that should be taken for this Placeable Object when a mouseover event occurs.
   * Hover events on PlaceableObject instances allow event propagation by default.
   * @param {PIXI.FederatedEvent} event                The triggering canvas interaction event
   * @param {object} options                           Options which customize event handling
   * @param {boolean} [options.hoverOutOthers=false]   Trigger hover-out behavior on sibling objects
   * @returns {boolean|void}
   * @protected
   */
  _onHoverIn(event, {hoverOutOthers=false}={}) {
    if ( this.hover ) return;
    if ( event.buttons & 0x03 ) return; // Returning if hovering is happening with pressed left or right button

    // Handle the event
    const layer = this.layer;
    layer.hover = this;
    if ( hoverOutOthers ) {
      for ( const o of layer.placeables ) {
        if ( o !== this ) o._onHoverOut(event);
      }
    }
    this.hover = true;

    // Set render flags
    this.renderFlags.set({refreshState: true});
    Hooks.callAll(`hover${this.constructor.embeddedName}`, this, this.hover);
  }

  /* -------------------------------------------- */

  /**
   * Actions that should be taken for this Placeable Object when a mouseout event occurs
   * @param {PIXI.FederatedEvent} event  The triggering canvas interaction event
   * @protected
   */
  _onHoverOut(event) {
    if ( !this.hover ) return;

    // Handle the event
    const layer = this.layer;
    layer.hover = null;
    this.hover = false;

    // Set render flags
    this.renderFlags.set({refreshState: true});
    Hooks.callAll(`hover${this.constructor.embeddedName}`, this, this.hover);
  }

  /* -------------------------------------------- */

  /**
   * Should the placeable propagate left click downstream?
   * @param {PIXI.FederatedEvent} event
   * @returns {boolean}
   * @protected
   */
  _propagateLeftClick(event) {
    return false;
  }

  /* -------------------------------------------- */

  /**
   * Callback actions which occur on a single left-click event to assume control of the object
   * @param {PIXI.FederatedEvent} event  The triggering canvas interaction event
   * @returns {boolean|void}
   * @protected
   */
  _onClickLeft(event) {
    this.layer.hud?.close();

    // Add or remove the Placeable Object from the currently controlled set
    if ( !this.#controlled ) this.control({releaseOthers: !event.shiftKey});
    else if ( event.shiftKey ) event.interactionData.release = true; // Release on unclick

    // Propagate left click to the underlying canvas?
    if ( !this._propagateLeftClick(event) ) event.stopPropagation();
  }

  /* -------------------------------------------- */

  /**
   * Callback actions which occur on a single left-unclick event to assume control of the object
   * @param {PIXI.FederatedEvent} event  The triggering canvas interaction event
   * @protected
   */
  _onUnclickLeft(event) {
    // Remove Placeable Object from the currently controlled set
    if ( event.interactionData.release === true ) this.release();

    // Propagate left click to the underlying canvas?
    if ( !this._propagateLeftClick(event) ) event.stopPropagation();
  }

  /* -------------------------------------------- */

  /**
   * Callback actions which occur on a double left-click event to activate
   * @param {PIXI.FederatedEvent} event  The triggering canvas interaction event
   * @protected
   */
  _onClickLeft2(event) {
    this.sheet.render({force: true});
    if ( !this._propagateLeftClick(event) ) event.stopPropagation();
  }

  /* -------------------------------------------- */

  /**
   * Should the placeable propagate right click downstream?
   * @param {PIXI.FederatedEvent} event
   * @returns {boolean}
   * @protected
   */
  _propagateRightClick(event) {
    return false;
  }

  /* -------------------------------------------- */

  /**
   * Callback actions which occur on a single right-click event to configure properties of the object
   * @param {PIXI.FederatedEvent} event  The triggering canvas interaction event
   * @protected
   */
  _onClickRight(event) {
    if ( this.layer.hud ) {
      const releaseOthers = !this.#controlled && !event.shiftKey;
      this.control({releaseOthers});
      if ( this.hasActiveHUD ) this.layer.hud.close();
      else this.layer.hud.bind(this);
    }

    // Propagate the right-click to the underlying canvas?
    if ( !this._propagateRightClick(event) ) event.stopPropagation();
  }

  /* -------------------------------------------- */

  /**
   * Callback actions which occur on a single right-unclick event
   * @param {PIXI.FederatedEvent} event  The triggering canvas interaction event
   * @protected
   */
  _onUnclickRight(event) {
    // Propagate right-click to the underlying canvas?
    if ( !this._propagateRightClick(event) ) event.stopPropagation();
  }

  /* -------------------------------------------- */

  /**
   * Callback actions which occur on a double right-click event to configure properties of the object
   * @param {PIXI.FederatedEvent} event  The triggering canvas interaction event
   * @protected
   */
  _onClickRight2(event) {
    const sheet = this.sheet;
    if ( sheet ) sheet.render(true);
    if ( !this._propagateRightClick(event) ) event.stopPropagation();
  }

  /* -------------------------------------------- */

  /**
   * Callback actions which occur when a mouse-drag action is first begun.
   * @param {PIXI.FederatedEvent} event  The triggering canvas interaction event
   * @returns {boolean|void}             If false, the start if prevented
   */
  #onDragLeftStart(event) {
    const allowed = this._onDragLeftStart(event);
    if ( allowed === false ) return false;
    this._initializeDragLeft(event);
  }

  /* -------------------------------------------- */

  /**
   * Callback actions which occur when a mouse-drag action is first begun.
   * @param {PIXI.FederatedEvent} event  The triggering canvas interaction event
   * @returns {boolean|void}             If false, the start if prevented
   * @protected
   */
  _onDragLeftStart(event) {}

  /* -------------------------------------------- */

  /**
   * Initialize the left-drag operation.
   * @param {PIXI.FederatedEvent} event  The triggering canvas interaction event
   * @protected
   */
  _initializeDragLeft(event) {
    const objects = this.layer.options.controllableObjects ? this.layer.controlled : [this];
    const clones = [];
    for ( const o of objects ) {
      if ( !o._canDrag(game.user, event) || !o._canDragLeftStart(game.user, event, {notify: false})) continue;

      // Clone the object
      const c = o.clone();
      clones.push(c);

      // Draw the clone
      c._onDragStart();
      c.visible = false;
      this.layer.preview.addChild(c);
      c.draw().then(c => c.visible = true);
    }
    event.interactionData.clones = clones;
  }

  /* -------------------------------------------- */

  /**
   * Begin a drag operation from the perspective of the preview clone.
   * Modify the appearance of both the clone (this) and the original (_original) object.
   * @protected
   */
  _onDragStart() {
    const o = this._original;
    o.document.locked = true;
    o.renderFlags.set({refreshState: true});
  }

  /* -------------------------------------------- */

  /**
   * Conclude a drag operation from the perspective of the preview clone.
   * Modify the appearance of both the clone (this) and the original (_original) object.
   * @protected
   */
  _onDragEnd() {
    const o = this._original;
    if ( o ) {
      o.document.locked = o.document._source.locked;
      o.renderFlags.set({refreshState: true});
    }
  }

  /* -------------------------------------------- */

  /**
   * Callback actions which occur on a mouse-move operation.
   * @param {PIXI.FederatedEvent} event  The triggering canvas interaction event
   * @protected
   */
  _onDragLeftMove(event) {
    canvas._onDragCanvasPan(event);
    const {clones, destination, origin} = event.interactionData;

    // Calculate the (snapped) position of the dragged object
    let position = {
      x: this.document.x + (destination.x - origin.x),
      y: this.document.y + (destination.y - origin.y)
    };
    if ( !event.shiftKey ) position = this.getSnappedPosition(position);

    // Move all other objects in the selection relative to the the dragged object.
    // We want to avoid that the dragged object doesn't move when the cursor is moved,
    // because it snaps to the same position, but other objects in the selection do.
    const dx = position.x - this.document.x;
    const dy = position.y - this.document.y;
    for ( const c of clones || [] ) {
      const o = c._original;
      let position = {x: o.document.x + dx, y: o.document.y + dy};
      if ( !event.shiftKey ) position = this.getSnappedPosition(position);
      c.document.x = position.x;
      c.document.y = position.y;
      c.renderFlags.set({refreshPosition: true});
    }
  }

  /* -------------------------------------------- */

  /**
   * Callback actions which occur on a mouse-move operation.
   * @param {PIXI.FederatedEvent} event  The triggering canvas interaction event
   * @protected
   */
  _onDragLeftDrop(event) {

    // Ensure that we landed in bounds
    const {clones, destination} = event.interactionData;
    if ( !clones || !canvas.dimensions.rect.contains(destination.x, destination.y) ) return false;
    event.interactionData.clearPreviewContainer = false;

    // Perform database updates using dropped data
    let result = this._prepareDragLeftDropUpdates(event);
    if ( !result ) return;
    if ( !Array.isArray(result[0]) ) result = [result];
    // noinspection ES6MissingAwait
    this.#commitDragLeftDropUpdates(...result);
  }

  /* -------------------------------------------- */

  /**
   * Perform the database updates that should occur as the result of a drag-left-drop operation.
   * @param {PIXI.FederatedEvent} event The triggering canvas interaction event
   * @returns {[updates: object[], options?: object]|object[]|null}
   *   An array of database updates to perform for documents in this collection
   * @protected
   */
  _prepareDragLeftDropUpdates(event) {
    const updates = [];
    for ( const clone of event.interactionData.clones ) {
      let dest = {x: clone.document.x, y: clone.document.y};
      if ( !event.shiftKey ) dest = this.getSnappedPosition(dest);
      updates.push({_id: clone._original.id, x: dest.x, y: dest.y, rotation: clone.document.rotation});
    }
    return updates;
  }

  /* -------------------------------------------- */

  /**
   * Perform database updates using the result of a drag-left-drop operation.
   * @param {object[]} updates      The database updates for documents in this collection
   * @param {object} [options]      Additional update options
   * @returns {Promise<void>}
   */
  async #commitDragLeftDropUpdates(updates, options) {
    for ( const u of updates ) {
      const d = this.document.collection.get(u._id);
      if ( d ) d.locked = d._source.locked; // Unlock original documents
    }
    await canvas.scene.updateEmbeddedDocuments(this.document.documentName, updates, options);
    this.layer.clearPreviewContainer();
  }

  /* -------------------------------------------- */

  /**
   * Callback actions which occur on a mouse-move operation.
   * @param {PIXI.FederatedEvent} event  The triggering mouse click event
   * @returns {boolean|void}             If false, the cancellation is prevented
   */
  #onDragLeftCancel(event) {
    const allowed = this._onDragLeftCancel(event);
    if ( allowed === false ) return false;
    this._finalizeDragLeft(event);
  }

  /* -------------------------------------------- */

  /**
   * Callback actions which occur on a mouse-move operation.
   * @param {PIXI.FederatedEvent} event  The triggering mouse click event
   * @returns {boolean|void}             If false, the cancellation is prevented
   * @protected
   */
  _onDragLeftCancel(event) {}

  /* -------------------------------------------- */

  /**
   * Finalize the left-drag operation.
   * @param {PIXI.FederatedEvent} event  The triggering mouse click event
   * @protected
   */
  _finalizeDragLeft(event) {
    if ( event.interactionData.clearPreviewContainer !== false ) {
      this.layer.clearPreviewContainer();
    }
  }

  /* -------------------------------------------- */

  /**
   * Callback actions which occur on a right mouse-drag operation.
   * @param {PIXI.FederatedEvent} event  The triggering mouse click event
   * @returns {false|void} If false, the start if prevented
   * @protected
   */
  #onDragRightStart(event) {
    const allowed = this._onDragRightStart(event);
    if ( allowed === false ) return false;
    this._initializeDragRight(event);

  }

  /* -------------------------------------------- */

  /**
   * Callback actions which occur on a right mouse-drag operation.
   * @param {PIXI.FederatedEvent} event  The triggering mouse click event
   * @returns {false|void} If false, the start if prevented
   * @protected
   */
  _onDragRightStart(event) {
    return canvas._onDragRightStart(event);
  }

  /* -------------------------------------------- */

  /**
   * Initialize the right-drag operation.
   * @param {PIXI.FederatedEvent} event  The triggering canvas interaction event
   * @protected
   */
  _initializeDragRight(event) {}

  /* -------------------------------------------- */

  /**
   * Callback actions which occur on a right mouse-drag operation.
   * @param {PIXI.FederatedEvent} event  The triggering canvas interaction event
   * @protected
   */
  _onDragRightMove(event) {
    return canvas._onDragRightMove(event);
  }

  /* -------------------------------------------- */

  /**
   * Callback actions which occur on a right mouse-drag operation.
   * @param {PIXI.FederatedEvent} event  The triggering canvas interaction event
   * @protected
   */
  _onDragRightDrop(event) {
    return canvas._onDragRightDrop(event);
  }

  /* -------------------------------------------- */

  /**
   * Callback actions which occur on a right mouse-drag operation.
   * @param {PIXI.FederatedEvent} event  The triggering mouse click event
   * @returns {boolean|void}             If false, the cancellation is prevented
   */
  #onDragRightCancel(event) {
    const allowed = this._onDragRightCancel(event);
    if ( allowed === false ) return false;
    this._finalizeDragRight(event);
  }

  /* -------------------------------------------- */

  /**
   * Callback actions which occur on a right mouse-drag operation.
   * @param {PIXI.FederatedEvent} event  The triggering mouse click event
   * @returns {boolean|void}             If false, the cancellation is prevented
   * @protected
   */
  _onDragRightCancel(event) {
    return canvas._onDragRightCancel(event);
  }

  /* -------------------------------------------- */

  /**
   * Finalize the right-drag operation.
   * @param {PIXI.FederatedEvent} event  The triggering mouse click event
   * @protected
   */
  _finalizeDragRight(event) {}

  /* -------------------------------------------- */

  /**
   * Callback action which occurs on a long press.
   * @param {PIXI.FederatedEvent}   event   The triggering canvas interaction event
   * @param {PIXI.Point}            origin  The local canvas coordinates of the mousepress.
   * @protected
   */
  _onLongPress(event, origin) {
    return canvas.controls._onLongPress(event, origin);
  }
}

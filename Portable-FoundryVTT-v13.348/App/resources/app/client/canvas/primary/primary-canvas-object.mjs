import PlaceableObject from "../placeables/placeable-object.mjs";

/**
 * A mixin which decorates a DisplayObject with additional properties expected for rendering in the PrimaryCanvasGroup.
 * @category Mixins
 * @param {typeof PIXI.DisplayObject} DisplayObject   The parent DisplayObject class being mixed
 */
export default function PrimaryCanvasObjectMixin(DisplayObject) {

  /**
   * A display object rendered in the PrimaryCanvasGroup.
   * @param {...*} args    The arguments passed to the base class constructor
   */
  return class PrimaryCanvasObject extends CanvasTransformMixin(DisplayObject) {
    constructor(...args) {
      super(...args);
      // Activate culling and initialize handlers
      this.cullable = true;
      this.on("added", this._onAdded);
      this.on("removed", this._onRemoved);
    }

    /**
     * An optional reference to the object that owns this PCO.
     * This property does not affect the behavior of the PCO itself.
     * @type {*}
     * @default null
     */
    object = null;

    /**
     * The entry in the quadtree.
     * @type {QuadtreeObject|null}
     */
    #quadtreeEntry = null;

    /**
     * Update the quadtree entry?
     * @type {boolean}
     */
    #quadtreeDirty = false;

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * The elevation of this object.
     * @type {number}
     */
    get elevation() {
      return this.#elevation;
    }

    set elevation(value) {
      if ( (typeof value !== "number") || Number.isNaN(value) ) {
        throw new Error("PrimaryCanvasObject#elevation must be a numeric value.");
      }
      if ( value === this.#elevation ) return;
      this.#elevation = value;
      if ( this.parent ) {
        this.parent.sortDirty = true;
        if ( this.shouldRenderDepth ) canvas.masks.depth._elevationDirty = true;
      }
    }

    #elevation = 0;

    /* -------------------------------------------- */

    /**
     * A key which resolves ties amongst objects at the same elevation within the same layer.
     * @type {number}
     */
    get sort() {
      return this.#sort;
    }

    set sort(value) {
      if ( (typeof value !== "number") || Number.isNaN(value) ) {
        throw new Error("PrimaryCanvasObject#sort must be a numeric value.");
      }
      if ( value === this.#sort ) return;
      this.#sort = value;
      if ( this.parent ) this.parent.sortDirty = true;
    }

    #sort = 0;

    /* -------------------------------------------- */

    /**
     * A key which resolves ties amongst objects at the same elevation of different layers.
     * @type {number}
     */
    get sortLayer() {
      return this.#sortLayer;
    }

    set sortLayer(value) {
      if ( (typeof value !== "number") || Number.isNaN(value) ) {
        throw new Error("PrimaryCanvasObject#sortLayer must be a numeric value.");
      }
      if ( value === this.#sortLayer ) return;
      this.#sortLayer = value;
      if ( this.parent ) this.parent.sortDirty = true;
    }

    #sortLayer = 0;

    /* -------------------------------------------- */

    /**
     * A key which resolves ties amongst objects at the same elevation within the same layer and same sort.
     * @type {number}
     */
    get zIndex() {
      return this._zIndex;
    }

    set zIndex(value) {
      if ( (typeof value !== "number") || Number.isNaN(value) ) {
        throw new Error("PrimaryCanvasObject#zIndex must be a numeric value.");
      }
      if ( value === this._zIndex ) return;
      this._zIndex = value;
      if ( this.parent ) this.parent.sortDirty = true;
    }

    /* -------------------------------------------- */
    /*  PIXI Events                                 */
    /* -------------------------------------------- */

    /**
     * Event fired when this display object is added to a parent.
     * @param {PIXI.Container} parent   The new parent container.
     * @protected
     */
    _onAdded(parent) {
      if ( (parent !== canvas.primary) && !(parent instanceof foundry.canvas.primary.PrimaryCanvasContainer) ) {
        throw new Error("PrimaryCanvasObject instances may only be direct children of the PrimaryCanvasGroup");
      }
    }

    /* -------------------------------------------- */

    /**
     * Event fired when this display object is removed from its parent.
     * @param {PIXI.Container} parent   Parent from which the PCO is removed.
     * @protected
     */
    _onRemoved(parent) {
      this.#updateQuadtree(true);
    }

    /* -------------------------------------------- */
    /*  Canvas Transform & Quadtree                 */
    /* -------------------------------------------- */

    /** @inheritDoc */
    updateCanvasTransform() {
      super.updateCanvasTransform();
      this.#updateQuadtree();
      this.#updateDepth();
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    _onCanvasBoundsUpdate() {
      super._onCanvasBoundsUpdate();
      this.#quadtreeDirty = true;
    }

    /* -------------------------------------------- */

    /**
     * Update the quadtree.
     * @param {boolean} [remove=false]    Remove the quadtree entry?
     */
    #updateQuadtree(remove=false) {
      if ( !this.#quadtreeDirty && !remove ) return;
      this.#quadtreeDirty = false;
      if ( !remove && (this.canvasBounds.width > 0) && (this.canvasBounds.height > 0) ) {
        this.#quadtreeEntry ??= {r: this.canvasBounds, t: this};
        canvas.primary.quadtree.update(this.#quadtreeEntry);
      } else if ( this.#quadtreeEntry ) {
        this.#quadtreeEntry = null;
        canvas.primary.quadtree.remove(this);
      }
    }

    /* -------------------------------------------- */
    /*  PCO Properties                              */
    /* -------------------------------------------- */

    /**
     * Does this object render to the depth buffer?
     * @type {boolean}
     */
    get shouldRenderDepth() {
      return this.#shouldRenderDepth;
    }

    /** @type {boolean} */
    #shouldRenderDepth = false;

    /* -------------------------------------------- */
    /*  Depth Rendering                             */
    /* -------------------------------------------- */

    /**
     * Flag the depth as dirty if necessary.
     */
    #updateDepth() {
      const shouldRenderDepth = this._shouldRenderDepth();
      if ( this.#shouldRenderDepth === shouldRenderDepth ) return;
      this.#shouldRenderDepth = shouldRenderDepth;
      canvas.masks.depth._elevationDirty = true;
    }

    /* -------------------------------------------- */

    /**
     * Does this object render to the depth buffer?
     * @returns {boolean}
     * @protected
     */
    _shouldRenderDepth() {
      return false;
    }

    /* -------------------------------------------- */

    /**
     * Render the depth of this object.
     * @param {PIXI.Renderer} renderer
     */
    renderDepthData(renderer) {}

    /* -------------------------------------------- */
    /*  Deprecations and Compatibility              */
    /* -------------------------------------------- */

    /**
     * @deprecated since v12
     * @ignore
     */
    get document() {
      foundry.utils.logCompatibilityWarning("PrimaryCanvasObject#document is deprecated.", {since: 12, until: 14});
      if ( !(this.object instanceof PlaceableObject) ) return null;
      return this.object.document || null;
    }

    /* -------------------------------------------- */

    /**
     * @deprecated since v12
     * @ignore
     */
    updateBounds() {
      const msg = "PrimaryCanvasObject#updateBounds is deprecated and has no effect.";
      foundry.utils.logCompatibilityWarning(msg, {since: 12, until: 14});
    }
  };
}

/**
 * A mixin which decorates a DisplayObject with additional properties for canvas transforms and bounds.
 * @category Mixins
 * @param {typeof PIXI.DisplayObject} DisplayObject   The parent DisplayObject class being mixed
 */
export function CanvasTransformMixin(DisplayObject) {
  class CanvasTransform extends DisplayObject {
    constructor(...args) {
      super(...args);
      this.on("added", this.#resetCanvasTransformParentID);
      this.on("removed", this.#resetCanvasTransformParentID);
    }

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * The transform matrix from local space to canvas space.
     * @type {PIXI.Matrix}
     */
    canvasTransform = new PIXI.Matrix();

    /* -------------------------------------------- */

    /**
     * The update ID of canvas transform matrix.
     * @type {number}
     * @internal
     */
    _canvasTransformID = -1;

    /* -------------------------------------------- */

    /**
     * The update ID of the local transform of this object.
     * @type {number}
     */
    #canvasTransformLocalID = -1;

    /* -------------------------------------------- */

    /**
     * The update ID of the canvas transform of the parent.
     * @type {number}
     */
    #canvasTransformParentID = -1;

    /* -------------------------------------------- */

    /**
     * The canvas bounds of this object.
     * @type {PIXI.Rectangle}
     */
    canvasBounds = new PIXI.Rectangle();

    /* -------------------------------------------- */

    /**
     * The canvas bounds of this object.
     * @type {PIXI.Bounds}
     * @protected
     */
    _canvasBounds = new PIXI.Bounds();

    /* -------------------------------------------- */

    /**
     * The update ID of the canvas bounds.
     * Increment to force recalculation.
     * @type {number}
     * @protected
     */
    _canvasBoundsID = 0;

    /* -------------------------------------------- */

    /**
     * Reset the parent ID of the canvas transform.
     */
    #resetCanvasTransformParentID() {
      this.#canvasTransformParentID = -1;
    }

    /* -------------------------------------------- */
    /*  Methods                                     */
    /* -------------------------------------------- */

    /**
     * Calculate the canvas bounds of this object.
     * @protected
     */
    _calculateCanvasBounds() {}

    /* -------------------------------------------- */

    /**
     * Recalculate the canvas transform and bounds of this object and its children, if necessary.
     */
    updateCanvasTransform() {
      this.transform.updateLocalTransform();

      // If the local transform or the parent canvas transform has changed,
      // recalculate the canvas transform of this object
      if ( (this.#canvasTransformLocalID !== this.transform._localID)
        || (this.#canvasTransformParentID !== (this.parent._canvasTransformID ?? 0)) ) {
        this.#canvasTransformLocalID = this.transform._localID;
        this.#canvasTransformParentID = this.parent._canvasTransformID ?? 0;
        this._canvasTransformID++;
        this.canvasTransform.copyFrom(this.transform.localTransform);

        // Prepend the parent canvas transform matrix (if exists)
        if ( this.parent.canvasTransform ) this.canvasTransform.prepend(this.parent.canvasTransform);
        this._canvasBoundsID++;
        this._onCanvasTransformUpdate();
      }

      // Recalculate the canvas bounds of this object if necessary
      if ( this._canvasBounds.updateID !== this._canvasBoundsID ) {
        this._canvasBounds.updateID = this._canvasBoundsID;
        this._canvasBounds.clear();
        this._calculateCanvasBounds();

        // Set the width and height of the canvas bounds rectangle to 0
        // if the bounds are empty. PIXI.Bounds#getRectangle does not
        // change the rectangle passed to it if the bounds are empty:
        // so we need to handle the empty case here.
        if ( this._canvasBounds.isEmpty() ) {
          this.canvasBounds.x = this.x;
          this.canvasBounds.y = this.y;
          this.canvasBounds.width = 0;
          this.canvasBounds.height = 0;
        }

        // Update the canvas bounds rectangle
        else this._canvasBounds.getRectangle(this.canvasBounds);
        this._onCanvasBoundsUpdate();
      }

      // Recursively update child canvas transforms
      const children = this.children;
      for ( let i = 0, n = children.length; i < n; i++ ) {
        children[i].updateCanvasTransform?.();
      }
    }

    /* -------------------------------------------- */

    /**
     * Called when the canvas transform changed.
     * @protected
     */
    _onCanvasTransformUpdate() {}

    /* -------------------------------------------- */

    /**
     * Called when the canvas bounds changed.
     * @protected
     */
    _onCanvasBoundsUpdate() {}

    /* -------------------------------------------- */

    /**
     * Is the given point in canvas space contained in this object?
     * @param {PIXI.IPointData} point    The point in canvas space.
     * @returns {boolean}
     */
    containsCanvasPoint(point) {
      return false;
    }
  }
  return CanvasTransform;
}

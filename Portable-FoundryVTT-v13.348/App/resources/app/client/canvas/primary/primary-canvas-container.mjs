import {CanvasTransformMixin} from "./primary-canvas-object.mjs";
import PrimaryCanvasGroup from "../groups/primary.mjs";

/**
 * Primary canvas container are reserved for advanced usage.
 * They allow to group PrimarySpriteMesh in a single Container.
 * The container elevation is replacing individual sprite elevation.
 */
export default class PrimaryCanvasContainer extends CanvasTransformMixin(PIXI.Container) {

  /* -------------------------------------------- */
  /*  Properties                                  */
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
      throw new Error("PrimaryCanvasContainer#sort must be a numeric value.");
    }
    if ( value === this.#sort ) return;
    this.#sort = value;
    if ( this.parent ) this.parent.sortDirty = true;
  }

  #sort = 0;

  /* -------------------------------------------- */

  /**
   * The elevation of this container.
   * @type {number}
   */
  get elevation() {
    return this.#elevation;
  }

  set elevation(value) {
    if ( (typeof value !== "number") || Number.isNaN(value) ) {
      throw new Error("PrimaryCanvasContainer#elevation must be a numeric value.");
    }
    if ( value === this.#elevation ) return;
    this.#elevation = value;
    if ( this.parent ) {
      this.parent.sortDirty = true;
      for ( const child of this.children ) {
        if ( child?.shouldRenderDepth ) {
          canvas.masks.depth._elevationDirty = true;
          break;
        }
      }
    }
  }

  #elevation = 0;

  /* -------------------------------------------- */

  /**
   * To know if this container has at least one children that should render its depth.
   * @returns {boolean}
   */
  get shouldRenderDepth() {
    return this.children.some(child => child.shouldRenderDepth === true);
  }

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /** @override */
  sortChildren() {
    const children = this.children;
    for ( let i = 0, n = children.length; i < n; i++ ) children[i]._lastSortedIndex = i;
    children.sort(PrimaryCanvasGroup._compareObjects);
    this.sortDirty = false;
  }

  /* -------------------------------------------- */

  /** @override */
  updateCanvasTransform() {
    if ( this.sortDirty ) this.sortChildren();
    super.updateCanvasTransform();
  }

  /* -------------------------------------------- */

  /** @override */
  renderDepthData(renderer) {
    for ( const c of this.children ) c.renderDepthData?.(renderer);
  }
}

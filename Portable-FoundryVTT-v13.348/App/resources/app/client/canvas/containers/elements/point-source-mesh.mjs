/**
 * Extension of a PIXI.Mesh for PointEffectSources.
 */
export default class PointSourceMesh extends PIXI.Mesh {

  /**
   * The transform world ID of the bounds.
   * @type {number}
   */
  #worldID = -1;

  /**
   * The geometry update ID of the bounds.
   * @type {number}
   */
  #updateID = -1;

  /* -------------------------------------------- */
  /*  PointSourceMesh Properties                  */
  /* -------------------------------------------- */

  /** @override */
  get geometry() {
    return super.geometry;
  }

  /** @override */
  set geometry(value) {
    if ( (this._geometry !== value) && (this._geometry !== undefined) ) this.#updateID = -1;
    super.geometry = value;
  }

  /* -------------------------------------------- */
  /*  PointSourceMesh Methods                     */
  /* -------------------------------------------- */

  /** @override */
  addChild() {
    throw new Error("You can't add children to a PointSourceMesh.");
  }

  /* ---------------------------------------- */

  /** @override */
  addChildAt() {
    throw new Error("You can't add children to a PointSourceMesh.");
  }

  /* ---------------------------------------- */

  /** @override */
  calculateBounds() {
    const {transform, geometry} = this;

    // Checking bounds id to update only when it is necessary
    if ( this.#worldID !== transform._worldID
      || this.#updateID !== geometry.buffers[0]._updateID ) {

      this.#worldID = transform._worldID;
      this.#updateID = geometry.buffers[0]._updateID;

      const {x, y, width, height} = this.geometry.bounds;
      this._bounds.clear();
      this._bounds.addFrame(transform, x, y, x + width, y + height);
    }

    this._bounds.updateID = this._boundsID;
  }

  /* ---------------------------------------- */

  /** @override */
  _calculateBounds() {
    this.calculateBounds();
  }

  /* ---------------------------------------- */

  /**
   * The local bounds need to be drawn from the underlying geometry.
   * @override
   */
  getLocalBounds(rect) {
    rect ??= this._localBoundsRect ??= new PIXI.Rectangle();
    return this.geometry.bounds.copyTo(rect);
  }
}

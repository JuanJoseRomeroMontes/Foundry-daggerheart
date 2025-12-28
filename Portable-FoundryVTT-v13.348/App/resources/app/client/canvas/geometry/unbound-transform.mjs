/**
 * A custom Transform class which is not bound to the parent worldTransform.
 * localTransform are working as usual.
 */
export default class UnboundTransform extends PIXI.Transform {
  /** @override */
  static IDENTITY = new UnboundTransform();

  /* -------------------------------------------- */

  /** @override */
  updateTransform(parentTransform) {
    const lt = this.localTransform;

    if ( this._localID !== this._currentLocalID ) {
      // Get the matrix values of the displayobject based on its transform properties..
      lt.a = this._cx * this.scale.x;
      lt.b = this._sx * this.scale.x;
      lt.c = this._cy * this.scale.y;
      lt.d = this._sy * this.scale.y;

      lt.tx = this.position.x - ((this.pivot.x * lt.a) + (this.pivot.y * lt.c));
      lt.ty = this.position.y - ((this.pivot.x * lt.b) + (this.pivot.y * lt.d));
      this._currentLocalID = this._localID;

      // Force an update
      this._parentID = -1;
    }

    if ( this._parentID !== parentTransform._worldID ) {
      // We don't use the values from the parent transform. We're just updating IDs.
      this._parentID = parentTransform._worldID;
      this._worldID++;
    }
  }
}

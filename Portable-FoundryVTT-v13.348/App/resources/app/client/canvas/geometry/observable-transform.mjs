/**
 * A custom Transform class allowing to observe changes with a callback.
 */
export default class ObservableTransform extends PIXI.Transform {
  /**
   * @param {Function} callback          The callback called to observe changes.
   * @param {object} scope               The scope of the callback.
   */
  constructor(callback, scope) {
    super();
    if ( !(callback instanceof Function) ) {
      throw new Error("The callback bound to an ObservableTransform class must be a valid function.");
    }
    if ( !(scope instanceof Object) ) {
      throw new Error("The scope bound to an ObservableTransform class must be a valid object/class.");
    }
    this.scope = scope;
    this.cb = callback;
  }

  /**
   * The callback which is observing the changes.
   * @type {Function}
   */
  cb;

  /**
   * The scope of the callback.
   * @type {object}
   */
  scope;

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /** @inheritDoc */
  onChange() {
    super.onChange();
    this.cb.call(this.scope);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  updateSkew() {
    super.updateSkew();
    this.cb.call(this.scope);
  }
}

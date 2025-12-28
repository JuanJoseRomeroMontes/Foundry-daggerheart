import CanvasGroupMixin from "./canvas-group-mixin.mjs";

/**
 * A container group which contains the environment canvas group and the interface canvas group.
 *
 * @category Canvas
 */
export default class RenderedCanvasGroup extends CanvasGroupMixin(PIXI.Container) {
  /** @override */
  static groupName = "rendered";

  /** @override */
  static tearDownChildren = false;
}


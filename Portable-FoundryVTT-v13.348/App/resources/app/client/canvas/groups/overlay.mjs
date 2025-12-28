import CanvasGroupMixin from "./canvas-group-mixin.mjs";
import UnboundContainer from "../containers/advanced/unbound-container.mjs";

/**
 * A container group which is not bound to the stage world transform.
 *
 * @category Canvas
 */
export default class OverlayCanvasGroup extends CanvasGroupMixin(UnboundContainer) {
  /** @override */
  static groupName = "overlay";

  /** @override */
  static tearDownChildren = false;
}


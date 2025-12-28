import UnboundTransform from "../../geometry/unbound-transform.mjs";

/**
 * UnboundContainers behave like PIXI.Containers except that they are not bound to their parent's transforms.
 * However, they normally propagate their own transformations to their children.
 */
export default class UnboundContainer extends PIXI.Container {
  constructor(...args) {
    super(...args);
    // Replacing PIXI.Transform with an UnboundTransform
    this.transform = new UnboundTransform();
  }
}

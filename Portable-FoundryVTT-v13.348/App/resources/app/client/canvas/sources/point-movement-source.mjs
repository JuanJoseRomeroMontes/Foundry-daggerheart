import BaseEffectSource from "./base-effect-source.mjs";
import PointEffectSourceMixin from "./point-effect-source.mjs";

/**
 * A specialized subclass of the BaseEffectSource which describes a movement-based source.
 * @extends {BaseEffectSource}
 * @mixes PointEffectSource
 */
export default class PointMovementSource extends PointEffectSourceMixin(BaseEffectSource) {

  /** @override */
  static sourceType = "move";
}

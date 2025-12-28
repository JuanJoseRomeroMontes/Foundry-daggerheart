import DetectionMode from "../detection-mode.mjs";
import Token from "../../placeables/token.mjs";

/**
 * This detection mode tests whether the target is visible due to being illuminated by a light source.
 * By default tokens have light perception with an infinite range if light perception isn't explicitely
 * configured.
 */
export default class DetectionModeLightPerception extends DetectionMode {

  /** @override */
  _canDetect(visionSource, target) {

    // Cannot see while blinded or burrowing
    const src = visionSource.object.document;
    if ( src.hasStatusEffect(CONFIG.specialStatusEffects.BLIND)
      || src.hasStatusEffect(CONFIG.specialStatusEffects.BURROW) ) return false;

    // Cannot see invisible or burrowing creatures
    if ( target instanceof Token ) {
      const tgt = target.document;
      if ( tgt.hasStatusEffect(CONFIG.specialStatusEffects.INVISIBLE)
        || tgt.hasStatusEffect(CONFIG.specialStatusEffects.BURROW) ) return false;
    }
    return true;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _testPoint(visionSource, mode, target, test) {
    if ( !super._testPoint(visionSource, mode, target, test) ) return false;
    return canvas.effects.testInsideLight(test.point);
  }
}

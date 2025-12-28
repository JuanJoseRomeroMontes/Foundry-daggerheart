import DetectionMode from "../detection-mode.mjs";
import Token from "../../placeables/token.mjs";

/**
 * A special detection mode which models a form of darkvision (night vision).
 * This mode is the default case which is tested first when evaluating visibility of objects.
 */
export default class DetectionModeDarkvision extends DetectionMode {

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
}

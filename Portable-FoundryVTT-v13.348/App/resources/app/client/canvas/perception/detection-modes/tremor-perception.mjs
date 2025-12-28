import DetectionMode from "../detection-mode.mjs";
import Token from "../../placeables/token.mjs";
import OutlineOverlayFilter from "../../rendering/filters/outline-overlay.mjs";

/**
 * Detection mode that see creatures in contact with the ground.
 */
export default class DetectionModeTremor extends DetectionMode {
  /** @override */
  static getDetectionFilter() {
    return this._detectionFilter ??= OutlineOverlayFilter.create({
      outlineColor: [1, 0, 1, 1],
      knockout: true,
      wave: true
    });
  }

  /** @override */
  _canDetect(visionSource, target) {
    if ( !(target instanceof Token) ) return false;
    const tgt = target.document;

    // Flying and hovering tokens cannot be detected
    if ( tgt.hasStatusEffect(CONFIG.specialStatusEffects.FLY) ) return false;
    if ( tgt.hasStatusEffect(CONFIG.specialStatusEffects.HOVER) ) return false;
    return true;
  }
}

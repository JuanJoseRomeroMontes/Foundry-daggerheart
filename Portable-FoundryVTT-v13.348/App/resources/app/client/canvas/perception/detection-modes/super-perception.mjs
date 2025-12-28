import DetectionMode from "../detection-mode.mjs";
import OutlineOverlayFilter from "../../rendering/filters/outline-overlay.mjs";
import Token from "../../placeables/token.mjs";

/**
 * Detection mode that see ALL creatures (no blockers).
 * If not constrained by walls, see everything within the range.
 */
export default class DetectionModeAll extends DetectionMode {
  /** @override */
  static getDetectionFilter() {
    return this._detectionFilter ??= OutlineOverlayFilter.create({
      outlineColor: [0.85, 0.85, 1.0, 1],
      knockout: true
    });
  }

  /** @override */
  _canDetect(visionSource, target) {
    const src = visionSource.object.document;
    const isSight = this.type === DetectionMode.DETECTION_TYPES.SIGHT;

    // Sight-based detection fails when blinded
    if ( isSight && src.hasStatusEffect(CONFIG.specialStatusEffects.BLIND) ) return false;

    // Detection fails when the source or target token is burrowing unless walls are ignored
    if ( !this.walls ) return true;
    if ( src.hasStatusEffect(CONFIG.specialStatusEffects.BURROW) ) return false;
    if ( target instanceof Token ) {
      const tgt = target.document;
      if ( tgt.hasStatusEffect(CONFIG.specialStatusEffects.BURROW) ) return false;
    }
    return true;
  }
}

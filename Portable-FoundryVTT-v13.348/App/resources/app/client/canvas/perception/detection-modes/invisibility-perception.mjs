import DetectionMode from "../detection-mode.mjs";
import GlowOverlayFilter from "../../rendering/filters/glow-overlay.mjs";
import Token from "../../placeables/token.mjs";

/**
 * Detection mode that see invisible creatures.
 * This detection mode allows the source to:
 * - See/Detect the invisible target as if visible.
 * - The "See" version needs sight and is affected by blindness
 */
export default class DetectionModeInvisibility extends DetectionMode {

  /** @override */
  static getDetectionFilter() {
    return this._detectionFilter ??= GlowOverlayFilter.create({
      glowColor: [0, 0.60, 0.33, 1]
    });
  }

  /** @override */
  _canDetect(visionSource, target) {
    if ( !(target instanceof Token) ) return false;
    const tgt = target.document;

    // Only invisible tokens can be detected
    if ( !tgt.hasStatusEffect(CONFIG.specialStatusEffects.INVISIBLE) ) return false;
    const src = visionSource.object.document;
    const isSight = this.type === DetectionMode.DETECTION_TYPES.SIGHT;

    // Sight-based detection fails when blinded
    if ( isSight && src.hasStatusEffect(CONFIG.specialStatusEffects.BLIND) ) return false;

    // Detection fails when the source or target token is burrowing unless walls are ignored
    if ( this.walls ) {
      if ( src.hasStatusEffect(CONFIG.specialStatusEffects.BURROW) ) return false;
      if ( tgt.hasStatusEffect(CONFIG.specialStatusEffects.BURROW) ) return false;
    }
    return true;
  }
}

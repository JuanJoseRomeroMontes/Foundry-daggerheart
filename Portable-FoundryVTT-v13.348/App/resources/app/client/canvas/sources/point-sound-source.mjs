import BaseEffectSource from "./base-effect-source.mjs";
import PointEffectSourceMixin from "./point-effect-source.mjs";

/**
 * @import {ElevatedPoint} from "../../_types.mjs";
 */

/**
 * A specialized subclass of the BaseEffectSource which describes a point-based source of sound.
 * @extends {BaseEffectSource}
 * @mixes PointEffectSource
 */
export default class PointSoundSource extends PointEffectSourceMixin(BaseEffectSource) {

  /** @override */
  static sourceType = "sound";

  /** @override */
  get effectsCollection() {
    return canvas.sounds.sources;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _getPolygonConfiguration() {
    return Object.assign(super._getPolygonConfiguration(), {useThreshold: true});
  }

  /* -------------------------------------------- */

  /**
   * Get the effective volume at which an AmbientSound source should be played for a certain listener.
   * @param {ElevatedPoint} listener
   * @param {object} [options]
   * @param {boolean} [options.easing]
   * @returns {number}
   */
  getVolumeMultiplier(listener, {easing=true}={}) {
    /** @deprecated since v13 */
    if ( listener.elevation === undefined ) {
      foundry.utils.logCompatibilityWarning("PointSoundSource#getVolumeMultiplier(Point) has been deprecated "
        + "in favor of PointSoundSource#getVolumeMultiplier(ElevatedPoint).", {since: 13, until: 15, once: true});
      listener = {x: listener.x, y: listener.y, elevation: 0};
    }
    if ( !listener ) return 0;                                             // No listener = 0
    const {x, y, radius} = this.data;
    const distance = Math.hypot(listener.x - x, listener.y - y);
    if ( distance === 0 ) return 1;
    if ( distance > radius ) return 0;                                     // Distance outside of radius = 0
    if ( !this.testPoint(listener) ) return 0;                             // Point outside of source = 0
    if ( !easing ) return 1;                                               // No easing = 1
    return (Math.cos(Math.PI * (distance / radius)) + 1) * 0.5;            // Cosine easing [0, 1]
  }
}

import FullCanvasObjectMixin from "../../advanced/full-canvas-mixin.mjs";

/**
 * An interface for defining particle-based weather effects
 * @mixes FullCanvasObjectMixin
 */
export default class ParticleEffect extends FullCanvasObjectMixin(PIXI.Container) {
  /**
   * @param {object} [options]          Options passed to the getParticleEmitters method which can be used to customize
   *                                    values of the emitter configuration.
   */
  constructor(options={}) {
    super();
    /**
     * The array of emitters which are active for this particle effect
     * @type {PIXI.particles.Emitter[]}
     */
    this.emitters = this.getParticleEmitters(options);
  }

  /* -------------------------------------------- */

  /**
   * Create an emitter instance which automatically updates using the shared PIXI.Ticker
   * @param {PIXI.particles.EmitterConfigV3} config   The emitter configuration
   * @returns {PIXI.particles.Emitter}                The created Emitter instance
   */
  createEmitter(config) {
    config.autoUpdate = true;
    config.emit = false;
    return new PIXI.particles.Emitter(this, config);
  }

  /* -------------------------------------------- */

  /**
   * Get the particle emitters which should be active for this particle effect.
   * This base class creates a single emitter using the explicitly provided configuration.
   * Subclasses can override this method for more advanced configurations.
   * @param {object} [options={}] Options provided to the ParticleEffect constructor which can be used to customize
   *                              configuration values for created emitters.
   * @returns {PIXI.particles.Emitter[]}
   */
  getParticleEmitters(options={}) {
    if ( foundry.utils.isEmpty(options) ) {
      throw new Error("The base ParticleEffect class may only be used with an explicitly provided configuration");
    }
    return [this.createEmitter(/** @type {PIXI.particles.EmitterConfigV3} */ options)];
  }

  /* -------------------------------------------- */

  /** @override */
  destroy(...args) {
    for ( const e of this.emitters ) e.destroy();
    this.emitters = [];
    super.destroy(...args);
  }

  /* -------------------------------------------- */

  /**
   * Begin animation for the configured emitters.
   */
  play() {
    for ( let e of this.emitters ) {
      e.emit = true;
    }
  }

  /* -------------------------------------------- */

  /**
   * Stop animation for the configured emitters.
   */
  stop() {
    for ( let e of this.emitters ) {
      e.emit = false;
    }
  }
}

import {CanvasTransformMixin} from "./primary-canvas-object.mjs";

/**
 * A configurable particle effect meant to be used in the PrimaryCanvasGroup.
 * You must provide a full configuration object.
 */
export default class PrimaryParticleEffect extends CanvasTransformMixin(PIXI.Container) {
  constructor(config = {}) {
    super();
    if ( foundry.utils.isEmpty(config) ) {
      throw new Error("Configuration must be provided for the particle effect.");
    }
    this.cullable = true;
    this.initialize(config);
  }

  /**
   * Particle emitter options.
   * @type {PIXI.particles.EmitterConfigV3}
   */
  #config;

  /**
   * The array of emitters which are active for this particle effect
   * @type {PIXI.particles.Emitter}
   */
  #emitter;

  /* -------------------------------------------- */

  /**
   * A key which resolves ties amongst objects at the same elevation within the same layer.
   * @type {number}
   */
  get sort() {
    return this.#sort;
  }

  set sort(value) {
    if ( (typeof value !== "number") || Number.isNaN(value) ) {
      throw new Error("PrimaryParticleEffect#sort must be a numeric value.");
    }
    if ( value === this.#sort ) return;
    this.#sort = value;
    if ( this.parent ) this.parent.sortDirty = true;
  }

  #sort = 0;

  /* -------------------------------------------- */

  /**
   * The elevation of this container.
   * @type {number}
   */
  get elevation() {
    return this.#elevation;
  }

  set elevation(value) {
    if ( (typeof value !== "number") || Number.isNaN(value) ) {
      throw new Error("PrimaryParticleEffect#elevation must be a numeric value.");
    }
    if ( value === this.#elevation ) return;
    this.#elevation = value;
    if ( this.parent ) this.parent.sortDirty = true;
  }

  #elevation = 0;

  /* -------------------------------------------- */

  /**
   * Always false for a Primary Particle Effect.
   * @returns {boolean}
   */
  get shouldRenderDepth() {
    return false;
  }

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /**
   * Create an emitter instance which automatically updates using the shared PIXI.Ticker
   */
  #createEmitter() {
    this.#config.autoUpdate = true;
    this.#config.emit = false;
    this.#emitter = new PIXI.particles.Emitter(this, this.#config);
  }

  /* -------------------------------------------- */

  /** @override */
  destroy(...args) {
    this.#emitter?.destroy();
    this.#emitter = undefined;
    super.destroy(...args);
  }

  /* -------------------------------------------- */

  /**
   * Initialize the emitter with optional configuration.
   * @param {object} [config]      Optional config object.
   * @param {boolean} [play=false] Should we play immediately? False by default.
   */
  initialize(config, play=false) {
    if ( config ) this.#config = config;
    this.#emitter?.destroy();
    this.#emitter = undefined;
    this.#createEmitter();
  }

  /* -------------------------------------------- */

  /**
   * Begin animation for the configured emitter.
   */
  play() {
    if ( this.#emitter ) this.#emitter.emit = true;
  }

  /* -------------------------------------------- */

  /**
   * Stop animation for the configured emitter.
   */
  stop() {
    if ( this.#emitter ) this.#emitter.emit = false;
  }
}

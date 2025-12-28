import Sound from "./sound.mjs";

/**
 * A sound effect which applies a convolver filter.
 * The convolver effect splits the input sound into two separate paths:
 * 1. A "dry" node which is the original sound
 * 2. A "wet" node which contains the result of the convolution
 * This effect mixes between the dry and wet channels based on the intensity of the reverb effect.
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/ConvolverNode}
 */
export default class ConvolverEffect extends ConvolverNode {
  /**
   * A ConvolverEffect is constructed by passing the following parameters.
   * @param {AudioContext} context      The audio context required by the ConvolverNode
   * @param {object} [options]          Additional options which modify the ConvolverEffect behavior
   * @param {string} [options.impulseResponsePath]  The file path to the impulse response buffer to use
   * @param {number} [options.intensity]            The initial intensity of the effect
   */
  constructor(context, {impulseResponsePath="sounds/impulse-responses/ir-full.wav", intensity=5, ...options}={}) {
    super(context, options);
    this.#impulseResponsePath = impulseResponsePath;
    this.#intensity = intensity;
    this.#dryGain = context.createGain();
    this.#wetGain = context.createGain();
    this.update();
  }

  /**
   * The identifier of the impulse response buffer currently used.
   * The default impulse response function was generated using https://aldel.com/reverbgen/.
   * @type {string}
   */
  #impulseResponsePath;

  /**
   * A GainNode which mixes base, non-convolved, audio playback into the final result.
   * @type {GainNode}
   */
  #dryGain;

  /**
   * A GainNode which mixes convolved audio playback into the final result.
   * @type {GainNode}
   */
  #wetGain;

  /**
   * Flag whether the impulse response buffer has been loaded to prevent duplicate load requests.
   * @type {boolean}
   */
  #loaded = false;

  /* -------------------------------------------- */

  /**
   * Adjust the intensity of the effect on a scale of 0 to 10.
   * @type {number}
   */
  get intensity() {
    return this.#intensity;
  }

  set intensity(value) {
    this.update({intensity: value});
  }

  #intensity;

  /* -------------------------------------------- */

  /**
   * Update the state of the effect node given the active flag and numeric intensity.
   * @param {object} options            Options which are updated
   * @param {number} [options.intensity]  A new effect intensity
   */
  update({intensity} = {}) {
    if ( Number.isFinite(intensity) ) this.#intensity = Math.clamp(intensity, 1, 10);

    // Load an impulse response buffer
    if ( !this.#loaded ) {
      const irSound = new Sound(this.#impulseResponsePath, {context: this.context});
      this.#loaded = true;
      irSound.load().then(s => this.buffer = s.buffer);
    }

    // Set mix of wet and dry gain based on reverb intensity
    this.#wetGain.gain.value = 0.2 + Math.sqrt(this.#intensity / 10); // [0.2, 1.2]
    this.#dryGain.gain.value = Math.sqrt((11 - this.#intensity) / 10);
  }

  /* -------------------------------------------- */

  /** @override */
  disconnect(...args) {
    this.#wetGain.disconnect();
    this.#dryGain.disconnect();
    return super.disconnect(...args);
  }

  /* -------------------------------------------- */

  /** @override */
  connect(destinationNode, ...args) {
    super.connect(this.#wetGain, ...args);
    this.#dryGain.connect(destinationNode);
    this.#wetGain.connect(destinationNode);
    return destinationNode;
  }

  /* -------------------------------------------- */

  /**
   * Additional side effects performed when some other AudioNode connects to this one.
   * This behavior is not supported by the base WebAudioAPI but is needed here for more complex effects.
   * @param {AudioNode} sourceNode      An upstream source node that is connecting to this one
   */
  onConnectFrom(sourceNode) {
    sourceNode.connect(this.#dryGain);
  }
}

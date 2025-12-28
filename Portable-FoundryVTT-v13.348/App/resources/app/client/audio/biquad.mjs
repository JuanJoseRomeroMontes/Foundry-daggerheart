/**
 * A sound effect which applies a biquad filter.
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/BiquadFilterNode}
 */
export default class BiquadFilterEffect extends BiquadFilterNode {
  /**
   * A ConvolverEffect is constructed by passing the following parameters.
   * @param {AudioContext} context      The audio context required by the BiquadFilterNode
   * @param {object} [options]          Additional options which modify the BiquadFilterEffect behavior
   * @param {BiquadFilterType} [options.type=lowpass]  The filter type to apply
   * @param {number} [options.intensity=5]   The initial intensity of the effect
   */
  constructor(context, {type="lowpass", intensity=5, ...options}={}) {
    if ( !BiquadFilterEffect.#ALLOWED_TYPES.includes(type) ) {
      throw new Error(`Invalid BiquadFilterEffect type "${type}" provided`);
    }
    super(context, options);
    this.#type = this.type = type;
    this.#intensity = intensity;
    this.update();
  }

  /**
   * The allowed filter types supported by this effect class.
   */
  static #ALLOWED_TYPES = ["lowpass", "highpass", "bandpass", "lowshelf", "highshelf", "peaking", "notch"];

  /**
   * The original configured type of the effect.
   * @type {BiquadFilterType}
   */
  #type;

  /* -------------------------------------------- */

  /**
   * Adjust the intensity of the effect on a scale of 0 to 10.
   * @type {number}
   */
  get intensity() {
    return this.#intensity;
  }

  set intensity(intensity) {
    this.update({intensity});
  }

  #intensity;

  /* -------------------------------------------- */

  /**
   * Update the state of the effect node given the active flag and numeric intensity.
   * @param {object} options            Options which are updated
   * @param {number} [options.intensity]  A new effect intensity
   * @param {BiquadFilterType} [options.type] A new filter type
   */
  update({intensity, type} = {}) {
    if ( Number.isFinite(intensity) ) this.#intensity = Math.clamp(intensity, 1, 10);
    if ( BiquadFilterEffect.#ALLOWED_TYPES.includes(type) ) this.#type = type;
    this.type = this.#type;
    switch ( this.#type ) {
      case "lowpass":
        this.frequency.value = 1100 - (100 * this.#intensity); // More intensity cuts at a lower frequency
        break;
      case "highpass":
        this.frequency.value = 100 * this.#intensity; // More intensity cuts at higher frequency
        break;
      default:
        throw new Error(`BiquadFilterEffect type "${this.#type}" not yet configured`);
    }
  }
}

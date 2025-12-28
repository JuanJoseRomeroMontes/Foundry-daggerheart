/**
 * A smooth noise generator for one-dimensional values.
 * @param {object} options                        Configuration options for the noise process.
 * @param {number} [options.amplitude=1]          The generated noise will be on the range [0, amplitude].
 * @param {number} [options.scale=1]              An adjustment factor for the input x values which place them on an
 *                                                appropriate range.
 * @param {number} [options.maxReferences=256]    The number of pre-generated random numbers to generate.
 */
export default class SmoothNoise {
  constructor({amplitude=1, scale=1, maxReferences=256}={}) {

    // Configure amplitude
    this.amplitude = amplitude;

    // Configure scale
    this.scale = scale;

    // Create pre-generated random references
    if ( !Number.isInteger(maxReferences) || !PIXI.utils.isPow2(maxReferences) ) {
      throw new Error("SmoothNoise maxReferences must be a positive power-of-2 integer.");
    }
    Object.defineProperty(this, "_maxReferences", {value: maxReferences || 1, writable: false});
    Object.defineProperty(this, "_references", {value: [], writable: false});
    for ( let i = 0; i < this._maxReferences; i++ ) {
      this._references.push(Math.random());
    }
  }

  /**
   * Amplitude of the generated noise output
   * The noise output is multiplied by this value
   * @type {number}
   */
  get amplitude() {
    return this._amplitude;
  }
  set amplitude(amplitude) {
    if ( !Number.isFinite(amplitude) || (amplitude === 0) ) {
      throw new Error("SmoothNoise amplitude must be a finite non-zero number.");
    }
    this._amplitude = amplitude;
  }
  _amplitude;

  /**
   * Scale factor of the random indices
   * @type {number[]}
   */
  get scale() {
    return this._scale;
  }
  set scale(scale) {
    if ( !Number.isFinite(scale) || (scale <= 0 ) ) {
      throw new Error("SmoothNoise scale must be a finite positive number.");
    }
    this._scale = scale;
  }
  _scale;

  /**
   * Generate the noise value corresponding to a provided numeric x value.
   * @param {number} x      Any finite number
   * @return {number}       The corresponding smoothed noise value
   */
  generate(x) {
    const scaledX = x * this._scale;                                         // The input x scaled by some factor
    const xFloor = Math.floor(scaledX);                                      // The integer portion of x
    const t = scaledX - xFloor;                                              // The fractional remainder, zero in the case of integer x
    const tSmooth = t * t * (3 - 2 * t);                                     // Smooth cubic [0, 1] for mixing between random numbers
    const i0 = xFloor & (this._maxReferences - 1);                           // The current index of the references array
    const i1 = (i0 + 1) & (this._maxReferences - 1);                         // The next index of the references array
    const y = Math.mix(this._references[i0], this._references[i1], tSmooth); // Smoothly mix between random numbers
    return y * this._amplitude;                                              // The final result is multiplied by the requested amplitude
  };
}

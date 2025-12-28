/**
 * @typedef AudioTimeoutOptions
 * @property {AudioContext} [context]
 * @property {function(): any} [callback]
 */

/**
 * A special error class used for cancellation.
 */
class AudioTimeoutCancellation extends Error {}

/**
 * A framework for scheduled audio events with more precise and synchronized timing than using window.setTimeout.
 * This approach creates an empty audio buffer of the desired duration played using the shared game audio context.
 * The onended event of the AudioBufferSourceNode provides a very precise way to synchronize audio events.
 * For audio timing, this is preferable because it avoids numerous issues with window.setTimeout.
 *
 * @example Using a callback function
 * ```js
 * function playForDuration(sound, duration) {
 *   sound.play();
 *   const wait = new AudioTimeout(duration, {callback: () => sound.stop()})
 * }
 * ```
 *
 * @example Using an awaited Promise
 * ```js
 * async function playForDuration(sound, duration) {
 *   sound.play();
 *   const timeout = new AudioTimeout(delay);
 *   await timeout.complete;
 *   sound.stop();
 * }
 * ```
 *
 * @example Using the wait helper
 * ```js
 * async function playForDuration(sound, duration) {
 *   sound.play();
 *   await AudioTimeout.wait(duration);
 *   sound.stop();
 * }
 * ```
 */
export default class AudioTimeout {
  /**
   * Create an AudioTimeout by providing a delay and callback.
   * @param {number} delayMS                    A desired delay timing in milliseconds
   * @param {AudioTimeoutOptions} [options]     Additional options which modify timeout behavior
   */
  constructor(delayMS, {callback, context}={}) {
    if ( !(typeof delayMS === "number") ) throw new Error("Numeric timeout duration must be provided");
    this.#callback = callback;
    this.complete = new Promise((resolve, reject) => {
      this.#resolve = resolve;
      this.#reject = reject;

      // Immediately evaluated
      if ( delayMS <= 0 ) return this.end();

      // Create and play a blank AudioBuffer of the desired delay duration
      context ||= game.audio.music;
      const seconds = delayMS / 1000;
      const sampleRate = context.sampleRate;
      const buffer = new AudioBuffer({length: seconds * sampleRate, sampleRate});
      this.#sourceNode = new AudioBufferSourceNode(context, {buffer});
      this.#sourceNode.onended = this.end.bind(this);
      this.#sourceNode.start();
    })

    // The promise may get cancelled
    .catch(err => {
      if ( err instanceof AudioTimeoutCancellation ) return;
      throw err;
    });
  }

  /**
   * Is the timeout complete?
   * This can be used to await the completion of the AudioTimeout if necessary.
   * The Promise resolves to the returned value of the provided callback function.
   * @type {Promise<*>}
   */
  complete;

  /**
   * The resolution function for the wrapping Promise.
   * @type {Function}
   */
  #resolve;

  /**
   * The rejection function for the wrapping Promise.
   * @type {Function}
   */
  #reject;

  /**
   * A scheduled callback function
   * @type {Function}
   */
  #callback;

  /**
   * The source node used to maintain the timeout
   * @type {AudioBufferSourceNode}
   */
  #sourceNode;

  /* -------------------------------------------- */

  /**
   * Is this audio timeout cancelled?
   * @type {boolean}
   */
  get cancelled() {
    return this.#cancelled;
  }

  #cancelled = false;

  /* -------------------------------------------- */

  /**
   * Cancel an AudioTimeout by ending it early, rejecting its completion promise, and skipping any callback function.
   */
  cancel() {
    this.#cancelled = true;
    if ( !this.#reject ) return;
    const reject = this.#reject;
    this.#resolve = this.#reject = undefined;
    reject(new AudioTimeoutCancellation("AudioTimeout cancelled"));
    this.#sourceNode.onended = null;
    this.#sourceNode.stop();
  }

  /* -------------------------------------------- */

  /**
   * End the timeout, either on schedule or prematurely. Executing any callback function
   */
  end() {
    const resolve = this.#resolve;
    this.#resolve = this.#reject = undefined;
    resolve(this.#callback?.());
  }

  /* -------------------------------------------- */

  /**
   * Schedule a task according to some audio timeout.
   * @param {number} delayMS                  A desired delay timing in milliseconds
   * @param {AudioTimeoutOptions} [options]   Additional options which modify timeout behavior
   * @returns {Promise<void|any>}             A promise which resolves as a returned value of the callback or void
   */
  static async wait(delayMS, options) {
    const timeout = new this(delayMS, options);
    return timeout.complete;
  }
}

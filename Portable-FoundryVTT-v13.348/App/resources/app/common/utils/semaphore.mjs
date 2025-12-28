/**
 * A simple Semaphore implementation which provides a limited queue for ensuring proper concurrency.
 * @param {number} [max=1]    The maximum number of tasks which are allowed concurrently.
 *
 * @example Using a Semaphore
 * ```js
 * // Some async function that takes time to execute
 * function fn(x) {
 *   return new Promise(resolve => {
 *     setTimeout(() => {
 *       console.log(x);
 *       resolve(x);
 *     }, 1000);
 *   });
 * }
 *
 * // Create a Semaphore and add many concurrent tasks
 * const semaphore = new Semaphore(1);
 * for ( let i of Array.fromRange(100) ) {
 *   semaphore.add(fn, i);
 * }
 * ```
 */
class Semaphore {
  constructor(max=1) {

    /**
     * The maximum number of tasks which can be simultaneously attempted.
     * @type {number}
     */
    this.max = max;
  }

  /**
   * A queue of pending function signatures
   * @type {Array<[fn: Function, args: any[], resolve: (result: any) => void, reject: (error: Error) => void]>}
   */
  #queue = [];

  /**
   * The number of tasks which are currently underway
   * @type {number}
   */
  #active = 0;

  /**
   * The number of pending tasks remaining in the queue
   * @type {number}
   */
  get remaining() {
    return this.#queue.length;
  }

  /**
   * The number of actively executing tasks
   * @type {number}
   */
  get active() {
    return this.#active;
  }

  /**
   * Add a new tasks to the managed queue
   * @param {Function} fn     A callable function
   * @param {...*} [args]     Function arguments
   * @returns {Promise}       A promise that resolves once the added function is executed
   */
  add(fn, ...args) {
    return new Promise((resolve, reject) => {
      this.#queue.push([fn, args, resolve, reject]);
      this.#try();
    });
  }

  /**
   * Abandon any tasks which have not yet concluded
   */
  clear() {
    this.#queue = [];
  }

  /**
   * Attempt to perform a task from the queue.
   * If all workers are busy, do nothing.
   * If successful, try again.
   */
  async #try() {
    if ( (this.active === this.max) || !this.remaining ) return false;

    // Obtain the next task from the queue
    const next = this.#queue.shift();
    if ( !next ) return;
    this.#active += 1;

    // Try and execute it, resolving its promise
    const [fn, args, resolve, reject] = next;
    try {
      const r = await fn(...args);
      resolve(r);
    }
    catch(err) {
      reject(err);
    }

    // Try the next function in the queue
    this.#active -= 1;
    return this.#try();
  }
}
export default Semaphore;

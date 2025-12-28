import IterableWeakMap from "./iterable-weak-map.mjs";

/**
 * Stores a set of objects with weak references to them, allowing them to be garbage collected. Can be iterated over,
 * unlike a WeakSet.
 */
export default class IterableWeakSet extends WeakSet {
  /**
   * The backing iterable weak map.
   * @type {IterableWeakMap<any, any>}
   */
  #map = new IterableWeakMap();

  /**
   * @param {Iterable<any>} [entries]  The initial entries.
   */
  constructor(entries=[]) {
    super();
    for ( const entry of entries ) this.add(entry);
  }

  /* -------------------------------------------- */

  /**
   * Enumerate the values.
   * @returns {Generator<any, void, any>}
   */
  [Symbol.iterator]() {
    return this.values();
  }

  /* -------------------------------------------- */

  /**
   * Add a value to the set.
   * @param {any} value  The value to add.
   * @returns {IterableWeakSet}
   */
  add(value) {
    this.#map.set(value, value);
    return this;
  }

  /* -------------------------------------------- */

  /**
   * Delete a value from the set.
   * @param {any} value  The value to delete.
   * @returns {boolean}
   */
  delete(value) {
    return this.#map.delete(value);
  }

  /* -------------------------------------------- */

  /**
   * Whether this set contains the given value.
   * @param {any} value  The value to test.
   * @returns {boolean}
   */
  has(value) {
    return this.#map.has(value);
  }

  /* -------------------------------------------- */

  /**
   * Enumerate the collection.
   * @returns {Generator<any, void, any>}
   */
  values() {
    return this.#map.values();
  }

  /* -------------------------------------------- */

  /**
   * Clear all values from the set.
   */
  clear() {
    this.#map.clear();
  }
}

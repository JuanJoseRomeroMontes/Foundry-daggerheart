/**
 * @import {IterableWeakMapHeldValue, IterableWeakMapValue} from "./_types.mjs";
 */

/**
 * Stores a map of objects with weak references to the keys, allowing them to be garbage collected. Both keys and values
 * can be iterated over, unlike a WeakMap.
 */
export default class IterableWeakMap extends WeakMap {

  /**
   * A set of weak refs to the map's keys, allowing enumeration.
   * @type {Set<WeakRef<any>>}
   */
  #refs = new Set();

  /**
   * A FinalizationRegistry instance to clean up the ref set when objects are garbage collected.
   * @type {FinalizationRegistry<IterableWeakMapHeldValue>}
   */
  #finalizer = new FinalizationRegistry(IterableWeakMap.#cleanup);

  /**
   * @param {Iterable<[any, any]>} [entries]  The initial entries.
   */
  constructor(entries=[]) {
    super();
    for ( const [key, value] of entries ) this.set(key, value);
  }

  /* -------------------------------------------- */

  /**
   * Clean up the corresponding ref in the set when its value is garbage collected.
   * @param {IterableWeakMapHeldValue} heldValue  The value held by the finalizer.
   */
  static #cleanup({ set, ref }) {
    set.delete(ref);
  }

  /* -------------------------------------------- */

  /**
   * Remove a key from the map.
   * @param {any} key  The key to remove.
   * @returns {boolean}
   */
  delete(key) {
    const entry = super.get(key);
    if ( !entry ) return false;
    super.delete(key);
    this.#refs.delete(entry.ref);
    this.#finalizer.unregister(key);
    return true;
  }

  /* -------------------------------------------- */

  /**
   * Retrieve a value from the map.
   * @param {any} key  The value's key.
   * @returns {any}
   */
  get(key) {
    /** @type {IterableWeakMapValue|undefined} */
    const entry = super.get(key);
    return entry && entry.value;
  }

  /* -------------------------------------------- */

  /**
   * Place a value in the map.
   * @param {any} key    The key.
   * @param {any} value  The value.
   * @returns {IterableWeakMap}
   */
  set(key, value) {
    const entry = super.get(key);
    if ( entry ) this.#refs.delete(entry.ref);
    const ref = new WeakRef(key);
    super.set(key, /** @type {IterableWeakMapValue} */ { value, ref });
    this.#refs.add(ref);
    this.#finalizer.register(key, { ref, set: this.#refs }, key);
    return this;
  }

  /* -------------------------------------------- */

  /**
   * Clear all values from the map.
   */
  clear() {
    for ( const ref of this.#refs ) {
      const key = ref.deref();
      if ( key ) this.delete(key);
      else this.#refs.delete(ref);
    }
  }

  /* -------------------------------------------- */

  /**
   * Enumerate the entries.
   * @returns {Generator<[any, any], void, any>}
   */
  *[Symbol.iterator]() {
    for ( const ref of this.#refs ) {
      const key = ref.deref();
      if ( !key ) continue;
      const { value } = super.get(key);
      yield [key, value];
    }
  }

  /* -------------------------------------------- */

  /**
   * Enumerate the entries.
   * @returns {Generator<[any, any], void, any>}
   */
  entries() {
    return this[Symbol.iterator]();
  }

  /* -------------------------------------------- */

  /**
   * Enumerate the keys.
   * @returns {Generator<any, void, any>}
   */
  *keys() {
    for ( const [key] of this ) yield key;
  }

  /* -------------------------------------------- */

  /**
   * Enumerate the values.
   * @returns {Generator<any, void, any>}
   */
  *values() {
    for ( const [, value] of this ) yield value;
  }
}

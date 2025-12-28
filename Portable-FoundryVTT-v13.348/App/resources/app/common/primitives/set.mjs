/**
 * Test whether this set is equal to some other set.
 * Sets are equal if they share the same members, independent of order
 * @param {Set<any>} other       Some other set to compare against
 * @returns {boolean}       Are the sets equal?
 */
export function equals(other) {
  if ( !(other instanceof Set ) ) return false;
  if ( other.size !== this.size ) return false;
  for ( const element of this ) {
    if ( !other.has(element) ) return false;
  }
  return true;
}

/**
 * Return the first value from the set.
 * @template T
 * @returns {T|undefined} The first element in the set, or undefined
 */
export function first() {
  return this.values().next().value;
}


/**
 * Test whether this set has an intersection with another set.
 * @param {Set} other       Another set to compare against
 * @returns {boolean}       Do the sets intersect?
 */
export function intersects(other) {
  return !this.isDisjointFrom(other);
}

/**
 * Test whether this set is a subset of some other set.
 * A set is a subset if all its members are also present in the other set.
 * @param {Set} other       Some other set that may be a subset of this one
 * @returns {boolean}       Is the other set a subset of this one?
 * @deprecated since v13
 */
export function isSubset(other) {
  const message = "Set#isSubset is deprecated in favor of the native Set#isSubsetOf.";
  foundry.utils.logCompatibilityWarning(message, {since: 13, until: 15, once: true});
  return this.isSubsetOf(other);
}

/**
 * Convert a set to a JSON object by mapping its contents to an array
 * @template T
 * @returns {T[]}           The set elements as an array.
 */
export function toObject() {
  return Array.from(this);
}

/**
 * Test whether every element in this Set satisfies a certain test criterion.
 * @template T
 * @param {(element: T, index: number, set: Set<T>) => boolean} test The test criterion to apply. Positional arguments
 *                                                                   are the value, the index of iteration, and the set
 *                                                                   being tested.
 * @returns {boolean}  Does every element in the set satisfy the test criterion?
 * @see Array#every
 */
export function every(test) {
  let i = 0;
  for ( const v of this ) {
    if ( !test(v, i, this) ) return false;
    i++;
  }
  return true;
}

/**
 * Filter this set to create a subset of elements which satisfy a certain test criterion.
 * @template T
 * @param {(element: T, index: number, set: Set) => boolean} test The test criterion to apply. Positional arguments are
 *                                                                the value, the index of iteration, and the set being
 *                                                                filtered.
 * @returns {Set<T>} A new Set containing only elements which satisfy the test criterion.
 * @see Array#filter
 */
export function filter(test) {
  const filtered = new Set();
  let i = 0;
  for ( const v of this ) {
    if ( test(v, i, this) ) filtered.add(v);
    i++;
  }
  return filtered;
}

/**
 * Find the first element in this set which satisfies a certain test criterion.
 * @template T
 * @param {(element: T, index: number, set: Set<T>) => boolean} test The test criterion to apply. Positional arguments
 *                                                                   are the value, the index of iteration, and the set
 *                                                                   being searched.
 * @returns {T|undefined} The first element in the set which satisfies the test criterion, or undefined.
 * @see Array#find
 */
export function find(test) {
  let i = 0;
  for ( const v of this ) {
    if ( test(v, i, this) ) return v;
    i++;
  }
  return undefined;
}

/**
 * Create a new Set where every element is modified by a provided transformation function.
 * @template T
 * @template U
 * @param {(element: T, index: number, set: Set<T>) => U} transform The transformation function to apply. Positional
 *                                                                  arguments are the value, the index of iteration, and
 *                                                                  the set being transformed.
 * @returns {Set<U>} A new Set of equal size containing transformed elements.
 * @see Array#map
 */
export function map(transform) {
  const mapped = new Set();
  let i = 0;
  for ( const v of this ) {
    mapped.add(transform(v, i, this));
    i++;
  }
  if ( mapped.size !== this.size ) {
    throw new Error("The Set#map operation illegally modified the size of the set");
  }
  return mapped;
}

/**
 * Create a new Set with elements that are filtered and transformed by a provided reducer function.
 * @template T
 * @param {(accum: any, element: T, index: number, set: Set<T>) => any} reducer A reducer function applied to each
 *                                                                              value. Positional arguments are the
 *                                                                              accumulator, the value, the index of
 *                                                                              iteration, and the set being reduced.
 * @param {any} [initial]         The initial value of the returned accumulator.
 * @returns {any}                 The final value of the accumulator.
 * @see Array#reduce
 */
export function reduce(reducer, initial) {
  let i = 0;
  for ( const v of this ) {
    initial = reducer(initial, v, i, this);
    i++;
  }
  return initial;
}

/**
 * Test whether any element in this Set satisfies a certain test criterion.
 * @template T
 * @param {(element: T, index: number, set: Set<T>) => boolean} test The test criterion to apply. Positional arguments
 *                                                                   are the value, the index of iteration, and the set
 *                                                                   being tested.
 * @returns {boolean} Does any element in the set satisfy the test criterion?
 * @see Array#some
 */
export function some(test) {
  let i = 0;
  for ( const v of this ) {
    if ( test(v, i, this) ) return true;
    i++;
  }
  return false;
}

// Assign primitives to Set prototype
Object.defineProperties(Set.prototype, {
  equals: {value: equals},
  every: {value: every},
  filter: {value: filter},
  find: {value: find},
  first: {value: first},
  intersects: {value: intersects},
  isSubset: {value: isSubset},
  map: {value: map},
  reduce: {value: reduce},
  some: {value: some},
  toObject: {value: toObject}
});

import {getType, objectsEqual} from "../utils/helpers.mjs";

/**
 * Flatten nested arrays by concatenating their contents
 * @returns {any[]}    An array containing the concatenated inner values
 */
export function deepFlatten() {
  return this.reduce((acc, val) => Array.isArray(val) ? acc.concat(val.deepFlatten()) : acc.concat(val), []);
}

/**
 * Test element-wise equality of the values of this array against the values of another array
 * @param {any[]} other   Some other array against which to test equality
 * @returns {boolean}     Are the two arrays element-wise equal?
 */
export function equals(other) {
  if ( !(other instanceof Array) || (other.length !== this.length) ) return false;
  return this.every((v0, i) => {
    const v1 = other[i];
    const t0 = getType(v0);
    const t1 = getType(v1);
    if ( t0 !== t1 ) return false;
    if ( v0?.equals instanceof Function ) return v0.equals(v1);
    if ( t0 === "Object" ) return objectsEqual(v0, v1);
    return v0 === v1;
  });
}

/**
 * Partition an original array into two children array based on a logical test
 * Elements which test as false go into the first result while elements testing as true appear in the second
 * @template T
 * @param {(element: T) => boolean} rule
 * @returns {[T[], T[]]}    An Array of length two whose elements are the partitioned pieces of the original
 */
export function partition(rule) {
  return this.reduce((acc, val) => {
    const test = rule(val);
    acc[Number(test)].push(val);
    return acc;
  }, [[], []]);
}

/**
 * Join an Array using a string separator, first filtering out any parts which return a false-y value
 * @param {string} sep    The separator string
 * @returns {string}      The joined string, filtered of any false values
 */
export function filterJoin(sep) {
  return this.filter(p => !!p).join(sep);
}

/**
 * Find an element within the Array and remove it from the array
 * @template T
 * @param {(element: T) => boolean} find   A function to use as input to findIndex
 * @param {T} [replace]     A replacement for the spliced element
 * @returns {T|null}        The replacement element, the removed element, or null if no element was found.
 * @see Array#splice
 */
export function findSplice(find, replace) {
  const idx = this.findIndex(find);
  if ( idx === -1 ) return null;
  if ( replace !== undefined ) {
    this.splice(idx, 1, replace);
    return replace;
  } else {
    const item = this[idx];
    this.splice(idx, 1);
    return item;
  }
}

/**
 * Create and initialize an array of length n with integers from 0 to n-1
 * @param {number} n        The desired array length
 * @param {number} [min=0]  A desired minimum number from which the created array starts
 * @returns {number[]}      An array of integers from min to min+n
 */
export function fromRange(n, min=0) {
  return Array.from({length: n}, (v, i) => i + min);
}

// Define primitives on the Array prototype
Object.defineProperties(Array.prototype, {
  deepFlatten: {value: deepFlatten},
  equals: {value: equals},
  filterJoin: {value: filterJoin},
  findSplice: {value: findSplice},
  partition: {value: partition}
});
Object.defineProperties(Array, {
  fromRange: {value: fromRange}
});

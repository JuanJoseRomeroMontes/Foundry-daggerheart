/**
 * Test for near-equivalence of two numbers within some permitted epsilon
 * @param {number} n      Some other number
 * @param {number} e      Some permitted epsilon, by default 1e-8
 * @returns {boolean}     Are the numbers almost equal?
 */
export function almostEqual(n, e=1e-8) {
  return Math.abs(this - n) < e;
}

/**
 * Transform a number to an ordinal string representation. i.e.
 * 1 => 1st
 * 2 => 2nd
 * 3 => 3rd
 * @returns {string}
 */
export function ordinalString() {
  const s = ["th", "st", "nd", "rd"];
  const v = this % 100;
  return this + (s[(v-20)%10]||s[v]||s[0]);
}

/**
 * Return a string front-padded by zeroes to reach a certain number of numeral characters
 * @param {number} digits     The number of characters desired
 * @returns {string}          The zero-padded number
 */
export function paddedString(digits) {
  return this.toString().padStart(digits, "0");
}

/**
 * Return a locally formatted string prefaced by the explicit sign of the number (+) or (-). Use of this method is
 * intended for display purposes only.
 * @this {number}
 * @returns {string}          The signed number as a locally formatted string
 */
export function signedString() {
  const n = this.toLocaleString(game.i18n.lang);
  if ( this === 0 ) return n;
  if ( this < 0 ) return n.replace("-", "−"); // Minus sign character
  else return `+${n}`;
}

/**
 * Round a number to the closest number which substracted from the base is a multiple of the provided interval.
 * This is a convenience function intended to humanize issues of floating point precision.
 * The interval is treated as a standard string representation to determine the amount of decimal truncation applied.
 * @param {number} interval                            The step interval
 * @param {"round"|"floor"|"ceil"} [method="round"]    The rounding method
 * @param {number} [base=0]                            The step base
 * @returns {number}                                   The rounded number
 *
 * @example Round a number to the nearest step interval
 * ```js
 * let n = 17.18;
 * n.toNearest(5); // 15
 * n.toNearest(10); // 20
 * n.toNearest(10, "floor"); // 10
 * n.toNearest(10, "ceil"); // 20
 * n.toNearest(0.25); // 17.25
 * n.toNearest(2, "round", 1); // 17
 * ```
 */
export function toNearest(interval=1, method="round", base=0) {
  if ( interval < 0 ) throw new Error("Number#toNearest interval must not be negative");
  const eps = method === "floor" ? 1e-8 : method === "ceil" ? -1e-8 : 0;
  const float = base + (Math[method](((this - base) / interval) + eps) * interval);
  const trunc1 = Number.isInteger(base) ? 0 : String(base).length - 2;
  const trunc2 = Number.isInteger(interval) ? 0 : String(interval).length - 2;
  return Number(float.toFixed(Math.max(trunc1, trunc2)));
}

/**
 * A faster numeric between check which avoids type coercion to the Number object.
 * Since this avoids coercion, if non-numbers are passed in unpredictable results will occur. Use with caution.
 * @param {number} a            The lower-bound
 * @param {number} b            The upper-bound
 * @param {boolean} inclusive   Include the bounding values as a true result?
 * @returns {boolean}           Is the number between the two bounds?
 */
export function between(a, b, inclusive=true) {
  const min = Math.min(a, b);
  const max = Math.max(a, b);
  return inclusive ? (this >= min) && (this <= max) : (this > min) && (this < max);
}

/**
 * @see {@link Number#between}
 * @ignore
 */
Number.between = function(num, a, b, inclusive=true) {
  const min = Math.min(a, b);
  const max = Math.max(a, b);
  return inclusive ? (num >= min) && (num <= max) : (num > min) && (num < max);
};

/**
 * Test whether a value is numeric.
 * This is the highest performing algorithm currently available, per https://jsperf.com/isnan-vs-typeof/5
 * @param {*} n        A value to test
 * @returns {boolean}  Is it a number?
 */
export function isNumeric(n) {
  if ( n instanceof Array ) return false;
  else if ( [null, ""].includes(n) ) return false;
  // eslint-disable-next-line no-implicit-coercion, no-self-compare
  return +n === +n;
}

/**
 * Attempt to create a number from a user-provided string.
 * @param {string|number} n    The value to convert; typically a string, but may already be a number.
 * @returns {number}           The number that the string represents, or NaN if no number could be determined.
 */
export function fromString(n) {
  if ( typeof n === "number" ) return n;
  if ( (typeof n !== "string") || !n.length ) return NaN;
  n = n.replace(/\s+/g, "");
  return Number(n);
}

// Define properties on the Number environment
Object.defineProperties(Number.prototype, {
  almostEqual: {value: almostEqual},
  between: {value: between},
  ordinalString: {value: ordinalString},
  paddedString: {value: paddedString},
  signedString: {value: signedString},
  toNearest: {value: toNearest}
});
Object.defineProperties(Number, {
  isNumeric: {value: isNumeric},
  fromString: {value: fromString}
});

/**
 * Test whether a Date instance is valid.
 * A valid date returns a number for its timestamp, and NaN otherwise.
 * NaN is never equal to itself.
 * @returns {boolean}
 */
export function isValid() {
  // eslint-disable-next-line no-self-compare
  return this.getTime() === this.getTime();
}

/**
 * Return a standard YYYY-MM-DD string for the Date instance.
 * @returns {string}    The date in YYYY-MM-DD format
 */
export function toDateInputString() {
  const yyyy = this.getFullYear();
  const mm = (this.getMonth() + 1).paddedString(2);
  const dd = this.getDate().paddedString(2);
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Return a standard H:M:S.Z string for the Date instance.
 * @returns {string}    The time in H:M:S format
 */
export function toTimeInputString() {
  return this.toTimeString().split(" ")[0];
}

// Define primitives on the Date prototype
Object.defineProperties(Date.prototype, {
  isValid: {value: isValid},
  toDateInputString: {value: toDateInputString},
  toTimeInputString: {value: toTimeInputString}
});

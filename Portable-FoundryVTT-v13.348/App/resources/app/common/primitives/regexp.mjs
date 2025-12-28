/**
 * Escape a given input string, prefacing special characters with backslashes for use in a regular expression
 * @param {string} string     The un-escaped input string
 * @returns {string}          The escaped string, suitable for use in regular expression
 */
export function escape(string) {
  return string.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}

// Define properties on the RegExp environment
Object.defineProperties(RegExp, {
  escape: {value: escape}
});

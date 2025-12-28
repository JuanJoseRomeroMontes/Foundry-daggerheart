/** @module validators */

/**
 * Test whether a string is a valid 16 character UID
 * @param {string} id
 * @return {boolean}
 */
export function isValidId(id) {
  return /^[a-zA-Z0-9]{16}$/.test(id);
}

/**
 * Test whether a file path has an extension in a list of provided extensions
 * @param {string} path
 * @param {string[]} extensions
 * @return {boolean}
 */
export function hasFileExtension(path, extensions) {
  const xts = extensions.map(ext => `\\.${ext}`).join("|");
  const rgx = new RegExp(`(${xts})(\\?.*)?$`, "i");
  return !!path && rgx.test(path);
}

/**
 * Test whether a string data blob contains base64 data, optionally of a specific type or types
 * @param {string} data       The candidate string data
 * @param {string[]} [types]  An array of allowed mime types to test
 * @return {boolean}
 */
export function isBase64Data(data, types) {
  if ( types === undefined ) return /^data:([a-z]+)\/([a-z0-9]+);base64,/.test(data);
  return types.some(type => data.startsWith(`data:${type};base64,`))
}

/**
 * Test whether an input represents a valid 6-character color string
 * @param {string} color      The input string to test
 * @return {boolean}          Is the string a valid color?
 */
export function isColorString(color) {
  return /^#[0-9A-Fa-f]{6}$/.test(color);
}

/**
 * Assert that the given value parses as a valid JSON string
 * @param {string} val        The value to test
 * @return {boolean}          Is the String valid JSON?
 */
export function isJSON(val) {
  try {
    JSON.parse(val);
    return true;
  } catch(err) {
    return false;
  }
}

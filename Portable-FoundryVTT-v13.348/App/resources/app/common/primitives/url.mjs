/**
 * Attempt to parse a URL without throwing an error.
 * @param {string} url  The string to parse.
 * @returns {URL|null}  The parsed URL if successful, otherwise null.
 */
export function parseSafe(url) {
  try {
    return new URL(url);
  } catch (err) {}
  return null;
}

// Define properties on the URL environment
Object.defineProperties(URL, {
  parseSafe: {value: parseSafe}
});

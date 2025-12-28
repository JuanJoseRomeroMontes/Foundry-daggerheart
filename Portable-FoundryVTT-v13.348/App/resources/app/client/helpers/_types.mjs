/**
 * @typedef CompendiumArtInfo
 * @property {string} [actor]         The path to the Actor's portrait image.
 * @property {string|object} [token]  The path to the token image, or an object to merge into the Actor's prototype
 *                                    token.
 * @property {string} [credit]        An optional credit string for use by the game system to apply in an appropriate
 *                                    place.
 */

/**
 * @typedef {Record<string, Record<string, CompendiumArtInfo>>} CompendiumArtMapping
 * A mapping of compendium pack IDs to Document IDs to art information.
 */

/**
 * @typedef CompendiumArtDescriptor
 * @property {string} packageId  The ID of the package providing the art.
 * @property {string} title      The title of the package providing the art.
 * @property {string} mapping    The path to the art mapping file.
 * @property {string} [credit]   An optional credit string for use by the game system to apply in an appropriate place.
 * @property {number} priority   The package's user-configured priority.
 */


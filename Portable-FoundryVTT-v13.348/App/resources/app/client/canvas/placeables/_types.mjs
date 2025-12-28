

/**
 * @typedef RingColorBand
 * The start and end radii of the token ring color band.
 * @property {number} startRadius The starting normalized radius of the token ring color band.
 * @property {number} endRadius   The ending normalized radius of the token ring color band.
 */

/**
 * @typedef {string} DynamicRingId
 * Dynamic ring id.
 */

/**
 * @typedef RingData
 * Represents the ring- and background-related properties for a given size
 * @property {string|undefined} ringName                 The filename of the ring asset, if available
 * @property {string|undefined} bkgName                  The filename of the background asset, if available
 * @property {string|undefined} maskName                 The filename of the mask asset, if available
 * @property {RingColorBand|undefined} colorBand         Defines color stops for the ring gradient, if applicable
 * @property {number|null} defaultRingColorLittleEndian  Default color for the ring in little-endian BBGGRR format, or null if not set
 * @property {number|null} defaultBackgroundColorLittleEndian  Default color for the background in little-endian BBGGRR format, or null if not set
 * @property {number|null} subjectScaleAdjustment        Scaling factor to adjust how the subject texture fits within the ring, or null if unavailable
 */



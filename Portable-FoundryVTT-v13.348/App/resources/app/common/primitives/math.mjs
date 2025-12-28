/**
 * √3
 * @type {number}
 */
export const SQRT3 = 1.7320508075688772;

/**
 * √⅓
 * @type {number}
 */
export const SQRT1_3 = 0.5773502691896257;

/**
 * Bound a number between some minimum and maximum value, inclusively.
 * @param {number} num    The current value
 * @param {number} min    The minimum allowed value
 * @param {number} max    The maximum allowed value
 * @returns {number}      The clamped number
 */
export function clamp(num, min, max) {
  return Math.min(Math.max(num, min), max);
}

/**
 * @deprecated since v12
 * @ignore
 */
export function clamped(num, min, max) {
  const msg = "Math.clamped is deprecated in favor of Math.clamp.";
  foundry.utils.logCompatibilityWarning(msg, {since: 12, until: 14, once: true});
  return clamp(num, min, max);
}

/**
 * Linear interpolation function
 * @param {number} a   An initial value when weight is 0.
 * @param {number} b   A terminal value when weight is 1.
 * @param {number} w   A weight between 0 and 1.
 * @returns {number}   The interpolated value between a and b with weight w.
 */
export function mix(a, b, w) {
  return (a * (1 - w)) + (b * w);
}

/**
 * Transform an angle in degrees to be bounded within the domain [0, 360)
 * @param {number} degrees  An angle in degrees
 * @param {number} _base    DEPRECATED
 * @returns {number}        The same angle on the range [0, 360)
 */
export function normalizeDegrees(degrees, _base) {
  const d = degrees % 360;
  if ( _base !== undefined ) {
    const msg = "Math.normalizeDegrees(degrees, base) is deprecated.";
    foundry.utils.logCompatibilityWarning(msg, {since: 12, until: 14, once: true});
    if ( _base === 360 ) return d <= 0 ? d + 360 : d;
  }
  return d < 0 ? d + 360 : d;
}

/**
 * Transform an angle in radians to be bounded within the domain [-PI, PI]
 * @param {number} radians  An angle in degrees
 * @returns {number}        The same angle on the range [-PI, PI]
 */
export function normalizeRadians(radians) {
  const pi = Math.PI;
  const pi2 = pi * 2;
  return radians - (pi2 * Math.floor((radians + pi) / pi2));
}

/**
 * @deprecated since v12
 * @ignore
 */
export function roundDecimals(number, places) {
  const msg = "Math.roundDecimals is deprecated.";
  foundry.utils.logCompatibilityWarning(msg, {since: 12, until: 14, once: true});
  places = Math.max(Math.trunc(places), 0);
  const scl = Math.pow(10, places);
  return Math.round(number * scl) / scl;
}

/**
 * Transform an angle in radians to a number in degrees
 * @param {number} angle    An angle in radians
 * @returns {number}        An angle in degrees
 */
export function toDegrees(angle) {
  return angle * (180 / Math.PI);
}

/**
 * Transform an angle in degrees to an angle in radians
 * @param {number} angle    An angle in degrees
 * @returns {number}        An angle in radians
 */
export function toRadians(angle) {
  return angle * (Math.PI / 180);
}

/**
 * Returns the value of the oscillation between `a` and `b` at time `t`.
 * @param {number} a                              The minimium value of the oscillation
 * @param {number} b                              The maximum value of the oscillation
 * @param {number} t                              The time
 * @param {number} [p=1]                          The period (must be nonzero)
 * @param {(x: number) => number} [f=Math.cos]    The periodic function (its period must be 2π)
 * @returns {number}                              `((b - a) * (f(2π * t / p) + 1) / 2) + a`
 */
export function oscillation(a, b, t, p=1, f=Math.cos) {
  return ((b - a) * (f((2 * Math.PI * t) / p) + 1) / 2) + a;
}

// Define properties on the Math environment
Object.defineProperties(Math, {
  SQRT3: {value: SQRT3},
  SQRT1_3: {value: SQRT1_3},
  clamp: {
    value: clamp,
    configurable: true,
    writable: true
  },
  clamped: {
    value: clamped,
    configurable: true,
    writable: true
  },
  mix: {
    value: mix,
    configurable: true,
    writable: true
  },
  normalizeDegrees: {
    value: normalizeDegrees,
    configurable: true,
    writable: true
  },
  normalizeRadians: {
    value: normalizeRadians,
    configurable: true,
    writable: true
  },
  roundDecimals: {
    value: roundDecimals,
    configurable: true,
    writable: true
  },
  toDegrees: {
    value: toDegrees,
    configurable: true,
    writable: true
  },
  toRadians: {
    value: toRadians,
    configurable: true,
    writable: true
  },
  oscillation: {
    value: oscillation,
    configurable: true,
    writable: true
  }
});


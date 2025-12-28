import {COMPATIBILITY_MODES} from "../constants.mjs";

/**
 * The messages that have been logged already and should not be logged again.
 * @type {Set<string>}
 */
const loggedCompatibilityWarnings = new Set();

/**
 * Log a compatibility warning which is filtered based on the client's defined compatibility settings.
 * @param {string} message            The original warning or error message
 * @param {object} [options={}]       Additional options which customize logging
 * @param {number} [options.mode]          A logging level in COMPATIBILITY_MODES which overrides the configured default
 * @param {number|string} [options.since]  A version identifier since which a change was made
 * @param {number|string} [options.until]  A version identifier until which a change remains supported
 * @param {string} [options.details]       Additional details to append to the logged message
 * @param {boolean} [options.stack=true]   Include the message stack trace
 * @param {boolean} [options.once=false]   Log this the message only once?
 * @throws                            An Error if the mode is ERROR
 */
export function logCompatibilityWarning(message, {mode, since, until, details, stack=true, once=false}={}) {

  // Determine the logging mode
  const modes = COMPATIBILITY_MODES;
  const compatibility = globalThis.CONFIG?.compatibility || {
    mode: modes.WARNING,
    includePatterns: [],
    excludePatterns: []
  };
  mode ??= compatibility.mode;
  if ( mode === modes.SILENT ) return;

  // Compose the message
  since = since ? `Deprecated since Version ${since}` : null;
  until = until ? `Backwards-compatible support will be removed in Version ${until}`: null;
  message = [message, since, until, details].filterJoin("\n");

  // Filter the message by its stack trace
  const error = new Error(message);
  if ( compatibility.includePatterns.length ) {
    if ( !compatibility.includePatterns.some(rgx => rgx.test(error.message) || rgx.test(error.stack)) ) return;
  }
  if ( compatibility.excludePatterns.length ) {
    if ( compatibility.excludePatterns.some(rgx => rgx.test(error.message) || rgx.test(error.stack)) ) return;
  }

  // Log the message
  const log = !(once && loggedCompatibilityWarnings.has(error.stack));
  switch ( mode ) {
    case modes.WARNING:
      if ( log ) globalThis.logger.warn(stack ? error : error.message);
      break;
    case modes.ERROR:
      if ( log ) globalThis.logger.error(stack ? error : error.message);
      break;
    case modes.FAILURE:
      throw error;
  }
  if ( log && once ) loggedCompatibilityWarnings.add(error.stack);
}

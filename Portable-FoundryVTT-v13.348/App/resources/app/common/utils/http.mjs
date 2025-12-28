/**
 * A wrapper method around `fetch` that attaches an AbortController signal to the `fetch` call for clean timeouts
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal#aborting_a_fetch_with_timeout_or_explicit_abort}
 * @param {string} url            The URL to make the Request to
 * @param {RequestInit} data      The data of the Request
 * @param {object} [options]                 Additional options
 * @param {number|null} [options.timeoutMs]  How long to wait for a Response before cleanly aborting.
 *                                           If null, no timeout is applied. Default: `30000`.
 * @param {Function} [options.onTimeout]     A method to invoke if and when the timeout is reached
 * @returns {Promise<Response>}
 * @throws {HttpError}
 */
export async function fetchWithTimeout(url, data={}, {timeoutMs=30000, onTimeout=() => {}}={}) {
  const controller = new AbortController();
  data.signal = controller.signal;
  let timedOut = false;
  const enforceTimeout = timeoutMs !== null;

  // Enforce a timeout
  let timeout;
  if ( enforceTimeout ) {
    timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
      onTimeout();
    }, timeoutMs);
  }

  // Attempt the request
  let response;
  try {
    response = await fetch(url, data);
  } catch(err) {
    if ( timedOut ) {
      const timeoutS = Math.round(timeoutMs / 1000);
      const msg = game.i18n
        ? game.i18n.format("SETUP.ErrorTimeout", { url, timeout: timeoutS })
        : `The request to ${url} timed out after ${timeoutS}s.`;
      throw new HttpError("Timed Out", 408, msg);
    }
    throw err;
  } finally {
    if ( enforceTimeout ) clearTimeout(timeout);
  }

  // Return the response
  if ( !response.ok && (response.type !== "opaqueredirect") ) {
    const responseBody = response.body ? await response.text() : "";
    throw new HttpError(response.statusText, response.status, responseBody);
  }
  return response;
}

/* ----------------------------------------- */

/**
 * A small wrapper that automatically asks for JSON with a Timeout
 * @param {string} url          The URL to make the Request to
 * @param {Object} data         The data of the Request
 * @param {object} [options]                 Additional options
 * @param {number|null} [options.timeoutMs]  How long to wait for a Response before cleanly aborting.
 *                                           If null, no timeout is applied. Default: `30000`.
 * @param {Function} [options.onTimeout]     A method to invoke if and when the timeout is reached
 * @returns {Promise<*>}
 */
export async function fetchJsonWithTimeout(url, data = {}, {timeoutMs=30000, onTimeout = () => {}} = {}) {
  const response = await fetchWithTimeout(url, data, {timeoutMs, onTimeout: onTimeout});
  return response.json();
}

/* -------------------------------------------- */

/**
 * Test whether a file source exists by performing a HEAD request against it
 * @param {string} src          The source URL or path to test
 * @returns {Promise<boolean>}   Does the file exist at the provided url?
 */
export async function srcExists(src) {
  return foundry.utils.fetchWithTimeout(src, { method: "HEAD" }).then(resp => {
    return resp.status < 400;
  }).catch(() => false);
}

/* ----------------------------------------- */

/**
 * Represents an HTTP Error when a non-OK response is returned by Fetch
 * @extends {Error}
 */
export class HttpError extends Error {
  constructor(statusText, code, displayMessage="") {
    super(statusText);
    this.code = code;
    this.displayMessage = displayMessage;
  }

  /* -------------------------------------------- */

  /** @override */
  toString() {
    return this.displayMessage;
  }
}

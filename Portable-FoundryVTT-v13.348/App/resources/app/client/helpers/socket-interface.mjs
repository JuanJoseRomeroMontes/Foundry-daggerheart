/**
 * @import {DocumentSocketRequest} from "@common/abstract/_types.mjs";
 */

/**
 * A standardized way socket messages are dispatched and their responses are handled
 */
export default class SocketInterface {
  /**
   * Send a socket request to all other clients and handle their responses.
   * @param {string} eventName          The socket event name being handled
   * @param {DocumentSocketRequest|object} request  Request data provided to the Socket event
   * @returns {Promise<SocketResponse>} A Promise which resolves to the SocketResponse
   */
  static dispatch(eventName, request) {
    return new Promise((resolve, reject) => {
      game.socket.emit(eventName, request, response => {
        if ( response.error ) {
          const err = SocketInterface.#handleError(response.error);
          reject(err);
        }
        else resolve(response);
      });
    });
  }

  /* -------------------------------------------- */

  /**
   * Handle an error returned from the database, displaying it on screen and in the console
   * @param {Error} err   The provided Error message
   */
  static #handleError(err) {
    const error = err instanceof Error ? err : new Error(err.message);
    if ( err.stack ) error.stack = err.stack;
    if ( ui.notifications ) ui.notifications.error(error.message);
    return error;
  }
}

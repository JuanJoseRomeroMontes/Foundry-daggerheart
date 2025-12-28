/**
 * @import {DatabaseAction, DatabaseOperation, DocumentSocketRequest} from "./_types.mjs";
 */

/**
 * The data structure of a modifyDocument socket response.
 */
export default class DocumentSocketResponse {
  /**
   * Prepare a response for an incoming request.
   * @param {DocumentSocketRequest} request     The incoming request that is being responded to
   */
  constructor(request) {
    for ( const [k, v] of Object.entries(request) ) {
      if ( this.hasOwnProperty(k) ) this[k] = v;
    }
  }

  /**
   * The type of Document being transacted.
   * @type {string}
   */
  type;

  /**
   * The database action that was performed.
   * @type {DatabaseAction}
   */
  action;

  /**
   * Was this response broadcast to other connected clients?
   * @type {boolean}
   */
  broadcast;

  /**
   * The database operation that was requested.
   * @type {DatabaseOperation}
   */
  operation;

  /**
   * The identifier of the requesting user.
   * @type {string}
   */
  userId;

  /**
   * The result of the request. Present if successful
   * @type {object[]|string[]}
   */
  result;

  /**
   * An error that occurred. Present if unsuccessful
   * @type {Error}
   */
  error;
}

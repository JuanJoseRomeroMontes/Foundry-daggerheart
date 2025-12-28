import WorldCollection from "../abstract/world-collection.mjs";
import Hooks from "@client/helpers/hooks.mjs";

/**
 * @import User from "../user.mjs";
 * @import {ActivityData} from "@client/_types.mjs";
 */

/**
 * The singleton collection of User documents which exist within the active World.
 * This Collection is accessible within the Game object as game.users.
 *
 * ### Hook Events
 * - {@link hookEvents.userConnected}
 *
 * @extends {WorldCollection<User>}
 * @category Collections
 *
 * @see {@link foundry.documents.User}: The User document
 */
export default class Users extends WorldCollection {
  constructor(...args) {
    super(...args);

    /**
     * The User document of the currently connected user
     * @type {User|null}
     */
    this.current = this.current || null;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _initialize() {
    super._initialize();

    // Flag the current user
    this.current = this.get(game.data.userId) || null;
    if ( this.current ) this.current.active = true;

    // Set initial user activity state
    for ( const activeId of game.data.activeUsers || [] ) {
      this.get(activeId).active = true;
    }
  }

  /* -------------------------------------------- */

  /** @override */
  static documentName = "User";

  /* -------------------------------------------- */

  /**
   * Get the users with player roles
   * @returns {User[]}
   */
  get players() {
    return this.filter(u => !u.isGM && u.hasRole("PLAYER"));
  }

  /* -------------------------------------------- */

  /**
   * Get one User who is an active Gamemaster (non-assistant if possible), or null if no active GM is available.
   * This can be useful for workflows which occur on all clients, but where only one user should take action.
   * @type {User|null}
   */
  get activeGM() {
    return this.getDesignatedUser(user => user.active && user.isGM);
  }

  /* -------------------------------------------- */

  /**
   * Get the designated User among the Users that satisfy the given condition.
   * Returns `null` if no Users satisfy the given condition.
   * Returns a User with the highest role among the qualifying Users.
   * Qualifying Users aren't necessary active Users unless it is part of the condition.
   * @example
   * // Get the designated User for creating Tokens that is active
   * const user = game.users.getDesignatedUser(user => user.active && user.can("TOKEN_CREATE"));
   * @param {(user: User) => boolean} condition    The condition the Users must satisfy
   * @returns {User|null}                          The designated User or `null`
   */
  getDesignatedUser(condition) {
    const qualifying = game.users.filter(condition);
    if ( qualifying.length === 0 ) return null;
    let designated = qualifying[0];
    for ( let i = 1; i < qualifying.length; i++ ) {
      const candidate = qualifying[i];
      if ( ((candidate.role - designated.role) || designated.id.compare(candidate.id)) > 0 ) designated = candidate;
    }
    return designated;
  }

  /* -------------------------------------------- */
  /*  Socket Listeners and Handlers               */
  /* -------------------------------------------- */

  static _activateSocketListeners(socket) {
    socket.on("userActivity", Users.#handleUserActivity.bind(this));
    socket.on("userQuery", Users.#handleUserQuery.bind(this));
  }

  /* -------------------------------------------- */

  /**
   * Handle receipt of activity data from another User connected to the Game session
   * @param {string} userId               The User id who generated the activity data
   * @param {ActivityData} activityData   The object of activity data
   */
  static #handleUserActivity(userId, activityData={}) {
    const user = game.users.get(userId);
    if ( !user || user.isSelf ) return;

    // Track the last observed activity time for the user
    user.lastActivityTime = Date.now();
    let renderNav = false;

    // Update User active state
    const active = "active" in activityData ? activityData.active : true;
    if ( user.active !== active ) {
      user.active = active;
      game.users.render();
      renderNav = true;
      if ( !active ) user.movingTokens.forEach(token => token._stopMovementOnDisconnect());
      Hooks.callAll("userConnected", user, active);
    }

    // Set viewed scene
    const sceneChange = ("sceneId" in activityData) && (activityData.sceneId !== user.viewedScene);
    if ( sceneChange ) {
      user.viewedScene = activityData.sceneId;
      renderNav = true;
    }
    if ( renderNav ) ui.nav?.render();

    // Everything below here requires the game to be ready
    if ( !game.ready ) return;
    if ( "av" in activityData ) {
      game.webrtc.settings.handleUserActivity(userId, activityData.av);
    }

    // Everything below requires an active canvas
    if ( !canvas.ready ) return;

    // User control deactivation
    if ( (active === false) || (user.viewedScene !== canvas.id) ) {
      canvas.controls.updateCursor(user, null);
      // noinspection ES6MissingAwait
      canvas.controls.updateRuler(user, []);
      canvas.tokens._updatePlannedMovements(user, null);
      user._onUpdateTokenTargets([]);
      return;
    }

    // Cursor position
    if ( "cursor" in activityData ) {
      canvas.controls.updateCursor(user, activityData.cursor);
    }

    // Was it a ping?
    if ( "ping" in activityData ) {
      canvas.controls.handlePing(user, activityData.cursor, activityData.ping);
    }

    // Ruler measurement
    if ( "ruler" in activityData ) {
      // noinspection ES6MissingAwait
      canvas.controls.updateRuler(user, activityData.ruler);
    }

    // Token planned movements
    if ( "plannedMovements" in activityData ) {
      canvas.tokens._updatePlannedMovements(user, activityData.plannedMovements);
    }

    // Token targets
    if ( "targets" in activityData ) {
      user._onUpdateTokenTargets(activityData.targets);
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle the User query received via the socket.
   * @param {string} userId                            The ID of the querying User
   * @param {string} queryId                           The query ID
   * @param {string} queryName                         The query name
   * @param {object} queryData                         The query data
   * @param {object} queryOptions                      The query options
   * @param {number|undefined} queryOptions.timeout    The timeout that the querying User set for this query, if any
   * @param {Function} ack                             The acknowledgement function to return the result
   *                                                   of the confirmation to the server
   */
  static async #handleUserQuery(userId, queryId, queryName, queryData, {timeout}, ack) {
    const queryHandler = CONFIG.queries[queryName];
    if ( !queryHandler ) throw new Error(`Received invalid User query '${queryName}'`);
    const queryOptions = {timeout};
    const user = game.users.get(userId);
    if ( !user ) throw new Error(`User [${userId}] does not exist`);
    if ( CONFIG.debug.queries ) {
      console.debug(`${CONST.vtt} | Received "${queryName}" query [${queryId}] from User [${userId}]:`,
        queryData, queryOptions);
    }
    let queryResult;
    try {
      const value = await queryHandler(queryData, queryOptions);
      queryResult = {status: "fulfilled", value};
    } catch(e) {
      queryResult = {status: "rejected", reason: e.message};
    }
    if ( CONFIG.debug.queries ) {
      console.debug(`${CONST.vtt} | Sending result of "${queryName}" query [${queryId}] to User [${userId}]:`,
        queryResult.status === "rejected" ? new Error(queryResult.reason) : queryResult.value);
    }
    ack(queryResult);
  }
}

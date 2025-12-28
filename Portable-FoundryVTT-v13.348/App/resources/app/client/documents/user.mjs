import BaseUser from "@common/documents/user.mjs";
import ClientDocumentMixin from "./abstract/client-document.mjs";

/**
 * @import TokenDocument from "./token.mjs";
 * @import Macro from "./macro.mjs";
 * @import {ActivityData} from "@client/_types.mjs";
 * @import Users from "./collections/users.mjs";
 */

/**
 * The client-side User document which extends the common BaseUser model.
 * Each User document contains UserData which defines its data schema.
 *
 * @extends BaseUser
 * @mixes ClientDocumentMixin
 * @category Documents
 *
 * @see {@link foundry.documents.collections.Users}: The world-level collection of User documents
 * @see {@link foundry.applications.sheets.UserConfig}: The User configuration application
 */
export default class User extends ClientDocumentMixin(BaseUser) {

  /**
   * Track whether the user is currently active in the game
   * @type {boolean}
   */
  active = false;

  /**
   * Track references to the current set of Tokens which are targeted by the User
   * @type {Set<Token>}
   */
  targets = new foundry.canvas.placeables.tokens.UserTargets(this);

  /**
   * Track the ID of the Scene that is currently being viewed by the User
   * @type {string|null}
   */
  viewedScene = null;

  /**
   * Track the Token documents that this User is currently moving.
   * @type {ReadonlySet<TokenDocument>}
   * @readonly
   */
  movingTokens = new Set();

  /**
   * A flag for whether the current User is a Trusted Player
   * @type {boolean}
   */
  get isTrusted() {
    return this.hasRole("TRUSTED");
  }

  /**
   * A flag for whether this User is the connected client
   * @type {boolean}
   */
  get isSelf() {
    return game.userId === this.id;
  }

  /**
   * Is this User the active GM?
   * @type {boolean}
   */
  get isActiveGM() {
    return this === game.users.activeGM;
  }

  /**
   * A localized label for this User's role.
   * @type {string}
   */
  get roleLabel() {
    const R = CONST.USER_ROLES;
    const label = {
      [R.NONE]: "USER.RoleNone",
      [R.PLAYER]: "USER.RolePlayer",
      [R.TRUSTED]: "USER.RoleTrusted",
      [R.ASSISTANT]: "USER.RoleAssistant",
      [R.GAMEMASTER]: "USER.RoleGamemaster"
    }[this.role];
    return game.i18n.localize(label);
  }

  /**
   * The timestamp of the last observed activity for the user.
   * @type {number}
   */
  get lastActivityTime() {
    return this.#lastActivityTime;
  }

  set lastActivityTime(timestamp) {
    const dt = timestamp - this.#lastActivityTime;
    this.#lastActivityTime = timestamp;
    if ( ui.players && (dt > ui.players.constructor.IDLE_THRESHOLD_MS) ) ui.players.refreshLatency();
  }

  #lastActivityTime = 0;

  /* ---------------------------------------- */

  /** @inheritDoc */
  prepareDerivedData() {
    super.prepareDerivedData();
    this.avatar = this.avatar || this.character?.img || CONST.DEFAULT_TOKEN;
    this.border = this.color.multiply(2);
  }

  /* ---------------------------------------- */
  /*  User Methods                            */
  /* ---------------------------------------- */

  /**
   * Is this User the designated User among the Users that satisfy the given condition?
   * This function calls {@link foundry.documents.collections.Users#getDesignatedUser} and compares the designated User
   * to this User.
   * @example
   * // Is the current User the designated User to create Tokens?
   * const isDesignated = game.user.isDesignated(user => user.active && user.can("TOKEN_CREATE"));
   * @param {(user: User) => boolean} condition    The condition the Users must satisfy
   * @returns {boolean}                            Is designated User?
   */
  isDesignated(condition) {
    return this === game.users.getDesignatedUser(condition);
  }

  /* ---------------------------------------- */

  /**
   * Assign a Macro to a numbered hotbar slot between 1 and 50
   * @param {Macro|null} macro          The Macro document to assign
   * @param {number|string|null} [slot] A specific numbered hotbar slot to fill
   * @param {number} [fromSlot]         An optional origin slot from which the Macro is being shifted
   * @returns {Promise<User>}           A Promise which resolves once the User update is complete
   */
  async assignHotbarMacro(macro, slot, {fromSlot}={}) {
    if ( !(macro instanceof foundry.documents.Macro) && (macro !== null) ) throw new Error("Invalid Macro provided");
    const hotbar = this.hotbar;

    // If a slot was not provided, get the first available slot
    if ( Number.isNumeric(slot) ) slot = Number(slot);
    else {
      for ( let i=1; i<=50; i++ ) {
        if ( !(i in hotbar ) ) {
          slot = i;
          break;
        }
      }
    }
    if ( !slot ) throw new Error("No available Hotbar slot exists");
    if ( slot < 1 || slot > 50 ) throw new Error("Invalid Hotbar slot requested");
    if ( macro && (hotbar[slot] === macro.id) ) return this;
    const current = hotbar[slot];

    // Update the macro for the new slot
    const update = foundry.utils.deepClone(hotbar);
    if ( macro ) update[slot] = macro.id;
    else delete update[slot];

    // Replace or remove the macro in the old slot
    if ( Number.isNumeric(fromSlot) && (fromSlot in hotbar) ) {
      if ( current ) update[fromSlot] = current;
      else delete update[fromSlot];
    }
    return this.update({hotbar: update}, {diff: false, recursive: false, noHook: true});
  }

  /* -------------------------------------------- */

  /**
   * Assign a specific boolean permission to this user.
   * Modifies the user permissions to grant or restrict access to a feature.
   *
   * @param {string} permission    The permission name from USER_PERMISSIONS
   * @param {boolean} allowed      Whether to allow or restrict the permission
   */
  assignPermission(permission, allowed) {
    if ( !game.user.isGM ) throw new Error(`You are not allowed to modify the permissions of User ${this.id}`);
    const permissions = {[permission]: allowed};
    return this.update({permissions});
  }

  /* -------------------------------------------- */

  /**
   * Submit User activity data to the server for broadcast to other players.
   * This type of data is transient, persisting only for the duration of the session and not saved to any database.
   * Activity data uses a volatile event to prevent unnecessary buffering if the client temporarily loses connection.
   * @param {ActivityData} activityData  An object of User activity data to submit to the server for broadcast.
   * @param {object} [options]
   * @param {boolean|undefined} [options.volatile]  If undefined, volatile is inferred from the activity data.
   */
  broadcastActivity(activityData={}, {volatile}={}) {
    if ( !this.isSelf ) throw new Error("You can only broadcast your own User activity data.");
    volatile ??= !(("sceneId" in activityData)
      || (activityData.ruler === null)
      || ("targets" in activityData)
      || ("ping" in activityData)
      || ("av" in activityData));
    if ( volatile ) game.socket.volatile.emit("userActivity", this.id, activityData);
    else game.socket.emit("userActivity", this.id, activityData);
  }

  /* -------------------------------------------- */

  /**
   * Get an Array of Macro Documents on this User's Hotbar by page
   * @param {number} page     The hotbar page number
   * @returns {Array<{slot: number, macro: Macro|null}>}
   */
  getHotbarMacros(page=1) {
    const macros = Array.from({length: 50}, () => "");
    for ( const [k, v] of Object.entries(this.hotbar) ) {
      macros[parseInt(k)-1] = v;
    }
    const start = (page-1) * 10;
    return macros.slice(start, start+10).map((m, i) => {
      return {
        slot: start + i + 1,
        macro: m ? game.macros.get(m) : null
      };
    });
  }

  /* -------------------------------------------- */

  /**
   * Update the set of Token targets for the user given an array of provided Token ids.
   * This function handles changes made elsewhere and does not broadcast to other connected clients.
   * @param {string[]} targetIds      An array of Token ids which represents the new target set
   * @internal
   */
  _onUpdateTokenTargets(targetIds=[]) {

    // Clear targets outside the viewed scene
    if ( this.viewedScene !== canvas.scene.id ) {
      for ( const t of this.targets ) t._updateTarget(false, this);
      return;
    }

    // Remove old targets
    const ids = new Set(targetIds);
    for ( const t of this.targets ) {
      if ( !ids.has(t.id) ) t._updateTarget(false, this);
    }

    // Add new targets
    for ( const id of ids ) {
      const token = canvas.tokens.get(id);
      if ( !token || this.targets.has(token) ) continue;
      token._updateTarget(true, this);
    }
  }

  /* -------------------------------------------- */

  /**
   * Query this User.
   * @param {string} queryName                         The query name (must be registered in `CONFIG.queries`)
   * @param {object} queryData                         The query data (must be JSON-serializable)
   * @param {object} [queryOptions]                    The query options
   * @param {number} [queryOptions.timeout]            The timeout in milliseconds
   * @returns {Promise<*>}                             The query result
   */
  async query(queryName, queryData, {timeout}={}) {
    if ( !(queryName in CONFIG.queries) ) throw new Error(`User query '${queryName}' is not registered`);
    if ( !game.user.hasPermission("QUERY_USER") ) throw new Error("You do not have permission to query users");
    if ( !this.active ) throw new Error(`User [${this.id}] is not active`);
    const queryOptions = {timeout};
    const queryId = foundry.utils.randomID();
    if ( CONFIG.debug.queries ) {
      console.debug(` | Sending "${queryName}" query [${queryId}] to User [${this.id}]:`,
        queryData, queryOptions);
    }
    const queryResult = await new Promise(resolve => {
      game.socket.emit("userQuery", this.id, queryId, queryName, queryData, queryOptions, resolve);
    });
    if ( CONFIG.debug.queries ) {
      console.debug(` | Received result of "${queryName}" query [${queryId}] from User [${this.id}]:`,
        queryResult.status === "rejected" ? new Error(queryResult.reason) : queryResult.value);
    }
    if ( queryResult.status === "rejected" ) throw new Error(queryResult.reason);
    return queryResult.value;
  }

  /* -------------------------------------------- */
  /*  Event Handlers                              */
  /* -------------------------------------------- */

  /** @inheritDoc  */
  _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);

    // If the user role changed, we need to re-build the immutable User object
    if ( this._source.role !== this.role ) {
      const user = this.clone({}, {keepId: true});
      game.users.set(user.id, user);
      return user._onUpdate(changed, options, userId);
    }

    // If your own password or role changed - you must re-authenticate
    const isSelf = changed._id === game.userId;
    if ( isSelf && ["password", "role"].some(k => k in changed) ) return game.logOut();
    if ( !game.ready ) return;

    // User Color
    if ( "color" in changed ) {
      document.documentElement.style.setProperty(`--user-color-${this.id}`, this.color.css);
      if ( isSelf ) document.documentElement.style.setProperty("--user-color", this.color.css);
    }

    // Redraw Navigation
    if ( ["active", "character", "color", "role"].some(k => k in changed) ) {
      ui.nav?.render();
      ui.players?.render();
    }

    // Redraw Hotbar
    if ( isSelf && ("hotbar" in changed) ) ui.hotbar?.render();

    // Reconnect to Audio/Video conferencing, or re-render camera views
    const webRTCReconnect = ["permissions", "role"].some(k => k in changed);
    if ( webRTCReconnect && (changed._id === game.userId) ) {
      game.webrtc?.client.updateLocalStream().then(() => game.webrtc.render());
    } else if ( ["name", "avatar", "character"].some(k => k in changed) ) game.webrtc?.render();

    // Update Canvas
    if ( canvas.ready ) {

      // Redraw Cursor
      if ( "color" in changed ) {
        canvas.controls.drawCursor(this);
        const ruler = canvas.controls.getRulerForUser(this.id);
        if ( ruler ) ruler.refresh();
      }
      if ( "active" in changed ) canvas.controls.updateCursor(this, null);

      // Modify impersonated character
      if ( isSelf && ("character" in changed) ) {
        canvas.perception.initialize();
        canvas.tokens.cycleTokens(true, true);
      }
    }
  }

  /* -------------------------------------------- */

  /** @inheritDoc  */
  _onDelete(options, userId) {
    super._onDelete(options, userId);
    const settings = game.settings.storage.get("world");
    for ( const { id, user } of settings ) {
      if ( user === this.id ) settings.delete(id);
    }
    if ( this.id === game.user.id ) return game.logOut();
  }
}

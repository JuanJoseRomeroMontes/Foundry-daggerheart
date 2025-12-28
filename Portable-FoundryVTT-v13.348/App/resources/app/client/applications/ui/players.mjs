import ApplicationV2 from "../api/application.mjs";
import HandlebarsApplicationMixin from "../api/handlebars-application.mjs";

/**
 * @import User from "@client/documents/user.mjs"
 * @import {ContextMenuEntry} from "../ux/context-menu.mjs"
 */

/**
 * A UI element which displays the Users defined for this world.
 * Currently active users are always displayed, while inactive users can be displayed on toggle.
 *
 * @extends ApplicationV2
 * @mixes HandlebarsApplication
 */
export default class Players extends HandlebarsApplicationMixin(ApplicationV2) {

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    id: "players",
    classes: ["faded-ui", "flexcol"],
    tag: "aside",
    window: {
      frame: false,
      positioned: false
    },
    actions: {
      expand: Players.#onExpand
    }
  };

  /** @override */
  static PARTS = {
    players: {
      root: true,
      template: "templates/ui/players.hbs"
    }
  };

  /**
   * How often latency is refreshed.
   * @type {number}
   */
  static REFRESH_LATENCY_FREQUENCY_MS = 60 * 1000; // 1 Minute

  /**
   * A threshold of time in milliseconds after which a player is considered idle if they have no observed activity.
   * @type {number}
   */
  static IDLE_THRESHOLD_MS = 5 * 60 * 1000; // 5 Minutes

  /* -------------------------------------------- */

  /**
   * Is the application currently expanded?
   * @type {boolean}
   */
  get expanded() {
    return this.element.classList.contains("expanded");
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(_options) {
    const active = [];
    const inactive = [];
    for ( const u of game.users ) {
      const user = {
        id: u.id,
        name: this._formatName(u),
        role: u.role,
        tooltip: u.roleLabel,
        isSelf: u.isSelf,
        cssClass: [u.active ? "active" : "", u.isGM ? "gm" : "", u.isSelf ? "self" : ""].filterJoin(" "),
        color: u.active ? u.color.css : "#333333",
        border: u.active ? u.border.css : "#000000"
      };
      if ( u.active ) active.push(user);
      else inactive.push(user);
    }
    active.sort(Players.#sortUsers);
    inactive.sort(Players.#sortUsers);

    // Return the data for rendering
    return {active, inactive};
  }

  /* -------------------------------------------- */

  /**
   * Format the display of a user's name using their name, pronouns (if defined), and character name (if defined).
   * @param {User} user
   * @returns {string}
   * @protected
   */
  _formatName(user) {
    const parts = [user.name];
    if ( user.pronouns ) parts.push(`(${user.pronouns})`);
    if ( user.isGM ) parts.push(`[${game.i18n.localize("USER.GM")}]`);
    else if ( user.character ) parts.push(`[${user.character.name}]`);
    return parts.join(" ");
  }

  /* -------------------------------------------- */

  /**
   * A helper method used to sort users.
   * @param {{role: number, isSelf: boolean, name: string}} a
   * @param {{role: number, isSelf: boolean, name: string}} b
   * @returns {number}
   */
  static #sortUsers(a, b) {
    if ( a.isSelf || b.isSelf ) return b.isSelf - a.isSelf;
    if ( (b.role >= CONST.USER_ROLES.ASSISTANT) && (b.role > a.role) ) return 1;
    return a.name.localeCompare(b.name, game.i18n.lang);
  }

  /* -------------------------------------------- */

  /** @override */
  async _onFirstRender(_context, _options) {
    game.users.apps.push(this);
    window.setInterval(this.refreshLatency.bind(this), this.constructor.REFRESH_LATENCY_FREQUENCY_MS);
    /** @fires {hookEvents:getUserContextOptions} */
    this._createContextMenu(this._getContextMenuOptions, ".player", {
      hookName: "getUserContextOptions",
      parentClassHooks: false,
      fixed: true
    });
  }

  /* -------------------------------------------- */

  /** @override */
  async _onRender(_context, _options) {
    this.element.classList.toggle("expanded", this.expanded);
    this.refreshLatency();
    this.refreshFPS();
  }

  /* -------------------------------------------- */
  /*  Public API                                  */
  /* -------------------------------------------- */

  /**
   * Collapse the players list.
   */
  collapse() {
    this.toggleExpanded(false);
  }

  /* -------------------------------------------- */

  /**
   * Expand the players list.
   */
  expand() {
    this.toggleExpanded(true);
  }

  /* -------------------------------------------- */

  /**
   * Update the display which reports average latency.
   */
  refreshLatency() {
    if ( !this.rendered ) return;

    // Latency Indicator
    const el = this.element.querySelector("#latency");
    if ( el ) {
      const avg = game.time.averageLatency;
      el.querySelector(".average").innerText = `${Math.round(avg)}ms`;
      el.className = [[250, "good"], [1000, "fair"], [Infinity, "poor"]].find(s => avg <= s[0])[1];
    }

    // Idle Players
    const t = Date.now();
    for ( const li of this.element.querySelectorAll(".players-list > .player") ) {
      const user = game.users.get(li.dataset.userId);
      const isIdle = user.active && !user.isSelf && ((t - user.lastActivityTime) > this.constructor.IDLE_THRESHOLD_MS);
      li.classList.toggle("idle", isIdle);
    }
  }

  /* -------------------------------------------- */

  /**
   * Update the display which reports average framerate.
   * @param {object} [options={}]                   Options which customize FPS reporting
   * @param {boolean} [options.deactivate=false]      Deactivate tracking
   */
  refreshFPS({deactivate=false}={}) {
    if ( !this.rendered ) return;
    const el = this.element.querySelector("#fps");
    if ( !el ) return;
    if ( deactivate || !canvas.ready ) {
      el.querySelector(".average").innerText = "--";
      el.className = "";
      return;
    }
    const values = canvas.fps.values;
    const avg = values.reduce((fps, total) => total + fps, 0) / values.length;
    el.querySelector(".average").innerText = Math.round(avg);
    const max = canvas.app.ticker.maxFPS || 60;
    const r = avg / max;
    if ( !Number.isFinite(r) ) el.className = "fair";
    else el.className = [[0.5, "poor"], [0.8, "fair"], [Infinity, "good"]].find(f => r < f[0])[1];
  }

  /* -------------------------------------------- */

  /**
   * Toggle the expanded state of the players list.
   * @param {boolean} [expanded]  Force the expanded state to the provided value, otherwise toggle the state.
   */
  toggleExpanded(expanded) {
    expanded ??= !this.expanded;
    this.element.classList.toggle("expanded", expanded);
  }

  /* -------------------------------------------- */
  /*  Action Event Handlers                       */
  /* -------------------------------------------- */

  /**
   * Handle click events to expand the inactive player tray.
   * @this {Players}
   */
  static #onExpand() {
    this.toggleExpanded();
  }

  /* -------------------------------------------- */
  /*  Context Menu                                */
  /* -------------------------------------------- */

  /**
   * Get the set of ContextMenu options which should be applied to each User in the Players UI.
   * @returns {ContextMenuEntry[]}   The Array of context options passed to the ContextMenu instance
   * @protected
   */
  _getContextMenuOptions() {
    return [
      {
        name: game.i18n.localize("PLAYERS.ConfigTitle"),
        icon: '<i class="fa-solid fa-person"></i>',
        condition: li => game.user.isGM || (li.dataset.userId === game.user.id),
        callback: li => {
          const user = game.users.get(li.dataset.userId);
          user?.sheet.render({force: true});
        }
      },
      {
        name: game.i18n.localize("PLAYERS.ViewAvatar"),
        icon: '<i class="fa-solid fa-image"></i>',
        condition: li => {
          const user = game.users.get(li.dataset.userId);
          return user.avatar !== CONST.DEFAULT_TOKEN;
        },
        callback: li => {
          const user = game.users.get(li.dataset.userId);
          new foundry.applications.apps.ImagePopout({
            src: user.avatar,
            uuid: user.uuid,
            window: {title: user.name}
          }).render({force: true});
        }
      },
      {
        name: game.i18n.localize("PLAYERS.PullToScene"),
        icon: '<i class="fa-solid fa-diamond-turn-right"></i>',
        condition: li => {
          const user = game.users.get(li.dataset.userId);
          return user.active && game.user.isGM && !user.isSelf;
        },
        callback: li => canvas.scene.pullUsers([li.dataset.userId])
      },
      {
        name: game.i18n.localize("PLAYERS.Kick"),
        icon: '<i class="fa-solid fa-door-open"></i>',
        condition: li => {
          const user = game.users.get(li.dataset.userId);
          return game.user.isGM && user.active && !user.isSelf;
        },
        callback: li => {
          const user = game.users.get(li.dataset.userId);
          return Players.#kickUser(user);
        }
      },
      {
        name: game.i18n.localize("PLAYERS.Ban"),
        icon: '<i class="fa-solid fa-ban"></i>',
        condition: li => {
          const user = game.users.get(li.dataset.userId);
          return game.user.isGM && !user.isSelf && (user.role !== CONST.USER_ROLES.NONE);
        },
        callback: li => {
          const user = game.users.get(li.dataset.userId);
          return Players.#banUser(user);
        }
      },
      {
        name: game.i18n.localize("PLAYERS.UnBan"),
        icon: '<i class="fas fa-ban"></i>',
        condition: li => {
          const user = game.users.get(li.dataset.userId);
          return game.user.isGM && !user.isSelf && (user.role === CONST.USER_ROLES.NONE);
        },
        callback: li => {
          const user = game.users.get(li.dataset.userId);
          return Players.#unbanUser(user);
        }
      },
      {
        name: game.i18n.localize("WEBRTC.TooltipShowUser"),
        icon: '<i class="fas fa-eye"></i>',
        condition: li => {
          const userId = li.dataset.userId;
          return game.webrtc.settings.client.users[userId]?.blocked;
        },
        callback: async li => {
          const userId = li.dataset.userId;
          await game.webrtc.settings.set("client", `users.${userId}.blocked`, false);
          ui.webrtc.render();
        }
      }
    ];
  }

  /* -------------------------------------------- */

  /**
   * Temporarily remove a User from the World by banning and then un-banning them.
   * @param {User} user     The User to kick
   * @returns {Promise<void>}
   */
  static async #kickUser(user) {
    const role = user.role;
    await user.update({role: CONST.USER_ROLES.NONE});
    await user.update({role}, {diff: false});
    ui.notifications.info("USER.MESSAGES.KICKED", {format: {user: user.name}});
  }

  /* -------------------------------------------- */

  /**
   * Ban a User by changing their role to "NONE".
   * @param {User} user     The User to ban
   * @returns {Promise<void>}
   */
  static async #banUser(user) {
    if ( user.role === CONST.USER_ROLES.NONE ) return;
    await user.update({role: CONST.USER_ROLES.NONE});
    ui.notifications.info("USER.MESSAGES.BANNED", {format: {user: user.name}});
  }

  /* -------------------------------------------- */

  /**
   * Unban a User by changing their role to "PLAYER".
   * @param {User} user     The User to unban
   * @returns {Promise<void>}
   */
  static async #unbanUser(user) {
    if ( user.role !== CONST.USER_ROLES.NONE ) return;
    await user.update({role: CONST.USER_ROLES.PLAYER});
    ui.notifications.info("USER.MESSAGES.UNBANNED", {format: {user: user.name}});
  }
}

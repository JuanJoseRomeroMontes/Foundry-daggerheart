import HandlebarsApplicationMixin from "../../api/handlebars-application.mjs";
import ApplicationV2 from "../../api/application.mjs";
import {NumberField} from "@common/data/fields.mjs";
import CameraPopout from "./camera-popout.mjs";
import AVSettings from "@client/av/settings.mjs";

/**
 * @import {ApplicationConfiguration, ApplicationRenderContext} from "../../_types.mjs"
 * @import {HandlebarsRenderOptions} from "../../api/handlebars-application.mjs"
 * @import {AVSettingsData} from "@client/av/settings.mjs"
 */

/**
 * @typedef CameraViewUserContext
 * @property {User} user                The User instance.
 * @property {AVSettingsData} settings  The user's AV settings.
 * @property {boolean} local            Whether the user's AV stream is local.
 * @property {string} charname          The user's character name.
 * @property {string} css               The CSS class of the user's camera dock.
 * @property {boolean} hasVideo         Whether the user is broadcasting video.
 * @property {boolean} hasAudio         Whether the user is broadcasting audio.
 * @property {boolean} hidden           Whether the main camera dock is hidden.
 * @property {object} nameplates
 * @property {boolean} nameplates.hidden     Whether camera nameplates are entirely hidden.
 * @property {string} nameplates.css         Nameplate CSS classes.
 * @property {string} nameplates.playerName  Whether to show player names on nameplates.
 * @property {string} nameplates.charname    Whether to show character names on nameplates.
 * @property {object} video
 * @property {number} video.volume      The video stream's volume.
 * @property {boolean} video.muted      Whether to mute the video stream's audio.
 * @property {boolean} video.show       Whether to show this user's camera.
 * @property {object} volume
 * @property {number} volume.value      The user's configured volume level.
 * @property {DataField} volume.field   The volume range field.
 * @property {boolean} volume.show      Whether to show a volume bar for this user.
 * @property {Record<string, CameraViewControlContext>} controls
 */

/**
 * @typedef CameraViewControlContext
 * @property {string} icon
 * @property {string} label
 * @property {boolean} display
 */

/**
 * An application that shows docked camera views.
 * @extends {ApplicationV2<ApplicationConfiguration, HandlebarsRenderOptions>}
 * @mixes HandlebarsApplication
 */
export default class CameraViews extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @override */
  static DEFAULT_OPTIONS = {
    id: "camera-views",
    window: {
      frame: false
    },
    actions: {
      blockAudio: this.prototype._onBlockAudio,
      blockVideo: this.prototype._onBlockVideo,
      configure: this.prototype._onConfigure,
      disableVideo: this.prototype._onDisableVideo,
      hide: this.prototype._onHideUser,
      mutePeers: this.prototype._onMutePeers,
      toggleAudio: this.prototype._onToggleAudio,
      toggleDock: CameraViews.#onToggleDock,
      toggleDocked: CameraViews.#onToggleDocked,
      toggleVideo: this.prototype._onToggleVideo
    }
  };

  /** @override */
  static PARTS = {
    cameras: {
      template: "templates/apps/av/cameras.hbs",
      scrollable: [".scrollable"]
    },
    controls: {
      template: "templates/apps/av/controls.hbs"
    }
  };

  /**
   * Icons for the docked state of the camera dock.
   * @type {Record<AVSettings.DOCK_POSITIONS, [string, string]>}
   */
  DOCK_ICONS = {
    [AVSettings.DOCK_POSITIONS.TOP]: ["up", "down"],
    [AVSettings.DOCK_POSITIONS.RIGHT]: ["right", "left"],
    [AVSettings.DOCK_POSITIONS.BOTTOM]: ["down", "up"],
    [AVSettings.DOCK_POSITIONS.LEFT]: ["left", "right"]
  };

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * If all camera views are popped out, hide the dock.
   * @type {boolean}
   */
  get hidden() {
    return game.webrtc.client.getConnectedUsers().reduce((hidden, id) => {
      return hidden && game.webrtc.settings.getUser(id).popout;
    }, true);
  }

  /**
   * Whether the AV dock is in a horizontal configuration.
   * @type {boolean}
   */
  get isHorizontal() {
    const { DISABLED } = AVSettings.AV_MODES;
    const { TOP, BOTTOM } = AVSettings.DOCK_POSITIONS;
    const { mode } = game.webrtc.settings.world;
    const { dockPosition } = game.webrtc.settings.client;
    return (mode !== DISABLED) && ((dockPosition === TOP) || (dockPosition === BOTTOM));
  }

  /**
   * Whether the AV dock is in a vertical configuration.
   * @type {boolean}
   */
  get isVertical() {
    const { DISABLED } = AVSettings.AV_MODES;
    const { LEFT, RIGHT } = AVSettings.DOCK_POSITIONS;
    const { mode } = game.webrtc.settings.world;
    const { dockPosition } = game.webrtc.settings.client;
    return (mode !== DISABLED) && ((dockPosition === LEFT) || (dockPosition === RIGHT));
  }

  /**
   * Cameras which have been popped-out of this dock.
   * @type {CameraPopout[]}
   */
  get popouts() {
    const popouts = [];
    for ( const el of document.querySelectorAll('[id^="camera-views-"]') ) {
      popouts.push(foundry.applications.instances.get(el.id));
    }
    return popouts;
  }

  /**
   * The cached list of processed user entries.
   * @type {Record<string, CameraViewUserContext>}
   */
  get users() {
    return this.#users;
  }

  #users = {};

  /* -------------------------------------------- */
  /*  Public API                                  */
  /* -------------------------------------------- */

  /**
   * Get a user's camera dock.
   * @param {string} userId  The user's ID.
   * @returns {HTMLElement|null}
   */
  getUserCameraView(userId) {
    return document.querySelector(`.camera-view[data-user="${userId}"]`) || null;
  }

  /* -------------------------------------------- */

  /**
   * Get the video element for a user broadcasting video.
   * @param {string} userId  The user's ID.
   * @returns {HTMLVideoElement|null}
   */
  getUserVideoElement(userId) {
    return this.getUserCameraView(userId)?.querySelector("video.user-camera") || null;
  }

  /* -------------------------------------------- */

  /**
   * Indicate a user is speaking on their camera dock.
   * @param {string} userId     The user's ID.
   * @param {boolean} speaking  Whether the user is speaking.
   */
  setUserIsSpeaking(userId, speaking) {
    this.getUserCameraView(userId)?.classList.toggle("speaking", speaking);
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @override */
  _canRender(options) {
    return game.webrtc.settings.world.mode !== AVSettings.AV_MODES.DISABLED;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _configureRenderParts(options) {
    const parts = super._configureRenderParts(options);
    this.#users = Object.fromEntries(game.webrtc.client.getConnectedUsers().reduce((arr, id) => {
      const context = this._prepareUserContext(id);
      if ( !context.settings.blocked ) arr.push(context);
      return arr;
    }, []).sort(this.constructor._sortUsers).map(ctx => [ctx.user.id, ctx]));
    for ( const id in this.#users ) parts[id] = { template: "templates/apps/av/camera.hbs" };
    return parts;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onRender(context, options) {
    await super._onRender(context, options);
    const { RIGHT, BOTTOM } = AVSettings.DOCK_POSITIONS;
    const { dockPosition, hideDock } = game.webrtc.settings.client;
    const isHorizontal = this.isHorizontal;
    this.element.classList.toggle("minimized", hideDock);
    this.element.classList.toggle("horizontal", isHorizontal);
    this.element.classList.toggle("vertical", !isHorizontal);
    document.body.classList.toggle("flexcol", isHorizontal);
    this.element.classList.remove("top", "right", "bottom", "left");
    this.element.classList.add(dockPosition);
    this.element.hidden = this.hidden;

    const iface = document.getElementById("interface");
    if ( (dockPosition === RIGHT) || (dockPosition === BOTTOM) ) iface.after(this.element);
    else iface.before(this.element);

    if ( !("parts" in options) ) return;
    for ( const partId of options.parts ) {
      if ( partId in this.constructor.PARTS ) continue;
      if ( !this.getUserCameraView(partId) ) {
        const ctx = this.#users[partId];
        if ( ctx.settings.popout ) await new CameraPopout({ user: game.users.get(partId) }).render({ force: true });
      }
      this.setUserIsSpeaking(partId, game.webrtc.settings.activity[partId]?.speaking || false);
      await foundry.applications.instances.get(`camera-view-${partId}`)?.render();
      const video = this.getUserVideoElement(partId);
      if ( video ) game.webrtc.client.setUserVideo(partId, video);
    }
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    switch ( partId ) {
      case "controls": await this._prepareControlsContext(context, options); break;
    }
    if ( game.users.has(partId) ) Object.assign(context, this.#users[partId]);
    return context;
  }

  /* -------------------------------------------- */

  /**
   * Prepare render context for controls.
   * @param {ApplicationRenderContext} context
   * @param {HandlebarsRenderOptions} options
   * @returns {Promise<void>}
   * @protected
   */
  async _prepareControlsContext(context, options) {
    context.user = this.#users[game.userId];
  }

  /* -------------------------------------------- */

  /**
   * Prepare render context for the given user.
   * @param {string} id  The user's ID.
   * @returns {CameraViewUserContext|void}
   * @internal
   */
  _prepareUserContext(id) {
    const user = game.users.get(id);
    const clientSettings = game.webrtc.settings.client;
    const userSettings = game.webrtc.settings.getUser(id);
    if ( !user?.active ) return;
    const charname = user.character?.name.split(" ").shift() || "";
    const cbv = game.webrtc.canUserBroadcastVideo(id);
    const csv = game.webrtc.canUserShareVideo(id);
    const cba = game.webrtc.canUserBroadcastAudio(id);
    const csa = game.webrtc.canUserShareAudio(id);
    const minimized = clientSettings.hideDock;
    const { BOTH, OFF, CHAR_ONLY, PLAYER_ONLY } = AVSettings.NAMEPLATE_MODES;
    const nameplates = clientSettings.nameplates ?? BOTH;
    return {
      user,
      local: user.isSelf,
      charname: user.isGM ? game.i18n.localize("USER.GM") : charname,
      css: [csa ? "" : "no-audio", csv ? "" : "no-video"].filterJoin(" "),
      settings: userSettings,
      hasAudio: csa,
      hasVideo: csv,
      hidden: this.hidden,
      nameplates: {
        hidden: nameplates === OFF,
        css: (nameplates === PLAYER_ONLY) || (nameplates === CHAR_ONLY) ? "noanimate" : "",
        playerName: (nameplates === BOTH) || (nameplates === PLAYER_ONLY),
        charname: (nameplates === BOTH) || (nameplates === CHAR_ONLY)
      },
      video: {
        volume: userSettings.volume,
        muted: user.isSelf || clientSettings.mutaAll,
        show: csv && (user.isSelf || !clientSettings.disableVideo) && (!minimized || userSettings.popout)
      },
      volume: {
        field: new NumberField({ min: 0, max: 1, step: .05 }),
        value: foundry.audio.AudioHelper.volumeToInput(userSettings.volume),
        aria: { label: "WEBRTC.Volume" },
        show: !user.isSelf && cba
      },
      controls: {
        dock: {
          icon: `fa-caret-${this.DOCK_ICONS[clientSettings.dockPosition][Number(!!clientSettings.hideDock)]}`,
          label: `WEBRTC.Tooltip${clientSettings.hideDock ? "ExpandDock" : "MinimizeDock"}`,
          display: user.isSelf
        },
        video: {
          icon: csv ? "fa-camera-web" : "fa-camera-web-slash",
          label: `WEBRTC.Tooltip${csv ? "DisableMyVideo" : "EnableMyVideo"}`,
          display: user.isSelf && !minimized
        },
        audio: {
          icon: csa ? "fa-microphone" : "fa-microphone-slash",
          label: `WEBRTC.Tooltip${csa ? "DisableMyAudio" : "EnableMyAudio"}`,
          display: user.isSelf
        },
        deafen: {
          icon: clientSettings.muteAll ? "fa-volume-mute" : "fa-volume-up",
          label: `WEBRTC.Tooltip${clientSettings.muteAll ? "UnmutePeers" : "MutePeers"}`,
          display: user.isSelf
        },
        blind: {
          icon: clientSettings.disableVideo ? "fa-video-slash" : "fa-video",
          label: `WEBRTC.Tooltip${clientSettings.disableVideo ? "EnableVideo" : "DisableAllVideo"}`,
          display: user.isSelf && !minimized
        },
        blockVideo: {
          icon: cbv ? "fa-video" : "fa-video-slash",
          label: `WEBRTC.Tooltip${cbv ? "BlockUserVideo" : "AllowUserVideo"}`,
          display: game.user.isGM && !user.isSelf
        },
        blockAudio: {
          icon: cba ? "fa-microphone" : "fa-microphone-slash",
          label: `WEBRTC.Tooltip${cba ? "BlockUserAudio" : "AllowUserAudio"}`,
          display: game.user.isGM && !user.isSelf
        },
        hide: {
          icon: userSettings.blocked ? "fa-eye" : "fa-eye-slash",
          label: `WEBRTC.Tooltip${userSettings.blocked ? "ShowUser" : "HideUser"}`,
          display: !user.isSelf
        },
        popout: {
          icon: userSettings.popout ? "fa-external-link-square-alt fa-rotate-180" : "fa-external-link-alt",
          label: `WEBRTC.Tooltip${userSettings.popout ? "Dock" : "Popout"}`,
          display: true
        }
      }
    };
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _replaceHTML(result, content, options) {
    super._replaceHTML(result, content, options);
    const container = (result.cameras ?? content).querySelector(".camera-container");
    const docked = new Set();
    for ( const [id, ctx] of Object.entries(this.#users) ) {
      if ( ctx.settings.popout ) continue;
      container.append(this.parts[id]);
      docked.add(id);
    }
    for ( const id of Object.keys(this.parts) ) {
      if ( !docked.has(id) && !(id in this.constructor.PARTS) ) {
        this.parts[id].remove();
        delete this.parts[id];
      }
    }
  }

  /* -------------------------------------------- */
  /*  Event Listeners & Handlers                  */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _attachFrameListeners() {
    super._attachFrameListeners();
    this.element.addEventListener("change", this._onVolumeChange.bind(this));
  }

  /* -------------------------------------------- */

  /**
   * Handle blocking a user's audio stream.
   * @param {PointerEvent} event  The triggering event.
   * @param {HTMLElement} target  The action target.
   * @internal
   */
  async _onBlockAudio(event, target) {
    if ( !game.user.isGM ) return;
    const user = this.#getUser(target);
    await user.update({ "permissions.BROADCAST_AUDIO": !game.webrtc.settings.getUser(user.id).canBroadcastAudio });
    return this.render({ parts: [user.id] });
  }

  /* -------------------------------------------- */

  /**
   * Handle blocking a user's video stream.
   * @param {PointerEvent} event  The triggering event.
   * @param {HTMLElement} target  The action target.
   * @internal
   */
  async _onBlockVideo(event, target) {
    if ( !game.user.isGM ) return;
    const user = this.#getUser(target);
    await user.update({ "permissions.BROADCAST_VIDEO": !game.webrtc.settings.getUser(user.id).canBroadcastVideo });
    return this.render({ parts: [user.id] });
  }

  /* -------------------------------------------- */

  /**
   * Handle spawning the AV configuration dialog.
   * @param {PointerEvent} event  The triggering event.
   * @param {HTMLElement} target  The action target.
   * @internal
   */
  _onConfigure(event, target) {
    return game.webrtc.config.render({ force: true });
  }

  /* -------------------------------------------- */

  /**
   * Handle disabling all incoming video streams.
   * @param {PointerEvent} event  The triggering event.
   * @param {HTMLElement} target  The action target.
   * @internal
   */
  async _onDisableVideo(event, target) {
    const user = this.#getUser(target);
    if ( !user.isSelf ) return;
    await game.webrtc.settings.set("client", "disableVideo", !game.webrtc.settings.client.disableVideo);
  }

  /* -------------------------------------------- */

  /**
   * Handle hiding a user from the AV UI entirely.
   * @param {PointerEvent} event  The triggering event.
   * @param {HTMLElement} target  The action target.
   * @internal
   */
  async _onHideUser(event, target) {
    const user = this.#getUser(target);
    if ( user.isSelf ) return;
    const blocked = game.webrtc.settings.getUser(user.id).blocked;
    await game.webrtc.settings.set("client", `users.${user.id}.blocked`, !blocked);
    return this.render();
  }

  /* -------------------------------------------- */

  /**
   * Handle disabling all incoming audio streams.
   * @param {PointerEvent} event  The triggering event.
   * @param {HTMLElement} target  The action target.
   * @internal
   */
  async _onMutePeers(event, target) {
    const user = this.#getUser(target);
    if ( !user.isSelf ) return;
    await game.webrtc.settings.set("client", "muteAll", !game.webrtc.settings.client.muteAll);
  }

  /* -------------------------------------------- */

  /**
   * Handle popping-out a user's camera dock.
   * @this {CameraViews}
   * @param {PointerEvent} event  The triggering event.
   * @param {HTMLElement} target  The action target.
   */
  static async #onToggleDocked(event, target) {
    const user = this.#getUser(target);
    await game.webrtc.settings.set("client", `users.${user.id}.popout`, true);
    await new CameraPopout({ user }).render({ force: true });
    await this.render();
    ui.hotbar._onResize();
    ui.chat._toggleNotifications();
  }

  /* -------------------------------------------- */

  /**
   * Handle the user toggling their own audio stream.
   * @param {PointerEvent} event  The triggering event.
   * @param {HTMLElement} target  The action target.
   * @internal
   */
  async _onToggleAudio(event, target) {
    const user = this.#getUser(target);
    if ( !user.isSelf ) return;
    const { muted, canBroadcastAudio } = game.webrtc.settings.getUser(user.id);
    if ( muted && !canBroadcastAudio ) {
      return ui.notifications.warn("WEBRTC.WarningCannotEnableAudio", { localize: true });
    }
    await game.webrtc.settings.set("client", `users.${user.id}.muted`, !muted);
    return this.render({ parts: ["controls", user.id] });
  }

  /* -------------------------------------------- */

  /**
   * Handle minimizing or maximizing the dock.
   * @this {CameraViews}
   * @param {PointerEvent} event  The triggering event.
   * @param {HTMLElement} target  The action target.
   */
  static async #onToggleDock(event, target) {
    await game.webrtc.settings.set("client", "hideDock", !game.webrtc.settings.client.hideDock);
    return this.render();
  }

  /* -------------------------------------------- */

  /**
   * Handle the user toggling their own video stream.
   * @param {PointerEvent} event  The triggering event.
   * @param {HTMLElement} target  The action target.
   * @internal
   */
  async _onToggleVideo(event, target) {
    const user = this.#getUser(target);
    if ( !user.isSelf ) return;
    const { hidden, canBroadcastVideo } = game.webrtc.settings.getUser(user.id);
    if ( !hidden && !canBroadcastVideo ) {
      return ui.notifications.warn("WEBRTC.WarningCannotEnableVideo", { localize: true });
    }
    await game.webrtc.settings.set("client", `users.${user.id}.hidden`, !hidden);
    return this.render({ parts: ["controls", user.id] });
  }

  /* -------------------------------------------- */

  /**
   * Handle changing another user's volume.
   * @param {Event} event  The triggering event.
   * @protected
   */
  _onVolumeChange(event) {
    if ( !event.target.closest(".webrtc-volume-slider") ) return;
    const { user } = event.target.closest("[data-user]").dataset;
    const value = event.target.closest("range-picker").value;
    const volume = foundry.audio.AudioHelper.inputToVolume(value);
    const video = this.getUserVideoElement(user);
    if ( video ) video.volume = volume;
    game.webrtc.settings.set("client", `users.${user}.volume`, volume);
  }

  /* -------------------------------------------- */
  /*  Helpers                                     */
  /* -------------------------------------------- */

  /**
   * Retrieve the User instance that a given control belongs to.
   * @param {HTMLElement} control  The control.
   * @returns {User}
   */
  #getUser(control) {
    const { user } = control.closest("[data-user]")?.dataset ?? {};
    return game.users.get(user);
  }

  /* -------------------------------------------- */

  /**
   * Sort users' cameras in the dock.
   * @param {CameraViewUserContext} a
   * @param {CameraViewUserContext} b
   * @returns {number}
   * @protected
   */
  static _sortUsers(a, b) {
    if ( a.user.isSelf ) return -1;             // Show local feed first.
    if ( b.user.isSelf ) return 1;
    if ( a.hasVideo && !b.hasVideo ) return -1; // Show remote users with a camera before those without.
    if ( b.hasVideo && !a.hasVideo ) return 1;
    return a.user.name.localeCompare(b.user.name, game.i18n.lang);
  }
}

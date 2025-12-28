import HandlebarsApplicationMixin from "../../api/handlebars-application.mjs";
import ApplicationV2 from "../../api/application.mjs";

/**
 * @import {ApplicationConfiguration, ApplicationPosition} from "../../_types.mjs"
 * @import {HandlebarsRenderOptions} from "../../api/handlebars-application.mjs"
 */

/**
 * @typedef _CameraPopoutConfiguration
 * @property {User} user
 */

/**
 * @typedef {ApplicationConfiguration & _CameraPopoutConfiguration} CameraPopoutConfiguration
 */

/**
 * An application for a single popped-out camera.
 * @extends {ApplicationV2<CameraPopoutConfiguration, HandlebarsRenderOptions>}
 * @mixes HandlebarsApplication
 */
export default class CameraPopout extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options={}) {
    super(options);
    this.#user = options.user;
  }

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "camera-view-{id}",
    classes: ["camera-view", "popout"],
    window: {
      resizable: true,
      minimizable: false
    },
    position: {
      height: "auto"
    },
    actions: {
      toggleDocked: CameraPopout.#onToggleDocked
    }
  };

  /** @override */
  static PARTS = {
    camera: {
      root: true,
      template: "templates/apps/av/camera.hbs",
      templates: ["templates/apps/av/controls.hbs"]
    }
  };

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * A debounced function to persist the position of the popout.
   * @type {Function}
   */
  #persistPosition = foundry.utils.debounce(this.#onPersistPosition.bind(this), 1000);

  /**
   * The user this camera view is for.
   * @returns {User}
   */
  get user() {
    return this.#user;
  }

  #user;

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _initializeApplicationOptions(options) {
    options = super._initializeApplicationOptions(options);
    options.uniqueId = options.user.id;
    const { top, left, width } = game.webrtc.settings.getUser(options.user.id);
    Object.assign(options.position, { top, left, width });
    return options;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    this.element.dataset.user = this.user.id;
    this.element.replaceChildren(...this.element.querySelector(".window-content").children, this.window.resize);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onRender(context, options) {
    await super._onRender(context, options);
    const Draggable = foundry.applications.ux.Draggable.implementation;
    new Draggable(this, this.element, this.element.querySelector(".video-container"));
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    Object.assign(context, ui.webrtc._prepareUserContext(this.user.id));
    return context;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _replaceHTML(result, content, options) {
    if ( !result.camera || options.isFirstRender ) return super._replaceHTML(result, content, options);
    const handle = this.element.querySelector(".window-resize-handle");
    this.element.replaceChildren(...result.camera.children, handle);
  }

  /* -------------------------------------------- */
  /*  Positioning                                 */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _prePosition(position) {
    super._prePosition(position);
    position.height = "auto"; // Remove explicit height to maintain aspect ratio.
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  setPosition(position) {
    position = super.setPosition(position);
    this.#persistPosition(position);
    return position;
  }

  /* -------------------------------------------- */
  /*  Event Listeners & Handlers                  */
  /* -------------------------------------------- */

  /** @override */
  _onClickAction(event, target) {
    const { action } = target.dataset;
    switch ( action ) {
      case "blockAudio": return ui.webrtc._onBlockAudio(event, target);
      case "blockVideo": return ui.webrtc._onBlockVideo(event, target);
      case "configure": return ui.webrtc._onConfigure(event, target);
      case "disableVideo": return ui.webrtc._onDisableVideo(event, target);
      case "hide": return ui.webrtc._onHideUser(event, target);
      case "mutePeers": return ui.webrtc._onMutePeers(event, target);
      case "toggleAudio": return ui.webrtc._onToggleAudio(event, target);
      case "toggleVideo": return ui.webrtc._onToggleVideo(event, target);
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle re-docking a popped-out camera view.
   * @this {CameraPopout}
   * @param {PointerEvent} event  The triggering event.
   * @param {HTMLElement} target  The action target.
   */
  static async #onToggleDocked(event, target) {
    const { user } = target.closest("[data-user]")?.dataset ?? {};
    if ( !game.users.get(user) ) return;
    await game.webrtc.settings.set("client", `users.${user}.popout`, false);
    await this.close();
    await ui.webrtc.render();
    ui.hotbar._onResize();
    ui.chat._toggleNotifications();
  }

  /* -------------------------------------------- */

  /**
   * Persist the popout's position.
   * @param {Partial<ApplicationPosition>} position  The position.
   */
  #onPersistPosition(position) {
    const current = game.webrtc.settings.client.users[this.user.id] ?? {};
    game.webrtc.settings.set("client", `users.${this.user.id}`, foundry.utils.mergeObject(current, position));
  }
}

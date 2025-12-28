import {ApplicationV2, HandlebarsApplicationMixin} from "../../api/_module.mjs";
import {expandObject, mergeObject} from "@common/utils/_module.mjs";
import SettingsConfig from "../config.mjs";
import AVSettings from "@client/av/settings.mjs";

/**
 * @import {ApplicationClickAction, ApplicationConfiguration, ApplicationFormSubmission} from "../../_types.mjs";
 * @import {AVMaster} from "@client/av/master.mjs";
 */

/**
 * @typedef AVConfigConfiguration
 * @property {AVMaster} [webrtc] The AVMaster instance being configured
 */

/**
 * Audio/Video Conferencing Configuration Sheet
 * @extends ApplicationV2
 * @mixes HandlebarsApplication
 */
export default class AVConfig extends HandlebarsApplicationMixin(ApplicationV2) {

  /**
   * @param {ApplicationConfiguration & AVConfigConfiguration} options
   */
  constructor(options) {
    super(options);

    /**
     * The AVMaster instance being configured
     * @type {AVMaster}
     */
    this.webrtc = this.options.webrtc ?? game.webrtc;
  }

  /* -------------------------------------------- */

  /** @override */
  static DEFAULT_OPTIONS = {
    tag: "form",
    id: "av-config",
    window: {
      title: "WEBRTC.Title",
      contentClasses: ["standard-form"],
      icon: "fa-solid fa-headset"
    },
    position: {
      width: 480
    },
    form: {
      closeOnSubmit: true,
      handler: AVConfig.#onSubmit
    }
  };

  /** @override */
  static PARTS = {
    tabs: {template: "templates/generic/tab-navigation.hbs"},
    general: {template: "templates/settings/menus/av-config/general.hbs"},
    devices: {template: "templates/settings/menus/av-config/devices.hbs"},
    server: {template: "templates/settings/menus/av-config/server.hbs"},
    footer: {template: "templates/generic/form-footer.hbs"}
  };

  /** @override */
  static TABS = {
    main: {
      tabs: [
        {id: "general", icon: "fa-solid fa-gear"},
        {id: "devices", icon: "fa-solid fa-microphone"},
        {id: "server", icon: "fa-solid fa-server"}
      ],
      initial: "general",
      labelPrefix: "WEBRTC.TABS"
    }
  };

  /* -------------------------------------------- */

  /** @inheritDoc */
  _configureRenderParts(options) {
    const parts = super._configureRenderParts(options);
    if ( !game.user.isGM ) delete parts.server;
    return parts;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    if ( !game.user.isGM ) delete context.tabs.server;

    // If the currently chosen device is unavailable, display a separate option for 'unavailable device (use default)'
    const isSSL = window.location.protocol === "https:";
    return Object.assign(context, {
      rootId: this.id,
      settings: this.webrtc.settings,
      fields: {world: AVSettings.schemaFields.world.fields, client: AVSettings.schemaFields.client.fields},
      isSSL
    });
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _preparePartContext(partId, context, options) {
    const partContext = await super._preparePartContext(partId, context, options);
    if ( partId in context.tabs ) partContext.tab = partContext.tabs[partId];
    switch ( partId ) {
      case "general":
        partContext.canSelectMode = game.user.isGM && context.isSSL;
        partContext.modes = {
          [AVSettings.AV_MODES.DISABLED]: game.i18n.localize("WEBRTC.ModeDisabled"),
          [AVSettings.AV_MODES.AUDIO]: game.i18n.localize("WEBRTC.ModeAudioOnly"),
          [AVSettings.AV_MODES.VIDEO]: game.i18n.localize("WEBRTC.ModeVideoOnly"),
          [AVSettings.AV_MODES.AUDIO_VIDEO]: game.i18n.localize("WEBRTC.ModeAudioVideo")
        };
        partContext.voiceModes = Object.values(AVSettings.VOICE_MODES).reduce((modes, mode) => {
          modes[mode] = game.i18n.localize(`WEBRTC.VoiceMode${mode.titleCase()}`);
          return modes;
        }, {});
        partContext.dockPositions = Object.values(AVSettings.DOCK_POSITIONS).reduce((positions, position) => {
          positions[position] = game.i18n.localize(`WEBRTC.DockPosition${position.titleCase()}`);
          return positions;
        }, {});
        partContext.nameplates = {
          [AVSettings.NAMEPLATE_MODES.OFF]: game.i18n.localize("WEBRTC.NameplatesOff"),
          [AVSettings.NAMEPLATE_MODES.PLAYER_ONLY]: game.i18n.localize("WEBRTC.NameplatesPlayer"),
          [AVSettings.NAMEPLATE_MODES.CHAR_ONLY]: game.i18n.localize("WEBRTC.NameplatesCharacter"),
          [AVSettings.NAMEPLATE_MODES.BOTH]: game.i18n.localize("WEBRTC.NameplatesBoth")
        };
        break;
      case "devices": {
        const videoSources = await this.webrtc.client.getVideoSources();
        const audioSources = await this.webrtc.client.getAudioSources();
        const audioSinks = await this.webrtc.client.getAudioSinks();
        const {videoSrc, audioSrc, audioSink} = this.webrtc.settings.client;
        const videoSrcUnavailable = this.#isSourceUnavailable(videoSources, videoSrc);
        const audioSrcUnavailable = this.#isSourceUnavailable(audioSources, audioSrc);
        const audioSinkUnavailable = this.#isSourceUnavailable(audioSinks, audioSink);
        partContext.videoDevices = this.#getDevices(videoSources, videoSrcUnavailable, "WEBRTC.DisableVideoSource");
        partContext.audioDevices = this.#getDevices(audioSources, audioSrcUnavailable, "WEBRTC.DisableAudioSource");
        partContext.audioSinks = this.#getDevices(audioSinks, audioSinkUnavailable);
        break;
      }
      case "server":
        partContext.turnTypes = {
          server: game.i18n.localize("WEBRTC.TURNServerProvisioned"),
          custom: game.i18n.localize("WEBRTC.CustomTURNServer")
        };
        break;
      case "footer": {
        const disabled = !context.isSSL;
        partContext.buttons = [{type: "submit", icon: "fa-solid fa-floppy-disk", label: "Save Changes", disabled}];
        break;
      }
    }
    return partContext;
  }

  /* -------------------------------------------- */

  /**
   * Determine whether a given video or audio source, or audio sink has become
   * unavailable since the last time it was set.
   * @param {object} sources The available devices
   * @param {string} source  The selected device
   */
  #isSourceUnavailable(sources, source) {
    const specialValues = ["default", "disabled"];
    return source && !specialValues.includes(source) && !(source in sources);
  }

  /* -------------------------------------------- */

  /**
   * Get an array of available devices which can be chosen.
   * @param {Record<string, string>} devices
   * @param {string} unavailableDevice
   * @param {string} disabledLabel
   * @returns {FormSelectOption[]}
   */
  #getDevices(devices, unavailableDevice, disabledLabel) {
    const options = Object.entries(devices).map(([key, label]) => ({value: key, label}));
    const hasDefault = options.some(o => o.value === "default");
    if ( !hasDefault ) {
      options.unshift({value: "default", label: game.i18n.localize("WEBRTC.DefaultSource")});
    }
    if ( disabledLabel ) {
      options.unshift({value: "disabled", label: game.i18n.localize(disabledLabel)});
    }
    if ( unavailableDevice ) {
      options.push({value: unavailableDevice, label: game.i18n.localize("WEBRTC.UnavailableDevice")});
    }
    return options;
  }

  /* -------------------------------------------- */

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);

    // Activate or de-activate the custom server and turn configuration sections based on current settings
    this.element.querySelector('select[name="core.rtcWorldSettings.turn.type"]')?.addEventListener("change", event => {
      const fieldset = this.element.querySelector("fieldset[data-custom-turn-config]");
      fieldset.toggleAttribute("disabled", event.currentTarget.value !== "custom");
    });
  }

  /* -------------------------------------------- */

  /**
   * Update world and client settings.
   * @this {AVConfig}
   * @type {ApplicationFormSubmission}
   */
  static async #onSubmit(event, form, formData) {
    const settings = game.webrtc.settings;
    const submitData = expandObject(formData.object).core;

    // Update world settings
    const promises = [];
    if ( game.user.isGM ) {
      const worldUpdates = mergeObject(settings.world, submitData.rtcWorldSettings, {inplace: false});
      if ( settings.world.mode !== worldUpdates.mode ) SettingsConfig.reloadConfirm({world: true});
      promises.push(game.settings.set("core", "rtcWorldSettings", worldUpdates));
    }

    // Update client settings
    const clientUpdates = mergeObject(settings.client, submitData.rtcClientSettings, {inplace: false});
    promises.push(game.settings.set("core", "rtcClientSettings", clientUpdates));
    await Promise.all(promises);
  }
}

import Hooks from "../helpers/hooks.mjs";

/**
 * @typedef AVSettingsData
 * @property {boolean} [muted]     Whether this user has muted themselves.
 * @property {boolean} [hidden]    Whether this user has hidden their video.
 * @property {boolean} [speaking]  Whether the user is broadcasting audio.
 */

export default class AVSettings {

  constructor() {
    this.#initialize();
    this._set = foundry.utils.debounce((key, value) => game.settings.set("core", key, value), 100);
    this.changed = foundry.utils.debounce(this.#onSettingsChanged.bind(this), 100);
    this.activity[game.userId] = {};
  }

  /**
   * WebRTC Mode, Disabled, Audio only, Video only, Audio & Video
   * @enum {number}
   */
  static AV_MODES = {
    DISABLED: 0,
    AUDIO: 1,
    VIDEO: 2,
    AUDIO_VIDEO: 3
  };

  /**
   * Voice modes: Always-broadcasting, voice-level triggered, push-to-talk.
   * @enum {string}
   */
  static VOICE_MODES = {
    ALWAYS: "always",
    ACTIVITY: "activity",
    PTT: "ptt"
  };

  /**
   * Displayed nameplate options: Off entirely, animate between player and character name, player name only, character
   * name only.
   * @enum {number}
   */
  static NAMEPLATE_MODES = {
    OFF: 0,
    BOTH: 1,
    PLAYER_ONLY: 2,
    CHAR_ONLY: 3
  };

  /**
   * AV dock positions.
   * @enum {string}
   */
  static DOCK_POSITIONS = {
    TOP: "top",
    RIGHT: "right",
    BOTTOM: "bottom",
    LEFT: "left"
  };

  /**
   * Schemas for world and client settings
   * @type {{world: foundry.data.fields.SchemaField; client: foundry.data.fields.SchemaField}}
   */
  static get schemaFields() {
    const schema = AVSettings.#defineSchemas();
    Object.defineProperty(this, "schemaFields", { value: schema });
    return schema;
  }

  /**
   * Default client settings for each connected user.
   * @type {object}
   */
  static get DEFAULT_USER_SETTINGS() {
    return game.settings.settings.get("core.rtcClientSettings").type.fields.users.element.getInitialValue();
  }

  /* -------------------------------------------- */

  /**
   * Define world and client settings schemas.
   * @returns {{world: DataSchema; client: DataSchema}}
   */
  static #defineSchemas() {
    const fields = foundry.data.fields;
    return {
      world: new fields.SchemaField({
        mode: new fields.NumberField({
          required: true,
          nullable: false,
          choices: Object.values(AVSettings.AV_MODES),
          initial: AVSettings.AV_MODES.DISABLED
        }),
        turn: new fields.SchemaField({
          type: new fields.StringField({required: true, choices: ["server", "custom"], initial: "server"}),
          url: new fields.StringField({required: true}),
          username: new fields.StringField({required: true}),
          password: new fields.StringField({required: true})
        })
      }),
      client: new fields.SchemaField({
        videoSrc: new fields.StringField({required: true, initial: "default"}),
        audioSrc: new fields.StringField({required: true, initial: "default"}),
        audioSink: new fields.StringField({required: true, initial: "default"}),
        dockPosition: new fields.StringField({
          required: true,
          choices: Object.values(AVSettings.DOCK_POSITIONS),
          initial: AVSettings.DOCK_POSITIONS.LEFT
        }),
        hidePlayerList: new fields.BooleanField(),
        hideDock: new fields.BooleanField(),
        muteAll: new fields.BooleanField(),
        disableVideo: new fields.BooleanField(),
        borderColors: new fields.BooleanField(),
        dockWidth: new fields.NumberField({
          required: true,
          nullable: false,
          integer: true,
          positive: true,
          initial: 240
        }),
        nameplates: new fields.NumberField({
          required: true,
          nullable: false,
          choices: Object.values(AVSettings.NAMEPLATE_MODES),
          initial: AVSettings.NAMEPLATE_MODES.BOTH
        }),
        voice: new fields.SchemaField({
          mode: new fields.StringField({
            required: true,
            choices: Object.values(AVSettings.VOICE_MODES),
            initial: AVSettings.VOICE_MODES.PTT
          }),
          pttName: new fields.StringField({required: true, initial: "`"}),
          pttDelay: new fields.NumberField({required: true, nullable: false, integer: true, min: 0, initial: 100}),
          activityThreshold: new fields.NumberField({required: true, nullable: false, integer: true, initial: -45})
        }),
        users: new fields.TypedObjectField(new fields.SchemaField({
          popout: new fields.BooleanField(),
          left: new fields.NumberField({required: true, nullable: false, integer: true, initial: 100}),
          top: new fields.NumberField({required: true, nullable: false, integer: true, initial: 100}),
          z: new fields.NumberField({required: true, nullable: false, integer: true, initial: 0}),
          width: new fields.NumberField({required: true, nullable: false, integer: true, positive: true, initial: 320}),
          volume: new fields.NumberField({required: true, nullable: false, min: 0, max: 1, initial: 1}),
          muted: new fields.BooleanField(),
          hidden: new fields.BooleanField(),
          blocked: new fields.BooleanField()
        }), {validateKey: foundry.data.validators.isValidId})
      })
    };
  }

  /* -------------------------------------------- */

  /**
   * Register world and client WebRTC settings.
   */
  static register() {
    game.settings.register("core", "rtcWorldSettings", {
      name: "WebRTC (Audio/Video Conferencing) World Settings",
      scope: "world",
      type: AVSettings.schemaFields.world,
      onChange: () => game.webrtc.settings.changed()
    });
    game.settings.register("core", "rtcClientSettings", {
      name: "WebRTC (Audio/Video Conferencing) Client Settings",
      scope: "client",
      type: AVSettings.schemaFields.client,
      onChange: () => game.webrtc.settings.changed()
    });
  }

  /* -------------------------------------------- */

  /**
   * A debounce callback for when either the world or client settings change.
   * @type {() => void}
   */
  changed;

  /**
   * Stores the transient AV activity data received from other users.
   * @type {Record<string, AVSettingsData>}
   */
  activity = {};

  /* -------------------------------------------- */

  #initialize() {
    this.client = game.settings.get("core", "rtcClientSettings");
    this.world = game.settings.get("core", "rtcWorldSettings");
    this._original = foundry.utils.deepClone({client: this.client, world: this.world});
    const {muted, hidden} = this.#getUserSettings(game.user);
    game.user.broadcastActivity({av: {muted, hidden}});

    // Localize the settings' field labels and hints
    for ( const [key, field] of Object.entries(AVSettings.schemaFields) ) {
      foundry.helpers.Localization.localizeSchema(
        field,
        [`WEBRTC.${key.titleCase()}Settings`],
        {prefixPath: `core.rtc${key.titleCase()}Settings.`}
      );
    }
  }

  /* -------------------------------------------- */

  get(scope, setting) {
    return foundry.utils.getProperty(this[scope], setting);
  }

  /* -------------------------------------------- */

  getUser(userId) {
    const user = game.users.get(userId);
    if ( !user ) return null;
    return this.#getUserSettings(user);
  }

  /* -------------------------------------------- */

  set(scope, setting, value) {
    foundry.utils.setProperty(this[scope], setting, value);
    this._set(`rtc${scope.titleCase()}Settings`, this[scope]);
  }

  /* -------------------------------------------- */

  /**
   * Return a mapping of AV settings for each game User.
   * @type {object}
   */
  get users() {
    const users = {};
    for ( const user of game.users ) {
      users[user.id] = this.#getUserSettings(user);
    }
    return users;
  }

  /* -------------------------------------------- */

  /**
   * A helper to determine if the dock is configured in a vertical position.
   * @type {boolean}
   */
  get verticalDock() {
    const positions = this.constructor.DOCK_POSITIONS;
    return [positions.LEFT, positions.RIGHT].includes(this.client.dockPosition ?? positions.LEFT);
  }

  /* -------------------------------------------- */

  /**
   * Prepare a standardized object of user settings data for a single User
   * @param {User} user
   */
  #getUserSettings(user) {
    const clientSettings = this.client.users[user.id] ?? {};
    const activity = this.activity[user.id] ?? {};
    const settings = foundry.utils.mergeObject(AVSettings.DEFAULT_USER_SETTINGS, clientSettings);
    settings.canBroadcastAudio = user.can("BROADCAST_AUDIO");
    settings.canBroadcastVideo = user.can("BROADCAST_VIDEO");

    if ( user.isSelf ) {
      settings.muted ||= !game.webrtc?.client.isAudioEnabled();
      settings.hidden ||= !game.webrtc?.client.isVideoEnabled();
    } else {
      // Either we have muted or hidden them, or they have muted or hidden themselves.
      settings.muted ||= !!activity.muted;
      settings.hidden ||= !!activity.hidden;
    }

    settings.speaking = activity.speaking;
    return settings;
  }

  /* -------------------------------------------- */

  /**
   * Handle setting changes to either rctClientSettings or rtcWorldSettings.
   */
  #onSettingsChanged() {
    const original = this._original;
    this.#initialize();
    const changed = foundry.utils.diffObject(original, this._original);
    game.webrtc.onSettingsChanged(changed);
    Hooks.callAll("rtcSettingsChanged", this, changed);
  }

  /* -------------------------------------------- */

  /**
   * Handle another connected user changing their AV settings.
   * @param {string} userId
   * @param {AVSettingsData} settings
   */
  handleUserActivity(userId, settings) {
    const current = this.activity[userId] || {};
    this.activity[userId] = foundry.utils.mergeObject(current, settings, {inplace: false});
    if ( !ui.webrtc ) return;
    const hiddenChanged = ("hidden" in settings) && (current.hidden !== settings.hidden);
    const mutedChanged = ("muted" in settings) && (current.muted !== settings.muted);
    if ( (hiddenChanged || mutedChanged) && ui.webrtc.getUserVideoElement(userId) ) ui.webrtc.render({parts: [userId]});
    if ( "speaking" in settings ) ui.webrtc.setUserIsSpeaking(userId, settings.speaking);
  }
}


import Hooks from "@client/helpers/hooks.mjs";
import DynamicRingData from "./ring-data.mjs";

/**
 * @import {RingColorBand} from "../_types.mjs"
 * @import {DynamicRingId} from "../_types.mjs"
 */

/**
 * Token Ring configuration Singleton Class.
 *
 * @example Add a new custom ring configuration. Allow only ring pulse, ring gradient and background wave effects.
 * const customConfig = new foundry.canvas.placeables.tokens.DynamicRingData({
 *   id: "myCustomRingId",
 *   label: "Custom Ring",
 *   effects: {
 *     RING_PULSE: "TOKEN.RING.EFFECTS.RING_PULSE",
 *     RING_GRADIENT: "TOKEN.RING.EFFECTS.RING_GRADIENT",
 *     BACKGROUND_WAVE: "TOKEN.RING.EFFECTS.BACKGROUND_WAVE"
 *   },
 *   spritesheet: "canvas/tokens/myCustomRings.json",
 *   framework: {
 *     shaderClass: MyCustomTokenRingSamplerShader,
 *     ringClass: TokenRing
 *   }
 * });
 * CONFIG.Token.ring.addConfig(customConfig.id, customConfig);
 *
 * @example Get a specific ring configuration
 * const config = CONFIG.Token.ring.getConfig("myCustomRingId");
 * console.log(config.spritesheet); // Output: canvas/tokens/myCustomRings.json
 *
 * @example Use a specific ring configuration
 * const success = CONFIG.Token.ring.useConfig("myCustomRingId");
 * console.log(success); // Output: true
 *
 * @example Get the labels of all configurations
 * const configLabels = CONFIG.Token.ring.configLabels;
 * console.log(configLabels);
 * // Output:
 * // {
 * //   "coreSteel": "Foundry VTT Steel Ring",
 * //   "coreBronze": "Foundry VTT Bronze Ring",
 * //   "myCustomRingId" : "My Super Power Ring"
 * // }
 *
 * @example Get the IDs of all configurations
 * const configIDs = CONFIG.Token.ring.configIDs;
 * console.log(configIDs); // Output: ["coreSteel", "coreBronze", "myCustomRingId"]
 *
 * @example Create a hook to add a custom token ring configuration. This ring configuration will appear in the settings.
 * Hooks.on("initializeDynamicTokenRingConfig", ringConfig => {
 *   const mySuperPowerRings = new foundry.canvas.placeables.tokens.DynamicRingData({
 *     id: "myCustomRingId",
 *     label: "My Super Power Rings",
 *     effects: {
 *       RING_PULSE: "TOKEN.RING.EFFECTS.RING_PULSE",
 *       RING_GRADIENT: "TOKEN.RING.EFFECTS.RING_GRADIENT",
 *       BACKGROUND_WAVE: "TOKEN.RING.EFFECTS.BACKGROUND_WAVE"
 *     },
 *     spritesheet: "canvas/tokens/mySuperPowerRings.json"
 *   });
 *   ringConfig.addConfig("mySuperPowerRings", mySuperPowerRings);
 * });
 *
 * @example Activate color bands debugging visuals to ease configuration
 * CONFIG.Token.ring.debugColorBands = true;
 */
export default class TokenRingConfig {
  constructor() {
    if ( TokenRingConfig.#instance ) {
      throw new Error("An instance of TokenRingConfig has already been created. "
        + "Use `CONFIG.Token.ring` to access it.");
    }
    TokenRingConfig.#instance = this;
  }

  /**
   * The token ring config instance.
   * @type {TokenRingConfig}
   */
  static #instance;

  /**
   * To know if the ring config is initialized.
   * @type {boolean}
   */
  static #initialized = false;

  /**
   * To know if a Token Ring registration is possible.
   * @type {boolean}
   */
  static #closedRegistration = true;

  /**
   * Core token rings used in Foundry VTT.
   * Each key is a string identifier for a ring, and the value is an object containing the ring's data.
   * This object is frozen to prevent any modifications.
   * @type {Readonly<Record<DynamicRingId, RingData>>}
   */
  static CORE_TOKEN_RINGS = Object.freeze({
    coreSteel: {
      id: "coreSteel",
      label: "TOKEN.RING.SETTINGS.coreSteel",
      spritesheet: "canvas/tokens/rings-steel.json"
    },
    coreBronze: {
      id: "coreBronze",
      label: "TOKEN.RING.SETTINGS.coreBronze",
      spritesheet: "canvas/tokens/rings-bronze.json"
    }
  });

  /**
   * Core token rings fit modes used in Foundry VTT.
   * @type {Readonly<object>}
   */
  static CORE_TOKEN_RINGS_FIT_MODES = Object.freeze({
    subject: {
      id: "subject",
      label: "TOKEN.RING.SETTINGS.FIT_MODES.subject"
    },
    grid: {
      id: "grid",
      label: "TOKEN.RING.SETTINGS.FIT_MODES.grid"
    }
  });

  /* -------------------------------------------- */

  /**
   * Register the token ring config and initialize it
   */
  static initialize() {
    // If token config is initialized
    if ( this.#initialized ) {
      throw new Error("The token configuration class can be initialized only once!");
    }

    // Open the registration window for the token rings
    this.#closedRegistration = false;

    // Add default rings
    for ( const id in this.CORE_TOKEN_RINGS ) {
      const config = new DynamicRingData(this.CORE_TOKEN_RINGS[id]);
      CONFIG.Token.ring.addConfig(config.id, config);
    }

    // Call an explicit hook for token ring configuration
    Hooks.callAll("initializeDynamicTokenRingConfig", CONFIG.Token.ring);

    // Initialize token rings configuration
    if ( !CONFIG.Token.ring.useConfig(game.settings.get("core", "dynamicTokenRing")) ) {
      CONFIG.Token.ring.useConfig(this.CORE_TOKEN_RINGS.coreSteel.id);
    }

    // Close the registration window for the token rings
    this.#closedRegistration = true;
    this.#initialized = true;
  }

  /* -------------------------------------------- */

  /**
   * Register game settings used by the Token Ring
   */
  static registerSettings() {
    game.settings.register("core", "dynamicTokenRing", {
      name: "TOKEN.RING.SETTINGS.label",
      hint: "TOKEN.RING.SETTINGS.hint",
      scope: "world",
      config: true,
      type: new foundry.data.fields.StringField({required: true, blank: false,
        initial: this.CORE_TOKEN_RINGS.coreSteel.id,
        choices: () => CONFIG.Token.ring.configLabels
      }),
      requiresReload: true
    });

    game.settings.register("core", "dynamicTokenRingFitMode", {
      name: "TOKEN.RING.SETTINGS.FIT_MODES.label",
      hint: "TOKEN.RING.SETTINGS.FIT_MODES.hint",
      scope: "world",
      config: true,
      type: new foundry.data.fields.StringField({
        required: true,
        blank: false,
        initial: this.CORE_TOKEN_RINGS_FIT_MODES.subject.id,
        choices: Object.fromEntries(Object.entries(this.CORE_TOKEN_RINGS_FIT_MODES).map(([k, m]) => [k, m.label]))
      }),
      requiresReload: true
    });
  }

  /* -------------------------------------------- */

  /**
   * Ring configurations.
   * @type {Map<string, DynamicRingData>}
   */
  #configs = new Map();

  /**
   * The current ring configuration.
   * @type {DynamicRingData}
   */
  #currentConfig;

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * A mapping of token subject paths where modules or systems have configured subject images.
   * @type {Record<string, string>}
   */
  subjectPaths = {};

  /**
   * All color bands visual debug flag.
   * @type {boolean}
   */
  debugColorBands = false;

  /**
   * Get the current ring class.
   * @type {typeof TokenRing} The current ring class.
   */
  get ringClass() {
    return this.#currentConfig.framework.ringClass;
  }

  set ringClass(value) {
    this.#currentConfig.framework.ringClass = value;
  }

  /**
   * Get the current effects.
   * @type {Record<string, string>} The current effects.
   */
  get effects() {
    return this.#currentConfig.effects;
  }

  /**
   * Get the current spritesheet.
   * @type {string} The current spritesheet path.
   */
  get spritesheet() {
    return this.#currentConfig.spritesheet;
  }

  /**
   * Get the current shader class.
   * @type {typeof PrimaryBaseSamplerShader} The current shader class.
   */
  get shaderClass() {
    return this.#currentConfig.framework.shaderClass;
  }

  set shaderClass(value) {
    this.#currentConfig.framework.shaderClass = value;
  }

  /**
   * Get the current localized label.
   * @returns {string}
   */
  get label() {
    return this.#currentConfig.label;
  }

  /**
   * Get the current id.
   * @returns {string}
   */
  get id() {
    return this.#currentConfig.id;
  }

  /* -------------------------------------------- */
  /*  Management                                  */
  /* -------------------------------------------- */

  /**
   * Is a custom fit mode active?
   * @returns {boolean}
   */
  get isGridFitMode() {
    return game.settings.get("core", "dynamicTokenRingFitMode")
      === this.constructor.CORE_TOKEN_RINGS_FIT_MODES.grid.id;
  }

  /* -------------------------------------------- */

  /**
   * Add a new ring configuration.
   * @param {string} id         The id of the ring configuration.
   * @param {RingConfig} config The configuration object for the ring.
   */
  addConfig(id, config) {
    if ( TokenRingConfig.#closedRegistration ) {
      throw new Error("Dynamic Rings registration window is closed. You must register a dynamic token ring configuration during"
        + " the `initializeDynamicTokenRingConfig` hook.");
    }
    this.#configs.set(id, config);
  }

  /* -------------------------------------------- */

  /**
   * Get a ring configuration.
   * @param {string} id     The id of the ring configuration.
   * @returns {RingConfig}  The ring configuration object.
   */
  getConfig(id) {
    return this.#configs.get(id);
  }

  /* -------------------------------------------- */

  /**
   * Use a ring configuration.
   * @param {string} id  The id of the ring configuration to use.
   * @returns {boolean} True if the configuration was successfully set, false otherwise.
   */
  useConfig(id) {
    if ( this.#configs.has(id) ) {
      this.#currentConfig = this.#configs.get(id);
      return true;
    }
    return false;
  }

  /* -------------------------------------------- */

  /**
   * Get the IDs of all configurations.
   * @returns {string[]} The names of all configurations.
   */
  get configIDs() {
    return Array.from(this.#configs.keys());
  }

  /* -------------------------------------------- */

  /**
   * Get the labels of all configurations.
   * @returns {Record<string, string>} An object with configuration names as keys and localized labels as values.
   */
  get configLabels() {
    const labels = {};
    for ( const [name, config] of this.#configs.entries() ) {
      labels[name] = config.label;
    }
    return labels;
  }

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  get configNames() {
    const msg = "TokenRingConfig#configNames is deprecated and replaced by TokenRingConfig#configIDs";
    foundry.utils.logCompatibilityWarning(msg, {since: 12, until: 14});
    return this.configIDs;
  }
}

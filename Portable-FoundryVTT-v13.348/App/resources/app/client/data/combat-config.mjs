import TurnMarkerData from "../canvas/placeables/tokens/turn-marker-data.mjs";
import * as fields from "../../common/data/fields.mjs";
import Hooks from "@client/helpers/hooks.mjs";

/**
 * @import {TurnMarkerAnimationData} from "../canvas/placeables/tokens/turn-marker-data.mjs"
 * @import {CombatConfigurationData} from "../_types.mjs"
 */

/**
 * A configuration class managing the Combat Turn Markers.
 */
export default class CombatConfiguration {
  constructor() {
    if ( CombatConfiguration.#instance ) {
      throw new Error("An instance of CombatConfiguration has already been created. "
        + "Use `CONFIG.Combat.settings` to access it.");
    }
    CombatConfiguration.#instance = this;
  }

  /**
   * The token ring config instance.
   * @type {CombatConfiguration}
   */
  static #instance;

  /**
   * To know if the ring config is initialized.
   * @type {boolean}
   */
  static #initialized = false;

  /**
   * Combat turn marker animation configurations
   * @type {Record<string, TurnMarkerAnimationData>}
   */
  static #DEFAULT_TURN_MARKER_ANIMATIONS = {
    spin: {
      id: "spin",
      label: "COMBAT.TURN_MARKERS.ANIMATIONS.SPIN",
      config: {spin: -4, pulse: {speed: 0, min: 1, max: 1}}
    },
    spinPulse: {
      id: "spinPulse",
      label: "COMBAT.TURN_MARKERS.ANIMATIONS.SPIN_PULSE",
      config: {spin: -4, pulse: {speed: 30, min: 0.9, max: 1.1}}
    },
    pulse: {
      id: "pulse",
      label: "COMBAT.TURN_MARKERS.ANIMATIONS.PULSE",
      config: {spin: 0, pulse: {speed: 30, min: 0.9, max: 1.1}}
    }
  };

  /**
   * The configuration setting used to record Combat preferences
   * @type {string}
   */
  static CONFIG_SETTING = "combatTrackerConfig";

  /**
   * The data model schema used to structure and validate the stored setting.
   * @type {SchemaField}
   */
  static get schema() {
    return this.#schema;
  }

  static #schema;

  /* -------------------------------------------- */

  /**
   * Register the token ring config and initialize it
   */
  static initialize() {
    // If combat tracker settings are initialized
    if ( this.#initialized ) {
      throw new Error("The combat tracker settings class can be initialized only once!");
    }
    foundry.helpers.Localization.localizeDataModel({schema: this.#schema}, {prefixes: ["COMBAT.CONFIG"]});

    // Add default turn markers animations
    for ( const id in this.#DEFAULT_TURN_MARKER_ANIMATIONS ) {
      const config = new TurnMarkerData(this.#DEFAULT_TURN_MARKER_ANIMATIONS[id]);
      CONFIG.Combat.settings.addTurnMarkerAnimation(config.id, config);
    }

    // Call an explicit hook for combat tracker settings configuration
    Hooks.callAll("initializeCombatConfiguration", CONFIG.Combat.settings);

    // Initialize combat tracker settings configuration
    CONFIG.Combat.settings.useTurnMarkerAnimation(this.#instance.turnMarker.animation);
    this.#initialized = true;
  }

  /* -------------------------------------------- */

  /**
   * Register game settings used by the Combat Tracker
   */
  static registerSettings() {
    this.#schema = new fields.SchemaField({
      resource: new fields.StringField({required: true, blank: true, initial: ""}),
      skipDefeated: new fields.BooleanField({required: true, initial: false}),
      turnMarker: new fields.SchemaField({
        enabled: new fields.BooleanField({required: true, initial: true}),
        animation: new fields.StringField({initial: "spin"}),
        src: new fields.FilePathField({categories: ["IMAGE", "VIDEO"], blank: true, initial: ""}),
        disposition: new fields.BooleanField()
      })
    });
    game.settings.register("core", this.CONFIG_SETTING, {
      name: "Combat Tracker Configuration",
      scope: "world",
      config: false,
      type: this.#schema,
      onChange: () => this.#onChangeCombatConfiguration()
    });
  }

  /* -------------------------------------------- */

  /**
   * Called when turn markers settings are changed.
   */
  static #onChangeCombatConfiguration() {
    if ( !this.#initialized ) return;
    CONFIG.Combat.settings.useTurnMarkerAnimation(this.#instance.turnMarker.animation);
    if ( game.combat ) {
      game.combat.reset();
      game.combat._updateTurnMarkers();
      game.combats.render();
    }
  }

  /* -------------------------------------------- */

  /**
   * Turn marker animations.
   * @type {Map<string, TurnMarkerAnimationData>}
   */
  #turnMarkerAnimations = new Map();

  /**
   * The current turn marker animation.
   * @type {TurnMarkerAnimationData}
   */
  #currentAnimation;

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * Get turn marker settings.
   * @type {Object}
   */
  get turnMarker() {
    return game.settings.get("core", this.constructor.CONFIG_SETTING).turnMarker;
  }

  /**
   * Get tracked resource setting.
   * @type {string}
   */
  get resource() {
    return game.settings.get("core", this.constructor.CONFIG_SETTING).resource;
  }

  /**
   * Get skip defeated setting.
   * @type {boolean}
   */
  get skipDefeated() {
    return game.settings.get("core", this.constructor.CONFIG_SETTING).skipDefeated;
  }

  /**
   * Get current turn marker animation.
   * @type {TurnMarkerAnimationData}
   */
  get currentTurnMarkerAnimation() {
    return this.#currentAnimation;
  }

  /* -------------------------------------------- */
  /*  Management                                  */
  /* -------------------------------------------- */

  /**
   * Add a new turn marker animation.
   * @param {string} id                       The id of the turn marker animation.
   * @param {TurnMarkerAnimationData} config  The configuration object for the turn marker animation.
   */
  addTurnMarkerAnimation(id, config) {
    this.#turnMarkerAnimations.set(id, config);
  }

  /* -------------------------------------------- */

  /**
   * Get a turn marker animation by id.
   * @param {string} id                  The id of the turn marker configuration.
   * @returns {TurnMarkerAnimationData}  The turn marker configuration object.
   */
  getTurnMarkerAnimation(id) {
    return this.#turnMarkerAnimations.get(id);
  }

  /* -------------------------------------------- */

  /**
   * Use a turn marker animation.
   * @param {string} animationId  The id of the turn marker animation to use.
   * @returns {boolean}           True if the animation was successfully set, false otherwise.
   */
  useTurnMarkerAnimation(animationId) {
    if ( this.#turnMarkerAnimations.has(animationId) ) {
      this.#currentAnimation = this.#turnMarkerAnimations.get(animationId);
      return true;
    }
    this.#currentAnimation = null;
    return false;
  }

  /* -------------------------------------------- */

  /**
   * Get all animations and labels as an array of choices suitable for a select element.
   * @type {{value: string, label: string}[]} An array of objects containing an id and a localized label.
   */
  get turnMarkerAnimations() {
    return Array.from(this.#turnMarkerAnimations, ([value, {label}]) => ({value, label: game.i18n.localize(label)}));
  }
}

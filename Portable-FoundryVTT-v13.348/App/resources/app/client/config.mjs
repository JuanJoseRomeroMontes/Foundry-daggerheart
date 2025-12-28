/**
 * Runtime configuration settings for Foundry VTT which exposes a large number of variables which determine how
 * aspects of the software behaves.
 *
 * Unlike the CONST analog which is frozen and immutable, the CONFIG object may be updated during the course of a
 * session or modified by system and module developers to adjust how the application behaves.
 * @module CONFIG
 */

import {CONST, applications, audio, av, canvas, data, dice, documents, helpers, utils} from "./_module.mjs";

/**
 * @import {DataModel, TypeDataModel} from "@common/abstract/_module.mjs";
 * @import {CanvasAnimationAttribute} from "./canvas/animation/_types.mjs";
 * @import ParticleEffect from "./canvas/containers/elements/particles/particle-effect.mjs";
 * @import RollResolver from "./applications/dice/roll-resolver.mjs";
 * @import {TokenMovementActionConfig} from "./_types.mjs";
 * @import {TokenMovementCostAggregator} from "./documents/_types.mjs";
 */

/**
 * Configure debugging flags to display additional information
 */
export const debug = {
  applications: false,
  audio: false,
  combat: false,
  dice: false,
  documents: false,
  fog: {
    extractor: false,
    manager: false
  },
  hooks: false,
  av: false,
  avclient: false,
  i18n: false,
  mouseInteraction: false,
  time: false,
  keybindings: false,
  polygons: false,
  gamepad: false,
  canvas: {
    primary: {
      bounds: false
    }
  },
  queries: false,
  rollParsing: false,
  loader: {
    load: false,
    cache: false,
    eviction: false,
    memory: false
  }
};

/**
 * Configure the verbosity of compatibility warnings generated throughout the software.
 * The compatibility mode defines the logging level of any displayed warnings.
 * The includePatterns and excludePatterns arrays provide a set of regular expressions which can either only
 * include or specifically exclude certain file paths or warning messages.
 * Exclusion rules take precedence over inclusion rules.
 *
 * @see {@link CONST.COMPATIBILITY_MODES}
 * @type {{mode: number, includePatterns: RegExp[], excludePatterns: RegExp[]}}
 *
 * @example Include Specific Errors
 * ```js
 * const includeRgx = new RegExp("/systems/dnd5e/module/documents/active-effect.mjs");
 * CONFIG.compatibility.includePatterns.push(includeRgx);
 * ```
 *
 * @example Exclude Specific Errors
 * ```js
 * const excludeRgx = new RegExp("/systems/dnd5e/");
 * CONFIG.compatibility.excludePatterns.push(excludeRgx);
 * ```
 *
 * @example Both Include and Exclude
 * ```js
 * const includeRgx = new RegExp("/systems/dnd5e/module/actor/");
 * const excludeRgx = new RegExp("/systems/dnd5e/module/actor/sheets/base.js");
 * CONFIG.compatibility.includePatterns.push(includeRgx);
 * CONFIG.compatibility.excludePatterns.push(excludeRgx);
 * ```
 *
 * @example Targeting more than filenames
 * ```js
 * const includeRgx = new RegExp("applyActiveEffects");
 * CONFIG.compatibility.includePatterns.push(includeRgx);
 * ```
 */
export const compatibility = {
  mode: CONST.COMPATIBILITY_MODES.WARNING,
  includePatterns: [],
  excludePatterns: []
};

export const compendium = {
  /**
   * Configure a table of compendium UUID redirects. Must be configured before the game *ready* hook is fired.
   * @type {Record<string, string>}
   *
   * @example Re-map individual UUIDs
   * ```js
   * const newUuid = "Compendium.system.villains.Actor.DKYLeIliXXzlAZ2G";
   * CONFIG.compendium.uuidRedirects["Compendium.system.heroes.Actor.Tf0JDPzHOrIxz6BH"] = newUuid;
   * ```
   *
   * @example Redirect UUIDs from one compendium to another.
   * ```js
   * CONFIG.compendium.uuidRedirects["Compendium.system.heroes"] = "Compendium.system.villains";
   * ```
   */
  uuidRedirects: {}
};

/**
 * Configure the DatabaseBackend used to perform Document operations
 */
// eslint-disable-next-line prefer-const
export let DatabaseBackend = new data.ClientDatabaseBackend();


/**
 * Configuration for the Actor document
 */
export const Actor = {
  documentClass: documents.Actor,
  collection: documents.collections.Actors,
  /** @type {string[]} */
  compendiumIndexFields: [],
  compendiumBanner: "ui/banners/actor-banner.webp",
  sidebarIcon: "fa-solid fa-user",
  /** @type {Record<string, typeof TypeDataModel>} */
  dataModels: {},
  /** @type {Record<string, string>} */
  typeLabels: {},
  /** @type {Record<string, string>} */
  typeIcons: {},
  /** @type {Record<string, string>} */
  trackableAttributes: {}
};

/**
 * Configuration for the Adventure document.
 */
export const Adventure = {
  documentClass: documents.Adventure,
  exporterClass: applications.sheets.AdventureExporter,
  /** @type {string[]} */
  compendiumIndexFields: [],
  compendiumBanner: "ui/banners/adventure-banner.webp",
  sidebarIcon: "fa-solid fa-treasure-chest"
};

/**
 * Configuration for the Cards primary Document type
 */
export const Cards = {
  collection: documents.collections.CardStacks,
  /** @type {string[]} */
  compendiumIndexFields: [],
  compendiumBanner: "ui/banners/cards-banner.webp",
  documentClass: documents.Cards,
  sidebarIcon: "fa-solid fa-cards",
  /** @type {Record<string, typeof TypeDataModel>} */
  dataModels: {},
  presets: {
    pokerDark: {
      type: "deck",
      label: "CARDS.DeckPresetPokerDark",
      src: "cards/poker-deck-dark.json"
    },
    pokerLight: {
      type: "deck",
      label: "CARDS.DeckPresetPokerLight",
      src: "cards/poker-deck-light.json"
    }
  },
  /** @type {Record<string, string>} */
  typeLabels: {},
  /** @type {Record<string, string>} */
  typeIcons: {
    deck: "fa-solid fa-cards",
    hand: "fa-duotone fa-cards",
    pile: "fa-duotone fa-layer-group"
  }
};

/**
 * Configuration for the ChatMessage document
 */
export const ChatMessage = {
  documentClass: documents.ChatMessage,
  popoutClass: applications.sidebar.apps.ChatPopout,
  collection: documents.collections.ChatMessages,
  template: "templates/sidebar/chat-message.hbs",
  sidebarIcon: "fa-solid fa-comments",
  /** @type {Record<string, typeof TypeDataModel>} */
  dataModels: {},
  /** @type {Record<string, string>} */
  typeLabels: {},
  /** @type {Record<string, string>} */
  typeIcons: {},
  batchSize: 100
};

/**
 * Configuration for the Combat document
 */
export const Combat = {
  documentClass: documents.Combat,
  collection: documents.collections.CombatEncounters,
  settings: new data.CombatConfiguration(),
  sidebarIcon: "fa-solid fa-swords",
  initiativeIcon: {
    icon: "../icons/svg/d20.svg",
    hover: "../icons/svg/d20-highlight.svg"
  },
  /** @type {Record<string, typeof TypeDataModel>} */
  dataModels: {},
  /** @type {Record<string, string>} */
  typeLabels: {},
  /** @type {Record<string, string>} */
  typeIcons: {},
  initiative: {
    formula: null,
    decimals: 2
  },
  fallbackTurnMarker: "icons/vtt-512.png",
  sounds: {
    epic: {
      label: "COMBAT.Sounds.Epic",
      startEncounter: ["sounds/combat/epic-start-3hit.ogg", "sounds/combat/epic-start-horn.ogg"],
      nextUp: ["sounds/combat/epic-next-horn.ogg"],
      yourTurn: ["sounds/combat/epic-turn-1hit.ogg", "sounds/combat/epic-turn-2hit.ogg"]
    },
    mc: {
      label: "COMBAT.Sounds.MC",
      startEncounter: ["sounds/combat/mc-start-battle.ogg", "sounds/combat/mc-start-begin.ogg", "sounds/combat/mc-start-fight.ogg", "sounds/combat/mc-start-fight2.ogg"],
      nextUp: ["sounds/combat/mc-next-itwillbe.ogg", "sounds/combat/mc-next-makeready.ogg", "sounds/combat/mc-next-youare.ogg"],
      yourTurn: ["sounds/combat/mc-turn-itisyour.ogg", "sounds/combat/mc-turn-itsyour.ogg"]
    }
  }
};

/**
 * @typedef DiceFulfillmentConfiguration
 * @property {Record<string, DiceFulfillmentDenomination>} dice  The die denominations available for configuration.
 * @property {Record<string, DiceFulfillmentMethod>} methods     The methods available for fulfillment.
 * @property {string} defaultMethod                              Designate one of the methods to be used by default
 *                                                               for dice fulfillment, if the user hasn't specified
 *                                                               otherwise. Leave this blank to use the configured
 *                                                               randomUniform to generate die rolls.
 */

/**
 * @typedef DiceFulfillmentDenomination
 * @property {string} label  The human-readable label for the die.
 * @property {string} icon   An icon to display on the configuration sheet.
 */

/**
 * @typedef DiceFulfillmentMethod
 * @property {string} label                      The human-readable label for the fulfillment method.
 * @property {string} [icon]                     An icon to represent the fulfillment method.
 * @property {boolean} [interactive=false]       Whether this method requires input from the user or if it is
 *                                               fulfilled entirely programmatically.
 * @property {DiceFulfillmentHandler} [handler]  A function to invoke to programmatically fulfil a given term for non-
 *                                               interactive fulfillment methods.
 * @property {typeof RollResolver} [resolver]    A custom RollResolver implementation. If the only interactive methods
 *                                               the user has configured are this method and manual, this resolver will
 *                                               be used to resolve interactive rolls, instead of the default resolver.
 *                                               This resolver must therefore be capable of handling manual rolls.
 */

/**
 * Only used for non-interactive fulfillment methods. If a die configured to use this fulfillment method is rolled,
 * this handler is called and awaited in order to produce the die roll result.
 * @callback DiceFulfillmentHandler
 * @param {dice.terms.DiceTerm} term           The term being fulfilled.
 * @param {object} [options]        Additional options to configure fulfillment.
 * @returns {number|void|Promise<number|void>}  The fulfilled value, or undefined if it could not be fulfilled.
 */

/**
 * @callback RollFunction
 * @param {...any} args
 * @returns {Promise<number|string>|number|string}
 */

/**
 * @type {Record<string, typeof dice.terms.RollTerm>}
 */
const termTypes = {
  DiceTerm: dice.terms.DiceTerm,
  FunctionTerm: dice.terms.FunctionTerm,
  NumericTerm: dice.terms.NumericTerm,
  OperatorTerm: dice.terms.OperatorTerm,
  ParentheticalTerm: dice.terms.ParentheticalTerm,
  PoolTerm: dice.terms.PoolTerm,
  StringTerm: dice.terms.StringTerm
};

/**
 * Configuration for dice rolling behaviors in the Foundry Virtual Tabletop client.
 */
export const Dice = {
  /**
   * The Dice types which are supported.
   * @type {Array<typeof dice.terms.DiceTerm>}
   */
  types: [dice.terms.Die, dice.terms.FateDie],
  rollModes: {
    publicroll: {
      label: "CHAT.RollPublic",
      icon: "fa-solid fa-globe"
    },
    gmroll: {
      label: "CHAT.RollPrivate",
      icon: "fa-solid fa-user-secret"
    },
    blindroll: {
      label: "CHAT.RollBlind",
      icon: "fa-solid fa-eye-slash"
    },
    selfroll: {
      label: "CHAT.RollSelf",
      icon: "fa-solid fa-user"
    }
  },
  /**
   * Configured Roll class definitions
   * @type {Array<typeof dice.Roll>}
   */
  rolls: [dice.Roll],
  /**
   * Configured DiceTerm class definitions
   */
  termTypes,
  /**
   * Configured roll terms and the classes they map to.
   * @type {Record<string, typeof dice.terms.DiceTerm>}
   */
  terms: {
    c: dice.terms.Coin,
    d: dice.terms.Die,
    f: dice.terms.FateDie
  },
  /**
   * A function used to provide random uniform values.
   * @type {function():number}
   */
  randomUniform: dice.MersenneTwister.random,

  /**
   * A parser implementation for parsing Roll expressions.
   * @type {typeof dice.RollParser}
   */
  parser: dice.RollParser,

  /**
   * A collection of custom functions that can be included in roll expressions.
   * @type {Record<string, RollFunction>}
   */
  functions: {},

  /**
   * Dice roll fulfillment configuration.
   * @type {{
   *   dice: Record<string, DiceFulfillmentDenomination>;
   *   methods: Record<string, DiceFulfillmentMethod>;
   *   defaultMethod: string;
   * }}
   */
  fulfillment: {
    dice: {
      d4: { label: "d4", icon: '<i class="fa-solid fa-dice-d4"></i>' },
      d6: { label: "d6", icon: '<i class="fa-solid fa-dice-d6"></i>' },
      d8: { label: "d8", icon: '<i class="fa-solid fa-dice-d8"></i>' },
      d10: { label: "d10", icon: '<i class="fa-solid fa-dice-d10"></i>' },
      d12: { label: "d12", icon: '<i class="fa-solid fa-dice-d12"></i>' },
      d20: { label: "d20", icon: '<i class="fa-solid fa-dice-d20"></i>' },
      d100: { label: "d100", icon: '<i class="fa-solid fa-percent"></i>' }
    },
    methods: {
      mersenne: {
        label: "DICE.FULFILLMENT.Mersenne",
        interactive: false,
        handler: term => term.mapRandomFace(dice.MersenneTwister.random())
      },
      manual: {
        label: "DICE.FULFILLMENT.Manual",
        icon: '<i class="fa-solid fa-keyboard"></i>',
        interactive: true
      }
    },
    defaultMethod: ""
  }
};

/**
 * Configuration for the FogExploration document
 */
export const FogExploration = {
  documentClass: documents.FogExploration,
  collection: documents.collections.FogExplorations
};

/**
 * Configuration for the Folder document
 */
export const Folder = {
  documentClass: documents.Folder,
  collection: documents.collections.Folders,
  sidebarIcon: "fa-solid fa-folder"
};

/**
 * Configuration for Item document
 */
export const Item = {
  documentClass: documents.Item,
  collection: documents.collections.Items,
  /** @type {string[]} */
  compendiumIndexFields: [],
  compendiumBanner: "ui/banners/item-banner.webp",
  sidebarIcon: "fa-solid fa-suitcase",
  /** @type {Record<string, typeof TypeDataModel>} */
  dataModels: {},
  /** @type {Record<string, string>} */
  typeLabels: {},
  /** @type {Record<string, string>} */
  typeIcons: {}
};

/**
 * Configuration for the JournalEntry document
 */
export const JournalEntry = {
  documentClass: documents.JournalEntry,
  collection: documents.collections.Journal,
  /** @type {string[]} */
  compendiumIndexFields: [],
  compendiumBanner: "ui/banners/journalentry-banner.webp",
  noteIcons: {
    Anchor: "icons/svg/anchor.svg",
    Barrel: "icons/svg/barrel.svg",
    Book: "icons/svg/book.svg",
    Bridge: "icons/svg/bridge.svg",
    Cave: "icons/svg/cave.svg",
    Castle: "icons/svg/castle.svg",
    Chest: "icons/svg/chest.svg",
    City: "icons/svg/city.svg",
    Coins: "icons/svg/coins.svg",
    Fire: "icons/svg/fire.svg",
    "Hanging Sign": "icons/svg/hanging-sign.svg",
    House: "icons/svg/house.svg",
    Mountain: "icons/svg/mountain.svg",
    "Oak Tree": "icons/svg/oak.svg",
    Obelisk: "icons/svg/obelisk.svg",
    Pawprint: "icons/svg/pawprint.svg",
    Ruins: "icons/svg/ruins.svg",
    Skull: "icons/svg/skull.svg",
    Statue: "icons/svg/statue.svg",
    Sword: "icons/svg/sword.svg",
    Tankard: "icons/svg/tankard.svg",
    Temple: "icons/svg/temple.svg",
    Tower: "icons/svg/tower.svg",
    Trap: "icons/svg/trap.svg",
    Village: "icons/svg/village.svg",
    Waterfall: "icons/svg/waterfall.svg",
    Windmill: "icons/svg/windmill.svg"
  },
  sidebarIcon: "fa-solid fa-book-open"
};

/**
 * Configuration for the Macro document
 */
export const Macro = {
  documentClass: documents.Macro,
  collection: documents.collections.Macros,
  /** @type {string[]} */
  compendiumIndexFields: [],
  compendiumBanner: "ui/banners/macro-banner.webp",
  sidebarIcon: "fa-solid fa-code"
};

/**
 * Configuration for the Playlist document
 */
export const Playlist = {
  documentClass: documents.Playlist,
  collection: documents.collections.Playlists,
  /** @type {string[]} */
  compendiumIndexFields: [],
  compendiumBanner: "ui/banners/playlist-banner.webp",
  sidebarIcon: "fa-solid fa-music",
  autoPreloadSeconds: 20
};

/**
 * Configuration for RollTable random draws
 */
export const RollTable = {
  documentClass: documents.RollTable,
  collection: documents.collections.RollTables,
  compendiumIndexFields: ["formula"],
  compendiumBanner: "ui/banners/rolltable-banner.webp",
  sidebarIcon: "fa-solid fa-table-list",
  resultIcon: "icons/svg/d20-black.svg",
  resultTemplate: "templates/dice/table-result.hbs"
};

/**
 * Configuration for the Scene document
 */
export const Scene = {
  documentClass: documents.Scene,
  collection: documents.collections.Scenes,
  /** @type {string[]} */
  compendiumIndexFields: [],
  compendiumBanner: "ui/banners/scene-banner.webp",
  sidebarIcon: "fa-solid fa-map"
};

export const Setting = {
  documentClass: documents.Setting,
  collection: documents.collections.WorldSettings
};

/**
 * Configuration for the User document
 */
export const User = {
  documentClass: documents.User,
  collection: documents.collections.Users
};

/* -------------------------------------------- */
/*  Canvas                                      */
/* -------------------------------------------- */

/**
 * @typedef {Record<string, {label: string, animation: Function,
 * backgroundShader?: typeof canvas.rendering.shaders.AdaptiveBackgroundShader,
 * illuminationShader?: typeof canvas.rendering.shaders.AdaptiveIlluminationShader,
 * colorationShader: typeof canvas.rendering.shaders.AdaptiveColorationShader}>} LightSourceAnimationConfig
 * A light source animation configuration object.
 */

/**
 * @typedef {Record<string, {label: string, animation: Function,
 * darknessShader: typeof canvas.rendering.shaders.AdaptiveDarknessShader}>} DarknessSourceAnimationConfig
 * A darkness source animation configuration object.
 */

/**
 * Configuration settings for the Canvas and its contained layers and objects
 */
export const Canvas = {
  elevationSnappingPrecision: 10,
  blurStrength: 8,
  blurQuality: 4,
  darknessColor: 0x303030,
  daylightColor: 0xEEEEEE,
  brightestColor: 0xFFFFFF,
  chatBubblesClass: canvas.animation.ChatBubbles,
  darknessLightPenalty: 0.25,
  dispositionColors: {
    HOSTILE: 0xE72124,
    NEUTRAL: 0xF1D836,
    FRIENDLY: 0x43DFDF,
    INACTIVE: 0x555555,
    PARTY: 0x33BC4E,
    CONTROLLED: 0xFF9829,
    SECRET: 0xA612D4
  },
  /**
   * The class used to render door control icons.
   * @type {typeof canvas.containers.DoorControl}
   */
  doorControlClass: canvas.containers.DoorControl,
  exploredColor: 0x000000,
  unexploredColor: 0x000000,
  darknessToDaylightAnimationMS: 10000,
  daylightToDarknessAnimationMS: 10000,
  darknessSourceClass: canvas.sources.PointDarknessSource,
  lightSourceClass: canvas.sources.PointLightSource,
  globalLightSourceClass: canvas.sources.GlobalLightSource,
  visionSourceClass: canvas.sources.PointVisionSource,
  soundSourceClass: canvas.sources.PointSoundSource,
  groups: {
    hidden: {
      groupClass: canvas.groups.HiddenCanvasGroup,
      parent: "stage"
    },
    rendered: {
      groupClass: canvas.groups.RenderedCanvasGroup,
      parent: "stage"
    },
    environment: {
      groupClass: canvas.groups.EnvironmentCanvasGroup,
      parent: "rendered"
    },
    primary: {
      groupClass: canvas.groups.PrimaryCanvasGroup,
      parent: "environment"
    },
    effects: {
      groupClass: canvas.groups.EffectsCanvasGroup,
      parent: "environment"
    },
    visibility: {
      groupClass: canvas.groups.CanvasVisibility,
      parent: "rendered"
    },
    interface: {
      groupClass: canvas.groups.InterfaceCanvasGroup,
      parent: "rendered",
      zIndexDrawings: 500,
      zIndexScrollingText: 1100
    },
    overlay: {
      groupClass: canvas.groups.OverlayCanvasGroup,
      parent: "stage"
    }
  },
  layers: {
    weather: {
      layerClass: canvas.layers.WeatherEffects,
      group: "primary"
    },
    grid: {
      layerClass: canvas.layers.GridLayer,
      group: "interface"
    },
    regions: {
      layerClass: canvas.layers.RegionLayer,
      group: "interface"
    },
    drawings: {
      layerClass: canvas.layers.DrawingsLayer,
      group: "interface"
    },
    templates: {
      layerClass: canvas.layers.TemplateLayer,
      group: "interface"
    },
    tiles: {
      layerClass: canvas.layers.TilesLayer,
      group: "interface"
    },
    walls: {
      layerClass: canvas.layers.WallsLayer,
      group: "interface"
    },
    tokens: {
      layerClass: canvas.layers.TokenLayer,
      group: "interface"
    },
    sounds: {
      layerClass: canvas.layers.SoundsLayer,
      group: "interface"
    },
    lighting: {
      layerClass: canvas.layers.LightingLayer,
      group: "interface"
    },
    notes: {
      layerClass: canvas.layers.NotesLayer,
      group: "interface"
    },
    controls: {
      layerClass: canvas.layers.ControlsLayer,
      group: "interface"
    }
  },
  lightLevels: {
    dark: 0,
    halfdark: 0.5,
    dim: 0.25,
    bright: 1.0
  },
  fogManager: canvas.perception.FogManager,
  /**
   * @enum {typeof canvas.geometry.PointSourcePolygon}
   */
  polygonBackends: {
    sight: canvas.geometry.ClockwiseSweepPolygon,
    light: canvas.geometry.ClockwiseSweepPolygon,
    darkness: canvas.geometry.ClockwiseSweepPolygon,
    sound: canvas.geometry.ClockwiseSweepPolygon,
    move: canvas.geometry.ClockwiseSweepPolygon
  },
  darknessSourcePaddingMultiplier: 0.5,
  visibilityFilter: canvas.rendering.filters.VisibilityFilter,
  visualEffectsMaskingFilter: canvas.rendering.filters.VisualEffectsMaskingFilter,
  rulerClass: canvas.interaction.Ruler,
  dragSpeedModifier: 0.8,
  maxZoom: undefined,
  minZoom: undefined,
  objectBorderThickness: 4,
  gridStyles: {
    solidLines: {
      label: "GRID.STYLES.SolidLines",
      shaderClass: canvas.rendering.shaders.GridShader,
      shaderOptions: {
        style: 0
      }
    },
    dashedLines: {
      label: "GRID.STYLES.DashedLines",
      shaderClass: canvas.rendering.shaders.GridShader,
      shaderOptions: {
        style: 1
      }
    },
    dottedLines: {
      label: "GRID.STYLES.DottedLines",
      shaderClass: canvas.rendering.shaders.GridShader,
      shaderOptions: {
        style: 2
      }
    },
    squarePoints: {
      label: "GRID.STYLES.SquarePoints",
      shaderClass: canvas.rendering.shaders.GridShader,
      shaderOptions: {
        style: 3
      }
    },
    diamondPoints: {
      label: "GRID.STYLES.DiamondPoints",
      shaderClass: canvas.rendering.shaders.GridShader,
      shaderOptions: {
        style: 4
      }
    },
    roundPoints: {
      label: "GRID.STYLES.RoundPoints",
      shaderClass: canvas.rendering.shaders.GridShader,
      shaderOptions: {
        style: 5
      }
    }
  },

  /** @type {LightSourceAnimationConfig} */
  lightAnimations: {
    flame: {
      label: "LIGHT.AnimationFlame",
      animation: canvas.sources.PointLightSource.prototype.animateFlickering,
      illuminationShader: canvas.rendering.shaders.FlameIlluminationShader,
      colorationShader: canvas.rendering.shaders.FlameColorationShader
    },
    torch: {
      label: "LIGHT.AnimationTorch",
      animation: canvas.sources.PointLightSource.prototype.animateTorch,
      illuminationShader: canvas.rendering.shaders.TorchIlluminationShader,
      colorationShader: canvas.rendering.shaders.TorchColorationShader
    },
    revolving: {
      label: "LIGHT.AnimationRevolving",
      animation: canvas.sources.PointLightSource.prototype.animateTime,
      colorationShader: canvas.rendering.shaders.RevolvingColorationShader
    },
    siren: {
      label: "LIGHT.AnimationSiren",
      animation: canvas.sources.PointLightSource.prototype.animateTorch,
      illuminationShader: canvas.rendering.shaders.SirenIlluminationShader,
      colorationShader: canvas.rendering.shaders.SirenColorationShader
    },
    pulse: {
      label: "LIGHT.AnimationPulse",
      animation: canvas.sources.PointLightSource.prototype.animatePulse,
      illuminationShader: canvas.rendering.shaders.PulseIlluminationShader,
      colorationShader: canvas.rendering.shaders.PulseColorationShader
    },
    reactivepulse: {
      label: "LIGHT.AnimationReactivePulse",
      animation: canvas.sources.PointLightSource.prototype.animateSoundPulse,
      illuminationShader: canvas.rendering.shaders.PulseIlluminationShader,
      colorationShader: canvas.rendering.shaders.PulseColorationShader
    },
    chroma: {
      label: "LIGHT.AnimationChroma",
      animation: canvas.sources.PointLightSource.prototype.animateTime,
      colorationShader: canvas.rendering.shaders.ChromaColorationShader
    },
    wave: {
      label: "LIGHT.AnimationWave",
      animation: canvas.sources.PointLightSource.prototype.animateTime,
      illuminationShader: canvas.rendering.shaders.WaveIlluminationShader,
      colorationShader: canvas.rendering.shaders.WaveColorationShader
    },
    fog: {
      label: "LIGHT.AnimationFog",
      animation: canvas.sources.PointLightSource.prototype.animateTime,
      colorationShader: canvas.rendering.shaders.FogColorationShader
    },
    sunburst: {
      label: "LIGHT.AnimationSunburst",
      animation: canvas.sources.PointLightSource.prototype.animateTime,
      illuminationShader: canvas.rendering.shaders.SunburstIlluminationShader,
      colorationShader: canvas.rendering.shaders.SunburstColorationShader
    },
    dome: {
      label: "LIGHT.AnimationLightDome",
      animation: canvas.sources.PointLightSource.prototype.animateTime,
      colorationShader: canvas.rendering.shaders.LightDomeColorationShader
    },
    emanation: {
      label: "LIGHT.AnimationEmanation",
      animation: canvas.sources.PointLightSource.prototype.animateTime,
      colorationShader: canvas.rendering.shaders.EmanationColorationShader
    },
    hexa: {
      label: "LIGHT.AnimationHexaDome",
      animation: canvas.sources.PointLightSource.prototype.animateTime,
      colorationShader: canvas.rendering.shaders.HexaDomeColorationShader
    },
    ghost: {
      label: "LIGHT.AnimationGhostLight",
      animation: canvas.sources.PointLightSource.prototype.animateTime,
      illuminationShader: canvas.rendering.shaders.GhostLightIlluminationShader,
      colorationShader: canvas.rendering.shaders.GhostLightColorationShader
    },
    energy: {
      label: "LIGHT.AnimationEnergyField",
      animation: canvas.sources.PointLightSource.prototype.animateTime,
      colorationShader: canvas.rendering.shaders.EnergyFieldColorationShader
    },
    vortex: {
      label: "LIGHT.AnimationVortex",
      animation: canvas.sources.PointLightSource.prototype.animateTime,
      illuminationShader: canvas.rendering.shaders.VortexIlluminationShader,
      colorationShader: canvas.rendering.shaders.VortexColorationShader
    },
    witchwave: {
      label: "LIGHT.AnimationBewitchingWave",
      animation: canvas.sources.PointLightSource.prototype.animateTime,
      illuminationShader: canvas.rendering.shaders.BewitchingWaveIlluminationShader,
      colorationShader: canvas.rendering.shaders.BewitchingWaveColorationShader
    },
    rainbowswirl: {
      label: "LIGHT.AnimationSwirlingRainbow",
      animation: canvas.sources.PointLightSource.prototype.animateTime,
      colorationShader: canvas.rendering.shaders.SwirlingRainbowColorationShader
    },
    radialrainbow: {
      label: "LIGHT.AnimationRadialRainbow",
      animation: canvas.sources.PointLightSource.prototype.animateTime,
      colorationShader: canvas.rendering.shaders.RadialRainbowColorationShader
    },
    fairy: {
      label: "LIGHT.AnimationFairyLight",
      animation: canvas.sources.PointLightSource.prototype.animateTime,
      illuminationShader: canvas.rendering.shaders.FairyLightIlluminationShader,
      colorationShader: canvas.rendering.shaders.FairyLightColorationShader
    },
    grid: {
      label: "LIGHT.AnimationForceGrid",
      animation: canvas.sources.PointLightSource.prototype.animateTime,
      colorationShader: canvas.rendering.shaders.ForceGridColorationShader
    },
    starlight: {
      label: "LIGHT.AnimationStarLight",
      animation: canvas.sources.PointLightSource.prototype.animateTime,
      colorationShader: canvas.rendering.shaders.StarLightColorationShader
    },
    smokepatch: {
      label: "LIGHT.AnimationSmokePatch",
      animation: canvas.sources.PointLightSource.prototype.animateTime,
      illuminationShader: canvas.rendering.shaders.SmokePatchIlluminationShader,
      colorationShader: canvas.rendering.shaders.SmokePatchColorationShader
    }
  },

  /** @type {DarknessSourceAnimationConfig} */
  darknessAnimations: {
    magicalGloom: {
      label: "LIGHT.AnimationMagicalGloom",
      animation: canvas.sources.PointDarknessSource.prototype.animateTime,
      darknessShader: canvas.rendering.shaders.MagicalGloomDarknessShader
    },
    roiling: {
      label: "LIGHT.AnimationRoilingMass",
      animation: canvas.sources.PointDarknessSource.prototype.animateTime,
      darknessShader: canvas.rendering.shaders.RoilingDarknessShader
    },
    hole: {
      label: "LIGHT.AnimationBlackHole",
      animation: canvas.sources.PointDarknessSource.prototype.animateTime,
      darknessShader: canvas.rendering.shaders.BlackHoleDarknessShader
    },
    denseSmoke: {
      label: "LIGHT.AnimationDenseSmoke",
      animation: canvas.sources.PointDarknessSource.prototype.animateTime,
      darknessShader: canvas.rendering.shaders.DenseSmokeDarknessShader
    }
  },

  /**
   * A registry of Scenes which are managed by a specific SceneManager class.
   * @type {Record<string, typeof canvas.SceneManager>}
   */
  managedScenes: {},

  pings: {
    types: {
      PULSE: "pulse",
      ALERT: "alert",
      PULL: "chevron",
      ARROW: "arrow"
    },
    styles: {
      alert: {
        class: canvas.interaction.AlertPing,
        color: "#ff0000",
        size: 1.5,
        duration: 900
      },
      arrow: {
        class: canvas.interaction.ArrowPing,
        size: 1,
        duration: 900
      },
      chevron: {
        class: canvas.interaction.ChevronPing,
        size: 1,
        duration: 2000
      },
      pulse: {
        class: canvas.interaction.PulsePing,
        size: 1.5,
        duration: 900
      }
    },
    pullSpeed: 700
  },
  targeting: {
    size: .15
  },

  /**
   * The hover-fading configuration.
   * @type {object}
   */
  hoverFade: {
    /**
     * The delay in milliseconds before the (un)faded animation starts on (un)hover.
     * @type {number}
     */
    delay: 250,

    /**
     * The duration in milliseconds of the (un)fade animation on (un)hover.
     * @type {number}
     */
    duration: 750
  },

  /* -------------------------------------------- */

  /**
   * The set of VisionMode definitions which are available to be used for Token vision.
   * @type {Record<string, canvas.perception.VisionMode>}
   */
  visionModes: {

    // Default (Basic) Vision
    basic: new canvas.perception.VisionMode({
      id: "basic",
      label: "VISION.ModeBasicVision",
      vision: {
        defaults: { attenuation: 0, contrast: 0, saturation: 0, brightness: 0 },
        preferred: true // Takes priority over other vision modes
      }
    }),

    // Darkvision
    darkvision: new canvas.perception.VisionMode({
      id: "darkvision",
      label: "VISION.ModeDarkvision",
      canvas: {
        shader: canvas.rendering.shaders.ColorAdjustmentsSamplerShader,
        uniforms: { contrast: 0, saturation: -1.0, brightness: 0 }
      },
      lighting: {
        levels: {
          [canvas.perception.VisionMode.LIGHTING_LEVELS.DIM]: canvas.perception.VisionMode.LIGHTING_LEVELS.BRIGHT
        },
        background: { visibility: canvas.perception.VisionMode.LIGHTING_VISIBILITY.REQUIRED }
      },
      vision: {
        darkness: { adaptive: false },
        defaults: { attenuation: 0, contrast: 0, saturation: -1.0, brightness: 0 }
      }
    }),

    // Darkvision
    monochromatic: new canvas.perception.VisionMode({
      id: "monochromatic",
      label: "VISION.ModeMonochromatic",
      canvas: {
        shader: canvas.rendering.shaders.ColorAdjustmentsSamplerShader,
        uniforms: { contrast: 0, saturation: -1.0, brightness: 0 }
      },
      lighting: {
        background: {
          postProcessingModes: ["SATURATION"],
          uniforms: { saturation: -1.0, tint: [1, 1, 1] }
        },
        illumination: {
          postProcessingModes: ["SATURATION"],
          uniforms: { saturation: -1.0, tint: [1, 1, 1] }
        },
        coloration: {
          postProcessingModes: ["SATURATION"],
          uniforms: { saturation: -1.0, tint: [1, 1, 1] }
        }
      },
      vision: {
        darkness: { adaptive: false },
        defaults: { attenuation: 0, contrast: 0, saturation: -1, brightness: 0 }
      }
    }),

    // Blindness
    blindness: new canvas.perception.VisionMode({
      id: "blindness",
      label: "VISION.ModeBlindness",
      tokenConfig: false,
      canvas: {
        shader: canvas.rendering.shaders.ColorAdjustmentsSamplerShader,
        uniforms: { contrast: -0.75, saturation: -1, exposure: -0.3 }
      },
      lighting: {
        background: { visibility: canvas.perception.VisionMode.LIGHTING_VISIBILITY.DISABLED },
        illumination: { visibility: canvas.perception.VisionMode.LIGHTING_VISIBILITY.DISABLED },
        coloration: { visibility: canvas.perception.VisionMode.LIGHTING_VISIBILITY.DISABLED }
      },
      vision: {
        darkness: { adaptive: false },
        defaults: { color: null, attenuation: 0, contrast: -0.5, saturation: -1, brightness: -1 }
      }
    }),

    // Tremorsense
    tremorsense: new canvas.perception.VisionMode({
      id: "tremorsense",
      label: "VISION.ModeTremorsense",
      canvas: {
        shader: canvas.rendering.shaders.ColorAdjustmentsSamplerShader,
        uniforms: { contrast: 0, saturation: -0.8, exposure: -0.65 }
      },
      lighting: {
        background: { visibility: canvas.perception.VisionMode.LIGHTING_VISIBILITY.DISABLED },
        illumination: { visibility: canvas.perception.VisionMode.LIGHTING_VISIBILITY.DISABLED },
        coloration: { visibility: canvas.perception.VisionMode.LIGHTING_VISIBILITY.DISABLED },
        darkness: { visibility: canvas.perception.VisionMode.LIGHTING_VISIBILITY.DISABLED }
      },
      vision: {
        darkness: { adaptive: false },
        defaults: { attenuation: 0, contrast: 0.2, saturation: -0.3, brightness: 1 },
        background: { shader: canvas.rendering.shaders.WaveBackgroundVisionShader },
        coloration: { shader: canvas.rendering.shaders.WaveColorationVisionShader }
      }
    }, {animated: true}),

    // Light Amplification
    lightAmplification: new canvas.perception.VisionMode({
      id: "lightAmplification",
      label: "VISION.ModeLightAmplification",
      canvas: {
        shader: canvas.rendering.shaders.AmplificationSamplerShader,
        uniforms: { saturation: -0.5, tint: [0.38, 0.8, 0.38] }
      },
      lighting: {
        background: {
          visibility: canvas.perception.VisionMode.LIGHTING_VISIBILITY.REQUIRED,
          postProcessingModes: ["SATURATION", "EXPOSURE"],
          uniforms: { saturation: -0.5, exposure: 1.5, tint: [0.38, 0.8, 0.38] }
        },
        illumination: {
          postProcessingModes: ["SATURATION"],
          uniforms: { saturation: -0.5 }
        },
        coloration: {
          postProcessingModes: ["SATURATION", "EXPOSURE"],
          uniforms: { saturation: -0.5, exposure: 1.5, tint: [0.38, 0.8, 0.38] }
        },
        levels: {
          [canvas.perception.VisionMode.LIGHTING_LEVELS.DIM]: canvas.perception.VisionMode.LIGHTING_LEVELS.BRIGHT,
          [canvas.perception.VisionMode.LIGHTING_LEVELS.BRIGHT]: canvas.perception.VisionMode.LIGHTING_LEVELS.BRIGHTEST
        }
      },
      vision: {
        darkness: { adaptive: false },
        defaults: { attenuation: 0, contrast: 0, saturation: -0.5, brightness: 1 },
        background: { shader: canvas.rendering.shaders.AmplificationBackgroundVisionShader }
      }
    })
  },

  /* -------------------------------------------- */

  /**
   * The set of DetectionMode definitions which are available to be used for visibility detection.
   * @type {Record<string, canvas.perception.DetectionMode>}
   */
  detectionModes: {
    lightPerception: new canvas.perception.DetectionModeLightPerception({
      id: "lightPerception",
      label: "DETECTION.LightPerception",
      type: canvas.perception.DetectionMode.DETECTION_TYPES.SIGHT
    }),
    basicSight: new canvas.perception.DetectionModeDarkvision({
      id: "basicSight",
      label: "DETECTION.BasicSight",
      type: canvas.perception.DetectionMode.DETECTION_TYPES.SIGHT
    }),
    seeInvisibility: new canvas.perception.DetectionModeInvisibility({
      id: "seeInvisibility",
      label: "DETECTION.SeeInvisibility",
      type: canvas.perception.DetectionMode.DETECTION_TYPES.SIGHT
    }),
    senseInvisibility: new canvas.perception.DetectionModeInvisibility({
      id: "senseInvisibility",
      label: "DETECTION.SenseInvisibility",
      walls: false,
      angle: false,
      type: canvas.perception.DetectionMode.DETECTION_TYPES.OTHER
    }),
    feelTremor: new canvas.perception.DetectionModeTremor({
      id: "feelTremor",
      label: "DETECTION.FeelTremor",
      walls: false,
      angle: false,
      type: canvas.perception.DetectionMode.DETECTION_TYPES.MOVE
    }),
    seeAll: new canvas.perception.DetectionModeAll({
      id: "seeAll",
      label: "DETECTION.SeeAll",
      type: canvas.perception.DetectionMode.DETECTION_TYPES.SIGHT
    }),
    senseAll: new canvas.perception.DetectionModeAll({
      id: "senseAll",
      label: "DETECTION.SenseAll",
      walls: false,
      angle: false,
      type: canvas.perception.DetectionMode.DETECTION_TYPES.OTHER
    })
  },
  /**
   * @deprecated since v13
   * @ignore
   */
  get transcoders() {
    utils.logCompatibilityWarning("CONFIG.Canvas.transcoders has been deprecated without replacement. "
      + "KTX2/Basis support is always enabled and this property has no effect anymore.",
    {since: 13, until: 15, once: true}
    );
    return {basis: true};
  }
};

/* -------------------------------------------- */

/**
 * Configure the default Token text style so that it may be reused and overridden by modules
 */
// eslint-disable-next-line prefer-const
export let canvasTextStyle = new PIXI.TextStyle({
  fontFamily: "Signika",
  fontSize: 36,
  fill: "#FFFFFF",
  stroke: "#111111",
  strokeThickness: 1,
  dropShadow: true,
  dropShadowColor: "#000000",
  dropShadowBlur: 2,
  dropShadowAngle: 0,
  dropShadowDistance: 0,
  align: "center",
  wordWrap: false,
  padding: 1
});

/**
 * @typedef WeatherAmbienceConfiguration
 * Available Weather Effects implementations
 * @property {string} id
 * @property {string} label
 * @property {{enabled: boolean; blendMode?: PIXI.BLEND_MODES}} [filter]
 * @property {WeatherEffectConfiguration[]} effects
 */

/**
 * @typedef WeatherEffectConfiguration
 * @property {string} id
 * @property {typeof ParticleEffect|typeof canvas.rendering.shaders.WeatherShaderEffect} effectClass
 * @property {typeof canvas.rendering.shaders.AbstractWeatherShader} [shaderClass]
 * @property {PIXI.BLEND_MODES} [blendMode]
 * @property {object} [config]
 * @property {number} [performanceLevel]
 */

/** @type {Record<string, WeatherAmbienceConfiguration>} */
export const weatherEffects = {
  leaves: {
    id: "leaves",
    label: "WEATHER.AutumnLeaves",
    effects: [{
      id: "leavesParticles",
      effectClass: canvas.containers.AutumnLeavesWeatherEffect
    }]
  },
  rain: {
    id: "rain",
    label: "WEATHER.Rain",
    filter: {
      enabled: false
    },
    effects: [{
      id: "rainShader",
      effectClass: canvas.rendering.shaders.WeatherShaderEffect,
      shaderClass: canvas.rendering.shaders.RainShader,
      blendMode: PIXI.BLEND_MODES.SCREEN,
      config: {
        opacity: 0.25,
        tint: [0.7, 0.9, 1.0],
        intensity: 1,
        strength: 1,
        rotation: 0.2618,
        speed: 0.2
      }
    }]
  },
  rainStorm: {
    id: "rainStorm",
    label: "WEATHER.RainStorm",
    filter: {
      enabled: false
    },
    effects: [{
      id: "fogShader",
      effectClass: canvas.rendering.shaders.WeatherShaderEffect,
      shaderClass: canvas.rendering.shaders.FogShader,
      blendMode: PIXI.BLEND_MODES.SCREEN,
      performanceLevel: 2,
      config: {
        slope: 1.5,
        intensity: 0.050,
        speed: -55.0,
        scale: 25
      }
    },
    {
      id: "rainShader",
      effectClass: canvas.rendering.shaders.WeatherShaderEffect,
      shaderClass: canvas.rendering.shaders.RainShader,
      blendMode: PIXI.BLEND_MODES.SCREEN,
      config: {
        opacity: 0.45,
        tint: [0.7, 0.9, 1.0],
        intensity: 1.5,
        strength: 1.5,
        rotation: 0.5236,
        speed: 0.30
      }
    }]
  },
  fog: {
    id: "fog",
    label: "WEATHER.Fog",
    filter: {
      enabled: false
    },
    effects: [{
      id: "fogShader",
      effectClass: canvas.rendering.shaders.WeatherShaderEffect,
      shaderClass: canvas.rendering.shaders.FogShader,
      blendMode: PIXI.BLEND_MODES.SCREEN,
      config: {
        slope: 0.45,
        intensity: 0.4,
        speed: 0.4
      }
    }]
  },
  snow: {
    id: "snow",
    label: "WEATHER.Snow",
    filter: {
      enabled: false
    },
    effects: [{
      id: "snowShader",
      effectClass: canvas.rendering.shaders.WeatherShaderEffect,
      shaderClass: canvas.rendering.shaders.SnowShader,
      blendMode: PIXI.BLEND_MODES.SCREEN,
      config: {
        tint: [0.85, 0.95, 1],
        direction: 0.5,
        speed: 2,
        scale: 2.5
      }
    }]
  },
  blizzard: {
    id: "blizzard",
    label: "WEATHER.Blizzard",
    filter: {
      enabled: false
    },
    effects: [{
      id: "snowShader",
      effectClass: canvas.rendering.shaders.WeatherShaderEffect,
      shaderClass: canvas.rendering.shaders.SnowShader,
      blendMode: PIXI.BLEND_MODES.SCREEN,
      config: {
        tint: [0.95, 1, 1],
        direction: 0.80,
        speed: 8,
        scale: 2.5
      }
    },
    {
      id: "fogShader",
      effectClass: canvas.rendering.shaders.WeatherShaderEffect,
      shaderClass: canvas.rendering.shaders.FogShader,
      blendMode: PIXI.BLEND_MODES.SCREEN,
      performanceLevel: 2,
      config: {
        slope: 1.0,
        intensity: 0.15,
        speed: -4.0
      }
    }]
  }
};

/**
 * The control icons used for rendering common HUD operations
 */
export const controlIcons = {
  combat: "icons/svg/combat.svg",
  visibility: "icons/svg/cowled.svg",
  effects: "icons/svg/aura.svg",
  lock: "icons/svg/padlock.svg",
  up: "icons/svg/up.svg",
  down: "icons/svg/down.svg",
  defeated: "icons/svg/skull.svg",
  light: "icons/svg/light.svg",
  lightOff: "icons/svg/light-off.svg",
  template: "icons/svg/explosion.svg",
  sound: "icons/svg/sound.svg",
  soundOff: "icons/svg/sound-off.svg",
  doorClosed: "icons/svg/door-closed-outline.svg",
  doorOpen: "icons/svg/door-open-outline.svg",
  doorSecret: "icons/svg/door-secret-outline.svg",
  doorLocked: "icons/svg/door-locked-outline.svg",
  wallDirection: "icons/svg/wall-direction.svg"
};

/**
 * @typedef _FontDefinition
 * @property {string[]} urls  An array of remote URLs the font files exist at.
 */

/**
 * @typedef {FontFaceDescriptors & _FontDefinition} FontDefinition
 */

/**
 * @typedef FontFamilyDefinition
 * @property {boolean} editor          Whether the font is available in the rich text editor. This will also enable it
 *                                     for notes and drawings.
 * @property {FontDefinition[]} fonts  Individual font face definitions for this font family. If this is empty, the
 *                                     font family may only be loaded from the client's OS-installed fonts.
 */

/**
 * A collection of fonts to load either from the user's local system, or remotely.
 * @type {Record<string, FontFamilyDefinition>}
 */
export const fontDefinitions = {
  Arial: {editor: true, fonts: []},
  Amiri: {
    editor: true,
    fonts: [
      {urls: ["fonts/amiri/amiri-regular.woff2"]},
      {urls: ["fonts/amiri/amiri-bold.woff2"], weight: "700"}
    ]
  },
  "Bruno Ace": {editor: true, fonts: [
    {urls: ["fonts/bruno-ace/bruno-ace.woff2"]}
  ]},
  Courier: {editor: true, fonts: []},
  "Courier New": {editor: true, fonts: []},
  "Modesto Condensed": {
    editor: true,
    fonts: [
      {urls: ["fonts/modesto-condensed/modesto-condensed.woff2"]},
      {urls: ["fonts/modesto-condensed/modesto-condensed-bold.woff2"], weight: "700"}
    ]
  },
  Signika: {
    editor: true,
    fonts: [
      {urls: ["fonts/signika/signika-light.woff2"], weight: "300"},
      {urls: ["fonts/signika/signika-regular.woff2"]},
      {urls: ["fonts/signika/signika-medium.woff2"], weight: "500"},
      {urls: ["fonts/signika/signika-semibold.woff2"], weight: "600"},
      {urls: ["fonts/signika/signika-bold.woff2"], weight: "700"}
    ]
  },
  Times: {editor: true, fonts: []},
  "Times New Roman": {editor: true, fonts: []}
};

/**
 * The default font family used for text labels on the PIXI Canvas
 */
// eslint-disable-next-line prefer-const
export let defaultFontFamily = "Signika";

/**
 * @typedef _StatusEffectConfig
 * @property {string} id                       A string identifier for the effect.
 * @property {string} [label]                  DEPRECATED alias for "name".
 * @property {string} [icon]                   DEPRECATED alias for "img".
 * @property {boolean|{actorTypes?: string[]}} [hud=true]  Should this effect appear in the Token HUD?
 *                                          This effect is only selectable in the Token HUD if the Token's
 *                                          Actor sub-type is one of the configured ones.
 */

/**
 * @typedef {_StatusEffectConfig & Partial<documents.types.ActiveEffectData>} StatusEffectConfig
 * Configured status effects recognized by the game system.
 * Properties "name" and "img" should be preferred over "label" and "icon".
 */

/**
 * The array of status effects which can be applied to an Actor.
 * @type {StatusEffectConfig[]}
 */
export const statusEffects = [
  {
    id: "dead",
    name: "EFFECT.StatusDead",
    img: "icons/svg/skull.svg"
  },
  {
    id: "unconscious",
    name: "EFFECT.StatusUnconscious",
    img: "icons/svg/unconscious.svg"
  },
  {
    id: "sleep",
    name: "EFFECT.StatusAsleep",
    img: "icons/svg/sleep.svg"
  },
  {
    id: "stun",
    name: "EFFECT.StatusStunned",
    img: "icons/svg/daze.svg"
  },
  {
    id: "prone",
    name: "EFFECT.StatusProne",
    img: "icons/svg/falling.svg"
  },
  {
    id: "restrain",
    name: "EFFECT.StatusRestrained",
    img: "icons/svg/net.svg"
  },
  {
    id: "paralysis",
    name: "EFFECT.StatusParalysis",
    img: "icons/svg/paralysis.svg"
  },
  {
    id: "fly",
    name: "EFFECT.StatusFlying",
    img: "icons/svg/wing.svg"
  },
  {
    id: "blind",
    name: "EFFECT.StatusBlind",
    img: "icons/svg/blind.svg"
  },
  {
    id: "deaf",
    name: "EFFECT.StatusDeaf",
    img: "icons/svg/deaf.svg"
  },
  {
    id: "silence",
    name: "EFFECT.StatusSilenced",
    img: "icons/svg/silenced.svg"
  },
  {
    id: "fear",
    name: "EFFECT.StatusFear",
    img: "icons/svg/terror.svg"
  },
  {
    id: "burning",
    name: "EFFECT.StatusBurning",
    img: "icons/svg/fire.svg"
  },
  {
    id: "frozen",
    name: "EFFECT.StatusFrozen",
    img: "icons/svg/frozen.svg"
  },
  {
    id: "shock",
    name: "EFFECT.StatusShocked",
    img: "icons/svg/lightning.svg"
  },
  {
    id: "corrode",
    name: "EFFECT.StatusCorrode",
    img: "icons/svg/acid.svg"
  },
  {
    id: "bleeding",
    name: "EFFECT.StatusBleeding",
    img: "icons/svg/blood.svg"
  },
  {
    id: "disease",
    name: "EFFECT.StatusDisease",
    img: "icons/svg/biohazard.svg"
  },
  {
    id: "poison",
    name: "EFFECT.StatusPoison",
    img: "icons/svg/poison.svg"
  },
  {
    id: "curse",
    name: "EFFECT.StatusCursed",
    img: "icons/svg/sun.svg"
  },
  {
    id: "regen",
    name: "EFFECT.StatusRegen",
    img: "icons/svg/regen.svg"
  },
  {
    id: "degen",
    name: "EFFECT.StatusDegen",
    img: "icons/svg/degen.svg"
  },
  {
    id: "hover",
    name: "EFFECT.StatusHover",
    img: "icons/svg/wingfoot.svg"
  },
  {
    id: "burrow",
    name: "EFFECT.StatusBurrow",
    img: "icons/svg/mole.svg"
  },
  {
    id: "upgrade",
    name: "EFFECT.StatusUpgrade",
    img: "icons/svg/upgrade.svg"
  },
  {
    id: "downgrade",
    name: "EFFECT.StatusDowngrade",
    img: "icons/svg/downgrade.svg"
  },
  {
    id: "invisible",
    name: "EFFECT.StatusInvisible",
    img: "icons/svg/invisible.svg"
  },
  {
    id: "target",
    name: "EFFECT.StatusTarget",
    img: "icons/svg/target.svg"
  },
  {
    id: "eye",
    name: "EFFECT.StatusMarked",
    img: "icons/svg/eye.svg"
  },
  {
    id: "bless",
    name: "EFFECT.StatusBlessed",
    img: "icons/svg/angel.svg"
  },
  {
    id: "fireShield",
    name: "EFFECT.StatusFireShield",
    img: "icons/svg/fire-shield.svg"
  },
  {
    id: "coldShield",
    name: "EFFECT.StatusIceShield",
    img: "icons/svg/ice-shield.svg"
  },
  {
    id: "magicShield",
    name: "EFFECT.StatusMagicShield",
    img: "icons/svg/mage-shield.svg"
  },
  {
    id: "holyShield",
    name: "EFFECT.StatusHolyShield",
    img: "icons/svg/holy-shield.svg"
  }
].map(status => {
  /** @deprecated since v12 */
  for ( const [oldKey, newKey] of Object.entries({label: "name", icon: "img"}) ) {
    const msg = `StatusEffectConfig#${oldKey} has been deprecated in favor of StatusEffectConfig#${newKey}`;
    Object.defineProperty(status, oldKey, {
      get() {
        utils.logCompatibilityWarning(msg, {since: 12, until: 14, once: true});
        return this[newKey];
      },
      set(value) {
        utils.logCompatibilityWarning(msg, {since: 12, until: 14, once: true});
        this[newKey] = value;
      },
      enumerable: false,
      configurable: true
    });
  }
  return status;
});

/**
 * A mapping of status effect IDs which provide some additional mechanical integration.
 * @type {Record<string, string>}
 */
export const specialStatusEffects= {
  DEFEATED: "dead",
  INVISIBLE: "invisible",
  BLIND: "blind",
  BURROW: "burrow",
  HOVER: "hover",
  FLY: "fly"
};

/**
 * A mapping of core audio effects used which can be replaced by systems or mods
 * @type {Record<string, string>}
 */
export const sounds = {
  dice: "sounds/dice.wav",
  lock: "sounds/lock.wav",
  notification: "sounds/notify.wav",
  combat: "sounds/drums.wav"
};

/**
 * Define the set of supported languages for localization
 * @type {Record<string, string>}
 */
export const supportedLanguages = {
  en: "English"
};

/**
 * Localization constants.
 */
export const i18n = {
  /**
   * In operations involving the document index, search prefixes must have at least this many characters to avoid too
   * large a search space. Languages that have hundreds or thousands of characters will typically have very shallow
   * search trees, so it should be safe to lower this number in those cases.
   */
  searchMinimumCharacterLength: 4
};

/* -------------------------------------------- */
/*  Timekeeping                                 */
/* -------------------------------------------- */

/**
 * Configuration for time tracking.
 */
export const time = {
  /**
   * The Calendar configuration used for in-world timekeeping.
   */
  worldCalendarConfig: data.SIMPLIFIED_GREGORIAN_CALENDAR_CONFIG,

  /**
   * The CalendarData subclass is used for in-world timekeeping.
   */
  worldCalendarClass: data.CalendarData,

  /**
   * The Calendar configuration used for IRL timekeeping.
   */
  earthCalendarConfig: data.SIMPLIFIED_GREGORIAN_CALENDAR_CONFIG,

  /**
   * The CalendarData subclass is used for IRL timekeeping.
   */
  earthCalendarClass: data.CalendarData,

  /**
   * The number of seconds which automatically elapse at the end of a Combat turn.
   * @type {number}
   */
  turnTime: 0,

  /**
   * The number of seconds which automatically elapse at the end of a Combat round.
   * @type {number}
   */
  roundTime: 0,

  /**
   * Formatting functions used to display time data as strings.
   * @type {Record<string, data.TimeFormatter>}
   */
  formatters: {
    timestamp: data.CalendarData.formatTimestamp,
    ago: data.CalendarData.formatAgo
  }
};

/* -------------------------------------------- */
/*  Embedded Documents                          */
/* -------------------------------------------- */

/**
 * Configuration for the ActiveEffect embedded document type
 */
export const ActiveEffect = {
  documentClass: documents.ActiveEffect,
  /** @type {Record<string, typeof TypeDataModel>} */
  dataModels: {},
  /** @type {Record<string, string>} */
  typeLabels: {},
  /** @type {Record<string, string>} */
  typeIcons: {},

  /**
   * If true, Active Effects on Items will be copied to the Actor when the Item is created on the Actor if the
   * Active Effect's transfer property is true, and will be deleted when that Item is deleted from the Actor.
   * If false, Active Effects are never copied to the Actor, but will still apply to the Actor from within the Item
   * if the transfer property on the Active Effect is true.
   * @deprecated since V11. It can be set to true until V14, at which point it will be removed.
   */
  legacyTransferral: false
};

/**
 * Configuration for the ActorDelta embedded document type.
 */
export const ActorDelta = {
  documentClass: documents.ActorDelta
};

/**
 * Configuration for the Card embedded Document type
 */
export const Card = {
  documentClass: documents.Card,
  /** @type {Record<string, typeof TypeDataModel>} */
  dataModels: {},
  /** @type {Record<string, string>} */
  typeLabels: {},
  /** @type {Record<string, string>} */
  typeIcons: {}
};

/**
 * Configuration for the TableResult embedded document type
 */
export const TableResult = {
  documentClass: documents.TableResult
};

/**
 * Configuration for the JournalEntryCategory embedded document type.
 */
export const JournalEntryCategory = {
  documentClass: documents.JournalEntryCategory
};

/**
 * Configuration for the JournalEntryPage embedded document type.
 */
export const JournalEntryPage = {
  documentClass: documents.JournalEntryPage,
  /** @type {Record<string, typeof TypeDataModel>} */
  dataModels: {},
  /** @type {Record<string, string>} */
  typeLabels: {},
  /** @type {Record<string, string>} */
  typeIcons: {
    image: "fa-solid fa-file-image",
    pdf: "fa-solid fa-file-pdf",
    text: "fa-solid fa-file-lines",
    video: "fa-solid fa-file-video"
  },
  defaultType: "text",
  sidebarIcon: "fa-solid fa-book-open"
};

/**
 * Configuration for the PlaylistSound embedded document type
 */
export const PlaylistSound = {
  documentClass: documents.PlaylistSound,
  sidebarIcon: "fa-solid fa-music"
};

/**
 * Configuration for the AmbientLight embedded document type and its representation on the game Canvas
 */
export const AmbientLight = {
  documentClass: documents.AmbientLightDocument,
  objectClass: canvas.placeables.AmbientLight,
  layerClass: canvas.layers.LightingLayer
};

/**
 * Configuration for the AmbientSound embedded document type and its representation on the game Canvas
 */
export const AmbientSound = {
  documentClass: documents.AmbientSoundDocument,
  objectClass: canvas.placeables.AmbientSound,
  layerClass: canvas.layers.SoundsLayer
};

/**
 * Configuration for the Combatant embedded document type within a Combat document
 */
export const Combatant = {
  documentClass: documents.Combatant,
  /** @type {Record<string, typeof DataModel>} */
  dataModels: {},
  /** @type {Record<string, string>} */
  typeLabels: {},
  /** @type {Record<string, string>} */
  typeIcons: {}
};

/**
 * Configuration for the CombatantGroup embedded document type within a Combat document.
 */
export const CombatantGroup = {
  documentClass: documents.CombatantGroup,
  /** @type {Record<string, typeof TypeDataModel>} */
  dataModels: {},
  /** @type {Record<string, string>} */
  typeLabels: {},
  /** @type {Record<string, string>} */
  typeIcons: {}
};

/**
 * Configuration for the Drawing embedded document type and its representation on the game Canvas
 */
export const Drawing = {
  documentClass: documents.DrawingDocument,
  objectClass: canvas.placeables.Drawing,
  layerClass: canvas.layers.DrawingsLayer,
  hudClass: applications.hud.DrawingHUD
};

/**
 * Configuration for the MeasuredTemplate embedded document type and its representation on the game Canvas
 */
export const MeasuredTemplate = {
  defaults: {
    angle: 53.13,
    width: 1
  },
  documentClass: documents.MeasuredTemplateDocument,
  objectClass: canvas.placeables.MeasuredTemplate,
  layerClass: canvas.layers.TemplateLayer,
  /**
   * @deprecated since v13
   * @ignore
   */
  get types() {
    utils.logCompatibilityWarning("CONFIG.MeasuredTemplate.types has been deprecated without replacement. "
    // eslint-disable-next-line no-template-curly-in-string
    + "Use CONST.MEASURED_TEMPLATE_TYPES and `TEMPLATE.TYPES.${type}` instead.", {since: 13, until: 15, once: true});
    return Object.values(CONST.MEASURED_TEMPLATE_TYPES).reduce((types, type) => {
      types[type] = `TEMPLATE.TYPES.${type}`;
      return types;
    }, {});
  }
};

/**
 * Configuration for the Note embedded document type and its representation on the game Canvas
 */
export const Note = {
  documentClass: documents.NoteDocument,
  objectClass: canvas.placeables.Note,
  layerClass: canvas.layers.NotesLayer
};

/**
 * Configuration for the Region embedded document type and its representation on the game Canvas
 */
export const Region = {
  documentClass: documents.RegionDocument,
  objectClass: canvas.placeables.Region,
  layerClass: canvas.layers.RegionLayer
};

/**
 * Configuration for the RegionBehavior embedded document type
 */
export const RegionBehavior = {
  documentClass: documents.RegionBehavior,
  /** @type {Record<string, typeof data.regionBehaviors.RegionBehaviorType>} */
  dataModels: {
    adjustDarknessLevel: data.regionBehaviors.AdjustDarknessLevelRegionBehaviorType,
    displayScrollingText: data.regionBehaviors.DisplayScrollingTextRegionBehaviorType,
    executeMacro: data.regionBehaviors.ExecuteMacroRegionBehaviorType,
    executeScript: data.regionBehaviors.ExecuteScriptRegionBehaviorType,
    modifyMovementCost: data.regionBehaviors.ModifyMovementCostRegionBehaviorType,
    pauseGame: data.regionBehaviors.PauseGameRegionBehaviorType,
    suppressWeather: data.regionBehaviors.SuppressWeatherRegionBehaviorType,
    teleportToken: data.regionBehaviors.TeleportTokenRegionBehaviorType,
    toggleBehavior: data.regionBehaviors.ToggleBehaviorRegionBehaviorType
  },
  /** @type {Record<string, string>} */
  typeLabels: {},
  /** @type {Record<string, string>} */
  typeIcons: {
    adjustDarknessLevel: "fa-solid fa-circle-half-stroke",
    displayScrollingText: "fa-solid fa-message-arrow-up",
    executeMacro: "fa-solid fa-code",
    executeScript: "fa-brands fa-js",
    modifyMovementCost: "fa-solid fa-shoe-prints",
    pauseGame: "fa-solid fa-pause",
    suppressWeather: "fa-solid fa-cloud-slash",
    teleportToken: "fa-solid fa-transporter-1",
    toggleBehavior: "fa-solid fa-sliders"
  }
};

/**
 * Configuration for the Tile embedded document type and its representation on the game Canvas
 */
export const Tile = {
  documentClass: documents.TileDocument,
  objectClass: canvas.placeables.Tile,
  layerClass: canvas.layers.TilesLayer,
  hudClass: applications.hud.TileHUD
};

/**
 * Configuration for the Token embedded document type and its representation on the game Canvas
 */
export const Token = {
  documentClass: documents.TokenDocument,
  objectClass: canvas.placeables.Token,
  layerClass: canvas.layers.TokenLayer,
  prototypeSheetClass: applications.sheets.PrototypeTokenConfig,
  hudClass: applications.hud.TokenHUD,
  rulerClass: canvas.placeables.tokens.TokenRuler,
  movement: {
    /** @type {typeof data.BaseTerrainData} */
    TerrainData: data.TerrainData,
    /**
     * The movement cost aggregator.
     * @type {TokenMovementCostAggregator}
     */
    costAggregator: (results, distance, segment) => {
      results.sort((a, b) => a.cost - b.cost);
      if ( results.at(-1) === Infinity ) return Infinity;
      return results[(results.length - 1) >> 1].cost; // Median cost
    },
    /**
     * The default movement animation speed in grid spaces per second.
     * @type {number}
     */
    defaultSpeed: 6,
    /**
     * @type {string}
     */
    defaultAction: "walk",
    /**
     * @type {{[action: string]: Partial<TokenMovementActionConfig>}}
     */
    actions: {
      walk: {
        label: "TOKEN.MOVEMENT.ACTIONS.walk.label",
        icon: "fa-solid fa-person-walking",
        img: "icons/svg/walk.svg",
        order: 0
      },
      fly: {
        label: "TOKEN.MOVEMENT.ACTIONS.fly.label",
        icon: "fa-solid fa-person-fairy",
        img: "icons/svg/wing.svg",
        order: 1
      },
      swim: {
        label: "TOKEN.MOVEMENT.ACTIONS.swim.label",
        icon: "fa-solid fa-person-swimming",
        img: "icons/svg/whale.svg",
        order: 2,
        // eslint-disable-next-line jsdoc/require-description
        /** @type {typeof TokenMovementActionConfig#getAnimationOptions} */
        getAnimationOptions: () => ({movementSpeed: CONFIG.Token.movement.defaultSpeed / 2})
      },
      burrow: {
        label: "TOKEN.MOVEMENT.ACTIONS.burrow.label",
        icon: "fa-solid fa-person-digging",
        img: "icons/svg/burrow.svg",
        order: 3
      },
      crawl: {
        label: "TOKEN.MOVEMENT.ACTIONS.crawl.label",
        icon: "fa-solid fa-person-praying",
        img: "icons/svg/leg.svg",
        order: 4,
        // eslint-disable-next-line jsdoc/require-description
        /** @type {typeof TokenMovementActionConfig#getAnimationOptions} */
        getAnimationOptions: () => ({movementSpeed: CONFIG.Token.movement.defaultSpeed / 2}),
        deriveTerrainDifficulty: ({walk}) => walk,
        getCostFunction: () => cost => cost * 2
      },
      climb: {
        label: "TOKEN.MOVEMENT.ACTIONS.climb.label",
        icon: "fa-solid fa-person-through-window",
        img: "icons/svg/ladder.svg",
        order: 5,
        // eslint-disable-next-line jsdoc/require-description
        /** @type {typeof TokenMovementActionConfig#getAnimationOptions} */
        getAnimationOptions: () => ({movementSpeed: CONFIG.Token.movement.defaultSpeed / 2}),
        deriveTerrainDifficulty: ({walk}) => walk,
        getCostFunction: () => cost => cost * 2
      },
      jump: {
        label: "TOKEN.MOVEMENT.ACTIONS.jump.label",
        icon: "fa-solid fa-person-running-fast",
        img: "icons/svg/jump.svg",
        order: 6,
        deriveTerrainDifficulty: ({walk, fly}) => Math.max(walk, fly),
        getCostFunction: () => cost => cost * 2
      },
      blink: {
        label: "TOKEN.MOVEMENT.ACTIONS.blink.label",
        icon: "fa-solid fa-person-from-portal",
        img: "icons/svg/teleport.svg",
        order: 7,
        teleport: true,
        getAnimationOptions: () => ({duration: 0}),
        deriveTerrainDifficulty: () => 1
      },
      displace: {
        label: "TOKEN.MOVEMENT.ACTIONS.displace.label",
        icon: "fa-solid fa-transporter-1",
        img: "icons/svg/portal.svg",
        order: 8,
        teleport: true,
        measure: false,
        walls: null,
        visualize: false,
        getAnimationOptions: () => ({duration: 0}),
        canSelect: () => false,
        deriveTerrainDifficulty: () => 1,
        getCostFunction: () => () => 0
      }
    }
  },
  adjectivesPrefix: "TOKEN.Adjectives",
  ring: new canvas.placeables.tokens.TokenRingConfig()
};

/**
 * @typedef WallDoorSound
 * @property {string} label              A localization string label
 * @property {string|string[]} [close]   One or more sound paths for when the door is closed
 * @property {string|string[]} [lock]    One or more sound paths for when the door becomes locked
 * @property {string|string[]} [open]    One or more sound paths for when opening the door
 * @property {string|string[]} [test]    One or more sound paths for when attempting to open a locked door
 * @property {string|string[]} [unlock]  One or more sound paths for when the door becomes unlocked
 */

/**
 * @callback WallDoorAnimationFunction
 * @param {boolean} open
 * @returns {CanvasAnimationAttribute[]}
 */

/**
 * @callback WallDoorAnimationHook
 * @param {boolean} open
 * @returns {Promise<void>|void}
 */

/**
 * @typedef WallDoorAnimationConfig
 * @property {string} label
 * @property {boolean} [midpoint=false]
 * @property {string|Function} [easing="easeInOutCosine"]
 * @property {WallDoorAnimationHook} [initialize]
 * @property {WallDoorAnimationHook} [preAnimate]
 * @property {WallDoorAnimationFunction} animate
 * @property {WallDoorAnimationHook} [postAnimate]
 * @property {number} duration
 */

/**
 * Configuration for the Wall embedded document type and its representation on the game Canvas
 * @property {typeof ClientDocument} documentClass
 * @property {typeof canvas.placeables.PlaceableObject} objectClass
 * @property {typeof canvas.layers.CanvasLayer} layerClass
 * @property {number} thresholdAttenuationMultiplier
 * @property {Record<string, WallDoorSound>} doorSounds
 */
export const Wall = {
  documentClass: documents.WallDocument,
  objectClass: canvas.placeables.Wall,
  layerClass: canvas.layers.WallsLayer,
  /**
   * The set of animation types that are supported for Wall door animations.
   * @type {Record<string, WallDoorAnimationConfig>}
   */
  animationTypes: {
    ascend: {
      label: "WALL.ANIMATION_TYPES.ASCEND",
      midpoint: true,
      animate: canvas.containers.DoorMesh.animateAscend,
      duration: 1000
    },
    descend: {
      label: "WALL.ANIMATION_TYPES.DESCEND",
      midpoint: true,
      initialize: canvas.containers.DoorMesh.initializeDescend,
      animate: canvas.containers.DoorMesh.animateDescend,
      preAnimate: canvas.containers.DoorMesh.preAnimateDescend,
      postAnimate: canvas.containers.DoorMesh.postAnimateDescend,
      duration: 1000
    },
    slide: {
      label: "WALL.ANIMATION_TYPES.SLIDE",
      animate: canvas.containers.DoorMesh.animateSlide,
      duration: 500
    },
    swing: {
      label: "WALL.ANIMATION_TYPES.SWING",
      animate: canvas.containers.DoorMesh.animateSwing,
      duration: 500
    },
    swivel: {
      label: "WALL.ANIMATION_TYPES.SWIVEL",
      midpoint: true,
      animate: canvas.containers.DoorMesh.animateSwing,
      duration: 500
    }
  },
  /** @type {Record<string, WallDoorSound>} */
  doorSounds: {
    futuristicFast: {
      label: "WALL.DoorSounds.FuturisticFast",
      close: "sounds/doors/futuristic/close-fast.ogg",
      lock: "sounds/doors/futuristic/lock.ogg",
      open: "sounds/doors/futuristic/open-fast.ogg",
      test: "sounds/doors/futuristic/test.ogg",
      unlock: "sounds/doors/futuristic/unlock.ogg"
    },
    futuristicHydraulic: {
      label: "WALL.DoorSounds.FuturisticHydraulic",
      close: "sounds/doors/futuristic/close-hydraulic.ogg",
      lock: "sounds/doors/futuristic/lock.ogg",
      open: "sounds/doors/futuristic/open-hydraulic.ogg",
      test: "sounds/doors/futuristic/test.ogg",
      unlock: "sounds/doors/futuristic/unlock.ogg"
    },
    futuristicForcefield: {
      label: "WALL.DoorSounds.FuturisticForcefield",
      close: "sounds/doors/futuristic/close-forcefield.ogg",
      lock: "sounds/doors/futuristic/lock.ogg",
      open: "sounds/doors/futuristic/open-forcefield.ogg",
      test: "sounds/doors/futuristic/test-forcefield.ogg",
      unlock: "sounds/doors/futuristic/unlock.ogg"
    },
    industrial: {
      label: "WALL.DoorSounds.Industrial",
      close: "sounds/doors/industrial/close.ogg",
      lock: "sounds/doors/industrial/lock.ogg",
      open: "sounds/doors/industrial/open.ogg",
      test: "sounds/doors/industrial/test.ogg",
      unlock: "sounds/doors/industrial/unlock.ogg"
    },
    industrialCreaky: {
      label: "WALL.DoorSounds.IndustrialCreaky",
      close: "sounds/doors/industrial/close-creaky.ogg",
      lock: "sounds/doors/industrial/lock.ogg",
      open: "sounds/doors/industrial/open-creaky.ogg",
      test: "sounds/doors/industrial/test.ogg",
      unlock: "sounds/doors/industrial/unlock.ogg"
    },
    jail: {
      label: "WALL.DoorSounds.Jail",
      close: "sounds/doors/jail/close.ogg",
      lock: "sounds/doors/jail/lock.ogg",
      open: "sounds/doors/jail/open.ogg",
      test: "sounds/doors/jail/test.ogg",
      unlock: "sounds/doors/jail/unlock.ogg"
    },
    magicDoor: {
      label: "WALL.DoorSounds.MagicDoor",
      close: "sounds/doors/magic/door-close.ogg",
      lock: "sounds/doors/magic/lock.ogg",
      open: "sounds/doors/magic/door-open.ogg",
      test: "sounds/doors/magic/test.ogg",
      unlock: "sounds/doors/magic/unlock.ogg"
    },
    magicWall: {
      label: "WALL.DoorSounds.MagicWall",
      close: "sounds/doors/magic/wall-close.ogg",
      lock: "sounds/doors/magic/lock.ogg",
      open: "sounds/doors/magic/wall-open.ogg",
      test: "sounds/doors/magic/test.ogg",
      unlock: "sounds/doors/magic/unlock.ogg"
    },
    metal: {
      label: "WALL.DoorSounds.Metal",
      close: "sounds/doors/metal/close.ogg",
      lock: "sounds/doors/metal/lock.ogg",
      open: "sounds/doors/metal/open.ogg",
      test: "sounds/doors/metal/test.ogg",
      unlock: "sounds/doors/metal/unlock.ogg"
    },
    slidingMetal: {
      label: "WALL.DoorSounds.SlidingMetal",
      close: "sounds/doors/shutter/close.ogg",
      lock: "sounds/doors/shutter/lock.ogg",
      open: "sounds/doors/shutter/open.ogg",
      test: "sounds/doors/shutter/test.ogg",
      unlock: "sounds/doors/shutter/unlock.ogg"
    },
    slidingMetalHeavy: {
      label: "WALL.DoorSounds.SlidingMetalHeavy",
      close: "sounds/doors/metal/heavy-sliding-close.ogg",
      lock: "sounds/doors/metal/heavy-sliding-lock.ogg",
      open: "sounds/doors/metal/heavy-sliding-open.ogg",
      test: "sounds/doors/metal/heavy-sliding-test.ogg",
      unlock: "sounds/doors/metal/heavy-sliding-unlock.ogg"
    },
    slidingModern: {
      label: "WALL.DoorSounds.SlidingModern",
      close: "sounds/doors/sliding/close.ogg",
      lock: "sounds/doors/sliding/lock.ogg",
      open: "sounds/doors/sliding/open.ogg",
      test: "sounds/doors/sliding/test.ogg",
      unlock: "sounds/doors/sliding/unlock.ogg"
    },
    slidingWood: {
      label: "WALL.DoorSounds.SlidingWood",
      close: "sounds/doors/sliding/close-wood.ogg",
      lock: "sounds/doors/sliding/lock.ogg",
      open: "sounds/doors/sliding/open-wood.ogg",
      test: "sounds/doors/sliding/test.ogg",
      unlock: "sounds/doors/sliding/unlock.ogg"
    },
    stoneBasic: {
      label: "WALL.DoorSounds.StoneBasic",
      close: "sounds/doors/stone/close.ogg",
      lock: "sounds/doors/stone/lock.ogg",
      open: "sounds/doors/stone/open.ogg",
      test: "sounds/doors/stone/test.ogg",
      unlock: "sounds/doors/stone/unlock.ogg"
    },
    stoneRocky: {
      label: "WALL.DoorSounds.StoneRocky",
      close: "sounds/doors/stone/close-rocky.ogg",
      lock: "sounds/doors/stone/lock.ogg",
      open: "sounds/doors/stone/open-rocky.ogg",
      test: "sounds/doors/stone/test.ogg",
      unlock: "sounds/doors/stone/unlock.ogg"
    },
    stoneSandy: {
      label: "WALL.DoorSounds.StoneSandy",
      close: "sounds/doors/stone/close-sandy.ogg",
      lock: "sounds/doors/stone/lock.ogg",
      open: "sounds/doors/stone/open-sandy.ogg",
      test: "sounds/doors/stone/test.ogg",
      unlock: "sounds/doors/stone/unlock.ogg"
    },
    woodBasic: {
      label: "WALL.DoorSounds.WoodBasic",
      close: "sounds/doors/wood/close.ogg",
      lock: "sounds/doors/wood/lock.ogg",
      open: "sounds/doors/wood/open.ogg",
      test: "sounds/doors/wood/test.ogg",
      unlock: "sounds/doors/wood/unlock.ogg"
    },
    woodCreaky: {
      label: "WALL.DoorSounds.WoodCreaky",
      close: "sounds/doors/wood/close-creaky.ogg",
      lock: "sounds/doors/wood/lock.ogg",
      open: "sounds/doors/wood/open-creaky.ogg",
      test: "sounds/doors/wood/test.ogg",
      unlock: "sounds/doors/wood/unlock.ogg"
    },
    woodHeavy: {
      label: "WALL.DoorSounds.WoodHeavy",
      close: "sounds/doors/wood/close-heavy.ogg",
      lock: "sounds/doors/wood/lock.ogg",
      open: "sounds/doors/wood/open-heavy.ogg",
      test: "sounds/doors/wood/test.ogg",
      unlock: "sounds/doors/wood/unlock.ogg"
    }
  },
  /**
   * A default grid size in pixels which is used for rendering DoorMesh sizing.
   * @type {number}
   */
  textureGridSize: 200,
  thresholdAttenuationMultiplier: 1
};

/**
 * An enumeration of sound effects which can be applied to Sound instances.
 * @type {Record<string, {label: string, effectClass: typeof BiquadFilterNode|typeof ConvolverNode}>}
 */
export const soundEffects = {
  lowpass: {
    label: "SOUND.EFFECTS.LOWPASS",
    effectClass: audio.BiquadFilterEffect
  },
  highpass: {
    label: "SOUND.EFFECTS.HIGHPASS",
    effectClass: audio.BiquadFilterEffect
  },
  reverb: {
    label: "SOUND.EFFECTS.REVERB",
    effectClass: audio.ConvolverEffect
  }
};

/* -------------------------------------------- */
/*  Integrations                                */
/* -------------------------------------------- */

/**
 * Default configuration options for TinyMCE editors
 */
export const TinyMCE = {
  branding: false,
  menubar: false,
  statusbar: false,
  content_css: ["/css/mce.css"],
  plugins: "lists image table code save link",
  toolbar: "styles bullist numlist image table hr link removeformat code save",
  save_enablewhendirty: true,
  table_default_styles: {},
  style_formats: [
    {
      title: "Custom",
      items: [
        {
          title: "Secret",
          block: "section",
          classes: "secret",
          wrapper: true
        }
      ]
    }
  ],
  style_formats_merge: true
};

/**
 * @callback TextEditorEnricher
 * @param {RegExpMatchArray} match          The regular expression match result
 * @param {EnrichmentOptions} [options]     Options provided to customize text enrichment
 * @returns {Promise<HTMLElement|null>}     An HTML element to insert in place of the matched text or null to
 *                                          indicate that no replacement should be made.
 */

/**
 * @typedef TextEditorEnricherConfig
 * @property {string} [id]                  A unique ID to assign to the enricher type. Required if you want to use
 *                                          the onRender callback.
 * @property {RegExp} pattern               The string pattern to match. Must be flagged as global.
 * @property {TextEditorEnricher} enricher  The function that will be called on each match. It is expected that this
 *                                          returns an HTML element to be inserted into the final enriched content.
 * @property {boolean} [replaceParent]      Hoist the replacement element out of its containing element if it replaces
 *                                          the entire contents of the element.
 * @property {function(HTMLEnrichedContentElement)} [onRender]  An optional callback that is invoked when the
 *                                          enriched content is added to the DOM.
 */

/**
 * Rich text editing configuration.
 */
export const TextEditor = {
  /**
   * A collection of custom enrichers that can be applied to text content, allowing for the matching and handling of
   * custom patterns.
   * @type {TextEditorEnricherConfig[]}
   */
  enrichers: []
};

/**
 * Configuration for the WebRTC implementation class
 */
export const WebRTC = {
  clientClass: av.clients.SimplePeerAVClient,
  detectPeerVolumeInterval: 50,
  detectSelfVolumeInterval: 20,
  emitVolumeInterval: 25,
  speakingThresholdEvents: 2,
  speakingHistoryLength: 10,
  connectedUserPollIntervalS: 8
};

/* -------------------------------------------- */
/*  Interface                                   */
/* -------------------------------------------- */

/**
 * Configure the Application classes used to render various core UI elements in the application.
 * The order of this object is relevant, as certain classes need to be constructed and referenced before others.
 */
export const ui = {
  menu: applications.ui.MainMenu,
  sidebar: applications.sidebar.Sidebar,
  pause: applications.ui.GamePause,
  nav: applications.ui.SceneNavigation,
  notifications: applications.ui.Notifications,
  actors: applications.sidebar.tabs.ActorDirectory,
  cards: applications.sidebar.tabs.CardsDirectory,
  chat: applications.sidebar.tabs.ChatLog,
  combat: applications.sidebar.tabs.CombatTracker,
  compendium: applications.sidebar.tabs.CompendiumDirectory,
  controls: applications.ui.SceneControls,
  hotbar: applications.ui.Hotbar,
  items: applications.sidebar.tabs.ItemDirectory,
  journal: applications.sidebar.tabs.JournalDirectory,
  macros: applications.sidebar.tabs.MacroDirectory,
  players: applications.ui.Players,
  playlists: applications.sidebar.tabs.PlaylistDirectory,
  scenes: applications.sidebar.tabs.SceneDirectory,
  settings: applications.sidebar.tabs.Settings,
  tables: applications.sidebar.tabs.RollTableDirectory,
  webrtc: applications.apps.av.CameraViews
};

/**
 * Overrides for various core UI/UX helpers.
 */
export const ux = {
  ContextMenu: applications.ux.ContextMenu,
  Draggable: applications.ux.Draggable,
  DragDrop: applications.ux.DragDrop,
  FilePicker: applications.apps.FilePicker,
  TextEditor: applications.ux.TextEditor,
  TooltipManager: helpers.interaction.TooltipManager
};

/**
 * System and modules must prefix the names of the queries they register (e.g. "my-module.aCustomQuery").
 * Non-prefixed query names are reserved by core.
 */
export const queries = {
  dialog: applications.api.DialogV2._handleQuery,
  confirmTeleportToken: data.regionBehaviors.TeleportTokenRegionBehaviorType._confirmQuery
};

/**
 * @typedef CursorDescriptor
 * @property {string} url  The URL of the cursor image. Must be no larger than 128x128. 32x32 is recommended.
 * @property {number} [x]  The X co-ordinate of the cursor hotspot.
 * @property {number} [y]  The Y co-ordinate of the cursor hotspot.
 */

/**
 * Configure custom cursor images to use when interacting with the application.
 * @type {{
 *  default: string|CursorDescriptor,
 *  "default-down": string|CursorDescriptor,
 *  pointer: string|CursorDescriptor,
 *  "pointer-down": string|CursorDescriptor,
 *  grab: string|CursorDescriptor,
 *  "grab-down": string|CursorDescriptor,
 *  text: string|CursorDescriptor,
 *  "text-down": string|CursorDescriptor
 * }}
 *
 * @example Configuring a cursor with a hotspot in the default top-left.
 * ```js
 * Object.assign(CONFIG.cursors, {
 *   default: "icons/cursors/default.avif",
 *   "default-down": "icons/cursors/default-down.avif"
 * });
 * ```
 *
 * @example Configuring a cursor with a hotspot in the center.
 * ```js
 * Object.assign(CONFIG.cursors, {
 *   default: { url: "icons/cursors/target.avif", x: 16, y: 16 },
 *   "default-down": { url: "icons/cursors/target-down.avif", x: 16, y: 16 }
 * });
 * ```
 */
export const cursors = {...CONST.CURSOR_STYLES};

// Lock the CONFIG.Token.ring property so it cannot be overwritten or redefined
Object.defineProperties(Token, {ring: {writable: false, configurable: false}});

// Lock the CONFIG.Combat.settings property so it cannot be overwritten or redefined
Object.defineProperties(Combat, {settings: {writable: false, configurable: false}});

/* -------------------------------------------- */
/*  Deprecations and Compatibility              */
/* -------------------------------------------- */

/**
 * @deprecated since v13
 * @ignore
 */
Object.values(Dice.rollModes).forEach(mode => {
  Object.defineProperties(mode, {toString: { value: function() {
    utils.logCompatibilityWarning("The values of entries in CONFIG.Dice.rollModes have changed to objects. "
      + "The label value can now be accessed via the label property.", {since: 13, until: 15, once: true});
    return mode.label;
  }}});
});

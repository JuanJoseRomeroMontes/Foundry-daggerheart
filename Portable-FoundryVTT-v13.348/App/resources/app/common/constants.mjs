/**
 * Constant definitions used throughout the Foundry Virtual Tabletop framework.
 * @module CONST
 */

import {deepFreeze} from "./utils/helpers.mjs";

/**
 * The shortened software name
 */
export const vtt = "Foundry VTT";

/**
 * The full software name
 */
export const VTT = "Foundry Virtual Tabletop";

/**
 * The software website URL
 */
export const WEBSITE_URL = "https://foundryvtt.com";

/**
 * The serverless API URL
 */
export const WEBSITE_API_URL = "https://api.foundryvtt.com";

/**
 * An ASCII greeting displayed to the client
 * @type {string}
 */
export const ASCII = `_______________________________________________________________
 _____ ___  _   _ _   _ ____  ______   __ __     _______ _____
|  ___/ _ \\| | | | \\ | |  _ \\|  _ \\ \\ / / \\ \\   / |_   _|_   _|
| |_ | | | | | | |  \\| | | | | |_) \\ V /   \\ \\ / /  | |   | |
|  _|| |_| | |_| | |\\  | |_| |  _ < | |     \\ V /   | |   | |
|_|   \\___/ \\___/|_| \\_|____/|_| \\_\\|_|      \\_/    |_|   |_|
===============================================================`;

/**
 * Define the allowed ActiveEffect application modes.
 * Other arbitrary mode numbers can be used by systems and modules to identify special behaviors and are ignored
 */
export const ACTIVE_EFFECT_MODES = Object.freeze({
  /**
   * Used to denote that the handling of the effect is programmatically provided by a system or module.
   */
  CUSTOM: 0,

  /**
   * Multiplies a numeric base value by the numeric effect value
   * @example
   * 2 (base value) * 3 (effect value) = 6 (derived value)
   */
  MULTIPLY: 1,

  /**
   * Adds a numeric base value to a numeric effect value, or concatenates strings
   * @example
   * 2 (base value) + 3 (effect value) = 5 (derived value)
   * @example
   * "Hello" (base value) + " World" (effect value) = "Hello World"
   */
  ADD: 2,

  /**
   * Keeps the lower value of the base value and the effect value
   * @example
   * 2 (base value), 0 (effect value) = 0 (derived value)
   * @example
   * 2 (base value), 3 (effect value) = 2 (derived value)
   */
  DOWNGRADE: 3,

  /**
   * Keeps the greater value of the base value and the effect value
   * @example
   * 2 (base value), 4 (effect value) = 4 (derived value)
   * @example
   * 2 (base value), 1 (effect value) = 2 (derived value)
   */
  UPGRADE: 4,

  /**
   * Directly replaces the base value with the effect value
   * @example
   * 2 (base value), 4 (effect value) = 4 (derived value)
   */
  OVERRIDE: 5
});

/**
 * Define the string name used for the base document type when specific sub-types are not defined by the system
 */
export const BASE_DOCUMENT_TYPE = "base";

/**
 * Define the methods by which a Card can be drawn from a Cards stack
 */
export const CARD_DRAW_MODES = Object.freeze({
  /**
   * Draw the first card from the stack
   * Synonymous with `TOP`
   */
  FIRST: 0,

  /**
   * Draw the top card from the stack
   * Synonymous with `FIRST`
   */
  TOP: 0,

  /**
   * Draw the last card from the stack
   * Synonymous with `BOTTOM`
   */
  LAST: 1,

  /**
   * Draw the bottom card from the stack
   * Synonymous with `LAST`
   */
  BOTTOM: 1,

  /**
   * Draw a random card from the stack
   */
  RANDOM: 2
});

/**
 * An enumeration of canvas performance modes.
 */
export const CANVAS_PERFORMANCE_MODES = Object.freeze({
  LOW: 0,
  MED: 1,
  HIGH: 2,
  MAX: 3
});

/**
 * @typedef {typeof CANVAS_PERFORMANCE_MODES[keyof typeof CANVAS_PERFORMANCE_MODES]} CanvasPerformanceMode
 */

/**
 * Valid Chat Message styles which affect how the message is presented in the chat log.
 */
export const CHAT_MESSAGE_STYLES = /** @type {const} */ ({
  /**
   * An uncategorized chat message
   */
  OTHER: 0,

  /**
   * The message is spoken out of character (OOC).
   * OOC messages will be outlined by the player's color to make them more easily recognizable.
   */
  OOC: 1,

  /**
   * The message is spoken by an associated character.
   */
  IC: 2,

  /**
   * The message is an emote performed by the selected character.
   * Entering "/emote waves his hand." while controlling a character named Simon will send the message, "Simon waves his
   * hand."
   */
  EMOTE: 3
});
Object.defineProperties(CHAT_MESSAGE_STYLES, {
  /** @deprecated since v12 */
  ROLL: {
    get() {
      foundry.utils.logCompatibilityWarning("CONST.CHAT_MESSAGE_STYLES.ROLL is deprecated in favor of defining "
          + "rolls directly in ChatMessage#rolls", {since: 12, until: 14, once: true});
      return 0;
    }
  },
  /** @deprecated since v12 */
  WHISPER: {
    get() {
      foundry.utils.logCompatibilityWarning("CONST.CHAT_MESSAGE_STYLES.WHISPER is deprecated in favor of defining "
        + "whisper recipients directly in ChatMessage#whisper", {since: 12, until: 14, once: true});
      return 0;
    }
  }
});
Object.freeze(CHAT_MESSAGE_STYLES);

/**
 * @typedef {typeof CHAT_MESSAGE_STYLES[keyof typeof CHAT_MESSAGE_STYLES]} ChatMessageStyle
 */

/**
 * Define the set of languages which have built-in support in the core software.
 */
export const CORE_SUPPORTED_LANGUAGES = Object.freeze(["en"]);

/**
 * Configure the severity of compatibility warnings.
 */
export const COMPATIBILITY_MODES = Object.freeze({
  /**
   * Nothing will be logged
   */
  SILENT: 0,

  /**
   * A message will be logged at the "warn" level
   */
  WARNING: 1,

  /**
   * A message will be logged at the "error" level
   */
  ERROR: 2,

  /**
   * An Error will be thrown
   */
  FAILURE: 3
});


/**
 * Configure custom cursor images to use when interacting with the application.
 */
export const CURSOR_STYLES = Object.freeze({
  default: "default",
  "default-down": "default",
  pointer: "pointer",
  "pointer-down": "pointer",
  grab: "grab",
  "grab-down": "grabbing",
  text: "text",
  "text-down": "text"
});

/**
 * The lighting illumination levels which are supported.
 */
export const LIGHTING_LEVELS = Object.freeze({
  DARKNESS: -2,
  HALFDARK: -1,
  UNLIT: 0,
  DIM: 1,
  BRIGHT: 2,
  BRIGHTEST: 3
});

/**
 * @typedef {typeof LIGHTING_LEVELS[keyof typeof LIGHTING_LEVELS]} LightingLevel
 */

/**
 * The CSS themes which are currently supported for the V11 Setup menu.
 */
export const CSS_THEMES = Object.freeze({
  dark: "THEME.foundry",
  fantasy: "THEME.fantasy",
  scifi: "THEME.scifi"
});

/**
 * The default artwork used for Token images if none is provided
 */
export const DEFAULT_TOKEN = "icons/svg/mystery-man.svg";

/**
 * The primary Document types.
 */
export const PRIMARY_DOCUMENT_TYPES = Object.freeze([
  "Actor",
  "Adventure",
  "Cards",
  "ChatMessage",
  "Combat",
  "FogExploration",
  "Folder",
  "Item",
  "JournalEntry",
  "Macro",
  "Playlist",
  "RollTable",
  "Scene",
  "Setting",
  "User"
]);

/**
 * The embedded Document types.
 */
export const EMBEDDED_DOCUMENT_TYPES = Object.freeze([
  "ActiveEffect",
  "ActorDelta",
  "AmbientLight",
  "AmbientSound",
  "Card",
  "Combatant",
  "CombatantGroup",
  "Drawing",
  "Item",
  "JournalEntryCategory",
  "JournalEntryPage",
  "MeasuredTemplate",
  "Note",
  "PlaylistSound",
  "Region",
  "RegionBehavior",
  "TableResult",
  "Tile",
  "Token",
  "Wall"
]);

/**
 * A listing of all valid Document types, both primary and embedded.
 * @type {readonly ["ActiveEffect", "Actor", "ActorDelta", "Adventure", "AmbientLight", "AmbientSound", "Card", "Cards",
 *   "ChatMessage", "Combat", "Combatant", "CombatantGroup", "Drawing", "FogExploration", "Folder", "Item",
 *   "JournalEntry", "JournalEntryCategory", "JournalEntryPage", "Macro", "MeasuredTemplate", "Note", "Playlist",
 *   "PlaylistSound", "Region", "RegionBehavior", "RollTable", "Scene", "Setting", "TableResult", "Tile", "Token",
 *   "User", "Wall"]}
 */
export const ALL_DOCUMENT_TYPES = Object.freeze(Array.from(new Set([
  ...PRIMARY_DOCUMENT_TYPES,
  ...EMBEDDED_DOCUMENT_TYPES
])).sort());

/**
 * The allowed primary Document types which may exist within a World.
 */
export const WORLD_DOCUMENT_TYPES = Object.freeze([
  "Actor",
  "Cards",
  "ChatMessage",
  "Combat",
  "FogExploration",
  "Folder",
  "Item",
  "JournalEntry",
  "Macro",
  "Playlist",
  "RollTable",
  "Scene",
  "Setting",
  "User"
]);

/**
 * The allowed primary Document types which may exist within a Compendium pack.
 */
export const COMPENDIUM_DOCUMENT_TYPES = Object.freeze([
  "Actor",
  "Adventure",
  "Cards",
  "Item",
  "JournalEntry",
  "Macro",
  "Playlist",
  "RollTable",
  "Scene"
]);

/**
 * Define the allowed ownership levels for a Document.
 * Each level is assigned a value in ascending order.
 * Higher levels grant more permissions.
 * @see {@link https://foundryvtt.com/article/users/}
 */
export const DOCUMENT_OWNERSHIP_LEVELS = Object.freeze({
  /**
   * The User inherits permissions from the parent Folder.
   */
  INHERIT: -1,

  /**
   * Restricts the associated Document so that it may not be seen by this User.
   */
  NONE: 0,

  /**
   * Allows the User to interact with the Document in basic ways, allowing them to see it in sidebars and see only
   * limited aspects of its contents. The limits of this interaction are defined by the game system being used.
   */
  LIMITED: 1,

  /**
   * Allows the User to view this Document as if they were owner, but prevents them from making any changes to it.
   */
  OBSERVER: 2,

  /**
   * Allows the User to view and make changes to the Document as its owner. Owned documents cannot be deleted by anyone
   * other than a gamemaster level User.
   */
  OWNER: 3
});

/**
 * @typedef {typeof DOCUMENT_OWNERSHIP_LEVELS[keyof typeof DOCUMENT_OWNERSHIP_LEVELS]} DocumentOwnershipNumber
 * @typedef {keyof typeof DOCUMENT_OWNERSHIP_LEVELS|DocumentOwnershipNumber} DocumentOwnershipLevel
 */

/**
 * Meta ownership levels that are used in the UI but never stored.
 */
export const DOCUMENT_META_OWNERSHIP_LEVELS = Object.freeze({
  DEFAULT: -20,
  NOCHANGE: -10
});

/**
 * Define the allowed Document types which may be dynamically linked in chat
 */
export const DOCUMENT_LINK_TYPES = Object.freeze(["Actor", "Cards", "Item", "Scene", "JournalEntry", "Macro",
  "RollTable", "PlaylistSound"]);

/**
 * The supported dice roll visibility modes
 * @see {@link https://foundryvtt.com/article/dice/}
 */
export const DICE_ROLL_MODES = Object.freeze({
  /**
   * This roll is visible to all players.
   */
  PUBLIC: "publicroll",

  /**
   * Rolls of this type are only visible to the player that rolled and any Game Master users.
   */
  PRIVATE: "gmroll",

  /**
   * A private dice roll only visible to Gamemaster users. The rolling player will not see the result of their own roll.
   */
  BLIND: "blindroll",

  /**
   * A private dice roll which is only visible to the user who rolled it.
   */
  SELF: "selfroll"
});

/**
 * The allowed fill types which a Drawing object may display
 * @see {@link https://foundryvtt.com/article/drawings/}
 */
export const DRAWING_FILL_TYPES = Object.freeze({
  /**
   * The drawing is not filled
   */
  NONE: 0,

  /**
   * The drawing is filled with a solid color
   */
  SOLID: 1,

  /**
   * The drawing is filled with a tiled image pattern
   */
  PATTERN: 2
});

/**
 * Define the allowed Document types which Folders may contain
 */
export const FOLDER_DOCUMENT_TYPES = Object.freeze(["Actor", "Adventure", "Item", "Scene", "JournalEntry", "Playlist",
  "RollTable", "Cards", "Macro", "Compendium"]);

/**
 * The maximum allowed level of depth for Folder nesting
 */
export const FOLDER_MAX_DEPTH = 4;

/**
 * A list of allowed game URL names
 */
export const GAME_VIEWS = Object.freeze(["game", "stream"]);

/**
 * The directions of movement.
 */
export const MOVEMENT_DIRECTIONS = Object.freeze({
  UP: 0x1,
  DOWN: 0x2,
  LEFT: 0x4,
  RIGHT: 0x8,
  UP_LEFT: /** @type {5} */ (0x1 | 0x4),
  UP_RIGHT: /** @type {9} */ (0x1 | 0x8),
  DOWN_LEFT: /** @type {6} */ (0x2 | 0x4),
  DOWN_RIGHT: /** @type {10} */ (0x2 | 0x8),
  DESCEND: 0x10,
  ASCEND: 0x20
});

/**
 * The minimum allowed grid size which is supported by the software
 */
export const GRID_MIN_SIZE = 20;

/**
 * The allowed Grid types which are supported by the software
 * @see {@link https://foundryvtt.com/article/scenes/}
 */
export const GRID_TYPES = Object.freeze({
  /**
   * No fixed grid is used on this Scene allowing free-form point-to-point measurement without grid lines.
   */
  GRIDLESS: 0,

  /**
   * A square grid is used with width and height of each grid space equal to the chosen grid size.
   */
  SQUARE: 1,

  /**
   * A row-wise hexagon grid (pointy-topped) where odd-numbered rows are offset.
   */
  HEXODDR: 2,

  /**
   * A row-wise hexagon grid (pointy-topped) where even-numbered rows are offset.
   */
  HEXEVENR: 3,

  /**
   * A column-wise hexagon grid (flat-topped) where odd-numbered columns are offset.
   */
  HEXODDQ: 4,

  /**
   * A column-wise hexagon grid (flat-topped) where even-numbered columns are offset.
   */
  HEXEVENQ: 5
});

/**
 * @typedef {typeof GRID_TYPES[keyof typeof GRID_TYPES]} GridType
 */

/**
 * The different rules to define and measure diagonal distance/cost in a square grid.
 * The description of each option refers to the distance/cost of moving diagonally relative to the distance/cost of a
 * horizontal or vertical move.
 */
export const GRID_DIAGONALS = Object.freeze({
  /**
   * The diagonal distance is 1. Diagonal movement costs the same as horizontal/vertical movement.
   */
  EQUIDISTANT: 0,

  /**
   * The diagonal distance is √2. Diagonal movement costs √2 times as much as horizontal/vertical movement.
   */
  EXACT: 1,

  /**
   * The diagonal distance is 1.5. Diagonal movement costs 1.5 times as much as horizontal/vertical movement.
   */
  APPROXIMATE: 2,

  /**
   * The diagonal distance is 2. Diagonal movement costs 2 times as much as horizontal/vertical movement.
   */
  RECTILINEAR: 3,

  /**
   * The diagonal distance alternates between 1 and 2 starting at 1.
   * The first diagonal movement costs the same as horizontal/vertical movement
   * The second diagonal movement costs 2 times as much as horizontal/vertical movement.
   * And so on...
   */
  ALTERNATING_1: 4,

  /**
   * The diagonal distance alternates between 2 and 1 starting at 2.
   * The first diagonal movement costs 2 times as much as horizontal/vertical movement.
   * The second diagonal movement costs the same as horizontal/vertical movement.
   * And so on...
   */
  ALTERNATING_2: 5,

  /**
   * The diagonal distance is ∞. Diagonal movement is not allowed/possible.
   */
  ILLEGAL: 6
});

/**
 * @typedef {typeof GRID_DIAGONALS[keyof typeof GRID_DIAGONALS]} GridDiagonalRule
 */

/**
 * The grid snapping modes.
 */
export const GRID_SNAPPING_MODES = Object.freeze({
  /**
   * Nearest center point.
   */
  CENTER: 0x1,

  /**
   * Nearest edge midpoint.
   */
  EDGE_MIDPOINT: 0x2,

  /**
   * Nearest top-left vertex.
   */
  TOP_LEFT_VERTEX: 0x10,

  /**
   * Nearest top-right vertex.
   */
  TOP_RIGHT_VERTEX: 0x20,

  /**
   * Nearest bottom-left vertex.
   */
  BOTTOM_LEFT_VERTEX: 0x40,

  /**
   * Nearest bottom-right vertex.
   */
  BOTTOM_RIGHT_VERTEX: 0x80,

  /**
   * Nearest vertex.
   * Alias for `TOP_LEFT_VERTEX | TOP_RIGHT_VERTEX | BOTTOM_LEFT_VERTEX | BOTTOM_RIGHT_VERTEX`.
   */
  VERTEX: 0xF0,

  /**
   * Nearest top-left corner.
   */
  TOP_LEFT_CORNER: 0x100,

  /**
   * Nearest top-right corner.
   */
  TOP_RIGHT_CORNER: 0x200,

  /**
   * Nearest bottom-left corner.
   */
  BOTTOM_LEFT_CORNER: 0x400,

  /**
   * Nearest bottom-right corner.
   */
  BOTTOM_RIGHT_CORNER: 0x800,

  /**
   * Nearest corner.
   * Alias for `TOP_LEFT_CORNER | TOP_RIGHT_CORNER | BOTTOM_LEFT_CORNER | BOTTOM_RIGHT_CORNER`.
   */
  CORNER: 0xF00,

  /**
   * Nearest top side midpoint.
   */
  TOP_SIDE_MIDPOINT: 0x1000,

  /**
   * Nearest bottom side midpoint.
   */
  BOTTOM_SIDE_MIDPOINT: 0x2000,

  /**
   * Nearest left side midpoint.
   */
  LEFT_SIDE_MIDPOINT: 0x4000,

  /**
   * Nearest right side midpoint.
   */
  RIGHT_SIDE_MIDPOINT: 0x8000,

  /**
   * Nearest side midpoint.
   * Alias for `TOP_SIDE_MIDPOINT | BOTTOM_SIDE_MIDPOINT | LEFT_SIDE_MIDPOINT | RIGHT_SIDE_MIDPOINT`.
   */
  SIDE_MIDPOINT: 0xF000
});

/**
 * A list of supported setup URL names
 */
export const SETUP_VIEWS = Object.freeze(["auth", "license", "setup", "players", "join", "update"]);

/**
 * An Array of valid MacroAction scope values
 */
export const MACRO_SCOPES = Object.freeze(["global", "actors", "actor"]);

/**
 * An enumeration of valid Macro types
 * @see {@link https://foundryvtt.com/article/macros/}
 */
export const MACRO_TYPES = Object.freeze({
  /**
   * Complex and powerful macros which leverage the FVTT API through plain JavaScript to perform functions as simple or
   * as advanced as you can imagine.
   */
  SCRIPT: "script",

  /**
   * Simple and easy to use, chat macros post pre-defined chat messages to the chat log when executed. All users can
   * execute chat macros by default.
   */
  CHAT: "chat"
});

/**
 * The allowed channels for audio playback.
 */
export const AUDIO_CHANNELS = Object.freeze({
  music: "AUDIO.CHANNELS.MUSIC.label",
  environment: "AUDIO.CHANNELS.ENVIRONMENT.label",
  interface: "AUDIO.CHANNELS.INTERFACE.label"
});

/**
 * The allowed playback modes for an audio Playlist
 * @see {@link https://foundryvtt.com/article/playlists/}
 */
export const PLAYLIST_MODES = Object.freeze({
  /**
   * The playlist does not play on its own, only individual Sound tracks played as a soundboard.
   */
  DISABLED: -1,

  /**
   * The playlist plays sounds one at a time in sequence.
   */
  SEQUENTIAL: 0,

  /**
   * The playlist plays sounds one at a time in randomized order.
   */
  SHUFFLE: 1,

  /**
   * The playlist plays all contained sounds at the same time.
   */
  SIMULTANEOUS: 2
});

/**
 * The available sort modes for an audio Playlist.
 * @see {@link https://foundryvtt.com/article/playlists/}
 */
export const PLAYLIST_SORT_MODES = Object.freeze({
  /**
   * Sort sounds alphabetically.
   */
  ALPHABETICAL: "a",

  /**
   * Sort sounds by manual drag-and-drop.
   */
  MANUAL: "m"
});

/**
 * The available modes for searching within a DirectoryCollection
 */
export const DIRECTORY_SEARCH_MODES = Object.freeze({
  FULL: "full",
  NAME: "name"
});

/**
 * The allowed package types
 */
export const PACKAGE_TYPES = Object.freeze(["world", "system", "module"]);

/**
 * Encode the reasons why a package may be available or unavailable for use
 */
export const PACKAGE_AVAILABILITY_CODES = Object.freeze({
  /**
   * Package availability could not be determined
   */
  UNKNOWN: 0,

  /**
   * The Package is verified to be compatible with the current core software build
   */
  VERIFIED: 1,

  /**
   * Package is available for use, but not verified for the current core software build
   */
  UNVERIFIED_BUILD: 2,

  /**
   * One or more installed system is incompatible with the Package.
   */
  UNVERIFIED_SYSTEM: 3,

  /**
   * Package is available for use, but not verified for the current core software generation
   */
  UNVERIFIED_GENERATION: 4,

  /**
   * The System that the Package relies on is not available
   */
  MISSING_SYSTEM: 5,

  /**
   * A dependency of the Package is not available
   */
  MISSING_DEPENDENCY: 6,

  /**
   * The Package is compatible with an older version of Foundry than the currently installed version
   */
  REQUIRES_CORE_DOWNGRADE: 7,

  /**
   * The Package is compatible with a newer version of Foundry than the currently installed version, and that version is
   * Stable
   */
  REQUIRES_CORE_UPGRADE_STABLE: 8,

  /**
   * The Package is compatible with a newer version of Foundry than the currently installed version, and that version is
   * not yet Stable
   */
  REQUIRES_CORE_UPGRADE_UNSTABLE: 9,

  /**
   * A required dependency is not compatible with the current version of Foundry
   */
  REQUIRES_DEPENDENCY_UPDATE: 10
});

/**
 * A safe password string which can be displayed
 * @type {"••••••••••••••••"}
 */
export const PASSWORD_SAFE_STRING = "•".repeat(16);

/**
 * The allowed software update channels
 */
export const SOFTWARE_UPDATE_CHANNELS = Object.freeze({
  /**
   * The Stable release channel
   */
  stable: "SETUP.UpdateStable",

  /**
   * The User Testing release channel
   */
  testing: "SETUP.UpdateTesting",

  /**
   * The Development release channel
   */
  development: "SETUP.UpdateDevelopment",

  /**
   * The Prototype release channel
   */
  prototype: "SETUP.UpdatePrototype"
});

/**
 * The default sorting density for manually ordering child objects within a parent
 */
export const SORT_INTEGER_DENSITY = 100000;

/**
 * The allowed types of a TableResult document
 * @see {@link https://foundryvtt.com/article/roll-tables/}
 */
export const TABLE_RESULT_TYPES = /** @type {const} */ ({
  /**
   *  Plain text or HTML scripted entries which will be output to Chat.
   */
  TEXT: "text",

  /**
   * An in-World Document reference which will be linked to in the chat message.
   */
  DOCUMENT: "document"
});
Object.defineProperties(TABLE_RESULT_TYPES, {
  /** @deprecated since v13 */
  COMPENDIUM: {
    get() {
      const message = "CONST.TABLE_RESULT_TYPES.COMPENDIUM is is deprecated in favor of CONST.TABLE_RESULT_TYPES.DOCUMENT"
      + ' due to the "compendium" being merged with the "document" type.';
      foundry.utils.logCompatibilityWarning(message, {since: 13, until: 15, once: true});
      return TABLE_RESULT_TYPES.DOCUMENT;
    }
  }
});
Object.freeze(TABLE_RESULT_TYPES);

/**
 * The allowed formats of a Journal Entry Page.
 * @see {@link https://foundryvtt.com/article/journal/}
 */
export const JOURNAL_ENTRY_PAGE_FORMATS = Object.freeze({
  /**
   * The page is formatted as HTML.
   */
  HTML: 1,

  /**
   * The page is formatted as Markdown.
   */
  MARKDOWN: 2
});

/**
 * Define the valid anchor locations for a Tooltip displayed on a Placeable Object
 * @see {@link foundry.helpers.interaction.TooltipManager}
 */
export const TEXT_ANCHOR_POINTS = Object.freeze({
  /**
   * Anchor the tooltip to the center of the element.
   */
  CENTER: 0,

  /**
   * Anchor the tooltip to the bottom of the element.
   */
  BOTTOM: 1,

  /**
   * Anchor the tooltip to the top of the element.
   */
  TOP: 2,

  /**
   * Anchor the tooltip to the left of the element.
   */
  LEFT: 3,

  /**
   * Anchor the tooltip to the right of the element.
   */
  RIGHT: 4
});

/**
 * @typedef {typeof TEXT_ANCHOR_POINTS[keyof typeof TEXT_ANCHOR_POINTS]} TextAnchorPoint
 */

/**
 * Define the valid occlusion modes which a tile can use
 * @see {@link https://foundryvtt.com/article/tiles/}
 */
export const OCCLUSION_MODES = Object.freeze({
  /**
   * Turns off occlusion, making the tile never fade while tokens are under it.
   */
  NONE: 0,

  /**
   * Causes the whole tile to fade when an actor token moves under it.
   */
  FADE: 1,

  // ROOF: 2,  This mode is no longer supported so we don't use 2 for any other mode

  /**
   * Causes the tile to reveal the background in the vicinity of an actor token under it. The radius is determined by
   * the token's size.
   */
  RADIAL: 3,

  /**
   * Causes the tile to be partially revealed based on the vision of the actor, which does not need to be under the tile
   * to see what's beneath it.
   * This is useful for rooves on buildings where players could see through a window or door, viewing only a portion of
   * what is obscured by the roof itself.
   */
  VISION: 4
});

/**
 * Alias for old tile occlusion modes definition
 */
export const TILE_OCCLUSION_MODES = OCCLUSION_MODES;

/**
 * The occlusion modes that define the set of tokens that trigger occlusion.
 */
export const TOKEN_OCCLUSION_MODES = Object.freeze({

  /**
   * Owned tokens that aren't hidden.
   */
  OWNED: 0x1,

  /**
   * Controlled tokens.
   */
  CONTROLLED: 0x2,

  /**
   * Hovered tokens that are visible.
   */
  HOVERED: 0x4,

  /**
   * Highlighted tokens that are visible.
   */
  HIGHLIGHTED: 0x8,

  /**
   * All visible tokens.
   */
  VISIBLE: 0x10
});

/**
 * Describe the various thresholds of token control upon which to show certain pieces of information
 * @see {@link https://foundryvtt.com/article/tokens/}
 */
export const TOKEN_DISPLAY_MODES = Object.freeze({
  /**
   * No information is displayed.
   */
  NONE: 0,

  /**
   * Displayed when the token is controlled.
   */
  CONTROL: 10,

  /**
   * Displayed when hovered by a GM or a user who owns the actor.
   */
  OWNER_HOVER: 20,

  /**
   * Displayed when hovered by any user.
   */
  HOVER: 30,

  /**
   * Always displayed for a GM or for a user who owns the actor.
   */
  OWNER: 40,

  /**
   * Always displayed for everyone.
   */
  ALWAYS: 50
});

/**
 * @typedef {typeof TOKEN_DISPLAY_MODES[keyof typeof TOKEN_DISPLAY_MODES]} TokenDisplayMode
 */

/**
 * The allowed Token disposition types
 * @see {@link https://foundryvtt.com/article/tokens/}
 */
export const TOKEN_DISPOSITIONS = Object.freeze({
  /**
   * Displayed with a purple borders for owners and with no borders for others (and no pointer change).
   */
  SECRET: -2,

  /**
   * Displayed as an enemy with a red border.
   */
  HOSTILE: -1,

  /**
   * Displayed as neutral with a yellow border.
   */
  NEUTRAL: 0,

  /**
   * Displayed as an ally with a cyan border.
   */
  FRIENDLY: 1
});

/**
 * The allowed token turn markers modes.
 */
export const TOKEN_TURN_MARKER_MODES = Object.freeze({
  /**
   * The turn marker is disabled for this token.
   */
  DISABLED: 0,

  /**
   * The turn marker for this token is using the combat tracker settings (which could be disabled).
   */
  DEFAULT: 1,

  /**
   * The turn marker is using the token settings (unless the combat tracker turn marker setting is disabled)
   */
  CUSTOM: 2
});

/**
 * The possible shapes of Tokens.
 */
export const TOKEN_SHAPES = Object.freeze({
  /**
   * Ellipse (Variant 1)
   */
  ELLIPSE_1: 0,

  /**
   * Ellipse (Variant 2)
   */
  ELLIPSE_2: 1,

  /**
   * Trapezoid (Variant 1)
   */
  TRAPEZOID_1: 2,

  /**
   * Trapezoid (Variant 2)
   */
  TRAPEZOID_2: 3,

  /**
   * Rectangle (Variant 1)
   */
  RECTANGLE_1: 4,

  /**
   * Rectangle (Variant 2)
   */
  RECTANGLE_2: 5
});

/**
 * @typedef {typeof TOKEN_SHAPES[keyof typeof TOKEN_SHAPES]} TokenShapeType
 */

/**
 * Define the allowed User permission levels.
 * Each level is assigned a value in ascending order. Higher levels grant more permissions.
 * @see {@link https://foundryvtt.com/article/users/}
 */
export const USER_ROLES = Object.freeze({
  /**
   * The User is blocked from taking actions in Foundry Virtual Tabletop.
   * You can use this role to temporarily or permanently ban a user from joining the game.
   */
  NONE: 0,

  /**
   * The User is able to join the game with permissions available to a standard player.
   * They cannot take some more advanced actions which require Trusted permissions, but they have the basic
   * functionalities needed to operate in the virtual tabletop.
   */
  PLAYER: 1,

  /**
   * Similar to the Player role, except a Trusted User has the ability to perform some more advanced actions like create
   * drawings, measured templates, or even to (optionally) upload media files to the server.
   */
  TRUSTED: 2,

  /**
   * A special User who has many of the same in-game controls as a Game Master User, but does not have the ability to
   * perform administrative actions like changing User roles or modifying World-level settings.
   */
  ASSISTANT: 3,

  /**
   * A special User who has administrative control over this specific World.
   * Game Masters behave quite differently than Players in that they have the ability to see all Documents and Objects
   * within the world as well as the capability to configure World settings.
   */
  GAMEMASTER: 4
});

/**
 * Invert the User Role mapping to recover role names from a role integer
 * @type {{0: "NONE"; 1: "PLAYER"; 2: "TRUSTED"; 3: "ASSISTANT"; 4: "GAMEMASTER"}}
 * @see {@link CONST.USER_ROLES}
 */
export const USER_ROLE_NAMES = Object.entries(USER_ROLES).reduce((obj, r) => {
  obj[r[1]] = r[0];
  return obj;
}, {});

/**
 * An enumeration of the allowed types for a MeasuredTemplate embedded document
 * @see {@link https://foundryvtt.com/article/measurement/}
 */
export const MEASURED_TEMPLATE_TYPES = Object.freeze({
  /**
   * Circular templates create a radius around the starting point.
   */
  CIRCLE: "circle",

  /**
   * Cones create an effect in the shape of a triangle or pizza slice from the starting point.
   */
  CONE: "cone",

  /**
   * A rectangle uses the origin point as a corner, treating the origin as being inside of the rectangle's area.
   */
  RECTANGLE: "rect",

  /**
   * A ray creates a single line that is one square in width and as long as you want it to be.
   */
  RAY: "ray"
});

/**
 * Define the recognized User capabilities which individual Users or role levels may be permitted to perform
 */
export const USER_PERMISSIONS = deepFreeze({
  ACTOR_CREATE: {
    label: "PERMISSION.ActorCreate",
    hint: "PERMISSION.ActorCreateHint",
    disableGM: false,
    defaultRole: USER_ROLES.ASSISTANT
  },
  BROADCAST_AUDIO: {
    label: "PERMISSION.BroadcastAudio",
    hint: "PERMISSION.BroadcastAudioHint",
    disableGM: true,
    defaultRole: USER_ROLES.TRUSTED
  },
  BROADCAST_VIDEO: {
    label: "PERMISSION.BroadcastVideo",
    hint: "PERMISSION.BroadcastVideoHint",
    disableGM: true,
    defaultRole: USER_ROLES.TRUSTED
  },
  CARDS_CREATE: {
    label: "PERMISSION.CardsCreate",
    hint: "PERMISSION.CardsCreateHint",
    disableGM: false,
    defaultRole: USER_ROLES.ASSISTANT
  },
  DRAWING_CREATE: {
    label: "PERMISSION.DrawingCreate",
    hint: "PERMISSION.DrawingCreateHint",
    disableGM: false,
    defaultRole: USER_ROLES.TRUSTED
  },
  ITEM_CREATE: {
    label: "PERMISSION.ItemCreate",
    hint: "PERMISSION.ItemCreateHint",
    disableGM: false,
    defaultRole: USER_ROLES.ASSISTANT
  },
  FILES_BROWSE: {
    label: "PERMISSION.FilesBrowse",
    hint: "PERMISSION.FilesBrowseHint",
    disableGM: false,
    defaultRole: USER_ROLES.TRUSTED
  },
  FILES_UPLOAD: {
    label: "PERMISSION.FilesUpload",
    hint: "PERMISSION.FilesUploadHint",
    disableGM: false,
    defaultRole: USER_ROLES.ASSISTANT
  },
  JOURNAL_CREATE: {
    label: "PERMISSION.JournalCreate",
    hint: "PERMISSION.JournalCreateHint",
    disableGM: false,
    defaultRole: USER_ROLES.TRUSTED
  },
  MACRO_SCRIPT: {
    label: "PERMISSION.MacroScript",
    hint: "PERMISSION.MacroScriptHint",
    disableGM: false,
    defaultRole: USER_ROLES.PLAYER
  },
  MANUAL_ROLLS: {
    label: "PERMISSION.ManualRolls",
    hint: "PERMISSION.ManualRollsHint",
    disableGM: true,
    defaultRole: USER_ROLES.TRUSTED
  },
  MESSAGE_WHISPER: {
    label: "PERMISSION.MessageWhisper",
    hint: "PERMISSION.MessageWhisperHint",
    disableGM: false,
    defaultRole: USER_ROLES.PLAYER
  },
  NOTE_CREATE: {
    label: "PERMISSION.NoteCreate",
    hint: "PERMISSION.NoteCreateHint",
    disableGM: false,
    defaultRole: USER_ROLES.TRUSTED
  },
  PING_CANVAS: {
    label: "PERMISSION.PingCanvas",
    hint: "PERMISSION.PingCanvasHint",
    disableGM: true,
    defaultRole: USER_ROLES.PLAYER
  },
  PLAYLIST_CREATE: {
    label: "PERMISSION.PlaylistCreate",
    hint: "PERMISSION.PlaylistCreateHint",
    disableGM: false,
    defaultRole: USER_ROLES.ASSISTANT
  },
  SETTINGS_MODIFY: {
    label: "PERMISSION.SettingsModify",
    hint: "PERMISSION.SettingsModifyHint",
    disableGM: false,
    defaultRole: USER_ROLES.ASSISTANT
  },
  SHOW_CURSOR: {
    label: "PERMISSION.ShowCursor",
    hint: "PERMISSION.ShowCursorHint",
    disableGM: true,
    defaultRole: USER_ROLES.PLAYER
  },
  SHOW_RULER: {
    label: "PERMISSION.ShowRuler",
    hint: "PERMISSION.ShowRulerHint",
    disableGM: true,
    defaultRole: USER_ROLES.PLAYER
  },
  TEMPLATE_CREATE: {
    label: "PERMISSION.TemplateCreate",
    hint: "PERMISSION.TemplateCreateHint",
    disableGM: false,
    defaultRole: USER_ROLES.PLAYER
  },
  TOKEN_CREATE: {
    label: "PERMISSION.TokenCreate",
    hint: "PERMISSION.TokenCreateHint",
    disableGM: false,
    defaultRole: USER_ROLES.ASSISTANT
  },
  TOKEN_DELETE: {
    label: "PERMISSION.TokenDelete",
    hint: "PERMISSION.TokenDeleteHint",
    disableGM: false,
    defaultRole: USER_ROLES.ASSISTANT
  },
  TOKEN_CONFIGURE: {
    label: "PERMISSION.TokenConfigure",
    hint: "PERMISSION.TokenConfigureHint",
    disableGM: false,
    defaultRole: USER_ROLES.TRUSTED
  },
  WALL_DOORS: {
    label: "PERMISSION.WallDoors",
    hint: "PERMISSION.WallDoorsHint",
    disableGM: false,
    defaultRole: USER_ROLES.PLAYER
  },
  QUERY_USER: {
    label: "PERMISSION.QueryUser",
    hint: "PERMISSION.QueryUserHint",
    disableGM: false,
    defaultRole: USER_ROLES.PLAYER
  }
});

/**
 * The allowed directions of effect that a Wall can have
 * @see {@link https://foundryvtt.com/article/walls/}
 */
export const WALL_DIRECTIONS = Object.freeze({
  /**
   * The wall collides from both directions.
   */
  BOTH: 0,

  /**
   * The wall collides only when a ray strikes its left side.
   */
  LEFT: 1,

  /**
   * The wall collides only when a ray strikes its right side.
   */
  RIGHT: 2
});

/**
 * @typedef {typeof WALL_DIRECTIONS[keyof typeof WALL_DIRECTIONS]} WallDirection
 */

/**
 * The allowed door types which a Wall may contain
 * @see {@link https://foundryvtt.com/article/walls/}
 */
export const WALL_DOOR_TYPES = Object.freeze({
  /**
   * The wall does not contain a door.
   */
  NONE: 0,

  /**
   *  The wall contains a regular door.
   */
  DOOR: 1,

  /**
   * The wall contains a secret door.
   */
  SECRET: 2
});

/**
 * The allowed door states which may describe a Wall that contains a door
 * @see {@link https://foundryvtt.com/article/walls/}
 */
export const WALL_DOOR_STATES = Object.freeze({
  /**
   * The door is closed.
   */
  CLOSED: 0,

  /**
   * The door is open.
   */
  OPEN: 1,

  /**
   * The door is closed and locked.
   */
  LOCKED: 2
});

/**
 * The possible ways to interact with a door
 */
export const WALL_DOOR_INTERACTIONS = Object.freeze(["open", "close", "lock", "unlock", "test"]);

/**
 * The wall properties which restrict the way interaction occurs with a specific wall
 */
export const WALL_RESTRICTION_TYPES = Object.freeze(["light", "sight", "sound", "move"]);

/**
 * @typedef {typeof WALL_RESTRICTION_TYPES[number]} WallRestrictionType
 */

/**
 * The types of sensory collision which a Wall may impose
 * @see {@link https://foundryvtt.com/article/walls/}
 */
export const WALL_SENSE_TYPES = Object.freeze({
  /**
   * Senses do not collide with this wall.
   */
  NONE: 0,

  /**
   * Senses collide with this wall.
   */
  LIMITED: 10,

  /**
   * Senses collide with the second intersection, bypassing the first.
   */
  NORMAL: 20,

  /**
   * Senses bypass the wall within a certain proximity threshold.
   */
  PROXIMITY: 30,

  /**
   * Senses bypass the wall outside a certain proximity threshold.
   */
  DISTANCE: 40
});

/**
 * @typedef {typeof WALL_SENSE_TYPES[keyof typeof WALL_SENSE_TYPES]} WallSenseType
 */

/**
 * The types of movement collision which a Wall may impose
 * @see {@link https://foundryvtt.com/article/walls/}
 */
export const WALL_MOVEMENT_TYPES = Object.freeze({
  /**
   * Movement does not collide with this wall.
   */
  NONE: WALL_SENSE_TYPES.NONE,

  /**
   * Movement collides with this wall.
   */
  NORMAL: WALL_SENSE_TYPES.NORMAL
});

/**
 * The possible precedence values a Keybinding might run in
 * @see {@link https://foundryvtt.com/article/keybinds/}
 */
export const KEYBINDING_PRECEDENCE = Object.freeze({
  /**
   * Runs in the first group along with other PRIORITY keybindings.
   */
  PRIORITY: 0,

  /**
   * Runs after the PRIORITY group along with other NORMAL keybindings.
   */
  NORMAL: 1,

  /**
   * Runs in the last group along with other DEFERRED keybindings.
   */
  DEFERRED: 2
});

/**
 * Directories in the public storage path.
 */
export const FILE_PICKER_PUBLIC_DIRS = Object.freeze([
  "cards", "css", "fonts", "icons", "lang", "scripts", "sounds", "ui"
]);

/**
 * The allowed set of HTML template extensions
 */
export const HTML_FILE_EXTENSIONS = Object.freeze({
  handlebars: "text/x-handlebars-template",
  hbs: "text/x-handlebars-template",
  html: "text/html"
});

/**
 * The supported file extensions for image-type files, and their corresponding mime types.
 */
export const IMAGE_FILE_EXTENSIONS = Object.freeze({
  apng: "image/apng",
  avif: "image/avif",
  bmp: "image/bmp",
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  svg: "image/svg+xml",
  tiff: "image/tiff",
  webp: "image/webp"
});

/**
 * The supported file extensions for video-type files, and their corresponding mime types.
 */
export const VIDEO_FILE_EXTENSIONS = Object.freeze({
  m4v: "video/mp4",
  mp4: "video/mp4",
  ogv: "video/ogg",
  webm: "video/webm"
});

/**
 * The supported file extensions for audio-type files, and their corresponding mime types.
 */
export const AUDIO_FILE_EXTENSIONS = Object.freeze({
  aac: "audio/aac",
  flac: "audio/flac",
  m4a: "audio/mp4",
  mid: "audio/midi",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  opus: "audio/opus",
  wav: "audio/wav",
  webm: "audio/webm"
});

/**
 * The supported file extensions for text files, and their corresponding mime types.
 */
export const TEXT_FILE_EXTENSIONS = Object.freeze({
  csv: "text/csv",
  json: "application/json",
  md: "text/markdown",
  pdf: "application/pdf",
  tsv: "text/tab-separated-values",
  txt: "text/plain",
  xml: "application/xml",
  yml: "application/yaml",
  yaml: "application/yaml"
});

/**
 * Supported file extensions for font files, and their corresponding mime types.
 */
export const FONT_FILE_EXTENSIONS = Object.freeze({
  otf: "font/otf",
  ttf: "font/ttf",
  woff: "font/woff",
  woff2: "font/woff2"
});

/**
 * Supported file extensions for 3D files, and their corresponding mime types.
 */
export const GRAPHICS_FILE_EXTENSIONS = Object.freeze({
  fbx: "application/octet-stream",
  glb: "model/gltf-binary",
  gltf: "model/gltf+json",
  mtl: "model/mtl",
  obj: "model/obj",
  stl: "model/stl",
  usdz: "model/vnd.usdz+zip"
});

/**
 * A consolidated mapping of all extensions permitted for upload.
 */
export const UPLOADABLE_FILE_EXTENSIONS = Object.freeze({
  ...IMAGE_FILE_EXTENSIONS,
  ...AUDIO_FILE_EXTENSIONS,
  ...VIDEO_FILE_EXTENSIONS,
  ...TEXT_FILE_EXTENSIONS,
  ...FONT_FILE_EXTENSIONS,
  ...GRAPHICS_FILE_EXTENSIONS
});

/**
 * An enumeration of file type categories which can be selected.
 */
export const FILE_CATEGORIES = {
  HTML: HTML_FILE_EXTENSIONS,
  IMAGE: IMAGE_FILE_EXTENSIONS,
  VIDEO: VIDEO_FILE_EXTENSIONS,
  AUDIO: AUDIO_FILE_EXTENSIONS,
  TEXT: TEXT_FILE_EXTENSIONS,
  FONT: FONT_FILE_EXTENSIONS,
  GRAPHICS: GRAPHICS_FILE_EXTENSIONS,

  /**
   * @deprecated since v13
   * @ignore
   */
  get MEDIA() {
    const message = "CONST.FILE_CATEGORIES.MEDIA is deprecated. Use CONST.MEDIA_MIME_TYPES instead.";
    foundry.utils.logCompatibilityWarning(message, {since: 13, until: 15, once: true});
    return MEDIA_MIME_TYPES;
  }
};
Object.defineProperties(FILE_CATEGORIES, {MEDIA: {enumerable: false}});
Object.freeze(FILE_CATEGORIES);

/**
 * The list of file categories that are "media".
 */
export const MEDIA_FILE_CATEGORIES = Object.freeze(["IMAGE", "VIDEO", "AUDIO", "TEXT", "FONT", "GRAPHICS"]);

/**
 * A list of MIME types which are treated as uploaded "media", which are allowed to overwrite existing files.
 * Any non-media MIME type is not allowed to replace an existing file.
 */
export const MEDIA_MIME_TYPES = Array.from(new Set(MEDIA_FILE_CATEGORIES.flatMap(
  c => Object.values(FILE_CATEGORIES[c])))).sort();

/**
 * A font weight to name mapping.
 */
export const FONT_WEIGHTS = Object.freeze({
  Thin: 100,
  ExtraLight: 200,
  Light: 300,
  Regular: 400,
  Medium: 500,
  SemiBold: 600,
  Bold: 700,
  ExtraBold: 800,
  Black: 900
});

/**
 * Stores shared commonly used timeouts, measured in MS
 */
export const TIMEOUTS = Object.freeze({
  /**
   * The default timeout for interacting with the foundryvtt.com API.
   */
  FOUNDRY_WEBSITE: 10000,

  /**
   * The specific timeout for loading the list of packages from the foundryvtt.com API.
   */
  PACKAGE_REPOSITORY: 10000,

  /**
   * The specific timeout for the IP address lookup service.
   */
  IP_DISCOVERY: 5000,

  /**
   * A remote package manifest JSON or download ZIP.
   */
  REMOTE_PACKAGE: 5000
});

/**
 * A subset of Compendium types which require a specific system to be designated
 */
export const SYSTEM_SPECIFIC_COMPENDIUM_TYPES = Object.freeze(["Actor", "Item"]);

/**
 * The configured showdown bi-directional HTML <-> Markdown converter options.
 */
export const SHOWDOWN_OPTIONS = Object.freeze({
  disableForced4SpacesIndentedSublists: true,
  noHeaderId: true,
  parseImgDimensions: true,
  strikethrough: true,
  tables: true,
  tablesHeaderId: true
});

/**
 * The list of allowed HTML tags.
 */
export const ALLOWED_HTML_TAGS = Object.freeze([
  "header", "main", "section", "article", "aside", "nav", "footer", "div", "address", // Structural Elements
  "h1", "h2", "h3", "h4", "h5", "h6", "hr", "br", // Headers and Dividers
  "p", "blockquote", "summary", "details", "span", "code", "pre", "a", "label", "abbr", "cite",
  "mark", "q", "ruby", "rp", "rt", "small", "time", "var", "kbd", "samp", // Text Types
  "dfn", "sub", "sup", "strong", "em", "b", "i", "u", "s", "del", "ins", // Text Styles
  "ol", "ul", "li", "dl", "dd", "dt", "menu", // Lists
  "table", "thead", "tbody", "tfoot", "tr", "th", "td", "col", "colgroup", // Tables
  "form", "input", "select", "option", "button", "datalist", "fieldset", "legend", "meter",
  "optgroup", "progress", "textarea", "output", // Forms
  "figure", "figcaption", "caption", "img", "video", "map", "area", "track", "picture",
  "source", "audio", // Media
  "iframe", // Embedded content
  "color-picker", "code-mirror", "document-embed", "document-tags", "enriched-content", "file-picker", "hue-slider",
  "multi-select", "multi-checkbox", "range-picker", "secret-block", "string-tags", "prose-mirror" // Custom elements
]);

/**
 * The list of allowed attributes in HTML elements.
 */
export const ALLOWED_HTML_ATTRIBUTES = deepFreeze({
  "*": [
    "class", "data-*", "id", "title", "style", "draggable", "aria-*", "tabindex", "dir", "hidden", "inert", "role",
    "is", "lang", "popover", "autocapitalize", "autocorrect", "autofocus", "contenteditable", "spellcheck", "translate"
  ],
  a: ["href", "name", "target", "rel"],
  area: ["alt", "coords", "href", "rel", "shape", "target"],
  audio: ["controls", "loop", "muted", "src", "autoplay"],
  blockquote: ["cite"],
  button: ["disabled", "name", "type", "value"],
  col: ["span"],
  colgroup: ["span"],
  "code-mirror": ["disabled", "name", "value", "placeholder", "readonly", "required", "language", "indent", "nowrap"],
  "color-picker": ["disabled", "name", "value", "placeholder", "readonly", "required"],
  details: ["open"],
  "document-embed": ["uuid"],
  "document-tags": ["disabled", "name", "value", "placeholder", "readonly", "required", "type", "single", "max"],
  "enriched-content": ["enricher"],
  fieldset: ["disabled"],
  "file-picker": ["disabled", "name", "value", "placeholder", "readonly", "required", "type", "noupload"],
  form: ["name"],
  "hue-slider": ["disabled", "name", "value", "readonly", "required"],
  iframe: ["src", "srcdoc", "name", "height", "width", "loading", "sandbox"],
  img: ["height", "src", "width", "usemap", "sizes", "srcset", "alt"],
  input: [
    "checked", "disabled", "name", "value", "placeholder", "type", "alt", "height", "list",
    "max", "min", "readonly", "size", "src", "step", "width", "required"
  ],
  label: ["for"],
  li: ["value"],
  map: ["name"],
  meter: ["value", "min", "max", "low", "high", "optimum"],
  "multi-checkbox": ["disabled", "name", "required"],
  "multi-select": ["disabled", "name", "required"],
  ol: ["reversed", "start", "type"],
  optgroup: ["disabled", "label"],
  option: ["disabled", "selected", "label", "value"],
  output: ["for", "form", "name"],
  progress: ["max", "value"],
  "prose-mirror": ["disabled", "name", "value", "placeholder", "readonly", "required", "toggled", "open"],
  "range-picker": ["disabled", "name", "value", "placeholder", "readonly", "min", "max", "step"],
  select: ["name", "disabled", "multiple", "size", "required"],
  source: ["media", "sizes", "src", "srcset", "type"],
  "string-tags": ["disabled", "name", "value", "placeholder", "readonly", "required"],
  table: ["border"],
  td: ["colspan", "headers", "rowspan"],
  textarea: ["rows", "cols", "disabled", "name", "readonly", "wrap", "required"],
  time: ["datetime"],
  th: ["abbr", "colspan", "headers", "rowspan", "scope", "sorted"],
  track: ["default", "kind", "label", "src", "srclang"],
  video: ["controls", "height", "width", "loop", "muted", "poster", "src", "autoplay"]
});

/**
 * The list of allowed URL schemes.
 */
export const ALLOWED_URL_SCHEMES = Object.freeze(["http", "https", "data", "mailto", "obsidian",
  "syrinscape-online"]);

/**
 * The list of attributes validated as URLs.
 */
export const ALLOWED_URL_SCHEMES_APPLIED_TO_ATTRIBUTES = Object.freeze(["href", "src", "cite"]);

/**
 * The list of trusted iframe domains.
 */
export const TRUSTED_IFRAME_DOMAINS = Object.freeze(["google.com", "youtube.com"]);

/**
 * Available themes for the world join page.
 */
export const WORLD_JOIN_THEMES = Object.freeze({
  default: "WORLD.JOIN_THEMES.default",
  minimal: "WORLD.JOIN_THEMES.minimal"
});

/**
 * Setup page package progress protocol.
 */
export const SETUP_PACKAGE_PROGRESS = deepFreeze({
  ACTIONS: {
    CREATE_BACKUP: "createBackup",
    RESTORE_BACKUP: "restoreBackup",
    DELETE_BACKUP: "deleteBackup",
    CREATE_SNAPSHOT: "createSnapshot",
    RESTORE_SNAPSHOT: "restoreSnapshot",
    DELETE_SNAPSHOT: "deleteSnapshot",
    INSTALL_PKG: "installPackage",
    LAUNCH_WORLD: "launchWorld",
    UPDATE_CORE: "updateCore",
    UPDATE_DOWNLOAD: "updateDownload"
  },
  STEPS: {
    ARCHIVE: "archive",
    CHECK_DISK_SPACE: "checkDiskSpace",
    CLEAN_WORLD: "cleanWorld",
    EXTRACT_DEMO: "extractDemo",
    CONNECT_WORLD: "connectWorld",
    MIGRATE_WORLD: "migrateWorld",
    CONNECT_PKG: "connectPackage",
    MIGRATE_PKG: "migratePackage",
    MIGRATE_CORE: "migrateCore",
    MIGRATE_SYSTEM: "migrateSystem",
    DOWNLOAD: "download",
    EXTRACT: "extract",
    INSTALL: "install",
    CLEANUP: "cleanup",
    COMPLETE: "complete",
    DELETE: "delete",
    ERROR: "error",
    VEND: "vend",
    SNAPSHOT_MODULES: "snapshotModules",
    SNAPSHOT_SYSTEMS: "snapshotSystems",
    SNAPSHOT_WORLDS: "snapshotWorlds"
  }
});

/**
 * The combat announcements.
 */
export const COMBAT_ANNOUNCEMENTS = Object.freeze(["startEncounter", "nextUp", "yourTurn"]);

/**
 * The fit modes of {@link foundry.data.TextureData}.
 */
export const TEXTURE_DATA_FIT_MODES = Object.freeze(["fill", "contain", "cover", "width", "height"]);

/**
 * @typedef {typeof TEXTURE_DATA_FIT_MODES[number]} TextureDataFitMode
 */

/**
 * The maximum depth to recurse to when embedding enriched text.
 */
export const TEXT_ENRICH_EMBED_MAX_DEPTH = 5;

/**
 * The Region events that are supported by core.
 */
export const REGION_EVENTS = /** @type {const} */ ({
  /**
   * Triggered when the shapes or bottom/top elevation of the Region are changed.
   *
   * @see {@link foundry.documents.types.RegionRegionBoundaryEvent}
   */
  REGION_BOUNDARY: "regionBoundary",

  /**
   * Triggered when the Region Behavior becomes active, i.e. is enabled or created without being disabled.
   *
   * The event is triggered only for this Region Behavior.
   *
   * @see {@link foundry.documents.types.RegionBehaviorActivatedEvent}
   */
  BEHAVIOR_ACTIVATED: "behaviorActivated",

  /**
   * Triggered when the Region Behavior becomes inactive, i.e. is disabled or deleted without being disabled.
   *
   * The event is triggered only for this Region Behavior.
   *
   * @see {@link foundry.documents.types.RegionBehaviorDeactivatedEvent}
   */
  BEHAVIOR_DEACTIVATED: "behaviorDeactivated",

  /**
   * Triggered when the Region Behavior becomes viewed, i.e. active and the Scene of its Region is viewed.
   *
   * The event is triggered only for this Region Behavior.
   *
   * @see {@link foundry.documents.types.RegionBehaviorViewedEvent}
   */
  BEHAVIOR_VIEWED: "behaviorViewed",

  /**
   * Triggered when the Region Behavior becomes unviewed, i.e. inactive or the Scene of its Region is unviewed.
   *
   * The event is triggered only for this Region Behavior.
   *
   * @see {@link foundry.documents.types.RegionBehaviorUnviewedEvent}
   */
  BEHAVIOR_UNVIEWED: "behaviorUnviewed",

  /**
   * Triggered when a Token enters a Region.
   *
   * A Token enters a Region whenever ...
   *   - it is created within the Region,
   *   - the boundary of the Region has changed such that the Token is now inside the Region,
   *   - the Token moves into the Region (the Token's x, y, elevation, width, height, or shape
   *     has changed such that it is now inside the Region), or
   *   - a Region Behavior becomes active (i.e., is enabled or created while enabled), in which case
   *     the event it triggered only for this Region Behavior.
   *
   * @see {@link foundry.documents.types.RegionTokenEnterEvent}
   */
  TOKEN_ENTER: "tokenEnter",

  /**
   * Triggered when a Token exits a Region.
   *
   * A Token exits a Region whenever ...
   *   - it is deleted while inside the Region,
   *   - the boundary of the Region has changed such that the Token is no longer inside the Region,
   *   - the Token moves out of the Region (the Token's x, y, elevation, width, height, or shape
   *     has changed such that it is no longer inside the Region), or
   *   - a Region Behavior becomes inactive (i.e., is disabled or deleted while enabled), in which case
   *     the event it triggered only for this Region Behavior.
   *
   * @see {@link foundry.documents.types.RegionTokenExitEvent}
   */
  TOKEN_EXIT: "tokenExit",

  /**
   * Triggered when a Token moves into a Region.
   *
   * A Token moves whenever its x, y, elevation, width, height, or shape is changed.
   *
   * @see {@link foundry.documents.types.RegionTokenMoveInEvent}
   */
  TOKEN_MOVE_IN: "tokenMoveIn",

  /**
   * Triggered when a Token moves out of a Region.
   *
   * A Token moves whenever its x, y, elevation, width, height, or shape is changed.
   *
   * @see {@link foundry.documents.types.RegionTokenMoveOutEvent}
   */
  TOKEN_MOVE_OUT: "tokenMoveOut",

  /**
   * Triggered when a Token moves within a Region.
   *
   * A token moves whenever its x, y, elevation, width, height, or shape is changed.
   *
   * @see {@link foundry.documents.types.RegionTokenMoveWithinEvent}
   */
  TOKEN_MOVE_WITHIN: "tokenMoveWithin",

  /**
   * Triggered when a Token animates into a Region.
   *
   * This event is only triggered only if the Scene the Token is in is viewed.
   *
   * @see {@link foundry.documents.types.RegionTokenAnimateInEvent}
   */
  TOKEN_ANIMATE_IN: "tokenAnimateIn",

  /**
   * Triggered when a Token animates out of a Region.
   *
   * This event is triggered only if the Scene the Token is in is viewed.
   *
   * @see {@link foundry.documents.types.RegionTokenAnimateOutEvent}
   */
  TOKEN_ANIMATE_OUT: "tokenAnimateOut",

  /**
   * Triggered when a Token starts its Combat turn in a Region.
   *
   * @see {@link foundry.documents.types.RegionTokenTurnStartEvent}
   */
  TOKEN_TURN_START: "tokenTurnStart",

  /**
   * Triggered when a Token ends its Combat turn in a Region.
   *
   * @see {@link foundry.documents.types.RegionTokenTurnEndEvent}
   */
  TOKEN_TURN_END: "tokenTurnEnd",

  /**
   * Triggered when a Token starts the Combat round in a Region.
   *
   * @see {@link foundry.documents.types.RegionTokenRoundStartEvent}
   */
  TOKEN_ROUND_START: "tokenRoundStart",

  /**
   * Triggered when a Token ends the Combat round in a Region.
   *
   * @see {@link foundry.documents.types.RegionTokenRoundEndEvent}
   */
  TOKEN_ROUND_END: "tokenRoundEnd"

});

Object.defineProperties(REGION_EVENTS, {
  /** @deprecated since v13 */
  BEHAVIOR_STATUS: {
    get() {
      const message = "CONST.REGION_EVENTS.BEHAVIOR_STATUS is deprecated in favor of BEHAVIOR_ACTIVATED"
    + "BEHAVIOR_DEACTIVATED, BEHAVIOR_VIEWED, and BEHAVIOR_UNVIEWED.";
      foundry.utils.logCompatibilityWarning(message, {since: 13, until: 15, once: true});
      return "behaviorStatus";
    }
  },
  /** @deprecated since v13 */
  TOKEN_PRE_MOVE: {
    get() {
      foundry.utils.logCompatibilityWarning("CONST.REGION_EVENTS.TOKEN_PRE_MOVE is deprecated without replacement. "
          + "The TOKEN_PRE_MOVE event is not longer triggered.", {since: 13, until: 15, once: true});
      return "tokenPreMove";
    }
  },
  /** @deprecated since v13 */
  TOKEN_MOVE: {
    get() {
      foundry.utils.logCompatibilityWarning("CONST.REGION_EVENTS.TOKEN_MOVE is deprecated without replacement. "
        + "The TOKEN_MOVE event is not longer triggered.", {since: 13, until: 15, once: true});
      return "tokenMove";
    }
  }
});
Object.freeze(REGION_EVENTS);

/**
 * @typedef {typeof REGION_EVENTS[keyof typeof REGION_EVENTS]} RegionEventType
 */

/**
 * The possible visibility state of Region.
 */
export const REGION_VISIBILITY = Object.freeze({

  /**
   * Only visible on the RegionLayer.
   */
  LAYER: 0,

  /**
   * Only visible to Gamemasters.
   */
  GAMEMASTER: 1,

  /**
   * Visible to anyone.
   */
  ALWAYS: 2
});

/**
 * The types of a Region movement segment.
 */
export const REGION_MOVEMENT_SEGMENTS = Object.freeze({

  /**
   * The segment crosses the boundary of the Region and exits it.
   */
  EXIT: -1,

  /**
   * The segment does not cross the boundary of the Region and is contained within it.
   */
  MOVE: 0,

  /**
   * The segment crosses the boundary of the Region and enters it.
   */
  ENTER: 1
});

/**
 * @typedef {typeof REGION_MOVEMENT_SEGMENTS[keyof typeof REGION_MOVEMENT_SEGMENTS]} RegionMovementSegmentType
 */

/**
 * Available setting scopes.
 */
export const SETTING_SCOPES = Object.freeze({
  /**
   * Settings scoped to the client device. Stored in localStorage.
   */
  CLIENT: "client",

  /**
   * Settings scoped to the game World. Applies to all Users in the World. Stored in the Settings database.
   */
  WORLD: "world",

  /**
   * Settings scoped to an individual User in the World. Stored in the Settings database.
   */
  USER: "user"
});

/* -------------------------------------------- */

/**
 * The scaling factor that is used for Clipper polygons/paths consistently everywhere core performs Clipper operations.
 */
export const CLIPPER_SCALING_FACTOR = 100;

/* -------------------------------------------- */
/*  Deprecations and Compatibility              */
/* -------------------------------------------- */

/**
 * @deprecated since v12
 * @ignore
 */
export const CHAT_MESSAGE_TYPES = new Proxy(CHAT_MESSAGE_STYLES, {
  get(target, prop, receiver) {
    const msg = "CONST.CHAT_MESSAGE_TYPES is deprecated in favor of CONST.CHAT_MESSAGE_STYLES because the "
      + "ChatMessage#type field has been renamed to ChatMessage#style";
    foundry.utils.logCompatibilityWarning(msg, {since: 12, until: 14, once: true});
    return Reflect.get(...arguments);
  }
});


/**
 * @deprecated since v12
 * @ignore
 */
const _DOCUMENT_TYPES = Object.freeze(WORLD_DOCUMENT_TYPES.filter(t => {
  const excluded = ["FogExploration", "Setting"];
  return !excluded.includes(t);
}));

/**
 * @deprecated since v12
 * @ignore
 */
export const DOCUMENT_TYPES = new Proxy(_DOCUMENT_TYPES, {
  get(target, prop, receiver) {
    const msg = "CONST.DOCUMENT_TYPES is deprecated in favor of either CONST.WORLD_DOCUMENT_TYPES or "
      + "CONST.COMPENDIUM_DOCUMENT_TYPES.";
    foundry.utils.logCompatibilityWarning(msg, {since: 12, until: 14, once: true});
    return Reflect.get(...arguments);
  }
});

/**
 * @deprecated since v13
 * @ignore
 */
export const TOKEN_HEXAGONAL_SHAPES = new Proxy(TOKEN_SHAPES, {
  get(target, prop, receiver) {
    const msg = "CONST.TOKEN_HEXAGONAL_SHAPES is deprecated in favor of CONST.TOKEN_SHAPES.";
    foundry.utils.logCompatibilityWarning(msg, {since: 13, until: 15, once: true});
    return Reflect.get(...arguments);
  }
});

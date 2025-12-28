import Application from "./appv1/api/application-v1.mjs";
import AVMaster from "./av/master.mjs";
import DocumentCollection from "./documents/abstract/document-collection.mjs";
import * as collections from "./documents/collections/_module.mjs";
import * as helpers from "./helpers/_module.mjs";
import * as utils from "./utils/_module.mjs";
import TextEditor from "./applications/ux/text-editor.mjs";
import AudioHelper from "./audio/helper.mjs";
import Hooks from "./helpers/hooks.mjs";
import FontConfig from "@client/applications/settings/menus/font-config.mjs";
import {getRoute, Collection, StringTree} from "@common/utils/_module.mjs";

/**
 * @import {ReleaseData} from "@common/config.mjs"
 * @import {HotReloadData} from "./_types.mjs"
 * @import {Canvas} from "./canvas/_module.mjs"
 * @import {Actor, Combat, User} from "./documents/_module.mjs"
 * @import WorldCollection from "./documents/abstract/world-collection.mjs"
 * @import Document from "@common/abstract/document.mjs"
 * @import * as applications from "./applications/_module.mjs"
 * @import {GameUIConfiguration} from "./applications/settings/menus/ui-config.mjs"
 * @import * as appv1 from "./appv1/_module.mjs"
 * @import * as hookEvents from "./hooks.mjs"
 * @import * as nue from "./nue/_module.mjs"
 * @import {Module, System, World} from "./packages/_module.mjs"
 */

/**
 * The core Game instance which encapsulates the data, settings, and states relevant for managing the game experience.
 * The singleton instance of the Game class is available as the global variable game.
 */
export default class Game {
  /**
   * Initialize a singleton Game instance for a specific view using socket data retrieved from the server.
   * @param {string} view         The named view which is active for this game instance.
   * @param {object} data         An object of all the World data vended by the server when the client first connects
   * @param {string} sessionId    The ID of the currently active client session retrieved from the browser cookie
   * @param {io.Socket} socket    The open web-socket which should be used to transact game-state data
   */
  constructor(view, data, sessionId, socket) {
    // Session Properties
    Object.defineProperties(this, {
      view: {value: view, writable: false},
      sessionId: {value: sessionId, writable: false},
      socket: {value: socket, writable: false},
      userId: {value: data.userId || null, writable: false},
      data: {value: data, writable: false},
      release: {value: new foundry.config.ReleaseData(data.release), writable: false}
    });

    // Set up package data
    this.setupPackages(data);

    // Helper Properties
    Object.defineProperties(this, {
      audio: {value: new AudioHelper(), writable: false},
      clipboard: {value: new helpers.interaction.ClipboardHelper(), writable: false},
      collections: {value: new Collection(), writable: false},
      compendiumArt: {value: new helpers.media.CompendiumArt(), writable: false},
      documentIndex: {value: new helpers.DocumentIndex(), writable: false},
      i18n: {value: new helpers.Localization(data?.options?.language), writable: false},
      issues: {value: new helpers.ClientIssues(), writable: false},
      gamepad: {value: new helpers.interaction.GamepadManager(), writable: false},
      keyboard: {value: new helpers.interaction.KeyboardManager(), writable: false},
      mouse: {value: new helpers.interaction.MouseManager(), writable: false},
      nue: {value: new foundry.nue.NewUserExperienceManager(), writable: false},
      packs: {value: new collections.CompendiumPacks(), writable: false},
      settings: {value: new helpers.ClientSettings(data.settings || []), writable: false},
      tours: {value: new foundry.nue.ToursCollection(), writable: false},
      video: {value: new helpers.media.VideoHelper(), writable: false},
      workers: {value: new helpers.WorkerManager(), writable: false},
      keybindings: {value: new helpers.interaction.ClientKeybindings(), writable: false}
    });

    // The singleton game Canvas
    Object.defineProperty(this, "canvas", {value: new foundry.canvas.Canvas(), writable: false});
    Object.defineProperty(globalThis, "canvas", {value: this.canvas, writable: false});

    // Register default sheets
    foundry.applications.sheets._registerDefaultSheets();
  }


  /**
   * Whether the page is unloading (and a socket disconnection should be ignored).
   * @type {boolean}
   */
  static #unloading = false;

  /* -------------------------------------------- */
  /*  Session Attributes                          */
  /* -------------------------------------------- */

  /**
   * The named view which is currently active.
   * @type {"join"|"setup"|"players"|"license"|"game"|"stream"|"auth"|"update"}
   * @readonly
   */
  view;

  /**
   * The object of world data passed from the server.
   * @type {object}
   * @readonly
   */
  data;

  /**
   * The client session id which is currently active.
   * @type {string}
   * @readonly
   */
  sessionId;

  /**
   * A reference to the open Socket.io connection.
   * @type {io.Socket|null}
   * @readonly
   */
  socket;

  /**
   * The id of the active World user, if any.
   * @type {string|null}
   * @readonly
   */
  userId;

  /* -------------------------------------------- */
  /*  Packages Attributes                         */
  /* -------------------------------------------- */

  /**
   * The game World which is currently active.
   * @type {World}
   */
  world;

  /**
   * The System which is used to power this game World.
   * @type {System}
   */
  system;

  /**
   * A Map of active Modules which are currently eligible to be enabled in this World.
   * The subset of Modules which are designated as active are currently enabled.
   * @type {Collection<string, Module>}
   */
  modules;

  /**
   * A mapping of CompendiumCollection instances, one per Compendium pack.
   * @type {collections.CompendiumPacks}
   * @readonly
   */
  packs;

  /**
   * A registry of document sub-types and their respective template.json defaults.
   * @type {Record<string, Record<string, object>>}
   */
  get model() {
    return this.#model;
  }

  #model;

  /**
   * A shortcut to compendiumConfiguration data settings
   * @type {WorldCompendiumConfiguration}
   */
  get compendiumConfiguration() {
    return game.settings.get("core", "compendiumConfiguration");
  }

  /* -------------------------------------------- */
  /*  Document Attributes                         */
  /* -------------------------------------------- */

  /**
   * A registry of document types supported by the active world.
   * @type {Record<string, string[]>}
   */
  get documentTypes() {
    return this.#documentTypes;
  }

  #documentTypes;

  /**
   * The singleton DocumentIndex instance.
   * @type {helpers.DocumentIndex}
   * @readonly
   */
  documentIndex;

  /**
   * The UUID redirects tree.
   * @type {StringTree}
   */
  compendiumUUIDRedirects;

  /**
   * A mapping of {@link WorldCollection} instances, one per primary {@link Document} type.
   * @type {Collection<string, WorldCollection>}
   * @readonly
   */
  collections;

  /**
   * The collection of Actor documents which exists in the World.
   * @type {collections.Actors}
   */
  actors;

  /**
   * The collection of Cards documents which exists in the World.
   * @type {collections.CardStacks}
   */
  cards;

  /**
   * The collection of Combat documents which exists in the World.
   * @type {collections.CombatEncounters}
   */
  combats;

  /**
   * The collection of Folder documents which exists in the World.
   * @type {collections.Folders}
   */
  folders;

  /**
   * The collection of Item documents which exists in the World.
   * @type {collections.Items}
   */
  items;

  /**
   * The collection of JournalEntry documents which exists in the World.
   * @type {collections.Journal}
   */
  journal;

  /**
   * The collection of Macro documents which exists in the World.
   * @type {collections.Macros}
   */
  macros;

  /**
   * The collection of ChatMessage documents which exists in the World.
   * @type {collections.ChatMessages}
   */
  messages;

  /**
   * The collection of Playlist documents which exists in the World.
   * @type {collections.Playlists}
   */
  playlists;

  /**
   * The collection of Scene documents which exists in the World.
   * @type {collections.Scenes}
   */
  scenes;

  /**
   * The collection of RollTable documents which exists in the World.
   * @type {collections.RollTables}
   */
  tables;

  /**
   * The collection of User documents which exists in the World.
   * @type {collections.Users}
   */
  users;

  /* -------------------------------------------- */
  /*  State Attributes                            */
  /* -------------------------------------------- */

  /**
   * The Release data for this version of Foundry
   * @type {ReleaseData}
   * @readonly
   */
  release;

  /**
   * Returns the current version of the Release, usable for comparisons using isNewerVersion
   * @type {string}
   */
  get version() {
    return this.release.version;
  }

  /**
   * Whether the Game is running in debug mode
   * @type {boolean}
   */
  debug = false;

  /**
   * A flag for whether texture assets for the game canvas are currently loading
   * @type {boolean}
   */
  loading = false;

  /**
   * The user role permissions setting.
   * @type {Record<string, number[]>}
   */
  permissions;

  /**
   * A flag for whether the Game has successfully reached the {@link hookEvents.ready} hook
   * @type {boolean}
   */
  ready = false;

  /**
   * An array of buffered events which are received by the socket before the game is ready to use that data.
   * Buffered events are replayed in the order they are received until the buffer is empty.
   * @type {Array<Readonly<[string, ...any]>>}
   */
  static #socketEventBuffer = [];

  /* -------------------------------------------- */
  /*  Helper Classes                              */
  /* -------------------------------------------- */

  /**
   * The singleton compendium art manager.
   * @type {helpers.media.CompendiumArt}
   * @readonly
   */
  compendiumArt;

  /**
   * The singleton Audio Helper.
   * @type {AudioHelper}
   * @readonly
   */
  audio;

  /**
   * The singleton game Canvas.
   * @type {Canvas}
   * @readonly
   */
  canvas;

  /**
   * The singleton Clipboard Helper.
   * @type {helpers.interaction.ClipboardHelper}
   * @readonly
   */
  clipboard;

  /**
   * Localization support.
   * @type {helpers.Localization}
   * @readonly
   */
  i18n;

  /**
   * The singleton ClientIssues manager.
   * @type {helpers.ClientIssues}
   * @readonly
   */
  issues;

  /**
   * The singleton Gamepad Manager.
   * @type {helpers.interaction.GamepadManager}
   * @readonly
   */
  gamepad;

  /**
   * The singleton Keyboard Manager.
   * @type {helpers.interaction.KeyboardManager}
   * @readonly
   */
  keyboard;

  /**
   * Client keybindings which are used to configure application behavior
   * @type {helpers.interaction.ClientKeybindings}
   * @readonly
   */
  keybindings;

  /**
   * The singleton Mouse Manager.
   * @type {helpers.interaction.MouseManager}
   * @readonly
   */
  mouse;

  /**
   * The singleton New User Experience manager.
   * @type {nue.NewUserExperienceManager}
   * @readonly
   */
  nue;

  /**
   * Client settings which are used to configure application behavior.
   * @type {helpers.ClientSettings}
   * @readonly
   */
  settings;

  /**
   * A singleton GameTime instance which manages the progression of time within the game world.
   * @type {helpers.GameTime}
   * @readonly
   */
  time;

  /**
   * The singleton TooltipManager.
   * @type {helpers.interaction.TooltipManager}
   * @readonly
   */
  tooltip;

  /**
   * The singleton Tours collection.
   * @type {nue.ToursCollection}
   * @readonly
   */
  tours;

  /**
   * The singleton Video Helper.
   * @type {helpers.media.VideoHelper}
   * @readonly
   */
  video;

  /**
   * A singleton web Worker manager.
   * @type {helpers.WorkerManager}
   * @readonly
   */
  workers;

  /* -------------------------------------------- */

  /**
   * Fetch World data and return a Game instance
   * @param {string} view             The named view being created
   * @param {string|null} sessionId   The current sessionId of the connecting client
   * @returns {Promise<Game>}         A Promise which resolves to the created Game instance
   */
  static async create(view, sessionId) {
    const socket = sessionId ? await this.connect(sessionId) : null;
    const gameData = socket ? await this.getData(socket, view) : {};
    return new this(view, gameData, sessionId, socket);
  }

  /* -------------------------------------------- */

  /**
   * Establish a live connection to the game server through the socket.io URL
   * @param {string} sessionId  The client session ID with which to establish the connection
   * @returns {Promise<io.Socket>} A promise which resolves to the connected socket, if successful
   */
  static async connect(sessionId) {

    /**
     * Connect to the websocket
     * @type {io.Socket}
     */
    const socket = await new Promise((resolve, reject) => {
      const socket = io.connect({
        path: getRoute("socket.io"),
        transports: ["websocket"],    // Require websocket transport instead of XHR polling
        upgrade: false,               // Prevent "upgrading" to websocket since it is enforced
        reconnection: true,           // Automatically reconnect
        reconnectionDelay: 500,       // Time before reconnection is attempted
        reconnectionAttempts: 10,     // Maximum reconnection attempts
        reconnectionDelayMax: 500,    // The maximum delay between reconnection attempts
        closeOnBeforeunload: true,     // Automatically close the connection on page unload events
        query: {session: sessionId},  // Pass session info
        cookie: false
      });

      // Confirm successful session creation
      socket.on("session", response => {
        socket.session = response;
        const id = response.sessionId;
        if ( !id || (sessionId && (sessionId !== id)) ) return utils.debouncedReload();
        console.log(`${CONST.vtt} | Connected to server socket using session ${id}`);
        resolve(socket);
      });

      // Fail to establish an initial connection
      socket.on("connectTimeout", () => {
        reject(new Error("Failed to establish a socket connection within allowed timeout."));
      });
      socket.on("connectError", err => reject(err));
    });

    // Buffer events until the game is ready
    socket.prependAny(Game.#bufferSocketEvents);

    // Disconnection and reconnection attempts
    let disconnectedTime = 0;
    socket.on("disconnect", () => {
      disconnectedTime = Date.now();
      if ( Game.#unloading ) return;
      disconnectedTime = Date.now();
      ui.notifications.error("You have lost connection to the server, attempting to re-establish.");
    });

    // Reconnect attempt
    socket.io.on("reconnect_attempt", () => {
      const t = Date.now();
      console.log(`${CONST.vtt} | Attempting to re-connect: ${((t - disconnectedTime) / 1000).toFixed(2)} seconds`);
    });

    // Reconnect failed
    socket.io.on("reconnect_failed", () => {
      ui.notifications.error(`${CONST.vtt} | Server connection lost.`);
      window.location.href = getRoute("no");
    });

    // Reconnect succeeded
    const reconnectTimeRequireRefresh = 5000;
    socket.io.on("reconnect", () => {
      ui.notifications.info(`${CONST.vtt} | Server connection re-established.`);
      if ( (Date.now() - disconnectedTime) >= reconnectTimeRequireRefresh ) {
        utils.debouncedReload();
      }
    });
    return socket;
  }

  /* -------------------------------------------- */

  /**
   * Place a buffered socket event into the queue
   * @param {[string, ...any]} args     Arguments of the socket event
   */
  static #bufferSocketEvents(...args) {
    Game.#socketEventBuffer.push(Object.freeze(args));
  }

  /* -------------------------------------------- */

  /**
   * Apply the queue of buffered socket events to game data once the game is ready.
   */
  static #applyBufferedSocketEvents() {
    while ( Game.#socketEventBuffer.length ) {
      const args = Game.#socketEventBuffer.shift();
      console.log(`Applying buffered socket event: ${args[0]}`);
      game.socket.emitEvent(args);
    }
  }

  /* -------------------------------------------- */

  /**
   * Retrieve the cookies which are attached to the client session
   * @returns {object}   The session cookies
   */
  static getCookies() {
    const cookies = {};
    for (const cookie of document.cookie.split("; ")) {
      const [name, value] = cookie.split("=");
      cookies[name] = decodeURIComponent(value);
    }
    return cookies;
  }

  /* -------------------------------------------- */

  /**
   * Request World data from server and return it
   * @param {io.Socket} socket     The active socket connection
   * @param {string} view       The view for which data is being requested
   * @returns {Promise<object>}
   */
  static async getData(socket, view) {
    if ( !socket.session.userId ) {
      socket.disconnect();
      window.location.href = getRoute("join");
    }
    return new Promise(resolve => {
      socket.emit("world", resolve);
    });
  }

  /* -------------------------------------------- */

  /**
   * Get the current World status upon initial connection.
   * @param {io.Socket} socket  The active client socket connection
   * @returns {Promise<boolean>}
   */
  static async getWorldStatus(socket) {
    const status = await new Promise(resolve => {
      socket.emit("getWorldStatus", resolve);
    });
    console.log(`${CONST.vtt} | The game World is currently ${status ? "active" : "not active"}`);
    return status;
  }

  /* -------------------------------------------- */

  /**
   * Configure package data that is currently enabled for this world
   * @param {object} data  Game data provided by the server socket
   */
  setupPackages(data) {
    if ( data.world ) {
      this.world = new foundry.packages.World(data.world);
    }
    if ( data.system ) {
      this.system = new foundry.packages.System(data.system);
      this.#model = Object.freeze(data.model);
      this.#template = Object.freeze(data.template);
      this.#documentTypes = Object.freeze(Object.entries(this.model).reduce((obj, [d, types]) => {
        obj[d] = Object.keys(types);
        return obj;
      }, {}));
    }
    this.modules = new Collection(data.modules.map(m => [m.id, new foundry.packages.Module(m)]));
  }

  /* -------------------------------------------- */

  /**
   * Return the named scopes which can exist for packages.
   * Scopes are returned in the prioritization order that their content is loaded.
   * @returns {string[]}    An array of string package scopes
   */
  getPackageScopes() {
    return CONFIG.DatabaseBackend.getFlagScopes();
  }

  /* -------------------------------------------- */

  /**
   * Initialize the Game for the current window location, triggering the {@link hookEvents.init} event.
   */
  async initialize() {
    console.log(`${CONST.vtt} | Initializing Foundry Virtual Tabletop Game`);
    this.ready = false;

    Hooks.callAll("init");

    // Initialize properties
    Object.defineProperties(this, {
      tooltip: {value: new helpers.interaction.TooltipManager.implementation(), writable: false}
    });

    // Register game settings
    this.registerSettings();

    // Initialize language translations
    await this.i18n.initialize();

    // Register Tours
    await foundry.nue.registerTours();

    // Activate event listeners
    this.activateListeners();

    // Initialize the current view
    await this._initializeView();

    // Display usability warnings or errors
    this.issues._detectUsabilityIssues();
  }

  /* -------------------------------------------- */

  /**
   * Shut down the currently active Game. Requires GameMaster user permission.
   * @returns {Promise<void>}
   */
  async shutDown() {
    if ( !(game.user?.isGM || game.data.isAdmin) ) {
      throw new Error("Only a Gamemaster User or server Administrator may shut down the currently active world");
    }

    // Display a warning if other players are connected
    const othersActive = game.users.filter(u => u.active && !u.isSelf).length;
    if ( othersActive ) {
      const warning = othersActive > 1 ? "GAME.ReturnSetupActiveUsers" : "GAME.ReturnSetupActiveUser";
      const confirm = await foundry.applications.api.DialogV2.confirm({
        window: {title: "GAME.ReturnSetup"},
        content: `<p>${game.i18n.format(warning, {number: othersActive})}</p>`
      });
      if ( !confirm ) return;
    }

    // Dispatch the request
    await utils.fetchWithTimeout(getRoute("setup"), {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({shutdown: true}),
      redirect: "manual"
    });
  }

  /* -------------------------------------------- */
  /*  Primary Game Initialization                 */
  /* -------------------------------------------- */

  /**
   * Fully set up the game state, initializing Documents, UI applications, and the Canvas. Triggers the
   * {@link hookEvents.setup} and {@link hookEvents.ready} events.
   * @returns {Promise<void>}
   */
  async setupGame() {

    // Additional properties specific to the Game view
    this.permissions = this.settings.get("core", "permissions");
    Object.defineProperty(this, "time", {value: new helpers.GameTime(), writable: false});
    await this.time.sync();

    // Initialize configuration data
    this.initializeConfig();

    // Initialize world data
    this.initializePacks();             // Initialize compendium packs
    this.initializeDocuments();         // Initialize world documents
    this.initializeTrees();             // Initialize collection trees

    // Monkeypatch a search method on EmbeddedCollection
    foundry.abstract.EmbeddedCollection.prototype.search = DocumentCollection.prototype.search;

    // Call world setup hook
    Hooks.callAll("setup");

    // Initialize audio playback
    // noinspection ES6MissingAwait
    this.playlists.initialize();

    // Initialize AV conferencing
    // noinspection ES6MissingAwait
    this.initializeRTC();

    // Initialize user interface
    this.initializeMouse();
    this.initializeGamepads();
    this.initializeKeyboard();

    // Parse the UUID redirects configuration.
    this.#parseRedirects();

    // Initialize dynamic token config
    foundry.canvas.placeables.tokens.TokenRingConfig.initialize();

    // Initialize combat turn markers config
    foundry.data.CombatConfiguration.initialize();

    // Call this here to set up a promise that dependent UI elements can await.
    this.canvas.initializing = this.initializeCanvas();
    this.initializeUI();
    await foundry.applications.apps.DocumentSheetConfig.initializeSheets();

    // If the player is not a GM and does not have an impersonated character, prompt for selection
    if ( !this.user.isGM && !this.user.character ) {
      this.user.sheet.render({force: true});
    }

    // Index documents for search
    await this.documentIndex.index();

    // Wait for canvas initialization and call all game ready hooks
    await this.canvas.initializing;
    this.ready = true;
    this.activateSocketListeners();
    Hooks.callAll("ready");

    // Initialize New User Experience
    this.nue.initialize();
  }

  /* -------------------------------------------- */

  /**
   * Initialize configuration state.
   */
  initializeConfig() {
    // Configure token ring subject paths
    Object.assign(CONFIG.Token.ring.subjectPaths, this.system.flags?.tokenRingSubjectMappings);
    for ( const module of this.modules ) {
      if ( module.active ) Object.assign(CONFIG.Token.ring.subjectPaths, module.flags?.tokenRingSubjectMappings);
    }

    // Configure Actor art.
    this.compendiumArt._registerArt();

    // Initialize Token movement actions
    this.#initializeMovementActions();
  }

  /* -------------------------------------------- */

  /**
   * Initialize and validate Token movement actions.
   */
  #initializeMovementActions() {

    // Validate and initialize movement action
    for ( const [action, config] of Object.entries(CONFIG.Token.movement.actions) ) {
      if ( !config.label ) throw new Error(`CONFIG.Token.movement.actions["${action}"] must have a label`);
      if ( !config.icon ) throw new Error(`CONFIG.Token.movement.actions["${action}"] must have an icon`);
      if ( config.img === undefined ) config.img = null;
      if ( config.order === undefined ) config.order = 0;
      if ( config.teleport === undefined ) config.teleport = false;
      if ( config.measure === undefined ) config.measure = true;
      if ( config.walls === undefined ) config.walls = "move";
      if ( config.visualize === undefined ) config.visualize = true;
      if ( config.getAnimationOptions === undefined ) config.getAnimationOptions = () => ({});
      if ( config.canSelect === undefined ) config.canSelect = () => true;
      if ( config.deriveTerrainDifficulty === undefined ) config.deriveTerrainDifficulty = null;
      if ( config.getCostFunction === undefined ) config.getCostFunction = () => cost => cost;
    }

    // Special validation for the default movement action
    const defaultAction = CONFIG.Token.movement.actions[CONFIG.Token.movement.defaultAction];
    if ( !defaultAction ) throw new Error("CONFIG.Token.movement.defaultAction is not registered");
    if ( defaultAction.deriveTerrainDifficulty ) throw new Error("CONFIG.Token.movement.defaultAction must not have a derived difficulty");

    // Special validation for the "displace" movement action
    const displaceAction = {...(CONFIG.Token.movement.actions.displace ?? {})};
    if ( !Object.keys(displaceAction).length ) throw new Error("CONFIG.Token.movement.actions.displace is required");
    if ( displaceAction.teleport !== true ) throw new Error("CONFIG.Token.movement.displace must be teleportation");
    if ( displaceAction.measure !== false ) throw new Error("CONFIG.Token.movement.displace must be not be measured");
    if ( displaceAction.walls !== null ) throw new Error("CONFIG.Token.movement.displace must be not be blocked by walls");
    if ( displaceAction.visualize !== false ) throw new Error("CONFIG.Token.movement.displace must not be visualized");
    if ( !displaceAction.deriveTerrainDifficulty ) throw new Error("CONFIG.Token.movement.displace must have a derived difficulty");

    // Enforce specific return values of certain functions
    displaceAction.getAnimationOptions = () => ({duration: 0});
    displaceAction.getCostFunction = () => () => 0;
    CONFIG.Token.movement.actions.displace = displaceAction;

    // Sort the movement actions
    const actions = Object.fromEntries(Object.entries(CONFIG.Token.movement.actions)
      .sort((a, b) => a[1].order - b[1].order));

    // Freeze movement actions
    Object.defineProperty(CONFIG.Token.movement, "actions", {
      value: foundry.utils.deepFreeze(actions),
      writable: false,
      configurable: false
    });
  }

  /* -------------------------------------------- */

  /**
   * Initialize game state data by creating {@link WorldCollection} instances for every primary {@link Document} type
   */
  initializeDocuments() {
    const excluded = ["FogExploration", "Setting"];
    const initOrder = ["User", "Folder", "Actor", "Item", "Scene", "Combat", "JournalEntry", "Macro", "Playlist",
      "RollTable", "Cards", "ChatMessage"];
    if ( !new Set(initOrder).equals(new Set(CONST.WORLD_DOCUMENT_TYPES.filter(t => !excluded.includes(t)))) ) {
      throw new Error("Missing Document initialization type!");
    }

    // Warn developers about collision with V10 DataModel changes
    const v10DocumentMigrationErrors = [];
    for ( const documentName of initOrder ) {
      const cls = utils.getDocumentClass(documentName);
      for ( const key of cls.schema.keys() ) {
        if ( key in cls.prototype ) {
          const err = `The ${cls.name} class defines the "${key}" attribute which collides with the "${key}" key in `
          + `the ${cls.documentName} data schema`;
          v10DocumentMigrationErrors.push(err);
        }
      }
    }
    if ( v10DocumentMigrationErrors.length ) {
      v10DocumentMigrationErrors.unshift("Version 10 Compatibility Failure",
        "-".repeat(90),
        "Several Document class definitions include properties which collide with the new V10 DataModel:",
        "-".repeat(90));
      throw new Error(v10DocumentMigrationErrors.join("\n"));
    }

    // Initialize world document collections
    this._documentsReady = false;
    const t0 = performance.now();
    for ( const documentName of initOrder ) {
      const documentClass = CONFIG[documentName].documentClass;
      const collectionClass = CONFIG[documentName].collection;
      const collectionName = documentClass.metadata.collection;
      this[collectionName] = new collectionClass(this.data[collectionName]);
      this.collections.set(documentName, this[collectionName]);
    }
    this._documentsReady = true;

    // Prepare data for all world documents (this was skipped at construction-time)
    for ( const collection of this.collections.values() ) {
      for ( const document of collection ) {
        document._safePrepareData();
      }
    }

    // Special-case - world settings
    this.collections.set("Setting", this.settings.storage.get("world"));

    // Special case - fog explorations
    const fogCollectionCls = CONFIG.FogExploration.collection;
    this.collections.set("FogExploration", new fogCollectionCls());
    const dt = performance.now() - t0;
    console.debug(`${CONST.vtt} | Prepared World Documents in ${Math.round(dt)}ms`);
  }

  /* -------------------------------------------- */

  /**
   * Initialize the Compendium packs which are present within this Game
   * Create a Collection which maps each Compendium pack using its collection ID.
   * @returns {collections.CompendiumPacks}
   */
  initializePacks() {
    for ( const metadata of this.data.packs ) {
      const pack = this.packs.get(metadata.id) ?? new collections.CompendiumCollection(metadata);
      this.packs.set(pack.collection, pack);
    }
    return this.packs;
  }

  /* -------------------------------------------- */

  /**
   * Initialize collection trees.
   */
  initializeTrees() {
    this.packs.initializeTree();
    for ( const pack of this.packs ) pack.initializeTree();
    for ( const collection of this.collections ) collection.initializeTree();
  }

  /* -------------------------------------------- */

  /**
   * Initialize the WebRTC implementation
   */
  initializeRTC() {
    this.webrtc = new AVMaster();
    return this.webrtc.connect();
  }

  /* -------------------------------------------- */

  /**
   * Initialize core UI elements
   */
  initializeUI() {

    // Configure interface
    const uiConfig = game.settings.get("core", "uiConfig");
    this.configureUI(uiConfig);
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => this.configureUI());

    // Initialize all singleton applications
    for ( const [k, cls] of Object.entries(CONFIG.ui) ) {
      ui[k] = new cls();
    }

    // Initialize pack applications
    for ( const pack of this.packs.values() ) {
      const App = pack.applicationClass;
      if ( Application.isPrototypeOf(App) || foundry.applications.api.ApplicationV2.isPrototypeOf(App) ) {
        const app = new App({collection: pack});
        pack.apps.push(app);
      }
    }

    // Render some applications (asynchronously)
    ui.nav.render({force: true});
    ui.sidebar.render({force: true});
    ui.players.render({force: true});
    ui.hotbar.render({force: true});
    ui.webrtc.render({force: true});
    ui.pause.render({force: true});
    ui.controls.render({force: true});
  }

  /* -------------------------------------------- */

  /**
   * Initialize the game Canvas
   * @returns {Promise<void>}
   */
  async initializeCanvas() {

    // Ensure that necessary fonts have fully loaded
    await FontConfig._loadFonts();

    // Identify the current scene
    const scene = game.scenes.current;

    // Attempt to initialize the canvas and draw the current scene
    try {
      this.canvas.initialize();
      if ( scene ) await scene.view();
      else if ( this.canvas.initialized ) await this.canvas.draw(null);
    } catch(err) {
      Hooks.onError("Game#initializeCanvas", err, {
        msg: "Failed to render WebGL canvas",
        log: "error"
      });
    }
  }

  /* -------------------------------------------- */

  /**
   * Initialize Keyboard controls
   */
  initializeKeyboard() {
    this.keyboard._activateListeners();
    try {
      game.keybindings._registerCoreKeybindings(this.view);
      game.keybindings.initialize();
    }
    catch(e) {
      console.error(e);
    }
  }

  /* -------------------------------------------- */

  /**
   * Initialize Mouse controls
   */
  initializeMouse() {
    this.mouse._activateListeners();
  }

  /* -------------------------------------------- */

  /**
   * Initialize Gamepad controls
   */
  initializeGamepads() {
    this.gamepad._activateListeners();
  }

  /* -------------------------------------------- */

  /**
   * Register core game settings
   */
  registerSettings() {

    // Experimental: Universal Keybindings
    game.settings.register("core", "universalKeybindings", {
      name: "SETTINGS.UniversalKeybindingsN",
      hint: "SETTINGS.UniversalKeybindingsL",
      scope: "client",
      config: true,
      type: new foundry.data.fields.BooleanField({initial: false}),
      requiresReload: true
    });

    // UI Configuration
    game.settings.registerMenu("core", "uiConfigMenu", {
      name: "SETTINGS.UI.MENU.name",
      label: "SETTINGS.UI.MENU.label",
      hint: "SETTINGS.UI.MENU.hint",
      icon: "fa-solid fa-table-layout",
      type: foundry.applications.settings.menus.UIConfig
    });

    // Permissions Control Menu
    game.settings.registerMenu("core", "permissions", {
      name: "PERMISSION.Configure",
      label: "PERMISSION.ConfigureLabel",
      hint: "PERMISSION.ConfigureHint",
      icon: "fa-solid fa-user-lock",
      type: foundry.applications.apps.PermissionConfig,
      restricted: true
    });

    // Combat turn markers settings
    foundry.data.CombatConfiguration.registerSettings();

    // User Role Permissions
    game.settings.register("core", "permissions", {
      name: "Permissions",
      scope: "world",
      default: {},
      type: Object,
      config: false,
      onChange: permissions => {
        game.permissions = permissions;
        if ( ui.controls ) ui.controls.render({reset: true});
        if ( ui.sidebar ) ui.sidebar.render();
        if ( canvas.ready ) canvas.controls.drawCursors();
      }
    });

    // WebRTC Control Menu
    game.settings.registerMenu("core", "webrtc", {
      name: "WEBRTC.Title",
      label: "WEBRTC.MenuLabel",
      hint: "WEBRTC.MenuHint",
      icon: "fa-solid fa-headset",
      type: foundry.applications.settings.menus.AVConfig,
      restricted: false
    });

    // WebRTC Settings
    foundry.av.AVSettings.register();

    // Prototype Token Overrides
    foundry.applications.settings.menus.PrototypeOverridesConfig.registerSettings();

    // Font Configuration
    game.settings.registerMenu("core", FontConfig.SETTING, {
      name: "SETTINGS.FontConfigN",
      label: "SETTINGS.FontConfigL",
      hint: "SETTINGS.FontConfigH",
      icon: "fa-solid fa-font",
      type: FontConfig,
      restricted: true
    });

    // Font Configuration Settings
    game.settings.register("core", FontConfig.SETTING, {
      scope: "world",
      type: Object,
      default: {}
    });

    // Combat Tracker Configuration
    game.settings.registerMenu("core", foundry.documents.Combat.CONFIG_SETTING, {
      name: "SETTINGS.CombatConfigN",
      label: "SETTINGS.CombatConfigL",
      hint: "SETTINGS.CombatConfigH",
      icon: "fa-solid fa-swords",
      type: foundry.applications.apps.CombatTrackerConfig
    });

    // No-Canvas Mode
    game.settings.register("core", "noCanvas", {
      name: "SETTINGS.NoCanvasN",
      hint: "SETTINGS.NoCanvasL",
      scope: "client",
      config: true,
      type: new foundry.data.fields.BooleanField({initial: false}),
      requiresReload: true
    });

    // Language preference
    game.settings.register("core", "language", {
      name: "SETTINGS.LangN",
      hint: "SETTINGS.LangL",
      scope: "client",
      config: true,
      type: new foundry.data.fields.StringField({required: true, blank: false, initial: game.i18n.lang,
        choices: CONFIG.supportedLanguages}),
      requiresReload: true
    });

    // Token ring settings
    foundry.canvas.placeables.tokens.TokenRingConfig.registerSettings();

    // Chat message roll mode
    game.settings.register("core", "rollMode", {
      name: "Default Roll Mode",
      scope: "client",
      config: false,
      type: new foundry.data.fields.StringField({required: true, blank: false, initial: CONST.DICE_ROLL_MODES.PUBLIC,
        choices: CONFIG.Dice.rollModes}),
      onChange: () => ui.chat._updateRollMode()
    });

    // Dice config settings
    foundry.applications.settings.menus.DiceConfig.registerSetting();

    // Compendium art configuration.
    game.settings.register("core", this.compendiumArt.SETTING, {
      config: false,
      default: {},
      type: Object,
      scope: "world"
    });

    game.settings.registerMenu("core", this.compendiumArt.SETTING, {
      name: "COMPENDIUM.ART.SETTING.Title",
      label: "COMPENDIUM.ART.SETTING.Label",
      hint: "COMPENDIUM.ART.SETTING.Hint",
      icon: "fas fa-palette",
      type: foundry.applications.apps.CompendiumArtConfig,
      restricted: true
    });

    // World time
    game.settings.register("core", "time", {
      name: "World Time",
      scope: "world",
      config: false,
      type: new foundry.data.fields.NumberField({required: true, nullable: false, initial: 0}),
      onChange: (...args) => this.time.onUpdateWorldTime(...args)
    });

    // Register module configuration settings
    game.settings.register("core", foundry.applications.sidebar.apps.ModuleManagement.SETTING, {
      name: "Module Configuration Settings",
      scope: "world",
      config: false,
      type: new foundry.data.fields.TypedObjectField(new foundry.data.fields.BooleanField(),
        {validateKey: foundry.packages.BasePackage.validateId}),
      requiresReload: true
    });

    // Register compendium visibility setting
    game.settings.register("core", collections.CompendiumCollection.CONFIG_SETTING, {
      name: "Compendium Configuration",
      scope: "world",
      config: false,
      type: collections.CompendiumCollection.CONFIG_FIELD,
      onChange: collections.CompendiumCollection._onConfigure
    });

    foundry.applications.settings.menus.DefaultSheetsConfig.registerSetting();

    game.settings.register("core", "sheetThemes", {
      scope: "client",
      config: false,
      default: {},
      type: Object
    });

    // Are Chat Bubbles Enabled?
    game.settings.register("core", "chatBubbles", {
      name: "SETTINGS.CBubN",
      hint: "SETTINGS.CBubL",
      scope: "client",
      config: true,
      type: new foundry.data.fields.BooleanField({initial: true})
    });

    // Pan to Token Speaker
    game.settings.register("core", "chatBubblesPan", {
      name: "SETTINGS.CBubPN",
      hint: "SETTINGS.CBubPL",
      scope: "client",
      config: true,
      type: new foundry.data.fields.BooleanField({initial: true})
    });

    // Scrolling Status Text
    game.settings.register("core", "scrollingStatusText", {
      name: "SETTINGS.ScrollStatusN",
      hint: "SETTINGS.ScrollStatusL",
      scope: "world",
      config: true,
      type: new foundry.data.fields.BooleanField({initial: true})
    });

    // Disable Resolution Scaling
    game.settings.register("core", "pixelRatioResolutionScaling", {
      name: "SETTINGS.ResolutionScaleN",
      hint: "SETTINGS.ResolutionScaleL",
      scope: "client",
      config: true,
      type: new foundry.data.fields.BooleanField({initial: true}),
      requiresReload: true
    });

    // Left-Click Deselection
    game.settings.register("core", "leftClickRelease", {
      name: "SETTINGS.LClickReleaseN",
      hint: "SETTINGS.LClickReleaseL",
      scope: "client",
      config: true,
      type: new foundry.data.fields.BooleanField({initial: false})
    });

    // Canvas Performance Mode
    game.settings.register("core", "performanceMode", {
      name: "SETTINGS.PerformanceModeN",
      hint: "SETTINGS.PerformanceModeL",
      scope: "client",
      config: true,
      type: new foundry.data.fields.NumberField({required: true, nullable: true, initial: null, choices: {
        [CONST.CANVAS_PERFORMANCE_MODES.LOW]: "SETTINGS.PerformanceModeLow",
        [CONST.CANVAS_PERFORMANCE_MODES.MED]: "SETTINGS.PerformanceModeMed",
        [CONST.CANVAS_PERFORMANCE_MODES.HIGH]: "SETTINGS.PerformanceModeHigh",
        [CONST.CANVAS_PERFORMANCE_MODES.MAX]: "SETTINGS.PerformanceModeMax"
      }}),
      requiresReload: true,
      onChange: () => {
        canvas._configurePerformanceMode();
        return canvas.ready ? canvas.draw() : null;
      }
    });

    // Maximum Framerate
    game.settings.register("core", "maxFPS", {
      name: "SETTINGS.MaxFPSN",
      hint: "SETTINGS.MaxFPSL",
      scope: "client",
      config: true,
      type: new foundry.data.fields.NumberField({required: true, min: 10, max: 60, step: 10, initial: 60}),
      onChange: () => {
        canvas._configurePerformanceMode();
        return canvas.ready ? canvas.draw() : null;
      }
    });

    // UI Configuration
    game.settings.register("core", "uiConfig", {
      scope: "client",
      config: false,
      type: foundry.applications.settings.menus.UIConfig.schema,
      onChange: config => {
        game.configureUI(config);
        if ( canvas.ready ) canvas.draw();
        ui.chat?._toggleNotifications();
      }
    });

    // Photosensitivity mode.
    game.settings.register("core", "photosensitiveMode", {
      name: "SETTINGS.PhotosensitiveModeN",
      hint: "SETTINGS.PhotosensitiveModeL",
      scope: "client",
      config: true,
      type: new foundry.data.fields.BooleanField({initial: false}),
      requiresReload: true
    });

    // Token Automatic Rotation
    game.settings.register("core", "tokenAutoRotate", {
      name: "SETTINGS.TokenAutoRotateN",
      hint: "SETTINGS.TokenAutoRotateL",
      scope: "world",
      config: true,
      type: new foundry.data.fields.BooleanField({initial: true})
    });

    // Live Token Drag Preview
    game.settings.register("core", "tokenDragPreview", {
      name: "SETTINGS.TokenDragPreviewN",
      hint: "SETTINGS.TokenDragPreviewL",
      scope: "world",
      config: true,
      type: new foundry.data.fields.BooleanField({initial: false})
    });

    // Animated Token Vision
    game.settings.register("core", "visionAnimation", {
      name: "SETTINGS.AnimVisionN",
      hint: "SETTINGS.AnimVisionL",
      config: true,
      type: new foundry.data.fields.BooleanField({initial: true})
    });

    // Light Source Flicker
    game.settings.register("core", "lightAnimation", {
      name: "SETTINGS.AnimLightN",
      hint: "SETTINGS.AnimLightL",
      config: true,
      type: new foundry.data.fields.BooleanField({initial: true}),
      onChange: () => canvas.effects?.activateAnimation()
    });

    // Mipmap Antialiasing
    game.settings.register("core", "mipmap", {
      name: "SETTINGS.MipMapN",
      hint: "SETTINGS.MipMapL",
      config: true,
      type: new foundry.data.fields.BooleanField({initial: true}),
      onChange: () => canvas.ready ? canvas.draw() : null
    });

    // Default Drawing Configuration
    const DrawingDocument = foundry.documents.DrawingDocument;
    const drawingSchema = DrawingDocument.defineSchema();
    drawingSchema.bezierFactor.initial = 0.5;
    game.settings.register("core", foundry.canvas.layers.DrawingsLayer.DEFAULT_CONFIG_SETTING, {
      name: "Default Drawing Configuration",
      scope: "client",
      config: false,
      type: new foundry.data.fields.SchemaField(DrawingDocument.defaultDrawingFields.reduce((fields, key) => {
        fields[key] = drawingSchema[key];
        return fields;
      }, {}), {validate: data => {
        if ( !foundry.documents.BaseDrawing._validateVisibleContent(data) ) {
          throw new Error(game.i18n.localize("DRAWING.JointValidationError"));
        }
      }})
    });

    // Keybindings
    game.settings.register("core", "keybindings", {
      scope: "client",
      config: false,
      type: Object,
      default: {},
      onChange: () => game.keybindings.initialize()
    });

    // New User Experience
    game.settings.register("core", "nue.shownTips", {
      scope: "world",
      type: new foundry.data.fields.BooleanField({initial: false}),
      config: false
    });

    // Tours
    game.settings.register("core", "tourProgress", {
      scope: "client",
      config: false,
      type: Object,
      default: {}
    });

    // Editor autosave.
    game.settings.register("core", "editorAutosaveSecs", {
      name: "SETTINGS.EditorAutosaveN",
      hint: "SETTINGS.EditorAutosaveH",
      scope: "world",
      config: true,
      type: new foundry.data.fields.NumberField({required: true, min: 30, max: 300, step: 10, initial: 60})
    });

    // Link recommendations.
    game.settings.register("core", "pmHighlightDocumentMatches", {
      name: "SETTINGS.EnableHighlightDocumentMatches",
      hint: "SETTINGS.EnableHighlightDocumentMatchesH",
      scope: "world",
      config: false,
      type: new foundry.data.fields.BooleanField({initial: true})
    });

    // Combat Theme
    game.settings.register("core", "combatTheme", {
      name: "SETTINGS.CombatThemeN",
      hint: "SETTINGS.CombatThemeL",
      scope: "client",
      config: false,
      type: new foundry.data.fields.StringField({required: true, blank: false, initial: "none",
        choices: () => Object.entries(CONFIG.Combat.sounds).reduce((choices, s) => {
          choices[s[0]] = game.i18n.localize(s[1].label);
          return choices;
        }, {none: game.i18n.localize("SETTINGS.None")})
      })
    });

    // Show Toolclips
    game.settings.register("core", "showToolclips", {
      name: "SETTINGS.ShowToolclips",
      hint: "SETTINGS.ShowToolclipsH",
      scope: "client",
      config: true,
      type: new foundry.data.fields.BooleanField({initial: true}),
      requiresReload: true
    });

    // Favorite paths
    game.settings.register("core", "favoritePaths", {
      scope: "client",
      config: false,
      type: Object,
      default: {
        "data-/": {source: "data", path: "/", label: "root"},
        "data-assets/": {source: "data", path: "assets/", label: "assets"}
      }
    });

    // Top level collection sorting
    game.settings.register("core", "collectionSortingModes", {
      scope: "client",
      config: false,
      type: Object,
      default: {}
    });

    // Collection searching
    game.settings.register("core", "collectionSearchModes", {
      scope: "client",
      config: false,
      type: Object,
      default: {}
    });

    // Hotbar lock
    game.settings.register("core", "hotbarLock", {
      scope: "client",
      config: false,
      type: new foundry.data.fields.BooleanField({initial: false}),
      onChange: (locked, options) => {
        if ( options.render !== false ) ui.hotbar.render();
      }
    });

    // Adventure imports
    game.settings.register("core", "adventureImports", {
      scope: "world",
      config: false,
      type: Object,
      default: {}
    });

    // Experimental flags
    game.settings.register("core", "experimental", {
      scope: "client",
      config: false,
      type: Object,
      default: {}
    });

    // Document-specific settings
    collections.RollTables.registerSettings();
    foundry.applications.sidebar.tabs.PlaylistDirectory._registerSettings();

    // Audio playback settings
    foundry.audio.AudioHelper.registerSettings();

    // Register CanvasLayer settings
    foundry.canvas.layers.NotesLayer.registerSettings();

    // Grid Diagonals
    game.settings.register("core", "gridDiagonals", {
      name: "SETTINGS.GridDiagonalsN",
      hint: "SETTINGS.GridDiagonalsL",
      scope: "world",
      config: true,
      type: new foundry.data.fields.NumberField({
        required: true,
        initial: game.system?.grid.diagonals ?? CONST.GRID_DIAGONALS.EQUIDISTANT,
        choices: {
          [CONST.GRID_DIAGONALS.EQUIDISTANT]: "SETTINGS.GridDiagonalsEquidistant",
          [CONST.GRID_DIAGONALS.EXACT]: "SETTINGS.GridDiagonalsExact",
          [CONST.GRID_DIAGONALS.APPROXIMATE]: "SETTINGS.GridDiagonalsApproximate",
          [CONST.GRID_DIAGONALS.RECTILINEAR]: "SETTINGS.GridDiagonalsRectilinear",
          [CONST.GRID_DIAGONALS.ALTERNATING_1]: "SETTINGS.GridDiagonalsAlternating1",
          [CONST.GRID_DIAGONALS.ALTERNATING_2]: "SETTINGS.GridDiagonalsAlternating2",
          [CONST.GRID_DIAGONALS.ILLEGAL]: "SETTINGS.GridDiagonalsIllegal"
        }
      }),
      requiresReload: true
    });

    foundry.canvas.layers.TemplateLayer.registerSettings();

    // Unconstrained Movement
    game.settings.register("core", "unconstrainedMovement", {
      scope: "client",
      config: false,
      type: new foundry.data.fields.BooleanField({initial: false}),
      onChange: active => {
        canvas.tokens?.recalculatePlannedMovementPaths();

        // Rerender scene controls button
        if ( !ui.controls ) return;
        const tools = ui.controls.controls.tokens.tools;
        if ( !tools.unconstrainedMovement ) return;
        if ( tools.unconstrainedMovement.active === active ) return;
        tools.unconstrainedMovement.active = active;
        ui.controls.render();
      }
    });

  }

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * Is the current session user authenticated as an application administrator?
   * @type {boolean}
   */
  get isAdmin() {
    return this.data.isAdmin;
  }

  /* -------------------------------------------- */

  /**
   * The currently connected User document, or null if Users is not yet initialized
   * @type {User|null}
   */
  get user() {
    return this.users?.current ?? null;
  }

  /* -------------------------------------------- */

  /**
   * A convenience accessor for the currently viewed Combat encounter
   * @type {Combat|null}
   */
  get combat() {
    return this.combats?.viewed ?? null;
  }

  /* -------------------------------------------- */

  /**
   * A state variable which tracks whether the game session is currently paused
   * @type {boolean}
   */
  get paused() {
    return this.data.paused;
  }

  /* -------------------------------------------- */

  /**
   * A convenient reference to the currently active canvas tool
   * @type {string}
   */
  get activeTool() {
    return ui.controls?.tool?.name ?? "select";
  }

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /**
   * Toggle the pause state of the game, triggering the {@link hookEvents.pauseGame} hook when the paused
   * state changes.
   * @param {boolean} pause           The desired pause state; true for paused, false for un-paused
   * @param {object} [options]        Additional options which modify the pause operation
   * @param {boolean} [options.broadcast=false] Broadcast the pause state change to other connected clients?
   *                                            Broadcasting to other clients can only be done by a GM user.
   * @param {string} [options.userId]           The ID of the user who triggered the pause operation. This is
   *                                            populated automatically by the game server.
   * @returns {boolean}               The new paused state
   */
  togglePause(pause, options={}) {
    if ( typeof options === "boolean" ) {
      const msg = "You are passing the legacy \"push\" boolean to Game#togglePause. This is replaced by the"
        + " \"broadcast\" option, for example game.togglePause(true, {broadcast: true}).";
      utils.logCompatibilityWarning(msg, {since: 13, until: 15});
      options = {broadcast: /** @type {boolean} */ options};
    }

    // Broadcast the pause request
    const wasPaused = this.data.paused;
    pause ??= !this.data.paused;
    if (options.broadcast && game.user.isGM) {
      options.userId = game.user.id;
      game.socket.emit("pause", pause, options);
    }

    // Handle pause locally
    this.data.paused = pause;
    if ( pause && !wasPaused ) game.user.movingTokens.forEach(token => token.stopMovement());
    ui.pause.render();
    Hooks.callAll("pauseGame", this.data.paused, options);
    return this.data.paused;
  }

  /* -------------------------------------------- */

  /**
   * Open Character sheet for current token or controlled actor
   * @returns {appv1.sheets.ActorSheet|applications.sheets.ActorSheetV2|null} The toggled {@link Actor} sheet, or null
   *                                                                          if the {@link User} has no assigned
   *                                                                          character
   */
  toggleCharacterSheet() {
    const token = canvas.ready && (canvas.tokens.controlled.length === 1) ? canvas.tokens.controlled[0] : null;
    const actor = token ? token.actor : game.user.character;
    if ( !actor ) return null;
    const sheet = actor.sheet;
    if ( sheet.rendered ) {
      if ( sheet._minimized ) sheet.maximize();
      else sheet.close();
    }
    else sheet.render(true);
    return sheet;
  }

  /* -------------------------------------------- */

  /**
   * Log out of the game session by returning to the Join screen
   */
  logOut() {
    window.location.href = getRoute("join");
  }

  /* -------------------------------------------- */

  /**
   * Configure the user interface.
   * @param {GameUIConfiguration} config
   */
  configureUI({fontScale=5, uiScale=1, colorScheme={}, fade={}}={}) {
    const {applications="", interface: iface=""} = colorScheme;
    const rootStyle = document.documentElement.style;
    const body = document.body;

    // UI Variables
    body.style.setProperty("--ui-scale", String(uiScale));
    body.style.setProperty("--ui-fade-opacity", String(fade.opacity));
    body.style.setProperty("--ui-fade-duration", `${fade.speed}ms`);
    body.style.setProperty("--ui-fade-delay", `${fade.speed}ms`);

    // Font Scale
    const fontSizes = [8, 10, 12, 14, 16, 18, 20, 24, 28, 32];
    const size = fontSizes[fontScale - 1] || 16;
    rootStyle.fontSize = `${size}px`;

    // Performance Mode
    const perfMode = game.settings.get("core", "performanceMode");
    const perf = foundry.utils.invertObject(CONST.CANVAS_PERFORMANCE_MODES)[perfMode];
    if ( perf ) body.classList.add(`performance-${perf.toLowerCase()}`);

    // No-blur
    const { noBlur } = game.settings.get("core", "experimental");
    if ( noBlur ) body.classList.add("noblur");

    let browserDefault;
    if ( matchMedia("(prefers-color-scheme: dark)").matches ) browserDefault = "theme-dark";
    else if ( matchMedia("(prefers-color-scheme: light)").matches ) browserDefault = "theme-light";

    // Preferred Color Scheme
    body.classList.remove("theme-light", "theme-dark");
    if ( applications || browserDefault ) body.classList.add(applications ? `theme-${applications}` : browserDefault);

    // Preferred Interface Theme
    const interfaceElements = [
      document.getElementById("interface"),
      ...foundry.applications.instances.values().reduce((arr, app) => {
        const isSidebarTab = app instanceof foundry.applications.sidebar.AbstractSidebarTab;
        const isCompendium = app instanceof foundry.applications.sidebar.apps.Compendium;
        const isCameraView = app instanceof foundry.applications.apps.av.CameraViews;
        const isCamera = app instanceof foundry.applications.apps.av.CameraPopout;
        const isHUD = app instanceof foundry.applications.hud.BasePlaceableHUD;
        if ( !isSidebarTab && !isCompendium && !isCameraView && !isCamera && !isHUD ) return arr;
        if ( !app.options.classes.includes("themed") ) arr.push(app.element);
        return arr;
      }, [])
    ];
    for ( const el of interfaceElements ) {
      el.classList.remove("theme-light", "theme-dark");
      if ( iface || browserDefault ) {
        el.classList.add("themed", iface ? `theme-${iface}` : browserDefault);
      }
    }

    // User Colors
    for ( const user of game.users ) rootStyle.setProperty(`--user-color-${user.id}`, user.color.css);
    rootStyle.setProperty("--user-color", game.user.color.css);

    // Cursors
    this.configureCursors();

    // Hotbar
    ui.hotbar?._onResize();
  }

  /* -------------------------------------------- */

  /**
   * Configure custom cursors.
   */
  configureCursors() {
    const rootStyle = document.documentElement.style;

    // Remove any prior cursor styles
    for ( const k of Object.keys(rootStyle) ) {
      if ( k.startsWith("--cursor") ) rootStyle.removeProperty(k);
    }

    // Merge config with required constants
    const cfg = {...CONST.CURSOR_STYLES, ...CONFIG.cursors};

    // Add new configured styles
    for ( const [cursor, config] of Object.entries(cfg) ) {
      const url = typeof config === "string" ? config : config.url;
      if ( !url ) continue;
      const isImage = helpers.media.ImageHelper.hasImageExtension(url);
      let css = isImage ? `url("${getRoute(url)}")` : url;
      if ( isImage && Number.isFinite(config.x) && Number.isFinite(config.y) ) css += ` ${config.x} ${config.y}`;
      if ( isImage ) css += `, ${cursor === "grab-down" ? "grabbing" : cursor.split("-")[0]}`;
      rootStyle.setProperty(`--cursor-${cursor}`, css);
    }
  }

  /* -------------------------------------------- */

  /**
   * Parse the configured UUID redirects and arrange them as a {@link foundry.utils.StringTree}.
   */
  #parseRedirects() {
    this.compendiumUUIDRedirects = new StringTree();
    for ( const [prefix, replacement] of Object.entries(CONFIG.compendium.uuidRedirects) ) {
      if ( !prefix.startsWith("Compendium.") ) continue;
      this.compendiumUUIDRedirects.addLeaf(prefix.split("."), replacement.split("."));
    }
  }

  /* -------------------------------------------- */
  /*  Socket Listeners and Handlers               */
  /* -------------------------------------------- */

  /**
   * Activate Socket event listeners which are used to transact game state data with the server
   */
  activateSocketListeners() {

    // Stop buffering events
    game.socket.offAny(Game.#bufferSocketEvents);

    // Game pause
    this.socket.on("pause", this.#handlePause.bind(this));

    // Game shutdown
    this.socket.on("shutdown", () => {
      ui.notifications.info("The game world is shutting down and you will be returned to the server homepage.", {
        permanent: true
      });
      setTimeout(() => window.location.href = getRoute("/"), 1000);
    });

    // Application reload.
    this.socket.on("reload", () => utils.debouncedReload());

    // Hot Reload
    this.socket.on("hotReload", this.#handleHotReload.bind(this));

    // Database Operations
    CONFIG.DatabaseBackend.activateSocketListeners(this.socket);

    // Additional events
    foundry.audio.AudioHelper._activateSocketListeners(this.socket);
    collections.Users._activateSocketListeners(this.socket);
    collections.Scenes._activateSocketListeners(this.socket);
    collections.Journal._activateSocketListeners(this.socket);
    collections.FogExplorations._activateSocketListeners(this.socket);
    foundry.canvas.animation.ChatBubbles._activateSocketListeners(this.socket);
    foundry.applications.ux.ProseMirrorEditor._activateSocketListeners(this.socket);
    collections.CompendiumCollection._activateSocketListeners(this.socket);
    foundry.documents.RegionDocument._activateSocketListeners(this.socket);

    // Apply buffered events
    Game.#applyBufferedSocketEvents();

    // Request updated activity data
    game.socket.emit("getUserActivity");
  }

  /* -------------------------------------------- */

  /**
   * Handle a hot reload request from the server
   * @param {HotReloadData} data          The hot reload data
   */
  #handleHotReload(data) {
    const proceed = Hooks.call("hotReload", data);
    if ( proceed === false ) return;

    switch ( data.extension ) {
      case "css": return this.#hotReloadCSS(data);
      case "html":
      case "hbs": return this.#hotReloadHTML(data);
      case "json": return this.#hotReloadJSON(data);
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle hot reloading of CSS files
   * @param {HotReloadData} data          The hot reload data
   */
  #hotReloadCSS({ path }={}) {
    for ( const link of document.querySelectorAll("link") ) {
      const [href] = link.href?.split("?") ?? [];
      if ( href === path ) {
        link.href = `${path}?${Date.now()}`;
        return;
      }
    }
    const pathRegex = new RegExp(`@import "${path}(?:\\?[^"]+)?"`);
    for ( const style of document.querySelectorAll("style") ) {
      const [match] = style.textContent.match(pathRegex) ?? [];
      if ( match ) {
        style.textContent = style.textContent.replace(match, `@import "${path}?${Date.now()}"`);
        return;
      }
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle hot reloading of HTML files, such as Handlebars templates
   * @param {HotReloadData} data          The hot reload data
   */
  #hotReloadHTML(data) {
    let template;
    try {
      template = Handlebars.compile(data.content);
    }
    catch(err) {
      return console.error(err);
    }
    Handlebars.registerPartial(data.path, template);
    for ( const appV1 of Object.values(ui.windows) ) appV1.render();
    for ( const appV2 of foundry.applications.instances.values() ) appV2.render();
  }

  /* -------------------------------------------- */

  /**
   * Handle hot reloading of JSON files, such as language files
   * @param {HotReloadData} data          The hot reload data
   */
  #hotReloadJSON(data) {
    const currentLang = game.i18n.lang;
    if ( data.packageId === "core" ) {
      if ( !data.path.endsWith(`lang/${currentLang}.json`) ) return;
    }
    else {
      const pkg = data.packageType === "system" ? game.system : game.modules.get(data.packageId);
      const lang = pkg.languages.find(l => (l.path === data.path) && (l.lang === currentLang));
      if ( !lang ) return;
    }

    // Update the translations
    let translations = {};
    try {
      translations = JSON.parse(data.content);
    }
    catch(err) {
      return console.error(err);
    }
    utils.mergeObject(game.i18n.translations, translations);
    for ( const appV1 of Object.values(ui.windows) ) appV1.render();
    for ( const appV2 of foundry.applications.instances.values() ) appV2.render();
  }

  /* -------------------------------------------- */

  /**
   * Handle requests to pause the game session.
   * @param {boolean} paused      The new paused state
   * @param {object} options      Options passed via the server socket
   */
  #handlePause(paused, options) {
    options.broadcast = false;
    game.togglePause(paused, options);
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /**
   * Activate Event Listeners which apply to every Game View
   */
  activateListeners() {

    // Disable touch zoom
    document.addEventListener("touchmove", ev => {
      if ( (ev.scale !== undefined) && (ev.scale !== 1) ) ev.preventDefault();
    }, {passive: false});

    // Disable right-click
    document.addEventListener("contextmenu", ev => ev.preventDefault());

    // Disable mouse 3, 4, and 5
    document.addEventListener("pointerdown", this.#onPointerDown.bind(this));
    document.addEventListener("pointerup", this.#onPointerUp.bind(this));

    // Prevent dragging and dropping unless a more specific handler allows it
    document.addEventListener("dragstart", this.#onPreventDragstart.bind(this));
    document.addEventListener("dragover", this.#onPreventDragover.bind(this));
    document.addEventListener("drop", this.#onPreventDrop.bind(this));

    // Support mousewheel interaction for range input elements
    window.addEventListener("wheel", Game.#handleMouseWheelInputChange.bind(Game), {passive: false});

    // Tooltip rendering
    this.tooltip.activateEventListeners();

    // Document links
    TextEditor.implementation.activateListeners();

    // Await gestures to begin audio and video playback
    game.video.awaitFirstGesture();

    // Handle changes to the state of the browser window
    window.addEventListener("beforeunload", this.#onWindowBeforeUnload.bind(this));
    window.addEventListener("blur", this.#onWindowBlur.bind(this));
    window.addEventListener("resize", this.#onWindowResize.bind(this), { passive: true });
    if ( this.view === "game" ) {
      history.pushState(null, null, location.href);
      window.addEventListener("popstate", this.#onWindowPopState.bind(this));
    }

    // Force hyperlinks to a separate window/tab
    document.addEventListener("click", this._onClickHyperlink.bind(this));
  }

  /* -------------------------------------------- */

  /**
   * Support mousewheel control for range type input elements
   * @param {WheelEvent} event    A Mouse Wheel scroll event
   */
  static #handleMouseWheelInputChange(event) {
    const r = event.target;
    if ( (r.tagName !== "INPUT") || (r.type !== "range") || r.disabled || r.readOnly ) return;
    event.preventDefault();
    event.stopPropagation();

    // Adjust the range slider by the step size
    const step = (parseFloat(r.step) || 1.0) * Math.sign(-1 * event.deltaY);
    r.value = Math.clamp(parseFloat(r.value) + step, parseFloat(r.min), parseFloat(r.max));

    // Dispatch input and change events
    r.dispatchEvent(new Event("input", {bubbles: true}));
    r.dispatchEvent(new Event("change", {bubbles: true}));
  }

  /* -------------------------------------------- */

  /**
   * On left mouse clicks, check if the element is contained in a valid hyperlink and open it in a new tab.
   * @param {PointerEvent} event
   * @protected
   */
  _onClickHyperlink(event) {
    const a = event.target.closest("a[href]");
    // eslint-disable-next-line no-script-url
    if ( !a || (a.href === "javascript:void(0)") || a.closest(".editor-content.ProseMirror") ) return;
    event.preventDefault();
    window.open(a.href, "_blank");
  }

  /* -------------------------------------------- */

  /**
   * Prevent starting a drag and drop workflow on elements within the document unless the element has the draggable
   * attribute explicitly defined or overrides the dragstart handler.
   * @param {DragEvent} event   The initiating drag start event
   */
  #onPreventDragstart(event) {
    const target = event.target;
    const inProseMirror = (target.nodeType === Node.TEXT_NODE) && target.parentElement.closest(".ProseMirror");
    if ( (target.getAttribute?.("draggable") === "true") || inProseMirror ) return;
    event.preventDefault();
    return false;
  }

  /* -------------------------------------------- */

  /**
   * Disallow dragging of external content onto anything but a file input element
   * @param {DragEvent} event   The requested drag event
   */
  #onPreventDragover(event) {
    const target = event.target;
    if ( (target.tagName !== "INPUT") || (target.type !== "file") ) event.preventDefault();
  }

  /* -------------------------------------------- */

  /**
   * Disallow dropping of external content onto anything but a file input element
   * @param {DragEvent} event   The requested drag event
   */
  #onPreventDrop(event) {
    const target = event.target;
    if ( (target.tagName !== "INPUT") || (target.type !== "file") ) event.preventDefault();
  }

  /* -------------------------------------------- */

  /**
   * On a left-click event, remove any currently displayed inline roll tooltip
   * @param {PointerEvent} event    The mousedown pointer event
   */
  #onPointerDown(event) {
    if ([3, 4, 5].includes(event.button)) event.preventDefault();
    const inlineRoll = document.querySelector(".inline-roll.expanded");
    const target = event.target;
    if ( inlineRoll && !target.closest(".inline-roll") ) {
      return foundry.dice.Roll.defaultImplementation.collapseInlineResult(inlineRoll);
    }

    // Handle cursor depressed state.
    const targetIsValid = target instanceof HTMLElement && !["disabled", "readonly"].some(a => target.hasAttribute(a));
    if ( !targetIsValid || (target === canvas.app?.view) || ("cursor" in target.dataset) ) return;
    const style = getComputedStyle(target);
    const cursor = style.cursor?.split(", ").pop();
    const depressed = `${cursor}-down`;
    if ( depressed in CONFIG.cursors ) {
      target.dataset.cursor = target.style.cursor ?? "";
      target.style.cursor = `var(--cursor-${depressed})`;
    }
  }

  /* -------------------------------------------- */

  /**
   * Fallback handling for mouse-up events which aren't handled further upstream.
   * @param {PointerEvent} event    The mouseup pointer event
   */
  #onPointerUp(event) {
    for ( const el of document.querySelectorAll("[data-cursor]") ) {
      el.style.cursor = el.dataset.cursor;
      delete el.dataset.cursor;
    }

    const cmm = canvas.currentMouseManager;
    if ( !cmm || event.defaultPrevented ) return;
    cmm.cancel(event);
  }

  /* -------------------------------------------- */

  /**
   * Handle resizing of the game window by adjusting the canvas and repositioning active interface applications.
   * @param {Event} event     The window resize event which has occurred
   */
  #onWindowResize(event) {
    for ( const appV1 of Object.values(ui.windows) ) {
      if ( appV1.rendered ) appV1.setPosition({top: appV1.position.top, left: appV1.position.left});
    }
    for ( const appV2 of foundry.applications.instances.values() ) {
      if ( appV2.rendered ) appV2.setPosition();
    }
    if ( ui.webrtc?.rendered ) ui.webrtc.setPosition({height: "auto"});
    if ( ui.hotbar?.rendered ) ui.hotbar._onResize();
    if ( canvas.ready ) canvas._onResize(event);
  }

  /* -------------------------------------------- */

  /**
   * Handle window unload operations to clean up any data which may be pending a final save
   * @param {Event} event     The window unload event which is about to occur
   */
  #onWindowBeforeUnload(event) {
    Game.#unloading = true;
    if ( canvas.ready ) {
      canvas.fog.commit();
      // Save the fog immediately rather than waiting for the 3s debounced save as part of commitFog.
      return canvas.fog.save();
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle cases where the browser window loses focus to reset detection of currently pressed keys
   * @param {Event} event   The originating window.blur event
   */
  #onWindowBlur(event) {
    game.keyboard?.releaseKeys();
  }

  /* -------------------------------------------- */

  /**
   * Handle cases when the active history entry changes while the user navigates the session history
   * @param {Event} event   The originating window.popstate event
   */
  #onWindowPopState(event) {
    if ( game._goingBack ) return;
    history.pushState(null, null, location.href);
    // eslint-disable-next-line no-alert
    if ( confirm(game.i18n.localize("APP.NavigateBackConfirm")) ) {
      game._goingBack = true;
      history.back();
      history.back();
    }
  }

  /* -------------------------------------------- */
  /*  View Handlers                               */
  /* -------------------------------------------- */

  /**
   * Initialize elements required for the current view
   * @internal
   */
  async _initializeView() {
    switch ( this.view ) {
      case "game":
        return this.#initializeGameView();
      case "stream":
        return this.#initializeStreamView();
      default:
        throw new Error(`Unknown view URL ${this.view} provided`);
    }
  }

  /* -------------------------------------------- */

  /**
   * Initialization steps for the primary Game view
   */
  async #initializeGameView() {

    // Require a valid user cookie and EULA acceptance
    if ( !globalThis.SIGNED_EULA ) window.location.href = getRoute("license");
    if (!this.userId) {
      console.error("Invalid user session provided - returning to login screen.");
      this.logOut();
    }

    // Set up the game
    await this.setupGame();

    // Set a timeout of 10 minutes before kicking the user off
    if ( this.data.demoMode && this.data.idleLogout && !this.user.isGM ) {
      setTimeout(() => {
        console.log(`${CONST.vtt} | Ending demo session after 10 minutes. Thanks for testing!`);
        this.logOut();
      }, 1000 * 60 * 10);
    }

    // Context menu listeners
    foundry.applications.ux.ContextMenu.implementation.eventListeners();

    // ProseMirror menu listeners
    ProseMirror.ProseMirrorMenu.eventListeners();
  }

  /* -------------------------------------------- */

  /**
   * Initialization steps for the Stream helper view
   */
  async #initializeStreamView() {
    if ( !globalThis.SIGNED_EULA ) window.location.href = getRoute("license");
    Object.defineProperty(this, "time", {value: new helpers.GameTime(), writable: false});
    await this.time.sync();
    this.initializeDocuments();
    for ( const collection of game.collections ) collection.initializeTree();
    ui.chat = new foundry.applications.sidebar.tabs.ChatLog({stream: true});
    ui.chat.render(true);
    CONFIG.DatabaseBackend.activateSocketListeners(this.socket);
    Hooks.callAll("streamReady");
  }

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  get template() {
    utils.logCompatibilityWarning("Game#template is deprecated and will be removed in Version 14. "
      + "Use cases for Game#template should be refactored to instead use System#documentTypes or Game#model",
    {since: 12, until: 14, once: true});
    return this.#template;
  }

  #template;

  /**
   * @deprecated since v13
   * @ignore
   */
  scaleFonts(index) {
    utils.logCompatibilityWarning("Game#scaleFonts is deprecated in favor of Game#configureUI",
      {since: 13, until: 15});
    return this.configureUI({fontScale: index});
  }
}

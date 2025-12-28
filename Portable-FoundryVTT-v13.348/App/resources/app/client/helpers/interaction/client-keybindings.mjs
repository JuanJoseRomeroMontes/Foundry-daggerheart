import KeyboardManager from "@client/helpers/interaction/keyboard-manager.mjs";

/**
 * @import ControlsConfig from "@client/applications/sidebar/apps/controls-config.mjs";
 * @import InteractionLayer from "../../canvas/layers/base/interaction-layer.mjs";
 * @import {
 *   KeybindingAction,
 *   KeybindingActionBinding,
 *   KeybindingActionConfig,
 *   KeyboardEventContext
 * } from "@client/_types.mjs";
 */

/**
 * A class responsible for managing defined game keybinding.
 * Each keybinding is a string key/value pair belonging to a certain namespace and a certain store scope.
 *
 * When Foundry Virtual Tabletop is initialized, a singleton instance of this class is constructed within the global
 * Game object as as game.keybindings.
 *
 * @see {@link foundry.Game#keybindings}
 * @see {@link ControlsConfig}
 */
export default class ClientKeybindings {
  constructor() {

    /**
     * Registered Keybinding actions
     * @type {Map<string, KeybindingActionConfig>}
     */
    this.actions = new Map();

    /**
     * A mapping of a string key to possible Actions that might execute off it
     * @type {Map<string, KeybindingAction[]>}
     */
    this.activeKeys = new Map();

    /**
     * A stored cache of Keybind Actions Ids to Bindings
     * @type {Map<string, KeybindingActionBinding[]>}
     */
    this.bindings = undefined;
  }

  static MOVEMENT_DIRECTIONS = {
    UP: "up",
    LEFT: "left",
    DOWN: "down",
    RIGHT: "right",
    DESCEND: "descend",
    ASCEND: "ascend"
  };

  static ZOOM_DIRECTIONS = {
    IN: "in",
    OUT: "out"
  };

  /* -------------------------------------------- */

  /**
   * A count of how many registered keybindings there are
   * @type {number}
   */
  #registered = 0;

  /* -------------------------------------------- */

  /**
   * A timestamp which tracks the last time a pan operation was performed
   * @type {number}
   */
  #moveTime = 0;

  /* -------------------------------------------- */

  /**
   * An alias of the movement key set tracked by the keyboard
   * @returns {Set<string>}>
   */
  get moveKeys() {
    return game.keyboard.moveKeys;
  }

  /* -------------------------------------------- */

  /**
   * Initializes the keybinding values for all registered actions
   */
  initialize() {

    // Create the bindings mapping for all actions which have been registered
    this.bindings = new Map(Object.entries(game.settings.get("core", "keybindings")));
    for ( const k of Array.from(this.bindings.keys()) ) {
      if ( !this.actions.has(k) ) this.bindings.delete(k);
    }

    // Register bindings for all actions
    for ( const [action, config] of this.actions) {
      let bindings = config.uneditable;
      bindings = config.uneditable.concat(this.bindings.get(action) ?? config.editable);
      this.bindings.set(action, bindings);
    }

    // Create a mapping of keys which trigger actions
    this.activeKeys = new Map();
    for ( const [key, action] of this.actions ) {
      const bindings = this.bindings.get(key);
      for ( const binding of bindings ) {
        if ( !binding ) continue;
        if ( !this.activeKeys.has(binding.key) ) this.activeKeys.set(binding.key, []);
        const actions = this.activeKeys.get(binding.key);
        actions.push({
          action: key,
          key: binding.key,
          name: action.name,
          requiredModifiers: binding.modifiers,
          optionalModifiers: action.reservedModifiers,
          onDown: action.onDown,
          onUp: action.onUp,
          precedence: action.precedence,
          order: action.order,
          repeat: action.repeat,
          restricted: action.restricted
        });
        this.activeKeys.set(binding.key, actions.sort(this.constructor._compareActions));
      }
    }
  }

  /* -------------------------------------------- */

  /**
   * Register a new keybinding
   *
   * @param {string} namespace                  The namespace the Keybinding Action belongs to
   * @param {string} action                     A unique machine-readable id for the Keybinding Action
   * @param {KeybindingActionConfig} data       Configuration for keybinding data
   *
   * @example Define a keybinding which shows a notification
   * ```js
   * game.keybindings.register("myModule", "showNotification", {
   *   name: "My Settings Keybinding",
   *   hint: "A description of what will occur when the Keybinding is executed.",
   *   uneditable: [
   *     {
   *       key: "Digit1",
   *       modifiers: ["Control"]
   *     }
   *   ],
   *   editable: [
   *     {
   *       key: "F1"
   *     }
   *   ],
   *   onDown: () => { ui.notifications.info("Pressed!") },
   *   onUp: () => {},
   *   restricted: true,             // Restrict this Keybinding to gamemaster only?
   *   reservedModifiers: ["Alt"],  // On ALT, the notification is permanent instead of temporary
   *   precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL
   * });
   * ```
   */
  register(namespace, action, data) {
    if ( this.bindings ) throw new Error("You cannot register a Keybinding after the init hook");
    if ( !namespace || !action ) throw new Error("You must specify both the namespace and action portion of the Keybinding action");
    action = `${namespace}.${action}`;
    data.namespace = namespace;
    data.precedence = data.precedence ?? CONST.KEYBINDING_PRECEDENCE.NORMAL;
    data.order = this.#registered++;
    data.uneditable = ClientKeybindings.#validateBindings(data.uneditable ?? []);
    data.editable = ClientKeybindings.#validateBindings(data.editable ?? []);
    data.repeat = data.repeat ?? false;
    data.reservedModifiers = ClientKeybindings.#validateModifiers(data.reservedModifiers ?? []);
    this.actions.set(action, data);
  }

  /* -------------------------------------------- */

  /**
   * Get the current Bindings of a given namespace's Keybinding Action
   *
   * @param {string} namespace   The namespace under which the setting is registered
   * @param {string} action      The keybind action to retrieve
   * @returns {KeybindingActionBinding[]}
   *
   * @example Retrieve the current Keybinding Action Bindings
   * ```js
   * game.keybindings.get("myModule", "showNotification");
   * ```
   */
  get(namespace, action) {
    if ( !namespace || !action ) throw new Error("You must specify both namespace and key portions of the keybind");
    action = `${namespace}.${action}`;
    const keybind = this.actions.get(action);
    if ( !keybind ) throw new Error("This is not a registered keybind action");
    return this.bindings.get(action) || [];
  }

  /* -------------------------------------------- */

  /**
   * Set the editable Bindings of a Keybinding Action for a certain namespace and Action
   *
   * @param {string} namespace                    The namespace under which the Keybinding is registered
   * @param {string} action                       The Keybinding action to set
   * @param {KeybindingActionBinding[]} bindings  The Bindings to assign to the Keybinding
   *
   * @example Update the current value of a keybinding
   * ```js
   * game.keybindings.set("myModule", "showNotification", [
   *     {
   *       key: "F2",
   *       modifiers: [ "CONTROL" ]
   *     }
   * ]);
   * ```
   */
  async set(namespace, action, bindings) {
    if ( !namespace || !action ) throw new Error("You must specify both namespace and action portions of the Keybind");
    action = `${namespace}.${action}`;
    const keybind = this.actions.get(action);
    if ( !keybind ) throw new Error("This is not a registered keybind");
    if ( keybind.restricted && !game.user.isGM ) throw new Error("Only a GM can edit this keybind");
    const mapping = game.settings.get("core", "keybindings");

    // Set to default if value is undefined and return
    if ( bindings === undefined ) {
      delete mapping[action];
      return game.settings.set("core", "keybindings", mapping);
    }
    bindings = ClientKeybindings.#validateBindings(bindings);

    // Verify no reserved Modifiers were set as Keys
    for ( const binding of bindings ) {
      if ( keybind.reservedModifiers.includes(binding.key) ) {
        throw new Error(game.i18n.format("KEYBINDINGS.ErrorReservedModifier", {key: binding.key}));
      }
    }

    // Save editable bindings to setting
    mapping[action] = bindings;
    await game.settings.set("core", "keybindings", mapping);
  }

  /* ---------------------------------------- */

  /**
   * Reset all client keybindings back to their default configuration.
   */
  async resetDefaults() {
    const setting = game.settings.settings.get("core.keybindings");
    return game.settings.set("core", "keybindings", setting.default);
  }

  /* -------------------------------------------- */

  /**
   * A helper method that, when given a value, ensures that the returned value is a standardized Binding array
   * @param {KeybindingActionBinding[]} values  An array of keybinding assignments to be validated
   * @returns {KeybindingActionBinding[]}       An array of keybinding assignments confirmed as valid
   */
  static #validateBindings(values) {
    if ( !(values instanceof Array) ) throw new Error(game.i18n.localize("KEYBINDINGS.MustBeArray"));
    for ( const binding of values ) {
      if ( !binding.key ) throw new Error("Each KeybindingActionBinding must contain a valid key designation");
      if ( KeyboardManager.PROTECTED_KEYS.includes(binding.key) ) {
        throw new Error(game.i18n.format("KEYBINDINGS.ErrorProtectedKey", {key: binding.key}));
      }
      binding.modifiers = this.#validateModifiers(binding.modifiers ?? []);
    }
    return values;
  }

  /* -------------------------------------------- */

  /**
   * Validate that assigned modifiers are allowed
   * @param {string[]} keys           An array of modifiers which may be valid
   * @returns {string[]}              An array of modifiers which are confirmed as valid
   */
  static #validateModifiers(keys) {
    const modifiers = [];
    for ( let key of keys ) {
      if ( key in KeyboardManager.MODIFIER_KEYS ) key = KeyboardManager.MODIFIER_KEYS[key]; // Backwards-compatiblity
      if ( !Object.values(KeyboardManager.MODIFIER_KEYS).includes(key) ) {
        throw new Error(game.i18n.format("KEYBINDINGS.ErrorIllegalModifier", { key, allowed: modifiers.join(",") }));
      }
      modifiers.push(key);
    }
    return modifiers;
  }

  /* -------------------------------------------- */

  /**
   * Compares two Keybinding Actions based on their Order
   * @param {Pick<KeybindingAction, "precedence"|"order">} a The first Keybinding Action
   * @param {Pick<KeybindingAction, "precedence"|"order">} b the second Keybinding Action
   * @returns {number}
   * @internal
   */
  static _compareActions(a, b) {
    if (a.precedence === b.precedence) return a.order - b.order;
    return a.precedence - b.precedence;
  }

  /* ---------------------------------------- */
  /*  Core Keybinding Actions                 */
  /* ---------------------------------------- */

  /**
   * Register core keybindings.
   * @param {string} view           The active game view
   * @internal
   */
  _registerCoreKeybindings(view) {
    const {SHIFT, CONTROL, ALT} = KeyboardManager.MODIFIER_KEYS;

    // General Purpose - All Views
    game.keybindings.register("core", "dismiss", {
      name: "KEYBINDINGS.Dismiss",
      uneditable: [
        {key: "Escape"}
      ],
      onDown: ClientKeybindings.#onDismiss,
      precedence: CONST.KEYBINDING_PRECEDENCE.DEFERRED
    });

    // Game View Only
    if ( view !== "game" ) return;
    game.keybindings.register("core", "cycleView", {
      name: "KEYBINDINGS.CycleView",
      editable: [
        {key: "Tab"}
      ],
      onDown: ClientKeybindings.#onCycleView,
      reservedModifiers: [SHIFT],
      repeat: true
    });

    game.keybindings.register("core", "pause", {
      name: "KEYBINDINGS.Pause",
      restricted: true,
      editable: [
        {key: "Space"}
      ],
      onDown: ClientKeybindings.#onPause,
      precedence: CONST.KEYBINDING_PRECEDENCE.DEFERRED
    });
    game.keybindings.register("core", "delete", {
      name: "KEYBINDINGS.Delete",
      uneditable: [
        {key: "Delete"}
      ],
      editable: [
        {key: "Backspace"}
      ],
      onDown: ClientKeybindings.#onDelete
    });
    game.keybindings.register("core", "highlight", {
      name: "KEYBINDINGS.Highlight",
      editable: [
        {key: "AltLeft"},
        {key: "AltRight"}
      ],
      onUp: ClientKeybindings.#onHighlight,
      onDown: ClientKeybindings.#onHighlight
    });
    game.keybindings.register("core", "selectAll", {
      name: "KEYBINDINGS.SelectAll",
      uneditable: [
        {key: "KeyA", modifiers: [CONTROL]}
      ],
      onDown: ClientKeybindings.#onSelectAll
    });
    game.keybindings.register("core", "undo", {
      name: "KEYBINDINGS.Undo",
      uneditable: [
        {key: "KeyZ", modifiers: [CONTROL]}
      ],
      onDown: ClientKeybindings.#onUndo
    });
    game.keybindings.register("core", "cut", {
      name: "KEYBINDINGS.Cut",
      uneditable: [
        {key: "KeyX", modifiers: [CONTROL]}
      ],
      onDown: ClientKeybindings.#onCut
    });
    game.keybindings.register("core", "copy", {
      name: "KEYBINDINGS.Copy",
      uneditable: [
        {key: "KeyC", modifiers: [CONTROL]}
      ],
      onDown: ClientKeybindings.#onCopy
    });
    game.keybindings.register("core", "paste", {
      name: "KEYBINDINGS.Paste",
      uneditable: [
        {key: "KeyV", modifiers: [CONTROL]}
      ],
      onDown: ClientKeybindings.#onPaste,
      reservedModifiers: [ALT, SHIFT]
    });
    game.keybindings.register("core", "sendToBack", {
      name: "KEYBINDINGS.SendToBack",
      editable: [
        {key: "BracketLeft"}
      ],
      onDown: ClientKeybindings.#onSendToBack
    });
    game.keybindings.register("core", "bringToFront", {
      name: "KEYBINDINGS.BringToFront",
      editable: [
        {key: "BracketRight"}
      ],
      onDown: ClientKeybindings.#onBringToFront
    });
    game.keybindings.register("core", "target", {
      name: "KEYBINDINGS.Target",
      editable: [
        {key: "KeyT"}
      ],
      onDown: ClientKeybindings.#onTarget,
      reservedModifiers: [SHIFT]
    });
    game.keybindings.register("core", "ruler", {
      name: "KEYBINDINGS.Ruler",
      editable: [
        {key: "KeyR"}
      ],
      onDown: ClientKeybindings.#onToggleRuler
    });
    game.keybindings.register("core", "unconstrainedMovement", {
      name: "KEYBINDINGS.UnconstrainedMovement",
      editable: [
        {key: "KeyU"}
      ],
      onDown: ClientKeybindings.#onToggleUnconstrainedMovement
    });
    game.keybindings.register("core", "characterSheet", {
      name: "KEYBINDINGS.ToggleCharacterSheet",
      editable: [
        {key: "KeyC"}
      ],
      onDown: ClientKeybindings.#onToggleCharacterSheet,
      precedence: CONST.KEYBINDING_PRECEDENCE.PRIORITY
    });
    game.keybindings.register("core", "panUp", {
      name: "KEYBINDINGS.PanUp",
      uneditable: [
        {key: "ArrowUp"},
        {key: "Numpad8"}
      ],
      editable: [
        {key: "KeyW"}
      ],
      onUp: context => this.#onPan(context, [ClientKeybindings.MOVEMENT_DIRECTIONS.UP]),
      onDown: context => this.#onPan(context, [ClientKeybindings.MOVEMENT_DIRECTIONS.UP]),
      reservedModifiers: [CONTROL, SHIFT],
      repeat: true
    });
    game.keybindings.register("core", "panLeft", {
      name: "KEYBINDINGS.PanLeft",
      uneditable: [
        {key: "ArrowLeft"},
        {key: "Numpad4"}
      ],
      editable: [
        {key: "KeyA"}
      ],
      onUp: context => this.#onPan(context, [ClientKeybindings.MOVEMENT_DIRECTIONS.LEFT]),
      onDown: context => this.#onPan(context, [ClientKeybindings.MOVEMENT_DIRECTIONS.LEFT]),
      reservedModifiers: [CONTROL, SHIFT],
      repeat: true
    });
    game.keybindings.register("core", "panDown", {
      name: "KEYBINDINGS.PanDown",
      uneditable: [
        {key: "ArrowDown"},
        {key: "Numpad2"}
      ],
      editable: [
        {key: "KeyS"}
      ],
      onUp: context => this.#onPan(context, [ClientKeybindings.MOVEMENT_DIRECTIONS.DOWN]),
      onDown: context => this.#onPan(context, [ClientKeybindings.MOVEMENT_DIRECTIONS.DOWN]),
      reservedModifiers: [CONTROL, SHIFT],
      repeat: true
    });
    game.keybindings.register("core", "panRight", {
      name: "KEYBINDINGS.PanRight",
      uneditable: [
        {key: "ArrowRight"},
        {key: "Numpad6"}
      ],
      editable: [
        {key: "KeyD"}
      ],
      onUp: context => this.#onPan(context, [ClientKeybindings.MOVEMENT_DIRECTIONS.RIGHT]),
      onDown: context => this.#onPan(context, [ClientKeybindings.MOVEMENT_DIRECTIONS.RIGHT]),
      reservedModifiers: [CONTROL, SHIFT],
      repeat: true
    });
    game.keybindings.register("core", "panUpLeft", {
      name: "KEYBINDINGS.PanUpLeft",
      uneditable: [
        {key: "Numpad7"}
      ],
      onUp: context => this.#onPan(context,
        [ClientKeybindings.MOVEMENT_DIRECTIONS.UP, ClientKeybindings.MOVEMENT_DIRECTIONS.LEFT]),
      onDown: context => this.#onPan(context,
        [ClientKeybindings.MOVEMENT_DIRECTIONS.UP, ClientKeybindings.MOVEMENT_DIRECTIONS.LEFT]),
      reservedModifiers: [CONTROL, SHIFT],
      repeat: true
    });
    game.keybindings.register("core", "panUpRight", {
      name: "KEYBINDINGS.PanUpRight",
      uneditable: [
        {key: "Numpad9"}
      ],
      onUp: context => this.#onPan(context,
        [ClientKeybindings.MOVEMENT_DIRECTIONS.UP, ClientKeybindings.MOVEMENT_DIRECTIONS.RIGHT]),
      onDown: context => this.#onPan(context,
        [ClientKeybindings.MOVEMENT_DIRECTIONS.UP, ClientKeybindings.MOVEMENT_DIRECTIONS.RIGHT]),
      reservedModifiers: [CONTROL, SHIFT],
      repeat: true
    });
    game.keybindings.register("core", "panDownLeft", {
      name: "KEYBINDINGS.PanDownLeft",
      uneditable: [
        {key: "Numpad1"}
      ],
      onUp: context => this.#onPan(context,
        [ClientKeybindings.MOVEMENT_DIRECTIONS.DOWN, ClientKeybindings.MOVEMENT_DIRECTIONS.LEFT]),
      onDown: context => this.#onPan(context,
        [ClientKeybindings.MOVEMENT_DIRECTIONS.DOWN, ClientKeybindings.MOVEMENT_DIRECTIONS.LEFT]),
      reservedModifiers: [CONTROL, SHIFT],
      repeat: true
    });
    game.keybindings.register("core", "panDownRight", {
      name: "KEYBINDINGS.PanDownRight",
      uneditable: [
        {key: "Numpad3"}
      ],
      onUp: context => this.#onPan(context,
        [ClientKeybindings.MOVEMENT_DIRECTIONS.DOWN, ClientKeybindings.MOVEMENT_DIRECTIONS.RIGHT]),
      onDown: context => this.#onPan(context,
        [ClientKeybindings.MOVEMENT_DIRECTIONS.DOWN, ClientKeybindings.MOVEMENT_DIRECTIONS.RIGHT]),
      reservedModifiers: [CONTROL, SHIFT],
      repeat: true
    });
    game.keybindings.register("core", "zoomIn", {
      name: "KEYBINDINGS.ZoomIn",
      uneditable: [
        {key: "NumpadAdd"}
      ],
      editable: [{key: "KeyE"}],
      onUp: context => this.#onPan(context, [ClientKeybindings.MOVEMENT_DIRECTIONS.ASCEND]),
      onDown: context => this.#onPan(context, [ClientKeybindings.MOVEMENT_DIRECTIONS.ASCEND]),
      reservedModifiers: [CONTROL, SHIFT],
      repeat: true
    });
    game.keybindings.register("core", "zoomOut", {
      name: "KEYBINDINGS.ZoomOut",
      uneditable: [
        {key: "NumpadSubtract"}
      ],
      editable: [{key: "KeyQ"}],
      onUp: context => this.#onPan(context, [ClientKeybindings.MOVEMENT_DIRECTIONS.DESCEND]),
      onDown: context => this.#onPan(context, [ClientKeybindings.MOVEMENT_DIRECTIONS.DESCEND]),
      reservedModifiers: [CONTROL, SHIFT],
      repeat: true
    });
    game.keybindings.register("core", "rulerWaypoint", {
      name: "KEYBINDINGS.RulerWaypoint",
      editable: [{key: "KeyF"}],
      onDown: context => this.#onRulerWaypoint(context),
      reservedModifiers: [SHIFT]
    });
    for ( const number of Array.fromRange(9, 1).concat([0]) ) {
      game.keybindings.register("core", `executeMacro${number}`, {
        name: game.i18n.format("KEYBINDINGS.ExecuteMacro", { number }),
        editable: [{key: `Digit${number}`}],
        onDown: context => ClientKeybindings.#onMacroExecute(context, number),
        precedence: CONST.KEYBINDING_PRECEDENCE.DEFERRED
      });
    }
    for ( const page of Array.fromRange(5, 1) ) {
      game.keybindings.register("core", `swapMacroPage${page}`, {
        name: game.i18n.format("KEYBINDINGS.SwapMacroPage", { page }),
        editable: [{key: `Digit${page}`, modifiers: [ALT]}],
        onDown: context => ClientKeybindings.#onMacroPageSwap(context, page),
        precedence: CONST.KEYBINDING_PRECEDENCE.DEFERRED
      });
    }
    game.keybindings.register("core", "pushToTalk", {
      name: "KEYBINDINGS.PTTKey",
      editable: [{key: "Backquote"}],
      onDown: game.webrtc._onPTTStart.bind(game.webrtc),
      onUp: game.webrtc._onPTTEnd.bind(game.webrtc),
      precedence: CONST.KEYBINDING_PRECEDENCE.PRIORITY,
      repeat: false
    });
    game.keybindings.register("core", "focusChat", {
      name: "KEYBINDINGS.FocusChat",
      editable: [{key: "KeyC", modifiers: [SHIFT]}],
      onDown: ClientKeybindings.#onFocusChat,
      precedence: CONST.KEYBINDING_PRECEDENCE.PRIORITY,
      repeat: false
    });
  }

  /* -------------------------------------------- */

  /**
   * Handle Select all action
   * @param {KeyboardEventContext} context    The context data of the event
   */
  static #onSelectAll(context) {
    if ( !canvas.ready ) return false;
    const layer = canvas.activeLayer;
    if ( !(layer instanceof foundry.canvas.layers.InteractionLayer) ) return false;
    return layer._onSelectAllKey(context.event);
  }

  /* -------------------------------------------- */

  /**
   * Handle Cycle View actions
   * @param {KeyboardEventContext} context    The context data of the event
   */
  static #onCycleView(context) {
    if ( !canvas.ready ) return false;
    const layer = canvas.activeLayer;
    if ( !(layer instanceof foundry.canvas.layers.InteractionLayer) ) return false;
    return layer._onCycleViewKey(context.event);
  }

  /* -------------------------------------------- */

  /**
   * Handle Dismiss actions
   * @param {KeyboardEventContext} context    The context data of the event
   * @returns {Promise<boolean>}
   */
  static async #onDismiss(context) {

    // Cancel current drag workflow
    if ( canvas.currentMouseManager ) {
      canvas.currentMouseManager.interactionData.cancelled = true;
      canvas.currentMouseManager.cancel();
      return true;
    }

    // Save fog of war if there are pending changes
    if ( canvas.ready ) canvas.fog.commit();

    // Case 1 - close the main menu
    if ( ui.menu?.rendered ) {
      await ui.menu.toggle();
      return true;
    }

    // Case 2 - dismiss an open context menu
    if ( ui.context?.element ) {
      await ui.context.close();
      return true;
    }

    // Case 3 - dismiss an open Tour
    if ( foundry.nue.Tour.tourInProgress ) {
      foundry.nue.Tour.activeTour.exit();
      return true;
    }

    // Case 4 - close open UI windows
    const closingApps = [];
    for ( const app of Object.values(ui.windows) ) {
      closingApps.push(app.close({closeKey: true}).then(() => !app.rendered));
    }
    for ( const app of foundry.applications.instances.values() ) {
      if ( app.hasFrame ) closingApps.push(app.close({closeKey: true}).then(() => !app.rendered));
    }
    const closedApp = (await Promise.all(closingApps)).some(c => c); // Confirm an application actually closed
    if ( closedApp ) return true;

    // Case 5 (GM) - release controlled objects (if not in a preview)
    if ( game.view !== "game" ) return false;
    const layer = canvas.activeLayer;
    if ( layer instanceof foundry.canvas.layers.InteractionLayer ) {
      if ( layer._onDismissKey(context.event) ) return true;
    }

    // Case 6 - open the main menu
    ui.menu.toggle();
    // Save the fog immediately rather than waiting for the 3s debounced save as part of commitFog.
    if ( canvas.ready ) await canvas.fog.save();
    return true;
  }

  /* -------------------------------------------- */

  /**
   * Open Character sheet for current token or controlled actor
   * @param {KeyboardEventContext} context    The context data of the event
   */
  static #onToggleCharacterSheet(context) {
    return game.toggleCharacterSheet();
  }

  /* -------------------------------------------- */

  /**
   * Handle action to target the currently hovered token.
   * @param {KeyboardEventContext} context    The context data of the event
   */
  static #onTarget(context) {
    if ( !canvas.ready ) return false;
    const layer = canvas.activeLayer;
    if ( !(layer instanceof foundry.canvas.layers.TokenLayer) ) return false;
    const hovered = layer.hover;
    if ( !hovered || hovered.document.isSecret ) return false;
    hovered.setTarget(!hovered.isTargeted, {releaseOthers: !context.isShift});
    return true;
  }

  /* -------------------------------------------- */

  /**
   * Handle action to toggle the ruler tool.
   * @param {KeyboardEventContext} context    The context data of the event
   */
  static #onToggleRuler(context) {
    if ( !canvas.ready ) return false;
    const layer = canvas.activeLayer;
    if ( !(layer instanceof foundry.canvas.layers.TokenLayer) ) return false;
    ui.controls.activate({tool: game.activeTool !== "ruler" ? "ruler" : "select"});
    return true;
  }

  /* -------------------------------------------- */

  /**
   * Handle action to toggle Unconstrained Movement.
   * @param {KeyboardEventContext} context    The context data of the event
   */
  static #onToggleUnconstrainedMovement(context) {
    const active = game.settings.get("core", "unconstrainedMovement");
    game.settings.set("core", "unconstrainedMovement", !active);
    return true;
  }

  /* -------------------------------------------- */

  /**
   * Handle action to send the currently controlled placeables to the back.
   * @param {KeyboardEventContext} context    The context data of the event
   */
  static #onSendToBack(context) {
    if ( !canvas.ready ) return false;
    const layer = canvas.activeLayer;
    if ( !(layer instanceof foundry.canvas.layers.PlaceablesLayer) ) return false;
    return layer._sendToBackOrBringToFront(false);
  }

  /* -------------------------------------------- */

  /**
   * Handle action to bring the currently controlled placeables to the front.
   * @param {KeyboardEventContext} context    The context data of the event
   */
  static #onBringToFront(context) {
    if ( !canvas.ready ) return false;
    const layer = canvas.activeLayer;
    if ( !(layer instanceof foundry.canvas.layers.PlaceablesLayer) ) return false;
    return layer._sendToBackOrBringToFront(true);
  }

  /* -------------------------------------------- */

  /**
   * Handle DELETE Keypress Events
   * @param {KeyboardEventContext} context    The context data of the event
   */
  static #onDelete(context) {
    // Remove hotbar Macro
    if ( ui.hotbar._hover ) {
      game.user.assignHotbarMacro(null, ui.hotbar._hover);
      return true;
    }

    // Delete placeables from Canvas layer
    if ( !canvas.ready ) return false;
    const layer = canvas.activeLayer;
    if ( !(layer instanceof foundry.canvas.layers.InteractionLayer) ) return false;
    return layer._onDeleteKey(context.event);
  }

  /* -------------------------------------------- */

  /**
   * Handle keyboard movement once a small delay has elapsed to allow for multiple simultaneous key-presses.
   * @param {KeyboardEventContext} context        The context data of the event
   * @param {InteractionLayer} layer              The active InteractionLayer instance
   */
  #handleMovement(context, layer) {
    if ( !this.moveKeys.size ) return;

    // Get the directions of movement
    let directions = this.moveKeys;
    const grid = canvas.grid;
    const diagonals = (grid.type !== CONST.GRID_TYPES.SQUARE) || (grid.diagonals !== CONST.GRID_DIAGONALS.ILLEGAL);
    if ( !diagonals ) directions = new Set(Array.from(directions).slice(-1));

    // Define movement offsets and get moved directions
    let dx = 0;
    let dy = 0;
    let dz = 0;
    if ( directions.has(ClientKeybindings.MOVEMENT_DIRECTIONS.LEFT) ) dx -= 1;
    if ( directions.has(ClientKeybindings.MOVEMENT_DIRECTIONS.RIGHT) ) dx += 1;
    if ( directions.has(ClientKeybindings.MOVEMENT_DIRECTIONS.UP) ) dy -= 1;
    if ( directions.has(ClientKeybindings.MOVEMENT_DIRECTIONS.DOWN) ) dy += 1;
    if ( directions.has(ClientKeybindings.MOVEMENT_DIRECTIONS.DESCEND) ) dz -= 1;
    if ( directions.has(ClientKeybindings.MOVEMENT_DIRECTIONS.ASCEND) ) dz += 1;

    // If measuring distance, change elevation of ruler
    const ruler = canvas.controls.ruler;
    if ( ruler.active ) {
      if ( dz ) ruler._changeDragElevation(dz, {precise: context.isShift});
      return;
    }

    // If dragging token, change elevation of dragged token
    if ( (layer instanceof foundry.canvas.layers.TokenLayer) && layer._draggedToken ) {
      if ( dz ) layer._draggedToken._changeDragElevation(dz, {precise: context.isShift});
      return;
    }

    // Perform the shift or rotation
    layer.moveMany({dx, dy, dz, rotate: context.isShift});
  }

  /* -------------------------------------------- */

  /**
   * Handle panning the canvas using CTRL + directional keys
   * @param {KeyboardEventContext} context        The context data of the event
   */
  #handleCanvasPan(context) {

    // Determine movement offsets
    let dx = 0;
    let dy = 0;
    let dz = 0;
    if (this.moveKeys.has(ClientKeybindings.MOVEMENT_DIRECTIONS.LEFT)) dx -= 1;
    if (this.moveKeys.has(ClientKeybindings.MOVEMENT_DIRECTIONS.UP)) dy -= 1;
    if (this.moveKeys.has(ClientKeybindings.MOVEMENT_DIRECTIONS.DESCEND)) dz -= 1;
    if (this.moveKeys.has(ClientKeybindings.MOVEMENT_DIRECTIONS.RIGHT)) dx += 1;
    if (this.moveKeys.has(ClientKeybindings.MOVEMENT_DIRECTIONS.DOWN)) dy += 1;
    if (this.moveKeys.has(ClientKeybindings.MOVEMENT_DIRECTIONS.ASCEND)) dz += 1;

    // Clear the pending set
    this.moveKeys.clear();

    // Pan by the grid size
    const s = canvas.dimensions.size;
    return canvas.animatePan({
      x: canvas.stage.pivot.x + (dx * s),
      y: canvas.stage.pivot.y + (dy * s),
      scale: canvas.stage.scale.x * (1 + ((context.isShift ? 0.05 : 0.25) * dz)),
      duration: 100
    });
  }

  /* -------------------------------------------- */

  /**
   * Handle Pause Action.
   * @param {KeyboardEventContext} context    The context data of the event
   */
  static #onPause(context) {
    game.togglePause(!game.paused, {broadcast: true});
    return true;
  }

  /* -------------------------------------------- */

  /**
   * Handle Highlight action
   * @param {KeyboardEventContext} context    The context data of the event
   */
  static #onHighlight(context) {
    if ( !canvas.ready ) return false;
    canvas.highlightObjects(!context.up);
    return true;
  }

  /* -------------------------------------------- */

  /**
   * Handle Pan action
   * @param {KeyboardEventContext} context          The context data of the event
   * @param {string[]} movementDirections           The Directions being panned in
   */
  #onPan(context, movementDirections) {

    // Case 1: Check for Tour
    if ( foundry.nue.Tour.tourInProgress && !context.repeat && !context.up ) {
      foundry.nue.Tour.onMovementAction(movementDirections);
      return true;
    }

    // Case 2: Check for Canvas
    if ( !canvas.ready ) return false;

    // Remove Keys on Up
    if ( context.up ) {
      for ( const d of movementDirections ) {
        this.moveKeys.delete(d);
      }
      return true;
    }

    // Keep track of when we last moved
    const now = Date.now();
    const delta = now - this.#moveTime;

    // Track the movement set
    for ( const d of movementDirections ) {
      this.moveKeys.add(d);
    }

    // Handle canvas pan using CTRL
    if ( context.isControl ) {

      // Only the uneditable keybindings allow panning/zooming
      if ( !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Numpad1", "Numpad2", "Numpad3", "Numpad4", "Numpad5", "Numpad6",
        "Numpad7", "Numpad8", "Numpad9", "NumpadAdd", "NumpadSubtract"].includes(context.key) ) return false;

      this.#handleCanvasPan(context);
      return true;
    }

    // Delay 50ms before shifting tokens in order to capture diagonal movements
    const layer = canvas.activeLayer;
    if ( (layer === canvas.tokens) || (layer === canvas.tiles) || (layer === canvas.drawings) ) {
      if ( delta < 100 ) return true; // Throttle keyboard movement once per 100ms
      setTimeout(() => this.#handleMovement(context, layer), 50);
    }
    this.#moveTime = now;
    return true;
  }

  /* -------------------------------------------- */

  /**
   * Handle Waypoint action
   * @param {KeyboardEventContext} context  The context data of the event
   */
  #onRulerWaypoint(context) {
    if ( !canvas.ready ) return false;
    const ruler = canvas.controls.ruler;
    if ( ruler.active ) {
      ruler._addDragWaypoint(canvas.mousePosition, {snap: !context.isShift});
      return true;
    }
    const layer = canvas.activeLayer;
    if ( !(layer instanceof foundry.canvas.layers.TokenLayer) ) return false;
    const token = layer._draggedToken;
    if ( !token ) return false;
    if ( token.ruler ) token._addDragWaypoint(canvas.mousePosition, {snap: !context.isShift});
    return true;
  }

  /* -------------------------------------------- */

  /**
   * Handle Macro executions
   * @param {KeyboardEventContext} context  The context data of the event
   * @param {number} number                 The numbered macro slot to execute
   */
  static #onMacroExecute(context, number) {
    const slot = ui.hotbar.slots.find(m => m.key === number);
    if ( slot.macro ) {
      slot.macro.execute();
      return true;
    }
    return false;
  }

  /* -------------------------------------------- */

  /**
   * Handle Macro page swaps
   * @param {KeyboardEventContext} context    The context data of the event
   * @param {number} page                     The numbered macro page to activate
   */
  static #onMacroPageSwap(context, page) {
    ui.hotbar.changePage(page);
    return true;
  }

  /* -------------------------------------------- */

  /**
   * Handle action to copy data to clipboard
   * @param {KeyboardEventContext} context    The context data of the event
   */
  static #onCopy(context) {
    if ( window.getSelection().toString() !== "" ) return false;
    if ( !canvas.ready ) return false;
    const layer = canvas.activeLayer;
    if ( !(layer instanceof foundry.canvas.layers.InteractionLayer) ) return false;
    return layer._onCopyKey(context.event);
  }

  /* -------------------------------------------- */

  /**
   * Handle action to cut data to clipboard
   * @param {KeyboardEventContext} context    The context data of the event
   */
  static #onCut(context) {
    if ( window.getSelection().toString() !== "" ) return false;
    if ( !canvas.ready ) return false;
    const layer = canvas.activeLayer;
    if ( !(layer instanceof foundry.canvas.layers.InteractionLayer) ) return false;
    return layer._onCutKey(context.event);
  }

  /* -------------------------------------------- */

  /**
   * Handle Paste action
   * @param {KeyboardEventContext} context    The context data of the event
   */
  static #onPaste(context) {
    if ( !canvas.ready ) return false;
    const layer = canvas.activeLayer;
    if ( !(layer instanceof foundry.canvas.layers.InteractionLayer) ) return false;
    return layer._onPasteKey(context.event);
  }

  /* -------------------------------------------- */

  /**
   * Handle Undo action
   * @param {KeyboardEventContext} context    The context data of the event
   */
  static #onUndo(context) {
    if ( !canvas.ready ) return false;
    const layer = canvas.activeLayer;
    if ( !(layer instanceof foundry.canvas.layers.InteractionLayer) ) return false;
    return layer._onUndoKey(context.event);
  }

  /* -------------------------------------------- */

  /**
   * Bring the chat window into view and focus the input
   * @param {KeyboardEventContext} context    The context data of the event
   * @returns {boolean}
   */
  static #onFocusChat(context) {
    ui.chat.activate();
    return true;
  }
}

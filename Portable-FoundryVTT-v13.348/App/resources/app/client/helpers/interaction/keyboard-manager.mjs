/**
 * @import {KeybindingAction, KeyboardEventContext} from "@client/_types.mjs";
 */

/**
 * A set of helpers and management functions for dealing with user input from keyboard events.
 * {@link https://keycode.info/}
 * @see {@link foundry.Game#keyboard}
 */
export default class KeyboardManager {
  constructor() {
    if ( game.keyboard ) throw new Error("You may not re-construct the singleton game.keyboard manager");
    this.#reset();
  }

  /* -------------------------------------------- */

  /**
   * Begin listening to keyboard events.
   * @internal
   */
  _activateListeners() {
    KeyboardManager.#universalMode = game.settings.get("core", "universalKeybindings");
    window.addEventListener("keydown", event => this.#handleKeyboardEvent(event, false));
    window.addEventListener("keyup", event => this.#handleKeyboardEvent(event, true));
    window.addEventListener("visibilitychange", this.#reset.bind(this));
    window.addEventListener("compositionend", this.#onCompositionEnd.bind(this));
    window.addEventListener("focusin", this._onFocusIn.bind(this));
  }

  /* -------------------------------------------- */

  /**
   * The set of key codes which are currently depressed (down)
   * @type {Set<string>}
   */
  downKeys = new Set();

  /* -------------------------------------------- */

  /**
   * The set of movement keys which were recently pressed
   * @type {Set<string>}
   */
  moveKeys = new Set();

  /* -------------------------------------------- */

  /**
   * Is logical keybindings active?
   * @type {boolean}
   */
  static get isUniversalMode() {
    return this.#universalMode;
  }
  static #universalMode;

  /* -------------------------------------------- */

  /**
   * Allowed modifier keys.
   * @enum {string}
   */
  static MODIFIER_KEYS = {
    CONTROL: "Control",
    SHIFT: "Shift",
    ALT: "Alt"
  };

  /* -------------------------------------------- */

  /**
   * Track which KeyboardEvent#code presses associate with each modifier.
   * @enum {string[]}
   */
  static MODIFIER_CODES = {
    [this.MODIFIER_KEYS.ALT]: ["AltLeft", "AltRight"],
    [this.MODIFIER_KEYS.CONTROL]: ["ControlLeft", "ControlRight", "MetaLeft", "MetaRight", "Meta", "OsLeft", "OsRight"],
    [this.MODIFIER_KEYS.SHIFT]: ["ShiftLeft", "ShiftRight"]
  };

  /* -------------------------------------------- */

  /**
   * Key codes which are "protected" and should not be used because they are reserved for browser-level actions.
   * @type {string[]}
   */
  static PROTECTED_KEYS = ["F5", "F11", "F12", "PrintScreen", "ScrollLock", "NumLock", "CapsLock"];

  /* -------------------------------------------- */

  /**
   * The OS-specific string display for what their Command key is
   * @type {string}
   */
  static CONTROL_KEY_STRING = navigator.appVersion.includes("Mac") ? "⌘" : "Control";

  /* -------------------------------------------- */

  /**
   * A special mapping of how special KeyboardEvent#code values should map to displayed strings or symbols.
   * Values in this configuration object override any other display formatting rules which may be applied.
   * @type {Record<string, string>}
   */
  static KEYCODE_DISPLAY_MAPPING = (() => {
    const isMac = navigator.appVersion.includes("Mac");
    return {
      ArrowLeft: "⬅",
      ArrowRight: "➡",
      ArrowUp: "⬆",
      ArrowDown: "⬇",
      Backquote: "`",
      Backslash: "\\",
      BracketLeft: "[",
      BracketRight: "]",
      Comma: ",",
      Control: this.CONTROL_KEY_STRING,
      Equal: "=",
      Meta: isMac ? "⌘" : "⊞",
      MetaLeft: isMac ? "⌘" : "⊞",
      MetaRight: isMac ? "⌘" : "⊞",
      OsLeft: isMac ? "⌘" : "⊞",
      OsRight: isMac ? "⌘" : "⊞",
      Minus: "-",
      NumpadAdd: "Numpad+",
      NumpadSubtract: "Numpad-",
      Period: ".",
      Quote: "'",
      Semicolon: ";",
      Slash: "/"
    };
  })();

  /**
   * Matches any single graphic Unicode code-point (letters, digits, punctuation, symbols, including emoji).
   * Non-printable identifiers like *ArrowLeft*, *ShiftLeft*, *Dead* never match.
   * @type {RegExp}
   */
  static PRINTABLE_CHAR_REGEX = new RegExp('^[\\p{L}\\p{N}\\p{P}\\p{S}]$', 'u');

  /* -------------------------------------------- */

  /**
   * Canonical identifier for a key press.
   * @param {KeyboardEvent} event
   * @returns {string}
   */
  static translateKey(event) {
    const {key="", code} = event;

    // Physical to Logical
    if ( this.isUniversalMode && (key.length === 1) && KeyboardManager.PRINTABLE_CHAR_REGEX.test(key) ) {
      return key.toUpperCase();
    }
    return code;
  }

  /* -------------------------------------------- */

  /**
   * Determines whether an `HTMLElement` currently has focus, which may influence keybinding actions.
   *
   * An element is considered to have focus if:
   * 1. It has a `dataset.keyboardFocus` attribute explicitly set to `"true"` or an empty string (`""`).
   * 2. It is an `<input>`, `<select>`, or `<textarea>` element, all of which inherently accept keyboard input.
   * 3. It has the `isContentEditable` property set to `true`, meaning it is an editable element.
   * 4. It is a `<button>` element inside a `<form>`, which suggests interactive use.
   *
   * An element is considered **not** focused if:
   * 1. There is no currently active element (`document.activeElement` is not an `HTMLElement`).
   * 2. It has a `dataset.keyboardFocus` attribute explicitly set to `"false"`.
   *
   * If none of these conditions are met, the element is assumed to be unfocused.
   * @type {boolean}
   */
  get hasFocus() {
    const focused = document.activeElement;
    if ( !(focused instanceof HTMLElement) ) return false;                           // No focused element
    if ( ["", "true"].includes(focused.dataset.keyboardFocus) ) return true;         // Explicit true
    if ( focused.dataset.keyboardFocus === "false" ) return false;                   // Explicit false
    if ( ["INPUT", "SELECT", "TEXTAREA"].includes(focused.tagName) ) return true;    // Text input elements
    if ( focused.isContentEditable ) return true;                                    // Text input elements
    if ( focused.tagName === "BUTTON" ) return !!focused.form;                       // Buttons in forms
    return false;
  }

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /**
   * Emulates a key being pressed, triggering the Keyboard event workflow.
   * @param {boolean} up                        If True, emulates the `keyup` Event. Else, the `keydown` event
   * @param {string} code                       The KeyboardEvent#code which is being pressed
   * @param {object} [options]                  Additional options to configure behavior.
   * @param {boolean} [options.altKey=false]    Emulate the ALT modifier as pressed
   * @param {boolean} [options.ctrlKey=false]   Emulate the CONTROL modifier as pressed
   * @param {boolean} [options.shiftKey=false]  Emulate the SHIFT modifier as pressed
   * @param {boolean} [options.repeat=false]    Emulate this as a repeat event
   * @param {boolean} [options.force=false]     Force the event to be handled.
   * @returns {KeyboardEventContext}
   */
  static emulateKeypress(up, code, {altKey=false, ctrlKey=false, shiftKey=false, repeat=false, force=false}={}) {
    const event = new KeyboardEvent(`key${up ? "up" : "down"}`, {code, altKey, ctrlKey, shiftKey, repeat});
    const context = this.getKeyboardEventContext(event, up);
    game.keyboard._processKeyboardContext(context, {force});
    game.keyboard.downKeys.delete(context.key);
    return context;
  }

  /* -------------------------------------------- */

  /**
   * Format a KeyboardEvent#code into a displayed string.
   * @param {string} code       The input code
   * @returns {string}          The displayed string for this code
   */
  static getKeycodeDisplayString(code) {
    if ( code in this.KEYCODE_DISPLAY_MAPPING ) return this.KEYCODE_DISPLAY_MAPPING[code];
    if ( code.startsWith("Digit") ) return code.replace("Digit", "");
    if ( code.startsWith("Key") ) return code.replace("Key", "");
    return code;
  }

  /* -------------------------------------------- */

  /**
   * Get a standardized keyboard context for a given event.
   * Every individual keypress is uniquely identified using the KeyboardEvent#code property.
   * A list of possible key codes is documented here: https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/code/code_values
   *
   * @param {KeyboardEvent} event    The originating keypress event
   * @param {boolean} up             A flag for whether the key is down or up
   * @returns {KeyboardEventContext} The standardized context of the event
   */
  static getKeyboardEventContext(event, up=false) {
    const context = {
      event: event,
      key: event.code,
      logicalKey: KeyboardManager.translateKey(event),
      isShift: event.shiftKey,
      isControl: event.ctrlKey || event.metaKey,
      isAlt: event.altKey,
      hasModifier: event.shiftKey || event.ctrlKey || event.metaKey || event.altKey,
      modifiers: [],
      up: up,
      repeat: event.repeat
    };
    if ( context.isShift ) context.modifiers.push(this.MODIFIER_KEYS.SHIFT);
    if ( context.isControl ) context.modifiers.push(this.MODIFIER_KEYS.CONTROL);
    if ( context.isAlt ) context.modifiers.push(this.MODIFIER_KEYS.ALT);
    return context;
  }

  /* -------------------------------------------- */

  /**
   * Report whether a modifier in KeyboardManager.MODIFIER_KEYS is currently actively depressed.
   * @param {string} modifier     A modifier in MODIFIER_KEYS
   * @returns {boolean}           Is this modifier key currently down (active)?
   */
  isModifierActive(modifier) {
    if ( modifier in KeyboardManager.MODIFIER_KEYS ) modifier = KeyboardManager.MODIFIER_KEYS[modifier];
    return this.constructor.MODIFIER_CODES[modifier].some(k => this.downKeys.has(k));
  }

  /* -------------------------------------------- */

  /**
   * Report whether a core action key is currently actively depressed.
   * @param {string} action       The core action to verify (ex: "target")
   * @returns {boolean}           Is this core action key currently down (active)?
   */
  isCoreActionKeyActive(action) {
    const binds = game.keybindings.get("core", action);
    return !!binds?.some(k => this.downKeys.has(k.key));
  }

  /* ----------------------------------------- */

  /**
   * Given a keyboard-event context, return every registered keybinding that matches it (may be empty).
   * @param {KeyboardEventContext} context
   * @returns {KeybindingAction[]}
   * @internal
   */
  static _getMatchingActions(context) {
    const activeKeys = game.keybindings.activeKeys;
    const debug = CONFIG.debug.keybindings;

    // Helper: perform one Map lookup, filter with #testContext, log the result
    const lookup = (key, label) => {
      const list = (activeKeys.get(key) ?? []).filter(a => KeyboardManager.#testContext(a, context));
      if ( debug ) {
        console.log(`[Keybinds] ${label}: "${key}" → ${list.length} hit(s)`);
        console.dir(list);
      }
      return list;
    };

    if ( KeyboardManager.isUniversalMode ) {
      // Logical mode
      const k = context.logicalKey;
      if ( (k.length === 1) && KeyboardManager.PRINTABLE_CHAR_REGEX.test(k) ) {
        // Test Digit first
        if ( "0123456789".includes(k) ) {
          const hits = lookup(`Digit${k}`, "char=>Digit");
          if ( hits.length ) return hits;
        }
        // Then Key
        const hits = lookup(`Key${k.toUpperCase()}`, "char=>Key");
        if ( hits.length ) return hits;
      }
    }

    // Physical mode (legacy)
    return lookup(context.key, "direct");
  }

  /* -------------------------------------------- */

  /**
   * Test whether a keypress context matches the registration for a keybinding action
   * @param {KeybindingAction} action             The keybinding action
   * @param {KeyboardEventContext} context        The keyboard event context
   * @returns {boolean}                           Does the context match the action requirements?
   */
  static #testContext(action, context) {
    if ( context.repeat && !action.repeat ) return false;
    if ( action.restricted && !game.user.isGM ) return false;

    // If the context includes no modifiers, we match if the binding has none
    if ( !context.hasModifier ) return action.requiredModifiers.length === 0;

    // Test that modifiers match expectation
    const modifiers = this.MODIFIER_KEYS;
    const activeModifiers = {
      [modifiers.CONTROL]: context.isControl,
      [modifiers.SHIFT]: context.isShift,
      [modifiers.ALT]: context.isAlt
    };
    for ( const [k, v] of Object.entries(activeModifiers) ) {

      // Ignore exact matches to a modifier key
      if ( this.MODIFIER_CODES[k].includes(context.key) ) continue;

      // Verify that required modifiers are present
      if ( action.requiredModifiers.includes(k) ) {
        if ( !v ) return false;
      }

      // No unsupported modifiers can be present for a "down" event
      else if ( !context.up && !action.optionalModifiers.includes(k) && v ) return false;
    }
    return true;
  }

  /* -------------------------------------------- */

  /**
   * Given a registered Keybinding Action, executes the action with a given event and context
   *
   * @param {KeybindingAction} keybind         The registered Keybinding action to execute
   * @param {KeyboardEventContext} context     The gathered context of the event
   * @returns {boolean}                        Returns true if the keybind was consumed
   */
  static #executeKeybind(keybind, context) {
    if ( CONFIG.debug.keybindings ) console.log(`Executing ${game.i18n.localize(keybind.name)}`);
    context.action = keybind.action;
    let consumed = false;
    if ( context.up && keybind.onUp ) consumed = keybind.onUp(context);
    else if ( !context.up && keybind.onDown ) consumed = keybind.onDown(context);
    return consumed;
  }

  /* -------------------------------------------- */

  /**
   * Processes a keyboard event context, checking it against registered keybinding actions
   * @param {KeyboardEventContext} context   The keyboard event context
   * @param {object} [options]               Additional options to configure behavior.
   * @param {boolean} [options.force=false]  Force the event to be handled.
   * @protected
   */
  _processKeyboardContext(context, {force=false}={}) {

    // Track the current set of pressed keys
    if ( context.up ) this.downKeys.delete(context.key);
    else this.downKeys.add(context.key);

    // If an input field has focus, don't process Keybinding Actions
    if ( this.hasFocus && !force ) return;

    // Open debugging group
    if ( CONFIG.debug.keybindings ) {
      console.group(`[${context.up ? "UP" : "DOWN"}] Checking for keybinds that respond to ${context.modifiers}+${context.key}`);
      console.dir(context);
    }

    // Check against registered Keybindings
    const actions = KeyboardManager._getMatchingActions(context);
    if ( actions.length === 0 ) {
      if ( CONFIG.debug.keybindings ) {
        console.log("No matching keybinds");
        console.groupEnd();
      }
      return;
    }

    // Execute matching Keybinding Actions to see if any consume the event
    let handled;
    for ( const action of actions ) {
      handled = KeyboardManager.#executeKeybind(action, context);
      if ( handled ) break;
    }

    // Cancel event since we handled it
    if ( handled && context.event ) {
      if ( CONFIG.debug.keybindings ) console.log("Event was consumed");
      context.event?.preventDefault();
      context.event?.stopPropagation();
    }
    if ( CONFIG.debug.keybindings ) console.groupEnd();
  }

  /* -------------------------------------------- */

  /**
   * Reset tracking for which keys are in the down and released states
   */
  #reset() {
    this.downKeys = new Set();
    this.moveKeys = new Set();
  }

  /* -------------------------------------------- */

  /**
   * Emulate a key-up event for any currently down keys. When emulating, we go backwards such that combinations such as
   * "CONTROL + S" emulate the "S" first in order to capture modifiers.
   * @param {object} [options]              Options to configure behavior.
   * @param {boolean} [options.force=true]  Force the keyup events to be handled.
   */
  releaseKeys({force=true}={}) {
    const reverseKeys = Array.from(this.downKeys).reverse();
    for ( const key of reverseKeys ) {
      this.constructor.emulateKeypress(true, key, {
        force,
        ctrlKey: this.isModifierActive("CONTROL"),
        shiftKey: this.isModifierActive("SHIFT"),
        altKey: this.isModifierActive("ALT")
      });
    }
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /**
   * Handle a key press into the down position
   * @param {KeyboardEvent} event   The originating keyboard event
   * @param {boolean} up            A flag for whether the key is down or up
   */
  #handleKeyboardEvent(event, up) {
    if ( event.isComposing ) return; // Ignore IME composition
    if ( !event.key && !event.code ) return; // Some browsers fire keyup and keydown events when autocompleting values.
    const context = KeyboardManager.getKeyboardEventContext(event, up);
    this._processKeyboardContext(context);
  }

  /* -------------------------------------------- */

  /**
   * Input events do not fire with isComposing = false at the end of a composition event in Chrome
   * See: https://github.com/w3c/uievents/issues/202
   * @param {CompositionEvent} event
   */
  #onCompositionEnd(event) {
    return this.#handleKeyboardEvent(event, false);
  }

  /* -------------------------------------------- */

  /**
   * Release any down keys when focusing a form element.
   * @param {FocusEvent} event  The focus event.
   * @protected
   */
  _onFocusIn(event) {
    const formElements = [
      HTMLInputElement, HTMLSelectElement, HTMLTextAreaElement, HTMLOptionElement, HTMLButtonElement
    ];
    if ( event.target.isContentEditable || formElements.some(cls => event.target instanceof cls) ) this.releaseKeys();
  }
}

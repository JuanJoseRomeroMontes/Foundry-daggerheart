import CategoryBrowser from "@client/applications/api/category-browser.mjs";
import {ClientKeybindings, KeyboardManager} from "@client/helpers/interaction/_module.mjs";

/**
 * @import {ApplicationClickAction} from "@client/applications/_types.mjs"
 * @import {KeybindingAction, KeybindingActionBinding, KeybindingActionConfig} from "@client/_types.mjs"
 */

/**
 * View and edit keybinding and (readonly) mouse actions.
 */
export default class ControlsConfig extends CategoryBrowser {

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    id: "controls-config",
    window: {
      title: "KEYBINDINGS.Title",
      icon: "fa-solid fa-gamepad",
      resizable: true
    },
    position: {
      width: 780,
      height: 680
    },
    actions: {
      addBinding: ControlsConfig.#onAddBinding,
      cancelEdit: ControlsConfig.#onCancelEdit,
      deleteBinding: ControlsConfig.#onDeleteBinding,
      editBinding: ControlsConfig.#onEditBinding,
      resetDefaults: ControlsConfig.#onResetDefaults,
      saveBinding: ControlsConfig.#onSaveBinding
    },
    subtemplates: {
      category: "templates/sidebar/apps/controls/category.hbs",
      sidebarFooter: "templates/category-browser/reset.hbs"
    }
  };

  /** @inheritDoc */
  static PARTS = {
    ...super.PARTS,
    bindingInput: {template: "templates/sidebar/apps/controls/binding-input.hbs"}
  };

  /**
   * Faux "pointer bindings" for displaying as a readonly category
   * @type {readonly [id: string, name: string, parts: string[], gmOnly?: boolean][]}
   */
  static POINTER_CONTROLS = Object.freeze([
    ["canvas-select", "CONTROLS.CanvasSelect", ["LeftClick"]],
    ["canvas-select-many", "CONTROLS.CanvasSelectMany", ["Shift", "LeftClick"]],
    ["canvas-drag", "CONTROLS.CanvasLeftDrag", ["LeftClick", "Drag"]],
    ["canvas-select-cancel", "CONTROLS.CanvasSelectCancel", ["RightClick"]],
    ["canvas-pan-mouse", "CONTROLS.CanvasPan", ["RightClick", "Drag"]],
    ["canvas-zoom", "CONTROLS.CanvasZoom", ["MouseWheel"]],
    ["ruler-place-waypoint", "CONTROLS.RulerPlaceWaypoint", [KeyboardManager.CONTROL_KEY_STRING, "LeftClick"]],
    ["ruler-remove-waypoint", "CONTROLS.RulerRemoveWaypoint", ["RightClick"]],
    ["object-sheet", "CONTROLS.ObjectSheet", ["LeftClick2"]],
    ["object-hud", "CONTROLS.ObjectHUD", ["RightClick"]],
    ["object-config", "CONTROLS.ObjectConfig", ["RightClick2"]],
    ["object-drag", "CONTROLS.ObjectDrag", ["LeftClick", "Drag"]],
    ["object-no-snap", "CONTROLS.ObjectNoSnap", ["Drag", "Shift", "Drop"]],
    ["object-drag-cancel", "CONTROLS.ObjectDragCancel", ["RightClickDuringDrag"]],
    ["object-rotate-slow", "CONTROLS.ObjectRotateSlow", [KeyboardManager.CONTROL_KEY_STRING, "MouseWheel"]],
    ["object-rotate-fast", "CONTROLS.ObjectRotateFast", ["Shift", "MouseWheel"]],
    ["place-hidden-token", "CONTROLS.TokenPlaceHidden", ["Alt", "Drop"], true],
    ["token-target-mouse", "CONTROLS.TokenTarget", ["RightClick2"]],
    ["canvas-ping", "CONTROLS.CanvasPing", ["LongPress"]],
    ["canvas-ping-alert", "CONTROLS.CanvasPingAlert", ["Alt", "LongPress"]],
    ["canvas-ping-pull", "CONTROLS.CanvasPingPull", ["Shift", "LongPress"], true],
    ["tooltip-lock", "CONTROLS.TooltipLock", ["MiddleClick"]],
    ["tooltip-dismiss", "CONTROLS.TooltipDismiss", ["RightClick"]]
  ]);

  /**
   * A reference record of possible categories
   * @type {Record<string, {id: string, label: string}}
   */
  static #ENTRY_CATEGORIES = {
    core: {id: "core", label: "KEYBINDINGS.CoreKeybindings"},
    "core-pointer": {id: "core-pointer", label: "KEYBINDINGS.CoreMouse"}
  };

  /* -------------------------------------------- */

  /**
   * Transform an action binding into a human-readable string representation.
   * @param {KeybindingActionBinding} binding
   * @returns {string}
   */
  static humanizeBinding(binding) {
    const key = binding.logicalKey ?? binding.key;
    const stringParts = binding.modifiers?.reduce((parts, part) => {
      if ( KeyboardManager.MODIFIER_CODES[part]?.includes(key) ) return parts;
      const display = KeyboardManager.getKeycodeDisplayString(part);
      parts.unshift(display);
      return parts;
    }, [KeyboardManager.getKeycodeDisplayString(key)]);
    return stringParts.filterJoin(" + ");
  }

  /* -------------------------------------------- */

  /**
   * A cache of categories and their entries
   * @type {Record<string, {id: string, label: string, entries: object[]}|null>}
   */
  #cachedData = null;

  /**
   * A Map of pending Edits. The Keys are bindingIds
   * @type {Map<string, KeybindingActionBinding[]>}
   */
  #pendingEdits = new Map();

  /**
   * A list formatter used for showing keybinding conflicts in tooltips
   * @type {Intl.ListFormat}
   */
  #listFormatter = game.i18n.getListFormatter();

  /* -------------------------------------------- */

  /** @inheritDoc */
  _configureRenderOptions(options) {
    super._configureRenderOptions(options);
    if ( !options.isFirstRender ) options.parts.findSplice(p => p === "bindingInput"); // Only needs to be rendered once
  }

  /* -------------------------------------------- */

  /**
   * @returns {Record<string, {id: string, label: string, entries: object[]}>}
   * @protected
   * @override
   */
  _prepareCategoryData() {
    if ( this.#cachedData ) return this.#cachedData;
    ControlsConfig.#ENTRY_CATEGORIES[game.system.id] ??= {id: "system", label: game.system.title};
    const keybindings = game.keybindings.actions.entries().toArray();
    this.#cachedData = [...keybindings, ...this.#getPointerControls()].reduce((categories, [actionId, action]) => {
      if ( action.restricted && !game.user.isGM ) return categories;

      // Carry over bindings for future rendering
      const ctrlString = KeyboardManager.CONTROL_KEY_STRING;
      const reservedModifiers = this.#listFormatter.format(action.reservedModifiers?.map(m => {
        return m === "Control" ? ctrlString : m.titleCase();
      }) ?? []);
      const entry = {
        id: actionId,
        precedence: action.precedence ?? 0,
        order: action.order ?? 0,
        label: game.i18n.localize(action.name),
        hint: [
          reservedModifiers ? game.i18n.format("KEYBINDINGS.ReservedModifiers", {modifiers: reservedModifiers}) : "",
          action.restricted ? game.i18n.localize("KEYBINDINGS.Restricted") : "",
          action.hint ? foundry.utils.escapeHTML(game.i18n.localize(action.hint)) : ""
        ].filterJoin("<br>\n"),
        uneditable: action.uneditable,
        bindings: (action.bindings ?? game.keybindings.bindings.get(actionId) ?? []).map((binding, index) => {
          const uneditable = action.uneditable?.includes(binding);
          const conflicts = this.#listFormatter.format(
            this.#detectConflictingActions(actionId, action, binding).map(c => game.i18n.localize(c.name))
          );
          return {
            id: `${actionId}.binding.${index}`,
            display: ControlsConfig.humanizeBinding(binding),
            editable: !uneditable,
            conflicts: conflicts ? game.i18n.format("KEYBINDINGS.Conflict", {conflicts}) : null
          };
        })
      };
      const category = this.#categorizeEntry(action.namespace);
      categories[category.id] ??= {id: category.id, label: game.i18n.localize(category.label), entries: []};
      categories[category.id].entries.push(entry);
      return categories;
    }, {});
    for ( const entries of Object.values(this.#cachedData).map(c => c.entries) ) {
      entries.sort(ClientKeybindings._compareActions);
    }
    return this.#cachedData;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _sortCategories(a, b) {
    const categoryOrder = {core: 0, "core-pointer": 1, system: 2};
    const indexOfA = categoryOrder[a.id] ?? 3;
    const indexOfB = categoryOrder[b.id] ?? 3;
    return (indexOfA - indexOfB) || super._sortCategories(a, b);
  }

  /* -------------------------------------------- */

  /**
   * Categorize a keybinding action config according to its source (core(-mouse), system, module, or unmapped).
   * @param {string|undefined} namespace
   * @returns {{id: string, label: string}}
   */
  #categorizeEntry(namespace) {
    const CATEGORIES = ControlsConfig.#ENTRY_CATEGORIES;
    const category = CATEGORIES[namespace];
    if ( category ) return category;
    const module = game.modules.get(namespace);
    return CATEGORIES[namespace] = {id: module?.id ?? "unmapped", label: module?.title ?? "PACKAGECONFIG.Unmapped"};
  }

  /* -------------------------------------------- */

  /**
   * Add non-configurable actions representing pointer controls
   * @returns {[string, Pick<KeybindingActionConfig, "namespace"|"name"|"restricted"|"bindings"|"uneditable">][]}
   */
  #getPointerControls() {
    const namespace = "core-pointer";
    const localize = s => game.i18n.localize(`CONTROLS.${s}`);
    return ControlsConfig.POINTER_CONTROLS.map(([id, name, parts, restricted=false]) => {
      const bindings = [{key: parts.map(p => localize(p)).join(" + "), modifiers: []}];
      return [`core-mouse.${id}`, {namespace, name, restricted, bindings, uneditable: bindings}];
    });
  }

  /* -------------------------------------------- */

  /**
   * Given a Binding and its parent Action, detects other Actions that might conflict with that binding
   * @param {string} actionId The Action's fully-qualified identifier
   * @param {KeybindingActionConfig} action
   * @param {KeybindingActionBinding} binding
   * @returns {KeybindingAction[]}
   */
  #detectConflictingActions(actionId, action, binding) {

    // Uneditable Core bindings never count as conflicting
    if ( ["core", "core-pointer"].includes(action.namespace) && action.uneditable.includes(binding) ) return [];

    const context = KeyboardManager.getKeyboardEventContext({
      code: binding.key,
      shiftKey: binding.modifiers.includes(KeyboardManager.MODIFIER_KEYS.SHIFT),
      ctrlKey: binding.modifiers.includes(KeyboardManager.MODIFIER_KEYS.CONTROL),
      altKey: binding.modifiers.includes(KeyboardManager.MODIFIER_KEYS.ALT),
      repeat: false
    });
    return KeyboardManager._getMatchingActions(context).filter(a => a.action !== actionId);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    this.element.querySelector(".window-content").addEventListener("dblclick", this.#onDoubleClick.bind(this));
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /**
   * Add a new keybinding for an action.
   * @this {ControlsConfig}
   * @type {ApplicationClickAction}
   */
  static async #onAddBinding(event) {
    const bindingEl = event.target.closest("[data-binding-id]");
    const newBinding = this.#createBindingInput(bindingEl, {incrementId: true});
    newBinding.querySelector("button[data-action=cancelEdit]").remove();
    bindingEl.closest("ul").append(newBinding);
    newBinding.querySelector("input").focus();

    // If this is an empty binding, delete it
    if ( bindingEl.dataset.bindingId === "empty" ) bindingEl.remove();
  }

  /* -------------------------------------------- */

  /**
   * Toggle visibility of the Edit / Save UI
   * @this {ControlsConfig}
   * @type {ApplicationClickAction}
   */
  static async #onEditBinding(event) {
    const button = event.target;
    const bindingRow = button.closest("li[data-binding-id]");
    const editingRow = this.#createBindingInput(bindingRow);
    const input = editingRow.querySelector("input");
    input.value = bindingRow.querySelector("kbd").innerText.trim();
    bindingRow.after(editingRow);
    bindingRow.hidden = true;
    input.focus();
  }

  /* -------------------------------------------- */

  /**
   * Save the new Binding value and update the display of the UI
   * @this {ControlsConfig}
   * @type {ApplicationClickAction}
   */
  static async #onSaveBinding(event) {
    return this.#savePendingEdits();
  }

  /* -------------------------------------------- */

  /**
   * Cancel editing a keybinding.
   * @this {ControlsConfig}
   * @type {ApplicationClickAction}
   */
  static async #onCancelEdit(event) {
    const actionId = event.target.closest("[data-action-id]").dataset.actionId;
    const bindingId = event.target.closest("[data-binding-id]").dataset.bindingId;
    const bindingIndex = Number(bindingId.split(".")[3] ?? NaN);
    this.#pendingEdits.get(actionId)?.findSplice(b => b.index === bindingIndex);
    return this.#savePendingEdits();
  }

  /**
   * Delete a keybinding for an action.
   * @this {ControlsConfig}
   * @type {ApplicationClickAction}
   */
  static async #onDeleteBinding(event) {
    const bindingId = event.target.closest("[data-binding-id]").dataset.bindingId;
    const actionId = event.target.closest("[data-action-id]").dataset.actionId;
    const bindingIndex = Number(bindingId.split(".")[3] ?? NaN);
    this.#addPendingEdit(actionId, bindingIndex, {index: bindingIndex, key: null});
    return this.#savePendingEdits();
  }

  /* -------------------------------------------- */

  /**
   * Create an action keybinding row with an input element.
   * @param {HTMLElement} bindingEl
   * @param {object} [options]
   * @param {boolean} [options.incrementId] Whether the binding identifier's index component should be incremented
   * @returns {HTMLElement} A modified clone of the binding-input template content
   */
  #createBindingInput(bindingEl, {incrementId=false}={}) {
    const actionId = bindingEl.closest("[data-action-id]").dataset.actionId;
    const inputRow = document.getElementById(`${this.id}-binding-input`).content.firstElementChild.cloneNode(true);
    const bindings = game.keybindings.bindings.get(actionId);
    inputRow.dataset.bindingId = incrementId ? `${actionId}.binding.${bindings.length}` : bindingEl.dataset.bindingId;
    const input = inputRow.querySelector("input");
    input.name = inputRow.dataset.bindingId;
    if ( !incrementId ) {
      const kbdEl = bindingEl.querySelector("kbd");
      input.ariaLabel = kbdEl.ariaLabel;
      const warningIcon = kbdEl.querySelector("i");
      if ( warningIcon ) { // Copy over the warning
        inputRow.querySelector("i").className = warningIcon.className;
        input.dataset.tooltip = ""; // Make the aria-label additionally a tooltip
      }
    }
    input.placeholder = ControlsConfig.humanizeBinding({key: "1", modifiers: [KeyboardManager.CONTROL_KEY_STRING]});
    input.addEventListener("keydown", this.#onKeydownBindingInput.bind(this));
    return inputRow;
  }

  /* -------------------------------------------- */

  /**
   * Inserts a Binding into the Pending Edits object, creating a new Map entry as needed
   * @param {string} actionId
   * @param {number} bindingIndex
   * @param {KeybindingActionBinding} binding
   */
  #addPendingEdit(actionId, bindingIndex, binding) {
    // Save pending edits
    if ( this.#pendingEdits.has(actionId) ) {
      // Filter out any existing pending edits for this Binding so we don't add each Key in "Shift + A"
      const currentBindings = this.#pendingEdits.get(actionId).filter(x => x.index !== bindingIndex);
      currentBindings.push(binding);
      this.#pendingEdits.set(actionId, currentBindings);
    } else {
      this.#pendingEdits.set(actionId, [binding]);
    }
  }

  /* -------------------------------------------- */

  /**
   * If a `kbd` element was double-clicked, toggle visibility of a keybinding edit input
   * @param {PointerEvent} event
   */
  async #onDoubleClick(event) {
    if ( event.target.closest("kbd") ) return ControlsConfig.#onEditBinding.call(this, event, event.target);
  }

  /* -------------------------------------------- */

  /**
   * Reset setting defaults.
   * @this {ControlsConfig}
   * @type {ApplicationClickAction}
   */
  static async #onResetDefaults() {
    const question = game.i18n.localize("AreYouSure");
    const warning = game.i18n.localize("KEYBINDINGS.ResetWarning");
    const confirmed = foundry.applications.api.DialogV2.confirm({
      window: {title: "KEYBINDINGS.ResetTitle"},
      content: `<p><strong>${question}</strong> ${warning}</p>`
    });
    if ( !confirmed ) return;
    await game.keybindings.resetDefaults();
    this.#cachedData = null;
    this.#pendingEdits.clear();
    await this.render();
    ui.notifications.info("KEYBINDINGS.ResetSuccess", {localize: true});
  }

  /* -------------------------------------------- */

  /**
   * Iterate over all Pending edits, merging them in with unedited Bindings and then saving and resetting the UI
   */
  async #savePendingEdits() {
    for ( const [id, pendingBindings] of this.#pendingEdits ) {
      let [namespace, ...action] = id.split(".");
      action = action.join(".");
      const bindingsData = game.keybindings.bindings.get(id);
      const actionData = game.keybindings.actions.get(id);

      // Identify the set of bindings which should be saved
      const toSet = [];
      for ( const [index, binding] of bindingsData.entries() ) {
        if ( actionData.uneditable.includes(binding) ) continue;
        const {key, modifiers} = binding;
        toSet[index] = {key, modifiers};
      }
      for ( const binding of pendingBindings ) {
        const {index, key, modifiers} = binding;
        toSet[index] = {key, modifiers};
      }

      // Try to save the binding, reporting any errors
      try {
        await game.keybindings.set(namespace, action, toSet.filter(b => b?.key));
      }
      catch(error) {
        ui.notifications.error(error);
      }
    }

    // Reset and rerender
    this.#cachedData = null;
    this.#pendingEdits.clear();
    await this.render();
  }

  /* -------------------------------------------- */

  /**
   * Processes input from the keyboard to form a list of pending Binding edits
   * @param {KeyboardEvent} event   The keyboard event
   */
  #onKeydownBindingInput(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const input = event.target;
    const context = KeyboardManager.getKeyboardEventContext(event);
    const bindingEl = input.closest("[data-binding-id]");
    const bindingId = bindingEl.dataset.bindingId;

    // Build pending Binding
    const bindingIdParts = bindingId.split(".");
    const bindingIndex = Number(bindingIdParts[bindingIdParts.length - 1] ?? NaN);
    const {MODIFIER_KEYS, MODIFIER_CODES} = KeyboardManager;
    const binding = {index: bindingIndex, key: event.code, logicalKey: KeyboardManager.translateKey(event), modifiers: []};
    if ( context.isAlt && !MODIFIER_CODES[MODIFIER_KEYS.ALT].includes(context.key) ) {
      binding.modifiers.push(MODIFIER_KEYS.ALT);
    }
    if ( context.isShift && !MODIFIER_CODES[MODIFIER_KEYS.SHIFT].includes(context.key) ) {
      binding.modifiers.push(MODIFIER_KEYS.SHIFT);
    }
    if ( context.isControl && !MODIFIER_CODES[MODIFIER_KEYS.CONTROL].includes(context.key) ) {
      binding.modifiers.push(MODIFIER_KEYS.CONTROL);
    }
    event.target.value = ControlsConfig.humanizeBinding(binding);

    // Save pending edits
    const actionId = bindingEl.closest("[data-action-id]").dataset.actionId;
    this.#addPendingEdit(actionId, bindingIndex, binding);

    // Alert of potential conflicts
    const action = game.keybindings.actions.get(actionId);
    const conflicts = this.#detectConflictingActions(actionId, action, binding);
    const icon = bindingEl.querySelector(".binding-input > i");
    if ( conflicts.length ) {
      icon.className = "conflict fa-duotone fa-triangle-exclamation";
      const listString = this.#listFormatter.format(conflicts.map(c => game.i18n.localize(c.name)));
      input.dataset.tooltip = "";
      input.ariaLabel = game.i18n.format("KEYBINDINGS.Conflict", {conflicts: listString});
    }
    else {
      icon.className = "fa-regular fa-keyboard";
      delete input.dataset.tooltip;
      input.ariaLabel = game.i18n.localize("KEYBINDINGS.BoundKey");
    }
  }
}

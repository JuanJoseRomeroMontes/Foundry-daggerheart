import ApplicationV2 from "../api/application.mjs";
import HandlebarsApplicationMixin from "../api/handlebars-application.mjs";
import {fromUuid, getDocumentClass} from "@client/utils/helpers.mjs";
import TextEditor from "../ux/text-editor.mjs";
import Hooks from "@client/helpers/hooks.mjs";
import Macro from "@client/documents/macro.mjs";

/**
 * An action bar displayed at the bottom of the game view which contains Macros as interactive buttons.
 * The Hotbar supports 5 pages of macros which can be dragged and dropped to organize as you wish.
 * Left-clicking a Macro button triggers its effect.
 * Right-clicking the button displays a context menu of Macro options.
 * The number keys 1 through 0 activate numbered hotbar slots.
 *
 * @extends ApplicationV2
 * @mixes HandlebarsApplication
 */
export default class Hotbar extends HandlebarsApplicationMixin(ApplicationV2) {

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    id: "hotbar",
    classes: ["faded-ui", "flexrow"],
    tag: "aside",
    window: {
      frame: false,
      positioned: false
    },
    actions: {
      execute: Hotbar.#onExecute,
      lock: Hotbar.#onToggleLock,
      mute: Hotbar.#onToggleMute,
      menu: Hotbar.#onToggleMenu,
      clear: Hotbar.#onClear,
      page: Hotbar.#onPage
    }
  };

  /** @override */
  static PARTS = {
    hotbar: {
      root: true,
      template: "templates/ui/hotbar.hbs"
    }
  };

  /* -------------------------------------------- */

  /**
   * An internal helper data structure that makes it easier to track button swap states.
   * @type {Record<string, {
   *  readonly state: boolean,
   *  active: {icon: string, tooltip: string},
   *  inactive: {icon: string, tooltip: string}
   * }>}
   */
  #toggles = {
    mute: {
      get state() {
        return game.audio.globalMute;
      },
      active: {icon: "fa-volume-xmark", tooltip: "HOTBAR.UNMUTE"},
      inactive: {icon: "fa-volume", tooltip: "HOTBAR.MUTE"}
    },
    lock: {
      get state() {
        return game.settings.get("core", "hotbarLock");
      },
      active: {icon: "fa-lock", tooltip: "HOTBAR.UNLOCK"},
      inactive: {icon: "fa-unlock", tooltip: "HOTBAR.LOCK"}
    }
  };

  /* -------------------------------------------- */

  /**
   * The current hotbar page number.
   * @type {number}
   */
  get page() {
    return this.#page;
  }

  #page = 1;


  /**
   * The currently rendered macro data.
   * @type {HotbarSlotData[]}
   */
  get slots() {
    return this.#slots;
  }

  #slots;

  /**
   * Whether the hotbar is locked.
   * @returns {boolean}
   */
  get locked() {
    return game.settings.get("core", "hotbarLock");
  }

  /**
   * If we are dragging a Macro, remember which slot it originated from.
   * @type {string}
   */
  #dragSlot;

  /**
   * Track the hotbar slot that is the current drop target.
   */
  #dropTarget;

  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(_options) {
    this.#slots = this.#prepareSlots(this.#page);
    return {
      slots: this.#slots,
      page: this.#page
    };
  }

  /* -------------------------------------------- */

  /**
   * @typedef HotbarSlotData
   * @property {number} slot
   * @property {Macro|null} macro
   * @property {number} key
   * @property {string} tooltip
   * @property {string} ariaLabel
   * @property {string} style
   */

  /**
   * Prepare data for the macro slots present on the viewed page.
   * @param {number} page     The currently viewed page number
   * @returns {HotbarSlotData[]}
   */
  #prepareSlots(page) {
    return game.user.getHotbarMacros(page).map((m, i) => {
      return Object.assign(m, {
        key: i<9 ? i+1 : 0,
        img: m.macro?.img ?? null,
        cssClass: m.macro ? "full" : "open",
        tooltip: m.macro?.name ?? null,
        ariaLabel: m.macro?.name ?? game.i18n.localize("HOTBAR.EMPTY")
      });
    });
  }

  /* -------------------------------------------- */

  /** @override */
  async _onFirstRender(_context, _options) {
    game.macros.apps.push(this);
    this.element.setAttribute("aria-roledescription", game.i18n.localize("HOTBAR.LABEL"));
    this._onResize();
    /** @fires {hookEvents:getMacroContextOptions} */
    this._createContextMenu(this._getContextMenuOptions, ".slot.full", {
      fixed: true,
      hookName: "getMacroContextOptions",
      parentClassHooks: false
    });
  }

  /* -------------------------------------------- */

  /** @override */
  async _onRender(_context, _options) {
    this._updateToggles();

    // Drag and Drop
    new foundry.applications.ux.DragDrop.implementation({
      dragSelector: ".slot.full",
      dropSelector: ".slot",
      callbacks: {
        dragstart: this.#onDragStart.bind(this),
        dragover: this.#onDragOver.bind(this),
        drop: this.#onDragDrop.bind(this)
      }
    }).bind(this.element);
  }

  /* -------------------------------------------- */

  /**
   * Get the set of ContextMenu options which should be applied for Scenes in the menu.
   * @returns {ContextMenuEntry[]}   The Array of context options passed to the ContextMenu instance
   * @protected
   */
  _getContextMenuOptions() {
    return [
      {
        name: "MACRO.Edit",
        icon: '<i class="fa-solid fa-pen-to-square"></i>',
        condition: li => {
          const macro = this.#getMacroForSlot(li);
          return macro?.isOwner ?? false;
        },
        callback: li => {
          const macro = this.#getMacroForSlot(li);
          const hotbarSlot = li.dataset.slot;
          macro.sheet.render({force: true, hotbarSlot});
        }
      },
      {
        name: "MACRO.Remove",
        icon: '<i class="fa-solid fa-xmark"></i>',
        callback: li => game.user.assignHotbarMacro(null, Number(li.dataset.slot))
      },
      {
        name: "MACRO.Delete",
        icon: '<i class="fa-solid fa-trash"></i>',
        condition: li => {
          const macro = this.#getMacroForSlot(li);
          return macro?.isOwner ?? false;
        },
        callback: li => {
          const macro = this.#getMacroForSlot(li);
          macro?.deleteDialog();
        }
      }
    ];
  }

  /* -------------------------------------------- */

  /**
   * Update the presented state of toggle buttons.
   * @internal
   */
  _updateToggles() {
    for ( const [action, config] of Object.entries(this.#toggles) ) {
      const button = this.element.querySelector(`button[data-action="${action}"]`);
      const remove = config.state ? config.inactive : config.active;
      const add = config.state ? config.active : config.inactive;
      button.classList.remove(remove.icon);
      button.classList.add(add.icon);
      button.dataset.tooltip = add.tooltip;
      button.setAttribute("aria-label", game.i18n.localize(add.tooltip));
    }
  }

  /* -------------------------------------------- */
  /*  Public API                                 */
  /* -------------------------------------------- */

  /**
   * Change to a specific numbered page from 1 to 5
   * @param {number} page       The page number to change to
   * @returns {Promise<void>}
   */
  async changePage(page) {
    if ( !Number.isInteger(page) || !page.between(1, 5) ) {
      throw new Error("The Hotbar page must be an integer between 1 and 5");
    }
    this.#page = page;
    await this.render();
  }

  /* -------------------------------------------- */

  /**
   * Change the page of the hotbar by cycling up (positive) or down (negative).
   * @param {number} direction    The direction to cycle
   * @returns {Promise<void>}
   */
  async cyclePage(direction) {
    const d = Number.isNumeric(direction) ? Math.sign(direction) : 1;
    let next = (this.#page + d) % 6;
    if ( next === 0 ) next = d > 0 ? 1 : 5;
    return this.changePage(next);
  }

  /* -------------------------------------------- */

  /**
   * A reusable helper that can be used for toggling display of a document sheet.
   * @param {string} uuid     The Document UUID to display
   * @returns {Promise<void>}
   */
  static async toggleDocumentSheet(uuid) {
    const doc = await fromUuid(uuid);
    if ( !doc ) {
      return ui.notifications.warn("WARNING.ObjectDoesNotExist", {format: {
        name: game.i18n.localize("Document"),
        identifier: uuid
      }});
    }
    const sheet = doc.sheet;
    if ( sheet.rendered ) await sheet.close();
    else await sheet.render(true); // TODO change to {force: true} once everything is AppV2
  }

  /* -------------------------------------------- */
  /*  Action Event Handlers                      */
  /* -------------------------------------------- */

  /**
   * A helper method used to retrieve a Macro document from a hotbar slot element.
   * @param {HTMLLIElement} element
   * @returns {Macro|null}
   */
  #getMacroForSlot(element) {
    const slot = element.dataset.slot;
    const macroId = game.user.hotbar[slot];
    if ( !macroId) return null;
    return game.macros.get(macroId) ?? null;
  }

  /* -------------------------------------------- */

  /**
   * Handle click events to execute a Macro or create a new Macro.
   * @this {Hotbar}
   * @param {PointerEvent} event
   * @returns {Promise<void>}
   */
  static async #onExecute(event) {
    const macro = this.#getMacroForSlot(event.target);

    // Execute a Macro
    if ( macro ) await macro?.execute();

    // Create a temporary Macro
    else {
      const cls = getDocumentClass("Macro");
      const macro = new cls({name: cls.defaultName({type: "chat"}), type: "chat", scope: "global"});
      const hotbarSlot = event.target.dataset.slot;
      await macro.sheet.render({force: true, hotbarSlot});
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle click events to toggle the hotbar locked state.
   * @this {Hotbar}
   * @returns {Promise<void>}
   */
  static async #onToggleLock() {
    await game.settings.set("core", "hotbarLock", !this.locked, {render: false});
    this._updateToggles();
  }

  /* -------------------------------------------- */

  /**
   * Handle click events to toggle the global mute state.
   * @this {Hotbar}
   * @returns {Promise<void>}
   */
  static async #onToggleMute() {
    game.audio.globalMute = !game.audio.globalMute;
    this._updateToggles();
  }

  /* -------------------------------------------- */

  /**
   * Handle click events to toggle the game main menu.
   * @this {Hotbar}
   * @returns {Promise<void>}
   */
  static async #onToggleMenu() {
    await ui.menu.toggle();
  }

  /* -------------------------------------------- */

  /**
   * Handle click events to toggle the game main menu.
   * @this {Hotbar}
   * @returns {Promise<void>}
   */
  static async #onClear() {
    const proceed = await foundry.applications.api.DialogV2.confirm({
      window: {
        title: "HOTBAR.CLEAR",
        icon: "fa-solid fa-trash"
      },
      content: game.i18n.localize("HOTBAR.CLEAR_CONFIRM"),
      modal: true
    });
    if ( proceed ) await game.user.update({hotbar: {}}, {recursive: false, diff: false, noHook: true});
  }

  /* -------------------------------------------- */

  /**
   * Handle click events to cycle the viewed hotbar page.
   * @this {Hotbar}
   * @param {PointerEvent} event
   * @returns {Promise<void>}
   */
  static async #onPage(event) {
    const button = event.target;
    const direction = Number(button.dataset.direction);
    await this.cyclePage(direction);
  }

  /* -------------------------------------------- */

  /**
   * Update hotbar display based on viewport size.
   * @internal
   */
  _onResize() {
    const { uiScale = 1 } = game.settings.get("core", "uiConfig") ?? {};
    const cameraDock = ui.webrtc.isVertical && !ui.webrtc.hidden;
    const { innerWidth } = window;
    const effectiveWidth = innerWidth / uiScale;
    this.element.classList.toggle("lg", effectiveWidth >= 2110);
    this.element.classList.toggle("md", effectiveWidth <= (cameraDock ? 1920 : 1680));
    this.element.classList.toggle("sm", effectiveWidth <= (cameraDock ? 1680 : 1488));
    this.element.classList.toggle("min", effectiveWidth <= (cameraDock ? 1488 : 1024));
  }

  /* -------------------------------------------- */
  /*  Drag and Drop                              */
  /* -------------------------------------------- */

  /**
   * Begin dragging a Macro to change its location on the bar.
   * @param {DragEvent} event
   */
  #onDragStart(event) {
    const li = event.target.closest(".slot");
    const macro = this.#getMacroForSlot(li);
    if ( !macro || this.locked ) {
      event.preventDefault();
      return;
    }
    this.#dragSlot = li.dataset.slot;
    const dragData = foundry.utils.mergeObject(macro.toDragData(), {slot: this.#dragSlot});
    event.dataTransfer.setData("text/plain", JSON.stringify(dragData));
  }

  /* -------------------------------------------- */

  /**
   * Highlight the Scene which becomes the drop target for drag-and-drop handling.
   * @param {DragEvent} event
   */
  #onDragOver(event) {
    const target = event.target.closest(".slot");
    if ( target === this.#dropTarget ) return;
    if ( this.#dropTarget ) this.#dropTarget.classList.remove("drop-target");
    this.#dropTarget = target;
    if ( !target || (target.dataset.slot === this.#dragSlot) ) return;
    target.classList.add("drop-target");
  }

  /* -------------------------------------------- */

  /**
   * Conclude dragging a Scene to change its navigation order.
   * @param {DragEvent} event
   */
  async #onDragDrop(event) {
    if ( this.#dropTarget ) {
      this.#dropTarget.classList.remove("drop-target");
      this.#dropTarget = undefined;
    }

    // Get the dropped slot
    const li = event.target.closest(".slot");
    const dropSlot = li.dataset.slot;
    if ( this.#dragSlot === dropSlot ) return;
    this.#dragSlot = undefined;

    // Get the Macro to add
    const data = TextEditor.implementation.getDragEventData(event);
    if ( Hooks.call("hotbarDrop", this, data, dropSlot) === false ) return;
    if ( this.locked ) return;  // Do nothing if the bar is locked

    // Get the dropped Document
    const cls = getDocumentClass(data.type);
    const doc = await cls?.fromDropData(data);
    if ( !doc ) return;

    // Get or create a Macro to add to the bar
    let macro;
    if ( data.type === "Macro" ) macro = game.macros.has(doc.id) ? doc : await cls.create(doc.toObject());
    else if ( data.type === "RollTable" ) macro = await this._createRollTableRollMacro(doc);
    else macro = await this._createDocumentSheetToggle(doc);

    // Assign the macro to the hotbar
    if ( !macro ) return;
    return game.user.assignHotbarMacro(macro, dropSlot, {fromSlot: data.slot});
  }

  /* -------------------------------------------- */

  /**
   * Create a Macro which rolls a RollTable when executed
   * @param {Document} table    The RollTable document
   * @returns {Promise<Macro>}  A created Macro document to add to the bar
   * @protected
   */
  async _createRollTableRollMacro(table) {
    const command = `const table = await fromUuid("${table.uuid}");\nawait table.draw();`;
    return Macro.implementation.create({
      name: `${game.i18n.localize("TABLE.ACTIONS.DrawResult")} ${table.name}`,
      type: "script",
      img: table.img,
      command
    });
  }

  /* -------------------------------------------- */

  /**
   * Create a Macro document which can be used to toggle display of a Journal Entry.
   * @param {Document} doc          A Document which should be toggled
   * @returns {Promise<Macro>}      A created Macro document to add to the bar
   * @protected
   */
  async _createDocumentSheetToggle(doc) {
    const name = doc.name || `${game.i18n.localize(doc.constructor.metadata.label)} ${doc.id}`;
    return Macro.implementation.create({
      name: `${game.i18n.localize("Display")} ${name}`,
      type: CONST.MACRO_TYPES.SCRIPT,
      img: "icons/svg/book.svg",
      command: `await foundry.applications.ui.Hotbar.toggleDocumentSheet("${doc.uuid}");`
    });
  }

  /* -------------------------------------------- */
  /*  Compatibility and Deprecations             */
  /* -------------------------------------------- */

  /**
   * @deprecated since v13
   * @ignore
   */
  get macros() {
    foundry.utils.logCompatibilityWarning("Hotbar#macros is deprecated in favor of Hotbar#slots.",
      {since: 13, until: 15});
    return this.#slots;
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v13
   * @ignore
   */
  collapse() {
    foundry.utils.logCompatibilityWarning("Hotbar#collapse is no longer a supported feature.",
      {since: 13, until: 15});
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v13
   * @ignore
   */
  expand() {
    foundry.utils.logCompatibilityWarning("Hotbar#expand is no longer a supported feature.",
      {since: 13, until: 15});
  }
}

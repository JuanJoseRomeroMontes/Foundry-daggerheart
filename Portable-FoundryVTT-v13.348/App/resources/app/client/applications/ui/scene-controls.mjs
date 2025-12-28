import ApplicationV2 from "../api/application.mjs";
import HandlebarsApplicationMixin from "../api/handlebars-application.mjs";
import InteractionLayer from "../../canvas/layers/base/interaction-layer.mjs";
import Hooks from "../../helpers/hooks.mjs";

/**
 * @import {ApplicationConfiguration, ApplicationRenderOptions} from "../_types.mjs"
 * @import {HandlebarsRenderOptions} from "../api/handlebars-application.mjs"
 */

/**
 * @typedef SceneControlTool
 * The data structure for a single tool in the {@link SceneControl#tools} record.
 * @property {string} name An identifier for the tool, unique among the tools of its SceneControl
 * @property {number} order An integer indicating the tool's order, with 0 being at the top
 * @property {string} title A title for the tool: can be a localization path
 * @property {string} icon  One or more icon classes for the tool, typically Font Awesome classes such as
 *                          "fa-solid fa-face-smile"
 * @property {boolean} [visible] Whether the tool should be visible to the current User
 * @property {boolean} [toggle] Is the tool an on-or-off toggle?
 * @property {boolean} [active] Is the tool the currently the active one? Not applicable to toggles or buttons.
 * @property {boolean} [button] Is the tool a "button" in the sense of immediately resolving on click without
 *                              becoming the active tool?
 * @property {(event: Event, active: boolean) => void} [onChange] A callback invoked when the tool is activated or
 *                                                                deactivated
 * @property {ToolclipConfiguration} [toolclip] Configuration for rendering the tool's toolclip
 */

/**
 * @typedef SceneControl
 * The data structure for a set of controls in the {@link SceneControls#controls} record.
 * @property {string} name A unique identifier for the control
 * @property {number} order An integer indicating the control's order, with 0 being at the top
 * @property {string} title A title for the control: can be a localization path
 * @property {string} icon  One or more icon classes for the control, typically Font Awesome classes such as
 *                          "fa-solid fa-face-smile"
 * @property {boolean} [visible] Whether the control should be visible to the current User
 * @property {Record<string, SceneControlTool>} tools
 * @property {string} activeTool
 * @property {(event: Event, active: boolean) => void} [onChange]
 * A callback invoked when control set is activated or deactivated
 * @property {(event: Event, tool: SceneControlTool) => void} [onToolChange]
 * A callback invoked when the active tool changes
 */

/**
 * @typedef ToolclipConfiguration
 * @property {string} src                         The filename of the toolclip video.
 * @property {string} heading                     The heading string.
 * @property {ToolclipConfigurationItem[]} items  The items in the toolclip body.
 */

/**
 * @typedef ToolclipConfigurationItem
 * @property {string} [paragraph]  A plain paragraph of content for this item.
 * @property {string} [heading]    A heading for the item.
 * @property {string} [content]    Content for the item.
 * @property {string} [reference]  If the item is a single key reference, use this instead of content.
 */

/**
 * @typedef _SceneControlsRenderOptions
 * @property {Event} [event]                      An event which prompted a re-render
 * @property {boolean} [reset]                    Re-prepare the possible list of controls
 * @property {string} [control]                   The control set to activate. If undefined, the current control set
 *                                                remains active
 * @property {string} [tool]                      A specific tool to activate. If undefined the current tool or default
 *                                                tool for the control set becomes active
 * @property {Record<string, boolean>} [toggles]  Changes to apply to toggles within the control set
 */

/**
 * @typedef {ApplicationRenderOptions &
 *           HandlebarsRenderOptions &
 *           _SceneControlsRenderOptions} SceneControlsRenderOptions
 * Options that can be passed to {@link SceneControls#render} to customize rendering behavior.
 */

/**
 * @typedef SceneControlsActivationChange
 * The data structure provided to the {@link SceneControl#onChange} callback.
 * @property {Event} event
 * @property {string} controlChange
 * @property {string} toolChange
 * @property {Record<string, boolean>} toggleChanges
 */

/**
 * The Scene Controls UI element.
 * @extends ApplicationV2<ApplicationConfiguration, SceneControlsRenderOptions>
 * @mixes HandlebarsApplication
 */
export default class SceneControls extends HandlebarsApplicationMixin(ApplicationV2) {

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    id: "scene-controls",
    classes: ["faded-ui"],
    tag: "aside",
    window: {
      frame: false,
      positioned: false
    },
    actions: {
      control: SceneControls.#onChangeControl,
      tool: SceneControls.#onChangeTool
    }
  };

  /** @override */
  static PARTS = {
    layers: {
      id: "layers",
      template: "templates/ui/scene-controls-layers.hbs"
    },
    tools: {
      id: "tools",
      template: "templates/ui/scene-controls-tools.hbs"
    }
  };

  /** @inheritDoc */
  static emittedEvents = Object.freeze([...super.emittedEvents, "activate"]);

  /* -------------------------------------------- */

  /**
   * The currently active control layer.
   * @type {string}
   */
  #control = "tokens";

  /**
   * The currently active tools per control layer.
   * @type {Record<string, string|null>}
   */
  #tools = {};

  /**
   * Cache the number of rendered tools.
   * @type {number}
   */
  #nTools = 0;

  /* -------------------------------------------- */

  /**
   * Prepared data of available controls.
   * @type {Record<string, SceneControl>}
   */
  get controls() {
    return this.#controls;
  }

  #controls;

  /* -------------------------------------------- */

  /**
   * The currently active control layer.
   * @type {SceneControl|null}
   */
  get control() {
    return this.#controls[this.#control] || null;
  }

  /* -------------------------------------------- */

  /**
   * The tools which are available within the current control layer.
   * @type {Record<string, SceneControlTool>}
   */
  get tools() {
    return this.control?.tools || {};
  }

  /* -------------------------------------------- */

  /**
   * The currently active tool in the control palette.
   * @type {SceneControlTool}
   */
  get tool() {
    const activeTool = this.#tools[this.#control];
    return this.tools[activeTool];
  }

  /* -------------------------------------------- */
  /*  Public API                                  */
  /* -------------------------------------------- */

  /**
   * Activate a new control layer or tool.
   * This method is advantageous to use because it minimizes the amount of re-rendering necessary.
   * @param {Pick<SceneControlsRenderOptions, "event"|"control"|"tool"|"toggles">} options
   * @returns {Promise<void>}
   */
  async activate(options={}) {
    const change = this.#preActivate(options);
    if ( !change.controlChange && !change.toolChange && foundry.utils.isEmpty(change.toggleChanges) ) return;


    // Change control set
    if ( change.controlChange ) {
      await this.render({parts: ["tools"]});
      for ( const k of Object.keys(this.controls) ) {
        const button = this.element.querySelector(`button.layer[data-control="${k}"]`);
        if ( !button ) continue;
        button.setAttribute("aria-pressed", this.#control === k ? "true" : "false");
      }
    }

    // Change tool
    if ( change.toolChange || !foundry.utils.isEmpty(change.toggleChanges) ) {
      for ( const [k, tool] of Object.entries(this.tools) ) {
        const button = this.element.querySelector(`button.tool[data-tool="${k}"]`);
        if ( !button ) continue;
        const active = (this.#tools[this.#control] === k) || (tool.toggle && tool.active);
        button.setAttribute("aria-pressed", active ? "true" : "false");
      }
    }

    // Post-change callbacks
    await this._doEvent(this.#postActivate, {
      handlerArgs: [change],
      debugText: "Post-activate",
      eventName: "activate",
      hookName: "activate",
      hookArgs: [change]
    });
  }

  /* -------------------------------------------- */
  /*  Rendering Methods                           */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _configureRenderOptions(options) {
    super._configureRenderOptions(options);
    if ( options.reset || options.isFirstRender ) this.#controls = this.#prepareControls();
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _preRender(context, options) {
    await super._preRender(context, options);
    context.activationChange = this.#preActivate(options);
  }

  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const showToolclips = game.settings.get("core", "showToolclips");

    // Prepare Controls
    const controls = Object.values(this.#controls);
    for ( const c of controls ) c.active = c.name === this.#control;
    controls.sort((a, b) => a.order - b.order);

    // Prepare Tools
    const tools = foundry.utils.deepClone(Object.values(this.tools));
    for ( const t of tools ) {
      if ( !t.toggle ) t.active = t.name === this.#tools[this.#control];
      t.cssClass = [t.button ? "button" : "", t.toggle ? "toggle" : ""].filterJoin(" ");
      t.showToolclip = showToolclips && !!t.toolclip;
    }
    tools.sort((a, b) => a.order - b.order);
    if ( tools.length !== this.#nTools ) options.position = {height: "auto"}; // Trigger resize
    this.#nTools = tools.length;
    return {controls, tools};
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onRender(context, options) {
    await super._onRender(context, options);
    this.#postActivate(context.activationChange);
    for ( const t of this.element.querySelectorAll("#scene-controls-tools .tool[data-toolclip]") ) {
      t.addEventListener("pointerenter", this.#onPointerEnterToolclip.bind(this),
        {once: true, capture: true, passive: true});
    }
    this._updateNotesIcon();
  }

  /* -------------------------------------------- */

  /**
   * Update the class of the notes layer icon to reflect whether there are visible notes or not.
   * @internal
   */
  _updateNotesIcon() {
    const icon = this.element.querySelector(".control[data-control=notes] > i");
    if ( !icon || !canvas.ready ) return;
    const hasVisibleNotes = canvas.notes.placeables.some(n => n.visible);
    icon.classList.toggle("fa-solid", !hasVisibleNotes);
    icon.classList.toggle("fa-duotone", hasVisibleNotes);
    icon.classList.toggle("has-notes", hasVisibleNotes);
  }

  /* -------------------------------------------- */

  /** @override */
  setPosition(position) {
    const tools = this.element.querySelector("#scene-controls-tools");
    const h = tools.clientHeight;
    const cols = Math.ceil((this.#nTools * 40) / h) + 1;
    document.getElementById("ui-left").style.setProperty("--control-columns", String(cols));
    return super.setPosition(position);
  }

  /* -------------------------------------------- */
  /*  Rendering Helpers                           */
  /* -------------------------------------------- */

  /**
   * Prepare layers rendered in the Scene Controls.
   * This is only done once when the application is first rendered. Subsequent renders reuse this data structure.
   * @returns {Record<string, SceneControl>}
   */
  #prepareControls() {

    // Populate controls for each interaction layer
    const controls = {};
    for ( const {layerClass} of Object.values(CONFIG.Canvas.layers) ) {
      if ( !foundry.utils.isSubclass(layerClass, InteractionLayer) ) continue;
      const control = layerClass.prepareSceneControls();
      if ( !control ) continue; // Control set is not available to the current user
      controls[control.name] = control;
    }

    // Allow additional controls to be added by packages
    Hooks.callAll("getSceneControlButtons", controls);

    // Cleaning for all controls and tools
    for ( const [controlId, control] of Object.entries(controls) ) {
      if ( control.visible === false ) { // Control set is not available to the current user
        delete controls[controlId];
        continue;
      }
      this.#tools[control.name] ||= control.activeTool;
      for ( const [toolId, tool] of Object.entries(control.tools) ) {
        if ( tool.visible === false ) delete control.tools[toolId];
        if ( tool.toggle && tool.button ) {
          console.warn(`The SceneControlTool "${controlId}.${toolId}" may not be both a toggle and a button.`);
          tool.button = false;
        }
      }
      if ( foundry.utils.isEmpty(control.tools) ) delete controls[controlId]; // No available tools
    }
    return controls;
  }

  /* -------------------------------------------- */

  /**
   * Actions to take before re-rendering the SceneControls with the new control layer.
   * Deactivate the prior tool or control and identify what changed.
   * @param {Pick<SceneControlsRenderOptions, "event"|"control"|"tool"|"toggles">} change
   * @returns {SceneControlsActivationChange}
   */
  #preActivate({event, control, tool, toggles}={}) {

    // Enforce valid defaults
    if ( !(control in this.#controls) ) control = this.#control;
    if ( !(tool in this.#controls[control].tools) ) tool = this.#tools[control];
    toggles ??= {};
    event ??= new Event("change", {bubbles: false, cancelable: false});

    // Identify changes
    const priorTool = this.tool;
    const priorControl = this.control;
    const controlChange = control !== this.#control ? control : null;
    const toolChange = (controlChange || (tool !== this.#tools[control])) ? tool : null;
    const toggleChanges = {};

    // Assign new values before invoking callbacks
    this.#control = control;
    this.#tools[control] = tool;
    for ( const [name, active] of Object.entries(toggles) ) {
      const toggle = this.tools[name];
      if ( toggle && (toggle.active !== active) ) {
        toggle.active = active;
        toggleChanges[name] = active;
      }
    }

    // Deactivate prior tool and control
    if ( toolChange ) this.#onToolChange(priorControl, priorTool, event, false);
    if ( controlChange ) this.#onChange(priorControl, event, false);

    // Return the change operation for later use in #postActivate
    return {event, controlChange, toolChange, toggleChanges};
  }

  /* -------------------------------------------- */

  /**
   * Actions to take after re-rendering SceneControls with a new control layer.
   * Activate the new control, tool, or toggles.
   * @param {SceneControlsActivationChange} change
   */
  #postActivate({event, controlChange, toolChange, toggleChanges}={}) {
    if ( controlChange ) this.#onChange(this.control, event, true);
    if ( toolChange ) this.#onToolChange(this.control, this.tool, event, true);
    for ( const [name, active] of Object.entries(toggleChanges) ) {
      const toggle = this.tools[name];
      this.#onChange(toggle, event, active);
    }
  }

  /* -------------------------------------------- */

  /**
   * Trigger the onChange callback for a control or tool if defined.
   * @param {SceneControl|SceneControlTool} toolOrControl
   * @param {Event} event
   * @param {boolean} active
   */
  #onChange(toolOrControl, event, active) {
    if ( toolOrControl.onChange instanceof Function ) toolOrControl.onChange(event, active);
    /** @deprecated since 13 */
    if ( toolOrControl.onClick instanceof Function ) {
      foundry.utils.logCompatibilityWarning("SceneControlTool#onClick is deprecated in favor of "
        + "SceneControlTool#onChange", {once: true, since: 13, until: 15});
      toolOrControl.onClick(active);
    }
  }

  /* -------------------------------------------- */

  /**
   * Trigger the onChange callback for tool if defined.
   * Trigger the onToolChange callback for control if defined.
   * @param {SceneControl} control
   * @param {SceneControlTool} tool
   * @param {Event} event
   * @param {boolean} active
   */
  #onToolChange(control, tool, event, active) {
    this.#onChange(tool, event, active);
    if ( control.onToolChange instanceof Function ) control.onToolChange(event, tool);

    // Cancel current drag workflow
    if ( canvas.currentMouseManager ) {
      canvas.currentMouseManager.interactionData.cancelled = true;
      canvas.currentMouseManager.cancel();
    }
  }

  /* -------------------------------------------- */
  /*  Toolclip Definitions                        */
  /* -------------------------------------------- */

  /**
   * Reusable toolclip items.
   * @type {Record<string, {heading: string, reference: string}>}
   */
  static COMMON_TOOLCLIP_ITEMS = {
    create: {heading: "CONTROLS.CommonCreate", reference: "CONTROLS.ClickDrag"},
    move: {heading: "CONTROLS.CommonMove", reference: "CONTROLS.Drag"},
    edit: {heading: "CONTROLS.CommonEdit", reference: "CONTROLS.DoubleClick"},
    editAlt: {heading: "CONTROLS.CommonEdit", reference: "CONTROLS.RightClick2"},
    sheet: {heading: "CONTROLS.CommonOpenSheet", reference: "CONTROLS.DoubleClick"},
    hide: {heading: "CONTROLS.CommonHide", reference: "CONTROLS.RightClick"},
    delete: {heading: "CONTROLS.CommonDelete", reference: "CONTROLS.Delete"},
    rotate: {heading: "CONTROLS.CommonRotate", content: "CONTROLS.ShiftOrCtrlScroll"},
    select: {heading: "CONTROLS.CommonSelect", reference: "CONTROLS.Click"},
    selectAlt: {heading: "CONTROLS.CommonSelect", content: "CONTROLS.ClickOrClickDrag"},
    selectMultiple: {heading: "CONTROLS.CommonSelectMultiple", reference: "CONTROLS.ShiftClick"},
    hud: {heading: "CONTROLS.CommonToggleHUD", reference: "CONTROLS.RightClick"},
    draw: {heading: "CONTROLS.CommonDraw", reference: "CONTROLS.ClickDrag"},
    drawProportionally: {heading: "CONTROLS.CommonDrawProportional", reference: "CONTROLS.AltClickDrag"},
    place: {heading: "CONTROLS.CommonPlace", reference: "CONTROLS.ClickDrag"},
    chain: {heading: "CONTROLS.CommonChain", content: "CONTROLS.ChainCtrlClick"},
    movePoint: {heading: "CONTROLS.CommonMovePoint", reference: "CONTROLS.ClickDrag"},
    openClose: {heading: "CONTROLS.CommonOpenClose", reference: "CONTROLS.Click"},
    openCloseSilently: {heading: "CONTROLS.CommonOpenCloseSilently", reference: "CONTROLS.AltClick"},
    lock: {heading: "CONTROLS.CommonLock", reference: "CONTROLS.RightClick"},
    lockSilently: {heading: "CONTROLS.CommonLockSilently", reference: "CONTROLS.AltRightClick"},
    onOff: {heading: "CONTROLS.CommonOnOff", reference: "CONTROLS.RightClick"}
  };

  /* -------------------------------------------- */

  /**
   * A helper function used to prepare an array of toolclip items.
   * @param {Array<ToolclipConfigurationItem|string|null>} items
   * @returns {ToolclipConfigurationItem[]}
   */
  static buildToolclipItems(items) {
    const prepared = [];
    for ( let i of items ) {
      if ( !i ) continue;
      if ( i in this.COMMON_TOOLCLIP_ITEMS ) i = this.COMMON_TOOLCLIP_ITEMS[i];
      prepared.push(i);
    }
    return prepared;
  }

  /* -------------------------------------------- */
  /*  Event Handlers                              */
  /* -------------------------------------------- */

  /**
   * Handle changing the control layer.
   * @this {SceneControls}
   * @param {PointerEvent} event
   */
  static #onChangeControl(event) {
    if ( !canvas.ready ) return;
    if ( event.target.dataset.control === this.#control ) return;
    this.activate({event, control: event.target.dataset.control});
  }

  /* -------------------------------------------- */

  /**
   * Handle changing the active tool within the currently active control set.
   * @this {SceneControls}
   * @param {PointerEvent} event
   */
  static #onChangeTool(event) {
    if ( !canvas.ready ) return;
    const tool = this.control.tools[event.target.dataset.tool];
    if ( tool === this.tool ) return;
    const options = {event};

    // Buttons
    if ( tool.button ) {
      this.#onChange(tool, event, true);
      return;
    }

    // Toggles
    if ( tool.toggle ) {
      options.toggles = {[tool.name]: !tool.active};
    }

    // Tools
    else options.tool = tool.name;
    this.activate(options);
  }

  /* -------------------------------------------- */

  /**
   * Lazily render toolclip HTML when a tool is hovered.
   * @param {PointerEvent} event
   * @returns {Promise<void>}
   */
  async #onPointerEnterToolclip(event) {
    event.target.dataset.tooltipHtml = await this.#renderToolclip(event.target.dataset.tool);
    delete event.target.dataset.toolclip;
    const pointerover = new event.constructor(event.type, event);
    event.target.dispatchEvent(pointerover);
  }

  /* -------------------------------------------- */

  /**
   * Lazily render and activate a toolclip tooltip.
   * @param {string} toolId
   * @returns {Promise<string>}
   */
  async #renderToolclip(toolId) {
    const tool = this.tools[toolId];
    const isMac = navigator.appVersion.includes("Mac");
    const mod = isMac ? "⌘" : game.i18n.localize("CONTROLS.CtrlAbbr");
    const alt = isMac ? "⌥" : game.i18n.localize("CONTROLS.Alt");
    return foundry.applications.handlebars.renderTemplate("templates/ui/toolclip.hbs", {...tool.toolclip, alt, mod});
  }

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /**
   * @deprecated since v13
   * @ignore
   */
  get activeControl() {
    foundry.utils.logCompatibilityWarning("SceneControls#activeControl is deprecated in favor of"
      + " SceneControls#control#name", {since: 13, until: 15});
    return this.#control;
  }

  /**
   * @deprecated since v13
   * @ignore
   */
  get activeTool() {
    foundry.utils.logCompatibilityWarning("SceneControls#activeTool is deprecated in favor of"
      + " SceneControls#tool#name", {since: 13, until: 15});
    return this.#tools[this.#control];
  }

  /**
   * @deprecated since v13
   * @ignore
   */
  async initialize({layer, tool}={}) {
    foundry.utils.logCompatibilityWarning("SceneControls#initialize is deprecated in favor of SceneControls#render"
      + " with {controls, tool} passed as render options.", {since: 13, until: 15});
    return this.render({control: layer, tool});
  }
}

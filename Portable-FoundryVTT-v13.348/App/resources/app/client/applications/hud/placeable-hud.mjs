import ApplicationV2 from "../api/application.mjs";

/**
 * @import {CanvasDocument} from "../../documents/abstract/canvas-document.mjs";
 * @import {PlaceableObject} from "@client/canvas/placeables/_module.mjs";
 * @import {PlaceablesLayer} from "@client/canvas/layers/_module.mjs";
 */

/**
 * An abstract base class for displaying a heads-up-display interface bound to a Placeable Object on the Canvas.
 * @template {PlaceableObject} ActiveHUDObject
 * @template {CanvasDocument} ActiveHUDDocument
 * @template {PlaceablesLayer} ActiveHUDLayer
 */
export default class BasePlaceableHUD extends ApplicationV2 {

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "placeable-hud-{id}",
    classes: ["placeable-hud"],
    tag: "form",
    window: {
      frame: false,
      positioned: true
    },
    form: {
      handler: BasePlaceableHUD.#onSubmit,
      submitOnChange: true,
      closeOnSubmit: false
    },
    actions: {
      config: BasePlaceableHUD.#onConfigure,
      visibility: BasePlaceableHUD.#onToggleVisibility,
      locked: BasePlaceableHUD.#onToggleLocked,
      sort: BasePlaceableHUD.#onSort,
      togglePalette: BasePlaceableHUD.#onTogglePalette
    },
    position: {}
  };

  /** @override */
  static BASE_APPLICATION = BasePlaceableHUD;

  /* -------------------------------------------- */

  /**
   * Reference a PlaceableObject this HUD is currently bound to.
   * @type {ActiveHUDObject}
   */
  get object() {
    return this.#object;
  }

  #object;

  /* -------------------------------------------- */

  /**
   * Convenience access to the Document which this HUD modifies.
   * @returns {ActiveHUDDocument}
   */
  get document() {
    return this.#object?.document;
  }

  /* -------------------------------------------- */

  /**
   * Convenience access for the canvas layer which this HUD modifies
   * @type {ActiveHUDLayer}
   */
  get layer() {
    return this.#object?.layer;
  }

  /* -------------------------------------------- */

  /**
   * The palette that is currently expanded, if any.
   * @type {string|null}
   */
  get activePalette() {
    return this.#activePalette;
  }

  #activePalette = null;

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(_options) {
    const documentData = this.#object.document?.toObject();
    const context = {
      id: this.id,
      classes: this.options.classes.join(" "),
      appId: this.appId,
      isGM: game.user.isGM,
      isGamePaused: game.paused,
      icons: CONFIG.controlIcons,
      visibilityClass: documentData.hidden ? "active" : "",
      lockedClass: documentData.locked ? "active" : ""
    };
    if ( documentData ) Object.assign(context, documentData);
    return context;
  }

  /* -------------------------------------------- */

  /** @override */
  _updatePosition(position) {
    const s = canvas.dimensions.uiScale;
    const {x: left, y: top} = this.#object.position;
    const {width, height} = this.#object.bounds;
    Object.assign(position, {left, top, width: width / s, height: height / s});
    position.scale = s;
    return position;
  }

  /* -------------------------------------------- */

  /** @override */
  async _onRender(context, options) {

    // Auto-select attribute value on focus and prevent Enter keypresses from triggering form submission
    for ( const input of this.element.querySelectorAll(".attribute > input") ) {
      input.addEventListener("focus", ev => input.select());
      input.addEventListener("keypress", event => {
        if ( event.key === "Enter" ) {
          event.preventDefault();
          input.blur();
        }
      });
    }

    // Toggle active palette
    this.#toggleActivePalette(true);
  }

  /* -------------------------------------------- */

  /** @override */
  async _preClose(options) {
    options.animate = false; // Don't animate closing
  }

  /* -------------------------------------------- */

  /** @override */
  async _onClose(options) {
    this.#object = undefined;
    this.#activePalette = null;
  }

  /* -------------------------------------------- */

  /**
   * Insert the application HTML element into the DOM.
   * Subclasses may override this method to customize how the application is inserted.
   * @param {HTMLElement} element                 The element to insert
   * @protected
   */
  _insertElement(element) {
    const existing = document.getElementById(element.id);
    if ( existing ) existing.replaceWith(element);
    else {
      const parent = document.getElementById("hud");
      parent.append(element);
    }
  }

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /**
   * Bind the HUD to a new PlaceableObject and display it.
   * @param {ActiveHUDObject} object    A PlaceableObject instance to which the HUD should be bound
   * @returns {Promise<void>}
   */
  async bind(object) {
    await this.render({force: true, position: true, object});
  }

  /* -------------------------------------------- */

  /** @override */
  _canRender({object}) {
    if ( object !== undefined ) {
      if ( !(object instanceof foundry.canvas.placeables.PlaceableObject) || (object.scene !== canvas.scene) ) {
        throw new Error("You may only bind a HUD instance to a PlaceableObject in the currently viewed Scene.");
      }
    }
    else if ( !this.#object ) return false;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _configureRenderOptions(options) {
    super._configureRenderOptions(options);
    const {object} = options;
    if ( !object ) return;
    this.#object = object;
    this.#activePalette = null;
  }

  /* -------------------------------------------- */

  /**
   * Toggle the expanded state of the given palette.
   * @param {string|null} palette    The palette to toggle or null to collapse of the currently expanded palette
   * @param {boolean} [active]       Force the palette to be active or inactive
   */
  togglePalette(palette, active) {
    if ( palette !== null ) {
      if ( active === undefined) palette = this.#activePalette === palette ? null : palette;
      else if ( active === false ) palette = null;
    }
    if ( this.#activePalette === palette ) return;
    this.#toggleActivePalette(false);
    this.#activePalette = palette;
    this.#toggleActivePalette(true);
    canvas.app.view.focus(); // Return focus to the canvas so keyboard movement is honored
  }

  /* -------------------------------------------- */

  /**
   * Toggle the expanded state of the active palette.
   * @param {boolean} active       Force the palette to be active or inactive
   */
  #toggleActivePalette(active) {
    if ( !this.#activePalette ) return;
    const button = this.element.querySelector(`.control-icon[data-palette="${this.#activePalette}"]`);
    button.classList.toggle("active", active);
    const palette = this.element.querySelector(`.palette[data-palette="${this.#activePalette}"]`);
    palette.classList.toggle("active", active);
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /**
   * Handle submission of the BasePlaceableHUD form.
   * Wrap a protected method that can be implemented by a subclass.
   * @this {BasePlaceableHUD}
   * @param {SubmitEvent} event
   * @param {HTMLFormElement} form
   * @param {FormDataExtended} formData
   * @returns {Promise<void>}
   */
  static async #onSubmit(event, form, formData) {
    return this._onSubmit(event, form, formData);
  }

  /* -------------------------------------------- */

  /**
   * Handle submission of the BasePlaceableHUD form.
   * @param {SubmitEvent} event
   * @param {HTMLFormElement} form
   * @param {FormDataExtended} formData
   * @returns {Promise<void>}
   * @protected
   */
  async _onSubmit(event, form, formData) {
    const submitData = {};
    for ( const [k, v] of Object.entries(formData.object) ) {
      if ( (event.type === "change") && (event.target.name !== k) ) continue;
      const current = foundry.utils.getProperty(this.document, k);
      submitData[k] = this._parseAttributeInput(k, current, v).value;
    }
    await this.document.update(submitData);
  }

  /* -------------------------------------------- */

  /**
   * Handle toggling palette.
   * @this {BasePlaceableHUD}
   * @param {PointerEvent} event
   * @param {HTMLButtonElement} target
   */
  static #onTogglePalette(event, target) {
    this.togglePalette(target.dataset.palette);
  }

  /* -------------------------------------------- */

  /**
   * Handle click actions to configure the placed object.
   * @this {BasePlaceableHUD}
   * @param {PointerEvent} event
   * @param {HTMLButtonElement} target
   */
  static #onConfigure(event, target) {
    this.#object.sheet.render(true); // TODO change to {force: true} once everything is ApplicationV2
  }

  /* -------------------------------------------- */

  /**
   * Handle click actions to toggle object visibility.
   * @this {BasePlaceableHUD}
   * @param {PointerEvent} event
   * @param {HTMLButtonElement} target
   */
  static #onToggleVisibility(event, target) {
    const isHidden = !!this.document?.hidden;
    const updates = this.layer.controlled.map(o => ({_id: o.id, hidden: !isHidden}));
    target.classList.toggle("active", !isHidden);
    return canvas.scene.updateEmbeddedDocuments(this.document.documentName, updates);
  }

  /* -------------------------------------------- */

  /**
   * Handle click actions to toggle object locked state.
   * @this {BasePlaceableHUD}
   * @param {PointerEvent} event
   * @param {HTMLButtonElement} target
   */
  static #onToggleLocked(event, target) {
    const isLocked = !!this.document?.locked;
    const updates = this.layer.controlled.map(o => ({_id: o.id, locked: !isLocked}));
    target.classList.toggle("active", !isLocked);
    return canvas.scene.updateEmbeddedDocuments(this.document.documentName, updates);
  }

  /* -------------------------------------------- */

  /**
   * Handle click actions to sort the object backwards or forwards within its layer.
   * @this {BasePlaceableHUD}
   * @param {PointerEvent} event
   * @param {HTMLButtonElement} target
   */
  static #onSort(event, target) {
    event.preventDefault();
    const up = target.dataset.direction === "up";
    this.layer._sendToBackOrBringToFront(up);
  }

  /* -------------------------------------------- */

  /**
   * Parse an attribute bar input string into a new value for the attribute field.
   * @param {string} name           The name of the attribute
   * @param {object|number} attr    The current value of the attribute
   * @param {string} input          The raw string input value
   * @returns {{value: number, [delta]: number, isDelta: boolean, isBar: boolean}} The parsed input value
   * @protected
   */
  _parseAttributeInput(name, attr, input) {
    const isBar = (typeof attr === "object") && ("max" in attr);
    const isEqual = input.startsWith("=");
    const isDelta = input.startsWith("+") || input.startsWith("-");
    const current = isBar ? attr.value : attr;
    let v;

    // Explicit equality
    if ( isEqual ) input = input.slice(1);

    // Percentage change
    if ( input.endsWith("%") ) {
      const p = Number(input.slice(0, -1)) / 100;
      if ( isBar ) v = attr.max * p;
      else v = Math.abs(current) * p;
    }

    // Additive delta
    else v = Number(input);

    // Return parsed input
    const value = isDelta ? current + v : v;
    const delta = isDelta ? v : undefined;
    return {attribute: name, value, delta, isDelta, isBar};
  }

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /**
   * @deprecated since v13
   * @ignore
   */
  clear() {
    foundry.utils.logCompatibilityWarning("BasePlaceableHUD#clear is deprecated in favor of BasePlaceableHUD#close",
      {since: 13, until: 15});
    this.close();
  }
}

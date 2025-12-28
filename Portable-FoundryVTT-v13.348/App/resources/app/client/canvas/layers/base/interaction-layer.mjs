import Hooks from "@client/helpers/hooks.mjs";
import CanvasLayer from "./canvas-layer.mjs";

/**
 * A subclass of CanvasLayer which provides support for user interaction with its contained objects.
 * @category Canvas
 */
export default class InteractionLayer extends CanvasLayer {

  /**
   * Is this layer currently active
   * @type {boolean}
   */
  get active() {
    return this.#active;
  }

  /** @ignore */
  #active = false;

  /** @override */
  eventMode = "passive";

  /**
   * Customize behaviors of this CanvasLayer by modifying some behaviors at a class level.
   * @type {{name: string, zIndex: number}}
   */
  static get layerOptions() {
    return Object.assign(super.layerOptions, {
      baseClass: InteractionLayer,
      zIndex: 0
    });
  }

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /**
   * Activate the InteractionLayer, deactivating other layers and marking this layer's children as interactive.
   * @param {object} [options]      Options which configure layer activation
   * @param {string} [options.tool]   A specific tool in the control palette to set as active
   * @returns {InteractionLayer}    The layer instance, now activated
   */
  activate({tool}={}) {

    // Set this layer as active
    const wasActive = this.#active;
    this.#active = true;

    // Deactivate other layers
    for ( const name of Object.keys(canvas.constructor.layers) ) {
      const layer = canvas[name];
      if ( (layer !== this) && (layer instanceof InteractionLayer) ) layer.deactivate();
    }

    // Activate SceneControls if necessary
    const control = this.constructor.layerOptions.name;
    if ( (control !== ui.controls.control.name) || (tool && (tool !== ui.controls.tool.name)) ) {
      ui.controls.activate({control, tool});
    }
    if ( wasActive ) return this;

    // Reset the interaction manager
    canvas.mouseInteractionManager?.reset({state: false});

    // Assign interactivity for the active layer
    this.zIndex = this.getZIndex();
    this.eventMode = "static";
    this.interactiveChildren = true;

    // Call layer-specific activation procedures
    this._activate();
    Hooks.callAll(`activate${this.hookName}`, this);
    Hooks.callAll("activateCanvasLayer", this);
    return this;
  }

  /**
   * The inner _activate method which may be defined by each InteractionLayer subclass.
   * @protected
   */
  _activate() {}

  /* -------------------------------------------- */

  /**
   * Deactivate the InteractionLayer, removing interactivity from its children.
   * @returns {InteractionLayer}    The layer instance, now inactive
   */
  deactivate() {
    if ( !this.#active ) return this;
    canvas.highlightObjects(false);
    this.#active = false;
    this.eventMode = "passive";
    this.interactiveChildren = false;
    this.zIndex = this.getZIndex();
    this._deactivate();
    Hooks.callAll(`deactivate${this.hookName}`, this);
    return this;
  }

  /**
   * The inner _deactivate method which may be defined by each InteractionLayer subclass.
   * @protected
   */
  _deactivate() {}

  /* -------------------------------------------- */

  /** @override */
  async _draw(options) {
    this.hitArea = canvas.dimensions.rect;
    this.zIndex = this.getZIndex();
  }

  /* -------------------------------------------- */

  /**
   * Get the zIndex that should be used for ordering this layer vertically relative to others in the same Container.
   * @returns {number}
   */
  getZIndex() {
    return this.options.zIndex;
  }

  /* -------------------------------------------- */

  /**
   * Prepare data used by SceneControls to register tools used by this layer.
   * @returns {SceneControl|null}
   */
  static prepareSceneControls() {
    return null;
  }

  /* -------------------------------------------- */

  /**
   * Highlight the objects of this layer.
   * @param {boolean} active    Should the objects of this layer be highlighted?
   * @protected
   */
  _highlightObjects(active) {}

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /**
   * Handle left mouse-click events which originate from the Canvas stage.
   * @param {PIXI.FederatedEvent} event      The PIXI InteractionEvent which wraps a PointerEvent
   * @protected
   */
  _onClickLeft(event) {}

  /* -------------------------------------------- */

  /**
   * Handle double left-click events which originate from the Canvas stage.
   * @param {PIXI.FederatedEvent} event      The PIXI InteractionEvent which wraps a PointerEvent
   * @protected
   */
  _onClickLeft2(event) {}


  /* -------------------------------------------- */

  /**
   * Does the User have permission to left-click drag on the Canvas?
   * @param {User} user                    The User performing the action.
   * @param {PIXI.FederatedEvent} event    The event object.
   * @returns {boolean}
   * @protected
   */
  _canDragLeftStart(user, event) {
    return true;
  }

  /* -------------------------------------------- */

  /**
   * Start a left-click drag workflow originating from the Canvas stage.
   * @param {PIXI.FederatedEvent} event      The PIXI InteractionEvent which wraps a PointerEvent
   * @protected
   */
  _onDragLeftStart(event) {}

  /* -------------------------------------------- */

  /**
   * Continue a left-click drag workflow originating from the Canvas stage.
   * @param {PIXI.FederatedEvent} event      The PIXI InteractionEvent which wraps a PointerEvent
   * @protected
   */
  _onDragLeftMove(event) {}

  /* -------------------------------------------- */

  /**
   * Conclude a left-click drag workflow originating from the Canvas stage.
   * @param {PIXI.FederatedEvent} event      The PIXI InteractionEvent which wraps a PointerEvent
   * @protected
   */
  _onDragLeftDrop(event) {}

  /* -------------------------------------------- */

  /**
   * Cancel a left-click drag workflow originating from the Canvas stage.
   * @param {PIXI.FederatedEvent} event      The PIXI InteractionEvent which wraps a PointerEvent
   * @protected
   */
  _onDragLeftCancel(event) {}

  /* -------------------------------------------- */

  /**
   * Handle right mouse-click events which originate from the Canvas stage.
   * @param {PIXI.FederatedEvent} event      The PIXI InteractionEvent which wraps a PointerEvent
   * @protected
   */
  _onClickRight(event) {}

  /* -------------------------------------------- */

  /**
   * Handle double right mouse-click events which originate from the Canvas stage.
   * @param {PIXI.FederatedEvent} event      The PIXI InteractionEvent which wraps a PointerEvent
   * @protected
   */
  _onClickRight2(event) {}

  /* -------------------------------------------- */

  /**
   * Handle mouse-wheel events which occur for this active layer.
   * @param {WheelEvent} event                The WheelEvent initiated on the document
   * @protected
   */
  _onMouseWheel(event) {}

  /* -------------------------------------------- */

  /**
   * Handle a Cycle View keypress while this layer is active.
   * @param {KeyboardEvent} event             The cycle-view key press event
   * @returns {boolean}                       Was the event handled?
   * @protected
   */
  _onCycleViewKey(event) {
    return false;
  }

  /* -------------------------------------------- */

  /**
   * Handle a Delete keypress while this layer is active.
   * @param {KeyboardEvent} event             The delete key press event
   * @returns {boolean}                       Was the event handled?
   * @protected
   */
  _onDeleteKey(event) {
    return false;
  }

  /* -------------------------------------------- */

  /**
   * Handle a Select All keypress while this layer is active.
   * @param {KeyboardEvent} event             The select-all key press event
   * @returns {boolean}                       Was the event handled?
   * @protected
   */
  _onSelectAllKey(event) {
    return false;
  }

  /* -------------------------------------------- */

  /**
   * Handle a Dismiss keypress while this layer is active.
   * @param {KeyboardEvent} event             The dismiss key press event
   * @returns {boolean}                       Was the event handled?
   * @protected
   */
  _onDismissKey(event) {
    return false;
  }

  /* -------------------------------------------- */

  /**
   * Handle a Undo keypress while this layer is active.
   * @param {KeyboardEvent} event             The undo key press event
   * @returns {boolean}                       Was the event handled?
   * @protected
   */
  _onUndoKey(event) {
    return false;
  }

  /* -------------------------------------------- */

  /**
   * Handle a Cut keypress while this layer is active.
   * @param {KeyboardEvent} event             The cut key press event
   * @returns {boolean}                       Was the event handled?
   * @protected
   */
  _onCutKey(event) {
    return false;
  }

  /* -------------------------------------------- */

  /**
   * Handle a Copy keypress while this layer is active.
   * @param {KeyboardEvent} event             The copy key press event
   * @returns {boolean}                       Was the event handled?
   * @protected
   */
  _onCopyKey(event) {
    return false;
  }

  /* -------------------------------------------- */

  /**
   * Handle a Paste keypress while this layer is active.
   * @param {KeyboardEvent} event             The paste key press event
   * @returns {boolean}                       Was the event handled?
   * @protected
   */
  _onPasteKey(event) {
    return false;
  }
}

/* -------------------------------------------- */

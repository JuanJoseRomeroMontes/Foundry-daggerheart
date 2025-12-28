import {DialogV2, DocumentSheetV2, HandlebarsApplicationMixin} from "../api/_module.mjs";
import FormDataExtended from "../ux/form-data-extended.mjs";
import SceneConfig from "../sheets/scene-config.mjs";
import {diffObject, flattenObject} from "@common/utils/_module.mjs";

/**
 * @import {ApplicationClickAction, ApplicationConfiguration} from "../_types.mjs";
 * @import {DocumentSheetConfiguration} from "../api/document-sheet.mjs";
 * @import {GridMesh} from "@client/canvas/containers/_module.mjs";
 */

/**
 * A tool for fine-tuning the grid in a Scene
 * @extends DocumentSheetV2
 * @mixes HandlebarsApplication
 */
export default class GridConfig extends HandlebarsApplicationMixin(DocumentSheetV2) {

  /**
   * @param {ApplicationConfiguration & DocumentSheetConfiguration} options
   */
  constructor(options) {
    super(options);
    this.sheet = options.document.sheet;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    classes: ["grid-config"],
    window: {
      contentClasses: ["standard-form"],
      icon: "fa-solid fa-ruler-combined"
    },
    position: {width: 480},
    form: {
      closeOnSubmit: true
    },
    actions: {
      resetChanges: GridConfig.#onResetChanges
    },
    sheetConfig: false
  };

  /** @override */
  static PARTS = {
    form: {
      template: "templates/scene/grid-config.hbs",
      root: true
    },
    footer: {
      template: "templates/generic/form-footer.hbs"
    }
  };

  /* -------------------------------------------- */

  /**
   * Track the Scene Configuration sheet reference.
   * @type {SceneConfig}
   */
  sheet;

  /**
   * A reference to the bound key handler function.
   * @type {(event: KeyboardEvent) => void}
   */
  #keyHandler;

  /**
   * A reference to the bound mousewheel handler function.
   * @type {(event: WheelEvent) => void}
   */
  #wheelHandler;

  /**
   * The preview scene
   * @type {Scene|null}
   */
  #previewScene = null;

  /**
   * The container containing the preview background image and grid
   * @type {PIXI.Container|null}
   */
  #previewContainer = null;

  /**
   * The background preview
   * @type {PIXI.Sprite|null}
   */
  #background = null;

  /**
   * The grid preview
   * @type {GridMesh|null}
   */
  #grid = null;

  /* -------------------------------------------- */

  /** @override */
  get title() {
    return game.i18n.localize("SCENE.GridConfigTool");
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _configureRenderOptions(options) {
    super._configureRenderOptions(options);
    const states = GridConfig.RENDER_STATES;
    if ( options?.force && [states.CLOSED, states.NONE].includes(this.state) ) {
      if ( !this.document.background.src ) {
        ui.notifications.warn("WARNING.GridConfigNoBG", {localize: true});
      }
      this.#previewScene = this.document.clone();
    }
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const scene = this.#previewScene;
    const bg = foundry.canvas.getTexture(scene.background.src);
    return Object.assign(context, {
      scene,
      gridTypes: SceneConfig._getGridTypes(),
      scale: scene.background.src ? this.document.width / bg.width : 1,
      pixelsLabel: game.i18n.localize("SCENE.Pixels"),
      buttons: [
        {type: "button", icon: "fa-solid fa-arrow-rotate-left", label: "SCENE.GridReset", action: "resetChanges"},
        {type: "submit", icon: "fa-solid fa-floppy-disk", label: "SETTINGS.Save"}
      ]
    });
  }

  /* -------------------------------------------- */
  /*  Application Life-Cycle Events               */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onRender(context, options) {
    await super._onRender(context, options);
    await this.#createPreview();
    this.#keyHandler ??= this.#onKeyDown.bind(this);
    document.addEventListener("keydown", this.#keyHandler);
    this.#wheelHandler ??= this.#onWheel.bind(this);
    document.addEventListener("wheel", this.#wheelHandler, {passive: false});
  }


  /* -------------------------------------------- */

  /** @inheritDoc */
  _onClose(options) {
    super._onClose(options);
    document.removeEventListener("keydown", this.#keyHandler);
    document.removeEventListener("wheel", this.#wheelHandler);
    this.#keyHandler = this.#wheelHandler = undefined;
    this.sheet.maximize();
    this.#previewScene = null;
    this.#destroyPreviewContainer();
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onChangeForm(formConfig, event) {
    await super._onChangeForm(formConfig, event);
    const formData = new FormDataExtended(this.form);
    const previewData = this._prepareSubmitData(event, this.form, formData);
    this.#previewChanges(previewData);
  }

  /* -------------------------------------------- */

  /**
   * Handle keyboard events.
   * @param {KeyboardEvent} event    The original keydown event
   */
  #onKeyDown(event) {
    const key = event.code;
    const up = ["KeyW", "ArrowUp"];
    const down = ["KeyS", "ArrowDown"];
    const left = ["KeyA", "ArrowLeft"];
    const right = ["KeyD", "ArrowRight"];
    const moveKeys = [up, down, left, right].flat();
    if ( !moveKeys.includes(key) ) return;

    // Increase the Scene scale on shift + up or down
    if ( event.shiftKey ) {
      event.preventDefault();
      event.stopPropagation();
      const delta = up.includes(key) ? 1 : (down.includes(key) ? -1 : 0);
      this.#scaleBackgroundSize(delta);
    }

    // Resize grid size on ALT
    else if ( event.altKey ) {
      event.preventDefault();
      event.stopPropagation();
      const delta = up.includes(key) ? 1 : (down.includes(key) ? -1 : 0);
      this.#scaleGridSize(delta);
    }

    // Shift grid position
    else if ( !game.keyboard.hasFocus ) {
      event.preventDefault();
      event.stopPropagation();
      if ( up.includes(key) ) this.#shiftBackground({deltaY: -1});
      else if ( down.includes(key) ) this.#shiftBackground({deltaY: 1});
      else if ( left.includes(key) ) this.#shiftBackground({deltaX: -1});
      else if ( right.includes(key) ) this.#shiftBackground({deltaX: 1});
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle mousewheel events.
   * @param {WheelEvent} event    The original wheel event
   */
  #onWheel(event) {
    if ( event.deltaY === 0 ) return;
    const normalizedDelta = -Math.sign(event.deltaY);
    const activeElement = document.activeElement;
    const noShiftAndAlt = !(event.shiftKey || event.altKey);
    const focus = game.keyboard.hasFocus && document.hasFocus;

    // Increase/Decrease the Scene scale
    if ( event.shiftKey || (!event.altKey && focus && activeElement.name === "scale") ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.#scaleBackgroundSize(normalizedDelta);
    }

    // Increase/Decrease the Grid scale
    else if ( event.altKey || (focus && activeElement.name === "grid.size") ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.#scaleGridSize(normalizedDelta);
    }

    // If no shift or alt key are pressed
    else if ( noShiftAndAlt && focus ) {
      // Increase/Decrease the background x offset
      if ( activeElement.name === "background.offsetX" ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.#shiftBackground({deltaX: normalizedDelta});
      }
      // Increase/Decrease the background y offset
      else if ( activeElement.name === "background.offsetY" ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.#shiftBackground({deltaY: normalizedDelta});
      }
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle reset.
   * @this {GridConfig}
   * @type {ApplicationClickAction}
   */
  static async #onResetChanges() {
    if ( !this.#previewScene ) return;
    this.#previewScene = this.document.clone();
    await this.render();
  }

  /* -------------------------------------------- */
  /*  Form Submission                             */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _processFormData(event, form, formData) {
    const submitData = super._processFormData(event, form, formData);
    const bg = foundry.canvas.getTexture(this.#previewScene.background.src);
    const tex = bg ? bg : {width: this.document.width, height: this.document.height};
    submitData.width = tex.width * submitData.scale;
    submitData.height = tex.height * submitData.scale;
    delete submitData.scale;
    return submitData;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _processSubmitData(event, form, submitData, options) {
    const changes = flattenObject(diffObject(this.document._source, submitData));
    const fieldNames = [
      "width",
      "height",
      "padding",
      "background.offsetX",
      "background.offsetY",
      "grid.size",
      "grid.type"
    ];
    const hasChanges = fieldNames.some(k => k in changes);
    const confirmed = hasChanges && await DialogV2.confirm({
      window: {title: "SCENE.DimensionChangeTitle"},
      content: `<p>${game.i18n.localize("SCENE.DimensionChangeWarning")}</p>`
    });
    if ( confirmed ) return super._processSubmitData(event, form, submitData, options);
  }

  /* -------------------------------------------- */
  /*  Previewing and Updating Functions           */
  /* -------------------------------------------- */

  /**
   * Create the preview container.
   */
  async #createPreview() {
    const scene = this.#previewScene;
    if ( !scene ) return;
    if ( this.#previewContainer ) this.#destroyPreviewContainer();
    const container = this.#previewContainer = canvas.stage.addChild(new PIXI.Container());
    container.eventMode = "none";
    const fill = container.addChild(new PIXI.Sprite(PIXI.Texture.WHITE));
    fill.tint = 0x000000;
    fill.eventMode = "static";
    fill.hitArea = canvas.app.screen;
    // Patching updateTransform to render the fill in screen space
    fill.updateTransform = function() {
      const screen = canvas.app.screen;
      this.width = screen.width;
      this.height = screen.height;
      this._boundsID++;
      this.transform.updateTransform(PIXI.Transform.IDENTITY);
      this.worldAlpha = this.alpha;
    };
    this.#background = container.addChild(new PIXI.Sprite());
    this.#background.eventMode = "none";
    if ( scene.background.src ) {
      try {
        this.#background.texture = await foundry.canvas.loadTexture(scene.background.src);
      } catch(error) {
        this.#background.texture = PIXI.Texture.WHITE;
        console.error(error);
      }
    } else {
      this.#background.texture = PIXI.Texture.WHITE;
      this.#background.tint = 0x999999;
    }
    this.#grid = container.addChild(new foundry.canvas.containers.GridMesh().initialize({color: 0xFF0000}));
    this.#refreshPreview();
  }

  /* -------------------------------------------- */

  /**
   * Preview changes to the Scene document as if they were true document updates.
   * @param {object} [change]  A change to preview.
   */
  #previewChanges(change) {
    if ( !this.#previewScene ) return;
    if ( change ) this.#previewScene.updateSource(change);
    this.#refreshPreview();
  }

  /* -------------------------------------------- */

  /**
   * Refresh the preview
   */
  #refreshPreview() {
    if ( !this.#previewScene || (this.#previewContainer?.destroyed !== false) ) return;

    // Update the background image
    const dims = this.#previewScene.dimensions;
    this.#background.position.set(dims.sceneX, dims.sceneY);
    this.#background.width = dims.sceneWidth;
    this.#background.height = dims.sceneHeight;

    // Update the grid
    this.#grid.initialize({
      type: this.#previewScene.grid.type,
      width: dims.width,
      height: dims.height,
      size: dims.size
    });
  }

  /* -------------------------------------------- */

  /**
   * Destroy the preview container.
   */
  #destroyPreviewContainer() {
    if ( this.#previewContainer?.destroyed === false ) this.#previewContainer.destroy({children: true});
    this.#previewContainer = null;
    this.#background = null;
    this.#grid = null;
  }

  /* -------------------------------------------- */

  /**
   * Scale the background size relative to the grid size
   * @param {number} delta          The directional change in background size
   */
  #scaleBackgroundSize(delta) {
    if ( !this.#previewScene?.background.src ) return;
    const input = this.form.elements.scale;
    const rawValue = Number(input.value) || 0;
    const scale = (rawValue + (delta * 0.001)).toNearest(0.001);
    input.value = Math.clamp(scale, 0.25, 10.0);
    input.dispatchEvent(new Event("change", {bubbles: true}));
  }

  /* -------------------------------------------- */

  /**
   * Scale the grid size relative to the background image.
   * When scaling the grid size in this way, constrain the allowed values between the minimum size and 300px.
   * @param {number} delta          The grid size in pixels
   */
  #scaleGridSize(delta) {
    const sizeInput = this.form.elements["grid.size"];
    const gridSize = (Number(sizeInput.value) || 0) + delta;
    sizeInput.value = Math.clamp(gridSize, CONST.GRID_MIN_SIZE, 300);
    sizeInput.dispatchEvent(new Event("change", {bubbles: true}));
  }

  /* -------------------------------------------- */

  /**
   * Shift the background image relative to the grid layer
   * @param {object} position               The position configuration to preview
   * @param {number} [position.deltaX=0]    The number of pixels to shift in the x-direction
   * @param {number} [position.deltaY=0]    The number of pixels to shift in the y-direction
   */
  #shiftBackground({deltaX=0, deltaY=0}) {
    if ( !this.#previewScene?.background.src ) return;
    const oxInput = this.form.elements["background.offsetX"];
    oxInput.value = (Number(oxInput.value) || 0) + deltaX;
    const oyInput = this.form.elements["background.offsetY"];
    oyInput.value = (Number(oyInput.value) || 0) + deltaY;
    oxInput.dispatchEvent(new Event("change", {bubbles: true}));
  }
}

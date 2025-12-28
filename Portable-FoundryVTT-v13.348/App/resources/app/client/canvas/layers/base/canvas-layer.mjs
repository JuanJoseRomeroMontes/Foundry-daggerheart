import MouseInteractionManager from "../../interaction/mouse-handler.mjs";
import Hooks from "@client/helpers/hooks.mjs";

/**
 * An abstract pattern for primary layers of the game canvas to implement.
 * @category Canvas
 * @abstract
 * @interface
 */
export default class CanvasLayer extends PIXI.Container {

  /**
   * Options for this layer instance.
   * @type {{name: string}}
   */
  options = this.constructor.layerOptions;

  // Default interactivity
  interactiveChildren = false;

  /* -------------------------------------------- */
  /*  Layer Attributes                            */
  /* -------------------------------------------- */

  /**
   * Customize behaviors of this CanvasLayer by modifying some behaviors at a class level.
   * @type {{name: string}}
   */
  static get layerOptions() {
    return {
      name: "",
      baseClass: CanvasLayer
    };
  }

  /* -------------------------------------------- */

  /**
   * Return a reference to the active instance of this canvas layer
   * @type {CanvasLayer}
   */
  static get instance() {
    return canvas[this.layerOptions.name];
  }

  /* -------------------------------------------- */

  /**
   * The canonical name of the CanvasLayer is the name of the constructor that is the immediate child of the
   * defined baseClass for the layer type.
   * @type {string}
   *
   * @example
   * canvas.lighting.name -> "LightingLayer"
   */
  get name() {
    const baseCls = this.constructor.layerOptions.baseClass;
    let cls = Object.getPrototypeOf(this.constructor);
    let name = this.constructor.name;
    while ( cls ) {
      if ( cls !== baseCls ) {
        name = cls.name;
        cls = Object.getPrototypeOf(cls);
      }
      else break;
    }
    return name;
  }

  /* -------------------------------------------- */

  /**
   * The name used by hooks to construct their hook string.
   * Note: You should override this getter if hookName should not return the class constructor name.
   * @type {string}
   */
  get hookName() {
    return this.name;
  }

  /* -------------------------------------------- */

  /**
   * An internal reference to a Promise in-progress to draw the CanvasLayer.
   * @type {Promise<CanvasLayer>}
   */
  #drawing = Promise.resolve(this);

  /* -------------------------------------------- */

  /**
   * Is the layer drawn?
   * @type {boolean}
   */
  #drawn = false;


  /* -------------------------------------------- */
  /*  Rendering
  /* -------------------------------------------- */

  /**
   * Draw the canvas layer, rendering its internal components and returning a Promise.
   * The Promise resolves to the drawn layer once its contents are successfully rendered.
   * @param {object} [options]      Options which configure how the layer is drawn
   * @returns {Promise<CanvasLayer>}
   */
  async draw(options={}) {
    return this.#drawing = this.#drawing.finally(async () => {
      console.log(`${CONST.vtt} | Drawing the ${this.constructor.name} canvas layer`);
      await this.tearDown();
      await this._draw(options);
      Hooks.callAll(`draw${this.hookName}`, this);
      this.#drawn = true;
    });
  }

  /**
   * The inner _draw method which must be defined by each CanvasLayer subclass.
   * @param {object} options      Options which configure how the layer is drawn
   * @abstract
   * @protected
   */
  async _draw(options) {
    throw new Error(`The ${this.constructor.name} subclass of CanvasLayer must define the _draw method`);
  }

  /* -------------------------------------------- */

  /**
   * Deconstruct data used in the current layer in preparation to re-draw the canvas
   * @param {object} [options]      Options which configure how the layer is deconstructed
   * @returns {Promise<CanvasLayer>}
   */
  async tearDown(options={}) {
    if ( !this.#drawn ) return this;
    MouseInteractionManager.emulateMoveEvent();
    this.#drawn = false;
    this.renderable = false;
    await this._tearDown(options);
    Hooks.callAll(`tearDown${this.hookName}`, this);
    this.renderable = true;
    MouseInteractionManager.emulateMoveEvent();
    return this;
  }

  /**
   * The inner _tearDown method which may be customized by each CanvasLayer subclass.
   * @param {object} options      Options which configure how the layer is deconstructed
   * @protected
   */
  async _tearDown(options) {
    this.removeChildren().forEach(c => c.destroy({children: true}));
  }
}

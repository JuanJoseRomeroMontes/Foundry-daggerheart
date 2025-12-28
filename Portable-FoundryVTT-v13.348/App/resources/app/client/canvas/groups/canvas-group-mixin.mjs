import CachedContainer from "../containers/advanced/cached-container.mjs";
import MouseInteractionManager from "../interaction/mouse-handler.mjs";
import Hooks from "@client/helpers/hooks.mjs";

/**
 * A mixin which decorates any container with base canvas common properties.
 * @category Mixins
 * @param {typeof Container} ContainerClass  The parent Container class being mixed.
 */
export default function CanvasGroupMixin(ContainerClass) {
  return class CanvasGroup extends ContainerClass {
    constructor(...args) {
      super(...args);
      this.sortableChildren = true;
      this.layers = this._createLayers();
    }

    /**
     * The name of this canvas group.
     * @type {string|undefined}
     * @abstract
     */
    static groupName;

    /**
     * If this canvas group should teardown non-layers children.
     * @type {boolean}
     */
    static tearDownChildren = true;

    /**
     * The canonical name of the canvas group is the name of the constructor that is the immediate child of the
     * defined base class.
     * @type {string}
     */
    get name() {
      let cls = Object.getPrototypeOf(this.constructor);
      let name = this.constructor.name;
      while ( cls ) {
        if ( cls !== CanvasGroup ) {
          name = cls.name;
          cls = Object.getPrototypeOf(cls);
        }
        else break;
      }
      return name;
    }

    /**
     * The name used by hooks to construct their hook string.
     * Note: You should override this getter if hookName should not return the class constructor name.
     * @type {string}
     */
    get hookName() {
      return this.name;
    }

    /**
     * A mapping of CanvasLayer classes which belong to this group.
     * @type {Record<string, CanvasLayer>}
     */
    layers;

    /* -------------------------------------------- */

    /**
     * Create CanvasLayer instances which belong to the canvas group.
     * @protected
     */
    _createLayers() {
      const layers = {};
      for ( const [name, config] of Object.entries(CONFIG.Canvas.layers) ) {
        if ( config.group !== this.constructor.groupName ) continue;
        const layer = layers[name] = new config.layerClass();
        Object.defineProperty(this, name, {value: layer, writable: false});
        if ( !(name in canvas) ) Object.defineProperty(canvas, name, {value: layer, writable: false});
      }
      return layers;
    }

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /**
     * An internal reference to a Promise in-progress to draw the canvas group.
     * @type {Promise<this>}
     */
    #drawing = Promise.resolve(this);

    /* -------------------------------------------- */

    /**
     * Is the group drawn?
     * @type {boolean}
     */
    #drawn = false;

    /* -------------------------------------------- */

    /**
     * Draw the canvas group and all its components.
     * @param {object} [options={}]
     * @returns {Promise<this>}     A Promise which resolves once the group is fully drawn
     */
    async draw(options={}) {
      return this.#drawing = this.#drawing.finally(async () => {
        console.log(`${CONST.vtt} | Drawing the ${this.hookName} canvas group`);
        await this.tearDown();
        await this._draw(options);
        Hooks.callAll(`draw${this.hookName}`, this);
        this.#drawn = true;
        MouseInteractionManager.emulateMoveEvent();
      });
    }

    /**
     * Draw the canvas group and all its component layers.
     * @param {object} options
     * @protected
     */
    async _draw(options) {
      // Draw CanvasLayer instances
      for ( const layer of Object.values(this.layers) ) {
        this.addChild(layer);
        await layer.draw();
      }
    }

    /* -------------------------------------------- */
    /*  Tear-Down                                   */
    /* -------------------------------------------- */

    /**
     * Remove and destroy all layers from the base canvas.
     * @param {object} [options={}]
     * @returns {Promise<this>}
     */
    async tearDown(options={}) {
      if ( !this.#drawn ) return this;
      this.#drawn = false;
      await this._tearDown(options);
      Hooks.callAll(`tearDown${this.hookName}`, this);
      MouseInteractionManager.emulateMoveEvent();
      return this;
    }

    /**
     * Remove and destroy all layers from the base canvas.
     * @param {object} options
     * @protected
     */
    async _tearDown(options) {
      // Remove layers
      for ( const layer of Object.values(this.layers).reverse() ) {
        await layer.tearDown();
        this.removeChild(layer);
      }

      // Check if we need to handle other children
      if ( !this.constructor.tearDownChildren ) return;

      // Yes? Then proceed with children cleaning
      for ( const child of this.removeChildren() ) {
        if ( child instanceof CachedContainer ) child.clear();
        else child.destroy({children: true});
      }
    }
  };
}

/* -------------------------------------------- */
/*  Deprecations and Compatibility              */
/* -------------------------------------------- */

/**
 * @deprecated since v12
 * @ignore
 */
Object.defineProperty(globalThis, "BaseCanvasMixin", {
  get() {
    const msg = "BaseCanvasMixin is deprecated in favor of foundry.canvas.containers.CanvasGroupMixin";
    foundry.utils.logCompatibilityWarning(msg, {since: 12, until: 14});
    return CanvasGroupMixin;
  }
});

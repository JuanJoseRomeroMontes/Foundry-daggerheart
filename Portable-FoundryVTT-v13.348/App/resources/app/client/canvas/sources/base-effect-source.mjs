/**
 * @import Collection from "@common/utils/collection.mjs"
 * @import {ElevatedPoint} from "../../_types.mjs"
 * @import PlaceableObject from "../placeables/placeable-object.mjs"
 */


/**
 * @typedef BaseEffectSourceOptions
 * @property {PlaceableObject} [object] An optional PlaceableObject which is responsible for this source
 * @property {string} [sourceId]        A unique ID for this source. This will be set automatically if an
 *                                      object is provided, otherwise is required.
 */

/**
 * @typedef BaseEffectSourceData
 * @property {number} x                   The x-coordinate of the source location
 * @property {number} y                   The y-coordinate of the source location
 * @property {number} elevation           The elevation of the point source
 * @property {boolean} disabled           Whether or not the source is disabled
 */

/**
 * TODO - Re-document after ESM refactor.
 * An abstract base class which defines a framework for effect sources which originate radially from a specific point.
 * This abstraction is used by the LightSource, VisionSource, SoundSource, and MovementSource subclasses.
 *
 * @example A standard PointSource lifecycle:
 * ```js
 * const source = new PointSource({object}); // Create the point source
 * source.initialize(data);                  // Configure the point source with new data
 * source.refresh();                         // Refresh the point source
 * source.destroy();                         // Destroy the point source
 * ```
 *
 * @template {BaseEffectSourceData} [TSourceData=BaseEffectSourceData]
 * @template {PIXI.Polygon} [TSourceShape=PIXI.Polygon]
 * @abstract
 */
export default class BaseEffectSource {
  /**
   * An effect source is constructed by providing configuration options.
   * @param {BaseEffectSourceOptions} [options]  Options which modify the base effect source instance
   */
  constructor(options={}) {
    this.object = options.object ?? null;
    this.sourceId = options.sourceId;
  }

  /**
   * The type of source represented by this data structure.
   * Each subclass must implement this attribute.
   * @type {string}
   */
  static sourceType;

  /**
   * The target collection into the effects canvas group.
   * @type {string}
   * @abstract
   */
  static effectsCollection;

  /**
   * Effect source default data.
   * @type {BaseEffectSourceData}
   */
  static defaultData = {
    x: 0,
    y: 0,
    elevation: 0,
    disabled: false
  };

  /* -------------------------------------------- */
  /*  Source Data                                 */
  /* -------------------------------------------- */

  /**
   * Some other object which is responsible for this source.
   * @type {object|null}
   */
  object;

  /**
   * The source id linked to this effect source.
   * @type {Readonly<string>}
   */
  sourceId;

  /**
   * The data of this source.
   * @type {TSourceData}
   */
  data = foundry.utils.deepClone(this.constructor.defaultData);

  /**
   * The geometric shape of the effect source which is generated later.
   * @type {TSourceShape}
   */
  shape;

  /**
   * A collection of boolean flags which control rendering and refresh behavior for the source.
   * @type {Record<string, boolean|number>}
   * @protected
   */
  _flags = {};

  /**
   * The x-coordinate of the point source origin.
   * @type {number}
   */
  get x() {
    return this.data.x;
  }

  /**
   * The y-coordinate of the point source origin.
   * @type {number}
   */
  get y() {
    return this.data.y;
  }

  /**
   * The elevation bound to this source.
   * @type {number}
   */
  get elevation() {
    return this.data.elevation;
  }

  /* -------------------------------------------- */
  /*  Source State                                */
  /* -------------------------------------------- */

  /**
   * The EffectsCanvasGroup collection linked to this effect source.
   * @type {Collection<string, BaseEffectSource>}
   */
  get effectsCollection() {
    return canvas.effects[this.constructor.effectsCollection];
  }

  /**
   * Returns the update ID associated with this source.
   * The update ID is increased whenever the shape of the source changes.
   * @type {number}
   */
  get updateId() {
    return this.#updateId;
  }

  #updateId = 0;

  /**
   * Is this source currently active?
   * A source is active if it is attached to an effect collection and is not disabled or suppressed.
   * @type {boolean}
   */
  get active() {
    return this.#attached && !this.data.disabled && !this.suppressed;
  }

  /**
   * Is this source attached to an effect collection?
   * @type {boolean}
   */
  get attached() {
    return this.#attached;
  }

  #attached = false;

  /* -------------------------------------------- */
  /*  Source Suppression Management               */
  /* -------------------------------------------- */

  /**
   * Is this source temporarily suppressed?
   * @type {boolean}
   */
  get suppressed() {
    return Object.values(this.suppression).includes(true);
  }

  /**
   * Records of suppression strings with a boolean value.
   * If any of this record is true, the source is suppressed.
   * @type {Record<string, boolean>}
   */
  suppression = {};

  /* -------------------------------------------- */
  /*  Source Initialization                       */
  /* -------------------------------------------- */

  /**
   * Initialize and configure the source using provided data.
   * @param {Partial<TSourceData>} data        Provided data for configuration
   * @param {object} options                  Additional options which modify source initialization
   * @param {boolean} [options.reset=false]   Should source data be reset to default values before applying changes?
   * @returns {BaseEffectSource}              The initialized source
   */
  initialize(data={}, {reset=false}={}) {
    // Reset the source back to default data
    if ( reset ) data = Object.assign(foundry.utils.deepClone(this.constructor.defaultData), data);

    // Update data for the source
    let changes = {};
    if ( !foundry.utils.isEmpty(data) ) {
      const prior = foundry.utils.deepClone(this.data) || {};
      for ( const key in data ) {
        if ( !(key in this.data) ) continue;
        this.data[key] = data[key] ?? this.constructor.defaultData[key];
      }
      this._initialize(data);
      changes = foundry.utils.flattenObject(foundry.utils.diffObject(prior, this.data));
    }

    // Update shapes for the source
    try {
      this._createShapes();
      this.#updateId++;
    }
    catch (err) {
      console.error(err);
      this.remove();
    }

    // Configure attached and non disabled sources
    if ( this.#attached && !this.data.disabled ) this._configure(changes);
    return this;
  }

  /* -------------------------------------------- */

  /**
   * Subclass specific data initialization steps.
   * @param {Partial<TSourceData>} data    Provided data for configuration
   * @abstract
   */
  _initialize(data) {}

  /* -------------------------------------------- */

  /**
   * Create the polygon shape (or shapes) for this source using configured data.
   * @protected
   * @abstract
   */
  _createShapes() {}

  /* -------------------------------------------- */

  /**
   * Subclass specific configuration steps. Occurs after data initialization and shape computation.
   * Only called if the source is attached and not disabled.
   * @param {Partial<TSourceData>} changes   Changes to the source data which were applied
   * @protected
   */
  _configure(changes) {}

  /* -------------------------------------------- */
  /*  Source Refresh                              */
  /* -------------------------------------------- */

  /**
   * Refresh the state and uniforms of the source.
   * Only active sources are refreshed.
   */
  refresh() {
    if ( !this.active ) return;
    this._refresh();
  }

  /* -------------------------------------------- */

  /**
   * Subclass-specific refresh steps.
   * @protected
   * @abstract
   */
  _refresh() {}

  /* -------------------------------------------- */
  /*  Source Destruction                          */
  /* -------------------------------------------- */

  /**
   * Steps that must be performed when the source is destroyed.
   */
  destroy() {
    this.remove();
    this._destroy();
  }

  /* -------------------------------------------- */

  /**
   * Subclass specific destruction steps.
   * @protected
   */
  _destroy() {}

  /* -------------------------------------------- */
  /*  Source Management                           */
  /* -------------------------------------------- */

  /**
   * Add this BaseEffectSource instance to the active collection.
   */
  add() {
    if ( !this.sourceId ) throw new Error("A BaseEffectSource cannot be added to the active collection unless it has"
      + " a sourceId assigned.");
    this.effectsCollection.set(this.sourceId, this);
    const wasConfigured = this.#attached && !this.data.disabled;
    this.#attached = true;
    if ( !wasConfigured && !this.data.disabled ) this._configure({});
  }

  /* -------------------------------------------- */

  /**
   * Remove this BaseEffectSource instance from the active collection.
   */
  remove() {
    if ( !this.effectsCollection.has(this.sourceId) ) return;
    this.effectsCollection.delete(this.sourceId);
    this.#attached = false;
  }

  /* -------------------------------------------- */
  /*  Visibility Testing                          */
  /* -------------------------------------------- */

  /**
   * Test whether the point is contained within the shape of the source.
   * @param {ElevatedPoint} point   The point.
   * @returns {boolean}             Is inside the source?
   */
  testPoint(point) {
    if ( !this.shape ) return false;
    return this.shape.contains(point.x, point.y);
  }
}

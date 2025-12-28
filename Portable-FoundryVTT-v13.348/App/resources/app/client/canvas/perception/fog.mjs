import SpriteMesh from "../containers/elements/sprite-mesh.mjs";
import TextureExtractor from "../texture-extractor.mjs";
import Canvas from "../board.mjs";
import FogSamplerShader from "../rendering/shaders/samplers/fog-of-war.mjs";
import EventEmitterMixin from "@common/utils/event-emitter.mjs";
import {getDocumentClass} from "../../utils/helpers.mjs";

/**
 * @import Semaphore from "@common/utils/semaphore.mjs";
 * @import {CanvasVisibilityTextureConfiguration, FogExplorationData, Point} from "../../_types.mjs";
 * @import FogExploration from "../../documents/fog-exploration.mjs";
 */

/**
 * A fog of war management class which is the singleton canvas.fog instance.
 * @category Canvas
 * @see {EventEmitterMixin}
 */
export default class FogManager extends EventEmitterMixin() {
  /** @override */
  static emittedEvents = Object.freeze(["explored"]);

  /**
   * The FogExploration document which applies to this canvas view
   * @type {FogExploration|null}
   */
  exploration = null;

  /**
   * A status flag for whether the layer initialization workflow has succeeded
   * @type {boolean}
   */
  #initialized = false;

  /**
   * Track whether we have pending fog updates which have not yet been saved to the database
   * @type {boolean}
   * @internal
   */
  _updated = false;

  /**
   * Texture extractor
   * @type {TextureExtractor}
   */
  get extractor() {
    return this.#extractor;
  }

  #extractor;

  /**
   * The fog refresh count.
   * If > to the refresh threshold, the fog texture is saved to database. It is then reinitialized to 0.
   * @type {number}
   */
  #refreshCount = 0;

  /**
   * Matrix used for fog rendering transformation.
   * @type {PIXI.Matrix}
   */
  #renderTransform = new PIXI.Matrix();

  /**
   * Define the number of fog refresh needed before the fog texture is extracted and pushed to the server.
   * @type {number}
   */
  static COMMIT_THRESHOLD = 70;

  /**
   * A debounced function to save fog of war exploration once a continuous stream of updates has concluded.
   * @type {Function}
   */
  #debouncedSave;

  /**
   * Handling of the concurrency for fog loading, saving and reset.
   * @type {Semaphore}
   */
  #queue = new foundry.utils.Semaphore();

  /**
   * The explored data.
   * @type {{
   *   pixels: Uint8ClampedArray,
   *   width: number,
   *   height: number,
   *   offset: number,
   *   stride: number,
   *   buffer: ArrayBuffer,
   *   extracting: boolean
   * }}
   */
  #explored = {
    pixels: new Uint8ClampedArray(0),
    width: 0,
    height: 0,
    offset: 0,
    stride: 1,
    buffer: new ArrayBuffer(0),
    extracting: false
  };

  /* -------------------------------------------- */
  /*  Fog Manager Properties                      */
  /* -------------------------------------------- */

  /**
   * The exploration SpriteMesh which holds the fog exploration texture.
   * @type {SpriteMesh}
   */
  get sprite() {
    return this.#explorationSprite || (this.#explorationSprite = this._createExplorationObject());
  }

  #explorationSprite;

  /* -------------------------------------------- */

  /**
   * The configured options used for the saved fog-of-war texture.
   * @type {CanvasVisibilityTextureConfiguration}
   */
  get textureConfiguration() {
    return canvas.visibility.textureConfiguration;
  }

  /* -------------------------------------------- */

  /**
   * Does the currently viewed Scene support Token field of vision?
   * @type {boolean}
   */
  get tokenVision() {
    return canvas.scene.tokenVision;
  }

  /* -------------------------------------------- */

  /**
   * Does the currently viewed Scene support fog of war exploration?
   * @type {boolean}
   */
  get fogExploration() {
    return canvas.scene.fog.exploration;
  }

  /* -------------------------------------------- */

  /**
   * Is this position explored?
   * @param {Point} position      The position to be tested
   * @returns {boolean}           Is this position explored?
   */
  isPointExplored({x, y}) {
    if ( !this.#initialized ) return false;
    if ( !this.tokenVision ) return true;
    x = (x - this.#explorationSprite.x) / this.#explorationSprite.width;
    y = (y - this.#explorationSprite.y) / this.#explorationSprite.height;
    if ( (x < 0) || (x >= 1) || (y < 0) || (y >= 1) ) return false;
    const {pixels, width, height, offset, stride} = this.#explored;
    const x1 = (x * width) | 0;
    const x0 = x1 > 0 ? x1 - 1 : 0;
    const x2 = x1 < width ? x1 + 2 : width;
    const y1 = (y * height) | 0;
    const y0 = y1 > 0 ? y1 - 1 : 0;
    const y2 = y1 < height ? y1 + 2 : height;
    for ( let y = y0; y < y2; y++ ) {
      const k = y * width;
      for ( let x = x0; x < x2; x++ ) {
        if ( pixels[((k + x) * stride) + offset] !== 0 ) return true;
      }
    }
    return false;
  }

  /* -------------------------------------------- */
  /*  Fog of War Management                       */
  /* -------------------------------------------- */

  /**
   * Extract the pixels from the fog texture.
   * @returns {Promise<void>}
   */
  async #extractPixels() {
    if ( !this.#extractor ) return;
    const texture = this.#explorationSprite?.texture;
    if ( !texture?.valid ) return;
    if ( this.#explored.extracting ) {
      this.#throttleExtractPixels();
      return;
    }
    this.#explored.extracting = true;
    const {realWidth, realHeight} = texture.baseTexture;
    const size = this.#extractor.format === PIXI.FORMATS.RED ? 1 : 4;
    const minBufferSize = realWidth * realHeight * size;
    if ( this.#explored.buffer.byteLength < minBufferSize ) {
      this.#explored.buffer = new ArrayBuffer(minBufferSize);
    }
    try {
      const {pixels, width, height, out} = await this.#extractor.extract(
        {texture, compression: TextureExtractor.COMPRESSION_MODES.NONE, out: this.#explored.buffer});
      this.#explored.extracting = false;

      // Only update explored data only if no new fog has been loaded
      if ( pixels && (this.#explorationSprite?.texture === texture) ) {
        this.#explored.buffer = this.#explored.pixels.buffer; // Swap buffers
        this.#explored.pixels = pixels;
        this.#explored.width = width;
        this.#explored.height = height;
        this.#explored.offset = size - 1;
        this.#explored.stride = size;
        this.#onExploredChanged();
      } else {
        this.#explored.buffer = out;
      }
    } catch(err) {
      this.#explored.extracting = false;
      // FIXME this is needed because for some reason .extract() may throw a boolean false instead of an Error
      throw new Error("Fog of War pixels extraction failed", {cause: err});
    }
  }

  /**
   * A throttled function that extract pixels from the fog texture.
   * @type {function()}
   */
  #throttleExtractPixels = foundry.utils.throttle(this.#extractPixels.bind(this), 500);

  /* -------------------------------------------- */

  /**
   * Called when the explored data changed.
   */
  #onExploredChanged() {
    if ( CONFIG.debug.fog.manager ) console.debug("FogManager | Explored area changed.");
    this.dispatchEvent(new Event("explored"));
  }

  /* -------------------------------------------- */

  /**
   * Create the exploration display object with or without a provided texture.
   * @param {PIXI.Texture|PIXI.RenderTexture} [tex] Optional exploration texture.
   * @returns {SpriteMesh}
   * @internal
   */
  _createExplorationObject(tex) {
    return new SpriteMesh(tex ?? Canvas.getRenderTexture({
      clearColor: [0, 0, 0, 1],
      textureConfiguration: this.textureConfiguration
    }), FogSamplerShader);
  }

  /* -------------------------------------------- */

  /**
   * Initialize fog of war - resetting it when switching scenes or re-drawing the canvas
   * @returns {Promise<void>}
   */
  async initialize() {
    this.#initialized = false;

    // Create a TextureExtractor instance
    if ( this.#extractor === undefined ) {
      try {
        this.#extractor = new TextureExtractor(canvas.app.renderer, {
          callerName: "FogExtractor",
          controlHash: true,
          format: this.textureConfiguration?.format ?? PIXI.FORMATS.RED
        });
        this.#extractor.debug = CONFIG.debug.fog.extractor;
      } catch(e) {
        this.#extractor = null;
        console.error(e);
      }
    }
    this.#extractor?.reset();

    // Bind a debounced save handler
    this.#debouncedSave = foundry.utils.debounce(this.save.bind(this), 2000);

    // Load the initial fog texture
    await this.load();
    this.#initialized = true;
  }

  /* -------------------------------------------- */

  /**
   * Clear the fog and reinitialize properties (commit and save in non reset mode)
   * @returns {Promise<void>}
   */
  async clear() {
    // Save any pending exploration
    try {
      await this.save();
    } catch(e) {
      ui.notifications.error("Failed to save fog exploration");
      console.error(e);
    }

    // Deactivate current fog exploration
    this.#initialized = false;
    this.#deactivate();
  }

  /* -------------------------------------------- */

  /**
   * Destroy this FogManager.
   */
  destroy() {
    this.exploration = null;
    this.#initialized = false;
    this.#extractor?.destroy();
    this.#extractor = undefined;
    this._updated = false;
    if ( this.#explorationSprite && !this.#explorationSprite.destroyed ) this.#explorationSprite.destroy(true);
    this.#explorationSprite = undefined;
  }

  /* -------------------------------------------- */

  /**
   * Once a new Fog of War location is explored, composite the explored container with the current staging sprite.
   * Once the number of refresh is > to the commit threshold, save the fog texture to the database.
   */
  commit() {
    const vision = canvas.visibility.vision;
    if ( !vision?.children.length || !this.fogExploration || !this.tokenVision ) return;
    if ( !this.#explorationSprite?.texture.valid ) return;

    // Get a staging texture or clear and render into the sprite if its texture is a RT
    // and render the entire fog container to it
    const dims = canvas.dimensions;
    const isRenderTex = this.#explorationSprite.texture instanceof PIXI.RenderTexture;
    const tex = isRenderTex ? this.#explorationSprite.texture : Canvas.getRenderTexture({
      clearColor: [0, 0, 0, 1],
      textureConfiguration: this.textureConfiguration
    });
    this.#renderTransform.tx = -dims.sceneX;
    this.#renderTransform.ty = -dims.sceneY;

    // Render the currently revealed vision (preview excluded) to the texture
    vision.containmentFilter.enabled = canvas.visibility.needsContainment;
    vision.light.preview.visible = false;
    vision.light.mask.preview.visible = false;
    vision.sight.preview.visible = false;
    canvas.app.renderer.render(isRenderTex ? vision : this.#explorationSprite, {
      renderTexture: tex,
      clear: false,
      transform: this.#renderTransform
    });
    vision.light.preview.visible = true;
    vision.light.mask.preview.visible = true;
    vision.sight.preview.visible = true;
    vision.containmentFilter.enabled = false;

    if ( !isRenderTex ) this.#explorationSprite.texture.destroy(true);
    this.#explorationSprite.texture = tex;
    this._updated = true;

    this.#throttleExtractPixels();

    if ( !this.exploration ) {
      const fogExplorationCls = getDocumentClass("FogExploration");
      this.exploration = new fogExplorationCls();
    }

    // Schedule saving the texture to the database
    if ( this.#refreshCount > FogManager.COMMIT_THRESHOLD ) {
      this.#debouncedSave();
      this.#refreshCount = 0;
    }
    else this.#refreshCount++;
  }

  /* -------------------------------------------- */

  /**
   * Load existing fog of war data from local storage and populate the initial exploration sprite
   * @returns {Promise<PIXI.Texture|void>}
   */
  async load() {
    return this.#queue.add(this.#load.bind(this));
  }

  /* -------------------------------------------- */

  /**
   * Load existing fog of war data from local storage and populate the initial exploration sprite
   * @returns {Promise<PIXI.Texture|void>}
   */
  async #load() {
    if ( CONFIG.debug.fog.manager ) console.debug("FogManager | Loading saved FogExploration for Scene.");

    this.#deactivate();

    // Take no further action if token vision is not enabled
    if ( !this.tokenVision ) return;

    // Load existing FOW exploration data or create a new placeholder
    const fogExplorationCls = /** @type {typeof FogExploration} */ getDocumentClass("FogExploration");
    this.exploration = await fogExplorationCls.load();

    // Extract and assign the fog data image
    const assign = async (tex, resolve) => {
      if ( this.#explorationSprite?.texture === tex ) return resolve(tex);
      this.#explorationSprite?.destroy(true);
      this.#explorationSprite = this._createExplorationObject(tex);
      canvas.visibility.resetExploration();
      canvas.perception.initialize();
      await this.#extractPixels();
      resolve(tex);
    };

    // Initialize the exploration sprite if no exploration data exists
    if ( !this.exploration ) {
      return new Promise(resolve => {
        assign(Canvas.getRenderTexture({
          clearColor: [0, 0, 0, 1],
          textureConfiguration: this.textureConfiguration
        }), resolve);
      });
    }
    // Otherwise load the texture from the exploration data
    return new Promise(resolve => {
      const tex = this.exploration.getTexture();
      if ( tex === null ) assign(Canvas.getRenderTexture({
        clearColor: [0, 0, 0, 1],
        textureConfiguration: this.textureConfiguration
      }), resolve);
      else if ( tex.baseTexture.valid ) assign(tex, resolve);
      else tex.on("update", tex => assign(tex, resolve));
    });
  }

  /* -------------------------------------------- */

  /**
   * Dispatch a request to reset the fog of war exploration status for all users within this Scene.
   * Once the server has deleted existing FogExploration documents, the _onReset handler will re-draw the canvas.
   * @returns {Promise<void>}
   */
  async reset() {
    if ( CONFIG.debug.fog.manager ) console.debug("FogManager | Resetting fog of war exploration for Scene.");
    game.socket.emit("resetFog", canvas.scene.id);
  }

  /* -------------------------------------------- */

  /**
   * Request a fog of war save operation.
   * Note: if a save operation is pending, we're waiting for its conclusion.
   * @returns {Promise<void>}
   */
  async save() {
    return this.#queue.add(this.#save.bind(this));
  }

  /* -------------------------------------------- */

  /**
   * Request a fog of war save operation.
   * Note: if a save operation is pending, we're waiting for its conclusion.
   * @returns {Promise<void>}
   */
  async #save() {
    if ( !this._updated ) return;
    this._updated = false;
    const exploration = this.exploration;
    if ( CONFIG.debug.fog.manager ) {
      console.debug("FogManager | Initiate non-blocking extraction of the fog of war progress.");
    }
    if ( !this.#extractor ) {
      console.error("FogManager | Browser does not support texture extraction.");
      return;
    }

    // Get compressed base64 image from the fog texture
    this.#extractor.debug = CONFIG.debug.fog.extractor;
    const base64Image = await this._extractBase64();

    // If the exploration changed, the fog was reloaded while the pixels were extracted
    if ( this.exploration !== exploration ) return;

    // Need to skip?
    if ( !base64Image ) {
      if ( CONFIG.debug.fog.manager ) console.debug("FogManager | Fog of war has not changed. Skipping db operation.");
      return;
    }

    // Update the fog exploration document
    const updateData = this._prepareFogUpdateData(base64Image);
    await this.#updateFogExploration(updateData);
  }

  /* -------------------------------------------- */

  /**
   * Synchronize one user's version of the Fog of War for this scene to other users.
   * Note: This API is experimental and may be removed in later versions *without deprecation*. It is intended for
   * one-time corrections of users' fog explorations, and should not be used for real-time synchronization of fog
   * exploration.
   * @param {User} from        The user whose Fog of War to use as the source of truth.
   * @param {User[]} [to]      A list of users that should have their Fog of War synced. If none are specified then all
   *                           users will be synced.
   * @returns {Promise<void>}  A promise that resolves when synchronization has been completed.
   */
  async sync(from, to) {
    if ( !game.user.isGM ) throw new Error("Only GMs may synchronize Fog of War.");
    if ( !(from instanceof foundry.documents.User) ) throw new Error("Required User to sync from.");
    to = to?.map(u => {
      if ( !(u instanceof foundry.documents.User) ) throw new Error("Required User to sync to.");
      return u.id;
    });
    return new Promise((resolve, reject) => {
      game.socket.emit("syncFog", canvas.scene.id, from.id, { to }, result => {
        if ( result?.error ) reject(new Error(result.error));
        else resolve();
      });
    });
  }

  /* -------------------------------------------- */

  /**
   * Extract fog data as a base64 string
   * @returns {Promise<string>}
   * @protected
   */
  async _extractBase64() {
    try {
      return this.#extractor.extract({
        texture: this.#explorationSprite.texture,
        compression: TextureExtractor.COMPRESSION_MODES.BASE64,
        // TODO Allow for subclasses to change the extracted filetype without needing to override this method
        type: "image/webp",
        quality: 0.8
      });
    } catch(err) {
      // FIXME this is needed because for some reason .extract() may throw a boolean false instead of an Error
      throw new Error("Fog of War base64 extraction failed", {cause: err});
    }
  }

  /* -------------------------------------------- */

  /**
   * Prepare the data that will be used to update the FogExploration document.
   * @param {string} base64Image              The extracted base64 image data
   * @returns {Partial<FogExplorationData>}   Exploration data to update
   * @protected
   */
  _prepareFogUpdateData(base64Image) {
    return {explored: base64Image, timestamp: Date.now()};
  }

  /* -------------------------------------------- */

  /**
   * Update the fog exploration document with provided data.
   * @param {object} updateData
   * @returns {Promise<void>}
   */
  async #updateFogExploration(updateData) {
    if ( !game.scenes.has(canvas.scene?.id) ) return;
    if ( !this.exploration ) return;
    if ( CONFIG.debug.fog.manager ) console.debug("FogManager | Saving fog of war progress into exploration document.");
    if ( !this.exploration.id ) {
      this.exploration.updateSource(updateData);
      this.exploration = await this.exploration.constructor.create(this.exploration.toJSON(), {loadFog: false});
    }
    else await this.exploration.update(updateData, {loadFog: false});
  }

  /* -------------------------------------------- */

  /**
   * Deactivate fog of war.
   * Clear all shared containers by unlinking them from their parent.
   * Destroy all stored textures and graphics.
   */
  #deactivate() {
    // Remove the current exploration document
    this.exploration = null;
    this.#extractor?.reset();

    // Destroy current exploration texture and provide a new one with transparency
    if ( this.#explorationSprite && !this.#explorationSprite.destroyed ) this.#explorationSprite.destroy(true);
    this.#explorationSprite = undefined;

    this._updated = false;
    this.#refreshCount = 0;

    // Reset explored data
    if ( this.#explored.pixels.length !== 0 ) {
      this.#explored.pixels = new Uint8ClampedArray(0);
      this.#explored.width = 0;
      this.#explored.height = 0;
      this.#explored.offset = 0;
      this.#explored.stride = 1;
      this.#explored.buffer = new ArrayBuffer(0);
      this.#explored.extracting = false;
      this.#onExploredChanged();
    }
  }

  /* -------------------------------------------- */

  /**
   * If fog of war data is reset from the server, deactivate the current fog and initialize the exploration.
   * @returns {Promise<void>}
   * @internal
   */
  async _handleReset() {
    return this.#queue.add(this.#handleReset.bind(this));
  }

  /* -------------------------------------------- */

  /**
   * If fog of war data is reset from the server, deactivate the current fog and initialize the exploration.
   * @returns {Promise<void>}
   */
  async #handleReset() {
    ui.notifications.info("Fog of War exploration progress was reset for this Scene");

    // Remove the current exploration document
    this.#deactivate();

    // Reset exploration in the visibility layer
    canvas.visibility.resetExploration();

    // Refresh perception
    canvas.perception.initialize();
  }
}

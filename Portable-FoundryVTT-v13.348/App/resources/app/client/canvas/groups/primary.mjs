import {CanvasQuadtree} from "../geometry/quad-tree.mjs";
import {getTexture} from "../loader.mjs";
import CanvasGroupMixin from "./canvas-group-mixin.mjs";
import CachedContainer from "../containers/advanced/cached-container.mjs";
import SpriteMesh from "../containers/elements/sprite-mesh.mjs";
import PrimarySpriteMesh from "../primary/primary-sprite-mesh.mjs";
import PrimaryGraphics from "../primary/primary-graphics.mjs";
import BaseSamplerShader from "../rendering/shaders/samplers/base-sampler.mjs";
import PrimaryCanvasGroupAmbienceFilter from "../rendering/filters/environment.mjs";
import Canvas from "../board.mjs";

/**
 * The primary Canvas group which generally contains tangible physical objects which exist within the Scene.
 * This group is a {@link foundry.canvas.containers.CachedContainer}
 * which is rendered to the Scene as a {@link foundry.canvas.containers.SpriteMesh}.
 * This allows the rendered result of the Primary Canvas Group to be affected by a
 * {@link foundry.canvas.rendering.shaders.BaseSamplerShader}.
 * @extends {CachedContainer}
 * @mixes CanvasGroupMixin
 * @category Canvas
 */
export default class PrimaryCanvasGroup extends CanvasGroupMixin(CachedContainer) {
  constructor(sprite) {
    sprite ||= new SpriteMesh(undefined, BaseSamplerShader);
    super(sprite);
    this.eventMode = "none";
    this.#createAmbienceFilter();
    this.on("childAdded", this.#onChildAdded);
    this.on("childRemoved", this.#onChildRemoved);
    canvas.registerMouseMoveHandler(this._onMouseMove, Canvas.MOUSE_MOVE_HANDLER_PRIORITIES.LOW, this);
  }

  /**
   * Sort order to break ties on the group/layer level.
   * @enum {number}
   */
  static SORT_LAYERS = Object.freeze({
    SCENE: 0,
    TILES: 500,
    DRAWINGS: 600,
    TOKENS: 700,
    WEATHER: 1000
  });

  /** @override */
  static groupName = "primary";

  /** @override */
  static textureConfiguration = {
    scaleMode: PIXI.SCALE_MODES.NEAREST,
    format: PIXI.FORMATS.RGB,
    multisample: PIXI.MSAA_QUALITY.NONE
  };

  /** @override */
  clearColor = [0, 0, 0, 0];

  /**
   * The background color in RGB.
   * @type {[red: number, green: number, blue: number]}
   * @internal
   */
  _backgroundColor;

  /**
   * Track the set of HTMLVideoElements which are currently playing as part of this group.
   * @type {Set<PrimarySpriteMesh>}
   */
  videoMeshes = new Set();

  /**
   * Occludable objects above this elevation are faded on hover.
   * @type {number}
   */
  hoverFadeElevation = 0;

  /**
   * Allow API users to override the default elevation of the background layer.
   * This is a temporary solution until more formal support for scene levels is added in a future release.
   * @type {number}
   */
  static BACKGROUND_ELEVATION = 0;

  /* -------------------------------------------- */
  /*  Group Attributes                            */
  /* -------------------------------------------- */

  /**
   * The primary background image configured for the Scene, rendered as a SpriteMesh.
   * @type {PrimarySpriteMesh}
   */
  background;

  /**
   * The primary foreground image configured for the Scene, rendered as a SpriteMesh.
   * @type {PrimarySpriteMesh}
   */
  foreground;

  /**
   * A Quadtree which partitions and organizes primary canvas objects.
   * @type {CanvasQuadtree}
   */
  quadtree = new CanvasQuadtree();

  /**
   * The collection of PrimaryDrawingContainer objects which are rendered in the Scene.
   * @type {Collection<string, PrimaryGraphics>}
   */
  drawings = new foundry.utils.Collection();

  /**
   * The collection of SpriteMesh objects which are rendered in the Scene.
   * @type {Collection<string, PrimarySpriteMesh>}
   */
  tokens = new foundry.utils.Collection();

  /**
   * The collection of SpriteMesh objects which are rendered in the Scene.
   * @type {Collection<string, PrimarySpriteMesh>}
   */
  tiles = new foundry.utils.Collection();

  /**
   * The ambience filter which is applying post-processing effects.
   * @type {PrimaryCanvasGroupAmbienceFilter}
   * @internal
   */
  _ambienceFilter;

  /**
   * The objects that are currently hovered in reverse sort order.
   * @type {PrimaryCanvasObjec[]>}
   */
  #hoveredObjects = [];

  /**
   * Trace the tiling sprite error to avoid multiple warning.
   * FIXME: Remove when the deprecation period for the tiling sprite error is over.
   * @type {boolean}
   * @internal
   */
  #tilingSpriteError = false;

  /* -------------------------------------------- */
  /*  Group Properties                            */
  /* -------------------------------------------- */

  /**
   * Return the base HTML image or video element which provides the background texture.
   * @type {HTMLImageElement|HTMLVideoElement|null}
   */
  get backgroundSource() {
    if ( !this.background.texture.valid || this.background.texture === PIXI.Texture.WHITE ) return null;
    return this.background.texture.baseTexture.resource.source;
  }

  /* -------------------------------------------- */

  /**
   * Return the base HTML image or video element which provides the foreground texture.
   * @type {HTMLImageElement|HTMLVideoElement|null}
   */
  get foregroundSource() {
    if ( !this.foreground.texture.valid ) return null;
    return this.foreground.texture.baseTexture.resource.source;
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /**
   * Create the ambience filter bound to the primary group.
   */
  #createAmbienceFilter() {
    if ( this._ambienceFilter ) this._ambienceFilter.enabled = false;
    else {
      this.filters ??= [];
      const f = this._ambienceFilter = PrimaryCanvasGroupAmbienceFilter.create();
      f.enabled = false;
      this.filterArea = canvas.app.renderer.screen;
      this.filters.push(f);
    }
  }

  /* -------------------------------------------- */

  /**
   * Refresh the primary mesh.
   */
  refreshPrimarySpriteMesh() {
    const singleSource = canvas.visibility.visionModeData.source;
    const vmOptions = singleSource?.visionMode.canvas;
    const isBaseSampler = (this.sprite.shader.constructor === BaseSamplerShader);
    if ( !vmOptions && isBaseSampler ) return;

    // Update the primary sprite shader class (or reset to BaseSamplerShader)
    this.sprite.setShaderClass(vmOptions?.shader ?? BaseSamplerShader);
    this.sprite.shader.uniforms.sampler = this.renderTexture;

    // Need to update uniforms?
    if ( !vmOptions?.uniforms ) return;
    vmOptions.uniforms.linkedToDarknessLevel = singleSource?.visionMode.vision.darkness.adaptive;
    vmOptions.uniforms.darknessLevel = canvas.environment.darknessLevel;
    vmOptions.uniforms.darknessLevelTexture = canvas.effects.illumination.renderTexture;
    vmOptions.uniforms.screenDimensions = canvas.screenDimensions;

    // Assigning color from source if any
    vmOptions.uniforms.tint = singleSource?.visionModeOverrides.colorRGB
      ?? this.sprite.shader.constructor.defaultUniforms.tint;

    // Updating uniforms in the primary sprite shader
    for ( const [uniform, value] of Object.entries(vmOptions?.uniforms ?? {}) ) {
      if ( uniform in this.sprite.shader.uniforms ) this.sprite.shader.uniforms[uniform] = value;
    }
  }

  /* -------------------------------------------- */

  /**
   * Update this group. Calculates the canvas transform and bounds of all its children and updates the quadtree.
   */
  update() {
    if ( this.sortDirty ) this.sortChildren();
    const children = this.children;
    for ( let i = 0, n = children.length; i < n; i++ ) {
      children[i].updateCanvasTransform?.();
    }
    canvas.masks.depth._update();
    if ( !CONFIG.debug.canvas.primary.bounds ) return;
    const dbg = canvas.controls.debug.clear().lineStyle(5, 0x30FF00);
    for ( const child of this.children ) {
      if ( child.canvasBounds ) dbg.drawShape(child.canvasBounds);
    }
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _draw(options) {
    this.#drawBackground();
    this.#drawForeground();
    this.#drawPadding();
    this.hoverFadeElevation = 0;
    await super._draw(options);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _render(renderer) {
    const [r, g, b] = this._backgroundColor;
    renderer.framebuffer.clear(r, g, b, 1, PIXI.BUFFER_BITS.COLOR);
    super._render(renderer);
  }

  /* -------------------------------------------- */

  /**
   * Draw the Scene background image.
   */
  #drawBackground() {
    const bg = this.background = this.addChild(new PrimarySpriteMesh({name: "background", object: this}));
    bg.elevation = this.constructor.BACKGROUND_ELEVATION;
    const bgTextureSrc = canvas.sceneTextures.background ?? canvas.scene.background.src;
    const bgTexture = bgTextureSrc instanceof PIXI.Texture ? bgTextureSrc : getTexture(bgTextureSrc);
    this.#drawSceneMesh(bg, bgTexture);
  }

  /* -------------------------------------------- */

  /**
   * Draw the Scene foreground image.
   */
  #drawForeground() {
    const fg = this.foreground = this.addChild(new PrimarySpriteMesh({name: "foreground", object: this}));
    fg.elevation = canvas.scene.foregroundElevation;
    const fgTextureSrc = canvas.sceneTextures.foreground ?? canvas.scene.foreground;
    const fgTexture = fgTextureSrc instanceof PIXI.Texture ? fgTextureSrc : getTexture(fgTextureSrc);

    // Compare dimensions with background texture and draw the mesh
    const bg = this.background.texture;
    if ( fgTexture && bg && ((fgTexture.width !== bg.width) || (fgTexture.height !== bg.height)) ) {
      ui.notifications.warn("WARNING.ForegroundDimensionsMismatch", {localize: true});
    }
    this.#drawSceneMesh(fg, fgTexture);
  }

  /* -------------------------------------------- */

  /**
   * Draw a PrimarySpriteMesh that fills the entire Scene rectangle.
   * @param {PrimarySpriteMesh} mesh        The target PrimarySpriteMesh
   * @param {PIXI.Texture|null} texture     The loaded Texture or null
   */
  #drawSceneMesh(mesh, texture) {
    const d = canvas.dimensions;
    mesh.texture = texture ?? PIXI.Texture.EMPTY;
    mesh.textureAlphaThreshold = 0.75;
    mesh.occludedAlpha = 0.5;
    mesh.visible = mesh.texture !== PIXI.Texture.EMPTY;
    mesh.position.set(d.sceneX, d.sceneY);
    mesh.width = d.sceneWidth;
    mesh.height = d.sceneHeight;
    mesh.sortLayer = PrimaryCanvasGroup.SORT_LAYERS.SCENE;
    mesh.zIndex = -Infinity;
    mesh.hoverFade = false;

    // Manage video playback
    const video = game.video.getVideoSource(mesh);
    if ( video ) {
      this.videoMeshes.add(mesh);
      game.video.play(video, {volume: game.settings.get("core", "globalAmbientVolume")});
    }
  }

  /* -------------------------------------------- */

  /**
   * Draw the Scene padding.
   */
  #drawPadding() {
    const d = canvas.dimensions;
    const g = this.addChild(new PIXI.LegacyGraphics());
    g.beginFill(0x000000, 0.025)
      .drawShape(d.rect)
      .beginHole()
      .drawShape(d.sceneRect)
      .endHole()
      .endFill();
    g.elevation = -Infinity;
    g.sort = -Infinity;
  }

  /* -------------------------------------------- */
  /*  Tear-Down                                   */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async _tearDown(options) {

    // Stop video playback
    for ( const mesh of this.videoMeshes ) game.video.stop(mesh.sourceElement);

    await super._tearDown(options);

    // Clear collections
    this.videoMeshes.clear();
    this.tokens.clear();
    this.tiles.clear();

    // Clear the quadtree
    this.quadtree.clear();

    // Reset the tiling sprite tracker
    this.#tilingSpriteError = false;
  }

  /* -------------------------------------------- */
  /*  Token Management                            */
  /* -------------------------------------------- */

  /**
   * Draw the SpriteMesh for a specific Token object.
   * @param {Token} token           The Token being added
   * @returns {PrimarySpriteMesh}   The added PrimarySpriteMesh
   */
  addToken(token) {
    const name = token.objectId;

    // Create the token mesh
    const mesh = this.tokens.get(name) ?? this.addChild(new PrimarySpriteMesh({name, object: token}));
    mesh.texture = token.texture ?? PIXI.Texture.EMPTY;
    this.tokens.set(name, mesh);
    if ( mesh.isVideo ) this.videoMeshes.add(mesh);
    return mesh;
  }

  /* -------------------------------------------- */

  /**
   * Remove a TokenMesh from the group.
   * @param {Token} token     The Token being removed
   */
  removeToken(token) {
    const name = token.objectId;
    const mesh = this.tokens.get(name);
    if ( mesh?.destroyed === false ) mesh.destroy({children: true});
    this.tokens.delete(name);
    this.videoMeshes.delete(mesh);
  }

  /* -------------------------------------------- */
  /*  Tile Management                             */
  /* -------------------------------------------- */

  /**
   * Draw the SpriteMesh for a specific Token object.
   * @param {Tile} tile                        The Tile being added
   * @returns {PrimarySpriteMesh}              The added PrimarySpriteMesh
   */
  addTile(tile) {
    /** @deprecated since v12 */
    if ( !this.#tilingSpriteError && tile.document.getFlag("core", "isTilingSprite") ) {
      this.#tilingSpriteError = true;
      ui.notifications.warn("WARNING.TilingSpriteDeprecation", {localize: true, permanent: true});
      const msg = "Tiling Sprites are deprecated without replacement.";
      foundry.utils.logCompatibilityWarning(msg, {since: 12, until: 14});
    }

    const name = tile.objectId;
    let mesh = this.tiles.get(name) ?? this.addChild(new PrimarySpriteMesh({name, object: tile}));
    mesh.texture = tile.texture ?? PIXI.Texture.EMPTY;
    this.tiles.set(name, mesh);
    if ( mesh.isVideo ) this.videoMeshes.add(mesh);
    return mesh;
  }

  /* -------------------------------------------- */

  /**
   * Remove a TokenMesh from the group.
   * @param {Tile} tile     The Tile being removed
   */
  removeTile(tile) {
    const name = tile.objectId;
    const mesh = this.tiles.get(name);
    if ( mesh?.destroyed === false ) mesh.destroy({children: true});
    this.tiles.delete(name);
    this.videoMeshes.delete(mesh);
  }

  /* -------------------------------------------- */
  /*  Drawing Management                          */
  /* -------------------------------------------- */

  /**
   * Add a PrimaryGraphics to the group.
   * @param {Drawing} drawing      The Drawing being added
   * @returns {PrimaryGraphics}    The created PrimaryGraphics instance
   */
  addDrawing(drawing) {
    const name = drawing.objectId;
    const shape = this.drawings.get(name) ?? this.addChild(new PrimaryGraphics({name, object: drawing}));
    this.drawings.set(name, shape);
    return shape;
  }

  /* -------------------------------------------- */

  /**
   * Remove a PrimaryGraphics from the group.
   * @param {Drawing} drawing     The Drawing being removed
   */
  removeDrawing(drawing) {
    const name = drawing.objectId;
    if ( !this.drawings.has(name) ) return;
    const shape = this.drawings.get(name);
    if ( shape?.destroyed === false ) shape.destroy({children: true});
    this.drawings.delete(name);
  }

  /* -------------------------------------------- */

  /**
   * Override the default PIXI.Container behavior for how objects in this container are sorted.
   * @override
   */
  sortChildren() {
    const children = this.children;
    for ( let i = 0, n = children.length; i < n; i++ ) children[i]._lastSortedIndex = i;
    children.sort(PrimaryCanvasGroup._compareObjects);
    this.sortDirty = false;
  }

  /* -------------------------------------------- */

  /**
   * The sorting function used to order objects inside the Primary Canvas Group.
   * Overrides the default sorting function defined for the PIXI.Container.
   * Sort Tokens PCO above other objects except WeatherEffects, then Drawings PCO, all else held equal.
   * @param {PrimaryCanvasObject|PIXI.DisplayObject} a     An object to display
   * @param {PrimaryCanvasObject|PIXI.DisplayObject} b     Some other object to display
   * @returns {number}
   * @internal
   */
  static _compareObjects(a, b) {
    return ((a.elevation || 0) - (b.elevation || 0))
      || ((a.sortLayer || 0) - (b.sortLayer || 0))
      || ((a.sort || 0) - (b.sort || 0))
      || (a.zIndex - b.zIndex)
      || (a._lastSortedIndex - b._lastSortedIndex);
  }

  /* -------------------------------------------- */
  /*  PIXI Events                                 */
  /* -------------------------------------------- */

  /**
   * Called when a child is added.
   * @param {PIXI.DisplayObject} child
   */
  #onChildAdded(child) {
    if ( child.shouldRenderDepth ) canvas.masks.depth._elevationDirty = true;
  }

  /* -------------------------------------------- */

  /**
   * Called when a child is removed.
   * @param {PIXI.DisplayObject} child
   */
  #onChildRemoved(child) {
    if ( child.shouldRenderDepth ) canvas.masks.depth._elevationDirty = true;
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /**
   * Handle mousemove events on the primary group to update the hovered state of its children.
   * @param {PIXI.Point} currentPos   Current mouse position
   * @param {boolean} hasMouseMoved   Has the mouse been moved (or it is a simulated mouse move event)?
   * @internal
   */
  _onMouseMove(currentPos, hasMouseMoved) {
    const time = canvas.app.ticker.lastTime;

    // Unset the hovered state of the hovered PCOs
    for ( const object of this.#hoveredObjects ) {
      if ( !object._hoverFadeState.hovered ) continue;
      object._hoverFadeState.hovered = false;
      object._hoverFadeState._hoveredTime = object._hoverFadeState.hoveredTime;
      object._hoverFadeState.hoveredTime = time;
    }

    this.#updateHoveredObjects(currentPos);
    // Set the hovered state of the hovered PCOs
    for ( const object of this.#hoveredObjects ) {
      if ( !object.hoverFade || !(object.elevation > this.hoverFadeElevation) ) break;
      object._hoverFadeState.hovered = true;
      if ( hasMouseMoved ) object._hoverFadeState.hoveredTime = time;
      // If the mouse position didn't change and the object was already hovered, ...
      else if ( object._hoverFadeState.hoveredTime === time ) {
        // ... restore the previous hovered timestamp
        object._hoverFadeState.hoveredTime = object._hoverFadeState._hoveredTime;
      }
    }
  }

  /* -------------------------------------------- */

  /**
   * Update the hovered objects. Returns the hovered objects.
   * @param {PIXI.Point} currentPos
   */
  #updateHoveredObjects(currentPos) {
    this.#hoveredObjects.length = 0;

    // Get all PCOs that contain the mouse position
    const position = currentPos;
    const collisionTest = ({t}) => t.visible && t.renderable
      && t._hoverFadeState && t.containsCanvasPoint(position);
    for ( const object of canvas.primary.quadtree.getObjects(
      new PIXI.Rectangle(position.x, position.y, 0, 0), {collisionTest}
    )) {
      this.#hoveredObjects.push(object);
    }

    // Sort the hovered PCOs in reverse primary order
    this.#hoveredObjects.sort((a, b) => PrimaryCanvasGroup._compareObjects(b, a));

    // Discard hit objects below the hovered placeable
    const hoveredPlaceable = canvas.activeLayer?.hover;
    if ( hoveredPlaceable ) {
      let elevation = 0;
      let sortLayer = Infinity;
      let sort = Infinity;
      let zIndex = Infinity;
      const {Drawing, Tile, Token} = foundry.canvas.placeables;
      if ( (hoveredPlaceable instanceof Token) || (hoveredPlaceable instanceof Tile) ) {
        const mesh = hoveredPlaceable.mesh;
        if ( mesh ) {
          elevation = mesh.elevation;
          sortLayer = mesh.sortLayer;
          sort = mesh.sort;
          zIndex = mesh.zIndex;
        }
      } else if ( hoveredPlaceable instanceof Drawing ) {
        const shape = hoveredPlaceable.shape;
        if ( shape ) {
          elevation = shape.elevation;
          sortLayer = shape.sortLayer;
          sort = shape.sort;
          zIndex = shape.zIndex;
        }
      } else if ( hoveredPlaceable.document.schema.has("elevation") ) {
        elevation = hoveredPlaceable.document.elevation;
      }
      const threshold = {elevation, sortLayer, sort, zIndex, _lastSortedIndex: Infinity};
      while ( this.#hoveredObjects.length
        && PrimaryCanvasGroup._compareObjects(this.#hoveredObjects.at(-1), threshold) <= 0 ) {
        this.#hoveredObjects.pop();
      }
    }
  }

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  mapElevationToDepth(elevation) {
    const msg = "PrimaryCanvasGroup#mapElevationAlpha is deprecated. "
      + "Use canvas.masks.depth.mapElevation(elevation) instead.";
    foundry.utils.logCompatibilityWarning(msg, {since: 12, until: 14});
    return canvas.masks.depth.mapElevation(elevation);
  }
}

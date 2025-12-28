import PlaceableObject from "./placeable-object.mjs";
import ResizeHandle from "../containers/elements/resize-handle.mjs";
import {loadTexture} from "../loader.mjs";
import MouseInteractionManager from "../interaction/mouse-handler.mjs";
import PrimaryCanvasGroup from "../groups/primary.mjs";
import { getDocumentClass } from "@client/utils/helpers.mjs";

/**
 * A Tile is an implementation of PlaceableObject which represents a static piece of artwork or prop within the Scene.
 * @category Canvas
 * @see {@link foundry.documents.TileDocument}
 * @see {@link foundry.canvas.layers.TilesLayer}
 */
export default class Tile extends PlaceableObject {

  /* -------------------------------------------- */
  /*  Attributes                                  */
  /* -------------------------------------------- */

  /** @inheritdoc */
  static embeddedName = "Tile";

  /** @override */
  static RENDER_FLAGS = {
    redraw: {propagate: ["refresh"]},
    refresh: {propagate: ["refreshState", "refreshTransform", "refreshMesh", "refreshElevation", "refreshVideo"], alias: true},
    refreshState: {propagate: ["refreshPerception"]},
    refreshTransform: {propagate: ["refreshPosition", "refreshRotation", "refreshSize"], alias: true},
    refreshPosition: {propagate: ["refreshPerception"]},
    refreshRotation: {propagate: ["refreshPerception", "refreshFrame"]},
    refreshSize: {propagate: ["refreshPosition", "refreshFrame"]},
    refreshMesh: {},
    refreshFrame: {},
    refreshElevation: {propagate: ["refreshPerception"]},
    refreshPerception: {},
    refreshVideo: {},
    /** @deprecated since v12 */
    refreshShape: {
      propagate: ["refreshTransform", "refreshMesh", "refreshElevation"],
      deprecated: {since: 12, until: 14, alias: true}
    }
  };

  /**
   * The Tile border frame
   * @type {PIXI.Container}
   */
  frame;

  /**
   * The primary tile image texture
   * @type {PIXI.Texture|PIXI.Spritesheet|null}
   */
  texture = null;

  /**
   * A Tile background which is displayed if no valid image texture is present
   * @type {PIXI.Graphics|null}
   */
  bg = null;

  /**
   * A reference to the SpriteMesh which displays this Tile in the PrimaryCanvasGroup.
   * @type {PrimarySpriteMesh|null}
   */
  mesh = null;

  /**
   * A flag to capture whether this Tile has an unlinked video texture
   * @type {boolean}
   */
  #unlinkedVideo = false;

  /**
   * Video options passed by the HUD
   * @type {object}
   */
  #hudVideoOptions = {
    playVideo: undefined,
    offset: undefined
  };

  /* -------------------------------------------- */

  /**
   * Get the native aspect ratio of the base texture for the Tile sprite
   * @type {number}
   */
  get aspectRatio() {
    if ( !this.texture ) return 1;
    const tex = this.texture.baseTexture;
    return (tex.width / tex.height);
  }

  /* -------------------------------------------- */

  /** @override */
  get bounds() {
    let {x, y, width, height, texture, rotation} = this.document;

    // Adjust top left coordinate and dimensions according to scale
    if ( texture.scaleX !== 1 ) {
      const w0 = width;
      width *= Math.abs(texture.scaleX);
      x += (w0 - width) / 2;
    }
    if ( texture.scaleY !== 1 ) {
      const h0 = height;
      height *= Math.abs(texture.scaleY);
      y += (h0 - height) / 2;
    }

    // If the tile is rotated, return recomputed bounds according to rotation
    if ( rotation !== 0 ) return PIXI.Rectangle.fromRotation(x, y, width, height, Math.toRadians(rotation)).normalize();

    // Normal case
    return new PIXI.Rectangle(x, y, width, height).normalize();
  }

  /* -------------------------------------------- */

  /**
   * The HTML source element for the primary Tile texture
   * @type {PIXI.ImageSource|null}
   */
  get sourceElement() {
    return this.texture?.baseTexture.resource.source ?? null;
  }

  /* -------------------------------------------- */

  /**
   * Does this Tile depict an animated video texture?
   * @type {boolean}
   */
  get isVideo() {
    const source = this.sourceElement;
    return source?.tagName === "VIDEO";
  }

  /* -------------------------------------------- */

  /**
   * Is this Tile currently visible on the Canvas?
   * @type {boolean}
   */
  get isVisible() {
    return !this.document.hidden || game.user.isGM;
  }

  /* -------------------------------------------- */

  /**
   * Is this tile occluded?
   * @returns {boolean}
   */
  get occluded() {
    return this.mesh?.occluded ?? false;
  }

  /* -------------------------------------------- */

  /**
   * Is the tile video playing?
   * @type {boolean}
   */
  get playing() {
    return this.isVideo && !this.sourceElement.paused;
  }

  /* -------------------------------------------- */

  /**
   * The effective volume at which this Tile should be playing, including the global ambient volume modifier
   * @type {number}
   */
  get volume() {
    return this.document.video.volume * game.settings.get("core", "globalAmbientVolume");
  }

  /* -------------------------------------------- */
  /*  Interactivity                               */
  /* -------------------------------------------- */

  /** @override */
  _overlapsSelection(rectangle) {
    if ( !this.frame ) return false;
    const localRectangle = new PIXI.Rectangle(
      rectangle.x - this.position.x,
      rectangle.y - this.position.y,
      rectangle.width,
      rectangle.height
    );
    return localRectangle.overlaps(this.frame.bounds);
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /**
   * Create a preview tile with a background texture instead of an image
   * @param {object} data     Initial data with which to create the preview Tile
   * @returns {PlaceableObject}
   */
  static createPreview(data) {
    data.width = data.height = 1;
    data.elevation = data.elevation
      ?? (ui.controls.control.tools?.foreground.active ? canvas.scene.foregroundElevation : 0);
    data.sort = Math.max(canvas.tiles.getMaxSort() + 1, 0);

    // Create a pending TileDocument
    const cls = getDocumentClass("Tile");
    const doc = new cls(data, {parent: canvas.scene});

    // Render the preview Tile object
    const tile = doc.object;
    tile.control({releaseOthers: false});
    tile.draw().then(() => {  // Swap the z-order of the tile and the frame
      tile.removeChild(tile.frame);
      tile.addChild(tile.frame);
    });
    return tile;
  }

  /* -------------------------------------------- */

  /** @override */
  async _draw(options={}) {

    // Load Tile texture
    let texture;
    if ( this._original ) texture = this._original.texture?.clone();
    else if ( this.document.texture.src ) {
      texture = await loadTexture(this.document.texture.src, {fallback: "icons/svg/hazard.svg"});
    }

    // Manage video playback and clone texture for unlinked video
    let video = game.video.getVideoSource(texture);
    this.#unlinkedVideo = !!video && !this._original;
    if ( this.#unlinkedVideo ) {
      texture = await game.video.cloneTexture(video);
      video = game.video.getVideoSource(texture);
      if ( (this.document.getFlag("core", "randomizeVideo") !== false) && Number.isFinite(video.duration) ) {
        video.currentTime = Math.random() * video.duration;
      }
    }
    if ( !video ) this.#hudVideoOptions.playVideo = undefined;
    this.#hudVideoOptions.offset = undefined;
    this.texture = texture;

    // Draw the Token mesh
    if ( this.texture ) {
      this.mesh = canvas.primary.addTile(this);
      this.bg = null;
    }

    // Draw a placeholder background
    else {
      canvas.primary.removeTile(this);
      this.texture = this.mesh = null;
      this.bg = this.addChild(new PIXI.Graphics());
      this.bg.eventMode = "none";
    }

    // Control Border
    this.frame = this.addChild(this.#drawFrame());

    // Interactivity
    this.cursor = this.document.isOwner ? "pointer" : null;
  }

  /* -------------------------------------------- */

  /**
   * Create elements for the Tile border and handles
   * @returns {PIXI.Container}
   */
  #drawFrame() {
    const frame = new PIXI.Container();
    frame.eventMode = "passive";
    frame.bounds = new PIXI.Rectangle();
    frame.interaction = frame.addChild(new PIXI.Container());
    frame.interaction.hitArea = frame.bounds;
    frame.interaction.eventMode = "auto";
    frame.border = frame.addChild(new PIXI.Graphics());
    frame.border.eventMode = "none";
    frame.handle = frame.addChild(new ResizeHandle([1, 1]));
    frame.handle.eventMode = "static";
    return frame;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  clear() {
    if ( this.#unlinkedVideo ) this.texture?.baseTexture?.destroy(); // Base texture destroyed for non preview video
    this.#unlinkedVideo = false;
    return super.clear();
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _destroy(options) {
    canvas.primary.removeTile(this);
    if ( this.texture ) {
      if ( this.#unlinkedVideo ) this.texture?.baseTexture?.destroy(); // Base texture destroyed for non preview video
      this.texture = null;
      this.#unlinkedVideo = false;
    }
  }

  /* -------------------------------------------- */
  /*  Incremental Refresh                         */
  /* -------------------------------------------- */

  /** @override */
  _applyRenderFlags(flags) {
    if ( flags.refreshState ) this._refreshState();
    if ( flags.refreshPosition ) this._refreshPosition();
    if ( flags.refreshRotation ) this._refreshRotation();
    if ( flags.refreshSize ) this._refreshSize();
    if ( flags.refreshMesh ) this._refreshMesh();
    if ( flags.refreshFrame ) this._refreshFrame();
    if ( flags.refreshElevation ) this._refreshElevation();
    if ( flags.refreshPerception ) this.#refreshPerception();
    if ( flags.refreshVideo ) this._refreshVideo();
  }

  /* -------------------------------------------- */

  /**
   * Refresh the position.
   * @protected
   */
  _refreshPosition() {
    const {x, y, width, height} = this.document;
    if ( (this.position.x !== x) || (this.position.y !== y) ) MouseInteractionManager.emulateMoveEvent();
    this.position.set(x, y);
    if ( !this.mesh ) {
      this.bg.position.set(width / 2, height / 2);
      this.bg.pivot.set(width / 2, height / 2);
      return;
    }
    this.mesh.position.set(x + (width / 2), y + (height / 2));
    if ( this.hasActiveHUD ) this.layer.hud.setPosition();
  }

  /* -------------------------------------------- */

  /**
   * Refresh the rotation.
   * @protected
   */
  _refreshRotation() {
    const rotation = this.document.rotation;
    if ( !this.mesh ) return this.bg.angle = rotation;
    this.mesh.angle = rotation;
  }

  /* -------------------------------------------- */

  /**
   * Refresh the size.
   * @protected
   */
  _refreshSize() {
    const {width, height, texture: {fit, scaleX, scaleY}} = this.document;
    if ( !this.mesh ) return this.bg.clear().beginFill(0xFFFFFF, 0.5).drawRect(0, 0, width, height).endFill();
    this.mesh.resize(width, height, {fit, scaleX, scaleY});
  }

  /* -------------------------------------------- */

  /**
   * Refresh the displayed state of the Tile.
   * Updated when the tile interaction state changes, when it is hidden, or when its elevation changes.
   * @protected
   */
  _refreshState() {
    const {hidden, locked, elevation, sort} = this.document;
    this.visible = this.isVisible;
    this.alpha = this._getTargetAlpha();
    if ( this.bg ) this.bg.visible = this.layer.active;
    const colors = CONFIG.Canvas.dispositionColors;
    this.frame.border.tint = this.controlled ? (locked ? colors.HOSTILE : colors.CONTROLLED) : colors.INACTIVE;
    this.frame.border.visible = this.controlled || this.hover || this.layer.highlightObjects;
    this.frame.handle.visible = this.controlled && !locked;
    const foreground = this.layer.active && ui.controls.control.tools?.foreground.active;
    const overhead = elevation >= this.document.parent.foregroundElevation;
    const oldEventMode = this.eventMode;
    this.eventMode = overhead === foreground ? "static" : "none";
    if ( this.eventMode !== oldEventMode ) MouseInteractionManager.emulateMoveEvent();
    const zIndex = this.zIndex = this.controlled ? 2 : this.hover ? 1 : 0;
    if ( !this.mesh ) return;
    this.mesh.visible = this.visible;
    this.mesh.sort = sort;
    this.mesh.sortLayer = PrimaryCanvasGroup.SORT_LAYERS.TILES;
    this.mesh.zIndex = zIndex;
    this.mesh.alpha = this.alpha * (hidden ? 0.5 : 1);
    this.mesh.hidden = hidden;
    this.mesh.restrictsLight = this.document.restrictions.light;
    this.mesh.restrictsWeather = this.document.restrictions.weather;
  }

  /* -------------------------------------------- */

  /**
   * Refresh the appearance of the tile.
   * @protected
   */
  _refreshMesh() {
    if ( !this.mesh ) return;
    const {width, height, alpha, occlusion, texture} = this.document;
    const {anchorX, anchorY, fit, scaleX, scaleY, tint, alphaThreshold} = texture;
    this.mesh.anchor.set(anchorX, anchorY);
    this.mesh.resize(width, height, {fit, scaleX, scaleY});
    this.mesh.unoccludedAlpha = alpha;
    this.mesh.occludedAlpha = occlusion.alpha;
    this.mesh.occlusionMode = occlusion.mode;
    this.mesh.hoverFade = this.mesh.isOccludable;
    this.mesh.tint = tint;
    this.mesh.textureAlphaThreshold = alphaThreshold;
  }

  /* -------------------------------------------- */

  /**
   * Refresh the elevation.
   * @protected
   */
  _refreshElevation() {
    if ( !this.mesh ) return;
    this.mesh.elevation = this.document.elevation;
  }

  /* -------------------------------------------- */

  /**
   * Refresh the tiles.
   */
  #refreshPerception() {
    if ( !this.mesh ) return;
    canvas.perception.update({refreshOcclusionStates: true});
  }

  /* -------------------------------------------- */

  /**
   * Refresh the border frame that encloses the Tile.
   * @protected
   */
  _refreshFrame() {
    const thickness = CONFIG.Canvas.objectBorderThickness * canvas.dimensions.uiScale;

    // Update the frame bounds
    const {width, height, rotation} = this.document;
    const bounds = this.frame.bounds;
    bounds.x = 0;
    bounds.y = 0;
    bounds.width = width;
    bounds.height = height;
    bounds.rotate(Math.toRadians(rotation));
    const minSize = thickness * 0.25;
    if ( bounds.width < minSize ) {
      bounds.x -= ((minSize - bounds.width) / 2);
      bounds.width = minSize;
    }
    if ( bounds.height < minSize ) {
      bounds.y -= ((minSize - bounds.height) / 2);
      bounds.height = minSize;
    }
    MouseInteractionManager.emulateMoveEvent();

    // Draw the border
    const border = this.frame.border;
    border.clear();
    border.lineStyle({width: thickness, color: 0x000000, join: PIXI.LINE_JOIN.ROUND, alignment: 0.75})
      .drawShape(bounds);
    border.lineStyle({width: thickness / 2, color: 0xFFFFFF, join: PIXI.LINE_JOIN.ROUND, alignment: 1})
      .drawShape(bounds);

    // Draw the handle
    this.frame.handle.refresh(bounds);
  }

  /* -------------------------------------------- */

  /**
   * Refresh changes to the video playback state.
   * @protected
   */
  _refreshVideo() {
    if ( !this.texture || !this.#unlinkedVideo ) return;
    const video = game.video.getVideoSource(this.texture);
    if ( !video ) return;
    const playOptions = {...this.document.video, volume: this.volume};
    playOptions.playing = (this.#hudVideoOptions.playVideo ?? playOptions.autoplay);
    playOptions.offset = this.#hudVideoOptions.offset;
    this.#hudVideoOptions.offset = undefined;
    game.video.play(video, playOptions);

    // Refresh HUD if necessary
    if ( this.hasActiveHUD ) this.layer.hud.render();
  }

  /* -------------------------------------------- */
  /*  Document Event Handlers                     */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);
    const restrictionsChanged = ("restrictions" in changed) && !foundry.utils.isEmpty(changed.restrictions);

    // Refresh the Drawing
    this.renderFlags.set({
      redraw: ("texture" in changed) && ("src" in changed.texture),
      refreshState: ("sort" in changed) || ("hidden" in changed) || ("locked" in changed) || restrictionsChanged,
      refreshPosition: ("x" in changed) || ("y" in changed),
      refreshRotation: "rotation" in changed,
      refreshSize: ("width" in changed) || ("height" in changed),
      refreshMesh: ("alpha" in changed) || ("occlusion" in changed) || ("texture" in changed),
      refreshElevation: "elevation" in changed,
      refreshPerception: ("occlusion" in changed) && ("mode" in changed.occlusion),
      refreshVideo: ("video" in changed) || ("playVideo" in options) || ("offset" in options)
    });

    // Set the video options
    if ( "playVideo" in options ) this.#hudVideoOptions.playVideo = options.playVideo;
    if ( "offset" in options ) this.#hudVideoOptions.offset = options.offset;
  }

  /* -------------------------------------------- */
  /*  Interactivity                               */
  /* -------------------------------------------- */

  /** @inheritdoc */
  activateListeners() {
    super.activateListeners();
    this.frame.handle.off("pointerover").off("pointerout")
      .on("pointerover", this._onHandleHoverIn.bind(this))
      .on("pointerout", this._onHandleHoverOut.bind(this));
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onClickLeft(event) {
    if ( event.target === this.frame.handle ) {
      event.interactionData.dragHandle = true;
      event.stopPropagation();
      return;
    }
    return super._onClickLeft(event);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onDragLeftStart(event) {
    if ( event.interactionData.dragHandle ) return this._onHandleDragStart(event);
    return super._onDragLeftStart(event);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onDragLeftMove(event) {
    if ( event.interactionData.dragHandle ) return this._onHandleDragMove(event);
    super._onDragLeftMove(event);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onDragLeftDrop(event) {
    if ( event.interactionData.dragHandle ) return this._onHandleDragDrop(event);
    return super._onDragLeftDrop(event);
  }

  /* -------------------------------------------- */
  /*  Resize Handling                             */
  /* -------------------------------------------- */

  /** @inheritdoc */
  _onDragLeftCancel(event) {
    if ( event.interactionData.dragHandle ) return this._onHandleDragCancel(event);
    return super._onDragLeftCancel(event);
  }

  /* -------------------------------------------- */

  /**
   * Handle mouse-over event on a control handle
   * @param {PIXI.FederatedEvent} event   The mouseover event
   * @protected
   */
  _onHandleHoverIn(event) {
    if ( event.nativeEvent && (event.nativeEvent.target.id !== canvas.app.view.id) ) return;
    const handle = event.target;
    handle?.scale.set(1.5, 1.5);
  }

  /* -------------------------------------------- */

  /**
   * Handle mouse-out event on a control handle
   * @param {PIXI.FederatedEvent} event   The mouseout event
   * @protected
   */
  _onHandleHoverOut(event) {
    if ( event.nativeEvent && (event.nativeEvent.target.id !== canvas.app.view.id) ) return;
    const handle = event.target;
    handle?.scale.set(1.0, 1.0);
  }

  /* -------------------------------------------- */

  /**
   * Handle the beginning of a drag event on a resize handle.
   * @param {PIXI.FederatedEvent} event   The mousedown event
   * @protected
   */
  _onHandleDragStart(event) {
    const handle = this.frame.handle;
    const aw = this.document.width;
    const ah = this.document.height;
    const x0 = this.document.x + (handle.offset[0] * aw);
    const y0 = this.document.y + (handle.offset[1] * ah);
    event.interactionData.origin = {x: x0, y: y0, width: aw, height: ah};
  }

  /* -------------------------------------------- */

  /**
   * Handle mousemove while dragging a tile scale handler
   * @param {PIXI.FederatedEvent} event   The mousemove event
   * @protected
   */
  _onHandleDragMove(event) {
    canvas._onDragCanvasPan(event);
    const interaction = event.interactionData;
    if ( !event.shiftKey ) interaction.destination = this.layer.getSnappedPoint(interaction.destination);
    const d = this.#getResizedDimensions(event);
    this.document.x = d.x;
    this.document.y = d.y;
    this.document.width = d.width;
    this.document.height = d.height;
    this.document.rotation = 0;

    // Mirror horizontally or vertically
    this.document.texture.scaleX = d.sx;
    this.document.texture.scaleY = d.sy;
    this.renderFlags.set({refreshTransform: true});
  }

  /* -------------------------------------------- */

  /**
   * Handle mouseup after dragging a tile scale handler
   * @param {PIXI.FederatedEvent} event   The mouseup event
   * @protected
   */
  _onHandleDragDrop(event) {
    const interaction = event.interactionData;
    interaction.resetDocument = false;
    if ( !event.shiftKey ) interaction.destination = this.layer.getSnappedPoint(interaction.destination);
    const d = this.#getResizedDimensions(event);
    this.document.update({
      x: d.x, y: d.y, width: d.width, height: d.height, "texture.scaleX": d.sx, "texture.scaleY": d.sy
    }).then(() => this.renderFlags.set({refreshTransform: true}));
  }

  /* -------------------------------------------- */

  /**
   * Get resized Tile dimensions
   * @param {PIXI.FederatedEvent} event
   * @returns {{x: number, y: number, width: number, height: number, sx: number, sy: number}}
   */
  #getResizedDimensions(event) {
    const o = this.document._source;
    const {origin, destination} = event.interactionData;

    // Identify the new width and height as positive dimensions
    const dx = destination.x - origin.x;
    const dy = destination.y - origin.y;
    let w = Math.abs(o.width) + dx;
    let h = Math.abs(o.height) + dy;

    // Constrain the aspect ratio using the ALT key
    if ( event.altKey && this.texture?.valid ) {
      const ar = this.texture.width / this.texture.height;
      if ( Math.abs(w) > Math.abs(h) ) h = w / ar;
      else w = h * ar;
    }
    const {x, y, width, height} = new PIXI.Rectangle(o.x, o.y, w, h).normalize();

    // Comparing destination coord and source coord to apply mirroring and append to nr
    const sx = (Math.sign(destination.x - o.x) || 1) * o.texture.scaleX;
    const sy = (Math.sign(destination.y - o.y) || 1) * o.texture.scaleY;
    return {x, y, width, height, sx, sy};
  }

  /* -------------------------------------------- */

  /**
   * Handle cancellation of a drag event for one of the resizing handles
   * @param {PIXI.FederatedEvent} event   The mouseup event
   * @protected
   */
  _onHandleDragCancel(event) {
    if ( event.interactionData.resetDocument !== false ) {
      this.document.reset();
      this.renderFlags.set({refreshTransform: true});
    }
  }

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  get isRoof() {
    const msg = "Tile#isRoof has been deprecated without replacement.";
    foundry.utils.logCompatibilityWarning(msg, {since: 12, until: 14});
    return this.document.roof;
  }
}

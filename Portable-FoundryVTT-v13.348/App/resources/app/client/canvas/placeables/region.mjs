import PlaceableObject from "./placeable-object.mjs";
import RegionMesh from "./regions/mesh.mjs";
import RegionGeometry from "./regions/geometry.mjs";
import MouseInteractionManager from "../interaction/mouse-handler.mjs";
import HighlightRegionShader from "../rendering/shaders/region/highlight.mjs";
import {CLIPPER_SCALING_FACTOR} from "@common/constants.mjs";

/**
 * A Region is an implementation of PlaceableObject which represents a Region document
 * within a viewed Scene on the game canvas.
 * @category Canvas
 * @see {@link foundry.documents.RegionDocument}
 * @see {@link foundry.canvas.layers.RegionLayer}
 */
export default class Region extends PlaceableObject {

  /** @override */
  static embeddedName = "Region";

  /* -------------------------------------------- */

  /** @override */
  static RENDER_FLAGS = {
    redraw: {propagate: ["refresh"]},
    refresh: {propagate: ["refreshState", "refreshBorder"], alias: true},
    refreshState: {},
    refreshBorder: {}
  };

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * The geometry of this Region.
   *
   * The value of this property must not be mutated.
   *
   * This property is updated only by a document update.
   * @type {RegionGeometry}
   */
  get geometry() {
    return this.#geometry;
  }

  #geometry = new RegionGeometry(this);

  /* -------------------------------------------- */

  /** @override */
  get bounds() {
    return this.document.bounds.clone(); // PlaceableObject#bounds always returns a new instance
  }

  /* -------------------------------------------- */

  /** @override */
  get center() {
    const {x, y} = this.bounds.center;
    return new PIXI.Point(x, y);
  }

  /* -------------------------------------------- */

  /**
   * Is this Region currently visible on the Canvas?
   * @type {boolean}
   */
  get isVisible() {
    if ( this.sheet?.rendered ) return true;
    if ( !this.layer.legend._isRegionVisible(this) ) return false;
    const V = CONST.REGION_VISIBILITY;
    switch ( this.document.visibility ) {
      case V.LAYER: return this.layer.active;
      case V.GAMEMASTER: return game.user.isGM;
      case V.ALWAYS: return true;
      default: throw new Error("Invalid visibility");
    }
  }

  /* -------------------------------------------- */

  /**
   * The highlight of this Region.
   * @type {RegionMesh}
   */
  #highlight;

  /* -------------------------------------------- */

  /**
   * The border of this Region.
   * @type {PIXI.Graphics}
   */
  #border;

  /* -------------------------------------------- */

  /** @override */
  getSnappedPosition(position) {
    throw new Error("Region#getSnappedPosition is not supported: RegionDocument does not have a (x, y) position");
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @override */
  async _draw(options) {
    this.#highlight = this.addChild(new RegionMesh(this, HighlightRegionShader));
    this.#highlight.eventMode = "auto";
    this.#highlight.shader.uniforms.hatchThickness = 4 * canvas.dimensions.uiScale;
    this.#highlight.alpha = 0.5;
    this.#border = this.addChild(new PIXI.Graphics());
    this.#border.eventMode = "none";
    this.cursor = "pointer";
  }

  /* -------------------------------------------- */
  /*  Incremental Refresh                         */
  /* -------------------------------------------- */

  /** @override */
  _applyRenderFlags(flags) {
    if ( flags.refreshState ) this._refreshState();
    if ( flags.refreshBorder ) this._refreshBorder();
  }

  /* -------------------------------------------- */

  /**
   * Refresh the state of the Region.
   * @protected
   */
  _refreshState() {
    const wasVisible = this.visible;
    this.visible = this.isVisible;
    if ( this.visible !== wasVisible ) MouseInteractionManager.emulateMoveEvent();
    this.zIndex = this.controlled ? 2 : this.hover ? 1 : 0;
    const oldEventMode = this.eventMode;
    this.eventMode = this.layer.active && (game.activeTool === "select") ? "static" : "none";
    if ( this.eventMode !== oldEventMode ) MouseInteractionManager.emulateMoveEvent();
    const {locked, color} = this.document;
    this.#highlight.tint = color;
    this.#highlight.shader.uniforms.hatchEnabled = !this.controlled && !this.hover;
    const colors = CONFIG.Canvas.dispositionColors;
    this.#border.tint = this.controlled ? (locked ? colors.HOSTILE : colors.CONTROLLED) : colors.INACTIVE;
    this.#border.visible = this.controlled || this.hover || this.layer.highlightObjects;
  }

  /* -------------------------------------------- */

  /**
   * Refresh the border of the Region.
   * @protected
   */
  _refreshBorder() {
    const thickness = CONFIG.Canvas.objectBorderThickness * canvas.dimensions.uiScale;
    this.#border.clear();
    for ( const lineStyle of [
      {width: thickness, color: 0x000000, join: PIXI.LINE_JOIN.ROUND, alignment: 0.75},
      {width: thickness / 2, color: 0xFFFFFF, join: PIXI.LINE_JOIN.ROUND, alignment: 1}
    ]) {
      this.#border.lineStyle(lineStyle);
      for ( const node of this.document.polygonTree ) {
        if ( node.isHole ) continue;
        this.#border.drawShape(node.polygon);
        this.#border.beginHole();
        for ( const hole of node.children ) this.#border.drawShape(hole.polygon);
        this.#border.endHole();
      }
    }
  }

  /* -------------------------------------------- */

  /** @override */
  _canDrag(user, event) {
    return false; // Regions cannot be dragged
  }

  /* -------------------------------------------- */

  /** @override */
  _canHUD(user, event) {
    return false; // Regions don't have a HUD
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onControl(options) {
    super._onControl(options);
    this.layer.legend.render();
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onRelease(options) {
    super._onRelease(options);
    if ( this.layer.active ) {
      ui.controls.activate({tool: "select"});
      this.layer.legend.render();
    }
  }

  /* -------------------------------------------- */

  /**
   * Actions that should be taken for this Region when a mouseover event occurs.
   * @param {PIXI.FederatedEvent} event The triggering canvas interaction event
   * @param {object} options Options that customize event handling
   * @param {boolean} [options.updateLegend=true] Highlight corresponding entry in the RegionLegend.
   * @returns {boolean|void}
   * @protected
   * @override
   */
  _onHoverIn(event, {updateLegend=true, ...options}={}) {
    if ( updateLegend ) this.layer.legend._hoverRegion(this, true);
    return super._onHoverIn(event, options);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onHoverOut(event, {updateLegend=true, ...options}={}) {
    if ( updateLegend ) this.layer.legend._hoverRegion(this, false);
    return super._onHoverOut(event);
  }

  /* -------------------------------------------- */

  /** @override */
  _overlapsSelection(rectangle) {
    const localRectangle = new PIXI.Rectangle(
      rectangle.x - this.position.x,
      rectangle.y - this.position.y,
      rectangle.width,
      rectangle.height
    );
    if ( !localRectangle.intersects(this.bounds) ) return false;
    const x0 = Math.round(localRectangle.left * CLIPPER_SCALING_FACTOR);
    const y0 = Math.round(localRectangle.top * CLIPPER_SCALING_FACTOR);
    const x1 = Math.round(localRectangle.right * CLIPPER_SCALING_FACTOR);
    const y1 = Math.round(localRectangle.bottom * CLIPPER_SCALING_FACTOR);
    if ( (x0 === x1) || (y0 === y1) ) return false;
    const rectanglePath = [
      new ClipperLib.IntPoint(x0, y0),
      new ClipperLib.IntPoint(x1, y0),
      new ClipperLib.IntPoint(x1, y1),
      new ClipperLib.IntPoint(x0, y1)
    ];
    const clipper = new ClipperLib.Clipper();
    const solution = [];
    clipper.Clear();
    clipper.AddPath(rectanglePath, ClipperLib.PolyType.ptSubject, true);
    clipper.AddPaths(this.document.clipperPaths, ClipperLib.PolyType.ptClip, true);
    clipper.Execute(ClipperLib.ClipType.ctIntersection, solution);
    return solution.length !== 0;
  }

  /* -------------------------------------------- */
  /*  Document Event Handlers                     */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);

    // Update the shapes
    if ( "shapes" in changed ) this.#geometry?._clearBuffers();

    // Incremental Refresh
    this.renderFlags.set({
      refreshState: ("color" in changed) || ("visibility" in changed) || ("locked" in changed),
      refreshBorder: "shapes" in changed
    });
  }

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /**
   * @deprecated since v13
   * @ignore
   */
  static get CLIPPER_SCALING_FACTOR() {
    foundry.utils.logCompatibilityWarning("Region.CLIPPER_SCALING_FACTOR has been deprecated in favor of CONST.CLIPPER_SCALING_FACTOR.",
      {since: 13, until: 15, once: true});
    return CLIPPER_SCALING_FACTOR;
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v13
   * @ignore
   */
  static get MOVEMENT_SEGMENT_TYPES() {
    foundry.utils.logCompatibilityWarning("Region.MOVEMENT_SEGMENT_TYPES has been deprecated in favor of CONST.REGION_MOVEMENT_SEGMENTS.",
      {since: 13, until: 15, once: true});
    return CONST.REGION_MOVEMENT_SEGMENTS;
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v13
   * @ignore
   */
  get bottom() {
    foundry.utils.logCompatibilityWarning("Region#bottom has been deprecated in favor of RegionDocument#elevation.bottom.",
      {since: 13, until: 15, once: true});
    return this.document.elevation.bottom;
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v13
   * @ignore
   */
  get top() {
    foundry.utils.logCompatibilityWarning("Region#top has been deprecated in favor of RegionDocument#elevation.top.",
      {since: 13, until: 15, once: true});
    return this.document.elevation.top;
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v13
   * @ignore
   */
  get shapes() {
    foundry.utils.logCompatibilityWarning("Region#shapes has been deprecated in favor of RegionDocument#regionShapes.",
      {since: 13, until: 15, once: true});
    return this.document.regionShapes;
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v13
   * @ignore
   */
  get polygons() {
    foundry.utils.logCompatibilityWarning("Region#polygons has been deprecated in favor of RegionDocument#polygons.",
      {since: 13, until: 15, once: true});
    return this.document.polygons;
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v13
   * @ignore
   */
  get polygonTree() {
    foundry.utils.logCompatibilityWarning("Region#polygons has been deprecated in favor of RegionDocument#polygons.",
      {since: 13, until: 15, once: true});
    return this.document.polygonTree;
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v13
   * @ignore
   */
  get clipperPaths() {
    foundry.utils.logCompatibilityWarning("Region#clipperPaths has been deprecated in favor of RegionDocument#clipperPaths.",
      {since: 13, until: 15, once: true});
    return this.document.clipperPaths;
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v13
   * @ignore
   */
  get triangulation() {
    foundry.utils.logCompatibilityWarning("Region#triangulation has been deprecated in favor of RegionDocument#triangulation.",
      {since: 13, until: 15, once: true});
    return this.document.triangulation;
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v13
   * @ignore
   */
  segmentizeMovement(waypoints, samples, options) {
    const msg = "Region#segmentizeMovement has been deprecated in favor of RegionDocument#segmentizeMovementPath.";
    foundry.utils.logCompatibilityWarning(msg, {since: 13, until: 15, once: true});
    if ( options?.teleport !== undefined ) {
      waypoints = waypoints.map(waypoint => {
        waypoint = {...waypoint};
        waypoint.teleport ??= options.teleport;
        return waypoint;
      });
    }
    return this.document.segmentizeMovementPath(waypoints, samples);
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v13
   * @ignore
   */
  testPoint(point, elevation) {
    foundry.utils.logCompatibilityWarning("Region#testPoint(point: Point, elevation?: number) has been deprecated "
      + "in favor of RegionDocument#testPoint(point: ElevatedPoint).", {since: 13, until: 15, once: true});
    return this.document.testPoint(point, elevation ?? this.document.elevation.bottom);
  }
}

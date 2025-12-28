import PlaceablesLayer from "./base/placeables-layer.mjs";
import SceneControls from "../../applications/ui/scene-controls.mjs";
import RegionLegend from "../../applications/ui/region-legend.mjs";
import VisionMaskFilter from "../rendering/filters/vision-mask-filter.mjs";
import RegionDocument from "@client/documents/region.mjs";
import Color from "@common/utils/color.mjs";

/**
 * @import {BaseShapeData} from "@common/data/data.mjs";
 */

/**
 * The Regions Container.
 * @category Canvas
 */
export default class RegionLayer extends PlaceablesLayer {

  /** @inheritDoc */
  static get layerOptions() {
    return foundry.utils.mergeObject(super.layerOptions, {
      name: "regions",
      controllableObjects: true,
      confirmDeleteKey: true,
      quadtree: false,
      zIndex: 100,
      zIndexActive: 600
    });
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  static documentName = "Region";

  /* -------------------------------------------- */

  /**
   * The method to sort the Regions.
   * @type {Function}
   */
  static #sortRegions = function() {
    for ( let i = 0; i < this.children.length; i++ ) {
      this.children[i]._lastSortedIndex = i;
    }
    this.children.sort((a, b) => (a.zIndex - b.zIndex)
      || (a.document.top - b.document.top)
      || (a.document.bottom - b.document.bottom)
      || (a._lastSortedIndex - b._lastSortedIndex));
    this.sortDirty = false;
  };

  /* -------------------------------------------- */

  /** @inheritDoc */
  get hookName() {
    return RegionLayer.name;
  }

  /* -------------------------------------------- */

  /**
   * The RegionLegend application of this RegionLayer.
   * @type {RegionLegend}
   */
  get legend() {
    return this.#legend ??= new RegionLegend();
  }

  #legend;

  /* -------------------------------------------- */

  /**
   * The graphics used to draw the highlighted shape.
   * @type {PIXI.Graphics}
   */
  #highlight;

  /* -------------------------------------------- */

  /**
   * The graphics used to draw the preview of the shape that is drawn.
   * @type {PIXI.Graphics}
   */
  #preview;

  /* -------------------------------------------- */
  /*  Methods
  /* -------------------------------------------- */

  /** @inheritDoc */
  _activate() {
    super._activate();
    // noinspection ES6MissingAwait
    this.legend.render({force: true});
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _deactivate() {
    super._deactivate();
    this.objects.visible = true;
    // noinspection ES6MissingAwait
    this.legend.close({animate: false});
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  storeHistory(type, data, options) {
    if ( type === "update" ) {
      for ( const d of data ) delete d.behaviors;
    }
    super.storeHistory(type, data, options);
  }

  /* -------------------------------------------- */

  /** @override */
  copyObjects() {
    return []; // Prevent copy & paste
  }

  /* -------------------------------------------- */

  /** @override */
  getSnappedPoint(point) {
    const M = CONST.GRID_SNAPPING_MODES;
    const size = canvas.dimensions.size;
    return canvas.grid.getSnappedPoint({x: point.x, y: point.y}, canvas.forceSnapVertices ? {mode: M.VERTEX} : {
      mode: M.CENTER | M.VERTEX | M.CORNER | M.SIDE_MIDPOINT,
      resolution: size >= 128 ? 8 : (size >= 64 ? 4 : 2)
    });
  }

  /* -------------------------------------------- */

  /** @override */
  getZIndex() {
    return this.active ? this.options.zIndexActive : this.options.zIndex;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _draw(options) {
    await super._draw(options);
    this.objects.sortChildren = RegionLayer.#sortRegions;
    this.objects.visible = true;
    this.#highlight = this.addChild(new PIXI.Graphics());
    this.#highlight.eventMode = "none";
    this.#highlight.visible = false;
    this.#preview = this.addChild(new PIXI.Graphics());
    this.#preview.eventMode = "none";
    this.#preview.visible = false;
    this.filters = [VisionMaskFilter.create()];
    this.filterArea = canvas.app.screen;

    /** @deprecated since v13 */
    for ( const region of canvas.scene.regions ) {
      for ( const behavior of region.behaviors ) {
        if ( behavior.hasEvent("behaviorStatus") ) {
          foundry.utils.logCompatibilityWarning(`RegionBehavior [${behavior.uuid}] subscribes to the BEHAVIOR_STATUS event, `
            + "which is deprecated in favor of BEHAVIOR_ACTIVATED, BEHAVIOR_DEACTIVATED, BEHAVIOR_VIEWED, and BEHAVIOR_UNVIEWED.", {since: 13, until: 15});
        }
        if ( behavior.hasEvent("tokenMove") ) {
          foundry.utils.logCompatibilityWarning(`RegionBehavior [${behavior.uuid}] subscribes to the TOKEN_MOVE event, `
            + "which is deprecated in favor of TOKEN_MOVE_WITHIN and is no longer triggered.", {since: 13, until: 15});
        }
        if ( behavior.hasEvent("tokenPreMove") ) {
          foundry.utils.logCompatibilityWarning(`RegionBehavior [${behavior.uuid}] subscribes to the TOKEN_PRE_MOVE event, `
            + "which is deprecated without replacement and is no longer triggered.", {since: 13, until: 15});
        }
      }
    }
  }

  /* -------------------------------------------- */

  /**
   * Highlight the shape or clear the highlight.
   * @param {BaseShapeData|null} data    The shape to highlight, or null to clear the highlight
   * @internal
   */
  _highlightShape(data) {
    this.#highlight.clear();
    this.#highlight.visible = false;
    if ( !data ) return;
    const s = canvas.dimensions.uiScale;
    this.#highlight.visible = true;
    this.#highlight.lineStyle({
      width: CONFIG.Canvas.objectBorderThickness * s,
      color: 0x000000,
      join: PIXI.LINE_JOIN.ROUND,
      shader: new PIXI.smooth.DashLineShader({dash: 8 * s, gap: 5 * s})
    });
    switch ( data.type ) {
      case "circle":
        this.#highlight.drawCircle(data.x, data.y, data.radius);
        break;
      case "ellipse":
        if ( data.rotation !== 0 ) {
          this.#highlight.setMatrix(new PIXI.Matrix()
            .translate(-data.x, -data.y)
            .rotate(Math.toRadians(data.rotation))
            .translate(data.x, data.y));
        }
        this.#highlight.drawEllipse(data.x, data.y, data.radiusX, data.radiusY);
        break;
      case "polygon":
        this.#highlight.drawPolygon(data.points);
        break;
      case "rectangle":
        if ( data.rotation !== 0 ) {
          const centerX = data.x + (data.width / 2);
          const centerY = data.y + (data.height / 2);
          this.#highlight.setMatrix(new PIXI.Matrix()
            .translate(-centerX, -centerY)
            .rotate(Math.toRadians(data.rotation))
            .translate(centerX, centerY));
        }
        this.#highlight.drawRect(data.x, data.y, data.width, data.height);
        break;
      default: throw new Error("Invalid shape type");
    }
  }

  /* -------------------------------------------- */

  /**
   * Refresh the preview shape.
   * @param {PIXI.FederatedEvent} event
   */
  #refreshPreview(event) {
    const s = canvas.dimensions.uiScale;
    this.#preview.clear();
    this.#preview.lineStyle({
      width: CONFIG.Canvas.objectBorderThickness * s,
      color: 0x000000,
      join: PIXI.LINE_JOIN.ROUND,
      cap: PIXI.LINE_CAP.ROUND,
      alignment: 0.75
    });
    this.#preview.beginFill(event.interactionData.drawingColor, 0.5);
    this.#drawPreviewShape(event);
    this.#preview.endFill();
    this.#preview.lineStyle({
      width: CONFIG.Canvas.objectBorderThickness / 2 * s,
      color: CONFIG.Canvas.dispositionColors.CONTROLLED,
      join: PIXI.LINE_JOIN.ROUND,
      cap: PIXI.LINE_CAP.ROUND,
      alignment: 1
    });
    this.#drawPreviewShape(event);
  }

  /* -------------------------------------------- */

  /**
   * Draw the preview shape.
   * @param {PIXI.FederatedEvent} event
   */
  #drawPreviewShape(event) {
    const data = this.#createShapeData(event);
    if ( !data ) return;
    switch ( data.type ) {
      case "rectangle": this.#preview.drawRect(data.x, data.y, data.width, data.height); break;
      case "circle": this.#preview.drawCircle(data.x, data.y, data.radius); break;
      case "ellipse": this.#preview.drawEllipse(data.x, data.y, data.radiusX, data.radiusY); break;
      case "polygon":
        const polygon = new PIXI.Polygon(data.points);
        if ( !polygon.isPositive ) polygon.reverseOrientation();
        this.#preview.drawPath(polygon.points);
        break;
    }
  }

  /* -------------------------------------------- */

  /**
   * Create the shape data.
   * @param {PIXI.FederatedEvent} event
   * @returns {object|void}
   */
  #createShapeData(event) {
    let data;
    switch ( event.interactionData.drawingTool ) {
      case "rectangle": data = this.#createRectangleData(event); break;
      case "ellipse": data = this.#createCircleOrEllipseData(event); break;
      case "polygon": data = this.#createPolygonData(event); break;
    }
    if ( !data ) return;
    data.hole = ui.controls.controls.regions.tools.hole.active;
    return data;
  }

  /* -------------------------------------------- */

  /**
   * Create the rectangle shape data.
   * @param {PIXI.FederatedEvent} event
   * @returns {object|void}
   */
  #createRectangleData(event) {
    const {origin, destination} = event.interactionData;
    let dx = Math.abs(destination.x - origin.x);
    let dy = Math.abs(destination.y - origin.y);
    if ( event.altKey ) dx = dy = Math.min(dx, dy);
    let x = origin.x;
    let y = origin.y;
    if ( event.ctrlKey || event.metaKey ) {
      x -= dx;
      y -= dy;
      dx *= 2;
      dy *= 2;
    } else {
      if ( origin.x > destination.x ) x -= dx;
      if ( origin.y > destination.y ) y -= dy;
    }
    if ( (dx === 0) || (dy === 0) ) return;
    return {type: "rectangle", x, y, width: dx, height: dy, rotation: 0};
  }

  /* -------------------------------------------- */

  /**
   * Create the circle or ellipse shape data.
   * @param {PIXI.FederatedEvent} event
   * @returns {object|void}
   */
  #createCircleOrEllipseData(event) {
    const {origin, destination} = event.interactionData;
    let dx = Math.abs(destination.x - origin.x);
    let dy = Math.abs(destination.y - origin.y);
    if ( event.altKey ) dx = dy = Math.min(dx, dy);
    let x = origin.x;
    let y = origin.y;
    if ( !(event.ctrlKey || event.metaKey) ) {
      if ( origin.x > destination.x ) x -= dx;
      if ( origin.y > destination.y ) y -= dy;
      dx /= 2;
      dy /= 2;
      x += dx;
      y += dy;
    }
    if ( (dx === 0) || (dy === 0) ) return;
    return event.altKey
      ? {type: "circle", x, y, radius: dx}
      : {type: "ellipse", x, y, radiusX: dx, radiusY: dy, rotation: 0};
  }

  /* -------------------------------------------- */

  /**
   * Create the polygon shape data.
   * @param {PIXI.FederatedEvent} event
   * @returns {object|void}
   */
  #createPolygonData(event) {
    let {destination, points, complete} = event.interactionData;
    if ( !complete ) points = [...points, destination.x, destination.y];
    else if ( points.length < 6 ) return;
    return {type: "polygon", points};
  }

  /* -------------------------------------------- */

  /** @override */
  static prepareSceneControls() {
    const sc = SceneControls;
    return {
      name: "regions",
      order: 9,
      title: "CONTROLS.GroupRegion",
      layer: "regions",
      icon: "fa-regular fa-game-board",
      visible: game.user.isGM,
      onChange: (event, active) => {
        if ( active ) canvas.regions.activate();
      },
      onToolChange: () => canvas.regions.setAllRenderFlags({refreshState: true}),
      tools: {
        select: {
          name: "select",
          order: 1,
          title: "CONTROLS.RegionSelect",
          icon: "fa-solid fa-expand",
          toolclip: {
            src: "toolclips/tools/region-select.webm",
            heading: "CONTROLS.RegionSelect",
            items: sc.buildToolclipItems([{paragraph: "CONTROLS.RegionSelectP"}, "selectAlt", "selectMultiple",
              "edit", "delete"])
          }
        },
        rectangle: {
          name: "rectangle",
          order: 2,
          title: "CONTROLS.RegionRectangle",
          icon: "fa-solid fa-square",
          toolclip: {
            src: "toolclips/tools/region-rectangle.webm",
            heading: "CONTROLS.RegionRectangle",
            items: sc.buildToolclipItems([{paragraph: "CONTROLS.RegionShape"}, "draw", "drawProportionally",
              {paragraph: "CONTROLS.RegionPerformance"}])
          }
        },
        ellipse: {
          name: "ellipse",
          order: 3,
          title: "CONTROLS.RegionEllipse",
          icon: "fa-solid fa-circle",
          toolclip: {
            src: "toolclips/tools/region-ellipse.webm",
            heading: "CONTROLS.RegionEllipse",
            items: sc.buildToolclipItems([{paragraph: "CONTROLS.RegionShape"}, "draw", "drawProportionally",
              {paragraph: "CONTROLS.RegionPerformance"}])
          }
        },
        polygon: {
          name: "polygon",
          order: 4,
          title: "CONTROLS.RegionPolygon",
          icon: "fa-solid fa-draw-polygon",
          toolclip: {
            src: "toolclips/tools/region-polygon.webm",
            heading: "CONTROLS.RegionPolygon",
            items: sc.buildToolclipItems([{paragraph: "CONTROLS.RegionShape"}, "draw", "drawProportionally",
              {paragraph: "CONTROLS.RegionPerformance"}])
          }
        },
        hole: {
          name: "hole",
          order: 5,
          title: "CONTROLS.RegionHole",
          icon: "fa-duotone fa-object-subtract",
          toggle: true,
          active: false,
          toolclip: {
            src: "toolclips/tools/region-hole.webm",
            heading: "CONTROLS.RegionHole",
            items: sc.buildToolclipItems([{paragraph: "CONTROLS.RegionHoleP"}])
          }
        },
        snap: {
          name: "snap",
          order: 6,
          title: "CONTROLS.CommonForceSnap",
          icon: "fa-solid fa-plus",
          toggle: true,
          visible: !canvas.grid?.isGridless,
          active: canvas.forceSnapVertices,
          onChange: (event, toggled) => canvas.forceSnapVertices = toggled,
          toolclip: {
            src: "toolclips/tools/region-snap.webm",
            heading: "CONTROLS.CommonForceSnap",
            items: sc.buildToolclipItems([{paragraph: "CONTROLS.RegionSnap"}, "draw", "drawProportionally"])
          }
        },
        clear: {
          name: "clear",
          order: 7,
          title: "CONTROLS.RegionClear",
          icon: "fa-solid fa-trash",
          onChange: () => canvas.regions.deleteAll(),
          button: true
        }
      },
      activeTool: "select"
    };
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _onClickLeft(event) {
    const interaction = event.interactionData;

    // Continue polygon point placement
    if ( interaction.drawingTool === "polygon" ) {
      const {destination, points} = interaction;
      const point = !event.shiftKey ? this.getSnappedPoint(destination) : destination;

      // Clicking on the first point closes the shape
      if ( point.x.almostEqual(points.at(0)) && point.y.almostEqual(points.at(1)) ) {
        interaction.complete = true;
      }

      // Don't add the point if it is equal to the last one
      else if ( !(point.x.almostEqual(points.at(-2)) && point.y.almostEqual(points.at(-1))) ) {
        interaction.points.push(point.x, point.y);
        this.#refreshPreview(event);
      }
      return;
    }

    // If one of the drawing tools is selected, prevent left-click-to-release
    if ( ["rectangle", "ellipse", "polygon"].includes(game.activeTool) ) return;

    // Standard left-click handling
    super._onClickLeft(event);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onClickLeft2(event) {
    const interaction = event.interactionData;

    // Conclude polygon drawing with a double-click
    if ( interaction.drawingTool === "polygon" ) {
      interaction.complete = true;
      return;
    }

    // Standard double-click handling
    super._onClickLeft2(event);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _canDragLeftStart(user, event) {
    if ( !super._canDragLeftStart(user, event) ) return false;
    if ( !["rectangle", "ellipse", "polygon"].includes(game.activeTool) ) return false;
    if ( this.controlled.length > 1 ) {
      ui.notifications.error("REGION.NOTIFICATIONS.DrawingMultipleRegionsControlled", {localize: true});
      return false;
    }
    if ( this.controlled.at(0)?.document.locked ) {
      ui.notifications.warn("CONTROLS.ObjectIsLocked", {format: {
        type: game.i18n.localize(RegionDocument.metadata.label)}});
      return false;
    }
    return true;
  }

  /* -------------------------------------------- */

  /** @override */
  _onDragLeftStart(event) {
    const interaction = event.interactionData;
    if ( !event.shiftKey ) interaction.origin = this.getSnappedPoint(interaction.origin);

    // Set drawing tool
    interaction.drawingTool = game.activeTool;
    interaction.drawingRegion = this.controlled.at(0);
    interaction.drawingColor = interaction.drawingRegion?.document.color
      ?? Color.from(RegionDocument.schema.fields.color.getInitialValue({}));

    // Initialize the polygon points with the origin
    if ( interaction.drawingTool === "polygon" ) {
      const point = interaction.origin;
      interaction.points = [point.x, point.y];
    }
    this.#refreshPreview(event);
    this.#preview.visible = true;
  }

  /* -------------------------------------------- */

  /** @override */
  _onDragLeftMove(event) {
    const interaction = event.interactionData;
    if ( !interaction.drawingTool ) return;
    if ( !event.shiftKey ) interaction.destination = this.getSnappedPoint(interaction.destination);
    this.#refreshPreview(event);
  }

  /* -------------------------------------------- */

  /** @override */
  _onDragLeftDrop(event) {
    const interaction = event.interactionData;
    if ( !interaction.drawingTool ) return;
    if ( !event.shiftKey ) interaction.destination = this.getSnappedPoint(interaction.destination);

    // In-progress polygon drawing
    if ( (interaction.drawingTool === "polygon") && (interaction.complete !== true) ) {
      event.preventDefault();
      return;
    }

    // Clear preview and refresh Regions
    this.#preview.clear();
    this.#preview.visible = false;

    // Create the shape from the preview
    const shape = this.#createShapeData(event);
    if ( !shape ) return;

    // Add the shape to controlled Region or create a new Region if none is controlled
    const region = interaction.drawingRegion;
    if ( region ) {
      if ( !region.document.locked ) region.document.update({shapes: [...region.document.shapes, shape]});
    } else RegionDocument.implementation.create({
      name: RegionDocument.implementation.defaultName({parent: canvas.scene}),
      color: interaction.drawingColor,
      shapes: [shape]
    }, {parent: canvas.scene, renderSheet: true}).then(r => r.object.control({releaseOthers: true}));
  }

  /* -------------------------------------------- */

  /** @override */
  _onDragLeftCancel(event) {
    const interaction = event.interactionData;
    if ( !interaction.drawingTool ) return;

    // Remove point from in-progress polygon drawing
    if ( (interaction.drawingTool === "polygon") && (interaction.complete !== true) && !interaction.cancelled ) {
      interaction.points.splice(-2, 2);
      if ( interaction.points.length ) {
        event.preventDefault();
        this.#refreshPreview(event);
        return;
      }
    }

    // Clear preview and refresh Regions
    this.#preview.clear();
    this.#preview.visible = false;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onClickRight(event) {
    const interaction = event.interactionData;
    if ( interaction.drawingTool ) return canvas.mouseInteractionManager._dragRight = false;
    super._onClickRight(event);
  }
}

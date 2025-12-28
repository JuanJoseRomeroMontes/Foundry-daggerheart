import DrawingDocument from "@client/documents/drawing.mjs";
import SceneControls from "../../applications/ui/scene-controls.mjs";
import Drawing from "../placeables/drawing.mjs";
import PlaceablesLayer from "./base/placeables-layer.mjs";
import {getDocumentClass} from "../../utils/helpers.mjs";

/**
 * @import Collection from "@common/utils/collection.mjs";
 * @import {Point} from "@common/_types.mjs";
 */

/**
 * The DrawingsLayer subclass of PlaceablesLayer.
 * This layer implements a container for drawings.
 * @category Canvas
 */
export default class DrawingsLayer extends PlaceablesLayer {

  /** @inheritdoc */
  static get layerOptions() {
    return foundry.utils.mergeObject(super.layerOptions, {
      name: "drawings",
      controllableObjects: true,
      rotatableObjects: true,
      zIndex: 500
    });
  }

  /** @inheritdoc */
  static documentName = "Drawing";

  /**
   * The named game setting which persists default drawing configuration for the User
   * @type {string}
   */
  static DEFAULT_CONFIG_SETTING = "defaultDrawingConfig";

  /**
   * The collection of drawing objects which are rendered in the interface.
   * @type {Collection<string, Drawing>}
   */
  graphics = new foundry.utils.Collection();

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /** @inheritdoc */
  get hud() {
    return canvas.hud.drawing;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  get hookName() {
    return DrawingsLayer.name;
  }

  /* -------------------------------------------- */
  /*  Methods                                     */
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

  /** @inheritDoc */
  _getCopyableObjects(options) {
    if ( !game.user.can("DRAWING_CREATE") ) return [];
    return super._getCopyableObjects(options);
  }

  /* -------------------------------------------- */

  /**
   * Render a configuration sheet to configure the default Drawing settings
   */
  configureDefault() {
    const defaults = game.settings.get("core", DrawingsLayer.DEFAULT_CONFIG_SETTING);
    const document = DrawingDocument.fromSource({...defaults, shape: {type: "p", width: 1, height: 1, points: [0, 0, 1, 0]}});
    new foundry.applications.sheets.DrawingConfig({document, configureDefault: true}).render({force: true});
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _deactivate() {
    super._deactivate();
    this.objects.visible = true;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _draw(options) {
    await super._draw(options);
    this.objects.visible = true;
  }

  /* -------------------------------------------- */

  /**
   * Get initial data for a new drawing.
   * Start with some global defaults, apply user default config, then apply mandatory overrides per tool.
   * @param {Point} origin      The initial coordinate
   * @returns {object}          The new drawing data
   * @protected
   */
  _getNewDrawingData(origin) {
    const tool = game.activeTool;

    // Get saved user defaults
    const defaults = game.settings.get("core", this.constructor.DEFAULT_CONFIG_SETTING);
    const data = foundry.utils.deepClone(defaults);

    // Mandatory additions
    delete data._id;
    data.x = origin.x;
    data.y = origin.y;
    data.sort = Math.max(this.getMaxSort() + 1, 0);
    data.author = game.user.id;
    data.shape = {};

    // Information toggle
    const interfaceToggle = ui.controls.controls.drawings.tools.role;
    data.interface = interfaceToggle?.active;

    // Tool-based settings
    const strokeWidth = data.strokeWidth ?? 8;
    switch ( tool ) {
      case "rect":
        data.shape.type = Drawing.SHAPE_TYPES.RECTANGLE;
        data.shape.width = strokeWidth + 1;
        data.shape.height = strokeWidth + 1;
        break;
      case "ellipse":
        data.shape.type = Drawing.SHAPE_TYPES.ELLIPSE;
        data.shape.width = strokeWidth + 1;
        data.shape.height = strokeWidth + 1;
        break;
      case "polygon":
        data.shape.type = Drawing.SHAPE_TYPES.POLYGON;
        data.shape.points = [0, 0, 1, 0];
        data.bezierFactor = 0;
        break;
      case "freehand":
        data.shape.type = Drawing.SHAPE_TYPES.POLYGON;
        data.shape.points = [0, 0, 1, 0];
        break;
      case "text":
        data.shape.type = Drawing.SHAPE_TYPES.RECTANGLE;
        data.shape.width = strokeWidth + 1;
        data.shape.height = strokeWidth + 1;
        data.fillColor = "#ffffff";
        data.fillAlpha = 0.10;
        data.strokeColor = "#ffffff";
        data.text ||= "";
        break;
    }

    // Return the cleaned data
    return DrawingDocument.cleanData(data);
  }

  /* -------------------------------------------- */

  /** @override */
  static prepareSceneControls() {
    const sc = SceneControls;
    return {
      name: "drawings",
      order: 4,
      title: "CONTROLS.GroupDrawing",
      layer: "drawings",
      icon: "fa-solid fa-pencil",
      visible: game.user.can("DRAWING_CREATE"),
      onChange: (event, active) => {
        if ( active ) canvas.drawings.activate();
      },
      onToolChange: () => canvas.drawings.setAllRenderFlags({refreshState: true}),
      tools: {
        select: {
          name: "select",
          order: 1,
          title: "CONTROLS.DrawingSelect",
          icon: "fa-solid fa-expand",
          toolclip: {
            src: "toolclips/tools/drawing-select.webm",
            heading: "CONTROLS.DrawingSelect",
            items: sc.buildToolclipItems(["selectAlt", "selectMultiple", "move", "hud", "edit", "delete", "rotate"])
          }
        },
        rect: {
          name: "rect",
          order: 2,
          title: "CONTROLS.DrawingRect",
          icon: "fa-solid fa-square",
          toolclip: {
            src: "toolclips/tools/drawing-rect.webm",
            heading: "CONTROLS.DrawingRect",
            items: sc.buildToolclipItems(["draw", "move", "hud", "edit", "delete", "rotate"])
          }
        },
        ellipse: {
          name: "ellipse",
          order: 3,
          title: "CONTROLS.DrawingEllipse",
          icon: "fa-solid fa-circle",
          toolclip: {
            src: "toolclips/tools/drawing-ellipse.webm",
            heading: "CONTROLS.DrawingEllipse",
            items: sc.buildToolclipItems(["draw", "move", "hud", "edit", "delete", "rotate"])
          }
        },
        polygon: {
          name: "polygon",
          order: 4,
          title: "CONTROLS.DrawingPoly",
          icon: "fa-solid fa-draw-polygon",
          toolclip: {
            src: "toolclips/tools/drawing-polygon.webm",
            heading: "CONTROLS.DrawingPoly",
            items: sc.buildToolclipItems([{heading: "CONTROLS.CommonDraw", content: "CONTROLS.DrawingPolyP"},
              "move", "hud", "edit", "delete", "rotate"])
          }
        },
        freehand: {
          name: "freehand",
          order: 5,
          title: "CONTROLS.DrawingFree",
          icon: "fa-solid fa-signature",
          toolclip: {
            src: "toolclips/tools/drawing-free.webm",
            heading: "CONTROLS.DrawingFree",
            items: sc.buildToolclipItems(["draw", "move", "hud", "edit", "delete", "rotate"])
          }
        },
        text: {
          name: "text",
          order: 6,
          title: "CONTROLS.DrawingText",
          icon: "fa-solid fa-font",
          onChange: () => {
            const controlled = canvas.drawings.controlled;
            if ( controlled.length === 1 ) controlled[0].enableTextEditing();
          },
          toolclip: {
            src: "toolclips/tools/drawing-text.webm",
            heading: "CONTROLS.DrawingText",
            items: sc.buildToolclipItems(["draw", "move", "hud", "edit", "delete", "rotate"])
          }
        },
        role: {
          name: "role",
          order: 7,
          title: "CONTROLS.DrawingRole",
          icon: "fa-solid fa-circle-info",
          toggle: true,
          active: false
        },
        snap: {
          name: "snap",
          order: 8,
          title: "CONTROLS.CommonForceSnap",
          icon: "fa-solid fa-plus",
          toggle: true,
          visible: !canvas.grid?.isGridless,
          active: canvas.forceSnapVertices,
          onChange: (event, toggled) => canvas.forceSnapVertices = toggled
        },
        configure: {
          name: "configure",
          order: 9,
          title: "CONTROLS.DrawingConfig",
          icon: "fa-solid fa-gear",
          onChange: () => canvas.drawings.configureDefault(),
          button: true
        },
        clear: {
          name: "clear",
          order: 10,
          title: "CONTROLS.DrawingClear",
          icon: "fa-solid fa-trash",
          visible: game.user.isGM,
          onChange: () => canvas.drawings.deleteAll(),
          button: true
        }
      },
      activeTool: "select"
    };
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /** @inheritdoc */
  _onClickLeft(event) {
    const {preview, drawingsState, destination} = event.interactionData;

    // Continue polygon point placement
    if ( (drawingsState >= 1) && preview.isPolygon ) {
      preview._addPoint(destination, {snap: !event.shiftKey, round: true});
      preview._chain = true; // Note that we are now in chain mode
      return preview.refresh();
    }

    // Standard left-click handling
    super._onClickLeft(event);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onClickLeft2(event) {
    const {drawingsState, preview} = event.interactionData;

    // Conclude polygon placement with double-click
    if ( (drawingsState >= 1) && preview.isPolygon ) {
      event.interactionData.drawingsState = 2;
      return;
    }

    // Standard double-click handling
    super._onClickLeft2(event);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onDragLeftStart(event) {
    super._onDragLeftStart(event);
    const interaction = event.interactionData;

    // Snap the origin to the grid
    const isFreehand = game.activeTool === "freehand";
    if ( !event.shiftKey && !isFreehand ) {
      interaction.origin = this.getSnappedPoint(interaction.origin);
    }

    // Create the preview object
    const cls = getDocumentClass("Drawing");
    let document;
    try {
      document = new cls(this._getNewDrawingData(interaction.origin), {parent: canvas.scene});
    }
    catch(e) {
      if ( e instanceof foundry.data.validation.DataModelValidationError ) {
        ui.notifications.error("DRAWING.JointValidationErrorUI", {localize: true});
      }
      throw e;
    }
    const drawing = new this.constructor.placeableClass(document);
    drawing._fixedPoints = [0, 0];
    document._object = drawing;
    interaction.preview = this.preview.addChild(drawing);
    interaction.drawingsState = 1;
    drawing.draw();
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onDragLeftMove(event) {
    const {preview, drawingsState} = event.interactionData;
    if ( !preview || preview._destroyed ) return;
    if ( preview.parent === null ) { // In theory this should never happen, but rarely does
      this.preview.addChild(preview);
    }
    if ( drawingsState >= 1 ) {
      preview._onMouseDraw(event);
      const isFreehand = game.activeTool === "freehand";
      if ( !preview.isPolygon || isFreehand ) event.interactionData.drawingsState = 2;
    }
  }

  /* -------------------------------------------- */

  /** @override */
  _onDragLeftDrop(event) {
    const interaction = event.interactionData;

    // Snap the destination to the grid
    const isFreehand = game.activeTool === "freehand";
    if ( !event.shiftKey && !isFreehand ) {
      interaction.destination = this.getSnappedPoint(interaction.destination);
    }

    const {drawingsState, destination, origin, preview} = interaction;

    // Successful drawing completion
    if ( drawingsState === 2 ) {
      const distance = Math.hypot(Math.max(destination.x, origin.x) - preview.x,
        Math.max(destination.y, origin.x) - preview.y);
      const minDistance = distance >= (canvas.dimensions.size / 8);
      const completePolygon = preview.isPolygon && (preview.document.shape.points.length > 4);

      // Create a completed drawing
      if ( minDistance || completePolygon ) {
        event.interactionData.clearPreviewContainer = false;
        event.interactionData.drawingsState = 0;
        const data = preview.document.toObject(false);

        // Create the object
        preview._chain = false;
        const cls = getDocumentClass("Drawing");
        const createData = this.constructor.placeableClass.normalizeShape(data);
        cls.create(createData, {parent: canvas.scene}).then(d => {
          const o = d.object;
          o._creating = true;
          if ( game.activeTool !== "freehand" ) o.control({isNew: true});
        }).finally(() => this.clearPreviewContainer());
      }
    }

    // In-progress polygon
    if ( (drawingsState === 1) && preview.isPolygon ) event.preventDefault();
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onDragLeftCancel(event) {
    const preview = this.preview.children?.[0] || null;
    if ( preview?._chain ) {
      preview._removePoint();
      preview.refresh();
      if ( preview.document.shape.points.length && !event.interactionData.cancelled ) return event.preventDefault();
    }
    event.interactionData.drawingsState = 0;
    super._onDragLeftCancel(event);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onClickRight(event) {
    const preview = this.preview.children?.[0] || null;
    if ( preview ) return canvas.mouseInteractionManager._dragRight = false;
    super._onClickRight(event);
  }

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  get gridPrecision() {
    // eslint-disable-next-line no-unused-expressions
    super.gridPrecision;
    if ( canvas.grid.type === CONST.GRID_TYPES.GRIDLESS ) return 0;
    return canvas.dimensions.size >= 128 ? 16 : 8;
  }
}

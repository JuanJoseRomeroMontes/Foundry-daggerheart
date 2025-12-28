import PlaceablesLayer from "./base/placeables-layer.mjs";
import SceneControls from "../../applications/ui/scene-controls.mjs";
import Ray from "../geometry/shapes/ray.mjs";

/**
 * This Canvas Layer provides a container for MeasuredTemplate objects.
 * @category Canvas
 */
export default class TemplateLayer extends PlaceablesLayer {

  /** @inheritdoc */
  static get layerOptions() {
    return foundry.utils.mergeObject(super.layerOptions, {
      name: "templates",
      rotatableObjects: true,
      zIndex: 400
    });
  }

  /** @inheritdoc */
  static documentName = "MeasuredTemplate";

  /* -------------------------------------------- */

  /** @inheritdoc */
  get hookName() {
    return TemplateLayer.name;
  }

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _getCopyableObjects(options) {
    if ( !game.user.can("TEMPLATE_CREATE") ) return [];
    return super._getCopyableObjects(options);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _deactivate() {
    super._deactivate();
    this.objects.visible = true;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _draw(options) {
    await super._draw(options);
    this.objects.visible = true;
  }

  /* -------------------------------------------- */

  /**
   * Register game settings used by the TemplatesLayer
   */
  static registerSettings() {
    game.settings.register("core", "gridTemplates", {
      name: "TEMPLATE.GridTemplatesSetting",
      hint: "TEMPLATE.GridTemplatesSettingHint",
      scope: "world",
      config: true,
      type: new foundry.data.fields.BooleanField({initial: false}),
      onChange: () => {
        if ( canvas.ready ) canvas.templates.draw();
      }
    });
    game.settings.register("core", "coneTemplateType", {
      name: "TEMPLATE.ConeTypeSetting",
      hint: "TEMPLATE.ConeTypeSettingHint",
      scope: "world",
      config: true,
      type: new foundry.data.fields.StringField({required: true, blank: false, initial: "round", choices: {
        round: "TEMPLATE.ConeTypeRound",
        flat: "TEMPLATE.ConeTypeFlat"
      }}),
      onChange: () => {
        if ( canvas.ready ) canvas.templates.draw();
      }
    });
  }

  /* -------------------------------------------- */

  /** @override */
  static prepareSceneControls() {
    const sc = SceneControls;
    return {
      name: "templates",
      order: 2,
      title: "CONTROLS.GroupMeasure",
      icon: "fa-solid fa-ruler-combined",
      visible: game.user.can("TEMPLATE_CREATE"),
      onChange: (event, active) => {
        if ( active ) canvas.templates.activate();
      },
      onToolChange: () => canvas.templates.setAllRenderFlags({refreshState: true}),
      tools: {
        circle: {
          name: "circle",
          order: 1,
          title: "CONTROLS.MeasureCircle",
          icon: "fa-regular fa-circle",
          toolclip: {
            src: "toolclips/tools/measure-circle.webm",
            heading: "CONTROLS.MeasureCircle",
            items: sc.buildToolclipItems(["create", "move", "edit", "hide", "delete"])
          }
        },
        cone: {
          name: "cone",
          order: 2,
          title: "CONTROLS.MeasureCone",
          icon: "fa-solid fa-angle-left",
          toolclip: {
            src: "toolclips/tools/measure-cone.webm",
            heading: "CONTROLS.MeasureCone",
            items: sc.buildToolclipItems(["create", "move", "edit", "hide", "delete", "rotate"])
          }
        },
        rect: {
          name: "rect",
          order: 3,
          title: "CONTROLS.MeasureRect",
          icon: "fa-regular fa-square",
          toolclip: {
            src: "toolclips/tools/measure-rect.webm",
            heading: "CONTROLS.MeasureRect",
            items: sc.buildToolclipItems(["create", "move", "edit", "hide", "delete", "rotate"])
          }
        },
        ray: {
          name: "ray",
          order: 4,
          title: "CONTROLS.MeasureRay",
          icon: "fa-solid fa-up-down",
          toolclip: {
            src: "toolclips/tools/measure-ray.webm",
            heading: "CONTROLS.MeasureRay",
            items: sc.buildToolclipItems(["create", "move", "edit", "hide", "delete", "rotate"])
          }
        },
        clear: {
          name: "clear",
          order: 5,
          title: "CONTROLS.MeasureClear",
          icon: "fa-solid fa-trash",
          visible: game.user.isGM,
          onChange: () => canvas.templates.deleteAll(),
          button: true
        }
      },
      activeTool: "circle"
    };
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /** @inheritdoc */
  _onDragLeftStart(event) {
    super._onDragLeftStart(event);
    const interaction = event.interactionData;

    // Snap the origin to the grid
    if ( !event.shiftKey ) interaction.origin = this.getSnappedPoint(interaction.origin);

    // Create a pending MeasuredTemplateDocument
    const tool = game.activeTool;
    const previewData = {
      user: game.user.id,
      t: tool,
      x: interaction.origin.x,
      y: interaction.origin.y,
      sort: Math.max(this.getMaxSort() + 1, 0),
      distance: 1,
      direction: 0,
      fillColor: game.user.color || "#FF0000",
      hidden: event.altKey
    };
    const defaults = CONFIG.MeasuredTemplate.defaults;
    if ( tool === "cone") previewData.angle = defaults.angle;
    else if ( tool === "ray" ) previewData.width = (defaults.width * canvas.dimensions.distance);
    const cls = foundry.utils.getDocumentClass("MeasuredTemplate");
    const doc = new cls(previewData, {parent: canvas.scene});

    // Create a preview MeasuredTemplate object
    const template = new this.constructor.placeableClass(doc);
    doc._object = template;
    interaction.preview = this.preview.addChild(template);
    template.draw();
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onDragLeftMove(event) {
    const interaction = event.interactionData;

    // Snap the destination to the grid
    if ( !event.shiftKey ) interaction.destination = this.getSnappedPoint(interaction.destination);

    // Compute the ray
    const {origin, destination, preview} = interaction;
    const ray = new Ray(origin, destination);
    let distance;

    // Grid type
    if ( game.settings.get("core", "gridTemplates") ) {
      distance = canvas.grid.measurePath([origin, destination]).distance;
    }

    // Euclidean type
    else {
      const ratio = (canvas.dimensions.size / canvas.dimensions.distance);
      distance = ray.distance / ratio;
    }

    // Update the preview object
    preview.document.direction = Math.normalizeDegrees(Math.toDegrees(ray.angle));
    preview.document.distance = distance;
    preview.renderFlags.set({refreshShape: true});
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onMouseWheel(event) {

    // Determine whether we have a hovered template?
    const template = this.hover;
    if ( !template || template.isPreview ) return;

    // Determine the incremental angle of rotation from event data
    const snap = event.shiftKey ? 15 : 5;
    const delta = snap * Math.sign(event.delta);
    return template.rotate(template.document.direction + delta, snap);
  }
}

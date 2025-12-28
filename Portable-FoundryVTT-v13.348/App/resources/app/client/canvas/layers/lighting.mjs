import DialogV2 from "../../applications/api/dialog.mjs";
import SceneControls from "../../applications/ui/scene-controls.mjs";
import PlaceablesLayer from "./base/placeables-layer.mjs";

/**
 * The Lighting Layer which ambient light sources as part of the CanvasEffectsGroup.
 * @category Canvas
 */
export default class LightingLayer extends PlaceablesLayer {

  /** @inheritDoc */
  static documentName = "AmbientLight";

  /** @inheritDoc */
  static get layerOptions() {
    return foundry.utils.mergeObject(super.layerOptions, {
      name: "lighting",
      rotatableObjects: true,
      zIndex: 900
    });
  }

  /**
   * Darkness change event handler function.
   * @type {this["_onDarknessChange"]}
   */
  #onDarknessChange;

  /* -------------------------------------------- */

  /** @inheritDoc */
  get hookName() {
    return LightingLayer.name;
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async _draw(options) {
    await super._draw(options);
    this.#onDarknessChange = this._onDarknessChange.bind(this);
    canvas.environment.addEventListener("darknessChange", this.#onDarknessChange);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _tearDown(options) {
    canvas.environment.removeEventListener("darknessChange", this.#onDarknessChange);
    this.#onDarknessChange = undefined;
    return super._tearDown(options);
  }

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /**
   * Refresh the fields of all the ambient lights on this scene.
   */
  refreshFields() {
    if ( !this.active ) return;
    for ( const ambientLight of this.placeables ) {
      ambientLight.renderFlags.set({refreshField: true});
    }
  }

  /* -------------------------------------------- */

  /** @override */
  _activate() {
    super._activate();
    for ( const p of this.placeables ) p.renderFlags.set({refreshField: true});
  }

  /* -------------------------------------------- */

  /** @override */
  static prepareSceneControls() {
    const sc = SceneControls;
    return {
      name: "lighting",
      order: 6,
      title: "CONTROLS.GroupLighting",
      layer: "lighting",
      icon: "fa-regular fa-lightbulb",
      visible: game.user.isGM,
      onChange: (event, active) => {
        if ( active ) canvas.lighting.activate();
      },
      onToolChange: () => canvas.lighting.setAllRenderFlags({refreshState: true}),
      tools: {
        light: {
          name: "light",
          order: 1,
          title: "CONTROLS.LightDraw",
          icon: "fa-solid fa-lightbulb",
          toolclip: {
            src: "toolclips/tools/light-draw.webm",
            heading: "CONTROLS.LightDraw",
            items: sc.buildToolclipItems(["create", "edit", "rotate", "onOff"])
          }
        },
        day: {
          name: "day",
          order: 2,
          title: "CONTROLS.LightDay",
          icon: "fa-solid fa-sun",
          visible: !canvas.scene?.environment.darknessLock,
          onChange: () => canvas.scene.update(
            {environment: {darknessLevel: 0.0}},
            {animateDarkness: CONFIG.Canvas.darknessToDaylightAnimationMS}
          ),
          button: true,
          toolclip: {
            src: "toolclips/tools/light-day.webm",
            heading: "CONTROLS.LightDay",
            items: sc.buildToolclipItems([{heading: "CONTROLS.MakeDayH", content: "CONTROLS.MakeDayP"},
              {heading: "CONTROLS.AutoLightToggleH", content: "CONTROLS.AutoLightToggleP"}])
          }
        },
        night: {
          name: "night",
          order: 3,
          title: "CONTROLS.LightNight",
          icon: "fa-solid fa-moon",
          visible: !canvas.scene?.environment.darknessLock,
          onChange: () => canvas.scene.update(
            {environment: {darknessLevel: 1.0}},
            {animateDarkness: CONFIG.Canvas.daylightToDarknessAnimationMS}
          ),
          button: true,
          toolclip: {
            src: "toolclips/tools/light-night.webm",
            heading: "CONTROLS.LightNight",
            items: sc.buildToolclipItems([{heading: "CONTROLS.MakeNightH", content: "CONTROLS.MakeNightP"},
              {heading: "CONTROLS.AutoLightToggleH", content: "CONTROLS.AutoLightToggleP"}])
          }
        },
        reset: {
          name: "reset",
          order: 4,
          title: "CONTROLS.LightReset",
          icon: "fa-solid fa-cloud",
          onChange: () => {
            DialogV2.confirm({
              window: {title: "CONTROLS.FOWResetTitle", icon: "fa-solid fa-cloud"},
              content: `<p>${game.i18n.localize("CONTROLS.FOWResetDesc")}</p>`,
              yes: {callback: () => canvas.fog.reset()}
            });
          },
          button: true,
          toolclip: {
            src: "toolclips/tools/light-reset.webm",
            heading: "CONTROLS.LightReset",
            items: [{paragraph: "CONTROLS.LightResetP"}]
          }
        },
        clear: {
          name: "clear",
          order: 5,
          title: "CONTROLS.LightClear",
          icon: "fa-solid fa-trash",
          onChange: () => canvas.lighting.deleteAll(),
          button: true
        }
      },
      activeTool: "light"
    };
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _canDragLeftStart(user, event) {
    // Prevent creating a new light if currently previewing one.
    if ( this.preview.children.length ) {
      ui.notifications.warn("CONTROLS.ObjectConfigured", { localize: true });
      return false;
    }
    return super._canDragLeftStart(user, event);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onDragLeftStart(event) {
    super._onDragLeftStart(event);
    const interaction = event.interactionData;

    // Snap the origin to the grid
    if ( !event.shiftKey ) interaction.origin = this.getSnappedPoint(interaction.origin);

    // Create a pending AmbientLightDocument
    const cls = foundry.utils.getDocumentClass("AmbientLight");
    const doc = new cls(interaction.origin, {parent: canvas.scene});

    // Create the preview AmbientLight object
    const preview = new this.constructor.placeableClass(doc);
    doc._object = preview;

    // Updating interaction data
    interaction.preview = this.preview.addChild(preview);
    interaction.lightsState = 1;

    // Prepare to draw the preview
    preview.draw();
  }

  /* -------------------------------------------- */

  /** @override */
  _onDragLeftMove(event) {
    const {destination, lightsState, preview, origin} = event.interactionData;
    if ( lightsState === 0 ) return;

    // Update the light radius
    const radius = Math.hypot(destination.x - origin.x, destination.y - origin.y);

    // Update the preview object data
    preview.document.config.dim = radius * (canvas.dimensions.distance / canvas.dimensions.size);
    preview.document.config.bright = preview.document.config.dim / 2;

    // Refresh the layer display
    preview.initializeLightSource();
    preview.renderFlags.set({refreshState: true});

    // Confirm the creation state
    event.interactionData.lightsState = 2;
  }

  /* -------------------------------------------- */

  /** @override */
  _onDragLeftCancel(event) {
    super._onDragLeftCancel(event);
    canvas.effects.refreshLighting();
    event.interactionData.lightsState = 0;
  }

  /* -------------------------------------------- */

  /** @override */
  _onMouseWheel(event) {

    // Identify the hovered light source
    const light = this.hover;
    if ( !light || light.isPreview || (light.document.config.angle === 360) ) return;

    // Determine the incremental angle of rotation from event data
    const snap = event.shiftKey ? 15 : 3;
    const delta = snap * Math.sign(event.delta);
    return light.rotate(light.document.rotation + delta, snap);
  }

  /* -------------------------------------------- */

  /**
   * Actions to take when the darkness level of the Scene is changed
   * @param {PIXI.FederatedEvent} event
   * @internal
   */
  _onDarknessChange(event) {
    const {darknessLevel, priorDarknessLevel} = event.environmentData;
    for ( const light of this.placeables ) {
      const {min, max} = light.document.config.darkness;
      if ( darknessLevel.between(min, max) === priorDarknessLevel.between(min, max) ) continue;
      light.initializeLightSource();
      if ( this.active ) light.renderFlags.set({refreshState: true});
    }
  }
}

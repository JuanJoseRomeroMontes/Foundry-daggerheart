import Drawing from "../../canvas/placeables/drawing.mjs";
import {DocumentSheetV2, HandlebarsApplicationMixin} from "../api/_module.mjs";
import FontConfig from "@client/applications/settings/menus/font-config.mjs";

/**
 * @import {ApplicationConfiguration, FormFooterButton} from "../_types.mjs";
 * @import {DocumentSheetConfiguration} from "../api/document-sheet.mjs";
 */

/**
 * @typedef DrawingConfigConfiguration
 * @property {boolean} [configureDefault=false] Configure the default drawing settings, instead of a specific Drawing
 */

/**
 * The Application responsible for configuring a single Drawing document within a parent Scene.
 * @extends DocumentSheetV2
 * @mixes HandlebarsApplication
 */
export default class DrawingConfig extends HandlebarsApplicationMixin(DocumentSheetV2) {

  /**
   * @inheritDoc
   * @type {ApplicationConfiguration & DocumentSheetConfiguration & DrawingConfigConfiguration}
   */
  static DEFAULT_OPTIONS = {
    classes: ["drawing-config"],
    canCreate: true,
    window: {
      contentClasses: ["standard-form"],
      icon: "fa-solid fa-pencil"
    },
    position: {width: 480},
    actions: {resetDefaults: DrawingConfig.#onResetDefaults},
    form: {closeOnSubmit: true}
  };

  /** @override */
  static PARTS = {
    tabs: {template: "templates/generic/tab-navigation.hbs"},
    position: {template: "templates/scene/drawing/position.hbs"},
    lines: {template: "templates/scene/drawing/lines.hbs"},
    fill: {template: "templates/scene/drawing/fill.hbs"},
    text: {template: "templates/scene/drawing/text.hbs"},
    footer: {template: "templates/generic/form-footer.hbs"}
  };

  /** @override */
  static TABS = {
    sheet: {
      tabs: [
        {id: "position", icon: "fa-solid fa-location-dot"},
        {id: "lines", icon: "fa-solid fa-paintbrush"},
        {id: "fill", icon: "fa-regular fa-fill-drip"},
        {id: "text", icon: "fa-solid fa-font"}
      ],
      initial: "position",
      labelPrefix: "DRAWING.TABS"
    }
  };

  /* -------------------------------------------- */

  /** @inheritDoc */
  get id() {
    return this.options.configureDefault ? "drawing-config" : super.id;
  }

  /** @inheritDoc */
  get title() {
    return this.options.configureDefault ? game.i18n.localize("DRAWING.ConfigDefaultTitle") : super.title;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _configureRenderOptions(options) {
    super._configureRenderOptions(options);
    if ( this.options.configureDefault ) {
      options.parts.splice(options.parts.indexOf("position"), 1);
      if ( options.isFirstRender ) this.tabGroups.sheet = "lines";
    }
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const {document, source} = context;
    return Object.assign(context, {
      author: document.author?.name || "",
      scaledBezierFactor: source.bezierFactor * 2,
      drawingRoles: {false: "DRAWING.Object", true: "DRAWING.Information"},
      fillDisabled: source.fillType === CONST.DRAWING_FILL_TYPES.NONE,
      fontFamilies: FontConfig.getAvailableFontChoices(),
      gridUnits: document.parent?.grid.units || canvas.scene.grid.units || game.i18n.localize("GridUnits"),
      userColor: game.user.color,
      buttons: this.#prepareButtons()
    });
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _prepareTabs(group) {
    const tabs = super._prepareTabs(group);
    if ( this.options.configureDefault ) delete tabs.position;
    return tabs;
  }

  /* -------------------------------------------- */

  /**
   * Configure footer buttons for this sheet.
   * @returns {FormFooterButton[]}
   */
  #prepareButtons() {
    const submitAction = this.options.configureDefault ? "Default" : this.document.id ? "Update" : "Create";
    const buttons = [{type: "submit", icon: "fa-solid fa-floppy-disk", label: `DRAWING.Submit${submitAction}`}];
    if ( this.options.configureDefault ) {
      buttons.unshift({
        type: "button",
        action: "resetDefaults",
        icon: "fa-solid fa-arrow-rotate-left",
        label: "DRAWING.SubmitReset"
      });
    }
    return buttons;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _preparePartContext(partId, context, options) {
    const partContext = await super._preparePartContext(partId, context, options);
    if ( partId in partContext.tabs ) partContext.tab = partContext.tabs[partId];
    return partContext;
  }

  /* -------------------------------------------- */

  /** @override */
  _onChangeForm(_formConfig, event) {
    // Toggle the disabled attribute of certain fill fields depending on the fillType.
    if (event.target.name === "fillType") {
      const disabled = Number(event.target.value) === CONST.DRAWING_FILL_TYPES.NONE;
      for (const field of this.element.querySelectorAll("[name=fillColor], [name=fillAlpha]")) {
        field.disabled = disabled;
      }
    }
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _processFormData(event, form, formData) {
    const submitData = super._processFormData(event, form, formData);

    // Un-scale the bezier factor
    submitData.bezierFactor /= 2;

    return submitData;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _processSubmitData(event, form, submitData, options) {

    // Configure the default Drawing settings
    if ( this.options.configureDefault ) {
      await game.settings.set("core", foundry.canvas.layers.DrawingsLayer.DEFAULT_CONFIG_SETTING, submitData);
      return;
    }

    // Rescale dimensions if needed
    const currentShape = this.document._source.shape;
    const newShape = submitData.shape;
    if ( (newShape.width !== currentShape.width) || (newShape.height !== currentShape.height) ) {
      const dx = newShape.width - currentShape.width;
      const dy = newShape.height - currentShape.height;
      foundry.utils.mergeObject(submitData, Drawing.rescaleDimensions(this.document._source, dx, dy));
    }

    return super._processSubmitData(event, form, submitData, options);
  }

  /* -------------------------------------------- */

  /**
   * Reset the client Drawing configuration settings to their default values
   * @this {DrawingConfig}
   * @returns {Promise<void>}
   */
  static async #onResetDefaults() {
    const settingKey = foundry.canvas.layers.DrawingsLayer.DEFAULT_CONFIG_SETTING;
    await game.settings.set("core", settingKey, undefined);
    this.document.updateSource(game.settings.get("core", settingKey));
    await this.render();
  }
}

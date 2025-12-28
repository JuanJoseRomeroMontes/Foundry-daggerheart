import {DocumentSheetV2, HandlebarsApplicationMixin} from "../api/_module.mjs";

/**
 * @import {ApplicationConfiguration, FormFooterButton} from "../_types.mjs";
 * @import {DocumentSheetConfiguration} from "../api/document-sheet.mjs";
 */

/**
 * The Application responsible for configuring a single MeasuredTemplate document within a parent Scene.
 * @param {MeasuredTemplateDocument} object The document being configured.
 * @param {DocumentSheetConfiguration & ApplicationConfiguration} [options] Application configuration options.
 */
export default class MeasuredTemplateConfig extends HandlebarsApplicationMixin(DocumentSheetV2) {
  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    classes: ["template-config"],
    canCreate: true,
    window: {
      contentClasses: ["standard-form"],
      icon: "fa-solid fa-ruler-combined",
      resizable: true
    },
    position: {width: 480},
    form: {closeOnSubmit: true}
  };

  /** @override */
  static PARTS = {
    main: {template: "templates/scene/template-config.hbs", scrollable: [""]},
    footer: {template: "templates/generic/form-footer.hbs"}
  };

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const document = context.document;
    const templateTypes = Object.values(CONST.MEASURED_TEMPLATE_TYPES).reduce((types, type) => {
      types[type] = game.i18n.localize(`TEMPLATE.TYPES.${type}`);
      return types;
    }, {});
    const units = {
      degrees: game.i18n.localize("Degrees"),
      gridUnits: document.parent.grid.units || game.i18n.localize("GridUnits"),
      pixels: game.i18n.localize("Pixels")
    };
    const submitText = document.collection?.has(document.id) ? "TEMPLATE.SubmitUpdate" : "TEMPLATE.SubmitCreate";
    return Object.assign(context, {
      templateTypes,
      units,
      userColor: game.user.color,
      buttons: [{type: "submit", icon: "fa-solid fa-floppy-disk", label: submitText}]
    });
  }
}

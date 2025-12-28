import DocumentSheetV2 from "../api/document-sheet.mjs";
import HandlebarsApplicationMixin from "../api/handlebars-application.mjs";

/**
 * The AmbientSound configuration application.
 * @extends DocumentSheetV2
 * @mixes HandlebarsApplication
 */
export default class AmbientSoundConfig extends HandlebarsApplicationMixin(DocumentSheetV2) {

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    classes: ["ambient-sound-config"],
    window: {
      contentClasses: ["standard-form"]
    },
    position: {width: 560},
    form: {
      closeOnSubmit: true
    },
    canCreate: true
  };

  /** @override */
  static PARTS = {
    body: {
      template: "templates/scene/ambient-sound-config.hbs"
    },
    footer: {
      template: "templates/generic/form-footer.hbs"
    }
  };

  /* -------------------------------------------- */

  /** @inheritDoc */
  get title() {
    if ( !this.document.id ) return game.i18n.localize("AMBIENT_SOUND.ACTIONS.CREATE");
    return super.title;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const document = context.document;
    return Object.assign(context, {
      sound: document,
      gridUnits: document.parent.grid.units || game.i18n.localize("GridUnits"),
      soundEffects: CONFIG.soundEffects,
      buttons: [{
        type: "submit",
        icon: "fa-solid fa-floppy-disk",
        label: `AMBIENT_SOUND.ACTIONS.${document.collection?.has(document.id) ? "UPDATE" : "CREATE"}`
      }]
    });
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onRender(context, options) {
    this.#toggleDisabledFields();
    return super._onRender(context, options);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onChangeForm(formConfig, event) {
    this.#toggleDisabledFields();
    return super._onChangeForm(formConfig, event);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onClose(options) {
    super._onClose(options);
    if ( this.document.object?.isPreview ) this.document.object.destroy();
  }

  /* -------------------------------------------- */

  /**
   * Special logic to toggle the disabled state of form fields depending on the values of other fields.
   */
  #toggleDisabledFields() {
    const form = this.element;
    form["effects.base.intensity"].disabled = !form["effects.base.type"].value;
    form["effects.muffled.type"].disabled = form.walls.checked;
    form["effects.muffled.intensity"].disabled = form.walls.checked || !form["effects.muffled.type"].value;
  }
}

import {DocumentSheetV2, HandlebarsApplicationMixin} from "../api/_module.mjs";
import FormDataExtended from "../ux/form-data-extended.mjs";

/**
 * @import {ApplicationClickAction} from "../_types.mjs";
 */

/**
 * A DocumentSheet application responsible for displaying and editing a single embedded Card document.
 * @extends DocumentSheetV2
 * @mixes HandlebarsApplication
 */
export default class CardConfig extends HandlebarsApplicationMixin(DocumentSheetV2) {

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    classes: ["card-config"],
    position: {width: 480},
    window: {
      contentClasses: ["standard-form"],
      icon: "fa-solid fa-card-diamond"
    },
    form: {
      closeOnSubmit: true
    },
    actions: {
      addFace: CardConfig.#onAddFace,
      deleteFace: CardConfig.#onDeleteFace
    }
  };

  /** @override */
  static PARTS = {
    header: {template: "templates/cards/card/header.hbs"},
    tabs: {template: "templates/generic/tab-navigation.hbs"},
    details: {template: "templates/cards/card/details.hbs"},
    faces: {template: "templates/cards/card/faces.hbs", scrollable: [""]},
    back: {template: "templates/cards/card/back.hbs"},
    footer: {template: "templates/generic/form-footer.hbs"}
  };

  /** @override */
  static TABS = {
    sheet: {
      tabs: [
        {id: "details", icon: "fa-solid fa-memo"},
        {id: "faces", icon: "fa-solid fa-image-portrait"},
        {id: "back", icon: "fa-solid fa-card-heart"}
      ],
      initial: "details",
      labelPrefix: "CARD.TABS"
    }
  };

  /**
   * Card types with pre-localized labels
   * @type {Record<string, string>}
   */
  static get TYPES() {
    return CardConfig.#TYPES ??= Object.entries(CONFIG.Card.typeLabels).reduce((types, [type, label]) => {
      types[type] = game.i18n.localize(label);
      return types;
    }, {});
  }

  static #TYPES;

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _preparePartContext(partId, context, options) {
    const partContext = await super._preparePartContext(partId, context, options);
    if ( partId in partContext.tabs ) partContext.tab = partContext.tabs[partId];
    switch ( partId ) {
      case "details":
        partContext.types = CardConfig.TYPES;
        break;
      case "faces":
        partContext.faceFields = context.fields.faces.element.fields;
        break;
      case "footer":
        partContext.buttons = [{type: "submit", icon: "fa-solid fa-floppy-disk", label: "CARD.Save"}];
    }
    return partContext;
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /**
   * Add a new face.
   * @this {CardConfig}
   * @type {ApplicationClickAction}
   */
  static async #onAddFace() {
    await this.submit({operation: {render: false}});
    const submitData = this._processFormData(null, this.form, new FormDataExtended(this.form));
    const faces = Object.values(submitData.faces ?? {});
    faces.push({});
    return this.submit({updateData: {faces}});
  }

  /* -------------------------------------------- */

  /**
   * Delete an existing face.
   * @this {CardConfig}
   * @type {ApplicationClickAction}
   */
  static async #onDeleteFace(event) {
    const question = game.i18n.localize("AreYouSure");
    const warning = game.i18n.localize("CARD.ACTIONS.DeleteFace.Warning");
    const submitData = this._processFormData(null, this.form, new FormDataExtended(this.form));
    const faceEl = event.target.closest("[data-face]");
    return foundry.applications.api.DialogV2.confirm({
      window: {title: "CARD.ACTIONS.DeleteFace.Title"},
      content: `<p><strong>${question}</strong> ${warning}</p>`,
      yes: {
        callback: () => {
          const faces = Object.values(submitData.faces ?? {});
          const index = Number(faceEl?.dataset.index) || 0;
          faces.splice(index, 1);
          return this.submit({updateData: {faces}});
        }
      }
    });
  }
}

import {DocumentSheetV2, HandlebarsApplicationMixin} from "../api/_module.mjs";

/**
 * The Combatant configuration application.
 * @extends DocumentSheetV2
 * @mixes HandlebarsApplication
 */
export default class CombatantConfig extends HandlebarsApplicationMixin(DocumentSheetV2) {
  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    classes: ["combatant-config"],
    canCreate: true,
    window: {
      contentClasses: ["standard-form"],
      icon: "fa-solid fa-sword"
    },
    position: {width: 420},
    form: {
      closeOnSubmit: true
    }
  };

  /** @override */
  static PARTS = {
    body: {
      root: true,
      template: "templates/sheets/combatant-config.hbs"
    }
  };

  /* -------------------------------------------- */

  /** @override */
  get title() {
    const document = this.document;
    const key = document.collection?.has(document.id) ? "COMBAT.CombatantUpdateNamed" : "COMBAT.CombatantCreate";
    return game.i18n.format(key, {name: document.name});
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.title = this.title;
    return context;
  }
}

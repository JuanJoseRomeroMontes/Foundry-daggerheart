import {ACTIVE_EFFECT_MODES} from "@common/constants.mjs";
import {DocumentSheetV2, HandlebarsApplicationMixin} from "../api/_module.mjs";
import FormDataExtended from "../ux/form-data-extended.mjs";

/**
 * @import {ApplicationClickAction, ApplicationFormSubmission} from "../_types.mjs";
 */

/**
 * The Application responsible for configuring a single ActiveEffect document within a parent Actor or Item.
 * @extends DocumentSheetV2
 * @mixes HandlebarsApplication
 */
export default class ActiveEffectConfig extends HandlebarsApplicationMixin(DocumentSheetV2) {

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    classes: ["active-effect-config"],
    window: {
      contentClasses: ["standard-form"],
      icon: "fa-solid fa-person-rays"
    },
    position: {width: 560},
    form: {closeOnSubmit: true},
    actions: {
      addChange: ActiveEffectConfig.#onAddChange,
      deleteChange: ActiveEffectConfig.#onDeleteChange
    }
  };

  /** @override */
  static PARTS = {
    header: {template: "templates/sheets/active-effect/header.hbs"},
    tabs: {template: "templates/generic/tab-navigation.hbs"},
    details: {template: "templates/sheets/active-effect/details.hbs", scrollable: [""]},
    duration: {template: "templates/sheets/active-effect/duration.hbs"},
    changes: {template: "templates/sheets/active-effect/changes.hbs", scrollable: ["ol[data-changes]"]},
    footer: {template: "templates/generic/form-footer.hbs"}
  };

  /** @override */
  static TABS = {
    sheet: {
      tabs: [
        {id: "details", icon: "fa-solid fa-book"},
        {id: "duration", icon: "fa-solid fa-clock"},
        {id: "changes", icon: "fa-solid fa-gears"}
      ],
      initial: "details",
      labelPrefix: "EFFECT.TABS"
    }
  };

  /**
   * The default priorities of the core change modes
   * @type {Record<number, number>}
   */
  static DEFAULT_PRIORITIES = Object.values(ACTIVE_EFFECT_MODES).reduce((priorities, mode) => {
    priorities[mode] = mode * 10;
    return priorities;
  }, {});

  /* ----------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.buttons = [{type: "submit", icon: "fa-solid fa-floppy-disk", label: "EFFECT.Submit"}];
    return context;
  }

  /* ----------------------------------------- */

  /** @inheritDoc */
  async _preparePartContext(partId, context) {
    const partContext = await super._preparePartContext(partId, context);
    if ( partId in partContext.tabs ) partContext.tab = partContext.tabs[partId];
    const document = this.document;
    switch ( partId ) {
      case "details":
        partContext.isActorEffect = document.parent.documentName === "Actor";
        partContext.isItemEffect = document.parent.documentName === "Item";
        partContext.legacyTransfer = CONFIG.ActiveEffect.legacyTransferral
          ? {label: game.i18n.localize("EFFECT.TransferLegacy"), hint: game.i18n.localize("EFFECT.TransferHintLegacy")}
          : null;
        partContext.statuses = CONFIG.statusEffects.map(s => ({value: s.id, label: game.i18n.localize(s.name)}));
        break;
      case "changes":
        partContext.modes = Object.entries(CONST.ACTIVE_EFFECT_MODES).reduce((modes, [key, value]) => {
          modes[value] = game.i18n.localize(`EFFECT.MODE_${key}`);
          return modes;
        }, {});
        partContext.priorities = ActiveEffectConfig.DEFAULT_PRIORITIES;
    }
    return partContext;
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _onChangeForm(formConfig, event) {
    super._onChangeForm(formConfig, event);
    // Update the priority placeholder to match the mode selection
    if ( event.target instanceof HTMLSelectElement && event.target.name.endsWith(".mode") ) {
      const modeSelect = event.target;
      const selector = `input[name="${modeSelect.name.replace(".mode", ".priority")}"]`;
      const priorityInput = modeSelect.closest("li").querySelector(selector);
      priorityInput.placeholder = ActiveEffectConfig.DEFAULT_PRIORITIES[modeSelect.value] ?? "";
    }
  }

  /* ----------------------------------------- */

  /**
   * Add a new change to the effect's changes array.
   * @this {ActiveEffectConfig}
   * @type {ApplicationClickAction}
   */
  static async #onAddChange() {
    const submitData = this._processFormData(null, this.form, new FormDataExtended(this.form));
    const changes = Object.values(submitData.changes ?? {});
    changes.push({});
    return this.submit({updateData: {changes}});
  }

  /* ----------------------------------------- */

  /**
   * Delete a change from the effect's changes array.
   * @this {ActiveEffectConfig}
   * @type {ApplicationClickAction}
   */
  static async #onDeleteChange(event) {
    const submitData = this._processFormData(null, this.form, new FormDataExtended(this.form));
    const changes = Object.values(submitData.changes);
    const row = event.target.closest("li");
    const index = Number(row.dataset.index) || 0;
    changes.splice(index, 1);
    return this.submit({updateData: {changes}});
  }
}

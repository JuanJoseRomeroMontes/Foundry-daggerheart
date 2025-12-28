import {DocumentSheetV2, HandlebarsApplicationMixin} from "../api/_module.mjs";

/**
 * @import {ApplicationClickAction, FormFooterButton} from "../_types.mjs";
 */

/**
 * A Macro configuration sheet
 * @extends DocumentSheetV2
 * @mixes HandlebarsApplication
 */
export default class MacroConfig extends HandlebarsApplicationMixin(DocumentSheetV2) {
  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    classes: ["macro-config"],
    canCreate: true,
    window: {
      contentClasses: ["standard-form"],
      icon: "fa-solid fa-code",
      resizable: true
    },
    position: {
      width: 720,
      height: 600
    },
    actions: {execute: MacroConfig.#onExecute},
    form: {closeOnSubmit: true}
  };

  /** @override */
  static PARTS = {
    body: {template: "templates/sheets/macro-config.hbs", root: true},
    footer: {template: "templates/generic/form-footer.hbs"}
  };

  /**
   * The macro's assigned hotbar slot, if any
   * @type {number|null}
   */
  #hotbarSlot = null;

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.typeChoices = Object.values(CONST.MACRO_TYPES).reduce((choices, type) => {
      choices[type] = `TYPES.Macro.${type}`;
      return choices;
    }, {});
    context.editorLang = context.source.type === "script" ? "javascript" : "";
    context.buttons = this.#prepareButtons();
    return context;
  }

  /* -------------------------------------------- */

  /**
   * Configure the sheet's pair of footer buttons.
   * @returns {FormFooterButton[]}
   */
  #prepareButtons() {
    return [
      {type: "submit", icon: "fa-solid fa-floppy-disk", label: "MACRO.Save"},
      {
        type: "button",
        icon: "fa-solid fa-dice-d20",
        label: "MACRO.Execute",
        action: "execute",
        disabled: !this.document.canExecute
      }
    ];
  }

  /* -------------------------------------------- */

  /**
   * Allow execution even if the document is locked.
   * @override
   */
  async _onRender(context, options) {
    await super._onRender(context, options);
    this.#hotbarSlot ??= Number(options.hotbarSlot) || null;
    const executeButton = this.element.querySelector("button[data-action=execute]");
    executeButton.disabled = !this.document.canExecute;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onChangeForm(formConfig, event) {
    super._onChangeForm(formConfig, event);
    if ( event.target.name !== "type" ) return;
    const type = event.target.value;

    // Set the CodeMirror elements's lang attribute
    const editorEl = this.element.querySelector("code-mirror[name=command]");
    editorEl.language = type === "script" ? "javascript" : "";

    // Update the state of the execute button and command editor
    const executeButton = this.element.querySelector("button[data-action=execute]");
    const disabled = (type === "script") && !game.user.can("MACRO_SCRIPT");
    executeButton.disabled = editorEl.disabled = disabled;
  }

  /* -------------------------------------------- */

  /**
   * Save the macro if any changes are pending and then execute.
   * @this {MacroConfig}
   * @type {ApplicationClickAction}
   */
  static async #onExecute() {
    const isCreate = !this.document.collection.has(this.document.id);
    const options = isCreate ? {renderSheet: true} : {};
    await this.submit(options);
    await this.document.execute();
    if ( isCreate ) await this.close({submit: true, animate: false});
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _processSubmitData(event, form, submitData, options) {
    const macro = this.document;
    if ( macro.collection.has(macro.id) ) macro.updateSource(submitData, {dryRun: true, fallback: false});
    else options.hotbarSlot = this.#hotbarSlot;
    return super._processSubmitData(event, form, submitData, options);
  }
}

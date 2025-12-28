import ApplicationV2 from "../../api/application.mjs";
import HandlebarsApplicationMixin from "../../api/handlebars-application.mjs";
import FormDataExtended from "../../ux/form-data-extended.mjs";
import * as fields from "../../../../common/data/fields.mjs";

/**
 * @typedef GameUIConfiguration
 * @property {number} uiScale
 * @property {number} fontScale
 * @property {{applications: ""|"dark"|"light", interface: ""|"dark"|"light"}} colorScheme
 * @property {"cards"|"pip"} chatNotifications
 * @property {{opacity: number, speed: number}} fade
 */

/**
 * A submenu that provides UI configuration settings.
 */
export default class UIConfig extends HandlebarsApplicationMixin(ApplicationV2) {

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    id: "ui-config",
    tag: "form",
    window: {
      title: "SETTINGS.UI.MENU.name",
      contentClasses: ["standard-form"]
    },
    form: {
      closeOnSubmit: true,
      handler: UIConfig.#onSubmit
    },
    position: {width: 540},
    actions: {
      reset: UIConfig.#onReset
    }
  };

  /** @override */
  static PARTS = {
    form: {
      template: "templates/settings/menus/ui-config.hbs",
      scrollable: [""]
    },
    footer: {
      template: "templates/generic/form-footer.hbs"
    }
  };

  /**
   * The data schema for the core.uiConfig setting.
   * @type {SchemaField}
   */
  static get schema() {
    return UIConfig.#schema;
  }

  static #schema = new fields.SchemaField({
    uiScale: new fields.NumberField({required: true, min: 0.5, max: 1.5, step: 0.05, initial: 1}),
    fontScale: new fields.NumberField({required: true, min: 1, max: 10, step: 1, initial: 5}),
    colorScheme: new fields.SchemaField({
      applications: new fields.StringField({required: true, blank: true, initial: "dark", choices: {
        "": "SETTINGS.UI.FIELDS.colorScheme.choices.default",
        dark: "SETTINGS.UI.FIELDS.colorScheme.choices.dark",
        light: "SETTINGS.UI.FIELDS.colorScheme.choices.light"
      }}),
      interface: new fields.StringField({required: true, blank: true, initial: "dark", choices: {
        "": "SETTINGS.UI.FIELDS.colorScheme.choices.default",
        dark: "SETTINGS.UI.FIELDS.colorScheme.choices.dark",
        light: "SETTINGS.UI.FIELDS.colorScheme.choices.light"
      }})
    }),
    chatNotifications: new fields.StringField({required: true, blank: false, initial: "cards", choices: {
      cards: "SETTINGS.UI.FIELDS.chatNotifications.cards",
      pip: "SETTINGS.UI.FIELDS.chatNotifications.pip"
    }}),
    fade: new fields.SchemaField({
      opacity: new fields.AlphaField({initial: 0.4, min: 0.05, step: 0.05}),
      speed: new fields.NumberField({min: 0, max: 1000, initial: 500, step: 50})
    })
  });

  /**
   * The current setting value
   * @type {GameUIConfiguration}
   */
  #setting;

  /**
   * Track whether the schema has already been localized.
   * @type {boolean}
   */
  static #localized = false;

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _preFirstRender(_context, _options) {
    await super._preFirstRender(_context, _options);
    if ( !UIConfig.#localized ) {
      foundry.helpers.Localization.localizeDataModel({schema: UIConfig.#schema}, {
        prefixes: ["SETTINGS.UI"],
        prefixPath: "core.uiConfig."
      });
      UIConfig.#localized = true;
    }
  }

  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    if ( options.isFirstRender ) this.#setting = game.settings.get("core", "uiConfig");
    return {
      setting: this.#setting,
      fields: UIConfig.#schema.fields,
      buttons: [
        {type: "reset", label: "Reset", icon: "fa-solid fa-arrow-rotate-left", action: "reset"},
        {type: "submit", label: "Save Changes", icon: "fa-solid fa-floppy-disk"}
      ]
    };
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onClose(options) {
    super._onClose(options);
    if ( !options.submitted ) game.configureUI(game.settings.get("core", "uiConfig"));
  }

  /* -------------------------------------------- */

  /** @override */
  _onChangeForm(_formConfig, _event) {
    const formData = new FormDataExtended(this.form);
    this.#setting = UIConfig.#cleanFormData(formData);
    game.configureUI(this.#setting);
  }

  /* -------------------------------------------- */

  /**
   * Clean the form data, accounting for the field names assigned by game.settings.register on the schema.
   * @param {FormDataExtended} formData
   * @returns {GameUIConfiguration}
   */
  static #cleanFormData(formData) {
    return UIConfig.#schema.clean(foundry.utils.expandObject(formData.object).core.uiConfig);
  }

  /* -------------------------------------------- */

  /**
   * Submit the configuration form.
   * @this {UIConfig}
   * @param {SubmitEvent} event
   * @param {HTMLFormElement} form
   * @param {FormDataExtended} formData
   * @returns {Promise<void>}
   */
  static async #onSubmit(event, form, formData) {
    this.#setting = UIConfig.#cleanFormData(formData);
    await game.settings.set("core", "uiConfig", this.#setting);
  }

  /* -------------------------------------------- */

  /**
   * Reset the form back to default values.
   * @this {UIConfig}
   * @param {InputEvent} event
   * @returns {Promise<void>}
   */
  static async #onReset(event) {
    this.#setting = UIConfig.#schema.clean({});
    game.configureUI(this.#setting);
    await this.render({force: false});
  }
}

import HandlebarsApplicationMixin from "@client/applications/api/handlebars-application.mjs";
import ApplicationV2 from "@client/applications/api/application.mjs";
import Roll from "@client/dice/roll.mjs";

/**
 * @import {ApplicationFormSubmission} from "@client/applications/_types.mjs"
 */

/**
 * The application responsible for configuring methods of DiceTerm resolution.
 */
export default class DiceConfig extends HandlebarsApplicationMixin(ApplicationV2) {

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    id: "dice-config",
    tag: "form",
    window: {
      contentClasses: ["standard-form"],
      title: "DICE.CONFIG.Title",
      icon: "fa-solid fa-dice"
    },
    position: {
      width: 480
    },
    form: {
      closeOnSubmit: true,
      handler: DiceConfig.#onSubmit
    }
  };

  /** @override */
  static PARTS = {
    body: {
      template: "templates/settings/menus/dice-config.hbs",
      root: true
    },
    footer: {
      template: "templates/generic/form-footer.hbs"
    }
  };

  /**
   * Dice Configuration setting name.
   * @type {"diceConfiguration"}
   * @deprecated since v13
   */
  static get SETTING() {
    const message = "DiceConfig.SETTING is deprecated: use Roll.DICE_CONFIGURATION_SETTING instead.";
    foundry.utils.logCompatibilityWarning(message, {since: 13, until: 14, once: true});
    return Roll.DICE_CONFIGURATION_SETTING;
  }

  /* -------------------------------------------- */

  /**
   * Register setting and menu.
   */
  static registerSetting() {
    game.settings.register("core", Roll.DICE_CONFIGURATION_SETTING, {
      config: false,
      default: {},
      type: Object,
      scope: "client"
    });

    game.settings.registerMenu("core", Roll.DICE_CONFIGURATION_SETTING, {
      name: "DICE.CONFIG.Title",
      label: "DICE.CONFIG.Label",
      hint: "DICE.CONFIG.Hint",
      icon: "fa-solid fa-dice-d20",
      type: DiceConfig,
      restricted: false
    });
  }

  /* -------------------------------------------- */
  /*  Application                                 */
  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(_options) {
    const {methods, dice} = CONFIG.Dice.fulfillment;
    if ( !game.user.hasPermission("MANUAL_ROLLS") ) delete methods.manual;
    const config = game.settings.get("core", Roll.DICE_CONFIGURATION_SETTING) || {};
    return {
      methods,
      dice: Object.entries(dice).map(([k, {label, icon}]) => {
        return {label, icon, denomination: k, method: config[k] || ""};
      }),
      buttons: [
        {type: "submit", icon: "fa-solid fa-floppy-disk", label: "SETTINGS.Save"}
      ]
    };
  }

  /* -------------------------------------------- */

  /**
   * Update dice settings.
   * @this {DiceConfig}
   * @type {ApplicationFormSubmission}
   */
  static async #onSubmit(_event, _form, formData) {
    const config = game.settings.get("core", Roll.DICE_CONFIGURATION_SETTING);
    foundry.utils.mergeObject(config, formData.object);
    await game.settings.set("core", Roll.DICE_CONFIGURATION_SETTING, config);
  }
}


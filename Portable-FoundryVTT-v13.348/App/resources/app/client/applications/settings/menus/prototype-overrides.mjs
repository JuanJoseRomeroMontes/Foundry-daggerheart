import {PrototypeTokenOverrides} from "@common/data/data.mjs";
import {ApplicationV2, HandlebarsApplicationMixin} from "../../api/_module.mjs";
import Actor from "@client/documents/actor.mjs";

/**
 * @import {
 *   ApplicationClickAction,
 *   ApplicationFormSubmission,
 *   ApplicationTab,
 *   FormFooterButton
 * } from "../../_types.mjs";
 */

/**
 * A submenu for managing user overrides of PrototypeTokens
 */
export default class PrototypeOverridesConfig extends HandlebarsApplicationMixin(ApplicationV2) {

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    id: "prototype-token-overrides",
    tag: "form",
    window: {
      title: "SETTINGS.PrototypeTokenOverrides.Name",
      contentClasses: ["standard-form"],
      icon: "fa-solid fa-circle-user"
    },
    position: {width: 560},
    form: {
      closeOnSubmit: true,
      handler: PrototypeOverridesConfig.#onSubmit
    },
    actions: {
      onResetDefaults: PrototypeOverridesConfig.#onResetDefaults
    }
  };

  /** @override */
  static PARTS = {
    tabs: {template: "templates/generic/tab-navigation.hbs"},
    body: {template: "templates/settings/menus/prototype-overrides.hbs"},
    footer: {template: "templates/generic/form-footer.hbs"}
  };

  /* -------------------------------------------- */

  /** Register this menu application and the setting it manages. */
  static registerSettings() {
    if ( (game.view !== "game") && (game.view !== "stream") ) return; // Bail if called by Setup
    game.settings.register("core", PrototypeTokenOverrides.SETTING, {
      name: "SETTINGS.PrototypeTokenOverrides.Name",
      hint: "SETTINGS.PrototypeTokenOverrides.Hint",
      scope: "world",
      type: PrototypeTokenOverrides,
      onChange: PrototypeTokenOverrides.applyAll.bind(PrototypeTokenOverrides)
    });
    game.settings.registerMenu("core", PrototypeTokenOverrides.SETTING, {
      name: "SETTINGS.PrototypeTokenOverrides.Name",
      label: "SETTINGS.PrototypeTokenOverrides.Label",
      hint: "SETTINGS.PrototypeTokenOverrides.Hint",
      icon: "fa-solid fa-circle-user",
      type: PrototypeOverridesConfig,
      restricted: true
    });
  }

  /* -------------------------------------------- */

  /** @override */
  tabGroups = {
    main: "base",
    ...Actor.TYPES.reduce((types, type) => {
      types[type] = "basics";
      return types;
    }, {})
  };

  /* -------------------------------------------- */

  /**
   * Prepare tabs for the global overrides and each actor type.
   * @returns {Record<string, ApplicationTab>}
   */
  #prepareTabs() {
    const data = PrototypeTokenOverrides.overrides;
    const tabLabelPrefix = "SETTINGS.PrototypeTokenOverrides.TABS";
    const subtabData = {
      basics: {id: "basics", label: game.i18n.localize(`${tabLabelPrefix}.Basics`), icon: "fa-solid fa-gear"},
      marker: {id: "marker", label: game.i18n.localize(`${tabLabelPrefix}.Marker`), icon: "fa-solid fa-scrubber"}
    };
    return Actor.TYPES.reduce((tabs, tabId) => {
      const active = this.tabGroups.main === tabId;
      tabs[tabId] = {
        id: tabId,
        group: "main",
        label: tabId === "base" ? `${tabLabelPrefix}.AllTypes.Label` : `TYPES.Actor.${tabId}`,
        active,
        cssClass: active ? "active" : "",
        fields: PrototypeTokenOverrides.schema.fields[tabId].fields,
        data: data[tabId],
        subtabs: ["basics", "marker"].reduce((subtabs, subtabId) => {
          const group = tabId;
          const active = this.tabGroups[group] === subtabId;
          const cssClass = active ? "active": "";
          subtabs[subtabId] = {...subtabData[subtabId], group, active, cssClass};
          return subtabs;
        }, {})
      };
      return tabs;
    }, {});
  }

  /* -------------------------------------------- */

  /**
   * Configure footer buttons for the window.
   * @returns {FormFooterButton[]}
   */
  #prepareButtons() {
    return [
      {
        type: "button",
        action: "onResetDefaults",
        label: "SETTINGS.PrototypeTokenOverrides.Reset.Label",
        icon: "fa-solid fa-arrow-rotate-left"
      },
      {
        type: "submit",
        label: "SETTINGS.PrototypeTokenOverrides.Submit",
        icon: "fa-solid fa-floppy-disk"
      }
    ];
  }

  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(_options) {
    const TokenConfig = foundry.applications.sheets.TokenConfig;
    return {
      tabs: this.#prepareTabs(),
      verticalTabs: true,
      rootId: this.id,
      buttons: this.#prepareButtons(),
      booleanOptions: {true: game.i18n.localize("Yes"), false: game.i18n.localize("No")},
      displayModes: TokenConfig.DISPLAY_MODES,
      dispositions: TokenConfig.TOKEN_DISPOSITIONS,
      turnMarkerModes: TokenConfig.TURN_MARKER_MODES,
      turnMarkerAnimations: CONFIG.Combat.settings.turnMarkerAnimations
    };
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _preFirstRender(context, options) {
    PrototypeTokenOverrides.localizeFields();
    return super._preFirstRender(context, options);
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /**
   * Process form submission for the sheet
   * @this {PrototypeOverridesConfig}
   * @type {ApplicationFormSubmission}
   */
  static async #onSubmit(event, form, formData) {
    // Normalize values of nullable boolean fields
    const stringToBooleanOrNullish = {true: true, false: false, null: null, "": undefined};
    for (const [path, value] of Object.entries(formData.object)) {
      if ( value in stringToBooleanOrNullish ) formData.object[path] = stringToBooleanOrNullish[value];
    }
    const submitData = PrototypeTokenOverrides.schema.clean(foundry.utils.expandObject(formData.object));
    PrototypeTokenOverrides.schema.validate(submitData);
    await game.settings.set("core", PrototypeTokenOverrides.SETTING, submitData);
  }

  /* -------------------------------------------- */

  /**
   * Reset the setting to its initial state, with all overrides removed.
   * @this {PrototypeOverridesConfig}
   * @type {ApplicationClickAction}
   */
  static async #onResetDefaults() {
    const question = game.i18n.localize("AreYouSure");
    const warning = game.i18n.localize("SETTINGS.PrototypeTokenOverrides.Reset.Warning");
    await foundry.applications.api.DialogV2.confirm({
      window: {
        title: "SETTINGS.PrototypeTokenOverrides.Reset.Label"
      },
      content: `<p><strong>${question}</strong> ${warning}</p>`,
      yes: {
        callback: async () => {
          await game.settings.set("core", PrototypeTokenOverrides.SETTING, undefined);
          await this.render();
        }
      }
    });
  }
}

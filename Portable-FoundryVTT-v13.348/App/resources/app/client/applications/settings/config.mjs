import CategoryBrowser from "../api/category-browser.mjs";

/**
 * @import {ApplicationClickAction, ApplicationFormSubmission} from "../_types.mjs";
 */

/**
 * The Application responsible for displaying and editing the client and world settings for this world.
 * This form renders the settings defined via the game.settings.register API which have config = true
 */
export default class SettingsConfig extends CategoryBrowser {

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    id: "settings-config",
    window: {
      title: "SETTINGS.Title",
      icon: "fa-solid fa-gears",
      resizable: true
    },
    position: {
      width: 780,
      height: 680
    },
    form: {
      handler: SettingsConfig.#onSubmit
    },
    actions: {
      openSubmenu: SettingsConfig.#onOpenSubmenu,
      resetDefaults: SettingsConfig.#onResetDefaults
    },
    initialCategory: "core",
    subtemplates: {
      category: "templates/settings/config-category.hbs",
      sidebarFooter: "templates/category-browser/reset.hbs"
    }
  };

  /* -------------------------------------------- */

  /** @inheritDoc */
  _prepareCategoryData() {
    const categories = {};
    const getCategory = namespace => {
      const {id, label} = this._categorizeEntry(namespace);
      return categories[id] ??= {id, label, entries: []};
    };

    // Classify all menus
    const canConfigure = game.user.can("SETTINGS_MODIFY");
    for ( const menu of game.settings.menus.values() ) {
      if ( menu.restricted && !canConfigure ) continue;
      if ( (menu.key === "core.permissions") && !game.user.hasRole("GAMEMASTER") ) continue;
      const category = getCategory(menu.namespace);
      category.entries.push({
        key: menu.key,
        icon: menu.icon,
        label: menu.name,
        hint: menu.hint,
        menu: true,
        buttonText: menu.label
      });
    }

    // Classify all settings
    for ( const setting of game.settings.settings.values() ) {
      if ( !setting.config || (!canConfigure && (setting.scope === CONST.SETTING_SCOPES.WORLD)) ) continue;
      const data = {
        label: setting.value,
        value: game.settings.get(setting.namespace, setting.key),
        menu: false
      };

      // Define a DataField for each setting not originally defined with one
      const fields = foundry.data.fields;
      if ( setting.type instanceof fields.DataField ) {
        data.field = setting.type;
      }
      else if ( setting.type === Boolean ) {
        data.field = new fields.BooleanField({initial: setting.default ?? false});
      }
      else if ( setting.type === Number ) {
        const {min, max, step} = setting.range ?? {};
        data.field = new fields.NumberField({
          required: true,
          choices: setting.choices,
          initial: setting.default,
          min,
          max,
          step
        });
      }
      else if ( setting.filePicker ) {
        const categories = {
          audio: ["AUDIO"],
          folder: [],
          font: ["FONT"],
          graphics: ["GRAPHICS"],
          image: ["IMAGE"],
          imagevideo: ["IMAGE", "VIDEO"],
          text: ["TEXT"],
          video: ["VIDEO"]
        }[setting.filePicker] ?? Object.keys(CONST.FILE_CATEGORIES).filter(c => c !== "HTML");
        if ( categories.length ) {
          data.field = new fields.FilePathField({required: true, blank: true, categories});
        }
        else {
          data.field = new fields.StringField({required: true}); // Folder paths cannot be FilePathFields
          data.folderPicker = true;
        }
      }
      else {
        data.field = new fields.StringField({required: true, choices: setting.choices});
      }
      data.field.name = `${setting.namespace}.${setting.key}`;
      data.field.label ||= game.i18n.localize(setting.name ?? "");
      data.field.hint ||= game.i18n.localize(setting.hint ?? "");

      // Categorize setting
      const category = getCategory(setting.namespace);
      category.entries.push(data);
    }

    return categories;
  }

  /* -------------------------------------------- */

  /**
   * Classify what Category an Action belongs to
   * @param {string} namespace The entry to classify
   * @returns {{id: string; label: string}} The category the entry belongs to
   * @protected
   */
  _categorizeEntry(namespace) {
    switch ( namespace ) {
      case "core":
        return {id: "core", label: game.i18n.localize("PACKAGECONFIG.TABS.core")};
      case game.system.id:
        return {id: "system", label: game.system.title};
      default: {
        const module = game.modules.get(namespace);
        return module
          ? {id: module.id, label: module.title}
          : {id: "unmapped", label: game.i18n.localize("PACKAGECONFIG.TABS.unmapped")};
      }
    }
  }

  /* -------------------------------------------- */

  /**
   * Sort categories in order of core, system, and finally modules.
   * @param {{id: string; label: string}} a
   * @param {{id: string; label: string}} b
   * @protected
   * @override
   */
  _sortCategories(a, b) {
    const categoryOrder = {core: 0, system: 1};
    const indexOfA = categoryOrder[a.id] ?? 2;
    const indexOfB = categoryOrder[b.id] ?? 2;
    return (indexOfA - indexOfB) || a.label.localeCompare(b.label, game.i18n.lang);
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /**
   * Confirm if the user wishes to reload the application.
   * @param {object} [options]               Additional options to configure the prompt.
   * @param {boolean} [options.world=false]  Whether to reload all connected clients as well.
   * @returns {Promise<void>}
   */
  static async reloadConfirm({world=false}={}) {
    const reload = await foundry.applications.api.DialogV2.confirm({
      id: "reload-world-confirm",
      modal: true,
      window: {title: "SETTINGS.ReloadPromptTitle"},
      position: {width: 400},
      content: `<p>${game.i18n.localize("SETTINGS.ReloadPromptBody")}</p>`
    });
    if ( !reload ) return;
    if ( world && game.user.can("SETTINGS_MODIFY") ) game.socket.emit("reload");
    foundry.utils.debouncedReload();
  }

  /* -------------------------------------------- */

  /**
   * Handle activating the button to configure User Role permissions
   * @this {SettingsConfig}
   * @type {ApplicationClickAction}
   */
  static async #onOpenSubmenu(_event, button) {
    const menu = game.settings.menus.get(button.dataset.key);
    if ( !menu ) {
      ui.notifications.error("No submenu found for the provided key");
      return;
    }
    const app = new menu.type();
    await app.render(true);
  }

  /* -------------------------------------------- */

  /**
   * Handle button click to reset default settings
   * @this {SettingsConfig}
   * @type {ApplicationClickAction}
   */
  static async #onResetDefaults() {
    const form = this.form;
    for ( const [key, setting] of game.settings.settings.entries() ) {
      if ( !setting.config ) continue;
      const input = form[key];
      if ( !input ) continue;
      if ( input.type === "checkbox" ) input.checked = setting.default;
      else input.value = setting.default;
      input.dispatchEvent(new Event("change"));
    }
    ui.notifications.info("SETTINGS.ResetInfo", {localize: true});
  }

  /* -------------------------------------------- */

  /**
   * Update changed settings.
   * @this {SettingsConfig}
   * @type {ApplicationFormSubmission}
   */
  static async #onSubmit(_event, _form, formData) {
    let requiresClientReload = false;
    let requiresWorldReload = false;
    for ( const [key, value] of Object.entries(formData.object) ) {
      const setting = game.settings.settings.get(key);
      if ( !setting ) continue;
      const priorValue = game.settings.get(setting.namespace, setting.key, {document: true})?._source.value;
      let newSetting;
      try {
        newSetting = await game.settings.set(setting.namespace, setting.key, value, {document: true});
      } catch(error) {
        ui.notifications.error(error);
      }
      if ( priorValue === newSetting?._source.value ) continue; // Compare JSON strings
      requiresClientReload ||= (setting.scope !== CONST.SETTING_SCOPES.WORLD) && setting.requiresReload;
      requiresWorldReload ||= (setting.scope === CONST.SETTING_SCOPES.WORLD) && setting.requiresReload;
    }
    if ( requiresClientReload || requiresWorldReload ) {
      await this.constructor.reloadConfirm({world: requiresWorldReload});
    }
  }
}

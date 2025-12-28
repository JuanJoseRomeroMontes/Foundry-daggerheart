import Setting from "../documents/setting.mjs";
import Hooks from "./hooks.mjs";
import SettingsConfig from "../applications/settings/config.mjs";

/**
 * @import {SettingConfig, SettingSubmenuConfig} from "@client/_types.mjs";
 * @import ApplicationV2 from "../applications/api/application.mjs"
 * @import Application from "../appv1/api/application-v1.mjs"
 */

/**
 * A class responsible for managing defined game settings or settings menus.
 * Each setting is a string key/value pair belonging to a certain namespace and a certain store scope.
 *
 * When Foundry Virtual Tabletop is initialized, a singleton instance of this class is constructed within the global
 * Game object as game.settings.
 *
 * @see {@link foundry.Game#settings}
 * @see {@link foundry.applications.sidebar.tabs.Settings}
 * @see {@link foundry.applications.settings.SettingsConfig}
 */
export default class ClientSettings {
  constructor(worldSettings) {
    if ( game.settings ) throw new Error("You may not re-construct the ClientSettings singleton.");

    /**
     * A object of registered game settings for this scope
     * @type {Map<string, SettingConfig>}
     */
    this.settings = new Map();

    /**
     * Registered settings menus which trigger secondary applications
     * @type {Map<string, ApplicationV2|Application}
     */
    this.menus = new Map();

    /**
     * The storage interfaces used for persisting settings
     * Each storage interface shares the same API as window.localStorage
     */
    this.storage = new Map([
      [CONST.SETTING_SCOPES.CLIENT, window.localStorage],
      [CONST.SETTING_SCOPES.WORLD, new foundry.documents.collections.WorldSettings(worldSettings)]
    ]);
    this.storage.set(CONST.SETTING_SCOPES.USER, this.storage.get(CONST.SETTING_SCOPES.WORLD));
  }

  /* -------------------------------------------- */

  /**
   * Return a singleton instance of the Game Settings Configuration app
   * @returns {SettingsConfig}
   */
  get sheet() {
    return this.#sheet ??= new SettingsConfig();
  }

  #sheet;

  /* -------------------------------------------- */

  /**
   * Register a new namespaced game setting. The setting's scope determines where the setting is saved.
   * World - World settings are applied to everyone in the World. Use this for settings like system rule variants that
   * everyone must abide by.
   * User - User settings are applied to an individual user. Use this for settings that are a player's personal
   * preference, like 3D dice skins.
   * Client - Client settings are applied to the browser or client used to access the World. Use this for settings that
   * are affected by the client itself, such as screen dimensions, resolution, or performance.
   *
   * @param {string} namespace    The namespace under which the setting is registered
   * @param {string} key          The key name for the setting under the namespace
   * @param {SettingConfig} data  Configuration for setting data
   *
   * @example Register a client setting
   * ```js
   * game.settings.register("myModule", "myClientSetting", {
   *   name: "Register a Module Setting with Choices",
   *   hint: "A description of the registered setting and its behavior.",
   *   scope: "client",     // This specifies a client-stored setting
   *   config: true,        // This specifies that the setting appears in the configuration view
   *   requiresReload: true // This will prompt the user to reload the application for the setting to take effect.
   *   type: String,
   *   choices: {           // If choices are defined, the resulting setting will be a select menu
   *     "a": "Option A",
   *     "b": "Option B"
   *   },
   *   default: "a",        // The default value for the setting
   *   onChange: value => { // A callback function which triggers when the setting is changed
   *     console.log(value)
   *   }
   * });
   * ```
   *
   * @example Register a world setting
   * ```js
   * game.settings.register("myModule", "myWorldSetting", {
   *   name: "Register a Module Setting with a Range slider",
   *   hint: "A description of the registered setting and its behavior.",
   *   scope: "world",      // This specifies a world-level setting
   *   config: true,        // This specifies that the setting appears in the configuration view
   *   requiresReload: true // This will prompt the GM to have all clients reload the application for the setting to
   *                        // take effect.
   *   type: new foundry.fields.NumberField({nullable: false, min: 0, max: 100, step: 10}),
   *   default: 50,         // The default value for the setting
   *   onChange: value => { // A callback function which triggers when the setting is changed
   *     console.log(value)
   *   }
   * });
   * ```
   *
   * @example Register a user setting
   * ```js
   * game.settings.register("myModule", "myUserSetting", {
   *   name: "Register a Module Setting with a checkbox",
   *   hint: "A description of the registered setting and its behavior.",
   *   scope: "user",       // This specifies a user-level setting
   *   config: true,        // This specifies that the setting appears in the configuration view
   *   type: new foundry.fields.BooleanField(),
   *   default: false
   * });
   * ```
   */
  register(namespace, key, data) {
    if ( !namespace || !key ) throw new Error("You must specify both namespace and key portions of the setting");
    data.key = key;
    data.namespace = namespace;
    data.scope = Object.values(CONST.SETTING_SCOPES).includes(data.scope) ? data.scope : CONST.SETTING_SCOPES.CLIENT;
    data.id = `${namespace}.${key}`;

    // Validate type
    if ( data.type ) {
      const allowedTypes = [foundry.data.fields.DataField, foundry.abstract.DataModel, Function];
      if ( !allowedTypes.some(t => data.type instanceof t) ) {
        throw new Error(`Setting ${data.id} type must be a DataField, DataModel, or callable function`);
      }

      // Sync some setting data with the DataField
      if ( data.type instanceof foundry.data.fields.DataField ) {
        data.default ??= data.type.getInitialValue();
        data.type.name = data.id;
        data.type.label ??= data.label;
        data.type.hint ??= data.hint;
      }

      // Special handling for DataModels
      if ( foundry.utils.isSubclass(data.type, foundry.abstract.DataModel) ) data.default ??= {};
    }

    // Setting values may not be undefined, only null, so the default should also adhere to this behavior
    data.default ??= null;

    // Store the setting configuration
    this.settings.set(data.id, data);

    // Reinitialize to cast the value of the Setting into its defined type
    if ( data.scope !== CONST.SETTING_SCOPES.CLIENT ) {
      const userId = data.scope === CONST.SETTING_SCOPES.USER ? game.userId : null;
      this.storage.get("world").getSetting(data.id, userId)?.reset();
    }
  }

  /* -------------------------------------------- */

  /**
   * Register a new sub-settings menu
   *
   * @param {string} namespace           The namespace under which the menu is registered
   * @param {string} key                 The key name for the setting under the namespace
   * @param {SettingSubmenuConfig} data  Configuration for setting data
   *
   * @example Define a settings submenu which handles advanced configuration needs
   * ```js
   * game.settings.registerMenu("myModule", "mySettingsMenu", {
   *   name: "My Settings Submenu",
   *   label: "Settings Menu Label",      // The text label used in the button
   *   hint: "A description of what will occur in the submenu dialog.",
   *   icon: "fa-solid fa-bars",               // A Font Awesome icon used in the submenu button
   *   type: MySubmenuApplicationClass,   // A FormApplication subclass which should be created
   *   restricted: true                   // Restrict this submenu to gamemaster only?
   * });
   * ```
   */
  registerMenu(namespace, key, data) {
    if ( !namespace || !key ) throw new Error("You must specify both namespace and key portions of the menu");
    data.key = `${namespace}.${key}`;
    data.namespace = namespace;
    if ( !((data.type?.prototype instanceof foundry.appv1.api.FormApplication)
      || (data.type?.prototype instanceof foundry.applications.api.ApplicationV2) )) {
      throw new Error("You must provide a menu type that is a FormApplication or ApplicationV2 instance or subclass");
    }
    this.menus.set(data.key, data);
  }

  /* -------------------------------------------- */

  /**
   * Get the value of a game setting for a certain namespace and setting key
   *
   * @param {string} namespace    The namespace under which the setting is registered
   * @param {string} key          The setting key to retrieve
   * @param {object} options      Additional options for setting retrieval
   * @param {boolean} [options.document]  Retrieve the full Setting document instance instead of just its value
   * @returns {any|Setting}       The current value or the Setting document instance
   *
   * @example Retrieve the current setting value
   * ```js
   * game.settings.get("myModule", "myClientSetting");
   * ```
   */
  get(namespace, key, {document=false}={}) {
    const setting = this.#assertSetting(namespace, key);
    const storage = this.storage.get(setting.scope);
    const user = setting.scope === "user" ? game.userId : null;

    // Get the Setting document
    let doc;
    switch ( setting.scope ) {
      case CONST.SETTING_SCOPES.CLIENT:
        doc = new Setting({key: setting.id, value: storage.getItem(setting.id) ?? setting.default});
        break;
      case CONST.SETTING_SCOPES.USER:
      case CONST.SETTING_SCOPES.WORLD:
        doc = storage.getSetting(setting.id, user);
        if ( !doc ) doc = new Setting({key: setting.id, user, value: setting.default});
        break;
    }
    return document ? doc : doc.value;
  }

  /* -------------------------------------------- */

  /**
   * Set the value of a game setting for a certain namespace and setting key
   *
   * @param {string} namespace        The namespace under which the setting is registered
   * @param {string} key              The setting key to retrieve
   * @param {any} value               The data to assign to the setting key
   * @param {object} [options]        Additional options passed to the server when updating world-scope settings
   * @param {boolean} [options.document]  Return the updated Setting document instead of just its value
   * @returns {Promise<any|Setting>}  The assigned setting value or the Setting document instance
   *
   * @example Update the current value of a setting
   * ```js
   * game.settings.set("myModule", "myClientSetting", "b");
   * ```
   */
  async set(namespace, key, value, {document=false, ...options}={}) {
    const setting = this.#assertSetting(namespace, key);
    let doc;
    if ( setting.scope === CONST.SETTING_SCOPES.CLIENT ) doc = this.#setClient(setting, value, options);
    else doc = await this.#setWorld(setting, value, options);
    return document ? doc : doc.value;
  }

  /* -------------------------------------------- */

  /**
   * Assert that the namespace and setting name were provided and form a valid key.
   * @param {string} namespace    The setting namespace
   * @param {string} key          The setting key
   * @returns {SettingConfig}     The setting configuration
   */
  #assertSetting(namespace, key) {
    const id = `${namespace}.${key}`;
    if ( !namespace || !key ) {
      throw new Error(`You must specify both namespace and key portions of the setting, you provided "${id}"`);
    }
    const setting = this.settings.get(id);
    if ( !setting ) throw new Error(`"${id}" is not a registered game setting`);
    return setting;
  }

  /* -------------------------------------------- */

  /**
   * Create or update a Setting document in the World database.
   * @param {SettingConfig} setting     The setting configuration to set
   * @param {*} value                   The desired setting value
   * @param {object} [options]          Additional options passed to the document creation or update workflows
   * @returns {Promise<Setting>}        The created or updated Setting document
   */
  async #setWorld(setting, value, options) {
    if ( !game.ready ) throw new Error("You may not set a World-level Setting before the Game is ready.");
    const user = setting.scope === CONST.SETTING_SCOPES.USER ? game.userId : null;
    const current = this.get(setting.namespace, setting.key, {document: true});
    const json = this.#cleanJSON(setting, value);
    if ( current?._id ) {
      await current.update({value: json}, options);
      return current;
    }
    return Setting.implementation.create({key: setting.id, user, value: json}, options);
  }

  /* -------------------------------------------- */

  /**
   * Create or update a Setting document in the browser client storage.
   * @param {SettingConfig} setting     The setting configuration to set
   * @param {*} value                   The desired setting value
   * @param {object} options            Additional options passed as part of the setting change request
   * @returns {Setting}                 A Setting document which represents the created setting
   */
  #setClient(setting, value, options) {
    const storage = this.storage.get("client");
    const json = this.#cleanJSON(setting, value);

    // Get current Setting document
    let doc;
    if ( setting.id in storage ) {
      doc = new Setting({key: setting.id, value: storage.getItem(setting.id)});
      const diff = doc.updateSource({value: json});
      if ( foundry.utils.isEmpty(diff) ) return doc;
    }
    else doc = new Setting({key: setting.id, value: json});

    // Write to client storage
    storage.setItem(doc.key, json);
    if ( setting.onChange instanceof Function ) setting.onChange(doc.value, options);
    Hooks.callAll("clientSettingChanged", doc.key, doc.value, options);
    return doc;
  }

  /* -------------------------------------------- */

  /**
   * Clean a candidate Setting value before writing it based on the registered setting configuration.
   * @param {SettingConfig} setting     The setting configuration to clean
   * @param {any} value                 The value to clean
   * @returns {any}                     The cleaned value
   */
  #cleanJSON(setting, value) {

    // Assign using DataField
    if ( setting.type instanceof foundry.data.fields.DataField ) {
      value = setting.type.clean(value);
      const err = setting.type.validate(value, {fallback: false});
      if ( err instanceof foundry.data.validation.DataModelValidationFailure ) throw err.asError();
    }

    // Assign using DataModel
    if ( foundry.utils.isSubclass(setting.type, foundry.abstract.DataModel) ) {
      value = setting.type.fromSource(value || {}, {strict: true});
    }

    // Plain default value
    else if ( value === undefined ) value = setting.default;
    return JSON.stringify(value);
  }
}

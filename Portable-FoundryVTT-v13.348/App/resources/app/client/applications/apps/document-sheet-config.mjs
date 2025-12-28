import HandlebarsApplicationMixin from "../api/handlebars-application.mjs";
import DocumentSheetV2 from "../api/document-sheet.mjs";
import FormDataExtended from "../ux/form-data-extended.mjs";
import {isSubclass} from "@common/utils/_module.mjs";

/**
 * @import {ApplicationConfiguration, ApplicationRenderContext, ApplicationRenderOptions} from "../_types.mjs";
 * @import {DocumentSheetConfiguration, DocumentSheetRenderOptions} from "../api/document-sheet.mjs";
 * @import Application from "@client/appv1/api/application-v1.mjs";
 * @import ApplicationV2 from "../api/application.mjs";
 */

/**
 * @typedef DefaultSheetDescriptor
 * @property {string} sheet  The identifier of the default sheet.
 * @property {string} theme  The default theme.
 */

/**
 * @typedef SheetRegistrationDescriptor
 * @property {typeof ClientDocument} documentClass  The Document class to register a new sheet option for.
 * @property {string} id                            The identifier of the sheet being registered.
 * @property {typeof Application|typeof ApplicationV2} sheetClass An Application class used to render the sheet.
 * @property {string|(()=>string)} [label]          A human-readable label for the sheet name, or a function that
 *                                                  returns one. Will be localized.
 * @property {string[]} [types]                     An array of Document sub-types to register the sheet for.
 * @property {Record<string, string>|null} [themes] An object of theme keys to labels that the sheet supports. If this
 *                                                  option is not supplied, the sheet is assumed to support both light
 *                                                  and dark themes. If null is supplied, it indicates that the sheet
 *                                                  does not support theming.
 * @property {boolean} [makeDefault=false]          Whether to make this sheet the default for the provided sub-types.
 * @property {boolean} [canBeDefault=true]          Whether this sheet is available to be selected as a default sheet
 *                                                  for all Documents of that type.
 * @property {boolean} [canConfigure=true]          Whether this sheet appears in the sheet configuration UI for users.
 */

/**
 * @typedef {Omit<SheetRegistrationDescriptor, "documentClass"|"id"|"sheetClass">} SheetRegistrationOptions
 */

/**
 * @typedef DocumentSheetConfigRenderContext
 * @property {DocumentSheetConfigFieldDescriptor} sheet  Context for the sheet field.
 * @property {DocumentSheetConfigFieldDescriptor} theme  Context for the theme field.
 */

/**
 * @typedef DocumentSheetConfigFieldDescriptor
 * @property {DataField} field     The field instance.
 * @property {string} name         The field's form name.
 * @property {string} value        The field's value.
 * @property {boolean} [disabled]  Whether the field should be disabled in the form.
 */

/**
 * An Application for configuring Document sheet settings.
 * @extends {ApplicationV2<
 *  ApplicationConfiguration & DocumentSheetConfiguration,
 *  ApplicationRenderOptions & DocumentSheetRenderOptions
 * >}
 * @mixes HandlebarsApplication
 */
export default class DocumentSheetConfig extends HandlebarsApplicationMixin(DocumentSheetV2) {
  /** @override */
  static DEFAULT_OPTIONS = {
    id: "sheet-config-{id}",
    classes: ["sheet-config"],
    sheetConfig: false,
    window: {
      contentClasses: ["standard-form"],
      icon: "fa-solid fa-gear"
    },
    position: {width: 500},
    form: {
      handler: DocumentSheetConfig.#onSubmitForm,
      closeOnSubmit: true
    }
  };

  /** @override */
  static PARTS = {
    form: {
      classes: ["standard-form"],
      template: "templates/sheets/document-sheet-config.hbs"
    },
    footer: {
      template: "templates/generic/form-footer.hbs"
    }
  };

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * The cached render context for the sheet defaults.
   * @type {DocumentSheetConfigRenderContext}
   */
  #defaults;

  /**
   * The cached render context for the Document.
   * @type {DocumentSheetConfigRenderContext}
   */
  #document;

  /** @override */
  get title() {
    const { constructor: cls, documentName, type } = this.document;
    const prefix = cls.hasTypeData && (type !== "base")
      ? CONFIG[documentName].typeLabels[type]
      : cls.metadata.label;
    return game.i18n.format("SHEETS.ConfigureTitle", { prefix: game.i18n.localize(prefix) });
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @override */
  async _preparePartContext(partId, context, options) {
    context.partId = partId;
    switch ( partId ) {
      case "footer": await this._prepareFooterContext(context, options); break;
      case "form": await this._prepareFormContext(context, options); break;
    }
    return context;
  }

  /* -------------------------------------------- */

  /**
   * Prepare render context for the footer part.
   * @param {ApplicationRenderContext} context
   * @param {ApplicationRenderOptions} options
   * @returns {Promise<void>}
   * @protected
   */
  async _prepareFooterContext(context, options) {
    context.buttons = [{
      type: "submit",
      icon: "fa-solid fa-floppy-disk",
      label: "SHEETS.Save"
    }];
  }

  /* -------------------------------------------- */

  /**
   * Prepare render context for the form part.
   * @param {ApplicationRenderContext} context
   * @param {ApplicationRenderOptions} options
   * @returns {Promise<void>}
   * @protected
   */
  async _prepareFormContext(context, options) {
    const document = this.document;
    const { documentName, type=CONST.BASE_DOCUMENT_TYPE } = document;
    const {
      sheetClasses, defaultClasses, defaultClass
    } = DocumentSheetConfig.getSheetClassesForSubType(documentName, type);
    const sheetClass = document.flags.core?.sheetClass ?? "";
    const config = CONFIG[documentName].sheetClasses[type] ?? {};
    const themes = game.settings.get("core", "sheetThemes");
    const currentClass = sheetClass || defaultClass;

    context.document = this.#document = {
      sheet: {
        field: new foundry.data.fields.StringField({
          label: "SHEETS.ThisSheet",
          hint: "SHEETS.DocumentSheetHint",
          choices: sheetClasses
        }),
        name: "sheetClass",
        value: sheetClass
      },
      theme: {
        field: new foundry.data.fields.StringField({
          label: "SHEETS.Theme",
          hint: "SHEETS.ThemeHint",
          choices: config[currentClass]?.themes ?? {}
        }),
        name: "theme",
        value: themes.documents?.[document.uuid] || "",
        disabled: isSubclass(config[currentClass]?.cls, foundry.appv1.api.Application)
      }
    };

    context.defaults = this.#defaults = {
      sheet: {
        field: new foundry.data.fields.StringField({
          label: "SHEETS.DefaultSheet",
          hint: "SHEETS.TypeSheetHint",
          choices: defaultClasses
        }),
        name: "defaultClass",
        disabled: !game.user.isGM,
        value: defaultClass
      },
      theme: {
        field: new foundry.data.fields.StringField({
          label: "SHEETS.Theme",
          hint: "SHEETS.ThemeHint",
          choices: config[defaultClass]?.themes ?? {}
        }),
        name: "defaultTheme",
        value: foundry.utils.getProperty(themes, `defaults.${documentName}.${type}`) || "",
        disabled: isSubclass(config[defaultClass]?.cls, foundry.appv1.api.Application)
      }
    };
  }

  /* -------------------------------------------- */
  /*  Event Listeners & Handlers                  */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _onChangeForm(formConfig, event) {
    // Update theme options based on which sheet is selected.
    super._onChangeForm(formConfig, event);
    const { defaultTheme, theme } = new FormDataExtended(this.form).object;
    this.form.elements.defaultTheme.replaceChildren(...this.#defaults.theme.field.toInput({
      localize: true, blank: "Default"
    }).children);
    this.form.elements.defaultTheme.value = defaultTheme ?? "";
    this.form.elements.theme.replaceChildren(...this.#document.theme.field.toInput({
      localize: true, blank: "Default"
    }).children);
    this.form.elements.theme.value = theme ?? "";

    // Disable theme selection if the sheet class doesn't support it.
    if ( ["sheetClass", "defaultClass"].includes(event.target.name) ) {
      for ( const [sheetSelectName, themeSelectName] of [["sheetClass", "theme"], ["defaultTheme", "defaultTheme"]] ) {
        const sheetSelectEl = this.form.elements[sheetSelectName];
        const {documentName, type=CONST.BASE_DOCUMENT_TYPE} = this.document;
        const config = CONFIG[documentName].sheetClasses[type] ?? {};
        const sheetValue = sheetSelectEl.value || this.form.elements.defaultClass.value;
        const Cls = config[sheetValue]?.cls;
        this.form.elements[themeSelectName].disabled = isSubclass(Cls, foundry.appv1.api.Application);
      }
    }
  }

  /* -------------------------------------------- */

  /** @override */
  _onClose(_options) {}

  /* -------------------------------------------- */

  /** @override */
  _onFirstRender(_context, _options) {}

  /* -------------------------------------------- */

  /**
   * Process form submission for the sheet.
   * @this {DocumentSheetConfig}
   * @param {SubmitEvent} event          The form submission event.
   * @param {HTMLFormElement} form       The form element that was submitted.
   * @param {FormDataExtended} formData  Processed data for the submitted form.
   * @returns {Promise<void>}
   */
  static async #onSubmitForm(event, form, formData) {
    const { object } = formData;
    const { documentName, type=CONST.BASE_DOCUMENT_TYPE } = this.document;

    // Update themes.
    const themes = game.settings.get("core", "sheetThemes");
    const defaultTheme = foundry.utils.getProperty(themes, `defaults.${documentName}.${type}`);
    const documentTheme = themes.documents?.[this.document.uuid];
    const themeChanged = (object.defaultTheme !== defaultTheme) || (object.theme !== documentTheme);
    if ( themeChanged ) {
      foundry.utils.setProperty(themes, `defaults.${documentName}.${type}`, object.defaultTheme);
      themes.documents ??= {};
      themes.documents[this.document.uuid] = object.theme;
      await game.settings.set("core", "sheetThemes", themes);
    }

    // Update sheets.
    const { defaultClass } = this.constructor.getSheetClassesForSubType(documentName, type);
    const sheetClass = this.document.getFlag("core", "sheetClass") ?? "";
    const defaultSheetChanged = object.defaultClass !== defaultClass;
    const documentSheetChanged = object.sheetClass !== sheetClass;

    if ( themeChanged || (game.user.isGM && defaultSheetChanged) ) {
      if ( game.user.isGM && defaultSheetChanged ) {
        const setting = game.settings.get("core", "sheetClasses");
        foundry.utils.setProperty(setting, `${documentName}.${type}`, object.defaultClass);
        await game.settings.set("core", "sheetClasses", setting);
      }

      // Trigger a sheet change manually if it wouldn't be triggered by the normal ClientDocument#_onUpdate workflow.
      if ( !documentSheetChanged ) return this.document._onSheetChange({ sheetOpen: true });
    }

    // Update the document-specific override.
    if ( documentSheetChanged ) return this.document.setFlag("core", "sheetClass", object.sheetClass);
  }

  /* -------------------------------------------- */
  /*  Helpers                                     */
  /* -------------------------------------------- */

  /**
   * Marshal information on the available sheet classes for a given document type and sub-type, and format it for
   * display.
   * @param {string} documentName  The Document type.
   * @param {string} [subType]     The Document sub-type, if applicable.
   * @returns {{sheetClasses: Record<string, string>, defaultClasses: Record<string, string>, defaultClass: string}}
   */
  static getSheetClassesForSubType(documentName, subType) {
    subType ||= CONST.BASE_DOCUMENT_TYPE;
    let defaultClass;
    const config = CONFIG[documentName];
    const {defaultClasses, sheetClasses} = Object.values(config.sheetClasses[subType]).reduce((obj, cfg) => {
      if ( cfg.canConfigure ) obj.sheetClasses[cfg.id] = cfg.label;
      if ( cfg.default && !defaultClass ) defaultClass = cfg.id;
      if ( cfg.canConfigure && cfg.canBeDefault ) obj.defaultClasses[cfg.id] = cfg.label;
      return obj;
    }, {defaultClasses: {}, sheetClasses: {}});
    defaultClass ??= Object.keys(defaultClasses)[0];
    return {sheetClasses, defaultClasses, defaultClass};
  }

  /* -------------------------------------------- */

  /**
   * Retrieve the user's theme preference for the given Document.
   * @param {ClientDocument} document  The Document.
   * @returns {string}                 The theme identifier, or a blank string if the user has no preference.
   */
  static getSheetThemeForDocument(document) {
    const { documentName, uuid, type=CONST.BASE_DOCUMENT_TYPE } = document;
    const { defaultClass } = this.getSheetClassesForSubType(documentName, type);
    const sheetClass = document.getFlag("core", "sheetClass");
    const config = CONFIG[documentName].sheetClasses[type];
    const themes = config?.[sheetClass || defaultClass]?.themes ?? {};
    const setting = game.settings.get("core", "sheetThemes");
    const defaultTheme = foundry.utils.getProperty(setting, `defaults.${documentName}.${type}`);
    const documentTheme = setting.documents?.[uuid];
    if ( documentTheme && (documentTheme in themes) ) return documentTheme;
    if ( defaultTheme && (defaultTheme in themes) ) return defaultTheme;
    return "";
  }

  /* -------------------------------------------- */
  /*  Sheet Configuration API                     */
  /* -------------------------------------------- */

  /**
   * An array of pending sheet assignments which are submitted before other elements of the framework are ready.
   * @type {Array<SheetRegistrationDescriptor & { action: "register"|"unregister" }>}
   */
  static #pending = [];

  /* -------------------------------------------- */

  /**
   * Get the available Document sub-types for the given Document class.
   * @param {typeof ClientDocument} cls  The Document class.
   * @param {string[]} types             A sub-set of Document sub-types to return instead.
   */
  static #getDocumentTypes(cls, types=[]) {
    return types.length ? types : game.documentTypes[cls.documentName];
  }

  /* -------------------------------------------- */

  /**
   * Initialize the configured sheet preferences for Documents which support dynamic sheet assignment.
   * @returns {Promise<void>}
   */
  static async initializeSheets() {
    for ( const documentName of CONST.ALL_DOCUMENT_TYPES ) {
      const cls = foundry.utils.getDocumentClass(documentName);
      const types = DocumentSheetConfig.#getDocumentTypes(cls);
      CONFIG[documentName].sheetClasses = types.reduce((obj, type) => {
        obj[type] = {};
        return obj;
      }, {});
    }

    // Register any pending sheets.
    for ( const pending of DocumentSheetConfig.#pending ) {
      if ( pending.action === "register" ) DocumentSheetConfig.#registerSheet(pending);
      else if ( pending.action === "unregister" ) DocumentSheetConfig.#unregisterSheet(pending);
    }
    DocumentSheetConfig.#pending = [];

    // Update default sheet preferences.
    const defaults = game.settings.get("core", "sheetClasses");
    this.updateDefaultSheets(defaults);
  }

  /* -------------------------------------------- */

  /**
   * Register a sheet class as a candidate to be used to display Documents of a given type.
   * @param {typeof ClientDocument} documentClass                 The Document class to register a new sheet for.
   * @param {string} scope                                        A unique namespace scope for this sheet.
   * @param {typeof Application|typeof ApplicationV2} sheetClass  An Application class used to render the sheet.
   * @param {SheetRegistrationOptions} options                    Sheet registration configuration options.
   */
  static registerSheet(documentClass, scope, sheetClass, options={}) {
    const { label, types, themes, makeDefault=false, canBeDefault=true, canConfigure=true } = options;
    const id = `${scope}.${sheetClass.name}`;
    const config = { documentClass, id, label, sheetClass, types, themes, makeDefault, canBeDefault, canConfigure };
    if ( game.ready ) DocumentSheetConfig.#registerSheet(config);
    else {
      config.action = "register";
      this.#pending.push(config);
    }
  }

  /* -------------------------------------------- */

  /**
   * Perform the sheet registration.
   * @param {SheetRegistrationDescriptor} config  Sheet registration configuration.
   */
  static #registerSheet(config={}) {
    let { documentClass, id, label, sheetClass, types, themes, makeDefault, canBeDefault, canConfigure } = config;
    types = DocumentSheetConfig.#getDocumentTypes(documentClass, types);
    if ( themes === undefined ) {
      themes = {
        dark: "SETTINGS.UI.FIELDS.colorScheme.choices.dark",
        light: "SETTINGS.UI.FIELDS.colorScheme.choices.light"
      };
    }
    if ( label instanceof Function ) label = label();
    else if ( label ) label = game.i18n.localize(label);
    else label = id;
    const classes = CONFIG[documentClass.documentName]?.sheetClasses;
    const defaultSheets = game.settings.get("core", "sheetClasses");
    if ( foundry.utils.getType(classes) !== "Object" ) return;
    for ( const t of types ) {
      classes[t] ??= {};
      const existingDefault = defaultSheets[documentClass.documentName]?.[t];
      const isDefault = existingDefault ? existingDefault === id : makeDefault;
      if ( isDefault ) Object.values(classes[t]).forEach(s => s.default = false);
      classes[t][id] = {
        id, label, themes, canBeDefault, canConfigure,
        cls: sheetClass,
        default: isDefault
      };
    }
  }

  /* -------------------------------------------- */

  /**
   * Unregister a sheet class, removing it from the list of available Applications to use for a Document type.
   * @param {typeof ClientDocument} documentClass                 The Document class to register a new sheet option for.
   * @param {string} scope                                        A unique namespace scope for this sheet.
   * @param {typeof Application|typeof ApplicationV2} sheetClass  An Application class used to render the sheet.
   * @param {object} [options]
   * @param {string[]} [options.types]                            The sub-types this sheet should be removed for,
   *                                                              otherwise all sub-types are unregistered.
   */
  static unregisterSheet(documentClass, scope, sheetClass, { types }={}) {
    const id = `${scope}.${sheetClass.name}`;
    const config = { documentClass, id, types };
    if ( game.ready ) DocumentSheetConfig.#unregisterSheet(config);
    else {
      config.action = "unregister";
      this.#pending.push(config);
    }
  }

  /* -------------------------------------------- */

  /**
   * Perform the sheet de-registration.
   * @param {Partial<SheetRegistrationDescriptor>} config  Sheet de-registration configuration.
   */
  static #unregisterSheet(config={}) {
    let { documentClass, id, types } = config;
    types = DocumentSheetConfig.#getDocumentTypes(documentClass, types);
    const classes = CONFIG[documentClass.documentName]?.sheetClasses;
    if ( foundry.utils.getType(classes) !== "Object" ) return;
    for ( const t of types ) delete classes[t][id];
  }

  /* -------------------------------------------- */

  /**
   * Update the current default sheets using a new core World setting.
   * @param {Record<string, string>} setting  The stored default sheet settings.
   */
  static updateDefaultSheets(setting={}) {
    if ( foundry.utils.isEmpty(setting) ) return;
    for ( const documentName of CONST.ALL_DOCUMENT_TYPES ) {
      const cfg = CONFIG[documentName];
      const classes = cfg.sheetClasses;
      const collection = cfg.collection?.instance ?? [];
      const defaults = setting[documentName];
      if ( !defaults ) continue;

      // Update default preference for registered sheets.
      for ( const [type, sheetId] of Object.entries(defaults) ) {
        if ( !sheetId ) continue;
        const sheets = Object.values(classes[type] || {});
        const requested = sheets.find(s => s.id === sheetId);
        if ( requested ) sheets.forEach(s => s.default = s.id === sheetId);
      }

      // Close and de-register any existing sheets.
      for ( const document of collection ) {
        for ( const app of Object.values(document.apps) ) app.close();
        document._sheet = null;
      }
    }
  }
}

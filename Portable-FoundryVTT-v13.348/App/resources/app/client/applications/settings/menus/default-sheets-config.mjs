import CategoryBrowser from "@client/applications/api/category-browser.mjs";
import DocumentSheetConfig from "@client/applications/apps/document-sheet-config.mjs";
import SettingsConfig from "../config.mjs";
import * as fields from "@common/data/fields.mjs";
import {ALL_DOCUMENT_TYPES, GAME_VIEWS} from "@common/constants.mjs";
import {expandObject, getDocumentClass} from "@client/utils/_module.mjs";

/**
 * @import {ApplicationClickAction, ApplicationFormSubmission} from "@client/applications/_types.mjs"
 */

export default class DefaultSheetsConfig extends CategoryBrowser {

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    id: "default-sheets-config",
    window: {
      title: "SETTINGS.DefaultSheetsN",
      icon: "fa-solid fa-scroll"
    },
    position: {
      width: 720,
      height: 600
    },
    form: {
      handler: DefaultSheetsConfig.#onSubmit
    },
    actions: {
      resetDefaults: DefaultSheetsConfig.#onResetDefaults
    },
    subtemplates: {
      category: "templates/settings/menus/default-sheets-category.hbs",
      sidebarFooter: "templates/category-browser/reset.hbs"
    }
  };

  /**
   * The Default Sheets setting name
   * @type {"sheetClasses"}
   */
  static SETTING = "sheetClasses";

  /* -------------------------------------------- */
  /**
   * All document types with configurable default sheets
   * @type {Set<string>}
   */
  static #DOCUMENT_TYPES = Array.from(new Set(ALL_DOCUMENT_TYPES).difference(new Set(["ActorDelta", "ChatMessage",
    "FogExploration", "JournalEntryCategory", "Setting"])));

  /* -------------------------------------------- */

  /**
   * The "sheetClasses" Setting field
   * @type {fields.SchemaField}
   */
  static get SCHEMA() {
    if ( DefaultSheetsConfig.#SCHEMA ) return DefaultSheetsConfig.#SCHEMA;
    const schema = DefaultSheetsConfig.#DOCUMENT_TYPES.reduce((schema, documentName) => {
      const Cls = getDocumentClass(documentName);
      const label = game.i18n.localize(Cls.metadata.labelPlural);
      schema[documentName] = new fields.TypedObjectField(new fields.StringField({required: true, nullable: true,
        blank: false, initial: null}), {label});
      return schema;
    }, {});
    return DefaultSheetsConfig.#SCHEMA = new fields.SchemaField(schema);
  }

  /**
   * @type {fields.SchemaField}
   */
  static #SCHEMA;

  /* -------------------------------------------- */

  /**
   * Register the "sheetClasses" Setting and this menu application.
   */
  static registerSetting() {
    if ( !GAME_VIEWS.includes(game.view) ) return;
    game.settings.register("core", DefaultSheetsConfig.SETTING, {
      name: "Sheet Class Configuration",
      scope: "world",
      config: false,
      type: DefaultSheetsConfig.SCHEMA,
      onChange: setting => DocumentSheetConfig.updateDefaultSheets(setting)
    });
    game.settings.registerMenu("core", DefaultSheetsConfig.SETTING, {
      name: "SETTINGS.DefaultSheetsN",
      label: "SETTINGS.DefaultSheetsL",
      hint: "SETTINGS.DefaultSheetsH",
      icon: "fa-solid fa-scroll",
      type: DefaultSheetsConfig,
      restricted: true
    });
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _prepareCategoryData() {
    const setting = game.settings.get("core", DefaultSheetsConfig.SETTING);
    return Object.entries(DefaultSheetsConfig.SCHEMA.fields).reduce((categories, [documentName, field]) => {
      const documentClass = getDocumentClass(documentName);
      if ( !documentClass.hasTypeData ) return categories;
      const entries = game.documentTypes[documentName].flatMap(subtype => {
        if ( subtype === CONST.BASE_DOCUMENT_TYPE ) return [];
        const defaults = DocumentSheetConfig.getSheetClassesForSubType(documentName, subtype);
        const {defaultClasses: choices, defaultClass} = defaults;
        if ( !defaultClass ) return [];
        const currentClass = setting[documentName][subtype] ?? null;
        if ( currentClass === null ) { // Keep unaltered sheetClass values as `null`
          const defaultLabel = choices[defaultClass];
          delete choices[defaultClass];
          choices[""] = defaultLabel;
        }
        const id = `${documentName}-${subtype}`;
        const name = `${documentName}.${subtype}`;
        const typeLabel = CONFIG[documentName].typeLabels?.[subtype];
        const label = typeLabel ? game.i18n.localize(typeLabel) : subtype;
        const value = defaultClass in choices ? defaultClass : "";
        return Object.keys(choices).length ? {id, name, label, value, choices} : [];
      });
      if ( !entries.length ) return categories;
      categories[documentName] = {id: documentName, label: field.label, entries};
      return categories;
    }, {});
  }

  /* -------------------------------------------- */

  /**
   * Handle button click to reset default settings
   * @this {DefaultSheetsConfig}
   * @type {ApplicationClickAction}
   */
  static async #onResetDefaults() {
    const {SETTING, SCHEMA} = DefaultSheetsConfig;
    await game.settings.set("core", SETTING, SCHEMA.getInitialValue());
    return SettingsConfig.reloadConfirm({world: true});
  }

  /* -------------------------------------------- */

  /**
   * Update the default sheets setting.
   * @this {DefaultSheetsConfig}
   * @type {ApplicationFormSubmission}
   */
  static async #onSubmit(_event, _form, formData) {
    const submitData = expandObject(formData.object);
    const update = DefaultSheetsConfig.SCHEMA.clean(submitData);
    return game.settings.set("core", "sheetClasses", update);
  }
}

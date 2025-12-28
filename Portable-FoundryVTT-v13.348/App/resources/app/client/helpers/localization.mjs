import Hooks from "./hooks.mjs";

/** @import DataModel from "@common/abstract/data.mjs" */

/**
 * A helper class which assists with localization and string translation
 * @param {string} serverLanguage       The default language configuration setting for the server
 */
export default class Localization {
  constructor(serverLanguage) {

    // Obtain the default language from application settings
    const [defaultLanguage, defaultModule] = (serverLanguage || "en.core").split(".");

    /**
     * The target language for localization
     * @type {string}
     */
    this.lang = defaultLanguage;

    /**
     * The package authorized to provide default language configurations
     * @type {string}
     */
    this.defaultModule = defaultModule;

    /**
     * The translation dictionary for the target language
     * @type {Object}
     */
    this.translations = {};

    /**
     * Fallback translations if the target keys are not found
     * @type {Object}
     * @internal
     */
    this._fallback = {};
  }

  /* -------------------------------------------- */

  /**
   * Cached store of Intl.ListFormat instances.
   * @type {Record<string, Intl.ListFormat>}
   */
  #formatters = {};

  /* -------------------------------------------- */

  /**
   * Initialize the Localization module
   * Discover available language translations and apply the current language setting
   * @returns {Promise<void>}      A Promise which resolves once languages are initialized
   */
  async initialize() {
    const clientLanguage = await game.settings.get("core", "language") || this.lang;

    // Discover which modules available to the client
    this.#discoverSupportedLanguages();

    // Activate the configured language
    if ( clientLanguage !== this.lang ) this.defaultModule = "core";
    await this.setLanguage(clientLanguage || this.lang);

    // Define type labels
    if ( game.system ) {
      for ( const [documentName, types] of Object.entries(game.documentTypes) ) {
        const config = CONFIG[documentName];
        config.typeLabels = config.typeLabels || {};
        for ( const t of types ) {
          if ( config.typeLabels[t] ) continue;
          config.typeLabels[t] = t === CONST.BASE_DOCUMENT_TYPE ? "TYPES.Base" :`TYPES.${documentName}.${t}`;
        }
      }
    }

    // Pre-localize data models
    Localization.#localizeDataModels();
    Hooks.callAll("i18nInit");
  }

  /* -------------------------------------------- */
  /*  Data Model Localization                     */
  /* -------------------------------------------- */

  /**
   * Perform one-time localization of the fields in a DataModel schema, translating their label and hint properties.
   * @param {typeof DataModel} model          The DataModel class to localize
   * @param {object} options                  Options which configure how localization is performed
   * @param {string[]} [options.prefixes]       An array of localization key prefixes to use. If not specified, prefixes
   *                                            are learned from the DataModel.LOCALIZATION_PREFIXES static property.
   * @param {string} [options.prefixPath]       A localization path prefix used to prefix all field names within this
   *                                            model. This is generally not required.
   *
   * @see {@link DataModel.LOCALIZATION_PREFIXES} for an example of the class definition and
   * localization file structure.
   */
  static localizeDataModel(model, {prefixes, prefixPath}={}) {
    prefixes ||= model.LOCALIZATION_PREFIXES;
    Localization.localizeSchema(model.schema, prefixes, {prefixPath});
  }

  /* -------------------------------------------- */

  /**
   * Perform one-time localization of data model definitions which localizes their label and hint properties.
   */
  static #localizeDataModels() {
    const seenFields = new Set();
    for ( const documentName of CONST.ALL_DOCUMENT_TYPES ) {
      const cls = foundry.utils.getDocumentClass(documentName);
      Localization.localizeDataModel(cls, {seenFields});
      for ( const model of Object.values(CONFIG[cls.documentName].dataModels ?? {}) ) {
        Localization.localizeDataModel(model, {prefixPath: "system.", seenFields});
      }
    }
    for ( const cls of [foundry.packages.World, foundry.packages.System, foundry.packages.Module] ) {
      Localization.localizeDataModel(cls, {seenFields});
    }
    Localization.localizeDataModel(foundry.data.PrototypeToken, {seenFields});
  }

  /* -------------------------------------------- */

  /**
   * Localize the "label" and "hint" properties for all fields in a data schema.
   * @param {SchemaField} schema
   * @param {string[]} prefixes
   * @param {object} [options]
   * @param {string} [options.prefixPath]
   * @param {Set<foundry.data.fields.DataField>} [options.seenFields]
   */
  static localizeSchema(schema, prefixes=[], {prefixPath="", seenFields=new Set()}={}) {
    const getRules = prefixes => {
      const rules = {};
      for ( const prefix of prefixes ) {
        if ( game.i18n.lang !== "en" ) {
          const fallback = foundry.utils.getProperty(game.i18n._fallback, `${prefix}.FIELDS`);
          Object.assign(rules, fallback);
        }
        Object.assign(rules, foundry.utils.getProperty(game.i18n.translations, `${prefix}.FIELDS`));
      }
      return foundry.utils.deepClone(rules);
    };
    const rules = getRules(prefixes);

    // Apply localization to fields of the model
    const localize = function(_v, options) {
      if ( seenFields.has(this) ) return;
      if ( options.collection ) return; // Embedded collection models are handled separately
      seenFields.add(this);

      // Remove prefix from field path
      let key = this.fieldPath;
      if ( prefixPath && key.startsWith(prefixPath) ) key = key.slice(prefixPath.length);

      // Localize model fields
      const field = foundry.utils.getProperty(rules, key);
      if ( typeof field?.label === "string" ) this.label ||= game.i18n.localize(field.label);
      if ( typeof field?.hint === "string" ) this.hint ||= game.i18n.localize(field.hint);

      // Inner models may have prefixes that take precedence
      if ( this instanceof foundry.data.fields.EmbeddedDataField ) {
        if ( this.model.LOCALIZATION_PREFIXES.length ) {
          foundry.utils.setProperty(rules, key, getRules(this.model.LOCALIZATION_PREFIXES));
        }
      }

      // Special handling of TypedObjectField
      else if ( this instanceof foundry.data.fields.TypedObjectField ) {
        this.element.apply(localize, undefined, {initializeArrays: true});
      }

      // Special handling of TypedSchemaField
      else if ( this instanceof foundry.data.fields.TypedSchemaField ) {
        for ( const schema of Object.values(this.types) ) schema.apply(localize, {}, {initializeArrays: true});
      }
    };
    schema.apply(localize, {}, {initializeArrays: true});
  }

  /* -------------------------------------------- */

  /**
   * Set a language as the active translation source for the session
   * @param {string} lang       A language string in CONFIG.supportedLanguages
   * @returns {Promise<void>}   A Promise which resolves once the translations for the requested language are ready
   */
  async setLanguage(lang) {
    if ( !Object.keys(CONFIG.supportedLanguages).includes(lang) ) {
      console.error(`Cannot set language ${lang}, as it is not in the supported set. Falling back to English`);
      lang = "en";
    }
    this.lang = lang;
    document.documentElement.setAttribute("lang", this.lang);

    // Load translations and English fallback strings
    this.translations = await this.#getTranslations(lang);
    if ( lang !== "en" ) this._fallback = await this.#getTranslations("en");
  }

  /* -------------------------------------------- */

  /**
   * Discover the available supported languages from the set of packages which are provided
   * @returns {object}         The resulting configuration of supported languages
   */
  #discoverSupportedLanguages() {
    const sl = CONFIG.supportedLanguages;

    // Define packages
    const packages = Array.from(game.modules.values());
    if ( game.world ) packages.push(game.world);
    if ( game.system ) packages.push(game.system);
    if ( game.worlds ) packages.push(...game.worlds.values());
    if ( game.systems ) packages.push(...game.systems.values());

    // Registration function
    const register = pkg => {
      if ( !pkg.languages.size ) return;
      for ( const l of pkg.languages ) {
        if ( !sl.hasOwnProperty(l.lang) ) sl[l.lang] = l.name;
      }
    };

    // Register core translation languages first
    for ( const m of game.modules ) {
      if ( m.coreTranslation ) register(m);
    }

    // Discover and register languages
    for ( const p of packages ) {
      if ( p.coreTranslation || ((p.type === "module") && !p.active) ) continue;
      register(p);
    }
    return sl;
  }

  /* -------------------------------------------- */

  /**
   * Prepare the dictionary of translation strings for the requested language
   * @param {string} lang         The language for which to load translations
   * @returns {Promise<object>}   The retrieved translations object
   */
  async #getTranslations(lang) {
    const translations = {};
    const promises = [];

    // Include core supported translations
    if ( CONST.CORE_SUPPORTED_LANGUAGES.includes(lang) ) {
      promises.push(this.#loadTranslationFile(`lang/${lang}.json`));
    }

    // Game system translations
    if ( game.system ) {
      this.#filterLanguagePaths(game.system, lang).forEach(path => {
        promises.push(this.#loadTranslationFile(path));
      });
    }

    // Module translations
    for ( const module of game.modules.values() ) {
      if ( !module.active && (module.id !== this.defaultModule) ) continue;
      this.#filterLanguagePaths(module, lang).forEach(path => {
        promises.push(this.#loadTranslationFile(path));
      });
    }

    // Game world translations
    if ( game.world ) {
      this.#filterLanguagePaths(game.world, lang).forEach(path => {
        promises.push(this.#loadTranslationFile(path));
      });
    }

    // Merge translations in load order and return the prepared dictionary
    await Promise.all(promises);
    for ( const p of promises ) {
      const json = await p;
      foundry.utils.mergeObject(translations, json, {inplace: true});
    }
    return translations;
  }

  /* -------------------------------------------- */

  /**
   * Reduce the languages array provided by a package to an array of file paths of translations to load
   * @param {object} pkg          The package data
   * @param {string} lang         The target language to filter on
   * @returns {string[]}           An array of translation file paths
   */
  #filterLanguagePaths(pkg, lang) {
    return pkg.languages.reduce((arr, l) => {
      if ( l.lang !== lang ) return arr;
      const checkSystem = !l.system || (game.system && (l.system === game.system.id));
      const checkModule = !l.module || game.modules.get(l.module)?.active;
      if (checkSystem && checkModule) arr.push(l.path);
      return arr;
    }, []);
  }

  /* -------------------------------------------- */

  /**
   * Load a single translation file and return its contents as processed JSON
   * @param {string} src        The translation file path to load
   * @returns {Promise<object>} The loaded translation dictionary
   */
  async #loadTranslationFile(src) {

    // Load the referenced translation file
    let err;
    const resp = await fetch(src).catch(e => {
      err = e;
      return {};
    });
    if ( resp.status !== 200 ) {
      const msg = `Unable to load requested localization file ${src}`;
      console.error(`${CONST.vtt} | ${msg}`);
      if ( err ) Hooks.onError("Localization#_loadTranslationFile", err, {msg, src});
      return {};
    }

    // Parse and expand the provided translation object
    let json;
    try {
      json = await resp.json();
      console.log(`${CONST.vtt} | Loaded localization file ${src}`);
      json = foundry.utils.expandObject(json);
    } catch(err) {
      Hooks.onError("Localization#_loadTranslationFile", err, {
        msg: `Unable to parse localization file ${src}`,
        log: "error",
        src
      });
      json = {};
    }
    return json;
  }

  /* -------------------------------------------- */
  /*  Localization API                            */
  /* -------------------------------------------- */

  /**
   * Return whether a certain string has a known translation defined.
   * @param {string} stringId     The string key being translated
   * @param {boolean} [fallback]  Allow fallback translations to count?
   * @returns {boolean}
   */
  has(stringId, fallback=true) {
    let v = foundry.utils.getProperty(this.translations, stringId);
    if ( typeof v === "string" ) return true;
    if ( !fallback ) return false;
    v = foundry.utils.getProperty(this._fallback, stringId);
    return typeof v === "string";
  }

  /* -------------------------------------------- */

  /**
   * Localize a string by drawing a translation from the available translations dictionary, if available
   * If a translation is not available, the original string is returned
   * @param {string} stringId       The string ID to translate
   * @returns {string}              The translated string
   *
   * @example Localizing a simple string in JavaScript
   * ```js
   * {
   *   "MYMODULE.MYSTRING": "Hello, this is my module!"
   * }
   * game.i18n.localize("MYMODULE.MYSTRING"); // Hello, this is my module!
   * ```
   *
   * @example Localizing a simple string in Handlebars
   * ```hbs
   * {{localize "MYMODULE.MYSTRING"}} <!-- Hello, this is my module! -->
   * ```
   */
  localize(stringId) {
    let v = foundry.utils.getProperty(this.translations, stringId);
    if ( typeof v === "string" ) return v;
    if ( CONFIG.debug.i18n ) console.error(`Localization | Key "${stringId}" is not defined.`);
    v = foundry.utils.getProperty(this._fallback, stringId);
    return typeof v === "string" ? v : stringId;
  }

  /* -------------------------------------------- */

  /**
   * Localize a string including variable formatting for input arguments.
   * Provide a string ID which defines the localized template.
   * Variables can be included in the template enclosed in braces and will be substituted using those named keys.
   *
   * @param {string} stringId     The string ID to translate
   * @param {object} data         Provided input data
   * @returns {string}             The translated and formatted string
   *
   * @example Localizing a formatted string in JavaScript
   * ```js
   * {
   *   "MYMODULE.GREETING": "Hello {name}, this is my module!"
   * }
   * game.i18n.format("MYMODULE.GREETING" {name: "Andrew"}); // Hello Andrew, this is my module!
   * ```
   *
   * @example Localizing a formatted string in Handlebars
   * ```hbs
   * {{localize "MYMODULE.GREETING" name="Andrew"}} <!-- Hello, this is my module! -->
   * ```
   */
  format(stringId, data={}) {
    let str = this.localize(stringId);
    const fmt = /{[^}]+}/g;
    str = str.replace(fmt, k => {
      return data[k.slice(1, -1)];
    });
    return str;
  }

  /* -------------------------------------------- */

  /**
   * Retrieve list formatter configured to the world's language setting.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/ListFormat/ListFormat}
   * @param {object} [options]
   * @param {Intl.ListFormatStyle} [options.style="long"] The list formatter style, either "long", "short", or "narrow".
   * @param {Intl.ListFormatType} [options.type="conjunction"] The list formatter type, either "conjunction",
   *                                                           "disjunction", or "unit".
   * @returns {Intl.ListFormat}
   */
  getListFormatter({style="long", type="conjunction"}={}) {
    const key = `${style}${type}`;
    this.#formatters[key] ??= new Intl.ListFormat(this.lang, {style, type});
    return this.#formatters[key];
  }

  /* -------------------------------------------- */

  /**
   * Sort an array of objects by a given key in a localization-aware manner.
   * @param {object[]} objects  The objects to sort, this array will be mutated.
   * @param {string} key        The key to sort the objects by. This can be provided in dot-notation.
   * @returns {object[]}
   */
  sortObjects(objects, key) {
    const collator = new Intl.Collator(this.lang);
    objects.sort((a, b) => {
      return collator.compare(foundry.utils.getProperty(a, key), foundry.utils.getProperty(b, key));
    });
    return objects;
  }
}

import ApplicationV2 from "@client/applications/api/application.mjs";
import HandlebarsApplicationMixin from "@client/applications/api/handlebars-application.mjs";
import FormDataExtended from "@client/applications/ux/form-data-extended.mjs";
import SettingsConfig from "@client/applications/settings/config.mjs";

/**
 * @import {FontFamilyDefinition, FontDefinition} from "@client/config.mjs";
 * @import {ApplicationClickAction, ApplicationConfiguration, ApplicationFormSubmission} from "../_types.mjs";
 */

/**
 * @typedef NewFontDefinition
 * @property {string} family
 * @property {number} [weight=400]
 * @property {string} [style="normal"]
 * @property {string} [src=""]
 * @property {string} [preview]
 */

/**
 * @typedef FontTypes
 * @property {string} FILE   Font is a file
 * @property {string} SYSTEM Font is from the system
 */

/**
 * A V2 application responsible for configuring custom fonts for the world.
 */
export default class FontConfig extends HandlebarsApplicationMixin(ApplicationV2) {
  /**
   * @param {DeepPartial<ApplicationConfiguration & NewFontDefinition>} [options={}] App config
   */
  constructor(options={}) {
    foundry.utils.mergeObject(options, {
      family: "",
      weight: 400,
      style: "normal",
      src: "",
      preview: game.i18n.localize("FONTS.FontPreview"),
      type: FontConfig.FONT_TYPES.FILE
    });
    super(options);
    this.object = options;
  }

  /**
   * Font types.
   * @type {FontTypes}
   * @readonly
   */
  static FONT_TYPES = Object.freeze({
    FILE: "file",
    SYSTEM: "system"
  });

  /**
   * The Foundry game setting key storing the world's fonts.
   * @type {string}
   */
  static SETTING = "fonts";

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    id: "font-config",
    tag: "form",
    window: {
      contentClasses: ["standard-form"],
      title: "SETTINGS.FontConfigL",
      icon: "fa-solid fa-font"
    },
    position: {
      width: 600,
    },
    form: {
      closeOnSubmit: true
    }
  }

  /** @override */
  static PARTS = {
    body: {
      template: "templates/settings/menus/font-config.hbs",
      scrollable: [""]
    },
    footer: {
      template: "templates/generic/form-footer.hbs"
    }
  };

  /**
   * Returns localized style choices.
   * @type {Array<{value: string, label: string}>}
   */
  static get #styleChoices() {
    return this.#STYLE_CHOICES ??= [
      {value: "normal", label: game.i18n.localize("FONTS.Styles.Normal")},
      {value: "italic", label: game.i18n.localize("FONTS.Styles.Italic")}
    ];
  }
  static #STYLE_CHOICES;

  /**
   * The new or in-progress font object we're editing.
   * @type {NewFontDefinition}
   */
  object;

  /**
   * Whether fonts have been modified since opening the application.
   * @type {boolean}
   */
  #fontsModified = false;

  /**
   * Which font is currently selected from the existing definitions.
   * @type {{family: string, index: number}|null}
   */
  #selected = null;

  /* -------------------------------------------- */
  /*  Static Font Management                      */
  /* -------------------------------------------- */

  /**
   * A private Set of successfully loaded font family names.
   * @type {Set<string>}
   */
  static #available = new Set();

  /* -------------------------------------------- */

  /**
   * Returns a list of loaded font families.
   * @returns {string[]}
   */
  static getAvailableFonts() {
    return Array.from(this.#available);
  }

  /* -------------------------------------------- */

  /**
   * Returns a record of loaded font families, formatted for selectOptions.
   * @returns {Record<string, string>}
   */
  static getAvailableFontChoices() {
    return this.getAvailableFonts().reduce((obj, fam) => {
      obj[fam] = fam;
      return obj;
    }, {});
  }

  /* -------------------------------------------- */

  /**
   * Load a font definition for a given family.
   * @param {string} family                     The font family name (case-sensitive).
   * @param {FontFamilyDefinition} definition   The font family definition.
   * @returns {Promise<boolean>}                Returns true if the font was successfully loaded.
   */
  static async loadFont(family, definition) {
    const check = `1rem "${family}"`;
    try {
      for ( const font of definition.fonts ) {
        const fontFace = this._createFontFace(family, font);
        await fontFace.load();
        document.fonts.add(fontFace);
      }
      await document.fonts.load(check);
    }
    catch (err) {
      console.warn(`Font family "${family}" failed to load:`, err);
      return false;
    }

    if ( !document.fonts.check(check) ) {
      console.warn(`Font family "${family}" failed to load.`);
      return false;
    }

    if ( definition.editor ) this.#available.add(family);
    return true;
  }

  /* -------------------------------------------- */

  /**
   * Ensure that fonts have loaded and are ready for use.
   * Enforce a maximum timeout in milliseconds.
   * Proceed after that point even if fonts are not yet available.
   * @param {number} [ms=4500] The maximum time to spend loading fonts before proceeding.
   * @returns {Promise<void>}
   * @internal
   */
  static async _loadFonts(ms=4500) {
    const allFonts = this._collectDefinitions();
    const promises = [];

    for ( const definitions of allFonts ) {
      for ( const [family, def] of Object.entries(definitions) ) {
        promises.push(this.loadFont(family, def));
      }
    }

    const timeout = new Promise(resolve => setTimeout(resolve, ms));
    const ready = Promise.all(promises).then(() => document.fonts.ready);

    return Promise.race([ready, timeout]).then(() =>
      console.log(`${CONST.vtt} | Fonts loaded and ready.`)
    );
  }

  /* -------------------------------------------- */

  /**
   * Collect font definitions from both config and user settings.
   * @returns {Record<string, FontFamilyDefinition>[]}
   * @protected
   */
  static _collectDefinitions() {
    return [CONFIG.fontDefinitions, game.settings.get("core", this.SETTING) || {}];
  }

  /* -------------------------------------------- */

  /**
   * Create a FontFace from a definition.
   * @param {string} family               The font family name.
   * @param {FontDefinition} definition   The font definition.
   * @returns {FontFace}                  The new FontFace.
   * @protected
   */
  static _createFontFace(family, definition) {
    if ( !Array.isArray(definition.urls) ) return null;
    const urls = definition.urls.map(u => `url("${u}")`).join(", ");
    return new FontFace(family, urls, definition);
  }

  /* -------------------------------------------- */

  /**
   * Format a font definition for display.
   * @param {string} family               The font family name.
   * @param {FontDefinition} definition   The font definition.
   * @returns {string}                    The formatted definition.
   * @protected
   */
  static _formatFont(family, definition) {
    if ( foundry.utils.isEmpty(definition) ) return family;
    const w = definition.weight ?? 400;
    const s = definition.style ?? "normal";
    const byWeight = Object.fromEntries(Object.entries(CONST.FONT_WEIGHTS).map(([k, v]) => [v, k]));
    return `
      ${family},
      <span style="font-weight: ${w}">${byWeight[w]} ${w}</span>,
      <span style="font-style: ${s}">${s.toLowerCase()}</span>
    `;
  }

  /* -------------------------------------------- */
  /*  Application                                 */
  /* -------------------------------------------- */

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    const editable = this.element.querySelector("[contenteditable]");
    editable?.addEventListener("blur", this.#onPreviewBlur);
  }

  /* -------------------------------------------- */

  /**
   * Handles blur events on the preview text.
   * @param {FocusEvent} event
   */
  async #handlePreviewBlur(event) {
    this.object.preview = event.currentTarget?.textContent.trim() || game.i18n.localize("FONTS.FontPreview");
  }

  /**
   * A bound reference to the #handlePreviewBlur method.
   * @type {(event: FocusEvent) => Promise<void>}
   */
  #onPreviewBlur = this.#handlePreviewBlur.bind(this);

  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(_options) {
    const definitions = game.settings.get("core", this.constructor.SETTING) ?? {};
    const fonts = Object.entries(definitions).flatMap(
      ([family, definition]) => this._getDataForDefinition(family, definition));

    if ( (this.#selected === null) && fonts.length ) {
      fonts[0].selected = true;
      this.#selected = {family: fonts[0].family, index: fonts[0].index};
    }

    // Reset font properties
    ["weight", "style", "src", "family"].forEach(k => this.object[k] = null);

    let selected = null;
    if ( this.#selected ) {
      const {family, index} = this.#selected;
      selected = definitions[family]?.fonts[index];

      // Always update the family
      this.object.family = family;

      if ( selected ) {
        this.object.weight = selected.weight ?? this.object.weight;
        this.object.style = selected.style ?? this.object.style;
        this.object.src = selected.urls?.[0] ?? "";
      }
    }

    const isSystemFont = this.object.type === FontConfig.FONT_TYPES.SYSTEM;
    const isFileFont = this.object.type === FontConfig.FONT_TYPES.FILE;

    return {
      fonts,
      selected,
      isSystemFont,
      isFileFont,
      font: this.object,
      fontWeights: this.#getWeightChoices(),
      preview: {
        family: selected?.family ?? this.object.family,
        weight: selected?.weight ?? this.object.weight,
        style: selected?.style ?? this.object.style,
        text: this.object.preview
      },
      fontStyles: FontConfig.#styleChoices,
      buttons: [
        {type: "button", label: "FONTS.AddFont", icon: "fa-solid fa-plus", action: "add"}
      ]
    };
  }

  /* -------------------------------------------- */

  /**
   * Build an array of font data objects for a specific font family definition.
   * @param {string} family                       The name of the font family.
   * @param {FontFamilyDefinition} definition     The font family definition, expected to have a `fonts` array.
   * @returns {{family: string, index: number, selected: boolean, font: string}[]} An array of font data objects.
   * @protected
   */
  _getDataForDefinition(family, definition) {
    const fonts = definition.fonts.length ? definition.fonts : [{}];
    return fonts.map((f, i) => {
      const data = {family, index: i};
      data.selected = this.#isSelected(data);
      data.font = this.constructor._formatFont(family, f);
      return data;
    });
  }

  /* -------------------------------------------- */

  /**
   * Determine whether a given font (by family and index) is currently selected.
   * @param {Object} selection             The font selection data.
   * @param {string} selection.family      The font family.
   * @param {number} selection.index       The index of the font within the family.
   * @returns {boolean}                    True if this font matches the currently selected one, otherwise false.
   */
  #isSelected({family, index}) {
    if ( !this.#selected ) return false;
    return (family === this.#selected.family) && (index === this.#selected.index);
  }

  /* -------------------------------------------- */

  /**
   * Provide a list of possible font weights as value/label pairs.
   * @returns {{value: number, label: string}[]} An array of weight choices.
   */
  #getWeightChoices() {
    return Object.entries(CONST.FONT_WEIGHTS).map(([k, v]) => ({
      value: v, label: `${k} ${v}`
    }));
  }

  /* -------------------------------------------- */

  /** @override */
  _onClickAction(event, htmlElement) {
    const action = htmlElement.dataset.action;
    switch ( action ) {
      case "add":
        event.preventDefault();
        return this._onAddFont();
      case "delete":
        return this._onDeleteFont(event);
      case "select":
        return this._onSelectFont(event);
    }
  }

  /* -------------------------------------------- */

  /** @override */
  _onChangeForm(formConfig, event) {
    super._onChangeForm(formConfig, event);
    const fd = new FormDataExtended(this.parts.body).object;
    foundry.utils.mergeObject(this.object, fd);
    if ( event.target.name === "type" ) this.render(true);
  }

  /* -------------------------------------------- */

  /**
   * Add a new font definition.
   * @protected
   */
  async _onAddFont() {
    const fd = new FormDataExtended(this.parts.body);
    const family = (fd.get("family") || "").trim();
    const src = fd.get("src") || "";
    const weight = Number(fd.get("weight") || 400);
    const style = fd.get("style") || "normal";
    const type = fd.get("type") || FontConfig.FONT_TYPES.FILE;

    // Disallow empty family
    if ( !family ) {
      ui.notifications.warn(game.i18n.localize("FONTS.WarnNoFamily"));
      return;
    }

    // Disallow empty file path for file type font
    if ( (type === FontConfig.FONT_TYPES.FILE) && !src ) {
      ui.notifications.warn(game.i18n.localize("FONTS.WarnNoFile"));
      return;
    }

    // Retrieve current settings
    const defs = game.settings.get("core", FontConfig.SETTING) || {};

    // Re-use existing or create new
    defs[family] ??= {editor: true, fonts: []};
    const defn = defs[family];

    // If "file" type, push a new entry
    let count = 1;
    if ( type === FontConfig.FONT_TYPES.FILE ) {
      count = defn.fonts.push({urls: [src], weight, style});
    }

    await game.settings.set("core", FontConfig.SETTING, defs);
    await FontConfig.loadFont(family, defn);

    this.#selected = {family, index: count - 1};
    this.#fontsModified = true;

    foundry.utils.mergeObject(this.object, fd.object);
    this.render(true);
  }

  /* -------------------------------------------- */

  /**
   * Delete a font from definitions.
   * @param {PointerEvent} event
   * @protected
   */
  async _onDeleteFont(event) {
    event.preventDefault();
    const btn = event.target.closest("[data-family]");
    if ( !btn ) return;
    const {family, index} = btn.dataset;

    const defs = game.settings.get("core", this.constructor.SETTING) || {};
    const defn = defs[family];
    if ( !defn ) return;

    defn.fonts.splice(Number(index), 1);
    if ( !defn.fonts.length ) delete defs[family];

    await game.settings.set("core", this.constructor.SETTING, defs);
    if ( this.#isSelected({family, index: Number(index)}) ) this.#selected = null;

    this.#fontsModified = true;
    this.render(true);
  }

  /* -------------------------------------------- */

  /**
   * Select a font to preview/edit.
   * @param {PointerEvent} event
   * @protected
   */
  _onSelectFont(event) {
    event.preventDefault();
    const row = event.target.closest("[data-family]");
    if ( !row ) return;
    const {family, index} = row.dataset;
    this.#selected = {family, index: Number(index)};

    // Load the existing definition
    const defs = game.settings.get("core", this.constructor.SETTING) || {};
    const f = defs[family]?.fonts[this.#selected.index];
    if ( f ) {
      this.object.weight = f.weight ?? this.object.weight;
      this.object.style = f.style ?? this.object.style;
      this.object.src = f.urls?.[0] ?? "";
    }
    this.object.family = family;
    this.render(true);
  }

  /* -------------------------------------------- */

  /** @override */
  async close(options={}) {
    await super.close(options);
    if ( this.#fontsModified ) await SettingsConfig.reloadConfirm({world: true});
    return this;
  }
}

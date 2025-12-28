import {DocumentSheetV2, HandlebarsApplicationMixin} from "../api/_module.mjs";
import FormDataExtended from "../ux/form-data-extended.mjs";
import Scene from "@client/documents/scene.mjs";
import Hooks from "@client/helpers/hooks.mjs";

/**
 * @import {ApplicationClickAction, FormFooterButton} from "../_types.mjs";
 * @import EmbeddedCollection from "@common/abstract/embedded-collection.mjs";
 */

/**
 * The Application responsible for configuring a single Scene document.
 * @extends DocumentSheetV2
 * @mixes HandlebarsApplication
 */
export default class SceneConfig extends HandlebarsApplicationMixin(DocumentSheetV2) {

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    classes: ["scene-config"],
    window: {
      contentClasses: ["standard-form"],
      icon: "fa-solid fa-map"
    },
    position: {width: 560},
    form: {
      closeOnSubmit: true
    },
    actions: {
      capturePosition: SceneConfig.#onCapturePosition,
      toggleLinkDimensions: SceneConfig.#onToggleLinkDimensions,
      openGridConfig: SceneConfig.#onOpenGridConfig,
      resetEnvironment: SceneConfig.#onResetEnvironment
    }
  };

  /** @override */
  static PARTS = {
    tabs: {template: "templates/generic/tab-navigation.hbs"},
    basics: {template: "templates/scene/config/basics.hbs"},
    grid: {template: "templates/scene/config/grid.hbs"},
    lighting: {template: "templates/scene/config/lighting.hbs", scrollable: [""]},
    ambience: {template: "templates/scene/config/ambience.hbs", scrollable: ["div.tab[data-tab=environment]"]},
    footer: {template: "templates/generic/form-footer.hbs"}
  };

  /** @override */
  static TABS = {
    sheet: {
      tabs: [
        {id: "basics", icon: "fa-solid fa-image"},
        {id: "grid", icon: "fa-solid fa-grid"},
        {id: "lighting", icon: "fa-solid fa-lightbulb"},
        {id: "ambience", icon: "fa-solid fa-cloud-sun"}
      ],
      initial: "basics",
      labelPrefix: "SCENE.TABS.SHEET"
    },
    ambience: {
      tabs: [
        {id: "basic", icon: "fa-solid fa-table-list"},
        {id: "environment", icon: "fa-solid fa-cloud-sun"}
      ],
      initial: "basic",
      labelPrefix: "SCENE.TABS.AMBIENCE"
    }
  };

  /* -------------------------------------------- */

  /**
   * Should the width and height change together to maintain aspect ratio?
   * @type {boolean}
   */
  #linkedDimensions = true;

  /**
   * The last inputted scene dimension values, or otherwise the source values: used to track successive changes while
   * dimensions are linked.
   * @type {{width: number; height: number}}
   */
  #lastDimensionValues = {
    width: this.document._source.width,
    height: this.document._source.height
  };

  /* -------------------------------------------- */

  /**
   * Get an enumeration of the available grid types which can be applied to this Scene
   * @returns {Record<GRID_TYPES, string>}
   * @internal
   */
  static _getGridTypes() {
    const labels = {
      GRIDLESS: "SCENE.GridGridless",
      SQUARE: "SCENE.GridSquare",
      HEXODDR: "SCENE.GridHexOddR",
      HEXEVENR: "SCENE.GridHexEvenR",
      HEXODDQ: "SCENE.GridHexOddQ",
      HEXEVENQ: "SCENE.GridHexEvenQ"
    };
    return Object.entries(CONST.GRID_TYPES).reduce((types, [key, value]) => {
      types[value] = game.i18n.localize(labels[key]);
      return types;
    }, {});
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.tabs = this._prepareTabs("sheet");
    return context;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    switch ( partId ) {
      case "basics":
        context.ownerships = [
          {value: 0, label: game.i18n.localize("SCENE.AccessibilityGM")},
          {value: 2, label: game.i18n.localize("SCENE.AccessibilityAll")}
        ];
        break;
      case "grid":
        context.pixelsLabel = game.i18n.localize("SCENE.Pixels");
        context.minGrid = CONST.GRID_MIN_SIZE;
        context.gridTypes = this.constructor._getGridTypes();
        context.gridStyles = Object.entries(CONFIG.Canvas.gridStyles).reduce((styles, [key, value]) => {
          styles[key] = game.i18n.localize(value.label);
          return styles;
        }, {});
        break;
      case "lighting":
        context.environmentFields = context.fields.environment.fields;
        context.fogFields = context.fields.fog.fields;
        context.globalLight = context.source.environment.globalLight;
        break;
      case "ambience": {
        context.baseFields = context.fields.environment.fields.base.fields;
        context.darkFields = context.fields.environment.fields.dark.fields;
        context.pages = this.#documentsToOptions(context.document.journal?.pages, {sortBy: "sort"});
        context.sounds = this.#documentsToOptions(context.document.playlist?.sounds, {sortBy: "name"});
        context.baseHueDisabled = (context.source.environment.base.intensity === 0);
        context.darkHueDisabled = (context.source.environment.dark.intensity === 0);
        context.weatherTypes = Object.entries(CONFIG.weatherEffects).reduce((types, [key, value]) => {
          types[key] = game.i18n.localize(value.label);
          return types;
        }, {});
        context.subtabs = this._prepareTabs("ambience");
        break;
      }
      case "footer":
        context.buttons = this.#prepareButtons();
    }
    if ( partId in context.tabs ) context.tab = context.tabs[partId];
    return context;
  }

  /* -------------------------------------------- */

  /**
   * Prepare buttons that are presented for this application view.
   * @returns {FormFooterButton[]}
   */
  #prepareButtons() {
    return [
      {
        type: "button",
        icon: "fa-solid fa-arrow-rotate-left",
        label: "SCENE.Ambience.ResetEnvironment",
        action: "resetEnvironment"
      },
      {type: "submit", icon: "fa-solid fa-floppy-disk", label: "SETTINGS.Save"}
    ];
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  changeTab(tab, group, options) {
    super.changeTab(tab, group, options);
    this.#onChangeTab();
  }

  /* -------------------------------------------- */

  /**
   * Get the embedded documents of a linked JournalEntry or Playlist
   * @param {EmbeddedCollection|undefined} collection
   * @param {object} options
   * @param {"name"|"sort"} options.sortBy
   * @returns {{value: string; label: string}[]}
   */
  #documentsToOptions(collection, {sortBy}) {
    if ( !collection ) return [];
    const sorted = sortBy === "name"
      ? collection.contents.sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang))
      : collection.contents.sort((a, b) => a.sort - b.sort);
    return sorted.reduce((options, document) => {
      options[document.id] = document.name;
      return options;
    }, {});
  }

  /* -------------------------------------------- */

  /**
   * Live update the scene as certain properties are changed.
   * @param {string} changed The changed property
   * @param {object} [options]
   * @param {boolean} [options.force] Should the preview be forced, regardless of changes?
   * @internal
   */
  _previewScene(changed, {force=false}={}) {
    if ( !this.document.isView || !canvas.ready || (!changed && !force) ) return;

    // Preview triggered for the grid
    if ( force || ["grid.style", "grid.thickness", "grid.color", "grid.alpha"].includes(changed) ) {
      const elements = this.form.elements;
      canvas.interface.grid.initializeMesh({
        style: elements["grid.style"].value,
        thickness: Math.max(1, Number(elements["grid.thickness"].value) || 0),
        color: elements["grid.color"].value,
        alpha: Number(elements["grid.alpha"].value) || 0
      });
    }

    // Preview triggered for environment changes or the ambience manager
    const colorChanged = /color/i.test(changed);
    const environmentChanged = changed.includes("environment.");
    if ( force || colorChanged || environmentChanged ) canvas.environment.initialize(this.#getAmbienceFormData());
  }

  /* -------------------------------------------- */

  /**
   * Get the ambience form data.
   * @returns {object}
   */
  #getAmbienceFormData() {
    const formData = new FormDataExtended(this.form);
    const submitData = foundry.utils.expandObject(formData.object);
    return {
      backgroundColor: submitData.backgroundColor,
      fogExploredColor: submitData.fog.colors.explored,
      fogUnexploredColor: submitData.fog.colors.unexplored,
      environment: submitData.environment
    };
  }

  /* -------------------------------------------- */

  /**
   * Reset the previewed darkness level, background color, grid alpha, and grid color back to their true values.
   */
  #resetScenePreview() {
    if ( !this.document.isView || !canvas.ready ) return;
    canvas.scene.reset();
    canvas.environment.initialize();
    canvas.interface.grid.initializeMesh(canvas.scene.grid);
  }

  /* -------------------------------------------- */

  /** @override */
  async _processSubmitData(event, form, submitData, options) {
    // Determine the type of changes
    const scene = this.document;
    const current = scene._source;
    const hasDefaultDims = !current.background.src && (current.width === 4000) && (current.height === 3000);
    const hasImage = !!(submitData.background.src || current.background.src);
    const changedBackground = (submitData.background.src !== undefined)
      && (submitData.background.src !== current.background.src);
    const clearedDims = (submitData.width === null) || (submitData.height === null);
    const needsThumb = changedBackground || !current.thumb;
    const needsDims = submitData.background.src && (clearedDims || hasDefaultDims);
    const createThumbnail = hasImage && (needsThumb || needsDims);

    // Generate thumbnail and update dimensions if required
    if ( createThumbnail ) {
      if ( game.settings.get("core", "noCanvas") ) {
        ui.notifications.warn("SCENE.GenerateThumbNoCanvas", {localize: true});
        submitData.thumb = null;
      }
      else {
        try {
          const {thumb, width, height} = await scene.createThumbnail({
            img: submitData.background.src ?? current.background.src
          });
          if ( needsThumb ) submitData.thumb = thumb || null;
          if ( needsDims ) {
            submitData.width = width;
            submitData.height = height;
          }
        }
        catch(error) {
          if ( error.cause?.thumbUploadDenied ) {
            ui.notifications.warn("SCENES.GenerateThumbUploadDenied", {localize: true});
            delete submitData.thumb; // Reusing the current thumb image if any exist
          }
          else {
            Hooks.onError("SceneConfig#_processSubmitData", error, {
              msg: "Thumbnail generation for Scene failed",
              notify: "error",
              log: "error",
              scene: current._id
            });
          }
        }
      }
    }

    // Warn if scene dimensions are changing
    const delta = foundry.utils.diffObject(current, submitData);
    const changes = foundry.utils.flattenObject(delta);
    const textureChangeKeys = ["scaleX", "scaleY", "rotation"].map(k => `background.${k}`);
    if ( ["grid.size", ...textureChangeKeys].some(k => k in changes) ) {
      const confirm = await foundry.applications.api.DialogV2.confirm({
        window: {title: "SCENE.DimensionChangeTitle"},
        content: `<p>${game.i18n.localize("SCENE.DimensionChangeWarning")}</p>`
      });
      if ( !confirm ) return;
    }

    // Handle nonuniform canvas size changes
    let autoReposition = false;
    if ( (current.background.src || current.foreground)
      && ["width", "height", "padding", "grid.size"].some(x => x in changes)
    ) {
      autoReposition = true;
      const aspectRatioChanged = ("width" in changes) && ("height" in changes)
        && ((submitData.width / submitData.height) !== (current.width / current.height));

      if ( aspectRatioChanged || ["width", "height"].some(k => k in changes) ) {
        const confirm = await foundry.applications.api.DialogV2.confirm({
          window: {title: "SCENE.DistortedDimensionsTitle"},
          content: game.i18n.localize("SCENE.DistortedDimensionsWarning")
        });
        if ( !confirm ) autoReposition = false;
      }
    }

    // Remove unneeded fields and perform the update
    delete submitData.environment.darknessLock;
    await scene.update(submitData, {...options, autoReposition});
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onRender(context, options) {
    await super._onRender(context, options);
    this.#onChangeTab();
    if ( options.parts.includes("grid") ) {
      const {width, height} = this.document._source;
      this.#lastDimensionValues = {width, height};
    }
  }

  /* -------------------------------------------- */

  /**
   * Show or hide the environment reset button depending on which tab and subtab are in view.
   */
  #onChangeTab() {
    const resetButton = this.element.querySelector("button[data-action=resetEnvironment]");
    resetButton.hidden = (this.tabGroups.sheet !== "ambience") || (this.tabGroups.ambience !== "environment");
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onChangeForm(formConfig, event) {
    super._onChangeForm(formConfig, event);
    const formElements = this.form.elements;
    switch (event.target) {
      case formElements.journal:
        return this.#onChangeJournalEntry(event.target.value);
      case formElements.playlist:
        return this.#onChangePlaylist(event.target.value);
      case formElements.width:
      case formElements.height:
        this.#onChangeDimensions(event.target);
        break;
      case formElements["environment.base.intensity"]:
      case formElements["environment.dark.intensity"]: {
        const hueSlider = event.target.closest("fieldset").querySelector("hue-slider");
        hueSlider.disabled = event.target.value === 0;
        break;
      }
      case formElements["environment.darknessLock"]:
        this.#onChangeDarknessLock(event.target.checked);
    }
    this._previewScene(event.target.name);
  }

  /* -------------------------------------------- */

  /**
   * Handle updating the select menu of JournalEntryPage options when the JournlEntry is changed.
   * @param {string} entryId The id of the parent JournalEntry
   */
  #onChangeJournalEntry(entryId) {
    const entry = game.journal.get(entryId);
    const pages = entry?.pages.contents.sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang)) ?? [];
    const options = pages.map(page => {
      const option = document.createElement("option");
      option.value = page.id;
      option.innerText = page.name;
      return option.outerHTML;
    }).join("");
    const select = this.form.elements.journalEntryPage;
    select.innerHTML = `<option></option>${options}`;
    const currentId = this.document.journalEntryPage;
    if ( entry?.pages.has(currentId) ) select.value = currentId;
  }

  /* -------------------------------------------- */

  /**
   * Handle updating the select menu of PlaylistSound options when the Playlist is changed.
   * @param {string} playlistId The id of the parent Playlist
   */
  #onChangePlaylist(playlistId) {
    const playlist = game.playlists.get(playlistId);
    const sounds = playlist?.sounds.contents.sort((a, b) => a.sort - b.sort) ?? [];
    const options = sounds.map(sound => {
      const option = document.createElement("option");
      option.value = sound.id;
      option.innerText = sound.name;
      return option.outerHTML;
    }).join("");
    const select = this.form.elements.playlistSound;
    select.innerHTML = `<option></option>${options}`;
    const currentId = this.document.playlistSound?.id;
    if ( playlist?.sounds.has(currentId) ) select.value = currentId;
  }

  /* -------------------------------------------- */

  /**
   * Capture the current Scene position and zoom level as the initial view in the Scene config
   * @this {SceneConfig}
   * @type {ApplicationClickAction}
   */
  static #onCapturePosition(event) {
    if ( !canvas.ready ) return;
    const form = this.form;
    form.elements["initial.x"].value = parseInt(canvas.stage.pivot.x);
    form.elements["initial.y"].value = parseInt(canvas.stage.pivot.y);
    form.elements["initial.scale"].value = canvas.stage.scale.x;
    ui.notifications.info("SCENE.CaptureInitialViewPosition", {localize: true});
  }

  /* -------------------------------------------- */

  /**
   * Capture the current Scene position and zoom level as the initial view in the Scene config
   * @this {SceneConfig}
   * @type {ApplicationClickAction}
   */
  static #onOpenGridConfig() {
    new foundry.applications.apps.GridConfig({document: this.document}).render({force: true});
    return this.minimize();
  }

  /* -------------------------------------------- */

  /**
   * Link or unlink the scene dimensions
   * @this {SceneConfig}
   * @type {ApplicationClickAction}
   */
  static #onToggleLinkDimensions(_event, button) {
    this.#linkedDimensions = !this.#linkedDimensions;
    const icon = button.querySelector("i");
    icon.classList.toggle("fa-link-simple", this.#linkedDimensions);
    icon.classList.toggle("fa-link-simple-slash", !this.#linkedDimensions);

    // Update Tooltip
    button.dataset.tooltip = this.#linkedDimensions ? "SCENE.DimensionLinked" : "SCENE.DimensionUnlinked";
    button.ariaLabel = game.i18n.localize(button.dataset.tooltip);
    game.tooltip.activate(button);
  }

  /* -------------------------------------------- */

  /**
   * Handle updating dimensions given the dimension link is toggled on
   * @param {HTMLInputElement} input The width or height input
   */
  #onChangeDimensions(input) {
    if ( !this.#linkedDimensions ) return;
    const widthInput = this.form.elements.width;
    const heightInput = this.form.elements.height;
    const value = input.valueAsNumber;
    const oldValue = this.#lastDimensionValues[input.name];
    const scale = value / oldValue;
    const otherInput = input === widthInput ? heightInput : widthInput;
    const otherValue = otherInput.valueAsNumber * scale;

    // If the new values are not integers, display an error and revert
    if ( Number.isInteger(value) && Number.isInteger(otherValue) ) otherInput.value = otherValue;
    else {
      ui.notifications.error(game.i18n.localize("SCENE.InvalidDimension"));
      input.value = oldValue;
    }
    this.#lastDimensionValues = {
      width: widthInput.valueAsNumber,
      height: heightInput.valueAsNumber
    };
  }

  /* -------------------------------------------- */

  /**
   * Handle darkness lock change and update immediately the database.
   * @param {boolean} darknessLock Is the darkness lock checked?
   */
  async #onChangeDarknessLock(darknessLock) {
    const levelInput = this.form.elements["environment.darknessLevel"];
    levelInput.disabled = darknessLock;
    const darknessLevel = levelInput.value;
    await this.document.update({environment: {darknessLock, darknessLevel}}, {render: false});
  }

  /**
   * Capture the current Scene position and zoom level as the initial view in the Scene config
   * @this {SceneConfig}
   * @type {ApplicationClickAction}
   */
  static async #onResetEnvironment() {
    const document = this.document;
    const def = Scene.cleanData().environment;
    const ori = foundry.utils.deepClone(document._source.environment);
    const defaults = {base: def.base, dark: def.dark};
    const original = {base: ori.base, dark: ori.dark};

    // Reset the elements to the default values
    const elements = this.form.elements;
    for ( const target of ["base", "dark"] ) {
      elements[`environment.${target}.hue`].disabled = (defaults[target].intensity === 0);
      elements[`environment.${target}.intensity`].value = defaults[target].intensity;
      elements[`environment.${target}.luminosity`].value = defaults[target].luminosity;
      elements[`environment.${target}.saturation`].value = defaults[target].saturation;
      elements[`environment.${target}.shadows`].value = defaults[target].shadows;
      elements[`environment.${target}.hue`].value = defaults[target].hue;
    }

    // Update the document with the default environment values
    document.updateSource({environment: defaults});

    // Preview the scene and re-render the config
    this._previewScene("", {force: true});
    await this.render();

    // Restore original environment values
    document.updateSource({environment: original});
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onClose(options) {
    super._onClose(options);
    this.#resetScenePreview();
  }
}

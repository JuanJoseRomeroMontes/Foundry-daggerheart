import HandlebarsApplicationMixin from "../../api/handlebars-application.mjs";
import FormDataExtended from "../../ux/form-data-extended.mjs";
import {mergeObject} from "@common/utils/_module.mjs";

/**
 * @import ApplicationV2 from "../../api/application.mjs";
 * @import {DataSchema} from "@common/abstract/_types.mjs";
 * @import {PrototypeToken} from "@common/data/data.mjs";
 * @import TokenDocument from "@client/documents/token.mjs";
 * @import {NumberField} from "@common/data/fields.mjs";
 * @import {HTMLMultiCheckboxElement} from "../../elements/multi-select.mjs";
 * @import {ApplicationClickAction, ApplicationTab, FormFooterButton} from "../../_types.mjs";
 */

/**
 * A mixin for UI shared between TokenDocument and PrototypeToken sheets
 * @param {typeof ApplicationV2} Base
 */
export default function TokenApplicationMixin(Base) {
  class TokenApplication extends HandlebarsApplicationMixin(Base) {

    /** @inheritDoc */
    static DEFAULT_OPTIONS = {
      classes: ["token-config"],
      window: {
        contentClasses: ["standard-form"],
        icon: "fa-solid fa-circle-user"
      },
      position: {width: 560},
      form: {closeOnSubmit: true},
      actions: {
        addDetectionMode: TokenApplication.#onAddDetectionMode,
        removeDetectionMode: TokenApplication.#onRemoveDetectionMode
      }
    };

    /** @override */
    static PARTS = {
      tabs: {template: "templates/generic/tab-navigation.hbs"},
      identity: {template: "templates/scene/token/identity.hbs", scrollable: [""]},
      appearance: {template: "templates/scene/token/appearance.hbs", scrollable: [""]},
      vision: {template: "templates/scene/token/vision.hbs", scrollable: [""]},
      light: {template: "templates/scene/token/light.hbs", scrollable: [""]},
      resources: {template: "templates/scene/token/resources.hbs", scrollable: [""]},
      footer: {template: "templates/generic/form-footer.hbs"}
    };

    /** @override */
    static TABS = {
      sheet: {
        tabs: [
          {id: "identity", icon: "fa-solid fa-memo-pad"},
          {id: "appearance", icon: "fa-solid fa-square-user"},
          {id: "vision", icon: "fa-solid fa-eye"},
          {id: "light", icon: "fa-solid fa-lightbulb"},
          {id: "resources", icon: "fa-solid fa-heart"}
        ],
        initial: "identity",
        labelPrefix: "TOKEN.TABS"
      }
    };

    /**
     * Localized Token Display Modes
     * @returns {Record<string, string>}
     */
    static get DISPLAY_MODES() {
      TokenApplication.#DISPLAY_MODES ??= Object.entries(CONST.TOKEN_DISPLAY_MODES).reduce((modes, [key, value]) => {
        modes[value] = game.i18n.localize(`TOKEN.DISPLAY_${key}`);
        return modes;
      }, {});
      return TokenApplication.#DISPLAY_MODES;
    }

    static #DISPLAY_MODES;

    /**
     * Localized Token Dispositions
     * @returns {Record<string, string>}
     */
    static get TOKEN_DISPOSITIONS() {
      TokenApplication.#TOKEN_DISPOSITIONS ??= Object.entries(CONST.TOKEN_DISPOSITIONS)
        .reduce((dispositions, [key, value]) => {
          dispositions[value] = game.i18n.localize(`TOKEN.DISPOSITION.${key}`);
          return dispositions;
        }, {});
      return TokenApplication.#TOKEN_DISPOSITIONS;
    }

    static #TOKEN_DISPOSITIONS;

    /**
     * Localized Token Turn Marker modes
     * @returns {Record<string, string>}
     */
    static get TURN_MARKER_MODES() {
      TokenApplication.#TURN_MARKER_MODES ??= Object.entries(CONST.TOKEN_TURN_MARKER_MODES)
        .reduce((modes, [key, value]) => {
          modes[value] = game.i18n.localize(`TOKEN.TURNMARKER.MODES.${key}`);
          return modes;
        }, {});
      return TokenApplication.#TURN_MARKER_MODES;
    }

    static #TURN_MARKER_MODES;

    /**
     * Localized Token Shapes
     * @returns {Record<string, string>}
     */
    static get TOKEN_SHAPES() {
      TokenApplication.#TOKEN_SHAPES ??= Object.entries(CONST.TOKEN_SHAPES)
        .reduce((shapes, [key, value]) => {
          shapes[value] = game.i18n.localize(`TOKEN.SHAPES.${key}.label`);
          return shapes;
        }, {});
      return TokenApplication.#TOKEN_SHAPES;
    }

    static #TOKEN_SHAPES;

    /* -------------------------------------------- */

    /**
     * Maintain a copy of the original to show a real-time preview of changes.
     * @type {TokenDocument|PrototypeToken|null}
     * @protected
     */
    _preview = null;

    /**
     * Is the token a PrototypeToken?
     * @type {boolean}
     * @abstract
     */
    isPrototype;

    /**
     * A reference to the Actor the token depicts
     * @returns {Actor|null}
     * @abstract
     */
    get actor() {
      throw new Error("The Base class must implement this getter.");
    }

    /**
     * The TokenDocument or PrototypeToken
     * @returns {TokenDocument|PrototypeToken}
     * @abstract
     */
    get token() {
      throw new Error("The Base class must implement this getter.");
    }

    /**
     * The schema fields for this token DataModel
     * @returns {DataSchema}
     * @protected
     * @abstract
     */
    get _fields() {
      throw new Error("The Base class must implement this getter.");
    }

    /* -------------------------------------------- */

    /**
     * Get an Object of image paths and filenames to display in the Token sheet
     * @returns {Promise<Record<string, string>>}
     */
    async #getAlternateTokenImages() {
      if ( !this.actor?.prototypeToken.randomImg ) return {};
      const alternates = await this.actor.getTokenImages();
      return alternates.reduce((obj, img) => {
        obj[img] = img.split("/").pop();
        return obj;
      }, {});
    }

    /* -------------------------------------------- */

    /**
     * Assign a preview clone for propagating form changes across the sheet and (if editing a TokenDocument) the canvas.
     * @returns {Promise<void>}
     * @protected
     * @abstract
     */
    async _initializeTokenPreview() {
      throw new Error("The Base class must implement this method.");
    }

    /* -------------------------------------------- */

    /**
     * Render the Token ring effects input using a multi-checkbox element.
     * @param {NumberField} field                   The ring effects field
     * @param {FormInputConfig<string[]>} inputConfig Form input configuration
     * @returns {HTMLMultiCheckboxElement}
     */
    #ringEffectsInput(field, inputConfig) {
      const options = [];
      const value = [];
      for ( const [effectName, effectValue] of Object.entries(CONFIG.Token.ring.ringClass.effects) ) {
        const localization = CONFIG.Token.ring.effects[effectName];
        if ( (effectName === "DISABLED") || (effectName === "ENABLED") || !localization ) continue;
        options.push({value: effectName, label: game.i18n.localize(localization)});
        if ( (inputConfig.value & effectValue) !== 0 ) value.push(effectName);
      }
      Object.assign(inputConfig, {name: field.fieldPath, options, value, type: "checkboxes"});
      return foundry.applications.fields.createMultiSelectInput(inputConfig);
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    async _preFirstRender(context, options) {
      await super._preFirstRender(context, options);
      await this._initializeTokenPreview();
    }

    /* -------------------------------------------- */

    /**
     * Mimic changes to the Token document as if they were true document updates.
     * @param {object} [changes]  The changes to preview.
     * @returns {void}
     * @protected
     */
    _previewChanges(changes) {
      if ( !changes || !this._preview ) return;
      const deletions = {"-=actorId": null, "-=actorLink": null};
      const mergeOptions = {inplace: false, performDeletions: true};
      this._preview.updateSource(mergeObject(changes, deletions, mergeOptions));
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    async _prepareContext(options) {
      const context = await super._prepareContext(options);
      if ( options.resetPreview ) this._initializeTokenPreview();
      return Object.assign(context, {
        rootId: this.id,
        source: this.token._source,
        fields: this._fields,
        gridUnits: game.i18n.localize("GridUnits"),
        isPrototype: this.isPrototype,
        displayModes: TokenApplication.DISPLAY_MODES,
        buttons: this._prepareButtons()
      });
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    async _preparePartContext(partId, context, options) {
      context = await super._preparePartContext(partId, context, options);
      switch ( partId ) {
        case "footer":
          context.buttons = this._prepareButtons();
          break;
        default: {
          const tab = context.tabs[partId];
          if ( tab ) {
            context.tab = tab;
            const tabContext = await this[`_prepare${partId.titleCase()}Tab`]?.();
            Object.assign(context, tabContext ?? {});
          }
        }
      }
      return context;
    }

    /* -------------------------------------------- */

    /**
     * Prepare data to be displayed in the Identity tab.
     * @protected
     */
    _prepareIdentityTab() {
      const currentAction = this.token.movementAction;
      return {
        isGM: game.user.isGM,
        actors: game.actors
          .filter(a => a.isOwner)
          .map(a => ({value: a.id, label: a.name}))
          .sort((a, b) => a.label.localeCompare(b.label, game.i18n.lang)),
        movementActions: Object.entries(CONFIG.Token.movement.actions).reduce(
          (choices, [action, {label, canSelect}]) => {
            if ( canSelect(this.token) || (action === currentAction) ) choices[action] = label;
            return choices;
          }, {}),
        dispositions: TokenApplication.TOKEN_DISPOSITIONS
      };
    }

    /* -------------------------------------------- */

    /**
     * Prepare data to be displayed in the Appearance tab.
     * @returns {Promise<object>}
     * @protected
     */
    async _prepareAppearanceTab() {
      const token = this.token;
      const source = token._source;
      const alternateImages = await this.#getAlternateTokenImages();
      const canBrowseFiles = game.user.hasPermission("FILES_BROWSE");
      return {
        shapes: this.isPrototype ? undefined : TokenApplication.TOKEN_SHAPES,
        hasAlternates: !foundry.utils.isEmpty(alternateImages),
        alternateImages,
        colorationTechniques: foundry.canvas.rendering.shaders.AdaptiveLightingShader.SHADER_TECHNIQUES,
        randomImgEnabled: this.isPrototype && (canBrowseFiles || source.randomImg),
        scale: Math.abs(source.texture.scaleX),
        mirrorX: source.texture.scaleX < 0,
        mirrorY: source.texture.scaleY < 0,
        textureFitModes: CONST.TEXTURE_DATA_FIT_MODES.reduce((obj, fit) => {
          obj[fit] = game.i18n.localize(`TEXTURE_DATA.FIT.${fit}`);
          return obj;
        }, {}),
        ringEffectsInput: this.#ringEffectsInput.bind(this)
      };
    }

    /* -------------------------------------------- */

    /**
     * Prepare data to be displayed in the Vision tab.
     * @returns {Promise<object>}
     * @protected
     */
    async _prepareVisionTab() {
      const token = this.token;
      const sourceDetectionModes = new Set(token._source.detectionModes.map(m => m.id));
      const visionModes = Object.values(CONFIG.Canvas.visionModes)
        .filter(f => f.tokenConfig)
        .reduce((modes, mode) => {
          modes[mode.id] = mode.label;
          return modes;
        }, {});
      const compareDetectionModes = (mode1, mode2) => {
        if ( mode1.id === "" ) return mode2.id === "" ? 0 : 1;
        if ( mode2.id === "" ) return -1;
        let label1 = CONFIG.Canvas.detectionModes[mode1.id]?.label;
        if ( label1 ) label1 = game.i18n.localize(label1);
        else label1 = mode1.id;
        let label2 = CONFIG.Canvas.detectionModes[mode2.id]?.label;
        if ( label2 ) label2 = game.i18n.localize(label2);
        else label2 = mode2.id;
        return label1.localeCompare(label2, game.i18n.lang);
      };
      return {
        sightFields: this._fields.sight.fields,
        visionModes,
        detectionModes: Object.values(CONFIG.Canvas.detectionModes).filter(f => f.tokenConfig),
        sourceDetectionModes: token._source.detectionModes.toSorted(compareDetectionModes),
        preparedDetectionModes: token.detectionModes.filter(m => !sourceDetectionModes.has(m.id)
          && ((m.range ?? Infinity) > 0) && m.enabled).map(({id, range, enabled}) => ({id, range:
          range === Infinity ? null : range, enabled})).sort(compareDetectionModes)
      };
    }

    /* -------------------------------------------- */

    /**
     * Prepare data to be displayed in the Vision tab.
     * @returns {Promise<object>}
     * @protected
     */
    async _prepareLightTab() {
      const doc = this._preview ?? this.document;
      return {
        lightFields: this._fields.light.fields,
        lightAnimations: doc.light.negative ? CONFIG.Canvas.darknessAnimations : CONFIG.Canvas.lightAnimations
      };
    }

    /* -------------------------------------------- */

    /**
     * Prepare data to be displayed in the Resources tab.
     * @returns {Promise<object>}
     * @protected
     */
    async _prepareResourcesTab() {
      const token = this.token;
      const usesTrackableAttributes = !foundry.utils.isEmpty(CONFIG.Actor.trackableAttributes);
      const attributeSource = (this.actor?.system instanceof foundry.abstract.DataModel) && usesTrackableAttributes
        ? this.actor?.type
        : this.actor?.system;
      const TokenDocument = foundry.utils.getDocumentClass("Token");
      const attributes = TokenDocument.getTrackedAttributes(attributeSource);
      return {
        barAttributes: TokenDocument.getTrackedAttributeChoices(attributes),
        bar1: token.getBarAttribute?.("bar1"),
        bar2: token.getBarAttribute?.("bar2"),
        turnMarkerModes: TokenApplication.TURN_MARKER_MODES,
        turnMarkerAnimations: CONFIG.Combat.settings.turnMarkerAnimations
      };
    }

    /* -------------------------------------------- */

    /**
     * Prepare form submission buttons.
     * @returns {FormFooterButton[]}
     * @protected
     */
    _prepareButtons() {
      return [{type: "submit", icon: "fa-solid fa-floppy-disk", label: "TOKEN.Update"}];
    }

    /* -------------------------------------------- */
    /*  Event Listeners and Handlers                */
    /* -------------------------------------------- */

    /** @inheritDoc */
    _onChangeForm(formConfig, event) {
      super._onChangeForm(formConfig, event);

      // Pre-populate vision mode defaults
      if ( event.target.name === "sight.visionMode" ) {
        const defaults = CONFIG.Canvas.visionModes[event.target.value]?.vision?.defaults || {};
        for ( const fieldName of ["color", "attenuation", "brightness", "saturation", "contrast"] ) {
          const value = defaults[fieldName];
          if ( value === undefined ) continue;
          const field = this.form.querySelector(`[name="sight.${fieldName}"]`);
          if ( !field ) continue;
          if ( field.type === "checkbox" ) field.checked = value;
          else field.value = value;
        }
      }
    }

    /* -------------------------------------------- */

    /**
     * Add a new detection mode to the Token preview.
     * @this {TokenApplication}
     * @type {ApplicationClickAction}
     */
    static async #onAddDetectionMode() {
      const formData = new FormDataExtended(this.form);
      const modes = Object.values(this._processFormData(event, this.form, formData).detectionModes ?? {});
      modes.push({id: "", range: 0, enabled: true});
      this._previewChanges({detectionModes: modes});
      await this.render({parts: ["vision"], resetPreview: false});
    }

    /* -------------------------------------------- */

    /**
     * Remove a detection mode from the Token preview.
     * @this {TokenApplication}
     * @type {ApplicationClickAction}
     */
    static async #onRemoveDetectionMode(_event, target) {
      const formData = new FormDataExtended(this.form);
      const modes = Object.values(this._processFormData(event, this.form, formData).detectionModes ?? {});
      const index = Number(target.closest("[data-index]")?.dataset.index);
      modes.splice(index, 1);
      this._previewChanges({detectionModes: modes});
      await this.render({parts: ["vision"], resetPreview: false});
    }

    /* -------------------------------------------- */
    /*  Form Submission                             */
    /* -------------------------------------------- */

    /**
     * Process several fields from form submission data into proper model changes.
     * @param {object} submitData Form submission data passed through {@link foundry.applications.ux.FormDataExtended}
     * @protected
     */
    _processChanges(submitData) {
      // Convert scale and mirror data from the form submission to TextureData changes
      if ( typeof submitData.scale === "number" ) {
        submitData.texture.scaleX = submitData.scale * (submitData.mirrorX ? -1 : 1);
        submitData.texture.scaleY = submitData.scale * (submitData.mirrorY ? -1 : 1);
      }
      for ( const key of ["scale", "mirrorX", "mirrorY"] ) delete submitData[key];

      // Process token ring effects from the form submission
      if ( Array.isArray(submitData.ring?.effects) ) {
        const TRE = CONFIG.Token.ring.ringClass.effects;
        let effects = submitData.ring.enabled ? TRE.ENABLED : TRE.DISABLED;
        for ( const effectName of submitData.ring.effects ) {
          const v = TRE[effectName] ?? 0;
          effects |= v;
        }
        submitData.ring.effects = effects;
      }
    }
  }
  return TokenApplication;
}

import DocumentSheetV2 from "../api/document-sheet.mjs";
import HandlebarsApplicationMixin from "../api/handlebars-application.mjs";
import FormDataExtended from "../ux/form-data-extended.mjs";
import AdaptiveLightingShader from "../../canvas/rendering/shaders/lighting/base-lighting.mjs";
import AmbientLightDocument from "@client/documents/ambient-light.mjs";

/**
 * The AmbientLight configuration application.
 * @extends DocumentSheetV2
 * @mixes HandlebarsApplication
 */
export default class AmbientLightConfig extends HandlebarsApplicationMixin(DocumentSheetV2) {

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    classes: ["ambient-light-config"],
    window: {
      contentClasses: ["standard-form"]
    },
    position: {width: 560},
    form: {
      closeOnSubmit: true
    },
    actions: {
      reset: this.#onReset
    }
  };

  /** @override */
  static PARTS = {
    tabs: {
      template: "templates/generic/tab-navigation.hbs"
    },
    basic: {
      template: "templates/scene/parts/light-basic.hbs"
    },
    animation: {
      template: "templates/scene/parts/light-animation.hbs"
    },
    advanced: {
      template: "templates/scene/parts/light-advanced.hbs"
    },
    footer: {
      template: "templates/generic/form-footer.hbs"
    }
  };

  /** @override */
  static TABS = {
    sheet: {
      tabs: [
        {id: "basic", icon: "fa-solid fa-lightbulb"},
        {id: "animation", icon: "fa-solid fa-play"},
        {id: "advanced", icon: "fa-solid fa-gears"}
      ],
      initial: "basic",
      labelPrefix: "AMBIENT_LIGHT.TABS"
    }
  };

  /* -------------------------------------------- */

  /**
   * Maintain a copy of the original to show a real-time preview of changes.
   * @type {AmbientLightDocument}
   */
  preview;

  /* -------------------------------------------- */
  /*  Application Rendering                       */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async _preRender(context, options) {
    await super._preRender(context, options);
    if ( this.preview?.rendered ) {
      await this.preview.object.draw();
      this.document.object.initializeLightSource({deleted: true});
      this.preview.object.layer._configPreview.addChild(this.preview.object);
      this._previewChanges();
    }
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onRender(context, options) {
    await super._onRender(context, options);
    this.#toggleReset();
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onClose(options) {
    super._onClose(options);
    if ( this.preview ) this._resetPreview();
    if ( this.document.rendered ) this.document.object.initializeLightSource();
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    // Create the preview on first render
    if ( options.isFirstRender && context.document.object ) {
      const clone = context.document.object.clone();
      this.preview = clone.document;
    }

    // Prepare context
    const document = this.preview ?? context.document;
    const isDarkness = document.config.negative;
    return Object.assign(context, {
      document,
      light: document,
      source: document._source,
      colorationTechniques: AdaptiveLightingShader.SHADER_TECHNIQUES,
      gridUnits: document.parent.grid.units || game.i18n.localize("GridUnits"),
      isDarkness,
      lightAnimations: isDarkness ? CONFIG.Canvas.darknessAnimations : CONFIG.Canvas.lightAnimations,
      buttons: [
        {
          type: "reset",
          action: "reset",
          icon: "fa-solid fa-arrow-rotate-left",
          label: "AMBIENT_LIGHT.ACTIONS.RESET"
        },
        {
          type: "submit",
          icon: "fa-solid fa-floppy-disk",
          label: `AMBIENT_LIGHT.ACTIONS.${document.collection?.has(document.id) ? "UPDATE" : "CREATE"}`
        }
      ]
    });
  }

  /* -------------------------------------------- */

  /**
   * Toggle visibility of the reset button which is only visible on the advanced tab.
   */
  #toggleReset() {
    const reset = this.element.querySelector("button[data-action=reset]");
    reset.classList.toggle("hidden", this.tabGroups.sheet !== "advanced");
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  changeTab(...args) {
    super.changeTab(...args);
    this.#toggleReset();
  }

  /* -------------------------------------------- */
  /*  Real-Time Preview                           */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _onChangeForm(formConfig, event) {
    super._onChangeForm(formConfig, event);
    const formData = new FormDataExtended(this.element);
    this._previewChanges(formData.object);

    // Special handling for darkness state change
    if ( event.target.name === "config.negative") this.render({parts: ["animation", "advanced"]});
  }

  /* -------------------------------------------- */

  /**
   * Preview changes to the AmbientLight document as if they were true document updates.
   * @param {object} [change]  A change to preview.
   * @protected
   */
  _previewChanges(change) {
    if ( !this.preview ) return;
    if ( change ) this.preview.updateSource(change);
    if ( this.preview?.rendered ) {
      this.preview.object.renderFlags.set({refresh: true});
      this.preview.object.initializeLightSource();
    }
  }

  /* -------------------------------------------- */

  /**
   * Restore the true data for the AmbientLight document when the form is submitted or closed.
   * @protected
   */
  _resetPreview() {
    if ( !this.preview ) return;
    if ( this.preview.rendered ) {
      this.preview.object.destroy({children: true});
    }
    this.preview = null;
    if ( this.document.rendered ) {
      const object = this.document.object;
      object.renderable = true;
      object.initializeLightSource();
      object.renderFlags.set({refresh: true});
    }
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /**
   * Process reset button click
   * @param {PointerEvent} event                  The originating button click
   * @this {AmbientLightConfig}
   * @returns {Promise<void>}
   */
  static async #onReset(event) {
    event.preventDefault();
    const defaults = AmbientLightDocument.cleanData();
    const keys = ["vision", "config"];
    const configKeys = ["coloration", "contrast", "attenuation", "luminosity", "saturation", "shadows"];
    for ( const k in defaults ) {
      if ( !keys.includes(k) ) delete defaults[k];
    }
    for ( const k in defaults.config ) {
      if ( !configKeys.includes(k) ) delete defaults.config[k];
    }
    this._previewChanges(defaults);
    await this.render();
  }
}

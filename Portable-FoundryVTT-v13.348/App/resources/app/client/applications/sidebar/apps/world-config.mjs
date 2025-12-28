import ApplicationV2 from "../../api/application.mjs";
import HandlebarsApplicationMixin from "../../api/handlebars-application.mjs";

/**
 * @import {ApplicationConfiguration, ApplicationFormSubmission} from "../../_types.mjs";
 */

/**
 * @typedef WorldConfigOptions
 * @property {World} world The World being managed
 */

/**
 * The World Management setup application
 */
export default class WorldConfig extends HandlebarsApplicationMixin(ApplicationV2) {

  /**
   * @param {Partial<ApplicationConfiguration> & WorldConfigOptions} options Application configuration options
   */
  constructor(options) {
    super(options);
    this.world = options.world;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    tag: "form",
    id: "world-config",
    window: {
      icon: "fa-solid fa-globe",
      contentClasses: ["standard-form"]
    },
    position: {
      width: 600
    },
    form: {
      handler: WorldConfig.#onSubmit,
      closeOnSubmit: true
    }
  };

  /** @override */
  static PARTS = {
    config: {
      template: "templates/sidebar/apps/world-config.hbs",
      scrollable: [""]
    },
    footer: {template: "templates/generic/form-footer.hbs"}
  };

  /**
   * The website knowledge base URL.
   * @type {string}
   */
  static #WORLD_KB_URL = "https://foundryvtt.com/article/game-worlds/";

  /* -------------------------------------------- */


  /**
   * The World being configured.
   * @type {World}
   */
  world;

  /** @override */
  get title() {
    return this.isCreate
      ? game.i18n.localize("WORLD.Title.Create")
      : game.i18n.format("WORLD.Title.Update", {world: this.world.title});
  }

  /**
   * Is this World to be created?
   * @type {boolean}
   */
  get isCreate() {
    return (game.view === "setup") && !game.worlds.has(this.world.id);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onChangeForm(formConfig, event) {
    super._onChangeForm(formConfig, event);
    if ( event.target.name === "title" ) {
      const slug = event.target.value.slugify({strict: true}) || "world-name";
      this.form.elements.id.placeholder = slug;
    }
  }

  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options={}) {
    const ac = CONST.PACKAGE_AVAILABILITY_CODES;
    const {world, isCreate} = this;
    const themes = Object.entries(CONST.WORLD_JOIN_THEMES).reduce((themes, [key, label]) => {
      themes[key] = game.i18n.localize(label);
      return themes;
    }, {});
    const context = {
      source: world._source,
      fields: world.schema.fields,
      rootId: this.id,
      isCreate, themes,
      worldId: isCreate ? "" : world._source.id,
      worldTitle: isCreate ? "" : world._source.title,
      worldKbUrl: WorldConfig.#WORLD_KB_URL,
      nextSession: this.#formatNextSession(),
      inWorld: !!game.world,
      buttons: [{
        type: "submit",
        icon: "fa-solid fa-floppy-disk",
        label: isCreate ? "WORLD.Title.Create" : "WORLD.SubmitUpdate"
      }]
    };
    context.showEditFields = !context.isCreate && !context.inWorld;
    if ( game.systems ) {
      context.systems = game.systems
        .filter(system => {
          if ( world.system === system.id ) return true;
          return ( system.availability <= ac.UNVERIFIED_GENERATION );
        })
        .sort((a, b) => a.title.localeCompare(b.title, game.i18n.lang))
        .reduce((systems, system) => {
          systems[system.id] = system.title;
          return systems;
        }, {});
    }
    else {
      context.systems = {[game.system.id]: game.system.title};
    }
    return context;
  }

  /* -------------------------------------------- */

  /**
   * Format the nextSession isoString to a datetime-local input string
   * @returns {string}
   */
  #formatNextSession() {
    const dt = new Date(this.world._source.nextSession ?? "");
    return dt.isValid() ? dt.toLocaleString("sv-SE") : ""; // Same as ISO 8601 (RFC 3339 profile) sans time zone
  }

  /* -------------------------------------------- */
  /*  Form Submission                             */
  /* -------------------------------------------- */

  /**
   * Handle form submission.
   * @this {WorldConfig}
   * @type {ApplicationFormSubmission}
   */
  static async #onSubmit(event, form, formData) {
    const submitData = foundry.utils.expandObject(formData.object);

    // Augment submission actions
    if ( this.isCreate ) {
      if ( !submitData.id.length ) submitData.id = submitData.title.slugify({strict: true});
    }
    else {
      submitData.id = this.world.id;
      if ( !submitData.resetKeys ) delete submitData.resetKeys;
      if ( !submitData.safeMode ) delete submitData.safeMode;
    }

    // Handle next session schedule fields
    const date = new Date(submitData.nextSession);
    submitData.nextSession = date.isValid() ? date.toISOString() : null;

    if ( submitData.joinTheme === CONST.WORLD_JOIN_THEMES.default ) delete submitData.joinTheme;
    const action = this.isCreate ? "createWorld" : "editWorld";
    return this.#processSubmitData(submitData, action);
  }

  /* -------------------------------------------- */

  /**
   * Create or update the World.
   * @param {object} submitData
   * @param {"createWorld"|"editWorld"} action
   */
  async #processSubmitData(submitData, action) {
    this.form.disable = true;

    // Validate the submission data
    try {
      this.world.validate({changes: submitData, clean: true});
    } catch(error) {
      ui.notifications.error(error.message.replace("\n", ". "));
      this.form.disabled = false;
      throw error;
    }

    // Dispatch the POST request
    let response;
    try {
      submitData.action = action;
      response = await foundry.utils.fetchJsonWithTimeout(foundry.utils.getRoute("setup"), {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(submitData)
      });
      this.form.disabled = false;

      // Display error messages
      if (response.error) return ui.notifications.error(response.error);
    }
    catch(e) {
      return ui.notifications.error(e);
    }

    // Handle successful creation
    if ( action === "createWorld" ) {
      const world = new this.world.constructor(response);
      game.worlds.set(world.id, world);
      this.world = world;
    }
    else this.world.updateSource(response);
    if ( game.view === "setup" ) ui.setupPackages.render();
  }
}

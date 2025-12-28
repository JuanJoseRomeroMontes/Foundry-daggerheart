import HandlebarsApplicationMixin from "../api/handlebars-application.mjs";
import ApplicationV2 from "../api/application.mjs";
import FormDataExtended from "../ux/form-data-extended.mjs";
import {BooleanField} from "@common/data/fields.mjs";

/**
 * @import {ApplicationConfiguration} from "../_types.mjs";
 * @import {HandlebarsRenderOptions} from "../api/handlebars-application.mjs";
 */

/**
 * @typedef _DependencyResolutionAppConfiguration
 * @param {ModuleManagement} manager  The module management application.
 * @param {Module} root               The module that is the root of the dependency resolution.
 * @param {boolean} enabling          Whether the root dependency is being enabled or disabled.
 */

/**
 * @typedef {ApplicationConfiguration & _DependencyResolutionAppConfiguration} DependencyResolutionAppConfiguration
 */

/**
 * @typedef DependencyResolutionDescriptor
 * @property {Module} module       The module.
 * @property {boolean} checked     Has the user toggled the checked state of this dependency in this application.
 * @property {string} [reason]     Some reason associated with the dependency.
 * @property {boolean} [required]  Whether this module is a hard requirement and cannot be unchecked.
 */

/**
 * A class responsible for prompting the user about dependency resolution for their modules.
 * @extends {ApplicationV2<DependencyResolutionAppConfiguration, HandlebarsRenderOptions>}
 * @mixes HandlebarsApplication
 */
export default class DependencyResolution extends HandlebarsApplicationMixin(ApplicationV2) {
  /**
   * @param {DeepPartial<DependencyResolutionAppConfiguration>} [options={}]  Options to configure DependencyResolution
   *                                                                          behavior.
   */
  constructor(options={}) {
    super(options);
    this.#manager = options.manager;
    this.#root = options.root;

    // Always include the root module.
    this.#modules.set(options.root.id, options.root);

    // Determine initial state.
    if ( options.enabling ) this.#initializeEnabling();
    else this.#initializeDisabling();
  }

  /** @override */
  static DEFAULT_OPTIONS = {
    tag: "dialog",
    classes: ["dependency-resolution", "dialog"],
    window: {
      contentTag: "form",
      contentClasses: ["standard-form"],
      icon: "fa-solid fa-sitemap",
      title: "MODMANAGE.DependencyResolution"
    },
    position: {
      width: 480
    },
    actions: {
      cancel: DependencyResolution.#onCancel
    },
    form: {
      closeOnSubmit: true,
      handler: DependencyResolution.#onSubmitForm
    },
    enabling: true
  };

  /** @override */
  static PARTS = {
    resolution: {
      classes: ["standard-form"],
      template: "templates/setup/impacted-dependencies.hbs"
    },
    footer: {
      template: "templates/generic/form-footer.hbs"
    }
  };

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * The full set of modules considered for dependency resolution, stemming from the root module.
   * @type {Set<Module>}
   */
  #candidates = new Set();

  /**
   * The set of all modules dependent on a given module.
   * @type {Map<Module, Set<Module>>}
   */
  #dependents = new Map();

  /**
   * The module management application.
   * @type {ModuleManagement}
   */
  #manager;

  /**
   * A subset of the game's modules that are currently active in the module manager.
   * @type {Map<string, Module>}
   */
  #modules = new Map();

  /**
   * Whether there are additional dependencies that need resolving by the user.
   * @type {boolean}
   */
  get needsResolving() {
    if ( this.options.enabling ) return this.#candidates.size > 0;
    return (this.#candidates.size > 1) || !!this.#getUnavailableSubtypes();
  }

  /**
   * Track the changes being made by the user as part of dependency resolution.
   * @type {Map<Module, DependencyResolutionDescriptor>}
   */
  #resolution = new Map();

  /**
   * The module that is the root of the dependency resolution.
   * @type {Module}
   */
  get root() {
    return this.#root;
  }

  #root;

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @override */
  async _onFirstRender(_context, _options) {
    this.element.showModal();
  }

  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const required = [];
    const optional = [];
    let subtypes;

    if ( this.options.enabling ) this.#getDependencyContext(required, optional);
    else {
      this.#getUnusedContext(optional);
      subtypes = this.#getUnavailableSubtypes();
    }

    return Object.assign(context, {
      required, optional, subtypes,
      checkbox: new BooleanField(),
      enabling: this.options.enabling,
      buttons: [
        { type: "submit", icon: "fa-solid fa-check", label: this.options.enabling ? "Activate" : "Deactivate" },
        { type: "button", icon: "fa-solid fa-xmark", label: "Cancel", action: "cancel" }
      ]
    });
  }

  /* -------------------------------------------- */

  /**
   * After the user has adjusted their choices, re-calculate the dependency graph.
   * Display all modules which are still in the set of reachable dependencies, preserving their checked states. If a
   * module is no longer reachable in the dependency graph (because there are no more checked modules that list it as a
   * dependency), do not display it to the user.
   * @param {DependencyResolutionDescriptor[]} [required]  Required dependencies.
   * @param {DependencyResolutionDescriptor[]} [optional]  Optional dependencies.
   */
  #getDependencyContext(required=[], optional=[]) {
    const skip = this.#resolution.values().reduce((acc, { checked, module }) => {
      if ( checked === false ) acc.add(module);
      return acc;
    }, new Set());

    const dependencies = this.#getDependencies(skip);
    for ( const module of this.#candidates ) {
      if ( !dependencies.has(module) ) continue;
      const info = this.#resolution.get(module);
      if ( info.required ) required.push(info);
      else optional.push(info);
    }
  }

  /* -------------------------------------------- */

  /**
   * The list of modules that the user currently has selected, including the root module.
   * @returns {Set<Module>}
   */
  #getSelectedModules() {
    const selected = new Set([this.root]);
    for ( const module of this.#candidates ) {
      const { checked } = this.#resolution.get(module);
      if ( checked ) selected.add(module);
    }
    return selected;
  }

  /* -------------------------------------------- */

  /**
   * After the user has adjusted their choices, re-calculate which modules are still unused.
   * Display all modules which are still unused, preserving their checked states. If a module is no longer unused
   * (because a module that uses it was recently unchecked), do not display it to the user.
   * @param {DependencyResolutionDescriptor[]} [optional]  Dependencies that are no longer required.
   */
  #getUnusedContext(optional=[]) {
    // Re-calculate unused modules after we remove those the user unchecked.
    const unused = this.#getUnused(this.#getSelectedModules());
    for ( const module of this.#candidates ) {
      if ( unused.has(module) ) optional.push(this.#resolution.get(module));
    }
  }

  /* -------------------------------------------- */

  /**
   * Get a formatted string of the Documents that would be rendered unavailable if the currently-selected modules were
   * to be disabled.
   * @returns {string}
   */
  #getUnavailableSubtypes() {
    const allCounts = {};
    for ( const module of this.#getSelectedModules() ) {
      const counts = game.issues.getSubTypeCountsFor(module);
      if ( !counts ) continue;
      Object.entries(counts).forEach(([documentName, subtypes]) => {
        const documentCounts = allCounts[documentName] ??= {};
        Object.entries(subtypes).forEach(([subtype, count]) => {
          documentCounts[`${module.id}.${subtype}`] = count;
        });
      });
    }
    return this.#manager._formatDocumentSummary(allCounts, true);
  }

  /* -------------------------------------------- */
  /*  Event Listeners & Handlers                  */
  /* -------------------------------------------- */

  /**
   * Handle canceling dependency resolution.
   * @this {DependencyResolution}
   */
  static #onCancel() {
    return this.close();
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onChangeForm(formConfig, event) {
    super._onChangeForm(formConfig, event);
    const { target } = event;
    const module = this.#modules.get(target.name);
    const checked = target.checked;
    const resolution = this.#resolution.get(module);
    resolution.checked = checked;
    this.render({ parts: ["resolution"] });
  }

  /* -------------------------------------------- */

  /**
   * Commit the dependency resolution result.
   * @this {DependencyResolution}
   * @param {SubmitEvent} event          The submission event.
   * @param {HTMLFormElement} form       The form that was submitted.
   */
  static #onSubmitForm(event, form) {
    const fd = new FormDataExtended(form, { disabled: true }).object;
    fd[this.root.id] = true;
    this.#manager._onSelectDependencies(fd, this.options.enabling);
  }

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /**
   * Return any modules that the root module is required by.
   * @returns {Set<Module>}
   * @internal
   */
  _getRootRequiredBy() {
    const requiredBy = new Set();
    if ( this.options.enabling ) return requiredBy;
    const dependents = this.#dependents.get(this.root);
    for ( const dependent of (dependents ?? []) ) {
      if ( dependent.relationships.requires.find(({ id }) => id === this.root.id) ) requiredBy.add(dependent);
    }
    return requiredBy;
  }

  /* -------------------------------------------- */

  /**
   * Build the structure of modules that are dependent on other modules.
   */
  #buildDependents() {
    const addDependent = (module, dep) => {
      dep = this.#modules.get(dep.id);
      if ( !dep ) return;
      if ( !this.#dependents.has(dep) ) this.#dependents.set(dep, new Set());
      const dependents = this.#dependents.get(dep);
      dependents.add(module);
    };

    for ( const module of this.#modules.values() ) {
      for ( const dep of module.relationships.requires ) addDependent(module, dep);
      for ( const dep of module.relationships.recommends ) addDependent(module, dep);
    }
  }

  /* -------------------------------------------- */

  /**
   * Recurse down the dependency tree and gather modules that are required or optional.
   * @param {Set<Module>} [skip]  If any of these modules are encountered in the graph, skip them.
   * @returns {Map<Module, DependencyResolutionDescriptor>}
   */
  #getDependencies(skip=new Set()) {
    const resolution = new Map();

    const addDependency = (module, { required=false, reason, dependent }={}) => {
      if ( !resolution.has(module) ) resolution.set(module, { module, checked: true });
      const info = resolution.get(module);
      if ( !info.required ) info.required = required;
      if ( reason ) {
        if ( info.reason ) info.reason += "\n";
        info.reason += `${dependent.title}: ${reason}`;
      }
    };

    const addDependencies = (module, deps, required=false) => {
      for ( const { id, reason } of deps ) {
        const dep = this.#modules.get(id);
        if ( !dep ) continue;
        const info = resolution.get(dep);

        // Avoid cycles in the dependency graph.
        if ( info && (info.required === true || info.required === required) ) continue;

        // Add every dependency we see so the user can toggle them on and off, but do not traverse the graph any further
        // if we have indicated this dependency should be skipped.
        addDependency(dep, { reason, required, dependent: module });
        if ( skip.has(dep) ) continue;

        addDependencies(dep, dep.relationships.requires, true);
        addDependencies(dep, dep.relationships.recommends);
      }
    };

    addDependencies(this.root, this.root.relationships.requires, true);
    addDependencies(this.root, this.root.relationships.recommends);
    return resolution;
  }

  /* -------------------------------------------- */

  /**
   * Get the set of all modules that would be unused (i.e. have no dependents) if the given set of modules were
   * disabled.
   * @param {Set<Module>} disabling  The set of modules that are candidates for disablement.
   * @returns {Set<Module>}
   */
  #getUnused(disabling) {
    const unused = new Set();
    const systemRequirements = game.system.relationships.requires.map(m => m.id);
    for ( const module of this.#modules.values() ) {
      const dependents = this.#dependents.get(module);
      if ( !dependents || systemRequirements.has(module.id) ) continue;

      // What dependents are left if we remove the set of to-be-disabled modules?
      const remaining = dependents.difference(disabling);
      if ( !remaining.size ) unused.add(module);
    }
    return unused;
  }

  /* -------------------------------------------- */

  /**
   * Find the maximum dependents that can be pruned if the root module is disabled.
   * Starting at the root module, add all modules that would become unused to the set of modules to disable. For each
   * module added in this way, check again for new modules that would become unused. Repeat until there are no more
   * unused modules.
   */
  #initializeDisabling() {
    const disabling = new Set([this.root]);

    // Initialize modules.
    for ( const module of game.modules ) {
      if ( this.#manager._isModuleChecked(module.id) ) this.#modules.set(module.id, module);
    }

    // Initialize dependents.
    this.#buildDependents();

    // Set a maximum iteration limit of 100 to prevent accidental infinite recursion.
    for ( let i = 0; i < 100; i++ ) {
      const unused = this.#getUnused(disabling);
      if ( !unused.size ) break;
      unused.forEach(disabling.add, disabling);
    }

    this.#candidates = disabling;

    // Initialize resolution state.
    for ( const module of disabling ) {
      this.#resolution.set(module, { module, checked: true, required: false });
    }
  }

  /* -------------------------------------------- */

  /**
   * Find the full list of recursive dependencies for the root module.
   */
  #initializeEnabling() {
    // Initialize modules.
    for ( const module of game.modules ) {
      if ( !this.#manager._isModuleChecked(module.id) ) this.#modules.set(module.id, module);
    }

    // Traverse the dependency graph and locate dependencies that need activation.
    this.#resolution = this.#getDependencies();
    for ( const module of this.#resolution.keys() ) this.#candidates.add(module);
  }
}

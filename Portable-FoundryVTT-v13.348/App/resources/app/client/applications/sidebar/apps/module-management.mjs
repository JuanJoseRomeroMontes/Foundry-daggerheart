import ApplicationV2 from "../../api/application.mjs";
import HandlebarsApplicationMixin from "../../api/handlebars-application.mjs";
import DependencyResolution from "../../settings/dependency-resolution.mjs";
import SearchFilter from "../../ux/search-filter.mjs";

/**
 * @import {ApplicationFormSubmission} from "../../_types.mjs";
 * @import {SearchFilterCallback} from "../../ux/search-filter.mjs";
 */

/**
 * The Module Management Application.
 * This application provides a view of which modules are available to be used and allows for configuration of the
 * set of modules which are active within the World.
 *
 * @extends ApplicationV2
 * @mixes HandlebarsApplication
 */
export default class ModuleManagement extends HandlebarsApplicationMixin(ApplicationV2) {

  /**
   * The named game setting which persists module configuration.
   * @type {string}
   * @readonly
   */
  static SETTING = "moduleConfiguration";

  /* -------------------------------------------- */

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "module-management",
    tag: "form",
    window: {
      title: "MODMANAGE.Title",
      icon: "fa-solid fa-cube",
      contentClasses: ["standard-form"]
    },
    position: {width: 680},
    form: {
      handler: this.#onSubmitForm,
      submitOnClose: false,
      closeOnSubmit: true
    },
    actions: {
      changeFilter: this.#onChangeFilter,
      deactivateAll: this.#onDeactivateAll,
      toggleExpanded: this.#onToggleExpanded
    }
  };

  /* -------------------------------------------- */

  /** @override */
  static PARTS = {
    body: {
      template: "templates/sidebar/apps/module-management.hbs",
      templates: ["templates/setup/parts/package-tags.hbs"],
      root: true
    },
    footer: {template: "templates/generic/form-footer.hbs"}
  };

  /* -------------------------------------------- */

  /**
   * The search-filter.
   * @type {SearchFilter}
   */
  #search = new SearchFilter({
    inputSelector: "input[type=search]",
    contentSelector: ".package-list",
    callback: this.#onSearchFilter.bind(this)
  });

  /* -------------------------------------------- */

  /**
   * Expand the description of the modules?
   * @type {boolean}
   */
  #expanded = false;

  /* -------------------------------------------- */

  /**
   * The currently selected filter.
   * @type {"all"|"active"|"inactive"}
   */
  #filter = this.isEditable ? "all" : "active";

  /* -------------------------------------------- */

  /**
   * Can the current User manage modules?
   * @type {boolean}
   */
  get isEditable() {
    return game.user.can("SETTINGS_MODIFY");
  }

  /* -------------------------------------------- */

  /**
   * Given a module, determines if it meets minimum and maximum compatibility requirements of its dependencies.
   * If not, it is marked as being unable to be activated.
   * If the package does not meet verified requirements, it is marked with a warning instead.
   * @param {object} module  The module.
   */
  #evaluateDependencies(module) {
    for ( const required of module.relationships.requires ) {
      if ( required.type !== "module" ) continue;

      // Verify the required package is installed
      const pkg = game.modules.get(required.id);
      if ( !pkg ) {
        module.enableable = false;
        required.class = "error";
        required.tooltip = game.i18n.localize("SETUP.DependencyNotInstalled");
        continue;
      }

      // Test required package compatibility
      const c = required.compatibility;
      if ( !c ) continue;
      const dependencyVersion = pkg.version;
      if ( c.minimum && foundry.utils.isNewerVersion(c.minimum, dependencyVersion) ) {
        module.enableable = false;
        required.class = "error";
        required.tooltip = game.i18n.format("SETUP.CompatibilityRequireUpdate", {version: required.compatibility.minimum});
        continue;
      }
      if ( c.maximum && foundry.utils.isNewerVersion(dependencyVersion, c.maximum) ) {
        module.enableable = false;
        required.class = "error";
        required.tooltip = game.i18n.format("SETUP.CompatibilityRequireDowngrade", {version: required.compatibility.maximum});
        continue;
      }
      if ( c.verified && !foundry.utils.isNewerVersion(dependencyVersion, c.verified) ) {
        required.class = "warning";
        required.tooltip = game.i18n.format("SETUP.CompatibilityRiskWithVersion", {version: required.compatibility.verified});
      }
    }

    // Record that a module may not be able to be enabled
    if ( !module.enableable ) module.tooltip = game.i18n.localize("MODMANAGE.DependencyIssues");
  }

  /* -------------------------------------------- */

  /**
   * Given a module, determine if it meets the minimum and maximum system compatibility requirements.
   * @param {object} module  The module.
   */
  #evaluateSystemCompatibility(module) {
    if ( !module.relationships.systems?.length ) return;
    const supportedSystem = module.relationships.systems.find(s => s.id === game.system.id);
    const {minimum, maximum} = supportedSystem?.compatibility ?? {};
    const {version} = game.system;
    if ( !minimum && !maximum ) return;
    if ( minimum && foundry.utils.isNewerVersion(minimum, version) ) {
      module.enableable = false;
      module.tooltip = game.i18n.format("MODMANAGE.SystemCompatibilityIssueMinimum", {minimum, version});
    }
    if ( maximum && foundry.utils.isNewerVersion(version, maximum) ) {
      module.enableable = false;
      module.tooltip = game.i18n.format("MODMANAGE.SystemCompatibilityIssueMaximum", {maximum, version});
    }
  }

  /* -------------------------------------------- */

  /**
   * Format a document count collection for display.
   * @param {ModuleSubTypeCounts} counts  An object of sub-type counts.
   * @param {boolean} verbose             Detailed breakdown of by sub-type?
   * @param {Module} [module]             Are sub-types relative to a module?
   * @returns {string}                    The formatted document count
   * @internal
   */
  _formatDocumentSummary(counts, verbose, module) {
    if ( !verbose ) {
      const list = [];
      for ( const [documentName, types] of Object.entries(counts) ) {
        let total = 0;
        for ( const count of Object.values(types) ) total += count;
        if ( !total ) continue;
        const cls = foundry.utils.getDocumentClass(documentName);
        const label = game.i18n.localize(total === 1 ? cls.metadata.label : cls.metadata.labelPlural);
        list.push(`${total} ${label}`);
      }
      if ( !list.length ) return "";
      return game.i18n.getListFormatter().format(list);
    }
    const ul = document.createElement("ul");
    for ( const [documentName, types] of Object.entries(counts) ) {
      const list = [];
      for ( const [subType, count] of Object.entries(types) ) {
        if ( !count ) continue;
        let label;
        const typeLabel = CONFIG[documentName].typeLabels?.[module ? `${module.id}.${subType}` : subType];
        if ( typeLabel && game.i18n.has(typeLabel) ) label = game.i18n.localize(typeLabel);
        else {
          label = document.createElement("samp");
          label.textContent = subType;
        }
        const span = document.createElement("span");
        span.append(count, " ", label);
        list.push(span.innerHTML);
      }
      if ( !list.length ) continue;
      const strong = document.createElement("strong");
      const cls = foundry.utils.getDocumentClass(documentName);
      strong.textContent = `${game.i18n.localize(cls.metadata.labelPlural)}:`;
      const li = document.createElement("li");
      li.append(strong, " ");
      li.innerHTML += game.i18n.getListFormatter().format(list);
      ul.append(li);
    }
    if ( !ul.childElementCount ) return "";
    return ul.outerHTML;
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.editable = this.isEditable;
    context.expanded = this.#expanded;

    // Modules
    const counts = {all: game.modules.size, active: 0, inactive: 0};
    context.modules = game.modules.reduce((arr, module) => {
      const isActive = module.active;
      if ( isActive ) counts.active++;
      else if ( !context.editable ) return arr;
      else counts.inactive++;

      const mod = module.toObject();
      mod.active = isActive;
      mod.hidden = ((this.#filter === "active") && !isActive) || ((this.#filter === "inactive") && isActive);
      mod.hasPacks = mod.packs.length > 0;
      mod.hasScripts = mod.scripts.length > 0;
      mod.hasStyles = mod.styles.length > 0;
      mod.systemOnly = mod.relationships?.systems.find(s => s.id === game.system.id);
      mod.systemTag = game.system.id;
      mod.authors = mod.authors.map(author => {
        if ( author.url ) {
          const a = document.createElement("a");
          a.href = author.url;
          a.target = "_blank";
          a.textContent = author.name;
          return a.outerHTML;
        }
        return author.name;
      }).join(", ");
      mod.tooltip = ""; // No tooltip by default
      const requiredModules = Array.from(game.world.relationships.requires)
        .concat(Array.from(game.system.relationships.requires));
      mod.required = !!requiredModules.find(r => r.id === mod.id);
      if ( mod.required ) mod.tooltip = game.i18n.localize("MODMANAGE.RequiredModule");

      // String formatting labels
      const authorsLabel = game.i18n.localize(`Author${module.authors.size > 1 ? "Pl" : ""}`);
      mod.labels = {authors: authorsLabel};
      mod.badge = module.getVersionBadge();

      // Document counts.
      const subTypeCounts = game.issues.getSubTypeCountsFor(mod);
      if ( subTypeCounts ) {
        mod.documents = this._formatDocumentSummary(subTypeCounts, false, mod);
        mod.documentsVerbose = this._formatDocumentSummary(subTypeCounts, true, mod);
      }

      // If the current System is not one of the supported ones, don't return
      if ( (mod.relationships?.systems.size > 0) && !mod.systemOnly ) return arr;

      mod.enableable = true;
      this.#evaluateDependencies(mod);
      this.#evaluateSystemCompatibility(mod);
      mod.disabled = mod.required || !mod.enableable;
      return arr.concat([mod]);
    }, []).sort((a, b) => a.title.localeCompare(b.title, game.i18n.lang));

    // Filters
    context.filters = context.editable ? ["all", "active", "inactive"].map(f => ({
      id: f,
      label: game.i18n.localize(`MODMANAGE.Filter${f.titleCase()}`),
      count: counts[f] ?? 0,
      active: f === this.#filter
    })) : [];

    // Buttons
    context.buttons = context.editable ? [
      {type: "submit", icon: "fa-regular fa-floppy-disk", label: "MODMANAGE.Submit"},
      {type: "button", icon: "fa-solid fa-ban", label: "MODMANAGE.DeactivateAll", action: "deactivateAll"}
    ] : [];

    return context;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onRender(context, options) {
    await super._onRender(context, options);
    this.#search.bind(this.element);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _tearDown(options) {
    super._tearDown(options);
    this.#search.unbind();
  }

  /* -------------------------------------------- */

  /**
   * Check if a module is enabled currently in the application.
   * @param {string} id  The module ID.
   * @returns {boolean}
   * @internal
   */
  _isModuleChecked(id) {
    return !!this.form.elements[id]?.checked;
  }

  /* -------------------------------------------- */

  /**
   * Update the checked state of modules based on user dependency resolution.
   * @param {Record<string, boolean>} formData  The dependency resolution result.
   * @param {boolean} enabling                  Whether the user was performing an enabling or disabling workflow.
   * @internal
   */
  _onSelectDependencies(formData, enabling) {
    for ( const [id, checked] of Object.entries(formData) ) {
      this.form.elements[id].checked = enabling ? checked : !checked;
    }
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _attachPartListeners(partId, element, options) {
    super._attachPartListeners(partId, element, options);
    if ( partId === "body" ) {
      this.element.querySelectorAll(".package input[type=checkbox]").forEach(
        e => e.addEventListener("change", this.#onChangeCheckbox.bind(this)));
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle changes to a module checkbox to prompt for whether to enable dependencies.
   * @param {Event} event  The change event.
   */
  #onChangeCheckbox(event) {
    const input = event.target;
    const module = game.modules.get(input.name);
    const enabling = input.checked;
    const resolver = new DependencyResolution({ root: module, manager: this, enabling });
    const requiredBy = resolver._getRootRequiredBy();

    if ( requiredBy.size || resolver.needsResolving ) {
      this.form.elements[input.name].checked = !enabling;
      if ( requiredBy.size ) {
        // TODO: Rather than throwing an error, we should prompt the user to disable all dependent modules, as well as
        // all their dependents, recursively, and all unused modules that would result from those disablings.
        const listFormatter = game.i18n.getListFormatter();
        const dependents = listFormatter.format(Array.from(requiredBy).map(m => m.title));
        ui.notifications.error("MODMANAGE.RequiredDepError", {format: {dependents}, console: false});
      }
      else resolver.render({force: true});
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle search inputs.
   * @type {SearchFilterCallback}
   */
  #onSearchFilter(_event, query, rgx, html) {
    const settings = game.settings.get("core", ModuleManagement.SETTING);
    for ( const li of html.children ) {
      const name = li.dataset.moduleId;
      const isActive = settings[name] === true;
      if ( (this.#filter === "active") && !isActive ) continue;
      if ( (this.#filter === "inactive") && isActive ) continue;
      if ( !query ) {
        li.hidden = false;
        continue;
      }
      const title = (li.querySelector(".package-title")?.textContent || "").trim();
      const author = (li.querySelector(".author")?.textContent || "").trim();
      const match = foundry.applications.ux.SearchFilter.testQuery(rgx, name)
        || foundry.applications.ux.SearchFilter.testQuery(rgx, title)
        || foundry.applications.ux.SearchFilter.testQuery(rgx, author);
      li.hidden = !match;
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle a button-click to deactivate all modules.
   * @this {ModuleManagement}
   * @param {PointerEvent} event
   */
  static #onDeactivateAll(event) {
    for ( const input of this.element.querySelectorAll('.package input[type="checkbox"]') ) {
      if ( !input.disabled ) input.checked = false;
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle switching the module list filter.
   * @this {ModuleManagement}
   * @param {PointerEvent} _event
   * @param {HTMLButtonElement} target
   */
  static #onChangeFilter(_event, target) {
    this.#filter = target.dataset.filter;

    // Toggle the activity state of all filters.
    this.element.querySelectorAll("search [data-filter]").forEach(
      e => e.classList.toggle("active", e.dataset.filter === this.#filter));

    // Iterate over modules and toggle their hidden states based on the chosen filter.
    for ( const li of this.element.querySelectorAll(".package") ) {
      const isActive = li.classList.contains("active");
      li.hidden = ((this.#filter === "active") && !isActive) || ((this.#filter === "inactive") && isActive);
    }

    // Re-apply any search filter query.
    this.#search.filter(null, this.#search._input.value);
  }

  /* -------------------------------------------- */

  /**
   * Handle a button-click to deactivate all modules.
   * @this {ModuleManagement}
   */
  static #onToggleExpanded() {
    this.#expanded = !this.#expanded;
    const button = this.element.querySelector("[data-action=toggleExpanded]");
    button.classList.toggle("fa-angle-double-down", this.#expanded);
    button.classList.toggle("fa-angle-double-up", !this.#expanded);
    button.dataset.tooltip = this.#expanded ? "Collapse" : "Expand";
    game.tooltip.deactivate();
    this.element.querySelector(".package-list").classList.toggle("expanded", this.#expanded);
  }

  /* -------------------------------------------- */

  /**
   * Process form submission for the sheet.
   * @type {ApplicationFormSubmission}
   */
  static async #onSubmitForm(_event, _form, formData) {
    const newSettings = formData.object;

    // Ensure all relationships are satisfied
    for ( const [moduleId, active] of Object.entries(newSettings) ) {
      const module = game.modules.get(moduleId);
      if ( !module ) {
        delete newSettings[moduleId];
        continue;
      }
      if ( !active ) continue;
      if ( !module.relationships?.requires?.size ) continue;
      const missing = module.relationships.requires.reduce((arr, d) => {
        if ( d.type && (d.type !== "module") ) return arr;
        const requiredModuleActive = newSettings[d.id] ?? game.modules.get(d.id)?.active;
        if ( !requiredModuleActive ) arr.push(game.modules.get(d.id)?.title ?? d.id);
        return arr;
      }, []);
      if ( missing.length ) {
        const listFormatter = game.i18n.getListFormatter();
        const message = game.i18n.format("MODMANAGE.DepMissing", {module: module.title, missing: listFormatter.format(missing)});
        throw new Error(message);
      }
    }

    // Apply the setting
    const oldSettings = game.settings.get("core", ModuleManagement.SETTING);
    const requiresReload = !foundry.utils.isEmpty(foundry.utils.diffObject(oldSettings, newSettings));
    if ( requiresReload ) foundry.applications.settings.SettingsConfig.reloadConfirm({world: true});
    await game.settings.set("core", ModuleManagement.SETTING, newSettings);
  }

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /**
   * @deprecated since v13
   * @ignore
   */
  static get CONFIG_SETTING() {
    const message = "ModuleManagement.CONFIG_SETTING is deprecated in favor of ModuleManagement.SETTING";
    foundry.utils.logCompatibilityWarning(message, {since: 13, until: 15});
    return this.SETTING;
  }
}

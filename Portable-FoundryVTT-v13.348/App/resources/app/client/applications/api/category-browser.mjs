import ApplicationV2 from "./application.mjs";
import HandlebarsApplicationMixin from "./handlebars-application.mjs";
import SearchFilter from "../ux/search-filter.mjs";

/**
 * @import {ApplicationConfiguration, ApplicationRenderOptions, ApplicationTabsConfiguration} from "../_types.mjs"
 * @import {HandlebarsRenderOptions} from "./handlebars-application.mjs"
 * @import {SearchFilterCallback} from "../ux/search-filter.mjs"
 */

/**
 * @typedef CategoryBrowserConfiguration
 * @property {boolean} packageList Where this application displays is a list of tagged FVTT packages
 * @property {string|null} initialCategory The initial category tab: a `null` value will result in an initial active tab
 *                                         that corresponds with the first category by insertion order.
 * @property {object} subtemplates Additional Template partials for specific use with this class
 * @property {string} subtemplates.category The markup used for each category: required to be set by any subclass
 * @property {string|null} subtemplates.filters Optional template for secondary filtering (aside from text search)
 * @property {string|null} subtemplates.sidebarFooter Optional sidebar footer content
 */

/**
 * An abstract class responsible for displaying a 2-pane Application that allows for entries to be grouped and filtered
 * by category.
 * @extends ApplicationV2<ApplicationConfiguration & CategoryBrowserConfiguration, HandlebarsRenderOptions>
 */
export default class CategoryBrowser extends HandlebarsApplicationMixin(ApplicationV2) {

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    classes: ["category-browser"],
    window: {
      contentClasses: ["standard-form"]
    },
    form: {
      closeOnSubmit: true
    },
    initialCategory: null,
    packageList: false,
    subtemplates: {
      category: undefined,
      filters: null,
      sidebarFooter: null
    }
  };

  /** @override */
  static PARTS = {
    sidebar: {
      template: "templates/category-browser/sidebar.hbs",
      scrollable: ["nav"]
    },
    main: {
      template: "templates/category-browser/main.hbs"
    }
  };

  /* -------------------------------------------- */

  /**
   * Search-filter handling
   * @type {SearchFilter}
   */
  #search = new SearchFilter({
    inputSelector: "input[type=search]",
    contentSelector: "[data-application-part=main]",
    callback: this._onSearchFilter.bind(this)
  });

  /**
   * Is category and/or entry data loaded? Most subclasses will already have their data close at hand.
   * @returns {boolean}
   * @protected
   */
  get _dataLoaded() {
    return true;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _initializeApplicationOptions(options) {
    const initialized = super._initializeApplicationOptions(options);
    if ( initialized.form.handler ) initialized.tag = "form";
    return initialized;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _configureRenderParts(options) {
    const parts = super._configureRenderParts(options);
    const subtemplates = this.options.subtemplates;
    if ( !subtemplates.category ) {
      throw new Error(`${this.constructor.name} must configure a category template.`);
    }
    parts.main.templates.push(subtemplates.category);
    if ( subtemplates.filters ) parts.main.templates.push(subtemplates.filters);
    if ( subtemplates.sidebarFooter ) parts.sidebar.templates.push(subtemplates.sidebarFooter);
    return parts;
  }

  /**
   * Perform a text search without a `KeyboardEvent`.
   * @param {string} query
   */
  search(query) {
    this.#search.filter(null, query);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async render(options) {
    await super.render(options);
    if ( options?.reloadData || !this._dataLoaded ) {
      this._loadCategoryData().then(() => this.render()); // Do not block render
    }
    return this;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const categoryData = await this._prepareCategoryData();
    if ( options.resetTabs ) this.constructor.TABS = {};
    this.#configureTabs(categoryData);
    const tabData = this._prepareTabs("categories");
    return {
      rootId: this.id,
      loading: null,
      categories: foundry.utils.mergeObject(tabData, categoryData),
      packageList: this.options.packageList,
      subtemplates: this.options.subtemplates,
      submitButton: this.options.tag === "form"
    };
  }

  /* -------------------------------------------- */

  /**
   * Prepare the structure of category data which is rendered in this configuration form.
   * @returns {Promise<Record<string, {id: string; label: string; entries: object[]}>>}
   * @protected
   * @abstract
   */
  async _prepareCategoryData() {
    throw new Error(`${this.constructor.name} must implement the _prepareCategoryData method.`);
  }

  /* -------------------------------------------- */

  /**
   * An optional method to make a potentially long-running request to load category data: a temporary message will be
   * displayed until completion.
   * @returns {Promise<void>}
   */
  async _loadCategoryData() {}

  /* -------------------------------------------- */

  /**
   * Reusable logic for how categories are sorted in relation to each other.
   * @param {{label: string; [key: string]: unknown}} a
   * @param {{label: string; [key: string]: unknown}} b
   * @protected
   */
  _sortCategories(a, b) {
    return a.label.localeCompare(b.label, game.i18n.lang);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _tearDown(options) {
    super._tearDown(options);
    this.#search.unbind();
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onRender(context, options) {
    await super._onRender(context, options);
    this.#search.bind(this.element);
  }

  /* -------------------------------------------- */

  /**
   * Dynamically assemble a tabs configuration from category data.
   * @param {Record<string, {id:string; label:string}>} categoryData
   * @see {@link foundry.applications.types.ApplicationTabsConfiguration}
   */
  #configureTabs(categoryData) {
    if ( Object.keys(this.constructor.TABS).length ) return;
    const tabs = Object.entries(categoryData)
      .sort(([, a], [, b]) => this._sortCategories(a, b))
      .map(([id, c]) => ({id, label: c.label, scrollable: [""]}));
    const initial = this.options.initialCategory ?? tabs[0]?.id ?? null;
    this.constructor.TABS = {categories: {tabs, initial}};
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /**
   * Handle search inputs.
   * @type {SearchFilterCallback}
   * @protected
   */
  _onSearchFilter(_event, query, rgx, html) {
    const matchCounts = {};

    // Hide entries
    for ( const entry of html.querySelectorAll(".form-group:not([data-bulk-actions])") ) {
      const category = entry.closest("[data-category]").dataset.category;
      matchCounts[category] ??= 0;
      if ( !query ) {
        entry.hidden = false;
        matchCounts[category]++;
        continue;
      }
      const label = entry.querySelector(":scope > label, :scope > span.label")?.textContent ?? "";
      const hint = entry.querySelector(":scope > .hint")?.textContent ?? "";
      const other = Array.from(entry.querySelectorAll("[data-searchable]")).map(e => e.textContent ?? "");
      const isMatch = [label, hint, ...other].some(q => rgx.test(SearchFilter.cleanQuery(q)));
      entry.hidden = !isMatch;
      if ( isMatch ) matchCounts[category]++;
    }

    // Update match counts
    for ( const [category, count] of Object.entries(matchCounts) ) {
      const tabAnchor = this.element.querySelector(`button[data-tab="${category}"]`);
      const countEl = tabAnchor.querySelector(":scope > span[data-count]");
      countEl.innerText = `[${count}]`;
      tabAnchor.classList.toggle("no-matches", count === 0);
    }

    // Hide bulk actions if their category has no matching entries
    for ( const entry of html.querySelectorAll(".form-group[data-bulk-actions]") ) {
      const category = entry.closest("[data-category]")?.dataset.category;
      entry.hidden = (matchCounts[category] === 0);
    }
  }
}

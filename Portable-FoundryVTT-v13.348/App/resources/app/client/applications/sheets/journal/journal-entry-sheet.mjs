import {DOCUMENT_OWNERSHIP_LEVELS} from "@common/constants.mjs";
import {DocumentSheetV2, HandlebarsApplicationMixin} from "../../api/_module.mjs";
import DocumentOwnershipConfig from "../../apps/document-ownership.mjs";
import JournalEntryCategoryConfig from "./journal-entry-category-config.mjs";
import Journal from "@client/documents/collections/journal.mjs";
import {StringField} from "@common/data/fields.mjs";
import JournalEntryPage from "@client/documents/journal-entry-page.mjs";
import TextEditor from "@client/applications/ux/text-editor.mjs";
import JournalEntry from "@client/documents/journal-entry.mjs";

/**
 * @import {DocumentSheetConfiguration, DocumentSheetRenderOptions} from "../../api/document-sheet.mjs";
 * @import {ApplicationRenderContext} from "../../_types.mjs";
 * @import {JournalEntryPageHeading} from "@client/_types.mjs";
 */

/**
 * @typedef {DocumentSheetRenderOptions} JournalSheetRenderOptions
 * @property {number} [pageIndex]                   Render the journal sheet at this page index.
 * @property {string} [pageId]                      Render the journal sheet at the page with this ID.
 * @property {JournalEntrySheet.VIEW_MODES} [mode]  Render the journal sheet with the given page mode.
 * @property {string} [anchor]                      Scroll to the specified heading in the given page.
 */

/**
 * @typedef JournalSheetPageContext
 * @property {string} id              The page ID.
 * @property {boolean} editable       Whether the current user is allowed to edit the page.
 * @property {boolean} hidden         Whether the page is currently hidden due to a search filter.
 * @property {string} tocClass        The class name for the page entry in the table of contents.
 * @property {string} viewClass       The class name for the page entry in the pages view.
 * @property {string} name            The page title.
 * @property {number} number          The page number in the table of contents.
 * @property {string} icon            The ownership icon for the page entry in the table of contents.
 * @property {string} ownershipClass  The class name for the page's ownership level in the table of contents.
 * @property {string} [category]      The ID of the category this page belongs to, if any.
 * @property {number} sort            The numeric sort value which orders this page relative to other pages in its
 *                                    category.
 * @property {boolean} [uncategorized]  Whether the page has not been assigned a category.
 */

/**
 * @typedef JournalSheetCategoryContext
 * @property {string} id    The category ID.
 * @property {string} name  The category name.
 */

/**
 * The Application responsible for displaying and editing a single JournalEntry Document.
 * @extends {DocumentSheetV2<DocumentSheetConfiguration, JournalSheetRenderOptions>}
 * @mixes HandlebarsApplication
 */
export default class JournalEntrySheet extends HandlebarsApplicationMixin(DocumentSheetV2) {
  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["journal-sheet", "journal-entry"],
    viewPermission: DOCUMENT_OWNERSHIP_LEVELS.NONE,
    window: {
      resizable: true
    },
    position: {
      width: 960,
      height: 800
    },
    form: {
      submitOnChange: true
    },
    actions: {
      configCategories: JournalEntrySheet.#onConfigureCategories,
      createPage: this.prototype.createPageDialog,
      editPage: this.prototype._onEditPage,
      goToHeading: JournalEntrySheet.#onGoToHeading,
      nextPage: this.prototype.nextPage,
      previousPage: this.prototype.previousPage,
      showPlayers: this.prototype._onShowPlayers,
      toggleLock: JournalEntrySheet.#onToggleLock,
      toggleMode: JournalEntrySheet.#onToggleMode,
      toggleSearch: this.prototype.toggleSearchMode,
      toggleSidebar: this.prototype.toggleSidebar
    }
  };

  /** @override */
  static PARTS = {
    sidebar: {
      template: "templates/journal/sidebar.hbs",
      templates: ["templates/journal/toc.hbs"],
      scrollable: [".toc"]
    },
    pages: {
      template: "templates/journal/pages.hbs",
      scrollable: [".journal-entry-pages"]
    }
  };

  /**
   * The percentage of the journal sheet page viewport that must be filled by a page before that page is marked as in
   * view.
   * @type {number}
   */
  static #INTERSECTION_RATIO = .25;

  /**
   * Icons for page ownership.
   * @enum {string}
   */
  static OWNERSHIP_ICONS = {
    [DOCUMENT_OWNERSHIP_LEVELS.NONE]: "fa-solid fa-eye-slash",
    [DOCUMENT_OWNERSHIP_LEVELS.OBSERVER]: "fa-solid fa-eye",
    [DOCUMENT_OWNERSHIP_LEVELS.OWNER]: "fa-solid fa-feather-pointed"
  };

  /**
   * The available view modes for journal entries.
   * @enum {number}
   */
  static VIEW_MODES = {
    SINGLE: 1,
    MULTIPLE: 2
  };

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * The cached categorization structure.
   * @type {Record<string, string[]>}
   */
  #categorizedPages;

  /**
   * The JournalEntry for this sheet.
   * @type {JournalEntry}
   */
  get entry() {
    return this.document;
  }

  /**
   * Track which page IDs are currently displayed due to a search filter.
   * @type {Set<string>}
   */
  #filteredPages = new Set();

  /**
   * Store a special set of heading intersections so that we can quickly compute the top-most heading in the viewport.
   * @type {Map<HTMLHeadingElement, IntersectionObserverEntry>}
   */
  #headingIntersections = new Map();

  /**
   * Whether the sheet is in multi-page mode.
   * @type {boolean}
   */
  get isMultiple() {
    return this.mode === this.constructor.VIEW_MODES.MULTIPLE;
  }

  /**
   * Whether the journal is locked and disallows modifications to the table of contents.
   * @type {boolean}
   */
  get locked() {
    return this.entry.getFlag("core", "locked") ?? false;
  }

  /**
   * Get the JournalEntry's current view mode.
   * @type {JournalEntrySheet.VIEW_MODES}
   */
  get mode() {
    return this.#mode ?? this.entry.getFlag("core", "viewMode") ?? this.constructor.VIEW_MODES.SINGLE;
  }

  #mode;

  /**
   * The currently active IntersectionObserver.
   * @type {IntersectionObserver}
   */
  get observer() {
    return this.#observer;
  }

  #observer;

  /**
   * The ID of the currently-viewed page.
   * @type {string}
   */
  get pageId() {
    return this.#pageId;
  }

  #pageId;

  /**
   * The index of the currently-viewed page in the list of available pages.
   * @type {number}
   */
  get pageIndex() {
    return Object.keys(this._pages).findIndex(id => id === this.pageId);
  }

  /**
   * The cached list of processed page entries.
   * @type {Record<string, JournalSheetPageContext>}
   * @protected
   */
  _pages;

  /**
   * The pages that are currently scrolled into view and marked as 'active' in the sidebar.
   * @type {HTMLElement[]}
   */
  get pagesInView() {
    return this.#pagesInView;
  }

  #pagesInView = [];

  /**
   * The currently active search filter.
   * @type {foundry.applications.ux.SearchFilter}
   */
  #search;

  /**
   * Get the JournalEntry's current search mode.
   * @type {string}
   */
  get searchMode() {
    return this.#searchMode ?? CONST.DIRECTORY_SEARCH_MODES.NAME;
  }

  #searchMode;

  /**
   * A mapping of page IDS to JournalPageSheet instances used for rendering the pages inside the journal entry.
   * @type {Record<string, JournalPageSheet>}
   */
  #sheets = {};

  /**
   * The expanded state of the sidebar.
   * @type {boolean}
   */
  get sidebarExpanded() {
    return this.#sidebarState.expanded;
  }

  /**
   * Store transient sidebar state so it can be restored after context menus are closed.
   * @type {{expanded: boolean, active: boolean, position: number}}
   */
  #sidebarState = {
    expanded: true,
    active: false,
    position: 0
  };

  /**
   * DOM synchronization state for the main journal content.
   * @type {[HTMLElement, HTMLElement, object]|null}
   */
  #syncState = null;

  /**
   * Has a user been granted temporary ownership of this journal entry or its pages?
   * @type {boolean}
   */
  #tempOwnership = false;

  /** @override */
  get title() {
    const { folder, name } = this.entry;
    return this.entry.permission ? `${folder ? `${folder.name}: ` : ""}${name}` : "";
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /**
   * Highlights the currently-viewed page in the sidebar.
   * @protected
   */
  _activatePagesInView() {
    if ( !this.element ) return;
    const pageIds = new Set(this.pagesInView.map(p => p.dataset.pageId));
    // Update the pageId to the first page in view in case the mode is switched to single page view.
    if ( pageIds.size ) this.#pageId = pageIds.first();
    let activeChanged = false;
    this.element.querySelectorAll(".toc li[data-page-id]").forEach(el => {
      activeChanged ||= el.classList.contains("active") !== pageIds.has(el.dataset.pageId);
      el.classList.toggle("active", pageIds.has(el.dataset.pageId));
    });
    if ( activeChanged ) this._synchronizeSidebar();
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _configureRenderOptions(options) {
    // Temporary ownership override.
    if ( "tempOwnership" in options ) this.#tempOwnership = options.tempOwnership;

    this._pages = this._preparePageData();

    // Mode changed
    options.modeChanged = ("mode" in options) && (options.mode !== this.mode);
    if ( options.modeChanged ) {
      if ( this.isMultiple ) this.#callCloseHooks();
      this.#mode = options.mode;
    }

    // Page changed
    this._setCurrentPage(options);

    // Adjust sidebar state
    if ( "expanded" in options ) this.#sidebarState.expanded = options.expanded;

    super._configureRenderOptions(options);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _configureRenderParts(options) {
    const parts = super._configureRenderParts(options);
    if ( this.isMultiple ) {
      for ( const id of Object.keys(this._pages) ) {
        parts[id] = { template: "templates/journal/page.hbs" };
      }
    }
    else parts[this.pageId] = { template: "templates/journal/page.hbs" };
    return parts;
  }

  /* -------------------------------------------- */

  /**
   * Get the set of ContextMenu options which should be used for journal entry pages in the sidebar.
   * @returns {ContextMenuEntry[]}
   * @protected
   */
  _getEntryContextOptions() {
    const getPage = li => this.entry.pages.get(li.dataset.pageId);
    return [{
      name: "SIDEBAR.Edit",
      icon: '<i class="fa-solid fa-pen-to-square"></i>',
      condition: li => this.isEditable && getPage(li)?.canUserModify(game.user, "update"),
      callback: li => getPage(li).sheet.render(true)
    }, {
      name: "SIDEBAR.Delete",
      icon: '<i class="fa-solid fa-trash"></i>',
      condition: li => this.isEditable && getPage(li)?.canUserModify(game.user, "delete"),
      callback: li => {
        const { top, right } = li.getBoundingClientRect();
        return getPage(li).deleteDialog({ position: { top, left: right } });
      }
    }, {
      name: "SIDEBAR.Duplicate",
      icon: '<i class="fa-regular fa-copy"></i>',
      condition: this.isEditable,
      callback: li => {
        const page = getPage(li);
        return page?.clone({ name: game.i18n.format("DOCUMENT.CopyOf", { name: page.name }) }, {
          save: true, addSource: true
        });
      }
    }, {
      name: "OWNERSHIP.Configure",
      icon: '<i class="fa-solid fa-lock"></i>',
      condition: game.user.isGM,
      callback: li => {
        const {top, right} = li.getBoundingClientRect();
        new DocumentOwnershipConfig({
          document: getPage(li),
          position: {top, left: right}
        }).render({force: true});
      }
    }, {
      name: "JOURNAL.ActionShow",
      icon: '<i class="fa-solid fa-eye"></i>',
      condition: li => getPage(li)?.isOwner,
      callback: li => Journal.showDialog(getPage(li))
    }, {
      name: "SIDEBAR.JumpPin",
      icon: '<i class="fa-solid fa-crosshairs"></i>',
      condition: li => !!getPage(li)?.sceneNote,
      callback: li => canvas.notes.panToNote(getPage(li).sceneNote)
    }];
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _initializeApplicationOptions(options) {
    const applicationOptions = super._initializeApplicationOptions(options);
    applicationOptions.window.icon ??= CONFIG.JournalEntry.sidebarIcon;
    return applicationOptions;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _getHeaderControls() {
    const controls = super._getHeaderControls();
    controls.push({
      icon: "fas fa-eye",
      label: "JOURNAL.ActionShow",
      visible: game.user.isGM,
      action: "showPlayers"
    }, {
      icon: "fa-solid fa-chart-tree-map",
      label: "JOURNAL.ConfigureCategories",
      visible: this.isEditable,
      action: "configCategories"
    });
    return controls;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    /** @fires {hookEvents:getJournalEntryPageContextOptions} */
    this._createContextMenu(this._getEntryContextOptions, ".toc .page", {
      hookName: "getJournalEntryPageContextOptions",
      parentClassHooks: false,
      onOpen: this._onContextMenuOpen.bind(this),
      onClose: this._onContextMenuClose.bind(this)
    });
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onRender(context, options) {
    await super._onRender(context, options);

    // Call setPosition early to prevent visible pop-in where page content renders at maximum size due to the
    // application window not having a fixed size yet.
    if ( "position" in options ) this.setPosition(options.position);
    await this._renderPageViews(context, options);
    if ( this.#syncState ) this._syncPartState("pages", ...this.#syncState);
    this.#syncState = null;

    if ( options.modeChanged || options.pageChanged ) {
      if ( this.isMultiple ) this.goToPage(this.pageId, options);
      else if ( options.anchor ) this.getPageSheet(this.pageId)?.toc[options.anchor]?.element?.scrollIntoView();
    }

    if ( !options.parts.includes("sidebar") ) return;

    // Drag-drop
    new foundry.applications.ux.DragDrop.implementation({
      dragSelector: ".toc :is([data-page-id], [data-anchor])",
      dropSelector: ".toc",
      permissions: {
        dragstart: this._canDragStart.bind(this),
        drop: this._canDragDrop.bind(this)
      },
      callbacks: {
        dragstart: this._onDragStart.bind(this),
        drop: this._onDrop.bind(this)
      }
    }).bind(this.element);

    // Search
    this.#search ??= new foundry.applications.ux.SearchFilter({
      inputSelector: "search input",
      contentSelector: ".toc",
      callback: this._onSearchFilter.bind(this)
    });
    this.#search.bind(this.element);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.mode = this.mode;
    context.viewMode = this.isMultiple
      ? { label: "JOURNAL.ModeMultiple", icon: "fas fa-notes", cls: "multi-page" }
      : { label: "JOURNAL.ModeSingle", icon: "fas fa-note", cls: "single-page" };
    return context;
  }

  /* -------------------------------------------- */

  /**
   * Prepare pages for display.
   * @returns {Record<string, JournalSheetPageContext>}
   * @protected
   */
  _preparePageData() {
    const hasFilterQuery = this.#search?.query;
    const levels = Object.entries(DOCUMENT_OWNERSHIP_LEVELS);
    const categoryMap = {};

    // Prepare pages.
    const uncategorized = this.entry.pages.contents.reduce((arr, page) => {
      if ( !this.isPageVisible(page) ) return arr;
      const { category, id, name, sort, title, type } = page;
      const hidden = hasFilterQuery && !this.#filteredPages.has(page.id);
      const sheet = this.getPageSheet(page);
      const cssClasses = [type, `level${title.level}`, "page"];
      const [ownership] = levels.find(([, level]) => level === page.ownership.default);
      let editable = sheet.isEditable;
      if ( !sheet.isV2 ) {
        editable = page.isOwner;
        if ( page.parent.pack ) editable &&= !game.packs.get(page.parent.pack)?.locked;
      }
      const descriptor = {
        category, id, editable, hidden, name, sort,
        tocClass: cssClasses.join(" "),
        viewClass: cssClasses.concat(sheet.options.viewClasses || []).join(" "),
        icon: this.constructor.OWNERSHIP_ICONS[page.ownership.default],
        ownershipClass: ownership.toLowerCase()
      };
      if ( category && this.entry.categories.has(category) ) {
        categoryMap[category] ??= [];
        categoryMap[category].push(descriptor);
      } else {
        descriptor.uncategorized = true;
        arr.push(descriptor);
      }
      return arr;
    }, []).sort((a, b) => a.sort - b.sort);

    // Order pages by category
    this.#categorizedPages = {};
    const categories = this.entry.categories.contents.sort(JournalEntry.sortCategories);
    const categorized = categories.flatMap(({ id: categoryId }) => {
      const pages = (categoryMap[categoryId] ?? []).sort((a, b) => a.sort - b.sort);
      this.#categorizedPages[categoryId] = pages.map(p => p.id);
      return pages;
    });

    return Object.fromEntries(categorized.concat(uncategorized).map((page, i) => {
      page.number = i;
      return [page.id, page];
    }));
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    switch ( partId ) {
      case "pages": await this._preparePagesContext(context, options); break;
      case "sidebar": await this._prepareSidebarContext(context, options); break;
    }
    if ( partId in this._pages ) foundry.utils.mergeObject(context, this._pages[partId]);
    return context;
  }

  /* -------------------------------------------- */

  /**
   * Prepare render context for the pages part.
   * @param {ApplicationRenderContext} context
   * @param {JournalSheetRenderOptions} options
   * @returns {Promise<void>}
   * @protected
   */
  async _preparePagesContext(context, options) {
    if ( this.isMultiple ) context.pages = Object.values(this._pages);
    else context.pages = [this._pages[this.pageId]];
  }

  /* -------------------------------------------- */

  /**
   * Prepare render context for the sidebar part.
   * @param {ApplicationRenderContext} context
   * @param {JournalSheetRenderOptions} options
   * @returns {Promise<void>}
   * @protected
   */
  async _prepareSidebarContext(context, options) {
    context.toc = await this._prepareTableOfContents();
    context.expandMode = this.sidebarExpanded
      ? { label: "JOURNAL.ViewCollapse", icon: "fas fa-caret-right" }
      : { label: "JOURNAL.ViewExpand", icon: "fas fa-caret-left" };
    context.searchMode = this.searchMode === CONST.DIRECTORY_SEARCH_MODES.NAME
      ? { icon: "fa-solid fa-magnifying-glass", label: "SIDEBAR.SearchModeName" }
      : { icon: "fas fa-file-magnifying-glass", label: "SIDEBAR.SearchModeFull" };
    context.searchMode.placeholder = game.i18n.format("SIDEBAR.Search", {
      types: game.i18n.localize("DOCUMENT.JournalEntryPages")
    });
    if ( this.isEditable ) {
      context.lockMode = this.locked
        ? { icon: "fa-solid fa-lock", label: "JOURNAL.LockModeLocked" }
        : { icon: "fa-solid fa-unlock", label: "JOURNAL.LockModeUnlocked" };
    }
  }

  /* -------------------------------------------- */

  /**
   * Prepare the sidebar table of contents.
   * @returns {Promise<Array<JournalSheetPageContext & JournalSheetCategoryContext>>}
   * @protected
   */
  async _prepareTableOfContents() {
    if ( !this.entry.categories.size ) return Object.values(this._pages);
    const pages = { ...this._pages };
    const toc = [];
    for ( const [categoryId, pageIds] of Object.entries(this.#categorizedPages) ) {
      const { id, name } = this.entry.categories.get(categoryId);
      toc.push({ id, name, isCategory: true });
      for ( const pageId of pageIds ) {
        toc.push(pages[pageId]);
        delete pages[pageId];
      }
    }
    if ( !foundry.utils.isEmpty(pages) ) {
      toc.push({
        id: "uncategorized",
        name: game.i18n.localize("JOURNAL.Uncategorized"),
        isCategory: true
      });
      toc.push(...Object.values(pages));
    }
    return toc;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _preSyncPartState(partId, newElement, priorElement, state) {
    super._preSyncPartState(partId, newElement, priorElement, state);
    if ( (partId === "pages") || (partId in this._pages) ) this.#syncState = [newElement, priorElement, state];
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _replaceHTML(result, content, options) {
    super._replaceHTML(result, content, options);
    const pagesPart = result.pages ?? content.querySelector('[data-application-part="pages"]');
    const container = pagesPart.querySelector(".journal-entry-pages");

    // If in multi-page mode, re-append all the elements so that they match the ordering of _pages.
    if ( this.isMultiple ) {
      for ( const id of Object.keys(this._pages) ) container.append(this.parts[id]);
    }

    // Otherwise just append the single page into the container.
    else {
      for ( const id of options.parts ) {
        if ( id in this._pages ) container.append(result[id]);
      }
    }

    // Delete the elements of any pages that were deleted or are no longer visible to this user.
    for ( const id of Object.keys(this.parts) ) {
      if ( !(id in this._pages) && !(id in this.constructor.PARTS) ) {
        this.parts[id].remove();
        delete this.parts[id];
      }
    }
  }

  /* -------------------------------------------- */

  /**
   * Add headings to the table of contents for the given node.
   * @param {HTMLElement} pageNode                         The HTML node of the page's rendered contents.
   * @param {Record<string, JournalEntryPageHeading>} toc  The page's table of contents.
   * @returns {Promise<void>}
   * @protected
   */
  async _renderHeadings(pageNode, toc) {
    const pageId = pageNode.dataset.pageId;
    const page = this.entry.pages.get(pageId);
    const tocNode = this.element.querySelector(`.toc [data-page-id="${pageId}"]`);
    if ( !tocNode || !toc ) return;
    let headings = Object.values(toc);
    headings.sort((a, b) => a.order - b.order);
    if ( page.title.show ) headings.shift();
    const minLevel = Math.min(...headings.map(node => node.level));
    tocNode.querySelector(":scope > ol")?.remove();
    headings = headings.reduce((arr, { text, level, slug, element }) => {
      if ( element ) element.dataset.anchor = slug;
      if ( level < minLevel + 2 ) arr.push({ text, slug, level: level - minLevel + 2 });
      return arr;
    }, []);
    const html = await foundry.applications.handlebars.renderTemplate("templates/journal/toc.hbs", { headings });
    tocNode.insertAdjacentHTML("beforeend", html);
  }

  /* -------------------------------------------- */

  /**
   * Update child views inside the main sheet.
   * @param {ApplicationRenderContext} context
   * @param {JournalSheetRenderOptions} options
   * @returns {Promise<void>}
   * @protected
   */
  async _renderPageViews(context, options) {
    for ( const id of options.parts ) {
      if ( !(id in this._pages) ) continue;
      const element = this.parts[id];
      if ( !element ) {
        ui.notifications.warn(`Failed to render JournalEntryPage [${id}]. No render target.`);
        continue;
      }
      const { editable, hidden, viewClass } = this._pages[id];
      element.hidden = hidden;
      element.className = `journal-entry-page ${viewClass}`;
      const sheet = this.getPageSheet(id);
      if ( sheet.isV2 ) await this._renderPageView(element, sheet);
      else {
        /** @deprecated since v13 until v16 */
        await this._renderAppV1PageView(element, sheet);
      }
      if ( editable ) element.insertAdjacentHTML("beforeend", `
        <div class="edit-container">
          <button type="button" class="icon fa-solid fa-pen-to-square" data-tooltip="JOURNAL.EditPage" data-action="editPage"
                  aria-label="${game.i18n.localize("JOURNAL.EditPage")}"></button>
        </div>
      `);
      await this._renderHeadings(element, sheet.toc);
    }
    this._observePages();
    this._observeHeadings();
  }

  /* -------------------------------------------- */

  /**
   * Render the page view for a page sheet.
   * @param {HTMLElement} element          The existing page element in the journal entry view.
   * @param {JournalEntryPageSheet} sheet  The page sheet.
   * @returns {Promise<void>}
   * @protected
   */
  async _renderPageView(element, sheet) {
    await sheet.render({ force: true });
    sheet.element.removeAttribute("class");
    element.append(sheet.element);
  }

  /* -------------------------------------------- */

  /**
   * Update which page of the journal sheet should be currently rendered.
   * This can be controlled by options passed into the render method, or by subclass override.
   * @param {JournalSheetRenderOptions} [options]
   * @protected
   */
  _setCurrentPage(options={}) {
    let newPageId;
    options.pageChanged = ("pageIndex" in options) || ("pageId" in options);
    if ( typeof options.pageIndex === "number" ) newPageId = Object.keys(this._pages)[options.pageIndex];
    if ( options.pageId ) newPageId = options.pageId;
    if ( (newPageId != null) && (newPageId !== this.pageId) ) {
      if ( !this.isMultiple ) this.#callCloseHooks(this.pageId);
      this.#pageId = newPageId;
    }
    if ( !(this.pageId in this._pages) ) [this.#pageId] = Object.keys(this._pages);
  }

  /* -------------------------------------------- */

  /**
   * If the set of active pages has changed, various elements in the sidebar will expand and collapse. For particularly
   * long ToCs, this can leave the scroll position of the sidebar in a seemingly random state. We try to do our best to
   * sync the sidebar scroll position with the current journal viewport.
   * @protected
   */
  _synchronizeSidebar() {
    const entries = Array.from(this.#headingIntersections.values()).sort((a, b) => {
      return a.intersectionRect.y - b.intersectionRect.y;
    });
    for ( const entry of entries ) {
      const { pageId } = entry.target.closest("[data-page-id]")?.dataset ?? {};
      const anchor = entry.target.dataset.anchor;
      let toc = this.element.querySelector(`.toc [data-page-id="${pageId}"]`);
      if ( anchor ) toc = toc.querySelector(`li[data-anchor="${anchor}"]`);
      if ( toc ) {
        toc.scrollIntoView();
        break;
      }
    }
  }

  /* -------------------------------------------- */

  /**
   * Update the disabled state of the previous and next page buttons.
   * @protected
   */
  _updateButtonState() {
    if ( !this.rendered ) return;
    this.element.querySelectorAll("search :is(input, button)").forEach(el => el.disabled = false);
    const previous = this.element.querySelector('[data-action="previousPage"]');
    const next = this.element.querySelector('[data-action="nextPage"]');
    if ( !next || !previous ) return;
    if ( this.isMultiple ) {
      previous.disabled = !this.pagesInView[0]?.previousElementSibling;
      next.disabled = this.pagesInView.length && !this.pagesInView.at(-1).nextElementSibling;
    } else {
      const index = this.pageIndex;
      previous.disabled = index < 1;
      next.disabled = index >= this._pages.length - 1;
    }
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _updateFrame(options) {
    super._updateFrame(options);
    this.element.classList.toggle("expanded", this.sidebarExpanded);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _tearDown(options) {
    super._tearDown(options);
    this.#search?.unbind();
  }

  /* -------------------------------------------- */
  /*  Event Listeners & Handlers                  */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _attachFrameListeners() {
    super._attachFrameListeners();
    this.element.addEventListener("click", this._onClickImage.bind(this), { passive: true });
  }

  /* -------------------------------------------- */

  /**
   * Create an intersection observer to maintain a list of headings that are in view. This is much more performant than
   * calling getBoundingClientRect on all headings whenever we want to determine this list.
   * @protected
   */
  _observeHeadings() {
    this.#headingIntersections = new Map();
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if ( entry.isIntersecting ) this.#headingIntersections.set(entry.target, entry);
      else this.#headingIntersections.delete(entry.target);
    }), {
      root: this.element.querySelector(".journal-entry-pages"),
      threshold: 1
    });
    const headings = Array.fromRange(6, 1).map(n => `h${n}`).join(",");
    this.element.querySelectorAll(`.journal-entry-page :is(${headings})`).forEach(observer.observe, observer);
  }

  /* -------------------------------------------- */

  /**
   * Create an intersection observer to maintain a list of pages that are in view.
   * @protected
   */
  _observePages() {
    this.#pagesInView = [];
    this.#observer = new IntersectionObserver((entries, observer) => {
      this._onPageScroll(entries, observer);
      this._activatePagesInView();
      this._updateButtonState();
    }, {
      root: this.element.querySelector(".journal-entry-pages"),
      threshold: [0, .25, .5, .75, 1]
    });
    this.element.querySelectorAll(".journal-entry-page").forEach(this.#observer.observe, this.#observer);
  }

  /* -------------------------------------------- */

  /**
   * Handle clicking an image to pop it out for fullscreen view.
   * @param {PointerEvent} event  The triggering click event.
   * @protected
   */
  _onClickImage(event) {
    if ( !event.target.matches("img:not(.nopopout)") ) return;
    const target = event.target;
    const imagePage = target.closest(".journal-entry-page.image");
    const page = this.entry.pages.get(imagePage?.dataset.pageId);
    const title = page?.name ?? target.title;
    const ip = new foundry.applications.apps.ImagePopout({
      src: target.getAttribute("src"),
      caption: page?.image.caption,
      window: { title }
    });
    if ( page ) ip.shareImage = () => Journal.showDialog(page);
    ip.render({ force: true });
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onClose(options) {
    super._onClose(options);
    for ( const sheet of Object.values(this.#sheets) ) sheet.close({ animate: false });

    // Reset any temporarily-granted ownership.
    if ( !this.#tempOwnership ) return;
    this.entry.ownership = foundry.utils.deepClone(this.entry._source.ownership);
    this.entry.pages.forEach(p => p.ownership = foundry.utils.deepClone(p._source.ownership));
    this.#tempOwnership = false;
  }

  /* -------------------------------------------- */

  /**
   * Handle configuring the journal entry's categories.
   * @this {JournalEntrySheet}
   */
  static #onConfigureCategories() {
    new JournalEntryCategoryConfig({ document: this.entry }).render({ force: true });
  }

  /* -------------------------------------------- */

  /**
   * Handle closing the context menu.
   * @param {HTMLElement} target  The element the context menu has been triggered for.
   * @protected
   */
  _onContextMenuClose(target) {
    if ( this.#sidebarState.active ) target.classList.add("active");
    this.element.querySelector(".toc").scrollTop = this.#sidebarState.position;
  }

  /* -------------------------------------------- */

  /**
   * Handle opening the context menu.
   * @param {HTMLElement} target  The element the context menu has been triggered for.
   * @protected
   */
  _onContextMenuOpen(target) {
    this.#sidebarState.position = this.element.querySelector(".toc").scrollTop;
    this.#sidebarState.active = target.classList.contains("active");
    target.classList.remove("active");
  }

  /* -------------------------------------------- */

  /**
   * Handle editing one of the journal entry's pages.
   * @param {PointerEvent} event  The triggering event.
   * @param {HTMLElement} target  The action target.
   * @protected
   */
  _onEditPage(event, target) {
    const { pageId } = target.closest("[data-page-id]").dataset;
    const page = this.entry.pages.get(pageId);
    return page?.sheet.render(true);
  }

  /* -------------------------------------------- */

  /**
   * Handle clicking on a page heading.
   * @this {JournalEntrySheet}
   * @param {PointerEvent} event  The triggering event.
   * @param {HTMLElement} target  The action target.
   */
  static #onGoToHeading(event, target) {
    const { pageId } = target.closest("[data-page-id]").dataset;
    const { anchor } = target.closest("[data-anchor]")?.dataset ?? {};
    this.goToPage(pageId, { anchor });
  }

  /* -------------------------------------------- */

  /**
   * Handle new pages scrolling into view.
   * @param {IntersectionObserverEntry[]} entries  An array of element that have scrolled into or out of view.
   * @param {IntersectionObserver} observer        The IntersectionObserver that invoked this callback.
   * @protected
   */
  _onPageScroll(entries, observer) {
    if ( !entries.length ) return;

    // This has been triggered by an old IntersectionObserver from the previous render and is no longer relevant.
    if ( observer !== this.observer ) return;

    // Case 1 - We are in single page mode.
    if ( !this.isMultiple ) {
      const entry = entries[0]; // There can be only one entry in single page mode.
      if ( entry.isIntersecting ) this.#pagesInView = [entry.target];
      return;
    }

    const minRatio = JournalEntrySheet.#INTERSECTION_RATIO;
    const intersecting = entries
      .filter(entry => entry.isIntersecting && (entry.intersectionRatio >= minRatio))
      .sort((a, b) => a.intersectionRect.y - b.intersectionRect.y);

    // Special case where the page is so large that any portion of visible content is less than 25% of the whole page.
    if ( !intersecting.length ) {
      const isIntersecting = entries.find(entry => entry.isIntersecting);
      if ( isIntersecting ) intersecting.push(isIntersecting);
    }

    // Case 2 - We are in multiple page mode and this is the first render.
    if ( !this.pagesInView.length ) {
      this.#pagesInView = intersecting.map(entry => entry.target);
      return;
    }

    // Case 3 - The user is scrolling normally through pages in multiple page mode.
    const byTarget = new Map(entries.map(entry => [entry.target, entry]));
    const inView = new Set(this.pagesInView);

    // Remove pages that have scrolled out of view.
    for ( const el of this.pagesInView ) {
      const entry = byTarget.get(el);
      if ( entry && (entry.intersectionRatio < minRatio) ) inView.delete(el);
    }

    // Add pages that have scrolled into view.
    for ( const entry of intersecting ) inView.add(entry.target);

    this.#pagesInView = Array.from(inView).sort((a, b) => {
      const pageA = this.entry.pages.get(a.dataset.pageId);
      const pageB = this.entry.pages.get(b.dataset.pageId);
      return pageA.sort - pageB.sort;
    });
  }

  /* -------------------------------------------- */

  /** @override */
  _onRevealSecret(event) {
    const { pageId } = event.target.closest("[data-page-id]")?.dataset ?? {};
    const page = this.document.pages.get(pageId);
    if ( !page ) return;
    const content = page.text.content;
    const modified = event.target.toggleRevealed(content);
    page.update({ "text.content": modified });
  }

  /* -------------------------------------------- */

  /**
   * Handle journal entry search and filtering.
   * @param {KeyboardEvent} event  The keyboard input event.
   * @param {string} query         The input search string.
   * @param {RegExp} rgx           The regular expression query that should be matched against.
   * @param {HTMLElement} html     The container to filter items from.
   * @protected
   */
  _onSearchFilter(event, query, rgx, html) {
    this.#filteredPages.clear();
    const nameOnlySearch = this.searchMode === CONST.DIRECTORY_SEARCH_MODES.NAME;

    // Match pages
    let results = [];
    if ( !nameOnlySearch ) results = this.entry.pages.search({ query });
    for ( const el of html.querySelectorAll("[data-page-id]") ) {
      const page = this.entry.pages.get(el.dataset.pageId);
      let match = !query;
      if ( !match && nameOnlySearch ) match = foundry.applications.ux.SearchFilter.testQuery(rgx, page.name);
      else if ( !match ) match = results.find(r => r._id === page.id);
      if ( match ) this.#filteredPages.add(page.id);
      el.hidden = !match;
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle a request to show the JournalEntry to other Users.
   * @protected
   */
  _onShowPlayers() {
    Journal.showDialog(this.entry);
  }

  /* -------------------------------------------- */

  /**
   * Handle toggling the lock mode.
   * @this {JournalEntrySheet}
   */
  static #onToggleLock() {
    this.entry.setFlag("core", "locked", !this.locked);
  }

  /* -------------------------------------------- */

  /**
   * Handle toggling the view mode.
   * @this {JournalEntrySheet}
   */
  static #onToggleMode() {
    const { MULTIPLE, SINGLE } = this.constructor.VIEW_MODES;
    return this.render({ mode: this.isMultiple ? SINGLE : MULTIPLE });
  }

  /* -------------------------------------------- */
  /*  Public API                                  */
  /* -------------------------------------------- */

  /**
   * Prompt the user with a Dialog for creation of a new JournalEntryPage.
   */
  createPageDialog() {
    const { bottom, left } = this.element.getBoundingClientRect();
    const sort = (Object.values(this._pages).at(-1)?.sort ?? 0) + CONST.SORT_INTEGER_DENSITY;
    const categories = [
      { value: "", label: "JOURNAL.Uncategorized", rule: true },
      ...this.document.categories.map(cat => {
        return { ...cat, label: cat.name, value: cat.id };
      }).sort(this.document.constructor.sortCategories)
    ];
    return JournalEntryPage.implementation.createDialog({ sort }, { parent: this.entry }, {
      template: "templates/journal/pages/create-dialog.hbs",
      context: {
        categories: {
          options: categories,
          show: this.document.categories.size
        },
        fields: {
          category: new StringField({ label: "JOURNALENTRYPAGE.Category" }, { name: "category" }),
          name: new StringField({ required: true, blank: false, label: "Name" }, { name: "name" }),
          type: new StringField({ required: true, blank: false, label: "Type" }, { name: "type" })
        }
      },
      position: {
        width: 320,
        top: bottom - 200,
        left: left + 10
      }
    });
  }

  /* -------------------------------------------- */

  /**
   * Retrieve the sheet instance for rendering this page inline.
   * @param {JournalEntryPage|string} page  The page instance or its ID.
   * @returns {JournalPageSheet}
   */
  getPageSheet(page) {
    if ( typeof page === "string" ) page = this.entry.pages.get(page);
    const sheetClass = page._getSheetClass();
    let sheet = this.#sheets[page.id];
    if ( sheet?.constructor !== sheetClass ) {
      if ( sheetClass.isV2 ) sheet = new sheetClass({
        id: "{id}-view",
        tag: "div",
        document: page,
        mode: "view",
        window: {
          frame: false,
          positioned: false
        }
      });
      else {
        /** @deprecated since v13 until v16. */
        sheet = new sheetClass(page, { editable: false });
      }
      this.#sheets[page.id] = sheet;
    }
    return sheet;
  }

  /* -------------------------------------------- */

  /**
   * Turn to a specific page.
   * @param {string} pageId            The ID of the page to turn to.
   * @param {object} [options]
   * @param {string} [options.anchor]  Optionally an anchor slug to focus within that page.
   */
  goToPage(pageId, { anchor }={}) {
    if ( !this.isMultiple && (pageId !== this.pageId) ) return this.render({ pageId, anchor });
    const page = this.element.querySelector(`.journal-entry-page[data-page-id="${pageId}"]`);
    if ( anchor ) {
      const { element } = this.getPageSheet(pageId)?.toc[anchor] ?? {};
      if ( element ) {
        element.scrollIntoView();
        return;
      }
    }
    page?.scrollIntoView();
  }

  /* -------------------------------------------- */

  /**
   * Determine whether a given page is visible to the current user.
   * @param {JournalEntryPage} page  The page.
   * @returns {boolean}
   */
  isPageVisible(page) {
    const sheet = this.getPageSheet(page);
    return sheet.isVisible ?? sheet._canUserView(game.user);
  }

  /* -------------------------------------------- */

  /**
   * Turn to the next page.
   */
  nextPage() {
    if ( !this.isMultiple ) return this.render({ pageIndex: this.pageIndex + 1 });
    if ( this.pagesInView.length ) this.pagesInView.at(-1).nextElementSibling?.scrollIntoView();
    else this.element.querySelector(".journal-entry-page")?.scrollIntoView();
  }

  /* -------------------------------------------- */

  /**
   * Turn to the previous page.
   */
  previousPage() {
    if ( !this.isMultiple ) return this.render({ pageIndex: this.pageIndex - 1 });
    this.pagesInView[0]?.previousElementSibling?.scrollIntoView();
  }

  /* -------------------------------------------- */

  /**
   * Toggle the search mode for this journal entry between name and full text search.
   */
  toggleSearchMode() {
    const { FULL, NAME } = CONST.DIRECTORY_SEARCH_MODES;
    this.#searchMode = this.searchMode === NAME ? FULL : NAME;
    return this.render({ parts: ["sidebar"] });
  }

  /* -------------------------------------------- */

  /**
   * Toggle the collapsed or expanded state of the sidebar.
   */
  toggleSidebar() {
    const sidebar = this.element.querySelector(".sidebar");
    const button = sidebar.querySelector(".collapse-toggle");
    this.#sidebarState.expanded = !this.sidebarExpanded;

    // Disable application interaction temporarily.
    this.element.style.pointerEvents = "none";

    // Remove min-width temporarily.
    const minWidth = this.element.style.minWidth || "";
    this.element.style.minWidth = "unset";

    // Configure CSS transitions.
    this.element.classList.add("collapsing");
    this._awaitTransition(this.element, 1000).then(() => {
      this.element.style.pointerEvents = "";
      this.element.style.minWidth = minWidth;
      this.element.classList.remove("collapsing");
    });

    // Determine the configured sidebar widths.
    const style = getComputedStyle(sidebar);
    const expandedWidth = Number(style.getPropertyValue("--sidebar-width-expanded").trim().replace("px", ""));
    const collapsedWidth = Number(style.getPropertyValue("--sidebar-width-collapsed").trim().replace("px", ""));
    const delta = expandedWidth - collapsedWidth;

    // Adjust application size.
    this.setPosition({
      left: this.position.left + (this.sidebarExpanded ? -delta : delta),
      width: this.position.width + (this.sidebarExpanded ? delta : -delta)
    });

    // Toggle display of the sidebar.
    this.element.classList.toggle("expanded", this.sidebarExpanded);

    // Update icons and labels.
    button.dataset.tooltip = this.sidebarExpanded ? "JOURNAL.ViewCollapse" : "JOURNAL.ViewExpand";
    button.ariaLabel = game.i18n.localize(button.dataset.tooltip);
    button.classList.toggle("fa-caret-left", !this.sidebarExpanded);
    button.classList.toggle("fa-caret-right", this.sidebarExpanded);
    game.tooltip.deactivate();
  }

  /* -------------------------------------------- */
  /*  Drag & Drop                                 */
  /* -------------------------------------------- */

  /**
   * Determine if drop operations are permitted.
   * @param {string} selector       The candidate HTML selector for dragging
   * @returns {boolean}             Can the current user drag this selector?
   * @protected
   */
  _canDragDrop(selector) {
    return this.isEditable;
  }

  /* -------------------------------------------- */

  /**
   * Determine if drag operations are permitted.
   * @param {string} selector       The candidate HTML selector for dragging
   * @returns {boolean}             Can the current user drag this selector?
   * @protected
   */
  _canDragStart(selector) {
    return this.entry.testUserPermission(game.user, "OBSERVER");
  }

  /* -------------------------------------------- */

  /**
   * Handle drag operations.
   * @param {DragEvent} event
   * @protected
   */
  _onDragStart(event) {
    ui.context?.close({ animate: false });
    const target = event.currentTarget;
    const { pageId } = target.closest("[data-page-id]").dataset;
    const { anchor } = target.closest("[data-anchor]")?.dataset ?? {};
    const page = this.entry.pages.get(pageId);
    const dragData = {
      ...page.toDragData(),
      anchor: { slug: anchor, name: target.innerText }
    };
    event.dataTransfer.setData("text/plain", JSON.stringify(dragData));
  }

  /* -------------------------------------------- */

  /**
   * Handle drop operations.
   * @param {DragEvent} event
   * @protected
   */
  async _onDrop(event) {
    // Retrieve the dropped Journal Entry Page.
    const data = TextEditor.implementation.getDragEventData(event);
    const page = await JournalEntryPage.implementation.fromDropData(data);
    if ( !page ) return;

    // Determine the target that was dropped.
    const target = event.target.closest("[data-page-id]");
    const sortTarget = target ? this.entry.pages.get(target?.dataset.pageId) : null;

    // Prevent dropping a page onto itself.
    if ( page === sortTarget ) return;

    // Case 1 - Sort Pages
    if ( page.parent === this.entry ) {
      if ( this.locked ) return;
      return page.sortRelative({
        sortKey: "sort",
        target: sortTarget,
        siblings: this.entry.pages.filter(p => p.id !== page.id)
      });
    }

    // Case 2 - Create Pages
    const pageData = page.toObject();
    if ( this.entry.pages.has(page.id) ) delete pageData._id;
    pageData.sort = sortTarget ? sortTarget.sort : this.entry.pages.reduce((max, p) => {
      return p.sort > max ? p.sort : max;
    }, -CONST.SORT_INTEGER_DENSITY);
    pageData.sort += CONST.SORT_INTEGER_DENSITY;
    return JournalEntryPage.implementation.create(pageData, { parent: this.entry, keepId: true });
  }

  /* -------------------------------------------- */
  /*  Private API                                 */
  /* -------------------------------------------- */

  /**
   * Call close hooks for individual pages.
   * @param {string} [pageId]  Calls the hook for the given page only, otherwise calls hooks for all pages.
   */
  #callCloseHooks(pageId) {
    if ( foundry.utils.isEmpty(this._pages) ) return;
    const pages = pageId ? [this._pages[pageId]] : Object.values(this._pages);
    for ( const page of pages ) {
      const sheet = this.getPageSheet(page.id);
      if ( sheet.isV2 ) sheet._doEvent(sheet._onCloseView, { eventName: "closeView", hookName: "closeView" });
      else {
        sheet._callHooks("close", sheet.element);
        sheet._closeView?.();
      }
    }
  }

  /* -------------------------------------------- */
  /*  Deprecations                                */
  /* -------------------------------------------- */

  /**
   * @deprecated since v13 until v16.
   * @ignore
   */
  async _renderAppV1PageView(element, sheet) {
    const data = await sheet.getData();
    const view = await sheet._renderInner(data);
    element.replaceChildren(...view.get());
    sheet._activateCoreListeners(view.parent());
    sheet.activateListeners(view);
    sheet._callHooks("render", view, data);
  }
}

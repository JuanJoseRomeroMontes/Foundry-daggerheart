import DocumentSheet from "../api/document-sheet-v1.mjs";
import Journal from "../../documents/collections/journal.mjs";
import JournalEntryPage from "../../documents/journal-entry-page.mjs";
import TextEditor from "../../applications/ux/text-editor.mjs";
import {DIRECTORY_SEARCH_MODES, DOCUMENT_OWNERSHIP_LEVELS, SORT_INTEGER_DENSITY} from "@common/constants.mjs";

/**
 * @import {JournalPageSheet} from "./journal-page-sheet.mjs";
 * @import {ApplicationV1Options} from "../api/application-v1.mjs";
 * @import {DocumentSheetV1Options} from "../api/document-sheet-v1.mjs";
 */

/**
 * @typedef JournalSheetOptions
 * @property {string|null} [sheetMode]  The current display mode of the journal. Either 'text' or 'image'.
 */

/**
 * The Application responsible for displaying and editing a single JournalEntry document.
 * @deprecated since v13
 * @param {JournalEntry} object            The JournalEntry instance which is being edited
 * @param {JournalSheetOptions & DocumentSheetV1Options & ApplicationV1Options} [options] Application options
 */
export default class JournalSheet extends DocumentSheet {

  /**
   * @override
   * @returns {JournalSheetOptions & DocumentSheetV1Options & ApplicationV1Options}
   */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["sheet", "journal-sheet", "journal-entry"],
      template: "templates/journal/sheet.html",
      width: 960,
      height: 800,
      resizable: true,
      submitOnChange: true,
      submitOnClose: true,
      closeOnSubmit: false,
      viewPermission: DOCUMENT_OWNERSHIP_LEVELS.NONE,
      scrollY: [".scrollable"],
      filters: [{inputSelector: 'input[name="search"]', contentSelector: ".directory-list"}],
      dragDrop: [{dragSelector: ".directory-item, .heading-link", dropSelector: ".directory-list"}],
      pageIndex: undefined,
      pageId: undefined
    });
  }

  /* -------------------------------------------- */

  /**
   * The cached list of processed page entries.
   * This array is populated in the getData method.
   * @type {object[]}
   * @protected
   */
  _pages;

  /**
   * Track which page IDs are currently displayed due to a search filter
   * @type {Set<string>}
   */
  #filteredPages = new Set();

  /**
   * The pages that are currently scrolled into view and marked as 'active' in the sidebar.
   * @type {HTMLElement[]}
   */
  #pagesInView = [];

  /**
   * The index of the currently viewed page.
   * @type {number}
   */
  #pageIndex = 0;

  /**
   * Has the player been granted temporary ownership of this journal entry or its pages?
   * @type {boolean}
   */
  #tempOwnership = false;

  /**
   * A mapping of page IDs to {@link foundry.appv1.sheets.JournalPageSheet} instances used for rendering
   * the pages inside the journal entry.
   * @type {Record<string, JournalPageSheet>}
   */
  #sheets = {};

  /**
   * Store a flag to restore ToC positions after a render.
   * @type {boolean}
   */
  #restoreTOCPositions = false;

  /**
   * Store transient sidebar state so it can be restored after context menus are closed.
   * @type {{position: number, active: boolean, collapsed: boolean}}
   */
  #sidebarState = {collapsed: false};

  /**
   * Store a reference to the currently active IntersectionObserver.
   * @type {IntersectionObserver}
   */
  #observer;

  /**
   * Store a special set of heading intersections so that we can quickly compute the top-most heading in the viewport.
   * @type {Map<HTMLHeadingElement, IntersectionObserverEntry>}
   */
  #headingIntersections = new Map();

  /**
   * Store the journal entry's current view mode.
   * @type {number|null}
   */
  #mode = null;

  /* -------------------------------------------- */

  /**
   * Get the journal entry's current view mode.
   * @see {@link JournalSheet.VIEW_MODES}
   * @returns {number}
   */
  get mode() {
    return this.#mode ?? this.document.getFlag("core", "viewMode") ?? this.constructor.VIEW_MODES.SINGLE;
  }

  /* -------------------------------------------- */

  /**
   * The current search mode for this journal
   * @type {string}
   */
  get searchMode() {
    return this.document.getFlag("core", "searchMode") || DIRECTORY_SEARCH_MODES.NAME;
  }

  /**
   * Toggle the search mode for this journal between "name" and "full" text search
   */
  toggleSearchMode() {
    const updatedSearchMode = this.document.getFlag("core", "searchMode") === DIRECTORY_SEARCH_MODES.NAME
      ? DIRECTORY_SEARCH_MODES.FULL : DIRECTORY_SEARCH_MODES.NAME;
    this.document.setFlag("core", "searchMode", updatedSearchMode);
  }

  /* -------------------------------------------- */

  /**
   * The pages that are currently scrolled into view and marked as 'active' in the sidebar.
   * @type {HTMLElement[]}
   */
  get pagesInView() {
    return this.#pagesInView;
  }

  /* -------------------------------------------- */

  /**
   * The index of the currently viewed page.
   * @type {number}
   */
  get pageIndex() {
    return this.#pageIndex;
  }

  /* -------------------------------------------- */

  /**
   * The currently active IntersectionObserver.
   * @type {IntersectionObserver}
   */
  get observer() {
    return this.#observer;
  }

  /* -------------------------------------------- */

  /**
   * Is the table-of-contents sidebar currently collapsed?
   * @type {boolean}
   */
  get sidebarCollapsed() {
    return this.#sidebarState.collapsed;
  }

  /* -------------------------------------------- */

  /**
   * Available view modes for journal entries.
   * @enum {number}
   */
  static VIEW_MODES = {
    SINGLE: 1,
    MULTIPLE: 2
  };

  /* -------------------------------------------- */

  /**
   * The minimum amount of content that must be visible before the next page is marked as in view. Cannot be less than
   * 25% without also modifying the IntersectionObserver threshold.
   * @type {number}
   */
  static INTERSECTION_RATIO = .25;

  /* -------------------------------------------- */

  /**
   * Icons for page ownership.
   * @enum {string}
   */
  static OWNERSHIP_ICONS = {
    [DOCUMENT_OWNERSHIP_LEVELS.NONE]: "fa-solid fa-eye-slash",
    [DOCUMENT_OWNERSHIP_LEVELS.OBSERVER]: "fa-solid fa-eye",
    [DOCUMENT_OWNERSHIP_LEVELS.OWNER]: "fa-solid fa-feather-pointed"
  };

  /* -------------------------------------------- */

  /** @inheritdoc */
  get title() {
    const folder = game.folders.get(this.object.folder?.id);
    const name = `${folder ? `${folder.name}: ` : ""}${this.object.name}`;
    return this.object.permission ? name : "";
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _getHeaderButtons() {
    const buttons = super._getHeaderButtons();
    // Share Entry
    if ( game.user.isGM ) {
      buttons.unshift({
        label: "JOURNAL.ActionShow",
        class: "share-image",
        icon: "fa-solid fa-eye",
        onclick: ev => this._onShowPlayers(ev)
      });
    }
    return buttons;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  getData(options={}) {
    const context = super.getData(options);
    context.mode = this.mode;
    context.toc = this._pages = this._getPageData();
    this._getCurrentPage(options);
    context.viewMode = {};

    // Viewing single page
    if ( this.mode === this.constructor.VIEW_MODES.SINGLE ) {
      context.pages = [context.toc[this.pageIndex]];
      context.viewMode = {label: "JOURNAL.ViewMultiple", icon: "fa-solid fa-note", cls: "single-page"};
    }

    // Viewing multiple pages
    else {
      context.pages = context.toc;
      context.viewMode = {label: "JOURNAL.ViewSingle", icon: "fa-solid fa-notes", cls: "multi-page"};
    }

    // Sidebar collapsed mode
    context.sidebarClass = this.sidebarCollapsed ? "collapsed" : "";
    context.collapseMode = this.sidebarCollapsed
      ? {label: "JOURNAL.ViewExpand", icon: "fa-solid fa-caret-left"}
      : {label: "JOURNAL.ViewCollapse", icon: "fa-solid fa-caret-right"};

    // Search mode
    context.searchIcon = this.searchMode === DIRECTORY_SEARCH_MODES.NAME ? "fa-search"
      : "fa-file-magnifying-glass";
    context.searchTooltip = this.searchMode === DIRECTORY_SEARCH_MODES.NAME ? "SIDEBAR.SearchModeName"
      : "SIDEBAR.SearchModeFull";
    return context;
  }

  /* -------------------------------------------- */

  /**
   * Prepare pages for display.
   * @returns {JournalEntryPage[]}  The sorted list of pages.
   * @protected
   */
  _getPageData() {
    const hasFilterQuery = !!this._searchFilters[0].query;
    return this.object.pages.contents.sort((a, b) => a.sort - b.sort).reduce((arr, page) => {
      if ( !this.isPageVisible(page) ) return arr;
      const p = page.toObject();
      const sheet = this.getPageSheet(page.id);

      // Page CSS classes
      const cssClasses = [p.type, `level${p.title.level}`];
      if ( hasFilterQuery && !this.#filteredPages.has(page.id) ) cssClasses.push("hidden");
      p.tocClass = p.cssClass = cssClasses.join(" ");
      cssClasses.push(...(sheet.options.viewClasses || []));
      p.viewClass = cssClasses.join(" ");

      // Other page data
      p.editable = page.isOwner;
      if ( page.parent.pack ) p.editable &&= !game.packs.get(page.parent.pack)?.locked;
      p.number = arr.length;
      p.icon = this.constructor.OWNERSHIP_ICONS[page.ownership.default];
      const levels = Object.entries(DOCUMENT_OWNERSHIP_LEVELS);
      const [ownership] = levels.find(([, level]) => level === page.ownership.default);
      p.ownershipCls = ownership.toLowerCase();
      arr.push(p);
      return arr;
    }, []);
  }

  /* -------------------------------------------- */

  /**
   * Identify which page of the journal sheet should be currently rendered.
   * This can be controlled by options passed into the render method or by a subclass override.
   * @param {object} options    Sheet rendering options
   * @param {number} [options.pageIndex]    A numbered index of page to render
   * @param {string} [options.pageId]       The ID of a page to render
   * @returns {number}      The currently displayed page index
   * @protected
   */
  _getCurrentPage({pageIndex, pageId}={}) {
    let newPageIndex;
    if ( typeof pageIndex === "number" ) newPageIndex = pageIndex;
    if ( pageId ) newPageIndex = this._pages.findIndex(p => p._id === pageId);
    if ( (newPageIndex !== undefined) && (newPageIndex !== this.pageIndex) ) {
      if ( this.mode === this.constructor.VIEW_MODES.SINGLE ) this.#callCloseHooks(this.pageIndex);
      this.#pageIndex = newPageIndex;
    }
    this.options.pageIndex = this.options.pageId = undefined;
    return this.#pageIndex = Math.clamp(this.pageIndex, 0, this._pages.length - 1);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  activateListeners(html) {
    super.activateListeners(html);
    html.on("click", "img:not(.nopopout)", this._onClickImage.bind(this));
    html.find("button[data-action], a[data-action]").click(this._onAction.bind(this));
    this._contextMenu(html);
  }

  /* -------------------------------------------- */

  /**
   * Activate listeners after page content has been injected.
   * @protected
   */
  _activatePageListeners() {
    const html = this.element;
    html.find(".editor-edit").click(this._onEditPage.bind(this));
    html.find(".page-heading").click(this._onClickPageLink.bind(this));
  }

  /* -------------------------------------------- */

  /**
   * @param {boolean} [force]
   * @param {object} [options]
   * @param {number} [options.mode]       Render the sheet in a given view mode, see {@link JournalSheet.VIEW_MODES}.
   * @param {string} [options.pageId]     Render the sheet with the page with the given ID in view.
   * @param {number} [options.pageIndex]  Render the sheet with the page at the given index in view.
   * @param {string} [options.anchor]     Render the sheet with the given anchor for the given page in view.
   * @param {boolean} [options.tempOwnership]  Whether the journal entry or one of its pages is being shown to players
   *                                           who might otherwise not have permission to view it.
   * @param {boolean} [options.collapsed] Render the sheet with the TOC sidebar collapsed?
   * @override
   */
  async _render(force, options={}) {

    // Temporary override of ownership
    if ( "tempOwnership" in options ) this.#tempOwnership = options.tempOwnership;

    // Override the view mode
    const modeChange = ("mode" in options) && (options.mode !== this.mode);
    if ( modeChange ) {
      if ( this.mode === this.constructor.VIEW_MODES.MULTIPLE ) this.#callCloseHooks();
      this.#mode = options.mode;
    }
    if ( "collapsed" in options ) this.#sidebarState.collapsed = options.collapsed;

    // Render the application
    await super._render(force, options);
    if ( !this.rendered ) return;
    await this._renderPageViews();
    this._activatePageListeners();

    // Re-sync the TOC scroll position to the new view
    const pageChange = ("pageIndex" in options) || ("pageId" in options);
    if ( modeChange || pageChange ) {
      const pageId = this._pages[this.pageIndex]?._id;
      if ( this.mode === this.constructor.VIEW_MODES.MULTIPLE ) this.goToPage(pageId, options.anchor);
      else if ( options.anchor ) {
        this.getPageSheet(pageId)?.toc[options.anchor]?.element?.scrollIntoView();
        this.#restoreTOCPositions = true;
      }
    }
    else this._restoreScrollPositions(this.element);
  }

  /* -------------------------------------------- */

  /**
   * Update child views inside the main sheet.
   * @returns {Promise<void>}
   * @protected
   */
  async _renderPageViews() {
    for ( const pageNode of this.element[0].querySelectorAll(".journal-entry-page") ) {
      const id = pageNode.dataset.pageId;
      if ( !id ) continue;
      const edit = pageNode.querySelector(":scope > .edit-container");
      const sheet = this.getPageSheet(id);
      if ( sheet.isV2 ) {
        await this._renderPageView(pageNode, sheet);
        new foundry.applications.ux.HTMLSecret({
          parentSelector: "section.journal-page-content",
          callbacks: {
            content: () => sheet.document.text.content,
            update: (secret, content) => sheet.document.update({ "text.content": content })
          }
        }).bind(pageNode);
      }
      else await this._renderAppV1PageView(pageNode, sheet);
      if ( edit ) pageNode.appendChild(edit);
      await this._renderHeadings(pageNode, sheet.toc);
    }
    this._observePages();
    this._observeHeadings();
  }

  /* -------------------------------------------- */

  /**
   * Render the page view for an app v1 page sheet.
   * @param {HTMLElement} element     The existing page element in the journal entry view.
   * @param {JournalPageSheet} sheet  The page sheet.
   * @returns {Promise<void>}
   * @protected
   */
  async _renderAppV1PageView(element, sheet) {
    const data = await sheet.getData();
    const view = await sheet._renderInner(data);
    element.replaceChildren(...view.get());
    sheet._activateCoreListeners(view.parent());
    sheet.activateListeners(view);
    sheet._callHooks("render", view, data);
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
    element.replaceChildren(...sheet.element.children);
  }

  /**
   * Call close hooks for individual pages.
   * @param {number} [pageIndex]  Calls the hook for this page only, otherwise calls for all pages.
   */
  #callCloseHooks(pageIndex) {
    if ( !this._pages?.length || (pageIndex < 0) ) return;
    const pages = pageIndex !== undefined ? [this._pages[pageIndex]] : this._pages;
    for ( const page of pages ) {
      const sheet = this.getPageSheet(page._id);
      if ( sheet.isV2 ) sheet._doEvent?.(sheet._onCloseView, { eventName: "closeView", hookName: "closeView" });
      else {
        sheet._callHooks("close", sheet.element);
        sheet._closeView?.();
      }
    }
  }

  /* -------------------------------------------- */

  /**
   * Add headings to the table of contents for the given page node.
   * @param {HTMLElement} pageNode                         The HTML node of the page's rendered contents.
   * @param {Record<string, JournalEntryPageHeading>} toc  The page's table of contents.
   * @protected
   */
  async _renderHeadings(pageNode, toc) {
    const pageId = pageNode.dataset.pageId;
    const page = this.object.pages.get(pageId);
    const tocNode = this.element[0].querySelector(`.directory-item[data-page-id="${pageId}"]`);
    if ( !tocNode || !toc ) return;
    const headings = Object.values(toc);
    headings.sort((a, b) => a.order - b.order);
    if ( page.title.show ) headings.shift();
    const minLevel = Math.min(...headings.map(node => node.level));
    tocNode.querySelector(":scope > ol")?.remove();
    const tocHTML = await foundry.applications.handlebars.renderTemplate("templates/journal/journal-page-toc.html", {
      headings: headings.reduce((arr, {text, level, slug, element}) => {
        if ( element ) element.dataset.anchor = slug;
        if ( level < minLevel + 2 ) arr.push({text, slug, level: level - minLevel + 2});
        return arr;
      }, [])
    });
    tocNode.innerHTML += tocHTML;
    tocNode.querySelectorAll(".heading-link").forEach(el =>
      el.addEventListener("click", this._onClickPageLink.bind(this)));
    this._dragDrop.forEach(d => d.bind(tocNode));
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
      root: this.element.find(".journal-entry-pages .scrollable")[0],
      threshold: [0, .25, .5, .75, 1]
    });
    this.element.find(".journal-entry-page").each((i, el) => this.#observer.observe(el));
  }

  /* -------------------------------------------- */

  /**
   * Create an intersection observer to maintain a list of headings that are in view. This is much more performant than
   * calling getBoundingClientRect on all headings whenever we want to determine this list.
   * @protected
   */
  _observeHeadings() {
    const element = this.element[0];
    this.#headingIntersections = new Map();
    const headingObserver = new IntersectionObserver(entries => entries.forEach(entry => {
      if ( entry.isIntersecting ) this.#headingIntersections.set(entry.target, entry);
      else this.#headingIntersections.delete(entry.target);
    }), {
      root: element.querySelector(".journal-entry-pages .scrollable"),
      threshold: 1
    });
    const headings = Array.fromRange(6, 1).map(n => `h${n}`).join(",");
    element.querySelectorAll(`.journal-entry-page :is(${headings})`).forEach(el => headingObserver.observe(el));
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async close(options={}) {
    for ( const sheet of Object.values(this.#sheets) ) {
      // noinspection ES6MissingAwait
      sheet.close({animate: false});
    }

    // Reset any temporarily-granted ownership.
    if ( this.#tempOwnership ) {
      this.object.ownership = foundry.utils.deepClone(this.object._source.ownership);
      this.object.pages.forEach(p => p.ownership = foundry.utils.deepClone(p._source.ownership));
      this.#tempOwnership = false;
    }
    return super.close(options);
  }

  /* -------------------------------------------- */

  /**
   * Handle clicking the previous and next page buttons.
   * @param {JQuery.TriggeredEvent} event  The button click event.
   * @protected
   */
  _onAction(event) {
    event.preventDefault();
    const button = event.currentTarget;
    const action = button.dataset.action;
    switch (action) {
      case "previous":
        return this.previousPage();
      case "next":
        return this.nextPage();
      case "createPage":
        return this.createPage();
      case "toggleView": {
        const MODES = this.constructor.VIEW_MODES;
        const mode = this.mode === MODES.SINGLE ? MODES.MULTIPLE : MODES.SINGLE;
        this.#mode = mode;
        return this.render(true, {mode});
      }
      case "toggleCollapse":
        return this.toggleSidebar(event);
      case "toggleSearch":
        this.toggleSearchMode();
        return this.render();
    }
  }

  /* -------------------------------------------- */

  /**
   * Prompt the user with a Dialog for creation of a new JournalEntryPage
   */
  createPage() {
    const bounds = this.element[0].getBoundingClientRect();
    const options = { position: {width: 320, top: bounds.bottom - 200, left: bounds.left + 10} };
    const sort = (this._pages.at(-1)?.sort ?? 0) + SORT_INTEGER_DENSITY;
    return JournalEntryPage.implementation.createDialog({sort}, {parent: this.object}, options);
  }

  /* -------------------------------------------- */

  /**
   * Turn to the previous page.
   */
  previousPage() {
    if ( this.mode === this.constructor.VIEW_MODES.SINGLE ) return this.render(true, {pageIndex: this.pageIndex - 1});
    this.pagesInView[0]?.previousElementSibling?.scrollIntoView();
  }

  /* -------------------------------------------- */

  /**
   * Turn to the next page.
   */
  nextPage() {
    if ( this.mode === this.constructor.VIEW_MODES.SINGLE ) return this.render(true, {pageIndex: this.pageIndex + 1});
    if ( this.pagesInView.length ) this.pagesInView.at(-1).nextElementSibling?.scrollIntoView();
    else this.element[0].querySelector(".journal-entry-page")?.scrollIntoView();
  }

  /* -------------------------------------------- */

  /**
   * Turn to a specific page.
   * @param {string} pageId    The ID of the page to turn to.
   * @param {string} [anchor]  Optionally an anchor slug to focus within that page.
   */
  goToPage(pageId, anchor) {
    if ( this.mode === this.constructor.VIEW_MODES.SINGLE ) {
      const currentPageId = this._pages[this.pageIndex]?._id;
      if ( currentPageId !== pageId ) return this.render(true, {pageId, anchor});
    }
    const page = this.element[0].querySelector(`.journal-entry-page[data-page-id="${pageId}"]`);
    if ( anchor ) {
      const element = this.getPageSheet(pageId)?.toc[anchor]?.element;
      if ( element ) {
        element.scrollIntoView();
        return;
      }
    }
    page?.scrollIntoView();
  }

  /* -------------------------------------------- */

  /**
   * Retrieve the sheet instance for rendering this page inline.
   * @param {string} pageId  The ID of the page.
   * @returns {JournalPageSheet}
   */
  getPageSheet(pageId) {
    const page = this.object.pages.get(pageId);
    const sheetClass = page._getSheetClass();
    let sheet = this.#sheets[pageId];
    if ( sheet?.constructor !== sheetClass ) {
      if ( sheetClass.isV2 ) sheet = new sheetClass({
        document: page,
        mode: "view",
        window: {
          frame: false,
          positioned: false
        }
      });
      else sheet = new sheetClass(page, {editable: false});
      this.#sheets[pageId] = sheet;
    }
    return sheet;
  }

  /* -------------------------------------------- */

  /**
   * Determine whether a page is visible to the current user.
   * @param {JournalEntryPage} page  The page.
   * @returns {boolean}
   */
  isPageVisible(page) {
    const sheet = this.getPageSheet(page.id);
    return sheet.isVisible ?? sheet._canUserView(game.user);
  }

  /* -------------------------------------------- */

  /**
   * Toggle the collapsed or expanded state of the Journal Entry table-of-contents sidebar.
   */
  toggleSidebar() {
    const app = this.element[0];
    const sidebar = app.querySelector(".sidebar");
    const button = sidebar.querySelector(".collapse-toggle");
    this.#sidebarState.collapsed = !this.sidebarCollapsed;

    // Disable application interaction temporarily
    app.style.pointerEvents = "none";

    // Configure CSS transitions for the application window
    app.classList.add("collapsing");
    app.addEventListener("transitionend", () => {
      app.style.pointerEvents = "";
      app.classList.remove("collapsing");
    }, {once: true});

    // Learn the configure sidebar widths
    const style = getComputedStyle(sidebar);
    const expandedWidth = Number(style.getPropertyValue("--sidebar-width-expanded").trim().replace("px", ""));
    const collapsedWidth = Number(style.getPropertyValue("--sidebar-width-collapsed").trim().replace("px", ""));

    // Change application position
    const delta = expandedWidth - collapsedWidth;
    this.setPosition({
      left: this.position.left + (this.sidebarCollapsed ? delta : -delta),
      width: this.position.width + (this.sidebarCollapsed ? -delta : delta)
    });

    // Toggle display of the sidebar
    sidebar.classList.toggle("collapsed", this.sidebarCollapsed);

    // Update icons and labels
    button.dataset.tooltip = this.sidebarCollapsed ? "JOURNAL.ViewExpand" : "JOURNAL.ViewCollapse";
    const i = button.children[0];
    i.setAttribute("class", `fa-solid ${this.sidebarCollapsed ? "fa-caret-left" : "fa-caret-right"}`);
    game.tooltip.deactivate();
  }

  /* -------------------------------------------- */

  /**
   * Update the disabled state of the previous and next page buttons.
   * @protected
   */
  _updateButtonState() {
    if ( !this.element?.length ) return;
    const previous = this.element[0].querySelector('[data-action="previous"]');
    const next = this.element[0].querySelector('[data-action="next"]');
    if ( !next || !previous ) return;
    if ( this.mode === this.constructor.VIEW_MODES.SINGLE ) {
      previous.disabled = this.pageIndex < 1;
      next.disabled = this.pageIndex >= (this._pages.length - 1);
    } else {
      previous.disabled = !this.pagesInView[0]?.previousElementSibling;
      next.disabled = this.pagesInView.length && !this.pagesInView.at(-1).nextElementSibling;
    }
  }

  /* -------------------------------------------- */

  /**
   * Edit one of this JournalEntry's JournalEntryPages.
   * @param {JQuery.TriggeredEvent} event  The originating page edit event.
   * @protected
   */
  _onEditPage(event) {
    event.preventDefault();
    const button = event.currentTarget;
    const pageId = button.closest("[data-page-id]").dataset.pageId;
    const page = this.object.pages.get(pageId);
    return page?.sheet.render(true);
  }

  /* -------------------------------------------- */

  /**
   * Handle clicking an entry in the sidebar to scroll that heading into view.
   * @param {JQuery.TriggeredEvent} event  The originating click event.
   * @protected
   */
  _onClickPageLink(event) {
    const target = event.currentTarget;
    const pageId = target.closest("[data-page-id]").dataset.pageId;
    const anchor = target.closest("[data-anchor]")?.dataset.anchor;
    this.goToPage(pageId, anchor);
  }

  /* -------------------------------------------- */

  /**
   * Handle clicking an image to pop it out for fullscreen view.
   * @param {MouseEvent} event  The click event.
   * @protected
   */
  _onClickImage(event) {
    const target = event.currentTarget;
    const imagePage = target.closest(".journal-entry-page.image");
    const page = this.object.pages.get(imagePage?.dataset.pageId);
    const title = page?.name ?? target.title;
    const ip = new foundry.applications.apps.ImagePopout({
      src: target.getAttribute("src"),
      caption: page?.image.caption,
      window: {title}
    });
    if ( page ) ip.shareImage = () => Journal.showDialog(page);
    ip.render(true);
  }

  /* -------------------------------------------- */

  /**
   * Handle new pages scrolling into view.
   * @param {IntersectionObserverEntry[]} entries  An Array of elements that have scrolled into or out of view.
   * @param {IntersectionObserver} observer        The IntersectionObserver that invoked this callback.
   * @protected
   */
  _onPageScroll(entries, observer) {
    if ( !entries.length ) return;

    // This has been triggered by an old IntersectionObserver from the previous render and is no longer relevant.
    if ( observer !== this.observer ) return;

    // Case 1 - We are in single page mode.
    if ( this.mode === this.constructor.VIEW_MODES.SINGLE ) {
      const entry = entries[0]; // There can be only one entry in single page mode.
      if ( entry.isIntersecting ) this.#pagesInView = [entry.target];
      return;
    }

    const minRatio = this.constructor.INTERSECTION_RATIO;
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
    const inView = [...this.pagesInView];

    // Remove pages that have scrolled out of view.
    for ( const el of this.pagesInView ) {
      const entry = byTarget.get(el);
      if ( entry && (entry.intersectionRatio < minRatio) ) inView.findSplice(p => p === el);
    }

    // Add pages that have scrolled into view.
    for ( const entry of intersecting ) {
      if ( !inView.includes(entry.target) ) inView.push(entry.target);
    }

    this.#pagesInView = inView.sort((a, b) => {
      const pageA = this.object.pages.get(a.dataset.pageId);
      const pageB = this.object.pages.get(b.dataset.pageId);
      return pageA.sort - pageB.sort;
    });
  }

  /* -------------------------------------------- */

  /**
   * Highlights the currently viewed page in the sidebar.
   * @protected
   */
  _activatePagesInView() {
    // Update the pageIndex to the first page in view for when the mode is switched to single view.
    if ( this.pagesInView.length ) {
      const pageId = this.pagesInView[0].dataset.pageId;
      this.#pageIndex = this._pages.findIndex(p => p._id === pageId);
    }
    let activeChanged = false;
    const pageIds = new Set(this.pagesInView.map(p => p.dataset.pageId));
    this.element.find(".directory-item").each((i, el) => {
      activeChanged ||= (el.classList.contains("active") !== pageIds.has(el.dataset.pageId));
      el.classList.toggle("active", pageIds.has(el.dataset.pageId));
    });
    if ( activeChanged ) this._synchronizeSidebar();
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
      const pageId = entry.target.closest("[data-page-id]")?.dataset.pageId;
      const anchor = entry.target.dataset.anchor;
      let toc = this.element[0].querySelector(`.directory-item[data-page-id="${pageId}"]`);
      if ( anchor ) toc = toc.querySelector(`li[data-anchor="${anchor}"]`);
      if ( toc ) {
        toc.scrollIntoView();
        break;
      }
    }
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _contextMenu(html) {
    foundry.applications.ux.ContextMenu.implementation.create(this, html, ".directory-item", this._getEntryContextOptions(), {
      onOpen: this._onContextMenuOpen.bind(this),
      onClose: this._onContextMenuClose.bind(this),
      jQuery: false
    });
  }

  /* -------------------------------------------- */

  /**
   * Handle opening the context menu.
   * @param {HTMLElement} target  The element the context menu has been triggered for.
   * @protected
   */
  _onContextMenuOpen(target) {
    this.#sidebarState = {
      position: this.element.find(".directory-list.scrollable").scrollTop(),
      active: target.classList.contains("active")
    };
    target.classList.remove("active");
  }

  /* -------------------------------------------- */

  /**
   * Handle closing the context menu.
   * @param {HTMLElement} target  The element the context menu has been triggered for.
   * @protected
   */
  _onContextMenuClose(target) {
    if ( this.#sidebarState.active ) target.classList.add("active");
    this.element.find(".directory-list.scrollable").scrollTop(this.#sidebarState.position);
  }

  /* -------------------------------------------- */

  /**
   * Get the set of ContextMenu options which should be used for JournalEntryPages in the sidebar.
   * @returns {ContextMenuEntry[]}  The Array of context options passed to the ContextMenu instance.
   * @protected
   */
  _getEntryContextOptions() {
    const getPage = (li, {strict=false}={}) => this.object.pages.get(li.dataset.pageId, {strict});
    return [{
      name: "SIDEBAR.Edit",
      icon: '<i class="fa-solid fa-pen-to-square"></i>',
      condition: li => this.isEditable && getPage(li)?.canUserModify(game.user, "update"),
      callback: li => getPage(li)?.sheet.render(true)
    }, {
      name: "SIDEBAR.Delete",
      icon: '<i class="fa-solid fa-trash"></i>',
      condition: li => this.isEditable && getPage(li)?.canUserModify(game.user, "delete"),
      callback: li => {
        const bounds = li.getBoundingClientRect();
        return getPage(li)?.deleteDialog({position: {top: bounds.top, left: bounds.right}});
      }
    }, {
      name: "SIDEBAR.Duplicate",
      icon: '<i class="fa-regular fa-copy"></i>',
      condition: this.isEditable,
      callback: li => {
        const page = getPage(li);
        return page.clone({name: game.i18n.format("DOCUMENT.CopyOf", {name: page.name})}, {
          save: true, addSource: true
        });
      }
    }, {
      name: "OWNERSHIP.Configure",
      icon: '<i class="fa-solid fa-lock"></i>',
      condition: () => game.user.isGM,
      callback: li => {
        const bounds = li.getBoundingClientRect();
        const apps = foundry.applications.apps;
        new apps.DocumentOwnershipConfig({
          document: getPage(li, {strict: true}),
          position: {
            top: bounds.top,
            left: bounds.right
          }
        }).render({force: true});
      }
    }, {
      name: "JOURNAL.ActionShow",
      icon: '<i class="fa-solid fa-eye"></i>',
      condition: li => getPage(li)?.isOwner,
      callback: li => {
        const page = getPage(li);
        if ( page ) return Journal.showDialog(page);
      }
    }, {
      name: "SIDEBAR.JumpPin",
      icon: '<i class="fa-solid fa-crosshairs"></i>',
      condition: li => {
        const page = getPage(li);
        return !!page?.sceneNote;
      },
      callback: li => {
        const page = getPage(li);
        if ( page?.sceneNote ) return canvas.notes.panToNote(page.sceneNote);
      }
    }];
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _updateObject(event, formData) {
    // Remove <form> tags which will break the display of the sheet.
    if ( formData.content ) formData.content = formData.content.replace(/<\s*\/?\s*form(\s+[^>]*)?>/g, "");
    return super._updateObject(event, formData);
  }

  /* -------------------------------------------- */

  /**
   * Handle requests to show the referenced Journal Entry to other Users
   * Save the form before triggering the show request, in case content has changed
   * @param {Event} event   The triggering click event
   */
  async _onShowPlayers(event) {
    event.preventDefault();
    await this.submit();
    return Journal.showDialog(this.object);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _canDragStart(selector) {
    return this.object.testUserPermission(game.user, "OBSERVER");
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _canDragDrop(selector) {
    return this.isEditable;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onDragStart(event) {
    if ( ui.context ) ui.context.close({animate: false});
    const target = event.currentTarget;
    const pageId = target.closest("[data-page-id]").dataset.pageId;
    const anchor = target.closest("[data-anchor]")?.dataset.anchor;
    const page = this.object.pages.get(pageId);
    const dragData = {
      ...page.toDragData(),
      anchor: { slug: anchor, name: target.innerText }
    };
    event.dataTransfer.setData("text/plain", JSON.stringify(dragData));
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _onDrop(event) {
    // Retrieve the dropped Journal Entry Page
    const data = TextEditor.implementation.getDragEventData(event);
    if ( data.type !== "JournalEntryPage" ) return;
    const page = await JournalEntryPage.implementation.fromDropData(data);
    if ( !page ) return;

    // Determine the target that was dropped
    const target = event.target.closest("[data-page-id]");
    const sortTarget = target ? this.object.pages.get(target?.dataset.pageId) : null;

    // Prevent dropping a page on itself.
    if ( page === sortTarget ) return;

    // Case 1 - Sort Pages
    if ( page.parent === this.document ) return page.sortRelative({
      sortKey: "sort",
      target: sortTarget,
      siblings: this.object.pages.filter(p => p.id !== page.id)
    });

    // Case 2 - Create Pages
    const pageData = page.toObject();
    if ( this.object.pages.has(page.id) ) delete pageData._id;
    pageData.sort = sortTarget ? sortTarget.sort : this.object.pages.reduce((max, p) => p.sort > max ? p.sort : max, 0);
    return this.document.createEmbeddedDocuments("JournalEntryPage", [pageData], {keepId: true});
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onSearchFilter(event, query, rgx, html) {
    this.#filteredPages.clear();
    const nameOnlySearch = (this.searchMode === DIRECTORY_SEARCH_MODES.NAME);

    // Match Pages
    let results = [];
    if ( !nameOnlySearch ) results = this.object.pages.search({query: query});
    for ( const el of html.querySelectorAll(".directory-item") ) {
      const page = this.object.pages.get(el.dataset.pageId);
      let match = !query;
      if ( !match && nameOnlySearch ) match = foundry.applications.ux.SearchFilter.testQuery(rgx, page.name);
      else if ( !match ) match = !!results.find(r => r._id === page._id);
      if ( match ) this.#filteredPages.add(page._id);
      el.classList.toggle("hidden", !match);
    }

    // Restore TOC Positions
    if ( this.#restoreTOCPositions && this._scrollPositions ) {
      this.#restoreTOCPositions = false;
      const position = this._scrollPositions[this.options.scrollY[0]]?.[0];
      const toc = this.element[0].querySelector(".pages-list .scrollable");
      if ( position && toc ) toc.scrollTop = position;
    }
  }
}

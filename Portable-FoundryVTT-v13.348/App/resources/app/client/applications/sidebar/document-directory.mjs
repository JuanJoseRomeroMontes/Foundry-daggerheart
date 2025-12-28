import HandlebarsApplicationMixin from "../api/handlebars-application.mjs";
import AbstractSidebarTab from "./sidebar-tab.mjs";
import {DIRECTORY_SEARCH_MODES} from "@common/constants.mjs";
import DocumentOwnershipConfig from "../apps/document-ownership.mjs";
import FolderConfig from "../sheets/folder-config.mjs";
import DialogV2 from "../api/dialog.mjs";
import CompendiumCollection from "@client/documents/collections/compendium-collection.mjs";
import Folder from "@client/documents/folder.mjs";
import {fromUuid, fromUuidSync} from "@client/utils/helpers.mjs";
import RollTable from "@client/documents/roll-table.mjs";

/**
 * @import {HandlebarsRenderOptions} from "../api/handlebars-application.mjs"
 * @import {ApplicationConfiguration, ApplicationRenderContext} from "../_types.mjs"
 * @import {ContextMenuEntry} from "../ux/context-menu.mjs";
 * @import {Constructor} from "@common/_types.mjs";
 */

/**
 * @typedef _DocumentDirectoryConfiguration
 * @property {DirectoryCollection} collection  The Document collection that this directory represents.
 * @property {string[]} renderUpdateKeys       Updating one of these properties of a displayed Document will trigger a
 *                                             re-render of the tab.
 */

/**
 * @typedef {ApplicationConfiguration & _DocumentDirectoryConfiguration} DocumentDirectoryConfiguration
 */

/**
 * An abstract class for rendering a foldered directory of Documents.
 * @extends {AbstractSidebarTab<DocumentDirectoryConfiguration, HandlebarsRenderOptions>}
 * @template {ClientDocument} [TDocument=ClientDocument]
 * @mixes HandlebarsApplication
 */
export default class DocumentDirectory extends HandlebarsApplicationMixin(AbstractSidebarTab) {
  constructor(options) {
    super(options);
    /** @deprecated since v13 */
    ["entryPartial", "folderPartial"].forEach(prop => {
      const warning = `${this.constructor.name}.${prop} is deprecated and no longer publicly available. `
        + `Subclasses should instead override ${this.constructor.name}._${prop}.`;
      if ( this.constructor[prop] ) {
        foundry.utils.logCompatibilityWarning(warning, { since: 13, until: 15, once: true });
        this.constructor[`_${prop}`] = this.constructor[prop];
      }
    });
  }

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    classes: ["directory", "flexcol"],
    collection: null,
    renderUpdateKeys: ["name", "img", "ownership", "==ownership", "sort", "folder"],
    actions: {
      activateEntry: DocumentDirectory.#onClickEntry,
      collapseFolders: DocumentDirectory.#onCollapseFolders,
      createEntry: DocumentDirectory.#onCreateEntry,
      createFolder: DocumentDirectory.#onCreateFolder,
      showIssues: DocumentDirectory.#onShowIssues,
      toggleFolder: DocumentDirectory.#onToggleFolder,
      toggleSearch: DocumentDirectory.#onToggleSearch,
      toggleSort: DocumentDirectory.#onToggleSort
    }
  };

  /** @override */
  static PARTS = {
    header: {
      template: "templates/sidebar/directory/header.hbs"
    },
    directory: {
      template: "templates/sidebar/directory/directory.hbs",
      scrollable: [""]
    },
    footer: {
      template: "templates/sidebar/directory/footer.hbs"
    }
  };

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * The path to the template used to render a single entry within the directory.
   * @type {string}
   * @protected
   */
  static _entryPartial = "templates/sidebar/partials/document-partial.hbs";

  /**
   * The path to the template used to render a single folder within the directory.
   * @type {string}
   * @protected
   */
  static _folderPartial = "templates/sidebar/partials/folder-partial.hbs";

  /**
   * The Document collection that this directory represents.
   * @type {DirectoryCollection}
   */
  get collection() {
    return this.options.collection;
  }

  /**
   * The implementation of the Document type that this directory represents.
   * @returns {Constructor<TDocument>}
   */
  get documentClass() {
    return this.collection.documentClass;
  }

  /**
   * The named Document type that this directory represents.
   * @type {string}
   */
  get documentName() {
    return this.collection.documentName;
  }

  /** @override */
  get title() {
    return game.i18n.format("SIDEBAR.DirectoryTitle", { type: game.i18n.localize(this.documentClass.metadata.label) });
  }

  /**
   * Search-filter handling
   * @type {foundry.applications.ux.SearchFilter}
   */
  #searchFilter = new foundry.applications.ux.SearchFilter({
    inputSelector: "search input",
    contentSelector: ".directory-list",
    callback: this._onSearchFilter.bind(this)
  });

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _initializeApplicationOptions(options) {
    options = super._initializeApplicationOptions(options);
    if ( typeof options.collection === "string" ) options.collection = game.collections.get(options.collection);
    return options;
  }

  /* -------------------------------------------- */

  /**
   * Determine if the current user has permission to create directory entries.
   * @returns {boolean}
   * @protected
   */
  _canCreateEntry() {
    /** @deprecated since v13 */
    if ( foundry.utils.getDefiningClass(this, "canCreateEntry") ) {
      foundry.utils.logCompatibilityWarning(`${this.constructor.name}#canCreateEntry is deprecated and no longer `
        + `publicly available. Subclasses should override ${this.constructor.name}#_canCreateEntry instead.`,
      { since: 13, until: 15, once: true });
      return this.canCreateEntry;
    }
    return this.documentClass.canUserCreate(game.user);
  }

  /* -------------------------------------------- */

  /**
   * Determine if the current user has permission to create folders in this directory.
   * @returns {boolean}
   * @protected
   */
  _canCreateFolder() {
    /** @deprecated since v13 */
    if ( foundry.utils.getDefiningClass(this, "canCreateFolder") ) {
      foundry.utils.logCompatibilityWarning(`${this.constructor.name}#canCreateFolder is deprecated and no longer `
        + `publicly available. Subclasses should override ${this.constructor.name}#_canCreateFolder instead.`,
      { since: 13, until: 15, once: true });
      return this.canCreateFolder;
    }
    return game.user.isGM;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _canRender(options) {
    const { renderContext, renderData } = options;
    if ( renderContext === `update${this.documentName}` ) {
      if ( !renderData?.some(d => this.options.renderUpdateKeys.some(k => foundry.utils.hasProperty(d, k))) ) {
        return false;
      }
    }
    return super._canRender(options);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _configureRenderParts(options) {
    const parts = super._configureRenderParts(options);
    parts.directory.templates ??= [];
    parts.directory.templates.push(this.constructor._entryPartial, this.constructor._folderPartial);
    return parts;
  }

  /* -------------------------------------------- */

  /**
   * Register context menu entries and fire hooks.
   * @protected
   */
  _createContextMenus() {
    /** @fires {hookEvents:getFolderContextOptions} */
    this._createContextMenu(this._getFolderContextOptions, ".folder .folder-header", {
      fixed: true,
      hookName: "getFolderContextOptions",
      parentClassHooks: false
    });
    /** @fires {hookEvents:getDocumentContextOptions} */
    this._createContextMenu(this._getEntryContextOptions, ".directory-item[data-entry-id]", {
      fixed: true,
      hookName: `get${this.documentName}ContextOptions`,
      parentClassHooks: false
    });
  }

  /* -------------------------------------------- */

  /**
   * Get context menu entries for entries in this directory.
   * @returns {ContextMenuEntry[]}
   * @protected
   */
  _getEntryContextOptions() {
    const getDocument = li => this.collection.get(li.closest("[data-entry-id]").dataset.entryId);
    return [{
      name: "OWNERSHIP.Configure",
      icon: '<i class="fa-solid fa-lock"></i>',
      condition: game.user.isGM,
      callback: li => new DocumentOwnershipConfig({
        document: getDocument(li),
        position: {
          top: Math.min(li.offsetTop, window.innerHeight - 350),
          left: window.innerWidth - 720
        }
      }).render({force: true})
    }, {
      name: "SIDEBAR.Export",
      icon: '<i class="fa-solid fa-file-export"></i>',
      condition: li => getDocument(li).isOwner,
      callback: li => getDocument(li).exportToJSON()
    }, {
      name: "SIDEBAR.Import",
      icon: '<i class="fa-solid fa-file-import"></i>',
      condition: li => getDocument(li).isOwner,
      callback: li => getDocument(li).importFromJSONDialog()
    }, {
      name: "FOLDER.Clear",
      icon: '<i class="fa-solid fa-folder"></i>',
      condition: header => {
        const li = header.closest(".directory-item");
        return game.user.isGM && !!getDocument(li).folder;
      },
      callback: li => getDocument(li).update({ folder: null })
    }, {
      name: "SIDEBAR.Delete",
      icon: '<i class="fa-solid fa-trash"></i>',
      condition: li => getDocument(li).canUserModify(game.user, "delete"),
      callback: li => getDocument(li).deleteDialog({
        position: {
          top: Math.min(li.offsetTop, window.innerHeight - 350),
          left: window.innerWidth - 770,
          width: 450
        }
      })
    }, {
      name: "SIDEBAR.Duplicate",
      icon: '<i class="fa-regular fa-copy"></i>',
      condition: li => getDocument(li).isOwner && this.documentClass.canUserCreate(game.user),
      callback: li => {
        const original = getDocument(li);
        return original.clone(this._prepareDuplicateData(original), {save: true, addSource: true});
      }
    }];
  }

  /* -------------------------------------------- */

  /**
   * Prepares the data for a duplicated Document.
   * @param {Document} document    The Document that is duplicated
   * @returns {object}             The partial data of the duplicate that overrides the original data
   * @protected
   */
  _prepareDuplicateData(document) {
    return {name: game.i18n.format("DOCUMENT.CopyOf", {name: document._source.name})};
  }

  /* -------------------------------------------- */

  /**
   * Get context menu entries for folders in this directory.
   * @returns {ContextMenuEntry[]}
   * @protected
   */
  _getFolderContextOptions() {
    return this.constructor._getFolderContextOptions();
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    this._createContextMenus();
    if ( !this.isPopout && !this.collection.apps.includes(this) ) this.collection.apps.push(this);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onRender(context, options) {
    await super._onRender(context, options);

    // Search
    if ( ["header", "directory"].some(p => options.parts.includes(p)) ) {
      this.#searchFilter.bind(this.element);
    }

    // Drag-drop
    if ( options.parts.includes("directory") ) {
      new foundry.applications.ux.DragDrop.implementation({
        dragSelector: ".directory-item",
        dropSelector: ".directory-list",
        permissions: {
          dragstart: this._canDragStart.bind(this),
          drop: this._canDragDrop.bind(this)
        },
        callbacks: {
          dragover: this._onDragOver.bind(this),
          dragstart: this._onDragStart.bind(this),
          drop: this._onDrop.bind(this)
        }
      }).bind(this.element);
      this.element.querySelectorAll(".directory-item.folder").forEach(folder => {
        folder.addEventListener("dragenter", this._onDragHighlight.bind(this));
        folder.addEventListener("dragleave", this._onDragHighlight.bind(this));
      });
    }
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    return Object.assign(context, {
      documentName: this.documentName,
      folderIcon: CONFIG.Folder.sidebarIcon,
      sidebarIcon: CONFIG[this.documentName].sidebarIcon,
      canCreateEntry: this._canCreateEntry(),
      canCreateFolder: this._canCreateFolder()
    });
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    switch ( partId ) {
      case "directory": await this._prepareDirectoryContext(context, options); break;
      case "footer": await this._prepareFooterContext(context, options); break;
      case "header": await this._prepareHeaderContext(context, options); break;
    }
    return context;
  }

  /* -------------------------------------------- */

  /**
   * Prepare render context for the directory part.
   * @param {ApplicationRenderContext} context
   * @param {HandlebarsRenderOptions} options
   * @returns {Promise<void>}
   * @protected
   */
  async _prepareDirectoryContext(context, options) {
    Object.assign(context, {
      documentCls: this.documentName.toLowerCase(),
      entryPartial: this.constructor._entryPartial,
      folderPartial: this.constructor._folderPartial,
      maxFolderDepth: this.collection.maxFolderDepth,
      tree: this.collection.tree
    });
  }

  /* -------------------------------------------- */

  /**
   * Prepare render context for the footer part.
   * @param {ApplicationRenderContext} context
   * @param {HandlebarsRenderOptions} options
   * @returns {Promise<void>}
   * @protected
   */
  async _prepareFooterContext(context, options) {
    context.buttons = [];
    const unavailable = game.user.isGM ? this.collection.invalidDocumentIds.size : 0;
    if ( unavailable ) {
      const plurals = new Intl.PluralRules(game.i18n.lang);
      const locPath = `SUPPORT.UnavailableDocuments.${plurals.select(unavailable)}`;
      const docLabel = game.i18n.localize(this.documentClass.metadata.label);
      const label = game.i18n.format(locPath, {count: unavailable, document: docLabel});
      context.buttons.push({type: "button", cssClass: "plain", icon: "fa-solid fa-triangle-exclamation", label,
        action: "showIssues"});
    }
  }

  /* -------------------------------------------- */

  /**
   * Prepare render context for the header part.
   * @param {ApplicationRenderContext} context
   * @param {HandlebarsRenderOptions} options
   * @returns {Promise<void>}
   * @protected
   */
  async _prepareHeaderContext(context, options) {
    Object.assign(context, {
      searchMode: this.collection.searchMode === CONST.DIRECTORY_SEARCH_MODES.NAME
        ? { icon: "fa-solid fa-magnifying-glass", label: "SIDEBAR.SearchModeName" }
        : { icon: "fa-solid fa-file-magnifying-glass", label: "SIDEBAR.SearchModeFull" },
      sortMode: this.collection.sortingMode === "a"
        ? { icon: "fa-solid fa-arrow-down-a-z", label: "SIDEBAR.SortModeAlpha" }
        : { icon: "fa-solid fa-arrow-down-short-wide", label: "SIDEBAR.SortModeManual" }
    });
    const types = game.i18n.localize(this.documentClass.metadata.labelPlural);
    context.searchMode.placeholder = game.i18n.format("SIDEBAR.Search", {types});
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _preSyncPartState(partId, newElement, priorElement, state) {
    super._preSyncPartState(partId, newElement, priorElement, state);
    if ( partId === "header" ) state.query = priorElement.querySelector("search input").value;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _syncPartState(partId, newElement, priorElement, state) {
    super._syncPartState(partId, newElement, priorElement, state);
    if ( (partId === "header") && state.query ) newElement.querySelector("search input").value = state.query;
  }

  /* -------------------------------------------- */
  /*  Public API                                  */
  /* -------------------------------------------- */

  /**
   * Collapse all open folders in this directory.
   */
  collapseAll() {
    for ( const el of this.element.querySelectorAll(".directory-item.folder") ) {
      el.classList.remove("expanded");
      delete game.folders._expanded[el.dataset.uuid];
    }
  }

  /* -------------------------------------------- */
  /*  Event Listeners & Handlers                  */
  /* -------------------------------------------- */

  /**
   * Handle activating a directory entry.
   * @this {DocumentDirectory}
   * @param {...any} args
   * @returns {Promise<void>}
   */
  static #onClickEntry(...args) {
    return this._onClickEntry(...args);
  }

  /* -------------------------------------------- */

  /**
   * Handle activating a directory entry.
   * @param {PointerEvent} event  The triggering click event.
   * @param {HTMLElement} target  The action target element.
   * @param {object} [options]
   * @param {boolean} [options._skipDeprecation] Internal use only.
   * @returns {Promise<void>}
   * @protected
   */
  async _onClickEntry(event, target, { _skipDeprecation=false }={}) {
    /** @deprecated since v13 */
    if ( !_skipDeprecation && (foundry.utils.getDefiningClass(this, "_onClickEntryName") !== DocumentDirectory) ) {
      foundry.utils.logCompatibilityWarning(`${this.constructor.name}#_onClickEntryName is deprecated. `
        + `Please use ${this.constructor.name}#_onClickEntry instead.`,
      { since: 13, until: 15, once: true });
      return this._onClickEntryName(event);
    }

    event.preventDefault();
    const { entryId } = target.closest("[data-entry-id]").dataset;
    const document = this.collection.get(entryId) ?? await this.collection.getDocument(entryId);
    document.sheet.render(true);
  }

  /* -------------------------------------------- */

  /**
   * Collapse open folders in this directory.
   * @this {DocumentDirectory}
   */
  static #onCollapseFolders() {
    return this.collapseAll();
  }

  /* -------------------------------------------- */

  /**
   * Handle creating a new entry in this directory.
   * @this {DocumentDirectory}
   * @param {...any} args
   */
  static #onCreateEntry(...args) {
    return this._onCreateEntry(...args);
  }

  /* -------------------------------------------- */

  /**
   * Handle creating a new entry in this directory.
   * @param {PointerEvent} event  The triggering click event.
   * @param {HTMLElement} target  The action target element.
   * @protected
   */
  _onCreateEntry(event, target) {
    event.stopPropagation();
    const { folderId } = target.closest(".directory-item")?.dataset ?? {};
    const options = {
      position: { width: 320, left: window.innerWidth - 630, top: target.offsetTop }
    };
    const operation = {};
    if ( this.collection instanceof CompendiumCollection ) operation.pack = this.collection.collection;
    return this.documentClass.createDialog({ folder: folderId ?? null }, operation, options);
  }

  /* -------------------------------------------- */

  /**
   * Handle creating a new folder in this directory.
   * @this {DocumentDirectory}
   * @param {...any} args
   */
  static #onCreateFolder(...args) {
    return this._onCreateFolder(...args);
  }

  /* -------------------------------------------- */

  /**
   * Handle creating a new folder in this directory.
   * @param {PointerEvent} event  The triggering click event.
   * @param {HTMLElement} target  The action target element.
   * @protected
   */
  _onCreateFolder(event, target) {
    event.stopPropagation();
    const { folderId } = target.closest(".directory-item")?.dataset ?? {};
    const data = { folder: folderId ?? null, type: this.documentName };
    const sheetWidth = foundry.applications.sheets.FolderConfig.DEFAULT_OPTIONS.position.width;
    const options = {
      position: { top: target.offsetTop, left: window.innerWidth - 310 - sheetWidth }
    };
    const operation = {};
    if ( this.collection instanceof CompendiumCollection ) operation.pack = this.collection.collection;
    Folder.implementation.createDialog(data, operation, options);
  }

  /* -------------------------------------------- */

  /**
   * Handle showing the client issues dialog.
   * @this {DocumentDirectory}
   */
  static #onShowIssues() {
    new foundry.applications.sidebar.apps.SupportDetails().render({ force: true, tab: "documents" });
  }

  /* -------------------------------------------- */

  /**
   * Handle toggling a folder's expanded state.
   * @this {DocumentDirectory}
   * @param {...any} args
   */
  static #onToggleFolder(...args) {
    return this._onToggleFolder(...args);
  }

  /* -------------------------------------------- */

  /**
   * Handle toggling a folder's expanded state.
   * @param {PointerEvent} event  The triggering click event.
   * @param {HTMLElement} target  The action target element.
   * @param {object} [options]
   * @param {boolean} [options._skipDeprecation] Internal use only.
   * @protected
   */
  _onToggleFolder(event, target, { _skipDeprecation=false }={}) {
    /** @deprecated since v13 */
    if ( !_skipDeprecation && (foundry.utils.getDefiningClass(this, "_toggleFolder") !== DocumentDirectory) ) {
      foundry.utils.logCompatibilityWarning(`${this.constructor.name}#_toggleFolder is deprecated. `
        + `Please use ${this.constructor.name}#_onToggleFolder instead.`,
      { since: 13, until: 15, once: true });
      return this._toggleFolder(event);
    }

    const folder = target.closest(".directory-item");
    folder.classList.toggle("expanded");
    const expanded = folder.classList.contains("expanded");
    const { uuid } = folder.dataset;
    if ( expanded ) game.folders._expanded[uuid] = true;
    else delete game.folders._expanded[uuid];

    if ( !expanded ) {
      for ( const subfolder of folder.querySelectorAll(".directory-item.folder") ) {
        subfolder.classList.remove("expanded");
        delete game.folders._expanded[subfolder.dataset.uuid];
      }
    }

    if ( this.isPopout ) this.setPosition();
  }

  /* -------------------------------------------- */

  /**
   * Handle toggling the search mode.
   * @this {DocumentDirectory}
   */
  static #onToggleSearch() {
    this.collection.toggleSearchMode();
    this.render({ parts: ["header"] });
  }

  /* -------------------------------------------- */

  /**
   * Handle toggling the sort mode.
   * @this {DocumentDirectory}
   */
  static #onToggleSort() {
    this.collection.toggleSortingMode();
    this.render();
  }

  /* -------------------------------------------- */
  /*  Search & Filter                             */
  /* -------------------------------------------- */

  /**
   * Handle matching a given directory entry with the search filter.
   * @param {string} query          The input search string.
   * @param {Set<string>} entryIds  The matched directory entry IDs.
   * @param {HTMLElement} element   The candidate entry element.
   * @param {object} [options]      Additional options for subclass-specific behavior.
   * @protected
   */
  _onMatchSearchEntry(query, entryIds, element, options={}) {
    element.style.display = !query || entryIds.has(element.dataset.entryId) ? "flex" : "none";
  }

  /* -------------------------------------------- */

  /**
   * Handle directory searching and filtering.
   * @param {KeyboardEvent} event  The keyboard input event.
   * @param {string} query         The input search string.
   * @param {RegExp} rgx           The regular expression query that should be matched against.
   * @param {HTMLElement} html     The container to filter entries from.
   * @protected
   */
  _onSearchFilter(event, query, rgx, html) {
    const entryIds = new Set();
    const folderIds = new Set();
    const autoExpandIds = new Set();
    const options = {};

    // Match entries and folders.
    if ( query ) {
      // First match folders.
      this._matchSearchFolders(rgx, folderIds, autoExpandIds, options);

      // Next match entries.
      this._matchSearchEntries(rgx, entryIds, folderIds, autoExpandIds, options);
    }

    // Toggle each directory entry.
    for ( const el of html.querySelectorAll(".directory-item") ) {
      if ( el.hidden ) continue;
      if ( el.classList.contains("folder") ) {
        const { folderId, uuid } = el.dataset;
        const match = folderIds.has(folderId);
        el.style.display = !query || match ? "flex" : "none";
        if ( autoExpandIds.has(folderId) ) {
          if ( query && match ) el.classList.add("expanded");
        }
        else el.classList.toggle("expanded", uuid in game.folders._expanded);
      }
      else this._onMatchSearchEntry(query, entryIds, el, options);
    }
  }

  /* -------------------------------------------- */

  /**
   * Include the matched folder in search results, and recursively auto-expand its parent folders.
   * @param {Folder|string} folder               The folder document or its ID.
   * @param {Set<string>} folderIds              The set of matched folder IDs.
   * @param {Set<string>} autoExpandIds          The set of folder IDs that should be auto-expanded.
   * @param {object} [options]
   * @param {boolean} [options.autoExpand=true]  Add the folder to the auto-expand list.
   */
  #onMatchFolder(folder, folderIds, autoExpandIds, { autoExpand=true }={}) {
    if ( typeof folder === "string" ) folder = this.collection.folders.get(folder);
    if ( !folder ) return;
    const folderId = folder._id;
    const visited = folderIds.has(folderId);
    folderIds.add(folderId);
    if ( autoExpand ) autoExpandIds.add(folderId);
    if ( !visited && folder.folder ) this.#onMatchFolder(folder.folder, folderIds, autoExpandIds);
  }

  /* -------------------------------------------- */

  /**
   * Identify entries in the collection which match a provided search query.
   * @param {RegExp} query               The search query.
   * @param {Set<string>} entryIds       The set of matched entry IDs.
   * @param {Set<string>} folderIds      The set of matched folder IDs.
   * @param {Set<string>} autoExpandIds  The set of folder IDs that should be auto-expanded.
   * @param {object} [options]           Additional options for subclass-specific behavior.
   * @protected
   */
  _matchSearchEntries(query, entryIds, folderIds, autoExpandIds, options={}) {
    const nameOnlySearch = this.collection.searchMode === DIRECTORY_SEARCH_MODES.NAME;
    const entries = this.collection.index ?? this.collection.contents;

    // Copy the folderIds to a new set, so that we can add to the original set without incorrectly adding child entries.
    const matchedFolderIds = new Set(folderIds);

    for ( const entry of entries ) {
      const entryId = entry._id;

      // If we matched a folder, add its child entries.
      if ( matchedFolderIds.has(entry.folder?._id ?? entry.folder) ) entryIds.add(entryId);

      // Otherwise, if we are searching by name, match the entry name.
      if ( nameOnlySearch && query.test(foundry.applications.ux.SearchFilter.cleanQuery(entry.name)) ) {
        entryIds.add(entryId);
        this.#onMatchFolder(entry.folder, folderIds, autoExpandIds);
      }
    }

    if ( nameOnlySearch ) return;

    // Full text search.
    const matches = this.collection.search({ query: query.source, exclude: Array.from(entryIds) });
    for ( const match of matches ) {
      if ( entryIds.has(match._id) ) continue;
      entryIds.add(match._id);
      this.#onMatchFolder(match.folder, folderIds, autoExpandIds);
    }
  }

  /* -------------------------------------------- */

  /**
   * Identify folders in the collection which match a provided search query.
   * @param {RegExp} query               The search query.
   * @param {Set<string>} folderIds      The set of matched folder IDs.
   * @param {Set<string>} autoExpandIds  The set of folder IDs that should be auto-expanded.
   * @param {object} [options]           Additional options for subclass-specific behavior.
   * @protected
   */
  _matchSearchFolders(query, folderIds, autoExpandIds, options={}) {
    for ( const folder of this.collection.folders ) {
      if ( query.test(foundry.applications.ux.SearchFilter.cleanQuery(folder.name)) ) {
        this.#onMatchFolder(folder, folderIds, autoExpandIds, { autoExpand: false });
      }
    }
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
    return this.documentClass.canUserCreate(game.user);
  }

  /* -------------------------------------------- */

  /**
   * Determine if drag operations are permitted.
   * @param {string} selector       The candidate HTML selector for dragging
   * @returns {boolean}             Can the current user drag this selector?
   * @protected
   */
  _canDragStart(selector) {
    return true;
  }

  /* -------------------------------------------- */

  /**
   * Create a new entry in this directory from one that was dropped on it.
   * @param {DirectoryMixinEntry} entry  The dropped entry.
   * @param {object} [updates]           Modifications to the creation data.
   * @returns {Promise<TDocument>}
   * @protected
   */
  _createDroppedEntry(entry, updates={}) {
    const data = foundry.utils.mergeObject(entry.toObject(), updates, { performDeletions: true });
    return this.documentClass.create(data, { fromCompendium: entry.inCompendium });
  }

  /* -------------------------------------------- */

  /**
   * Import a dropped folder and its children into this collection if they do not already exist.
   * @param {Folder} folder          The folder being dropped.
   * @param {Folder} [targetFolder]  A folder to import into if not the directory root.
   * @returns {Promise<Folder[]>}
   * @protected
   */
  async _createDroppedFolderContent(folder, targetFolder) {
    const {foldersToCreate, documentsToCreate} = await this._organizeDroppedFoldersAndDocuments(folder, targetFolder);

    // Create folders.
    let createdFolders;
    try {
      createdFolders = await Folder.implementation.createDocuments(foldersToCreate, {
        pack: this.collection.collection,
        keepId: true
      });
    } catch(err) {
      ui.notifications.error(err.message);
      throw err;
    }

    // Create documents.
    await this._createDroppedFolderDocuments(folder, documentsToCreate);
    return createdFolders;
  }

  /* -------------------------------------------- */

  /**
   * Create a set of documents in a dropped folder.
   * @param {Folder} folder  The dropped folder.
   * @param {TDocument[]|object[]} documents  The documents to create, or their indices.
   * @returns {Promise<void>}
   * @protected
   */
  async _createDroppedFolderDocuments(folder, documents) {
    if ( folder.pack ) {
      const pack = game.packs.get(folder.pack);
      if ( pack ) documents = await pack.getDocuments({ _id__in: documents.map(d => d._id) });
    }
    try {
      await this.documentClass.createDocuments(documents, { pack: this.collection.collection, keepId: true });
    } catch(err) {
      ui.notifications.error(err.message);
      throw err;
    }
  }

  /* -------------------------------------------- */

  /**
   * Test if the given entry is already present in this directory.
   * @param {ClientDocument} entry  The directory entry.
   * @returns {boolean}
   * @protected
   */
  _entryAlreadyExists(entry) {
    return this.collection.has(entry.id);
  }

  /* -------------------------------------------- */

  /**
   * Determine whether a given directory entry belongs to the given folder.
   * @param {DirectoryMixinEntry} entry  The entry.
   * @param {string} folder              The target folder ID.
   * @returns {boolean}
   * @protected
   */
  _entryBelongsToFolder(entry, folder) {
    if ( !entry.folder && !folder ) return true;
    if ( entry.folder instanceof Folder ) return entry.folder.id === folder;
    return entry.folder === folder;
  }

  /* -------------------------------------------- */

  /**
   * Get the entry instance from its dropped data.
   * @param {object} data  The drag data.
   * @returns {Promise<ClientDocument>}
   * @throws {Error}       If the correct instance type could not be retrieved.
   * @protected
   */
  _getDroppedEntryFromData(data) {
    return this.documentClass.fromDropData(data);
  }

  /* -------------------------------------------- */

  /**
   * Get drag data for an entry in this directory.
   * @param {string} entryId  The entry's ID.
   * @protected
   */
  _getEntryDragData(entryId) {
    return this.collection.get(entryId).toDragData();
  }

  /* -------------------------------------------- */

  /**
   * Get drag data for a folder in this directory.
   * @param {string} folderId  The folder ID.
   * @protected
   */
  _getFolderDragData(folderId) {
    return this.collection.folders.get(folderId).toDragData();
  }

  /* -------------------------------------------- */

  /**
   * Handle dropping a new entry into this directory.
   * @param {HTMLElement} target  The drop target element.
   * @param {object} data         The drop data.
   * @returns {Promise<void>}
   * @protected
   */
  async _handleDroppedEntry(target, data) {
    const closestFolder = target?.closest(".directory-item.folder");
    closestFolder?.classList.remove("droptarget");
    let folder = await foundry.utils.fromUuid(closestFolder?.dataset.uuid);
    let entry = await this._getDroppedEntryFromData(data);
    if ( !entry ) return;

    // Sort relative to another entry.
    const collection = this.collection.index ?? this.collection;
    const sortData = { sortKey: "sort" };
    const relativeEntryId = target?.dataset.entryId;
    if ( relativeEntryId ) {
      if ( entry.id === relativeEntryId ) return; // Don't drop on yourself.
      const targetEntry = collection.get(relativeEntryId);
      sortData.target = targetEntry;
      folder = targetEntry?.folder;
    }

    // Sort within the closest folder.
    else sortData.target = null;

    // Determine siblings.
    if ( folder instanceof Folder ) folder = folder.id;
    sortData.siblings = collection.filter(d => (d._id !== entry.id) && this._entryBelongsToFolder(d, folder));

    if ( !this._entryAlreadyExists(entry) ) {
      // Try to predetermine the sort order.
      const sorted = foundry.utils.performIntegerSort(entry, sortData);
      const updates = { folder: folder || null };
      if ( sorted.length === 1 ) updates.sort = sorted[0].update[sortData.sortKey];
      entry = await this._createDroppedEntry(entry, updates);

      // No need to resort other entries if this one was created with a specific sort order.
      if ( sorted.length === 1 ) return;
    }

    // Resort the collection.
    sortData.updateData = { folder: folder || null };
    return entry.sortRelative(sortData);
  }

  /* -------------------------------------------- */

  /**
   * Handle dropping a folder onto the directory.
   * @param {HTMLElement} target  The drop target element.
   * @param {object} data         The drop data.
   * @returns {Promise<void>}
   * @protected
   */
  async _handleDroppedFolder(target, data) {
    let { closestFolderId, folder, sortData, foreign } = (await this.constructor._handleDroppedFolder(target, data, {
      folders: this.collection.folders,
      maxFolderDepth: this.collection.maxFolderDepth,
      type: this.documentName,
      label: this.documentClass.metadata.label
    })) ?? {};

    if ( !folder ) return;

    if ( foreign ) {
      const dropped = await this._handleDroppedForeignFolder(folder, closestFolderId, sortData);
      if ( !dropped?.sortNeeded ) return;
      folder = dropped.folder;
    }

    sortData.updateData = { folder: sortData.parentId };
    return folder.sortRelative(sortData);
  }

  /* -------------------------------------------- */

  /**
   * Handle importing a new folder's into the directory.
   * @param {Folder} folder           The dropped folder.
   * @param {string} closestFolderId  The ID of the closest folder to the drop target.
   * @param {object} sortData         Sort data for the folder.
   * @returns {Promise<{ folder: Folder, sortNeeded: boolean }|null>}
   * @protected
   */
  async _handleDroppedForeignFolder(folder, closestFolderId, sortData) {
    const closestFolder = this.collection.folders.get(closestFolderId);
    const [created] = await this._createDroppedFolderContent(folder, closestFolder) ?? [];
    return created ? { folder: created, sortNeeded: true } : null;
  }

  /* -------------------------------------------- */

  /**
   * Highlight folders as drop targets when a drag event enters or exits their area.
   * @param {DragEvent} event  The in-progress drag event.
   * @protected
   */
  _onDragHighlight(event) {
    event.stopPropagation();
    if ( event.type === "dragenter" ) {
      for ( const el of this.element.querySelectorAll(".droptarget") ) el.classList.remove("droptarget");
    }
    else if ( event.type === "dragleave" ) {

      // Look up the hovered element (event.target is the element that was left)
      const el = document.elementFromPoint(event.clientX, event.clientY);
      const parent = el.closest(".folder");
      if ( parent === event.currentTarget ) return;
    }
    event.currentTarget.classList.toggle("droptarget", event.type === "dragenter");
  }

  /* -------------------------------------------- */

  /**
   * Handle drag events over the directory.
   * @param {DragEvent} event
   * @protected
   */
  _onDragOver(event) {}

  /* -------------------------------------------- */

  /** @override */
  _onDragStart(event) {
    ui.context?.close({ animate: false });
    const { entryId, folderId } = event.currentTarget.dataset;
    const dragData = folderId ? this._getFolderDragData(folderId) : this._getEntryDragData(entryId);
    event.dataTransfer.setData("text/plain", JSON.stringify(dragData));
  }

  /* -------------------------------------------- */

  /** @override */
  _onDrop(event) {
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    if ( !data.type ) return;
    const target = event.target.closest(".directory-item") ?? null;
    if ( data.type === "Folder" ) return this._handleDroppedFolder(target, data);
    else if ( data.type === this.documentName ) return this._handleDroppedEntry(target, data);
  }

  /* -------------------------------------------- */

  /**
   * Organize a dropped folder and its children into a list of folders and documents to create.
   * @param {Folder} folder          The dropped folder.
   * @param {Folder} [targetFolder]  A folder to import into if not the directory root.
   * @returns {Promise<{ foldersToCreate: Folder[], documentsToCreate: TDocument[]|object[] }>}
   * @protected
   */
  _organizeDroppedFoldersAndDocuments(folder, targetFolder) {
    const foldersToCreate = [];
    const documentsToCreate = [];
    let exceededMaxDepth = false;

    const addFolder = (f, depth) => {
      if ( !f ) return;

      // If the folder does not already exist, add it to the list of folders to create.
      if ( this.collection.folders.get(f.id) !== f ) {
        const createData = f.toObject();
        if ( targetFolder ) {
          createData.folder = targetFolder.id;
          targetFolder = null;
        }
        if ( depth > this.collection.maxFolderDepth ) {
          exceededMaxDepth = true;
          return;
        }
        createData.pack = this.collection.collection;
        foldersToCreate.push(createData);
      }

      // If the folder has documents, check those as well.
      for ( const d of f.contents ?? [] ) documentsToCreate.push(d.toObject?.() ?? foundry.utils.deepClone(d));

      // Recursively check child folders.
      for ( const child of f.children ) addFolder(child.folder, depth + 1);
    };

    const currentDepth = (targetFolder?.ancestors.length ?? 0) + 1;
    addFolder(folder, currentDepth);
    if ( exceededMaxDepth ) {
      ui.notifications.error("FOLDER.ExceededMaxDepth", {
        console: false,
        format: { depth: this.collection.maxFolderDepth }
      });
      foldersToCreate.length = documentsToCreate.length = 0;
    }

    return { foldersToCreate, documentsToCreate };
  }

  /* -------------------------------------------- */
  /*  Helpers                                     */
  /* -------------------------------------------- */

  /**
   * Get context menu entries for folders in a directory.
   * @returns {ContextMenuEntry[]}
   * @internal
   */
  static _getFolderContextOptions() {
    return [{
      name: "FOLDER.Edit",
      icon: '<i class="fa-solid fa-pen-to-square"></i>',
      condition: game.user.isGM,
      callback: async header => {
        const li = header.closest(".directory-item");
        const folder = await fromUuid(li.dataset.uuid);
        const {top, left} = li.getBoundingClientRect();
        return folder.sheet.render({
          force: true,
          position: {top, left: left - FolderConfig.DEFAULT_OPTIONS.position.width - 10}
        });
      }
    }, {
      name: "FOLDER.CreateTable",
      icon: `<i class="${CONFIG.RollTable.sidebarIcon}"></i>`,
      condition: header => {
        const li = header.closest(".directory-item");
        const folder = fromUuidSync(li.dataset.uuid);
        return CONST.COMPENDIUM_DOCUMENT_TYPES.includes(folder.type);
      },
      callback: async header => {
        const li = header.closest(".directory-item");
        const folder = await fromUuid(li.dataset.uuid);
        const title = game.i18n.format("FOLDER.CreateTableConfirm.Title", { folder: folder.name });
        return DialogV2.confirm({
          window: { title }, // FIXME: double localization
          position: {
            top: Math.min(li.offsetTop, window.innerHeight - 350),
            left: window.innerWidth - 740,
            width: 420
          },
          content: `<p>${game.i18n.localize("FOLDER.CreateTableConfirm.Question")}</p>`,
          yes: { callback: () => RollTable.implementation.fromFolder(folder), default: true }
        });
      }
    }, {
      name: "FOLDER.Remove",
      icon: '<i class="fa-solid fa-trash"></i>',
      condition: game.user.isGM,
      callback: async header => {
        const li = header.closest(".directory-item");
        const folder = await fromUuid(li.dataset.uuid);
        const question = game.i18n.localize("AreYouSure");
        const warning = game.i18n.localize("FOLDER.RemoveWarning");
        const title = game.i18n.format("FOLDER.RemoveName", { name: folder.name });
        return folder.deleteDialog({
          content: `<p><strong>${question}</strong> ${warning}</p>`,
          window: { title, icon: "fas fa-trash" }, // FIXME: double localization
          position: {
            top: Math.min(li.offsetTop, window.innerHeight - 350),
            left: window.innerWidth - 770,
            width: 450
          }
        });
      }
    }, {
      name: "FOLDER.Delete",
      icon: '<i class="fa-solid fa-dumpster"></i>',
      condition: game.user.isGM,
      callback: async header => {
        const li = header.closest(".directory-item");
        const folder = await fromUuid(li.dataset.uuid);
        const question = game.i18n.localize("AreYouSure");
        const warning = game.i18n.localize("FOLDER.DeleteWarning");
        const title = game.i18n.format("FOLDER.DeleteName", { name: folder.name });
        return folder.deleteDialog({
          window: { title, icon: "fas fa-dumpster" }, // FIXME: double localization
          position: {
            top: Math.min(li.offsetTop, window.innerHeight - 350),
            left: window.innerWidth - 770,
            width: 450
          },
          content: `<p><strong>${question}</strong> ${warning}</p>`,
          yes: {
            callback: () => folder.delete({ deleteSubfolders: true, deleteContents: true })
          }
        });
      }
    }, {
      name: "OWNERSHIP.Configure",
      icon: '<i class="fa-solid fa-lock"></i>',
      condition: game.user.isGM,
      callback: async header => {
        const li = header.closest(".directory-item");
        const folder = await fromUuid(li.dataset.uuid);
        return new DocumentOwnershipConfig({
          document: folder,
          position: {
            top: Math.min(li.offsetTop, window.innerHeight - 350),
            left: window.innerWidth - 720
          }
        }).render({force: true});
      }
    }, {
      name: "FOLDER.Export",
      icon: '<i class="fa-solid fa-book-atlas"></i>',
      condition: header => {
        const li = header.closest(".directory-item");
        const folder = fromUuidSync(li.dataset.uuid);
        return CONST.COMPENDIUM_DOCUMENT_TYPES.includes(folder.type);
      },
      callback: async header => {
        const li = header.closest(".directory-item");
        const folder = await fromUuid(li.dataset.uuid);
        return folder.exportDialog(null, {}, {
          position: {
            top: Math.min(li.offsetTop, window.innerHeight - 350),
            left: window.innerWidth - 720,
            width: 400
          }
        });
      }
    }];
  }

  /* -------------------------------------------- */

  /**
   * Helper method to handle dropping a folder onto the directory.
   * @param {HTMLElement} target            The drop target element.
   * @param {object} data                   The drop data.
   * @param {object} config
   * @param {Folder[]} config.folders       The sibling folders.
   * @param {string} config.label           The label for entries in the directory.
   * @param {number} config.maxFolderDepth  The maximum folder depth in this directory.
   * @param {string} config.type            The type of entries in the directory.
   * @returns {Promise<{[closestFolderId]: string, folder: Folder, sortData: object, [foreign]: boolean}|void>}
   * @internal
   */
  static async _handleDroppedFolder(target, data, { folders, label, maxFolderDepth, type }) {
    const closestFolder = target?.closest(".directory-item.folder");
    closestFolder?.classList.remove("droptarget");
    const closestFolderId = closestFolder?.dataset.folderId;
    const folder = await fromUuid(data.uuid);
    if ( !folder ) return;
    if ( folder.type !== type ) {
      const typeLabel = game.i18n.localize(label);
      ui.notifications.warn("FOLDER.InvalidDocumentType", { format: { type: typeLabel } });
      return;
    }

    // Sort into another folder.
    const sortData = { sortKey: "sort", sortBefore: true };
    const relativeFolderId = target?.dataset.folderId;
    if ( relativeFolderId ) {
      const targetFolder = await fromUuid(target.dataset.uuid);

      // Drop into an expanded folder.
      if ( target.classList.contains("expanded") ) {
        Object.assign(sortData, {
          target: null,
          parentId: targetFolder.id,
          parentUuid: targetFolder.uuid
        });
      }

      // Sort relative to a collapsed folder.
      else {
        Object.assign(sortData, {
          target: targetFolder,
          parentId: targetFolder.folder?.id,
          parentUuid: targetFolder.folder?.uuid
        });
      }
    }

    // Sort relative to an existing folder's contents.
    else {
      Object.assign(sortData, {
        parentId: closestFolderId,
        parentUuid: closestFolder?.dataset.uuid,
        target: closestFolder && !closestFolder.classList.contains("expanded") ? closestFolder : null
      });
    }

    if ( sortData.parentUuid ) {
      const parentFolder = await fromUuid(sortData.parentUuid);
      if ( parentFolder === folder ) return; // Prevent assigning a folder as its own parent.
      if ( parentFolder.ancestors.includes(folder) ) return; // Prevent creating a cycle.
      // Prevent going beyond max depth.
      const maxDepth = f => Math.max(f.depth, ...f.children.filter(n => n.folder).map(n => maxDepth(n.folder)));
      if ( (parentFolder.depth + (maxDepth(folder) - folder.depth + 1)) > maxFolderDepth ) {
        ui.notifications.error("FOLDER.ExceededMaxDepth", {
          console: false,
          format: { depth: maxFolderDepth }
        });
        return;
      }
    }

    // Determine siblings.
    sortData.siblings = folders.filter(f => {
      return (f.folder?.id === sortData.parentId) && (f.type === folder.type) && (f !== folder);
    });

    // Handle dropping of some folder that is foreign to this collection.
    if ( folders.get(folder.id) !== folder ) return { closestFolderId, folder, sortData, foreign: true };
    return { folder, sortData };
  }

  /* -------------------------------------------- */
  /*  Deprecations                                */
  /* -------------------------------------------- */

  /**
   * @deprecated since v13 until v15.
   * @ignore
   */
  _onClickEntryName(event) {
    foundry.utils.logCompatibilityWarning(`${this.constructor.name}#_onClickEntryName is deprecated. `
      + `Please use ${this.constructor.name}#_onClickEntry instead.`,
    { since: 13, until: 15, once: true });
    return this._onClickEntry(event, event.target, { _skipDeprecation: true });
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v13 until v15.
   * @ignore
   */
  _toggleFolder(event) {
    foundry.utils.logCompatibilityWarning(`${this.constructor.name}#_toggleFolder is deprecated. `
      + `Please use ${this.constructor.name}#_onToggleFolder instead.`,
    { since: 13, until: 15, once: true });
    return this._onToggleFolder(event, event.target, { _skipDeprecation: true });
  }
}

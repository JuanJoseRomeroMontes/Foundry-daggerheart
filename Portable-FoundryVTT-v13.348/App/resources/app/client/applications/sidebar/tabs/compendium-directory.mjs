import HandlebarsApplicationMixin from "../../api/handlebars-application.mjs";
import AbstractSidebarTab from "../sidebar-tab.mjs";
import DialogV2 from "../../api/dialog.mjs";
import FormDataExtended from "../../ux/form-data-extended.mjs";
import ContextMenu from "../../ux/context-menu.mjs";
import {StringField} from "@common/data/fields.mjs";
import FolderConfig from "../../sheets/folder-config.mjs";
import DocumentDirectory from "../document-directory.mjs";
import CompendiumCollection from "@client/documents/collections/compendium-collection.mjs";
import {fromUuid, getDocumentClass} from "@client/utils/helpers.mjs";
import Folder from "@client/documents/folder.mjs";
import TextEditor from "@client/applications/ux/text-editor.mjs";

/**
 * @import {ApplicationConfiguration} from "../../_types.mjs";
 * @import {HandlebarsRenderOptions} from "../../api/handlebars-application.mjs";
 */

/**
 * @typedef CompendiumPackDirectoryContext
 * @property {boolean} locked           Whether the pack is locked.
 * @property {boolean} customOwnership  Whether the pack has custom ownership configured.
 * @property {string} collection        The pack's collection ID.
 * @property {string} package           The name of the package the pack belongs to.
 * @property {string} title             The pack title.
 * @property {string} icon              An icon representing the pack's contents.
 * @property {boolean} hidden           Whether the pack is currently hidden.
 * @property {string} banner            The pack's banner image.
 * @property {string} sourceIcon        An icon representing the pack's source (World, System, or Module).
 * @property {string} css               CSS class names.
 */

/**
 * The listing of compendiums available in the World.
 * @extends {AbstractSidebarTab<ApplicationConfiguration, HandlebarsRenderOptions>}
 * @mixes HandlebarsApplication
 */
export default class CompendiumDirectory extends HandlebarsApplicationMixin(AbstractSidebarTab) {
  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["directory", "flexcol"],
    window: {
      title: "SIDEBAR.TabCompendium"
    },
    actions: {
      activateEntry: CompendiumDirectory.#onClickEntry,
      collapseFolders: CompendiumDirectory.#onCollapseFolders,
      createEntry: CompendiumDirectory.#onCreateEntry,
      createFolder: CompendiumDirectory.#onCreateFolder,
      toggleFolder: CompendiumDirectory.#onToggleFolder,
      toggleSort: CompendiumDirectory.#onToggleSort
    }
  };

  /** @override */
  static PARTS = {
    header: {
      template: "templates/sidebar/tabs/compendiums.hbs"
    },
    directory: {
      template: "templates/sidebar/directory/directory.hbs",
      templates: ["templates/sidebar/partials/folder-partial.hbs", "templates/sidebar/partials/pack-partial.hbs"],
      scrollable: [""]
    },
    footer: {
      template: "templates/sidebar/directory/footer.hbs"
    }
  };

  /** @override */
  static tabName = "compendium";

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * The set of active document type filters.
   * @type {Set<string>}
   */
  get activeFilters() {
    return this.#activeFilters;
  }

  #activeFilters = new Set();

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /**
   * Get context menu entries for entries in this directory.
   * @returns {ContextMenuEntry[]}
   * @protected
   */
  _getEntryContextOptions() {
    if ( !game.user.isGM ) return [];
    return [{
      name: "OWNERSHIP.Configure",
      icon: '<i class="fa-solid fa-user-lock"></i>',
      callback: li => game.packs.get(li.dataset.pack)?.configureOwnershipDialog()
    }, {
      name: "FOLDER.Clear",
      icon: '<i class="fa-solid fa-folder"></i>',
      condition: header => game.packs.get(header.closest(".directory-item")?.dataset.entryId)?.folder,
      callback: header => game.packs.get(header.closest(".directory-item")?.dataset.entryId)?.setFolder(null)
    }, {
      name: "COMPENDIUM.ToggleLocked.Option",
      icon: '<i class="fa-solid fa-lock"></i>',
      callback: this._onToggleLock.bind(this)
    }, {
      name: "COMPENDIUM.Duplicate.Option",
      icon: '<i class="fa-solid fa-copy"></i>',
      callback: this._onDuplicateCompendium.bind(this)
    }, {
      name: "COMPENDIUM.ImportAll.Option",
      icon: '<i class="fa-solid fa-download"></i>',
      condition: li => game.packs.get(li.dataset.pack)?.documentName !== "Adventure",
      callback: li => game.packs.get(li.dataset.pack)?.importDialog({
        position: {
          top: Math.min(li.offsetTop, window.innerHeight - 350),
          left: window.innerWidth - 740,
          width: 420
        }
      })
    }, {
      name: "COMPENDIUM.Delete.Option",
      icon: '<i class="fa-solid fa-trash"></i>',
      condition: li => game.packs.get(li.dataset.pack)?.metadata.packageType === "world",
      callback: this._onDeleteCompendium.bind(this)
    }];
  }

  /* -------------------------------------------- */

  /**
   * Get options for filtering the directory by document type.
   * @returns {ContextMenuEntry[]}
   * @protected
   */
  _getFilterContextOptions() {
    return [
      {
        name: game.i18n.localize("COMPENDIUM.ClearFilters"),
        icon: '<i class="fa-solid fa-xmark"></i>',
        callback: this._onToggleCompendiumFilterType.bind(this)
      },
      ...CONST.COMPENDIUM_DOCUMENT_TYPES.map(t => ({
        name: game.i18n.localize(getDocumentClass(t).metadata.label),
        icon: `<i class="${CONFIG[t]?.sidebarIcon}"></i>`,
        callback: event => this._onToggleCompendiumFilterType(event, t)
      }))
    ];
  }

  /* -------------------------------------------- */

  /**
   * Get context menu entries for folders in this directory.
   * @returns {ContextMenuEntry[]}
   * @protected
   */
  _getFolderContextOptions() {
    return DocumentDirectory._getFolderContextOptions().filter(({ name }) => {
      return ["Edit", "Remove"].includes(name.substring(7));
    });
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    /** @fires {hookEvents:getFolderContextOptions} */
    this._createContextMenu(this._getFolderContextOptions, ".folder .folder-header", {
      fixed: true,
      hookName: "getFolderContextOptions",
      parentClassHooks: false
    });
    /** @fires {hookEvents:getDocumentContextOptions} */
    this._createContextMenu(this._getEntryContextOptions, ".directory-item[data-pack]", {
      fixed: true,
      hookName: "getCompendiumContextOptions",
      parentClassHooks: false
    });
    new ContextMenu.implementation(this.element, "button.filter", this._getFilterContextOptions(), {
      jQuery: false,
      fixed: true,
      eventName: "click"
    });
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onRender(context, options) {
    await super._onRender(context, options);

    // Search
    if ( options.parts.includes("header") ) {
      new foundry.applications.ux.SearchFilter({
        inputSelector: "search input",
        contentSelector: ".directory-list",
        callback: this._onSearchFilter.bind(this),
        initial: this.element.querySelector("search input").value
      }).bind(this.element);
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
    Object.assign(context, {
      folderIcon: CONFIG.Folder.sidebarIcon,
      label: game.i18n.localize("PACKAGE.TagCompendium"),
      labelPlural: game.i18n.localize("SIDEBAR.TabCompendium"),
      documentName: "Compendium", // Honorary documentName for use in `DocumentDirectory` templates
      sidebarIcon: "fa-solid fa-book-atlas"
    });
    return context;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    switch ( partId ) {
      case "directory": await this._prepareDirectoryContext(context, options); break;
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
      canCreateEntry: game.user.isGM,
      canCreateFolder: game.user.isGM,
      entryPartial: "templates/sidebar/partials/pack-partial.hbs",
      folderPartial: "templates/sidebar/partials/folder-partial.hbs",
      packContext: game.packs.reduce((obj, pack) => {
        obj[pack.collection] = this._preparePackContext(pack);
        return obj;
      }, {}),
      maxFolderDepth: CONST.FOLDER_MAX_DEPTH,
      tree: game.packs.tree
    });
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
      filtersActive: this.#activeFilters.size,
      searchMode: game.packs.searchMode === CONST.DIRECTORY_SEARCH_MODES.NAME
        ? { icon: "fa-solid fa-magnifying-glass", label: "SIDEBAR.SearchModeName" }
        : { icon: "fa-solid fa-file-magnifying-glass", label: "SIDEBAR.SearchModeFull" },
      sortMode: game.packs.sortingMode === "a"
        ? { icon: "fa-solid fa-arrow-down-a-z", label: "SIDEBAR.SortModeAlpha" }
        : { icon: "fa-solid fa-arrow-down-short-wide", label: "SIDEBAR.SortModeManual" }
    });
    context.searchMode.placeholder = game.i18n.format("SIDEBAR.Search", {
      types: game.i18n.localize("SIDEBAR.TabCompendium")
    });
  }

  /* -------------------------------------------- */

  /**
   * Prepare render context for an individual compendium pack.
   * @param {CompendiumCollection} pack  The compendium pack.
   * @returns {CompendiumPackDirectoryContext}
   * @protected
   */
  _preparePackContext(pack) {
    const { locked, config, collection, metadata, title, banner, documentName } = pack;
    return {
      locked,
      collection,
      title: game.i18n.localize(title),
      banner,
      customOwnership: "ownership" in config,
      package: metadata.packageName,
      icon: CONFIG[documentName]?.sidebarIcon,
      hidden: this.#activeFilters.size && !this.#activeFilters.has(documentName),
      sourceIcon: foundry.packages.PACKAGE_TYPES[metadata.packageType]?.icon,
      css: documentName.toLowerCase()
    };
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
   * Collapse all open folders in this directory.
   * @this {CompendiumDirectory}
   */
  static #onCollapseFolders() {
    return this.collapseAll();
  }

  /**
   * Handle clicking on a compendium entry.
   * @this {CompendiumDirectory}
   * @param {...any} args
   */
  static #onClickEntry(...args) {
    return this._onClickEntry(...args);
  }

  /* -------------------------------------------- */

  /**
   * Handle clicking on a compendium entry.
   * @param {PointerEvent} event  The triggering event.
   * @param {HTMLElement} target  The action target.
   * @protected
   */
  _onClickEntry(event, target) {
    event.preventDefault();
    const { pack } = target.closest("[data-pack]")?.dataset ?? {};
    game.packs.get(pack)?.render(true);
  }

  /* -------------------------------------------- */

  /**
   * Handle creating a new compendium pack.
   * @this {CompendiumDirectory}
   * @param {...any} args
   */
  static #onCreateEntry(...args) {
    return this._onCreateEntry(...args);
  }

  /* -------------------------------------------- */

  /**
   * Handle creating a new compendium pack.
   * @param {PointerEvent} event  The triggering event.
   * @param {HTMLElement} target  The action target.
   * @returns {Promise<void>}
   * @protected
   */
  async _onCreateEntry(event, target) {
    const { folderId } = target.closest(".directory-item")?.dataset ?? {};
    const types = CONST.COMPENDIUM_DOCUMENT_TYPES.map(documentName => {
      return { value: documentName, label: game.i18n.localize(getDocumentClass(documentName).metadata.label) };
    });
    game.i18n.sortObjects(types, "label");
    const folders = game.packs._formatFolderSelectOptions();
    const html = await foundry.applications.handlebars.renderTemplate("templates/sidebar/compendium-create.hbs", {
      types, folders,
      folder: folderId,
      hasFolders: folders.length
    });
    const content = document.createElement("div");
    content.innerHTML = html;
    const metadata = await DialogV2.prompt({
      content,
      id: "create-compendium",
      window: { title: "COMPENDIUM.Create" },
      position: { width: 480 },
      ok: {
        label: "COMPENDIUM.Create",
        callback: (_event, button) => new FormDataExtended(button.form).object
      }
    });
    if ( !metadata ) return;
    const targetFolderId = metadata.folder;
    delete metadata.folder;
    if ( !metadata.label ) {
      const count = game.packs.size;
      metadata.label = game.i18n.format(count ? "DOCUMENT.NewCount" : "DOCUMENT.New", {
        count: count + 1,
        type: game.i18n.localize("PACKAGE.TagCompendium")
      });
    }
    const pack = await CompendiumCollection.createCompendium(metadata);
    if ( targetFolderId ) await pack.setFolder(targetFolderId);
  }

  /* -------------------------------------------- */

  /**
   * Handle creating a new folder in this directory.
   * @this {CompendiumDirectory}
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
    const data = { folder: folderId ?? null, type: "Compendium" };
    const sheetWidth = FolderConfig.DEFAULT_OPTIONS.position.width;
    const options = {
      position: { top: target.offsetTop, left: window.innerWidth - 310 - sheetWidth }
    };
    Folder.implementation.createDialog(data, {}, options);
  }

  /* -------------------------------------------- */

  /**
   * Handle deleting a compendium pack.
   * @param {HTMLElement} li  The compendium target element.
   * @returns {Promise<void>}
   * @protected
   */
  async _onDeleteCompendium(li) {
    const pack = game.packs.get(li.dataset.pack);
    const question = game.i18n.localize("AreYouSure");
    const warning = game.i18n.localize("COMPENDIUM.Delete.Warning");
    const result = await DialogV2.confirm({
      window: {
        title: game.i18n.format("COMPENDIUM.Delete.Title", { compendium: game.i18n.localize(pack.title) }), // FIXME: double localization
        icon: "fa-solid fa-trash"
      },
      position: {
        top: Math.min(li.offsetTop, window.innerHeight - 350),
        left: window.innerWidth - 720,
        width: 480
      },
      content: `<p><strong>${question}</strong> ${warning}</p>`
    });
    if ( result ) pack.deleteCompendium();
  }

  /* -------------------------------------------- */

  /**
   * Handle duplicating a compendium.
   * @param {HTMLElement} li  The compendium target element.
   * @returns {Promise<CompendiumCollection|void>}
   * @protected
   */
  async _onDuplicateCompendium(li) {
    const pack = game.packs.get(li.dataset.pack);
    const field = new StringField({
      label: "COMPENDIUM.Duplicate.Label",
      hint: "COMPENDIUM.Duplicate.Hint"
    });
    const { label } = await DialogV2.confirm({
      content: field._toInput({
        value: game.i18n.format("DOCUMENT.CopyOf", { name: pack.title }),
        name: "label"
      }).outerHTML,
      window: {
        title: game.i18n.format("COMPENDIUM.Duplicate.Title", { compendium: game.i18n.localize(pack.title) }), // FIXME: double localization
        icon: "fa-solid fa-copy"
      },
      position: {
        top: Math.min(li.offsetTop, window.innerHeight - 350),
        left: window.innerWidth - 720,
        width: 480
      },
      yes: {
        label: "COMPENDIUM.Duplicate.Submit",
        callback: (event, button) => new FormDataExtended(button.form).object,
        default: true
      },
      no: { label: "Cancel" }
    }) || {};
    if ( label ) return pack.duplicateCompendium({ label });
  }

  /* -------------------------------------------- */

  /**
   * Handle toggling a compendium type filter.
   * @param {PointerEvent} event  The triggering event.
   * @param {string} [type]       The compendium type to filter by. If omitted, clear all filters.
   * @protected
   */
  _onToggleCompendiumFilterType(event, type) {
    if ( type ) {
      if ( this.#activeFilters.has(type) ) this.#activeFilters.delete(type);
      else this.#activeFilters.add(type);
    }
    else this.#activeFilters.clear();
    return this.render();
  }

  /* -------------------------------------------- */

  /**
   * Handle toggling a folder's expanded state.
   * @this {CompendiumDirectory}
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
   * @protected
   */
  _onToggleFolder(event, target) {
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
   * Handle toggling locked state on a compendium.
   * @param {HTMLElement} li  The compendium target element.
   * @returns {Promise<boolean|void>}
   * @protected
   */
  async _onToggleLock(li) {
    const pack = game.packs.get(li.dataset.pack);
    if ( !pack.locked ) return pack.configure({ locked: true });
    const { packageType, packageName } = pack.metadata;
    // Module compendiums without a manifest or download link are not in danger of being updated, and are probably user-
    // created.
    const module = game.modules.get(packageName);
    const localPack = (packageType === "module") && module && !module.download && !module.manifest;
    const skipConfirmation = (packageType === "world") || localPack;
    const alert = game.i18n.localize("Warning");
    const warning = game.i18n.localize("COMPENDIUM.ToggleLocked.Warning");
    const result = skipConfirmation ? "unlock" : await DialogV2.wait({
      window: {
        title: game.i18n.format("COMPENDIUM.ToggleLocked.Title", { compendium: pack.title }), // FIXME: double localization
        icon: "fa-solid fa-lock"
      },
      position: {
        top: Math.min(li.offsetTop, window.innerHeight - 350),
        left: window.innerWidth - 800,
        width: 480
      },
      content: `<p><strong>${alert}:</strong> ${warning}</p>`,
      buttons: [{
        action: "duplicate",
        label: "SIDEBAR.Duplicate",
        icon: "fa-solid fa-copy fa-fw"
      }, {
        action: "unlock",
        label: "COMPENDIUM.ToggleLocked.Unlock",
        icon: "fa-solid fa-lock-open fa-fw"
      }, {
        action: "cancel",
        label: "Cancel",
        icon: "fa-solid fa-xmark fa-fw"
      }]
    });
    switch ( result ) {
      case "duplicate": return this._onDuplicateCompendium(li);
      case "unlock": return pack.configure({ locked: false });
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle toggling the sort mode.
   * @this {CompendiumDirectory}
   */
  static #onToggleSort() {
    game.packs.toggleSortingMode();
    return this.render();
  }

  /* -------------------------------------------- */
  /*  Search & Filter                             */
  /* -------------------------------------------- */

  /**
   * Handle matching a given directory entry with the search filter.
   * @param {string} query          The input search string.
   * @param {Set<string>} packs     The matched pack IDs.
   * @param {HTMLElement} element   The candidate entry element.
   * @param {object} [options]      Additional options for subclass-specific behavior.
   * @protected
   */
  _onMatchSearchEntry(query, packs, element, options={}) {
    element.style.display = !query || packs.has(element.dataset.pack) ? "flex" : "none";
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
    const packs = new Set();
    const folderIds = new Set();
    const autoExpandIds = new Set();
    const options = {};

    // Match entries and folders.
    if ( query ) {
      // First match folders.
      this._matchSearchFolders(rgx, folderIds, autoExpandIds, options);

      // Next match entries.
      this._matchSearchEntries(rgx, packs, folderIds, autoExpandIds, options);
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
      else this._onMatchSearchEntry(query, packs, el, options);
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
    if ( typeof folder === "string" ) folder = game.packs.folders.get(folder);
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
   * @param {Set<string>} packs          The set of matched pack IDs.
   * @param {Set<string>} folderIds      The set of matched folder IDs.
   * @param {Set<string>} autoExpandIds  The set of folder IDs that should be auto-expanded.
   * @param {object} [options]           Additional options for subclass-specific behavior.
   * @protected
   */
  _matchSearchEntries(query, packs, folderIds, autoExpandIds, options={}) {
    // Copy the folderIds to a new set, so that we can add to the original set without incorrectly adding child entries.
    const matchedFolderIds = new Set(folderIds);

    for ( const pack of game.packs ) {
      const { collection, folder, title } = pack;

      // If we matched a folder, add its child entries.
      if ( matchedFolderIds.has(folder?.id) ) packs.add(collection);

      // Otherwise, if we are searching by name, match the entry name.
      else if ( query.test(foundry.applications.ux.SearchFilter.cleanQuery(title)) ) {
        packs.add(collection);
        this.#onMatchFolder(folder, folderIds, autoExpandIds);
      }
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
    for ( const folder of game.packs.folders ) {
      if ( query.test(foundry.applications.ux.SearchFilter.cleanQuery(folder.name)) ) {
        this.#onMatchFolder(folder, folderIds, autoExpandIds, { autoExpand: false });
      }
    }
  }

  /* -------------------------------------------- */
  /*  Drag & Drop                                 */
  /* -------------------------------------------- */

  /**
   * Determine if the given user has permission to drop entries into the compendium directory.
   * @param {string} selector  The CSS selector of the dragged element.
   * @returns {boolean}
   * @protected
   */
  _canDragDrop(selector) {
    return game.user.isGM;
  }

  /* -------------------------------------------- */

  /**
   * Determine if the given user has permission to drag packs and folders in the directory.
   * @param {string} selector  The CSS selector of the target element.
   * @returns {boolean}
   * @protected
   */
  _canDragStart(selector) {
    return game.user.isGM;
  }

  /* -------------------------------------------- */

  /**
   * Test if the given pack is already present in this directory.
   * @param {CompendiumCollection} pack  The compendium pack.
   * @returns {boolean}
   * @protected
   */
  _entryAlreadyExists(pack) {
    return game.packs.has(pack.collection);
  }

  /* -------------------------------------------- */

  /**
   * Determine whether a given directory entry belongs to the given folder.
   * @param {CompendiumCollection} pack  The compendium pack.
   * @param {string|undefined} folder    The target folder ID.
   * @returns {boolean}
   * @protected
   */
  _entryBelongsToFolder(pack, folder) {
    if ( !pack.folder && !folder ) return true;
    return !!folder && (pack.folder?.id === folder);
  }

  /* -------------------------------------------- */

  /**
   * Get the pack instance from its dropped data.
   * @param {object} data  The drag data.
   * @returns {Promise<CompendiumCollection>}
   * @protected
   */
  _getDroppedEntryFromData(data) {
    return game.packs.get(data.collection);
  }

  /* -------------------------------------------- */

  /**
   * Get drag data for a compendium in this directory.
   * @param {string} collection  The pack's collection ID.
   * @protected
   */
  _getEntryDragData(collection) {
    return { collection, type: "Compendium" };
  }

  /* -------------------------------------------- */

  /**
   * Get drag data for a folder in this directory.
   * @param {string} folderId  The folder ID.
   * @protected
   */
  _getFolderDragData(folderId) {
    return game.packs.folders.get(folderId).toDragData();
  }

  /* -------------------------------------------- */

  /**
   * Handle dropping a new pack into this directory.
   * @param {HTMLElement} target  The drop target element.
   * @param {object} data         The drop data.
   * @returns {Promise<void>}
   * @protected
   */
  async _handleDroppedEntry(target, data) {
    const closestFolder = target?.closest(".directory-item.folder");
    closestFolder?.classList.remove("droptarget");
    let folder = (await fromUuid(closestFolder?.dataset.uuid))?.id;
    const pack = await this._getDroppedEntryFromData(data);
    if ( !pack ) return;

    // Sort relative to another entry.
    const sortData = { sortKey: "sort" };
    const relativePack = target?.dataset.pack;
    if ( relativePack ) {
      if ( pack.collection === relativePack ) return; // Don't drop on yourself.
      const targetPack = game.packs.get(relativePack);
      sortData.target = targetPack;
      folder = targetPack?.folder?.id;
    }

    // Sort within the closest folder.
    else sortData.target = null;

    // Determine siblings.
    sortData.siblings = game.packs.filter(p => {
      return (p.collection !== pack.collection) && this._entryBelongsToFolder(p, folder);
    });

    if ( !this._entryAlreadyExists(pack) ) return;

    // Resort the collection.
    sortData.updateData = { folder: folder || null };
    return this._sortRelative(pack, sortData);
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
    const { folder, sortData, foreign } = (await DocumentDirectory._handleDroppedFolder(target, data, {
      folders: game.packs.folders,
      label: "PACKAGE.TabCompendium",
      maxFolderDepth: CONST.FOLDER_MAX_DEPTH,
      type: "Compendium"
    })) ?? {};

    if ( !folder || foreign ) return;
    sortData.updateData = { folder: sortData.parentId };
    return folder.sortRelative(sortData);
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
    const { pack, folderId } = event.currentTarget.dataset;
    const dragData = folderId ? this._getFolderDragData(folderId) : this._getEntryDragData(pack);
    event.dataTransfer.setData("text/plain", JSON.stringify(dragData));
  }

  /* -------------------------------------------- */

  /** @override */
  _onDrop(event) {
    const data = TextEditor.implementation.getDragEventData(event);
    if ( !data.type ) return;
    const target = event.target.closest(".directory-item") ?? null;
    if ( data.type === "Folder" ) return this._handleDroppedFolder(target, data);
    else if ( data.type === "Compendium" ) return this._handleDroppedEntry(target, data);
  }

  /* -------------------------------------------- */

  /**
   * Handle sorting a compendium pack relative to others in the directory.
   * @param {CompendiumCollection} pack  The compendium pack.
   * @param {object} sortData            Sort data.
   * @protected
   */
  _sortRelative(pack, sortData) {
    const packConfig = game.settings.get("core", CompendiumCollection.CONFIG_SETTING);
    const { folder } = sortData.updateData;
    packConfig[pack.collection] = foundry.utils.mergeObject(packConfig[pack.collection] || {}, { folder });
    const sorting = foundry.utils.performIntegerSort(pack, sortData);
    for ( const { target, update } of sorting ) {
      const config = packConfig[target.collection] ??= {};
      config.sort = update.sort;
    }
    game.settings.set("core", CompendiumCollection.CONFIG_SETTING, packConfig);
  }
}

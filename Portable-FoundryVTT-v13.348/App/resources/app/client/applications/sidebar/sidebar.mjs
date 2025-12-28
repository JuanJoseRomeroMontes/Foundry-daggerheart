import HandlebarsApplicationMixin from "../api/handlebars-application.mjs";
import ApplicationV2 from "../api/application.mjs";
import Hooks from "@client/helpers/hooks.mjs";

/**
 * @import {ApplicationConfiguration, ApplicationRenderContext} from "../_types.mjs"
 * @import {HandlebarsRenderOptions} from "../api/handlebars-application.mjs"
 */

/**
 * @typedef SidebarTabDescriptor
 * @property {string} [tooltip]       The tab's tooltip.
 * @property {string} [icon]          The tab's Font Awesome icon class.
 * @property {string} [documentName]  A Document name to retrieve tooltip and icon information from automatically.
 * @property {boolean} [gmOnly]       Whether the tab is only rendered for GM users.
 */

/**
 * The main sidebar application.
 * @extends {ApplicationV2<ApplicationConfiguration, HandlebarsRenderOptions>}
 * @mixes HandlebarsApplication
 */
export default class Sidebar extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @override */
  static DEFAULT_OPTIONS = {
    id: "sidebar",
    tag: "aside",
    window: {
      frame: false,
      positioned: false
    },
    actions: {
      toggleState: Sidebar.#onToggleState
    }
  };

  /**
   * Tab configuration.
   * @type {Record<string, SidebarTabDescriptor>}
   */
  static TABS = {
    chat: {
      documentName: "ChatMessage"
    },
    combat: {
      documentName: "Combat"
    },
    scenes: {
      documentName: "Scene",
      gmOnly: true
    },
    actors: {
      documentName: "Actor"
    },
    items: {
      documentName: "Item"
    },
    journal: {
      documentName: "JournalEntry",
      tooltip: "SIDEBAR.TabJournal"
    },
    tables: {
      documentName: "RollTable"
    },
    cards: {
      documentName: "Cards"
    },
    macros: {
      documentName: "Macro"
    },
    playlists: {
      documentName: "Playlist"
    },
    compendium: {
      tooltip: "SIDEBAR.TabCompendium",
      icon: "fa-solid fa-book-atlas"
    },
    settings: {
      tooltip: "SIDEBAR.TabSettings",
      icon: "fa-solid fa-gears"
    }
  };

  /** @override */
  tabGroups = {primary: "chat"};

  /** @override */
  static PARTS = {
    tabs: {
      id: "tabs",
      template: "templates/sidebar/tabs.hbs"
    }
  };

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * The sidebar content.
   * @type {HTMLElement}
   */
  #content;

  /**
   * Whether the sidebar is currently expanded.
   * @type {boolean}
   */
  get expanded() {
    return this.#content.classList.contains("expanded");
  }

  /**
   * The currently popped-out sidebar tabs.
   * @type {Record<string, SidebarTab|AbstractSidebarTab>}
   */
  popouts = {};

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _configureRenderOptions(options) {
    for ( const id of Object.keys(this.constructor.TABS) ) {
      this.constructor.PARTS[id] = { template: "templates/sidebar/tab.hbs" };
    }
    super._configureRenderOptions(options);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    const content = this.#content = document.createElement("div");
    content.id = "sidebar-content";
    content.classList.add("flexcol", "active-chat");
    this.element.append(content);
    content.append(...this.element.querySelectorAll(":scope > template"));
    await this.#renderTabs(Object.keys(this.constructor.TABS));
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    if ( partId === "tabs" ) await this._prepareTabContext(context, options);
    context.partId = partId;
    return context;
  }

  /* -------------------------------------------- */

  /**
   * Prepare render context for the tabs.
   * @param {ApplicationRenderContext} context  Shared context provided by _prepareContext.
   * @param {HandlebarsRenderOptions} options   Options for configuring rendering behavior.
   * @protected
   */
  async _prepareTabContext(context, options) {
    context.tabs = Object.entries(this.constructor.TABS).reduce((obj, [k, v]) => {
      let { documentName, gmOnly, tooltip, icon } = v;
      if ( gmOnly && !game.user.isGM ) return obj;
      if ( documentName ) {
        tooltip ??= getDocumentClass(documentName).metadata.labelPlural;
        icon ??= CONFIG[documentName]?.sidebarIcon;
      }
      obj[k] = { tooltip, icon };
      obj[k].active = this.tabGroups.primary === k;
      return obj;
    }, {});
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _renderHTML(context, options) {
    // If this is the first render, generate stub elements that each tab may render itself into.
    if ( options.isFirstRender ) return super._renderHTML(context, options);

    // Otherwise re-render the tabs that were requested.
    await this.#renderTabs(options.parts);
    return {};
  }

  /* -------------------------------------------- */

  /**
   * Render the requested sidebar tabs.
   * @param {string[]} tabs  The IDs of the tabs to render.
   */
  async #renderTabs(tabs) {
    const promises = [];
    for ( const id of tabs ) {
      const tab = ui[id];
      if ( !tab ) continue;
      // TODO: When all tabs are converted to App V2 we can remove this line.
      const fn = tab._render ?? tab.render;
      promises.push(fn.call(tab, true).catch(err => Hooks.onError("Sidebar#render", err, {
        msg: `Failed to render Sidebar tab ${id}`,
        log: "error",
        name: id
      })));
    }
    return Promise.allSettled(promises);
  }

  /* -------------------------------------------- */
  /*  Event Listeners & Handlers                  */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _onClickTab(event) {
    const target = event.target.closest("[data-tab]");
    const { tab } = target?.dataset ?? {};
    const app = ui[tab];
    if ( app && (event.button === 2) ) app.renderPopout();
    else {
      const wasActive = target?.ariaPressed === "true";
      super._onClickTab(event);
      if ( this.expanded && wasActive ) this.collapse();
      else if ( !this.expanded ) this.expand();
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle collapsing or expanding the sidebar.
   * @this {Sidebar}
   */
  static #onToggleState() {
    this.toggleExpanded();
  }

  /* -------------------------------------------- */
  /*  Public API                                  */
  /* -------------------------------------------- */

  /** @inheritDoc */
  changeTab(tab, group, options={}) {
    const prev = ui[this.tabGroups[group]];
    if ( prev === ui[tab] ) return;
    super.changeTab(tab, group, options);
    prev?._doEvent?.(prev._onDeactivate, { eventName: "deactivate", hookName: "deactivate" });
    const next = ui[tab];
    next?._doEvent?.(next._onActivate, { eventName: "activate", hookName: "activate" });
    Hooks.callAll("changeSidebarTab", ui[tab]);
    this.#content.className = this.#content.className.replace(/active-\w+/, "");
    this.#content.classList.add(`active-${tab}`);
  }

  /* -------------------------------------------- */

  /**
   * Collapse the sidebar.
   */
  collapse() {
    this.toggleExpanded(false);
  }

  /* -------------------------------------------- */

  /**
   * Expand the sidebar.
   */
  expand() {
    this.toggleExpanded(true);
  }

  /* -------------------------------------------- */

  /**
   * Toggle the expanded state of the sidebar.
   * @param {boolean} [expanded]  Force the expanded state to the provided value, otherwise toggle the state.
   * @fires {hookEvents:collapseSidebar}
   */
  toggleExpanded(expanded) {
    expanded ??= !this.expanded;
    const expander = this.element.querySelector('.tabs [data-action="toggleState"]');
    expander.classList.remove("fa-caret-left", "fa-caret-right");
    expander.classList.add(`fa-caret-${expanded ? "right" : "left"}`);
    expander.dataset.tooltip = expanded ? "Collapse" : "Expand";
    expander.ariaLabel = game.i18n.localize(expander.dataset.tooltip);
    this.#content.classList.toggle("expanded", expanded);
    ui.chat._toggleNotifications();
    Hooks.callAll("collapseSidebar", this, !expanded);
  }

  /* -------------------------------------------- */
  /*  Deprecations                                */
  /* -------------------------------------------- */

  /**
   * @deprecated since v13
   * @ignore
   */
  activateTab(tabName) {
    foundry.utils.logCompatibilityWarning("Sidebar#activateTab is deprecated. Please use Sidebar#changeTab instead.", {
      since: 13, until: 15
    });
    this.changeTab(tabName, "primary");
  }
}

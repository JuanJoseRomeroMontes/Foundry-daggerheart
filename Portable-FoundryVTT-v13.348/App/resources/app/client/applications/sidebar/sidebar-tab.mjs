import ApplicationV2 from "../api/application.mjs";

/**
 * @import {ApplicationConfiguration, ApplicationRenderOptions} from "../_types.mjs"
 */

/**
 * The sidebar tab interface that allows any sidebar tab to also be rendered as a popout.
 * @template {ApplicationConfiguration} [Configuration=ApplicationConfiguration]
 * @template {ApplicationRenderOptions} [RenderOptions=ApplicationRenderOptions]
 * @extends {ApplicationV2<Configuration, RenderOptions>}
 */
export default class AbstractSidebarTab extends ApplicationV2 {

  /**
   * The base name of the sidebar tab.
   * @type {string}
   * @abstract
   */
  static tabName;

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    tag: "section",
    classes: ["tab", "sidebar-tab"],
    window: {
      frame: false,
      positioned: false
    }
  };

  /** @override */
  static emittedEvents = Object.freeze(["render", "close", "position", "activate", "deactivate"]);

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * Whether this tab is currently active in the sidebar.
   * @type {boolean}
   */
  get active() {
    return ui.sidebar?.tabGroups.primary === this.tabName;
  }

  /**
   * Whether this is the popped-out tab or the in-sidebar one.
   * @type {boolean}
   */
  get isPopout() {
    return this.options.window.frame;
  }

  /**
   * A reference to the popped-out version of this tab, if one exists.
   * @type {AbstractSidebarTab|void}
   */
  get popout() {
    return this.#popout?.deref();
  }

  /**
   * A weak reference to the popped-out version of this tab, allowing it to be garbage-collected when closed.
   * @type {WeakRef<AbstractSidebarTab>}
   */
  #popout;

  /**
   * The base name of the sidebar tab.
   * @type {string}
   */
  get tabName() {
    return this.constructor.tabName;
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _initializeApplicationOptions(options) {
    options.id ??= this.tabName;
    const applicationOptions = super._initializeApplicationOptions(options);
    if ( !applicationOptions.window.frame ) {
      applicationOptions.classes.push(`${this.tabName}-sidebar`);
      if ( this.active ) applicationOptions.classes.push("active");
    }
    return applicationOptions;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.user = game.user;
    return context;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _renderFrame(options) {
    const frame = await super._renderFrame(options);
    if ( !this.options.window?.frame ) Object.assign(frame.dataset, { tab: this.tabName, group: "primary" });
    return frame;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async render(options, _options) {
    if ( this.popout?.rendered ) this.popout.render(options, _options);
    return super.render(options, _options);
  }

  /* -------------------------------------------- */
  /*  Public API                                  */
  /* -------------------------------------------- */

  /**
   * Activate this tab in the sidebar.
   */
  activate() {
    if ( this.isPopout ) this.bringToFront();
    else {
      ui.sidebar.changeTab(this.tabName, "primary");
      if ( !ui.sidebar.expanded ) ui.sidebar.expand();
    }
  }

  /* -------------------------------------------- */

  /**
   * Pop-out this sidebar tab as a new application.
   * @returns {Promise<AbstractSidebarTab>}
   */
  renderPopout() {
    if ( this.popout ) return this.popout.render({ force: true });
    const options = foundry.utils.mergeObject(this.options, {
      id: `${this.tabName}-popout`,
      window: {
        frame: true,
        positioned: true,
        minimizable: true
      }
    }, { inplace: false });
    options.classes.push("sidebar-popout");
    this.#popout = new WeakRef(new this.constructor(options));
    return this.popout.render({ force: true });
  }

  /* -------------------------------------------- */
  /*  Events                                      */
  /* -------------------------------------------- */

  /**
   * Actions performed when this tab is activated in the sidebar.
   * @protected
   */
  _onActivate() {}

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onClose(options) {
    super._onClose(options);
    if ( this.isPopout ) delete ui.sidebar.popouts[this.tabName];
  }

  /* -------------------------------------------- */

  /**
   * Actions performed when this tab is deactivated in the sidebar.
   * @protected
   */
  _onDeactivate() {}

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    if ( this.isPopout ) ui.sidebar.popouts[this.tabName] = this;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onRender(context, options) {
    await super._onRender(context, options);
    if ( !this.isPopout || this.options.classes.includes("themed") ) return;
    this.element.classList.remove("theme-light", "theme-dark");
    const { colorScheme } = game.settings.get("core", "uiConfig");
    if ( colorScheme.interface ) this.element.classList.add("themed", `theme-${colorScheme.interface}`);
  }
}

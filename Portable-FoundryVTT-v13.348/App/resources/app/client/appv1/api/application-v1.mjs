import {Draggable, DragDrop, SearchFilter, Tabs} from "@client/applications/ux/_module.mjs";
import Hooks from "@client/helpers/hooks.mjs";

/**
 * @import {TabsConfiguration} from "@client/applications/ux/tabs.mjs";
 * @import {DragDropConfiguration} from "@client/applications/ux/drag-drop.mjs";
 * @import {SearchFilterConfiguration} from "@client/applications/ux/search-filter.mjs";
 * @import ContextMenu from "@client/applications/ux/context-menu.mjs";
 * @import ApplicationV2 from "@client/applications/api/application.mjs";
 */

const MIN_WINDOW_WIDTH = 200;
const MIN_WINDOW_HEIGHT = 50;

/**
 * @typedef ApplicationV1Options
 * Configuration options which control how the application is rendered. Application subclasses may add additional
 * supported options, but these base configurations are supported for all Applications. The values passed to the
 * constructor are combined with the defaultOptions defined at the class level.
 * @property {string|null} [baseApplication]  A named "base application" which generates an additional hook
 * @property {number|null} [width]         The default pixel width for the rendered HTML
 * @property {number|string|null} [height]  The default pixel height for the rendered HTML
 * @property {number|null} [top]           The default offset-top position for the rendered HTML
 * @property {number|null} [left]          The default offset-left position for the rendered HTML
 * @property {number|null} [scale]         A transformation scale for the rendered HTML
 * @property {boolean} [popOut]            Whether to display the application as a pop-out container
 * @property {boolean} [minimizable]       Whether the rendered application can be minimized (popOut only)
 * @property {boolean} [resizable]         Whether the rendered application can be drag-resized (popOut only)
 * @property {string} [id]                 The default CSS id to assign to the rendered HTML
 * @property {string[]} [classes]          An array of CSS string classes to apply to the rendered HTML
 * @property {string} [title]              A default window title string (popOut only)
 * @property {string|null} [template]      The default HTML template path to render for this Application
 * @property {string[]} [scrollY]          A list of unique CSS selectors which target containers that should have their
 *                                         vertical scroll positions preserved during a re-render.
 * @property {TabsConfiguration[]} [tabs]  An array of tabbed container configurations which should be enabled for the
 *                                         application.
 * @property {DragDropConfiguration[]} dragDrop An array of CSS selectors for configuring the application's
 *                                              {@link foundry.applications.ux.DragDrop} behaviour.
 * @property {SearchFilterConfiguration[]} filters  An array of
 *   {@link foundry.applications.ux.SearchFilter} configuration objects.
 */

/**
 * @typedef {{label: string, class: string, icon: string, [tooltip]: string,
 *   onclick: Function|null}} ApplicationV1HeaderButton
 */

/**
 * The legacy application window that is rendered for some UI elements in Foundry VTT.
 * @abstract
 * @deprecated since v13
 */
export default class Application {
  /**
   * @param {ApplicationV1Options} [options] Configuration options which control how the application is rendered.
   */
  constructor(options={}) {

    /** @deprecated since v13 until v16 */
    if ( !this.constructor._warnedAppV1 ) {
      foundry.utils.logCompatibilityWarning("The V1 Application framework is deprecated, and will be removed in a "
        + "later core software version. Please use the V2 version of the Application framework available under "
        + "foundry.applications.api.ApplicationV2.", { since: 13, until: 16, once: true });
      this.constructor._warnedAppV1 = true;
    }

    /**
     * The options provided to this application upon initialization
     * @type {object}
     */
    this.options = foundry.utils.mergeObject(this.constructor.defaultOptions, options, {
      insertKeys: true,
      insertValues: true,
      overwrite: true,
      inplace: false
    });

    // Force .theme-light for legacy ApplicationV1 instances
    // TODO: Remove when all setup apps are replaced with AppV2.
    const isSetup = game?.constructor.name === "Setup";
    if ( !this.options.classes.includes("theme-dark") && !isSetup ) this.options.classes.push("themed", "theme-light");

    /**
     * An internal reference to the HTML element this application renders
     * @type {jQuery}
     * @internal
     */
    this._element = null;

    /**
     * Track the current position and dimensions of the Application UI
     * @type {object}
     */
    this.position = {
      width: this.options.width,
      height: this.options.height,
      left: this.options.left,
      top: this.options.top,
      scale: this.options.scale,
      zIndex: 0
    };

    /**
     * DragDrop workflow handlers which are active for this Application
     * @type {DragDrop[]}
     * @internal
     */
    this._dragDrop = this._createDragDropHandlers();

    /**
     * Tab navigation handlers which are active for this Application
     * @type {Tabs[]}
     * @internal
     */
    this._tabs = this._createTabHandlers();

    /**
     * SearchFilter handlers which are active for this Application
     * @type {SearchFilter[]}
     * @internal
     */
    this._searchFilters = this._createSearchFilters();

    /**
     * Track whether the Application is currently minimized
     * @type {boolean|null}
     * @internal
     */
    this._minimized = false;

    /**
     * The current render state of the Application
     * @see {@link Application.RENDER_STATES}
     * @type {number}
     * @protected
     */
    this._state = Application.RENDER_STATES.NONE;

    /**
     * The prior render state of this Application.
     * This allows for rendering logic to understand if the application is being rendered for the first time.
     * @see {Application.RENDER_STATES}
     * @type {number}
     * @protected
     */
    this._priorState = this._state;

    /**
     * Track the most recent scroll positions for any vertically scrolling containers
     * @type {object | null}
     * @internal
     */
    this._scrollPositions = null;
  }

  static _warnedAppV1 = false;

  /**
   * The application ID is a unique incrementing integer which is used to identify every application window
   * drawn by the VTT
   * @type {number}
   */
  appId;

  /**
   * The sequence of rendering states that track the Application life-cycle.
   * @enum {number}
   */
  static RENDER_STATES = Object.freeze({
    ERROR: -3,
    CLOSING: -2,
    CLOSED: -1,
    NONE: 0,
    RENDERING: 1,
    RENDERED: 2
  });

  /* -------------------------------------------- */

  /**
   * Create drag-and-drop workflow handlers for this Application
   * @returns {DragDrop[]}     An array of DragDrop handlers
   * @internal
   */
  _createDragDropHandlers() {
    return this.options.dragDrop.map(d => {
      d.permissions = {
        dragstart: this._canDragStart.bind(this),
        drop: this._canDragDrop.bind(this)
      };
      d.callbacks = {
        dragstart: this._onDragStart.bind(this),
        dragover: this._onDragOver.bind(this),
        drop: this._onDrop.bind(this)
      };
      return new DragDrop.implementation(d);
    });
  }

  /* -------------------------------------------- */

  /**
   * Create tabbed navigation handlers for this Application
   * @returns {Tabs[]}     An array of Tabs handlers
   * @internal
   */
  _createTabHandlers() {
    return this.options.tabs.map(t => {
      t.callback = this._onChangeTab.bind(this);
      return new Tabs(t);
    });
  }

  /* -------------------------------------------- */

  /**
   * Create search filter handlers for this Application
   * @returns {SearchFilter[]}  An array of SearchFilter handlers
   * @internal
   */
  _createSearchFilters() {
    return this.options.filters.map(f => {
      f.callback = this._onSearchFilter.bind(this);
      return new SearchFilter(f);
    });
  }

  /* -------------------------------------------- */

  /**
   * Assign the default options configuration which is used by this Application class. The options and values defined
   * in this object are merged with any provided option values which are passed to the constructor upon initialization.
   * Application subclasses may include additional options which are specific to their usage.
   * @returns {ApplicationV1Options}
   */
  static get defaultOptions() {
    return {
      baseApplication: null,
      width: null,
      height: null,
      top: null,
      left: null,
      scale: null,
      popOut: true,
      minimizable: true,
      resizable: false,
      id: "",
      classes: [],
      dragDrop: [],
      tabs: [],
      filters: [],
      title: "",
      template: null,
      scrollY: []
    };
  }

  /* -------------------------------------------- */

  /**
   * Return the CSS application ID which uniquely references this UI element
   * @type {string}
   */
  get id() {
    return this.options.id ? this.options.id : `app-${this.appId}`;
  }

  /* -------------------------------------------- */

  /**
   * Return the active application element, if it currently exists in the DOM
   * @type {jQuery}
   */
  get element() {
    if ( this._element ) return this._element;
    const selector = `#${this.id}`;
    return $(selector);
  }

  /* -------------------------------------------- */

  /**
   * The path to the HTML template file which should be used to render the inner content of the app
   * @type {string}
   */
  get template() {
    return this.options.template;
  }

  /* -------------------------------------------- */

  /**
   * Control the rendering style of the application. If popOut is true, the application is rendered in its own
   * wrapper window, otherwise only the inner app content is rendered
   * @type {boolean}
   */
  get popOut() {
    return this.options.popOut ?? true;
  }

  /* -------------------------------------------- */

  /**
   * Return a flag for whether the Application instance is currently rendered
   * @type {boolean}
   */
  get rendered() {
    return this._state === Application.RENDER_STATES.RENDERED;
  }

  /* -------------------------------------------- */

  /**
   * Whether the Application is currently closing.
   * @type {boolean}
   */
  get closing() {
    return this._state === Application.RENDER_STATES.CLOSING;
  }

  /* -------------------------------------------- */

  /**
   * An Application window should define its own title definition logic which may be dynamic depending on its data
   * @type {string}
   */
  get title() {
    return game.i18n.localize(this.options.title);
  }

  /* -------------------------------------------- */
  /* Application rendering
  /* -------------------------------------------- */

  /**
   * An application should define the data object used to render its template.
   * This function may either return an Object directly, or a Promise which resolves to an Object
   * If undefined, the default implementation will return an empty object allowing only for rendering of static HTML
   * @param {object} options
   * @returns {object|Promise<object>}
   */
  getData(options={}) {
    return {};
  }

  /* -------------------------------------------- */

  /**
   * Render the Application by evaluating its HTML template against the object of data provided by the getData method
   * If the Application is rendered as a pop-out window, wrap the contained HTML in an outer frame with window controls
   *
   * @param {boolean} force   Add the rendered application to the DOM if it is not already present. If false, the
   *                          Application will only be re-rendered if it is already present.
   * @param {object} options  Additional rendering options which are applied to customize the way that the Application
   *                          is rendered in the DOM.
   *
   * @param {number} [options.left]           The left positioning attribute
   * @param {number} [options.top]            The top positioning attribute
   * @param {number} [options.width]          The rendered width
   * @param {number} [options.height]         The rendered height
   * @param {number} [options.scale]          The rendered transformation scale
   * @param {boolean} [options.focus=false]   Apply focus to the application, maximizing it and bringing it to the top
   *                                          of the vertical stack.
   * @param {string} [options.renderContext]  A context-providing string which suggests what event triggered the render
   * @param {object} [options.renderData]     The data change which motivated the render request
   *
   * @returns {Application}                 The rendered Application instance
   *
   */
  render(force=false, options={}) {
    this._render(force, options).catch(err => {
      this._state = Application.RENDER_STATES.ERROR;
      Hooks.onError("Application#render", err, {
        msg: `An error occurred while rendering ${this.constructor.name} ${this.appId}`,
        log: "error",
        ...options
      });
    });
    return this;
  }

  /* -------------------------------------------- */

  /**
   * An asynchronous inner function which handles the rendering of the Application
   * @fires renderApplication
   * @param {boolean} force     Render and display the application even if it is not currently displayed.
   * @param {object} options    Additional options which update the current values of the Application#options object
   * @returns {Promise<void>}   A Promise that resolves to the Application once rendering is complete
   * @protected
   */
  async _render(force=false, options={}) {

    // Do not render under certain conditions
    const states = Application.RENDER_STATES;
    this._priorState = this._state;
    if ( [states.CLOSING, states.RENDERING].includes(this._state) ) return;

    // Applications which are not currently rendered must be forced
    if ( !force && (this._state <= states.NONE) ) return;

    // Begin rendering the application
    if ( [states.NONE, states.CLOSED, states.ERROR].includes(this._state) ) {
      console.log(`${CONST.vtt} | Rendering ${this.constructor.name}`);
    }
    this._state = states.RENDERING;

    // Merge provided options with those supported by the Application class
    foundry.utils.mergeObject(this.options, options, { insertKeys: false });
    options.focus ??= force;

    // Get the existing HTML element and application data used for rendering
    const element = this.element;
    this.appId = element.data("appid") ?? ++foundry.applications.api.ApplicationV2._appId;
    if ( this.popOut ) ui.windows[this.appId] = this;
    const data = await this.getData(this.options);

    // Store scroll positions
    if ( element.length && this.options.scrollY ) this._saveScrollPositions(element);

    // Render the inner content
    const inner = await this._renderInner(data);
    let html = inner;

    // If the application already exists in the DOM, replace the inner content
    if ( element.length ) this._replaceHTML(element, html);

    // Otherwise render a new app
    else {

      // Wrap a popOut application in an outer frame
      if ( this.popOut ) {
        html = await this._renderOuter();
        html.find(".window-content").append(inner);
      }

      // Add the HTML to the DOM and record the element
      this._injectHTML(html);
    }

    if ( !this.popOut && this.options.resizable ) {
      new Draggable.implementation(this, html, false, this.options.resizable);
    }

    // Activate event listeners on the inner HTML
    this._activateCoreListeners(inner);
    this.activateListeners(inner);

    // Set the application position (if it's not currently minimized)
    if ( !this._minimized ) {
      foundry.utils.mergeObject(this.position, options, {insertKeys: false});
      this.setPosition(this.position);
    }

    // Apply focus to the application, maximizing it and bringing it to the top
    if ( this.popOut && (options.focus === true) ) this.maximize().then(() => this.bringToTop());

    // Dispatch Hooks for rendering the base and subclass applications
    this._callHooks("render", html, data);

    // Restore prior scroll positions
    if ( this.options.scrollY ) this._restoreScrollPositions(html);
    this._state = states.RENDERED;
  }

  /* -------------------------------------------- */

  /**
   * Return the inheritance chain for this Application class up to (and including) it's base Application class.
   * @returns {Function[]}
   * @internal
   */
  static _getInheritanceChain() {
    const parents = foundry.utils.getParentClasses(this);
    const base = this.defaultOptions.baseApplication;
    const chain = [this];
    for ( const cls of parents ) {
      chain.push(cls);
      if ( cls.name === base ) break;
    }
    return chain;
  }

  /* -------------------------------------------- */

  /**
   * Call all hooks for all applications in the inheritance chain.
   * @param {string|((className: string) => string)} hookName   The hook being triggered, which formatted
   *                                                            with the Application class name
   * @param {...*} hookArgs                                     The arguments passed to the hook calls
   * @protected
   */
  _callHooks(hookName, ...hookArgs) {
    const formatHook = typeof hookName === "string" ? className => `${hookName}${className}` : hookName;
    for ( const cls of this.constructor._getInheritanceChain() ) {
      if ( !cls.name ) continue;
      Hooks.callAll(formatHook(cls.name), this, ...hookArgs);
    }
  }

  /* -------------------------------------------- */

  /**
   * Persist the scroll positions of containers within the app before re-rendering the content
   * @param {jQuery} html           The HTML object being traversed
   * @protected
   */
  _saveScrollPositions(html) {
    const selectors = this.options.scrollY || [];
    this._scrollPositions = selectors.reduce((pos, sel) => {
      const el = html.find(sel);
      pos[sel] = Array.from(el).map(el => el.scrollTop);
      return pos;
    }, {});
  }

  /* -------------------------------------------- */

  /**
   * Restore the scroll positions of containers within the app after re-rendering the content
   * @param {jQuery} html           The HTML object being traversed
   * @protected
   */
  _restoreScrollPositions(html) {
    const selectors = this.options.scrollY || [];
    const positions = this._scrollPositions || {};
    for ( const sel of selectors ) {
      const el = html.find(sel);
      el.each((i, el) => el.scrollTop = positions[sel]?.[i] || 0);
    }
  }

  /* -------------------------------------------- */

  /**
   * Render the outer application wrapper
   * @returns {Promise<jQuery>}   A promise resolving to the constructed jQuery object
   * @protected
   */
  async _renderOuter() {

    // Gather basic application data
    const classes = this.options.classes;
    const windowData = {
      id: this.id,
      classes: classes.join(" "),
      appId: this.appId,
      title: this.title,
      headerButtons: this._getHeaderButtons()
    };

    // Render the template and return the promise
    let html = await foundry.applications.handlebars.renderTemplate("templates/app-window.html", windowData);
    html = $(html);

    // Activate header button click listeners after a slight timeout to prevent immediate interaction
    setTimeout(() => {
      html.find(".header-button").click(event => {
        event.preventDefault();
        const button = windowData.headerButtons.find(b => event.currentTarget.classList.contains(b.class));
        button.onclick(event);
      });
    }, 500);

    // Make the outer window draggable
    const header = html.find("header")[0];
    new Draggable.implementation(this, html, header, this.options.resizable);

    // Make the outer window minimizable
    if ( this.options.minimizable ) {
      header.addEventListener("dblclick", this._onToggleMinimize.bind(this));
    }

    // Set the outer frame z-index
    this.position.zIndex = Math.min(++foundry.applications.api.ApplicationV2._maxZ, 99999);
    html[0].style.zIndex = this.position.zIndex;
    ui.activeWindow = this;

    // Return the outer frame
    return html;
  }

  /* -------------------------------------------- */

  /**
   * Render the inner application content
   * @param {object} data         The data used to render the inner template
   * @returns {Promise<jQuery>}   A promise resolving to the constructed jQuery object
   * @internal
   */
  async _renderInner(data) {
    const html = await foundry.applications.handlebars.renderTemplate(this.template, data);
    if ( html === "" ) throw new Error(`No data was returned from template ${this.template}`);
    return $(html);
  }

  /* -------------------------------------------- */

  /**
   * Customize how inner HTML is replaced when the application is refreshed
   * @param {jQuery} element      The original HTML processed as a jQuery object
   * @param {jQuery} html         New updated HTML as a jQuery object
   * @internal
   */
  _replaceHTML(element, html) {
    if ( !element.length ) return;

    // For pop-out window, update the inner content and the window title
    if ( this.popOut ) {
      element.find(".window-content").html(html);
      let t = element.find(".window-title")[0];
      if ( t.hasChildNodes() ) t = t.childNodes[0];
      t.textContent = this.title;
    }

    // For regular applications, replace the whole thing
    else {
      element.replaceWith(html);
      this._element = html;
    }
  }

  /* -------------------------------------------- */

  /**
   * Customize how a new HTML Application is added and first appears in the DOM
   * @param {jQuery} html       The HTML element which is ready to be added to the DOM
   * @internal
   */
  _injectHTML(html) {
    $("body").append(html);
    this._element = html;
    html.hide().fadeIn(200);
  }

  /* -------------------------------------------- */

  /**
   * Specify the set of config buttons which should appear in the Application header.
   * Buttons should be returned as an Array of objects.
   * The header buttons which are added to the application can be modified by the getApplicationV1HeaderButtons hook.
   * @fires getApplicationHeaderButtons
   * @returns {ApplicationV1HeaderButton[]}
   * @protected
   */
  _getHeaderButtons() {
    const buttons = [
      {
        label: "Close",
        class: "close",
        icon: "fa-solid fa-xmark",
        onclick: () => this.close()
      }
    ];
    this._callHooks(className => `get${className}HeaderButtons`, buttons);
    return buttons;
  }

  /* -------------------------------------------- */

  /**
   * Create a {@link foundry.applications.ux.ContextMenu} for this Application.
   * @param {jQuery} html  The Application's HTML.
   * @internal
   */
  _contextMenu(html) {}

  /* -------------------------------------------- */
  /* Event Listeners and Handlers
  /* -------------------------------------------- */

  /**
   * Activate required listeners which must be enabled on every Application.
   * These are internal interactions which should not be overridden by downstream subclasses.
   * @param {jQuery} html
   * @protected
   */
  _activateCoreListeners(html) {
    const content = this.popOut ? html[0].parentElement : html[0];
    this._tabs.forEach(t => t.bind(content));
    this._dragDrop.forEach(d => d.bind(content));
    this._searchFilters.forEach(f => f.bind(content));
  }

  /* -------------------------------------------- */

  /**
   * After rendering, activate event listeners which provide interactivity for the Application.
   * This is where user-defined Application subclasses should attach their event-handling logic.
   * @param {jQuery} html
   */
  activateListeners(html) {}

  /* -------------------------------------------- */

  /**
   * Change the currently active tab
   * @param {string} tabName      The target tab name to switch to
   * @param {object} options      Options which configure changing the tab
   * @param {string} options.group    A specific named tab group, useful if multiple sets of tabs are present
   * @param {boolean} options.triggerCallback  Whether to trigger tab-change callback functions
   */
  activateTab(tabName, {group, triggerCallback=true}={}) {
    if ( !this._tabs.length ) throw new Error(`${this.constructor.name} does not define any tabs`);
    const tabs = group ? this._tabs.find(t => t.group === group) : this._tabs[0];
    if ( !tabs ) throw new Error(`Tab group "${group}" not found in ${this.constructor.name}`);
    tabs.activate(tabName, {triggerCallback});
  }

  /* -------------------------------------------- */

  /**
   * Handle changes to the active tab in a configured Tabs controller
   * @param {MouseEvent|null} event   A left click event
   * @param {Tabs} tabs               The Tabs controller
   * @param {string} active           The new active tab name
   * @protected
   */
  _onChangeTab(event, tabs, active) {
    this.setPosition();
  }

  /* -------------------------------------------- */

  /**
   * Handle changes to search filtering controllers which are bound to the Application
   * @param {KeyboardEvent} event   The key-up event from keyboard input
   * @param {string} query          The raw string input to the search field
   * @param {RegExp} rgx            The regular expression to test against
   * @param {HTMLElement} html      The HTML element which should be filtered
   * @protected
   */
  _onSearchFilter(event, query, rgx, html) {}

  /* -------------------------------------------- */

  /**
   * Define whether a user is able to begin a dragstart workflow for a given drag selector
   * @param {string} selector       The candidate HTML selector for dragging
   * @returns {boolean}             Can the current user drag this selector?
   * @protected
   */
  _canDragStart(selector) {
    return game.user.isGM;
  }

  /* -------------------------------------------- */

  /**
   * Define whether a user is able to conclude a drag-and-drop workflow for a given drop selector
   * @param {string} selector       The candidate HTML selector for the drop target
   * @returns {boolean}             Can the current user drop on this selector?
   * @protected
   */
  _canDragDrop(selector) {
    return game.user.isGM;
  }

  /* -------------------------------------------- */

  /**
   * Callback actions which occur at the beginning of a drag start workflow.
   * @param {DragEvent} event       The originating DragEvent
   * @protected
   */
  _onDragStart(event) {}

  /* -------------------------------------------- */

  /**
   * Callback actions which occur when a dragged element is over a drop target.
   * @param {DragEvent} event       The originating DragEvent
   * @protected
   */
  _onDragOver(event) {}

  /* -------------------------------------------- */

  /**
   * Callback actions which occur when a dragged element is dropped on a target.
   * @param {DragEvent} event       The originating DragEvent
   * @protected
   */
  _onDrop(event) {}

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /**
   * Bring the application to the top of the rendering stack
   */
  bringToTop() {
    if ( ui.activeWindow === this ) return;
    const element = this.element[0];
    const z = document.defaultView.getComputedStyle(element).zIndex;
    if ( z < foundry.applications.api.ApplicationV2._maxZ ) {
      this.position.zIndex = Math.min(++foundry.applications.api.ApplicationV2._maxZ, 99999);
      element.style.zIndex = this.position.zIndex;
      ui.activeWindow = this;
    }
  }

  /* -------------------------------------------- */

  /**
   * A convenience alias for {@link bringToTop} for when operating on an object that is either an Application or an
   * {@link ApplicationV2}
   */
  bringToFront() {
    this.bringToTop();
  }

  /* -------------------------------------------- */

  /**
   * Close the application and un-register references to it within UI mappings
   * This function returns a Promise which resolves once the window closing animation concludes
   * @fires closeApplication
   * @param {object} [options={}] Options which affect how the Application is closed
   * @returns {Promise<void>}     A Promise which resolves once the application is closed
   */
  async close(options={}) {
    const states = Application.RENDER_STATES;
    if ( this._state === states.CLOSED ) return;
    if ( !options.force && ![states.RENDERED, states.ERROR].includes(this._state) ) return;
    this._state = states.CLOSING;

    // Get the element
    const el = this.element;
    el.css({minHeight: 0});

    // Dispatch Hooks for closing the base and subclass applications
    this._callHooks("close", el);

    // Tear down SearchFilters
    for ( const filter of this._searchFilters ) {
      filter.unbind();
    }

    const cleanUp = () => {
      this._element = null;
      delete ui.windows[this.appId];
      this._minimized = false;
      this._scrollPositions = null;
      this._state = states.CLOSED;
    };

    // Animate closing the element
    if ( options.animate !== false ) {
      return new Promise(resolve => {
        el.slideUp(200, () => {
          el.remove();
          cleanUp();
          resolve();
        });
      });
    }

    // Clean up data
    cleanUp();
  }

  /* -------------------------------------------- */

  /**
   * Minimize the pop-out window, collapsing it to a small tab
   * Take no action for applications which are not of the pop-out variety or apps which are already minimized
   * @returns {Promise<void>}  A Promise which resolves once the minimization action has completed
   */
  async minimize() {
    if ( !this.rendered || !this.popOut || [true, null].includes(this._minimized) ) return;
    this._minimized = null;

    // Get content
    const window = this.element;
    const header = window.find(".window-header");
    const content = window.find(".window-content");
    this._saveScrollPositions(window);

    // Remove minimum width and height styling rules
    window.css({minWidth: 100, minHeight: 30});

    // Slide-up content
    content.slideUp(100);

    // Slide up window height
    return new Promise(resolve => {
      window.animate({height: `${header[0].offsetHeight+1}px`}, 100, () => {
        window.animate({width: MIN_WINDOW_WIDTH}, 100, () => {
          window.addClass("minimized");
          this._minimized = true;
          resolve();
        });
      });
    });
  }

  /* -------------------------------------------- */

  /**
   * Maximize the pop-out window, expanding it to its original size
   * Take no action for applications which are not of the pop-out variety or are already maximized
   * @returns {Promise<void>}    A Promise which resolves once the maximization action has completed
   */
  async maximize() {
    if ( !this.popOut || [false, null].includes(this._minimized) ) return;
    this._minimized = null;

    // Get content
    const window = this.element;
    const content = window.find(".window-content");

    // Expand window
    return new Promise(resolve => {
      window.animate({width: this.position.width, height: this.position.height}, 100, () => {
        content.slideDown(100, () => {
          window.removeClass("minimized");
          this._minimized = false;
          window.css({minWidth: "", minHeight: ""}); // Remove explicit dimensions
          content.css({display: ""});  // Remove explicit "block" display
          this.setPosition(this.position);
          this._restoreScrollPositions(window);
          resolve();
        });
      });
    });
  }

  /* -------------------------------------------- */

  /**
   * Set the application position and store its new location.
   * Returns the updated position object for the application containing the new values.
   * @param {object} position                   Positional data
   * @param {number|null} position.left            The left offset position in pixels
   * @param {number|null} position.top             The top offset position in pixels
   * @param {number|null} position.width           The application width in pixels
   * @param {number|string|null} position.height   The application height in pixels
   * @param {number|null} position.scale           The application scale as a numeric factor where 1.0 is default
   * @returns {{left: number, top: number, width: number, height: number, scale:number}|void}
   */
  setPosition({left, top, width, height, scale}={}) {
    if ( !this.popOut && !this.options.resizable ) return; // Only configure position for popout or resizable apps.
    const el = this.element[0];
    const currentPosition = this.position;
    const pop = this.popOut;
    const styles = window.getComputedStyle(el);
    if ( scale === null ) scale = 1;
    scale = scale ?? currentPosition.scale ?? 1;

    // If Height is "auto" unset current preference
    if ( (height === "auto") || (this.options.height === "auto") ) {
      el.style.height = "";
      height = null;
    }

    // Update width if an explicit value is passed, or if no width value is set on the element
    if ( !el.style.width || width ) {
      const tarW = width || el.offsetWidth;
      const minW = parseInt(styles.minWidth) || (pop ? MIN_WINDOW_WIDTH : 0);
      const maxW = el.style.maxWidth || (window.innerWidth / scale);
      currentPosition.width = width = Math.clamp(tarW, minW, maxW);
      el.style.width = `${width}px`;
      if ( ((width * scale) + currentPosition.left) > window.innerWidth ) left = currentPosition.left;
    }
    width = el.offsetWidth;

    // Update height if an explicit value is passed, or if no height value is set on the element
    if ( !el.style.height || height ) {
      const tarH = height || (el.offsetHeight + 1);
      const minH = parseInt(styles.minHeight) || (pop ? MIN_WINDOW_HEIGHT : 0);
      const maxH = el.style.maxHeight || (window.innerHeight / scale);
      currentPosition.height = height = Math.clamp(tarH, minH, maxH);
      el.style.height = `${height}px`;
      if ( ((height * scale) + currentPosition.top) > window.innerHeight + 1 ) top = currentPosition.top - 1;
    }
    height = el.offsetHeight;

    // Update Left
    if ( (pop && !el.style.left) || Number.isFinite(left) ) {
      const scaledWidth = width * scale;
      const tarL = Number.isFinite(left) ? left : (window.innerWidth - scaledWidth) / 2;
      const maxL = Math.max(window.innerWidth - scaledWidth, 0);
      currentPosition.left = left = Math.clamp(tarL, 0, maxL);
      el.style.left = `${left}px`;
    }

    // Update Top
    if ( (pop && !el.style.top) || Number.isFinite(top) ) {
      const scaledHeight = height * scale;
      const tarT = Number.isFinite(top) ? top : (window.innerHeight - scaledHeight) / 2;
      const maxT = Math.max(window.innerHeight - scaledHeight, 0);
      currentPosition.top = Math.clamp(tarT, 0, maxT);
      el.style.top = `${currentPosition.top}px`;
    }

    // Update Scale
    if ( scale ) {
      currentPosition.scale = Math.max(scale, 0);
      if ( scale === 1 ) el.style.transform = "";
      else el.style.transform = `scale(${scale})`;
    }

    // Return the updated position object
    return currentPosition;
  }

  /* -------------------------------------------- */

  /**
   * Handle application minimization behavior - collapsing content and reducing the size of the header
   * @param {Event} ev
   * @internal
   */
  _onToggleMinimize(ev) {
    ev.preventDefault();
    if ( this._minimized ) this.maximize(ev);
    else this.minimize(ev);
  }

  /* -------------------------------------------- */

  /**
   * Additional actions to take when the application window is resized
   * @param {Event} event
   * @internal
   */
  _onResize(event) {}

  /* -------------------------------------------- */

  /**
   * Wait for any images present in the Application to load.
   * @returns {Promise<void>}  A Promise that resolves when all images have loaded.
   * @protected
   */
  _waitForImages() {
    return new Promise(resolve => {
      let loaded = 0;
      const images = Array.from(this.element.find("img")).filter(img => !img.complete);
      if ( !images.length ) resolve();
      for ( const img of images ) {
        // eslint-disable-next-line no-loop-func
        img.onload = img.onerror = () => {
          loaded++;
          img.onload = img.onerror = null;
          if ( loaded >= images.length ) resolve();
        };
      }
    });
  }
}

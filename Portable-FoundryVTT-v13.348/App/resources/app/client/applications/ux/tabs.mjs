/**
 * @typedef TabsConfiguration
 * @property {string} [group]            The name of the tabs group
 * @property {string} navSelector        The CSS selector used to target the navigation element for these tabs
 * @property {string} contentSelector    The CSS selector used to target the content container for these tabs
 * @property {string} initial            The tab name of the initially active tab
 * @property {Function|null} [callback]  An optional callback function that executes when the active tab is changed
 */

/**
 * A controller class for managing tabbed navigation within an Application instance.
 * @see {@link foundry.applications.api.ApplicationV2}
 *
 * @example Configure tab-control for a set of HTML elements
 * ```html
 * <!-- Example HTML -->
 * <nav class="tabs" data-group="primary-tabs">
 *   <a class="item" data-tab="tab1" data-group="primary-tabs">Tab 1</li>
 *   <a class="item" data-tab="tab2" data-group="primary-tabs">Tab 2</li>
 * </nav>
 *
 * <section class="content">
 *   <div class="tab" data-tab="tab1" data-group="primary-tabs">Content 1</div>
 *   <div class="tab" data-tab="tab2" data-group="primary-tabs">Content 2</div>
 * </section>
 * ```
 * Activate tab control in JavaScript
 * ```js
 * const tabs = new foundry.applications.ux.Tabs({navSelector: ".tabs", contentSelector: ".content", initial: "tab1"});
 * tabs.bind(html);
 * ```
 */
export default class Tabs {
  /**
   * @param {TabsConfiguration} config The Tabs Configuration to use for this tabbed container
   */
  constructor({group, navSelector, contentSelector, initial, callback}={}) {

    /**
     * The name of the tabs group
     * @type {string}
     */
    this.group = group;

    /**
     * The value of the active tab
     * @type {string}
     */
    this.active = initial;

    /**
     * A callback function to trigger when the tab is changed
     * @type {Function|null}
     */
    this.callback = callback ?? null;

    this._navSelector = navSelector;
    this._contentSelector = contentSelector;
  }

  /* -------------------------------------------- */

  /**
   * The CSS selector used to target the tab navigation element
   * @type {string}
   * @internal
   */
  _navSelector;

  /* -------------------------------------------- */

  /**
   * A reference to the HTML navigation element the tab controller is bound to
   * @type {HTMLElement|null}
   * @internal
   */
  _nav = null;

  /* -------------------------------------------- */

  /**
   * The CSS selector used to target the tab content element
   * @type {string}
   * @internal
   */
  _contentSelector;

  /* -------------------------------------------- */

  /**
   * A reference to the HTML container element of the tab content
   * @type {HTMLElement|null}
   * @internal
   */
  _content = null;

  /* -------------------------------------------- */

  /**
   * Bind the Tabs controller to an HTML application
   * @param {HTMLElement} html
   */
  bind(html) {

    // Identify navigation element
    this._nav = html.querySelector(this._navSelector);
    if ( !this._nav ) return;

    // Identify content container
    if ( !this._contentSelector ) this._content = null;
    else if ( html.matches(this._contentSelector )) this._content = html;
    else this._content = html.querySelector(this._contentSelector);

    // Initialize the active tab
    this.activate(this.active);

    // Register listeners
    this._nav.addEventListener("click", this._onClickNav.bind(this));
  }

  /* -------------------------------------------- */

  /**
   * Activate a new tab by name
   * @param {string} tabName
   * @param {boolean} triggerCallback
   */
  activate(tabName, {triggerCallback=false}={}) {

    // Validate the requested tab name
    const group = this._nav.dataset.group;
    const items = this._nav.querySelectorAll("[data-tab]");
    if ( !items.length ) return;
    const valid = Array.from(items).some(i => i.dataset.tab === tabName);
    if ( !valid ) tabName = items[0].dataset.tab;

    // Change active tab
    for ( const i of items ) {
      i.classList.toggle("active", i.dataset.tab === tabName);
    }

    // Change active content
    if ( this._content ) {
      const tabs = this._content.querySelectorAll(".tab[data-tab]");
      for ( const t of tabs ) {
        if ( t.dataset.group && (t.dataset.group !== group) ) continue;
        t.classList.toggle("active", t.dataset.tab === tabName);
      }
    }

    // Store the active tab
    this.active = tabName;

    // Optionally trigger the callback function
    if ( triggerCallback ) this.callback?.(null, this, tabName);
  }

  /* -------------------------------------------- */

  /**
   * Handle click events on the tab navigation entries
   * @param {PointerEvent} event    A left click event
   * @protected
   */
  _onClickNav(event) {
    const tab = event.target.closest("[data-tab]");
    if ( !tab ) return;
    event.preventDefault();
    const tabName = tab.dataset.tab;
    if ( tabName !== this.active ) this.activate(tabName, {triggerCallback: true});
  }
}

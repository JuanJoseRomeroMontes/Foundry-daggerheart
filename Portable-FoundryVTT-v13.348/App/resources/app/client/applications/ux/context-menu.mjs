
/**
 * @import Application from "@client/appv1/api/application-v1.mjs"
 */

/**
 * @typedef ContextMenuEntry
 * @property {string} name                              The context menu label. Can be localized.
 * @property {string} [icon]                            A string containing an HTML icon element for the menu item.
 * @property {string} [classes]                         Additional CSS classes to apply to this menu item.
 * @property {string} [group]                           An identifier for a group this entry belongs to.
 * @property {ContextMenuJQueryCallback} callback       The function to call when the menu item is clicked.
 * @property {ContextMenuCondition|boolean} [condition] A function to call or boolean value to determine if this entry
 *                                                      appears in the menu.
 */

/**
 * @callback ContextMenuCondition
 * @param {jQuery|HTMLElement} html                     The element of the context menu entry.
 * @returns {boolean}                                   Whether the entry should be rendered in the context menu.
 */

/**
 * @callback ContextMenuCallback
 * @param {HTMLElement} target                          The element that the context menu has been triggered for.
 * @returns {unknown}
 */

/**
 * @callback ContextMenuJQueryCallback
 * @param {HTMLElement|jQuery} target                   The element that the context menu has been triggered for. Will
 *                                                      either be a jQuery object or an HTMLElement instance, depending
 *                                                      on how the ContextMenu was configured.
 * @returns {unknown}
 */

/**
 * @typedef ContextMenuOptions
 * @property {string} [eventName="contextmenu"] Optionally override the triggering event which can spawn the menu. If
 *                                              the menu is using fixed positioning, this event must be a MouseEvent.
 * @property {ContextMenuCallback} [onOpen]     A function to call when the context menu is opened.
 * @property {ContextMenuCallback} [onClose]    A function to call when the context menu is closed.
 * @property {boolean} [fixed=false]            If true, the context menu is given a fixed position rather than being
 *                                              injected into the target.
 * @property {boolean} [jQuery=true]            If true, callbacks will be passed jQuery objects instead of HTMLElement
 *                                              instances.
 */

/**
 * @typedef ContextMenuRenderOptions
 * @property {Event} [event]           The event that triggered the context menu opening.
 * @property {boolean} [animate=true]  Animate the context menu opening.
 */

/**
 * Display a right-click activated Context Menu which provides a dropdown menu of options.
 * A ContextMenu is constructed by designating a parent HTML container and a target selector.
 * An Array of menuItems defines the entries of the menu which is displayed.
 */
export default class ContextMenu {
  /**
   * @param {HTMLElement|jQuery} container              The HTML element that contains the context menu targets.
   * @param {string} selector                           A CSS selector which activates the context menu.
   * @param {ContextMenuEntry[]} menuItems              An Array of entries to display in the menu
   * @param {ContextMenuOptions} [options]              Additional options to configure the context menu.
   */
  constructor(container, selector, menuItems, {eventName="contextmenu", onOpen, onClose, jQuery, fixed=false}={}) {
    if ( jQuery === undefined ) {
      foundry.utils.logCompatibilityWarning("ContextMenu is changing to no longer transact jQuery objects for menu"
        + " item callbacks. Because the jQuery option provided to the ContextMenu constructor was undefined, your"
        + " callbacks will receive jQuery objects. You may opt-out and receive HTMLElement references instead by"
        + " passing jQuery: false to the constructor. This parameter will be false by default in v14 and deprecated"
        + " entirely in v15 at which point only HTMLElement references will be used.",
      { since: 13, until: 15, once: true });
      jQuery = true;
    }

    // Accept HTMLElement or jQuery (for now)
    if ( !(container instanceof HTMLElement) ) {
      foundry.utils.logCompatibilityWarning("ContextMenu is changing to no longer transact jQuery objects."
        + " You must begin passing an HTMLElement instead.", { since: 13, until: 15, once: true });
      container = container[0];
    }

    // Assign attributes
    this.#container = container;
    this.#selector = selector || container.id;
    this.#eventName = eventName;
    this.menuItems = menuItems;
    this.onOpen = onOpen;
    this.onClose = onClose;
    this.#fixed = fixed;
    /** @deprecated since v13 until v15 */
    this.#jQuery = jQuery;

    // Bind to the container.
    this.#container.addEventListener(this.eventName, this._onActivate.bind(this));
  }

  /* -------------------------------------------- */

  /**
   * Create a ContextMenu for this Application and dispatch hooks.
   * @param {Application} app                           The Application this ContextMenu belongs to.
   * @param {JQuery|HTMLElement} html                   The Application's rendered HTML.
   * @param {string} selector                           The target CSS selector which activates the menu.
   * @param {ContextMenuEntry[]} menuItems              The array of menu items being rendered.
   * @param {object} [options]                          Additional options to configure context menu initialization.
   * @param {string} [options.hookName="EntryContext"]  The name of the hook to call.
   * @returns {ContextMenu}
   * @deprecated since v13
   */
  static create(app, html, selector, menuItems, {hookName="EntryContext", ...options}={}) {
    if ( app instanceof foundry.applications.api.ApplicationV2 ) {
      throw new Error("ContextMenu.create is deprecated and only supports Application (v1) instances.");
    }
    app._callHooks?.(className => `get${className}${hookName}`, menuItems);
    return new this(html, selector, menuItems, options);
  }

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * The HTML element that contains the context menu targets.
   * @type {HTMLElement}
   */
  #container;

  /**
   * The menu element.
   * @type {HTMLElement}
   */
  get element() {
    return this.#element;
  }

  #element;

  /**
   * A CSS selector to identify context menu targets.
   * @type {string}
   */
  get selector() {
    return this.#selector;
  }

  #selector;

  /**
   * The event name to listen for.
   * @type {string}
   */
  get eventName() {
    return this.#eventName;
  }

  #eventName;

  /**
   * The array of menu items to render.
   * @type {Array<ContextMenuEntry & {element: HTMLElement}>}
   */
  menuItems;

  /**
   * A function to call when the context menu is opened.
   * @type {ContextMenuCallback}
   */
  onOpen;

  /**
   * A function to call when the context menu is closed.
   * @type {ContextMenuCallback}
   */
  onClose;

  /**
   * Check which direction the menu is expanded in.
   * @type {boolean}
   */
  get expandUp() {
    return this.#expandUp;
  }

  #expandUp = false;

  /**
   * Whether to position the context menu as a fixed element, or inject it into the target.
   * @type {boolean}
   */
  get fixed() {
    return this.#fixed;
  }

  #fixed;

  /**
   * Whether to pass jQuery objects or HTMLElement instances to callback.
   * @type {boolean}
   */
  #jQuery;

  /**
   * The parent HTML element to which the context menu is attached
   * @type {HTMLElement}
   */
  get target() {
    return this.#target;
  }

  #target;

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /**
   * Animate the context menu's height when opening or closing.
   * @param {boolean} open      Whether the menu is opening or closing.
   * @returns {Promise<void>}   A Promise that resolves when the animation completes.
   * @protected
   */
  async _animate(open=false) {
    const { height } = this.#element.getBoundingClientRect();
    const from = open ? "0" : `${height}px`;
    const to = open ? `${height}px` : "0";
    Object.assign(this.#element.style, { height: from, padding: "0", overflow: "hidden" });
    await this.#element.animate({ height: [from, to] }, { duration: 200, easing: "ease", fill: "forwards" }).finished;
    if ( open ) Object.assign(this.#element.style, { height: "", padding: "", overflow: "" });
  }

  /* -------------------------------------------- */

  /**
   * Closes the menu and removes it from the DOM.
   * @param {object} [options]                Options to configure the closing behavior.
   * @param {boolean} [options.animate=true]  Animate the context menu closing.
   * @param {HTMLElement} [options.target]    The target element to close on.
   * @returns {Promise<void>}
   */
  async close({animate=true, target}={}) {
    if ( animate ) await this._animate(false);
    this._close({ target });
  }

  /* -------------------------------------------- */

  /**
   * Close the menu and remove it from the DOM.
   * @param {object} [options]
   * @param {HTMLElement} [options.target]  The target element to close on.
   * @protected
   */
  _close({ target }={}) {
    for ( const item of this.menuItems ) delete item.element;
    this.#element.remove();
    document.querySelectorAll(".context").forEach(el => el.classList.remove("context"));
    if ( ui.context === this ) delete ui.context;
    this.onClose?.(target ?? this.#target);
  }

  /* -------------------------------------------- */

  /**
   * Called before the context menu begins rendering.
   * @param {HTMLElement} target  The context target.
   * @param {ContextMenuRenderOptions} [options]
   * @returns {Promise<void>}
   * @protected
   */
  async _preRender(target, options={}) {}

  /* -------------------------------------------- */

  /**
   * Render the Context Menu by iterating over the menuItems it contains.
   * Check the visibility of each menu item, and only render ones which are allowed by the item's logical condition.
   * Attach a click handler to each item which is rendered.
   * @param {HTMLElement} target  The target element to which the context menu is attached.
   * @param {ContextMenuRenderOptions} [options]
   * @returns {Promise<void>}     A Promise that resolves when the open animation has completed.
   */
  async render(target, options={}) {
    await this._preRender(target, options);
    this.#element?.remove();
    const html = this.#element = document.createElement("nav");
    html.id = "context-menu";
    const menu = document.createElement("menu");
    menu.classList.add("context-items");
    html.replaceChildren(menu);

    if ( !this.menuItems.length ) return;

    /** @type {Record<string, ContextMenuEntry>} */
    const groups = this.menuItems.reduce((acc, entry) => {
      const group = entry.group ?? "_none";
      acc[group] ??= [];
      // Determine menu item visibility (display unless false)
      let display = true;
      if ( entry.condition !== undefined ) {
        if ( entry.condition instanceof Function ) display = entry.condition(this.#jQuery ? $(target) : target);
        else display = entry.condition;
      }
      if ( display ) acc[group].push(entry);
      return acc;
    }, {});

    for ( const [group, entries] of Object.entries(groups) ) {
      let parent = menu;
      if ( (group !== "_none") && entries.length ) {
        const item = document.createElement("li");
        item.classList.add("context-group");
        item.dataset.groupId = group;
        const list = document.createElement("ol");
        item.append(list);
        menu.append(item);
        parent = list;
      }
      for ( const item of entries ) {
        // Construct and add the menu item
        const name = game.i18n.localize(item.name);
        const classes = ["context-item", item.classes].filterJoin(" ");
        const entry = document.createElement("li");
        entry.className = classes;
        if ( item.icon ) {
          entry.insertAdjacentHTML("afterbegin", item.icon);
          entry.querySelector("i")?.classList.add("fa-fw");
        }
        const span = document.createElement("span");
        span.append(name);
        entry.append(span);
        parent.append(entry);

        // Record a reference to the element.
        item.element = entry;
      }
    }

    // Bail out if there are no children
    if ( !menu.children.length ) return;

    // Append to target
    this._setPosition(html, target, options);

    // Apply interactivity
    this.activateListeners(html);

    // Deactivate global tooltip
    game.tooltip.deactivate();

    // Animate open the menu
    if ( options.animate !== false ) await this._animate(true);
    return this._onRender(options);
  }

  /* -------------------------------------------- */

  /**
   * Called after the context menu has finished rendering and animating open.
   * @param {ContextMenuRenderOptions} [options]
   * @returns {Promise<void>}
   * @protected
   */
  async _onRender(options={}) {}

  /* -------------------------------------------- */

  /**
   * Set the position of the context menu, taking into consideration whether the menu should expand upward or downward
   * @param {HTMLElement} menu       The context menu element.
   * @param {HTMLElement} target     The element that the context menu was spawned on.
   * @param {object} [options]
   * @param {Event} [options.event]  The event that triggered the context menu opening.
   * @protected
   */
  _setPosition(menu, target, { event }={}) {
    if ( this.#fixed ) this._setFixedPosition(menu, target, { event });
    else this._injectMenu(menu, target);
  }

  /* -------------------------------------------- */

  /**
   * Inject the menu inside the target.
   * @param {HTMLElement} menu    The menu element.
   * @param {HTMLElement} target  The context target.
   * @protected
   */
  _injectMenu(menu, target) {
    const container = target.parentElement;

    // Append to target and get the context bounds
    target.style.position = "relative";
    menu.style.visibility = "hidden";
    target.append(menu);
    const menuRect = menu.getBoundingClientRect();
    const parentRect = target.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    // Determine whether to expand upwards
    const menuTop = parentRect.top - menuRect.height;
    const menuBottom = parentRect.bottom + menuRect.height;
    const canOverflowUp = (menuTop > containerRect.top) || (getComputedStyle(container).overflowY === "visible");

    // If it overflows the container bottom, but not the container top
    const containerUp = (menuBottom > containerRect.bottom) && (menuTop >= containerRect.top);
    const windowUp = (menuBottom > window.innerHeight) && (menuTop > 0) && canOverflowUp;
    this.#expandUp = containerUp || windowUp;

    // Display the menu
    menu.classList.toggle("expand-up", this.#expandUp);
    menu.classList.toggle("expand-down", !this.#expandUp);
    menu.style.visibility = "";
    target.classList.add("context");
  }

  /* -------------------------------------------- */

  /**
   * Set the context menu at a fixed position in the viewport.
   * @param {HTMLElement} menu       The menu element.
   * @param {HTMLElement} target     The context target.
   * @param {object} [options]
   * @param {Event} [options.event]  The event that triggered the context menu opening.
   * @protected
   */
  _setFixedPosition(menu, target, { event }={}) {
    let { clientX, clientY } = event ?? {};

    // Bail early if it won't be possible to position the menu.
    const needsCoords = [clientX, clientY].includes(undefined) || (!event.isTrusted && [clientX, clientY].includes(0));
    if ( needsCoords && !target.checkVisibility() ) return;

    menu.setAttribute("popover", "manual");
    document.body.appendChild(menu);
    menu.showPopover();
    const { clientWidth, clientHeight } = document.documentElement;
    const { width, height } = menu.getBoundingClientRect();

    if ( needsCoords ) {
      // If an event was either not provided or without meaningful clientX/clientY co-ordinates, set the co-ordinates to
      // the bottom-left of the target.
      ({ left: clientX, bottom: clientY } = target.getBoundingClientRect());
    }

    menu.style.left = `${(Math.min(clientX, clientWidth - width))}px`;
    this.#expandUp = (clientY + height) > clientHeight;
    if ( this.#expandUp ) menu.style.bottom = `${clientHeight - clientY}px`;
    else menu.style.top = `${clientY}px`;
    menu.classList.toggle("expand-up", this.#expandUp);
    menu.classList.toggle("expand-down", !this.#expandUp);
    target.classList.add("context");

    const nearestThemed = target.closest(".themed") ?? document.body;
    const [, theme] = nearestThemed.className.match(/(?:^|\s)(theme-\w+)/) ?? [];
    if ( theme ) menu.classList.add("themed", theme);
  }

  /* -------------------------------------------- */
  /*  Event Listeners & Handlers                  */
  /* -------------------------------------------- */

  /**
   * Local listeners which apply to each ContextMenu instance which is created.
   * @param {HTMLElement} menu  The context menu element.
   */
  activateListeners(menu) {
    menu.addEventListener("click", this.#onClickItem.bind(this));
  }

  /* -------------------------------------------- */

  /**
   * Handle context menu activation.
   * @param {Event} event  The triggering event.
   * @protected
   */
  _onActivate(event) {
    const matching = event.target.closest(this.#selector);
    if ( !matching ) return;
    event.preventDefault();
    const priorTarget = this.#target;
    this.#target = matching;

    // Remove existing context UI.
    if ( this.#target.classList.contains("context") ) return this.close();

    // If the menu is already open, call its close handler on its original target.
    const closeOptions = { animate: ui.context !== this };
    if ( ui.context === this ) closeOptions.target = priorTarget;
    ui.context?.close(closeOptions);

    // Render a new context menu.
    event.stopImmediatePropagation();
    ui.context = this;
    this.onOpen?.(this.#target);
    return this.render(this.#target, { event });
  }

  /* -------------------------------------------- */

  /**
   * Handle click events on context menu items.
   * @param {PointerEvent} event      The click event
   */
  #onClickItem(event) {
    event.preventDefault();
    event.stopPropagation();
    const element = event.target.closest(".context-item");
    if ( !element ) return;
    const item = this.menuItems.find(i => i.element === element);
    item?.callback(this.#jQuery ? $(this.#target) : this.#target);
    this.close();
  }

  /* -------------------------------------------- */

  /**
   * Global listeners which apply once only to the document.
   */
  static eventListeners() {
    document.addEventListener("click", () => ui.context?.close(), { passive: true });
  }

  /* -------------------------------------------- */
  /*  Factory Methods                             */
  /* -------------------------------------------- */

  /**
   * Retrieve the configured DragDrop implementation.
   * @type {typeof ContextMenu}
   */
  static get implementation() {
    let Class = CONFIG.ux.ContextMenu;
    if ( !foundry.utils.isSubclass(Class, ContextMenu) ) {
      console.warn("Configured ContextMenu override must be a subclass of ContextMenu.");
      Class = ContextMenu;
    }
    return Class;
  }

  /* -------------------------------------------- */
  /*  Deprecations                                */
  /* -------------------------------------------- */

  /**
   * @deprecated since v13 until v15
   * @ignore
   */
  get _expandUp() {
    foundry.utils.logCompatibilityWarning("ContextMenu#_expandUp is deprecated. Please use ContextMenu#expandUp "
      + "instead.", { since: 13, until: 15, once: true });
    return this.#expandUp;
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v13 until v15
   * @ignore
   */
  get menu() {
    foundry.utils.logCompatibilityWarning("ContextMenu#menu is deprecated. "
      + "Please use ContextMenu#element instead.", { since: 13, until: 15, once: true });
    return $("#context-menu");
  }
}

/**
 * @import {ProseMirrorDropDownEntry} from "./_types.mjs";
 */

/**
 * A class responsible for creating a drop-down.
 */
export default class ProseMirrorDropDown {
  /**
   * A class responsible for rendering a menu drop-down.
   * @param {string} title                             The default title.
   * @param {ProseMirrorDropDownEntry[]} items         The configured menu items.
   * @param {object} [options]
   * @param {string} [options.cssClass]                The menu CSS class name. Required if providing an action.
   * @param {string} [options.icon]                    Use an icon for the dropdown rather than a text label.
   * @param {function(MouseEvent)} [options.onAction]  A callback to fire when a menu item is clicked.
   */
  constructor(title, items, {cssClass, icon, onAction}={}) {
    /**
     * The default title for this drop-down.
     * @type {string}
     */
    Object.defineProperty(this, "title", {value: title, writable: false});

    /**
     * The items configured for this drop-down.
     * @type {ProseMirrorDropDownEntry[]}
     */
    Object.defineProperty(this, "items", {value: items, writable: false});
    this.#icon = icon;
    this.#cssClass = cssClass;
    this.#onAction = onAction;
  }

  /* -------------------------------------------- */

  /**
   * The menu CSS class name.
   * @type {string}
   */
  #cssClass;

  /* -------------------------------------------- */

  /**
   * The icon to use instead of a text label, if any.
   * @type {string}
   */
  #icon;

  /* -------------------------------------------- */

  /**
   * The callback to fire when a menu item is clicked.
   * @type {function(MouseEvent)}
   */
  #onAction;

  /* -------------------------------------------- */

  /**
   * Attach event listeners.
   * @param {HTMLMenuElement} html  The root menu element.
   */
  activateListeners(html) {
    if ( !this.#onAction ) return;
    html.querySelector(`.pm-dropdown.${this.#cssClass}`).onclick = event => this.#onActivate(event);
  }

  /* -------------------------------------------- */

  /**
   * Construct the drop-down menu's HTML.
   * @returns {string}  HTML contents as a string.
   */
  render() {

    // Record which dropdown options are currently active
    const activeItems = [];
    this.forEachItem(item => {
      if ( !item.active ) return;
      activeItems.push(item);
    });
    activeItems.sort((a, b) => a.priority - b.priority);
    const activeItem = activeItems.shift();

    // Render the dropdown
    const active = game.i18n.localize(activeItem ? activeItem.title : this.title);
    const items = this.constructor._renderMenu(this.items);
    return `
      <button type="button" class="pm-dropdown ${this.#icon ? "icon" : ""} ${this.#cssClass}">
        ${this.#icon ? this.#icon : `<span>${active}</span>`}
        <i class="fa-solid fa-chevron-down"></i>
        ${items}
      </button>
    `;
  }

  /* -------------------------------------------- */

  /**
   * Recurse through the menu structure and apply a function to each item in it.
   * @param {function(ProseMirrorDropDownEntry):boolean} fn  The function to call on each item. Return false to prevent
   *                                                         iterating over any further items.
   */
  forEachItem(fn) {
    const forEach = items => {
      for ( const item of items ) {
        const result = fn(item);
        if ( result === false ) break;
        if ( item.children?.length ) forEach(item.children);
      }
    };
    forEach(this.items);
  }

  /* -------------------------------------------- */

  /**
   * Handle spawning a drop-down menu.
   * @param {PointerEvent} event  The triggering event.
   * @protected
   */
  #onActivate(event) {
    document.getElementById("prosemirror-dropdown")?.remove();
    const menu = event.currentTarget.querySelector(":scope > ul");
    if ( !menu ) return;
    const { top, left, bottom } = event.currentTarget.getBoundingClientRect();
    const dropdown = document.createElement("div");
    dropdown.id = "prosemirror-dropdown";
    // Apply theme.
    const nearestThemed = event.target.closest(".themed") ?? document.body;
    const [, theme] = nearestThemed.className.match(/(?:^|\s)(theme-\w+)/) ?? [];
    if ( theme ) dropdown.classList.add("themed", theme);
    dropdown.append(menu.cloneNode(true));
    Object.assign(dropdown.style, { left: `${left}px`, top: `${bottom}px` });
    document.body.append(dropdown);
    dropdown.querySelectorAll("li").forEach(item => {
      item.onclick = event => this.#onAction(event);
      item.onpointerover = event => this.#onHoverItem(event);
    });
    requestAnimationFrame(() => {
      const { width, height } = dropdown.querySelector(":scope > ul").getBoundingClientRect();
      const { clientWidth, clientHeight } = document.documentElement;
      if ( left + width > clientWidth ) dropdown.style.left = `${left - width}px`;
      if ( bottom + height > clientHeight ) dropdown.style.top = `${top - height}px`;
    });
  }

  /* -------------------------------------------- */

  /**
   * Adjust menu position when hovering over items.
   * @param {PointerEvent} event  The triggering event.
   */
  #onHoverItem(event) {
    const menu = event.currentTarget.querySelector(":scope > ul");
    if ( !menu ) return;
    const { clientWidth, clientHeight } = document.documentElement;
    const { top } = event.currentTarget.getBoundingClientRect();
    const { x, width, height } = menu.getBoundingClientRect();
    if ( top + height > clientHeight ) menu.style.top = `-${top + height - clientHeight}px`;
    if ( x + width > clientWidth ) menu.style.left = `-${width}px`;
  }

  /* -------------------------------------------- */

  /**
   * Render a list of drop-down menu items.
   * @param {ProseMirrorDropDownEntry[]} entries  The menu items.
   * @returns {string}  HTML contents as a string.
   * @protected
   */
  static _renderMenu(entries) {
    const groups = entries.reduce((arr, item) => {
      const group = item.group ?? 0;
      arr[group] ??= [];
      arr[group].push(this._renderMenuItem(item));
      return arr;
    }, []);
    const items = groups.reduce((arr, group) => {
      if ( group?.length ) arr.push(group.join(""));
      return arr;
    }, []);
    return `<ul>${items.join('<li class="divider"></li>')}</ul>`;
  }

  /* -------------------------------------------- */

  /**
   * Render an individual drop-down menu item.
   * @param {ProseMirrorDropDownEntry} item  The menu item.
   * @returns {string}  HTML contents as a string.
   * @protected
   */
  static _renderMenuItem(item) {
    const parts = [`<li data-action="${item.action}" class="${item.class ?? ""}">`];
    parts.push(`<span style="${item.style ?? ""}">${game.i18n.localize(item.title)}</span>`);
    if ( item.active && !item.children?.length ) parts.push('<i class="fa-solid fa-check"></i>');
    if ( item.children?.length ) {
      parts.push('<i class="fa-solid fa-chevron-right"></i>', this._renderMenu(item.children));
    }
    parts.push("</li>");
    return parts.join("");
  }
}

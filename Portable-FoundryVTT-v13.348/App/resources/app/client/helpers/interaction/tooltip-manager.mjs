import Tour from "@client/nue/tour.mjs";

/**
 * A singleton Tooltip Manager class responsible for rendering and positioning a dynamic tooltip element which is
 * accessible as `game.tooltip`.
 *
 * @see {@link foundry.Game#tooltip}
 *
 * @example API Usage
 * ```js
 * game.tooltip.activate(htmlElement, {text: "Some tooltip text", direction: "UP"});
 * game.tooltip.deactivate();
 * ```
 *
 * @example HTML Usage
 * ```html
 * <span data-tooltip="Some Tooltip" data-tooltip-direction="LEFT">I have a tooltip</span>
 * <ol data-tooltip-direction="RIGHT">
 *   <li data-tooltip="The First One">One</li>
 *   <li data-tooltip="The Second One">Two</li>
 *   <li data-tooltip="The Third One">Three</li>
 * </ol>
 * ```
 */
export default class TooltipManager {
  constructor() {
    if ( game.tooltip ) throw new Error("You may not re-construct the singleton TooltipManager.");
  }

  /**
   * A cached reference to the global tooltip element
   * @type {HTMLElement}
   */
  tooltip = document.getElementById("tooltip");

  /**
   * A reference to the HTML element which is currently tool-tipped, if any.
   * @type {HTMLElement|null}
   */
  element = null;

  /**
   * An amount of margin which is used to offset tooltips from their anchored element.
   * @type {number}
   */
  static TOOLTIP_MARGIN_PX = 5;

  /**
   * The number of milliseconds delay which activates a tooltip on a "long hover".
   * @type {number}
   */
  static TOOLTIP_ACTIVATION_MS = 500;

  /**
   * The directions in which a tooltip can extend, relative to its tool-tipped element.
   * @enum {string}
   */
  static TOOLTIP_DIRECTIONS = {
    UP: "UP",
    DOWN: "DOWN",
    LEFT: "LEFT",
    RIGHT: "RIGHT",
    CENTER: "CENTER"
  };

  /**
   * The number of pixels buffer around a locked tooltip zone before they should be dismissed.
   * @type {number}
   */
  static LOCKED_TOOLTIP_BUFFER_PX = 50;

  /**
   * Is the tooltip currently active?
   * @type {boolean}
   */
  #active = false;

  /**
   * A reference to a window timeout function when an element is activated.
   */
  #activationTimeout;

  /**
   * A reference to a window timeout function when an element is deactivated.
   */
  #deactivationTimeout;

  /**
   * An element which is pending tooltip activation if hover is sustained
   * @type {HTMLElement|null}
   */
  #pending;

  /**
   * Maintain state about active locked tooltips in order to perform appropriate automatic dismissal.
   * @type {{elements: Set<HTMLElement>, boundingBox: Rectangle}}
   */
  #locked = {
    elements: new Set(),
    boundingBox: {}
  };

  /* -------------------------------------------- */

  /**
   * Activate interactivity by listening for hover events on HTML elements which have a data-tooltip defined.
   */
  activateEventListeners() {
    document.body.addEventListener("pointerenter", this.#onActivate.bind(this), true);
    document.body.addEventListener("pointerleave", this.#onDeactivate.bind(this), true);
    document.body.addEventListener("pointerup", this._onLockTooltip.bind(this), true);
    document.body.addEventListener("pointermove", this.#testLockedTooltipProximity.bind(this), {
      capture: true,
      passive: true
    });
  }

  /* -------------------------------------------- */

  /**
   * Handle hover events which activate a tooltipped element.
   * @param {PointerEvent} event    The initiating pointerenter event
   */
  #onActivate(event) {
    if ( Tour.tourInProgress ) return; // Don't activate tooltips during a tour
    const element = event.target;
    if ( element.closest(".editor-content.ProseMirror") ) return; // Don't activate tooltips inside text editors.
    const dataset = element.dataset;
    const tooltip = dataset.tooltipHtml || dataset.tooltipText || dataset.tooltip;
    if ( (tooltip === undefined) || ((dataset.tooltip === "") && !element.ariaLabel) ) {
      // Check if the element has moved out from underneath the cursor and pointerenter has fired on a non-child of the
      // tooltipped element.
      if ( this.#active && !this.element.contains(element) ) this.#startDeactivation();
      return;
    }

    // Don't activate tooltips if the element contains an active context menu or is in a matching link tooltip
    if ( element.matches("#context-menu") || element.querySelector("#context-menu") ) return;

    // If the tooltip is currently active, we can move it to a new element immediately
    const options = tooltip ? {} :  {text: element.ariaLabel};
    if ( this.#active ) {
      this.activate(element, options);
      return;
    }

    // Clear any existing deactivation workflow
    this.#clearDeactivation();

    // Delay activation to determine user intent
    this.#pending = element;
    this.#activationTimeout = window.setTimeout(() => {
      this.#activationTimeout = null;
      if ( this.#pending ) this.activate(this.#pending, options);
    }, this.constructor.TOOLTIP_ACTIVATION_MS);
  }

  /* -------------------------------------------- */

  /**
   * Handle hover events which deactivate a tooltipped element.
   * @param {PointerEvent} event    The initiating pointerleave event
   */
  #onDeactivate(event) {
    if ( event.target !== (this.element ?? this.#pending) ) return;
    const parent = event.target.parentElement.closest("[data-tooltip]");
    if ( parent ) this.activate(parent);
    else this.#startDeactivation();
  }

  /* -------------------------------------------- */

  /**
   * Start the deactivation process.
   */
  #startDeactivation() {
    if ( this.#deactivationTimeout ) return;

    // Clear any existing activation workflow
    this.clearPending();

    // Delay deactivation to confirm whether some new element is now pending
    this.#deactivationTimeout = window.setTimeout(() => {
      this.#deactivationTimeout = null;
      if ( !this.#pending ) this.deactivate();
    }, this.constructor.TOOLTIP_ACTIVATION_MS);
  }

  /* -------------------------------------------- */

  /**
   * Clear any existing deactivation workflow.
   */
  #clearDeactivation() {
    window.clearTimeout(this.#deactivationTimeout);
    this.#deactivationTimeout = null;
  }

  /* -------------------------------------------- */

  /**
   * Activate the tooltip for a hovered HTML element which defines a tooltip localization key.
   * @param {HTMLElement} element      The HTML element being hovered.
   * @param {object} [options={}]      Additional options which can override tooltip behavior.
   * @param {string} [options.text]    Explicit tooltip text to display. If this is not provided the tooltip text is
   *                                   acquired from the element's `data-tooltip-text` attribute if present and
   *                                   otherwise from its `data-tooltip` attribute. The `data-tooltip` text will be
   *                                   automatically localized. If `data-tooltip` is not a localization string, the
   *                                   text is rendered as HTML (cleaned). Both `options.text` and `data-tooltip-text`
   *                                   do not support HTML. It is not recommended to use `data-tooltip` for plain text
   *                                   and HTML as it could cause an unintentional localization. Instead use
   *                                   `data-tooltip-text` and `data-tooltip-html`, respectively.
   * @param {TooltipDirection} [options.direction]  An explicit tooltip expansion direction. If this
   *                                      is not provided, the direction is acquired from the `data-tooltip-direction`
   *                                      attribute of the element or one of its parents.
   * @param {string} [options.cssClass]   An optional, space-separated list of CSS classes to apply to the activated
   *                                      tooltip. If this is not provided, the CSS classes are acquired from the
   *                                      `data-tooltip-class` attribute of the element or one of its parents.
   * @param {boolean} [options.locked=false]  An optional boolean to lock the tooltip after creation. Defaults to false.
   * @param {HTMLElement|string} [options.html]     Explicit HTML to inject into the tooltip rather than using
   *                                                tooltip text. If passed as a string, the HTML string is cleaned with
   *                                                {@link foundry.utils.cleanHTML}. An explicit HTML string may also
   *                                                be set with the `data-tooltip-html` attribute on the element.
   */
  activate(element, options={}) {
    let {text, direction, cssClass, locked=false, html, content} = options;
    if ( content && !html ) {
      foundry.utils.logCompatibilityWarning("The content option has been deprecated in favor of the html option",
        {since: 13, until: 15, once: true});
      html = content;
    }
    if ( text && html ) throw new Error("Cannot provide both text and html options to TooltipManager#activate.");
    // Deactivate currently active element
    this.deactivate();
    // Check if the element still exists in the DOM.
    if ( !document.body.contains(element) ) return;
    // Mark the new element as active
    this.#active = true;
    this.element = element;
    element.setAttribute("aria-describedby", "tooltip");
    html ||= element.dataset.tooltipHtml;
    if ( html ) {
      if ( typeof html === "string" ) this.tooltip.innerHTML = foundry.utils.cleanHTML(html);
      else {
        this.tooltip.innerHTML = ""; // Clear existing HTML
        this.tooltip.appendChild(html);
      }
    }
    else {
      text ||= element.dataset.tooltipText;
      if ( text ) this.tooltip.textContent = text;
      else {
        text = element.dataset.tooltip;
        // Localized message should be safe
        if ( game.i18n.has(text) ) this.tooltip.innerHTML = game.i18n.localize(text);
        else this.tooltip.innerHTML = foundry.utils.cleanHTML(text);
      }
    }

    // Activate display of the tooltip
    this.tooltip.removeAttribute("class");
    this.tooltip.classList.add("active", "themed", "theme-dark");
    this.tooltip.showPopover();
    cssClass ??= element.closest("[data-tooltip-class]")?.dataset.tooltipClass;
    if ( cssClass ) this.tooltip.classList.add(...cssClass.split(" "));

    // Set tooltip position
    direction ??= element.closest("[data-tooltip-direction]")?.dataset.tooltipDirection;
    if ( !direction ) direction = this._determineDirection();
    this._setAnchor(direction);

    if ( locked || element.dataset.hasOwnProperty("locked") ) this.lockTooltip();
  }

  /* -------------------------------------------- */

  /**
   * Deactivate the tooltip from a previously hovered HTML element.
   */
  deactivate() {
    // Deactivate display of the tooltip
    this.#active = false;
    this.tooltip.classList.remove("active");
    this.tooltip.addEventListener("transitionend", () => {
      if ( !this.#active ) this.tooltip.hidePopover();
    }, { once: true });

    // Clear any existing (de)activation workflow
    this.clearPending();
    this.#clearDeactivation();

    // Update the tooltipped element
    if ( !this.element ) return;
    this.element.removeAttribute("aria-describedby");
    this.element = null;
  }

  /* -------------------------------------------- */

  /**
   * Clear any pending activation workflow.
   * @internal
   */
  clearPending() {
    window.clearTimeout(this.#activationTimeout);
    this.#pending = this.#activationTimeout = null;
  }

  /* -------------------------------------------- */

  /**
   * Lock the current tooltip.
   * @returns {HTMLElement}
   */
  lockTooltip() {
    const clone = this.tooltip.cloneNode(false);
    // Steal the content from the original tooltip rather than cloning it, so that listeners are preserved.
    while ( this.tooltip.firstChild ) clone.appendChild(this.tooltip.firstChild);
    clone.removeAttribute("id");
    clone.classList.add("locked-tooltip", "active");
    document.body.appendChild(clone);
    clone.showPopover();
    this.deactivate();
    clone.addEventListener("contextmenu", this._onLockedTooltipDismiss.bind(this));
    this.#locked.elements.add(clone);

    // If the tooltip's contents were injected via setting innerHTML, then immediately requesting the bounding box will
    // return incorrect values as the browser has not had a chance to reflow yet. For that reason we defer computing the
    // bounding box until the next frame.
    requestAnimationFrame(() => this.#computeLockedBoundingBox());
    return clone;
  }

  /* -------------------------------------------- */

  /**
   * Handle a request to lock the current tooltip.
   * @param {MouseEvent} event  The click event.
   * @protected
   */
  _onLockTooltip(event) {
    if ( (event.button !== 1) || !this.#active || Tour.tourInProgress ) return;
    event.preventDefault();
    this.lockTooltip();
  }

  /* -------------------------------------------- */

  /**
   * Handle dismissing a locked tooltip.
   * @param {MouseEvent} event  The click event.
   * @protected
   */
  _onLockedTooltipDismiss(event) {
    event.preventDefault();
    const target = event.currentTarget;
    this.dismissLockedTooltip(target);
  }

  /* -------------------------------------------- */

  /**
   * Dismiss a given locked tooltip.
   * @param {HTMLElement} element  The locked tooltip to dismiss.
   */
  dismissLockedTooltip(element) {
    this.#locked.elements.delete(element);
    element.remove();
    this.#computeLockedBoundingBox();
  }

  /* -------------------------------------------- */

  /**
   * Compute the unified bounding box from the set of locked tooltip elements.
   */
  #computeLockedBoundingBox() {
    let bb = null;
    for ( const element of this.#locked.elements.values() ) {
      const {x, y, width, height} = element.getBoundingClientRect();
      const rect = new PIXI.Rectangle(x, y, width, height);
      if ( bb ) bb.enlarge(rect);
      else bb = rect;
    }
    this.#locked.boundingBox = bb;
  }

  /* -------------------------------------------- */

  /**
   * Check whether the user is moving away from the locked tooltips and dismiss them if so.
   * @param {MouseEvent} event  The mouse move event.
   */
  #testLockedTooltipProximity(event) {
    if ( !this.#locked.elements.size ) return;
    const {clientX: x, clientY: y, movementX, movementY} = event;
    const buffer = this.#locked.boundingBox?.clone?.().pad(this.constructor.LOCKED_TOOLTIP_BUFFER_PX);

    // If the cursor is close enough to the bounding box, or we have no movement information, do nothing.
    if ( !buffer || buffer.contains(x, y) || !Number.isFinite(movementX) || !Number.isFinite(movementY) ) return;

    // Otherwise, check if the cursor is moving away from the tooltip, and dismiss it if so.
    if ( ((movementX > 0) && (x > buffer.right))
      || ((movementX < 0) && (x < buffer.x))
      || ((movementY > 0) && (y > buffer.bottom))
      || ((movementY < 0) && (y < buffer.y)) ) this.dismissLockedTooltips();
  }

  /* -------------------------------------------- */

  /**
   * Dismiss the set of active locked tooltips.
   */
  dismissLockedTooltips() {
    for ( const element of this.#locked.elements.values() ) {
      element.remove();
    }
    this.#locked.elements = new Set();
  }

  /* -------------------------------------------- */

  /**
   * Create a locked tooltip at the given position.
   * @param {object} position             A position object with coordinates for where the tooltip should be placed
   * @param {string} position.top         Explicit top position for the tooltip
   * @param {string} position.right       Explicit right position for the tooltip
   * @param {string} position.bottom      Explicit bottom position for the tooltip
   * @param {string} position.left        Explicit left position for the tooltip
   * @param {string} text                 Explicit tooltip text or HTML to display.
   * @param {object} [options={}]         Additional options which can override tooltip behavior.
   * @param {string} [options.cssClass]   An optional, space-separated list of CSS classes to apply to the activated
   *                                      tooltip.
   * @returns {HTMLElement}
   */
  createLockedTooltip(position, text, {cssClass}={}) {
    this.#clearDeactivation();
    this.tooltip.innerHTML = text;
    this.tooltip.style.top = position.top || "";
    this.tooltip.style.right = position.right || "";
    this.tooltip.style.bottom = position.bottom || "";
    this.tooltip.style.left = position.left || "";

    const clone = this.lockTooltip();
    if ( cssClass ) clone.classList.add(...cssClass.split(" "));
    return clone;
  }

  /* -------------------------------------------- */

  /**
   * If an explicit tooltip expansion direction was not specified, figure out a valid direction based on the bounds
   * of the target element and the screen.
   * @protected
   */
  _determineDirection() {
    const pos = this.element.getBoundingClientRect();
    const dirs = this.constructor.TOOLTIP_DIRECTIONS;
    return dirs[pos.y + this.tooltip.offsetHeight > window.innerHeight ? "UP" : "DOWN"];
  }

  /* -------------------------------------------- */

  /**
   * Set tooltip position relative to an HTML element using an explicitly provided data-tooltip-direction.
   * @param {TooltipDirection} direction The tooltip expansion direction specified by the element or a parent element.
   * @protected
   */
  _setAnchor(direction) {
    const directions = this.constructor.TOOLTIP_DIRECTIONS;
    const pad = this.constructor.TOOLTIP_MARGIN_PX;
    const pos = this.element.getBoundingClientRect();
    const style = {};
    switch ( direction ) {
      case directions.DOWN:
        style.textAlign = "center";
        style.left = pos.left - (this.tooltip.offsetWidth / 2) + (pos.width / 2);
        style.top = pos.bottom + pad;
        break;
      case directions.LEFT:
        style.textAlign = "left";
        style.right = window.innerWidth - pos.left + pad;
        style.top = pos.top + (pos.height / 2) - (this.tooltip.offsetHeight / 2);
        break;
      case directions.RIGHT:
        style.textAlign = "right";
        style.left = pos.right + pad;
        style.top = pos.top + (pos.height / 2) - (this.tooltip.offsetHeight / 2);
        break;
      case directions.UP:
        style.textAlign = "center";
        style.left = pos.left - (this.tooltip.offsetWidth / 2) + (pos.width / 2);
        style.bottom = window.innerHeight - pos.top + pad;
        break;
      case directions.CENTER:
        style.textAlign = "center";
        style.left = pos.left - (this.tooltip.offsetWidth / 2) + (pos.width / 2);
        style.top = pos.top + (pos.height / 2) - (this.tooltip.offsetHeight / 2);
        break;
    }
    return this._setStyle(style);
  }

  /* -------------------------------------------- */

  /**
   * Apply inline styling rules to the tooltip for positioning and text alignment.
   * @param {object} [position={}]  An object of positioning data, supporting top, right, bottom, left, and textAlign
   * @protected
   */
  _setStyle(position={}) {
    const pad = this.constructor.TOOLTIP_MARGIN_PX;
    position = {top: null, right: null, bottom: null, left: null, textAlign: "left", ...position};
    const style = this.tooltip.style;

    // Left or Right
    const maxW = window.innerWidth - this.tooltip.offsetWidth;
    if ( position.left ) position.left = Math.clamp(position.left, pad, maxW - pad);
    if ( position.right ) position.right = Math.clamp(position.right, pad, maxW - pad);

    // Top or Bottom
    const maxH = window.innerHeight - this.tooltip.offsetHeight;
    if ( position.top ) position.top = Math.clamp(position.top, pad, maxH - pad);
    if ( position.bottom ) position.bottom = Math.clamp(position.bottom, pad, maxH - pad);

    // Assign styles
    for ( const k of ["top", "right", "bottom", "left"] ) {
      const v = position[k];
      style[k] = v ? `${v}px` : null;
    }

    this.tooltip.classList.remove(...["center", "left", "right"].map(dir => `text-${dir}`));
    this.tooltip.classList.add(`text-${position.textAlign}`);
  }

  /* -------------------------------------------- */
  /*  Factory Methods                             */
  /* -------------------------------------------- */

  /**
   * Retrieve the configured TooltipManager implementation.
   * @type {typeof TooltipManager}
   */
  static get implementation() {
    let Class = CONFIG.ux.TooltipManager;
    if ( !foundry.utils.isSubclass(Class, TooltipManager) ) {
      console.warn("Configured TooltipManager override must be a subclass of TooltipManager.");
      Class = TooltipManager;
    }
    return Class;
  }
}

/**
 * @typedef {keyof typeof TooltipManager.TOOLTIP_DIRECTIONS} TooltipDirection
 */

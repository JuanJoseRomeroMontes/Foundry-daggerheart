/**
 * A common framework for displaying notifications to the client.
 * Submitted notifications are added to a queue, and up to {@link Notifications.MAX_ACTIVE}
 * notifications are displayed at once. Each notification is displayed for
 * {@link Notifications.LIFETIME_MS} milliseconds before being
 * removed, at which point further notifications are pulled from the queue.
 *
 *
 * @example Displaying Notification Messages
 * ```js
 * ui.notifications.error("This is a permanent error message", {permanent: true});
 * ui.notifications.warn("LOCALIZED.WARNING.MESSAGE", {localize: true});
 * ui.notifications.success("This is a success message, not logged to the console", {console: false});
 * ui.notifications.info("LOCALIZED.FORMAT.STRING", {format: {key1: "foo", key2: "bar"}});
 * ```
 *
 * @example Progress Bar Notification
 * ```js
 * const progress = ui.notifications.info("Thing Happening!", {progress: true});
 * progress.update({pct: 0.25, message: "Still happening!"});
 * progress.update({pct: 0.50, message: "Almost there!"});
 * progress.update({pct: 0.75, message: "Stay on target!"});
 * progress.update({pct: 1.0, message: "Done!"});
 * ```
 */
export default class Notifications {
  constructor() {
    if ( ui.notifications ) throw new Error("You may not create a second instance of the ui.notifications singleton.");
    this.#initialize();
  }

  /**
   * The list element which contains active notifications.
   * @type {HTMLOListElement}
   */
  #element;

  /**
   * Submitted notifications which are queued for display
   * @type {Notification[]}
   */
  #queue = [];

  /**
   * Notifications which are currently displayed on screen.
   * @type {Record<number, Notification>}
   */
  #active = {};

  /**
   * An incrementing counter for the notification IDs.
   * @type {number}
   */
  #id = 1;

  /**
   * The maximum number of active notifications.
   * @type {number}
   */
  static MAX_ACTIVE = 5;

  /**
   * Notification lifetime in milliseconds.
   * @type {number}
   */
  static LIFETIME_MS = 5000;

  /* -------------------------------------------- */

  /**
   * Initialize the Notifications system by displaying any system-generated messages which were passed from the server.
   */
  #initialize() {

    // Create the containing element
    const ol = document.createElement("ol");
    ol.id = "notifications";
    const parent = document.body;
    parent.prepend(ol);
    this.#element = ol;

    // Add pending messages to the queue
    for ( const m of globalThis.MESSAGES ) {
      m.options ||= {};
      m.options.localize = true;
      this.notify(m.message, m.type, m.options);
    }
  }

  /* -------------------------------------------- */
  /*  Public API                                  */
  /* -------------------------------------------- */

  /**
   * @typedef Notification
   * @property {number} id
   * @property {string} type
   * @property {number} timestamp
   * @property {string} message
   * @property {Error} [error]
   * @property {boolean} permanent
   * @property {boolean} console
   * @property {boolean} active
   * @property {boolean} progress
   * @property {number} pct
   * @property {HTMLLIElement} [element]
   * @property {() => void} [remove]
   * @property {(pct: number) => void} [update]
   */

  /**
   * @typedef NotificationOptions
   * @property {boolean} [permanent=false]     Should the notification be permanently displayed until dismissed
   * @property {boolean} [progress=false]      Does this Notification include a progress bar?
   * @property {boolean} [localize=false]      Whether to localize the message content before displaying it
   * @property {boolean} [console=true]        Whether to log the message to the console
   * @property {boolean} [escape=true]         Whether to escape the values of `format`
   * @property {boolean} [clean=true]          Whether to clean the provided message string as untrusted user input.
   *                                           No cleaning is applied if `format` is passed and `escape` is true or
   *                                           `localize` is true and `format` is not passed.
   * @property {Record<string, string>} [format] A mapping of formatting strings passed to Localization#format
   */

  /**
   * Push a new notification into the queue
   * @param {string|object} message            The content of the notification message. A passed object should have a
   *                                           meaningful override of the `toString` method. If the object is an
   *                                           `Error` and console logging is requested, the stack trace will be
   *                                           included.
   * @param {string} type                      The type of notification, "info", "warning", and "error" are supported
   * @param {NotificationOptions} [options={}] Additional options which affect the notification
   * @returns {Notification}                   The registered notification
   */
  notify(message, type="info", {localize=false, permanent=false, progress=false, console=true, escape=true, clean=true, format}={}) {
    const error = message instanceof Error ? message : null;
    message = String(message);
    if ( format ) {
      if ( escape ) {
        format = {...format};
        for ( const key in format ) format[key] = foundry.utils.escapeHTML(format[key]);
        // Formatted message should be safe if the format arguments are escaped
        if ( game.i18n.has(message) ) clean = false;
      }
      message = game.i18n.format(message, format);
    } else if ( localize ) {
      if ( game.i18n.has(message) ) clean = false; // Localized message should be safe
      message = game.i18n.localize(message);
    }
    if ( clean ) message = foundry.utils.cleanHTML(message);
    const notification = {
      id: this.#id++,
      type,
      message,
      timestamp: new Date().getTime(),
      active: false,
      progress,
      permanent,
      console,
      pct: 0
    };
    if ( error ) notification.error = error;
    notification.remove = this.#remove.bind(this, notification);
    notification.update = this.#update.bind(this, notification);
    this.#queue.push(notification);
    this.#fetch();
    return notification;
  }

  /* -------------------------------------------- */

  /**
   * Display a notification with the "info" type.
   * @param {string|object} message             The content of the info message
   * @param {NotificationOptions} [options]     Notification options passed to the notify function
   * @returns {Readonly<Notification>}          The registered notification
   * @see {@link notify}
   */
  info(message, options) {
    return this.notify(message, "info", options);
  }

  /* -------------------------------------------- */

  /**
   * Display a notification with the "warning" type.
   * @param {string|object} message             The content of the warning message
   * @param {NotificationOptions} [options]     Notification options passed to the notify function
   * @returns {Readonly<Notification>}          The registered notification
   * @see {@link notify}
   */
  warn(message, options) {
    return this.notify(message, "warning", options);
  }

  /* -------------------------------------------- */

  /**
   * Display a notification with the "error" type.
   * @param {string|object} message             The content of the error message
   * @param {NotificationOptions} [options]     Notification options passed to the notify function
   * @returns {Readonly<Notification>}          The registered notification
   * @see {@link notify}
   */
  error(message, options) {
    return this.notify(message, "error", options);
  }

  /* -------------------------------------------- */

  /**
   * Display a notification with the "success" type.
   * @param {string|object} message             The content of the success message
   * @param {NotificationOptions} [options]     Notification options passed to the notify function
   * @returns {Readonly<Notification>}          The registered notification
   * @see {@link notify}
   */
  success(message, options) {
    return this.notify(message, "success", options);
  }

  /* -------------------------------------------- */

  /**
   * Update the progress of the notification.
   * @param {Notification|number} notification    A Notification or ID to update
   * @param {object} [update]                     An incremental progress update
   * @param {string} [update.message]             An update to the string message
   * @param {string} [update.localize=false]      Localize updates to presented progress text
   * @param {string} [update.escape=true]         See {@link NotificationOptions#escape}
   * @param {string} [update.clean=true]          See {@link NotificationOptions#clean}
   * @param {Record<string, string>} [update.format]    A mapping of formatting strings passed to Localization#format
   * @param {number} [update.pct]                 An update to the completion percentage
   */
  update(notification, update) {
    if ( typeof notification === "number" ) notification = this.#active[notification] ?? this.#queue.find(n => n.id === notification);
    if ( !notification ) return;
    this.#update(notification, update);
  }

  /* -------------------------------------------- */

  /**
   * Remove the notification linked to the ID.
   * @param {Notification|number} notification    The Notification or ID to remove
   */
  remove(notification) {
    const id = notification?.id ?? notification;
    if ( !(id > 0) ) throw new Error("You must pass a Notification or numeric ID to Notifications#remove");
    let n = this.#queue.findSplice(n => n.id === id);
    if ( n ) return;
    n = this.#active[id];
    if ( n ) n.remove();
  }

  /* -------------------------------------------- */

  /**
   * Does the notification linked to the ID exist?.
   * @param {Notification|number} notification    The Notification or ID to remove
   * @returns {boolean}
   */
  has(notification) {
    const id = notification?.id ?? notification;
    if ( !(id > 0) ) throw new Error("You must pass a Notification or numeric ID to Notifications#has");
    let n = this.#queue.find(n => n.id === id);
    if ( n ) return true;
    n = this.#active[id];
    if ( n ) return true;
    return false;
  }

  /* -------------------------------------------- */

  /**
   * Clear all notifications.
   */
  clear() {
    this.#queue.length = 0;
    for ( const id in this.#active ) {
      const n = this.#active[id];
      n.active = false;
      n.element.remove();
      delete this.#active[id];
    }
  }

  /* -------------------------------------------- */
  /*  Private Helpers                             */
  /* -------------------------------------------- */

  /**
   * Retrieve a pending notification from the queue and display it.
   */
  #fetch() {
    if ( !this.#queue.length || (Object.keys(this.#active).length >= Notifications.MAX_ACTIVE) ) return;
    const next = this.#queue.shift();
    next.timestamp = Date.now();
    next.active = true;
    next.element ??= this.#render(next);
    next.element.addEventListener("click", next.remove);
    this.#element.prepend(next.element);
    this.#active[next.id] = next;
    if ( next.console ) {
      let fn = next.type === "warning" ? "warn" : next.type;
      if ( !console.hasOwnProperty(fn) ) fn = "debug";
      console[fn](next.error ?? next.element.textContent);
    }
    if ( !next.permanent && !next.progress ) window.setTimeout(next.remove, Notifications.LIFETIME_MS);
  }

  /* -------------------------------------------- */

  /**
   * Remove a notification from circulation.
   * @param {Notification} notification
   */
  #remove(notification) {
    notification.active = false;
    notification.element?.remove();
    if ( notification.id in this.#active ) delete this.#active[notification.id];
    else this.#queue.findSplice(n => n.id === notification.id);
    this.#fetch();
  }

  /* -------------------------------------------- */

  /**
   * Increment the progress of the notification.
   * @param {Notification} notification
   * @param {object} update
   * @param {string} [update.message]            Change the presented progress text for the update
   * @param {boolean} [update.localize=false]    Localize updates to presented progress text
   * @param {boolean} [update.escape=true]       See {@link NotificationOptions#escape}
   * @param {boolean} [update.clean=true]        See {@link NotificationOptions#clean}
   * @param {Record<string, string>} [update.format]    A mapping of formatting strings passed to Localization#format
   * @param {number} [update.pct]                Change the presented progress percentage, on [0, 1]
   */
  #update(notification, {message, localize=false, format, escape=true, clean=true, pct}={}) {
    const el = notification.element ??= this.#render(notification);

    // Update percentage progress
    if ( notification.progress && Number.isNumeric(pct) ) {
      notification.pct = Number(pct);
      const pctString = `${Math.round(pct * 100)}%`;
      el.style.setProperty("--pct", pctString);
      el.children[1].innerText = pctString;
      if ( (pct === 1) && !notification.permanent ) window.setTimeout(notification.remove, 500);
    }

    // Update status text
    if ( message ) {
      if ( format ) {
        if ( escape ) {
          format = {...format};
          for ( const key in format ) format[key] = foundry.utils.escapeHTML(format[key]);
          // Formatted message should be safe if the format arguments are escaped
          clean = false;
        }
        message = game.i18n.format(message, format);
      } else if ( localize ) {
        message = game.i18n.localize(message);
        clean = false; // Localized message should be safe
      }
      if ( clean ) message = foundry.utils.cleanHTML(message);
      notification.message = message;
      el.children[0].innerHTML = message;
    }

    // Log message to console
    if ( notification.console ) {
      let fn = notification.type === "warning" ? "warn" : notification.type;
      if ( !console.hasOwnProperty(fn) ) fn = "debug";
      console[fn](el.textContent);
    }
  }

  /* -------------------------------------------- */

  /**
   * Render a notification as an HTML element.
   * @param {Notification} notification
   * @returns {HTMLLIElement}
   */
  #render(notification) {
    const li = document.createElement("li");
    li.classList.add("notification", notification.type);
    if ( notification.permanent ) li.classList.add("permanent");
    if ( notification.progress ) {
      li.classList.add("progress");
      li.style.setProperty("--pct", "0%");
    }
    li.dataset.id = String(notification.id);
    li.innerHTML = `<p>${notification.message}</p> <span class="pct"></span>`;
    return li;
  }
}

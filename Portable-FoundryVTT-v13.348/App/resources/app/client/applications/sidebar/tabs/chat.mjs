import HandlebarsApplicationMixin from "../../api/handlebars-application.mjs";
import AbstractSidebarTab from "../sidebar-tab.mjs";
import ChatMessage from "@client/documents/chat-message.mjs";
import TextEditor from "@client/applications/ux/text-editor.mjs";
import Roll from "@client/dice/roll.mjs";
import Hooks from "@client/helpers/hooks.mjs";
import HTMLSecretBlockElement from "@client/applications/elements/secret-block.mjs";
import {renderTemplate} from "@client/applications/handlebars.mjs";

/**
 * @import {ApplicationRenderContext, ApplicationRenderOptions, ApplicationClickAction} from "../../_types.mjs"
 */

/**
 * The sidebar chat tab.
 * @extends {AbstractSidebarTab}
 * @mixes HandlebarsApplication
 */
export default class ChatLog extends HandlebarsApplicationMixin(AbstractSidebarTab) {

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    classes: ["flexcol"],
    window: {
      title: "CHAT.Title"
    },
    actions: {
      deleteMessage: this.#onDeleteMessage,
      dismissMessage: this.#onDismissNotification,
      expandRoll: this.#onExpandRoll,
      export: this.#onExportLog,
      flush: this.#onFlushLog,
      jumpToBottom: this.#onJumpToBottom,
      rollMode: this.#onChangeRollMode
    }
  };

  /** @override */
  static tabName = "chat";

  /** @override */
  static PARTS = {
    log: {
      template: "templates/sidebar/tabs/chat/log.hbs",
      templates: ["templates/sidebar/tabs/chat/notifications.hbs"]
    },
    input: {
      template: "templates/sidebar/tabs/chat/input.hbs"
    }
  };

  /**
   * An enumeration of regular expression patterns used to match chat messages.
   * @enum {RegExp}
   */
  static MESSAGE_PATTERNS = (() => {
    const dice = "([^#]+)(?:#(.*))?";       // Dice expression with appended flavor text
    const any = "([^]*)";                   // Any character, including new lines
    return {
      roll: new RegExp(`^(\\/r(?:oll)? )${dice}$`, "i"),                   // Regular rolls: /r or /roll
      gmroll: new RegExp(`^(\\/gmr(?:oll)? )${dice}$`, "i"),               // GM rolls: /gmr or /gmroll
      blindroll: new RegExp(`^(\\/b(?:lind)?r(?:oll)? )${dice}$`, "i"),    // Blind rolls: /br or /blindroll
      selfroll: new RegExp(`^(\\/s(?:elf)?r(?:oll)? )${dice}$`, "i"),      // Self rolls: /sr or /selfroll
      publicroll: new RegExp(`^(\\/p(?:ublic)?r(?:oll)? )${dice}$`, "i"),  // Public rolls: /pr or /publicroll
      ic: new RegExp(`^(/ic )${any}`, "i"),
      ooc: new RegExp(`^(/ooc )${any}`, "i"),
      emote: new RegExp(`^(/(?:em(?:ote)?|me) )${any}`, "i"),
      whisper: new RegExp(/^(\/w(?:hisper)?\s)(\[[^\]]+]|\S+)\s*([^]*)/, "i"),
      reply: new RegExp(`^(/reply )${any}`, "i"),
      gm: new RegExp(`^(/gm )${any}`, "i"),
      players: new RegExp(`^(/players )${any}`, "i"),
      macro: new RegExp(`^(\\/m(?:acro)? )${any}`, "i"),
      invalid: /^(\/\S+)/ // Any other message starting with a slash command is invalid
    };
  })();

  /**
   * The set of commands that can be processed over multiple lines.
   * @type {Set<string>}
   */
  static MULTILINE_COMMANDS = new Set(["roll", "gmroll", "blindroll", "selfroll", "publicroll"]);

  /**
   * The maximum number of messages to retain in the history in a given session.
   * @type {number}
   */
  static MAX_MESSAGE_HISTORY = 16;

  /**
   * The number of milliseconds to keep a chat card notification until it is automatically dismissed.
   * @type {number}
   */
  static NOTIFY_DURATION = 5000;

  /**
   * The notification ticker frequency.
   * @type {number}
   */
  static NOTIFY_TICKER = 500;

  /**
   * The number of milliseconds to wait before unpausing the notification queue.
   * @type {number}
   */
  static NOTIFY_UNPAUSE = 2000;

  /**
   * The number of milliseconds to display the chat notification pip.
   * @type {number}
   */
  static PIP_DURATION = 3000;

  /**
   * How often, in milliseconds, to update timestamps.
   * @type {number}
   */
  static UPDATE_TIMESTAMP_FREQUENCY = 1000 * 15;

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * A reference to the Messages collection that the chat log displays.
   * @type {Messages}
   */
  get collection() {
    return game.messages;
  }

  /**
   * Message history management.
   * @type {{ queue: string[], index: number, pending: string }}
   */
  get history() {
    return this.#history;
  }

  #history = {
    index: -1,
    pending: "",
    queue: []
  };

  /**
   * The chat input element.
   * @type {HTMLTextAreaElement}
   */
  #inputElement;

  /**
   * A flag for whether the chat log is currently scrolled to the bottom.
   * @type {boolean}
   */
  get isAtBottom() {
    return this.#isAtBottom;
  }

  #isAtBottom = true;

  /**
   * The jump to bottom button.
   * @type {HTMLButtonElement}
   */
  #jumpToBottomElement;

  /**
   * Track the ID of the oldest message displayed in the log.
   * @type {string|null}
   */
  #lastId;

  /**
   * Store the last whisper this user received for replying.
   * @type {ChatMessage}
   */
  #lastWhisper;

  /**
   * The chat notifications container.
   * @type {HTMLDivElement}
   */
  #notificationsElement;

  /**
   * The debounced function for returning the chat notification queue to an inactive state.
   * @type {function(): void}
   */
  #notifyAlertDebounce =
    foundry.utils.debounce(this.#onNotifyInactive.bind(this), this.constructor.NOTIFY_DURATION);

  /**
   * The debounced function for unpausing the notification queue.
   * @type {function(): void}
   */
  #notifyUnpauseDebounce =
    foundry.utils.debounce(this.#onUnpauseNotifications.bind(this), this.constructor.NOTIFY_UNPAUSE);

  /**
   * Debounced function for setting the overflowing state of the chat scrollback.
   * @type {function(): void}
   */
  #overflowingDebounce = foundry.utils.debounce(this.#setOverflowing.bind(this), 100);

  /**
   * The debounced function for hiding the notification pip.
   * @type {function(): void}
   */
  #pipHideDebounce = foundry.utils.debounce(this.#onHidePip.bind(this), this.constructor.PIP_DURATION);

  /**
   * Chat controls containing roll-privacy buttons and log actions
   * @type {HTMLDivElement}
   */
  #chatControls;

  /**
   * A semaphore to queue rendering of Chat Messages.
   * @type {Semaphore}
   */
  #renderingQueue = new foundry.utils.Semaphore(1);

  /**
   * Whether batch rendering is currently in-progress.
   * @type {boolean}
   */
  #renderingBatch = false;

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _configureRenderOptions(options) {
    super._configureRenderOptions(options);
    // If the log has already been rendered once, prevent it from being re-rendered.
    if ( this.rendered ) options.parts = options.parts.filter(p => (p !== "log") && (p !== "input"));
  }

  /* -------------------------------------------- */

  /**
   * Render a batch of additional messages, prepending them to the top of the log.
   * @param {number} size  The batch size.
   * @returns {Promise<void>}
   */
  async #doRenderBatch(size) {
    if ( !this.rendered ) {
      this.#renderingBatch = false;
      return;
    }

    const messages = game.messages.contents;
    const log = this.element.querySelector(".chat-log");

    // Get the index of the last rendered chat message
    let lastIdx = messages.findIndex(m => m.id === this.#lastId);
    lastIdx = lastIdx > -1 ? lastIdx : messages.length;
    if ( !lastIdx ) {
      this.#renderingBatch = false;
      return;
    }

    // Get the next batch to render
    const targetIdx = Math.max(lastIdx - size, 0);
    const elements = [];
    for ( let i = targetIdx; i < lastIdx; i++ ) {
      const message = messages[i];
      if ( !message.visible ) continue;
      message.logged = true;
      try {
        elements.push(await this.constructor.renderMessage(message));
      } catch(err) {
        Hooks.onError("ChatLog##doRenderBatch", err, {
          msg: `Chat message ${message.id} failed to render`,
          log: "error"
        });
      }
    }

    // Prepend the HTML
    log.prepend(...elements);
    this.#lastId = messages[targetIdx].id;
    this.#renderingBatch = false;
    if ( !this.isPopout ) this.#overflowingDebounce();
  }

  /* -------------------------------------------- */

  /**
   * Get context menu entries for chat messages in the log.
   * @returns {ContextMenuEntry[]}
   * @protected
   */
  _getEntryContextOptions() {
    return [{
      name: "CHAT.PopoutMessage",
      icon: '<i class="fa-solid fa-up-right-from-square fa-rotate-180"></i>',
      condition: li => {
        const message = game.messages.get(li.dataset.messageId);
        return message.getFlag("core", "canPopout") === true;
      },
      callback: li => {
        const message = game.messages.get(li.dataset.messageId);
        new CONFIG.ChatMessage.popoutClass({ message }).render({ force: true });
      }
    }, {
      name: "CHAT.RevealMessage",
      icon: '<i class="fa-solid fa-eye"></i>',
      condition: li => {
        const message = game.messages.get(li.dataset.messageId);
        const isLimited = message.whisper.length || message.blind;
        return isLimited && (game.user.isGM || message.isAuthor) && message.isContentVisible;
      },
      callback: li => {
        const message = game.messages.get(li.dataset.messageId);
        return message.update({whisper: [], blind: false});
      }
    }, {
      name: "CHAT.ConcealMessage",
      icon: '<i class="fa-solid fa-eye-slash"></i>',
      condition: li => {
        const message = game.messages.get(li.dataset.messageId);
        const isLimited = message.whisper.length || message.blind;
        return !isLimited && (game.user.isGM || message.isAuthor) && message.isContentVisible;
      },
      callback: li => {
        const message = game.messages.get(li.dataset.messageId);
        return message.update({whisper: ChatMessage.getWhisperRecipients("gm").map(u => u.id), blind: false});
      }
    }, {
      name: "SIDEBAR.Delete",
      icon: '<i class="fa-solid fa-trash"></i>',
      condition: li => {
        const message = game.messages.get(li.dataset.messageId);
        return message.canUserModify(game.user, "delete");
      },
      callback: li => {
        const message = game.messages.get(li.dataset.messageId);
        return message ? message.delete() : this.deleteMessage(li.dataset.messageId);
      }
    }];
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    if ( this.isPopout ) ui.chat._toggleNotifications();
    else {
      setInterval(this.updateTimestamps.bind(this), this.constructor.UPDATE_TIMESTAMP_FREQUENCY);
      await this.#renderNotifications();
    }
    await this.renderBatch(CONFIG.ChatMessage.batchSize);
    /** @fires {hookEvents:getChatMessageContextOptions} */
    this._createContextMenu(this._getEntryContextOptions, ".message[data-message-id]", {
      hookName: "getChatMessageContextOptions",
      parentClassHooks: false
    });
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onRender(context, options) {
    await super._onRender(context, options);
    this._toggleNotifications();
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _postRender(context, options) {
    await super._postRender(context, options);
    if ( options.isFirstRender ) await this.scrollBottom({ waitImages: true });
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    switch ( partId ) {
      case "input": await this._prepareInputContext(context, options); break;
    }
    return context;
  }

  /* -------------------------------------------- */

  /**
   * Prepare rendering context for the chat panel's message input component.
   * @param {ApplicationRenderContext} context
   * @param {ApplicationRenderOptions} options
   * @protected
   */
  async _prepareInputContext(context, options) {
    context.isAtBottom = this.isAtBottom;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _renderHTML(context, options) {
    const parts = await super._renderHTML(context, options);
    if ( parts.input ) this.#jumpToBottomElement = parts.input.querySelector(".jump-to-bottom");
    return parts;
  }


  /* -------------------------------------------- */

  /**
   * Render chat notifications framework.
   * @returns {Promise<void>}
   */
  async #renderNotifications() {
    const right = document.getElementById("ui-right-column-1") ?? document.body;
    const rollMode = game.settings.get("core", "rollMode");
    const rollModes = Object.entries(CONFIG.Dice.rollModes).map(([action, { label, icon }]) => {
      return {
        icon, label, action,
        active: action === rollMode
      };
    });

    const html = await renderTemplate("templates/sidebar/tabs/chat/notifications.hbs", {user: game.user, rollModes});
    [this.#notificationsElement, this.#inputElement, this.#chatControls] = foundry.utils.parseHTML(html);
    this.#notificationsElement.addEventListener("click", this._onClickNotification.bind(this));
    this.#inputElement.addEventListener("keydown", this._onKeyDown.bind(this));
    this.#inputElement.addEventListener("drop", this.#onDropTextAreaData.bind(this));

    right.append(this.#notificationsElement);
    this.#notificationsElement.append(this.#inputElement, this.#chatControls);
    this._toggleNotifications();
    window.addEventListener("blur", this.#onBlurWindow.bind(this));
    setInterval(this.#checkNotificationLifeSpan.bind(this), this.constructor.NOTIFY_TICKER);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _preSyncPartState(partId, newElement, priorElement, state) {
    super._preSyncPartState(partId, newElement, priorElement, state);
    switch ( partId ) {
      case "input": this._preSyncInputState(newElement, priorElement, state); break;
    }
  }

  /* -------------------------------------------- */

  /**
   * Prepare data used to synchronize the state of the chat input.
   * @param {HTMLElement} newElement    The newly-rendered element.
   * @param {HTMLElement} priorElement  The existing element.
   * @param {object} state              A state object which is used to synchronize after replacement.
   * @protected
   */
  _preSyncInputState(newElement, priorElement, state) {
    const textarea = priorElement.querySelector(".chat-input");
    state.message = textarea?.value;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _syncPartState(partId, newElement, priorElement, state) {
    super._syncPartState(partId, newElement, priorElement, state);
    switch ( partId ) {
      case "input": this._syncInputState(newElement, priorElement, state); break;
    }
  }

  /* -------------------------------------------- */

  /**
   * Synchronize the state of the chat input.
   * @param {HTMLElement} newElement    The newly-rendered element.
   * @param {HTMLElement} priorElement  The element being replaced.
   * @param {object} state              The state object used to synchronize the pre- and post-render states.
   * @protected
   */
  _syncInputState(newElement, priorElement, state) {
    const textarea = newElement.querySelector(".chat-input");
    if ( textarea ) textarea.value = state.message;
  }

  /* -------------------------------------------- */
  /*  Event Listeners & Handlers                  */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _attachPartListeners(partId, element, options) {
    super._attachPartListeners(partId, element, options);
    switch ( partId ) {
      case "log": this._attachLogListeners(element, options); break;
    }
  }

  /* -------------------------------------------- */

  /**
   * Attach listeners to the chat log.
   * @param {HTMLElement} element  The log element.
   * @param {ApplicationRenderOptions} options
   * @protected
   */
  _attachLogListeners(element, options) {
    element.addEventListener("scroll", this.#onScrollLog.bind(this), { passive: true });
    element.addEventListener("change", this.#onChangeLog.bind(this));
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onActivate() {
    super._onActivate();
    this._toggleNotifications();
    this.element.querySelector(".chat-input")?.focus();
  }

  /* -------------------------------------------- */

  /**
   * Handle unpausing the notification queue when the window loses focus.
   */
  #onBlurWindow() {
    this.#notificationsElement.querySelectorAll(".message.hovered").forEach(el => el.classList.remove("hovered"));
    this.#notifyUnpauseDebounce();
  }

  /* -------------------------------------------- */

  /**
   * Handle changing the roll mode.
   * @this {ChatLog}
   * @type {ApplicationClickAction}
   */
  static #onChangeRollMode(event) {
    const mode = event.target.dataset.rollMode;
    game.settings.set("core", "rollMode", mode);
  }

  /* -------------------------------------------- */

  /**
   * Handle clicking a chat card notification.
   * Treat action button clicks within the Notifications UI as action clicks on the ChatLog instance itself.
   * @param {PointerEvent} event  The triggering event.
   * @protected
   */
  _onClickNotification(event) {
    const target = event.target.closest("[data-action]");
    if ( !target ) return;
    const { action } = target.dataset;
    let handler = this.options.actions[action];
    let buttons = [0];
    if ( typeof handler === "object" ) {
      buttons = handler.buttons;
      handler = handler.handler;
    }
    if ( buttons.includes(event.button) ) handler?.call(this, event, target);
    else this._onClickAction(event, target);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onClose(options) {
    super._onClose(options);
    this.#lastId = null;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onDeactivate() {
    super._onDeactivate();
    this._toggleNotifications();
  }

  /* -------------------------------------------- */

  /**
   * Handle deleting a single message from the log.
   * @this {ChatLog}
   * @type {ApplicationClickAction}
   */
  static async #onDeleteMessage(event) {
    event.preventDefault();
    const { messageId } = event.target.closest("[data-message-id]")?.dataset ?? {};
    const message = game.messages.get(messageId);
    if ( message ) await message.delete();
    else await this.deleteMessage(messageId);
  }

  /* -------------------------------------------- */

  /**
   * Handle dismissing a chat card notification.
   * @this {ChatLog}
   * @type {ApplicationClickAction}
   */
  static async #onDismissNotification(_event, target) {
    const message = target.closest(".chat-message");
    await this.#dismissNotification(message);
  }

  /* -------------------------------------------- */

  /**
   * Handle the dropping of transferred data onto the chat input.
   * @param {DragEvent} event  The originating drop event.
   */
  async #onDropTextAreaData(event) {
    event.preventDefault();
    const textarea = event.currentTarget;

    // Drop cross-linked content
    const eventData = TextEditor.implementation.getDragEventData(event);
    const link = await TextEditor.implementation.getContentLink(eventData);
    if ( link ) textarea.value += link;

    // Record pending text
    this.#history.pending = textarea.value;
    textarea.focus();
  }

  /* -------------------------------------------- */

  /**
   * Handle toggling the expanded state of a roll breakdown.
   * @this {ChatLog}
   * @type {ApplicationClickAction}
   */
  static #onExpandRoll(event, target) {
    event.preventDefault();
    target.classList.toggle("expanded");
  }

  /* -------------------------------------------- */

  /**
   * Handle exporting the chat log.
   * @this {ChatLog}
   * @type {ApplicationClickAction}
   */
  static #onExportLog() {
    game.messages.export();
  }

  /* -------------------------------------------- */

  /**
   * Handle flushing the chat log.
   * @this {ChatLog}
   * @type {ApplicationClickAction}
   */
  static #onFlushLog() {
    game.messages.flush();
  }

  /* -------------------------------------------- */

  /**
   * Handle hiding the chat tab notification pip.
   */
  #onHidePip() {
    document.querySelector('#sidebar .tabs [data-tab="chat"] + .notification-pip')?.classList.remove("active");
  }

  /* -------------------------------------------- */

  /**
   * Handle pausing the chat notification log when interacting with a chat notification card.
   * @param {PointerEvent} event  The triggering event.
   */
  #onHoverNotification(event) {
    event.currentTarget.classList.toggle("hovered", event.type === "pointerenter");
    if ( event.type === "pointerleave" ) this.#notifyUnpauseDebounce();
  }

  /* -------------------------------------------- */

  /**
   * Handle jumping to the bottom of the chat log.
   * @this {ChatLog}
   * @type {ApplicationClickAction}
   */
  static #onJumpToBottom() {
    this.scrollBottom();
  }

  /* -------------------------------------------- */

  /**
   * Handle keydown events in the chat message entry textarea.
   * @param {KeyboardEvent} event  The triggering event.
   * @protected
   */
  _onKeyDown(event) {
    if ( event.isComposing ) return; // Ignore IME composition.

    const inputOptions = { recordPending: true };
    if ( Hooks.call("chatInput", event, inputOptions) === false ) {
      if ( inputOptions.recordPending ) this.#recordPendingHistory(event);
      return;
    }

    switch ( event.key ) {
      case "ArrowUp": case "ArrowDown":
        this.#recallMessage(event);
        return;

      case "Enter":
        this.#sendMessage(event);
        return;
    }

    this.#recordPendingHistory(event);
  }

  /* -------------------------------------------- */

  /**
   * Return the chat notification queue to the inactive state.
   */
  #onNotifyInactive() {
    this.#notificationsElement.classList.remove("active");
  }

  /* -------------------------------------------- */

  /**
   * Handle scroll events within the chat log.
   * @param {UIEvent} [event]  A triggering scroll event.
   */
  #onScrollLog(event) {
    if ( !this.rendered ) return;
    const log = event?.currentTarget ?? this.element.querySelector(".chat-scroll");
    const pct = log.scrollTop / (log.scrollHeight - log.clientHeight);
    this.#isAtBottom = (pct > 0.99) || Number.isNaN(pct);
    this.#jumpToBottomElement.toggleAttribute("hidden", this.#isAtBottom);
    log.classList.toggle("scrolled", !this.#isAtBottom);
    const top = log.querySelector("li.message");
    if ( pct < 0.01 ) return this.renderBatch(CONFIG.ChatMessage.batchSize).then(() => {
      // Retain the scroll position at the top-most element before the extra messages were prepended to the log.
      if ( top ) log.scrollTop = top.offsetTop;
    });
  }

  /* -------------------------------------------- */

  /**
   * Handle changes to an input element within the log.
   * @param {Event} event
   */
  #onChangeLog(event) {
    if ( !(event.target instanceof HTMLSecretBlockElement) ) return;
    const messageId = event.target.closest("[data-message-id]")?.dataset.messageId;
    if ( !messageId ) return;
    const message = game.messages.get(messageId);
    if ( !message ) return;
    const modified = event.target.toggleRevealed(message.content);
    message.update({ content: modified });
  }

  /* -------------------------------------------- */

  /**
   * Handle unpausing the notification queue and scrolling back down to the bottom.
   */
  #onUnpauseNotifications() {
    if ( this.#notificationsElement.querySelector(".message.hovered") ) return;

    // Now the queue is unpaused, clear any messages that have already expired.
    this.#checkNotificationLifeSpan();

    // Scroll to the bottom.
    this.#notificationsElement.querySelector(":scope > .overflow").scrollTop = 0;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _preClose(options) {
    if ( this.isPopout ) this._toggleNotifications({ closing: true });
  }

  /* -------------------------------------------- */

  /**
   * Update internal record of the pending chat message.
   * @param {KeyboardEvent} event  The triggering event.
   */
  #recordPendingHistory(event) {
    if ( (event.key === "Backspace") || (event.key === "Delete") ) {
      // Remove pending text, after the keypress default behavior has executed.
      requestAnimationFrame(() => this.#history.pending = event.target.value);
    }
    else if ( event.key.length === 1 ) this.#history.pending = event.target.value + event.key;
  }

  /* -------------------------------------------- */
  /*  Message Input                               */
  /* -------------------------------------------- */

  /**
   * Parse a chat string to identify the chat command (if any) which was used.
   * @param {string} message                                            The message to parse.
   * @returns {[string, string[]|RegExpMatchArray|RegExpMatchArray[]]}  The identified command and regex match.
   */
  static parse(message) {
    for ( const [rule, rgx] of Object.entries(this.MESSAGE_PATTERNS) ) {

      // For multi-line matches, the first line must match
      if ( this.MULTILINE_COMMANDS.has(rule) ) {
        const lines = message.split("\n");
        if ( rgx.test(lines[0]) ) return [rule, lines.map(l => l.match(rgx))];
      }

      // For single-line matches, match directly
      else {
        const match = message.match(rgx);
        if ( match ) return [rule, match];
      }
    }
    return ["none", [message, "", message]];
  }

  /* -------------------------------------------- */

  /**
   * Prepare the data object of chat message data depending on the type of message being posted.
   * @param {string} message                      The original string of the message content
   * @param {object} [options]                    Additional options
   * @param {ChatSpeakerData} [options.speaker]   The speaker data
   * @returns {Promise<ChatMessage|void>}         The created ChatMessage Document, or void if we were executing a
   *                                              macro instead.
   * @throws {Error}                              If an invalid command is found.
   */
  async processMessage(message, {speaker}={}) {
    message = message.trim();
    if ( !message ) return;
    const cls = ChatMessage.implementation;
    speaker ??= cls.getSpeaker();

    // Set up basic chat data
    const chatData = {speaker, user: game.user.id};

    if ( Hooks.call("chatMessage", this, message, chatData) === false ) return;

    // Parse the message to determine the matching handler
    const parsed = this.constructor.parse(message);
    let command = parsed[0];
    const match = parsed[1];

    // Special handlers for no command
    if ( command === "invalid" ) throw new Error(game.i18n.format("CHAT.InvalidCommand", {command: match[1]}));
    else if ( command === "none" ) command = chatData.speaker.token ? "ic" : "ooc";

    // Process message data based on the identified command type
    const createOptions = {};
    switch ( command ) {
      case "roll": case "gmroll": case "blindroll": case "selfroll": case "publicroll":
        await this.#processDiceCommand(command, match, chatData, createOptions);
        break;
      case "whisper": case "reply": case "gm": case "players":
        this.#processWhisperCommand(command, match, chatData);
        break;
      case "ic": case "emote": case "ooc":
        this.#processChatCommand(command, match, chatData, createOptions);
        break;
      case "macro":
        this.#processMacroCommand(match);
        return;
    }

    // Create the message using provided data and options
    return cls.create(chatData, createOptions);
  }

  /* -------------------------------------------- */

  /**
   * Process non-whispered messages.
   * @param {string} command          The chat command type
   * @param {RegExpMatchArray} match  The matched RegExp expressions
   * @param {Object} chatData         The initial chat data
   * @param {Object} createOptions    Options used to create the message
   * @throws {Error}                  If attempting to emote or chat in-character without a speaker.
   */
  #processChatCommand(command, match, chatData, createOptions) {
    if ( ["ic", "emote"].includes(command) && !(chatData.speaker.actor || chatData.speaker.token) ) {
      throw new Error("You cannot chat in-character without an identified speaker");
    }
    chatData.content = match[2].replace(/\n/g, "<br>");

    // Augment chat data
    if ( command === "ic" ) {
      chatData.style = CONST.CHAT_MESSAGE_STYLES.IC;
      createOptions.chatBubble = true;
    } else if ( command === "emote" ) {
      chatData.style = CONST.CHAT_MESSAGE_STYLES.EMOTE;
      chatData.content = `${chatData.speaker.alias} ${chatData.content}`;
      createOptions.chatBubble = true;
    } else {
      chatData.style = CONST.CHAT_MESSAGE_STYLES.OOC;
      delete chatData.speaker;
    }
  }

  /* -------------------------------------------- */

  /**
   * Process dice roll commands.
   * @param {string} command              The chat command type
   * @param {RegExpMatchArray[]} matches  Multi-line matched roll expressions
   * @param {Object} chatData             The initial chat data
   * @param {Object} createOptions        Options used to create the message
   */
  async #processDiceCommand(command, matches, chatData, createOptions) {
    const actor = ChatMessage.getSpeakerActor(chatData.speaker) || game.user.character;
    const rollData = actor ? actor.getRollData() : {};
    const rolls = [];
    const rollMode = command === "roll" ? game.settings.get("core", "rollMode") : command;
    for ( const match of matches ) {
      if ( !match ) continue;
      const [formula, flavor] = match.slice(2, 4);
      if ( flavor && !chatData.flavor ) chatData.flavor = flavor;
      const roll = Roll.create(formula, rollData);
      await roll.evaluate({allowInteractive: rollMode !== CONST.DICE_ROLL_MODES.BLIND});
      rolls.push(roll);
    }
    chatData.rolls = rolls;
    chatData.sound = CONFIG.sounds.dice;
    chatData.content = rolls.reduce((t, r) => t + r.total, 0);
    createOptions.rollMode = rollMode;
  }

  /* -------------------------------------------- */

  /**
   * Process messages which execute a macro.
   * @param {RegExpMatchArray} match  The RegExp matches.
   * @throws {Error}                  If the macro could not be found.
   */
  #processMacroCommand(match) {

    // Parse the macro command with the form /macro {macroName} [param1=val1] [param2=val2] ...
    let [macroName, ...params] = match[2].split(" ");
    let expandName = true;
    const scope = {};
    let k = undefined;
    for ( const p of params ) {
      const kv = p.split("=");
      if ( kv.length === 2 ) {
        k = kv[0];
        scope[k] = kv[1];
        expandName = false;
      }
      else if ( expandName ) macroName += ` ${p}`; // Macro names may contain spaces
      else if ( k ) scope[k] += ` ${p}`;  // Expand prior argument value
    }
    macroName = macroName.trimEnd(); // Eliminate trailing spaces

    // Get the target macro by number or by name
    let macro;
    if ( Number.isNumeric(macroName) ) {
      const macroID = game.user.hotbar[macroName];
      macro = game.macros.get(macroID);
    }
    if ( !macro ) macro = game.macros.getName(macroName);
    if ( !macro ) throw new Error(`Requested Macro "${macroName}" was not found as a named macro or hotbar position`);

    // Execute the Macro with provided scope
    macro.execute(scope);
  }

  /* -------------------------------------------- */

  /**
   * Process whispered messages.
   * @param {string} command          The chat command type
   * @param {RegExpMatchArray} match  The matched RegExp expressions
   * @param {Object} chatData         The initial chat data
   * @throws {Error}                  If this user does not have permission to whisper, or there are no valid whisper
   *                                  recipients.
   */
  #processWhisperCommand(command, match, chatData) {
    delete chatData.speaker;

    // Determine the recipient users
    let users = [];
    let message = "";
    switch ( command ) {
      case "whisper": {
        message = match[3];
        const names = match[2].replace(/[[\]]/g, "").split(",").map(n => n.trim());
        users = names.reduce((arr, n) => arr.concat(ChatMessage.getWhisperRecipients(n)), []);
        break;
      }
      case "reply": {
        message = match[2];
        const w = this.#lastWhisper;
        if ( w ) {
          const group = new Set(w.whisper);
          group.delete(game.user.id);
          group.add(w.author.id);
          users = Array.from(group).map(id => game.users.get(id)).filter(_ => _);
        }
        break;
      }
      case "gm":
        message = match[2];
        users = ChatMessage.getWhisperRecipients("gm");
        break;
      case "players":
        message = match[2];
        users = ChatMessage.getWhisperRecipients("players");
        break;
    }

    // Add line break elements
    message = message.replace(/\n/g, "<br>");

    // Ensure we have valid whisper targets
    if ( !users.length ) throw new Error(game.i18n.localize("ERROR.NoTargetUsersForWhisper"));
    if ( users.some(u => !u.isGM) && !game.user.can("MESSAGE_WHISPER") ) {
      throw new Error(game.i18n.localize("ERROR.CantWhisper"));
    }

    // Update chat data
    chatData.whisper = users.map(u => u.id);
    chatData.content = message;
    chatData.sound = CONFIG.sounds.notification;
  }

  /* -------------------------------------------- */

  /**
   * Handle recalling message history.
   * @param {KeyboardEvent} event  The triggering event.
   */
  #recallMessage(event) {
    let {index } = this.#history;
    const {pending, queue} = this.#history;
    if ( pending || !queue.length ) return;
    const direction = event.key === "ArrowUp" ? 1 : -1;
    index = Math.clamp(index + direction, -1, queue.length - 1);
    this.#history.index = index;
    event.target.value = queue[index] || "";
  }

  /* -------------------------------------------- */

  /**
   * Update message history.
   * @param {string} message  The sent message.
   */
  #rememberMessage(message) {
    const { queue } = this.#history;
    if ( queue.length >= this.constructor.MAX_MESSAGE_HISTORY ) queue.pop();
    queue.unshift(message);
    this.#history.index = -1;
  }

  /* -------------------------------------------- */

  /**
   * Handle sending a chat message.
   * @param {KeyboardEvent} event  The triggering event.
   */
  async #sendMessage(event) {
    if ( event.shiftKey ) return;
    event.preventDefault();
    const message = event.target.value;
    if ( !message ) return;
    event.stopPropagation();

    try {
      await this.processMessage(message);
      this.#history.pending = event.target.value = "";
      this.#rememberMessage(message);
    } catch(e) {
      Hooks.onError("ChatLog##sendMessage", e, { notify: "error", log: "error", message });
    }
  }

  /* -------------------------------------------- */
  /*  Public API                                  */
  /* -------------------------------------------- */

  /**
   * Delete a single message from the chat log.
   * @param {string} messageId                   The ID of the ChatMessage Document to remove from the log.
   * @param {object} [options]
   * @param {boolean} [options.deleteAll=false]  Delete all messages from the log.
   * @returns {Promise<void>}
   */
  deleteMessage(messageId, options={}) {
    return this.#renderingQueue.add(this.#deleteMessage.bind(this), messageId, options);
  }

  /* -------------------------------------------- */

  /**
   * Trigger a notification that alerts the user visually and audibly of new chat activity.
   * @param {ChatMessage} message             The created or updated message.
   * @param {object} [options]
   * @param {HTMLElement} [options.existing]  The existing rendered chat card, if it exists.
   * @param {boolean} [options.newMessage]    Whether this is a new message.
   */
  notify(message, { existing, newMessage }={}) {
    if ( !this.rendered ) return;

    // Post a chat card notification if the setting is enabled and this is a new message.
    if ( newMessage && this._shouldShowNotifications() ) this.#postNotification(message, { existing });

    // Otherwise show a notification pip on the chat tab.
    else {
      document.querySelector('#sidebar .tabs [data-tab="chat"] + .notification-pip')?.classList.add("active");
      this.#pipHideDebounce();
    }

    // Play a notification sound effect.
    if ( message.sound ) game.audio.play(message.sound, { context: game.audio.interface });
  }

  /* -------------------------------------------- */

  /**
   * Post a single chat message to the log.
   * @param {ChatMessage} message             The chat message.
   * @param {object} [options]
   * @param {string} [options.before]         An existing message ID to prepend the posted message to, by default the
   *                                          new message is appended to the end of the log.
   * @param {boolean} [options.notify=false]  Trigger a notification which shows the log as having a new unread message.
   * @returns {Promise<void>}                 A Promise which resolves once the message has been posted.
   */
  async postOne(message, options={}) {
    if ( !message.visible ) return;
    return this.#renderingQueue.add(this.#postOne.bind(this), message, options);
  }

  /* -------------------------------------------- */

  /**
   * Render a batch of additional messages, prepending them to the top of the log.
   * @param {number} size  The batch size.
   * @returns {Promise<void>}
   */
  async renderBatch(size) {
    if ( this.#renderingBatch ) return;
    this.#renderingBatch = true;
    return this.#renderingQueue.add(this.#doRenderBatch.bind(this), size);
  }

  /* -------------------------------------------- */

  /**
   * Re-render a message in the chat log, keeping its ephemeral state synchronized.
   * @param {ChatMessage} message   The ChatMessage Document.
   * @param {HTMLElement} existing  The existing rendered element.
   * @param {object} [options]      Options forwarded to {@link foundry.documents.ChatMessage#renderHTML}.
   */
  async #rerenderMessage(message, existing, options={}) {
    const expanded = Array.from(existing.querySelectorAll('[data-action="expandRoll"]')).map(el => {
      return el.classList.contains("expanded");
    });
    const replacement = await this.constructor.renderMessage(message, options);
    const rolls = replacement.querySelectorAll('[data-action="expandRoll"]');
    for ( let i = 0; i < rolls.length; i++ ) rolls[i].classList.toggle("expanded", expanded[i]);
    replacement.hidden = existing.hidden;
    replacement.style.opacity = existing.style.opacity;
    existing.replaceWith(replacement);
    if ( "_lifeSpan" in existing ) {
      replacement._lifeSpan = existing._lifeSpan;
      replacement.addEventListener("pointerenter", this.#onHoverNotification.bind(this));
      replacement.addEventListener("pointerleave", this.#onHoverNotification.bind(this));
    }
  }

  /* -------------------------------------------- */

  /**
   * Scroll the chat log to the bottom.
   * @param {object} [options]
   * @param {boolean} [options.popout=false]                 If a popout exists, scroll it to the bottom too.
   * @param {boolean} [options.waitImages=false]             Wait for any images embedded in the chat log to load first
   *                                                         before scrolling.
   * @param {ScrollIntoViewOptions} [options.scrollOptions]  Options to configure scrolling behavior.
   */
  async scrollBottom({popout=false, waitImages=false, scrollOptions={}}={}) {
    if ( !this.rendered ) return;
    const scroll = this.element.querySelector(".chat-scroll");
    if ( waitImages ) await this.constructor.waitForImages(scroll);
    scroll.scrollTop = 0x7fffffbf;
    if ( popout ) this.popout?.scrollBottom({waitImages, scrollOptions});
  }

  /* -------------------------------------------- */

  /**
   * Update the contents of a previously-posted message.
   * @param {ChatMessage} message  The ChatMessage instance to update.
   * @param {object} options
   * @param {boolean} [options.notify=false]  Trigger a notification which shows the log as having a new unread message.
   * @returns {Promise<void>}
   */
  async updateMessage(message, options={}) {
    return this.#renderingQueue.add(this.#updateMessage.bind(this), message, options);
  }

  /* -------------------------------------------- */

  /**
   * Update displayed timestamps for every displayed message in the chat log.
   * Timestamps are displayed in a humanized "time-since" format.
   */
  updateTimestamps() {
    for ( const li of document.querySelectorAll(".chat-message[data-message-id]") ) {
      const message = game.messages.get(li.dataset.messageId);
      if ( !message?.timestamp ) return;
      const stamp = li.querySelector(".message-timestamp");
      if ( stamp ) stamp.textContent = foundry.utils.timeSince(message.timestamp);
    }
  }

  /* -------------------------------------------- */
  /*  Private API                                 */
  /* -------------------------------------------- */

  /**
   * Check for notifications that should be automatically dismissed.
   */
  #checkNotificationLifeSpan() {
    let isPaused = false;
    const { NOTIFY_DURATION, NOTIFY_TICKER } = this.constructor;
    for ( const element of this.#notificationsElement.querySelectorAll(".message") ) {
      element._lifeSpan += NOTIFY_TICKER;
      if ( element.classList.contains("hovered") ) isPaused = true;
      if ( !isPaused && (element._lifeSpan >= NOTIFY_DURATION) ) this.#dismissNotification(element);
    }
  }

  /* -------------------------------------------- */

  /**
   * Delete a single message from the chat log.
   * @param {string} messageId                   The ID of the ChatMessage Document to remove from the log.
   * @param {object} [options]
   * @param {boolean} [options.deleteAll=false]  Delete all messages from the log.
   */
  #deleteMessage(messageId, {deleteAll=false}={}) {
    if ( !this.rendered ) return;

    // Get the chat message being removed from the log
    const message = game.messages.get(messageId);
    if ( message ) message.logged = false;

    // Get the message's element
    const li = this.element.querySelector(`.message[data-message-id="${messageId}"]`);
    if ( !li ) return;

    // Update the last index
    if ( deleteAll ) this.#lastId = null;
    else if ( messageId === this.#lastId ) this.#lastId = li.nextElementSibling?.dataset.messageId ?? null;

    // Remove the deleted message
    li.classList.add("deleting");
    li.animate(
      { height: [`${li.getBoundingClientRect().height}px`, "0"] },
      { duration: 100, easing: "ease" }
    ).finished.then(() => {
      li.remove();
      this.#onScrollLog();
    });

    if ( !this.isPopout ) {
      this.#notificationsElement.querySelector(`.message[data-message-id="${messageId}"]`)?.remove();
    }

    // Delete from the popout tab
    this.popout?.deleteMessage(messageId, {deleteAll});
    if ( this.isPopout ) this.setPosition();
    else this.#overflowingDebounce();
  }

  /* -------------------------------------------- */

  /**
   * Dismiss a notification from the ChatLog.
   * @param {HTMLElement} element
   * @returns {Promise<void>}
   */
  async #dismissNotification(element) {
    element.classList.add("deleting");
    await element.animate({
      opacity: [1, 0],
      transform: ["translateY(0)", "translateY(-35px)"]
    }, { duration: 250, easing: "ease", fill: "forwards" }).finished;
    await element.animate({
      height: [`${element.getBoundingClientRect().height}px`, "0"]
    }, { duration: 100, easing: "ease" }).finished;
    element.remove();
  }

  /* -------------------------------------------- */

  /**
   * Post a chat card to the notification queue.
   * @param {ChatMessage} message             The message to render.
   * @param {object} [options]
   * @param {HTMLElement} [options.existing]  The corresponding element in the chat log, if it exists.
   * @returns {Promise<void>}
   */
  async #postNotification(message, { existing }={}) {
    const log = this.#notificationsElement.querySelector(".chat-log");
    const paused = log.querySelector(".message.hovered");
    this.#notificationsElement.classList.add("active");
    this.#notifyAlertDebounce();

    const dummy = document.createElement("li");
    dummy.classList.add("chat-message", "message");
    dummy.dataset.messageId = message.id;
    dummy.hidden = true;
    log.append(dummy);

    let element = await this.constructor.renderMessage(message, { canDelete: false, canClose: true });
    element.addEventListener("pointerenter", this.#onHoverNotification.bind(this));
    element.addEventListener("pointerleave", this.#onHoverNotification.bind(this));
    element.hidden = true;
    dummy.replaceWith(element);

    // Insert spacer element to animate gap for card to be inserted.
    const { height=130 } = existing?.getBoundingClientRect() ?? {};
    const spacer = document.createElement("li");
    spacer.style.height = "0";
    spacer.classList.add("spacer");
    log.append(spacer);
    if ( !paused ) spacer.scrollIntoView();
    await spacer.animate(
      { height: ["0", `${height}px`] },
      { duration: 100, easing: "ease", fill: "forwards" }
    ).finished;

    // Insert the new card.
    spacer.remove();
    element = this.#notificationsElement.querySelector(`.message[data-message-id="${message.id}"]`);
    element.hidden = false;
    element.animate({
      opacity: [0, 1],
      transform: ["translateY(-35px)", "translateY(0)"]
    }, { duration: 250, easing: "ease", fill: "forwards" });
    element._lifeSpan = 0;
  }

  /* -------------------------------------------- */

  /**
   * Post a single chat message to the log.
   * @param {ChatMessage} message             The chat message.
   * @param {object} [options]
   * @param {string} [options.before]         An existing message ID to prepend the posted message to, by default the
   *                                          new message is appended to the end of the log.
   * @param {boolean} [options.notify=false]  Trigger a notification which shows the log as having a new unread message.
   * @returns {Promise<void>}                 A Promise which resolves once the message has been posted.
   */
  async #postOne(message, {before, notify=false}={}) {
    if ( !this.rendered ) return;
    message.logged = true;

    // Track internal flags
    if ( !this.#lastId ) this.#lastId = message.id; // Ensure that new messages don't result in batched scrolling.
    if ( (message.whisper || []).includes(game.user.id) && !message.isRoll ) this.#lastWhisper = message;

    // Render the message to the log
    const log = this.element.querySelector(".chat-log");
    const html = await this.constructor.renderMessage(message);

    // Append the message after some other one
    const existing = before ? this.element.querySelector(`.message[data-message-id="${before}"]`) : null;
    if ( existing ) existing.insertAdjacentElement("beforebegin", html);

    // Otherwise, append the message to the bottom of the log
    else {
      log.append(html);
      if ( this.isAtBottom || (message.author.id === game.user.id) ) this.scrollBottom({waitImages: true});
    }

    // Append to notifications.
    if ( notify ) this.notify(message, {existing: html, newMessage: true});

    // Update popout tab
    await this.popout?.postOne(message, {before, notify: false});
    if ( this.isPopout ) this.setPosition();
    else this.#overflowingDebounce();
  }

  /* -------------------------------------------- */

  /**
   * Update the contents of a previously-posted message.
   * @param {ChatMessage} message  The ChatMessage instance to update.
   * @param {object} options
   * @param {boolean} [options.notify=false]  Trigger a notification which shows the log as having a new unread message.
   * @returns {Promise<void>}
   */
  async #updateMessage(message, {notify=false}={}) {
    const li = this.element.querySelector(`.message[data-message-id="${message.id}"]`);
    if ( li ) await this.#rerenderMessage(message, li);
    // A previously invisible message has become visible to this user.
    else {
      const messages = game.messages.contents;
      const messageIndex = messages.findIndex(m => m === message);
      let nextMessage;
      for ( let i = messageIndex + 1; i < messages.length; i++ ) {
        if ( messages[i].visible ) {
          nextMessage = messages[i];
          break;
        }
      }
      await this.#postOne(message, {before: nextMessage?.id, notify: false});
    }

    if ( !this.isPopout ) {
      const existing = this.#notificationsElement.querySelector(`.message[data-message-id="${message.id}"]`);
      if ( existing ) await this.#rerenderMessage(message, existing, { canDelete: false, canClose: true });
    }

    if ( notify ) this.notify(message);

    // Update the popout tab
    await this.popout?.updateMessage(message, {notify: false});
    if ( this.isPopout ) this.setPosition();
    else this.#overflowingDebounce();
  }

  /* -------------------------------------------- */
  /*  Helpers                                     */
  /* -------------------------------------------- */

  /**
   * Handles chat message rendering during the ChatMessage#getHTML deprecation period. After that period ends, calls to
   * this method can be replaced by ChatMessage#renderHTML.
   * @param {ChatMessage} message  The chat message to render.
   * @param {object} [options]     Options forwarded to the render function.
   * @returns {Promise<HTMLElement>}
   * @throws {Error}               If the message's render methods do not return a usable result.
   */
  static async renderMessage(message, options) {
    const hasGetHTML = foundry.utils.getDefiningClass(message, "getHTML") !== ChatMessage;
    const hasRenderHTML = foundry.utils.getDefiningClass(message, "renderHTML") !== ChatMessage;
    /** @deprecated since v13 */
    if ( hasGetHTML && !hasRenderHTML ) {
      const html = await message.getHTML(options);
      if ( html instanceof HTMLElement ) return html;
      if ( html[0] instanceof HTMLElement ) return html[0];
      throw new Error(`Unable to render ChatMessage [${message.id}] as it did not return an HTMLElement or jQuery.`);
    }
    return message.renderHTML(options);
  }

  /* -------------------------------------------- */

  /**
   * Update the overflowing state of the chat scroll container.
   */
  #setOverflowing() {
    const scroll = this.element.querySelector(".chat-scroll");
    scroll.classList.toggle("overflowed", scroll.scrollHeight > scroll.offsetHeight);
  }

  /* -------------------------------------------- */

  /**
   * Determine whether the notifications pane should be visible.
   * @param {object} [options]
   * @param {boolean} [options.closing=false]  Whether the chat popout is closing.
   * @returns {boolean}
   * @protected
   */
  _shouldShowNotifications({ closing=false }={}) {
    const { chatNotifications, uiScale } = game.settings.get("core", "uiConfig");

    // Case 1 - Chat notifications disabled.
    if ( (chatNotifications === "pip") || this.options.stream ) return false;

    // Case 2 - Chat tab visible in sidebar.
    if ( ui.sidebar.expanded && ui.chat.active ) return false;

    // Case 3 - Chat popout visible.
    if ( ui.chat.popout?.rendered && (!this.isPopout || !closing) ) return false;

    // Case 4 - Not enough viewport width available.
    const cameraDock = ui.webrtc.isVertical && !ui.webrtc.hidden;
    const viewportWidth = window.innerWidth / uiScale;
    const spaceRequired = 1024 + (ui.sidebar.expanded * 300) + (cameraDock * 264);
    return viewportWidth >= spaceRequired;
  }

  /* -------------------------------------------- */

  /**
   * Update notification display, based on interface state.
   * If the chat log is popped-out, embed chat input into it. Otherwise,
   * if the sidebar is expanded, and the chat log is the active tab, embed chat input into it. Otherwise,
   * embed chat input into the notifications area.
   * If the sidebar is expanded, and the chat log is the active tab, do not display notifications.
   * If the chat log is popped out, do not display notifications.
   * @param {object} [options]
   * @param {boolean} [options.closing=false]  Whether this method has been triggered by the chat popout closing.
   * @fires {hookEvents:renderChatInput}
   * @internal
   */
  _toggleNotifications({ closing=false }={}) {
    if ( ui.chat.popout?.rendered && !this.isPopout ) return;
    const notifications = document.getElementById("chat-notifications");
    const inputElement = document.getElementById("chat-message");
    const chatControls = document.getElementById("chat-controls");
    const privacyButtons = document.getElementById("roll-privacy");
    const log = notifications.querySelector(".chat-log");
    const embedInput = !this._shouldShowNotifications({ closing });
    log.hidden = embedInput;
    privacyButtons.classList.toggle("vertical", !embedInput);
    const previousParent = inputElement.parentElement;
    if ( game.user.isGM ) chatControls.querySelector(".control-buttons").hidden = !embedInput;
    if ( embedInput ) {
      const target = ui.chat.popout?.rendered && !closing ? ui.chat.popout : ui.chat;
      target.element.querySelector(".chat-form").append(chatControls, inputElement);
    }
    else notifications.append(inputElement, chatControls);
    Hooks.callAll("renderChatInput", this, {
      "#chat-message": inputElement,
      "#chat-controls": chatControls,
      "#roll-privacy": privacyButtons
    }, {previousParent});
    this.#offsetHotbar(!embedInput);
    if ( this.#isAtBottom ) this.scrollBottom();
  }

  /* -------------------------------------------- */

  /**
   * Handle updating the roll mode display.
   * @internal
   */
  _updateRollMode() {
    if ( this.isPopout ) return;
    const rollMode = game.settings.get("core", "rollMode");
    for ( const button of document.getElementById("roll-privacy").querySelectorAll("button") ) {
      button.ariaPressed = `${rollMode === button.dataset.rollMode}`;
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle offsetting the hotbar based on the chat notification position.
   * @param {boolean} notifications  Whether the chat notifications are active.
   */
  #offsetHotbar(notifications) {
    if ( this.options.stream ) return;
    const hotbar = document.getElementById("hotbar");
    hotbar.style.transition = "none";
    hotbar.classList.remove("offset");
    hotbar.style.removeProperty("--offset");
    hotbar.style.transition = "";
    if ( !notifications ) return;
    const { uiScale } = game.settings.get("core", "uiConfig");
    // Calculate an offset to keep the hotbar visually centered.
    const bb = hotbar.getBoundingClientRect();
    // Hard-code this number for now since the sidebar is mid-animation so we can't get an accurate width.
    const rightWidth = (380 + (300 * ui.sidebar.expanded)) / uiScale;
    const offset = (window.innerWidth / uiScale) - bb.right - rightWidth;
    if ( offset > 0 ) return; // Don't move closer to the sidebar.
    hotbar.classList.add("offset");
    hotbar.style.setProperty("--offset", `${offset}px`);
  }
}

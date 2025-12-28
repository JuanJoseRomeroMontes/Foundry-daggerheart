import HTMLSecretBlockElement from "@client/applications/elements/secret-block.mjs";
import ApplicationV2 from "../../api/application.mjs";
import ChatLog from "../tabs/chat.mjs";
import ChatMessage from "@client/documents/chat-message.mjs";

/**
 * @import {ApplicationConfiguration, ApplicationRenderOptions} from "../_types.mjs"
 */

/**
 * @typedef {ApplicationConfiguration} ChatPopoutConfiguration
 * @property {ChatMessage} message  The message being rendered.
 */

/**
 * A simple application for rendering a single chat message in its own frame.
 * @extends {ApplicationV2<ChatPopoutConfiguration, ApplicationRenderOptions>}
 */
export default class ChatPopout extends ApplicationV2 {
  constructor(options={}) {
    super(options);
    if ( !(options.message instanceof ChatMessage) ) throw new Error("The ChatPopout application must be provided "
      + "a ChatMessage Document to render.");
    this.#message = options.message;
  }

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["chat-popout", "themed", "theme-light"],
    position: {
      width: 300
    }
  };

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * The message being rendered.
   * @type {ChatMessage}
   */
  get message() {
    return this.#message;
  }

  /**
   * @type {ChatMessage}
   */
  #message;

  /** @override */
  get title() {
    const message = this.#message;
    if ( !message.isContentVisible ) return "";
    if ( message.title !== undefined ) return message.title;
    if ( message.flavor !== undefined ) {
      return new DOMParser().parseFromString(message.flavor, "text/html").body.textContent;
    }
    if ( message.speaker.alias !== undefined ) return message.speaker.alias;
    return "";
  }

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _initializeApplicationOptions(options) {
    const applicationOptions = super._initializeApplicationOptions(options);
    applicationOptions.uniqueId = `chat-popout-${options.message.id}`;
    return applicationOptions;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onClose(options) {
    super._onClose(options);
    delete this.message.apps[this.id];
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    this.message.apps[this.id] = this;
  }

  /* -------------------------------------------- */

  /** @override */
  async _renderHTML(context, options) {
    return ChatLog.renderMessage(this.message, { canDelete: false });
  }

  /* -------------------------------------------- */

  /** @override */
  _replaceHTML(result, content, options) {
    content.replaceChildren(result);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _attachFrameListeners() {
    super._attachFrameListeners();
    this.element.addEventListener("change", this.#onChange.bind(this));
  }

  /* -------------------------------------------- */

  /**
   * Handle changes to an input element within the chat popout.
   * @param {Event} event
   */
  #onChange(event) {
    if ( !(event.target instanceof HTMLSecretBlockElement) ) return;
    const modified = event.target.toggleRevealed(this.message.content);
    this.message.update({ content: modified });
  }
}

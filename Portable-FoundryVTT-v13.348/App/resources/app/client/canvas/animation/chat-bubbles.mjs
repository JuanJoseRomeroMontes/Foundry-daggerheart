import TextEditor from "../../applications/ux/text-editor.mjs";
import ChatMessage from "../../documents/chat-message.mjs";
import TokenDocument from "../../documents/token.mjs";
import Hooks from "../../helpers/hooks.mjs";

/**
 * @typedef ChatBubbleOptions
 * @property {string[]} [cssClasses]    An optional array of CSS classes to apply to the resulting bubble
 * @property {boolean} [pan=true]       Pan to the token speaker for this bubble, if allowed by the client
 * @property {boolean} [requireVisible=false] Require that the token be visible in order for the bubble to be rendered
 */

/**
 * The Chat Bubble Class
 * This application displays a temporary message sent from a particular Token in the active Scene.
 * The message is displayed on the HUD layer just above the Token.
 */
export default class ChatBubbles {

  /**
   * The Handlebars template used to render Chat Bubbles.
   * @type {string}
   */
  template = "templates/hud/chat-bubble.html";

  /* -------------------------------------------- */

  /**
   * Track active Chat Bubbles
   * @type {object}
   */
  bubbles = {};

  /* -------------------------------------------- */

  /**
   * Track which Token was most recently panned to highlight
   * Use this to avoid repeat panning
   * @type {Token}
   */
  #panned = null;

  /* -------------------------------------------- */

  /**
   * A reference to the chat bubbles HTML container in which rendered bubbles should live
   * @returns {HTMLElement}
   */
  get element() {
    return document.getElementById("chat-bubbles");
  }

  /* -------------------------------------------- */

  /**
   * Create a chat bubble message for a certain token which is synchronized for display across all connected clients.
   * @param {TokenDocument} token           The speaking Token Document
   * @param {string} message                The spoken message text
   * @param {ChatBubbleOptions} [options]   Options which affect the bubble appearance
   * @returns {Promise<HTMLElement|null>}   A promise which resolves with the created bubble HTML, or null
   */
  async broadcast(token, message, options={}) {
    if ( token instanceof foundry.canvas.placeables.Token ) token = token.document;
    if ( !(token instanceof TokenDocument) || !message ) {
      throw new Error("You must provide a Token instance and a message string");
    }
    game.socket.emit("chatBubble", {
      sceneId: token.parent.id,
      tokenId: token.id,
      message,
      options
    });
    return this.say(token.object, message, options);
  }

  /* -------------------------------------------- */

  /**
   * Speak a message as a particular Token, displaying it as a chat bubble
   * @param {Token} token                   The speaking Token
   * @param {string} message                The spoken message text
   * @param {ChatBubbleOptions} [options]   Options which affect the bubble appearance
   * @returns {Promise<HTMLElement|null>}   A Promise which resolves to the created bubble HTML element, or null
   */
  async say(token, message, {cssClasses=[], requireVisible=false, pan=true}={}) {

    // Ensure that a bubble is allowed for this token
    if ( !token || !message ) return null;
    const allowBubbles = game.settings.get("core", "chatBubbles");
    if ( !allowBubbles ) return null;
    if ( requireVisible && !token.visible ) return null;

    // Clear any existing bubble for the speaker
    await this.#clearBubble(token);

    // Create the HTML and call the chatBubble hook
    const actor = ChatMessage.implementation.getSpeakerActor({scene: token.scene.id, token: token.id});
    message = await TextEditor.implementation.enrichHTML(message, {rollData: actor?.getRollData(),
      secrets: actor?.isOwner ?? game.user.isGM});
    const html = await this.#renderHTML({token, message, cssClasses: cssClasses.join(" ")});
    const options = {cssClasses, requireVisible, pan};

    const allowed = Hooks.call("chatBubbleHTML", token, html, message, options);
    if ( allowed === false ) return false;

    /** @deprecated since v13 */
    if ( "chatBubble" in Hooks.events ) {
      foundry.utils.logCompatibilityWarning("The chatBubble hook is deprecated. Please use "
        + "chatBubbleHTML instead, which now passes an HTMLElement argument instead of jQuery.",
      { since: 13, until: 15, once: true });
      const allowed = Hooks.call("chatBubble", token, $(html), message, options);
      if ( allowed === false ) return null;
    }

    // Set initial dimensions
    const dimensions = this.#getMessageDimensions(message);
    this.#setPosition(token, html, dimensions);

    // Append to DOM
    this.element.append(html);

    // Optionally pan to the speaker
    let panPromise;
    const panToSpeaker = game.settings.get("core", "chatBubblesPan") && (options.pan === true) && (this.#panned !== token);
    if ( panToSpeaker ) {
      const scale = Math.max(1, canvas.stage.scale.x);
      panPromise = canvas.animatePan({x: token.document.x, y: token.document.y, scale, duration: 1000});
      this.#panned = token;
    }

    // Get animation duration and settings
    const duration = this.#getDuration(html);
    const scroll = dimensions.unconstrained - dimensions.height;

    // Animate the bubble
    html.style.opacity = 0;
    html.animate({opacity: [0, 1]}, {duration: 250, easing: "ease"}).finished.then(async () => {
      html.style.opacity = 1;
      await panPromise;
      if ( scroll > 0 ) {
        const inner = html.querySelector(".bubble-content");
        inner.animate({top: [0, `${-scroll}px`]}, {duration: duration - 1000, easing: "linear"}).finished.then(
          () => inner.style.top = `${-scroll}px`);
      }
      setTimeout(() => {
        html.animate({opacity: [1, 0]}, {duration: 250, easing: "ease"}).finished.then(() => html.remove());
      }, duration);
    });

    return html;
  }

  /* -------------------------------------------- */

  /**
   * Activate Socket event listeners which apply to the ChatBubbles UI.
   * @param {Socket} socket     The active web socket connection
   * @internal
   */
  static _activateSocketListeners(socket) {
    socket.on("chatBubble", ({sceneId, tokenId, message, options}) => {
      if ( !canvas.ready ) return;
      const scene = game.scenes.get(sceneId);
      if ( !scene?.isView ) return;
      const token = scene.tokens.get(tokenId);
      if ( !token ) return;
      return canvas.hud.bubbles.say(token.object, message, options);
    });
  }

  /* -------------------------------------------- */

  /**
   * Clear any existing chat bubble for a certain Token
   * @param {Token} token
   * @returns {Promise<void>}
   */
  async #clearBubble(token) {
    const existing = document.querySelector(`.chat-bubble[data-token-id="${token.id}"]`);
    if ( !existing ) return;
    await existing.animate({opacity: 0}, {duration: 100, easing: "ease"}).finished;
    existing.remove();
  }

  /* -------------------------------------------- */

  /**
   * Render the HTML template for the chat bubble
   * @param {object} data              Template data
   * @returns {Promise<HTMLElement>}   The rendered HTML
   */
  async #renderHTML(data) {
    const html = await foundry.applications.handlebars.renderTemplate(this.template, data);
    return foundry.utils.parseHTML(html);
  }

  /* -------------------------------------------- */

  /**
   * Before displaying the chat message, determine it's constrained and unconstrained dimensions
   * @param {string} message                                            The message content
   * @returns {{width: number; height: number; unconstrained: number}}  The rendered message dimensions
   */
  #getMessageDimensions(message) {
    const div = document.createElement("div");
    div.classList.add("chat-bubble");
    div.style.visibility = "hidden";
    div.innerHTML = foundry.utils.cleanHTML(message);
    document.body.append(div);
    const dims = {
      width: div.clientWidth + (8 * canvas.dimensions.uiScale),
      height: div.clientHeight
    };
    div.style.maxHeight = "none";
    dims.unconstrained = div.clientHeight;
    div.remove();
    return dims;
  }

  /* -------------------------------------------- */

  /**
   * Assign styling parameters to the chat bubble, toggling either a left or right display (randomly)
   * @param {Token} token             The speaking Token
   * @param {HTMLElement} html        Chat bubble content
   * @param {Rectangle} dimensions    Positioning data
   */
  #setPosition(token, html, dimensions) {
    const cls = Math.random() > 0.5 ? "left" : "right";
    html.classList.add(cls);
    const {width, height} = dimensions;
    const top = token.y - dimensions.height - (8 * canvas.dimensions.uiScale);
    const left = cls === "right" ? token.x - (dimensions.width - token.w) : token.x;
    html.style.width = `${width}px`;
    html.style.height = `${height}px`;
    html.style.top = `${top}px`;
    html.style.left = `${left}px`;
  }

  /* -------------------------------------------- */

  /**
   * Determine the length of time for which to display a chat bubble.
   * Research suggests that average reading speed is 200 words per minute.
   * Since these are short-form messages, we multiply reading speed by 1.5.
   * Clamp the result between 1 second (minimum) and 20 seconds (maximum)
   * @param {HTMLElement} html    The HTML message
   * @returns {number}            The number of milliseconds for which to display the message
   */
  #getDuration(html) {
    const words = html.textContent?.split(/\s+/).reduce((n, w) => n + Number(!!w.trim().length), 0) ?? 0;
    const ms = (words * 60 * 1000) / 300;
    return Math.clamp(1000, ms, 20000);
  }

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /**
   * @deprecated since v13
   * @ignore
   */
  get container() {
    foundry.utils.logCompatibilityWarning("ChatBubbles#container (jQuery) is deprecated in favor of ChatBubbles#element (HTMLElement)",
      {since: 13, until: 15, once: true});
    return $("#chat-bubbles");
  }
}

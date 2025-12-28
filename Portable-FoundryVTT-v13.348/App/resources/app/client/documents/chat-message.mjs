import BaseChatMessage from "@common/documents/chat-message.mjs";
import ClientDocumentMixin from "./abstract/client-document.mjs";
import {CHAT_MESSAGE_STYLES, DICE_ROLL_MODES} from "@common/constants.mjs";
import Roll from "../dice/roll.mjs";
import Hooks from "../helpers/hooks.mjs";
import TextEditor from "@client/applications/ux/text-editor.mjs";

/**
 * @import Messages from "./collections/chat-messages.mjs";
 * @import {ChatSpeakerData} from "@common/documents/_types.mjs";
 * @import User from "./user.mjs";
 * @import {Roll} from "../dice/_module.mjs";
 * @import Actor from "./actor.mjs";
 * @import Scene from "./scene.mjs";
 * @import TokenDocument from "./token.mjs";
 */

/**
 * The client-side ChatMessage document which extends the common BaseChatMessage model.
 *
 * ### Hook Events
 * - {@link hookEvents.renderChatMessageHTML}
 *
 * @extends BaseChatMessage
 * @mixes ClientDocumentMixin
 * @category Documents
 *
 * @see {@link foundry.documents.collections.ChatMessages}: The world-level collection of ChatMessage
 *   documents
 *
 * @property {Roll[]} rolls             The prepared array of Roll instances
 */
export default class ChatMessage extends ClientDocumentMixin(BaseChatMessage) {

  /**
   * Is this ChatMessage currently displayed in the sidebar ChatLog?
   * @type {boolean}
   */
  logged = false;

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * Return the recommended String alias for this message.
   * The alias could be a Token name in the case of in-character messages or dice rolls.
   * Alternatively it could be the name of a User in the case of OOC chat or whispers.
   * @type {string}
   */
  get alias() {
    const authorName = this.author?.name ?? game.i18n.localize("CHAT.UnknownUser");
    if ( this.style === CHAT_MESSAGE_STYLES.OOC ) return authorName;
    const speakerAlias = this.speaker.alias || null;
    return speakerAlias ?? this.speakerActor?.name ?? authorName;
  }

  /* -------------------------------------------- */

  /**
   * Is the current User the author of this message?
   * @type {boolean}
   */
  get isAuthor() {
    return game.user === this.author;
  }

  /* -------------------------------------------- */

  /**
   * Return whether the content of the message is visible to the current user.
   * For certain dice rolls, for example, the message itself may be visible while the content of that message is not.
   * @type {boolean}
   */
  get isContentVisible() {
    if ( this.isRoll ) {
      const whisper = this.whisper || [];
      const isBlind = whisper.length && this.blind;
      if ( whisper.length ) return whisper.includes(game.user.id) || (this.isAuthor && !isBlind);
      return true;
    }
    else return this.visible;
  }

  /* -------------------------------------------- */

  /**
   * Does this message contain dice rolls?
   * @type {boolean}
   */
  get isRoll() {
    return this.rolls.length > 0;
  }

  /* -------------------------------------------- */

  /**
   * Return whether the ChatMessage is visible to the current User.
   * Messages may not be visible if they are private whispers.
   * @type {boolean}
   */
  get visible() {
    if ( this.whisper.length ) {
      if ( this.isRoll ) return true;
      return this.isAuthor || (this.whisper.indexOf(game.user.id) !== -1);
    }
    return true;
  }

  /* -------------------------------------------- */

  /**
   * The Actor which represents the speaker of this message (if any).
   * @type {Actor|null}
   */
  get speakerActor() {
    return this.constructor.getSpeakerActor(this.speaker) ?? this.author?.character ?? null;
  }

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /** @inheritDoc */
  prepareDerivedData() {
    super.prepareDerivedData();

    // Create Roll instances for contained dice rolls
    this.rolls = this.rolls.reduce((rolls, rollData) => {
      try {
        rolls.push(Roll.fromData(rollData));
      } catch(err) {
        Hooks.onError("ChatMessage#rolls", err, {rollData, log: "error"});
      }
      return rolls;
    }, []);
  }

  /* -------------------------------------------- */

  /**
   * Transform a provided object of ChatMessage data by applying a certain roll mode to the data object.
   *  - Public: `whisper` is set to `[]` and `blind` is set to `false`.
   *  - Self: `whisper` is set to `[game.user.id]` and `blind` is set to `false`.
   *  - Private: `whisper` is set to the GM users unless `whisper` is nonempty and `blind` is set to `false`.
   *  - Blind: `whisper` is set to the GM users unless `whisper` is nonempty and `blind` is set to `true`.
   * @param {object} chatData     The object of ChatMessage data
   * @param {"roll"|"publicroll"|"gmroll"|"blindroll"|"selfroll"} rollMode
   *   The roll mode to apply to this message data. `"roll"` is the current roll mode.
   * @returns {object}            The modified ChatMessage data with the roll mode applied
   */
  static applyRollMode(chatData, rollMode) {
    const modes = DICE_ROLL_MODES;
    if ( rollMode === "roll" ) rollMode = game.settings.get("core", "rollMode");
    let whisper;

    // Public roll
    if ( rollMode === modes.PUBLIC ) whisper = [];

    // Self roll
    else if ( rollMode === modes.SELF ) whisper = [game.user.id];

    // Don't override existing whisper recipients in the case of private and blind rolls
    else if ( chatData.whisper?.length ) whisper = chatData.whisper;

    // Private or blind roll
    else whisper = game.users.filter(u => u.isGM).map(u => u.id);

    chatData.whisper = whisper;
    chatData.blind = rollMode === modes.BLIND;
    return chatData;
  }

  /* -------------------------------------------- */

  /**
   * Update the data of a ChatMessage instance to apply a requested roll mode.
   * This function calls {@link ChatMessage.applyRollMode} and updates the source of the ChatMessage.
   * @param {"roll"|"publicroll"|"gmroll"|"blindroll"|"selfroll"} rollMode
   *   The roll mode to apply to this message data. `"roll"` is the current roll mode.
   */
  applyRollMode(rollMode) {
    const data = this.toObject();
    this.constructor.applyRollMode(data, rollMode);
    this.updateSource(data);
  }

  /* -------------------------------------------- */

  /**
   * Attempt to determine who is the speaking character (and token) for a certain Chat Message
   * First assume that the currently controlled Token is the speaker
   *
   * @param {object} [options={}]           Options which affect speaker identification
   * @param {Scene} [options.scene]         The Scene in which the speaker resides
   * @param {Actor} [options.actor]         The Actor who is speaking
   * @param {TokenDocument} [options.token] The Token who is speaking
   * @param {string} [options.alias]        The name of the speaker to display
   *
   * @returns {ChatSpeakerData}             The identified speaker data
   */
  static getSpeaker({scene, actor, token, alias}={}) {

    // CASE 1 - A Token is explicitly provided
    const hasToken = (token instanceof foundry.canvas.placeables.Token)
      || (token instanceof foundry.documents.TokenDocument);
    if ( hasToken ) return ChatMessage.#getSpeakerFromToken({token, alias});
    const hasActor = actor instanceof foundry.documents.Actor;
    if ( hasActor && actor.isToken ) return ChatMessage.#getSpeakerFromToken({token: actor.token, alias});

    // CASE 2 - An Actor is explicitly provided
    if ( hasActor ) {
      alias = alias || actor.name;
      const tokens = actor.getActiveTokens();
      if ( !tokens.length ) return ChatMessage.#getSpeakerFromActor({scene, actor, alias});
      const controlled = tokens.filter(t => t.controlled);
      token = controlled.length ? controlled.shift() : tokens.shift();
      return ChatMessage.#getSpeakerFromToken({token: token.document, alias});
    }

    // CASE 3 - Not the viewed Scene
    else if ( ( scene instanceof foundry.documents.Scene ) && !scene.isView ) {
      const char = game.user.character;
      if ( char ) return ChatMessage.#getSpeakerFromActor({scene, actor: char, alias});
      return ChatMessage.#getSpeakerFromUser({scene, user: game.user, alias});
    }

    // CASE 4 - Infer from controlled tokens
    if ( canvas.ready ) {
      const controlled = canvas.tokens.controlled;
      if (controlled.length) return ChatMessage.#getSpeakerFromToken({token: controlled.shift().document, alias});
    }

    // CASE 5 - Infer from impersonated Actor
    const char = game.user.character;
    if ( char ) {
      const tokens = char.getActiveTokens(false, true);
      if ( tokens.length ) return ChatMessage.#getSpeakerFromToken({token: tokens.shift(), alias});
      return ChatMessage.#getSpeakerFromActor({actor: char, alias});
    }

    // CASE 6 - From the alias and User
    return ChatMessage.#getSpeakerFromUser({scene, user: game.user, alias});
  }

  /* -------------------------------------------- */

  /**
   * A helper to prepare the speaker object based on a target TokenDocument
   * @param {object} [options={}]                Options which affect speaker identification
   * @param {TokenDocument} options.token        The TokenDocument of the speaker
   * @param {string} [options.alias]             The name of the speaker to display
   * @returns {ChatSpeakerData}                  The identified speaker data
   */
  static #getSpeakerFromToken({token, alias}) {
    return {
      scene: token.parent?.id || null,
      token: token.id,
      actor: token.actor?.id || null,
      alias: alias || token.name
    };
  }

  /* -------------------------------------------- */

  /**
   * A helper to prepare the speaker object based on a target Actor
   * @param {object} [options={}]               Options which affect speaker identification
   * @param {Scene} [options.scene]             The Scene is which the speaker resides
   * @param {Actor} [options.actor]             The Actor that is speaking
   * @param {string} [options.alias]            The name of the speaker to display
   * @returns {ChatSpeakerData}                 The identified speaker data
   */
  static #getSpeakerFromActor({scene, actor, alias}) {
    return {
      scene: (scene || canvas.scene)?.id || null,
      actor: actor.id,
      token: null,
      alias: alias || actor.name
    };
  }
  /* -------------------------------------------- */

  /**
   * A helper to prepare the speaker object based on a target User
   * @param {object} [options={}]               Options which affect speaker identification
   * @param {Scene} [options.scene]             The Scene in which the speaker resides
   * @param {User} [options.user]               The User who is speaking
   * @param {string} [options.alias]            The name of the speaker to display
   * @returns {ChatSpeakerData}                 The identified speaker data
   */
  static #getSpeakerFromUser({scene, user, alias}) {
    return {
      scene: (scene || canvas.scene)?.id || null,
      actor: null,
      token: null,
      alias: alias || user.name
    };
  }

  /* -------------------------------------------- */

  /**
   * Obtain an Actor instance which represents the speaker of this message (if any)
   * @param {Object} speaker    The speaker data object
   * @returns {Actor|null}
   */
  static getSpeakerActor(speaker) {
    if ( !speaker ) return null;
    let actor = null;

    // Case 1 - Token actor
    if ( speaker.scene && speaker.token ) {
      const scene = game.scenes.get(speaker.scene);
      const token = scene ? scene.tokens.get(speaker.token) : null;
      actor = token?.actor;
    }

    // Case 2 - explicit actor
    if ( speaker.actor && !actor ) {
      actor = game.actors.get(speaker.actor);
    }
    return actor || null;
  }

  /* -------------------------------------------- */

  /**
   * Obtain a data object used to evaluate any dice rolls associated with this particular chat message
   * @returns {object}
   */
  getRollData() {
    return this.speakerActor?.getRollData() ?? {};
  }

  /* -------------------------------------------- */

  /**
   * Given a string whisper target, return an Array of the user IDs which should be targeted for the whisper
   *
   * @param {string} name   The target name of the whisper target
   * @returns {User[]}      An array of User instances
   */
  static getWhisperRecipients(name) {

    // Whisper to groups
    if (["GM", "DM"].includes(name.toUpperCase())) {
      return game.users.filter(u => u.isGM);
    }
    else if (name.toLowerCase() === "players") {
      return game.users.players;
    }

    const lowerName = name.toLowerCase();
    const users = game.users.filter(u => u.name.toLowerCase() === lowerName);
    if ( users.length ) return users;
    const actors = game.users.filter(a => a.character && (a.character.name.toLowerCase() === lowerName));
    if ( actors.length ) return actors;

    // Otherwise, return an empty array
    return [];
  }

  /* -------------------------------------------- */

  /**
   * Render the HTML for the ChatMessage which should be added to the log
   * @param {object} [options]             Additional options passed to the Handlebars template.
   * @param {boolean} [options.canDelete]  Render a delete button. By default, this is true for GM users.
   * @param {boolean} [options.canClose]   Render a close button for dismissing chat card notifications.
   * @returns {Promise<HTMLElement>}
   */
  async renderHTML({ canDelete, canClose=false, ...rest }={}) {
    canDelete ??= game.user.isGM; // By default, GM users have the trash-bin icon in the chat log itself

    if ( typeof this.system.renderHTML === "function" ) {
      const html = await this.system.renderHTML({ canDelete, canClose, ...rest });
      Hooks.callAll("renderChatMessageHTML", this, html);
      return html;
    }

    // Determine some metadata
    const speakerActor = this.style === CHAT_MESSAGE_STYLES.OOC ? null : this.speakerActor;
    const data = this.toObject(false);
    data.content = await TextEditor.implementation.enrichHTML(this.content, {rollData: this.getRollData(),
      secrets: speakerActor?.isOwner ?? game.user.isGM});
    const isWhisper = this.whisper.length;

    // Construct message data
    const messageData = {
      ...rest,
      canDelete, canClose,
      message: data,
      user: game.user,
      author: this.author,
      speakerActor,
      alias: this.alias,
      cssClass: [
        this.style === CHAT_MESSAGE_STYLES.IC ? "ic" : null,
        this.style === CHAT_MESSAGE_STYLES.EMOTE ? "emote" : null,
        isWhisper ? "whisper" : null,
        this.blind ? "blind": null
      ].filterJoin(" "),
      isWhisper: this.whisper.length,
      whisperTo: this.whisper.map(u => game.users.get(u)?.name).filterJoin(", ")
    };

    // Render message data specifically for ROLL type messages
    if ( this.isRoll ) await this.#renderRollContent(messageData);

    // Define a border color
    if ( this.style === CHAT_MESSAGE_STYLES.OOC ) messageData.borderColor = this.author?.color.css;

    // Render the chat message
    let html = await foundry.applications.handlebars.renderTemplate(CONFIG.ChatMessage.template, messageData);
    html = foundry.utils.parseHTML(html);

    // Flag expanded state of dice rolls
    Hooks.callAll("renderChatMessageHTML", this, html, messageData);

    /** @deprecated since v13 */
    if ( "renderChatMessage" in Hooks.events ) {
      foundry.utils.logCompatibilityWarning("The renderChatMessage hook is deprecated. Please use "
        + "renderChatMessageHTML instead, which now passes an HTMLElement argument instead of jQuery.",
      { since: 13, until: 15, once: true });
      Hooks.callAll("renderChatMessage", this, $(html), messageData);
    }

    return html;
  }

  /* -------------------------------------------- */

  /**
   * Render the inner HTML content for ROLL type messages.
   * @param {object} messageData      The chat message data used to render the message HTML
   * @returns {Promise<void>}
   */
  async #renderRollContent(messageData) {
    const data = messageData.message;
    const renderRolls = async isPrivate => {
      let html = "";
      for ( const r of this.rolls ) {
        html += await r.render({isPrivate});
      }
      return html;
    };

    // Suppress the "to:" whisper flavor for private rolls
    if ( this.blind || this.whisper.length ) messageData.isWhisper = false;

    // Display standard Roll HTML content
    if ( this.isContentVisible ) {
      const el = document.createElement("div");
      el.innerHTML = data.content;  // Ensure the content does not already contain custom HTML
      if ( !el.childElementCount && this.rolls.length ) data.content = await this.#renderRollHTML(false);
    }

    // Otherwise, show "rolled privately" messages for Roll content
    else {
      const name = this.author?.name ?? game.i18n.localize("CHAT.UnknownUser");
      data.flavor = game.i18n.format("CHAT.PrivateRollContent", {user: foundry.utils.escapeHTML(name)});
      data.content = await renderRolls(true);
      messageData.alias = name;
    }
  }

  /* -------------------------------------------- */

  /**
   * Render HTML for the array of Roll objects included in this message.
   * @param {boolean} isPrivate   Is the chat message private?
   * @returns {Promise<string>}   The rendered HTML string
   */
  async #renderRollHTML(isPrivate) {
    let html = "";
    for ( const roll of this.rolls ) {
      html += await roll.render({isPrivate, message: this});
    }
    return html;
  }

  /* -------------------------------------------- */
  /*  Event Handlers                              */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async _preCreate(data, options, user) {
    const allowed = await super._preCreate(data, options, user);
    if ( allowed === false ) return false;
    if ( foundry.utils.getType(data.content) === "string" ) {
      // Evaluate any immediately-evaluated inline rolls.
      const matches = data.content.matchAll(/\[\[(.*?)(]{2,3})(?:{([^}]+)})?/g);
      let content = data.content;
      for ( const [expression] of matches ) {
        content = content.replace(expression, await TextEditor.implementation.enrichHTML(expression, {
          documents: false,
          secrets: false,
          links: false,
          rolls: true,
          custom: false,
          rollData: this.getRollData()
        }));
      }
      this.updateSource({content});
    }
    if ( this.isRoll ) {
      if ( !("sound" in data) ) this.updateSource({sound: CONFIG.sounds.dice});
      if ( options.rollMode ) this.applyRollMode(options.rollMode);
    }
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onCreate(data, options, userId) {
    super._onCreate(data, options, userId);
    ui.chat.postOne(this, {notify: true});
    if ( options.chatBubble && canvas.ready ) game.messages.sayBubble(this);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onUpdate(changed, options, userId) {
    if ( !this.visible ) ui.chat.deleteMessage(this.id);
    else ui.chat.updateMessage(this);
    super._onUpdate(changed, options, userId);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onDelete(options, userId) {
    ui.chat.deleteMessage(this.id, options);
    super._onDelete(options, userId);
  }

  /* -------------------------------------------- */
  /*  Importing and Exporting                     */
  /* -------------------------------------------- */

  /**
   * Export the content of the chat message into a standardized log format
   * @returns {string}
   */
  export() {
    let content = [];

    // Handle HTML content
    if ( this.content ) {
      const article = document.createElement("article");
      article.innerHTML = this.content;
      let message = "";
      const buildMessage = element => {
        if ( element.tagName === "BR" ) {
          message += "\n";
          return;
        }
        for ( const child of element.childNodes ) {
          if ( child.nodeType === Node.ELEMENT_NODE ) {
            if ( child.tagName === "DIV" ) message += "\n";
            buildMessage(child);
            if ( child.tagName === "DIV" ) message += "\n";
          } else {
            message += (child.textContent?.replace(/\s+/g, " ") ?? "");
          }
        }
      };
      buildMessage(article);
      content = message.trim().split(/\n+/).map(l => l.replace(/\s+/g, " ").trim()).filter(s => s !== "");
    }

    // Add Roll content
    for ( const roll of this.rolls ) {
      content.push(`${roll.formula} = ${roll.result} = ${roll.total}`);
    }

    // Author and timestamp
    const time = new Date(this.timestamp).toLocaleDateString("en-US", {
      hour: "numeric",
      minute: "numeric",
      second: "numeric"
    });

    // Format logged result
    return `[${time}] ${this.alias}\n${content.filterJoin("\n")}`;
  }

  /* -------------------------------------------- */
  /*  Deprecations                                */
  /* -------------------------------------------- */

  /**
   * @ignore
   * @deprecated since v13
   */
  async getHTML(options) {
    foundry.utils.logCompatibilityWarning("ChatMessage#getHTML is deprecated. Please use ChatMessage#renderHTML "
      + "instead, which now returns an HTMLElement instead of a jQuery object.", { since: 13, until: 15, once: true });
    return $(await this.renderHTML(options));
  }
}

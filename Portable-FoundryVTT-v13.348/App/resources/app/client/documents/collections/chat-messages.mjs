import WorldCollection from "../abstract/world-collection.mjs";

/** @import ChatMessage from "../chat-message.mjs"; */

/**
 * The singleton collection of ChatMessage documents which exist within the active World.
 * This Collection is accessible within the Game object as game.messages.
 * @extends {WorldCollection<ChatMessage>}
 * @category Collections
 *
 * @see {@link foundry.documents.ChatMessage}: The ChatMessage document
 * @see {@link foundry.applications.sidebar.tabs.ChatLog}: The ChatLog sidebar directory
 */
export default class ChatMessages extends WorldCollection {

  /** @override */
  static documentName = "ChatMessage";

  /* -------------------------------------------- */

  /** @override */
  get directory() {
    return ui.chat;
  }

  /* -------------------------------------------- */

  /** @override */
  render(force=false) {}

  /* -------------------------------------------- */

  /**
   * If requested, dispatch a Chat Bubble UI for the newly created message
   * @param {ChatMessage} message     The ChatMessage document to say
   */
  sayBubble(message) {
    const {content, style, speaker} = message;
    if ( speaker.scene === canvas.scene.id ) {
      const token = canvas.tokens.get(speaker.token);
      if ( token ) canvas.hud.bubbles.say(token, content, {
        cssClasses: style === CONST.CHAT_MESSAGE_STYLES.EMOTE ? ["emote"] : []
      });
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle export of the chat log to a text file
   */
  export() {
    const log = this.contents.map(m => m.export()).join("\n---------------------------\n");
    const date = new Date().toDateString().replace(/\s/g, "-");
    const filename = `fvtt-log-${date}.txt`;
    foundry.utils.saveDataToFile(log, "text/plain", filename);
  }

  /* -------------------------------------------- */

  /**
   * Allow for bulk deletion of all chat messages, confirm first with a yes/no dialog.
   */
  async flush() {
    const question = game.i18n.localize("AreYouSure");
    const warning = game.i18n.localize("CHAT.FlushWarning");
    return foundry.applications.api.DialogV2.confirm({
      window: {title: "CHAT.FlushTitle"},
      content: `<p><strong>${question}</strong> ${warning}</p>`,
      position: {
        top: window.innerHeight - 150,
        left: window.innerWidth - 720
      },
      yes: {
        callback: async () => {
          await this.documentClass.deleteDocuments([], {deleteAll: true});
          const jumpToBottomElement = document.querySelector(".jump-to-bottom");
          jumpToBottomElement.hidden = true;
        }
      }
    });
  }
}

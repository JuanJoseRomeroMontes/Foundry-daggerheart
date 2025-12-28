import BaseCards from "@common/documents/cards.mjs";
import ClientDocumentMixin from "./abstract/client-document.mjs";
import Hooks from "../helpers/hooks.mjs";

/**
 * @import Card from "./card.mjs";
 * @import ChatMessage from "./chat-message.mjs";
 */

/**
 * The client-side Cards document which extends the common BaseCards model.
 * Each Cards document contains CardsData which defines its data schema.
 *
 * ### Hook Events
 * - {@link hookEvents.dealCards}
 * - {@link hookEvents.passCards}
 * - {@link hookEvents.returnCards}
 *
 * @extends BaseCards
 * @mixes ClientDocumentMixin
 * @category Documents
 *
 * @see {@link foundry.documents.collections.CardStacks}: The world-level collection of Cards documents
 * @see {@link foundry.applications.sheets.CardsConfig}: The Cards configuration application
 */
export default class Cards extends ClientDocumentMixin(BaseCards) {

  /**
   * Provide a thumbnail image path used to represent this document.
   * @type {string}
   */
  get thumbnail() {
    return this.img;
  }

  /**
   * The Card documents within this stack which are available to be drawn.
   * @type {Card[]}
   */
  get availableCards() {
    return this.cards.filter(c => (this.type !== "deck") || !c.drawn);
  }

  /**
   * The Card documents which belong to this stack but have already been drawn.
   * @type {Card[]}
   */
  get drawnCards() {
    return this.cards.filter(c => c.drawn);
  }

  /**
   * Returns the localized Label for the type of Card Stack this is
   * @type {string}
   */
  get typeLabel() {
    switch ( this.type ) {
      case "deck": return game.i18n.localize("TYPES.Cards.deck");
      case "hand": return game.i18n.localize("TYPES.Cards.hand");
      case "pile": return game.i18n.localize("TYPES.Cards.pile");
      default: throw new Error(`Unexpected type ${this.type}`);
    }
  }

  /**
   * Can this Cards document be cloned in a duplicate workflow?
   * @type {boolean}
   */
  get canClone() {
    if ( this.type === "deck" ) return true;
    else return this.cards.size === 0;
  }

  /* -------------------------------------------- */
  /*  API Methods                                 */
  /* -------------------------------------------- */

  /** @inheritDoc */
  static async createDocuments(data=[], context={}) {
    if ( context.keepEmbeddedIds === undefined ) context.keepEmbeddedIds = false;
    return super.createDocuments(data, context);
  }

  /* -------------------------------------------- */

  /**
   * Deal one or more cards from this Cards document to each of a provided array of Cards destinations.
   * Cards are allocated from the top of the deck in cyclical order until the required number of Cards have been dealt.
   * @param {Cards[]} to              An array of other Cards documents to which cards are dealt
   * @param {number} [number=1]       The number of cards to deal to each other document
   * @param {object} [options={}]     Options which modify how the deal operation is performed
   * @param {number} [options.how=0]          How to draw, a value from CONST.CARD_DRAW_MODES
   * @param {object} [options.updateData={}]  Modifications to make to each Card as part of the deal operation,
   *                                          for example the displayed face
   * @param {string} [options.action=deal]    The name of the action being performed, used as part of the dispatched
   *                                          Hook event
   * @param {boolean} [options.chatNotification=true] Create a ChatMessage which notifies that this action has occurred
   * @returns {Promise<Cards>}        This Cards document after the deal operation has completed
   */
  async deal(to, number=1, {action="deal", how=0, updateData={}, chatNotification=true}={}) {

    // Validate the request
    if ( !to.every(d => d instanceof Cards) ) {
      throw new Error("You must provide an array of Cards documents as the destinations for the Cards#deal operation");
    }

    // Draw from the sorted stack
    const total = number * to.length;
    const drawn = this._drawCards(total, how);

    // Allocate cards to each destination
    const toCreate = to.map(() => []);
    const toUpdate = [];
    const toDelete = [];
    for ( let i=0; i<total; i++ ) {
      const n = i % to.length;
      const card = drawn[i];
      const createData = foundry.utils.mergeObject(card.toObject(), updateData);
      if ( card.isHome || !createData.origin ) createData.origin = this.id;
      createData.drawn = true;
      toCreate[n].push(createData);
      if ( card.isHome ) toUpdate.push({_id: card.id, drawn: true});
      else toDelete.push(card.id);
    }

    const allowed = Hooks.call("dealCards", this, to, {
      action: action,
      toCreate: toCreate,
      fromUpdate: toUpdate,
      fromDelete: toDelete
    });
    if ( allowed === false ) {
      console.debug(`${CONST.vtt} | The Cards#deal operation was prevented by a hooked function`);
      return this;
    }

    // Perform database operations
    const promises = to.map((cards, i) => {
      return cards.createEmbeddedDocuments("Card", toCreate[i], {keepId: true});
    });
    promises.push(this.updateEmbeddedDocuments("Card", toUpdate));
    promises.push(this.deleteEmbeddedDocuments("Card", toDelete));
    await Promise.all(promises);

    // Dispatch chat notification
    if ( chatNotification ) {
      const chatActions = {
        deal: "CARDS.NotifyDeal",
        pass: "CARDS.NotifyPass"
      };
      this.#postChatNotification(this, chatActions[action], {number, link: to.map(t => t.link).join(", ")});
    }
    return this;
  }

  /* -------------------------------------------- */

  /**
   * Pass an array of specific Card documents from this document to some other Cards stack.
   * @param {Cards} to                Some other Cards document that is the destination for the pass operation
   * @param {string[]} ids            The embedded Card ids which should be passed
   * @param {object} [options={}]     Additional options which modify the pass operation
   * @param {object} [options.updateData={}]  Modifications to make to each Card as part of the pass operation,
   *                                          for example the displayed face
   * @param {string} [options.action=pass]    The name of the action being performed, used as part of the dispatched
   *                                          Hook event
   * @param {boolean} [options.chatNotification=true] Create a ChatMessage which notifies that this action has occurred
   * @returns {Promise<Card[]>}       An array of the Card embedded documents created within the destination stack
   */
  async pass(to, ids, {updateData={}, action="pass", chatNotification=true}={}) {
    if ( !(to instanceof Cards) ) {
      throw new Error("You must provide a Cards document as the recipient for the Cards#pass operation");
    }

    // Allocate cards to different required operations
    const toCreate = [];
    const toUpdate = [];
    const fromUpdate = [];
    const fromDelete = [];
    let maxSort = to.cards.size ? Math.max(...to.cards.contents.map(c => c.sort || 0)) : 0;

    // Validate the provided cards
    for ( const id of ids ) {
      const card = this.cards.get(id, {strict: true});
      const deletedFromOrigin = card.origin && !card.origin.cards.get(id);

      // Prevent drawing cards from decks multiple times
      if ( (this.type === "deck") && card.isHome && card.drawn ) {
        throw new Error(`You may not pass Card ${id} which has already been drawn`);
      }

      // Return drawn cards to their origin deck
      if ( (card.origin === to) && !deletedFromOrigin ) {
        toUpdate.push({_id: card.id, drawn: false});
      }

      // Create cards in a new destination
      else {
        const createData = foundry.utils.mergeObject(card.toObject(), updateData);
        const copyCard = (card.isHome && (to.type === "deck"));
        if ( copyCard ) createData.origin = to.id;
        else if ( card.isHome || !createData.origin ) createData.origin = this.id;
        if ( !copyCard ) {
          maxSort += CONST.SORT_INTEGER_DENSITY;
          createData.sort = maxSort;
        }
        createData.drawn = !copyCard && !deletedFromOrigin;
        toCreate.push(createData);
      }

      // Update cards in their home deck
      if ( card.isHome && (to.type !== "deck") ) fromUpdate.push({_id: card.id, drawn: true});

      // Remove cards from their current stack
      else if ( !card.isHome ) fromDelete.push(card.id);
    }

    const allowed = Hooks.call("passCards", this, to, {action, toCreate, toUpdate, fromUpdate, fromDelete});
    if ( allowed === false ) {
      console.debug(`${CONST.vtt} | The Cards#pass operation was prevented by a hooked function`);
      return [];
    }

    // Perform database operations
    const created = to.createEmbeddedDocuments("Card", toCreate, {keepId: true});
    await Promise.all([
      created,
      to.updateEmbeddedDocuments("Card", toUpdate),
      this.updateEmbeddedDocuments("Card", fromUpdate),
      this.deleteEmbeddedDocuments("Card", fromDelete)
    ]);

    // Dispatch chat notification
    if ( chatNotification ) {
      const chatActions = {
        pass: "CARDS.NotifyPass",
        play: "CARDS.NotifyPlay",
        discard: "CARDS.NotifyDiscard",
        draw: "CARDS.NotifyDraw"
      };
      const chatFrom = action === "draw" ? to : this;
      const chatTo = action === "draw" ? this : to;
      this.#postChatNotification(chatFrom, chatActions[action], {number: ids.length, link: chatTo.link});
    }
    return created;
  }

  /* -------------------------------------------- */

  /**
   * Draw one or more cards from some other Cards document.
   * @param {Cards} from              Some other Cards document from which to draw
   * @param {number} [number=1]       The number of cards to draw
   * @param {object} [options={}]     Options which modify how the draw operation is performed
   * @param {number} [options.how=0]          How to draw, a value from CONST.CARD_DRAW_MODES
   * @param {object} [options.updateData={}]  Modifications to make to each Card as part of the draw operation,
   *                                          for example the displayed face
   * @returns {Promise<Card[]>}       An array of the Card documents which were drawn
   */
  async draw(from, number=1, {how=0, updateData={}, ...options}={}) {
    if ( !(from instanceof Cards) || (from === this) ) {
      throw new Error("You must provide some other Cards document as the source for the Cards#draw operation");
    }
    const toDraw = from._drawCards(number, how);
    return from.pass(this, toDraw.map(c => c.id), {updateData, action: "draw", ...options});
  }

  /* -------------------------------------------- */

  /**
   * Shuffle this Cards stack, randomizing the sort order of all the cards it contains.
   * @param {object} [options={}]     Options which modify how the shuffle operation is performed.
   * @param {object} [options.updateData={}]  Modifications to make to each Card as part of the shuffle operation,
   *                                          for example the displayed face.
   * @param {boolean} [options.chatNotification=true] Create a ChatMessage which notifies that this action has occurred
   * @returns {Promise<Cards>}        The Cards document after the shuffle operation has completed
   */
  async shuffle({updateData={}, chatNotification=true}={}) {
    const order = this.cards.map(c => [foundry.dice.MersenneTwister.random(), c]);
    order.sort((a, b) => a[0] - b[0]);
    const toUpdate = order.map((x, i) => {
      const card = x[1];
      return foundry.utils.mergeObject({_id: card.id, sort: i}, updateData);
    });

    // Post a chat notification and return
    await this.updateEmbeddedDocuments("Card", toUpdate);
    if ( chatNotification ) {
      this.#postChatNotification(this, "CARDS.NotifyShuffle", {link: this.link});
    }
    return this;
  }

  /* -------------------------------------------- */

  /**
   * Recall the Cards stack, retrieving all original cards from other stacks where they may have been drawn if this is a
   * deck, otherwise returning all the cards in this stack to the decks where they originated.
   * @param {object} [options={}]             Options which modify the recall operation
   * @param {object} [options.updateData={}]  Modifications to make to each Card as part of the recall operation,
   *                                          for example the displayed face
   * @param {boolean} [options.chatNotification=true] Create a ChatMessage which notifies that this action has occurred
   * @returns {Promise<Cards>}                The Cards document after the recall operation has completed.
   */
  async recall(options) {
    if ( this.type === "deck" ) return this.#resetDeck(options);
    return this.#resetStack(options);
  }

  /* -------------------------------------------- */

  /**
   * Perform a reset operation for a deck, retrieving all original cards from other stacks where they may have been
   * drawn.
   * @param {object} [options={}]              Options which modify the reset operation.
   * @param {object} [options.updateData={}]           Modifications to make to each Card as part of the reset operation
   * @param {boolean} [options.chatNotification=true]  Create a ChatMessage which notifies that this action has occurred
   * @returns {Promise<Cards>}                 The Cards document after the reset operation has completed.
   */
  async #resetDeck({updateData={}, chatNotification=true}={}) {

    // Recover all cards which belong to this stack
    for ( const cards of game.cards ) {
      if ( cards === this ) continue;
      const toDelete = [];
      for ( const c of cards.cards ) {
        if ( c.origin === this ) {
          toDelete.push(c.id);
        }
      }
      if ( toDelete.length ) await cards.deleteEmbeddedDocuments("Card", toDelete);
    }

    // Mark all cards as not drawn
    const cards = this.cards.contents;
    cards.sort(this.sortStandard.bind(this));
    const toUpdate = cards.map(card => {
      return foundry.utils.mergeObject({_id: card.id, drawn: false}, updateData);
    });

    // Post a chat notification and return
    await this.updateEmbeddedDocuments("Card", toUpdate);
    if ( chatNotification ) {
      this.#postChatNotification(this, "CARDS.NotifyReset", {link: this.link});
    }
    return this;
  }

  /* -------------------------------------------- */

  /**
   * Return all cards in this stack to their original decks.
   * @param {object} [options={}]              Options which modify the return operation.
   * @param {object} [options.updateData={}]          Modifications to make to each Card as part of the return operation
   * @param {boolean} [options.chatNotification=true] Create a ChatMessage which notifies that this action has occurred
   * @returns {Promise<Cards>}                 The Cards document after the return operation has completed.
   */
  async #resetStack({updateData={}, chatNotification=true}={}) {

    // Allocate cards to different required operations.
    const toUpdate = {};
    const fromDelete = [];
    for ( const card of this.cards ) {
      if ( card.isHome || !card.origin ) continue;

      // Return drawn cards to their origin deck
      if ( card.origin.cards.get(card.id) ) {
        if ( !toUpdate[card.origin.id] ) toUpdate[card.origin.id] = [];
        const update = foundry.utils.mergeObject(updateData, {_id: card.id, drawn: false}, {inplace: false});
        toUpdate[card.origin.id].push(update);
      }

      // Remove cards from the current stack.
      fromDelete.push(card.id);
    }

    const allowed = Hooks.call("returnCards", this, fromDelete.map(id => this.cards.get(id)), {toUpdate, fromDelete});
    if ( allowed === false ) {
      console.debug(`${CONST.vtt} | The Cards#return operation was prevented by a hooked function.`);
      return this;
    }

    // Perform database operations.
    const updates = Object.entries(toUpdate).map(([origin, u]) => {
      return game.cards.get(origin).updateEmbeddedDocuments("Card", u);
    });
    await Promise.all([...updates, this.deleteEmbeddedDocuments("Card", fromDelete)]);

    // Dispatch chat notification
    if ( chatNotification ) this.#postChatNotification(this, "CARDS.NotifyReturn", {link: this.link});
    return this;
  }

  /* -------------------------------------------- */

  /**
   * A sorting function that is used to determine the standard order of Card documents within an un-shuffled stack.
   * Sorting with "en" locale to ensure the same order regardless of which client sorts the deck.
   * @param {Card} a     The card being sorted
   * @param {Card} b     Another card being sorted against
   * @returns {number}
   * @protected
   */
  sortStandard(a, b) {
    if ( a.suit === b.suit ) return ((a.value ?? -Infinity) - (b.value ?? -Infinity)) || 0;
    return a.suit.compare(b.suit);
  }

  /* -------------------------------------------- */

  /**
   * A sorting function that is used to determine the order of Card documents within a shuffled stack.
   * @param {Card} a     The card being sorted
   * @param {Card} b     Another card being sorted against
   * @returns {number}
   * @protected
   */
  sortShuffled(a, b) {
    return a.sort - b.sort;
  }

  /* -------------------------------------------- */

  /**
   * An internal helper method for drawing a certain number of Card documents from this Cards stack.
   * @param {number} number       The number of cards to draw
   * @param {number} how          A draw mode from CONST.CARD_DRAW_MODES
   * @returns {Card[]}            An array of drawn Card documents
   * @protected
   */
  _drawCards(number, how) {

    // Confirm that sufficient cards are available
    const available = this.availableCards;
    if ( available.length < number ) {
      throw new Error(`There are not ${number} available cards remaining in Cards [${this.id}]`);
    }

    // Draw from the stack
    let drawn;
    switch ( how ) {
      case CONST.CARD_DRAW_MODES.FIRST:
        available.sort(this.sortShuffled.bind(this));
        drawn = available.slice(0, number);
        break;
      case CONST.CARD_DRAW_MODES.LAST:
        available.sort(this.sortShuffled.bind(this));
        drawn = available.slice(-number);
        break;
      case CONST.CARD_DRAW_MODES.RANDOM: {
        const shuffle = available.map(c => [Math.random(), c]);
        shuffle.sort((a, b) => a[0] - b[0]);
        drawn = shuffle.slice(-number).map(x => x[1]);
        break;
      }
    }
    return drawn;
  }

  /* -------------------------------------------- */

  /**
   * Create a ChatMessage which provides a notification of the operation which was just performed.
   * Visibility of the resulting message is linked to the default roll mode selected in the chat log dropdown.
   * @param {Cards} source        The source Cards document from which the action originated
   * @param {string} action       The localization key which formats the chat message notification
   * @param {object} context      Data passed to the Localization#format method for the localization key
   * @returns {ChatMessage}       A created ChatMessage document
   */
  #postChatNotification(source, action, context) {
    const messageData = {
      style: CONST.CHAT_MESSAGE_STYLES.OTHER,
      speaker: {user: game.user},
      content: `
      <div class="cards-notification flexrow">
        <img class="icon" src="${foundry.utils.escapeHTML(source.thumbnail)}" alt="${foundry.utils.escapeHTML(source.name)}">
        <p>${game.i18n.format(action, context)}</p>
      </div>`
    };
    foundry.documents.ChatMessage.implementation.applyRollMode(messageData, "roll");
    return foundry.documents.ChatMessage.implementation.create(messageData);
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async _preCreate(data, options, user) {
    const allowed = await super._preCreate(data, options, user);
    if ( allowed === false ) return false;
    for ( const card of this.cards ) {
      card.updateSource({drawn: false});
    }
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _preDelete(options, user) {
    await this.recall();
    return super._preDelete(options, user);
  }

  /* -------------------------------------------- */
  /*  Interaction Dialogs                         */
  /* -------------------------------------------- */

  /**
   * Display a dialog which prompts the user to deal cards to some number of hand-type Cards documents.
   * @see {@link Cards#deal}
   * @returns {Promise<Cards|null>}
   */
  async dealDialog() {
    const hands = game.cards.filter(c => (c.type !== "deck") && c.testUserPermission(game.user, "LIMITED"));
    if ( !hands.length ) {
      ui.notifications.warn("CARDS.DealWarnNoTargets", {localize: true});
      return this;
    }

    // Construct the dialog HTML
    const html = await foundry.applications.handlebars.renderTemplate("templates/cards/dialog-deal.hbs", {
      hands,
      modes: {
        [CONST.CARD_DRAW_MODES.TOP]: "CARDS.DrawModeTop",
        [CONST.CARD_DRAW_MODES.BOTTOM]: "CARDS.DrawModeBottom",
        [CONST.CARD_DRAW_MODES.RANDOM]: "CARDS.DrawModeRandom"
      }
    });
    const content = document.createElement("div");
    content.innerHTML = html;

    // Display the prompt
    return foundry.applications.api.DialogV2.prompt({
      window: {title: "CARDS.DealTitle"},
      content,
      ok: {
        label: "CARDS.ACTIONS.Deal",
        callback: (event, button) => {
          const fd = new foundry.applications.ux.FormDataExtended(button.form).object;
          if ( !fd.to ) return this;
          const toIds = fd.to instanceof Array ? fd.to : [fd.to];
          const to = toIds.reduce((arr, id) => {
            const c = game.cards.get(id);
            if ( c ) arr.push(c);
            return arr;
          }, []);
          const options = {how: fd.how, updateData: fd.down ? {face: null} : {}};
          return this.deal(to, fd.number, options).catch(err => {
            ui.notifications.error(err.message);
            return this;
          });
        }
      }
    });
  }

  /* -------------------------------------------- */

  /**
   * Display a dialog which prompts the user to draw cards from some other deck-type Cards documents.
   * @see {@link Cards#draw}
   * @returns {Promise<Card[]|null>}
   */
  async drawDialog() {
    const decks = game.cards.filter(c => (c.type === "deck") && c.testUserPermission(game.user, "LIMITED"));
    if ( !decks.length ) {
      ui.notifications.warn("CARDS.DrawWarnNoSources", {localize: true});
      return [];
    }

    // Construct the dialog HTML
    const html = await foundry.applications.handlebars.renderTemplate("templates/cards/dialog-draw.hbs", {
      decks,
      modes: {
        [CONST.CARD_DRAW_MODES.TOP]: "CARDS.DrawModeTop",
        [CONST.CARD_DRAW_MODES.BOTTOM]: "CARDS.DrawModeBottom",
        [CONST.CARD_DRAW_MODES.RANDOM]: "CARDS.DrawModeRandom"
      }
    });
    const content = document.createElement("div");
    content.innerHTML = html;

    // Display the prompt
    return foundry.applications.api.DialogV2.prompt({
      window: {title: "CARDS.DrawTitle"},
      content,
      ok: {
        label: "CARDS.ACTIONS.Draw",
        callback: (event, button) => {
          const fd = new foundry.applications.ux.FormDataExtended(button.form).object;
          const from = game.cards.get(fd.from);
          const options = {how: fd.how, updateData: fd.down ? {face: null} : {}};
          return this.draw(from, fd.number, options).catch(err => {
            ui.notifications.error(err.message);
            return [];
          });
        }
      }
    });
  }

  /* -------------------------------------------- */

  /**
   * Display a dialog which prompts the user to pass cards from this document to some other Cards document.
   * @see {@link Cards#deal}
   * @returns {Promise<Cards|null>}
   */
  async passDialog() {
    const cards = game.cards.filter(c => (c !== this) && (c.type !== "deck") && c.testUserPermission(game.user, "LIMITED"));
    if ( !cards.length ) {
      ui.notifications.warn("CARDS.PassWarnNoTargets", {localize: true});
      return this;
    }

    // Construct the dialog HTML
    const html = await foundry.applications.handlebars.renderTemplate("templates/cards/dialog-pass.hbs", {
      cards,
      modes: {
        [CONST.CARD_DRAW_MODES.TOP]: "CARDS.DrawModeTop",
        [CONST.CARD_DRAW_MODES.BOTTOM]: "CARDS.DrawModeBottom",
        [CONST.CARD_DRAW_MODES.RANDOM]: "CARDS.DrawModeRandom"
      }
    });
    const content = document.createElement("div");
    content.innerHTML = html;

    // Display the prompt
    return foundry.applications.api.DialogV2.prompt({
      window: {title: "CARDS.PassTitle"},
      content,
      ok: {
        label: "CARDS.ACTIONS.Pass",
        callback: (event, button) => {
          const fd = new foundry.applications.ux.FormDataExtended(button.form).object;
          const to = game.cards.get(fd.to);
          const options = {action: "pass", how: fd.how, updateData: fd.down ? {face: null} : {}};
          return this.deal([to], fd.number, options).catch(err => {
            ui.notifications.error(err.message);
            return this;
          });
        }
      }
    });
  }

  /* -------------------------------------------- */

  /**
   * Display a dialog which prompts the user to play a specific Card to some other Cards document
   * @see {@link Cards#pass}
   * @param {Card} card     The specific card being played as part of this dialog
   * @returns {Promise<Card[]|null>}
   */
  async playDialog(card) {
    const cards = game.cards.filter(c => (c !== this) && (c.type !== "deck") && c.testUserPermission(game.user, "LIMITED"));
    if ( !cards.length ) {
      ui.notifications.warn("CARDS.PassWarnNoTargets", {localize: true});
      return [];
    }

    // Construct the dialog HTML
    const html = await foundry.applications.handlebars.renderTemplate("templates/cards/dialog-play.hbs", {card, cards});
    const content = document.createElement("div");
    content.innerHTML = html;

    // Display the prompt
    return foundry.applications.api.DialogV2.prompt({
      window: {title: "CARD.Play"},
      content,
      ok: {
        label: "CARD.Play",
        callback: (event, button) => {
          const fd = new foundry.applications.ux.FormDataExtended(button.form).object;
          const to = game.cards.get(fd.to);
          const options = {action: "play", updateData: fd.down ? {face: null} : {}};
          return this.pass(to, [card.id], options).catch(err => {
            ui.notifications.error(err.message);
            return [];
          });
        }
      }
    });
  }

  /* -------------------------------------------- */

  /**
   * Display a confirmation dialog for whether the user wishes to reset a Cards stack
   * @see {@link Cards#recall}
   * @returns {Promise<Cards|false|null>}
   */
  async resetDialog() {
    const action = this.type === "deck" ? "Reset" : "Return";
    return foundry.applications.api.DialogV2.confirm({
      window: {title: "CARDS.ACTIONS.Reset"},
      content: `<p>${game.i18n.format(`CARDS.${action}Confirm`, {name: foundry.utils.escapeHTML(this.name)})}</p>`,
      yes: {callback: () => this.recall()}
    });
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async deleteDialog(options={}) {
    if ( !this.drawnCards.length ) return super.deleteDialog(options);
    const positionKeys = ["top", "left", "width", "height", "scale", "zIndex"];
    if ( positionKeys.some(k => k in options) ) {
      foundry.utils.logCompatibilityWarning(
        "options is now an object containing entries supported by DialogV2.confirm.",
        {since: 13, until: 15}
      );
      options.position = positionKeys.reduce((position, key) => {
        if ( options[key] !== undefined ) position[key] = options[key];
        delete options[key];
        return position;
      }, {});
    }
    const type = this.typeLabel;
    const title = `${game.i18n.format("DOCUMENT.Delete", {type})}: ${this.name}`;
    return foundry.applications.api.DialogV2.wait(foundry.utils.mergeObject({
      window: {title}, // FIXME: double localization
      content: `
        <strong>${game.i18n.localize("CARDS.DeleteCannot")}</strong>
        <p>${game.i18n.format("CARDS.DeleteMustReset", {type})}</p>
      `,
      buttons: [{
        action: "reset",
        label: "CARDS.ACTIONS.ResetDelete",
        icon: "fa-solid fa-arrow-rotate-left",
        callback: () => this.delete(),
        default: true
      }, {
        action: "cancel",
        label: "Cancel",
        icon: "fa-solid fa-xmark",
        callback: () => false
      }]
    }, options));
  }

  /* -------------------------------------------- */

  /** @override */
  static async createDialog(data={}, createOptions={}, {folders, types, template, context, ...dialogOptions}={}) {
    const applicationOptions = {
      top: "position", left: "position", width: "position", height: "position", scale: "position", zIndex: "position",
      title: "window", id: "", classes: "", jQuery: ""
    };

    for ( const [k, v] of Object.entries(createOptions) ) {
      if ( k in applicationOptions ) {
        foundry.utils.logCompatibilityWarning("The ClientDocument.createDialog signature has changed. "
          + "It now accepts database operation options in its second parameter, "
          + "and options for DialogV2.prompt in its third parameter.", { since: 13, until: 15, once: true });
        const dialogOption = applicationOptions[k];
        if ( dialogOption ) foundry.utils.setProperty(dialogOptions, `${dialogOption}.${k}`, v);
        else dialogOptions[k] = v;
        delete createOptions[k];
      }
    }

    const {parent=null, pack=null} = createOptions;

    if ( types ) {
      if ( types.length === 0 ) throw new Error("The array of sub-types to restrict to must not be empty");
      for ( const type of types ) {
        if ( !this.TYPES.includes(type) ) throw new Error(`Invalid ${this.documentName} sub-type: "${type}"`);
      }
    }

    // Collect data
    const documentTypes = this.TYPES.filter(t => types?.includes(t) !== false);
    let collection;
    if ( !parent ) {
      if ( pack ) collection = game.packs.get(pack);
      else collection = game.collections.get(this.documentName);
    }
    folders ??= collection?._formatFolderSelectOptions() ?? [];
    const label = game.i18n.localize(this.metadata.label);
    const title = game.i18n.format("DOCUMENT.Create", {type: label});
    const type = data.type || documentTypes[0];

    // Render the document creation form
    template ??= "templates/sidebar/cards-create.html";
    const html = await foundry.applications.handlebars.renderTemplate(template, {
      folders,
      name: data.name || "",
      defaultName: this.implementation.defaultName({type, parent, pack}),
      folder: data.folder,
      hasFolders: folders.length >= 1,
      type,
      types: Object.fromEntries(documentTypes.map(type => {
        const label = CONFIG[this.documentName]?.typeLabels?.[type];
        return [type, label && game.i18n.has(label) ? game.i18n.localize(label) : type];
      }).sort((a, b) => a[1].localeCompare(b[1], game.i18n.lang))),
      hasTypes: true,
      presets: CONFIG.Cards.presets,
      ...context
    });
    const content = document.createElement("div");
    content.innerHTML = html;

    // Render the confirmation dialog window
    return foundry.applications.api.DialogV2.prompt(foundry.utils.mergeObject({
      window: {title}, // FIXME: double localization
      content,
      render: (event, dialog) => {
        dialog.element.querySelector('[name="type"]').addEventListener("change", e => {
          dialog.element.querySelector('[name="name"]').placeholder = this.implementation.defaultName(
            {type: e.target.value, parent, pack});
        });
      },
      ok: {
        label: title, // FIXME: double localization
        callback: async (event, button) => {
          const fd = new foundry.applications.ux.FormDataExtended(button.form);
          foundry.utils.mergeObject(data, fd.object, {inplace: true});
          if ( !data.folder ) delete data.folder;
          if ( !data.name?.trim() ) data.name = this.implementation.defaultName({type: data.type, parent, pack});
          const preset = CONFIG.Cards.presets[data.preset];
          if ( preset && (preset.type === data.type) ) {
            const presetData = await fetch(preset.src).then(r => r.json());
            data = foundry.utils.mergeObject(presetData, data);
          }
          return this.implementation.create(data, {parent, pack, renderSheet: true});
        }
      }
    }, dialogOptions));
  }
}

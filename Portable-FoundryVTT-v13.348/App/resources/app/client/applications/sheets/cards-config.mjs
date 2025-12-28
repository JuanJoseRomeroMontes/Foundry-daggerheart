import {DOCUMENT_OWNERSHIP_LEVELS} from "@common/constants.mjs";
import {DocumentSheetV2, HandlebarsApplicationMixin} from "../api/_module.mjs";
import { getDocumentClass } from "@client/utils/helpers.mjs";
import TextEditor from "../ux/text-editor.mjs";
import Hooks from "@client/helpers/hooks.mjs";

/**
 * @import {ApplicationClickAction, FormFooterButton} from "../_types.mjs";
 */

/**
 * A DocumentSheet application responsible for displaying and editing a single Cards stack.
 * @extends DocumentSheetV2
 * @mixes HandlebarsApplication
 */
export class CardsConfig extends HandlebarsApplicationMixin(DocumentSheetV2) {

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    classes: ["cards-config"],
    window: {
      contentClasses: ["standard-form"],
      icon: "fa-solid fa-cards"
    },
    position: {
      width: 720
    },
    actions: {
      controlCard: CardsConfig.#onControlCard,
      reset: CardsConfig.#onReset,
      pass: CardsConfig.#onPass,
      shuffle: CardsConfig.#onShuffle,
      toggleSort: CardsConfig.#onToggleSort
    },
    viewPermission: DOCUMENT_OWNERSHIP_LEVELS.OBSERVER
  };

  /* -------------------------------------------- */

  /**
   * The current sorting mode for the list of cards
   * @type {"standard"|"shuffled"}
   */
  #sortMode = "shuffled";

  /* -------------------------------------------- */

  /** @inheritDoc */
  _initializeApplicationOptions(options) {
    const initialized = super._initializeApplicationOptions(options);
    initialized.classes.push(initialized.document.type);
    return initialized;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.inCompendium = !!context.document.pack;
    return context;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _preparePartContext(partId, context, options) {
    const partContext = await super._preparePartContext(partId, context, options);
    switch ( partId ) {
      case "cards":
        partContext.cards = this._prepareCards(options.sortMode);
        partContext.cardTypes = CONFIG.Card.typeLabels;
        partContext.sortModeIcon = this.#sortMode ==="shuffled" ? "fa-random" : "fa-arrow-up-1-9";
        break;
      case "footer":
        partContext.buttons = this._prepareButtons();
        break;
    }
    return partContext;
  }

  /* -------------------------------------------- */

  /**
   * Prepare a sorted array of cards for display in the sheet.
   * @param {"standard"|"shuffled"} sortMode
   * @returns {Card[]}
   * @protected
   */
  _prepareCards(sortMode=this.#sortMode) {
    const stack = this.document;
    const sortFn = {
      standard: stack.sortStandard,
      shuffled: stack.sortShuffled
    }[sortMode];
    this.#sortMode = sortMode;
    return stack.cards.contents.sort((a, b) => sortFn.call(stack, a, b));
  }

  /* -------------------------------------------- */

  /**
   * Configure footer buttons for the window.
   * @returns {FormFooterButton[]}
   * @protected
   */
  _prepareButtons() {
    if ( !this.document.testUserPermission(game.user, this.options.editPermission) ) return [];
    return [
      {type: "button", icon: "fa-solid fa-arrow-rotate-left", action: "reset", label: "CARDS.ACTIONS.Reset"},
      {type: "submit", icon: "fa-solid fa-floppy-disk", label: "CARDS.ACTIONS.Save"}
    ];
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onRender(context, options) {
    await super._onRender(context, options);
    if ( !options.parts.includes("cards") ) return;
    new foundry.applications.ux.DragDrop.implementation({
      dragSelector: "ol[data-cards] > li",
      dropSelector: "ol[data-cards]",
      permissions: {
        dragstart: () => this.isEditable,
        drop: () => this.isEditable
      },
      callbacks: {
        dragstart: this._onDragStart.bind(this),
        dragover: this._onDragOver.bind(this),
        drop: this._onDrop.bind(this)
      }
    }).bind(this.element);
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /**
   * Pass one or more Cards to a Hand or Pile.
   * @this {CardsConfig}
   * @type {ApplicationClickAction}
   */
  static async #onPass(event) {
    await this.document.passDialog();
  }

  /* -------------------------------------------- */

  /**
   * Reset the Cards stack.
   * @this {CardsConfig}
   * @type {ApplicationClickAction}
   */
  static async #onReset() {
    await this.submit({operation: {render: false}});
    await this.document.resetDialog();
  }

  /* -------------------------------------------- */

  /**
   * Shuffle all Cards.
   * @this {CardsConfig}
   * @type {ApplicationClickAction}
   */
  static async #onShuffle() {
    await this.submit({operation: {render: false}});
    this.#sortMode = "shuffled";
    await this.document.shuffle();
  }

  /* -------------------------------------------- */

  /**
   * Shuffle all Cards.
   * @this {CardsConfig}
   * @type {ApplicationClickAction}
   */
  static async #onToggleSort() {
    await this.submit({operation: {render: false}});
    const sortMode = {standard: "shuffled", shuffled: "standard"}[this.#sortMode];
    await this.render({parts: ["cards"], sortMode});
  }

  /* -------------------------------------------- */

  /**
   * Handle card control actions to modify single cards from the sheet.
   * @this {CardsConfig}
   * @type {ApplicationClickAction}
   */
  static async #onControlCard(_event, button) {
    const li = button.closest("li[data-card-id]");
    const stack = this.document;
    const card = stack.cards.get(li?.dataset.cardId);

    // Save any pending change to the form
    await this.submit({operation: {render: false}});

    // Handle the control action
    switch ( button.dataset.control ) {
      case "create":
        await getDocumentClass("Card").createDialog({faces: [{}], face: 0}, {parent: this.document});
        break;
      case "edit":
        await card.sheet.render({force: true});
        break;
      case "delete":
        await card.deleteDialog();
        break;
      case "play":
        await stack.playDialog(card);
        break;
      case "nextFace":
        await card.update({face: card.face === null ? 0 : card.face+1});
        break;
      case "prevFace":
        await card.update({face: card.face === 0 ? null : card.face-1});
        break;
    }
  }

  /* -------------------------------------------- */

  /**
   * The "dragstart" event handler for individual cards
   * @param {DragEvent} event
   * @protected
   */
  async _onDragStart(event) {
    const li = event.currentTarget;
    const card = this.document.cards.get(li.dataset.cardId);
    if ( card ) event.dataTransfer.setData("text/plain", JSON.stringify(card.toDragData()));
  }

  /* -------------------------------------------- */

  /**
   * The "dragover" event handler for individual cards
   * @param {DragEvent} event
   * @protected
   */
  async _onDragOver(event) {}

  /* -------------------------------------------- */

  /**
   * The "dragdrop" event handler for individual cards
   * @param {DragEvent} event
   * @protected
   */
  async _onDrop(event) {
    const data = TextEditor.implementation.getDragEventData(event);
    if ( data.type !== "Card" ) return;
    const card = await getDocumentClass("Card").fromDropData(data);
    const stack = this.document;
    if ( card.parent.id === stack.id ) return this.#onSortCard(event, card);
    try {
      return await card.pass(stack);
    } catch(err) {
      Hooks.onError("CardsConfig##onDrop", err, {log: "error", notify: "error"});
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle sorting a Card relative to other siblings within this document
   * @param {Event} event     The drag drop event
   * @param {Card} card       The card being dragged
   */
  async #onSortCard(event, card) {
    const stack = this.document;
    const li = event.target.closest("[data-card-id]");
    const target = stack.cards.get(li?.dataset.cardId);
    if ( !target || card === target ) return;
    const siblings = stack.cards.filter(c => c.id !== card.id);
    const updateData = foundry.utils.performIntegerSort(card, {target, siblings}).map(u => {
      return {_id: u.target.id, sort: u.update.sort};
    });
    await stack.updateEmbeddedDocuments("Card", updateData);
  }
}

/**
 * A CardsConfig subclass providing a sheet representation for Cards documents with the "deck" type.
 */
export class CardDeckConfig extends CardsConfig {

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    actions: {
      deal: CardDeckConfig.#onDeal
    }
  };

  /** @override */
  static PARTS = {
    header: {template: "templates/cards/deck/header.hbs"},
    tabs: {template: "templates/generic/tab-navigation.hbs"},
    details: {template: "templates/cards/deck/details.hbs"},
    cards: {template: "templates/cards/deck/cards.hbs", scrollable: ["ol[data-cards]"]},
    footer: {template: "templates/generic/form-footer.hbs"}
  };

  /** @override */
  static TABS = {
    sheet: {
      tabs: [
        {id: "details", icon: "fa-solid fa-gears"},
        {id: "cards", icon: "fa-solid fa-id-badge"}
      ],
      initial: "cards",
      labelPrefix: "CARDS.TABS"
    }
  };

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _preparePartContext(partId, context, options) {
    const partContext = await super._preparePartContext(partId, context, options);
    if ( partId in partContext.tabs ) partContext.tab = partContext.tabs[partId];
    return partContext;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _prepareButtons() {
    const buttons = super._prepareButtons();
    if ( !this.document.testUserPermission(game.user, this.options.editPermission) ) return buttons;
    buttons.unshift(
      {type: "button", action: "shuffle", icon: "fa-solid fa-shuffle", label: "CARDS.ACTIONS.Shuffle"},
      {type: "button", action: "deal", icon: "fa-solid fa-share-from-square", label: "CARDS.ACTIONS.Deal"}
    );
    return buttons;
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /**
   * Deal a single Card.
   * @this {CardsConfig}
   * @type {ApplicationClickAction}
   */
  static async #onDeal() {
    await this.submit({operation: {render: false}});
    await this.document.dealDialog();
  }
}


/**
 * A CardsConfig subclass providing a sheet representation for Cards documents with the "hand" type.
 */
export class CardHandConfig extends CardsConfig {
  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    actions: {
      draw: CardHandConfig.#onDraw
    }
  };

  /** @override */
  static PARTS = {
    cards: {
      template: "templates/cards/hand-pile.hbs",
      root: true,
      scrollable: ["ol[data-cards]"]
    },
    footer: {template: "templates/generic/form-footer.hbs"}
  };

  /* -------------------------------------------- */

  /** @inheritDoc */
  _prepareButtons() {
    const buttons = super._prepareButtons();
    if ( !buttons.length ) return buttons;
    const disabled = !!this.document.pack;
    buttons.unshift(
      {
        type: "button",
        action: "draw",
        icon: "fa-solid fa-plus",
        label: "CARDS.ACTIONS.Draw",
        disabled
      },
      {
        type: "button",
        action: "pass",
        icon: "fa-solid fa-share-from-square",
        label: "CARDS.ACTIONS.Pass",
        disabled
      }
    );
    return buttons;
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /**
   * Draw a single Card.
   * @this {CardsConfig}
   * @type {ApplicationClickAction}
   */
  static async #onDraw() {
    await this.submit({operation: {render: false}});
    await this.document.drawDialog();
  }
}

/**
 * A subclass of CardsConfig providing a sheet representation for Cards documents with the "pile" type.
 */
export class CardPileConfig extends CardsConfig {
  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    classes: ["cards-config"],
    window: {
      contentClasses: ["standard-form"],
      icon: "fa-solid fa-cards"
    },
    position: {
      width: 720
    },
    viewPermission: DOCUMENT_OWNERSHIP_LEVELS.OBSERVER
  };

  /** @override */
  static PARTS = {
    cards: {
      template: "templates/cards/hand-pile.hbs",
      root: true,
      scrollable: ["ol[data-cards]"]
    },
    footer: {template: "templates/generic/form-footer.hbs"}
  };

  /* -------------------------------------------- */

  /** @inheritDoc */
  _prepareButtons() {
    const buttons = super._prepareButtons();
    if ( !buttons.length ) return buttons;
    const disabled = !!this.document.pack;
    buttons.unshift(
      {
        type: "button",
        action: "shuffle",
        icon: "fa-solid fa-shuffle",
        label: "CARDS.ACTIONS.Shuffle",
        disabled
      },
      {
        type: "button",
        action: "pass",
        icon: "fa-solid fa-share-from-square",
        label: "CARDS.ACTIONS.Pass",
        disabled
      }
    );
    return buttons;
  }
}

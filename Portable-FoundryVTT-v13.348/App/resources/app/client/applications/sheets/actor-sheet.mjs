import DocumentSheetV2 from "../api/document-sheet.mjs";
import ImagePopout from "../apps/image-popout.mjs";
import DragDrop from "../../applications/ux/drag-drop.mjs";
import ActiveEffect from "../../documents/active-effect.mjs";
import Item from "../../documents/item.mjs";
import TextEditor from "../ux/text-editor.mjs";
import Hooks from "../../helpers/hooks.mjs";

/**
 * @import Actor from "../../documents/actor.mjs";
 * @import Folder from "../../documents/folder.mjs";
 * @import TokenDocument from "../../documents/token.mjs";
 */

/**
 * A base class for providing Actor Sheet behavior using ApplicationV2.
 */
export default class ActorSheetV2 extends DocumentSheetV2 {

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    position: {width: 600},
    window: {
      controls: [
        {
          action: "configureToken",
          icon: "fa-regular fa-circle-user",
          label: "DOCUMENT.Token",
          ownership: "OWNER"
        },
        {
          action: "configurePrototypeToken",
          icon: "fa-solid fa-circle-user",
          label: "TOKEN.TitlePrototype",
          ownership: "OWNER"
        },
        {
          action: "showPortraitArtwork",
          icon: "fa-solid fa-image",
          label: "SIDEBAR.CharArt",
          ownership: "OWNER"
        },
        {
          action: "showTokenArtwork",
          icon: "fa-solid fa-image",
          label: "SIDEBAR.TokenArt",
          ownership: "OWNER"
        }
      ]
    },
    actions: {
      configurePrototypeToken: ActorSheetV2.#onConfigurePrototypeToken,
      configureToken: ActorSheetV2.#onConfigureToken,
      showPortraitArtwork: ActorSheetV2.#onShowPortraitArtwork,
      showTokenArtwork: ActorSheetV2.#onShowTokenArtwork
    }
  };

  /**
   * The Actor document managed by this sheet.
   * @type {Actor}
   */
  get actor() {
    return this.document;
  }

  /* -------------------------------------------- */

  /**
   * If this sheet manages the ActorDelta of an unlinked Token, reference that Token document.
   * @type {TokenDocument|null}
   */
  get token() {
    return this.document.token;
  }

  /* -------------------------------------------- */

  /** @override */
  _getHeaderControls() {
    const controls = super._getHeaderControls();
    const actor = this.actor;

    // Portrait image
    const img = actor.img;
    if ( img === CONST.DEFAULT_TOKEN ) controls.findSplice(c => c.action === "showPortraitArtwork");

    // Token image
    const prototypeToken = actor.prototypeToken;
    const tex = prototypeToken.texture.src;
    if ( prototypeToken.randomImg || [null, undefined, CONST.DEFAULT_TOKEN].includes(tex) ) {
      controls.findSplice(c => c.action === "showTokenArtwork");
    }

    // Prototype token
    if ( !this.isEditable || actor.isToken ) {
      controls.findSplice(c => c.action === "configurePrototypeToken");
    }

    // Token
    if ( !this.isEditable || !actor.isToken ) controls.findSplice(c => c.action === "configureToken");

    return controls;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onRender(context, options) {
    await super._onRender(context, options);
    new DragDrop.implementation({
      dragSelector: ".draggable",
      permissions: {
        dragstart: this._canDragStart.bind(this),
        drop: this._canDragDrop.bind(this)
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
   * Handle header control button clicks to render the Prototype Token configuration sheet.
   * @this {ActorSheetV2}
   * @param {PointerEvent} event
   */
  static #onConfigurePrototypeToken(event) {
    new CONFIG.Token.prototypeSheetClass({
      prototype: this.actor.prototypeToken,
      position: {
        left: Math.max(this.position.left - 560 - 10, 10),
        top: this.position.top
      }
    }).render({force: true});
  }

  /* -------------------------------------------- */

  /**
   * Handle rendering the token's configuration sheet.
   * @this {ActorSheetV2}
   */
  static #onConfigureToken() {
    this.actor.token.sheet.render({ force: true });
  }

  /* -------------------------------------------- */

  /**
   * Handle header control button clicks to display actor portrait artwork.
   * @this {ActorSheetV2}
   * @param {PointerEvent} event
   */
  static #onShowPortraitArtwork(event) {
    const {img, name, uuid} = this.actor;
    new ImagePopout({src: img, uuid, window: {title: name}}).render({force: true});
  }

  /* -------------------------------------------- */

  /**
   * Handle header control button clicks to display actor portrait artwork.
   * @this {ActorSheetV2}
   * @param {PointerEvent} event
   */
  static #onShowTokenArtwork(event) {
    const {prototypeToken, name, uuid} = this.actor;
    new ImagePopout({src: prototypeToken.texture.src, uuid, window: {title: name}}).render({force: true});
  }

  /* -------------------------------------------- */
  /*  Drag and Drop                               */
  /* -------------------------------------------- */

  /**
   * Define whether a user is able to begin a dragstart workflow for a given drag selector.
   * @param {string} selector       The candidate HTML selector for dragging
   * @returns {boolean}             Can the current user drag this selector?
   * @protected
   */
  _canDragStart(selector) {
    return this.isEditable;
  }

  /* -------------------------------------------- */

  /**
   * Define whether a user is able to conclude a drag-and-drop workflow for a given drop selector.
   * @param {string} selector       The candidate HTML selector for the drop target
   * @returns {boolean}             Can the current user drop on this selector?
   * @protected
   */
  _canDragDrop(selector) {
    return this.isEditable;
  }

  /* -------------------------------------------- */

  /**
   * An event that occurs when a drag workflow begins for a draggable item on the sheet.
   * @param {DragEvent} event       The initiating drag start event
   * @returns {Promise<void>}
   * @protected
   */
  async _onDragStart(event) {
    const target = event.currentTarget;
    if ( "link" in event.target.dataset ) return;
    let dragData;

    // Owned Items
    if ( target.dataset.itemId ) {
      const item = this.actor.items.get(target.dataset.itemId);
      dragData = item.toDragData();
    }

    // Active Effect
    if ( target.dataset.effectId ) {
      const effect = this.actor.effects.get(target.dataset.effectId);
      dragData = effect.toDragData();
    }

    // Set data transfer
    if ( !dragData ) return;
    event.dataTransfer.setData("text/plain", JSON.stringify(dragData));
  }

  /* -------------------------------------------- */

  /**
   * An event that occurs when a drag workflow moves over a drop target.
   * @param {DragEvent} event
   * @protected
   */
  _onDragOver(event) {}

  /* -------------------------------------------- */

  /**
   * An event that occurs when data is dropped into a drop target.
   * @param {DragEvent} event
   * @returns {Promise<void>}
   * @protected
   */
  async _onDrop(event) {
    const data = TextEditor.implementation.getDragEventData(event);
    const actor = this.actor;
    const allowed = Hooks.call("dropActorSheetData", actor, this, data);
    if ( allowed === false ) return;

    // Dropped Documents
    const documentClass = foundry.utils.getDocumentClass(data.type);
    if ( documentClass ) {
      const document = await documentClass.fromDropData(data);
      await this._onDropDocument(event, document);
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle a dropped document on the ActorSheet
   * @template {Document} TDocument
   * @param {DragEvent} event         The initiating drop event
   * @param {TDocument} document       The resolved Document class
   * @returns {Promise<TDocument|null>} A Document of the same type as the dropped one in case of a successful result,
   *                                    or null in case of failure or no action being taken
   * @protected
   */
  async _onDropDocument(event, document) {
    switch ( document.documentName ) {
      case "ActiveEffect":
        return (await this._onDropActiveEffect(event, document)) ?? null;
      case "Actor":
        return (await this._onDropActor(event, document)) ?? null;
      case "Item":
        return (await this._onDropItem(event, document)) ?? null;
      case "Folder":
        return (await this._onDropFolder(event, document)) ?? null;
      default:
        return null;
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle a dropped Active Effect on the Actor Sheet.
   * The default implementation creates an Active Effect embedded document on the Actor.
   * @param {DragEvent} event       The initiating drop event
   * @param {ActiveEffect} effect   The dropped ActiveEffect document
   * @returns {Promise<ActiveEffect|null|undefined>} A Promise resolving to a newly created ActiveEffect, if one was
   *                                                 created, or otherwise a nullish value
   * @protected
   */
  async _onDropActiveEffect(event, effect) {
    if ( !this.actor.isOwner ) return null;
    if ( !effect || (effect.target === this.actor) ) return null;
    const keepId = !this.actor.effects.has(effect.id);
    const result = await ActiveEffect.implementation.create(effect.toObject(), {parent: this.actor, keepId});
    return result ?? null;
  }

  /* -------------------------------------------- */

  /**
   * Handle a dropped Actor on the Actor Sheet.
   * @param {DragEvent} event     The initiating drop event
   * @param {Actor} actor         The dropped Actor document
   * @returns {Promise<Actor|null|undefined>} A Promise resolving to an Actor identical or related to the dropped Actor
   *                                          to indicate success, or a nullish value to indicate failure or no action
   *                                          being taken
   * @protected
   */
  async _onDropActor(event, actor) {
    return null;
  }

  /* -------------------------------------------- */

  /**
   * Handle a dropped Item on the Actor Sheet.
   * @param {DragEvent} event     The initiating drop event
   * @param {Item} item           The dropped Item document
   * @returns {Promise<Item|null|undefined>} A Promise resolving to the dropped Item (if sorting), a newly created Item,
   *                                         or a nullish value in case of failure or no action being taken
   * @protected
   */
  async _onDropItem(event, item) {
    if ( !this.actor.isOwner ) return null;
    if ( this.actor.uuid === item.parent?.uuid ) {
      const result = await this._onSortItem(event, item);
      return result?.length ? item : null;
    }
    const keepId = !this.actor.items.has(item.id);
    const result = await Item.implementation.create(item.toObject(), {parent: this.actor, keepId});
    return result ?? null;
  }

  /* -------------------------------------------- */

  /**
   * Handle a dropped Folder on the Actor Sheet.
   * @param {DragEvent} event     The initiating drop event
   * @param {Folder} folder       The dropped Folder document
   * @returns {Promise<Folder|null|undefined>} A Promise resolving to the dropped Folder indicate success, or a nullish
   *                                           value to indicate failure or no action being taken
   * @protected
   */
  async _onDropFolder(event, folder) {
    return null;
  }

  /* -------------------------------------------- */

  /**
   * Handle a drop event for an existing embedded Item to sort that Item relative to its siblings.
   * @param {DragEvent} event     The initiating drop event
   * @param {Item} item           The dropped Item document
   * @returns {Promise<Item[]>|void}
   * @protected
   */
  _onSortItem(event, item) {
    const items = this.actor.items;
    const source = items.get(item.id);

    // Confirm the drop target
    const dropTarget = event.target.closest("[data-item-id]");
    if ( !dropTarget ) return;
    const target = items.get(dropTarget.dataset.itemId);
    if ( source.id === target.id ) return;

    // Identify sibling items based on adjacent HTML elements
    const siblings = [];
    for ( const element of dropTarget.parentElement.children ) {
      const siblingId = element.dataset.itemId;
      if ( siblingId && (siblingId !== source.id) ) siblings.push(items.get(element.dataset.itemId));
    }

    // Perform the sort
    const sortUpdates = foundry.utils.performIntegerSort(source, {target, siblings});
    const updateData = sortUpdates.map(u => {
      const update = u.update;
      update._id = u.target._id;
      return update;
    });

    // Perform the update
    return this.actor.updateEmbeddedDocuments("Item", updateData);
  }
}

import DocumentSheet from "../api/document-sheet-v1.mjs";
import TokenDocument from "../../documents/token.mjs";
import TextEditor from "../../applications/ux/text-editor.mjs";
import Hooks from "../../helpers/hooks.mjs";
import ActiveEffect from "../../documents/active-effect.mjs";
import Folder from "../../documents/folder.mjs";
import Item from "../../documents/item.mjs";

/**
 * @import Actor from "@client/documents/actor.mjs";
 * @import {ApplicationV1Options} from "../api/application-v1.mjs";
 * @import {DocumentSheetV1Options} from "../api/document-sheet-v1.mjs";
 */

/**
 * The Application responsible for displaying and editing a single Actor document.
 * This Application is responsible for rendering an actor's attributes and allowing the actor to be edited.
 * @deprecated since v13
 * @param {Actor} actor                     The Actor instance being displayed within the sheet.
 * @param {DocumentSheetV1Options & ApplicationV1Options} [options] Additional application configuration options.
 */
export default class ActorSheet extends DocumentSheet {

  /** @inheritdoc */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      height: 720,
      width: 800,
      template: "templates/sheets/actor-sheet.html",
      closeOnSubmit: false,
      submitOnClose: true,
      submitOnChange: true,
      resizable: true,
      baseApplication: "ActorSheet",
      dragDrop: [{dragSelector: ".item-list .item"}],
      secrets: [{parentSelector: ".editor"}],
      token: null
    });
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  get title() {
    if ( !this.actor.isToken ) return this.actor.name;
    return `[${game.i18n.localize(TokenDocument.metadata.label)}] ${this.actor.name}`;
  }

  /* -------------------------------------------- */

  /**
   * A convenience reference to the Actor document
   * @type {Actor}
   */
  get actor() {
    return this.object;
  }

  /* -------------------------------------------- */

  /**
   * If this Actor Sheet represents a synthetic Token actor, reference the active Token
   * @type {TokenDocument|null}
   */
  get token() {
    return this.object.token || this.options.token || null;
  }

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /** @inheritdoc */
  async close(options) {
    this.options.token = null;
    return super.close(options);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  getData(options={}) {
    const context = super.getData(options);
    context.actor = this.object;
    context.items = context.data.items;
    context.items.sort((a, b) => (a.sort || 0) - (b.sort || 0));
    context.effects = context.data.effects;
    return context;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _getHeaderButtons() {
    const buttons = super._getHeaderButtons();
    const canConfigure = game.user.isGM || (this.actor.isOwner && game.user.can("TOKEN_CONFIGURE"));
    if ( this.options.editable && canConfigure ) {
      const closeIndex = buttons.findIndex(btn => btn.label === "Close");
      buttons.splice(closeIndex, 0, {
        label: this.token ? "Token" : "TOKEN.TitlePrototype",
        class: "configure-token",
        icon: "fa-solid fa-circle-user",
        onclick: ev => this._onConfigureToken(ev)
      });
    }
    return buttons;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _getSubmitData(updateData = {}) {
    const data = super._getSubmitData(updateData);
    // Prevent submitting overridden values
    const overrides = foundry.utils.flattenObject(this.actor.overrides);
    for ( const k of Object.keys(overrides) ) delete data[k];
    return data;
  }

  /* -------------------------------------------- */
  /*  Event Listeners                             */
  /* -------------------------------------------- */

  /**
   * Handle requests to configure the Token for the Actor
   * @param {PointerEvent} event      The originating click event
   * @internal
   */
  _onConfigureToken(event) {
    event.preventDefault();
    const renderOptions = {
      force: true,
      position: {
        left: Math.max(this.position.left - 560 - 10, 10),
        top: this.position.top
      }
    };
    if ( this.token ) return this.token.sheet.render(renderOptions);
    else new CONFIG.Token.prototypeSheetClass({prototype: this.actor.prototypeToken}).render(renderOptions);
  }

  /* -------------------------------------------- */
  /*  Drag and Drop                               */
  /* -------------------------------------------- */

  /** @inheritdoc */
  _canDragStart(selector) {
    return this.isEditable;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _canDragDrop(selector) {
    return this.isEditable;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onDragStart(event) {
    const li = event.currentTarget;
    if ( "link" in event.target.dataset ) return;

    // Create drag data
    let dragData;

    // Owned Items
    if ( li.dataset.itemId ) {
      const item = this.actor.items.get(li.dataset.itemId);
      dragData = item.toDragData();
    }

    // Active Effect
    if ( li.dataset.effectId ) {
      const effect = this.actor.effects.get(li.dataset.effectId);
      dragData = effect.toDragData();
    }

    if ( !dragData ) return;

    // Set data transfer
    event.dataTransfer.setData("text/plain", JSON.stringify(dragData));
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _onDrop(event) {
    const data = TextEditor.implementation.getDragEventData(event);
    const actor = this.actor;
    const allowed = Hooks.call("dropActorSheetData", actor, this, data);
    if ( allowed === false ) return;

    // Handle different data types
    switch ( data.type ) {
      case "ActiveEffect":
        return this._onDropActiveEffect(event, data);
      case "Actor":
        return this._onDropActor(event, data);
      case "Item":
        return this._onDropItem(event, data);
      case "Folder":
        return this._onDropFolder(event, data);
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle the dropping of ActiveEffect data onto an Actor Sheet
   * @param {DragEvent} event                  The concluding DragEvent which contains drop data
   * @param {object} data                      The data transfer extracted from the event
   * @returns {Promise<ActiveEffect|boolean>}  The created ActiveEffect object or false if it couldn't be created.
   * @protected
   */
  async _onDropActiveEffect(event, data) {
    const effect = await ActiveEffect.implementation.fromDropData(data);
    if ( !this.actor.isOwner || !effect ) return false;
    if ( effect.target === this.actor ) return false;
    return ActiveEffect.implementation.create(effect.toObject(), {parent: this.actor});
  }

  /* -------------------------------------------- */

  /**
   * Handle dropping of an Actor data onto another Actor sheet
   * @param {DragEvent} event            The concluding DragEvent which contains drop data
   * @param {object} data                The data transfer extracted from the event
   * @returns {Promise<object|boolean>}  A data object which describes the result of the drop, or false if the drop was
   *                                     not permitted.
   * @protected
   */
  async _onDropActor(event, data) {
    if ( !this.actor.isOwner ) return false;
  }

  /* -------------------------------------------- */

  /**
   * Handle dropping of an item reference or item data onto an Actor Sheet
   * @param {DragEvent} event            The concluding DragEvent which contains drop data
   * @param {object} data                The data transfer extracted from the event
   * @returns {Promise<Item[]|boolean>}  The created or updated Item instances, or false if the drop was not permitted.
   * @protected
   */
  async _onDropItem(event, data) {
    if ( !this.actor.isOwner ) return false;
    const item = await Item.implementation.fromDropData(data);
    const itemData = item.toObject();

    // Handle item sorting within the same Actor
    if ( this.actor.uuid === item.parent?.uuid ) return this._onSortItem(event, itemData);

    // Create the owned item
    return this._onDropItemCreate(itemData, event);
  }

  /* -------------------------------------------- */

  /**
   * Handle dropping of a Folder on an Actor Sheet.
   * The core sheet currently supports dropping a Folder of Items to create all items as owned items.
   * @param {DragEvent} event     The concluding DragEvent which contains drop data
   * @param {object} data         The data transfer extracted from the event
   * @returns {Promise<Item[]>}
   * @protected
   */
  async _onDropFolder(event, data) {
    if ( !this.actor.isOwner ) return [];
    const folder = await Folder.implementation.fromDropData(data);
    if ( folder.type !== "Item" ) return [];
    const droppedItemData = await Promise.all(folder.contents.map(async item => {
      if ( !(item instanceof Item) ) item = await foundry.utils.fromUuid(item.uuid);
      return item.toObject();
    }));
    return this._onDropItemCreate(droppedItemData, event);
  }

  /* -------------------------------------------- */

  /**
   * Handle the final creation of dropped Item data on the Actor.
   * This method is factored out to allow downstream classes the opportunity to override item creation behavior.
   * @param {object[]|object} itemData      The item data requested for creation
   * @param {DragEvent} event               The concluding DragEvent which provided the drop data
   * @returns {Promise<Item[]>}
   * @internal
   */
  async _onDropItemCreate(itemData, event) {
    itemData = Array.isArray(itemData) ? itemData : [itemData];
    return this.actor.createEmbeddedDocuments("Item", itemData);
  }

  /* -------------------------------------------- */

  /**
   * Handle a drop event for an existing embedded Item to sort that Item relative to its siblings
   * @param {Event} event
   * @param {Object} itemData
   * @internal
   */
  _onSortItem(event, itemData) {

    // Get the drag source and drop target
    const items = this.actor.items;
    const source = items.get(itemData._id);
    const dropTarget = event.target.closest("[data-item-id]");
    if ( !dropTarget ) return;
    const target = items.get(dropTarget.dataset.itemId);

    // Don't sort on yourself
    if ( source.id === target.id ) return;

    // Identify sibling items based on adjacent HTML elements
    const siblings = [];
    for ( const el of dropTarget.parentElement.children ) {
      const siblingId = el.dataset.itemId;
      if ( siblingId && (siblingId !== source.id) ) siblings.push(items.get(el.dataset.itemId));
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

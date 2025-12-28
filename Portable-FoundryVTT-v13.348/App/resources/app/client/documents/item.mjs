import BaseItem from "@common/documents/item.mjs";
import ClientDocumentMixin from "./abstract/client-document.mjs";
import {getDocumentClass} from "@client/utils/helpers.mjs";

/**
 * @import Actor from "./actor.mjs";
 * @import ActiveEffect from "./active-effect.mjs";
 */

/**
 * The client-side Item document which extends the common BaseItem model.
 * @extends BaseItem
 * @mixes ClientDocumentMixin
 * @category Documents
 *
 * @see {@link foundry.documents.collections.Items}: The world-level collection of Item documents
 * @see {@link foundry.applications.sheets.ItemSheet}: The Item configuration application
 */
export default class Item extends ClientDocumentMixin(BaseItem) {

  /**
   * A convenience alias of Item#parent which is more semantically intuitive
   * @type {Actor|null}
   */
  get actor() {
    return this.parent instanceof foundry.documents.Actor ? this.parent : null;
  }

  /* -------------------------------------------- */

  /**
   * Provide a thumbnail image path used to represent this document.
   * @type {string}
   */
  get thumbnail() {
    return this.img;
  }

  /* -------------------------------------------- */

  /**
   * A legacy alias of Item#isEmbedded
   * @type {boolean}
   */
  get isOwned() {
    return this.isEmbedded;
  }

  /* -------------------------------------------- */

  /**
   * Return an array of the Active Effect instances which originated from this Item.
   * The returned instances are the ActiveEffect instances which exist on the Item itself.
   * @type {ActiveEffect[]}
   */
  get transferredEffects() {
    return this.effects.filter(e => e.transfer === true);
  }

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /**
   * Return a data object which defines the data schema against which dice rolls can be evaluated.
   * By default, this is directly the Item's system data, but systems may extend this to include additional properties.
   * If overriding or extending this method to add additional properties, care must be taken not to mutate the original
   * object.
   * @returns {object}
   */
  getRollData() {
    return this.system;
  }

  /* -------------------------------------------- */
  /*  Event Handlers                              */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async _preCreate(data, options, user) {
    if ( ((this.parent instanceof foundry.documents.Actor) || (this.parent instanceof foundry.documents.ActorDelta))
      && !CONFIG.ActiveEffect.legacyTransferral ) {
      for ( const effect of this.effects ) {
        if ( effect.transfer ) effect.updateSource(foundry.documents.ActiveEffect.implementation.getInitialDuration());
      }
    }
    return super._preCreate(data, options, user);
  }

  /* -------------------------------------------- */

  /** @override */
  static async _onCreateOperation(documents, operation, user) {
    const actor = operation.parent;
    if ( !((actor instanceof foundry.documents.Actor) || (actor instanceof foundry.documents.ActorDelta))
      || !CONFIG.ActiveEffect.legacyTransferral || !user.isSelf ) return;
    const cls = foundry.utils.getDocumentClass("ActiveEffect");

    // Create effect data
    const toCreate = [];
    for ( const item of documents ) {
      for ( const effect of item.effects ) {
        if ( !effect.transfer ) continue;
        const effectData = effect.toJSON();
        effectData.origin = item.uuid;
        toCreate.push(effectData);
      }
    }

    // Asynchronously create transferred Active Effects
    operation = {...operation};
    delete operation.data;
    operation.renderSheet = false;
    // noinspection ES6MissingAwait
    cls.createDocuments(toCreate, operation);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  static async _onDeleteOperation(documents, operation, user) {
    const actor = operation.parent;
    if ( !((actor instanceof foundry.documents.Actor) || (actor instanceof foundry.documents.ActorDelta))
      || !CONFIG.ActiveEffect.legacyTransferral || !user.isSelf ) return;

    // Identify effects that should be deleted
    const deletedUUIDs = new Set(documents.map(i => {
      if ( actor.isToken ) return i.uuid.split(".").slice(-2).join(".");
      return i.uuid;
    }));
    const toDelete = [];
    for ( const e of actor.effects ) {
      let origin = e.origin || "";
      if ( actor.isToken ) origin = origin.split(".").slice(-2).join(".");
      if ( deletedUUIDs.has(origin) ) toDelete.push(e.id);
    }

    // Asynchronously delete transferred Active Effects
    operation = {...operation};
    delete operation.ids;
    delete operation.deleteAll;
    getDocumentClass("ActiveEffect").deleteDocuments(toDelete, operation);
  }
}

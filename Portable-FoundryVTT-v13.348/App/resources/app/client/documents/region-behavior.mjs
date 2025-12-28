import BaseRegionBehavior from "@common/documents/region-behavior.mjs";
import ClientDocumentMixin from "./abstract/client-document.mjs";

/**
 * @import RegionDocument from "./region.mjs";
 * @import Scene from "./scene.mjs";
 * @import {RegionEvent} from "./_types.mjs";
 */

/**
 * The client-side RegionBehavior document which extends the common BaseRegionBehavior model.
 * @extends BaseRegionBehavior
 * @mixes ClientDocumentMixin
 * @category Documents
 *
 * @see {@link foundry.documents.RegionDocument}: The Region document type which contains
 *   RegionBehavior documents
 * @see {@link foundry.applications.sheets.RegionBehaviorConfig}: The RegionBehaviorConfig
 *   configuration application
 */
export default class RegionBehavior extends ClientDocumentMixin(BaseRegionBehavior) {

  /**
   * A convenience reference to the RegionDocument which contains this RegionBehavior.
   * @type {RegionDocument|null}
   */
  get region() {
    return this.parent;
  }

  /* ---------------------------------------- */

  /**
   * A convenience reference to the Scene which contains this RegionBehavior.
   * @type {Scene|null}
   */
  get scene() {
    return this.region?.parent ?? null;
  }

  /* ---------------------------------------- */

  /**
   * A RegionBehavior is active if and only if it was created, hasn't been deleted yet, and isn't disabled.
   * @type {boolean}
   */
  get active() {
    return !this.disabled && (this.region?.behaviors.get(this.id) === this)
      && (this.scene?.regions.get(this.region.id) === this.region);
  }

  /* -------------------------------------------- */

  /**
   * A RegionBehavior is viewed if and only if it is active and the Scene of its Region is viewed.
   * @type {boolean}
   */
  get viewed() {
    return this.active && (this.scene?.isView === true);
  }

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /** @override */
  prepareBaseData() {
    this.name ||= game.i18n.localize(CONFIG.RegionBehavior.typeLabels[this.type]);
  }

  /* -------------------------------------------- */

  /**
   * Does this RegionBehavior handle the Region events with the given name?
   * @param {string} eventName    The Region event name
   * @returns {boolean}
   */
  hasEvent(eventName) {
    const system = this.system;
    return (system instanceof foundry.data.regionBehaviors.RegionBehaviorType)
      && ((eventName in system.constructor.events) || system.events.has(eventName));
  }

  /* -------------------------------------------- */

  /**
   * Handle the Region event.
   * @param {RegionEvent} event    The Region event
   * @returns {Promise<void>}
   * @internal
   */
  async _handleRegionEvent(event) {
    const system = this.system;
    if ( !(system instanceof foundry.data.regionBehaviors.RegionBehaviorType) ) return;

    // Statically registered events for the behavior type
    if ( event.name in system.constructor.events ) {
      await system.constructor.events[event.name].call(system, event);
    }

    // Registered events specific to this behavior document
    if ( !system.events.has(event.name) ) return;
    await system._handleRegionEvent(event);
  }

  /* -------------------------------------------- */
  /*  Interaction Dialogs                         */
  /* -------------------------------------------- */

  /** @inheritDoc */
  static async createDialog(data, createOptions, dialogOptions) {
    if ( !game.user.can("MACRO_SCRIPT") ) {
      dialogOptions = {
        ...dialogOptions,
        types: (dialogOptions?.types ?? this.TYPES).filter(t => t !== "executeScript")
      };
    }
    return super.createDialog(data, createOptions, dialogOptions);
  }
}

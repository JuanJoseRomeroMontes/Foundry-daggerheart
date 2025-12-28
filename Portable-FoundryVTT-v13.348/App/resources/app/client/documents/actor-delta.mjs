import BaseActorDelta from "@common/documents/actor-delta.mjs";
import ClientDocumentMixin from "./abstract/client-document.mjs";
import Hooks from "../helpers/hooks.mjs";

/**
 * The client-side ActorDelta embedded document which extends the common BaseActorDelta document model.
 * @extends BaseActorDelta
 * @mixes ClientDocumentMixin
 * @category Documents
 *
 * @see {@link foundry.documents.TokenDocument}: The TokenDocument document type which contains ActorDelta embedded
 *   documents.
 */
export default class ActorDelta extends ClientDocumentMixin(BaseActorDelta) {
  /** @inheritDoc */
  _configure(options={}) {
    super._configure(options);
    this._createSyntheticActor();
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _initialize({sceneReset=false, ...options}={}) {
    // Do not initialize the ActorDelta as part of a Scene reset.
    if ( sceneReset ) return;
    super._initialize(options);
    if ( !this.parent.isLinked && (this.syntheticActor?.id !== this.parent.actorId) ) {
      this._createSyntheticActor({ reinitializeCollections: true });
    }
  }

  /* -------------------------------------------- */

  /**
   * Pass-through the type from the synthetic Actor, if it exists.
   * @type {string}
   */
  get type() {
    return this.syntheticActor?.type ?? this._type ?? this._source.type;
  }

  set type(type) {
    this._type = type;
  }

  /** @internal */
  _type;

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /**
   * Apply this ActorDelta to the base Actor and return a synthetic Actor.
   * @param {object} [context]  Context to supply to synthetic Actor instantiation.
   * @returns {Actor|null}
   */
  apply(context={}) {
    return this.constructor.applyDelta(this, this.parent.baseActor, context);
  }

  /* -------------------------------------------- */

  /** @override */
  prepareEmbeddedDocuments() {
    // The synthetic actor prepares its items in the appropriate context of an actor. The actor delta does not need to
    // prepare its items, and would do so in the incorrect context.
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  updateSource(changes={}, options={}) {
    // If there is no baseActor, there is no synthetic actor either, so we do nothing.
    if ( !this.syntheticActor || !this.parent.baseActor ) return {};

    // Perform an update on the synthetic Actor first to validate the changes.
    let actorChanges = foundry.utils.deepClone(changes);
    delete actorChanges._id;
    actorChanges.type ??= this.syntheticActor.type;
    actorChanges.name ??= this.syntheticActor.name;

    // In the non-recursive case we must apply the changes as actor delta changes first in order to get an appropriate
    // actor update, otherwise applying an actor delta update non-recursively to an actor will truncate most of its
    // data.
    if ( options.recursive === false ) {
      const tmpDelta = new ActorDelta.implementation(actorChanges, { parent: this.parent });
      const updatedActor = this.constructor.applyDelta(tmpDelta, this.parent.baseActor);
      if ( updatedActor ) actorChanges = updatedActor.toObject();
    }

    this.syntheticActor.updateSource(actorChanges, { ...options });
    const diff = super.updateSource(changes, options);

    // If this was an embedded update, re-apply the delta to make sure embedded collections are merged correctly.
    const embeddedUpdate = Object.keys(this.constructor.hierarchy).some(k => k in changes);
    const deletionUpdate = Object.keys(foundry.utils.flattenObject(changes)).some(k => k.includes("-="));
    if ( !this.parent.isLinked && (embeddedUpdate || deletionUpdate) ) this.updateSyntheticActor();
    return diff;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  reset() {
    super.reset();
    // Propagate reset calls on the ActorDelta to the synthetic Actor.
    if ( !this.parent.isLinked ) this.syntheticActor?.reset();
  }

  /* -------------------------------------------- */

  /**
   * Generate a synthetic Actor instance when constructed, or when the represented Actor, or actorLink status changes.
   * @param {object} [options]
   * @param {boolean} [options.reinitializeCollections]  Whether to fully re-initialize this ActorDelta's collections in
   *                                                     order to re-retrieve embedded Documents from the synthetic
   *                                                     Actor.
   * @internal
   */
  _createSyntheticActor({ reinitializeCollections=false }={}) {
    Object.defineProperty(this, "syntheticActor", {value: this.apply({strict: false}), configurable: true});
    if ( reinitializeCollections ) {
      for ( const collection of Object.values(this.collections) ) collection.initialize({ full: true });
    }
  }

  /* -------------------------------------------- */

  /**
   * Update the synthetic Actor instance with changes from the delta or the base Actor.
   */
  updateSyntheticActor() {
    if ( this.parent.isLinked ) return;
    const updatedActor = this.apply();
    if ( updatedActor ) this.syntheticActor.updateSource(updatedActor.toObject(), {diff: false, recursive: false});
  }

  /* -------------------------------------------- */

  /**
   * Restore this delta to empty, inheriting all its properties from the base actor.
   * @returns {Promise<Actor>}  The restored synthetic Actor.
   */
  async restore() {
    if ( !this.parent.isLinked ) await Promise.all(Object.values(this.syntheticActor.apps).map(app => app.close()));
    await this.delete({diff: false, recursive: false, restoreDelta: true});
    return this.parent.actor;
  }

  /* -------------------------------------------- */

  /**
   * Ensure that the embedded collection delta is managing any entries that have had their descendants updated.
   * @param {Document} doc  The parent whose immediate children have been modified.
   * @internal
   */
  _handleDeltaCollectionUpdates(doc) {
    // Recurse up to an immediate child of the ActorDelta.
    if ( !doc ) return;
    if ( doc.parent !== this ) return this._handleDeltaCollectionUpdates(doc.parent);
    const collection = this.getEmbeddedCollection(doc.parentCollection);
    if ( !collection.manages(doc.id) ) collection.set(doc.id, doc);
  }

  /* -------------------------------------------- */

  /** @override */
  async _onSheetChange() {
    // No-op as ActorDeltas do not have sheets.
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _prepareDeltaUpdate(changes={}, options={}) {
    super._prepareDeltaUpdate(changes, options);
    options._deltaModel = this;
  }

  /* -------------------------------------------- */
  /*  Database Operations                         */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async _preDelete(options, user) {
    if ( this.parent.isLinked ) return super._preDelete(options, user);
    // Emulate a synthetic actor update.
    const data = this.parent.baseActor.toObject();
    let allowed = await this.syntheticActor._preUpdate(data, options, user) ?? true;
    allowed &&= (options.noHook || Hooks.call("preUpdateActor", this.syntheticActor, data, options, user.id));
    if ( allowed === false ) {
      console.debug(`${CONST.vtt} | Actor update prevented during pre-update`);
      return false;
    }
    return super._preDelete(options, user);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);
    if ( this.parent.isLinked ) return;
    this.syntheticActor._onUpdate(changed, options, userId);
    Hooks.callAll("updateActor", this.syntheticActor, changed, options, userId);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onDelete(options, userId) {
    super._onDelete(options, userId);
    if ( !this.parent.baseActor ) return;
    // Create a new, ephemeral ActorDelta Document in the parent Token and emulate synthetic actor update.
    this.parent.updateSource({ delta: { _id: this.parent.id } });
    this.parent.delta._onUpdate(this.parent.baseActor.toObject(), options, userId);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _dispatchDescendantDocumentEvents(event, collection, args, _parent) {
    super._dispatchDescendantDocumentEvents(event, collection, args, _parent);
    // Emulate descendant events on the synthetic actor
    if ( !_parent ) {
      const fn = this.syntheticActor[`_${event}DescendantDocuments`];
      fn?.call(this.syntheticActor, this.syntheticActor, collection, ...args);
    }
  }
}

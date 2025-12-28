import Document from "../abstract/document.mjs";
import {deepClone, mergeObject} from "../utils/helpers.mjs";
import * as fields from "../data/fields.mjs";

/**
 * @import {ActorDeltaData} from "./_types.mjs";
 * @import BaseActor from "./actor.mjs";
 * @import {DataModelUpdateOptions} from "@common/abstract/_types.mjs";
 */

/**
 * The ActorDelta Document.
 * Defines the DataSchema and common behaviors for an ActorDelta which are shared between both client and server.
 * ActorDeltas store a delta that can be applied to a particular Actor in order to produce a new Actor.
 * @extends {Document<ActorDeltaData>}
 * @mixes ActorDeltaData
 * @category Documents
 */
export default class BaseActorDelta extends Document {

  /* -------------------------------------------- */
  /*  Model Configuration                         */
  /* -------------------------------------------- */

  /** @inheritdoc */
  static metadata = Object.freeze(mergeObject(super.metadata, {
    name: "ActorDelta",
    collection: "delta",
    label: "DOCUMENT.ActorDelta",
    labelPlural: "DOCUMENT.ActorDeltas",
    isEmbedded: true,
    embedded: {
      Item: "items",
      ActiveEffect: "effects"
    },
    permissions: {
      create: "OWNER",
      delete: "OWNER"
    },
    schemaVersion: "13.341"
  }, {inplace: false}));

  /** @override */
  static defineSchema() {
    const {BaseItem, BaseActiveEffect} = foundry.documents;
    return {
      _id: new fields.DocumentIdField(),
      name: new fields.StringField({required: false, nullable: true, initial: null}),
      type: new fields.StringField({required: false, nullable: true, initial: null}),
      img: new fields.FilePathField({categories: ["IMAGE"], nullable: true, initial: null, required: false}),
      system: new fields.ObjectField(),
      items: new fields.EmbeddedCollectionDeltaField(BaseItem),
      effects: new fields.EmbeddedCollectionDeltaField(BaseActiveEffect),
      ownership: new fields.DocumentOwnershipField({required: false, nullable: true, initial: null}),
      flags: new fields.DocumentFlagsField()
    };
  }

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /** @override */
  getUserLevel(user) {
    user ||= game.user;
    const {INHERIT, NONE} = CONST.DOCUMENT_OWNERSHIP_LEVELS;
    if ( this.ownership ) {
      const level = this.ownership[user.id] ?? this.ownership.default ?? NONE;
      if ( level !== INHERIT ) return level;                                  // Defer inherited for Embedded
    }
    if ( this.parent ) return this.parent.getUserLevel(user);                 // Embedded Documents
    return NONE;                                                              // Otherwise, NONE
  }

  /* -------------------------------------------- */

  /**
   * Retrieve the base actor's collection, if it exists.
   * @param {string} collectionName  The collection name.
   * @returns {Collection}
   */
  getBaseCollection(collectionName) {
    const baseActor = this.parent?.baseActor;
    return baseActor?.getEmbeddedCollection(collectionName);
  }

  /* -------------------------------------------- */

  /**
   * Apply an ActorDelta to an Actor and return the resultant synthetic Actor.
   * @param {ActorDelta} delta    The ActorDelta.
   * @param {BaseActor} baseActor The base Actor.
   * @param {object} [context]    Context to supply to synthetic Actor instantiation.
   * @returns {BaseActor|null}
   */
  static applyDelta(delta, baseActor, context={}) {
    if ( !baseActor ) return null;
    if ( delta.parent?.isLinked ) return baseActor;

    // Get base actor data.
    const cls = getDocumentClass("Actor");
    const actorData = baseActor.toObject();
    const deltaData = delta.toObject();
    delete deltaData._id;

    // Merge embedded collections.
    BaseActorDelta.#mergeEmbeddedCollections(cls, actorData, deltaData);

    // Merge the rest of the delta.
    mergeObject(actorData, deltaData);
    return new cls(actorData, {parent: delta.parent, ...context});
  }

  /* -------------------------------------------- */

  /**
   * Merge delta Document embedded collections with the base Document.
   * @param {typeof Document} documentClass  The parent Document class.
   * @param {object} baseData                The base Document data.
   * @param {object} deltaData               The delta Document data.
   */
  static #mergeEmbeddedCollections(documentClass, baseData, deltaData) {
    for ( const collectionName of Object.keys(documentClass.hierarchy) ) {
      const baseCollection = baseData[collectionName];
      const deltaCollection = deltaData[collectionName];
      baseData[collectionName] = BaseActorDelta.#mergeEmbeddedCollection(baseCollection, deltaCollection);
      delete deltaData[collectionName];
    }
  }

  /* -------------------------------------------- */

  /**
   * Apply an embedded collection delta.
   * @param {object[]} base   The base embedded collection.
   * @param {object[]} delta  The delta embedded collection.
   * @returns {object[]}
   */
  static #mergeEmbeddedCollection(base=[], delta=[]) {
    const deltaIds = new Set();
    const records = [];
    for ( const record of delta ) {
      if ( !record._tombstone ) records.push(record);
      deltaIds.add(record._id);
    }
    for ( const record of base ) {
      if ( !deltaIds.has(record._id) ) records.push(record);
    }
    return records;
  }

  /* -------------------------------------------- */

  /** @override */
  static migrateData(source) {
    return foundry.documents.BaseActor.migrateData(source);
  }

  /* -------------------------------------------- */

  /**
   * Prepare changes to a descendent delta collection.
   * @param {object} changes                  Candidate source changes.
   * @param {DataModelUpdateOptions} options  Options which determine how the new data is merged.
   * @internal
   */
  _prepareDeltaUpdate(changes={}, options={}) {
    for ( const collectionName of Object.keys(this.constructor.hierarchy) ) {
      if ( collectionName in changes ) {
        this.getEmbeddedCollection(collectionName)._prepareDeltaUpdate(changes[collectionName], options);
      }
    }
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  updateSource(changes={}, options={}) {
    this._prepareDeltaUpdate(changes, options);
    return super.updateSource(changes, options);
  }

  /* -------------------------------------------- */
  /*  Serialization                               */
  /* -------------------------------------------- */

  /** @override */
  toObject(source=true) {
    const data = {};
    const value = source ? this._source : this;
    for ( const [name, field] of this.schema.entries() ) {
      const v = value[name];
      if ( !field.required && ((v === undefined) || (v === null)) ) continue; // Drop optional fields
      data[name] = source ? deepClone(value[name]) : field.toObject(value[name]);
    }
    return data;
  }
}

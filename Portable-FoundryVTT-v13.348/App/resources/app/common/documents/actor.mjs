import Document from "../abstract/document.mjs";
import * as CONST from "../constants.mjs";
import * as fields from "../data/fields.mjs";
import {getProperty, mergeObject, setProperty} from "../utils/helpers.mjs";
import {PrototypeToken} from "../data/data.mjs";

/**
 * @import {ActorData} from "./_types.mjs";
 * @import {DocumentPermissionTest} from "@common/abstract/_types.mjs";
 */

/**
 * The Actor Document.
 * Defines the DataSchema and common behaviors for an Actor which are shared between both client and server.
 * @extends {Document<ActorData>}
 * @mixes ActorData
 * @category Documents
 */
export default class BaseActor extends Document {

  /* -------------------------------------------- */
  /*  Model Configuration                         */
  /* -------------------------------------------- */

  /** @inheritdoc */
  static metadata = Object.freeze(mergeObject(super.metadata, {
    name: "Actor",
    collection: "actors",
    indexed: true,
    compendiumIndexFields: ["_id", "name", "img", "type", "sort", "folder"],
    embedded: {ActiveEffect: "effects", Item: "items"},
    hasTypeData: true,
    label: "DOCUMENT.Actor",
    labelPlural: "DOCUMENT.Actors",
    permissions: {
      create: this.#canCreate,
      update: this.#canUpdate
    },
    schemaVersion: "13.341"
  }, {inplace: false}));

  /* ---------------------------------------- */

  /** @inheritdoc */
  static defineSchema() {
    const {BaseItem, BaseActiveEffect, BaseFolder} = foundry.documents;
    return {
      _id: new fields.DocumentIdField(),
      name: new fields.StringField({required: true, blank: false, textSearch: true}),
      img: new fields.FilePathField({categories: ["IMAGE"], initial: data => {
        return this.implementation.getDefaultArtwork(data).img;
      }}),
      type: new fields.DocumentTypeField(this),
      system: new fields.TypeDataField(this),
      prototypeToken: new fields.EmbeddedDataField(PrototypeToken),
      items: new fields.EmbeddedCollectionField(BaseItem),
      effects: new fields.EmbeddedCollectionField(BaseActiveEffect),
      folder: new fields.ForeignDocumentField(BaseFolder),
      sort: new fields.IntegerSortField(),
      ownership: new fields.DocumentOwnershipField(),
      flags: new fields.DocumentFlagsField(),
      _stats: new fields.DocumentStatsField()
    };
  }

  /* ---------------------------------------- */

  /**
   * The default icon used for newly created Actor documents.
   * @type {string}
   */
  static DEFAULT_ICON = CONST.DEFAULT_TOKEN;

  /* -------------------------------------------- */

  /**
   * Determine default artwork based on the provided actor data.
   * @param {ActorData} actorData                      The source actor data.
   * @returns {{img: string, texture: {src: string}}}  Candidate actor image and prototype token artwork.
   */
  static getDefaultArtwork(actorData) {
    return {
      img: this.DEFAULT_ICON,
      texture: {
        src: this.DEFAULT_ICON
      }
    };
  }

  /* ---------------------------------------- */

  /** @inheritdoc */
  _initializeSource(source, options) {
    source = super._initializeSource(source, options);
    source.prototypeToken.name = source.prototypeToken.name || source.name;
    source.prototypeToken.texture.src = source.prototypeToken.texture.src || source.img;
    return source;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _initialize(options) {
    super._initialize(options);
    fields.DocumentStatsField._shimDocument(this);
  }

  /* -------------------------------------------- */

  /** @override */
  static canUserCreate(user) {
    return user.hasPermission("ACTOR_CREATE");
  }

  /* ---------------------------------------- */

  /**
   * Is a user able to create this actor?
   * @type {DocumentPermissionTest}
   */
  static #canCreate(user, doc) {
    if ( !user.hasPermission("ACTOR_CREATE") ) return false;      // User cannot create actors at all
    if ( doc._source.prototypeToken.randomImg && !user.hasPermission("FILES_BROWSE") ) return false;
    return true;
  }

  /* -------------------------------------------- */

  /**
   * Is a user able to update an existing actor?
   * @type {DocumentPermissionTest}
   */
  static #canUpdate(user, doc, data) {
    if ( !doc.testUserPermission(user, "OWNER") ) return false; // Ownership is required.

    // Users can only enable token wildcard images if they have FILES_BROWSE permission.
    const tokenChange = data?.prototypeToken || {};
    const enablingRandomImage = tokenChange.randomImg === true;
    if ( enablingRandomImage ) return user.hasPermission("FILES_BROWSE");

    // Users can only change a token wildcard path if they have FILES_BROWSE permission.
    const randomImageEnabled = doc._source.prototypeToken.randomImg && (tokenChange.randomImg !== false);
    const changingRandomImage = ("img" in tokenChange) && randomImageEnabled;
    if ( changingRandomImage ) return user.hasPermission("FILES_BROWSE");
    return true;
  }

  /* ---------------------------------------- */

  /** @inheritDoc */
  async _preCreate(data, options, user) {
    const allowed = await super._preCreate(data, options, user);
    if ( allowed === false ) return false;
    if ( !this.prototypeToken.name ) this.prototypeToken.updateSource({name: this.name});
    if ( !this.prototypeToken.texture.src || (this.prototypeToken.texture.src === CONST.DEFAULT_TOKEN)) {
      const { texture } = this.constructor.getDefaultArtwork(this.toObject());
      this.prototypeToken.updateSource("img" in data ? { texture: { src: this.img } } : { texture });
    }
  }

  /* ---------------------------------------- */

  /** @inheritDoc */
  async _preUpdate(changed, options, user) {
    const allowed = await super._preUpdate(changed, options, user);
    if ( allowed === false ) return false;
    if ( changed.img && !getProperty(changed, "prototypeToken.texture.src") ) {
      const { texture } = this.constructor.getDefaultArtwork(foundry.utils.mergeObject(this.toObject(), changed));
      if ( !this.prototypeToken.texture.src || (this.prototypeToken.texture.src === texture?.src) ) {
        setProperty(changed, "prototypeToken.texture.src", changed.img);
      }
    }
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  static migrateData(source) {
    fields.DocumentStatsField._migrateData(this, source);
    return super.migrateData(source);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  static shimData(source, options) {
    fields.DocumentStatsField._shimData(this, source, options);
    return super.shimData(source, options);
  }
}

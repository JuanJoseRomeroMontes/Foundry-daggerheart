import Document from "../abstract/document.mjs";
import {mergeObject} from "../utils/helpers.mjs";
import * as fields from "../data/fields.mjs";

/**
 * @import {FogExplorationData} from "./_types.mjs";
 * @import {DocumentPermissionTest} from "@common/abstract/_types.mjs";
 */

/**
 * The FogExploration Document.
 * Defines the DataSchema and common behaviors for a FogExploration which are shared between both client and server.
 * @extends {Document<FogExplorationData>}
 * @mixes FogExplorationData
 * @category Documents
 */
export default class BaseFogExploration extends Document {

  /* ---------------------------------------- */
  /*  Model Configuration                     */
  /* ---------------------------------------- */

  /** @inheritdoc */
  static metadata = Object.freeze(mergeObject(super.metadata, {
    name: "FogExploration",
    collection: "fog",
    label: "DOCUMENT.FogExploration",
    labelPlural: "DOCUMENT.FogExplorations",
    isPrimary: true,
    permissions: {
      create: "PLAYER",
      update: this.#canModify,
      delete: this.#canModify
    },
    schemaVersion: "13.341"
  }, {inplace: false}));

  /** @inheritdoc */
  static defineSchema() {
    const {BaseScene, BaseUser} = foundry.documents;
    return {
      _id: new fields.DocumentIdField(),
      scene: new fields.ForeignDocumentField(BaseScene, {initial: () => canvas?.scene?.id}),
      user: new fields.ForeignDocumentField(BaseUser, {initial: () => game?.user?.id}),
      explored: new fields.FilePathField({categories: ["IMAGE"], required: true, base64: true}),
      positions: new fields.ObjectField(),
      timestamp: new fields.NumberField({nullable: false, initial: Date.now}),
      flags: new fields.DocumentFlagsField(),
      _stats: new fields.DocumentStatsField()
    };
  }

  /**
   * Test whether a User can modify a FogExploration document.
   * @type {DocumentPermissionTest}
   */
  static #canModify(user, doc) {
    return (user.id === doc._source.user) || user.hasRole("ASSISTANT");
  }

  /* ---------------------------------------- */
  /*  Database Event Handlers                 */
  /* ---------------------------------------- */

  /** @inheritDoc */
  async _preUpdate(changed, options, user) {
    const allowed = await super._preUpdate(changed, options, user);
    if ( allowed === false ) return false;
    changed.timestamp = Date.now();
  }
}

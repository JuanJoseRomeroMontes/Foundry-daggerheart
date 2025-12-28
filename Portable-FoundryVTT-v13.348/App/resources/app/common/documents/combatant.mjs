import Document from "../abstract/document.mjs";
import {mergeObject} from "../utils/helpers.mjs";
import * as fields from "../data/fields.mjs";
import * as CONST from "../constants.mjs";

/**
 * @import {CombatantData} from "./_types.mjs";
 * @import {DocumentPermissionTest} from "@common/abstract/_types.mjs";
 */

/**
 * The Combatant Document.
 * Defines the DataSchema and common behaviors for a Combatant which are shared between both client and server.
 * @extends {Document<CombatantData>}
 * @mixes CombatantData
 * @category Documents
 */
export default class BaseCombatant extends Document {

  /* -------------------------------------------- */
  /*  Model Configuration                         */
  /* -------------------------------------------- */

  /** @inheritdoc */
  static metadata = Object.freeze(mergeObject(super.metadata, {
    name: "Combatant",
    collection: "combatants",
    label: "DOCUMENT.Combatant",
    labelPlural: "DOCUMENT.Combatants",
    isEmbedded: true,
    hasTypeData: true,
    permissions: {
      create: "OWNER",
      update: this.#canUpdate,
      delete: "OWNER"
    },
    schemaVersion: "13.341"
  }, {inplace: false}));

  /* -------------------------------------------- */

  /** @inheritdoc */
  static defineSchema() {
    const {BaseActor, BaseToken, BaseScene} = foundry.documents;
    return {
      _id: new fields.DocumentIdField(),
      type: new fields.DocumentTypeField(this, {initial: CONST.BASE_DOCUMENT_TYPE}),
      system: new fields.TypeDataField(this),
      actorId: new fields.ForeignDocumentField(BaseActor, {label: "COMBAT.CombatantActor", idOnly: true}),
      tokenId: new fields.ForeignDocumentField(BaseToken, {label: "COMBAT.CombatantToken", idOnly: true}),
      sceneId: new fields.ForeignDocumentField(BaseScene, {label: "COMBAT.CombatantScene", idOnly: true}),
      name: new fields.StringField({label: "COMBAT.CombatantName", textSearch: true}),
      img: new fields.FilePathField({categories: ["IMAGE"], label: "COMBAT.CombatantImage"}),
      initiative: new fields.NumberField({required: true, label: "COMBAT.CombatantInitiative"}),
      hidden: new fields.BooleanField({label: "COMBAT.CombatantHidden"}),
      defeated: new fields.BooleanField({label: "COMBAT.CombatantDefeated"}),
      group: new fields.DocumentIdField({readonly: false}),
      flags: new fields.DocumentFlagsField(),
      _stats: new fields.DocumentStatsField()
    };
  }

  /* -------------------------------------------- */

  /**
   * Is a user able to update an existing Combatant?
   * @type {DocumentPermissionTest}
   */
  static #canUpdate(user, doc, data) {
    if ( user.isGM ) return true; // GM users can do anything
    if ( !doc.testUserPermission(user, "OWNER") ) return false;

    // Players may only update a subset of fields
    const updateKeys = Object.keys(data);
    const allowedKeys = ["_id", "initiative", "flags", "defeated", "system"];
    return updateKeys.every(k => allowedKeys.includes(k));
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  getUserLevel(user) {
    if ( this.actor ) return this.actor.getUserLevel(user);
    return super.getUserLevel(user);
  }
}

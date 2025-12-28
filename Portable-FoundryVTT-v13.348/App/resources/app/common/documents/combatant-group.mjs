import Document from "../abstract/document.mjs";
import {mergeObject} from "../utils/helpers.mjs";
import * as fields from "../data/fields.mjs";
import * as CONST from "../constants.mjs";

/**
 * @import {CombatantGroupData} from "./_types.mjs";
 */

/**
 * A Document that represents a grouping of individual Combatants in a Combat.
 * Defines the DataSchema and common behaviors for a CombatantGroup which are shared between both client and server.
 * @extends {Document<CombatantGroupData>}
 * @mixes CombatantGroupData
 * @category Documents
 */
export default class BaseCombatantGroup extends Document {

  /* -------------------------------------------- */
  /*  Model Configuration                         */
  /* -------------------------------------------- */

  static metadata = Object.freeze(mergeObject(super.metadata, {
    name: "CombatantGroup",
    collection: "groups",
    label: "DOCUMENT.CombatantGroup",
    labelPlural: "DOCUMENT.CombatantGroups",
    isEmbedded: true,
    hasTypeData: true,
    schemaVersion: "13.341"
  }, { inplace: false }));

  /* -------------------------------------------- */

  /** @inheritDoc */
  static defineSchema() {
    return {
      _id: new fields.DocumentIdField(),
      type: new fields.DocumentTypeField(this, { initial: CONST.BASE_DOCUMENT_TYPE }),
      system: new fields.TypeDataField(this),
      name: new fields.StringField({ textSearch: true }),
      img: new fields.FilePathField({ categories: ["IMAGE"] }),
      initiative: new fields.NumberField({ required: true }),
      ownership: new fields.DocumentOwnershipField(),
      flags: new fields.DocumentFlagsField(),
      _stats: new fields.DocumentStatsField()
    };
  }
}

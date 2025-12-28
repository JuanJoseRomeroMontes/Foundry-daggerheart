import Document from "../abstract/document.mjs";
import {mergeObject} from "../utils/helpers.mjs";
import * as fields from "../data/fields.mjs";
import {LightData} from "../data/data.mjs";

/**
 * @import {AmbientLightData} from "./_types.mjs";
 */

/**
 * The AmbientLight Document.
 * Defines the DataSchema and common behaviors for an AmbientLight which are shared between both client and server.
 * @extends {Document<AmbientLightData>}
 * @mixes AmbientLightData
 * @category Documents
 */
export default class BaseAmbientLight extends Document {

  /* -------------------------------------------- */
  /*  Model Configuration                         */
  /* -------------------------------------------- */

  /** @inheritdoc */
  static metadata = Object.freeze(mergeObject(super.metadata, {
    name: "AmbientLight",
    collection: "lights",
    label: "DOCUMENT.AmbientLight",
    labelPlural: "DOCUMENT.AmbientLights",
    schemaVersion: "13.341"
  }, {inplace: false}));

  /** @inheritdoc */
  static defineSchema() {
    return {
      _id: new fields.DocumentIdField(),
      x: new fields.NumberField({required: true, integer: true, nullable: false, initial: 0}),
      y: new fields.NumberField({required: true, integer: true, nullable: false, initial: 0}),
      elevation: new fields.NumberField({required: true, nullable: false, initial: 0}),
      rotation: new fields.AngleField(),
      walls: new fields.BooleanField({initial: true}),
      vision: new fields.BooleanField(),
      config: new fields.EmbeddedDataField(LightData),
      hidden: new fields.BooleanField(),
      flags: new fields.DocumentFlagsField()
    };
  }

  /** @override */
  static LOCALIZATION_PREFIXES = ["DOCUMENT", "AMBIENT_LIGHT"];
}

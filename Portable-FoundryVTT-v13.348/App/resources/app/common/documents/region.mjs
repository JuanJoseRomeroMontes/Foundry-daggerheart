import Document from "../abstract/document.mjs";
import {mergeObject} from "../utils/helpers.mjs";
import * as fields from "../data/fields.mjs";
import {BaseShapeData} from "../data/data.mjs";
import Color from "../utils/color.mjs";

/**
 * @import {RegionData} from "./_types.mjs";
 */

/**
 * The Region Document.
 * Defines the DataSchema and common behaviors for a Region which are shared between both client and server.
 * @extends {Document<RegionData>}
 * @mixes RegionData
 * @category Documents
 */
export default class BaseRegion extends Document {

  /* -------------------------------------------- */
  /*  Model Configuration                         */
  /* -------------------------------------------- */

  /** @inheritdoc */
  static metadata = Object.freeze(mergeObject(super.metadata, {
    name: "Region",
    collection: "regions",
    label: "DOCUMENT.Region",
    labelPlural: "DOCUMENT.Regions",
    isEmbedded: true,
    embedded: {
      RegionBehavior: "behaviors"
    },
    schemaVersion: "13.341"
  }, {inplace: false}));

  /** @inheritdoc */
  static defineSchema() {
    const {BaseRegionBehavior} = foundry.documents;
    return {
      _id: new fields.DocumentIdField(),
      name: new fields.StringField({required: true, blank: false, textSearch: true}),
      color: new fields.ColorField({required: true, nullable: false,
        initial: () => Color.fromHSV([Math.random(), 0.8, 0.8]).css}),
      shapes: new fields.ArrayField(new fields.TypedSchemaField(BaseShapeData.TYPES)),
      elevation: new fields.SchemaField({
        bottom: new fields.NumberField({required: true}), // Treat null as -Infinity
        top: new fields.NumberField({required: true}) // Treat null as +Infinity
      }, {
        validate: d => (d.bottom ?? -Infinity) <= (d.top ?? Infinity),
        validationError: "elevation.top may not be less than elevation.bottom"
      }),
      behaviors: new fields.EmbeddedCollectionField(BaseRegionBehavior),
      visibility: new fields.NumberField({required: true,
        initial: CONST.REGION_VISIBILITY.LAYER,
        choices: Object.values(CONST.REGION_VISIBILITY)}),
      locked: new fields.BooleanField(),
      flags: new fields.DocumentFlagsField()
    };
  }

  /** @override */
  static LOCALIZATION_PREFIXES = ["DOCUMENT", "REGION"];
}

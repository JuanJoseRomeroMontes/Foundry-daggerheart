import DataModel from "../../../../common/abstract/data.mjs";

/**
 * @typedef TurnMarkerAnimationData
 * The turn marker animation data.
 * @property {string} id                              The ID of the animation.
 * @property {string} label                           The label for the animation.
 * @property {TurnMarkerAnimationConfigData} [config] The configuration of the animation.
 */

/**
 * @typedef TurnMarkerAnimationConfigData
 * The turn marker config data.
 * @property {number} [spin]                 The spin speed for the animation.
 * @property {Object} pulse                  The pulse settings.
 * @property {number} [pulse.speed]          The speed of the pulse.
 * @property {number} [pulse.min]            The minimum pulse value.
 * @property {number} [pulse.max]            The maximum pulse value.
 * @property {typeof AbstractBaseShader|null} [shader] A shader class to apply or null.
 */

/**
 * Turn marker configuration data model.
 * @extends {foundry.abstract.DataModel}
 * @mixes TurnMarkerAnimationData
 */
export default class TurnMarkerData extends DataModel {
  /** @inheritDoc */
  static defineSchema() {
    const fields = foundry.data.fields;

    // Return model schema
    return {
      id: new fields.StringField({blank: false, nullable: false}),
      label: new fields.StringField({blank: false, nullable: false}),
      config: new fields.SchemaField({
        shader: new fields.ShaderField(),
        spin: new fields.NumberField({required: true, nullable: false, initial: 0}),
        pulse: new fields.SchemaField({
          speed: new fields.NumberField({required: true, nullable: false, initial: 0}),
          min: new fields.NumberField({required: true, nullable: false, initial: 0.8}),
          max: new fields.NumberField({required: true, nullable: false, initial: 1})
        })
      })
    };
  }
}

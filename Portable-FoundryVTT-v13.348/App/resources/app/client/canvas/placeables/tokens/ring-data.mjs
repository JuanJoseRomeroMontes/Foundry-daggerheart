import TokenRing from "./ring.mjs";
import DataModel from "@common/abstract/data.mjs";
import {DataField} from "@common/data/fields.mjs";
import TokenRingSamplerShader from "../../rendering/shaders/samplers/primary/token-ring.mjs";
import PrimaryBaseSamplerShader from "../../rendering/shaders/samplers/primary/primary.mjs";

/**
 * A special subclass of DataField used to reference a class definition.
 */
class ClassReferenceField extends DataField {
  constructor(options) {
    super(options);
    this.#baseClass = options.baseClass;
  }

  /**
   * The base class linked to this data field.
   * @type {typeof Function}
   */
  #baseClass;

  /** @inheritdoc */
  static get _defaults() {
    const defaults = super._defaults;
    defaults.required = true;
    return defaults;
  }

  /** @override */
  _validateType(value) {
    if ( !foundry.utils.isSubclass(value, this.#baseClass) ) {
      throw new Error(`The value provided to a ClassReferenceField must be a ${this.#baseClass.name} subclass.`);
    }
  }

  /** @override */
  getInitialValue(data) {
    const isConstructed = this.initial?.prototype?.constructor === this.initial;
    if ( isConstructed ) return this.initial;
    return super.getInitialValue(data);
  }
}

/* -------------------------------------------- */

/**
 * Dynamic Ring configuration data model.
 * @extends {foundry.abstract.DataModel}
 * @property {string} id                        The id of this Token Ring configuration.
 * @property {string} label                     The label of this Token Ring configuration.
 * @property {string} spritesheet               The spritesheet path which provides token ring frames for various
 *                                              sized creatures.
 * @property {Record<string, string>} [effects] Registered special effects which can be applied to a token ring.
 * @property {Object} framework
 * @property {typeof TokenRing} [framework.ringClass=TokenRing] The manager class responsible for rendering token rings.
 * @property {typeof PrimaryBaseSamplerShader} [framework.shaderClass=TokenRingSamplerShader]  The shader class used to
 *                                              render the TokenRing.
 */
export default class DynamicRingData extends DataModel {
  /** @inheritDoc */
  static defineSchema() {
    const fields = foundry.data.fields;

    // Return model schema
    return {
      id: new fields.StringField({blank: true}),
      label: new fields.StringField({blank: false}),
      spritesheet: new fields.FilePathField({categories: ["TEXT"], required: true}),
      effects: new fields.ObjectField({initial: {
        RING_PULSE: "TOKEN.RING.EFFECTS.RING_PULSE",
        RING_GRADIENT: "TOKEN.RING.EFFECTS.RING_GRADIENT",
        BKG_WAVE: "TOKEN.RING.EFFECTS.BKG_WAVE",
        INVISIBILITY: "TOKEN.RING.EFFECTS.INVISIBILITY",
        COLOR_OVER_SUBJECT: "TOKEN.RING.EFFECTS.COLOR_OVER_SUBJECT"
      }}),
      framework: new fields.SchemaField({
        ringClass: new ClassReferenceField({initial: TokenRing, baseClass: TokenRing}),
        shaderClass: new ClassReferenceField({initial: TokenRingSamplerShader, baseClass: PrimaryBaseSamplerShader})
      })
    };
  }
}

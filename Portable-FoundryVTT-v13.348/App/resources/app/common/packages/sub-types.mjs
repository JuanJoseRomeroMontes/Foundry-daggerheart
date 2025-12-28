import {getType, mergeObject} from "../utils/helpers.mjs";
import {ObjectField} from "../data/fields.mjs";

/**
 * A special ObjectField available to packages which configures any additional Document subtypes
 * provided by the package.
 */
export default class AdditionalTypesField extends ObjectField {

  /** @inheritDoc */
  static get _defaults() {
    return mergeObject(super._defaults, {
      readonly: true,
      validationError: "is not a valid sub-types configuration"
    });
  }

  /* ----------------------------------------- */

  /** @inheritDoc */
  _validateType(value, options={}) {
    super._validateType(value, options);
    for ( const [documentName, subtypes] of Object.entries(value) ) {
      const cls = getDocumentClass(documentName);
      if ( !cls ) throw new Error(`${this.validationError}: '${documentName}' is not a valid Document type`);
      if ( !cls.hasTypeData ) {
        throw new Error(`${this.validationError}: ${documentName} Documents do not support sub-types`);
      }
      if ( getType(subtypes) !== "Object" ) throw new Error(`Malformed ${documentName} documentTypes declaration`);
      for ( const [type, config] of Object.entries(subtypes) ) this.#validateSubtype(cls, type, config);
    }
  }

  /* ----------------------------------------- */

  /**
   * Validate a single defined document subtype.
   * @param {typeof Document} documentClass       The document for which the subtype is being registered
   * @param {string} type                         The requested subtype name
   * @param {object} config                       The provided subtype configuration
   * @throws {Error}                              An error if the subtype is invalid or malformed
   */
  #validateSubtype(documentClass, type, config) {
    const dn = documentClass.documentName;
    if ( documentClass.metadata.coreTypes.includes(type) ) {
      throw new Error(`"${type}" is a reserved core type for the ${dn} document`);
    }
    if ( getType(config) !== "Object" ) {
      throw new Error(`Malformed "${type}" subtype declared for ${dn} documentTypes`);
    }
  }
}

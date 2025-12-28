import BasePackage from "./base-package.mjs";
import * as fields from "../data/fields.mjs";
import AdditionalTypesField from "./sub-types.mjs";

/**
 * @import {ModuleManifestData} from "./_types.mjs";
 */

/**
 * The data schema used to define Module manifest files.
 * Extends the basic PackageData schema with some additional module-specific fields.
 * @extends BasePackage<ModuleManifestData>
 */
export default class BaseModule extends BasePackage {

  /** @inheritDoc */
  static defineSchema() {
    const parentSchema = super.defineSchema();
    return Object.assign({}, parentSchema, {
      coreTranslation: new fields.BooleanField(),
      library: new fields.BooleanField(),
      documentTypes: new AdditionalTypesField()
    });
  }

  /** @override */
  static type = "module";

  /**
   * The default icon used for this type of Package.
   * @type {string}
   */
  static icon = "fa-plug";
}

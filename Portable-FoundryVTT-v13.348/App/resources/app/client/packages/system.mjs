import BaseSystem from "@common/packages/base-system.mjs";
import ClientPackageMixin from "@client/packages/client-package.mjs";

/**
 * @extends BaseSystem
 * @mixes {@link ClientPackageMixin}
 * @see {@link foundry.packages.types.SystemManifestData} For the system.json schema
 * @see {@link foundry.ClientPackage}
 * @category Packages
 */
export default class System extends ClientPackageMixin(BaseSystem) {
  constructor(data, options={}) {
    options.strictDataCleaning = data.strictDataCleaning;
    super(data, options);
  }

  /** @inheritDoc */
  _configure(options) {
    super._configure(options);
    this.strictDataCleaning = !!options.strictDataCleaning;
  }

  /**
   * @deprecated since v12
   * @ignore
   */
  get template() {
    foundry.utils.logCompatibilityWarning("System#template is deprecated in favor of System#documentTypes",
      {since: 12, until: 14});
    return game.model;
  }
}

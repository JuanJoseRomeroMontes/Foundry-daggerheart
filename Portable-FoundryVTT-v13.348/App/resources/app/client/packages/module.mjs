import BaseModule from "@common/packages/base-module.mjs";
import ClientPackageMixin from "@client/packages/client-package.mjs";

/**
 * @extends BaseModule
 * @mixes {@link ClientPackageMixin}
 * @see {@link foundry.packages.types.ModuleManifestData} For the module.json schema
 * @see {@link foundry.ClientPackage}
 * @category Packages
 */
export default class Module extends ClientPackageMixin(BaseModule) {
  constructor(data, options = {}) {
    const {active} = data;
    super(data, options);

    /**
     * Is this package currently active?
     * @type {boolean}
     */
    this.active = data.active;
    Object.defineProperty(this, "active", {value: active, writable: false, configurable: false});
  }
}

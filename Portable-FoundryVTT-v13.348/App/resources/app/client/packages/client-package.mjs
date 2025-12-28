/**
 * @import BasePackage from "@common/packages/base-package.mjs";
 * @import {Constructor} from "@common/_types.mjs";
 * @import {PackageCompatibilityBadge, PackageManifestData} from "./_types.mjs";
 */

/**
 * A client-side mixin used for all Package types.
 * @category Mixins
 * @param {Constructor<BasePackage>} Base    The parent BasePackage class being mixed
 */
export default function ClientPackageMixin(Base) {
  /**
   * The ClientDocument extends the BasePackage class by adding client-specific behaviors to all Package types.
   * @extends {BasePackage<PackageManifestData>}
   */
  class ClientPackage extends Base {

    /**
     * Is this package marked as a favorite?
     * This boolean is currently only populated as true in the /setup view of the software.
     * @type {boolean}
     */
    favorite = false;

    /**
     * Associate package availability with certain badge for client-side display.
     * @returns {PackageCompatibilityBadge|null}
     */
    getVersionBadge() {
      return this.constructor.getVersionBadge(this.availability, this);
    }

    /* -------------------------------------------- */

    /**
     * Retrieve a Package of this type from its collection.
     * @param {string} id           The package ID to retrieve
     * @returns {ClientPackage}     The retrieved package instance, or undefined
     */
    static get(id) {
      return game[this.collection].get(id);
    }

    /* -------------------------------------------- */

    /**
     * Determine a version badge for the provided compatibility data.
     * @param {number} availability                The availability level.
     * @param {Partial<PackageManifestData>} data  The compatibility data.
     * @param {object} [options]
     * @param {Collection<string, Module>} [options.modules]  A specific collection of modules to test availability
     *                                                        against. Tests against the currently installed modules by
     *                                                        default.
     * @param {Collection<string, System>} [options.systems]  A specific collection of systems to test availability
     *                                                        against. Tests against the currently installed systems by
     *                                                        default.
     * @returns {PackageCompatibilityBadge|null}
     */
    static getVersionBadge(availability, data, { modules, systems }={}) {
      modules ??= game.modules;
      systems ??= game.systems;
      const codes = CONST.PACKAGE_AVAILABILITY_CODES;
      const { compatibility, version, relationships } = data;
      switch ( availability ) {

        // Unsafe
        case codes.UNKNOWN:
        case codes.REQUIRES_CORE_DOWNGRADE:
        case codes.REQUIRES_CORE_UPGRADE_STABLE:
        case codes.REQUIRES_CORE_UPGRADE_UNSTABLE: {
          const labels = {
            [codes.UNKNOWN]: "SETUP.CompatibilityUnknown",
            [codes.REQUIRES_CORE_DOWNGRADE]: "SETUP.RequireCoreDowngrade",
            [codes.REQUIRES_CORE_UPGRADE_STABLE]: "SETUP.RequireCoreUpgrade",
            [codes.REQUIRES_CORE_UPGRADE_UNSTABLE]: "SETUP.RequireCoreUnstable"
          };
          return {
            type: "error",
            tooltip: game.i18n.localize(labels[availability]),
            label: version,
            icon: "fa-solid fa-file-slash"
          };
        }
        case codes.MISSING_SYSTEM:
          return {
            type: "error",
            tooltip: game.i18n.format("SETUP.RequireDep", { dependencies: foundry.utils.escapeHTML(data.system) }),
            label: version,
            icon: "fa-solid fa-file-slash"
          };

        case codes.MISSING_DEPENDENCY:
        case codes.REQUIRES_DEPENDENCY_UPDATE:
          return {
            type: "error",
            label: version,
            icon: "fa-solid fa-file-slash",
            tooltip: this._formatBadDependenciesTooltip(availability, data, relationships.requires, {
              modules, systems
            })
          };

        // Warning
        case codes.UNVERIFIED_GENERATION:
          return {
            type: "warning",
            tooltip: game.i18n.format("SETUP.CompatibilityRiskWithVersion", { version: compatibility.verified }),
            label: version,
            icon: "fa-solid fa-triangle-exclamation"
          };

        case codes.UNVERIFIED_SYSTEM:
          return {
            type: "warning",
            label: version,
            icon: "fa-solid fa-triangle-exclamation",
            tooltip: this._formatIncompatibleSystemsTooltip(data, relationships.systems, { systems })
          };

        // Neutral
        case codes.UNVERIFIED_BUILD:
          return {
            type: "neutral",
            tooltip: game.i18n.format("SETUP.CompatibilityRiskWithVersion", { version: compatibility.verified }),
            label: version,
            icon: "fa-solid fa-code-branch"
          };

        // Safe
        case codes.VERIFIED:
          return {
            type: "success",
            tooltip: game.i18n.localize("SETUP.Verified"),
            label: version,
            icon: "fa-solid fa-code-branch"
          };
      }
      return null;
    }

    /* -------------------------------------------- */

    /**
     * List missing dependencies and format them for display.
     * @param {number} availability                The availability value.
     * @param {Partial<PackageManifestData>} data  The compatibility data.
     * @param {Iterable<RelatedPackage>} deps      The dependencies to format.
     * @param {object} [options]
     * @param {Collection<string, Module>} [options.modules]  A specific collection of modules to test availability
     *                                                        against. Tests against the currently installed modules by
     *                                                        default.
     * @param {Collection<string, System>} [options.systems]  A specific collection of systems to test availability
     *                                                        against. Tests against the currently installed systems by
     *                                                        default.
     * @returns {string}
     * @protected
     */
    static _formatBadDependenciesTooltip(availability, data, deps, { modules, systems }={}) {
      modules ??= game.modules;
      systems ??= game.systems;
      const codes = CONST.PACKAGE_AVAILABILITY_CODES;
      const checked = new Set();
      const bad = [];
      for ( const dep of deps ) {
        if ( (dep.type !== "module") || checked.has(dep.id) ) continue;
        if ( !modules.has(dep.id) ) bad.push(dep.id);
        else if ( availability === codes.REQUIRES_DEPENDENCY_UPDATE ) {
          const module = modules.get(dep.id);
          if ( module.availability !== codes.VERIFIED ) bad.push(dep.id);
        }
        checked.add(dep.id);
      }
      const label = availability === codes.MISSING_DEPENDENCY ? "SETUP.RequireDep" : "SETUP.IncompatibleDep";
      const formatter = game.i18n.getListFormatter({ style: "short", type: "unit" });
      return game.i18n.format(label, { dependencies: formatter.format(bad) });
    }

    /* -------------------------------------------- */

    /**
     * List any installed systems that are incompatible with this module's systems relationship, and format them for
     * display.
     * @param {Partial<PackageManifestData>} data             The compatibility data.
     * @param {Iterable<RelatedPackage>} relationships        The system relationships.
     * @param {object} [options]
     * @param {Collection<string, System>} [options.systems]  A specific collection of systems to test against. Tests
     *                                                        against the currently installed systems by default.
     * @returns {string}
     * @protected
     */
    static _formatIncompatibleSystemsTooltip(data, relationships, { systems }={}) {
      systems ??= game.systems;
      const incompatible = [];
      for ( const { id, compatibility } of relationships ) {
        const system = systems.get(id);
        if ( !system ) continue;
        if ( !this.testDependencyCompatibility(compatibility, system) || system.unavailable ) incompatible.push(id);
      }
      const label = incompatible.length ? "SETUP.IncompatibleSystems" : "SETUP.NoSupportedSystem";
      const formatter = game.i18n.getListFormatter({ style: "short", type: "unit" });
      return game.i18n.format(label, { systems: formatter.format(incompatible) });
    }

    /* ----------------------------------------- */

    /**
     * When a package has been installed, add it to the local game data.
     */
    install() {
      const collection = this.constructor.collection;
      game.data[collection].push(this.toObject());
      game[collection].set(this.id, this);
    }

    /* ----------------------------------------- */

    /**
     * When a package has been uninstalled, remove it from the local game data.
     */
    uninstall() {
      this.constructor.uninstall(this.id);
    }

    /* -------------------------------------------- */

    /**
     * Remove a package from the local game data when it has been uninstalled.
     * @param {string} id  The package ID.
     */
    static uninstall(id) {
      game.data[this.collection].findSplice(p => p.id === id);
      game[this.collection].delete(id);
    }

    /* -------------------------------------------- */

    /**
     * Retrieve the latest Package manifest from a provided remote location.
     * @param {string} manifest                 A remote manifest URL to load
     * @param {object} options                  Additional options which affect package construction
     * @param {boolean} [options.strict=true]   Whether to construct the remote package strictly
     * @returns {Promise<ClientPackage|null>}   A Promise which resolves to a constructed ServerPackage instance
     * @throws {Error}                          An error if the retrieved manifest data is invalid
     */
    static async fromRemoteManifest(manifest, {strict=false}={}) {
      try {
        const data = await game.post({action: "getPackageFromRemoteManifest", type: this.type, manifest});
        return new this(data, {installed: false, strict: strict});
      }
      catch(e) {
        if ( strict ) throw e;
        return null;
      }
    }
  }
  return ClientPackage;
}

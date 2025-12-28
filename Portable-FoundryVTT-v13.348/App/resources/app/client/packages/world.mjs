import BaseWorld from "@common/packages/base-world.mjs";
import ClientPackageMixin from "@client/packages/client-package.mjs";

/**
 * @extends BaseWorld
 * @mixes {@link ClientPackageMixin}
 * @see {@link foundry.packages.types.WorldManifestData} For the world.json schema
 * @see {@link foundry.ClientPackage}
 * @category Packages
 */
export default class World extends ClientPackageMixin(BaseWorld) {

  /** @inheritDoc */
  static getVersionBadge(availability, data, { modules, systems }={}) {
    modules ??= game.modules;
    systems ??= game.systems;
    const badge = super.getVersionBadge(availability, data, { modules, systems });
    if ( !badge ) return badge;
    const codes = CONST.PACKAGE_AVAILABILITY_CODES;
    if ( availability === codes.VERIFIED ) {
      const system = systems.get(data.system);
      if ( system.availability !== codes.VERIFIED ) badge.type = "neutral";
    }
    if ( !data.manifest ) badge.label = "";
    return badge;
  }

  /* -------------------------------------------- */

  /**
   * Provide data for a system badge displayed for the world which reflects the system ID and its availability
   * @param {System} [system]  A specific system to use, otherwise use the installed system.
   * @returns {PackageCompatibilityBadge|null}
   */
  getSystemBadge(system) {
    system ??= game.systems.get(this.system);
    if ( !system ) return {
      type: "error",
      tooltip: game.i18n.format("SETUP.RequireSystem", { system: this.system }),
      label: this.system,
      icon: "fa-solid fa-file-slash"
    };
    const badge = system.getVersionBadge();
    if ( badge.type === "safe" ) {
      badge.type = "neutral";
      badge.icon = null;
    }
    badge.tooltip = `<p>${foundry.utils.escapeHTML(system.title)}</p><p>${badge.tooltip}</p>`;
    badge.label = system.id;
    return badge;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  static _formatBadDependenciesTooltip(availability, data, deps) {
    const system = game.systems.get(data.system);
    if ( system ) deps ??= [...data.relationships.requires.values(), ...system.relationships.requires.values()];
    return super._formatBadDependenciesTooltip(availability, data, deps);
  }
}

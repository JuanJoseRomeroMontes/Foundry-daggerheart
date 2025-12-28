import BasePackage from "./base-package.mjs";
import * as fields from "../data/fields.mjs";
import {FILE_CATEGORIES} from "../constants.mjs";
import {hasFileExtension} from "../data/validators.mjs";

/**
 * @import {WorldManifestData} from "./_types.mjs";
 */

/**
 * The data schema used to define World manifest files.
 * Extends the basic PackageData schema with some additional world-specific fields.
 * @extends BasePackage<WorldManifestData>
 */
export default class BaseWorld extends BasePackage {

  /** @inheritDoc */
  static defineSchema() {
    return Object.assign({}, super.defineSchema(), {
      system: new fields.StringField({required: true, blank: false}),
      background: new fields.FilePathField({categories: ["IMAGE"], required: false}),
      description: new fields.HTMLField({required: true}),
      joinTheme: new fields.StringField({
        required: false, initial: undefined, nullable: false, choices: Object.keys(CONST.WORLD_JOIN_THEMES)
      }),
      coreVersion: new fields.StringField({required: true, blank: false, validate: BasePackage.validateVersion}),
      systemVersion: new fields.StringField({required: true, blank: false, initial: "0", validate: BasePackage.validateVersion}),
      lastPlayed: new fields.StringField(),
      playtime: new fields.NumberField({integer: true, min: 0, initial: 0}),
      nextSession: new fields.StringField({blank: false, nullable: true, initial: null}),
      resetKeys: new fields.BooleanField({required: false, initial: undefined}),
      safeMode: new fields.BooleanField({required: false, initial: undefined}),
      version: new fields.StringField({required: true, blank: false, nullable: true, initial: null,
        validate: BasePackage.validateVersion}),
      demo: new fields.SchemaField({
        sourceZip: new fields.StringField({ required: true, blank: false, nullable: true, initial: null })
      })
    });
  }

  /** @override */
  static LOCALIZATION_PREFIXES = ["PACKAGE", "WORLD"];

  /** @override */
  static type = "world";

  /**
   * The default icon used for this type of Package.
   * @type {string}
   */
  static icon = "fa-globe-asia";

  /** @inheritDoc */
  static migrateData(data) {
    super.migrateData(data);

    // Legacy compatibility strings
    data.compatibility = data.compatibility || {};
    if ( data.compatibility.maximum === "1.0.0" ) data.compatibility.maximum = undefined;
    if ( data.coreVersion && !data.compatibility.verified ) {
      data.compatibility.minimum = data.compatibility.verified = data.coreVersion;
    }

    // Clear the background field if it is not a valid image file path
    if ( (typeof data.background === "string") && !hasFileExtension(data.background, Object.keys(FILE_CATEGORIES.IMAGE)) ) {
      data.background = null;
    }

    return data;
  }

  /* -------------------------------------------- */

  /**
   * Check the given compatibility data against the current installation state and determine its availability.
   * @param {Partial<WorldManifestData>} data  The compatibility data to test.
   * @param {object} [options]
   * @param {ReleaseData} [options.release]      A specific software release for which to test availability.
   *                                             Tests against the current release by default.
   * @param {Collection<string, Module>} [options.modules]  A specific collection of modules to test availability
   *                                                        against. Tests against the currently installed modules by
   *                                                        default.
   * @param {Collection<string, System>} [options.systems]  A specific collection of systems to test availability
   *                                                        against. Tests against the currently installed systems by
   *                                                        default.
   * @param {number} [options.systemAvailabilityThreshold]  Ignore the world's own core software compatibility and
   *                                                        instead defer entirely to the system's core software
   *                                                        compatibility, if the world's availability is less than
   *                                                        this.
   * @returns {number}
   */
  static testAvailability(data, { release, modules, systems, systemAvailabilityThreshold }={}) {
    systems ??= globalThis.packages?.System ?? game.systems;
    modules ??= globalThis.packages?.Module ?? game.modules;
    const { relationships } = data;
    const codes = CONST.PACKAGE_AVAILABILITY_CODES;
    systemAvailabilityThreshold ??= codes.UNKNOWN;

    // If the World itself is incompatible for some reason, report that directly.
    const wa = super.testAvailability(data, { release });
    if ( this.isIncompatibleWithCoreVersion(wa) ) return wa;

    // If the System is missing or incompatible, report that directly.
    const system = data.system instanceof foundry.packages.BaseSystem ? data.system : systems.get(data.system);
    if ( !system ) return codes.MISSING_SYSTEM;
    const sa = system.availability;
    // FIXME: Why do we only check if the system is incompatible with the core version or UNKNOWN?
    // Proposal: If the system is anything but VERIFIED, UNVERIFIED_BUILD, or UNVERIFIED_GENERATION, we should return
    // the system availability.
    if ( system.incompatibleWithCoreVersion || (sa === codes.UNKNOWN) ) return sa;

    // Test the availability of all required modules.
    const checkedModules = new Set();
    // TODO: We do not need to check system requirements here if the above proposal is implemented.
    const requirements = [...relationships.requires.values(), ...system.relationships.requires.values()];
    for ( const r of requirements ) {
      if ( (r.type !== "module") || checkedModules.has(r.id) ) continue;
      const module = modules.get(r.id);
      if ( !module ) return codes.MISSING_DEPENDENCY;
      // FIXME: Why do we only check if the module is incompatible with the core version?
      // Proposal: We should check the actual compatibility information for the relationship to ensure that the module
      // satisfies it.
      if ( module.incompatibleWithCoreVersion ) return codes.REQUIRES_DEPENDENCY_UPDATE;
      checkedModules.add(r.id);
    }

    // Inherit from the System availability in certain cases.
    if ( wa <= systemAvailabilityThreshold ) return sa;
    return wa;
  }
}

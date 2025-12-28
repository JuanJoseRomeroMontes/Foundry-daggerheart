import DataModel from "../abstract/data.mjs";
import * as fields from "../data/fields.mjs";
import {
  COMPENDIUM_DOCUMENT_TYPES, DOCUMENT_OWNERSHIP_LEVELS,
  PACKAGE_AVAILABILITY_CODES,
  PACKAGE_TYPES,
  SYSTEM_SPECIFIC_COMPENDIUM_TYPES,
  USER_ROLES
} from "../constants.mjs";
import {isNewerVersion, logCompatibilityWarning, mergeObject} from "../utils/_module.mjs";
import BaseFolder from "../documents/folder.mjs";
import {ObjectField} from "../data/fields.mjs";
import {DataModelValidationFailure} from "../data/validation-failure.mjs";

/**
 * @import {PackageCompendiumData, PackageCompatibilityData, PackageManifestData,
 *   RelatedPackageData, PackageRelationshipsData} from "./_types.mjs";
 * @import Collection from "../utils/collection.mjs";
 * @import {Module, System} from "../../client/packages/_module.mjs";
 */

/**
 * A custom SchemaField for defining package compatibility versions.
 * @mixes PackageCompatibilityData
 */
export class PackageCompatibility extends fields.SchemaField {
  constructor(options) {
    super({
      minimum: new fields.StringField({required: false, blank: false, initial: undefined,
        validate: BasePackage.validateVersion}),
      verified: new fields.StringField({required: false, blank: false, initial: undefined,
        validate: BasePackage.validateVersion}),
      maximum: new fields.StringField({required: false, blank: false, initial: undefined,
        validate: BasePackage.validateVersion})
    }, options);
  }
}

/* -------------------------------------------- */

/**
 * A custom SchemaField for defining package relationships.
 * @mixes PackageRelationshipsData
 */
export class PackageRelationships extends fields.SchemaField {
  /** @inheritdoc */
  constructor(options) {
    super({
      systems: new PackageRelationshipField(new RelatedPackage({packageType: "system"})),
      requires: new PackageRelationshipField(new RelatedPackage()),
      recommends: new PackageRelationshipField(new RelatedPackage()),
      conflicts: new PackageRelationshipField(new RelatedPackage()),
      flags: new fields.ObjectField()
    }, options);
  }
}

/* -------------------------------------------- */

/**
 * A SetField with custom casting behavior.
 */
class PackageRelationshipField extends fields.SetField {
  /** @override */
  _cast(value) {
    return value instanceof Array ? value : [value];
  }
}

/* -------------------------------------------- */

/**
 * A custom SchemaField for defining a related Package.
 * It may be required to be a specific type of package, by passing the packageType option to the constructor.
 * @mixes RelatedPackageData
 */
export class RelatedPackage extends fields.SchemaField {
  constructor({packageType, ...options}={}) {
    let typeOptions = {choices: PACKAGE_TYPES, initial: "module"};
    if ( packageType ) typeOptions = {choices: [packageType], initial: packageType};
    super({
      id: new fields.StringField({required: true, blank: false, validate: BasePackage.validateId}),
      type: new fields.StringField(typeOptions),
      manifest: new fields.StringField({required: false, blank: false, initial: undefined}),
      compatibility: new PackageCompatibility(),
      reason: new fields.StringField({required: false, blank: false, initial: undefined})
    }, options);
  }
}

/* -------------------------------------------- */

/**
 * A custom SchemaField for defining the folder structure of the included compendium packs.
 */
export class PackageCompendiumFolder extends fields.SchemaField {
  constructor({depth=1, ...options}={}) {
    const schema = {
      name: new fields.StringField({required: true, blank: false}),
      sorting: new fields.StringField({required: false, blank: false, initial: undefined,
        choices: BaseFolder.SORTING_MODES}),
      color: new fields.ColorField(),
      packs: new fields.SetField(new fields.StringField({required: true, blank: false}))
    };
    if ( depth < 4 ) schema.folders = new fields.SetField(new PackageCompendiumFolder(
      {depth: depth+1, options}));
    super(schema, options);
  }
}

/* -------------------------------------------- */

/**
 * A special ObjectField which captures a mapping of USER_ROLES to DOCUMENT_OWNERSHIP_LEVELS.
 */
export class CompendiumOwnershipField extends ObjectField {

  /** @inheritdoc */
  static get _defaults() {
    return mergeObject(super._defaults, {
      initial: {PLAYER: "OBSERVER", ASSISTANT: "OWNER"},
      validationError: "is not a mapping of USER_ROLES to DOCUMENT_OWNERSHIP_LEVELS"
    });
  }

  /** @override */
  _validateType(value, options) {
    for ( const [k, v] of Object.entries(value) ) {
      if ( !(k in USER_ROLES) ) throw new Error(`Compendium ownership key "${k}" is not a valid choice in USER_ROLES`);
      if ( !(v in DOCUMENT_OWNERSHIP_LEVELS) ) throw new Error(`Compendium ownership value "${v}" is not a valid
      choice in DOCUMENT_OWNERSHIP_LEVELS`);
    }
  }
}

/* -------------------------------------------- */

/**
 * A special SetField which provides additional validation and initialization behavior specific to compendium packs.
 */
export class PackageCompendiumPacks extends fields.SetField {

  /** @override */
  _cleanType(value, options) {
    return value.map(v => {
      v = this.element.clean(v, options);
      if ( v.path ) v.path = v.path.replace(/\.db$/, ""); // Strip old NEDB extensions
      else v.path = `packs/${v.name}`; // Auto-populate a default pack path
      return v;
    });
  }

  /* ---------------------------------------- */

  /** @override */
  initialize(value, model, options={}) {
    const packs = new Set();
    const packageName = model._source.id;
    for ( const v of value ) {
      try {
        const pack = this.element.initialize(v, model, options);
        pack.packageType = model.constructor.type;
        pack.packageName = packageName;
        pack.id = `${model.constructor.type === "world" ? "world" : packageName}.${pack.name}`;
        packs.add(pack);
      } catch(err) {
        logger.warn(err.message);
      }
    }
    return packs;
  }

  /* ---------------------------------------- */

  /** @inheritDoc */
  _validateElements(value, options) {
    // Extend the logic for validating the complete set of packs to ensure uniqueness.
    const packNames = new Set();
    const duplicateNames = new Set();
    const packPaths = new Set();
    const duplicatePaths = new Set();
    for ( const pack of value ) {
      if ( packNames.has(pack.name) ) duplicateNames.add(pack.name);
      packNames.add(pack.name);
      if ( pack.path ) {
        if ( packPaths.has(pack.path) ) duplicatePaths.add(pack.path);
        packPaths.add(pack.path);
      }
    }
    return super._validateElements(value, {...options, duplicateNames, duplicatePaths});
  }

  /* ---------------------------------------- */

  /** @inheritDoc */
  _validateElement(value, {duplicateNames, duplicatePaths, ...options}={}) {
    // Validate each individual compendium pack, ensuring its name and path are unique.
    if ( duplicateNames.has(value.name) ) {
      return new DataModelValidationFailure({
        invalidValue: value.name,
        message: `Duplicate Compendium name "${value.name}" already declared by some other pack`,
        unresolved: true
      });
    }
    if ( duplicatePaths.has(value.path) ) {
      return new DataModelValidationFailure({
        invalidValue: value.path,
        message: `Duplicate Compendium path "${value.path}" already declared by some other pack`,
        unresolved: true
      });
    }
    return this.element.validate(value, options);
  }
}

/* -------------------------------------------- */

/**
 * The data schema used to define a Package manifest.
 * Specific types of packages extend this schema with additional fields.
 * @template {PackageManifestData} PackageSchema The source data from the package manifest
 * @extends DataModel<PackageSchema>
 */
export default class BasePackage extends DataModel {
  /**
   * @param {PackageManifestData} data  Source data for the package
   * @param {object} [options={}]       Options which affect DataModel construction
   */
  constructor(data, options={}) {
    const {availability, locked, exclusive, owned, tags, hasStorage} = data;
    super(data, options);

    /**
     * An availability code in PACKAGE_AVAILABILITY_CODES which defines whether this package can be used.
     * @type {number}
     */
    this.availability = availability ?? this.constructor.testAvailability(this);

    /**
     * A flag which tracks whether this package is currently locked.
     * @type {boolean}
     */
    this.locked = locked ?? false;

    /**
     * A flag which tracks whether this package is a free Exclusive pack
     * @type {boolean}
     */
    this.exclusive = exclusive ?? false;

    /**
     * A flag which tracks whether this package is owned, if it is protected.
     * @type {boolean|null}
     */
    this.owned = owned ?? false;

    /**
     * A set of Tags that indicate what kind of Package this is, provided by the Website
     * @type {string[]}
     */
    this.tags = tags ?? [];

    /**
     * A flag which tracks if this package has files stored in the persistent storage folder
     * @type {boolean}
     */
    this.hasStorage = hasStorage ?? false;
  }

  /**
   * Define the package type in CONST.PACKAGE_TYPES that this class represents.
   * Each BasePackage subclass must define this attribute.
   * @abstract
   * @type {string}
   */
  static type = "package";

  /**
   * The type of this package instance. A value in CONST.PACKAGE_TYPES.
   * @type {string}
   */
  get type() {
    return this.constructor.type;
  }

  /**
   * A flag which defines whether this package is unavailable to be used.
   * @type {boolean}
   */
  get unavailable() {
    return this.availability > PACKAGE_AVAILABILITY_CODES.UNVERIFIED_GENERATION;
  }

  /**
   * Is this Package incompatible with the currently installed core Foundry VTT software version?
   * @type {boolean}
   */
  get incompatibleWithCoreVersion() {
    return this.constructor.isIncompatibleWithCoreVersion(this.availability);
  }

  /**
   * Test if a given availability is incompatible with the core version.
   * @param {number} availability  The availability value to test.
   * @returns {boolean}
   */
  static isIncompatibleWithCoreVersion(availability) {
    const codes = CONST.PACKAGE_AVAILABILITY_CODES;
    return (availability >= codes.REQUIRES_CORE_DOWNGRADE) && (availability <= codes.REQUIRES_CORE_UPGRADE_UNSTABLE);
  }

  /**
   * The named collection to which this package type belongs
   * @type {string}
   */
  static get collection() {
    return `${this.type}s`;
  }

  /** @inheritDoc */
  static defineSchema() {
    const optionalString = {required: false, blank: false, initial: undefined};
    return {

      // Package metadata
      id: new fields.StringField({required: true, blank: false, validate: this.validateId}),
      title: new fields.StringField({required: true, blank: false}),
      description: new fields.HTMLField({required: true}),
      authors: new fields.SetField(new fields.SchemaField({
        name: new fields.StringField({required: true, blank: false}),
        email: new fields.StringField(optionalString),
        url: new fields.StringField(optionalString),
        discord: new fields.StringField(optionalString),
        flags: new fields.ObjectField()
      })),
      url: new fields.StringField(optionalString),
      license: new fields.StringField(optionalString),
      readme: new fields.StringField(optionalString),
      bugs: new fields.StringField(optionalString),
      changelog: new fields.StringField(optionalString),
      flags: new fields.ObjectField(),
      media: new fields.SetField(new fields.SchemaField({
        type: new fields.StringField(optionalString),
        url: new fields.StringField(optionalString),
        caption: new fields.StringField(optionalString),
        loop: new fields.BooleanField({required: false, blank: false, initial: false}),
        thumbnail: new fields.StringField(optionalString),
        flags: new fields.ObjectField()
      })),

      // Package versioning
      version: new fields.StringField({required: true, blank: false, initial: "0", validate: BasePackage.validateVersion}),
      compatibility: new PackageCompatibility(),

      // Included content
      scripts: new fields.SetField(new fields.StringField({required: true, blank: false})),
      esmodules: new fields.SetField(new fields.StringField({required: true, blank: false})),
      styles: new fields.ArrayField(new fields.SchemaField({
        layer: new fields.StringField({required: false, nullable: true, blank: false, initial: undefined}),
        src: new fields.StringField({required: true, blank: false})
      })),
      languages: new fields.SetField(new fields.SchemaField({
        lang: new fields.StringField({required: true, blank: false, validate: Intl.getCanonicalLocales,
          validationError: "must be supported by the Intl.getCanonicalLocales function"
        }),
        name: new fields.StringField({required: false}),
        path: new fields.StringField({required: true, blank: false}),
        system: new fields.StringField(optionalString),
        module: new fields.StringField(optionalString),
        flags: new fields.ObjectField()
      })),
      packs: new PackageCompendiumPacks(new fields.SchemaField({
        name: new fields.StringField({required: true, blank: false, validate: this.validateId}),
        label: new fields.StringField({required: true, blank: false}),
        banner: new fields.StringField({...optionalString, nullable: true}),
        path: new fields.StringField({required: false}),
        type: new fields.StringField({required: true, blank: false, choices: COMPENDIUM_DOCUMENT_TYPES,
          validationError: "must be a value in CONST.COMPENDIUM_DOCUMENT_TYPES"}),
        system: new fields.StringField(optionalString),
        ownership: new CompendiumOwnershipField(),
        flags: new fields.ObjectField()
      }, {validate: BasePackage.#validatePack})),
      packFolders: new fields.SetField(new PackageCompendiumFolder()),

      // Package relationships
      relationships: new PackageRelationships(),
      socket: new fields.BooleanField(),

      // Package downloading
      manifest: new fields.StringField(),
      download: new fields.StringField({required: false, blank: false, initial: undefined}),
      protected: new fields.BooleanField(),
      exclusive: new fields.BooleanField(),
      persistentStorage: new fields.BooleanField()
    };
  }

  /** @override */
  static LOCALIZATION_PREFIXES = ["PACKAGE"];

  /* -------------------------------------------- */

  /**
   * Check the given compatibility data against the current installation state and determine its availability.
   * @param {Partial<PackageManifestData>} data  The compatibility data to test.
   * @param {object} [options]
   * @param {ReleaseData} [options.release]      A specific software release for which to test availability.
   *                                             Tests against the current release by default.
   * @returns {number}
   */
  static testAvailability({ compatibility }, { release }={}) {
    release ??= globalThis.release ?? game.release;
    const codes = CONST.PACKAGE_AVAILABILITY_CODES;
    const {minimum, maximum, verified} = compatibility;
    const isGeneration = version => Number.isInteger(Number(version));

    // Require a certain minimum core version.
    if ( minimum && isNewerVersion(minimum, release.version) ) {
      const generation = Number(minimum.split(".").shift());
      const isStable = generation <= release.maxStableGeneration;
      return isStable ? codes.REQUIRES_CORE_UPGRADE_STABLE : codes.REQUIRES_CORE_UPGRADE_UNSTABLE;
    }

    // Require a certain maximum core version.
    if ( maximum ) {
      const compatible = isGeneration(maximum)
        ? release.generation <= Number(maximum)
        : !isNewerVersion(release.version, maximum);
      if ( !compatible ) return codes.REQUIRES_CORE_DOWNGRADE;
    }

    // Require a certain compatible core version.
    if ( verified ) {
      const compatible = isGeneration(verified)
        ? Number(verified) >= release.generation
        : !isNewerVersion(release.version, verified);
      const sameGeneration = release.generation === Number(verified.split(".").shift());
      if ( compatible ) return codes.VERIFIED;
      return sameGeneration ? codes.UNVERIFIED_BUILD : codes.UNVERIFIED_GENERATION;
    }

    // FIXME: Why do we not check if all of this package's dependencies are satisfied?
    // Proposal: Check all relationships.requires and set MISSING_DEPENDENCY if any dependencies are not VERIFIED,
    // UNVERIFIED_BUILD, or UNVERIFIED_GENERATION, or if they do not satisfy the given compatibility range for the
    // relationship.

    // No compatible version is specified.
    return codes.UNKNOWN;
  }

  /* -------------------------------------------- */

  /**
   * Test that the dependencies of a package are satisfied as compatible.
   * This method assumes that all packages in modulesCollection have already had their own availability tested.
   * @param {Collection<string,Module>} modulesCollection   A collection which defines the set of available modules
   * @returns {Promise<boolean>}                            Are all required dependencies satisfied?
   * @internal
   */
  async _testRequiredDependencies(modulesCollection) {
    const requirements = this.relationships.requires;
    for ( const {id, type, manifest, compatibility} of requirements ) {
      if ( type !== "module" ) continue; // Only test modules
      let pkg;

      // If the requirement specifies an explicit remote manifest URL, we need to load it
      if ( manifest ) {
        try {
          pkg = await this.constructor.fromRemoteManifest(manifest, {strict: true});
        } catch(err) {
          return false;
        }
      }

      // Otherwise the dependency must belong to the known modulesCollection
      else pkg = modulesCollection.get(id);
      if ( !pkg ) return false;

      // Ensure that the package matches the required compatibility range
      if ( !this.constructor.testDependencyCompatibility(compatibility, pkg) ) return false;

      // Test compatibility of the dependency
      if ( pkg.unavailable ) return false;
    }
    return true;
  }

  /* -------------------------------------------- */

  /**
   * Test compatibility of a package's supported systems.
   * @param {Collection<string, System>} systemCollection  A collection which defines the set of available systems.
   * @returns {Promise<boolean>}                           True if all supported systems which are currently installed
   *                                                       are compatible or if the package has no supported systems.
   *                                                       Returns false otherwise, or if no supported systems are
   *                                                       installed.
   * @internal
   */
  async _testSupportedSystems(systemCollection) {
    const systems = this.relationships.systems;
    if ( !systems?.size ) return true;
    let supportedSystem = false;
    for ( const { id, compatibility } of systems ) {
      const pkg = systemCollection.get(id);
      if ( !pkg ) continue;
      if ( !this.constructor.testDependencyCompatibility(compatibility, pkg) || pkg.unavailable ) return false;
      supportedSystem = true;
    }
    return supportedSystem;
  }

  /* -------------------------------------------- */

  /**
   * Determine if a dependency is within the given compatibility range.
   * @param {PackageCompatibility} compatibility      The compatibility range declared for the dependency, if any
   * @param {BasePackage} dependency                  The known dependency package
   * @returns {boolean}                               Is the dependency compatible with the required range?
   */
  static testDependencyCompatibility(compatibility, dependency) {
    if ( !compatibility ) return true;
    const {minimum, maximum} = compatibility;
    if ( minimum && isNewerVersion(minimum, dependency.version) ) return false;
    if ( maximum && isNewerVersion(dependency.version, maximum) ) return false;
    return true;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  static cleanData(source={}, { installed, ...options }={}) {

    // Auto-assign language name
    for ( const l of source.languages || [] ) l.name = l.name ?? l.lang;

    // Identify whether this package depends on a single game system
    let systemId = undefined;
    if ( this.type === "system" ) systemId = source.id;
    else if ( this.type === "world" ) systemId = source.system;
    else if ( source.relationships?.systems?.length === 1 ) systemId = source.relationships.systems[0].id;

    // Auto-configure some package data
    for ( const pack of source.packs || [] ) {
      if ( !pack.system && systemId ) pack.system = systemId; // System dependency
      if ( typeof pack.ownership === "string" ) pack.ownership = {PLAYER: pack.ownership};
    }
    return super.cleanData(source, options);
  }

  /* -------------------------------------------- */

  /**
   * Validate that a Package ID is allowed.
   * @param {string} id     The candidate ID
   * @throws                An error if the candidate ID is invalid
   */
  static validateId(id) {
    const allowed = /^[A-Za-z0-9-_]+$/;
    if ( !allowed.test(id) ) {
      throw new Error("Package and compendium pack IDs may only be alphanumeric with hyphens or underscores.");
    }
    const prohibited = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;
    if ( prohibited.test(id) ) throw new Error(`The ID "${id}" uses an operating system prohibited value.`);
  }

  /* -------------------------------------------- */

  /**
   * Validate that a version is allowed.
   * @param {string} version     The candidate version
   * @throws                     An error if the version is invalid
   */
  static validateVersion(version) {
    if ( /['"<>&]/.test(version) ) throw new Error("contains an illegal character: ' \" < > &");
  }

  /* -------------------------------------------- */

  /**
   * Validate a single compendium pack object
   * @param {PackageCompendiumData} packData  Candidate compendium packs data
   * @throws                                  An error if the data is invalid
   */
  static #validatePack(packData) {
    if ( SYSTEM_SPECIFIC_COMPENDIUM_TYPES.includes(packData.type) && !packData.system ) {
      throw new Error(`The Compendium pack "${packData.name}" of the "${packData.type}" type must declare the "system"`
      + " upon which it depends.");
    }
  }

  /* -------------------------------------------- */

  /**
   * A wrapper around the default compatibility warning logger which handles some package-specific interactions.
   * @param {string} packageId            The package ID being logged
   * @param {string} message              The warning or error being logged
   * @param {object} options              Logging options passed to foundry.utils.logCompatibilityWarning
   * @param {object} [options.installed]  Is the package installed?
   * @internal
   */
  static _logWarning(packageId, message, { installed, ...options }={}) {
    logCompatibilityWarning(message, options);
    if ( installed ) globalThis.packages?.warnings?.add(packageId, {type: this.type, level: "warning", message});
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  static migrateData(data, {installed}={}) {
    this._migratePackIDs(data, {since: 12, until: 14, stack: false, installed});
    this._migrateStyles(data);
    return super.migrateData(data);
  }

  /* -------------------------------------------- */

  /**
   * Migrate to v13-schema styles array from string array
   * @param {PackageManifestData} data
   * @internal
   */
  static _migrateStyles(data) {
    if ( !Array.isArray(data.styles) ) return;
    data.styles = data.styles.map(src => {
      if ( foundry.utils.getType(src) === "Object" ) return src;
      return { src };
    });
  }

  /* -------------------------------------------- */

  /**
   * Adjust pack names to conform to a slugified version
   * @param {PackageManifestData} data
   * @param {object} logOptions
   * @internal
   */
  static _migratePackIDs(data, logOptions) {
    if ( !data.packs ) return;
    for ( const pack of data.packs ) {
      const slugified = pack.name.replace(/[^A-Za-z0-9-_]/g, "");
      if ( pack.name !== slugified ) {
        const msg = `The ${this.type} "${data.id}" contains a pack with an invalid name "${pack.name}". `
          + "Pack names containing any character that is non-alphanumeric or an underscore will cease loading in "
          + "version 14 of the software.";
        pack.name = slugified;
        this._logWarning(data.id, msg, logOptions);
      }
    }
  }

  /* -------------------------------------------- */

  /**
   * Retrieve the latest Package manifest from a provided remote location.
   * @param {string} manifestUrl        A remote manifest URL to load
   * @param {object} options            Additional options which affect package construction
   * @param {boolean} [options.strict=true]   Whether to construct the remote package strictly
   * @returns {Promise<ServerPackage>}  A Promise which resolves to a constructed ServerPackage instance
   * @throws {Error}                    An error if the retrieved manifest data is invalid
   */
  static async fromRemoteManifest(manifestUrl, {strict=true}={}) {
    throw new Error("Not implemented");
  }
}

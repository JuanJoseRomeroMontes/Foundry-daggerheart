import DataModel from "./abstract/data.mjs";
import * as fields from "./data/fields.mjs";
import {CSS_THEMES, SOFTWARE_UPDATE_CHANNELS} from "./constants.mjs";
import {isNewerVersion} from "./utils/helpers.mjs";

/**
 * A data model definition which describes the application configuration options.
 * These options are persisted in the user data Config folder in the options.json file.
 * The server-side software extends this class and provides additional validations.
 *
 * @property {string|null} adminPassword        The server administrator password (obscured)
 * @property {string|null} awsConfig            The relative path (to Config) of an AWS configuration file
 * @property {boolean} compressStatic           Whether to compress static files? True by default
 * @property {string} dataPath                  The absolute path of the user data directory (obscured)
 * @property {boolean} fullscreen               Whether the application should automatically start in fullscreen mode?
 * @property {string|null} hostname             A custom hostname applied to internet invitation addresses and URLs
 * @property {string} language                  The default language for the application
 * @property {string|null} localHostname        A custom hostname applied to local invitation addresses
 * @property {string|null} passwordSalt         A custom salt used for hashing user passwords (obscured)
 * @property {number} port                      The port on which the server is listening
 * @property {number} [protocol]                The Internet Protocol version to use, either 4 or 6.
 * @property {number} proxyPort                 An external-facing proxied port used for invitation addresses and URLs
 * @property {boolean} proxySSL                 Is the application running in SSL mode at a reverse-proxy level?
 * @property {string|null} routePrefix          A URL path part which prefixes normal application routing
 * @property {string|null} sslCert              The relative path (to Config) of a used SSL certificate
 * @property {string|null} sslKey               The relative path (to Config) of a used SSL key
 * @property {string} updateChannel             The current application update channel
 * @property {boolean} upnp                     Is UPNP activated?
 * @property {number} upnpLeaseDuration         The duration in seconds of a UPNP lease, if UPNP is active
 * @property {string} world                     A default world name which starts automatically on launch
 */
class ServerSettings extends DataModel {
  static defineSchema() {
    return {
      adminPassword: new fields.StringField({required: true, blank: false, nullable: true, initial: null}),
      awsConfig: new fields.StringField({blank: false, nullable: true, initial: null}),
      compressStatic: new fields.BooleanField({initial: true}),
      compressSocket: new fields.BooleanField({initial: true}),
      cssTheme: new fields.StringField({blank: false, choices: CSS_THEMES, initial: "dark"}),
      dataPath: new fields.StringField(),
      deleteNEDB: new fields.BooleanField(),
      fullscreen: new fields.BooleanField({initial: false}),
      hostname: new fields.StringField({required: true, blank: false, nullable: true, initial: null}),
      hotReload: new fields.BooleanField({initial: false}),
      language: new fields.StringField({required: true, blank: false, initial: "en.core"}),
      localHostname: new fields.StringField({required: true, blank: false, nullable: true, initial: null}),
      passwordSalt: new fields.StringField({required: true, blank: false, nullable: true, initial: null}),
      port: new fields.NumberField({required: true, nullable: false, integer: true, min: 0, initial: 30000,
        validate: ServerSettings.#validatePort}),
      protocol: new fields.NumberField({integer: true, choices: [4, 6], nullable: true}),
      proxyPort: new fields.NumberField({required: true, nullable: true, integer: true, initial: null}),
      proxySSL: new fields.BooleanField({initial: false}),
      routePrefix: new fields.StringField({required: true, blank: false, nullable: true, initial: null}),
      sslCert: new fields.StringField({blank: false, nullable: true, initial: null}),
      sslKey: new fields.StringField({blank: false, nullable: true, initial: null}),
      telemetry: new fields.BooleanField({required: false, initial: undefined}),
      updateChannel: new fields.StringField({required: true, choices: SOFTWARE_UPDATE_CHANNELS, initial: "stable"}),
      upnp: new fields.BooleanField({initial: true}),
      upnpLeaseDuration: new fields.NumberField(),
      world: new fields.StringField({required: true, blank: false, nullable: true, initial: null}),
      noBackups: new fields.BooleanField({required: false})
    };
  }

  static LOCALIZATION_PREFIXES = ["SERVER_SETTINGS"];

  /* ----------------------------------------- */

  /** @override */
  static migrateData(data) {

    // Backwards compatibility old update channels
    /** @deprecated since v9 */
    const channelMap = {alpha: "prototype", beta: "testing", release: "stable"};
    data.updateChannel = channelMap[data.updateChannel] || data.updateChannel;

    // Backwards compatibility for awsConfig of true
    /** @deprecated since v11 */
    if ( data.awsConfig === true ) data.awsConfig = "";

    // Theme name changes
    /** @deprecated since v13 */
    if ( data.cssTheme === "foundry" ) data.cssTheme = "dark";
    return data;
  }

  /* ----------------------------------------- */

  /**
   * Validate a port assignment.
   * @param {number} port     The requested port
   * @throws                  An error if the requested port is invalid
   */
  static #validatePort(port) {
    if ( !Number.isNumeric(port) || ((port < 1024) && ![80, 443].includes(port)) || (port > 65535) ) {
      throw new Error("The application port must be an integer, either 80, 443, or between 1024 and 65535");
    }
  }
}

/* ----------------------------------------- */

/**
 * A data object which represents the details of this Release of Foundry VTT
 *
 * @property {number} generation        The major generation of the Release
 * @property {number} [maxGeneration]   The maximum available generation of the software.
 * @property {number} [maxStableGeneration]  The maximum available stable generation of the software.
 * @property {string} channel           The channel the Release belongs to, such as "stable"
 * @property {string} suffix            An optional appended string display for the Release
 * @property {number} build             The internal build number for the Release
 * @property {number} time              When the Release was released
 * @property {number} [node_version]    The minimum required Node.js major version
 * @property {string} [notes]           Release notes for the update version
 * @property {string} [download]        A temporary download URL where this version may be obtained
 * @property {Record<string, any>} [flags]  Supplementary data that accompanies this release.
 */
class ReleaseData extends DataModel {
  /** @override */
  static defineSchema() {
    return {
      generation: new fields.NumberField({required: true, nullable: false, integer: true, min: 1}),
      maxGeneration: new fields.NumberField({
        required: false, nullable: false, integer: true, min: 1, initial: () => this.generation
      }),
      maxStableGeneration: new fields.NumberField({
        required: false, nullable: false, integer: true, min: 1, initial: () => this.generation
      }),
      channel: new fields.StringField({choices: SOFTWARE_UPDATE_CHANNELS, blank: false}),
      suffix: new fields.StringField(),
      build: new fields.NumberField({required: true, nullable: false, integer: true}),
      time: new fields.NumberField({nullable: false, initial: Date.now}),
      node_version: new fields.NumberField({required: true, nullable: false, integer: true, min: 10}),
      notes: new fields.StringField(),
      download: new fields.StringField(),
      flags: new fields.ObjectField()
    };
  }

  /* ----------------------------------------- */

  /**
   * A formatted string for shortened display, such as "Version 9"
   * @returns {string}
   */
  get shortDisplay() {
    return `Version ${this.generation} Build ${this.build}`;
  }

  /**
   * A formatted string for general display, such as "V9 Prototype 1" or "Version 9"
   * @returns {string}
   */
  get display() {
    return ["Version", this.generation, this.suffix].filterJoin(" ");
  }

  /**
   * A formatted string for Version compatibility checking, such as "9.150"
   * @returns {string}
   */
  get version() {
    return `${this.generation}.${this.build}`;
  }

  /**
   * Whether this generation requires manual installation.
   * @returns {boolean}
   */
  get requiresManualInstall() {
    return !!(this.flags.requires_generation_reinstall
      || this.flags.requires_electron_reinstall
      || this.flags.requires_full_reinstall);
  }

  /* ----------------------------------------- */

  /** @override */
  toString() {
    return this.shortDisplay;
  }

  /* ----------------------------------------- */

  /**
   * Is this ReleaseData object newer than some other version?
   * @param {string|ReleaseData} other        Some other version to compare against
   * @returns {boolean}                       Is this ReleaseData a newer version?
   */
  isNewer(other) {
    const version = other instanceof ReleaseData ? other.version : other;
    return isNewerVersion(this.version, version);
  }

  /* ----------------------------------------- */

  /**
   * Is this ReleaseData object a newer generation than some other version?
   * @param {string|ReleaseData} other        Some other version to compare against
   * @returns {boolean}                       Is this ReleaseData a newer generation?
   */
  isGenerationalChange(other) {
    if ( !other ) return true;
    let generation;
    if ( other instanceof ReleaseData ) generation = other.generation.toString();
    else {
      other = String(other);
      const parts = other.split(".");
      if ( parts[0] === "0" ) parts.shift();
      generation = parts[0];
    }
    return isNewerVersion(this.generation, generation);
  }
}

export {ReleaseData, ServerSettings};

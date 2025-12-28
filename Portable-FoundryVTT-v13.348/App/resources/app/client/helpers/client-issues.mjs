import WorldCollection from "@client/documents/abstract/world-collection.mjs";

/**
 * @typedef {Record<string, Record<string, number>>} ModuleSubTypeCounts
 * An object structure of document types at the top level, with a count of different sub-types for that document type.
 */

/**
 * A class responsible for tracking issues in the current world.
 */
export default class ClientIssues {
  /**
   * Keep track of valid Documents in the world that are using module-provided sub-types.
   * @type {Map<string, ModuleSubTypeCounts>}
   */
  #moduleTypeMap = new Map();

  /**
   * Keep track of document validation failures.
   * @type {object}
   */
  #documentValidationFailures = {};

  /**
   * @typedef UsabilityIssue
   * @property {string} message   The pre-localized message to display in relation to the usability issue.
   * @property {string} severity  The severity of the issue, either "error", "warning", or "info".
   * @property {object} [params]  Parameters to supply to the localization.
   */

  /**
   * Keep track of any usability issues related to browser or technology versions.
   * @type {Record<string, UsabilityIssue>}
   */
  #usabilityIssues = {};

  /**
   * The minimum supported screen resolution.
   * @type {{width: number; height: number}}
   */
  static #MIN_SCREEN_RESOLUTION = {width: 1366, height: 768};

  /**
   * The minimum supported viewport dimensions.
   * @type {{width: number; height: number}}
   */
  static #MIN_VIEWPORT_DIMENSIONS = {width: 1024, height: 768};

  /**
   * @typedef BrowserTest
   * @property {number|string} minimum  The minimum supported version for this browser.
   * @property {RegExp} match    A regular expression to match the browser against the user agent string.
   * @property {string} message  A message to display if the user's browser version does not meet the minimum.
   */

  /**
   * The minimum supported client versions.
   * @type {Record<string, BrowserTest>}
   */
  static #BROWSER_TESTS = {
    Electron: {
      minimum: 34,
      match: /Electron\/(\d+)\./,
      message: "ERROR.ElectronVersion"
    },
    Chromium: {
      minimum: 132, // Electron 34
      match: /Chrom(?:e|ium)\/(\d+)\./,
      message: "ERROR.BrowserVersion"
    },
    Firefox: {
      minimum: 131, // Requires Iterator#filter
      match: /Firefox\/(\d+)\./,
      message: "ERROR.BrowserVersion"
    },
    Safari: {
      minimum: "18.4", // Requires Iterator#filter
      match: /Version\/(\d+\.\d+).*Safari\//,
      message: "ERROR.BrowserVersion"
    }
  };

  /* -------------------------------------------- */

  /**
   * Add a Document to the count of module-provided sub-types.
   * @param {string} documentName                The Document name.
   * @param {string} subType                     The Document's sub-type.
   * @param {object} [options]
   * @param {boolean} [options.decrement=false]  Decrement the counter rather than incrementing it.
   */
  #countDocumentSubType(documentName, subType, {decrement=false}={}) {
    if ( !((typeof subType === "string") && subType.includes(".")) ) return;
    const [moduleId, ...rest] = subType.split(".");
    subType = rest.join(".");
    if ( !this.#moduleTypeMap.has(moduleId) ) this.#moduleTypeMap.set(moduleId, {});
    const counts = this.#moduleTypeMap.get(moduleId);
    const types = counts[documentName] ??= {};
    types[subType] ??= 0;
    if ( decrement ) types[subType] = Math.max(types[subType] - 1, 0);
    else types[subType]++;
  }

  /* -------------------------------------------- */

  /**
   * Detect the user's browser and display a notification if it is below the minimum required version.
   */
  #detectBrowserVersion() {
    for ( const [browser, {minimum, match, message}] of Object.entries(ClientIssues.#BROWSER_TESTS) ) {
      const [, version] = navigator.userAgent.match(match) ?? [];
      if ( !version ) continue;
      if ( foundry.utils.isNewerVersion(minimum, version) ) {
        const err = game.i18n.format(message, {browser, version, minimum});
        ui.notifications?.error(err, {permanent: true, console: true});
        this.#usabilityIssues.browserVersionIncompatible = {
          message,
          severity: "error",
          params: {browser, version, minimum}
        };
      }
      break;
    }
  }

  /* -------------------------------------------- */

  /**
   * Record a reference to a resolution notification ID so that we can remove it if the problem is remedied.
   * @type {number}
   */
  #resolutionTooLowNotification;

  /**
   * Detect the user's screen resolution and viewport dimensions, displaying a notification if either is too small.
   */
  #validateResolution() {
    if ( !ui.notifications ) return;
    if ( this.#resolutionTooLowNotification ) {
      ui.notifications.remove(this.#resolutionTooLowNotification);
      this.#resolutionTooLowNotification = undefined;
    }
    delete this.#usabilityIssues.resolutionTooLow;

    let errorMessage;
    let errorDimensions;
    const screen = {
      curWidth: window.screen.width,
      curHeight: window.screen.height,
      reqWidth: ClientIssues.#MIN_SCREEN_RESOLUTION.width,
      reqHeight: ClientIssues.#MIN_SCREEN_RESOLUTION.height
    };
    const viewport = {
      curWidth: window.innerWidth,
      curHeight: window.innerHeight,
      reqWidth: ClientIssues.#MIN_VIEWPORT_DIMENSIONS.width,
      reqHeight: ClientIssues.#MIN_VIEWPORT_DIMENSIONS.height
    };
    const satisfiesViewportSize = (viewport.curWidth >= viewport.reqWidth)
      && (viewport.curHeight >= viewport.reqHeight);
    if ( !satisfiesViewportSize ) {
      const hasZoomFactor = window.devicePixelRatio > 1;

      // Error Case 1: Insufficient Screen Size
      const canTestScreenSize = (viewport.curWidth >= screen.curWidth) && (viewport.curHeight >= screen.curHeight)
        && !hasZoomFactor;
      const satisfiesScreenSize = (screen.curWidth >= screen.reqWidth) && (screen.curHeight >= screen.reqHeight);
      if ( canTestScreenSize && !satisfiesScreenSize ) {
        errorMessage = "ERROR.RESOLUTION.Screen";
        errorDimensions = screen;
      }

      // Error Case 2: OS or Browser Zoom
      else if ( hasZoomFactor ) {
        errorMessage = "ERROR.RESOLUTION.Scale";
        errorDimensions = viewport;
      }

      // Error Case 3: Too Small Window
      else {
        errorMessage = "ERROR.RESOLUTION.Window";
        errorDimensions = viewport;
      }
    }
    if ( errorMessage ) {
      this.#usabilityIssues.resolutionTooLow = {message: errorMessage, severity: "error", params: errorDimensions};
      this.#resolutionTooLowNotification = ui.notifications.error(errorMessage, {permanent: true,
        format: errorDimensions});
    }
  }

  /* -------------------------------------------- */

  /**
   * Detect and display warnings for known performance issues which may occur due to the user's hardware or browser
   * configuration.
   * @internal
   */
  _detectWebGLIssues() {
    const context = canvas.app.renderer.context;
    try {
      const rendererInfo = foundry.applications.sidebar.apps.SupportDetails.getWebGLRendererInfo(context.gl);
      if ( /swiftshader/i.test(rendererInfo) ) {
        ui.notifications.warn("ERROR.NoHardwareAcceleration", {localize: true, permanent: true});
        this.#usabilityIssues.hardwareAccel = {message: "ERROR.NoHardwareAcceleration", severity: "error"};
      }
    } catch(err) {
      ui.notifications.warn("ERROR.RendererNotDetected", {localize: true, permanent: true});
      this.#usabilityIssues.noRenderer = {message: "ERROR.RendererNotDetected", severity: "warning"};
    }

    // Verify that WebGL2 is being used.
    if ( !canvas.supported.webGL2 ) {
      ui.notifications.error("ERROR.NoWebGL2", {localize: true, permanent: true});
      this.#usabilityIssues.webgl2 = {message: "ERROR.NoWebGL2", severity: "error"};
    }
  }

  /* -------------------------------------------- */

  /**
   * Add an invalid Document to the module-provided sub-type counts.
   * @param {typeof Document} cls                The Document class.
   * @param {object} source                      The Document's source data.
   * @param {object} [options]
   * @param {boolean} [options.decrement=false]  Decrement the counter rather than incrementing it.
   * @internal
   */
  _countDocumentSubType(cls, source, options={}) {
    if ( cls.hasTypeData ) this.#countDocumentSubType(cls.documentName, source.type, options);
    for ( const [embeddedName, field] of Object.entries(cls.hierarchy) ) {
      if ( !(field instanceof foundry.data.fields.EmbeddedCollectionField) ) continue;
      for ( const embedded of source?.[embeddedName] ?? [] ) {
        this._countDocumentSubType(field.model, embedded, options);
      }
    }
  }

  /* -------------------------------------------- */

  /**
   * Track a validation failure that occurred in a WorldCollection.
   * @param {WorldCollection} collection      The parent collection.
   * @param {object} source                   The Document's source data.
   * @param {DataModelValidationError} error  The validation error.
   * @internal
   */
  _trackValidationFailure(collection, source, error) {
    if ( !(collection instanceof WorldCollection) ) return;
    if ( !(error instanceof foundry.data.validation.DataModelValidationError) ) return;
    const documentName = collection.documentName;
    this.#documentValidationFailures[documentName] ??= {};
    this.#documentValidationFailures[documentName][source._id] = {name: source.name, error};
  }

  /* -------------------------------------------- */

  /**
   * Detect and record certain usability error messages which are likely to result in the user having a bad experience.
   * @internal
   */
  _detectUsabilityIssues() {
    this.#validateResolution();
    this.#detectBrowserVersion();
    window.addEventListener("resize", foundry.utils.debounce(this.#validateResolution.bind(this), 250), {passive: true});
  }

  /* -------------------------------------------- */

  /**
   * Get the Document sub-type counts for a given module.
   * @param {Module|string} module  The module or its ID.
   * @returns {ModuleSubTypeCounts}
   */
  getSubTypeCountsFor(module) {
    return this.#moduleTypeMap.get(module.id ?? module);
  }

  /* -------------------------------------------- */

  /**
   * Retrieve all sub-type counts in the world.
   * @returns {Iterator<string, ModuleSubTypeCounts>}
   */
  getAllSubTypeCounts() {
    return this.#moduleTypeMap.entries();
  }

  /* -------------------------------------------- */

  /**
   * Retrieve the tracked validation failures.
   * @returns {object}
   */
  get validationFailures() {
    return this.#documentValidationFailures;
  }

  /* -------------------------------------------- */

  /**
   * Retrieve the tracked usability issues.
   * @returns {Record<string, UsabilityIssue>}
   */
  get usabilityIssues() {
    return this.#usabilityIssues;
  }

  /* -------------------------------------------- */

  /**
   * @typedef PackageCompatibilityIssue
   * @property {string[]} error    Error messages.
   * @property {string[]} warning  Warning messages.
   */

  /**
   * Retrieve package compatibility issues.
   * @returns {Record<string, PackageCompatibilityIssue>}
   */
  get packageCompatibilityIssues() {
    return game.data.packageWarnings;
  }
}

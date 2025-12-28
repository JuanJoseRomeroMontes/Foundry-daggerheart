import {ApplicationV2, HandlebarsApplicationMixin} from "../../api/_module.mjs";

/**
 * @import {ApplicationClickAction} from "../../_types.mjs";
 */

/**
 * @typedef SupportReportData
 * A bundle of metrics for Support
 * @property {string} coreVersion
 * @property {string} systemVersion
 * @property {number} activeModuleCount
 * @property {string} performanceMode
 * @property {string} screen
 * @property {string} viewport
 * @property {string} os
 * @property {string} client
 * @property {string} gpu
 * @property {number|string} maxTextureSize
 * @property {string} sceneDimensions
 * @property {number} grid
 * @property {number} padding
 * @property {number} walls
 * @property {number} lights
 * @property {number} sounds
 * @property {number} tiles
 * @property {number} tokens
 * @property {number} actors
 * @property {number} items
 * @property {number} journals
 * @property {number} tables
 * @property {number} playlists
 * @property {number} packs
 * @property {number} messages
 * @property {boolean} hasViewedScene
 * @property {string[]} worldScripts
 * @property {{width: number; height: number; src?: string}} largestTexture
 */

export default class SupportDetails extends HandlebarsApplicationMixin(ApplicationV2) {

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    id: "support-details",
    position: {
      height: 735,
      width: 780
    },
    window: {
      contentClasses: ["standard-form"],
      icon: "fa-solid fa-handshake-angle",
      title: "SUPPORT.Title"
    },
    actions: {
      fullReport: SupportDetails.#onGenerateFullReport,
      copyReport: SupportDetails.#onCopyReport
    }
  };

  /** @override */
  static PARTS = {
    tabs: {template: "templates/generic/tab-navigation.hbs"},
    support: {
      template: "templates/sidebar/apps/support-details/support.hbs",
      templates: ["templates/sidebar/apps/support-details/report.hbs"]
    },
    documents: {template: "templates/sidebar/apps/support-details/documents.hbs"},
    client: {template: "templates/sidebar/apps/support-details/client.hbs"},
    modules: {template: "templates/sidebar/apps/support-details/modules.hbs"}
  };

  /** @override */
  static TABS = {
    main: {
      tabs: [
        {id: "support", icon: "fa-solid fa-handshake-angle"},
        {id: "documents", icon: "fa-solid file-circle-exclamation"},
        {id: "client", icon: "fa-regular fa-window"},
        {id: "modules", icon: "fa-solid box-open"}
      ],
      initial: "support",
      labelPrefix: "SUPPORT.TABS"
    }
  };

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _preparePartContext(partId, context, options) {
    const partContext = await super._preparePartContext(partId, context, options);
    const tab = partContext.tabs[partId];
    if ( tab ) partContext.tab = tab;
    switch ( partId ) {
      case "support":
        partContext.report = await SupportDetails.generateSupportReport();
        break;
      case "documents":
        partContext.documentIssues = this._getDocumentValidationErrors();
        break;
      case "modules":
        partContext.moduleIssues = this._getModuleIssues();
        break;
      case "client":
        partContext.clientIssues = Object.values(game.issues.usabilityIssues).map(({message, severity, params}) => ({
          severity,
          message: game.i18n.format(message, params ?? {})
        }));
    }
    return partContext;
  }

  /* -------------------------------------------- */

  /**
   * Copy the support details report to clipboard.
   * @this {SupportDetails}
   * @type {ApplicationClickAction}
   */
  static #onCopyReport() {
    const report = this.element.querySelector("pre[data-report]");
    game.clipboard.copyPlainText(report.innerText);
    ui.notifications.info("SUPPORT.ReportCopied", {localize: true});
  }

  /* -------------------------------------------- */

  /**
   * Generate a more detailed support report and append it to the basic report.
   * @this {SupportDetails}
   * @type {ApplicationClickAction}
   */
  static async #onGenerateFullReport(_event, button) {
    let fullReport = "\n";
    const reportEl = this.element.querySelector("pre[data-report]");
    const icon = button.querySelector("i");
    button.disabled = true;
    icon.className = "fa-solid fa-spinner fa-spin-pulse";

    const sizeInfo = await this.#getWorldSizeInfo();
    const {worldSizes, packSizes} = Object.entries(sizeInfo).reduce((obj, entry) => {
      const [collectionName] = entry;
      if ( collectionName.includes(".") ) obj.packSizes.push(entry);
      else obj.worldSizes.push(entry);
      return obj;
    }, {worldSizes: [], packSizes: []});

    fullReport += `\n${this.#drawBox(game.i18n.localize("SUPPORT.WorldData"))}\n\n`;
    fullReport += worldSizes.map(([collectionName, size]) => {
      let collection = game[collectionName];
      if ( collectionName === "fog" ) collection = game.collections.get("FogExploration");
      else if ( collectionName === "settings" ) collection = game.collections.get("Setting");
      return `${collection.name}: ${collection.size} | ${foundry.utils.formatFileSize(size, { decimalPlaces: 0 })}`;
    }).join("\n");

    if ( packSizes.length ) {
      fullReport += `\n\n${this.#drawBox(game.i18n.localize("SUPPORT.CompendiumData"))}\n\n`;
      fullReport += packSizes.map(([collectionName, size]) => {
        const pack = game.packs.get(collectionName);
        const type = game.i18n.localize(pack.documentClass.metadata.labelPlural);
        size = foundry.utils.formatFileSize(size, { decimalPlaces: 0 });
        return `"${collectionName}": ${pack.index.size} ${type} | ${size}`;
      }).join("\n");
    }

    const activeModules = game.modules.filter(m => m.active);
    if ( activeModules.length ) {
      fullReport += `\n\n${this.#drawBox(game.i18n.localize("SUPPORT.ActiveModules"))}\n\n`;
      fullReport += activeModules.map(m => `${m.id} | ${m.version} | "${m.title}" | "${m.manifest}"`).join("\n");
    }

    icon.className = "fa-solid fa-check";
    reportEl.innerText += fullReport;
    this.setPosition({height: "auto"});
  }

  /* -------------------------------------------- */

  /**
   * Retrieve information about the size of the World and any active compendiums.
   * @returns {Promise<Record<string, number>>}
   */
  async #getWorldSizeInfo() {
    return new Promise(resolve => game.socket.emit("sizeInfo", resolve));
  }

  /* -------------------------------------------- */

  /**
   * Draw an ASCII box around the given string for legibility in the full report.
   * @param {string} text  The text.
   * @returns {string}
   */
  #drawBox(text) {
    const border = `/* ${"-".repeat(44)} */`;
    return `${border}\n/*  ${text}${" ".repeat(border.length - text.length - 6)}*/\n${border}`;
  }

  /* -------------------------------------------- */

  /**
   * Marshal information on Documents that failed validation and format it for display.
   * @returns {object[]}
   * @protected
   */
  _getDocumentValidationErrors() {
    const context = [];
    for ( const [documentName, documents] of Object.entries(game.issues.validationFailures) ) {
      const cls = foundry.utils.getDocumentClass(documentName);
      const label = game.i18n.localize(cls.metadata.labelPlural);
      context.push({
        label,
        documents: Object.entries(documents).map(([id, {name, error}]) => {
          return {name: name ?? id, validationError: error.asHTML()};
        })
      });
    }
    return context;
  }

  /* -------------------------------------------- */

  /**
   * Marshal package-related warnings and errors and format it for display.
   * @returns {object[]}
   * @protected
   */
  _getModuleIssues() {
    const errors = {label: game.i18n.localize("Errors"), issues: []};
    const warnings = {label: game.i18n.localize("Warnings"), issues: []};
    for ( const [moduleId, {error, warning}] of Object.entries(game.issues.packageCompatibilityIssues) ) {
      const label = game.modules.get(moduleId)?.title ?? moduleId;
      if ( error.length ) errors.issues.push({label, issues: error.map(message => ({severity: "error", message}))});
      if ( warning.length ) warnings.issues.push({
        label,
        issues: warning.map(message => ({severity: "warning", message}))
      });
    }
    const context = [];
    if ( errors.issues.length ) context.push(errors);
    if ( warnings.issues.length ) context.push(warnings);
    return context;
  }

  /* -------------------------------------------- */

  /**
   * Collects a number of metrics that is useful for Support
   * @returns {Promise<SupportReportData>}
   */
  static async generateSupportReport() {
    // Create a WebGL Context if necessary
    let tempCanvas;
    let gl = canvas.app?.renderer?.gl;
    if ( !gl ) {
      const tempCanvas = document.createElement("canvas");
      if ( tempCanvas.getContext ) {
        gl = tempCanvas.getContext("webgl2") || tempCanvas.getContext("webgl") || tempCanvas.getContext("experimental-webgl");
      }
    }
    const rendererInfo = this.getWebGLRendererInfo(gl) ?? "Unknown Renderer";

    let os = navigator.oscpu ?? "Unknown";
    let client = navigator.userAgent;

    // Attempt to retrieve high-entropy Sec-CH headers.
    if ( navigator.userAgentData ) {
      const secCH = await navigator.userAgentData.getHighEntropyValues([
        "architecture", "model", "bitness", "platformVersion", "fullVersionList"
      ]);

      const { architecture, bitness, brands, platform, platformVersion, fullVersionList } = secCH;
      os = [platform, platformVersion, architecture, bitness ? `(${bitness}-bit)` : null].filterJoin(" ");
      const { brand, version } = fullVersionList?.[0] ?? brands?.[0] ?? {};
      client = `${brand}/${version}`;
    }

    // Build report data
    const viewedScene = game.scenes.get(game.user.viewedScene);
    const worldScripts = Array.from(game.world.esmodules)
      .concat(...game.world.scripts)
      .map(s => `"${s}"`)
      .join(", ") || game.i18n.localize("None");
    const performanceModes = game.settings.settings.get("core.performanceMode").type.choices;

    /** @type {Partial<SupportReportData>} **/
    const report = {
      coreVersion: `${game.release.display}, ${game.release.version}`,
      systemVersion: `${game.system.id}, ${game.system.version}`,
      activeModuleCount: Array.from(game.modules.values()).filter(x => x.active).length,
      performanceMode: game.i18n.localize(performanceModes[game.settings.get("core", "performanceMode")]),
      screen: game.i18n.format("SUPPORT.Dimensions", window.screen),
      viewport: game.i18n.format("SUPPORT.Dimensions", {width: window.innerWidth, height: window.innerHeight}),
      os, client,
      gpu: rendererInfo,
      maxTextureSize: gl && gl.getParameter ? gl.getParameter(gl.MAX_TEXTURE_SIZE) : "Could not detect",
      hasViewedScene: !!viewedScene,
      packs: game.packs.size,
      worldScripts
    };

    // Attach Document Collection counts
    const reportCollections = ["actors", "items", "journal", "tables", "playlists", "messages"];
    for ( const c of reportCollections ) {
      const collection = game[c];
      report[c] = `${collection.size}${collection.invalidDocumentIds.size > 0
        ? ` (${collection.invalidDocumentIds.size} ${game.i18n.localize("Invalid")})` : ""}`;
    }

    if ( viewedScene ) {
      report.sceneDimensions = `${viewedScene.dimensions.width} x ${viewedScene.dimensions.height}`;
      report.grid = viewedScene.grid.size;
      report.padding = viewedScene.padding;
      report.walls = viewedScene.walls.size;
      report.lights = viewedScene.lights.size;
      report.sounds = viewedScene.sounds.size;
      report.tiles = viewedScene.tiles.size;
      report.tokens = viewedScene.tokens.size;
      report.largestTexture = SupportDetails.#getLargestTexture();
    }

    // Clean up temporary canvas
    if ( tempCanvas ) tempCanvas.remove();
    return report;
  }

  /* -------------------------------------------- */

  /**
   * Find the largest texture in the scene.
   * @returns {{width: number, height: number, [src]: string}}
   */
  static #getLargestTexture() {
    let largestTexture = { width: 0, height: 0 };

    /**
     * Find any textures in the given DisplayObject or its children.
     * @param {DisplayObject} obj  The object.
     */
    function findTextures(obj) {
      if ( (obj instanceof PIXI.Sprite) || (obj instanceof foundry.canvas.containers.SpriteMesh)
        || (obj instanceof foundry.canvas.primary.PrimarySpriteMesh) ) {
        const texture = obj.texture?.baseTexture ?? {};
        const { width, height, resource } = texture;
        if ( Math.max(width, height) > Math.max(largestTexture.width, largestTexture.height) ) {
          largestTexture = { width, height, src: resource?.src };
        }
      }
      (obj?.children ?? []).forEach(findTextures);
    }

    findTextures(canvas.stage);
    return largestTexture;
  }

  /* -------------------------------------------- */

  /**
   * Get a WebGL renderer information string
   * @param {WebGLRenderingContext} gl    The rendering context
   * @returns {string}                    The unmasked renderer string
   */
  static getWebGLRendererInfo(gl) {
    if ( navigator.userAgent.match(/Firefox\/([0-9]+)\./) ) {
      return gl.getParameter(gl.RENDERER);
    } else {
      return gl.getParameter(gl.getExtension("WEBGL_debug_renderer_info").UNMASKED_RENDERER_WEBGL);
    }
  }
}

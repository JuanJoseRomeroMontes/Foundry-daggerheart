import {RenderFlagsMixin} from "../interaction/render-flags.mjs";

/**
 * @import {PerceptionManagerFlags} from "../_types.mjs"
 */

/**
 * A helper class which manages the refresh workflow for perception layers on the canvas.
 * This controls the logic which batches multiple requested updates to minimize the amount of work required.
 * A singleton instance is available as {@link foundry.canvas.Canvas#perception}.
 */
export default class PerceptionManager extends RenderFlagsMixin() {

  /** @override */
  static RENDER_FLAGS = {

    // Edges
    refreshEdges: {},

    // Light and Darkness Sources
    initializeLighting: {propagate: ["initializeLightSources"]},
    initializeLightSources: {propagate: ["refreshLighting", "refreshVision", "refreshEdges"]},
    refreshLighting: {propagate: ["refreshLightSources"]},
    refreshLightSources: {},

    // Vision
    initializeVisionModes: {propagate: ["refreshVisionSources", "refreshLighting", "refreshPrimary"]},
    initializeVision: {propagate: ["initializeVisionModes", "refreshVision"]},
    refreshVision: {propagate: ["refreshVisionSources", "refreshOcclusionMask"]},
    refreshVisionSources: {},

    // Primary Canvas Group
    refreshPrimary: {},
    refreshOcclusion: {propagate: ["refreshOcclusionStates", "refreshOcclusionMask"]},
    refreshOcclusionStates: {},
    refreshOcclusionMask: {},

    // Sound
    initializeSounds: {propagate: ["refreshSounds"]},
    refreshSounds: {},
    soundFadeDuration: {},

    /** @deprecated since v12 */
    refreshTiles: {
      propagate: ["refreshOcclusion"],
      deprecated: {message: "The refreshTiles flag is deprecated in favor of refreshOcclusion",
        since: 12, until: 14},
      alias: true
    },
    /** @deprecated since v12 */
    identifyInteriorWalls: {
      propagate: ["initializeLighting", "initializeVision"],
      deprecated: {
        message: "The identifyInteriorWalls flag is now obsolete and has no replacement.",
        since: 12, until: 14
      },
      alias: true
    },
    /** @deprecated since v13 */
    initializeDarknessSources: {
      propagate: ["initializeLightSources"],
      deprecated: {
        message: "The initializeDarknessSources flag is now obsolete. initializeLightSources flag must be used instead.",
        since: 13, until: 15
      }
    }
  };

  static #deprecatedFlags = ["refreshTiles", "identifyInteriorWalls"];

  /** @override */
  static RENDER_FLAG_PRIORITY = "PERCEPTION";

  /* -------------------------------------------- */

  /** @override */
  applyRenderFlags() {
    if ( !this.renderFlags.size ) return;
    const flags = this.renderFlags.clear();

    // Initialize sources with edges
    if ( flags.initializeLightSources ) canvas.effects.initializePriorityLightSources();

    // Recompute edge intersections
    if ( flags.refreshEdges ) canvas.edges.refresh();

    // Initialize positive light sources
    if ( flags.initializeLightSources ) canvas.effects.initializeLightSources();

    // Initialize active vision sources
    if ( flags.initializeVision ) canvas.visibility.initializeSources();

    // Initialize the active vision mode
    if ( flags.initializeVisionModes ) canvas.visibility.initializeVisionMode();

    // Initialize active sound sources
    if ( flags.initializeSounds ) canvas.sounds.initializeSources();

    // Refresh light, vision, and sound sources
    if ( flags.refreshLightSources ) canvas.effects.refreshLightSources();
    if ( flags.refreshVisionSources ) canvas.effects.refreshVisionSources();
    if ( flags.refreshSounds ) canvas.sounds.refresh({fade: flags.soundFadeDuration ? 250 : 0});

    // Refresh the appearance of the Primary Canvas Group environment
    if ( flags.refreshPrimary ) canvas.primary.refreshPrimarySpriteMesh();
    if ( flags.refreshLighting ) canvas.effects.refreshLighting();
    if ( flags.refreshVision ) canvas.visibility.refresh();

    // Update roof occlusion states based on token positions and vision
    // TODO: separate occlusion state testing from CanvasOcclusionMask
    if ( flags.refreshOcclusion ) canvas.masks.occlusion.updateOcclusion();
    else {
      if ( flags.refreshOcclusionMask ) canvas.masks.occlusion._updateOcclusionMask();
      if ( flags.refreshOcclusionStates ) canvas.masks.occlusion._updateOcclusionStates();
    }

    // Deprecated flags
    for ( const f of PerceptionManager.#deprecatedFlags ) {
      if ( flags[f] ) {
        const {message, since, until} = PerceptionManager.RENDER_FLAGS[f].deprecated;
        foundry.utils.logCompatibilityWarning(message, {since, until});
      }
    }
  }

  /* -------------------------------------------- */

  /**
   * Update perception manager flags which configure which behaviors occur on the next frame render.
   * @param {object} flags        Flag values (true) to assign where the keys belong to PerceptionManager.FLAGS
   */
  update(flags) {
    if ( !canvas.ready ) return;
    this.renderFlags.set(flags);
  }

  /* -------------------------------------------- */

  /**
   * A helper function to perform an immediate initialization plus incremental refresh.
   */
  initialize() {
    return this.update({
      refreshEdges: true,
      initializeLighting: true,
      initializeVision: true,
      initializeSounds: true,
      refreshOcclusion: true
    });
  }

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  refresh() {
    foundry.utils.logCompatibilityWarning("PerceptionManager#refresh is deprecated in favor of assigning granular "
      + "refresh flags", {since: 12, until: 14});
    return this.update({
      refreshLighting: true,
      refreshVision: true,
      refreshSounds: true,
      refreshOcclusion: true
    });
  }
}

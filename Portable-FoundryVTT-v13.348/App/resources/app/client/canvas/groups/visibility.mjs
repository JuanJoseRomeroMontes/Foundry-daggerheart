import SpriteMesh from "../containers/elements/sprite-mesh.mjs";
import GlobalLightSource from "../sources/global-light-source.mjs";
import {getTexture} from "../loader.mjs";
import VisionMode from "../perception/vision-mode.mjs";
import Token from "../placeables/token.mjs";
import Canvas from "../board.mjs";
import VoidFilter from "../rendering/filters/void.mjs";
import CanvasGroupMixin from "./canvas-group-mixin.mjs";
import Hooks from "@client/helpers/hooks.mjs";


/**
 * @import {Point, ElevatedPoint, CanvasVisibilityTestConfiguration,
 *   CanvasVisibilityTextureConfiguration} from "../../_types.mjs";
 * @import {PointVisionSource} from "@client/canvas/sources/_module.mjs";
 */

/**
 * The visibility group which implements dynamic vision, lighting, and fog of war
 * This group uses an event-driven workflow to perform the minimal required calculation in response to changes.
 *
 * ### Hook Events
 * - {@link hookEvents.initializeVisionMode}
 * - {@link hookEvents.initializeVisionSources}
 * - {@link hookEvents.sightRefresh}
 * - {@link hookEvents.visibilityRefresh}
 *
 * @category Canvas
 */
export default class CanvasVisibility extends CanvasGroupMixin(PIXI.Container) {
  /** @override */
  static groupName = "visibility";

  /**
   * The currently revealed vision.
   * @type {CanvasVisionContainer}
   */
  vision;

  /**
   * The exploration container which tracks exploration progress.
   * @type {PIXI.Container}
   */
  explored;

  /**
   * The optional visibility overlay sprite that should be drawn instead of the unexplored color in the fog of war.
   * @type {PIXI.Sprite}
   */
  visibilityOverlay;

  /**
   * The graphics used to render cached light sources.
   * @type {PIXI.LegacyGraphics}
   */
  #cachedLights = new PIXI.LegacyGraphics();

  /**
   * Matrix used for visibility rendering transformation.
   * @type {PIXI.Matrix}
   */
  #renderTransform = new PIXI.Matrix();

  /**
   * Dimensions of the visibility overlay texture and base texture used for tiling texture into the visibility filter.
   * @type {number[]}
   */
  #visibilityOverlayDimensions;

  /**
   * The active vision source data object
   * @type {{source: PointVisionSource|null, activeLightingOptions: object}}
   */
  visionModeData = {
    source: undefined,
    activeLightingOptions: {}
  };

  /**
   * Define whether each lighting layer is enabled, required, or disabled by this vision mode.
   * The value for each lighting channel is a number in LIGHTING_VISIBILITY
   * @type {{illumination: number, background: number, coloration: number,
   * darkness: number, any: boolean}}
   */
  lightingVisibility = {
    background: VisionMode.LIGHTING_VISIBILITY.ENABLED,
    illumination: VisionMode.LIGHTING_VISIBILITY.ENABLED,
    coloration: VisionMode.LIGHTING_VISIBILITY.ENABLED,
    darkness: VisionMode.LIGHTING_VISIBILITY.ENABLED,
    any: true
  };

  /**
   * The map with the active cached light source IDs as keys and their update IDs as values.
   * @type {Map<string, number>}
   */
  #cachedLightSourceStates = new Map();

  /**
   * The maximum allowable visibility texture size.
   * @type {number}
   */
  static #MAXIMUM_VISIBILITY_TEXTURE_SIZE = 4096;

  /* -------------------------------------------- */
  /*  Canvas Visibility Properties                */
  /* -------------------------------------------- */

  /**
   * A status flag for whether the group initialization workflow has succeeded.
   * @type {boolean}
   */
  get initialized() {
    return this.#initialized;
  }

  #initialized = false;

  /* -------------------------------------------- */

  /**
   * Indicates whether containment filtering is required when rendering vision into a texture.
   * @type {boolean}
   * @internal
   */
  get needsContainment() {
    return this.#needsContainment;
  }

  #needsContainment = false;

  /* -------------------------------------------- */

  /**
   * Does the currently viewed Scene support Token field of vision?
   * @type {boolean}
   */
  get tokenVision() {
    return canvas.scene.tokenVision;
  }

  /* -------------------------------------------- */

  /**
   * The configured options used for the saved fog-of-war texture.
   * @type {CanvasVisibilityTextureConfiguration}
   */
  get textureConfiguration() {
    return this.#textureConfiguration;
  }

  #textureConfiguration;

  /* -------------------------------------------- */

  /**
   * Optional overrides for exploration sprite dimensions.
   * @type {PIXI.Rectangle|undefined}
   */
  set explorationRect(rect) {
    this.#explorationRect = rect;
  }

  #explorationRect;

  /* -------------------------------------------- */
  /*  Group Initialization                        */
  /* -------------------------------------------- */

  /**
   * Initialize all Token vision sources which are present on this group.
   */
  initializeSources() {
    canvas.effects.toggleMaskingFilters(false); // Deactivate vision masking before destroying textures
    for ( const source of canvas.effects.visionSources ) source.initialize();
    Hooks.callAll("initializeVisionSources", canvas.effects.visionSources);
  }

  /* -------------------------------------------- */

  /**
   * Initialize the vision mode.
   */
  initializeVisionMode() {
    this.visionModeData.source = this.#getSingleVisionSource();
    this.#configureLightingVisibility();
    this.#updateLightingPostProcessing();
    this.#updateTintPostProcessing();
    Hooks.callAll("initializeVisionMode", this);
  }

  /* -------------------------------------------- */

  /**
   * Identify whether there is one singular vision source active (excluding previews).
   * @returns {PointVisionSource|null}                         A singular source, or null
   */
  #getSingleVisionSource() {
    return canvas.effects.visionSources.filter(s => s.active).sort((a, b) =>
      (a.isPreview - b.isPreview)
      || (a.isBlinded - b.isBlinded)
      || (b.visionMode.perceivesLight - a.visionMode.perceivesLight)
    ).at(0) ?? null;
  }

  /* -------------------------------------------- */

  /**
   * Configure the visibility of individual lighting channels based on the currently active vision source(s).
   */
  #configureLightingVisibility() {
    const vs = this.visionModeData.source;
    const vm = vs?.visionMode;
    const lv = this.lightingVisibility;
    const lvs = VisionMode.LIGHTING_VISIBILITY;
    Object.assign(lv, {
      background: CanvasVisibility.#requireBackgroundShader(vm),
      illumination: vm?.lighting.illumination.visibility ?? lvs.ENABLED,
      coloration: vm?.lighting.coloration.visibility ?? lvs.ENABLED,
      darkness: vm?.lighting.darkness.visibility ?? lvs.ENABLED
    });
    lv.any = (lv.background + lv.illumination + lv.coloration + lv.darkness) > VisionMode.LIGHTING_VISIBILITY.DISABLED;
  }

  /* -------------------------------------------- */

  /**
   * Update the lighting according to vision mode options.
   */
  #updateLightingPostProcessing() {
    // Check whether lighting configuration has changed
    const lightingOptions = this.visionModeData.source?.visionMode.lighting || {};
    const diffOpt = foundry.utils.diffObject(this.visionModeData.activeLightingOptions, lightingOptions);
    this.visionModeData.activeLightingOptions = lightingOptions;
    if ( foundry.utils.isEmpty(lightingOptions) ) canvas.effects.resetPostProcessingFilters();
    if ( foundry.utils.isEmpty(diffOpt) ) return;

    // Update post-processing filters and refresh lighting
    const modes = CONFIG.Canvas.visualEffectsMaskingFilter.FILTER_MODES;
    canvas.effects.resetPostProcessingFilters();
    for ( const layer of ["background", "illumination", "coloration"] ) {
      if ( layer in lightingOptions ) {
        const options = lightingOptions[layer];
        const filterMode = modes[layer.toUpperCase()];
        canvas.effects.activatePostProcessingFilters(filterMode, options.postProcessingModes, options.uniforms);
      }
    }
  }

  /* -------------------------------------------- */

  /**
   * Refresh the tint of the post processing filters.
   */
  #updateTintPostProcessing() {
    // Update tint
    const activeOptions = this.visionModeData.activeLightingOptions;
    const singleSource = this.visionModeData.source;
    const color = singleSource?.visionModeOverrides.colorRGB;
    for ( const f of canvas.effects.visualEffectsMaskingFilters ) {
      const defaultTint = f.constructor.defaultUniforms.tint;
      const tintedLayer = activeOptions[f.uniforms.mode]?.uniforms?.tint;
      f.uniforms.tint = tintedLayer ? (color ?? (tintedLayer ?? defaultTint)) : defaultTint;
    }
  }

  /* -------------------------------------------- */

  /**
   * Give the visibility requirement of the lighting background shader.
   * @param {VisionMode} visionMode             The single Vision Mode active at the moment (if any).
   * @returns {VisionMode.LIGHTING_VISIBILITY}
   */
  static #requireBackgroundShader(visionMode) {
    // Do we need to force lighting background shader? Force when :
    // - Multiple vision modes are active with a mix of preferred and non preferred visions
    // - Or when some have background shader required
    const lvs = VisionMode.LIGHTING_VISIBILITY;
    let preferred = false;
    let nonPreferred = false;
    for ( const vs of canvas.effects.visionSources ) {
      if ( !vs.active ) continue;
      const vm = vs.visionMode;
      if ( vm.lighting.background.visibility === lvs.REQUIRED ) return lvs.REQUIRED;
      if ( vm.vision.preferred ) preferred = true;
      else nonPreferred = true;
    }
    if ( preferred && nonPreferred ) return lvs.REQUIRED;
    return visionMode?.lighting.background.visibility ?? lvs.ENABLED;
  }

  /* -------------------------------------------- */
  /*  Group Rendering                             */
  /* -------------------------------------------- */

  /** @override */
  async _draw(options) {
    this.#configureVisibilityTexture();

    // Initialize fog
    await canvas.fog.initialize();

    // Create the vision container and attach it to the CanvasVisionMask cached container
    this.vision = this.#createVision();
    canvas.masks.vision.attachVision(this.vision);
    this.#cacheLights(true);

    // Exploration container
    this.explored = this.addChild(this.#createExploration());

    // Loading the fog overlay
    await this.#drawVisibilityOverlay();

    // Apply the visibility filter with a normal blend
    this.filter = CONFIG.Canvas.visibilityFilter.create({
      unexploredColor: canvas.colors.fogUnexplored.rgb,
      exploredColor: canvas.colors.fogExplored.rgb,
      backgroundColor: canvas.colors.background.rgb,
      visionTexture: canvas.masks.vision.renderTexture,
      primaryTexture: canvas.primary.renderTexture,
      overlayTexture: this.visibilityOverlay?.texture ?? null,
      dimensions: this.#visibilityOverlayDimensions,
      hasOverlayTexture: !!this.visibilityOverlay?.texture.valid
    }, canvas.visibilityOptions);
    this.filter.blendMode = PIXI.BLEND_MODES.NORMAL;
    this.filters = [this.filter];
    this.filterArea = canvas.app.screen;

    // Add the visibility filter to the canvas blur filter list
    canvas.addBlurFilter(this.filter);
    this.visible = false;
    this.#initialized = true;
  }

  /* -------------------------------------------- */

  /**
   * Create the exploration container with its exploration sprite.
   * @returns {PIXI.Container}   The newly created exploration container.
   */
  #createExploration() {
    const dims = canvas.dimensions;
    const explored = new PIXI.Container();
    const explorationSprite = explored.addChild(canvas.fog.sprite);
    const exr = this.#explorationRect;

    // Check if custom exploration dimensions are required
    if ( exr ) {
      explorationSprite.position.set(exr.x, exr.y);
      explorationSprite.width = exr.width;
      explorationSprite.height = exr.height;
    }

    // Otherwise, use the standard behavior
    else {
      explorationSprite.position.set(dims.sceneX, dims.sceneY);
      explorationSprite.width = this.#textureConfiguration.width;
      explorationSprite.height = this.#textureConfiguration.height;
    }
    return explored;
  }

  /* -------------------------------------------- */

  /**
   * Create the vision container and all its children.
   * @returns {PIXI.Container} The created vision container.
   */
  #createVision() {
    const dims = canvas.dimensions;
    const vision = new PIXI.Container();

    // Adding a void filter necessary when commiting fog on a texture for dynamic illumination
    vision.containmentFilter = VoidFilter.create();
    vision.containmentFilter.blendMode = PIXI.BLEND_MODES.MAX_COLOR;
    vision.containmentFilter.enabled = false; // Disabled by default, used only when writing on textures
    vision.filters = [vision.containmentFilter];

    // Areas visible because of light sources and light perception
    vision.light = vision.addChild(new PIXI.Container());

    // The global light container, which hold darkness level meshes for dynamic illumination
    vision.light.global = vision.light.addChild(new PIXI.Container());
    vision.light.global.source = vision.light.global.addChild(new PIXI.LegacyGraphics());
    vision.light.global.meshes = vision.light.global.addChild(new PIXI.Container());
    vision.light.global.source.blendMode = PIXI.BLEND_MODES.MAX_COLOR;

    // The light sources
    vision.light.sources = vision.light.addChild(new PIXI.LegacyGraphics());
    vision.light.sources.blendMode = PIXI.BLEND_MODES.MAX_COLOR;

    // Preview container, which is not cached
    vision.light.preview = vision.light.addChild(new PIXI.LegacyGraphics());
    vision.light.preview.blendMode = PIXI.BLEND_MODES.MAX_COLOR;

    // The cached light to avoid too many geometry drawings
    vision.light.cached = vision.light.addChild(new SpriteMesh(Canvas.getRenderTexture({
      textureConfiguration: this.textureConfiguration
    })));
    vision.light.cached.position.set(dims.sceneX, dims.sceneY);
    vision.light.cached.blendMode = PIXI.BLEND_MODES.MAX_COLOR;

    // The masked area
    vision.light.mask = vision.light.addChild(new PIXI.LegacyGraphics());
    vision.light.mask.preview = vision.light.mask.addChild(new PIXI.LegacyGraphics());

    // Areas visible because of FOV of vision sources
    vision.sight = vision.addChild(new PIXI.LegacyGraphics());
    vision.sight.blendMode = PIXI.BLEND_MODES.MAX_COLOR;
    vision.sight.preview = vision.sight.addChild(new PIXI.LegacyGraphics());
    vision.sight.preview.blendMode = PIXI.BLEND_MODES.MAX_COLOR;

    // Eraser for darkness sources
    vision.darkness = vision.addChild(new PIXI.LegacyGraphics());
    vision.darkness.blendMode = PIXI.BLEND_MODES.ERASE;

    /** @deprecated since v12 */
    Object.defineProperty(vision, "base", {
      get() {
        const msg = "CanvasVisibility#vision#base is deprecated in favor of CanvasVisibility#vision#light#preview.";
        foundry.utils.logCompatibilityWarning(msg, {since: 12, until: 14, once: true});
        return this.fov.preview;
      }
    });
    /** @deprecated since v12 */
    Object.defineProperty(vision, "fov", {
      get() {
        const msg = "CanvasVisibility#vision#fov is deprecated in favor of CanvasVisibility#vision#light.";
        foundry.utils.logCompatibilityWarning(msg, {since: 12, until: 14, once: true});
        return this.light;
      }
    });
    /** @deprecated since v12 */
    Object.defineProperty(vision, "los", {
      get() {
        const msg = "CanvasVisibility#vision#los is deprecated in favor of CanvasVisibility#vision#light#mask.";
        foundry.utils.logCompatibilityWarning(msg, {since: 12, until: 14, once: true});
        return this.light.mask;
      }
    });
    /** @deprecated since v12 */
    Object.defineProperty(vision.light, "lights", {
      get: () => {
        const msg = "CanvasVisibility#vision#fov#lights is deprecated without replacement.";
        foundry.utils.logCompatibilityWarning(msg, {since: 12, until: 14, once: true});
        return this.#cachedLights;
      }
    });
    /** @deprecated since v12 */
    Object.defineProperty(vision.light, "lightsSprite", {
      get() {
        const msg = "CanvasVisibility#vision#fov#lightsSprite is deprecated in favor of CanvasVisibility#vision#light#cached.";
        foundry.utils.logCompatibilityWarning(msg, {since: 12, until: 14, once: true});
        return this.cached;
      }
    });
    /** @deprecated since v12 */
    Object.defineProperty(vision.light, "tokens", {
      get() {
        const msg = "CanvasVisibility#vision#tokens is deprecated in favor of CanvasVisibility#vision#light.";
        foundry.utils.logCompatibilityWarning(msg, {since: 12, until: 14, once: true});
        return this;
      }
    });
    return vision;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _tearDown(options) {
    canvas.masks.vision.detachVision();
    this.#cachedLightSourceStates.clear();
    await canvas.fog.clear();

    // Performs deep cleaning of the detached vision container
    this.vision.destroy({children: true, texture: true, baseTexture: true});
    this.vision = undefined;

    canvas.effects.visionSources.clear();
    this.#initialized = false;
    return super._tearDown(options);
  }

  /* -------------------------------------------- */

  /**
   * Update the display of the visibility group.
   * Organize sources into rendering queues and draw lighting containers for each source
   */
  refresh() {
    if ( !this.initialized ) return;

    // Refresh visibility
    if ( this.tokenVision ) {
      this.refreshVisibility();
      this.visible = canvas.effects.visionSources.some(s => s.active) || !game.user.isGM;
    }
    else this.visible = false;

    // Update visibility of objects
    this.restrictVisibility();
  }

  /* -------------------------------------------- */

  /**
   * Update vision (and fog if necessary)
   */
  refreshVisibility() {
    canvas.masks.vision.renderDirty = true;
    if ( !this.vision ) return;
    const vision = this.vision;

    // Begin fills
    const fillColor = 0xFF0000;
    this.#cachedLights.beginFill(fillColor);
    vision.light.sources.clear().beginFill(fillColor);
    vision.light.preview.clear().beginFill(fillColor);
    vision.light.global.source.clear().beginFill(fillColor);
    vision.light.mask.clear().beginFill();
    vision.light.mask.preview.clear().beginFill();
    vision.sight.clear().beginFill(fillColor);
    vision.sight.preview.clear().beginFill(fillColor);
    vision.darkness.clear().beginFill(fillColor);

    // Checking if the lights cache needs a full redraw
    const redrawCache = this.#checkCachedLightSources();
    if ( redrawCache ) this.#cachedLightSourceStates.clear();

    // A flag to know if the lights cache render texture need to be refreshed
    let refreshCache = redrawCache;

    // A flag to know if fog need to be refreshed.
    let commitFog = false;

    // Iterating over each active light source
    for ( const [sourceId, lightSource] of canvas.effects.lightSources.entries() ) {
      // Ignoring inactive sources or global light (which is rendered using the global light mesh)
      if ( !lightSource.hasActiveLayer || (lightSource instanceof GlobalLightSource) ) continue;

      // Is the light source providing vision?
      if ( lightSource.data.vision ) {
        if ( lightSource.isPreview ) vision.light.mask.preview.drawShape(lightSource.shape);
        else {
          vision.light.mask.drawShape(lightSource.shape);
          commitFog = true;
        }
      }

      // Update the cached state. Skip if already cached.
      const isCached = this.#shouldCacheLight(lightSource);
      if ( isCached ) {
        if ( this.#cachedLightSourceStates.has(sourceId) ) continue;
        this.#cachedLightSourceStates.set(sourceId, lightSource.updateId);
        refreshCache = true;
      }

      // Draw the light source
      if ( isCached ) this.#cachedLights.drawShape(lightSource.shape);
      else if ( lightSource.isPreview ) vision.light.preview.drawShape(lightSource.shape);
      else vision.light.sources.drawShape(lightSource.shape);
    }

    // Refresh the light source cache if necessary.
    // Note: With a full redraw, we need to refresh the texture cache, even if no elements are present
    if ( refreshCache ) this.#cacheLights(redrawCache);

    // Refresh global/dynamic illumination with global source and illumination meshes
    this.#refreshDynamicIllumination();

    // Iterating over each active vision source
    for ( const visionSource of canvas.effects.visionSources ) {
      if ( !visionSource.hasActiveLayer ) continue;
      const blinded = visionSource.isBlinded;

      // Draw vision FOV
      if ( (visionSource.radius > 0) && !blinded && !visionSource.isPreview ) {
        vision.sight.drawShape(visionSource.shape);
        commitFog = true;
      }
      else vision.sight.preview.drawShape(visionSource.shape);

      // Draw light perception
      if ( (visionSource.lightRadius > 0) && !blinded && !visionSource.isPreview ) {
        vision.light.mask.drawShape(visionSource.light);
        commitFog = true;
      }
      else vision.light.mask.preview.drawShape(visionSource.light);
    }

    // Call visibility refresh hook
    Hooks.callAll("visibilityRefresh", this);

    // End fills
    vision.light.sources.endFill();
    vision.light.preview.endFill();
    vision.light.global.source.endFill();
    vision.light.mask.endFill();
    vision.light.mask.preview.endFill();
    vision.sight.endFill();
    vision.sight.preview.endFill();
    vision.darkness.endFill();

    // Update fog of war texture (if fow is activated)
    if ( commitFog ) canvas.fog.commit();
  }

  /* -------------------------------------------- */

  /**
   * Reset the exploration container with the fog sprite
   */
  resetExploration() {
    if ( !this.explored ) return;
    this.explored.destroy();
    this.explored = this.addChild(this.#createExploration());
  }

  /* -------------------------------------------- */

  /**
   * Refresh the dynamic illumination with darkness level meshes and global light.
   * Tell if a fence filter is needed when vision is rendered into a texture.
   */
  #refreshDynamicIllumination() {
    // Reset filter containment
    this.#needsContainment = false;

    // Setting global light source container visibility
    const globalLightSource = canvas.environment.globalLightSource;
    const v = this.vision.light.global.visible = globalLightSource.active;
    if ( !v ) return;
    const {min, max} = globalLightSource.data.darkness;

    // Draw the global source if necessary
    const darknessLevel = canvas.environment.darknessLevel;
    if ( (darknessLevel >= min) && (darknessLevel <= max) ) {
      this.vision.light.global.source.drawShape(globalLightSource.shape);
    }

    // Then draw dynamic illumination meshes
    const illuminationMeshes = this.vision.light.global.meshes.children;
    for ( const mesh of illuminationMeshes ) {
      const darknessLevel = mesh.shader.darknessLevel;
      if ( (darknessLevel < min) || (darknessLevel > max)) {
        mesh.blendMode = PIXI.BLEND_MODES.ERASE;
        this.#needsContainment = true;
      }
      else mesh.blendMode = PIXI.BLEND_MODES.MAX_COLOR;
    }
  }

  /* -------------------------------------------- */

  /**
   * Returns true if the light source should be cached.
   * @param {LightSource} lightSource    The light source
   * @returns {boolean}
   */
  #shouldCacheLight(lightSource) {
    return !(lightSource.object instanceof Token) && !lightSource.isPreview;
  }

  /* -------------------------------------------- */

  /**
   * Check if the cached light sources need to be fully redrawn.
   * @returns {boolean}    True if a full redraw is necessary.
   */
  #checkCachedLightSources() {
    for ( const [sourceId, updateId] of this.#cachedLightSourceStates ) {
      const lightSource = canvas.effects.lightSources.get(sourceId);
      if ( !lightSource || !lightSource.active || !this.#shouldCacheLight(lightSource)
        || (updateId !== lightSource.updateId) ) return true;
    }
    return false;
  }

  /* -------------------------------------------- */

  /**
   * Render `this.#cachedLights` into `this.vision.light.cached.texture`.
   * Note: A full cache redraw needs the texture to be cleared.
   * @param {boolean} clearTexture       If the texture need to be cleared before rendering.
   */
  #cacheLights(clearTexture) {
    const dims = canvas.dimensions;
    this.#renderTransform.tx = -dims.sceneX;
    this.#renderTransform.ty = -dims.sceneY;
    this.#cachedLights.blendMode = PIXI.BLEND_MODES.MAX_COLOR;
    canvas.app.renderer.render(this.#cachedLights, {
      renderTexture: this.vision.light.cached.texture,
      clear: clearTexture,
      transform: this.#renderTransform
    });
    this.#cachedLights.clear();
  }

  /* -------------------------------------------- */
  /*  Visibility Testing                          */
  /* -------------------------------------------- */

  /**
   * Restrict the visibility of certain canvas assets (like Tokens or DoorControls) based on the visibility polygon
   * These assets should only be displayed if they are visible given the current player's field of view
   */
  restrictVisibility() {
    // Activate or deactivate visual effects vision masking
    canvas.effects.toggleMaskingFilters(this.visible);

    // Tokens & Notes
    const flags = {refreshVisibility: true};
    for ( const token of canvas.tokens.placeables ) token.renderFlags.set(flags);
    for ( const note of canvas.notes.placeables ) note.renderFlags.set(flags);

    // Door Icons
    for ( const door of canvas.controls.doors.children ) door.visible = door.isVisible;

    Hooks.callAll("sightRefresh", this);
  }

  /* -------------------------------------------- */

  /**
   * Test whether a target point on the Canvas is visible based on the current vision and LOS polygons.
   * @param {Point|ElevatedPoint} point       The point in space to test
   * @param {object} [options]                Additional options which modify visibility testing.
   * @param {number} [options.tolerance=2]    A numeric radial offset which allows for a non-exact match.
   *                                          For example, if tolerance is 2 then the test will pass if the point
   *                                          is within 2px of a vision polygon.
   * @param {object|null} [options.object]    An optional reference to the object whose visibility is being tested
   * @returns {boolean}                       Whether the point is currently visible.
   */
  testVisibility(point, options={}) {

    // If no vision sources are present, the visibility is dependant of the type of user
    if ( !canvas.effects.visionSources.some(s => s.active) ) return game.user.isGM;

    // Prepare an array of test points depending on the requested tolerance
    const object = options.object ?? null;
    const config = this._createVisibilityTestConfig(point, options);

    // First test basic detection for light sources which specifically provide vision
    for ( const lightSource of canvas.effects.lightSources ) {
      if ( !lightSource.data.vision || !lightSource.active ) continue;
      const result = lightSource.testVisibility(config);
      if ( result === true ) return true;
    }

    // Get scene rect to test that some points are not detected into the padding
    const sr = canvas.dimensions.sceneRect;
    const inBuffer = !sr.contains(point.x, point.y);

    // Skip sources that are not both inside the scene or both inside the buffer
    const activeVisionSources = canvas.effects.visionSources.filter(s => s.active
      && (inBuffer !== sr.contains(s.x, s.y)));
    const modes = CONFIG.Canvas.detectionModes;

    // Second test Basic Sight and Light Perception tests for vision sources
    for ( const visionSource of activeVisionSources ) {
      if ( visionSource.isBlinded ) continue;
      const token = visionSource.object.document;
      const basicMode = token.detectionModes.find(m => m.id === "basicSight");
      if ( basicMode ) {
        const result = modes.basicSight.testVisibility(visionSource, basicMode, config);
        if ( result === true ) return true;
      }
      const lightMode = token.detectionModes.find(m => m.id === "lightPerception");
      if ( lightMode ) {
        const result = modes.lightPerception.testVisibility(visionSource, lightMode, config);
        if ( result === true ) return true;
      }
    }

    // Special detection modes can only detect tokens
    if ( !(object instanceof Token) ) return false;

    // Lastly test special detection modes for vision sources
    for ( const visionSource of activeVisionSources ) {
      const token = visionSource.object.document;
      for ( const mode of token.detectionModes ) {
        if ( (mode.id === "basicSight") || (mode.id === "lightPerception") ) continue;
        const dm = modes[mode.id];
        const result = dm?.testVisibility(visionSource, mode, config);
        if ( result === true ) {
          object.detectionFilter = dm.constructor.getDetectionFilter();
          return true;
        }
      }
    }
    return false;
  }

  /* -------------------------------------------- */

  /**
   * Create the visibility test config.
   * @param {Point|ElevatedPoint} point       The point in space to test
   * @param {object} [options]                Additional options which modify visibility testing.
   * @param {number} [options.tolerance=2]    A numeric radial offset which allows for a non-exact match.
   *                                          For example, if tolerance is 2 then the test will pass if the point
   *                                          is within 2px of a vision polygon.
   * @param {object|null} [options.object]    An optional reference to the object whose visibility is being tested
   * @returns {CanvasVisibilityTestConfiguration}
   * @internal
   */
  _createVisibilityTestConfig(point, {tolerance=2, object=null}={}) {
    const t = tolerance;
    const offsets = t > 0 ? [[0, 0], [-t, -t], [-t, t], [t, t], [t, -t], [-t, 0], [t, 0], [0, -t], [0, t]] : [[0, 0]];
    let {x, y, elevation} = point;
    if ( (elevation === undefined) && (object instanceof Token) ) elevation = object.document.elevation;
    else elevation ??= 0;
    return {
      object,
      tests: offsets.map(([dx, dy]) => Object.defineProperty({
        point: {x: x + dx, y: y + dy, elevation},
        los: new Map()
      }, "elevation", {
        get() {
          foundry.utils.logCompatibilityWarning("CanvasVisibilityTest#elevation has been deprecated "
            + "in favor of CanvasVisibilityTest#point.elevation.", {since: 13, until: 15, once: true});
          return this.point.elevation;
        },
        set(value) {
          foundry.utils.logCompatibilityWarning("CanvasVisibilityTest#elevation has been deprecated "
            + "in favor of CanvasVisibilityTest#point.elevation.", {since: 13, until: 15, once: true});
          this.point.elevation = value;
        }
      }))
    };
  }

  /* -------------------------------------------- */
  /*  Visibility Overlay and Texture management   */
  /* -------------------------------------------- */

  /**
   * Load the scene fog overlay if provided and attach the fog overlay sprite to this group.
   */
  async #drawVisibilityOverlay() {
    this.visibilityOverlay = undefined;
    this.#visibilityOverlayDimensions = [];
    const overlaySrc = canvas.sceneTextures.fogOverlay ?? canvas.scene.fog.overlay;
    const overlayTexture = overlaySrc instanceof PIXI.Texture ? overlaySrc : getTexture(overlaySrc);
    if ( !overlayTexture ) return;

    // Build sprite
    const fo = this.visibilityOverlay = new PIXI.Sprite(overlayTexture);
    const baseTex = overlayTexture.baseTexture;
    const bkg = canvas.primary.background;

    // Same intrinsic size as the background image?
    const sameSize = (bkg.texture.baseTexture.realWidth === baseTex.realWidth)
      && (bkg.texture.baseTexture.realHeight === baseTex.realHeight);

    if ( sameSize ) {
      // Re-use background transform to align perfectly
      fo.transform.setFromMatrix(bkg.localTransform)
      baseTex.wrapMode = PIXI.WRAP_MODES.CLAMP;
    }
    else {
      // Tile overlay across the entire scene
      const {width, height} = canvas.scene.dimensions;
      fo.position.set(0, 0);
      fo.width = width;
      fo.height = height;
      baseTex.wrapMode = PIXI.WRAP_MODES.REPEAT;
    }

    // The overlay is added to this canvas container to update its transforms only
    fo.renderable = false;
    this.addChild(this.visibilityOverlay);

    // Manage video playback
    const video = game.video.getVideoSource(overlayTexture);
    if ( video ) game.video.play(video, {volume: 0});

    // Store dimensions for shader calculations
    this.#visibilityOverlayDimensions = [fo.width, fo.height, bkg.width, bkg.height];
  }

  /* -------------------------------------------- */

  /**
   * Configure the fog texture will all required options.
   * Choose an adaptive fog rendering resolution which downscales the saved fog textures for larger dimension Scenes.
   * It is important that the width and height of the fog texture is evenly divisible by the downscaling resolution.
   * @returns {CanvasVisibilityTextureConfiguration}
   */
  #configureVisibilityTexture() {
    const dims = canvas.dimensions;
    let width = dims.sceneWidth;
    let height = dims.sceneHeight;
    const maxSize = CanvasVisibility.#MAXIMUM_VISIBILITY_TEXTURE_SIZE;

    // Adapt the fog texture resolution relative to some maximum size, and ensure that multiplying the scene dimensions
    // by the resolution results in an integer number in order to avoid fog drift.
    let resolution = 1.0;
    if ( (width >= height) && (width > maxSize) ) {
      resolution = maxSize / width;
      height = Math.ceil(height * resolution) / resolution;
    } else if ( height > maxSize ) {
      resolution = maxSize / height;
      width = Math.ceil(width * resolution) / resolution;
    }

    // Determine the fog texture options
    return this.#textureConfiguration = {
      resolution,
      width,
      height,
      mipmap: PIXI.MIPMAP_MODES.OFF,
      multisample: PIXI.MSAA_QUALITY.NONE,
      scaleMode: PIXI.SCALE_MODES.LINEAR,
      alphaMode: PIXI.ALPHA_MODES.NPM,
      format: PIXI.FORMATS.RED
    };
  }
}

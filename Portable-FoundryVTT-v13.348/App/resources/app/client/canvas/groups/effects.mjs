import CanvasGroupMixin from "./canvas-group-mixin.mjs";
import GlobalLightSource from "../sources/global-light-source.mjs";
import CanvasAnimation from "../animation/canvas-animation.mjs";
import CanvasBackgroundAlterationEffects from "../layers/effects/background-effects.mjs";
import CanvasIlluminationEffects from "../layers/effects/illumination-effects.mjs";
import CanvasColorationEffects from "../layers/effects/coloration-effects.mjs";
import CanvasDarknessEffects from "../layers/effects/darkness-effects.mjs";
import PointDarknessSource from "../sources/point-darkness-source.mjs";
import Hooks from "../../helpers/hooks.mjs";

/**
 * @import {ElevatedPoint} from "../../_types.mjs";
 * @import {PointLightSource} from "../../_types.mjs";
 * @import {PointDarknessSource} from "../../_types.mjs";
 */

/**
 * @typedef {foundry.utils.Collection} EffectsCollection
 */

/**
 * A container group which contains visual effects rendered above the primary group.
 *
 * TODO:
 *  The effects canvas group is now only performing shape initialization, logic that needs to happen at
 *  the placeable or object level is now their burden.
 *  - [DONE] Adding or removing a source from the EffectsCanvasGroup collection.
 *  - [TODO] A change in a darkness source should re-initialize all overlaping light and vision source.
 *
 * ### Hook Events
 * - {@link hookEvents.lightingRefresh}
 *
 * @category Canvas
 */
export default class EffectsCanvasGroup extends CanvasGroupMixin(PIXI.Container) {

  /**
   * The name of the darkness level animation.
   * @type {string}
   */
  static #DARKNESS_ANIMATION_NAME = "lighting.animateDarkness";

  /**
   * Whether to currently animate light sources.
   * @type {boolean}
   */
  animateLightSources = true;

  /**
   * Whether to currently animate vision sources.
   * @type {boolean}
   */
  animateVisionSources = true;

  /**
   * A mapping of light sources which are active within the rendered Scene.
   * @type {EffectsCollection<string, PointLightSource>}
   */
  lightSources = new foundry.utils.Collection();

  /**
   * A mapping of darkness sources which are active within the rendered Scene.
   * @type {EffectsCollection<string, PointDarknessSource>}
   */
  darknessSources = new foundry.utils.Collection();

  /**
   * A Collection of vision sources which are currently active within the rendered Scene.
   * @type {EffectsCollection<string, PointVisionSource>}
   */
  visionSources = new foundry.utils.Collection();

  /**
   * A set of vision mask filters used in visual effects group
   * @type {Set<VisualEffectsMaskingFilter>}
   */
  visualEffectsMaskingFilters = new Set();

  /**
   * An array of darkness and light sources whose edges contribute to the Scene.
   * The array is sorted by descending priority. In cases where multiple sources share the same priority, darkness
   * sources are placed before light sources to ensure they take precedence during polygon edges computations.
   * @type {(PointDarknessSource|PointLightSource)[]}
   */
  #highPrioritySources = [];

  /* -------------------------------------------- */

  /**
   * Iterator for all light and darkness sources.
   * @returns {Generator<PointDarknessSource|PointLightSource, void, void>}
   * @yields PointDarknessSource|PointLightSource
   */
  * allSources() {
    for ( const darknessSource of this.darknessSources ) yield darknessSource;
    for ( const lightSource of this.lightSources ) yield lightSource;
  }

  /* -------------------------------------------- */

  /** @override */
  _createLayers() {
    /**
     * A layer of background alteration effects which change the appearance of the primary group render texture.
     * @type {CanvasBackgroundAlterationEffects}
     */
    this.background = this.addChild(new CanvasBackgroundAlterationEffects());

    /**
     * A layer which adds illumination-based effects to the scene.
     * @type {CanvasIlluminationEffects}
     */
    this.illumination = this.addChild(new CanvasIlluminationEffects());

    /**
     * A layer which adds color-based effects to the scene.
     * @type {CanvasColorationEffects}
     */
    this.coloration = this.addChild(new CanvasColorationEffects());

    /**
     * A layer which adds darkness effects to the scene.
     * @type {CanvasDarknessEffects}
     */
    this.darkness = this.addChild(new CanvasDarknessEffects());

    return {
      background: this.background,
      illumination: this.illumination,
      coloration: this.coloration,
      darkness: this.darkness
    };
  }

  /* -------------------------------------------- */

  /**
   * Clear all effects containers and animated sources.
   */
  clearEffects() {
    this.background.clear();
    this.illumination.clear();
    this.coloration.clear();
    this.darkness.clear();
  }

  /* -------------------------------------------- */

  /** @override */
  async _draw(options) {
    // Draw each component layer
    await this.background.draw();
    await this.illumination.draw();
    await this.coloration.draw();
    await this.darkness.draw();

    // Call hooks
    Hooks.callAll("drawEffectsCanvasGroup", this);

    // Activate animation of drawn objects
    this.activateAnimation();
  }

  /* -------------------------------------------- */
  /*  Perception Management Methods               */
  /* -------------------------------------------- */

  /**
   * Initialize positive light sources which exist within the active Scene.
   * Packages can use the "initializeLightSources" hook to programmatically add light sources.
   */
  initializeLightSources() {
    for ( const source of this.lightSources ) source.initialize();
    Hooks.callAll("initializeLightSources", this);
  }

  /* -------------------------------------------- */

  /**
   * Initialize all sources that generate edges (Darkness and certain Light sources).
   * Darkness sources always generate edges. Light sources only do so if their priority is strictly greater than 0.
   * The `edgesSources` array will be rebuilt and sorted by descending priority, in the case of a tie,
   * DarknessSources take precedence. Otherwise, the existing array is used as-is.
   * Regardless of whether the array is rebuilt, each source is re-initialized to ensure their geometry is refreshed.
   */
  initializePriorityLightSources() {
    // TODO: Add a dirty flag to avoid recreating/sorting the array every times
    this.#highPrioritySources.length = 0;

    // Darkness sources always generate edges
    for ( const darknessSource of this.darknessSources ) this.#highPrioritySources.push(darknessSource);

    // Light sources generate edges only if priority > 0 (and we have at least one darkness source)
    if ( this.#highPrioritySources.length > 0 ) {
      for ( const lightSource of this.lightSources ) {
        if ( lightSource.priority > 0 ) this.#highPrioritySources.push(lightSource);
      }
    }

    // Sort by descending priority. In case of a tie, PointDarknessSource comes first
    this.#highPrioritySources.sort(
      (a, b) => (b.priority - a.priority) || ((b instanceof PointDarknessSource) - (a instanceof PointDarknessSource))
    );

    // Always re-initialize each source to update geometry or other data.
    for ( const source of this.#highPrioritySources ) source.initialize();
    Hooks.callAll("initializePriorityLightSources", this);
  }

  /* -------------------------------------------- */

  /**
   * Refresh the state and uniforms of all light sources and darkness sources objects.
   */
  refreshLightSources() {
    for ( const source of this.allSources() ) source.refresh();
    // FIXME: We need to refresh the field of an AmbientLight only after the initialization of the light source when
    // the shape of the source could have changed. We don't need to refresh all fields whenever lighting is refreshed.
    canvas.lighting.refreshFields();
  }

  /* -------------------------------------------- */

  /**
   * Refresh the state and uniforms of all VisionSource objects.
   */
  refreshVisionSources() {
    for ( const visionSource of this.visionSources ) visionSource.refresh();
  }

  /* -------------------------------------------- */

  /**
   * Refresh the active display of lighting.
   */
  refreshLighting() {

    // Apply illumination and visibility background color change
    if ( this.illumination.filter ) this.illumination.filter.uniforms.replacementColor = canvas.colors.background.rgb;
    if ( this.illumination.darknessLevelMeshes.clearColor[0] !== canvas.environment.darknessLevel ) {
      this.illumination.darknessLevelMeshes.clearColor[0] = canvas.environment.darknessLevel;
      this.illumination.invalidateDarknessLevelContainer(true);
    }
    const v = canvas.visibility.filter;
    if ( v ) {
      v.uniforms.visionTexture = canvas.masks.vision.renderTexture;
      v.uniforms.primaryTexture = canvas.primary.renderTexture;
      canvas.colors.fogExplored.applyRGB(v.uniforms.exploredColor);
      canvas.colors.fogUnexplored.applyRGB(v.uniforms.unexploredColor);
      canvas.colors.background.applyRGB(v.uniforms.backgroundColor);
    }

    // Clear effects
    canvas.effects.clearEffects();

    // Add effect meshes for active light and darkness sources
    for ( const source of this.allSources() ) this.#addLightEffect(source);

    // Add effect meshes for active vision sources
    for ( const visionSource of this.visionSources ) this.#addVisionEffect(visionSource);

    // Update vision filters state
    this.background.vision.filter.enabled = !!this.background.vision.children.length;
    this.background.visionPreferred.filter.enabled = !!this.background.visionPreferred.children.length;

    // Hide the background and/or coloration layers if possible
    const lightingOptions = canvas.visibility.visionModeData.activeLightingOptions;
    this.background.vision.visible = (this.background.vision.children.length > 0);
    this.background.visionPreferred.visible = (this.background.visionPreferred.children.length > 0);
    this.background.lighting.visible = (this.background.lighting.children.length > 0)
      || (lightingOptions.background?.postProcessingModes?.length > 0);
    this.coloration.visible = (this.coloration.children.length > 1)
      || (lightingOptions.coloration?.postProcessingModes?.length > 0);

    // Call hooks
    Hooks.callAll("lightingRefresh", this);
  }

  /* -------------------------------------------- */

  /**
   * Add a vision source to the effect layers.
   * @param {RenderedEffectSource & PointVisionSource} source     The vision source to add mesh layers
   */
  #addVisionEffect(source) {
    if ( !source.active || (source.radius <= 0) ) return;
    const meshes = source.drawMeshes();
    if ( meshes.background ) {
      // Is this vision source background need to be rendered into the preferred vision container, over other VS?
      const parent = source.preferred ? this.background.visionPreferred : this.background.vision;
      parent.addChild(meshes.background);
    }
    if ( meshes.illumination ) this.illumination.lights.addChild(meshes.illumination);
    if ( meshes.coloration ) this.coloration.addChild(meshes.coloration);
  }

  /* -------------------------------------------- */

  /**
   * Add a light source or a darkness source to the effect layers
   * @param {RenderedEffectSource & BaseLightSource} source   The light or darkness source to add to the effect layers.
   */
  #addLightEffect(source) {
    if ( !source.active ) return;
    const meshes = source.drawMeshes();
    if ( meshes.background ) this.background.lighting.addChild(meshes.background);
    if ( meshes.illumination ) this.illumination.lights.addChild(meshes.illumination);
    if ( meshes.coloration ) this.coloration.addChild(meshes.coloration);
    if ( meshes.darkness ) this.darkness.addChild(meshes.darkness);
  }

  /* -------------------------------------------- */

  /**
   * Test whether the point is inside light.
   * @param {ElevatedPoint} point        The point to test.
   * @param {object} [options={}]
   * @param {(source: PointLightSource) => boolean} [options.condition]  Optional condition a source must satisfy in
   * order to be tested.
   * @returns {boolean} Is inside light?
   */
  testInsideLight(point, options={}) {
    const isNumber = (typeof options === "number");

    /** @deprecated since v13 */
    if ( isNumber ) {
      foundry.utils.logCompatibilityWarning("EffectsCanvasGroup#testInsideLight(point: Point, elevation: number) has been deprecated "
        + "in favor of EffectsCanvasGroup#testInsideDarkness(point: ElevatedPoint, options: object).", {since: 13, until: 15, once: true});
      point = {x: point.x, y: point.y, elevation: options};
    }

    const globalLightSource = canvas.environment.globalLightSource;
    if ( globalLightSource.active ) {
      if ( options.condition?.(globalLightSource) !== false ) {
        const {min, max} = globalLightSource.data.darkness;
        const darknessLevel = this.getDarknessLevel(point);
        if ( (darknessLevel >= min) && (darknessLevel <= max) ) return true;
      }
    }

    for ( const lightSource of this.lightSources ) {
      if ( !lightSource.active || (lightSource instanceof GlobalLightSource) ) continue;
      if ( options.condition?.(lightSource) === false ) continue;
      if ( lightSource.testPoint(point) ) return true;
    }
    return false;
  }

  /* -------------------------------------------- */

  /**
   * Test whether the point is inside darkness.
   * @param {ElevatedPoint} point        The point to test.
   * @param {object} [options={}]
   * @param {(source: PointDarknessSource) => boolean} [options.condition]  Optional condition a source must satisfy in
   * order to be tested.
   * @returns {boolean} Is inside darkness?
   */
  testInsideDarkness(point, options={}) {
    const isNumber = (typeof options === "number");

    /** @deprecated since v13 */
    if ( isNumber ) {
      foundry.utils.logCompatibilityWarning("EffectsCanvasGroup#testInsideDarkness(point: Point, elevation: number) has been deprecated "
        + "in favor of EffectsCanvasGroup#testInsideDarkness(point: ElevatedPoint, options: object).", {since: 13, until: 15, once: true});
      point = {x: point.x, y: point.y, elevation: options};
    }

    for ( const darknessSource of this.darknessSources ) {
      if ( !darknessSource.active || darknessSource.isPreview ) continue;
      if ( options.condition?.(darknessSource) === false ) continue;
      if ( darknessSource.testPoint(point) ) return true;
    }
    return false;
  }

  /* -------------------------------------------- */

  /**
   * Get the darkness level at the given point.
   * @param {ElevatedPoint} point    The point.
   * @returns {number}               The darkness level.
   */
  getDarknessLevel(point, _elevation) {
    /** @deprecated since v13 */
    if ( _elevation !== undefined ) {
      foundry.utils.logCompatibilityWarning("EffectsCanvasGroup#getDarknessLevel(point: Point, elevation: number) has been deprecated "
        + "in favor of EffectsCanvasGroup#getDarknessLevel(point: ElevatedPoint).", {since: 13, until: 15, once: true});
      point = {x: point.x, y: point.y, elevation: _elevation};
    }
    const darknessLevelMeshes = canvas.effects.illumination.darknessLevelMeshes.children;
    for ( let i = darknessLevelMeshes.length - 1; i >= 0; i-- ) {
      const darknessLevelMesh = darknessLevelMeshes[i];
      if ( darknessLevelMesh.region.document.testPoint(point) ) {
        return darknessLevelMesh.shader.uniforms.darknessLevel;
      }
    }
    return canvas.environment.darknessLevel;
  }

  /* -------------------------------------------- */

  /** @override */
  async _tearDown(options) {
    CanvasAnimation.terminateAnimation(EffectsCanvasGroup.#DARKNESS_ANIMATION_NAME);
    this.deactivateAnimation();
    this.darknessSources.clear();
    this.lightSources.clear();
    for ( const c of this.children ) {
      if ( c.clear ) c.clear();
      else if ( c.tearDown ) await c.tearDown();
      else c.destroy();
    }
    this.visualEffectsMaskingFilters.clear();
  }

  /* -------------------------------------------- */

  /**
   * Activate vision masking for visual effects
   * @param {boolean} [enabled=true]    Whether to enable or disable vision masking
   */
  toggleMaskingFilters(enabled=true) {
    enabled = enabled && !canvas.visibilityOptions.persistentVision;
    for ( const f of this.visualEffectsMaskingFilters ) {
      f.uniforms.enableVisionMasking = enabled;
    }
  }

  /* -------------------------------------------- */

  /**
   * Activate post-processing effects for a certain effects channel.
   * @param {string} filterMode                     The filter mode to target.
   * @param {string[]} [postProcessingModes=[]]     The post-processing modes to apply to this filter.
   * @param {Object} [uniforms={}]                  The uniforms to update.
   */
  activatePostProcessingFilters(filterMode, postProcessingModes=[], uniforms={}) {
    for ( const f of this.visualEffectsMaskingFilters ) {
      if ( f.uniforms.mode === filterMode ) {
        f.updatePostprocessModes(postProcessingModes, uniforms);
      }
    }
  }

  /* -------------------------------------------- */

  /**
   * Reset post-processing modes on all Visual Effects masking filters.
   */
  resetPostProcessingFilters() {
    for ( const f of this.visualEffectsMaskingFilters ) {
      f.reset();
    }
  }

  /* -------------------------------------------- */
  /*  Animation Management                        */
  /* -------------------------------------------- */

  /**
   * Activate light source animation for AmbientLight objects within this layer
   */
  activateAnimation() {
    this.deactivateAnimation();
    if ( game.settings.get("core", "lightAnimation") === false ) return;
    canvas.app.ticker.add(this.#animateSources, this);
  }

  /* -------------------------------------------- */

  /**
   * Deactivate light source animation for AmbientLight objects within this layer
   */
  deactivateAnimation() {
    canvas.app.ticker.remove(this.#animateSources, this);
  }

  /* -------------------------------------------- */

  /**
   * The ticker handler which manages animation delegation
   * @param {number} dt   Delta time
   */
  #animateSources(dt) {

    // Animate light and darkness sources
    if ( this.animateLightSources ) {
      for ( const source of this.allSources() ) {
        source.animate(dt);
      }
    }

    // Animate vision sources
    if ( this.animateVisionSources ) {
      for ( const source of this.visionSources.values() ) {
        source.animate(dt);
      }
    }
  }

  /* -------------------------------------------- */

  /**
   * Animate a smooth transition of the darkness overlay to a target value.
   * Only begin animating if another animation is not already in progress.
   * @param {number} target     The target darkness level between 0 and 1
   * @param {number} duration   The desired animation time in milliseconds. Default is 10 seconds
   * @returns {Promise}         A Promise which resolves once the animation is complete
   */
  async animateDarkness(target=1.0, {duration=10000}={}) {
    CanvasAnimation.terminateAnimation(EffectsCanvasGroup.#DARKNESS_ANIMATION_NAME);
    if ( target === canvas.environment.darknessLevel ) return false;
    if ( duration <= 0 ) return canvas.environment.initialize({environment: {darknessLevel: target}});

    // Update with an animation
    const animationData = [{
      parent: {darkness: canvas.environment.darknessLevel},
      attribute: "darkness",
      to: Math.clamp(target, 0, 1)
    }];
    return CanvasAnimation.animate(animationData, {
      name: EffectsCanvasGroup.#DARKNESS_ANIMATION_NAME,
      duration: duration,
      ontick: (dt, animation) =>
        canvas.environment.initialize({environment: {darknessLevel: animation.attributes[0].parent.darkness}})
    }).then(completed => {
      if ( !completed ) canvas.environment.initialize({environment: {darknessLevel: target}});
    });
  }

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  get visibility() {
    const msg = "EffectsCanvasGroup#visibility has been deprecated and moved to "
      + "Canvas#visibility.";
    foundry.utils.logCompatibilityWarning(msg, {since: 12, until: 14});
    return canvas.visibility;
  }

  /**
   * @deprecated since v12
   * @ignore
   */
  get globalLightSource() {
    const msg = "EffectsCanvasGroup#globalLightSource has been deprecated and moved to "
      + "EnvironmentCanvasGroup#globalLightSource.";
    foundry.utils.logCompatibilityWarning(msg, {since: 12, until: 14});
    return canvas.environment.globalLightSource;
  }

  /**
   * @deprecated since v12
   * @ignore
   */
  updateGlobalLightSource() {
    const msg = "EffectsCanvasGroup#updateGlobalLightSource has been deprecated and is part of "
      + "EnvironmentCanvasGroup#initialize workflow.";
    foundry.utils.logCompatibilityWarning(msg, {since: 12, until: 14});
    canvas.environment.initialize();
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v13
   * @ignore
   */
  initializeDarknessSources() {
    const msg = "EffectsCanvasGroup#initializeDarknessSources and its associated hook are now obsolete and have no "
      + "replacement.";
    foundry.utils.logCompatibilityWarning(msg, {since: 13, until: 15});
    for ( const source of this.darknessSources ) source.initialize();
  }
}

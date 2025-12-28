import RegionBehaviorType from "./base.mjs";
import {REGION_EVENTS} from "@common/constants.mjs";
import RegionMesh from "../../canvas/placeables/regions/mesh.mjs";
import * as fields from "@common/data/fields.mjs";

/**
 * @import {RegionBehaviorViewedEvent, RegionBehaviorUnviewedEvent,
 *   RegionRegionBoundaryEvent} from "@client/documents/_types.mjs";
 */

/**
 * The data model for a behavior that allows to adjust the darkness level within the Region.
 */
export default class AdjustDarknessLevelRegionBehaviorType extends RegionBehaviorType {

  /** @override */
  static LOCALIZATION_PREFIXES = ["BEHAVIOR.TYPES.adjustDarknessLevel", "BEHAVIOR.TYPES.base"];

  /* ---------------------------------------- */

  /**
   * Darkness level behavior modes.
   * @enum {number}
   */
  static get MODES() {
    return AdjustDarknessLevelRegionBehaviorType.#MODES;
  }

  static #MODES = Object.freeze({
    /**
     * Override the darkness level with the modifier.
     */
    OVERRIDE: 0,

    /**
     * Brighten the darkness level: `darknessLevel * (1 - modifier)`
     */
    BRIGHTEN: 1,

    /**
     * Darken the darkness level: `1 - (1 - darknessLevel) * (1 - modifier)`.
     */
    DARKEN: 2
  });

  /* ---------------------------------------- */

  /** @override */
  static defineSchema() {
    return {
      mode: new fields.NumberField({required: true, blank: false, choices: Object.fromEntries(Object.entries(this.MODES)
          .map(([key, value]) => [value, `BEHAVIOR.TYPES.adjustDarknessLevel.MODES.${key}.label`])),
        initial: this.MODES.OVERRIDE, validationError: "must be a value in AdjustDarknessLevelRegionBehaviorType.MODES"}),
      modifier: new fields.AlphaField({initial: 0, step: 0.01})
    };
  }

  /* ---------------------------------------- */

  /**
   * Called when the darkness behavior is viewed.
   * @param {RegionBehaviorViewedEvent} event
   * @this {AdjustDarknessLevelRegionBehaviorType}
   */
  static async #onBehaviorViewed(event) {
    const {AdjustDarknessLevelRegionShader, IlluminationDarknessLevelRegionShader} = foundry.canvas.rendering.shaders;

    // Create darkness level mesh
    const dlMesh = new RegionMesh(this.region.object, AdjustDarknessLevelRegionShader);
    if ( canvas.performance.mode > CONST.CANVAS_PERFORMANCE_MODES.LOW ) {
      dlMesh._blurFilter = canvas.createBlurFilter(8, 2);
      dlMesh.filters = [dlMesh._blurFilter];
    }

    // Create illumination mesh
    const illMesh = new RegionMesh(this.region.object, IlluminationDarknessLevelRegionShader);

    // Common properties
    illMesh.name = dlMesh.name = this.behavior.uuid;
    illMesh.shader.mode = dlMesh.shader.mode = this.mode;
    illMesh.shader.modifier = dlMesh.shader.modifier = this.modifier;

    // Adding the mesh to their respective containers
    canvas.effects.illumination.darknessLevelMeshes.addChild(dlMesh);
    canvas.visibility.vision.light.global.meshes.addChild(illMesh);

    // Invalidate darkness level container and refresh vision if global light is enabled
    canvas.effects.illumination.invalidateDarknessLevelContainer(true);
    canvas.perception.update({refreshLighting: true, refreshVision: canvas.environment.globalLightSource.active});
  }

  /* ---------------------------------------- */

  /**
   * Called when the darkness behavior is unviewed.
   * @param {RegionBehaviorUnviewedEvent} event
   * @this {AdjustDarknessLevelRegionBehaviorType}
   */
  static async #onBehaviorUnviewed(event) {
    const dlMesh = canvas.effects.illumination.darknessLevelMeshes.getChildByName(this.behavior.uuid);
    if ( dlMesh._blurFilter ) canvas.blurFilters.delete(dlMesh._blurFilter);
    dlMesh.destroy();
    const ilMesh = canvas.visibility.vision.light.global.meshes.getChildByName(this.behavior.uuid);
    ilMesh.destroy();
    canvas.effects.illumination.invalidateDarknessLevelContainer(true);
    canvas.perception.update({refreshLighting: true, refreshVision: canvas.environment.globalLightSource.active});
  }

  /* ---------------------------------------- */

  /**
   * Called when the boundary of an event has changed.
   * @param {RegionRegionBoundaryEvent} event
   * @this {AdjustDarknessLevelRegionBehaviorType}
   */
  static async #onRegionBoundary(event) {
    if ( !this.behavior.viewed ) return;
    canvas.effects.illumination.invalidateDarknessLevelContainer(true);
    canvas.perception.update({refreshLighting: true, refreshVision: canvas.environment.globalLightSource.active});
  }

  /* ---------------------------------------- */

  /** @override */
  static events = {
    [REGION_EVENTS.BEHAVIOR_VIEWED]: this.#onBehaviorViewed,
    [REGION_EVENTS.BEHAVIOR_UNVIEWED]: this.#onBehaviorUnviewed,
    [REGION_EVENTS.REGION_BOUNDARY]: this.#onRegionBoundary
  };

  /* ---------------------------------------- */

  /** @inheritDoc */
  _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);
    if ( !("system" in changed) || !this.behavior.viewed ) return;
    const dlMesh = canvas.effects.illumination.darknessLevelMeshes.getChildByName(this.behavior.uuid);
    dlMesh.shader.mode = this.mode;
    dlMesh.shader.modifier = this.modifier;
    const ilMesh = canvas.visibility.vision.light.global.meshes.getChildByName(this.behavior.uuid);
    ilMesh.shader.mode = this.mode;
    ilMesh.shader.modifier = this.modifier;
    canvas.effects.illumination.invalidateDarknessLevelContainer(true);
    canvas.perception.update({refreshLighting: true, refreshVision: canvas.environment.globalLightSource.active});
  }
}

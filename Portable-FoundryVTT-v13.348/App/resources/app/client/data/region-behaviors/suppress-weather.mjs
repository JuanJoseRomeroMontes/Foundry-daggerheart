import RegionBehaviorType from "./base.mjs";
import RegionMesh from "../../canvas/placeables/regions/mesh.mjs";
import {REGION_EVENTS} from "../../../common/constants.mjs";

/**
 * @import {RegionBehaviorViewedEvent, RegionBehaviorUnviewedEvent} from "@client/documents/_types.mjs";
 */

/**
 * The data model for a behavior that allows to suppress weather effects within the Region
 */
export default class SuppressWeatherRegionBehaviorType extends RegionBehaviorType {

  /** @override */
  static LOCALIZATION_PREFIXES = ["BEHAVIOR.TYPES.suppressWeather", "BEHAVIOR.TYPES.base"];

  /* ---------------------------------------- */

  /** @override */
  static defineSchema() {
    return {};
  }

  /* ---------------------------------------- */

  /**
   * Called when the weather behavior is viewed.
   * @param {RegionBehaviorViewedEvent} event
   * @this {SuppressWeatherRegionBehaviorType}
   */
  static async #onBehaviorViewed(event) {
    const mesh = new RegionMesh(this.region.object);
    mesh.name = this.behavior.uuid;
    mesh.blendMode = PIXI.BLEND_MODES.ERASE;
    canvas.weather.suppression.addChild(mesh);
  }

  /* ---------------------------------------- */

  /**
   * Called when the weather behavior is unviewed.
   * @param {RegionBehaviorUnviewedEvent} event
   * @this {SuppressWeatherRegionBehaviorType}
   */
  static async #onBehaviorUnviewed(event) {
    const mesh = canvas.weather.suppression.getChildByName(this.behavior.uuid);
    mesh.destroy();
  }

  /* ---------------------------------------- */

  /** @override */
  static events = {
    [REGION_EVENTS.BEHAVIOR_VIEWED]: this.#onBehaviorViewed,
    [REGION_EVENTS.BEHAVIOR_UNVIEWED]: this.#onBehaviorUnviewed
  };
}

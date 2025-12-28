import DataModel from "@common/abstract/data.mjs";
import * as fields from "@common/data/fields.mjs";
import Token from "../placeables/token.mjs";

/**
 * @import {CanvasVisibilityTest, CanvasVisibilityTestConfiguration} from "@client/_types.mjs";
 * @import {TokenDetectionMode} from "@common/documents/_types.mjs";
 * @import PointVisionSource from "../sources/point-vision-source.mjs";
 */

/**
 * A Detection Mode which can be associated with any kind of sense/vision/perception.
 * A token could have multiple detection modes.
 */
export default class DetectionMode extends DataModel {

  /** @override */
  static defineSchema() {
    return {
      id: new fields.StringField({blank: false}),
      label: new fields.StringField({blank: false}),
      tokenConfig: new fields.BooleanField({initial: true}),       // If this DM is available in Token Config UI
      walls: new fields.BooleanField({initial: true}),             // If this DM is constrained by walls
      angle: new fields.BooleanField({initial: true}),             // If this DM is constrained by the vision angle
      type: new fields.NumberField({
        initial: this.DETECTION_TYPES.SIGHT,
        choices: Object.values(this.DETECTION_TYPES)
      })
    };
  }

  /* -------------------------------------------- */

  /**
   * Get the detection filter pertaining to this mode.
   * @returns {PIXI.Filter|undefined}
   */
  static getDetectionFilter() {
    return this._detectionFilter;
  }

  /**
   * An optional filter to apply on the target when it is detected with this mode.
   * @type {PIXI.Filter|undefined}
   */
  static _detectionFilter;

  /* -------------------------------------------- */

  /**
   * The types of the detection mode.
   * @type {Readonly<{SIGHT: number, SOUND: number, MOVE: number, OTHER: number}>}
   */
  static get DETECTION_TYPES() {
    return DetectionMode.#DETECTION_TYPES;
  }

  static #DETECTION_TYPES = Object.freeze({
    SIGHT: 0,       // Sight, and anything depending on light perception
    SOUND: 1,       // What you can hear. Includes echolocation for bats per example
    MOVE: 2,        // This is mostly a sense for touch and vibration, like tremorsense, movement detection, etc.
    OTHER: 3        // Can't fit in other types (smell, life sense, trans-dimensional sense, sense of humor...)
  });

  /* -------------------------------------------- */

  /**
   * The identifier of the basic sight detection mode.
   * @type {"basicSight"}
   */
  static get BASIC_MODE_ID() {
    return "basicSight";
  }

  /* -------------------------------------------- */
  /*  Visibility Testing                          */
  /* -------------------------------------------- */

  /**
   * Test visibility of a target object or array of points for a specific vision source.
   * @param {PointVisionSource} visionSource             The vision source being tested
   * @param {TokenDetectionMode} mode                    The detection mode configuration
   * @param {CanvasVisibilityTestConfiguration} config   The visibility test configuration
   * @returns {boolean}                                  Is the test target visible?
   */
  testVisibility(visionSource, mode, {object, tests}) {
    if ( !mode.enabled ) return false;
    if ( !this._canDetect(visionSource, object) ) return false;
    return tests.some(test => this._testPoint(visionSource, mode, object, test));
  }

  /* -------------------------------------------- */

  /**
   * Can this PointVisionSource theoretically detect a certain object based on its properties?
   * This check should not consider the relative positions of either object, only their state.
   * @param {PointVisionSource} visionSource   The vision source being tested
   * @param {object|null} target               The target object being tested
   * @returns {boolean}                        Can the target object theoretically be detected by this vision source?
   * @protected
   */
  _canDetect(visionSource, target) {
    const src = visionSource.object.document;
    const isSight = this.type === DetectionMode.DETECTION_TYPES.SIGHT;

    // Sight-based detection fails when blinded
    if ( isSight && src.hasStatusEffect(CONFIG.specialStatusEffects.BLIND) ) return false;

    // Detection fails if burrowing unless walls are ignored
    if ( this.walls && src.hasStatusEffect(CONFIG.specialStatusEffects.BURROW) ) return false;
    if ( target instanceof Token ) {
      const tgt = target.document;

      // Sight-based detection cannot see invisible tokens
      if ( isSight && tgt.hasStatusEffect(CONFIG.specialStatusEffects.INVISIBLE) ) return false;

      // Burrowing tokens cannot be detected unless walls are ignored
      if ( this.walls && tgt.hasStatusEffect(CONFIG.specialStatusEffects.BURROW) ) return false;
    }
    return true;
  }

  /* -------------------------------------------- */

  /**
   * Evaluate a single test point to confirm whether it is visible.
   * Standard detection rules require that the test point be both within LOS and within range.
   * @param {PointVisionSource} visionSource      The vision source being tested
   * @param {TokenDetectionMode} mode             The detection mode configuration
   * @param {object|null} target                  The target object being tested
   * @param {CanvasVisibilityTest} test           The test case being evaluated
   * @returns {boolean}
   * @protected
   */
  _testPoint(visionSource, mode, target, test) {
    if ( !this._testRange(visionSource, mode, target, test) ) return false;
    return this._testLOS(visionSource, mode, target, test);
  }

  /* -------------------------------------------- */

  /**
   * Test whether the line-of-sight requirement for detection is satisfied.
   * Always true if the detection mode bypasses walls, otherwise the test point must be contained by the LOS polygon.
   * The result of is cached for the vision source so that later checks for other detection modes do not repeat it.
   * @param {PointVisionSource} visionSource  The vision source being tested
   * @param {TokenDetectionMode} mode         The detection mode configuration
   * @param {object|null} target              The target object being tested
   * @param {CanvasVisibilityTest} test       The test case being evaluated
   * @returns {boolean}                       Is the LOS requirement satisfied for this test?
   * @protected
   */
  _testLOS(visionSource, mode, target, test) {
    if ( !this.walls ) return this._testAngle(visionSource, mode, target, test);
    const type = visionSource.constructor.sourceType;
    const isSight = type === "sight";
    if ( isSight && visionSource.blinded.darkness ) return false;
    if ( !this.angle && (visionSource.data.angle < 360) ) {
      // Constrained by walls but not by vision angle
      return !CONFIG.Canvas.polygonBackends[type].testCollision(
        visionSource.origin,
        test.point,
        { type, mode: "any", source: visionSource, useThreshold: true, priority: visionSource.priority }
      );
    }
    // Constrained by walls and vision angle
    let hasLOS = test.los.get(visionSource);
    if ( hasLOS === undefined ) {
      hasLOS = visionSource.los.contains(test.point.x, test.point.y);
      test.los.set(visionSource, hasLOS);
    }
    return hasLOS;
  }

  /* -------------------------------------------- */

  /**
   * Test whether the target is within the vision angle.
   * @param {PointVisionSource} visionSource  The vision source being tested
   * @param {TokenDetectionMode} mode         The detection mode configuration
   * @param {object|null} target              The target object being tested
   * @param {CanvasVisibilityTest} test       The test case being evaluated
   * @returns {boolean}                       Is the point within the vision angle?
   * @protected
   */
  _testAngle(visionSource, mode, target, test) {
    if ( !this.angle ) return true;
    const { angle, rotation, externalRadius } = visionSource.data;
    if ( angle >= 360 ) return true;
    const point = test.point;
    const dx = point.x - visionSource.x;
    const dy = point.y - visionSource.y;
    if ( (dx * dx) + (dy * dy) <= (externalRadius * externalRadius) ) return true;
    const aMin = rotation + 90 - (angle / 2);
    const a = Math.toDegrees(Math.atan2(dy, dx));
    return (((a - aMin) % 360) + 360) % 360 <= angle;
  }

  /* -------------------------------------------- */

  /**
   * Verify that a target is in range of a source.
   * @param {PointVisionSource} visionSource      The vision source being tested
   * @param {TokenDetectionMode} mode             The detection mode configuration
   * @param {object|null} target                  The target object being tested
   * @param {CanvasVisibilityTest} test           The test case being evaluated
   * @returns {boolean}                           Is the target within range?
   * @protected
   */
  _testRange(visionSource, mode, target, test) {
    const range = mode.range;
    if ( range <= 0 ) return false;
    if ( range === Infinity ) return true;
    const point = test.point;
    const {x, y} = visionSource.data;
    const radius = visionSource.object.getLightRadius(range);
    const dx = point.x - x;
    const dy = point.y - y;
    return ((dx * dx) + (dy * dy)) <= (radius * radius);
  }

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /**
   * @deprecated since v13
   * @ignore
   */
  get BASIC_MODE_ID() {
    foundry.utils.logCompatibilityWarning(`${this.constructor.name}#BASIC_MODE_ID is deprecated. `
      + `Please use ${this.constructor.name}.BASIC_MODE_ID instead.`,
      {since: 13, until: 15, once: true});
    return DetectionMode.BASIC_MODE_ID;
  }
}

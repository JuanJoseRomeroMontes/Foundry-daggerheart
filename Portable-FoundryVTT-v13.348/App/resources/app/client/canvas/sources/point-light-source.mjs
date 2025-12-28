import TokenDocument from "@client/documents/token.mjs";
import BaseLightSource from "./base-light-source.mjs";
import PointEffectSourceMixin from "./point-effect-source.mjs";

/**
 * @import {CanvasVisibilityTestConfiguration} from "../../_types.mjs";
 */

/**
 * A specialized subclass of the BaseLightSource which renders a source of light as a point-based effect.
 * @extends {BaseLightSource}
 * @mixes PointEffectSourceMixin
 */
export default class PointLightSource extends PointEffectSourceMixin(BaseLightSource) {

  /** @override */
  static effectsCollection = "lightSources";

  /** @override */
  get requiresEdges() {
    return this.priority > 0;
  }

  /* -------------------------------------------- */
  /*  Source Suppression Management               */
  /* -------------------------------------------- */

  /**
   * Update darkness suppression according to darkness sources collection.
   */
  #updateDarknessSuppression() {
    const condition = darknessSource => this.priority <= darknessSource.priority;
    this.suppression.darkness = canvas.effects.testInsideDarkness(this.origin, {condition});
  }

  /* -------------------------------------------- */
  /*  Light Source Initialization                 */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _initialize(data) {
    super._initialize(data);
    Object.assign(this.data, {
      radius: Math.max(this.data.dim ?? 0, this.data.bright ?? 0)
    });
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _createShapes() {
    this.#updateDarknessSuppression();
    super._createShapes();
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _configure(changes) {
    this.ratio = Math.clamp(Math.abs(this.data.bright) / this.data.radius, 0, 1);
    super._configure(changes);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _getPolygonConfiguration() {
    return Object.assign(super._getPolygonConfiguration(), {
      useThreshold: true
    });
  }

  /* -------------------------------------------- */
  /*  Visibility Testing                          */
  /* -------------------------------------------- */

  /**
   * Test whether this LightSource provides visibility to see a certain target object.
   * @param {CanvasVisibilityTestConfiguration} config    The visibility test configuration
   * @returns {boolean}                                   Is the target object visible to this source?
   */
  testVisibility({tests, object}) {
    if ( !(this.data.vision && this._canDetectObject(object)) ) return false;
    return tests.some(test => this.shape.contains(test.point.x, test.point.y));
  }

  /* -------------------------------------------- */

  /**
   * Can this LightSource theoretically detect a certain object based on its properties?
   * This check should not consider the relative positions of either object, only their state.
   * @param {PlaceableObject} target      The target object being tested
   * @returns {boolean}                   Can the target object theoretically be detected by this vision source?
   * @protected
   */
  _canDetectObject(target) {
    const tgt = target?.document;
    const isInvisible = ((tgt instanceof TokenDocument) && tgt.hasStatusEffect(CONFIG.specialStatusEffects.INVISIBLE));
    return !isInvisible;
  }
}

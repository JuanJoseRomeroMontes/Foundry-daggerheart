
import {default as SMAAEdgeDetectionFilter} from "./edges.mjs";
import {default as SMAABlendingWeightCalculationFilter} from "./weights.mjs";
import {default as SMAANeighborhoodBlendingFilter} from "./blend.mjs";
import {deepFreeze} from "@common/utils/helpers.mjs";

/**
 * @import {DeepReadonly} from "@common/_types.mjs";
 * @import {SMAAFilterConfig} from "./_types.mjs";
 */

/**
 * The SMAA filter.
 * @see {@link foundry.canvas.rendering.filters.SMAAEdgeDetectionFilter}
 * @see {@link foundry.canvas.rendering.filters.SMAABlendingWeightCalculationFilter}
 * @see {@link foundry.canvas.rendering.filters.SMAANeighborhoodBlendingFilter}
 */
export default class SMAAFilter extends PIXI.Filter {
  /**
   * @param {Partial<SMAAFilterConfig>} [config]
   */
  constructor({threshold=0.1, localContrastAdaptionFactor=2.0, maxSearchSteps=16, maxSearchStepsDiag=8,
    cornerRounding=25, disableDiagDetection=false, disableCornerDetection=false}={}) {
    super();
    const config = {threshold, localContrastAdaptionFactor, maxSearchSteps, maxSearchStepsDiag, cornerRounding,
      disableDiagDetection, disableCornerDetection};
    this.#edgesFilter = new SMAAEdgeDetectionFilter(config);
    this.#weightsFilter = new SMAABlendingWeightCalculationFilter(config);
    this.#blendFilter = new SMAANeighborhoodBlendingFilter();
  }

  /* -------------------------------------------- */

  /**
   * The presets.
   * @type {DeepReadonly<Record<"LOW"|"MEDIUM"|"HIGH"|"ULTRA", SMAAFilterConfig>>}
   */
  static get PRESETS() {
    return SMAAFilter.#PRESETS;
  }

  static #PRESETS = deepFreeze({
    LOW: {
      threshold: 0.15,
      localContrastAdaptionFactor: 2.0,
      maxSearchSteps: 4,
      maxSearchStepsDiag: 0,
      cornerRounding: 0,
      disableDiagDetection: true,
      disableCornerDetection: true
    },
    MEDIUM: {
      threshold: 0.1,
      localContrastAdaptionFactor: 2.0,
      maxSearchSteps: 8,
      maxSearchStepsDiag: 0,
      cornerRounding: 0,
      disableDiagDetection: true,
      disableCornerDetection: true
    },
    HIGH: {
      threshold: 0.1,
      localContrastAdaptionFactor: 2.0,
      maxSearchSteps: 16,
      maxSearchStepsDiag: 8,
      cornerRounding: 25,
      disableDiagDetection: false,
      disableCornerDetection: false
    },
    ULTRA: {
      threshold: 0.05,
      localContrastAdaptionFactor: 2.0,
      maxSearchSteps: 32,
      maxSearchStepsDiag: 16,
      cornerRounding: 25,
      disableDiagDetection: false,
      disableCornerDetection: false
    }
  });

  /* -------------------------------------------- */

  /**
   * The edge detection filter.
   * @type {SMAAEdgeDetectionFilter}
   */
  #edgesFilter;

  /* -------------------------------------------- */

  /**
   * The blending weight calculation filter.
   * @type {SMAABlendingWeightCalculationFilter}
   */
  #weightsFilter;

  /* -------------------------------------------- */

  /**
   * The neighborhood blending filter.
   * @type {SMAANeighborhoodBlendingFilter}
   */
  #blendFilter;

  /* -------------------------------------------- */

  /** @override */
  apply(filterManager, input, output, clearMode, currentState) {
    const edgesTex = filterManager.getFilterTexture();
    const blendTex = filterManager.getFilterTexture();
    this.#edgesFilter.apply(filterManager, input, edgesTex, PIXI.CLEAR_MODES.CLEAR, currentState);
    this.#weightsFilter.apply(filterManager, edgesTex, blendTex, PIXI.CLEAR_MODES.CLEAR, currentState);
    this.#blendFilter.uniforms.blendTex = blendTex;
    this.#blendFilter.apply(filterManager, input, output, clearMode, currentState);
    filterManager.returnFilterTexture(edgesTex);
    filterManager.returnFilterTexture(blendTex);
  }
}

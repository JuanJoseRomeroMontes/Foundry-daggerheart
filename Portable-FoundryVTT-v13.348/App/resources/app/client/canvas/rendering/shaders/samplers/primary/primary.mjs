import OccludableSamplerShader from "./occlusion.mjs";
import DepthSamplerShader from "./depth.mjs";

/**
 * The base shader class of {@link foundry.canvas.primary.PrimarySpriteMesh}.
 */
export default class PrimaryBaseSamplerShader extends OccludableSamplerShader {

  /**
   * The depth shader class associated with this shader.
   * @type {typeof DepthSamplerShader}
   */
  static depthShaderClass = DepthSamplerShader;

  /* -------------------------------------------- */

  /**
   * The depth shader associated with this shader.
   * The depth shader is lazily constructed.
   * @type {DepthSamplerShader}
   */
  get depthShader() {
    return this.#depthShader ??= this.#createDepthShader();
  }

  #depthShader;

  /* -------------------------------------------- */

  /**
   * Create the depth shader and configure it.
   * @returns {DepthSamplerShader}
   */
  #createDepthShader() {
    const depthShader = this.constructor.depthShaderClass.create();
    this._configureDepthShader(depthShader);
    return depthShader;
  }

  /* -------------------------------------------- */

  /**
   * One-time configuration that is called when the depth shader is created.
   * @param {DepthSamplerShader} depthShader    The depth shader
   * @protected
   */
  _configureDepthShader(depthShader) {}
}


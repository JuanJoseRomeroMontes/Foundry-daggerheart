import BaseShaderMixin from "../mixins/base-shader-mixin.mjs";

/**
 * An abstract filter which provides a framework for reusable definition
 * @extends {PIXI.Filter}
 * @mixes BaseShaderMixin
 * @abstract
 */
export default class AbstractBaseFilter extends BaseShaderMixin(PIXI.Filter) {
  /**
   * The default uniforms used by the filter
   * @type {object}
   */
  static defaultUniforms = {};

  /**
   * The fragment shader which renders this filter.
   * @type {string}
   */
  static fragmentShader = undefined;

  /**
   * The vertex shader which renders this filter.
   * @type {string}
   */
  static vertexShader = undefined;

  /**
   * A factory method for creating the filter using its defined default values.
   * @param {object} [initialUniforms]  Initial uniform values which override filter defaults
   * @returns {AbstractBaseFilter}      The constructed AbstractFilter instance.
   */
  static create(initialUniforms={}) {
    return new this(this.vertexShader, this.fragmentShader, {...this.defaultUniforms, ...initialUniforms});
  }
}


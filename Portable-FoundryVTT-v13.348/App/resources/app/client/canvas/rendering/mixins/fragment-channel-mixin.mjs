/**
 * A mixin that decorates a shader or filter and construct a fragment shader according to a chosen channel.
 * @category Mixins
 * @param {typeof PIXI.Shader|PIXI.Filter} ShaderClass The parent ShaderClass class being mixed.
 */
export default function AdaptiveFragmentChannelMixin(ShaderClass) {
  class AdaptiveFragmentChannelMixin extends ShaderClass {

    /**
     * The fragment shader which renders this filter.
     * A subclass of AdaptiveFragmentChannelMixin must implement the fragmentShader static field.
     * @type {Function}
     */
    static adaptiveFragmentShader = null;

    /**
     * A factory method for creating the filter using its defined default values
     * @param {object} [options]                Options which affect filter construction
     * @param {object} [options.uniforms]       Initial uniforms provided to the filter/shader
     * @param {string} [options.channel="r"]    The color channel to target for masking
     * @returns {PIXI.Shader|PIXI.Filter}
     */
    static create({channel="r", ...uniforms}={}) {
      this.fragmentShader = this.adaptiveFragmentShader(channel);
      return super.create(uniforms);
    }
  }
  return AdaptiveFragmentChannelMixin;
}

import BaseSamplerShader from "./base-sampler.mjs";

/**
 * A simple shader that makes the original texture's red channel the alpha channel while still keeping channel
 * information. Used in conjunction with the AlphaBlurFilterPass and Fog of War.
 */
export default class FogSamplerShader extends BaseSamplerShader {
  /** @override */
  static classPluginName = null;

  /** @override */
  static fragmentShader = `
    precision ${PIXI.settings.PRECISION_FRAGMENT} float;
    uniform sampler2D sampler;
    uniform vec4 tintAlpha;
    varying vec2 vUvs;
    void main() {
        vec4 color = texture2D(sampler, vUvs);
        gl_FragColor = vec4(1.0, color.gb, 1.0) * step(0.15, color.r) * tintAlpha;
    }`;
}

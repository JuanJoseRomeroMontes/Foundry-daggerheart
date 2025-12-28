import BaseSamplerShader from "./base-sampler.mjs";

/**
 * Compute baseline illumination according to darkness level encoded texture.
 */
export default class BaselineIlluminationSamplerShader extends BaseSamplerShader {

  /** @override */
  static classPluginName = null;

  /** @inheritdoc */
  static fragmentShader = `
    precision ${PIXI.settings.PRECISION_FRAGMENT} float;
    uniform sampler2D sampler;
    uniform vec4 tintAlpha;
    uniform vec3 ambientDarkness;
    uniform vec3 ambientDaylight;
    varying vec2 vUvs;    

    void main() {
      float illuminationRed = texture2D(sampler, vUvs).r;
      vec3 finalColor = mix(ambientDaylight, ambientDarkness, illuminationRed);
      gl_FragColor = vec4(finalColor, 1.0) * tintAlpha;
    }`;

  /** @inheritdoc */
  static defaultUniforms = {
    tintAlpha: [1, 1, 1, 1],
    ambientDarkness: [0, 0, 0],
    ambientDaylight: [1, 1, 1],
    sampler: null
  };

  /* -------------------------------------------- */

  /** @inheritDoc */
  _preRender(mesh, renderer) {
    super._preRender(mesh, renderer);
    const c = canvas.colors;
    const u = this.uniforms;
    c.ambientDarkness.applyRGB(u.ambientDarkness);
    c.ambientDaylight.applyRGB(u.ambientDaylight);
  }
}

import AbstractBaseFilter from "./base-filter.mjs";

/**
 * A minimalist filter (just used for blending)
 */
export default class VoidFilter extends AbstractBaseFilter {
  /** @override */
  static fragmentShader = `
  varying vec2 vTextureCoord;
  uniform sampler2D uSampler;
  void main() {
    gl_FragColor = texture2D(uSampler, vTextureCoord);
  }`;
}

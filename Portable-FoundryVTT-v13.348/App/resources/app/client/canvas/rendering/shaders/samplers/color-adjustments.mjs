import BaseSamplerShader from "./base-sampler.mjs";

/**
 * A color adjustment shader.
 */
export default class ColorAdjustmentsSamplerShader extends BaseSamplerShader {

  /** @override */
  static classPluginName = null;

  /* -------------------------------------------- */

  /** @override */
  static vertexShader = `
    precision ${PIXI.settings.PRECISION_VERTEX} float;
    attribute vec2 aVertexPosition;
    attribute vec2 aTextureCoord;
    uniform mat3 projectionMatrix;
    uniform vec2 screenDimensions;
    varying vec2 vUvs;
    varying vec2 vScreenCoord;

    void main() {
      gl_Position = vec4((projectionMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
      vUvs = aTextureCoord;
      vScreenCoord = aVertexPosition / screenDimensions;
    }`;

  /* -------------------------------------------- */

  /** @override */
  static fragmentShader = `
    precision ${PIXI.settings.PRECISION_FRAGMENT} float;
    uniform sampler2D sampler;
    uniform vec4 tintAlpha;
    uniform vec3 tint;
    uniform float exposure;
    uniform float contrast;
    uniform float saturation;
    uniform float brightness;
    uniform sampler2D darknessLevelTexture;
    uniform bool linkedToDarknessLevel;
    varying vec2 vUvs;
    varying vec2 vScreenCoord;

    ${this.CONSTANTS}
    ${this.PERCEIVED_BRIGHTNESS}

    void main() {
      vec4 baseColor = texture2D(sampler, vUvs);

      if ( baseColor.a > 0.0 ) {
        // Unmultiply rgb with alpha channel
        baseColor.rgb /= baseColor.a;

        // Copy original color before update
        vec3 originalColor = baseColor.rgb;

        ${this.ADJUSTMENTS}

        if ( linkedToDarknessLevel ) {
          float darknessLevel = texture2D(darknessLevelTexture, vScreenCoord).r;
          baseColor.rgb = mix(originalColor, baseColor.rgb, darknessLevel);
        }

        // Multiply rgb with tint and alpha channel
        baseColor.rgb *= (tint * baseColor.a);
      }

      // Output with tint and alpha
      gl_FragColor = baseColor * tintAlpha;
    }`;

  /* -------------------------------------------- */

  /** @inheritdoc */
  static defaultUniforms = {
    tintAlpha: [1, 1, 1, 1],
    tint: [1, 1, 1],
    contrast: 0,
    saturation: 0,
    exposure: 0,
    sampler: null,
    linkedToDarknessLevel: false,
    darknessLevelTexture: null,
    screenDimensions: [1, 1]
  };

  /* -------------------------------------------- */

  get linkedToDarknessLevel() {
    return this.uniforms.linkedToDarknessLevel;
  }

  set linkedToDarknessLevel(link) {
    this.uniforms.linkedToDarknessLevel = link;
  }

  /* -------------------------------------------- */

  get contrast() {
    return this.uniforms.contrast;
  }

  set contrast(contrast) {
    this.uniforms.contrast = contrast;
  }

  /* -------------------------------------------- */

  get exposure() {
    return this.uniforms.exposure;
  }

  set exposure(exposure) {
    this.uniforms.exposure = exposure;
  }

  /* -------------------------------------------- */

  get saturation() {
    return this.uniforms.saturation;
  }

  set saturation(saturation) {
    this.uniforms.saturation = saturation;
  }
}

import ColorAdjustmentsSamplerShader from "./color-adjustments.mjs";

/**
 * A light amplification shader.
 */
export default class AmplificationSamplerShader extends ColorAdjustmentsSamplerShader {

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
    }
  `;

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
    uniform bool enable;
    varying vec2 vUvs;
    varying vec2 vScreenCoord;

    ${this.CONSTANTS}
    ${this.PERCEIVED_BRIGHTNESS}

    void main() {
      vec4 baseColor = texture2D(sampler, vUvs);

      if ( enable && baseColor.a > 0.0 ) {
        // Unmultiply rgb with alpha channel
        baseColor.rgb /= baseColor.a;

        float lum = perceivedBrightness(baseColor.rgb);
        vec3 vision = vec3(smoothstep(0.0, 1.0, lum * 1.5)) * tint;
        float darknessLevel = texture2D(darknessLevelTexture, vScreenCoord).r;
        baseColor.rgb = vision + (vision * (lum + brightness) * 0.1) + (baseColor.rgb * (1.0 - darknessLevel) * 0.125);

        ${this.ADJUSTMENTS}

        // Multiply rgb with alpha channel
        baseColor.rgb *= baseColor.a;
      }

      // Output with tint and alpha
      gl_FragColor = baseColor * tintAlpha;
    }`;

  /* -------------------------------------------- */

  /** @inheritdoc */
  static defaultUniforms = {
    tintAlpha: [1, 1, 1, 1],
    tint: [0.38, 0.8, 0.38],
    brightness: 0,
    darknessLevelTexture: null,
    screenDimensions: [1, 1],
    enable: true
  };

  /* -------------------------------------------- */

  /**
   * Brightness controls the luminosity.
   * @type {number}
   */
  get brightness() {
    return this.uniforms.brightness;
  }

  set brightness(brightness) {
    this.uniforms.brightness = brightness;
  }

  /* -------------------------------------------- */

  /**
   * Tint color applied to Light Amplification.
   * @type {number[]}       Light Amplification tint (default: [0.48, 1.0, 0.48]).
   */
  get colorTint() {
    return this.uniforms.colorTint;
  }

  set colorTint(color) {
    this.uniforms.colorTint = color;
  }
}

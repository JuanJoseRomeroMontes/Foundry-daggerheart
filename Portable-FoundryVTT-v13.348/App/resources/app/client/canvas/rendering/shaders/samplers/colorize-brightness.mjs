import BaseSamplerShader from "./base-sampler.mjs";

/**
 * A colorization shader which keeps brightness contrary to "normal tinting"
 */
export default class ColorizeBrightnessShader extends BaseSamplerShader {

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
    uniform vec3 tintLinear;
    uniform bool grey;
    uniform float intensity;
    varying vec2 vUvs;
    varying vec2 vScreenCoord;

    ${this.CONSTANTS}
    ${this.PERCEIVED_BRIGHTNESS}
    ${this.COLOR_SPACES}

    void main() {
      vec4 baseColor = texture2D(sampler, vUvs);

      if ( baseColor.a > 0.0 ) {
       
        // Unmultiply rgb with alpha channel
        baseColor.rgb /= baseColor.a;
        
        // Convert to linear color
        vec3 linearBaseColor = srgb2linear(baseColor.rgb);
        
        // Convert to greyscale
        if ( grey ) linearBaseColor = linear2grey(linearBaseColor);
        
        // Modulate the tint based on luminance, preserving highlights
        vec3 colored = tintColorLinear(linearBaseColor, tintLinear, intensity);
        
        // Convert back to sRGB
        baseColor.rgb = linear2srgb(colored);
        
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
    tintLinear: [1, 1, 1],
    sampler: null,
    screenDimensions: [1, 1],
    grey: true,
    intensity: 1
  };
}

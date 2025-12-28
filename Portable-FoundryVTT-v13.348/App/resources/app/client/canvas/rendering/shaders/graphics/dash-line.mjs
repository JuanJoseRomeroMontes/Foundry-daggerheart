/**
 * A modified version of the PIXI.smooth.DashLineShader that supports an offset.
 * @internal
 */
export default class DashLineShader extends PIXI.smooth.SmoothGraphicsShader {
  /**
   * @param {object} [options]             The options
   * @param {number} [options.dash=8]      The length of the dash
   * @param {number} [options.gap=5]       The length of the gap
   * @param {number} [options.offset=0]    The offset of the dashes
   */
  constructor({dash=8.0, gap=5.0, offset=0.0}={}) {
    const settings = {maxStyles: 16, maxTextures: 1, pixelLine: 1};
    const uniforms = {dash, gap, offset};
    super(settings, undefined, DashLineShader.#FRAGMENT_SHADER, uniforms);
  }

  /* -------------------------------------------- */

  /**
   * The fragment shader source.
   * @type {string}
   */
  static #FRAGMENT_SHADER = `\
    %PRECISION%

    varying vec4 vColor;
    varying vec4 vLine1;
    varying vec4 vLine2;
    varying vec4 vArc;
    varying float vType;
    varying float vTextureId;
    varying vec2 vTextureCoord;
    varying vec2 vTravel;
    uniform sampler2D uSamplers[%MAX_TEXTURES%];
    uniform float dash;
    uniform float gap;
    uniform float offset;

    %PIXEL_LINE%

    void main() {
      %PIXEL_COVERAGE%

      float d = dash * vTravel.y;
      if ( d > 0.0 ) {
        float g = gap * vTravel.y;
        if ( g > 0.0 ) {
          float o = offset * vTravel.y;
          float t = mod(vTravel.x - o, d + g);
          alpha *= mix(
            min((0.5 * d) + 0.5 - abs(t - (0.5 * d)), 1.0),
            max(abs(t - (0.5 * g) - d) - (0.5 * g) + 0.5, 0.0),
            step(d, t)
          );
        }
      } else {
        alpha = 0.0;
      }

      vec4 texColor;
      float textureId = floor(vTextureId + 0.5);

      %FOR_LOOP%

      gl_FragColor = vColor * texColor * alpha;
    }
  `;
}

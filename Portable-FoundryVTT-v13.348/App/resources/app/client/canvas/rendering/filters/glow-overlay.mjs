import AbstractBaseFilter from "./base-filter.mjs";

/**
 * A filter which implements an inner or outer glow around the source texture.
 * Inspired from https://github.com/pixijs/filters/tree/main/filters/glow
 * @license MIT
 */
export default class GlowOverlayFilter extends AbstractBaseFilter {

  /** @override */
  padding = 6;

  /**
   * The inner strength of the glow.
   * @type {number}
   */
  innerStrength = 3;

  /**
   * The outer strength of the glow.
   * @type {number}
   */
  outerStrength = 3;

  /**
   * Should this filter auto-animate?
   * @type {boolean}
   */
  animated = true;

  /** @inheritdoc */
  static defaultUniforms = {
    distance: 10,
    glowColor: [1, 1, 1, 1],
    quality: 0.1,
    time: 0,
    knockout: true,
    alpha: 1
  };

  /**
   * Dynamically create the fragment shader used for filters of this type.
   * @param {number} quality
   * @param {number} distance
   * @returns {string}
   */
  static createFragmentShader(quality, distance) {
    return `
    precision mediump float;
    varying vec2 vTextureCoord;
    varying vec4 vColor;
  
    uniform sampler2D uSampler;
    uniform float innerStrength;
    uniform float outerStrength;
    uniform float alpha;
    uniform vec4 glowColor;
    uniform vec4 inputSize;
    uniform vec4 inputClamp;
    uniform bool knockout;
  
    const float PI = 3.14159265358979323846264;
    const float DIST = ${distance.toFixed(0)}.0;
    const float ANGLE_STEP_SIZE = min(${(1 / quality / distance).toFixed(7)}, PI * 2.0);
    const float ANGLE_STEP_NUM = ceil(PI * 2.0 / ANGLE_STEP_SIZE);
    const float MAX_TOTAL_ALPHA = ANGLE_STEP_NUM * DIST * (DIST + 1.0) / 2.0;
  
    float getClip(in vec2 uv) {
      return step(3.5,
       step(inputClamp.x, uv.x) +
       step(inputClamp.y, uv.y) +
       step(uv.x, inputClamp.z) +
       step(uv.y, inputClamp.w));
    }
  
    void main(void) {
      vec2 px = inputSize.zw;
      float totalAlpha = 0.0;
      vec2 direction;
      vec2 displaced;
      vec4 curColor;
  
      for (float angle = 0.0; angle < PI * 2.0; angle += ANGLE_STEP_SIZE) {
       direction = vec2(cos(angle), sin(angle)) * px;
       for (float curDistance = 0.0; curDistance < DIST; curDistance++) {
         displaced = vTextureCoord + direction * (curDistance + 1.0);
         curColor = texture2D(uSampler, displaced) * getClip(displaced);
         totalAlpha += (DIST - curDistance) * (smoothstep(0.5, 1.0, curColor.a));
       }
      }
  
      curColor = texture2D(uSampler, vTextureCoord);
      float alphaRatio = (totalAlpha / MAX_TOTAL_ALPHA);
      
      float innerGlowAlpha = (1.0 - alphaRatio) * innerStrength * smoothstep(0.6, 1.0, curColor.a);
      float innerGlowStrength = min(1.0, innerGlowAlpha);
      
      vec4 innerColor = mix(curColor, glowColor, innerGlowStrength);

      float outerGlowAlpha = alphaRatio * outerStrength * (1.0 - smoothstep(0.35, 1.0, curColor.a));
      float outerGlowStrength = min(1.0 - innerColor.a, outerGlowAlpha);
      vec4 outerGlowColor = outerGlowStrength * glowColor.rgba;
      
      if ( knockout ) {
        float resultAlpha = outerGlowAlpha + innerGlowAlpha;
        gl_FragColor = mix(vec4(glowColor.rgb * resultAlpha, resultAlpha), vec4(0.0), curColor.a);
      }
      else {
        vec4 outerGlowColor = outerGlowStrength * glowColor.rgba * alpha;
        gl_FragColor = innerColor + outerGlowColor;
      }
    }`;
  }

  /** @inheritdoc */
  static vertexShader = `
  precision mediump float;
  attribute vec2 aVertexPosition;
  uniform mat3 projectionMatrix;
  uniform vec4 inputSize;
  uniform vec4 outputFrame;
  varying vec2 vTextureCoord;

  void main(void) {
      vec2 position = aVertexPosition * max(outputFrame.zw, vec2(0.0)) + outputFrame.xy;
      gl_Position = vec4((projectionMatrix * vec3(position, 1.0)).xy, 0.0, 1.0);
      vTextureCoord = aVertexPosition * (outputFrame.zw * inputSize.zw);
  }`;

  /** @inheritdoc */
  static create(initialUniforms={}) {
    const uniforms = {...this.defaultUniforms, ...initialUniforms};
    const fragmentShader = this.createFragmentShader(uniforms.quality, uniforms.distance);
    return new this(this.vertexShader, fragmentShader, uniforms);
  }

  /* -------------------------------------------- */

  /** @override */
  apply(filterManager, input, output, clear) {
    let strength = canvas.stage.worldTransform.d;
    if ( this.animated && !canvas.photosensitiveMode ) {
      const time = canvas.app.ticker.lastTime;
      strength *= Math.oscillation(0.5, 2.0, time, 2000);
    }
    this.uniforms.outerStrength = this.outerStrength * strength;
    this.uniforms.innerStrength = this.innerStrength * strength;
    filterManager.applyFilter(this, input, output, clear);
  }
}

import AdaptiveIlluminationShader from "../illumination-lighting.mjs";
import AdaptiveColorationShader from "../coloration-lighting.mjs";

/**
 * Bewitching Wave animation illumination shader
 */
export class BewitchingWaveIlluminationShader extends AdaptiveIlluminationShader {
  /** @override */
  static fragmentShader = `
  ${this.SHADER_HEADER}
  ${this.PRNG}
  ${this.NOISE}
  ${this.FBM(4, 1.0)}
  ${this.PERCEIVED_BRIGHTNESS}

  // Transform UV
  vec2 transform(in vec2 uv, in float dist) {
    float t = time * 0.25;
    mat2 rotmat = mat2(cos(t), -sin(t), sin(t), cos(t));
    mat2 scalemat = mat2(2.5, 0.0, 0.0, 2.5);
    uv -= vec2(0.5); 
    uv *= rotmat * scalemat;
    uv += vec2(0.5);
    return uv;
  }

  float bwave(in float dist) {
    vec2 uv = transform(vUvs, dist);
    float motion = fbm(uv + time * 0.25);
    float distortion = mix(1.0, motion, clamp(1.0 - dist, 0.0, 1.0));
    float sinWave = 0.5 * (sin(-time * 6.0 + dist * 10.0 * intensity * distortion) + 1.0);
    return 0.3 * sinWave + 0.8;
  }

  void main() {
    ${this.FRAGMENT_BEGIN}
    ${this.TRANSITION}
    finalColor *= bwave(dist);
    ${this.ADJUSTMENTS}
    ${this.FALLOFF}
    ${this.FRAGMENT_END}
  }`;
}

/* -------------------------------------------- */

/**
 * Bewitching Wave animation coloration shader
 */
export class BewitchingWaveColorationShader extends AdaptiveColorationShader {
  /** @override */
  static fragmentShader = `
  ${this.SHADER_HEADER}
  ${this.PRNG}
  ${this.NOISE}
  ${this.FBM(4, 1.0)}
  ${this.PERCEIVED_BRIGHTNESS}

  // Transform UV
  vec2 transform(in vec2 uv, in float dist) {
    float t = time * 0.25;
    mat2 rotmat = mat2(cos(t), -sin(t), sin(t), cos(t));
    mat2 scalemat = mat2(2.5, 0.0, 0.0, 2.5);
    uv -= vec2(0.5); 
    uv *= rotmat * scalemat;
    uv += vec2(0.5);
    return uv;
  }

  float bwave(in float dist) {
    vec2 uv = transform(vUvs, dist);
    float motion = fbm(uv + time * 0.25);
    float distortion = mix(1.0, motion, clamp(1.0 - dist, 0.0, 1.0));
    float sinWave = 0.5 * (sin(-time * 6.0 + dist * 10.0 * intensity * distortion) + 1.0);
    return 0.55 * sinWave + 0.8;
  }

  void main() {
    ${this.FRAGMENT_BEGIN}
    finalColor = color * bwave(dist) * colorationAlpha;
    ${this.COLORATION_TECHNIQUES}
    ${this.ADJUSTMENTS}
    ${this.FALLOFF}
    ${this.FRAGMENT_END}
  }`;
}

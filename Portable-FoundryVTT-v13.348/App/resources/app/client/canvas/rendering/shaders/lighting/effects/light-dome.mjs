import AdaptiveColorationShader from "../coloration-lighting.mjs";

/**
 * Light dome animation coloration shader
 */
export class LightDomeColorationShader extends AdaptiveColorationShader {

  /** @override */
  static forceDefaultColor = true;

  /** @override */
  static fragmentShader = `
  ${this.SHADER_HEADER}
  ${this.PRNG}
  ${this.NOISE}
  ${this.FBM(2)}
  ${this.PERCEIVED_BRIGHTNESS}

  // Rotate and scale uv
  vec2 transform(in vec2 uv, in float dist) {
    float hspherize = (1.0 - sqrt(1.0 - dist)) / dist;
    float t = time * 0.02;
    mat2 rotmat = mat2(cos(t), -sin(t), sin(t), cos(t));
    mat2 scalemat = mat2(8.0 * intensity, 0.0, 0.0, 8.0 * intensity);
    uv -= PIVOT; 
    uv *= rotmat * scalemat * hspherize;
    uv += PIVOT;
    return uv;
  }
  
  vec3 ripples(in vec2 uv) {
    // creating the palette
    vec3 c1 = color * 0.550;
    vec3 c2 = color * 0.020;
    vec3 c3 = color * 0.3;
    vec3 c4 = color;
    vec3 c5 = color * 0.025;
    vec3 c6 = color * 0.200;

    vec2 p = uv + vec2(5.0);
    float q = 2.0 * fbm(p + time * 0.2);
    vec2 r = vec2(fbm(p + q + ( time  ) - p.x - p.y), fbm(p * 2.0 + ( time )));
    
    return clamp( mix( c1, c2, abs(fbm(p + r)) ) + mix( c3, c4, abs(r.x * r.x * r.x) ) - mix( c5, c6, abs(r.y * r.y)), vec3(0.0), vec3(1.0));
  }

  void main() {
    ${this.FRAGMENT_BEGIN}
    
    // to hemispherize, rotate and magnify
    vec2 uv = transform(vUvs, dist);
    finalColor = ripples(uv) * pow(1.0 - dist, 0.25) * colorationAlpha;

    ${this.COLORATION_TECHNIQUES}
    ${this.ADJUSTMENTS}
    ${this.FALLOFF}
    ${this.FRAGMENT_END}
  }`;
}

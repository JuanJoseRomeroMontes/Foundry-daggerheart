import AdaptiveColorationShader from "../coloration-lighting.mjs";

/**
 * A futuristic Force Grid animation.
 */
export class ForceGridColorationShader extends AdaptiveColorationShader {

  /** @override */
  static forceDefaultColor = true;

  /** @override */
  static fragmentShader = `
  ${this.SHADER_HEADER}
  ${this.PERCEIVED_BRIGHTNESS}

  const float MAX_INTENSITY = 1.2;
  const float MIN_INTENSITY = 0.8;

  vec2 hspherize(in vec2 uv, in float dist) {
    float f = (1.0 - sqrt(1.0 - dist)) / dist;
    uv -= vec2(0.50);
    uv *= f * 5.0;
    uv += vec2(0.5);
    return uv;
  }

  float wave(in float dist) {
    float sinWave = 0.5 * (sin(time * 6.0 + pow(1.0 - dist, 0.10) * 35.0 * intensity) + 1.0);
    return ((MAX_INTENSITY - MIN_INTENSITY) * sinWave) + MIN_INTENSITY;
  }

  float fpert(in float d, in float p) {
    return max(0.3 - 
               mod(p + time + d * 0.3, 3.5),
               0.0) * intensity * 2.0;
  }

  float pert(in vec2 uv, in float dist, in float d, in float w) {
    uv -= vec2(0.5);
    float f = fpert(d, min( uv.y,  uv.x)) +
              fpert(d, min(-uv.y,  uv.x)) +
              fpert(d, min(-uv.y, -uv.x)) +
              fpert(d, min( uv.y, -uv.x));
    f *= f;
    return max(f, 3.0 - f) * w;
  }

  vec3 forcegrid(vec2 suv, in float dist) {
    vec2 uv = suv - vec2(0.2075, 0.2075);
    vec2 cid2 = floor(uv);
    float cid = (cid2.y + cid2.x);
    uv = fract(uv);
    float r = 0.3;
    float d = 1.0;
    float e;
    float c;

    for( int i = 0; i < 5; i++ ) {
      e = uv.x - r;
      c = clamp(1.0 - abs(e * 0.75), 0.0, 1.0);
      d += pow(c, 200.0) * (1.0 - dist);
      if ( e > 0.0 ) {
        uv.x = (uv.x - r) / (2.0 - r);
      } 
      uv = uv.yx;
    }

    float w = wave(dist);
    vec3 col = vec3(max(d - 1.0, 0.0)) * 1.8;
    col *= pert(suv, dist * intensity * 4.0, d, w);
    col += color * 0.30 * w;
    return col * color;
  }
  
  void main() {
    ${this.FRAGMENT_BEGIN}
    vec2 uvs = vUvs;
    uvs -= PIVOT;
    uvs *= intensity * 0.2;
    uvs += PIVOT;
    vec2 suvs = hspherize(uvs, dist);
    finalColor = forcegrid(suvs, dist) * colorationAlpha;
    ${this.COLORATION_TECHNIQUES}
    ${this.ADJUSTMENTS}
    ${this.FALLOFF}
    ${this.FRAGMENT_END}
  }
  `;
}

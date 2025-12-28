import AdaptiveColorationShader from "../coloration-lighting.mjs";

/**
 * A disco like star light.
 */
export class StarLightColorationShader extends AdaptiveColorationShader {

  /** @override */
  static forceDefaultColor = true;

  /** @override */
  static fragmentShader = `
  ${this.SHADER_HEADER}
  ${this.PERCEIVED_BRIGHTNESS}
  ${this.PRNG}
  ${this.NOISE}
  ${this.FBM(2, 1.0)}

  vec2 transform(in vec2 uv, in float dist) {
    float t = time * 0.20;
    float cost = cos(t);
    float sint = sin(t);

    mat2 rotmat = mat2(cost, -sint, sint, cost);
    uv *= rotmat;
    return uv;
  }

  float makerays(in vec2 uv, in float t) {
    vec2 uvn = normalize(uv * (uv + t)) * (5.0 + intensity);
    return max(clamp(0.5 * tan(fbm(uvn - t)), 0.0, 2.25),
               clamp(3.0 - tan(fbm(uvn + t * 2.0)), 0.0, 2.25));
  }

  float starlight(in float dist) {
    vec2 uv = (vUvs - 0.5);
    uv = transform(uv, dist);
    float rays = makerays(uv, time * 0.5);
    return pow(1.0 - dist, rays) * pow(1.0 - dist, 0.25);
  }

  void main() {
    ${this.FRAGMENT_BEGIN}
    finalColor = clamp(color * starlight(dist) * colorationAlpha, 0.0, 1.0);
    ${this.COLORATION_TECHNIQUES}
    ${this.ADJUSTMENTS}
    ${this.FALLOFF}
    ${this.FRAGMENT_END}
  }
  `;
}

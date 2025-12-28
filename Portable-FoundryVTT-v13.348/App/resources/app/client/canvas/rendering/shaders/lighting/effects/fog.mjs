import AdaptiveColorationShader from "../coloration-lighting.mjs";

/**
 * Fog animation coloration shader
 */
export class FogColorationShader extends AdaptiveColorationShader {

  /** @override */
  static forceDefaultColor = true;

  /** @override */
  static fragmentShader = `
  ${this.SHADER_HEADER}
  ${this.PRNG}
  ${this.NOISE}
  ${this.FBM(4, 1.0)}
  ${this.PERCEIVED_BRIGHTNESS}

  vec3 fog() {
    // constructing the palette
    vec3 c1 = color * 0.60;
    vec3 c2 = color * 0.95;
    vec3 c3 = color * 0.50;
    vec3 c4 = color * 0.75;
    vec3 c5 = vec3(0.3);
    vec3 c6 = color;
    
    // creating the deformation
    vec2 uv = vUvs;
    vec2 p = uv.xy * 8.0;

    // time motion fbm and palette mixing
    float q = fbm(p - time * 0.1);
    vec2 r = vec2(fbm(p + q - time * 0.5 - p.x - p.y), 
                  fbm(p + q - time * 0.3));
    vec3 c = clamp(mix(c1, 
                       c2, 
                       fbm(p + r)) + mix(c3, c4, r.x) 
                                   - mix(c5, c6, r.y),
                                     vec3(0.0), vec3(1.0));
    // returning the color
    return c;
  }

  void main() {
    ${this.FRAGMENT_BEGIN}
    float intens = intensity * 0.2;
    // applying fog
    finalColor = fog() * intens * colorationAlpha;
    ${this.COLORATION_TECHNIQUES}
    ${this.ADJUSTMENTS}
    ${this.FALLOFF}
    ${this.FRAGMENT_END}
  }`;
}

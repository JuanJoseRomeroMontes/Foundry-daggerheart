import AdaptiveColorationShader from "../coloration-lighting.mjs";
import AdaptiveIlluminationShader from "../illumination-lighting.mjs";

/**
 * A patch of smoke
 */
export class SmokePatchColorationShader extends AdaptiveColorationShader {
  /** @override */
  static fragmentShader = `
  ${this.SHADER_HEADER}
  ${this.PERCEIVED_BRIGHTNESS}
  ${this.PRNG}
  ${this.NOISE}
  ${this.FBMHQ(3)}
  
  vec2 transform(in vec2 uv, in float dist) {
    float t = time * 0.1;
    float cost = cos(t);
    float sint = sin(t);

    mat2 rotmat = mat2(cost, -sint, sint, cost);
    mat2 scalemat = mat2(10.0, uv.x, uv.y, 10.0);
    uv -= PIVOT;
    uv *= (rotmat * scalemat);
    uv += PIVOT;
    return uv;
  }

  float smokefading(in float dist) {
    float t = time * 0.4;
    vec2 uv = transform(vUvs, dist);
    return pow(1.0 - dist, 
      mix(fbm(uv, 1.0 + intensity * 0.4), 
        max(fbm(uv + t, 1.0),
            fbm(uv - t, 1.0)), 
          pow(dist, intensity * 0.5)));
  }

  void main() {
    ${this.FRAGMENT_BEGIN}
    finalColor = color * smokefading(dist) * colorationAlpha;
    ${this.COLORATION_TECHNIQUES}
    ${this.ADJUSTMENTS}
    ${this.FALLOFF}
    ${this.FRAGMENT_END}
  }
  `;
}

/* -------------------------------------------- */

/**
 * A patch of smoke
 */
export class SmokePatchIlluminationShader extends AdaptiveIlluminationShader {
  /** @override */
  static fragmentShader = `
  ${this.SHADER_HEADER}
  ${this.PERCEIVED_BRIGHTNESS}
  ${this.PRNG}
  ${this.NOISE}
  ${this.FBMHQ(3)}

  vec2 transform(in vec2 uv, in float dist) {
    float t = time * 0.1;
    float cost = cos(t);
    float sint = sin(t);

    mat2 rotmat = mat2(cost, -sint, sint, cost);
    mat2 scalemat = mat2(10.0, uv.x, uv.y, 10.0);
    uv -= PIVOT;
    uv *= (rotmat * scalemat);
    uv += PIVOT;
    return uv;
  }
  
  float smokefading(in float dist) {
    float t = time * 0.4;
    vec2 uv = transform(vUvs, dist);
    return pow(1.0 - dist,
      mix(fbm(uv, 1.0 + intensity * 0.4),
        max(fbm(uv + t, 1.0),
            fbm(uv - t, 1.0)),
        pow(dist, intensity * 0.5)));
  }

  void main() {
    ${this.FRAGMENT_BEGIN}                          
    ${this.TRANSITION}
    finalColor *= smokefading(dist);
    ${this.ADJUSTMENTS}
    ${this.FALLOFF}
    ${this.FRAGMENT_END}
  }
  `;
}

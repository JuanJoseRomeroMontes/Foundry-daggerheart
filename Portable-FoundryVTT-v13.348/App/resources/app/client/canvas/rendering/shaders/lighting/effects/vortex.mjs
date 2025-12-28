import AdaptiveColorationShader from "../coloration-lighting.mjs";
import AdaptiveIlluminationShader from "../illumination-lighting.mjs";

/**
 * Vortex animation coloration shader
 */
export class VortexColorationShader extends AdaptiveColorationShader {

  /** @override */
  static forceDefaultColor = true;

  /** @override */
  static fragmentShader = `
  ${this.SHADER_HEADER}
  ${this.PRNG}
  ${this.NOISE}
  ${this.FBM(4, 1.0)}
  ${this.PERCEIVED_BRIGHTNESS}

  vec2 vortex(in vec2 uv, in float dist, in float radius, in mat2 rotmat) {
    float intens = intensity * 0.2;
    vec2 uvs = uv - PIVOT;
    uv *= rotmat;

    if ( dist < radius ) {
      float sigma = (radius - dist) / radius;
      float theta = sigma * sigma * TWOPI * intens;
      float st = sin(theta);
      float ct = cos(theta);
      uvs = vec2(dot(uvs, vec2(ct, -st)), dot(uvs, vec2(st, ct)));
    }
    uvs += PIVOT;
    return uvs;
  }

  vec3 spice(in vec2 iuv, in mat2 rotmat) {

    // constructing the palette
    vec3 c1 = color * 0.55;
    vec3 c2 = color * 0.95;
    vec3 c3 = color * 0.45;
    vec3 c4 = color * 0.75;
    vec3 c5 = vec3(0.20);
    vec3 c6 = color * 1.2;

    // creating the deformation
    vec2 uv = iuv;
    uv -= PIVOT;
    uv *= rotmat;
    vec2 p = uv.xy * 6.0;
    uv += PIVOT;

    // time motion fbm and palette mixing
    float q = fbm(p + time);
    vec2 r = vec2(fbm(p + q + time * 0.9 - p.x - p.y), 
                  fbm(p + q + time * 0.6));
    vec3 c = mix(c1, 
                 c2, 
                 fbm(p + r)) + mix(c3, c4, r.x) 
                             - mix(c5, c6, r.y);
    // returning the color
    return c;
  }

  void main() {
    ${this.FRAGMENT_BEGIN}
    
    // Timed values
    float t = time * 0.5;
    float cost = cos(t);
    float sint = sin(t);

    // Rotation matrix
    mat2 vortexRotMat = mat2(cost, -sint, sint, cost);
    mat2 spiceRotMat = mat2(cost * 2.0, -sint * 2.0, sint * 2.0, cost * 2.0);

    // Creating vortex
    vec2 vuv = vortex(vUvs, dist, 1.0, vortexRotMat);

    // Applying spice
    finalColor = spice(vuv, spiceRotMat) * colorationAlpha;
    ${this.COLORATION_TECHNIQUES}
    ${this.ADJUSTMENTS}
    
    ${this.FALLOFF}
    ${this.FRAGMENT_END}
  }`;
}

/* -------------------------------------------- */

/**
 * Vortex animation coloration shader
 */
export class VortexIlluminationShader extends AdaptiveIlluminationShader {
  /** @override */
  static fragmentShader = `
  ${this.SHADER_HEADER}
  ${this.PRNG}
  ${this.NOISE}
  ${this.FBM(4, 1.0)}
  ${this.PERCEIVED_BRIGHTNESS}

  vec2 vortex(in vec2 uv, in float dist, in float radius, in float angle, in mat2 rotmat) {
    vec2 uvs = uv - PIVOT;
    uv *= rotmat;

    if ( dist < radius ) {
      float sigma = (radius - dist) / radius;
      float theta = sigma * sigma * angle;
      float st = sin(theta);
      float ct = cos(theta);
      uvs = vec2(dot(uvs, vec2(ct, -st)), dot(uvs, vec2(st, ct)));
    }
    uvs += PIVOT;
    return uvs;
  }

  vec3 spice(in vec2 iuv, in mat2 rotmat) {
    // constructing the palette
    vec3 c1 = vec3(0.20);
    vec3 c2 = vec3(0.80);
    vec3 c3 = vec3(0.15);
    vec3 c4 = vec3(0.85);
    vec3 c5 = c3;
    vec3 c6 = vec3(0.9);

    // creating the deformation
    vec2 uv = iuv;
    uv -= PIVOT;
    uv *= rotmat;
    vec2 p = uv.xy * 6.0;
    uv += PIVOT;

    // time motion fbm and palette mixing
    float q = fbm(p + time);
    vec2 r = vec2(fbm(p + q + time * 0.9 - p.x - p.y), fbm(p + q + time * 0.6));

    // Mix the final color
    return mix(c1, c2, fbm(p + r)) + mix(c3, c4, r.x) - mix(c5, c6, r.y);
  }

  vec3 convertToDarknessColors(in vec3 col, in float dist) {
    float intens = intensity * 0.20;
    float lum = (col.r * 2.0 + col.g * 3.0 + col.b) * 0.5 * INVTHREE;
    float colorMod = smoothstep(ratio * 0.99, ratio * 1.01, dist);
    return mix(computedDimColor, computedBrightColor * colorMod, 1.0 - smoothstep( 0.80, 1.00, lum)) *
                smoothstep( 0.25 * intens, 0.85 * intens, lum);
  }

  void main() {
    ${this.FRAGMENT_BEGIN}
    ${this.TRANSITION}
    ${this.ADJUSTMENTS}
    ${this.FALLOFF}
    ${this.FRAGMENT_END}
  }`;
}

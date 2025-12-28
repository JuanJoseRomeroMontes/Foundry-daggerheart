import AdaptiveDarknessShader from "../darkness-lighting.mjs";

/**
 * Roiling mass illumination shader: intended primarily for darkness
 */
export class RoilingDarknessShader extends AdaptiveDarknessShader {
  /** @override */
  static fragmentShader = `
  ${this.SHADER_HEADER}
  ${this.PERCEIVED_BRIGHTNESS}
  ${this.PRNG}
  ${this.NOISE}
  ${this.FBM(3)}

  void main() {
    ${this.FRAGMENT_BEGIN}
    // Creating distortion with vUvs and fbm
    float distortion1 = fbm( vec2(
                        fbm( vUvs * 2.5 + time * 0.5),
                        fbm( (-vUvs - vec2(0.01)) * 5.0 + time * INVTHREE)));

    float distortion2 = fbm( vec2(
                        fbm( -vUvs * 5.0 + time * 0.5),
                        fbm( (vUvs + vec2(0.01)) * 2.5 + time * INVTHREE)));

    // Timed values
    float t = -time * 0.5;
    float cost = cos(t);
    float sint = sin(t);

    // Rotation matrix
    mat2 rotmat = mat2(cost, -sint, sint, cost);
    vec2 uv = vUvs;

    // Applying rotation before distorting
    uv -= vec2(0.5);
    uv *= rotmat;
    uv += vec2(0.5);

    // Amplify distortions
    vec2 dstpivot = vec2( sin(min(distortion1 * 0.1, distortion2 * 0.1)),
                          cos(min(distortion1 * 0.1, distortion2 * 0.1)) ) * INVTHREE
                  - vec2( cos(max(distortion1 * 0.1, distortion2 * 0.1)),
                          sin(max(distortion1 * 0.1, distortion2 * 0.1)) ) * INVTHREE ;
    vec2 apivot = PIVOT - dstpivot;
    uv -= apivot;
    uv *= 1.13 + 1.33 * (cos(sqrt(max(distortion1, distortion2)) + 1.0) * 0.5);
    uv += apivot;

    // distorted distance
    float ddist = clamp(distance(uv, PIVOT) * 2.0, 0.0, 1.0);

    // R'lyeh Ftagnh !
    float smooth = smoothstep(borderDistance, borderDistance * 1.2, ddist);
    float inSmooth = min(smooth, 1.0 - smooth) * 2.0;

    // Creating the spooky membrane around the bright area
    vec3 membraneColor = vec3(1.0 - inSmooth);

    finalColor *= (mix(color, color * 0.33, darknessLevel) * colorationAlpha);
    finalColor = mix(finalColor,
                     vec3(0.0),
                     1.0 - smoothstep(0.25, 0.30 + (intensity * 0.2), ddist));
    finalColor *= membraneColor;
    ${this.FRAGMENT_END}
  }`;
}

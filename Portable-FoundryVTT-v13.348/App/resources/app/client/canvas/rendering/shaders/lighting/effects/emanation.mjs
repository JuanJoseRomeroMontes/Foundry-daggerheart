import AdaptiveColorationShader from "../coloration-lighting.mjs";

/**
 * Emanation animation coloration shader
 */
export class EmanationColorationShader extends AdaptiveColorationShader {

  /** @override */
  static forceDefaultColor = true;

  /** @override */
  static fragmentShader = `
  ${this.SHADER_HEADER}
  ${this.PERCEIVED_BRIGHTNESS}

  // Create an emanation composed of n beams, n = intensity
  vec3 beamsEmanation(in vec2 uv, in float dist) {
    float angle = atan(uv.x, uv.y) * INVTWOPI;

    // create the beams
    float beams = fract( angle * intensity + sin(dist * 10.0 - time));

    // compose the final beams with max, to get a nice gradient on EACH side of the beams.
    beams = max(beams, 1.0 - beams);

    // creating the effect : applying color and color correction. saturate the entire output color.
    return smoothstep( 0.0, 1.0, beams * color);
  }

  void main() {
    ${this.FRAGMENT_BEGIN}
    vec2 uvs = (2.0 * vUvs) - 1.0;
    // apply beams emanation, fade and alpha
    finalColor = beamsEmanation(uvs, dist) * colorationAlpha;
    ${this.COLORATION_TECHNIQUES}
    ${this.ADJUSTMENTS}
    ${this.FALLOFF}
    ${this.FRAGMENT_END}
  }`;
}

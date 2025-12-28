import AdaptiveDarknessShader from "../darkness-lighting.mjs";

/**
 * Black Hole animation illumination shader
 */
export class BlackHoleDarknessShader extends AdaptiveDarknessShader {

  /* -------------------------------------------- */
  /*  GLSL Statics                                */
  /* -------------------------------------------- */

  /** @inheritdoc */
  static fragmentShader = `
  ${this.SHADER_HEADER}
  ${this.PRNG}
  ${this.NOISE}
  ${this.FBMHQ()}
  ${this.PERCEIVED_BRIGHTNESS}

  // create an emanation composed of n beams, n = intensity
  vec3 beamsEmanation(in vec2 uv, in float dist, in vec3 pCol) {   
    float angle = atan(uv.x, uv.y) * INVTWOPI;

    // Create the beams
    float dad = mix(0.33, 5.0, dist);
    float beams = fract(angle + sin(dist * 30.0 * (intensity * 0.2) - time + fbm(uv * 10.0 + time * 0.25, 1.0) * dad));

    // Compose the final beams and reverse beams, to get a nice gradient on EACH side of the beams.
    beams = max(beams, 1.0 - beams);

    // Creating the effect
    return smoothstep(0.0, 1.1 + (intensity * 0.1), beams * pCol);
  }

  void main() {
    ${this.FRAGMENT_BEGIN}
    vec2 uvs = (2.0 * vUvs) - 1.0;
    finalColor *= (mix(color, color * 0.66, darknessLevel) * colorationAlpha);
    float rd = pow(1.0 - dist, 3.0);
    finalColor = beamsEmanation(uvs, rd, finalColor);
    ${this.FRAGMENT_END}
  }`;
}

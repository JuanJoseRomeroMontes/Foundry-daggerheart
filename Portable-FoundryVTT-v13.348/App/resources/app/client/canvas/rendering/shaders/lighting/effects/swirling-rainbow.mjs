import AdaptiveColorationShader from "../coloration-lighting.mjs";

/**
 * Swirling rainbow animation coloration shader
 */
export class SwirlingRainbowColorationShader extends AdaptiveColorationShader {

  /** @override */
  static forceDefaultColor = true;

  /** @override */
  static fragmentShader = `
  ${this.SHADER_HEADER}
  ${this.HSB2RGB}
  ${this.PERCEIVED_BRIGHTNESS}

  void main() {
    ${this.FRAGMENT_BEGIN}

    float intens = intensity * 0.1;
    vec2 nuv = vUvs * 2.0 - 1.0;
    vec2 puv = vec2(atan(nuv.x, nuv.y) * INVTWOPI + 0.5, length(nuv));
    vec3 rainbow = hsb2rgb(vec3(puv.x + puv.y - time * 0.2, 1.0, 1.0));
    finalColor = mix(color, rainbow, smoothstep(0.0, 1.5 - intens, dist))
                     * (1.0 - dist * dist * dist);
    ${this.COLORATION_TECHNIQUES}
    ${this.ADJUSTMENTS}
    ${this.FALLOFF}
    ${this.FRAGMENT_END}
  }`;
}

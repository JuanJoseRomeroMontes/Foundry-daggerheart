import AdaptiveColorationShader from "../coloration-lighting.mjs";
import AdaptiveIlluminationShader from "../illumination-lighting.mjs";

/**
 * Pulse animation illumination shader
 */
export class PulseIlluminationShader extends AdaptiveIlluminationShader {
  /** @override */
  static fragmentShader = `
  ${this.SHADER_HEADER}
  ${this.PERCEIVED_BRIGHTNESS}

  void main() {
    ${this.FRAGMENT_BEGIN}
    float fading = pow(abs(1.0 - dist * dist), 1.01 - ratio);
    ${this.TRANSITION}
    finalColor *= fading;
    ${this.FALLOFF}
    ${this.FRAGMENT_END}
  }`;
}

/* -------------------------------------------- */

/**
 * Pulse animation coloration shader
 */
export class PulseColorationShader extends AdaptiveColorationShader {
  /** @override */
  static fragmentShader = `
  ${this.SHADER_HEADER}
  ${this.PERCEIVED_BRIGHTNESS}

  float pfade(in float dist, in float pulse) {
      return 1.0 - smoothstep(pulse * 0.5, 1.0, dist);
  }
    
  void main() {
    ${this.FRAGMENT_BEGIN}
    finalColor = color * pfade(dist, pulse) * colorationAlpha;
    ${this.COLORATION_TECHNIQUES}
    ${this.ADJUSTMENTS}
    ${this.FALLOFF}
    ${this.FRAGMENT_END}
  }`;

  /** @inheritdoc */
  static defaultUniforms = ({...super.defaultUniforms, pulse: 0});
}

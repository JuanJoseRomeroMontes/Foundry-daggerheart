import AdaptiveColorationShader from "../coloration-lighting.mjs";
import AdaptiveIlluminationShader from "../illumination-lighting.mjs";

/**
 * Allow coloring of illumination
 */
export class TorchIlluminationShader extends AdaptiveIlluminationShader {
  /** @override */
  static fragmentShader = `
  ${this.SHADER_HEADER}
  ${this.PERCEIVED_BRIGHTNESS}

  void main() {
    ${this.FRAGMENT_BEGIN}
    ${this.TRANSITION}
    ${this.ADJUSTMENTS}
    ${this.FALLOFF}
    ${this.FRAGMENT_END}
  }`;
}

/* -------------------------------------------- */

/**
 * Torch animation coloration shader
 */
export class TorchColorationShader extends AdaptiveColorationShader {
  /** @override */
  static fragmentShader = `
  ${this.SHADER_HEADER}
  ${this.PERCEIVED_BRIGHTNESS}

  void main() {
    ${this.FRAGMENT_BEGIN}
    finalColor = color * brightnessPulse * colorationAlpha;
    ${this.COLORATION_TECHNIQUES}
    ${this.ADJUSTMENTS}
    ${this.FALLOFF}
    ${this.FRAGMENT_END}
  }
  `;

  /** @inheritdoc */
  static defaultUniforms = ({...super.defaultUniforms, ratio: 0, brightnessPulse: 1});
}

import BackgroundVisionShader from "../background-vision.mjs";

/**
 * Shader specialized in light amplification
 */
export class AmplificationBackgroundVisionShader extends BackgroundVisionShader {

  /** @inheritdoc */
  static fragmentShader = `
  ${this.SHADER_HEADER}
  ${this.PERCEIVED_BRIGHTNESS}

  void main() {
    ${this.FRAGMENT_BEGIN}
    float lum = perceivedBrightness(baseColor.rgb);
    vec3 vision = vec3(smoothstep(0.0, 1.0, lum * 1.5)) * colorTint;
    finalColor = vision + (vision * (lum + brightness) * 0.1) + (baseColor.rgb * (1.0 - computedDarknessLevel) * 0.125);
    ${this.ADJUSTMENTS}
    ${this.BACKGROUND_TECHNIQUES}
    ${this.FALLOFF}
    ${this.FRAGMENT_END}
  }`;

  /** @inheritdoc */
  static defaultUniforms = ({...super.defaultUniforms, colorTint: [0.38, 0.8, 0.38], brightness: 0.5});

  /** @inheritdoc */
  get isRequired() {
    return true;
  }
}

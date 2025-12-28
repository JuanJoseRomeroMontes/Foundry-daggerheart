import AdaptiveColorationShader from "../coloration-lighting.mjs";

/**
 * Revolving animation coloration shader
 */
export class RevolvingColorationShader extends AdaptiveColorationShader {

  /** @override */
  static forceDefaultColor = true;

  /** @override */
  static fragmentShader = `
  ${this.SHADER_HEADER}
  uniform float gradientFade;
  uniform float beamLength;
  
  ${this.PERCEIVED_BRIGHTNESS}
  ${this.PIE}
  ${this.ROTATION}

  void main() {
    ${this.FRAGMENT_BEGIN}
    vec2 ncoord = vUvs * 2.0 - 1.0;
    float angularIntensity = mix(PI, PI * 0.5, intensity * 0.1);
    ncoord *= rot(angle + time);
    float angularCorrection = pie(ncoord, angularIntensity, gradientFade, beamLength);
    finalColor = color * colorationAlpha * angularCorrection;
    ${this.COLORATION_TECHNIQUES}
    ${this.ADJUSTMENTS}
    ${this.FALLOFF}
    ${this.FRAGMENT_END}
  }
  `;

  /** @inheritdoc */
  static defaultUniforms = {
    ...super.defaultUniforms,
    angle: 0,
    gradientFade: 0.15,
    beamLength: 1
  };
}

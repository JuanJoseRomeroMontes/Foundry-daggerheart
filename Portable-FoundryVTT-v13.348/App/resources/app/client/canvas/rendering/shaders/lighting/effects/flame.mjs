import AdaptiveIlluminationShader from "../illumination-lighting.mjs";
import AdaptiveColorationShader from "../coloration-lighting.mjs";

/**
 * Alternative torch illumination shader
 */
export class FlameIlluminationShader extends AdaptiveIlluminationShader {
  /** @override */
  static fragmentShader = `
  ${this.SHADER_HEADER}
  ${this.PERCEIVED_BRIGHTNESS}
  
  void main() {
    ${this.FRAGMENT_BEGIN}                          
    ${this.TRANSITION}
    finalColor *= brightnessPulse;
    ${this.ADJUSTMENTS}
    ${this.FALLOFF}
    ${this.FRAGMENT_END}
  }`;

  /** @inheritdoc */
  static defaultUniforms = ({...super.defaultUniforms, brightnessPulse: 1});
}

/* -------------------------------------------- */

/**
 * Alternative torch coloration shader
 */
export class FlameColorationShader extends AdaptiveColorationShader {
  /** @override */
  static fragmentShader = `
  ${this.SHADER_HEADER}
  ${this.PRNG}
  ${this.NOISE}
  ${this.FBMHQ(3)}
  ${this.PERCEIVED_BRIGHTNESS}

  vec2 scale(in vec2 uv, in float scale) {
    mat2 scalemat = mat2(scale, 0.0, 0.0, scale);
    uv -= PIVOT; 
    uv *= scalemat;
    uv += PIVOT;
    return uv;
  }
  
  void main() {
    ${this.FRAGMENT_BEGIN}
    vec2 uv = scale(vUvs, 10.0 * ratio);
    
    float intens = pow(0.1 * intensity, 2.0);
    float fratioInner = ratio * (intens * 0.5) - 
                   (0.005 * 
                        fbm( vec2( 
                             uv.x + time * 8.01, 
                             uv.y + time * 10.72), 1.0));
    float fratioOuter = ratio - (0.007 * 
                        fbm( vec2( 
                             uv.x + time * 7.04, 
                             uv.y + time * 9.51), 2.0));
                             
    float fdist = max(dist - fratioInner * intens, 0.0);
    
    float flameDist = smoothstep(clamp(0.97 - fratioInner, 0.0, 1.0),
                                 clamp(1.03 - fratioInner, 0.0, 1.0),
                                 1.0 - fdist);
    float flameDistInner = smoothstep(clamp(0.95 - fratioOuter, 0.0, 1.0),
                                      clamp(1.05 - fratioOuter, 0.0, 1.0),
                                      1.0 - fdist);
                                 
    vec3 flameColor = color * 8.0;
    vec3 flameFlickerColor = color * 1.2;
    
    finalColor = mix(mix(color, flameFlickerColor, flameDistInner),
                     flameColor, 
                     flameDist) * brightnessPulse * colorationAlpha;
    ${this.COLORATION_TECHNIQUES}
    ${this.ADJUSTMENTS}
    ${this.FALLOFF}
    ${this.FRAGMENT_END}
  }
  `;

  /** @inheritdoc */
  static defaultUniforms = ({ ...super.defaultUniforms, brightnessPulse: 1});
}

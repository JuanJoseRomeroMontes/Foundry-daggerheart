import AdaptiveColorationShader from "../coloration-lighting.mjs";
import AdaptiveIlluminationShader from "../illumination-lighting.mjs";

/**
 * Ghost light animation illumination shader
 */
export class GhostLightIlluminationShader extends AdaptiveIlluminationShader {
  /** @override */
  static fragmentShader = `
  ${this.SHADER_HEADER}
  ${this.PERCEIVED_BRIGHTNESS}
  ${this.PRNG}
  ${this.NOISE}
  ${this.FBM(3, 1.0)}

  void main() {
    ${this.FRAGMENT_BEGIN}
    
    // Creating distortion with vUvs and fbm
    float distortion1 = fbm(vec2( 
                        fbm(vUvs * 5.0 - time * 0.50), 
                        fbm((-vUvs - vec2(0.01)) * 5.0 + time * INVTHREE)));
    
    float distortion2 = fbm(vec2(
                        fbm(-vUvs * 5.0 - time * 0.50),
                        fbm((-vUvs + vec2(0.01)) * 5.0 + time * INVTHREE)));
    vec2 uv = vUvs;
      
    // time related var
    float t = time * 0.5;
    float tcos = 0.5 * (0.5 * (cos(t)+1.0)) + 0.25;

    ${this.TRANSITION}
    finalColor *= mix( distortion1 * 1.5 * (intensity * 0.2),
                       distortion2 * 1.5 * (intensity * 0.2), tcos);
    ${this.ADJUSTMENTS}
    ${this.FALLOFF}
    ${this.FRAGMENT_END}
  }`;
}

/* -------------------------------------------- */

/**
 * Ghost light animation coloration shader
 */
export class GhostLightColorationShader extends AdaptiveColorationShader {
  /** @override */
  static fragmentShader = `
  ${this.SHADER_HEADER}
  ${this.PRNG}
  ${this.NOISE}
  ${this.FBM(3, 1.0)}
  ${this.PERCEIVED_BRIGHTNESS}

  void main() {
    ${this.FRAGMENT_BEGIN}
    
    // Creating distortion with vUvs and fbm
    float distortion1 = fbm(vec2( 
                        fbm(vUvs * 3.0 + time * 0.50), 
                        fbm((-vUvs + vec2(1.)) * 5.0 + time * INVTHREE)));
    
    float distortion2 = fbm(vec2(
                        fbm(-vUvs * 3.0 + time * 0.50),
                        fbm((-vUvs + vec2(1.)) * 5.0 - time * INVTHREE)));
    vec2 uv = vUvs;
      
    // time related var
    float t = time * 0.5;
    float tcos = 0.5 * (0.5 * (cos(t)+1.0)) + 0.25;
    float tsin = 0.5 * (0.5 * (sin(t)+1.0)) + 0.25;
    
    // Creating distortions with cos and sin : create fluidity
    uv -= PIVOT;
    uv *= tcos * distortion1;
    uv *= tsin * distortion2;
    uv *= fbm(vec2(time + distortion1, time + distortion2));
    uv += PIVOT;

    finalColor = distortion1 * distortion1 * 
                 distortion2 * distortion2 * 
                 color * pow(1.0 - dist, dist)
                 * colorationAlpha * mix( uv.x + distortion1 * 4.5 * (intensity * 0.2),
                                          uv.y + distortion2 * 4.5 * (intensity * 0.2), tcos);
    ${this.COLORATION_TECHNIQUES}
    ${this.ADJUSTMENTS}
    ${this.FALLOFF}
    ${this.FRAGMENT_END}
  }`;
}

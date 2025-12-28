import AbstractBaseMaskFilter from "./base-mask-filter.mjs";

/**
 * A filter used to apply color adjustments and other modifications to the environment.
 */
export default class PrimaryCanvasGroupAmbienceFilter extends AbstractBaseMaskFilter {
  /** @override */
  static fragmentShader = `
    precision ${PIXI.settings.PRECISION_FRAGMENT} float;
    
    // Base ambience uniforms
    uniform vec3 baseTint;
    uniform float baseIntensity;
    uniform float baseLuminosity;
    uniform float baseSaturation;
    uniform float baseShadows;
    
    // Darkness ambience uniforms
    uniform vec3 darkTint;
    uniform float darkIntensity;
    uniform float darkLuminosity;
    uniform float darkSaturation;
    uniform float darkShadows;
    
    // Cycle enabled or disabled
    uniform bool cycle;
    
    // Textures
    uniform sampler2D darknessLevelTexture;
    uniform sampler2D uSampler;
    
    // Varyings
    varying vec2 vTextureCoord;
    varying vec2 vMaskTextureCoord;
    
    ${this.CONSTANTS}
    ${this.COLOR_SPACES}
    
    // Ambience parameters computed according to darkness level (per pixel)
    vec3 tint;
    float intensity;
    float luminosity;
    float saturation;
    float shadows;
    
    /* ----------------------------------------------------------------- */
    /*  Compute ambience parameters according to darkness level texture  */
    /* ----------------------------------------------------------------- */
    void computeAmbienceParameters() {
      float dl = texture2D(darknessLevelTexture, vMaskTextureCoord).r;
  
      // Determine the tint based on base and dark ambience parameters
      if ( baseIntensity > 0.0 ) tint = (cycle && darkIntensity > 0.0) ? mix(baseTint, darkTint, dl) : baseTint;
      else if ( darkIntensity > 0.0 && cycle ) tint = darkTint;
      else tint = vec3(1.0);
       
      // Compute the luminosity based on the cycle condition
      float luminosityBase = cycle ? mix(baseLuminosity, darkLuminosity, dl) : baseLuminosity;
      luminosity = luminosityBase * (luminosityBase >= 0.0 ? 1.2 : 0.8);
  
      // Compute the shadows based on the cycle condition
      shadows = (cycle ? mix(baseShadows, darkShadows, dl) : baseShadows) * 0.15;
  
      // Using a non-linear easing with intensity input value: x^2
      intensity = cycle ? mix(baseIntensity * baseIntensity, darkIntensity * darkIntensity, dl) 
                        : baseIntensity * baseIntensity;
      
      // Compute the saturation based on the cycle condition
      saturation = cycle ? mix(baseSaturation, darkSaturation, dl) : baseSaturation;
    }
    
    /* -------------------------------------------- */
          
    void main() {
      vec4 baseColor = texture2D(uSampler, vTextureCoord);
      
      if ( baseColor.a > 0.0 ) {
        computeAmbienceParameters();
        
        // Unmultiply rgb with alpha channel
        baseColor.rgb /= baseColor.a;
        
        // Apply shadows and luminosity on sRGB values
        if ( shadows > 0.0 ) {
          float l = luminance(srgb2linearFast(baseColor.rgb));
          baseColor.rgb *= min(l / shadows, 1.0);
        }
        if ( luminosity != 0.0 ) baseColor.rgb *= (1.0 + luminosity);
        
        baseColor.rgb = srgb2linear(baseColor.rgb);    // convert to linear before saturating and tinting
       
        // Apply saturation and tint on linearized rgb
        if ( saturation != 0.0 ) baseColor.rgb = mix(linear2grey(baseColor.rgb), baseColor.rgb, 1.0 + saturation);
        if ( intensity > 0.0 ) baseColor.rgb = tintColorLinear(colorClamp(baseColor.rgb), tint, intensity);
        else baseColor.rgb = colorClamp(baseColor.rgb);
        
        baseColor.rgb = linear2srgb(baseColor.rgb);    // convert back to sRGB
        
        // Multiply rgb with alpha channel
        baseColor.rgb *= baseColor.a;
      }
  
      // Output the result
      gl_FragColor = baseColor;
    }
  `;

  /** @override */
  static defaultUniforms = {
    uSampler: null,
    darknessLevelTexture: null,
    cycle: true,
    baseTint: [1, 1, 1], // Important: The base tint uniform must be in linear RGB!
    baseIntensity: 0,
    baseLuminosity: 0,
    baseSaturation: 0,
    baseShadows: 0,
    darkTint: [1, 1, 1], // Important: The dark tint uniform must be in linear RGB!
    darkIntensity: 0,
    darkLuminosity: 0,
    darkSaturation: 0,
    darkShadows: 0
  };
}

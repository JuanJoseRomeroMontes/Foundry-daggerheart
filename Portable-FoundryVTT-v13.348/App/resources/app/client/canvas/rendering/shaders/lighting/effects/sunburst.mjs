import AdaptiveColorationShader from "../coloration-lighting.mjs";
import AdaptiveIlluminationShader from "../illumination-lighting.mjs";

/**
 * Sunburst animation illumination shader
 */
export class SunburstIlluminationShader extends AdaptiveIlluminationShader {
  /** @override */
  static fragmentShader = `
  ${this.SHADER_HEADER}
  ${this.PERCEIVED_BRIGHTNESS}

  // Smooth back and forth between a and b
  float cosTime(in float a, in float b) {
    return (a - b) * ((cos(time) + 1.0) * 0.5) + b;
  }

  // Create the sunburst effect
  vec3 sunBurst(in vec3 color, in vec2 uv, in float dist) {
    // Pulse calibration
    float intensityMod = 1.0 + (intensity * 0.05);
    float lpulse = cosTime(1.3 * intensityMod, 0.85 * intensityMod);
    
    // Compute angle
    float angle = atan(uv.x, uv.y) * INVTWOPI;
    
    // Creating the beams and the inner light
    float beam = fract(angle * 16.0 + time);
    float light = lpulse * pow(abs(1.0 - dist), 0.65);
    
    // Max agregation of the central light and the two gradient edges
    float sunburst = max(light, max(beam, 1.0 - beam));
        
    // Creating the effect : applying color and color correction. ultra saturate the entire output color.
    return color * pow(sunburst, 3.0);
  }

  void main() {
    ${this.FRAGMENT_BEGIN}
    vec2 uv = (2.0 * vUvs) - 1.0;
    finalColor = switchColor(computedBrightColor, computedDimColor, dist);
    ${this.ADJUSTMENTS}
    finalColor = sunBurst(finalColor, uv, dist);
    ${this.FALLOFF}
    ${this.FRAGMENT_END}
  }`;
}

/**
 * Sunburst animation coloration shader
 */
export class SunburstColorationShader extends AdaptiveColorationShader {
  /** @override */
  static fragmentShader = `
  ${this.SHADER_HEADER}
  ${this.PERCEIVED_BRIGHTNESS}

  // Smooth back and forth between a and b
  float cosTime(in float a, in float b) {
    return (a - b) * ((cos(time) + 1.0) * 0.5) + b;
  }

  // Create a sun burst effect
  vec3 sunBurst(in vec2 uv, in float dist) {
    // pulse calibration
    float intensityMod = 1.0 + (intensity * 0.05);
    float lpulse = cosTime(1.1 * intensityMod, 0.85 * intensityMod);

    // compute angle
    float angle = atan(uv.x, uv.y) * INVTWOPI;
    
    // creating the beams and the inner light
    float beam = fract(angle * 16.0 + time);
    float light = lpulse * pow(abs(1.0 - dist), 0.65);
    
    // agregation of the central light and the two gradient edges to create the sunburst
    float sunburst = max(light, max(beam, 1.0 - beam));
        
    // creating the effect : applying color and color correction. saturate the entire output color.
    return color * pow(sunburst, 3.0);
  }

  void main() {
    ${this.FRAGMENT_BEGIN}
    vec2 uvs = (2.0 * vUvs) - 1.0;
    finalColor = sunBurst(uvs, dist) * colorationAlpha;
    ${this.COLORATION_TECHNIQUES}
    ${this.ADJUSTMENTS}
    ${this.FALLOFF}
    ${this.FRAGMENT_END}
  }`;
}

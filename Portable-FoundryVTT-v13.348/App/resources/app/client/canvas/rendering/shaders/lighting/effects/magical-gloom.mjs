import AdaptiveDarknessShader from "../darkness-lighting.mjs";

/**
 * Creates a gloomy ring of pure darkness.
 */
export class MagicalGloomDarknessShader extends AdaptiveDarknessShader {

  /* -------------------------------------------- */
  /*  GLSL Statics                                */
  /* -------------------------------------------- */

  /** @inheritdoc */
  static fragmentShader = `
  ${this.SHADER_HEADER}
  ${this.PERCEIVED_BRIGHTNESS}
  ${this.PRNG}
  ${this.NOISE}
  ${this.FBMHQ()}
  
  vec3 colorScale(in float t) {
    return vec3(1.0 + 0.8 * t) * t;
  }
  
  vec2 radialProjection(in vec2 uv, in float s, in float i) {
    uv = vec2(0.5) - uv;
    float px = 1.0 - fract(atan(uv.y, uv.x) / TWOPI + 0.25) + s;
    float py = (length(uv) * (1.0 + i * 2.0) - i) * 2.0;
    return vec2(px, py);
  }
  
  float interference(in vec2 n) {
    float noise1 = noise(n);
    float noise2 = noise(n * 2.1) * 0.6;
    float noise3 = noise(n * 5.4) * 0.42;
    return noise1 + noise2 + noise3;
  }
  
  float illuminate(in vec2 uv) {
    float t = time;
    
    // Adjust x-coordinate based on time and y-value
    float xOffset = uv.y < 0.5 
                    ? 23.0 + t * 0.035 
                    : -11.0 + t * 0.03;
    uv.x += xOffset;
    
    // Shift y-coordinate to range [0, 0.5]
    uv.y = abs(uv.y - 0.5);
    
    // Scale x-coordinate
    uv.x *= (10.0 + 80.0 * intensity * 0.2);
    
    // Compute interferences
    float q = interference(uv - t * 0.013) * 0.5;
    vec2 r = vec2(interference(uv + q * 0.5 + t - uv.x - uv.y), interference(uv + q - t));
    
    // Compute final shade value
    float sh = (r.y + r.y) * max(0.0, uv.y) + 0.1;
    return sh * sh * sh;
  }
  
  vec3 voidHalf(in float intensity) {
    float minThreshold = 0.35;
    
    // Alter gradient
    intensity = pow(intensity, 0.75);
    
    // Compute the gradient
    vec3 color = colorScale(intensity);
    
    // Normalize the color by the sum of m2 and the color values
    color /= (1.0 + max(vec3(0), color));
    return color;
  }
    
  vec3 voidRing(in vec2 uvs) {
    vec2 uv = (uvs - 0.5) / (borderDistance * 1.06) + 0.5;
    float r = 3.6;
    float ff = 1.0 - uv.y;
    vec2 uv2 = uv;
    uv2.y = 1.0 - uv2.y;
    
    // Calculate color for upper half
    vec3 colorUpper = voidHalf(illuminate(radialProjection(uv, 1.0, r))) * ff;
    
    // Calculate color for lower half
    vec3 colorLower = voidHalf(illuminate(radialProjection(uv2, 1.9, r))) * (1.0 - ff);
    
    // Return upper and lower half combined
    return colorUpper + colorLower;
  }

  void main() {
    ${this.FRAGMENT_BEGIN}
    float lumBase = perceivedBrightness(finalColor);
    lumBase = mix(lumBase, lumBase * 0.33, darknessLevel);   
    vec3 voidRingColor = voidRing(vUvs);
    float lum = pow(perceivedBrightness(voidRingColor), 4.0);
    vec3 voidRingFinal = vec3(perceivedBrightness(voidRingColor)) * color;
    finalColor = voidRingFinal * lumBase * colorationAlpha;
    ${this.FRAGMENT_END}
  }`;
}

import AdaptiveDarknessShader from "../darkness-lighting.mjs";

/**
 * Creates a dense smoke area
 */
export class DenseSmokeDarknessShader extends AdaptiveDarknessShader {

  /* -------------------------------------------- */
  /*  GLSL Statics                                */
  /* -------------------------------------------- */

  /** @inheritdoc */
  static fragmentShader = `
  ${this.SHADER_HEADER}
  ${this.SIMPLEX_3D}
  ${this.FBMHQ(5, "fbm", "snoise", "vec3")}

  void main() {
    ${this.FRAGMENT_BEGIN}
    // Handling intensity and UVs
    float i = (intensity * 0.2);
    vec2 uv = vUvs * 2.5;
    
    // Smooth Noise for visuals
    float fn1 = i * 0.33 + 0.67 * fbm(vec3(uv, time * 0.25), 1.70);
    float fn2 = i * 0.33 + 0.67 * fbm(vec3(uv + 0.5, time * 0.25), 1.40);
    float fn3 = i * 0.33 + 0.67 * fbm(vec3(uv - 0.5, time * 0.25), 1.65);
    
    // Smooth Noise for mixing
    float m1 = fbm(vec3(uv - 1.301, time * 0.16), 1.66);
    float m2 = fbm(vec3(uv + 1.187, time * 0.21), 1.54);
    
    // Mixing noise to produce smoke
    float t = mix(fn1, fn2, m1);
    t = mix(t, fn3, m2);
    t = mix(t, fn1, 0.5);
    t = mix(t, fn2, 0.5);
    t = mix(t, fn3, 0.5);
    finalColor = vec3(t);
    
    // Border distance attenuation
    float bda = 1.0 - smoothstep(borderDistance, 1.0, dist);
    
    // Output
    gl_FragColor = vec4(finalColor * color, t) * depth * bda * colorationAlpha;
  }`;
}

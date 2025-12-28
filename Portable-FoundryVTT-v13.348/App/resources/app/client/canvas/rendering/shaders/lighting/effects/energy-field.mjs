import AdaptiveColorationShader from "../coloration-lighting.mjs";

/**
 * Energy field animation coloration shader
 */
export class EnergyFieldColorationShader extends AdaptiveColorationShader {

  /** @override */
  static forceDefaultColor = true;

  /** @override */
  static fragmentShader = `    
  ${this.SHADER_HEADER}
  ${this.PRNG3D}
  ${this.PERCEIVED_BRIGHTNESS}

  // classic 3d voronoi (with some bug fixes)
  vec3 voronoi3d(const in vec3 x) {
    vec3 p = floor(x);
    vec3 f = fract(x);
    
    float id = 0.0;
    vec2 res = vec2(100.0);
    
    for (int k = -1; k <= 1; k++) {
      for (int j = -1; j <= 1; j++) {
        for (int i = -1; i <= 1; i++) {
          vec3 b = vec3(float(i), float(j), float(k));
          vec3 r = vec3(b) - f + random(p + b);
          
          float d = dot(r, r);
          float cond = max(sign(res.x - d), 0.0);
          float nCond = 1.0 - cond;
          float cond2 = nCond * max(sign(res.y - d), 0.0);
          float nCond2 = 1.0 - cond2;
    
          id = (dot(p + b, vec3(1.0, 67.0, 142.0)) * cond) + (id * nCond);
          res = vec2(d, res.x) * cond + res * nCond;
    
          res.y = cond2 * d + nCond2 * res.y;
        }
      }
    }
    // replaced abs(id) by pow( abs(id + 10.0), 0.01)
    // needed to remove artifacts in some specific configuration
    return vec3( sqrt(res), pow( abs(id + 10.0), 0.01) );
  }

  void main() {
    ${this.FRAGMENT_BEGIN}
    vec2 uv = vUvs;
    
    // Hemispherize and scaling the uv
    float f = (1.0 - sqrt(1.0 - dist)) / dist;
    uv -= vec2(0.5);
    uv *= f * 4.0 * intensity;
    uv += vec2(0.5);
    
    // time and uv motion variables
    float t = time * 0.4;
    float uvx = cos(uv.x - t);
    float uvy = cos(uv.y + t);
    float uvxt = cos(uv.x + sin(t));
    float uvyt = sin(uv.y + cos(t));
    
    // creating the voronoi 3D sphere, applying motion
    vec3 c = voronoi3d(vec3(uv.x - uvx + uvyt, 
                            mix(uv.x, uv.y, 0.5) + uvxt - uvyt + uvx,
                            uv.y + uvxt - uvx));
    
    // applying color and contrast, to create sharp black areas. 
    finalColor = c.x * c.x * c.x * color * colorationAlpha;

    ${this.COLORATION_TECHNIQUES}
    ${this.ADJUSTMENTS}
    ${this.FALLOFF}
    ${this.FRAGMENT_END}
  }`;
}

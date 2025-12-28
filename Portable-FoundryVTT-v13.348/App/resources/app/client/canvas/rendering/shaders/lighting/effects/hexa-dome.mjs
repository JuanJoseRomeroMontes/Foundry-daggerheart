import AdaptiveColorationShader from "../coloration-lighting.mjs";

/**
 * Hexagonal dome animation coloration shader
 */
export class HexaDomeColorationShader extends AdaptiveColorationShader {

  /** @override */
  static forceDefaultColor = true;

  /** @override */
  static fragmentShader = `
  ${this.SHADER_HEADER}
  ${this.PERCEIVED_BRIGHTNESS}

  // rotate and scale uv
  vec2 transform(in vec2 uv, in float dist) {
    float hspherize = (1.0 - sqrt(1.0 - dist)) / dist;
    float t = -time * 0.20;
    float scale = 10.0 / (11.0 - intensity);
    float cost = cos(t);
    float sint = sin(t);

    mat2 rotmat = mat2(cost, -sint, sint, cost);
    mat2 scalemat = mat2(scale, 0.0, 0.0, scale);
    uv -= PIVOT; 
    uv *= rotmat * scalemat * hspherize;
    uv += PIVOT;
    return uv;
  }

  // Adapted classic hexa algorithm
  float hexDist(in vec2 uv) {
    vec2 p = abs(uv);
    float c = dot(p, normalize(vec2(1.0, 1.73)));
    c = max(c, p.x);
    return c;
  }

  vec4 hexUvs(in vec2 uv) {
    const vec2 r = vec2(1.0, 1.73);
    const vec2 h = r*0.5;
    
    vec2 a = mod(uv, r) - h;
    vec2 b = mod(uv - h, r) - h;
    vec2 gv = dot(a, a) < dot(b,b) ? a : b;
    
    float x = atan(gv.x, gv.y);
    float y = 0.55 - hexDist(gv);
    vec2 id = uv - gv;
    return vec4(x, y, id.x, id.y);
  }

  vec3 hexa(in vec2 uv) {
    float t = time;
    vec2 uv1 = uv + vec2(0.0, sin(uv.y) * 0.25);
    vec2 uv2 = 0.5 * uv1 + 0.5 * uv + vec2(0.55, 0);
    float a = 0.2;
    float c = 0.5;
    float s = -1.0;
    uv2 *= mat2(c, -s, s, c);

    vec3 col = color;
    float hexy = hexUvs(uv2 * 10.0).y;
    float hexa = smoothstep( 3.0 * (cos(t)) + 4.5, 12.0, hexy * 20.0) * 3.0;

    col *= mix(hexa, 1.0 - hexa, min(hexy, 1.0 - hexy));
    col += color * fract(smoothstep(1.0, 2.0, hexy * 20.0)) * 0.65;
    return col;
  }

  void main() {
    ${this.FRAGMENT_BEGIN}

    // Rotate, magnify and hemispherize the uvs
    vec2 uv = transform(vUvs, dist);
    
    // Hexaify the uv (hemisphere) and apply fade and alpha
    finalColor = hexa(uv) * pow(1.0 - dist, 0.18) * colorationAlpha;
    ${this.COLORATION_TECHNIQUES}
    ${this.ADJUSTMENTS}
    ${this.FALLOFF}
    ${this.FRAGMENT_END}
  }`;
}

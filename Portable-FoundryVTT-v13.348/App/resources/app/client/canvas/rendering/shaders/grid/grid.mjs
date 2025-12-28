import AbstractBaseShader from "../base-shader.mjs";
import {GRID_TYPES} from "../../../../../common/constants.mjs";

/**
 * The grid shader used by {@link foundry.canvas.containers.GridMesh}.
 */
export default class GridShader extends AbstractBaseShader {

  /**
   * The grid type uniform.
   * @type {string}
   */
  static TYPE_UNIFORM = `
    const int TYPE_SQUARE = ${GRID_TYPES.SQUARE};
    const int TYPE_HEXODDR = ${GRID_TYPES.HEXODDR};
    const int TYPE_HEXEVENR = ${GRID_TYPES.HEXEVENR};
    const int TYPE_HEXODDQ = ${GRID_TYPES.HEXODDQ};
    const int TYPE_HEXEVENQ = ${GRID_TYPES.HEXEVENQ};

    uniform lowp int type;

    #define TYPE_IS_SQUARE (type == TYPE_SQUARE)
    #define TYPE_IS_HEXAGONAL ((TYPE_HEXODDR <= type) && (type <= TYPE_HEXEVENQ))
    #define TYPE_IS_HEXAGONAL_COLUMNS ((type == TYPE_HEXODDQ) || (type == TYPE_HEXEVENQ))
    #define TYPE_IS_HEXAGONAL_ROWS ((type == TYPE_HEXODDR) || (type == TYPE_HEXEVENR))
    #define TYPE_IS_HEXAGONAL_EVEN ((type == TYPE_HEXEVENR) || (type == TYPE_HEXEVENQ))
    #define TYPE_IS_HEXAGONAL_ODD ((type == TYPE_HEXODDR) || (type == TYPE_HEXODDQ))
  `;

  /* -------------------------------------------- */

  /**
   * The grid thickness uniform.
   * @type {string}
   */
  static THICKNESS_UNIFORM = "uniform float thickness;";

  /* -------------------------------------------- */

  /**
   * The grid color uniform.
   * @type {string}
   */
  static COLOR_UNIFORM = "uniform vec4 color;";

  /* -------------------------------------------- */

  /**
   * The resolution (pixels per grid space units) uniform.
   * @type {string}
   */
  static RESOLUTION_UNIFORM = "uniform float resolution;";

  /* -------------------------------------------- */

  /**
   * The antialiased step function.
   * The edge and x values is given in grid space units.
   * @type {string}
   */
  static ANTIALIASED_STEP_FUNCTION = `
    #define ANTIALIASED_STEP_TEMPLATE(type) \
      type antialiasedStep(type edge, type x) { \
        return clamp(((x - edge) * resolution) + 0.5, type(0.0), type(1.0)); \
      }

    ANTIALIASED_STEP_TEMPLATE(float)
    ANTIALIASED_STEP_TEMPLATE(vec2)
    ANTIALIASED_STEP_TEMPLATE(vec3)
    ANTIALIASED_STEP_TEMPLATE(vec4)

    #undef ANTIALIASED_STEP_TEMPLATE
  `;

  /* -------------------------------------------- */

  /**
   * The line converage function, which returns the alpha value at a point with the given distance (in grid space units)
   * from an antialiased line (or point) with the given thickness (in grid space units).
   * @type {string}
   */
  static LINE_COVERAGE_FUNCTION = `
    float lineCoverage(float distance, float thickness, float alignment) {
      float alpha0 = antialiasedStep((0.0 - alignment) * thickness, distance);
      float alpha1 = antialiasedStep((1.0 - alignment) * thickness, distance);
      return alpha0 - alpha1;
    }

    float lineCoverage(float distance, float thickness) {
      return lineCoverage(distance, thickness, 0.5);
    }
  `;

  /* -------------------------------------------- */

  /**
   * Hexagonal functions conversion for between grid and cube space.
   * @type {string}
   */
  static HEXAGONAL_FUNCTIONS = `
    vec2 pointToCube(vec2 p) {
      float x = p.x;
      float y = p.y;
      float q;
      float r;
      float e = TYPE_IS_HEXAGONAL_EVEN ? 1.0 : 0.0;
      if ( TYPE_IS_HEXAGONAL_COLUMNS ) {
        q = ((2.0 * SQRT1_3) * x) - (2.0 / 3.0);
        r = (-0.5 * (q + e)) + y;
      } else {
        r = ((2.0 * SQRT1_3) * y) - (2.0 / 3.0);
        q = (-0.5 * (r + e)) + x;
      }
      return vec2(q, r);
    }

    vec2 cubeToPoint(vec2 a) {
      float q = a[0];
      float r = a[1];
      float x;
      float y;
      float e = TYPE_IS_HEXAGONAL_EVEN ? 1.0 : 0.0;
      if ( TYPE_IS_HEXAGONAL_COLUMNS ) {
        x = (SQRT3 / 2.0) * (q + (2.0 / 3.0));
        y = (0.5 * (q + e)) + r;
      } else {
        y = (SQRT3 / 2.0) * (r + (2.0 / 3.0));
        x = (0.5 * (r + e)) + q;
      }
      return vec2(x, y);
    }

    vec2 offsetToCube(vec2 o) {
      float i = o[0];
      float j = o[1];
      float q;
      float r;
      float e = TYPE_IS_HEXAGONAL_EVEN ? 1.0 : -1.0;
      if ( TYPE_IS_HEXAGONAL_COLUMNS ) {
        q = j;
        r = i - ((j + (e * mod(j, 2.0))) * 0.5);
      } else {
        q = j - ((i + (e * mod(i, 2.0))) * 0.5);
        r = i;
      }
      return vec2(q, r);
    }

    ivec2 offsetToCube(ivec2 o) {
      int i = o[0];
      int j = o[1];
      int q;
      int r;
      int e = TYPE_IS_HEXAGONAL_EVEN ? 1 : -1;
      if ( TYPE_IS_HEXAGONAL_COLUMNS ) {
        q = j;
        r = i - ((j + (e * (j & 1))) / 2);
      } else {
        q = j - ((i + (e * (i & 1))) / 2);
        r = i;
      }
      return ivec2(q, r);
    }

    vec2 cubeToOffset(vec2 a) {
      float q = a[0];
      float r = a[1];
      float i;
      float j;
      float e = TYPE_IS_HEXAGONAL_EVEN ? 1.0 : -1.0;
      if ( TYPE_IS_HEXAGONAL_COLUMNS ) {
          j = q;
          i = r + ((q + (e * mod(q, 2.0))) * 0.5);
      } else {
          i = r;
          j = q + ((r + (e * mod(r, 2.0))) * 0.5);
      }
      return vec2(i, j);
    }

    ivec2 cubeToOffset(ivec2 a) {
      int q = a[0];
      int r = a[1];
      int i;
      int j;
      int e = TYPE_IS_HEXAGONAL_EVEN ? 1 : -1;
      if ( TYPE_IS_HEXAGONAL_COLUMNS ) {
          j = q;
          i = r + ((q + (e * (q & 1))) / 2);
      } else {
          i = r;
          j = q + ((r + (e * (r & 1))) / 2);
      }
      return ivec2(i, j);
    }

    vec2 cubeRound(vec2 a) {
      float q = a[0];
      float r = a[1];
      float s = -q - r;
      float iq = floor(q + 0.5);
      float ir = floor(r + 0.5);
      float is = floor(s + 0.5);
      float dq = abs(iq - q);
      float dr = abs(ir - r);
      float ds = abs(is - s);
      if ( (dq > dr) && (dq > ds) ) {
        iq = -ir - is;
      } else if ( dr > ds ) {
        ir = -iq - is;
      } else {
        is = -iq - ir;
      }
      return vec2(iq, ir);
    }

    float cubeDistance(vec2 a, vec2 b) {
      vec2 c = b - a;
      float q = c[0];
      float r = c[1];
      return (abs(q) + abs(r) + abs(q + r)) * 0.5;
    }

    int cubeDistance(ivec2 a, ivec2 b) {
      ivec2 c = b - a;
      int q = c[0];
      int r = c[1];
      return (abs(q) + abs(r) + abs(q + r)) / 2;
    }
  `;

  /* -------------------------------------------- */

  /**
   * Get the nearest vertex of a grid space to the given point.
   * @type {string}
   */
  static NEAREST_VERTEX_FUNCTION = `
    vec2 nearestVertex(vec2 p) {
      if ( TYPE_IS_SQUARE ) {
        return floor(p + 0.5);
      }

      if ( TYPE_IS_HEXAGONAL ) {
        vec2 c = cubeToPoint(cubeRound(pointToCube(p)));
        vec2 d = p - c;
        float a = atan(d.y, d.x);
        if ( TYPE_IS_HEXAGONAL_COLUMNS ) {
          a = floor((a / (PI / 3.0)) + 0.5) * (PI / 3.0);
        } else {
          a = (floor(a / (PI / 3.0)) + 0.5) * (PI / 3.0);
        }
        return c + (vec2(cos(a), sin(a)) * SQRT1_3);
      }
    }
  `;

  /* -------------------------------------------- */

  /**
   * This function returns the distance to the nearest edge of a grid space given a point.
   * @type {string}
   */
  static EDGE_DISTANCE_FUNCTION = `
    float edgeDistance(vec2 p) {
      if ( TYPE_IS_SQUARE ) {
        vec2 d = abs(p - floor(p + 0.5));
        return min(d.x, d.y);
      }

      if ( TYPE_IS_HEXAGONAL ) {
        vec2 a = pointToCube(p);
        vec2 b = cubeRound(a);
        vec2 c = b - a;
        float q = c[0];
        float r = c[1];
        float s = -q - r;
        return (2.0 - (abs(q - r) + abs(r - s) + abs(s - q))) * 0.25;
      }
    }
  `;

  /* -------------------------------------------- */

  /**
   * This function returns an vector (x, y, z), where
   * - x is the x-offset along the nearest edge,
   * - y is the y-offset (the distance) from the nearest edge, and
   * - z is the length of the nearest edge.
   * @type {string}
   */
  static EDGE_OFFSET_FUNCTION = `
    vec3 edgeOffset(vec2 p) {
      if ( TYPE_IS_SQUARE ) {
        vec2 d = abs(p - floor(p + 0.5));
        return vec3(max(d.x, d.y), min(d.x, d.y), 1.0);
      }

      if ( TYPE_IS_HEXAGONAL ) {
        vec2 c = cubeToPoint(cubeRound(pointToCube(p)));
        vec2 d = p - c;
        float a = atan(d.y, d.x);
        if ( TYPE_IS_HEXAGONAL_COLUMNS ) {
          a = (floor(a / (PI / 3.0)) + 0.5) * (PI / 3.0);
        } else {
          a = floor((a / (PI / 3.0)) + 0.5) * (PI / 3.0);
        }
        vec2 n = vec2(cos(a), sin(a));
        return vec3((0.5 * SQRT1_3) + dot(d, vec2(-n.y, n.x)), 0.5 - dot(d, n), SQRT1_3);
      }
    }
  `;

  /* -------------------------------------------- */

  /**
   * A function that draws the grid given a grid point, style, thickness, and color.
   * @type {string}
   */
  static DRAW_GRID_FUNCTION = `
    const int STYLE_LINE_SOLID = 0;
    const int STYLE_LINE_DASHED = 1;
    const int STYLE_LINE_DOTTED = 2;
    const int STYLE_POINT_SQUARE = 3;
    const int STYLE_POINT_DIAMOND = 4;
    const int STYLE_POINT_ROUND = 5;

    vec4 drawGrid(vec2 point, int style, float thickness, vec4 color) {
      float alpha;

      if ( style == STYLE_POINT_SQUARE ) {
        vec2 offset = abs(nearestVertex(point) - point);
        float distance = max(offset.x, offset.y);
        alpha = lineCoverage(distance, thickness);
      }

      else if ( style == STYLE_POINT_DIAMOND ) {
        vec2 offset = abs(nearestVertex(point) - point);
        float distance = (offset.x + offset.y) * SQRT1_2;
        alpha = lineCoverage(distance, thickness);
      }

      else if ( style == STYLE_POINT_ROUND ) {
        float distance = distance(point, nearestVertex(point));
        alpha = lineCoverage(distance, thickness);
      }

      else if ( style == STYLE_LINE_SOLID ) {
        float distance = edgeDistance(point);
        alpha = lineCoverage(distance, thickness);
      }

      else if ( (style == STYLE_LINE_DASHED) || (style == STYLE_LINE_DOTTED) ) {
        vec3 offset = edgeOffset(point);
        if ( (style == STYLE_LINE_DASHED) && TYPE_IS_HEXAGONAL ) {
          float padding = thickness * ((1.0 - SQRT1_3) * 0.5);
          offset.x += padding;
          offset.z += (padding * 2.0);
        }

        float intervals = offset.z * 0.5 / thickness;
        if ( intervals < 0.5 ) {
          alpha = lineCoverage(offset.y, thickness);
        } else {
          float interval = thickness * (2.0 * (intervals / floor(intervals + 0.5)));
          float dx = offset.x - (floor((offset.x / interval) + 0.5) * interval);
          float dy = offset.y;

          if ( style == STYLE_LINE_DOTTED ) {
            alpha = lineCoverage(length(vec2(dx, dy)), thickness);
          } else {
            alpha = min(lineCoverage(dx, thickness), lineCoverage(dy, thickness));
          }
        }
      }

      return color * alpha;
    }
  `;

  /* -------------------------------------------- */

  /** @override */
  static vertexShader = `
    #version 300 es

    ${this.GLSL1_COMPATIBILITY_VERTEX}

    precision ${PIXI.settings.PRECISION_VERTEX} float;

    in vec2 aVertexPosition;

    uniform mat3 translationMatrix;
    uniform mat3 projectionMatrix;
    uniform vec4 meshDimensions;
    uniform vec2 canvasDimensions;
    uniform vec4 sceneDimensions;
    uniform vec2 screenDimensions;
    uniform float gridSize;

    out vec2 vGridCoord; // normalized grid coordinates
    out vec2 vCanvasCoord; // normalized canvas coordinates
    out vec2 vSceneCoord; // normalized scene coordinates
    out vec2 vScreenCoord; // normalized screen coordinates

    void main() {
      vec2 pixelCoord = (aVertexPosition * meshDimensions.zw) + meshDimensions.xy;
      vGridCoord = pixelCoord / gridSize;
      vCanvasCoord = pixelCoord / canvasDimensions;
      vSceneCoord = (pixelCoord - sceneDimensions.xy) / sceneDimensions.zw;
      vec3 tPos = translationMatrix * vec3(aVertexPosition, 1.0);
      vScreenCoord = tPos.xy / screenDimensions;
      gl_Position = vec4((projectionMatrix * tPos).xy, 0.0, 1.0);
    }
  `;

  /* -------------------------------------------- */

  /** @override */
  static get fragmentShader() {
    return `
      #version 300 es

      ${this.GLSL1_COMPATIBILITY_FRAGMENT}

      precision ${PIXI.settings.PRECISION_FRAGMENT} float;

      in vec2 vGridCoord; // normalized grid coordinates
      in vec2 vCanvasCoord; // normalized canvas coordinates
      in vec2 vSceneCoord; // normalized scene coordinates
      in vec2 vScreenCoord; // normalized screen coordinates

      ${this.CONSTANTS}

      ${this.TYPE_UNIFORM}
      ${this.THICKNESS_UNIFORM}
      ${this.COLOR_UNIFORM}
      ${this.RESOLUTION_UNIFORM}

      ${this.ANTIALIASED_STEP_FUNCTION}
      ${this.LINE_COVERAGE_FUNCTION}
      ${this.HEXAGONAL_FUNCTIONS}
      ${this.NEAREST_VERTEX_FUNCTION}
      ${this.EDGE_DISTANCE_FUNCTION}
      ${this.EDGE_OFFSET_FUNCTION}

      ${this._fragmentShader}

      uniform float alpha;

      out vec4 fragColor;

      void main() {
        fragColor = _main() * alpha;
      }
    `;
  }

  /* ---------------------------------------- */

  /**
   * The fragment shader source. Subclasses can override it.
   * @type {string}
   * @protected
   */
  static _fragmentShader = `
    uniform lowp int style;

    ${this.DRAW_GRID_FUNCTION}

    vec4 _main() {
      return drawGrid(vGridCoord, style, thickness, color);
    }
  `;

  /* ---------------------------------------- */

  /** @override */
  static defaultUniforms = {
    canvasDimensions: [1, 1],
    meshDimensions: [0, 0, 1, 1],
    sceneDimensions: [0, 0, 1, 1],
    screenDimensions: [1, 1],
    gridSize: 1,
    type: 0,
    thickness: 0,
    resolution: 0,
    color: [0, 0, 0, 0],
    alpha: 0,
    style: 0
  };

  /* ---------------------------------------- */

  /**
   * Configure the shader.
   * @param {object} options
   */
  configure(options) {
    if ( "style" in options ) {
      this.uniforms.style = options.style ?? 0;
    }
  }

  /* ---------------------------------------- */

  #color = new PIXI.Color(0);

  /* ---------------------------------------- */

  /** @override */
  _preRender(mesh, renderer) {
    const data = mesh.data;
    const size = data.size;
    const uniforms = this.uniforms;
    const dimensions = canvas.dimensions;
    uniforms.meshDimensions[0] = mesh.x;
    uniforms.meshDimensions[1] = mesh.y;
    uniforms.meshDimensions[2] = data.width; // === mesh.width
    uniforms.meshDimensions[3] = data.height; // === mesh.height
    uniforms.canvasDimensions[0] = dimensions.width;
    uniforms.canvasDimensions[1] = dimensions.height;
    uniforms.sceneDimensions = dimensions.sceneRect;
    uniforms.screenDimensions = canvas.screenDimensions;
    uniforms.gridSize = size;
    uniforms.type = data.type;
    uniforms.thickness = data.thickness / size;
    uniforms.alpha = mesh.worldAlpha;
    this.#color.setValue(data.color).toArray(uniforms.color);

    // Only uniform scale is supported!
    const {resolution} = renderer.renderTexture.current ?? renderer;
    let scale = resolution * mesh.worldTransform.a / data.width;
    const projection = renderer.projection.transform;
    if ( projection ) {
      const {a, b} = projection;
      scale *= Math.sqrt((a * a) + (b * b));
    }
    uniforms.resolution = scale * size;
  }
}

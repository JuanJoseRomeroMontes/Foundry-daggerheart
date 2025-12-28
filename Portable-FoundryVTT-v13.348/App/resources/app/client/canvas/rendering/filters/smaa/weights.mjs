/**
 * @import {SMAAFilterConfig} from "./_types.mjs";
 */

/**
 * The blending weight calculation filter for {@link foundry.canvas.rendering.filters.SMAAFilter}.
 */
export default class SMAABlendingWeightCalculationFilter extends PIXI.Filter {
  /**
   * @param {Omit<SMAAFilterConfig, "localContrastAdaptionFactor">} config
   */
  constructor(config) {
    super(generateVertexSource(config), generateFragmentSource(config), {areaTex, searchTex});
  }
}

/* -------------------------------------------- */

/**
 * The fragment shader source of {@link SMAABlendingWeightCalculationFilter}.
 * @param {Omit<SMAAFilterConfig, "localContrastAdaptionFactor">} config
 * @returns {string}
 */
function generateVertexSource(config) {
  return `\
#define mad(a, b, c) (a * b + c)

#define SMAA_MAX_SEARCH_STEPS ${config.maxSearchSteps}

attribute vec2 aVertexPosition;

uniform mat3 projectionMatrix;
uniform vec4 inputSize;
uniform vec4 inputPixel;
uniform vec4 outputFrame;

#define resolution (inputPixel.xy)
#define SMAA_RT_METRICS (inputPixel.zwxy)

varying vec2 vTexCoord0;
varying vec2 vPixCoord;
varying vec4 vOffset[3];

void main() {
    vTexCoord0 = aVertexPosition * (outputFrame.zw * inputSize.zw);

    vPixCoord = vTexCoord0 * SMAA_RT_METRICS.zw;

    // We will use these offsets for the searches later on (see @PSEUDO_GATHER4):
    vOffset[0] = mad(SMAA_RT_METRICS.xyxy, vec4(-0.25, -0.125,  1.25, -0.125), vTexCoord0.xyxy);
    vOffset[1] = mad(SMAA_RT_METRICS.xyxy, vec4(-0.125, -0.25, -0.125,  1.25), vTexCoord0.xyxy);

    // And these for the searches, they indicate the ends of the loops:
    vOffset[2] = mad(
      SMAA_RT_METRICS.xxyy,
      vec4(-2.0, 2.0, -2.0, 2.0) * float(SMAA_MAX_SEARCH_STEPS),
      vec4(vOffset[0].xz, vOffset[1].yw)
    );

    vec3 position = vec3(aVertexPosition * max(outputFrame.zw, vec2(0.0)) + outputFrame.xy, 1.0);
    gl_Position = vec4((projectionMatrix * position).xy, 0.0, 1.0);
}
`;
}

/* -------------------------------------------- */

/**
 * The fragment shader source of {@link SMAABlendingWeightCalculationFilter}.
 * @param {SMAAFilterConfig} config
 * @returns {string}
 */
function generateFragmentSource(config) {
  return `\
precision highp float;
precision highp int;

#define SMAA_THRESHOLD ${config.threshold.toFixed(8)}
#define SMAA_MAX_SEARCH_STEPS ${config.maxSearchSteps}
#define SMAA_MAX_SEARCH_STEPS_DIAG ${config.maxSearchStepsDiag}
#define SMAA_CORNER_ROUNDING ${config.cornerRounding}
${config.disableDiagDetection ? "#define SMAA_DISABLE_DIAG_DETECTION" : ""}
${config.disableCornerDetection ? "#define SMAA_DISABLE_CORNER_DETECTION" : ""}

// Non-Configurable Defines
#define SMAA_AREATEX_MAX_DISTANCE 16
#define SMAA_AREATEX_MAX_DISTANCE_DIAG 20
#define SMAA_AREATEX_PIXEL_SIZE (1.0 / vec2(160.0, 560.0))
#define SMAA_AREATEX_SUBTEX_SIZE (1.0 / 7.0)
#define SMAA_SEARCHTEX_SIZE vec2(66.0, 33.0)
#define SMAA_SEARCHTEX_PACKED_SIZE vec2(64.0, 16.0)
#define SMAA_CORNER_ROUNDING_NORM (float(SMAA_CORNER_ROUNDING) / 100.0)

// Texture Access Defines
#ifndef SMAA_AREATEX_SELECT
#define SMAA_AREATEX_SELECT(sample) sample.rg
#endif

#ifndef SMAA_SEARCHTEX_SELECT
#define SMAA_SEARCHTEX_SELECT(sample) sample.r
#endif

uniform sampler2D uSampler; // edgesTex
uniform sampler2D areaTex;
uniform sampler2D searchTex;
uniform vec4 inputPixel;

#define edgesTex uSampler
#define resolution (inputPixel.xy)
#define SMAA_RT_METRICS (inputPixel.zwxy)

varying vec2 vTexCoord0;
varying vec4 vOffset[3];
varying vec2 vPixCoord;

#define mad(a, b, c) (a * b + c)
#define saturate(a) clamp(a, 0.0, 1.0)
#define round(v) floor(v + 0.5)
#define SMAASampleLevelZeroOffset(tex, coord, offset) texture2D(tex, coord + offset * SMAA_RT_METRICS.xy)

/**
 * Conditional move:
 */
void SMAAMovc(bvec2 cond, inout vec2 variable, vec2 value) {
  if (cond.x) variable.x = value.x;
  if (cond.y) variable.y = value.y;
}

void SMAAMovc(bvec4 cond, inout vec4 variable, vec4 value) {
  SMAAMovc(cond.xy, variable.xy, value.xy);
  SMAAMovc(cond.zw, variable.zw, value.zw);
}

/**
 * Allows to decode two binary values from a bilinear-filtered access.
 */
vec2 SMAADecodeDiagBilinearAccess(vec2 e) {
  // Bilinear access for fetching 'e' have a 0.25 offset, and we are
  // interested in the R and G edges:
  //
  // +---G---+-------+
  // |   x o R   x   |
  // +-------+-------+
  //
  // Then, if one of these edge is enabled:
  //   Red:   (0.75 * X + 0.25 * 1) => 0.25 or 1.0
  //   Green: (0.75 * 1 + 0.25 * X) => 0.75 or 1.0
  //
  // This function will unpack the values (mad + mul + round):
  // wolframalpha.com: round(x * abs(5 * x - 5 * 0.75)) plot 0 to 1
  e.r = e.r * abs(5.0 * e.r - 5.0 * 0.75);
  return round(e);
}

vec4 SMAADecodeDiagBilinearAccess(vec4 e) {
  e.rb = e.rb * abs(5.0 * e.rb - 5.0 * 0.75);
  return round(e);
}

/**
 * These functions allows to perform diagonal pattern searches.
 */
vec2 SMAASearchDiag1(sampler2D edgesTex, vec2 texcoord, vec2 dir, out vec2 e) {
  vec4 coord = vec4(texcoord, -1.0, 1.0);
  vec3 t = vec3(SMAA_RT_METRICS.xy, 1.0);

  for (int i = 0; i < SMAA_MAX_SEARCH_STEPS; i++) {
    if (!(coord.z < float(SMAA_MAX_SEARCH_STEPS_DIAG - 1) && coord.w > 0.9)) break;
    coord.xyz = mad(t, vec3(dir, 1.0), coord.xyz);
    e = texture2D(edgesTex, coord.xy).rg; // LinearSampler
    coord.w = dot(e, vec2(0.5, 0.5));
  }
  return coord.zw;
}

vec2 SMAASearchDiag2(sampler2D edgesTex, vec2 texcoord, vec2 dir, out vec2 e) {
  vec4 coord = vec4(texcoord, -1.0, 1.0);
  coord.x += 0.25 * SMAA_RT_METRICS.x; // See @SearchDiag2Optimization
  vec3 t = vec3(SMAA_RT_METRICS.xy, 1.0);

  for (int i = 0; i < SMAA_MAX_SEARCH_STEPS; i++) {
    if (!(coord.z < float(SMAA_MAX_SEARCH_STEPS_DIAG - 1) && coord.w > 0.9)) break;
    coord.xyz = mad(t, vec3(dir, 1.0), coord.xyz);

    // @SearchDiag2Optimization
    // Fetch both edges at once using bilinear filtering:
    e = texture2D(edgesTex, coord.xy).rg; // LinearSampler
    e = SMAADecodeDiagBilinearAccess(e);

    // Non-optimized version:
    // e.g = texture2D(edgesTex, coord.xy).g; // LinearSampler
    // e.r = SMAASampleLevelZeroOffset(edgesTex, coord.xy, vec2(1, 0)).r;

    coord.w = dot(e, vec2(0.5, 0.5));
  }
  return coord.zw;
}

/**
 * Similar to SMAAArea, this calculates the area corresponding to a certain
 * diagonal distance and crossing edges 'e'.
 */
vec2 SMAAAreaDiag(sampler2D areaTex, vec2 dist, vec2 e, float offset) {
  vec2 texcoord = mad(vec2(SMAA_AREATEX_MAX_DISTANCE_DIAG, SMAA_AREATEX_MAX_DISTANCE_DIAG), e, dist);

  // We do a scale and bias for mapping to texel space:
  texcoord = mad(SMAA_AREATEX_PIXEL_SIZE, texcoord, 0.5 * SMAA_AREATEX_PIXEL_SIZE);

  // Diagonal areas are on the second half of the texture:
  texcoord.x += 0.5;

  // Move to proper place, according to the subpixel offset:
  texcoord.y += SMAA_AREATEX_SUBTEX_SIZE * offset;

  // Do it!
  return SMAA_AREATEX_SELECT(texture2D(areaTex, texcoord)); // LinearSampler
}

/**
 * This searches for diagonal patterns and returns the corresponding weights.
 */
vec2 SMAACalculateDiagWeights(sampler2D edgesTex, sampler2D areaTex, vec2 texcoord, vec2 e, vec4 subsampleIndices) {
  vec2 weights = vec2(0.0, 0.0);

  // Search for the line ends:
  vec4 d;
  vec2 end;
  if (e.r > 0.0) {
      d.xz = SMAASearchDiag1(edgesTex, texcoord, vec2(-1.0,  1.0), end);
      d.x += float(end.y > 0.9);
  } else
      d.xz = vec2(0.0, 0.0);
  d.yw = SMAASearchDiag1(edgesTex, texcoord, vec2(1.0, -1.0), end);

  if (d.x + d.y > 2.0) { // d.x + d.y + 1 > 3
    // Fetch the crossing edges:
    vec4 coords = mad(vec4(-d.x + 0.25, d.x, d.y, -d.y - 0.25), SMAA_RT_METRICS.xyxy, texcoord.xyxy);
    vec4 c;
    c.xy = SMAASampleLevelZeroOffset(edgesTex, coords.xy, vec2(-1,  0)).rg;
    c.zw = SMAASampleLevelZeroOffset(edgesTex, coords.zw, vec2( 1,  0)).rg;
    c.yxwz = SMAADecodeDiagBilinearAccess(c.xyzw);

    // Non-optimized version:
    // vec4 coords = mad(vec4(-d.x, d.x, d.y, -d.y), SMAA_RT_METRICS.xyxy, texcoord.xyxy);
    // vec4 c;
    // c.x = SMAASampleLevelZeroOffset(edgesTex, coords.xy, vec2(-1,  0)).g;
    // c.y = SMAASampleLevelZeroOffset(edgesTex, coords.xy, vec2( 0,  0)).r;
    // c.z = SMAASampleLevelZeroOffset(edgesTex, coords.zw, vec2( 1,  0)).g;
    // c.w = SMAASampleLevelZeroOffset(edgesTex, coords.zw, vec2( 1, -1)).r;

    // Merge crossing edges at each side into a single value:
    vec2 cc = mad(vec2(2.0, 2.0), c.xz, c.yw);

    // Remove the crossing edge if we didn't found the end of the line:
    SMAAMovc(bvec2(step(0.9, d.zw)), cc, vec2(0.0, 0.0));

    // Fetch the areas for this line:
    weights += SMAAAreaDiag(areaTex, d.xy, cc, subsampleIndices.z);
  }

  // Search for the line ends:
  d.xz = SMAASearchDiag2(edgesTex, texcoord, vec2(-1.0, -1.0), end);
  if (SMAASampleLevelZeroOffset(edgesTex, texcoord, vec2(1, 0)).r > 0.0) {
    d.yw = SMAASearchDiag2(edgesTex, texcoord, vec2(1.0, 1.0), end);
    d.y += float(end.y > 0.9);
  } else {
    d.yw = vec2(0.0, 0.0);
  }

  if (d.x + d.y > 2.0) { // d.x + d.y + 1 > 3
    // Fetch the crossing edges:
    vec4 coords = mad(vec4(-d.x, -d.x, d.y, d.y), SMAA_RT_METRICS.xyxy, texcoord.xyxy);
    vec4 c;
    c.x  = SMAASampleLevelZeroOffset(edgesTex, coords.xy, vec2(-1,  0)).g;
    c.y  = SMAASampleLevelZeroOffset(edgesTex, coords.xy, vec2( 0, -1)).r;
    c.zw = SMAASampleLevelZeroOffset(edgesTex, coords.zw, vec2( 1,  0)).gr;
    vec2 cc = mad(vec2(2.0, 2.0), c.xz, c.yw);

    // Remove the crossing edge if we didn't found the end of the line:
    SMAAMovc(bvec2(step(0.9, d.zw)), cc, vec2(0.0, 0.0));

    // Fetch the areas for this line:
    weights += SMAAAreaDiag(areaTex, d.xy, cc, subsampleIndices.w).gr;
  }

  return weights;
}

/**
 * This allows to determine how much length should we add in the last step
 * of the searches. It takes the bilinearly interpolated edge (see
 * @PSEUDO_GATHER4), and adds 0, 1 or 2, depending on which edges and
 * crossing edges are active.
 */
float SMAASearchLength(sampler2D searchTex, vec2 e, float offset) {
  // The texture is flipped vertically, with left and right cases taking half
  // of the space horizontally:
  vec2 scale = SMAA_SEARCHTEX_SIZE * vec2(0.5, -1.0);
  vec2 bias = SMAA_SEARCHTEX_SIZE * vec2(offset, 1.0);

  // Scale and bias to access texel centers:
  scale += vec2(-1.0,  1.0);
  bias  += vec2( 0.5, -0.5);

  // Convert from pixel coordinates to texcoords:
  // (We use SMAA_SEARCHTEX_PACKED_SIZE because the texture is cropped)
  scale *= 1.0 / SMAA_SEARCHTEX_PACKED_SIZE;
  bias *= 1.0 / SMAA_SEARCHTEX_PACKED_SIZE;

  // Lookup the search texture:
  return SMAA_SEARCHTEX_SELECT(texture2D(searchTex, mad(scale, e, bias))); // LinearSampler
}

/**
 * Horizontal/vertical search functions for the 2nd pass.
 */
float SMAASearchXLeft(sampler2D edgesTex, sampler2D searchTex, vec2 texcoord, float end) {
  /**
    * @PSEUDO_GATHER4
    * This texcoord has been offset by (-0.25, -0.125) in the vertex shader to
    * sample between edge, thus fetching four edges in a row.
    * Sampling with different offsets in each direction allows to disambiguate
    * which edges are active from the four fetched ones.
    */
  vec2 e = vec2(0.0, 1.0);
  for (int i = 0; i < SMAA_MAX_SEARCH_STEPS; i++) {
    if (!(texcoord.x > end && e.g > 0.8281 && e.r == 0.0)) break;
    e = texture2D(edgesTex, texcoord).rg; // LinearSampler
    texcoord = mad(-vec2(2.0, 0.0), SMAA_RT_METRICS.xy, texcoord);
  }

  float offset = mad(-(255.0 / 127.0), SMAASearchLength(searchTex, e, 0.0), 3.25);
  return mad(SMAA_RT_METRICS.x, offset, texcoord.x);

  // Non-optimized version:
  // We correct the previous (-0.25, -0.125) offset we applied:
  // texcoord.x += 0.25 * SMAA_RT_METRICS.x;

  // The searches are bias by 1, so adjust the coords accordingly:
  // texcoord.x += SMAA_RT_METRICS.x;

  // Disambiguate the length added by the last step:
  // texcoord.x += 2.0 * SMAA_RT_METRICS.x; // Undo last step
  // texcoord.x -= SMAA_RT_METRICS.x * (255.0 / 127.0) * SMAASearchLength(searchTex, e, 0.0);
  // return mad(SMAA_RT_METRICS.x, offset, texcoord.x);
}

float SMAASearchXRight(sampler2D edgesTex, sampler2D searchTex, vec2 texcoord, float end) {
  vec2 e = vec2(0.0, 1.0);
  for (int i = 0; i < SMAA_MAX_SEARCH_STEPS; i++) { if (!(texcoord.x < end && e.g > 0.8281 && e.r == 0.0)) break;
    e = texture2D(edgesTex, texcoord).rg; // LinearSampler
    texcoord = mad(vec2(2.0, 0.0), SMAA_RT_METRICS.xy, texcoord);
  }
  float offset = mad(-(255.0 / 127.0), SMAASearchLength(searchTex, e, 0.5), 3.25);
  return mad(-SMAA_RT_METRICS.x, offset, texcoord.x);
}

float SMAASearchYUp(sampler2D edgesTex, sampler2D searchTex, vec2 texcoord, float end) {
  vec2 e = vec2(1.0, 0.0);
  for (int i = 0; i < SMAA_MAX_SEARCH_STEPS; i++) { if (!(texcoord.y > end && e.r > 0.8281 && e.g == 0.0)) break;
    e = texture2D(edgesTex, texcoord).rg; // LinearSampler
    texcoord = mad(-vec2(0.0, 2.0), SMAA_RT_METRICS.xy, texcoord);
  }
  float offset = mad(-(255.0 / 127.0), SMAASearchLength(searchTex, e.gr, 0.0), 3.25);
  return mad(SMAA_RT_METRICS.y, offset, texcoord.y);
}

float SMAASearchYDown(sampler2D edgesTex, sampler2D searchTex, vec2 texcoord, float end) {
  vec2 e = vec2(1.0, 0.0);
  for (int i = 0; i < SMAA_MAX_SEARCH_STEPS; i++) { if (!(texcoord.y < end && e.r > 0.8281 && e.g == 0.0)) break;
    e = texture2D(edgesTex, texcoord).rg; // LinearSampler
    texcoord = mad(vec2(0.0, 2.0), SMAA_RT_METRICS.xy, texcoord);
  }
  float offset = mad(-(255.0 / 127.0), SMAASearchLength(searchTex, e.gr, 0.5), 3.25);
  return mad(-SMAA_RT_METRICS.y, offset, texcoord.y);
}

/**
 * Ok, we have the distance and both crossing edges. So, what are the areas
 * at each side of current edge?
 */
vec2 SMAAArea(sampler2D areaTex, vec2 dist, float e1, float e2, float offset) {
  // Rounding prevents precision errors of bilinear filtering:
  vec2 texcoord = mad(vec2(SMAA_AREATEX_MAX_DISTANCE, SMAA_AREATEX_MAX_DISTANCE), round(4.0 * vec2(e1, e2)), dist);

  // We do a scale and bias for mapping to texel space:
  texcoord = mad(SMAA_AREATEX_PIXEL_SIZE, texcoord, 0.5 * SMAA_AREATEX_PIXEL_SIZE);

  // Move to proper place, according to the subpixel offset:
  texcoord.y = mad(SMAA_AREATEX_SUBTEX_SIZE, offset, texcoord.y);

  // Do it!
  return SMAA_AREATEX_SELECT(texture2D(areaTex, texcoord)); // LinearSampler
}

// Corner Detection Functions
void SMAADetectHorizontalCornerPattern(sampler2D edgesTex, inout vec2 weights, vec4 texcoord, vec2 d) {
  #if !defined(SMAA_DISABLE_CORNER_DETECTION)
  vec2 leftRight = step(d.xy, d.yx);
  vec2 rounding = (1.0 - SMAA_CORNER_ROUNDING_NORM) * leftRight;

  rounding /= leftRight.x + leftRight.y; // Reduce blending for pixels in the center of a line.

  vec2 factor = vec2(1.0, 1.0);
  factor.x -= rounding.x * SMAASampleLevelZeroOffset(edgesTex, texcoord.xy, vec2(0,  1)).r;
  factor.x -= rounding.y * SMAASampleLevelZeroOffset(edgesTex, texcoord.zw, vec2(1,  1)).r;
  factor.y -= rounding.x * SMAASampleLevelZeroOffset(edgesTex, texcoord.xy, vec2(0, -2)).r;
  factor.y -= rounding.y * SMAASampleLevelZeroOffset(edgesTex, texcoord.zw, vec2(1, -2)).r;

  weights *= saturate(factor);
  #endif
}

void SMAADetectVerticalCornerPattern(sampler2D edgesTex, inout vec2 weights, vec4 texcoord, vec2 d) {
  #if !defined(SMAA_DISABLE_CORNER_DETECTION)
  vec2 leftRight = step(d.xy, d.yx);
  vec2 rounding = (1.0 - SMAA_CORNER_ROUNDING_NORM) * leftRight;

  rounding /= leftRight.x + leftRight.y;

  vec2 factor = vec2(1.0, 1.0);
  factor.x -= rounding.x * SMAASampleLevelZeroOffset(edgesTex, texcoord.xy, vec2( 1, 0)).g;
  factor.x -= rounding.y * SMAASampleLevelZeroOffset(edgesTex, texcoord.zw, vec2( 1, 1)).g;
  factor.y -= rounding.x * SMAASampleLevelZeroOffset(edgesTex, texcoord.xy, vec2(-2, 0)).g;
  factor.y -= rounding.y * SMAASampleLevelZeroOffset(edgesTex, texcoord.zw, vec2(-2, 1)).g;

  weights *= saturate(factor);
  #endif
}

void main() {
  vec4 subsampleIndices = vec4(0.0); // Just pass zero for SMAA 1x, see @SUBSAMPLE_INDICES.
  // subsampleIndices = vec4(1.0, 1.0, 1.0, 0.0);
  vec4 weights = vec4(0.0, 0.0, 0.0, 0.0);
  vec2 e = texture2D(edgesTex, vTexCoord0).rg;

  if (e.g > 0.0) { // Edge at north

    #if !defined(SMAA_DISABLE_DIAG_DETECTION)
    // Diagonals have both north and west edges, so searching for them in
    // one of the boundaries is enough.
    weights.rg = SMAACalculateDiagWeights(edgesTex, areaTex, vTexCoord0, e, subsampleIndices);

    // We give priority to diagonals, so if we find a diagonal we skip
    // horizontal/vertical processing.
    if (weights.r == -weights.g) { // weights.r + weights.g == 0.0
    #endif

    vec2 d;

    // Find the distance to the left:
    vec3 coords;
    coords.x = SMAASearchXLeft(edgesTex, searchTex, vOffset[0].xy, vOffset[2].x);
    coords.y = vOffset[1].y; // vOffset[1].y = vTexCoord0.y - 0.25 * SMAA_RT_METRICS.y (@CROSSING_OFFSET)
    d.x = coords.x;

    // Now fetch the left crossing edges, two at a time using bilinear
    // filtering. Sampling at -0.25 (see @CROSSING_OFFSET) enables to
    // discern what value each edge has:
    float e1 = texture2D(edgesTex, coords.xy).r; // LinearSampler

    // Find the distance to the right:
    coords.z = SMAASearchXRight(edgesTex, searchTex, vOffset[0].zw, vOffset[2].y);
    d.y = coords.z;

    // We want the distances to be in pixel units (doing this here allow to
    // better interleave arithmetic and memory accesses):
    d = abs(round(mad(SMAA_RT_METRICS.zz, d, -vPixCoord.xx)));

    // SMAAArea below needs a sqrt, as the areas texture is compressed
    // quadratically:
    vec2 sqrt_d = sqrt(d);

    // Fetch the right crossing edges:
    float e2 = SMAASampleLevelZeroOffset(edgesTex, coords.zy, vec2(1, 0)).r;

    // Ok, we know how this pattern looks like, now it is time for getting
    // the actual area:
    weights.rg = SMAAArea(areaTex, sqrt_d, e1, e2, subsampleIndices.y);

    // Fix corners:
    coords.y = vTexCoord0.y;
    SMAADetectHorizontalCornerPattern(edgesTex, weights.rg, coords.xyzy, d);

    #if !defined(SMAA_DISABLE_DIAG_DETECTION)
    } else
    e.r = 0.0; // Skip vertical processing.
    #endif
  }

  if (e.r > 0.0) { // Edge at west
    vec2 d;

    // Find the distance to the top:
    vec3 coords;
    coords.y = SMAASearchYUp(edgesTex, searchTex, vOffset[1].xy, vOffset[2].z);
    coords.x = vOffset[0].x; // vOffset[1].x = vTexCoord0.x - 0.25 * SMAA_RT_METRICS.x;
    d.x = coords.y;

    // Fetch the top crossing edges:
    float e1 = texture2D(edgesTex, coords.xy).g; // LinearSampler

    // Find the distance to the bottom:
    coords.z = SMAASearchYDown(edgesTex, searchTex, vOffset[1].zw, vOffset[2].w);
    d.y = coords.z;

    // We want the distances to be in pixel units:
    d = abs(round(mad(SMAA_RT_METRICS.ww, d, -vPixCoord.yy)));

    // SMAAArea below needs a sqrt, as the areas texture is compressed
    // quadratically:
    vec2 sqrt_d = sqrt(d);

    // Fetch the bottom crossing edges:
    float e2 = SMAASampleLevelZeroOffset(edgesTex, coords.xz, vec2(0, 1)).g;

    // Get the area for this direction:
    weights.ba = SMAAArea(areaTex, sqrt_d, e1, e2, subsampleIndices.x);

    // Fix corners:
    coords.x = vTexCoord0.x;
    SMAADetectVerticalCornerPattern(edgesTex, weights.ba, coords.xyxz, d);
  }

  gl_FragColor = weights;
}
`;
}

/* -------------------------------------------- */

/**
 * The area texture of {@link SMAABlendingWeightCalculationFilter}.
 * @type {PIXI.Texture}
 */
const areaTex = new PIXI.Texture(new PIXI.BaseTexture(
  "data:image/webp;base64,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",
  {
    mipmap: PIXI.MIPMAP_MODES.OFF,
    anisotropicLevel: 0,
    wrapMode: PIXI.WRAP_MODES.CLAMP,
    scaleMode: PIXI.SCALE_MODES.LINEAR,
    format: PIXI.FORMATS.RG,
    type: PIXI.TYPES.UNSIGNED_BYTE
  }
));

/* -------------------------------------------- */

/**
 * The search texture of {@link SMAABlendingWeightCalculationFilter}.
 * @type {PIXI.Texture}
 */
const searchTex = new PIXI.Texture(new PIXI.BaseTexture(
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAAAQCAYAAACm53kpAAAAAXNSR0IArs4c6QAAAIBJREFUWEftl1ELgCAMhD/749Ift1pNEBlRvfRw82XisQ3mbqelwQawANU2wOq2uY0wh0IzxpljRpidWc6edww6+9/l/YIV+QIcF392gOrKDkgKqFNAfgZU7wCToCeSFUnVPEDfymD3/0UG5QuQFEgKXA8h2RkgT4EsQD6EtD9DO7PRXAFvjEKRAAAAAElFTkSuQmCC",
  {
    mipmap: PIXI.MIPMAP_MODES.OFF,
    anisotropicLevel: 0,
    wrapMode: PIXI.WRAP_MODES.CLAMP,
    scaleMode: PIXI.SCALE_MODES.LINEAR,
    format: PIXI.FORMATS.RED,
    type: PIXI.TYPES.UNSIGNED_BYTE
  }
));

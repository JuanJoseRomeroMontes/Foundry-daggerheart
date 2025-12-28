export const BLEND_MODES = {};

/**
 * A custom blend mode equation which chooses the maximum color from each channel within the stack.
 * @type {number[]}
 */
BLEND_MODES.MAX_COLOR = [
  WebGL2RenderingContext.ONE,
  WebGL2RenderingContext.ONE,
  WebGL2RenderingContext.ONE,
  WebGL2RenderingContext.ONE,
  WebGL2RenderingContext.MAX,
  WebGL2RenderingContext.MAX
];

/**
 * A custom blend mode equation which chooses the minimum color from each channel within the stack.
 * @type {number[]}
 */
BLEND_MODES.MIN_COLOR = [
  WebGL2RenderingContext.ONE,
  WebGL2RenderingContext.ONE,
  WebGL2RenderingContext.ONE,
  WebGL2RenderingContext.ONE,
  WebGL2RenderingContext.MIN,
  WebGL2RenderingContext.MAX
];

/**
 * A custom blend mode equation which chooses the minimum color for color channels and min alpha from alpha channel.
 * @type {number[]}
 */
BLEND_MODES.MIN_ALL = [
  WebGL2RenderingContext.ONE,
  WebGL2RenderingContext.ONE,
  WebGL2RenderingContext.ONE,
  WebGL2RenderingContext.ONE,
  WebGL2RenderingContext.MIN,
  WebGL2RenderingContext.MIN
];

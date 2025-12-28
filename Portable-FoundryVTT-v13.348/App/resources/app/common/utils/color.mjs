/**
 * @import {ColorSource} from "../_types.mjs";
 */

/**
 * A representation of a color in hexadecimal format.
 * This class provides methods for transformations and manipulations of colors.
 */
export default class Color extends Number {

  /**
   * Is this a valid color?
   * @type {boolean}
   */
  get valid() {
    const v = this.valueOf();
    return Number.isInteger(v) && v >= 0 && v <= 0xFFFFFF;
  }

  /* ------------------------------------------ */

  /**
   * A CSS-compatible color string.
   * If this color is not valid, the empty string is returned.
   * An alias for Color#toString.
   * @type {string}
   */
  get css() {
    return this.toString(16);
  }

  /* ------------------------------------------ */

  /**
   * The color represented as an RGB array.
   * @type {[number, number, number]}
   */
  get rgb() {
    return [((this >> 16) & 0xFF) / 255, ((this >> 8) & 0xFF) / 255, (this & 0xFF) / 255];
  }

  /* ------------------------------------------ */

  /**
   * The numeric value of the red channel between [0, 1].
   * @type {number}
   */
  get r() {
    return ((this >> 16) & 0xFF) / 255;
  }

  /* ------------------------------------------ */

  /**
   * The numeric value of the green channel between [0, 1].
   * @type {number}
   */
  get g() {
    return ((this >> 8) & 0xFF) / 255;
  }

  /* ------------------------------------------ */

  /**
   * The numeric value of the blue channel between [0, 1].
   * @type {number}
   */
  get b() {
    return (this & 0xFF) / 255;
  }

  /* ------------------------------------------ */

  /**
   * The maximum value of all channels.
   * @type {number}
   */
  get maximum() {
    return Math.max(...this);
  }

  /* ------------------------------------------ */

  /**
   * The minimum value of all channels.
   * @type {number}
   */
  get minimum() {
    return Math.min(...this);
  }

  /* ------------------------------------------ */

  /**
   * Get the value of this color in little endian format.
   * @type {number}
   */
  get littleEndian() {
    return ((this >> 16) & 0xFF) + (this & 0x00FF00) + ((this & 0xFF) << 16);
  }

  /* ------------------------------------------ */

  /**
   * The color represented as an HSV array.
   * Conversion formula adapted from http://en.wikipedia.org/wiki/HSV_color_space.
   * Assumes r, g, and b are contained in the set [0, 1] and returns h, s, and v in the set [0, 1].
   * @type {[number, number, number]}
   */
  get hsv() {
    const [r, g, b] = this.rgb;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;

    let h;
    const s = max === 0 ? 0 : d / max;
    const v = max;

    // Achromatic colors
    if (max === min) return [0, s, v];

    // Normal colors
    switch (max) {
      case r: h = ((g - b) / d) + (g < b ? 6 : 0); break;
      case g: h = ((b - r) / d) + 2; break;
      case b: h = ((r - g) / d) + 4; break;
    }
    h /= 6;
    return [h, s, v];
  }

  /* ------------------------------------------ */

  /**
   * The color represented as an HSL array.
   * Assumes r, g, and b are contained in the set [0, 1] and returns h, s, and l in the set [0, 1].
   * @type {[number, number, number]}
   */
  get hsl() {
    const [r, g, b] = this.rgb;

    // Compute luminosity, saturation and hue
    const l = Math.max(r, g, b);
    const s = l - Math.min(r, g, b);
    let h = 0;
    if ( s > 0 ) {
      if ( l === r ) {
        h = (g - b) / s;
      } else if ( l === g ) {
        h = 2 + ((b - r) / s);
      } else {
        h = 4 + ((r - g) / s);
      }
    }
    const finalHue = (60 * h < 0 ? (60 * h) + 360 : 60 * h) / 360;
    const finalSaturation = s ? (l <= 0.5 ? s / ((2 * l) - s) : s / (2 - ((2 * l) - s))) : 0;
    const finalLuminance = ((2 * l) - s) / 2;
    return [finalHue, finalSaturation, finalLuminance];
  }

  /* ------------------------------------------ */

  /**
   * The color represented as a linear RGB array.
   * Assumes r, g, and b are contained in the set [0, 1] and returns linear r, g, and b in the set [0, 1].
   * @see {@link https://en.wikipedia.org/wiki/SRGB#Transformation}
   * @type {Color}
   */
  get linear() {
    const toLinear = c => (c > 0.04045) ? Math.pow((c + 0.055) / 1.055, 2.4) : (c / 12.92);
    return this.constructor.fromRGB([toLinear(this.r), toLinear(this.g), toLinear(this.b)]);
  }

  /* ------------------------------------------ */
  /*  Color Manipulation Methods                */
  /* ------------------------------------------ */

  /** @override */
  toString(radix) {
    if ( !this.valid ) return "";
    return `#${super.toString(16).padStart(6, "0")}`;
  }

  /* ------------------------------------------ */

  /**
   * Serialize the Color.
   * @returns {string}    The color as a CSS string
   */
  toJSON() {
    return this.css;
  }

  /* ------------------------------------------ */

  /**
   * Returns the color as a CSS string.
   * @returns {string}    The color as a CSS string
   */
  toHTML() {
    return this.css;
  }

  /* ------------------------------------------ */

  /**
   * Test whether this color equals some other color
   * @param {Color|number} other  Some other color or hex number
   * @returns {boolean}           Are the colors equal?
   */
  equals(other) {
    return this.valueOf() === other.valueOf();
  }

  /* ------------------------------------------ */

  /**
   * Get a CSS-compatible RGBA color string.
   * @param {number} alpha      The desired alpha in the range [0, 1]
   * @returns {string}          A CSS-compatible RGBA string
   */
  toRGBA(alpha) {
    const rgba = [(this >> 16) & 0xFF, (this >> 8) & 0xFF, this & 0xFF, alpha];
    return `rgba(${rgba.join(", ")})`;
  }

  /* ------------------------------------------ */

  /**
   * Mix this Color with some other Color using a provided interpolation weight.
   * @param {Color} other       Some other Color to mix with
   * @param {number} weight     The mixing weight placed on this color where weight is placed on the other color
   * @returns {Color}           The resulting mixed Color
   */
  mix(other, weight) {
    return new Color(Color.mix(this, other, weight));
  }

  /* ------------------------------------------ */

  /**
   * Multiply this Color by another Color or a static scalar.
   * @param {Color|number} other  Some other Color or a static scalar.
   * @returns {Color}             The resulting Color.
   */
  multiply(other) {
    if ( other instanceof Color ) return new Color(Color.multiply(this, other));
    return new Color(Color.multiplyScalar(this, other));
  }

  /* ------------------------------------------ */

  /**
   * Add this Color by another Color or a static scalar.
   * @param {Color|number} other  Some other Color or a static scalar.
   * @returns {Color}             The resulting Color.
   */
  add(other) {
    if ( other instanceof Color ) return new Color(Color.add(this, other));
    return new Color(Color.addScalar(this, other));
  }

  /* ------------------------------------------ */

  /**
   * Subtract this Color by another Color or a static scalar.
   * @param {Color|number} other  Some other Color or a static scalar.
   * @returns {Color}             The resulting Color.
   */
  subtract(other) {
    if ( other instanceof Color ) return new Color(Color.subtract(this, other));
    return new Color(Color.subtractScalar(this, other));
  }

  /* ------------------------------------------ */

  /**
   * Max this color by another Color or a static scalar.
   * @param {Color|number} other  Some other Color or a static scalar.
   * @returns {Color}             The resulting Color.
   */
  maximize(other) {
    if ( other instanceof Color ) return new Color(Color.maximize(this, other));
    return new Color(Color.maximizeScalar(this, other));
  }

  /* ------------------------------------------ */

  /**
   * Min this color by another Color or a static scalar.
   * @param {Color|number} other  Some other Color or a static scalar.
   * @returns {Color}             The resulting Color.
   */
  minimize(other) {
    if ( other instanceof Color ) return new Color(Color.minimize(this, other));
    return new Color(Color.minimizeScalar(this, other));
  }

  /* ------------------------------------------ */
  /*  Iterator                                  */
  /* ------------------------------------------ */

  /**
   * Iterating over a Color is equivalent to iterating over its [r,g,b] color channels.
   * @returns {Generator<number>}
   */
  *[Symbol.iterator]() {
    yield this.r;
    yield this.g;
    yield this.b;
  }

  /* ------------------------------------------------------------------------------------------- */
  /*                      Real-time performance Methods and Properties                           */
  /*  Important Note:                                                                            */
  /*  These methods are not a replacement, but a tool when real-time performance is needed.      */
  /*  They do not have the flexibility of the "classic" methods and come with some limitations.  */
  /*  Unless you have to deal with real-time performance, you should use the "classic" methods.  */
  /* ------------------------------------------------------------------------------------------- */

  /**
   * Set an rgb array with the rgb values contained in this Color class.
   * @param {number[]} vec3  Receive the result. Must be an array with at least a length of 3.
   */
  applyRGB(vec3) {
    vec3[0] = ((this >> 16) & 0xFF) / 255;
    vec3[1] = ((this >> 8) & 0xFF) / 255;
    vec3[2] = (this & 0xFF) / 255;
  }

  /* ------------------------------------------ */

  /**
   * Apply a linear interpolation between two colors, according to the weight.
   * @param {number}        color1       The first color to mix.
   * @param {number}        color2       The second color to mix.
   * @param {number}        weight       Weight of the linear interpolation.
   * @returns {number}                   The resulting mixed color
   */
  static mix(color1, color2, weight) {
    return ((((((color1 >> 16) & 0xFF) * (1 - weight)) + (((color2 >> 16) & 0xFF) * weight)) << 16) & 0xFF0000)
      | ((((((color1 >> 8) & 0xFF) * (1 - weight)) + (((color2 >> 8) & 0xFF) * weight)) << 8) & 0x00FF00)
      | ((((color1 & 0xFF) * (1 - weight)) + ((color2 & 0xFF) * weight)) & 0x0000FF);
  }

  /* ------------------------------------------ */

  /**
   * Multiply two colors.
   * @param {number}        color1       The first color to multiply.
   * @param {number}        color2       The second color to multiply.
   * @returns {number}                   The result.
   */
  static multiply(color1, color2) {
    return ((((color1 >> 16) & 0xFF) / 255 * ((color2 >> 16) & 0xFF) / 255) * 255 << 16)
      | ((((color1 >> 8) & 0xFF) / 255 * ((color2 >> 8) & 0xFF) / 255) * 255 << 8)
      | (((color1 & 0xFF) / 255 * ((color2 & 0xFF) / 255)) * 255);
  }

  /* ------------------------------------------ */

  /**
   * Multiply a color by a scalar
   * @param {number} color        The color to multiply.
   * @param {number} scalar       A static scalar to multiply with.
   * @returns {number}            The resulting color as a number.
   */
  static multiplyScalar(color, scalar) {
    return (Math.clamp(((color >> 16) & 0xFF) / 255 * scalar, 0, 1) * 255 << 16)
      | (Math.clamp(((color >> 8) & 0xFF) / 255 * scalar, 0, 1) * 255 << 8)
      | (Math.clamp((color & 0xFF) / 255 * scalar, 0, 1) * 255);
  }

  /* ------------------------------------------ */

  /**
   * Maximize two colors.
   * @param {number}        color1       The first color.
   * @param {number}        color2       The second color.
   * @returns {number}                   The result.
   */
  static maximize(color1, color2) {
    return (Math.clamp(Math.max((color1 >> 16) & 0xFF, (color2 >> 16) & 0xFF), 0, 0xFF) << 16)
      | (Math.clamp(Math.max((color1 >> 8) & 0xFF, (color2 >> 8) & 0xFF), 0, 0xFF) << 8)
      | Math.clamp(Math.max(color1 & 0xFF, color2 & 0xFF), 0, 0xFF);
  }

  /* ------------------------------------------ */

  /**
   * Maximize a color by a static scalar.
   * @param {number} color         The color to maximize.
   * @param {number} scalar        Scalar to maximize with (normalized).
   * @returns {number}             The resulting color as a number.
   */
  static maximizeScalar(color, scalar) {
    return (Math.clamp(Math.max((color >> 16) & 0xFF, scalar * 255), 0, 0xFF) << 16)
      | (Math.clamp(Math.max((color >> 8) & 0xFF, scalar * 255), 0, 0xFF) << 8)
      | Math.clamp(Math.max(color & 0xFF, scalar * 255), 0, 0xFF);
  }

  /* ------------------------------------------ */

  /**
   * Add two colors.
   * @param {number}        color1       The first color.
   * @param {number}        color2       The second color.
   * @returns {number}                   The resulting color as a number.
   */
  static add(color1, color2) {
    return (Math.clamp((((color1 >> 16) & 0xFF) + ((color2 >> 16) & 0xFF)), 0, 0xFF) << 16)
      | (Math.clamp((((color1 >> 8) & 0xFF) + ((color2 >> 8) & 0xFF)), 0, 0xFF) << 8)
      | Math.clamp(((color1 & 0xFF) + (color2 & 0xFF)), 0, 0xFF);
  }

  /* ------------------------------------------ */

  /**
   * Add a static scalar to a color.
   * @param {number} color         The color.
   * @param {number} scalar        Scalar to add with (normalized).
   * @returns {number}             The resulting color as a number.
   */
  static addScalar(color, scalar) {
    return (Math.clamp((((color >> 16) & 0xFF) + (scalar * 255)), 0, 0xFF) << 16)
      | (Math.clamp((((color >> 8) & 0xFF) + (scalar * 255)), 0, 0xFF) << 8)
      | Math.clamp(((color & 0xFF) + (scalar * 255)), 0, 0xFF);
  }

  /* ------------------------------------------ */

  /**
   * Subtract two colors.
   * @param {number}        color1       The first color.
   * @param {number}        color2       The second color.
   */
  static subtract(color1, color2) {
    return (Math.clamp((((color1 >> 16) & 0xFF) - ((color2 >> 16) & 0xFF)), 0, 0xFF) << 16)
      | (Math.clamp((((color1 >> 8) & 0xFF) - ((color2 >> 8) & 0xFF)), 0, 0xFF) << 8)
      | Math.clamp(((color1 & 0xFF) - (color2 & 0xFF)), 0, 0xFF);
  }

  /* ------------------------------------------ */

  /**
   * Subtract a color by a static scalar.
   * @param {number} color         The color.
   * @param {number} scalar        Scalar to subtract with (normalized).
   * @returns {number}             The resulting color as a number.
   */
  static subtractScalar(color, scalar) {
    return (Math.clamp((((color >> 16) & 0xFF) - (scalar * 255)), 0, 0xFF) << 16)
      | (Math.clamp((((color >> 8) & 0xFF) - (scalar * 255)), 0, 0xFF) << 8)
      | Math.clamp(((color & 0xFF) - (scalar * 255)), 0, 0xFF);
  }

  /* ------------------------------------------ */

  /**
   * Minimize two colors.
   * @param {number}        color1       The first color.
   * @param {number}        color2       The second color.
   */
  static minimize(color1, color2) {
    return (Math.clamp(Math.min((color1 >> 16) & 0xFF, (color2 >> 16) & 0xFF), 0, 0xFF) << 16)
      | (Math.clamp(Math.min((color1 >> 8) & 0xFF, (color2 >> 8) & 0xFF), 0, 0xFF) << 8)
      | Math.clamp(Math.min(color1 & 0xFF, color2 & 0xFF), 0, 0xFF);
  }

  /* ------------------------------------------ */

  /**
   * Minimize a color by a static scalar.
   * @param {number} color         The color.
   * @param {number} scalar        Scalar to minimize with (normalized).
   */
  static minimizeScalar(color, scalar) {
    return (Math.clamp(Math.min((color >> 16) & 0xFF, scalar * 255), 0, 0xFF) << 16)
      | (Math.clamp(Math.min((color >> 8) & 0xFF, scalar * 255), 0, 0xFF) << 8)
      | Math.clamp(Math.min(color & 0xFF, scalar * 255), 0, 0xFF);
  }

  /* ------------------------------------------ */

  /**
   * Convert a color to RGB and assign values to a passed array.
   * @param {number} color   The color to convert to RGB values.
   * @param {number[]} vec3  Receive the result. Must be an array with at least a length of 3.
   */
  static applyRGB(color, vec3) {
    vec3[0] = ((color >> 16) & 0xFF) / 255;
    vec3[1] = ((color >> 8) & 0xFF) / 255;
    vec3[2] = (color & 0xFF) / 255;
  }

  /* ------------------------------------------ */
  /*  Factory Methods                           */
  /* ------------------------------------------ */

  /**
   * Create a Color instance from an RGB array.
   * @param {ColorSource} color     A color input
   * @returns {Color}               The hex color instance or NaN
   */
  static from(color) {
    if ( (color === null) || (color === undefined) ) return new this(NaN);
    if ( typeof color === "string" ) return this.fromString(color);
    if ( typeof color === "number" ) return new this(color);
    if ( (color instanceof Array) && (color.length === 3) ) return this.fromRGB(color);
    if ( color instanceof Color ) return color;
    return new this(color);
  }

  /* ------------------------------------------ */

  /**
   * Create a Color instance from a color string which either includes or does not include a leading #.
   * @param {string} color                      A color string
   * @returns {Color}                           The hex color instance
   */
  static fromString(color) {
    return new this(parseInt(color.startsWith("#") ? color.substring(1) : color, 16));
  }

  /* ------------------------------------------ */

  /**
   * Create a Color instance from an RGB array.
   * @param {[number, number, number]} rgb      An RGB tuple
   * @returns {Color}                           The hex color instance
   */
  static fromRGB(rgb) {
    return new this(((rgb[0] * 255) << 16) + ((rgb[1] * 255) << 8) + (rgb[2] * 255 | 0));
  }

  /* ------------------------------------------ */

  /**
   * Create a Color instance from an RGB normalized values.
   * @param {number} r                          The red value
   * @param {number} g                          The green value
   * @param {number} b                          The blue value
   * @returns {Color}                           The hex color instance
   */
  static fromRGBvalues(r, g, b) {
    return new this(((r * 255) << 16) + ((g * 255) << 8) + (b * 255 | 0));
  }

  /* ------------------------------------------ */

  /**
   * Create a Color instance from an HSV array.
   * Conversion formula adapted from http://en.wikipedia.org/wiki/HSV_color_space.
   * Assumes h, s, and v are contained in the set [0, 1].
   * @param {[number, number, number]} hsv      An HSV tuple
   * @returns {Color}                           The hex color instance
   */
  static fromHSV(hsv) {
    const [h, s, v] = hsv;
    const i = Math.floor(h * 6);
    const f = (h * 6) - i;
    const p = v * (1 - s);
    const q = v * (1 - (f * s));
    const t = v * (1 - ((1 - f) * s));
    let rgb;
    switch (i % 6) {
      case 0: rgb = [v, t, p]; break;
      case 1: rgb = [q, v, p]; break;
      case 2: rgb = [p, v, t]; break;
      case 3: rgb = [p, q, v]; break;
      case 4: rgb = [t, p, v]; break;
      case 5: rgb = [v, p, q]; break;
    }
    return this.fromRGB(rgb);
  }

  /* ------------------------------------------ */

  /**
   * Create a Color instance from an HSL array.
   * Assumes h, s, and l are contained in the set [0, 1].
   * @param {[number, number, number]} hsl      An HSL tuple
   * @returns {Color}                           The hex color instance
   */
  static fromHSL(hsl) {
    const [h, s, l] = hsl;

    // Calculate intermediate values for the RGB components
    const chroma = (1 - Math.abs((2 * l) - 1)) * s;
    const hue = h * 6;
    const x = chroma * (1 - Math.abs((hue % 2) - 1));
    const m = l - (chroma / 2);

    let r;
    let g;
    let b;
    switch (Math.floor(hue)) {
      case 0: [r, g, b] = [chroma, x, 0]; break;
      case 1: [r, g, b] = [x, chroma, 0]; break;
      case 2: [r, g, b] = [0, chroma, x]; break;
      case 3: [r, g, b] = [0, x, chroma]; break;
      case 4: [r, g, b] = [x, 0, chroma]; break;
      case 5:
      case 6: [r, g, b] = [chroma, 0, x]; break;
      default: [r, g, b] = [0, 0, 0]; break;
    }

    // Adjust for luminance
    r += m;
    g += m;
    b += m;
    return this.fromRGB([r, g, b]);
  }

  /* ------------------------------------------ */

  /**
   * Create a Color instance (sRGB) from a linear rgb array.
   * Assumes r, g, and b are contained in the set [0, 1].
   * @see {@link https://en.wikipedia.org/wiki/SRGB#Transformation}
   * @param {[number, number, number]} linear   The linear rgb array
   * @returns {Color}                           The hex color instance
   */
  static fromLinearRGB(linear) {
    const [r, g, b] = linear;
    const tosrgb = c => (c <= 0.0031308) ? (12.92 * c) : ((1.055 * Math.pow(c, 1 / 2.4)) - 0.055);
    return this.fromRGB([tosrgb(r), tosrgb(g), tosrgb(b)]);
  }
}

import Ping from "./ping.mjs";
import Color from "@common/utils/color.mjs";

/**
 * @import {PulsePingOptions} from "../_types.mjs";
 * @import {Point} from "@common/_types.mjs";
 */

/**
 * A type of ping that produces a pulsing animation.
 */
export default class PulsePing extends Ping {
  /**
   * @param {Point} origin                The canvas coordinates of the origin of the ping.
   * @param {PulsePingOptions} [options]  Additional options to configure the ping animation.
   */
  constructor(origin, {rings=3, color2="#ffffff", ...options}={}) {
    super(origin, {rings, color2, ...options});
    this.#color2 = game.settings.get("core", "photosensitiveMode") ? this._color : Color.from(color2);

    // The radius is half the diameter.
    this.#r = this.options.size / 2;

    // This is the radius that the rings initially begin at. It's set to 1/5th of the maximum radius.
    this.#r0 = this.#r / 5;

    this.#computeTimeSlices();
  }

  /* -------------------------------------------- */

  /** @type {number} */
  #r;

  /** @type {number} */
  #r0;

  /** @type {Color} */
  #color2;

  /** @type {number} */
  #timeSlice;

  /** @type {number} */
  #timeSlice2;

  /** @type {number} */
  #timeSlice15;

  /** @type {number} */
  #timeSlice25;

  /** @type {number} */
  #timeSlice45;

  /* -------------------------------------------- */

  /**
   * Initialize some time slice variables that will be used to control the animation.
   *
   * The animation for each ring can be separated into two consecutive stages.
   * Stage 1: Fade in a white ring with radius r0.
   * Stage 2: Expand radius outward. While the radius is expanding outward, we have two additional, consecutive
   * animations:
   *  Stage 2.1: Transition color from white to the configured color.
   *  Stage 2.2: Fade out.
   * 1/5th of the animation time is allocated to Stage 1. 4/5ths are allocated to Stage 2. Of those 4/5ths, 2/5ths
   * are allocated to Stage 2.1, and 2/5ths are allocated to Stage 2.2.
   */
  #computeTimeSlices() {
    // We divide up the total duration of the animation into rings + 1 time slices. Ring animations are staggered by 1
    // slice, and last for a total of 2 slices each. This uses up the full duration and creates the ripple effect.
    this.#timeSlice = this.options.duration / (this.options.rings + 1);
    this.#timeSlice2 = this.#timeSlice * 2;

    // Store the 1/5th time slice for Stage 1.
    this.#timeSlice15 = this.#timeSlice2 / 5;

    // Store the 2/5ths time slice for the subdivisions of Stage 2.
    this.#timeSlice25 = this.#timeSlice15 * 2;

    // Store the 4/5ths time slice for Stage 2.
    this.#timeSlice45 = this.#timeSlice25 * 2;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async animate() {
    // Draw rings.
    this.removeChildren();
    for ( let i = 0; i < this.options.rings; i++ ) {
      this.addChild(new PIXI.Graphics());
    }

    // Add a blur filter to soften the sharp edges of the shape.
    const f = new PIXI.BlurFilter(2);
    f.padding = this.options.size;
    this.filters = [f];

    return super.animate();
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _animateFrame(dt, animation) {
    const { time } = animation;
    for ( let i = 0; i < this.options.rings; i++ ) {
      const ring = this.children[i];

      // Offset each ring by 1 time slice.
      const tMin = this.#timeSlice * i;

      // Each ring gets 2 time slices to complete its full animation.
      const tMax = tMin + this.#timeSlice2;

      // If it's not time for this ring to animate, do nothing.
      if ( (time < tMin) || (time >= tMax) ) continue;

      // Normalise our t.
      let t = time - tMin;

      ring.clear();
      if ( t < this.#timeSlice15 ) {
        // Stage 1. Fade in a white ring of radius r0.
        const a = t / this.#timeSlice15;
        this._drawShape(ring, this.#color2, a, this.#r0);
      } else {
        // Stage 2. Expand radius, transition color, and fade out. Re-normalize t for Stage 2.
        t -= this.#timeSlice15;
        const dr = this.#r / this.#timeSlice45;
        const r = this.#r0 + (t * dr);

        const c0 = this._color;
        const c1 = this.#color2;
        const c = t <= this.#timeSlice25 ? this.#colorTransition(c0, c1, this.#timeSlice25, t) : c0;

        const ta = Math.max(0, t - this.#timeSlice25);
        const a = 1 - (ta / this.#timeSlice25);
        this._drawShape(ring, c, a, r);
      }
    }
  }

  /* -------------------------------------------- */

  /**
   * Transition linearly from one color to another.
   * @param {Color} from       The color to transition from.
   * @param {Color} to         The color to transition to.
   * @param {number} duration  The length of the transition in milliseconds.
   * @param {number} t         The current time along the duration.
   * @returns {Color}          The incremental color between from and to.
   */
  #colorTransition(from, to, duration, t) {
    const d = t / duration;
    const rgbFrom = from.rgb;
    const rgbTo = to.rgb;
    return Color.fromRGB(rgbFrom.map((c, i) => {
      const diff = rgbTo[i] - c;
      return c + (d * diff);
    }));
  }

  /* -------------------------------------------- */

  /**
   * Draw the shape for this ping.
   * @param {PIXI.Graphics} g  The graphics object to draw to.
   * @param {number} color     The color of the shape.
   * @param {number} alpha     The alpha of the shape.
   * @param {number} size      The size of the shape to draw.
   * @protected
   */
  _drawShape(g, color, alpha, size) {
    g.lineStyle({color, alpha, width: 6 * canvas.dimensions.uiScale, cap: PIXI.LINE_CAP.ROUND,
      join: PIXI.LINE_JOIN.BEVEL});
    g.drawCircle(0, 0, size);
  }
}



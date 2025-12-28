import Color from "@common/utils/color.mjs";

/**
 * @import {CanvasAnimationAttribute} from "./_types.mjs"
 * @import {CanvasAnimationOptions} from "./_types.mjs"
 * @import {CanvasAnimationData} from "./_types.mjs"
 */

/**
 * A helper class providing utility methods for PIXI Canvas animation
 */
export default class CanvasAnimation {

  /**
   * The possible states of an animation.
   * @enum {number}
   */
  static get STATES() {
    return this.#STATES;
  }

  static #STATES = Object.freeze({

    /**
     * An error occurred during waiting or running the animation.
     */
    FAILED: -2,

    /**
     * The animation was terminated before it could complete.
     */
    TERMINATED: -1,

    /**
     * Waiting for the wait promise before the animation is started.
     */
    WAITING: 0,

    /**
     * The animation has been started and is running.
     */
    RUNNING: 1,

    /**
     * The animation was completed without errors and without being terminated.
     */
    COMPLETED: 2
  });

  /* -------------------------------------------- */

  /**
   * The ticker used for animations.
   * @type {PIXI.Ticker}
   */
  static get ticker() {
    return canvas.app.ticker;
  }

  /* -------------------------------------------- */

  /**
   * Track an object of active animations by name, context, and function
   * This allows a currently playing animation to be referenced and terminated
   * @type {Record<string|symbol, CanvasAnimationData>}
   */
  static animations = {};

  /* -------------------------------------------- */

  /**
   * Apply an animation from the current value of some attribute to a new value
   * Resolve a Promise once the animation has concluded and the attributes have reached their new target
   *
   * @param {CanvasAnimationAttribute[]} attributes   An array of attributes to animate
   * @param {CanvasAnimationOptions} options          Additional options which customize the animation
   *
   * @returns {Promise<boolean>}                      A Promise which resolves to true once the animation has concluded
   *                                                  or false if the animation was prematurely terminated
   *
   * @example Animate Token Position
   * ```js
   * let animation = [
   *   {
   *     parent: token,
   *     attribute: "x",
   *     to: 1000
   *   },
   *   {
   *     parent: token,
   *     attribute: "y",
   *     to: 2000
   *   }
   * ];
   * foundry.canvas.animation.CanvasAnimation.animate(attributes, {duration:500});
   * ```
   */
  static animate(attributes, {context=canvas.stage, name, time=0, duration=1000, easing, ontick, priority, wait}={}) {
    priority ??= PIXI.UPDATE_PRIORITY.LOW + 1;
    if ( typeof easing === "string" ) easing = this[easing];

    // If an animation with this name already exists, terminate it
    if ( name ) this.terminateAnimation(name);
    name ||= Symbol("CanvasAnimation");

    attributes = attributes.map(a => {
      a.from = a.from ?? a.parent[a.attribute];
      a.delta = a.to - a.from;
      a.done = 0;

      // Special handling for color transitions
      if ( a.to instanceof Color ) {
        a.color = true;
        a.from = Color.from(a.from);
      }
      return a;
    });
    const animation = {attributes, context, duration, easing, name, ontick, time: 0, wait,
      state: CanvasAnimation.STATES.WAITING};
    animation.fn = () => {
      const {lastTime, speed} = this.ticker;
      const elapsedMS = (performance.now() - lastTime) * speed;
      CanvasAnimation.#animateFrame(elapsedMS, animation);
    };

    // Create a promise which manages the animation lifecycle
    const promise = new Promise(async (resolve, reject) => {
      animation.resolve = completed => {
        if ( (animation.state === CanvasAnimation.STATES.WAITING)
          || (animation.state === CanvasAnimation.STATES.RUNNING) ) {
          animation.state = completed ? CanvasAnimation.STATES.COMPLETED : CanvasAnimation.STATES.TERMINATED;
          resolve(completed);
        }
      };
      animation.reject = error => {
        if ( (animation.state === CanvasAnimation.STATES.WAITING)
          || (animation.state === CanvasAnimation.STATES.RUNNING) ) {
          animation.state = CanvasAnimation.STATES.FAILED;
          reject(error);
        }
      };
      try {
        if ( wait instanceof Promise ) await wait;
        if ( animation.state === CanvasAnimation.STATES.WAITING ) {
          animation.state = CanvasAnimation.STATES.RUNNING;
          CanvasAnimation.#animateFrame(time * this.ticker.speed, animation);
          if ( animation.state === CanvasAnimation.STATES.RUNNING ) {
            await Promise.resolve(); // Don't add listener within the ticker's tick
            if ( animation.state === CanvasAnimation.STATES.RUNNING ) {
              this.ticker.add(animation.fn, context, priority);
            }
          }
        }
      }
      catch(err) {
        animation.reject(err);
      }
    })

      // Log any errors
      .catch(err => console.error(err))

      // Remove the animation once completed
      .finally(() => {
        this.ticker.remove(animation.fn, context);
        if ( this.animations[name] === animation ) delete this.animations[name];
      });

    animation.promise = promise;
    this.animations[name] = animation;
    return promise;
  }

  /* -------------------------------------------- */

  /**
   * Retrieve an animation currently in progress by its name
   * @param {string|symbol} name      The animation name to retrieve
   * @returns {CanvasAnimationData}   The animation data, or undefined
   */
  static getAnimation(name) {
    return this.animations[name];
  }

  /* -------------------------------------------- */

  /**
   * If an animation using a certain name already exists, terminate it
   * @param {string | symbol} name      The animation name to terminate
   */
  static terminateAnimation(name) {
    this.animations[name]?.resolve(false);
  }

  /* -------------------------------------------- */

  /**
   * Terminate all active animations in progress, forcibly resolving each one with `false`.
   * This method returns a Promise that resolves once all animations have been terminated and removed.
   * @returns {Promise<void>} A promise that resolves when all animations have been forcibly terminated.
   */
  static async terminateAll() {
    const promises = [];
    for ( const key of Reflect.ownKeys(this.animations) ) {
      const animation = this.animations[key];
      if ( animation?.promise ) promises.push(animation.promise);
      animation?.resolve(false);
    }
    await Promise.allSettled(promises);
  }

  /* -------------------------------------------- */

  /**
   * Cosine based easing with smooth in-out.
   * @param {number} pt     The proportional animation timing on [0,1]
   * @returns {number}      The eased animation progress on [0,1]
   */
  static easeInOutCosine(pt) {
    return (1 - Math.cos(Math.PI * pt)) * 0.5;
  }

  /* -------------------------------------------- */

  /**
   * Shallow ease out.
   * @param {number} pt     The proportional animation timing on [0,1]
   * @returns {number}      The eased animation progress on [0,1]
   */
  static easeOutCircle(pt) {
    return Math.sqrt(1 - Math.pow(pt - 1, 2));
  }

  /* -------------------------------------------- */

  /**
   * Shallow ease in.
   * @param {number} pt     The proportional animation timing on [0,1]
   * @returns {number}      The eased animation progress on [0,1]
   */
  static easeInCircle(pt) {
    return 1 - Math.sqrt(1 - Math.pow(pt, 2));
  }

  /* -------------------------------------------- */

  /**
   * Generic ticker function to implement the animation.
   * This animation wrapper executes once per frame for the duration of the animation event.
   * Once the animated attributes have converged to their targets, it resolves the original Promise.
   * The user-provided ontick function runs each frame update to apply additional behaviors.
   *
   * @param {number} elapsedMS                The incremental time in MS which has elapsed (uncapped)
   * @param {CanvasAnimationData} animation   The animation which is being performed
   */
  static #animateFrame(elapsedMS, animation) {
    const {attributes, duration, ontick} = animation;

    // Compute animation timing and progress
    animation.time += elapsedMS;                         // Total time which has elapsed
    const complete = animation.time >= duration;
    const pt = complete ? 1 : animation.time / duration; // Proportion of total duration
    const pa = animation.easing ? animation.easing(pt) : pt;

    // Update each attribute
    try {
      for ( const a of attributes ) CanvasAnimation.#updateAttribute(a, pa);
      if ( ontick ) ontick(elapsedMS, animation);
    }

    // Terminate the animation if any errors occur
    catch(err) {
      animation.reject(err);
    }

    // Resolve the original promise once the animation is complete
    if ( complete ) animation.resolve(true);
  }

  /* -------------------------------------------- */

  /**
   * Update a single attribute according to its animation completion percentage
   * @param {CanvasAnimationAttribute} attribute    The attribute being animated
   * @param {number} percentage                     The animation completion percentage
   */
  static #updateAttribute(attribute, percentage) {
    attribute.done = attribute.delta * percentage;

    // Complete animation
    if ( percentage === 1 ) {
      attribute.parent[attribute.attribute] = attribute.to;
      return;
    }

    // Color animation
    if ( attribute.color ) {
      attribute.parent[attribute.attribute] = attribute.from.mix(attribute.to, percentage);
      return;
    }

    // Numeric attribute
    attribute.parent[attribute.attribute] = attribute.from + attribute.done;
  }
}

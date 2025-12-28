/**
 * @import {Color} from "../../../common/utils/_module.mjs";
 */

/**
 * @typedef CanvasAnimationAttribute
 * @property {string} attribute             The attribute name being animated
 * @property {object} parent                The object within which the attribute is stored
 * @property {number|Color} to              The destination value of the attribute
 * @property {number|Color} [from]          An initial value of the attribute, otherwise `parent[attribute]` is used
 * @property {number} [delta]               The computed delta between to and from
 * @property {number} [done]                The amount of the total delta which has been animated
 * @property {boolean} [color]              Is this a color animation that applies to RGB channels
 */

/**
 * @typedef {"easeInOutCosine"|"easeOutCircle"|"easeInCircle"|
 *   (percentage: number) => number} CanvasAnimationEasingFunction
 */

/**
 * @typedef CanvasAnimationOptions
 * @property {PIXI.DisplayObject} [context] A DisplayObject which defines context to the PIXI.Ticker function
 * @property {string|symbol} [name]         A unique name which can be used to reference the in-progress animation
 * @property {number} [duration]            A duration in milliseconds over which the animation should occur
 * @property {number} [time=0]              The current time of the animation, in milliseconds
 * @property {number} [priority]            A priority in PIXI.UPDATE_PRIORITY which defines when the animation
 *                                          should be evaluated related to others
 * @property {CanvasAnimationEasingFunction} [easing] An easing function used to translate animation time or
 *                                                    the string name of a static member of CanvasAnimation
 * @property {(elapsedMS: number, animation: CanvasAnimationData) => void} [ontick]
 *   A callback function which fires after every frame
 * @property {Promise<any>} [wait]          The animation isn't started until this promise resolves
 */

/**
 * @typedef _CanvasAnimationData
 * @property {() => void} fn                            The animation function being executed each frame
 * @property {CanvasAnimationAttribute[]} attributes    The attributes being animated
 * @property {number} state                             The current state of the animation
 *                                                      (see {@link foundry.canvas.animation.CanvasAnimation.STATES})
 * @property {Promise<boolean>} promise                 A Promise which resolves once the animation is complete
 * @property {(completed: boolean) => void} resolve     The resolution function, allowing animation to be ended early
 * @property {(error: Error) => void} reject            The rejection function, allowing animation to be ended early
 */

/**
 * @typedef {_CanvasAnimationData & CanvasAnimationOptions} CanvasAnimationData
 */

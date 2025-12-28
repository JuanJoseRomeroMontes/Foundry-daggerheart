/**
 * @typedef RenderFlag
 * @property {string[]} [propagate]   Activating this flag also sets these flags to true
 * @property {string[]} [reset]       Activating this flag resets these flags to false
 * @property {object} [deprecated]    Is this flag deprecated? The deprecation options are passed to
 *                                    logCompatibilityWarning. The deprectation message is auto-generated
 *                                    unless message is passed with the options.
 *                                    By default the message is logged only once.
 */

/* -------------------------------------------- */

/**
 * @typedef PingData
 * @property {boolean} [pull=false]  Pulls all connected clients' views to the pinged coordinates.
 * @property {string} style          The ping style, see CONFIG.Canvas.pings.
 * @property {string} scene          The ID of the scene that was pinged.
 * @property {number} zoom           The zoom level at which the ping was made.
 */

/**
 * @typedef PingOptions
 * @property {number} [duration=900]   The duration of the animation in milliseconds.
 * @property {number} [size=128]       The size of the ping graphic.
 * @property {string} [color=#ff6400]  The color of the ping graphic.
 * @property {string} [name]           The name for the ping animation to pass to
 *   {@link foundry.canvas.animation.CanvasAnimation.animate}.
 */

/**
 * @typedef _PulsePingOptions
 * @property {number} [rings=3]         The number of rings used in the animation.
 * @property {string} [color2=#ffffff]  The alternate color that the rings begin at. Use white for a 'flashing' effect.
 */

/**
 * @typedef {PingOptions & _PulsePingOptions} PulsePingOptions
 */

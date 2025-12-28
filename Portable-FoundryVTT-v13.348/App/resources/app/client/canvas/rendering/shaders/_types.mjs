/**
 * @typedef DepthBatchData
 * The batch data that is needed by {@link foundry.canvas.rendering.shaders.DepthSamplerShader} to
 * render an element with batching.
 * @property {PIXI.Texture} _texture                       The texture
 * @property {Float32Array} vertexData                     The vertices
 * @property {Uint16Array|Uint32Array|number[]} indices    The indices
 * @property {Float32Array} uvs                            The texture UVs
 * @property {number} elevation                            The elevation
 * @property {number} textureAlphaThreshold                The texture alpha threshold
 * @property {number} fadeOcclusion                        The amount of FADE occlusion
 * @property {number} radialOcclusion                      The amount of RADIAL occlusion
 * @property {number} visionOcclusion                      The amount of VISION occlusion
 */

/* -------------------------------------------- */

/**
 * @typedef OccludableBatchData
 * The batch data that is needed by {@link foundry.canvas.rendering.shaders.OccludableSamplerShader}
 * to render an element with batching.
 * @property {PIXI.Texture} _texture                       The texture
 * @property {Float32Array} vertexData                     The vertices
 * @property {Uint16Array|Uint32Array|number[]} indices    The indices
 * @property {Float32Array} uvs                            The texture UVs
 * @property {number} worldAlpha                           The world alpha
 * @property {number} _tintRGB                             The tint
 * @property {number} blendMode                            The blend mode
 * @property {number} elevation                            The elevation
 * @property {number} unoccludedAlpha                      The unoccluded alpha
 * @property {number} occludedAlpha                        The unoccluded alpha
 * @property {number} fadeOcclusion                        The amount of FADE occlusion
 * @property {number} radialOcclusion                      The amount of RADIAL occlusion
 * @property {number} visionOcclusion                      The amount of VISION occlusion
 */

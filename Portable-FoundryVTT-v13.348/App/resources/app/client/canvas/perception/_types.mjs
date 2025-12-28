/**
 * @typedef {RenderFlags} PerceptionManagerFlags
 * @property {boolean} initializeLighting       Re-initialize the entire lighting configuration. An aggregate behavior
 *                                              which does no work directly but propagates to set several other flags.
 * @property {boolean} initializeVision         Re-initialize the entire vision configuration.
 *                                              See {@link foundry.canvas.groups.CanvasVisibility#initializeSources}.
 * @property {boolean} initializeVisionModes    Initialize the active vision modes.
 *                                              See {@link foundry.canvas.groups.CanvasVisibility#initializeVisionMode}.
 * @property {boolean} initializeSounds         Re-initialize the entire ambient sound configuration.
 *                                              See {@link foundry.canvas.layers.SoundsLayer#initializeSources}.
 * @property {boolean} refreshEdges             Recompute intersections between all registered edges.
 *                                              See {@link foundry.canvas.geometry.edges.CanvasEdges#refresh}.
 * @property {boolean} refreshLighting          Refresh the rendered appearance of lighting
 * @property {boolean} refreshLightSources      Update the configuration of light sources
 * @property {boolean} refreshOcclusion         Refresh occlusion
 * @property {boolean} refreshPrimary           Refresh the contents of the PrimaryCanvasGroup mesh
 * @property {boolean} refreshSounds            Refresh the audio state of ambient sounds
 * @property {boolean} refreshVision            Refresh the rendered appearance of vision
 * @property {boolean} refreshVisionSources     Update the configuration of vision sources
 * @property {boolean} soundFadeDuration        Apply a fade duration to sound refresh workflow
 */

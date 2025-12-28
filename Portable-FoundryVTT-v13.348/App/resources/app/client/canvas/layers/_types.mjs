/**
 * @import Sound from "../../audio/sound.mjs";
 * @import {ElevatedPoint} from "../../_types.mjs";
 * @import {PlaceableObject, AmbientSound} from "../placeables/_module.mjs";
 * @import PointSoundSource from "../sources/point-sound-source.mjs";
 */

/**
 * @typedef AmbientSoundPlaybackConfig
 * @property {Sound} sound              The Sound node which should be controlled for playback
 * @property {PointSoundSource} source  The SoundSource which defines the area of effect
 *                                                             for the sound
 * @property {AmbientSound} object      An AmbientSound object responsible for the sound, or undefined
 * @property {ElevatedPoint} listener   The coordinates of the closest listener or undefined if there is none
 * @property {number} distance          The minimum distance between a listener and the AmbientSound origin
 * @property {boolean} muffled          Is the closest listener muffled
 * @property {boolean} walls            Is playback constrained or muffled by walls?
 * @property {number} volume            The final volume at which the Sound should be played
 */

/* -------------------------------------------- */

/**
 * @typedef CanvasHistoryEvent
 * @property {"create"|"update"|"delete"} type    The type of operation stored as history
 * @property {object[]} data                      The data corresponding to the action which may later be un-done
 * @property {object} options                     The options of the undo operation
 */

/**
 * @typedef PlaceablesLayerOptions
 * @property {boolean} controllableObjects  Can placeable objects in this layer be controlled?
 * @property {boolean} rotatableObjects     Can placeable objects in this layer be rotated?
 * @property {boolean} confirmDeleteKey     Confirm placeable object deletion with a dialog?
 * @property {PlaceableObject} objectClass  The class used to represent an object on this layer.
 * @property {boolean} quadtree             Does this layer use a quadtree to track object positions?
 */

/* -------------------------------------------- */

/**
 * @typedef _CanvasVisionContainerSight
 * @property {PIXI.LegacyGraphics} preview    FOV that should not be committed to fog exploration.
 */

/**
 * @typedef {PIXI.LegacyGraphics & _CanvasVisionContainerSight} CanvasVisionContainerSight
 * The sight part of {@link foundry.canvas.layers.types.CanvasVisionContainer}.
 * The blend mode is MAX_COLOR.
 */

/**
 * @typedef _CanvasVisionContainerLight
 * @property {PIXI.LegacyGraphics} preview    FOV that should not be committed to fog exploration.
 * @property {SpriteMesh} cached              The sprite with the texture of FOV of cached light sources.
 * @property {PIXI.LegacyGraphics & {preview: PIXI.LegacyGraphics}} mask The light perception polygons of vision
 *                                                                       sources and the FOV of vision sources that
 *                                                                       provide vision.
 */

/**
 * @typedef {PIXI.LegacyGraphics & _CanvasVisionContainerLight} CanvasVisionContainerLight
 * The light part of {@link foundry.canvas.layers.types.CanvasVisionContainer}.
 * The blend mode is MAX_COLOR.
 */

/**
 * @typedef _CanvasVisionContainerDarkness
 * @property {PIXI.LegacyGraphics} darkness    Darkness source erasing fog of war.
 */

/**
 * @typedef {PIXI.LegacyGraphics & _CanvasVisionContainerDarkness} CanvasVisionContainerDarkness
 * The sight part of {@link foundry.canvas.layers.types.CanvasVisionContainer}.
 * The blend mode is ERASE.
 */

/**
 * @typedef _CanvasVisionContainer
 * @property {CanvasVisionContainerLight} light       Areas visible because of light sources and light perception.
 * @property {CanvasVisionContainerSight} sight       Areas visible because of FOV of vision sources.
 * @property {CanvasVisionContainerDarkness} darkness Areas erased by darkness sources.
 */

/**
 * @typedef {PIXI.Container & _CanvasVisionContainer} CanvasVisionContainer
 * The currently visible areas.
 */

export * from "../common/_types.mjs";

/**
 * @import ApplicationV2 from "./applications/api/application.mjs";
 * @import {DocumentHTMLEmbedConfig} from "./applications/ux/text-editor.mjs";
 * @import Application from "./appv1/api/application-v1.mjs";
 * @import {AVSettingsData} from "./av/settings.mjs";
 * @import {PingData} from "./canvas/interaction/_types.mjs";
 * @import Token from "./canvas/placeables/token.mjs";
 * @import PointVisionSource from "./canvas/sources/point-vision-source.mjs";
 * @import {TokenShapeType} from "@common/constants.mjs";
 * @import {BuiltinType, CanvasPerformanceMode, DeepReadonly, ElevatedPoint, Point, SocketRequest,
 *   SocketResponse} from "@common/_types.mjs";
 * @import {CustomFormInput} from "./applications/forms/fields.mjs";
 * @import {SceneDimensions, TokenMeasuredMovementWaypoint, TokenPosition,
 *   TokenGetCompleteMovementPathWaypoint, TokenMovementWaypoint, TokenMeasureMovementPathOptions,
 *   TokenMovementSegmentData} from "@client/documents/_types.mjs";
 * @import {Color} from "../common/utils/_module.mjs";
 * @import {CanvasAnimationData, CanvasAnimationEasingFunction} from "./canvas/animation/_types.mjs";
 * @import {GridMeasurePathResultWaypoint, GridOffset3D} from "@common/grid/_types.mjs";
 * @import {Ray} from "./canvas/geometry/_module.mjs";
 * @import {DataModel} from "@common/abstract/_module.mjs";
 * @import {DataField} from "@common/data/fields.mjs";
 * @import {PackageCompendiumData} from "./packages/_types.mjs";
 * @import {TokenDocument} from "./documents/_module.mjs";
 * @import {PrototypeToken} from "@common/data/data.mjs";
 */

/**
 * @typedef HotReloadData
 * @property {string} packageType       The type of package which was modified
 * @property {string} packageId         The id of the package which was modified
 * @property {string} content           The updated stringified file content
 * @property {string} path              The relative file path which was modified
 * @property {string} extension         The file extension which was modified, e.g. "js", "css", "html"
 */

/**
 * @typedef RulerWaypoint
 * @property {number} x                                     The x-coordinate in pixels.
 * @property {number} y                                     The y-coordinate in pixels.
 * @property {number} elevation                             The elevation in grid units.
 * @property {number} index                                 The index of the waypoint.
 * @property {Ray|null} ray                                 The ray from the center point of previous to the
 *                                                          center point of this waypoint, or null if there is
 *                                                          no previous waypoint.
 * @property {GridMeasurePathResultWaypoint} measurement    The measurements at this waypoint.
 * @property {RulerWaypoint|null} previous                  The previous waypoint, if any.
 * @property {RulerWaypoint|null} next                      The next waypoint, if any.
 */

/**
 * @typedef TokenFindMovementPathWaypoint
 * @property {number} [x]                    The top-left x-coordinate in pixels (integer).
 *                                           Default: the previous or source x-coordinate.
 * @property {number} [y]                    The top-left y-coordinate in pixels (integer).
 *                                           Default: the previous or source y-coordinate.
 * @property {number} [elevation]            The elevation in grid units.
 *                                           Default: the previous or source elevation.
 * @property {number} [width]                The width in grid spaces (positive).
 *                                           Default: the previous or source width.
 * @property {number} [height]               The height in grid spaces (positive).
 *                                           Default: the previous or source height.
 * @property {TokenShapeType} [shape]        The shape type (see {@link CONST.TOKEN_SHAPES}).
 *                                           Default: the previous or source shape.
 * @property {string} [action]               The movement action from the previous to this waypoint.
 * @property {boolean} [snapped=false]       Was this waypoint snapped to the grid? Default: `false`.
 * @property {boolean} [explicit=false]      Was this waypoint explicitly placed by the user? Default: `false`.
 * @property {boolean} [checkpoint=false]    Is this waypoint a checkpoint? Default: `false`.
 */

/**
 * @typedef TokenConstrainMovementPathWaypoint
 * @property {number} [x]                       The top-left x-coordinate in pixels (integer).
 *                                              Default: the previous or source x-coordinate.
 * @property {number} [y]                       The top-left y-coordinate in pixels (integer).
 *                                              Default: the previous or source y-coordinate.
 * @property {number} [elevation]               The elevation in grid units.
 *                                              Default: the previous or source elevation.
 * @property {number} [width]                   The width in grid spaces (positive).
 *                                              Default: the previous or source width.
 * @property {number} [height]                  The height in grid spaces (positive).
 *                                              Default: the previous or source height.
 * @property {TokenShapeType} [shape]           The shape type (see {@link CONST.TOKEN_SHAPES}).
 *                                              Default: the previous or source shape.
 * @property {string} [action]                  The movement action from the previous to this waypoint.
 *                                              Default: the previous or prepared movement action.
 * @property {DataModel|null} [terrain=null]    The terrain data of this segment. Default: `null`.
 * @property {boolean} [snapped=false]          Was this waypoint snapped to the grid? Default: `false`.
 * @property {boolean} [explicit=false]         Was this waypoint explicitly placed by the user? Default: `false`.
 * @property {boolean} [checkpoint=false]       Is this waypoint a checkpoint? Default: `false`.
 * @property {boolean} [intermediate=false]     Is this waypoint intermediate? Default: `false`.
 */

/**
 * @typedef TokenConstrainMovementPathOptions
 * @property {boolean} [preview=false]        Constrain a preview path? Default: `false`.
 * @property {boolean} [ignoreWalls=false]    Ignore walls? Default: `false`.
 * @property {boolean} [ignoreCost=false]     Ignore cost? Default: `false`.
 * @property {boolean|DeepReadonly<TokenMeasuredMovementWaypoint[]>} [history=false]
 *   Consider movement history? If true, uses the current movement history.
 *   If waypoints are passed, use those as the history. Default: `false`.
 */

/**
 * @typedef {Omit<TokenMeasuredMovementWaypoint, "userId"|"movementId"|"cost">} TokenConstrainedMovementWaypoint
 */

/**
 * @typedef TokenFindMovementPathOptions
 * @property {boolean} [preview=false]        Find a preview path? Default: `false`.
 * @property {boolean} [ignoreWalls=false]    Ignore walls? Default: `false`.
 * @property {boolean} [ignoreCost=false]     Ignore cost? Default: `false`.
 * @property {boolean|DeepReadonly<TokenMeasuredMovementWaypoint[]>} [history=false]
 *   Consider movement history? If true, uses the current movement history.
 *   If waypoints are passed, use those as the history. Default: `false`.
 * @property {number} [delay=0]               Unless the path can be found instantly, delay the start of the pathfinding
 *                                            computation by this number of milliseconds. Default: `0`.
 */

/**
 * @typedef TokenFindMovementPathJob
 * @property {TokenMovementWaypoint[]|null|undefined} result    The result of the pathfinding job. Undefined while the
 *                                                              search is in progress, null if the job was cancelled,
 *                                                              and the (partial) path if the job completed.
 * @property {Promise<TokenMovementWaypoint[]|null>} promise    The promise returning the (partial) path that as found
 *                                                              or null if cancelled.
 * @property {() => void} cancel                                If this function is called and the job hasn't completed
 *                                                              yet, the job is cancelled.
 */

/**
 * @typedef {Omit<TokenGetCompleteMovementPathWaypoint, "terrain">} TokenGetTerrainMovementPathWaypoint
 */

/**
 * @typedef {Omit<TokenMeasuredMovementWaypoint, "userId"|"movementId"|"cost">} TokenTerrainMovementWaypoint
 */

/**
 * @typedef TokenRulerData
 * @property {TokenMeasuredMovementWaypoint[]} passedWaypoints     The waypoints that were already passed by the Token
 * @property {TokenMeasuredMovementWaypoint[]} pendingWaypoints    The waypoints that the Token will try move to next
 * @property {{[userId: string]: TokenPlannedMovement}} plannedMovement    Movement planned by Users
 */

/**
 * @typedef TokenPlannedMovement
 * @property {Omit<TokenMeasuredMovementWaypoint, "userId"|"movementId">[]} foundPath    The found path, which goes
 *   through all but the unreachable waypoints
 * @property {Omit<TokenMeasuredMovementWaypoint, "userId"|"movementId">[]} unreachableWaypoints    The unreachable
 *   waypoints, which are those that are not reached by the found path
 * @property {TokenMeasuredMovementWaypoint[]} history    The movement history
 * @property {boolean} hidden                             Is the path hidden?
 * @property {boolean} searching                          Is the pathfinding still in progress?
 */

/**
 * @typedef TokenRulerWaypointData
 * @property {TokenMovementActionConfig} actionConfig       The config of the movement action
 * @property {string|null} movementId                       The ID of movement, or null if planned movement.
 * @property {number} index                                 The index of the waypoint, which is equal to the number of
 *                                                          explicit waypoints from the first to this waypoint.
 * @property {"passed"|"pending"|"planned"} stage           The stage this waypoint belongs to.
 * @property {boolean} hidden                               Is this waypoint hidden?
 * @property {boolean} unreachable                          Is this waypoint unreachable?
 * @property {Point} center                                 The center point of the Token at this waypoint.
 * @property {{width: number; height: number}} size         The size of the Token in pixels at this waypoint.
 * @property {Ray|null} ray                                 The ray from the center point of previous to the center
 *                                                          point of this waypoint, or null if there is no previous
 *                                                          waypoint.
 * @property {GridMeasurePathResultWaypoint} measurement    The measurements at this waypoint.
 * @property {TokenRulerWaypoint|null} previous             The previous waypoint, if any.
 * @property {TokenRulerWaypoint|null} next                 The next waypoint, if any.
 */

/**
 * @typedef {Omit<TokenMeasuredMovementWaypoint, "movementId"> & TokenRulerWaypointData} TokenRulerWaypoint
 */

/**
 * @typedef TokenDragContext
 * @property {Token} token
 * @property {Token} clonedToken
 * @property {TokenPosition} origin
 * @property {Omit<TokenMovementWaypoint, "width"|"height"|"shape"|"action">
 *   & Partial<Pick<TokenMovementWaypoint, "width"|"height"|"shape"|"action">>} destination
 * @property {(Omit<TokenMovementWaypoint, "width"|"height"|"shape"|"action">
 *   & Partial<Pick<TokenMovementWaypoint, "width"|"height"|"shape"|"action">>)[]} waypoints
 * @property {TokenMovementWaypoint[]} foundPath
 * @property {TokenMovementWaypoint[]} unreachableWaypoints
 * @property {boolean} hidden
 * @property {boolean} updating
 * @property {TokenFindMovementPathJob} search
 * @property {boolean} searching
 * @property {number} searchId
 * @property {TokenFindMovementPathOptions} searchOptions
 */

/**
 * @typedef TokenAnimationData
 * @property {number} x                        The x position in pixels
 * @property {number} y                        The y position in pixels
 * @property {number} elevation                The elevation in grid units
 * @property {number} width                    The width in grid spaces
 * @property {number} height                   The height in grid spaces
 * @property {number} alpha                    The alpha value
 * @property {number} rotation                 The rotation in degrees
 * @property {object} texture                  The texture data
 * @property {string} texture.src              The texture file path
 * @property {number} texture.anchorX          The texture anchor X
 * @property {number} texture.anchorY          The texture anchor Y
 * @property {number} texture.scaleX           The texture scale X
 * @property {number} texture.scaleY           The texture scale Y
 * @property {Color} texture.tint              The texture tint
 * @property {object} ring                     The ring data
 * @property {object} ring.subject             The ring subject data
 * @property {string} ring.subject.texture     The ring subject texture
 * @property {number} ring.subject.scale       The ring subject scale
 */

/**
 * @typedef TokenAnimationContext
 * @property {string|symbol} name                The name of the animation.
 * @property {{to: Partial<TokenAnimationData>, options: Omit<TokenAnimationOptions, "duration"> & {duration: number},
 *   promise: Promise<void> , resolve: () => void, reject: (error: Error) => void}[]} chain
 *                                               The animation chain.
 * @property {Partial<TokenAnimationData>} to    The final animation state.
 * @property {number} duration          The duration of the animation.
 * @property {number} time              The current time of the animation.
 * @property {((context: TokenAnimationContext) => Promise<void>)[]} preAnimate
 *                                      Asynchronous functions that are executed before the animation starts
 * @property {((context: TokenAnimationContext) => void)[]} postAnimate
 *                                      Synchronous functions that are executed after the animation ended. They may be
 *                                      executed before the `preAnimate` functions have finished if the animation is
 *                                      terminated.
 * @property {((context: TokenAnimationContext) => void)[]} onAnimate
 *                                      Synchronous functions that are executed each frame after `ontick` and before
 *                                      {@link foundry.canvas.placeables.Token#_onAnimationUpdate}.
 * @property {Promise<void>} promise    The promise of the animation that resolves once it completes or is terminated.
 */

/**
 * @typedef TokenAnimationOptions
 * @property {string|symbol|null} [name]    The name of the animation, or null if nameless.
 *                                          Default: {@link foundry.canvas.placeables.Token#animationName}.
 * @property {boolean} [chain=false]        Chain the animation to the existing one of the same name? Default: `false`.
 * @property {number} [duration]            The duration of the animation in milliseconds (nonnegative).
 *                                          Default: automatic (determined by
 *                                          {@link foundry.canvas.placeables.Token#_getAnimationDuration},
 *                                          which returns 1000 by default unless it's a movement animation).
 * @property {number} [movementSpeed]       A desired base movement speed in grid size per second (positive),
 *                                          which determines the `duration` if the given `duration` is undefined and
 *                                          either `x`, `y`, `width`, `height`, or `rotation` is animated.
 *                                          Default: automatic (determined by
 *                                          {@link foundry.canvas.placeables.Token#_getAnimationMovementSpeed}).
 * @property {string} [action]              The movement action. Default: `this.document.movementAction`.
 * @property {DataModel|null} [terrain=null]           The terrain data. Default: `null`.
 * @property {TokenAnimationTransition} [transition]   The desired texture transition type.
 *                                                     Default: automatic (determined by
 *                                                     {@link foundry.canvas.placeables.Token#_getAnimationTransition},
 *                                                     which returns `"fade"` by default).
 * @property {CanvasAnimationEasingFunction} [easing]  The easing function of the animation.
 *                                                     Default: `undefined` (linear).
 * @property {(elapsedMS: number, animation: CanvasAnimationData, data: TokenAnimationData) => void} [ontick]
 *                                                     An on-tick callback.
 */

/**
 * @typedef {"crosshatch"|"dots"|"fade"|"glitch"|"hole"|"holeSwirl"|"hologram"|"morph"|"swirl"|"waterDrop"|"waves"
 *   |"wind"|"whiteNoise"} TokenAnimationTransition
 */


/**
 * @callback TokenMovementActionCostFunction
 * @param {number} baseCost                      The base cost (terrain cost)
 * @param {Readonly<GridOffset3D>} from          The offset that is moved from
 * @param {Readonly<GridOffset3D>} to            The offset that is moved to
 * @param {number} distance                      The distance between the grid spaces
 * @param {DeepReadonly<TokenMovementSegmentData>} segment    The properties of the segment
 * @returns {number}                             The cost of the move between the grid spaces (nonnegative)
 */

/**
 * @typedef TokenMovementActionConfig
 * @property {string} label          The label of the movement action.
 * @property {string} icon           The FontAwesome icon class.
 * @property {string|null} img       An image filename. Takes precedence over the icon if both are supplied.
 * @property {number} order          The number that is used to sort the movement actions / movement action configs.
 *                                   Determines the order in the Token Config/HUD and of cycling. Default: `0`.
 * @property {boolean} teleport      Is teleportation? If true, the movement does not go through all grid spaces
 *                                   between the origin and destination: it goes from the origin immediately to the
 *                                   destination grid space. Default: `false`.
 * @property {boolean} measure       Is the movement measured? The distance, cost, spaces, and diagonals
 *                                   of a segment that is not measured are always 0. Default: `true`.
 * @property {string|null} walls     The type of walls that block this movement, if any. Default: `"move"`.
 * @property {boolean} visualize     Is segment of the movement visualized by the ruler? Default: `true`.
 * @property {(token: Token) => Pick<TokenAnimationOptions, "duration"|"movementSpeed"|"easing"
 *   |"ontick">} getAnimationOptions Get the default animation options for this movement action. Default: `() => ({})`.
 * @property {(token: TokenDocument|PrototypeToken) => boolean} canSelect
 *   Can the current User select this movement action for the given Token? If selectable, the movement action of the
 *   Token can be set to this movement action by the User via the UI and when cycling. Default: `() => true`.
 * @property {((nonDerivedDifficulties: {[action: string]: number}) => number) | null} deriveTerrainDifficulty
 *   If set, this function is used to derive the terrain difficulty from from nonderived difficulties,
 *   which are those that do not have `deriveTerrainDifficulty` set.
 *   Used by {@link foundry.data.regionBehaviors.ModifyMovementCostRegionBehaviorType}.
 *   Derived terrain difficulties are not configurable via the behavior UI.
 * @property {(token: TokenDocument, options: TokenMeasureMovementPathOptions)
 *   => TokenMovementActionCostFunction} getCostFunction  The cost modification function. Default: `() => cost => cost`.
 */

/**
 * @typedef CanvasViewPosition
 * @property {number} x      The x-coordinate which becomes `stage.pivot.x`
 * @property {number} y      The y-coordinate which becomes `stage.pivot.y`
 * @property {number} scale  The zoom level which becomes `stage.scale.x` and `y`
 */

/**
 * @typedef CanvasVisibilityTest
 * @property {ElevatedPoint} point
 * @property {Map<PointVisionSource, boolean>} los
 */

/**
 * @typedef CanvasVisibilityTestConfiguration
 * @property {object|null} object              The target object
 * @property {CanvasVisibilityTest[]} tests    An array of visibility tests
 */

/**
 * @typedef CanvasVisibilityTextureConfiguration
 * @property {number} resolution
 * @property {number} width
 * @property {number} height
 * @property {number} mipmap
 * @property {number} scaleMode
 * @property {number} alphaMode
 * @property {number} multisample
 * @property {number} format
 */

/**
 * @typedef ReticuleOptions
 * @property {number} [margin=0]        The amount of margin between the targeting arrows and the token's bounding
 *                                      box, expressed as a fraction of an arrow's size.
 * @property {number} [alpha=1]         The alpha value of the arrows.
 * @property {number} [size]            The size of the arrows as a proportion of grid size.
 *                                      Default: `CONFIG.Canvas.targeting.size`.
 * @property {number} [color]           The color of the arrows.
 * @property {object} [border]          The arrows' border style configuration.
 * @property {number} [border.color=0]  The border color.
 * @property {number} [border.width=2]  The border width.
 */

/**
 * @typedef ActivityData
 * @property {string|null} [sceneId]           The ID of the scene that the user is viewing.
 * @property {Point} [cursor]                  The position of the user's cursor.
 * @property {ElevatedPoint[]} [ruler]         The state of the user's ruler, if they are currently using one.
 * @property {string[]} [targets]              The IDs of the tokens the user has targeted in the currently viewed
 *                                             scene.
 * @property {boolean} [active]                Whether the user has an open WS connection to the server or not.
 * @property {PingData} [ping]                 Is the user emitting a ping at the cursor coordinates?
 * @property {AVSettingsData} [av]             The state of the user's AV settings.
 */

/**
 * @typedef CanvasPerformanceSettings
 * @property {CanvasPerformanceMode} mode A performance mode in {@link CONST.CANVAS_PERFORMANCE_MODES}
 * @property {string} mipmap    Whether to use mipmaps, "ON" or "OFF"
 * @property {boolean} msaa     Whether to apply MSAA at the overall canvas level
 * @property {boolean} smaa     Whether to apply SMAA at the overall canvas level
 * @property {number} fps       Maximum framerate which should be the render target
 * @property {boolean} tokenAnimation   Whether to display token movement animation
 * @property {boolean} lightAnimation   Whether to display light source animation
 * @property {boolean} lightSoftEdges   Whether to render soft edges for light sources
 */

/**
 * @typedef CanvasSupportedComponents
 * @property {boolean} webGL2           Is WebGL2 supported?
 * @property {boolean} readPixelsRED    Is reading pixels in RED format supported?
 * @property {boolean} offscreenCanvas  Is the OffscreenCanvas supported?
 */

/**
 * @typedef _CanvasDimensions
 * @property {{min: number, max: number, default: number}} scale  The minimum, maximum, and default canvas scale.
 * @property {number} uiScale                                     The scaling factor for canvas UI elements.
 *                                                                Based on the normalized grid size (100px).
 */

/**
 * @typedef {SceneDimensions & _CanvasDimensions} CanvasDimensions
 */

/**
 * @typedef JournalEntryPageHeading
 * @property {number} level                  The heading level, 1-6.
 * @property {string} text                   The raw heading text with any internal tags omitted.
 * @property {string} slug                   The generated slug for this heading.
 * @property {HTMLHeadingElement} [element]  The currently rendered element for this heading, if it exists.
 * @property {string[]} children             Any child headings of this one.
 * @property {number} order                  The linear ordering of the heading in the table of contents.
 */

/**
 * @typedef {DataField|{[K in string]: SearchableField}} SearchableField
 */

/**
 * @typedef FromCompendiumOptions
 * @property {boolean} [clearFolder=false]    Clear the currently assigned folder.
 * @property {boolean} [clearState=true]      Clear fields which store Document state.
 * @property {boolean} [clearSort=true]       Clear the current sort order.
 * @property {boolean} [clearOwnership=true]  Clear Document ownership (recursive).
 * @property {boolean} [keepId=false]         Retain the Document ID from the source Compendium.
 */

/**
 * @typedef _RollTableHTMLEmbedConfig
 * @property {boolean} [rollable=false]  Adds a button allowing the table to be rolled directly from its embedded
 *                                       context.
 * @property {string} [rangeLabel]       The label to use for the range column. If rollable is true, this option is
 *                                       ignored.
 * @property {string} [resultLabel]      The label to use for the result column.
 */

/**
 * @typedef {DocumentHTMLEmbedConfig & _RollTableHTMLEmbedConfig} RollTableHTMLEmbedConfig
 */

/**
 * @typedef {SocketRequest} ManageCompendiumRequest
 * @property {string} action                      The request action.
 * @property {PackageCompendiumData|string} data  The compendium creation data, or the ID of the compendium to delete.
 * @property {object} [options]                   Additional options.
 */

/**
 * @typedef {SocketResponse} ManageCompendiumResponse
 * @property {ManageCompendiumRequest} request      The original request.
 * @property {PackageCompendiumData|string} result  The compendium creation data, or the collection name of the
 *                                                  deleted compendium.
 */

/**
 * @typedef WorldCompendiumPackConfiguration
 * @property {string|null} folder
 * @property {number} [sort]
 * @property {boolean} [locked]
 * @property {Record<
 *   Exclude<keyof typeof CONST.USER_ROLES, "NONE">,
 *   keyof typeof CONST.DOCUMENT_OWNERSHIP_LEVELS
 * >} ownership
 */

/**
 * @typedef {Record<string, WorldCompendiumPackConfiguration>} WorldCompendiumConfiguration
 */

/* ----------------------------------------- */
/*  Settings Type Definitions                */
/* ----------------------------------------- */

/**
 * @typedef SettingConfig
 * A Client Setting
 * @property {string} key             A unique machine-readable id for the setting
 * @property {string} namespace       The namespace the setting belongs to
 * @property {string} name            The human-readable name
 * @property {string} hint            An additional human-readable hint
 * @property {"world"|"client"|"user"} scope  The scope the Setting is stored in, either World, Client, or User.
 * @property {boolean} config         Indicates if this Setting should render in the Config application
 * @property {BuiltinType|DataField|typeof DataModel} type The type of data stored by this Setting
 * @property {Object} [choices]       For string Types, defines the allowable values
 * @property {Object} [range]         For numeric Types, defines the allowable range
 * @property {any} [default]          The default value
 * @property {Function} [onChange]    Executes when the value of this Setting changes
 * @property {CustomFormInput} [input] A custom form field input used in conjunction with a DataField type
 * @property {string} [id]            The combination of `{namespace}.{key}`
 */

/**
 * @typedef SettingSubmenuConfig
 * A Client Setting Submenu
 * @property {string} name             The human readable name
 * @property {string} label            The human readable label
 * @property {string} hint             An additional human readable hint
 * @property {string} icon             The classname of an Icon to render
 * @property {typeof Application|typeof ApplicationV2} type The Application class to render
 * @property {boolean} restricted      If true, only a GM can edit this Setting
 */

/**
 * @typedef KeybindingActionConfig
 * A Client Keybinding Action Configuration
 * @property {string} [namespace]                       The namespace within which the action was registered
 * @property {string} name                              The human-readable name.
 * @property {string} [hint]                            An additional human-readable hint.
 * @property {KeybindingActionBinding[]} [uneditable]   The default bindings that can never be changed nor removed.
 * @property {KeybindingActionBinding[]} [editable]     The default bindings that can be changed by the user.
 * @property {(context: KeyboardEventContext) => boolean|void} [onDown]
 *                                                      A function to execute when a key down event occurs.
 *                                                      If True is returned, the event is consumed and no further
 *                                                      keybinds execute.
 * @property {(context: KeyboardEventContext) => boolean|void} [onUp]
 *                                                      A function to execute when a key up event occurs. If True is
 *                                                      returned, the event is consumed and no further keybinds execute.
 * @property {boolean} [repeat=false]                   If True, allows Repeat events to execute the Action's onDown.
 *                                                      Defaults to false.
 * @property {boolean} [restricted=false]               If true, only a GM can edit and execute this Action.
 * @property {string[]} [reservedModifiers]             Modifiers such as `["CONTROL"]` that can be also pressed when
 *                                                      executing this Action. Prevents using one of these modifiers as
 *                                                      a Binding.
 * @property {number} [precedence=0]                    The preferred precedence of running this Keybinding Action.
 * @property {number} [order]                           The recorded registration order of the action.
 */

/**
 * @typedef KeybindingActionBinding
 * A Client Keybinding Action Binding
 * @property {number} [index]           A numeric index which tracks this bindings position during form rendering
 * @property {string} key               The KeyboardEvent#code value from
 * @property {string} logicalKey        The Keyboard logical code if universal mode is enable (it is code otherwise)
 *   {@link https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/code/code_values}
 * @property {string[]} [modifiers]     An array of modifiers keys from
 *                                      {@link foundry.helpers.interaction.KeyboardManager.MODIFIER_KEYS}
 *                                      which are required for this binding to be activated
 */

/**
 * @typedef KeybindingAction
 * An action that can occur when a key is pressed
 * @property {string} action               The namespaced machine identifier of the Action
 * @property {string} key                  The Keyboard key
 * @property {string} name                 The human-readable name
 * @property {string[]} requiredModifiers  Required modifiers
 * @property {string[]} optionalModifiers  Optional (reserved) modifiers
 * @property {Function} onDown             The handler that executes onDown
 * @property {Function} onUp               The handler that executes onUp
 * @property {boolean} repeat              If True, allows Repeat events to execute this Action's onDown
 * @property {boolean} restricted          If true, only a GM can execute this Action
 * @property {number} precedence           The registration precedence
 * @property {number} order                The registration order
 */

/**
 * @typedef KeyboardEventContext
 * A keyboard event context
 * @property {string} key              The normalized string key, such as "KeyA"
 * @property {string} logicalKey       The logical string key, such as "a"
 * @property {KeyboardEvent} event     The originating keypress event
 * @property {boolean} isShift         Is the Shift modifier being pressed
 * @property {boolean} isControl       Is the Control or Meta modifier being processed
 * @property {boolean} isAlt           Is the Alt modifier being pressed
 * @property {boolean} hasModifier     Are any of the modifiers being pressed
 * @property {string[]} modifiers      A list of string modifiers applied to this context, such as `["CONTROL"]`
 * @property {boolean} up              True if the Key is Up, else False if down
 * @property {boolean} repeat          True if the given key is being held down such that it is automatically repeating.
 * @property {string} [action]         The executing Keybinding Action. May be undefined until the action is known.
 */

/**
 * @typedef ConnectedGamepad
 * Connected Gamepad info
 * @property {Map<string, number>} axes        A map of axes values
 * @property {Set<string>} activeButtons       The Set of pressed Buttons
 */

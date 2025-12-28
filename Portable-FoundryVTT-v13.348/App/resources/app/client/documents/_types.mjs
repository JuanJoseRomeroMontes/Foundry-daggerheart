export * from "@common/documents/_types.mjs";

/**
 * @import {ElevatedPoint, REGION_MOVEMENT_SEGMENTS, RegionMovementSegmentType, TOKEN_SHAPES,
 *   TokenShapeType} from "@common/constants.mjs";
 * @import {EffectDurationData,  TokenPosition, TokenMovementWaypoint} from "@client/documents/_types.mjs";
 * @import Roll from "@client/dice/roll.mjs";
 * @import {GridMeasurePathCostFunction3D, GridOffset3D} from "@common/grid/_types.mjs";
 * @import {DataModel, Document} from "@common/abstract/_module.mjs";
 * @import {DeepReadonly, TokenConstrainMovementPathOptions, TokenMovementActionConfig} from "../_types.mjs";
 * @import {Combat, Combatant, Folder, RegionDocument, TableResult, TokenDocument, User} from "./_module.mjs";
 */

/**
 * @typedef AdventureImportData
 * The data that is planned to be imported for the adventure, categorized into new documents that will be created and
 * existing documents that will be updated.
 * @property {Record<string, object[]>} toCreate    Arrays of document data to create, organized by document name
 * @property {Record<string, object[]>} toUpdate    Arrays of document data to update, organized by document name
 * @property {number} documentCount                 The total count of documents to import
 */

/**
 * @callback AdventurePreImportCallback
 * A callback function that is invoked and awaited during import data preparation before the adventure import proceeds.
 * This can be used to perform custom pre-processing on the import data.
 * @param {AdventureImportData} data
 * @param {AdventureImportOptions} options
 * @returns {Promise<void>}
 */

/**
 * @typedef AdventureImportOptions
 * Options which customize how the adventure import process is orchestrated.
 * Modules can use the preImportAdventure hook to extend these options by adding preImport or postImport callbacks.
 * @property {boolean} [dialog=true]                Display a warning dialog if existing documents would be overwritten
 * @property {string[]} [importFields]              A subset of adventure fields to import
 * @property {AdventurePreImportCallback[]} [preImport]   An array of awaited pre-import callbacks
 * @property {AdventurePostImportCallback[]} [postImport] An array of awaited post-import callbacks
 */

/**
 * @typedef AdventureImportResult
 * A report of the world Document instances that were created or updated during the import process.
 * @property {Record<string, Document[]>} created Documents created as a result of the import, grouped by document name
 * @property {Record<string, Document[]>} updated Documents updated as a result of the import, grouped by document name
 */

/**
 * @callback AdventurePostImportCallback
 * A callback function that is invoked and awaited after import but before the overall import workflow concludes.
 * This can be used to perform additional custom adventure setup steps.
 * @param {AdventureImportResult} result
 * @param {AdventureImportOptions} options
 * @returns {Promise<void>}
 */

/**
 * @typedef _ActiveEffectDuration
 * @property {string} type            The duration type, either "seconds", "turns", or "none"
 * @property {number|null} duration   The total effect duration, in seconds of world time or as a decimal
 *                                    number with the format {rounds}.{turns}
 * @property {number|null} remaining  The remaining effect duration, in seconds of world time or as a decimal
 *                                    number with the format {rounds}.{turns}
 * @property {string} label           A formatted string label that represents the remaining duration
 * @property {number} [_worldTime]    An internal flag used determine when to recompute seconds-based duration
 * @property {number} [_combatTime]   An internal flag used determine when to recompute turns-based duration
 */

/**
 * @typedef {EffectDurationData & _ActiveEffectDuration} ActiveEffectDuration
 */

/**
 * @typedef FolderChildNode
 * A node of a Folder-content tree
 * @property {boolean} root               Whether this is the root node of a tree
 * @property {Folder} folder              The Folder document represented by this node
 * @property {number} depth               This node's depth number in the tree
 * @property {boolean} visible            Whether the Folder is visible to the current User
 * @property {FolderChildNode[]} children Child nodes of this node
 * @property {Document[]|CompendiumCollection[]} entries Loose contents in this node
 */

/**
 * @typedef CombatHistoryData
 * @property {number} round
 * @property {number|null} turn
 * @property {string|null} tokenId
 * @property {string|null} combatantId
 */

/**
 * @typedef CombatTurnEventContext
 * @property {number} round       The round
 * @property {number} turn        The turn
 * @property {boolean} skipped    Was skipped?
 */

/**
 * @typedef {Omit<CombatTurnEventContext, "turn">} CombatRoundEventContext
 */

/**
 * @template [Data=object]
 * @typedef RegionEvent
 * @property {string} name                The name of the event
 * @property {object} data                The data of the event
 * @property {RegionDocument} region      The Region the event was triggered on
 * @property {User} user                  The User that triggered the event
 */

/**
 * @typedef {RegionEvent<{}>} RegionRegionBoundaryEvent
 * @typedef {RegionEvent<{}>} RegionBehaviorActivatedEvent
 * @typedef {RegionEvent<{}>} RegionBehaviorDeactivatedEvent
 * @typedef {RegionEvent<{}>} RegionBehaviorViewedEvent
 * @typedef {RegionEvent<{}>} RegionBehaviorUnviewedEvent
 */

/**
 * @typedef RegionTokenEnterExitEventData
 * @property {TokenDocument} token                  The Token that entered/exited the Region
 * @property {TokenMovementOperation|null} movement The movement if the Token entered/exited by moving out of the Region
 *
 * @typedef {RegionEvent<RegionTokenEnterExitEventData>} RegionTokenEnterExitEvent
 * @typedef {RegionTokenEnterExitEvent} RegionTokenEnterEvent
 * @typedef {RegionTokenEnterExitEvent} RegionTokenExitEvent
 */

/**
 * @typedef RegionTokenMoveEventData
 * @property {TokenDocument} token                The Token that moved into/out of/within the Region
 * @property {TokenMovementOperation} movement    The movement
 *
 * @typedef {RegionEvent<RegionTokenMoveEventData>} RegionTokenMoveEvent
 * @typedef {RegionTokenMoveEvent} RegionTokenMoveInEvent
 * @typedef {RegionTokenMoveEvent} RegionTokenMoveOutEvent
 * @typedef {RegionTokenMoveEvent} RegionTokenMoveWithinEvent
 */

/**
 * @typedef RegionTokenAnimateEventData
 * @property {TokenDocument} token       The Token that animated into/out of the Region
 * @property {TokenPosition} position    The position of the Token when it moved into/out of the Region
 *
 * @typedef {RegionEvent<RegionTokenAnimateEventData>} RegionTokenAnimateEvent
 * @typedef {RegionTokenAnimateEvent} RegionTokenAnimateInEvent
 * @typedef {RegionTokenAnimateEvent} RegionTokenAnimateOutEvent
 */

/**
 * @typedef RegionTokenTurnEventData
 * @property {TokenDocument} token    The Token that started/ended its Combat turn
 * @property {Combatant} combatant    The Combatant of the Token that started/ended its Combat turn
 * @property {Combat} combat          The Combat
 * @property {number} round           The round of this turn
 * @property {number} turn            The turn that started/ended
 * @property {boolean} skipped        Was the turn skipped?
 *
 * @typedef {RegionEvent<RegionTokenTurnEventData>} RegionTokenTurnEvent
 * @typedef {RegionTokenTurnEvent} RegionTokenTurnStartEvent
 * @typedef {RegionTokenTurnEvent} RegionTokenTurnEndEvent
 */

/**
 * @typedef RegionTokenRoundEventData
 * @property {TokenDocument} token    The Token
 * @property {Combatant} combatant    The Combatant of the Token
 * @property {Combat} combat          The Combat
 * @property {number} round           The round that started/ended
 * @property {boolean} skipped        Was the round skipped?
 *
 * @typedef {RegionEvent<RegionTokenRoundEventData>} RegionTokenRoundEvent
 * @typedef {RegionTokenRoundEvent} RegionTokenRoundStartEvent
 * @typedef {RegionTokenRoundEvent} RegionTokenRoundEndEvent
 */

/**
 * @typedef RegionMovementSegment
 * @property {RegionMovementSegmentType} type   The type of this segment (see {@link CONST.REGION_MOVEMENT_SEGMENTS}).
 * @property {ElevatedPoint} from               The waypoint that this segment starts from.
 * @property {ElevatedPoint} to                 The waypoint that this segment goes to.
 * @property {boolean} teleport                 Teleport between the waypoints?
 */

/**
 * @typedef RegionSegmentizeMovementPathWaypoint
 * @property {number} x                         The x-coordinate in pixels (integer).
 * @property {number} y                         The y-coordinate in pixels (integer).
 * @property {number} elevation                 The elevation in grid units.
 * @property {boolean} [teleport=false]         Teleport from the previous to this waypoint? Default: `false`.
 */

/**
 * @typedef RollTableDraw
 * An object containing the executed Roll and the produced results
 * @property {Roll} roll                The Dice roll which generated the draw
 * @property {TableResult[]} results    An array of drawn TableResult documents
 */

/**
 * @typedef SceneDimensions
 * @property {number} width        The width of the canvas.
 * @property {number} height       The height of the canvas.
 * @property {number} size         The grid size.
 * @property {PIXI.Rectangle} rect      The canvas rectangle.
 * @property {number} sceneX       The X coordinate of the scene rectangle within the larger canvas.
 * @property {number} sceneY       The Y coordinate of the scene rectangle within the larger canvas.
 * @property {number} sceneWidth   The width of the scene.
 * @property {number} sceneHeight  The height of the scene.
 * @property {PIXI.Rectangle} sceneRect The scene rectangle.
 * @property {number} distance     The number of distance units in a single grid space.
 * @property {number} distancePixels  The factor to convert distance units to pixels.
 * @property {string} units        The units of distance.
 * @property {number} ratio        The aspect ratio of the scene rectangle.
 * @property {number} maxR         The length of the longest line that can be drawn on the canvas.
 * @property {number} rows         The number of grid rows on the canvas.
 * @property {number} columns      The number of grid columns on the canvas.
 */

/**
 * @typedef TrackedAttributesDescription
 * @property {string[][]} bar    A list of property path arrays to attributes with both a value and a max property.
 * @property {string[][]} value  A list of property path arrays to attributes that have only a value property.
 */

/**
 * @typedef TokenMeasuredMovementWaypoint
 * @property {number} x                  The top-left x-coordinate in pixels (integer).
 * @property {number} y                  The top-left y-coordinate in pixels (integer).
 * @property {number} elevation          The elevation in grid units.
 * @property {number} width              The width in grid spaces (positive).
 * @property {number} height             The height in grid spaces (positive).
 * @property {TokenShapeType} shape      The shape type (see {@link CONST.TOKEN_SHAPES}).
 * @property {string} action             The movement action from the previous to this waypoint.
 * @property {DataModel|null} terrain    The terrain data from the previous to this waypoint.
 * @property {boolean} snapped           Was this waypoint snapped to the grid?
 * @property {boolean} explicit          Was this waypoint explicitly placed by the user?
 * @property {boolean} checkpoint        Is this waypoint a checkpoint?
 * @property {boolean} intermediate      Is this waypoint intermediate?
 * @property {string} userId             The ID of the user that moved the token to from the previous to this waypoint.
 * @property {string} movementId         The ID of the movement from the previous to this waypoint.
 * @property {number} cost               The movement cost from the previous to this waypoint (nonnegative).
 */

/**
 * @typedef {Omit<TokenMeasuredMovementWaypoint, "terrain"|"intermediate"|"userId"|"movementId"
 *   |"cost">} TokenMovementWaypoint
 */

/**
 * @typedef {Pick<TokenMeasuredMovementWaypoint, "width"|"height"|"shape"|"action"|"terrain">
 *   & {actionConfig: TokenMovementActionConfig, teleport: boolean}} TokenMovementSegmentData
 */

/**
 * @typedef TokenMeasureMovementPathWaypoint
 * @property {number} [x]                                 The top-left x-coordinate in pixels (integer).
 *                                                        Default: the previous or source x-coordinate.
 * @property {number} [y]                                 The top-left y-coordinate in pixels (integer).
 *                                                        Default: the previous or source y-coordinate.
 * @property {number} [elevation]                         The elevation in grid units.
 *                                                        Default: the previous or source elevation.
 * @property {number} [width]                             The width in grid spaces (positive).
 *                                                        Default: the previous or source width.
 * @property {number} [height]                            The height in grid spaces (positive).
 *                                                        Default: the previous or source height.
 * @property {TokenShapeType} [shape]                     The shape type (see {@link CONST.TOKEN_SHAPES}).
 *                                                        Default: the previous or source shape.
 * @property {string} [action]                            The movement action from the previous to this waypoint.
 *                                                        Default: the previous or prepared movement action.
 * @property {DataModel|null} [terrain=null]              The terrain data of this segment. Default: `null`.
 * @property {number|TokenMovementCostFunction} [cost]    A predetermined cost (nonnegative) or cost function
 *                                                        to be used instead of `options.cost`.
 */

/**
 * @typedef TokenMeasureMovementPathOptions
 * @property {boolean} [preview=false]    Measure a preview path? Default: `false`.
 */

/**
 * @typedef {GridMeasurePathCostFunction3D<TokenMovementSegmentData>} TokenMovementCostFunction
 */

/**
 * @callback TokenMovementCostAggregator
 * @param {Array<DeepReadonly<{from: GridOffset3D, to: GridOffset3D, cost: number}>>} results
 *                                                           The results of the cost function calls.
 *                                                           The array may be sorted but otherwise not be mutated.
 * @param {number} distance                                  The distance between the grid spaces.
 * @param {DeepReadonly<TokenMovementSegmentData>} segment   The properties of the segment.
 * @returns {number}                                         The aggregated cost.
 */

/**
 * @typedef TokenGetCompleteMovementPathWaypoint
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
 * @typedef {Omit<TokenMeasuredMovementWaypoint, "userId"|"movementId"|"cost">} TokenCompleteMovementWaypoint
 */

/**
 * @typedef TokenSegmentizeMovementWaypoint
 * @property {number} [x]                       The x-coordinate in pixels (integer).
 *                                              Default: the previous or source x-coordinate.
 * @property {number} [y]                       The y-coordinate in pixels (integer).
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
 */

/**
 * @typedef {TokenPosition} TokenRegionMovementWaypoint
 */

/**
 * @typedef TokenRegionMovementSegment
 * @property {RegionMovementSegmentType} type     The type of this segment (see {@link CONST.REGION_MOVEMENT_SEGMENTS}).
 * @property {TokenRegionMovementWaypoint} from   The waypoint that this segment starts from.
 * @property {TokenRegionMovementWaypoint} to     The waypoint that this segment goes to.
 * @property {string} action                      The movement action between the waypoints.
 * @property {DataModel|null} terrain             The terrain data of this segment.
 * @property {boolean} snapped                    Is the destination snapped to the grid?
 */


/**
 * @typedef TokenMovementSectionData
 * @property {TokenMeasuredMovementWaypoint[]} waypoints    The waypoints of the movement path
 * @property {number} distance                              The distance of the movement path
 * @property {number} cost                                  The cost of the movement path
 * @property {number} spaces                                The number of spaces moved along the path
 * @property {number} diagonals                             The number of diagonals moved along the path
 */

/**
 * @typedef TokenMovementHistoryData
 * @property {TokenMovementSectionData} recorded            The recorded waypoints of the movement path
 * @property {TokenMovementSectionData} unrecorded          The unrecored waypoints of the movement path
 * @property {number} distance                              The distance of the combined movement path
 * @property {number} cost                                  The cost of the combined movement path
 * @property {number} spaces                                The number of spaces moved along the combined path
 * @property {number} diagonals                             The number of diagonals moved along the combined path
 */

/**
 * @typedef {"api"|"config"|"dragging"|"keyboard"|"paste"|"undo"} TokenMovementMethod
 */

/**
 * @typedef {"completed"|"paused"|"pending"|"stopped"} TokenMovementState
 */

/**
 * @typedef TokenMovementData
 * @property {string} id         The ID of the movement
 * @property {string[]} chain    The chain of prior movement IDs that this movement is a continuation of
 * @property {TokenPosition} origin                The origin of movement
 * @property {TokenPosition} destination           The destination of movement
 * @property {TokenMovementSectionData} passed     The waypoints and measurements of the passed path
 * @property {TokenMovementSectionData} pending    The waypoints and measurements of the pending path
 * @property {TokenMovementHistoryData} history    The waypoints and measurements of the history path
 * @property {boolean} constrained                 Was the movement constrained?
 * @property {boolean} recorded                    Was the movement recorded in the movement history?
 * @property {TokenMovementMethod} method          The method of movement
 * @property {Omit<TokenConstrainMovementPathOptions, "preview"|"history">} constrainOptions
 *                                         The options to constrain movement
 * @property {boolean} autoRotate          Automatically rotate the token in the direction of movement?
 * @property {boolean} showRuler           Show the ruler during the movement animation of the token?
 * @property {User} user                   The user that moved the token
 * @property {TokenMovementState} state    The state of the movement
 * @property {object} updateOptions        The update options of the movement operation
 */

/**
 * @typedef {Omit<TokenMovementData, "user"|"state"|"updateOptions">} TokenMovementOperation
 */

/**
 * @typedef TokenMovementContinuationData
 * @property {string} movementId                        The movement ID
 * @property {number} continueCounter                   The number of continuations
 * @property {boolean} continued                        Was continued?
 * @property {Promise<boolean>|null} continuePromise    The continuation promise
 * @property {Promise<void>} waitPromise                The promise to wait for before continuing movement
 * @property {() => {}|undefined} resolveWaitPromise    Resolve function of the wait promise
 * @property {Promise<void>} postWorkflowPromise        The promise that resolves after the update workflow
 * @property {{[movementId: string]: {handles: Map<string|symbol, TokenMovementContinuationHandle>;
 *   callbacks: Array<(continued: boolean) => void>; pending: Set<string>}}} states    The movement continuation states
 */

/**
 * @typedef TokenMovementContinuationHandle
 * @property {string} movementId                             The movement ID
 * @property {Promise<boolean>|undefined} continuePromise    The continuation promise
 */

/**
 * @callback TokenResumeMovementCallback
 * @returns {Promise<boolean>}    A promise that resolves to true if the movement was resumed.
 *                                If it wasn't resumed, it resolves to false.
 */

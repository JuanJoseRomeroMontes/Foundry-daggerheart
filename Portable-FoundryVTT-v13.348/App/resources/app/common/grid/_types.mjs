/**
 * @import {ColorSource, Point, ElevatedPoint, DeepReadonly} from "../_types.mjs";
 * @import {GridDiagonalRule} from "../constants.mjs";
 */

/**
 * @typedef GridOffset2D
 * 2D offset coordinates of a grid space.
 * @property {number} i    The row coordinate (an integer)
 * @property {number} j    The column coordinate (an integer)
 */

/**
 * @typedef GridOffset3D
 * 3D offset coordinates of a grid space.
 * @property {number} i    The row coordinate (an integer)
 * @property {number} j    The column coordinate (an integer)
 * @property {number} k    The vertical coordinate (an integer)
 */

/**
 * @typedef HexagonalGridCube2D
 * 2D cube coordinates in a hexagonal grid. q + r + s = 0.
 * @property {number} q    The coordinate along the E-W (columns) or SW-NE (rows) axis.
 *                         Equal to the offset column coordinate if column orientation.
 * @property {number} r    The coordinate along the NE-SW (columns) or N-S (rows) axis.
 *                         Equal to the offset row coordinate if row orientation.
 * @property {number} s    The coordinate along the SE-NW axis.
 */

/**
 * @typedef HexagonalGridCube3D
 * 3D cube coordinates in a hexagonal grid. q + r + s = 0.
 * @property {number} q    The coordinate along the E-W (columns) or SW-NE (rows) axis.
 *                         Equal to the offset column coordinate if column orientation.
 * @property {number} r    The coordinate along the NE-SW (columns) or N-S (rows) axis.
 *                         Equal to the offset row coordinate if row orientation.
 * @property {number} s    The coordinate along the SE-NW axis.
 * @property {number} k    The vertical coordinate.
 */

/**
 * @typedef {GridOffset2D|Point} GridCoordinates2D
 * A 2D offset of a grid space or a 2D point with pixel coordinates.
 */

/**
 * @typedef {GridOffset3D|ElevatedPoint} GridCoordinates3D
 * A 3D offset of a grid space or an elevated point.
 */

/**
 * @typedef {GridCoordinates2D|HexagonalGridCube2D} HexagonalGridCoordinates2D
 * 2D hexagonal cube coordinates, a 2D offset of a grid space, or a 2D point with pixel coordinates.
 */

/**
 * @typedef {GridCoordinates3D|HexagonalGridCube3D} HexagonalGridCoordinates3D
 * 3D hexagonal cube coordinates, a 3D offset of a grid space, or a 3D point with pixel coordinates.
 */

/**
 * @typedef GridSnappingBehavior
 * A snapping behavior is defined by the snapping mode at the given resolution of the grid.
 * @property {number} mode              The snapping mode (a union of {@link CONST.GRID_SNAPPING_MODES}).
 * @property {number} [resolution=1]    The resolution (a positive integer). Default: `1`.
 */

/**
 * @typedef GridMeasurePathWaypointData2D
 * @property {boolean} [teleport=false]                       Teleport to this waypoint? Default: `false`.
 * @property {boolean} [measure=true]                         Measure of the segment from the previous to
 *                                                            this waypoint? The distance, cost, spaces, diagonals,
 *                                                            and Euclidean length of a segment that is not measured are
 *                                                            always 0. Default: `true`.
 * @property {number|GridMeasurePathCostFunction2D} [cost]    A predetermined cost (nonnegative) or cost function
 *                                                            to be used instead of `options.cost`.
 */

/**
 * @typedef GridMeasurePathWaypointData3D
 * @property {boolean} [teleport=false]                       Teleport to this waypoint? Default: `false`.
 * @property {boolean} [measure=true]                         Measure of the segment from the previous to
 *                                                            this waypoint? The distance, cost, spaces, diagonals,
 *                                                            and Euclidean length of a segment that is not measured are
 *                                                            always 0. Default: `true`.
 * @property {number|GridMeasurePathCostFunction3D} [cost]    A predetermined cost (nonnegative) or cost function
 *                                                            to be used instead of `options.cost`.
 */

/**
 * @typedef GridMeasurePathResultWaypoint
 * A waypoint of {@link foundry.grid.types.GridMeasurePathResult}.
 * @property {GridMeasurePathResultSegment|null} backward  The segment from the previous waypoint to this waypoint.
 * @property {GridMeasurePathResultSegment|null} forward   The segment from this waypoint to the next waypoint.
 * @property {number} distance   The total distance travelled along the path up to this waypoint.
 * @property {number} cost       The total cost of the direct path ({@link foundry.grid.BaseGrid#getDirectPath}) up to
 *                               this waypoint.
 * @property {number} spaces     The total number of spaces moved along a direct path up to this waypoint.
 * @property {number} diagonals  The total number of diagonals moved along a direct path up to this waypoint.
 * @property {number} euclidean  The total Euclidean length of the straight line path up to this waypoint.
 */

/**
 * @typedef GridMeasurePathResultSegment
 * A segment of {@link foundry.grid.types.GridMeasurePathResult}.
 * @property {GridMeasurePathResultWaypoint} from  The waypoint that this segment starts from.
 * @property {GridMeasurePathResultWaypoint} to    The waypoint that this segment goes to.
 * @property {number} distance   The distance travelled in grid units along this segment.
 * @property {number} cost       The cost of the direct path ({@link foundry.grid.BaseGrid#getDirectPath}) between the
 *                               two waypoints.
 * @property {number} spaces     The number of spaces moved along this segment.
 * @property {number} diagonals  The number of diagonals moved along this segment.
 * @property {number} euclidean  The Euclidean length of the straight line segment between the two waypoints.
 */

/**
 * @typedef GridMeasurePathResult
 * A result of {@link foundry.grid.BaseGrid#measurePath}.
 * @property {GridMeasurePathResultWaypoint[]} waypoints  The measurements at each waypoint.
 * @property {GridMeasurePathResultSegment[]} segments    The measurements at each segment.
 * @property {number} distance   The total distance travelled along the path through all waypoints.
 * @property {number} cost       The total cost of the direct path ({@link foundry.grid.BaseGrid#getDirectPath})
 *                               through all waypoints.
 * @property {number} spaces     The total number of spaces moved along a direct path through all waypoints.
 *                               Moving from a grid space to any of its neighbors counts as 1 step.
 *                               Always 0 in gridless grids.
 * @property {number} diagonals  The total number of diagonals moved along a direct path through all waypoints.
 * @property {number} euclidean  The total Euclidean length of the straight line path through all waypoints.
 */

/**
 * @template [SegmentData={}]
 * @callback GridMeasurePathCostFunction2D
 * A function that returns the cost for a given move between grid spaces in 2D.
 * In square and hexagonal grids the grid spaces are always adjacent unless teleported.
 * The function is never called with the same offsets.
 * @param {Readonly<GridOffset2D>} from          The offset that is moved from
 * @param {Readonly<GridOffset2D>} to            The offset that is moved to
 * @param {number} distance                      The distance between the grid spaces
 * @param {DeepReadonly<SegmentData>} segment    The properties of the segment
 * @returns {number}                             The cost of the move between the grid spaces (nonnegative)
 */

/**
 * @template [SegmentData={}]
 * @callback GridMeasurePathCostFunction3D
 * A function that returns the cost for a given move between grid spaces in 3D.
 * In square and hexagonal grids the grid spaces are always adjacent unless teleported.
 * The function is never called with the same offsets.
 * @param {Readonly<GridOffset3D>} from          The offset that is moved from
 * @param {Readonly<GridOffset3D>} to            The offset that is moved to
 * @param {number} distance                      The distance between the grid spaces
 * @param {DeepReadonly<SegmentData>} segment    The properties of the segment
 * @returns {number}                             The cost of the move between the grid spaces (nonnegative)
 */

/**
 * @typedef GridConfiguration
 * @property {number} size                  The size of a grid space in pixels (a positive number).
 * @property {number} [distance=1]          The distance of a grid space in units (a positive number). Default: `1`.
 * @property {string} [units=""]            The units of measurement. Default: `""`.
 * @property {string} [style="solidLines"]  The style of the grid. Default: `"solidLines"`.
 * @property {ColorSource} [color=0]        The color of the grid. Default: `0x000000`.
 * @property {number} [alpha=1]             The alpha of the grid. Default: `1`.
 * @property {number} [thickness=1]         The line thickness of the grid. Default: `1`.
 */

/**
 * @typedef SquareGridConfiguration
 * @property {number} size                  The size of a grid space in pixels (a positive number).
 * @property {number} [distance=1]          The distance of a grid space in units (a positive number). Default: `1`.
 * @property {string} [units=""]            The units of measurement. Default: `""`.
 * @property {string} [style="solidLines"]  The style of the grid. Default: `"solidLines"`.
 * @property {ColorSource} [color=0]        The color of the grid. Default: `0x000000`.
 * @property {number} [alpha=1]             The alpha of the grid. Default: `1`.
 * @property {number} [thickness=1]         The line thickness of the grid. Default: `1`.
 * @property {GridDiagonalRule} [diagonals=0] The rule for diagonal measurement (see {@link CONST.GRID_DIAGONALS}).
 *                                            Default: `CONST.GRID_DIAGONALS.EQUIDISTANT`.
 */

/**
 * @typedef HexagonalGridConfiguration
 * @property {number} size                  The size of a grid space in pixels (a positive number).
 * @property {number} [distance=1]          The distance of a grid space in units (a positive number). Default: `1`.
 * @property {string} [units=""]            The units of measurement. Default: `""`.
 * @property {string} [style="solidLines"]  The style of the grid. Default: `"solidLines"`.
 * @property {ColorSource} [color=0]        The color of the grid. Default: `0x000000`.
 * @property {number} [alpha=1]             The alpha of the grid. Default: `1`.
 * @property {number} [thickness=1]         The line thickness of the grid. Default: `1`.
 * @property {boolean} [columns=false]      Is this grid column-based (flat-topped) or row-based (pointy-topped)?
 *                                          Default: `false`.
 * @property {boolean} [even=false]         Is this grid even or odd? Default: `false`.
 * @property {GridDiagonalRule} [diagonals=0] The rule for diagonal measurement (see {@link CONST.GRID_DIAGONALS}).
 *                                            Default: `CONST.GRID_DIAGONALS.EQUIDISTANT`.
 */

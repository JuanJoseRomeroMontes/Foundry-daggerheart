/**
 * A specialized object that contains the result of a collision in the context of the ClockwiseSweepPolygon.
 * This class is not designed or intended for use outside of that context.
 */
export default class CollisionResult {
  constructor({target, collisions=[], cwEdges, ccwEdges, isBehind, isLimited, wasLimited}={}) {
    this.target = target;
    this.collisions = collisions;
    this.cwEdges = cwEdges;
    this.ccwEdges = ccwEdges;
    this.isBehind = isBehind;
    this.isLimited = isLimited;
    this.wasLimited = wasLimited;
  }

  /**
   * The vertex that was the target of this result
   * @type {PolygonVertex}
   */
  target;

  /**
   * The array of collision points which apply to this result
   * @type {PolygonVertex[]}
   */
  collisions;

  /**
   * The set of edges connected to the target vertex that continue clockwise
   * @type {EdgeSet}
   */
  cwEdges;

  /**
   * The set of edges connected to the target vertex that continue counter-clockwise
   * @type {EdgeSet}
   */
  ccwEdges;

  /**
   * Is the target vertex for this result behind some closer active edge?
   * @type {boolean}
   */
  isBehind;

  /**
   * Does the target vertex for this result impose a limited collision?
   * @type {boolean}
   */
  isLimited;

  /**
   * Has the set of collisions for this result encountered a limited edge?
   * @type {boolean}
   */
  wasLimited;

  /**
   * Is this result limited in the clockwise direction?
   * @type {boolean}
   */
  limitedCW = false;

  /**
   * Is this result limited in the counter-clockwise direction?
   * @type {boolean}
   */
  limitedCCW = false;

  /**
   * Is this result blocking in the clockwise direction?
   * @type {boolean}
   */
  blockedCW = false;

  /**
   * Is this result blocking in the counter-clockwise direction?
   * @type {boolean}
   */
  blockedCCW = false;

  /**
   * Previously blocking in the clockwise direction?
   * @type {boolean}
   */
  blockedCWPrev = false;

  /**
   * Previously blocking in the counter-clockwise direction?
   * @type {boolean}
   */
  blockedCCWPrev = false;
}

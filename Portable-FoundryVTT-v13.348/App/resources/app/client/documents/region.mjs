import BaseRegion from "@common/documents/region.mjs";
import CanvasDocumentMixin from "./abstract/canvas-document.mjs";
import {CLIPPER_SCALING_FACTOR, REGION_EVENTS, REGION_MOVEMENT_SEGMENTS} from "@common/constants.mjs";
import {RegionShape, RegionPolygonTree} from "../data/region-shapes/_module.mjs";
import {fromUuid} from "../utils/helpers.mjs";

/**
 * @import {Point, ElevatedPoint} from "@common/_types.mjs";
 * @import {RegionSocketEvent} from "@common/documents/_types.mjs";
 * @import {RegionEvent, RegionMovementSegment, RegionSegmentizeMovementPathWaypoint} from "./_types.mjs";
 * @import TokenDocument from "./token.mjs";
 */


/**
 * The client-side Region document which extends the common BaseRegion model.
 * @extends BaseRegion
 * @mixes CanvasDocumentMixin
 * @category Documents
 *
 * @see {@link foundry.documents.Scene}: The Scene document type which contains Region documents
 * @see {@link foundry.applications.sheets.RegionConfig}: The Region configuration application
 */
export default class RegionDocument extends CanvasDocumentMixin(BaseRegion) {

  /**
   * Shared point instance.
   * @type {Point}
   */
  static #SHARED_POINT = {x: 0.0, y: 0.0};

  /* -------------------------------------------- */

  /**
   * The minimum distance from the boundary for a point to be considered interior/exterior.
   * @type {number}
   */
  static #MIN_BOUNDARY_DISTANCE = (Math.SQRT1_2 / CLIPPER_SCALING_FACTOR) + 1e-6;

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * The shapes of this Region.
   *
   * The value of this property must not be mutated.
   *
   * This property is updated only by a document update.
   * @type {ReadonlyArray<RegionShape>}
   */
  get regionShapes() {
    return this.#regionShapes ??= this.shapes.map(shape => RegionShape.create(shape));
  }

  #regionShapes;

  /* -------------------------------------------- */

  /**
   * The polygons of this Region.
   *
   * The value of this property must not be mutated.
   *
   * This property is updated only by a document update.
   * @type {ReadonlyArray<PIXI.Polygon>}
   */
  get polygons() {
    return this.#polygons ??= Array.from(this.polygonTree, node => node.polygon);
  }

  #polygons;

  /* -------------------------------------------- */

  /**
   * The polygon tree of this Region.
   *
   * The value of this property must not be mutated.
   *
   * This property is updated only by a document update.
   * @type {RegionPolygonTree}
   */
  get polygonTree() {
    return this.#polygonTree ??= RegionPolygonTree._fromClipperPolyTree(
      this.#createClipperPolyTree());
  }

  #polygonTree;

  /* -------------------------------------------- */

  /**
   * The Clipper paths of this Region.
   *
   * The value of this property must not be mutated.
   *
   * This property is updated only by a document update.
   * @type {ReadonlyArray<ReadonlyArray<ClipperLib.IntPoint>>}
   */
  get clipperPaths() {
    return this.#clipperPaths ??= Array.from(this.polygonTree, node => node.clipperPath);
  }

  #clipperPaths;

  /* -------------------------------------------- */

  /**
   * The triangulation of this Region.
   *
   * The value of this property must not be mutated.
   *
   * This property is updated only by a document update.
   * @type {Readonly<{vertices: Float32Array; indices: Uint16Array|Uint32Array}>}
   */
  get triangulation() {
    let triangulation = this.#triangulation;
    if ( !this.#triangulation ) {
      let vertexIndex = 0;
      let vertexDataSize = 0;
      for ( const node of this.polygonTree ) vertexDataSize += node.points.length;
      const vertexData = new Float32Array(vertexDataSize);
      const indices = [];
      for ( const node of this.polygonTree ) {
        if ( node.isHole ) continue;
        const holes = [];
        let points = node.points;
        for ( const hole of node.children ) {
          holes.push(points.length / 2);
          points = points.concat(hole.points);
        }
        const triangles = PIXI.utils.earcut(points, holes, 2);
        const offset = vertexIndex / 2;
        for ( let i = 0; i < triangles.length; i++ ) indices.push(triangles[i] + offset);
        for ( let i = 0; i < points.length; i++ ) vertexData[vertexIndex++] = points[i];
      }
      const indexDataType = vertexDataSize / 2 > 65536 ? Uint32Array : Uint16Array;
      const indexData = new indexDataType(indices);
      this.#triangulation = triangulation = {vertices: vertexData, indices: indexData};
    }
    return triangulation;
  }

  #triangulation;

  /* -------------------------------------------- */

  /**
   * The bounds of this Region.
   *
   * The value of this property must not be mutated.
   *
   * This property is updated only by a document update.
   * @type {PIXI.Rectangle}
   */
  get bounds() {
    let bounds = this.#bounds;
    if ( !bounds ) {
      const nodes = this.polygonTree.children;
      if ( nodes.length === 0 ) bounds = new PIXI.Rectangle();
      else {
        bounds = nodes[0].bounds.clone();
        for ( let i = 1; i < nodes.length; i++ ) {
          bounds.enlarge(nodes[i].bounds);
        }
      }
      this.#bounds = bounds;
    }
    return bounds;
  }

  #bounds;

  /* -------------------------------------------- */

  /**
   * The tokens inside this region.
   * @type {ReadonlySet<TokenDocument>}
   * @readonly
   */
  tokens = new Set();

  /* -------------------------------------------- */
  /*  Document Preparation                        */
  /* -------------------------------------------- */

  /** @inheritDoc */
  prepareBaseData() {
    super.prepareBaseData();
    this.elevation.bottom ??= -Infinity;
    this.elevation.top ??= Infinity;
  }

  /* -------------------------------------------- */
  /*  Shape Methods                               */
  /* -------------------------------------------- */

  /**
   * Test whether the given point (at the given elevation) is inside this Region.
   * @param {ElevatedPoint} point    The point.
   * @returns {boolean}              Is the point inside this Region?
   */
  testPoint(point) {
    const elevation = point.elevation;
    const {bottom, top} = this.elevation;
    return ((bottom <= elevation) && (elevation <= top)) && this.polygonTree.testPoint(point);
  }

  /* -------------------------------------------- */

  /**
   * Create the Clipper polygon tree for this Region.
   * @returns {ClipperLib.PolyTree}
   */
  #createClipperPolyTree() {
    const i0 = this.regionShapes.findIndex(s => !s.isHole);
    if ( i0 < 0 ) return new ClipperLib.PolyTree();
    if ( i0 === this.regionShapes.length - 1 ) {
      const shape = this.regionShapes[i0];
      if ( shape.isHole ) return new ClipperLib.PolyTree();
      return shape.clipperPolyTree;
    }
    const clipper = new ClipperLib.Clipper();
    const batches = this.#buildClipperBatches();
    if ( batches.length === 0 ) return new ClipperLib.PolyTree();
    if ( batches.length === 1 ) {
      const batch = batches[0];
      const tree = new ClipperLib.PolyTree();
      clipper.AddPaths(batch.paths, ClipperLib.PolyType.ptClip, true);
      clipper.Execute(batch.clipType, tree, ClipperLib.PolyFillType.pftNonZero, batch.fillType);
      return tree;
    }
    let subjectPaths = batches[0].paths;
    let subjectFillType = batches[0].fillType;
    for ( let i = 1; i < batches.length; i++ ) {
      const batch = batches[i];
      const solution = i === batches.length - 1 ? new ClipperLib.PolyTree() : [];
      clipper.Clear();
      clipper.AddPaths(subjectPaths, ClipperLib.PolyType.ptSubject, true);
      clipper.AddPaths(batch.paths, ClipperLib.PolyType.ptClip, true);
      clipper.Execute(batch.clipType, solution, subjectFillType, batch.fillType);
      subjectPaths = solution;
      subjectFillType = ClipperLib.PolyFillType.pftNonZero;
    }
    return subjectPaths;
  }

  /* -------------------------------------------- */

  /**
   * Build the Clipper batches.
   * @returns {{paths: ClipperLib.IntPoint[][]; fillType: ClipperLib.PolyFillType; clipType: ClipperLib.ClipType}[]}
   */
  #buildClipperBatches() {
    const batches = [];
    const shapes = this.regionShapes;
    let i = 0;

    // Skip over holes at the beginning
    while ( i < shapes.length ) {
      if ( !shapes[i].isHole ) break;
      i++;
    }

    // Iterate the shapes and batch paths of consecutive (non-)hole shapes
    while ( i < shapes.length ) {
      const paths = [];
      const isHole = shapes[i].isHole;

      // Add paths of the current shape and following shapes until the next shape is (not) a hole
      do {
        for ( const path of shapes[i].clipperPaths ) paths.push(path);
        i++;
      } while ( (i < shapes.length) && (shapes[i].isHole === isHole) );

      // Create a batch from the paths, which are either all holes or all non-holes
      batches.push({
        paths,
        fillType: ClipperLib.PolyFillType.pftNonZero,
        clipType: isHole ? ClipperLib.ClipType.ctDifference : ClipperLib.ClipType.ctUnion
      });
    }
    return batches;
  }

  /* -------------------------------------------- */

  /**
   * Split the movement path into its segments.
   * @param {RegionSegmentizeMovementPathWaypoint[]} waypoints    The waypoints of movement.
   * @param {Point[]} samples                       The points relative to the waypoints that are tested.
   *                                                Whenever one of them is inside the region, the moved object
   *                                                is considered to be inside the region.
   * @returns {RegionMovementSegment[]}             The movement split into its segments.
   */
  segmentizeMovementPath(waypoints, samples) {
    if ( samples.length === 0 ) return [];
    if ( waypoints.length === 2 ) return this.#segmentizeMovement(waypoints[0], waypoints[1], samples);
    const segments = [];
    for ( let i = 1; i < waypoints.length; i++ ) {
      for ( const segment of this.#segmentizeMovement(waypoints[i - 1], waypoints[i], samples) ) {
        segments.push(segment);
      }
    }
    return segments;
  }

  /* -------------------------------------------- */

  /**
   * Split the movement into its segments.
   * @param {RegionSegmentizeMovementPathWaypoint} origin         The origin of movement.
   * @param {RegionSegmentizeMovementPathWaypoint} destination    The destination of movement.
   * @param {Point[]} samples                                 The points relative to the waypoints that are tested.
   * @returns {RegionMovementSegment[]}                       The movement split into its segments.
   */
  #segmentizeMovement(origin, destination, samples) {
    const originX = Math.round(origin.x);
    const originY = Math.round(origin.y);
    const originElevation = origin.elevation;
    const destinationX = Math.round(destination.x);
    const destinationY = Math.round(destination.y);
    const destinationElevation = destination.elevation;

    // If same origin and destination, there are no segments
    if ( (originX === destinationX) && (originY === destinationY)
      && (originElevation === destinationElevation) ) return [];

    let segments;

    // Teleportation
    const teleport = destination.teleport ?? false;
    if ( teleport ) {
      segments = this.#getTeleportationSegments(originX, originY, originElevation,
        destinationX, destinationY, destinationElevation, samples);
    }

    // Movement with no elevation change
    else if ( originElevation === destinationElevation ) {
      segments = this.#getNoElevationChangeSegments(originX, originY, destinationX,
        destinationY, destinationElevation, samples);
    }

    // Movement with elevation change
    else {
      segments = this.#getElevationChangeSegments(originX, originY, originElevation,
        destinationX, destinationY, destinationElevation, samples);
    }

    // Add segment properties
    for ( const segment of segments ) segment.teleport = teleport;

    return segments;
  }

  /* -------------------------------------------- */

  /**
   * Get the teleporation segments from the origin to the destination.
   * @param {number} originX                  The x-coordinate of the origin.
   * @param {number} originY                  The y-coordinate of the origin.
   * @param {number} originElevation          The elevation of the destination.
   * @param {number} destinationX             The x-coordinate of the destination.
   * @param {number} destinationY             The y-coordinate of the destination.
   * @param {number} destinationElevation     The elevation of the destination.
   * @param {Point[]} samples                 The samples relative to the position.
   * @returns {{type: REGION_MOVEMENT_SEGMENTS; from: ElevatedPoint; to: ElevatedPoint}[]}
   */
  #getTeleportationSegments(originX, originY, originElevation, destinationX, destinationY, destinationElevation,
    samples) {
    const positionChanged = (originX !== destinationX) || (originY !== destinationY);
    const elevationChanged = originElevation !== destinationElevation;
    if ( !(positionChanged || elevationChanged) ) return [];
    const {bottom, top} = this.elevation;
    let originInside = (bottom <= originElevation) && (originElevation <= top);
    let destinationInside = (bottom <= destinationElevation) && (destinationElevation <= top);
    if ( positionChanged ) {
      originInside &&= this.#testSamples(originX, originY, samples);
      destinationInside &&= this.#testSamples(destinationX, destinationY, samples);
    } else if ( originInside || destinationInside ) {
      const inside = this.#testSamples(originX, originY, samples);
      originInside &&= inside;
      destinationInside &&= inside;
    }
    let type;
    if ( originInside && destinationInside) type = REGION_MOVEMENT_SEGMENTS.MOVE;
    else if ( originInside ) type = REGION_MOVEMENT_SEGMENTS.EXIT;
    else if ( destinationInside ) type = REGION_MOVEMENT_SEGMENTS.ENTER;
    else return [];
    return [{
      type,
      from: {x: originX, y: originY, elevation: originElevation},
      to: {x: destinationX, y: destinationY, elevation: destinationElevation}
    }];
  }

  /* -------------------------------------------- */

  /**
   * Get the segments from the origin to the destination where both are at the same elevation.
   * If no elevation change, we don't have to deal with enter/exit segments at the bottom/top elevation range
   * @param {number} originX                  The x-coordinate of the origin.
   * @param {number} originY                  The y-coordinate of the origin.
   * @param {number} destinationX             The x-coordinate of the destination.
   * @param {number} destinationY             The y-coordinate of the destination.
   * @param {number} elevation                The elevation.
   * @param {Point[]} samples                 The samples relative to the position.
   * @returns {{type: REGION_MOVEMENT_SEGMENTS; from: ElevatedPoint; to: ElevatedPoint}[]}
   */
  #getNoElevationChangeSegments(originX, originY, destinationX, destinationY, elevation, samples) {
    if ( !((this.elevation.bottom <= elevation) && (elevation <= this.elevation.top)) ) return [];
    return this.#getMovementSegments(originX, originY, elevation, destinationX, destinationY, elevation, samples);
  }

  /* -------------------------------------------- */

  /**
   * Get the segments from the origin to the destination where both are at different elevations.
   * @param {number} originX                  The x-coordinate of the origin.
   * @param {number} originY                  The y-coordinate of the origin.
   * @param {number} originElevation          The elevation of the destination.
   * @param {number} destinationX             The x-coordinate of the destination.
   * @param {number} destinationY             The y-coordinate of the destination.
   * @param {number} destinationElevation     The elevation of the destination.
   * @param {Point[]} samples                 The samples relative to the position.
   * @returns {{type: REGION_MOVEMENT_SEGMENTS; from: ElevatedPoint; to: ElevatedPoint}[]}
   */
  #getElevationChangeSegments(originX, originY, originElevation, destinationX, destinationY, destinationElevation,
    samples) {

    // Calculate the first and last elevation within the elevation range of this Region
    const upwards = originElevation < destinationElevation;
    const e1 = upwards ? Math.max(originElevation, this.elevation.bottom)
      : Math.min(originElevation, this.elevation.top);
    const e2 = upwards ? Math.min(destinationElevation, this.elevation.top)
      : Math.max(destinationElevation, this.elevation.bottom);
    const t1 = (e1 - originElevation) / (destinationElevation - originElevation);
    const t2 = (e2 - originElevation) / (destinationElevation - originElevation);

    // Return if there's no intersection
    if ( t1 > t2 ) return [];

    // Calculate the first and last position of movement in the elevation range of this Region
    const x1 = Math.round(Math.mix(originX, destinationX, t1));
    const y1 = Math.round(Math.mix(originY, destinationY, t1));
    const x2 = Math.round(Math.mix(originX, destinationX, t2));
    const y2 = Math.round(Math.mix(originY, destinationY, t2));

    // Get movements segments within the elevation range of this Region
    const segments = this.#getMovementSegments(x1, y1, e1, x2, y2, e2, samples);

    // Add segment if we enter vertically
    const defaultGrid = foundry.documents.BaseScene.defaultGrid;
    if ( (originElevation !== e1) && this.#testSamples(x1, y1, samples) ) {
      const grid = this.parent?.grid ?? defaultGrid;
      const epsilon = Math.min(Math.abs(originElevation - e1), grid.distance / grid.size);
      segments.unshift({
        type: REGION_MOVEMENT_SEGMENTS.ENTER,
        from: {x: x1, y: y1, elevation: e1 - (upwards ? epsilon : -epsilon)},
        to: {x: x1, y: y1, elevation: e1}
      });
    }

    // Add segment if we exit vertically
    if ( (destinationElevation !== e2) && this.#testSamples(x2, y2, samples) ) {
      const grid = this.parent?.grid ?? defaultGrid;
      const epsilon = Math.min(Math.abs(destinationElevation - e2), grid.distance / grid.size);
      segments.push({
        type: REGION_MOVEMENT_SEGMENTS.EXIT,
        from: {x: x2, y: y2, elevation: e2},
        to: {x: x2, y: y2, elevation: e2 + (upwards ? epsilon : -epsilon)}
      });
    }

    return segments;
  }

  /* -------------------------------------------- */

  /**
   * Test whether one of the samples relative to the given position is contained within this Region.
   * @param {number} x             The x-coordinate of the position.
   * @param {number} y             The y-coordinate of the position.
   * @param {Point[]} samples      The samples relative to the position.
   * @returns {boolean}            Is one of the samples contained within this Region?
   */
  #testSamples(x, y, samples) {
    const point = RegionDocument.#SHARED_POINT;
    const n = samples.length;
    for ( let i = 0; i < n; i++ ) {
      const sample = samples[i];
      point.x = x + sample.x;
      point.y = y + sample.y;
      if ( this.#polygonTree.testPoint(point) ) return true;
    }
    return false;
  }

  /* -------------------------------------------- */

  /**
   * Split the movement into its segments.
   * @param {number} originX                      The x-coordinate of the origin.
   * @param {number} originY                      The y-coordinate of the origin.
   * @param {number} originElevation              The elevation of the destination.
   * @param {number} destinationX                 The x-coordinate of the destination.
   * @param {number} destinationY                 The y-coordinate of the destination.
   * @param {number} destinationElevation         The elevation of the destination.
   * @param {Point[]} samples                     The samples relative to the position.
   * @returns {{type: REGION_MOVEMENT_SEGMENTS; from: ElevatedPoint; to: ElevatedPoint}[]}
   */
  #getMovementSegments(originX, originY, originElevation, destinationX, destinationY, destinationElevation, samples) {
    const segments = [];
    if ( (originX === destinationX) && (originY === destinationY) ) {

      // Add move segment if inside and the elevation changed
      if ( (originElevation !== destinationElevation) && this.#testSamples(originX, originY, samples) ) {
        segments.push({
          type: REGION_MOVEMENT_SEGMENTS.MOVE,
          from: {x: originX, y: originY, elevation: originElevation},
          to: {x: destinationX, y: destinationY, elevation: destinationElevation}
        });
      }
      return segments;
    }

    // Test first if the bounds of the movement overlap the bounds of this Region
    if ( !this.#couldMovementIntersect(originX, originY, destinationX, destinationY, samples) ) return segments;

    // Compute the intervals
    const intervals = this.#computeSegmentIntervals(originX, originY, destinationX, destinationY, samples);

    // Compute the segments from the intervals
    for ( const {start, end} of intervals ) {

      // Find crossings (enter and exit) for the interval
      const startX = Math.round(Math.mix(originX, destinationX, start));
      const startY = Math.round(Math.mix(originY, destinationY, start));
      const startElevation = Math.mix(originElevation, destinationElevation, start);
      const endX = Math.round(Math.mix(originX, destinationX, end));
      const endY = Math.round(Math.mix(originY, destinationY, end));
      const endElevation = Math.mix(originElevation, destinationElevation, end);
      const [{x: x00, y: y00, inside: inside00}, {x: x01, y: y01, inside: inside01}] = this.#findBoundaryCrossing(
        originX, originY, startX, startY, endX, endY, samples, true);
      const [{x: x10, y: y10, inside: inside10}, {x: x11, y: y11, inside: inside11}] = this.#findBoundaryCrossing(
        startX, startY, endX, endY, destinationX, destinationY, samples, false);

      // Add enter segment if found
      if ( inside00 !== inside01 ) {
        segments.push({
          type: REGION_MOVEMENT_SEGMENTS.ENTER,
          from: {x: x00, y: y00, elevation: startElevation},
          to: {x: x01, y: y01, elevation: startElevation}
        });
      }

      // Add move segment or enter/exit segment if not completely inside
      if ( (inside01 || inside10) && ((x01 !== x10) || (y01 !== y10)) ) {
        segments.push({
          type: inside01 && inside10 ? REGION_MOVEMENT_SEGMENTS.MOVE
            : inside10 ? REGION_MOVEMENT_SEGMENTS.ENTER : REGION_MOVEMENT_SEGMENTS.EXIT,
          from: {x: x01, y: y01, elevation: startElevation},
          to: {x: x10, y: y10, elevation: endElevation}
        });
      }

      // Add exit segment if found
      if ( inside10 !== inside11 ) {
        segments.push({
          type: REGION_MOVEMENT_SEGMENTS.EXIT,
          from: {x: x10, y: y10, elevation: endElevation},
          to: {x: x11, y: y11, elevation: endElevation}
        });
      }
    }

    // Make sure we have segments for origins/destinations inside the region
    const originInside = this.#testSamples(originX, originY, samples);
    const destinationInside = this.#testSamples(destinationX, destinationY, samples);

    // If neither the origin nor the destination are inside, we are done
    if ( !originInside && !destinationInside ) return segments;

    // If we didn't find segments with the method above, we need to add segments for the origin and/or destination
    if ( segments.length === 0 ) {

      // If the origin is inside, look for a crossing (exit) after the origin
      if ( originInside ) {
        const [{x: x0, y: y0}, {x: x1, y: y1, inside: inside1}] = this.#findBoundaryCrossing(
          originX, originY, originX, originY, destinationX, destinationY, samples, false);
        if ( !inside1 ) {

          // If we don't exit at the origin, add a move segment
          if ( (originX !== x0) || (originY !== y0) ) {
            segments.push({
              type: REGION_MOVEMENT_SEGMENTS.MOVE,
              from: {x: originX, y: originY, elevation: originElevation},
              to: {x: x0, y: y0, elevation: originElevation}
            });
          }

          // Add the exit segment that we found
          segments.push({
            type: REGION_MOVEMENT_SEGMENTS.EXIT,
            from: {x: x0, y: y0, elevation: originElevation},
            to: {x: x1, y: y1, elevation: originElevation}
          });
        }
      }

      // If the destination is inside, look for a crossing (enter) before the destination
      if ( destinationInside ) {
        const [{x: x0, y: y0, inside: inside0}, {x: x1, y: y1}] = this.#findBoundaryCrossing(
          originX, originY, destinationX, destinationY, destinationX, destinationY, samples, true);
        if ( !inside0 ) {

          // Add the enter segment that we found
          segments.push({
            type: REGION_MOVEMENT_SEGMENTS.ENTER,
            from: {x: x0, y: y0, elevation: destinationElevation},
            to: {x: x1, y: y1, elevation: destinationElevation}
          });

          // If we don't enter at the destination, add a move segment
          if ( (destinationX !== x1) || (destinationY !== y1) ) {
            segments.push({
              type: REGION_MOVEMENT_SEGMENTS.MOVE,
              from: {x: x1, y: y1, elevation: destinationElevation},
              to: {x: destinationX, y: destinationY, elevation: destinationElevation}
            });
          }
        }
      }

      // If both are inside and we didn't find we didn't find a crossing, the entire segment is contained
      if ( originInside && destinationInside && (segments.length === 0) ) {
        segments.push({
          type: REGION_MOVEMENT_SEGMENTS.MOVE,
          from: {x: originX, y: originY, elevation: originElevation},
          to: {x: destinationX, y: destinationY, elevation: destinationElevation}
        });
      }
    }

    // We have segments and know we make sure that the origin and/or destination that are inside are
    // part of those segments. If they are not we either need modify the first/last segment or add
    // segments to the beginning/end.
    else {

      // Make sure we have a segment starting at the origin if it is inside
      if ( originInside ) {
        const first = segments.at(0);
        const {x: firstX, y: firstY} = first.from;
        if ( (originX !== firstX) || (originY !== firstY) ) {

          // The first segment is an enter segment, so we need to add an exit segment before this one
          if ( first.type === 1 ) {
            const [{x: x0, y: y0}, {x: x1, y: y1}] = this.#findBoundaryCrossing(
              firstX, firstY, originX, originY, originX, originY, samples, false);
            segments.unshift({
              type: REGION_MOVEMENT_SEGMENTS.EXIT,
              from: {x: x0, y: y0, elevation: originElevation},
              to: {x: x1, y: y1, elevation: originElevation}
            });
          }

          // We have an exit or move segment, in which case we can simply update the from position
          else {
            first.from.x = originX;
            first.from.y = originY;
          }
        }
      }

      // Make sure we have a segment ending at the destination if it is inside
      if ( destinationInside ) {
        const last = segments.at(-1);
        const {x: lastX, y: lastY} = last.to;
        if ( (destinationX !== lastX) || (destinationY !== lastY) ) {

          // The last segment is an exit segment, so we need to add an enter segment after this one
          if ( last.type === -1 ) {
            const [{x: x0, y: y0}, {x: x1, y: y1}] = this.#findBoundaryCrossing(
              lastX, lastY, destinationX, destinationY, destinationX, destinationY, samples, true);
            segments.push({
              type: REGION_MOVEMENT_SEGMENTS.ENTER,
              from: {x: x0, y: y0, elevation: destinationElevation},
              to: {x: x1, y: y1, elevation: destinationElevation}
            });
          }

          // We have an enter or move segment, in which case we can simply update the to position
          else {
            last.to.x = destinationX;
            last.to.y = destinationY;
          }
        }
      }
    }
    return segments;
  }

  /* -------------------------------------------- */

  /**
   * Test whether the movement could intersect this Region.
   * @param {number} originX           The x-coordinate of the origin.
   * @param {number} originY           The y-coordinate of the origin.
   * @param {number} destinationX      The x-coordinate of the destination.
   * @param {number} destinationY      The y-coordinate of the destination.
   * @param {Point[]} samples          The samples relative to the position.
   * @returns {boolean}                Could the movement intersect?
   */
  #couldMovementIntersect(originX, originY, destinationX, destinationY, samples) {
    let {x: minX, y: minY} = samples[0];
    let maxX = minX;
    let maxY = minY;
    for ( let i = 1; i < samples.length; i++ ) {
      const {x, y} = samples[i];
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
    minX += Math.min(originX, destinationX);
    minY += Math.min(originY, destinationY);
    maxX += Math.max(originX, destinationX);
    maxY += Math.max(originY, destinationY);
    const {left, right, top, bottom} = this.bounds;
    return (Math.max(minX, left - 1) <= Math.min(maxX, right + 1))
      && (Math.max(minY, top - 1) <= Math.min(maxY, bottom + 1));
  }

  /* -------------------------------------------- */

  /**
   * Compute the intervals of intersection of the movement.
   * @param {number} originX                      The x-coordinate of the origin.
   * @param {number} originY                      The y-coordinate of the origin.
   * @param {number} destinationX                 The x-coordinate of the destination.
   * @param {number} destinationY                 The y-coordinate of the destination.
   * @param {Point[]} samples                     The samples relative to the position.
   * @returns {{start: number; end: number}[]}    The intervals where we have an intersection.
   */
  #computeSegmentIntervals(originX, originY, destinationX, destinationY, samples) {
    const intervals = [];
    const clipper = new ClipperLib.Clipper();
    const solution = new ClipperLib.PolyTree();
    const origin = new ClipperLib.IntPoint(0, 0);
    const destination = new ClipperLib.IntPoint(0, 0);
    const lineSegment = [origin, destination];

    // Calculate the intervals for each of the line segments
    for ( const {x: dx, y: dy} of samples ) {
      origin.X = Math.round((originX + dx) * CLIPPER_SCALING_FACTOR);
      origin.Y = Math.round((originY + dy) * CLIPPER_SCALING_FACTOR);
      destination.X = Math.round((destinationX + dx) * CLIPPER_SCALING_FACTOR);
      destination.Y = Math.round((destinationY + dy) * CLIPPER_SCALING_FACTOR);

      // Intersect the line segment with the geometry of this Region
      clipper.Clear();
      clipper.AddPath(lineSegment, ClipperLib.PolyType.ptSubject, false);
      clipper.AddPaths(this.clipperPaths, ClipperLib.PolyType.ptClip, true);
      clipper.Execute(ClipperLib.ClipType.ctIntersection, solution);

      // Calculate the intervals of the intersections
      const length = Math.hypot(destination.X - origin.X, destination.Y - origin.Y);
      for ( const [a, b] of ClipperLib.Clipper.PolyTreeToPaths(solution) ) {
        let start = Math.hypot(a.X - origin.X, a.Y - origin.Y) / length;
        let end = Math.hypot(b.X - origin.X, b.Y - origin.Y) / length;
        if ( start > end ) [start, end] = [end, start];
        intervals.push({start, end});
      }
    }

    // Sort and merge intervals
    intervals.sort((i0, i1) => i0.start - i1.start);
    const mergedIntervals = [];
    if ( intervals.length !== 0 ) {
      let i0 = intervals[0];
      mergedIntervals.push(i0);
      for ( let i = 1; i < intervals.length; i++ ) {
        const i1 = intervals[i];
        if ( i0.end < i1.start ) mergedIntervals.push(i0 = i1);
        else i0.end = Math.max(i0.end, i1.end);
      }
    }
    return mergedIntervals;
  }

  /* -------------------------------------------- */

  /**
   * Find the crossing (enter or exit) at the current position between the start and end position, if possible.
   * The current position should be very close to crossing, otherwise we test a lot of pixels potentially.
   * We use Bresenham's line algorithm to walk forward/backwards to find the crossing.
   * @see {@link https://en.wikipedia.org/wiki/Bresenham's_line_algorithm}
   * @param {number} startX      The start x-coordinate.
   * @param {number} startY      The start y-coordinate.
   * @param {number} currentX    The current x-coordinate.
   * @param {number} currentY    The current y-coordinate.
   * @param {number} endX        The end x-coordinate.
   * @param {number} endY        The end y-coordinate.
   * @param {boolean} samples    The samples.
   * @param {boolean} enter      Find enter? Otherwise find exit.
   * @returns {[from: {x: number; y: number; inside: boolean}; to: {x: number; y: number; inside: boolean}]}
   */
  #findBoundaryCrossing(startX, startY, currentX, currentY, endX, endY, samples, enter) {

    // Special case in square/hexagonal grids: we do not want from/to positions of crossings to end up exactly on the
    // boundary; we do not want the from/to positions of crossings to end up on grid edges for grid-shaped regions
    const grid = this.parent?.grid ?? foundry.documents.BaseScene.defaultGrid;
    if ( !grid.isGridless ) {
      return [
        this.#findNextInteriorExteriorPosition(currentX, currentY, startX, startY, samples, !enter),
        this.#findNextInteriorExteriorPosition(currentX, currentY, endX, endY, samples, enter)
      ];
    }

    let x0 = currentX;
    let y0 = currentY;
    let x1 = x0;
    let y1 = y0;
    let x2;
    let y2;

    // Adjust starting conditions depending on whether we are already inside the Region
    const inside = this.#testSamples(currentX, currentY, samples);
    if ( inside === enter ) {
      x2 = startX;
      y2 = startY;
    } else {
      x2 = endX;
      y2 = endY;
    }
    const sx = x1 < x2 ? 1 : -1;
    const sy = y1 < y2 ? 1 : -1;
    const dx = Math.abs(x1 - x2);
    const dy = 0 - Math.abs(y1 - y2);
    let e = dx + dy;

    // Iterate until we find a crossing point or we reach the start/end position
    while ( (x1 !== x2) || (y1 !== y2) ) {
      const e2 = e * 2;
      if ( e2 <= dx ) {
        e += dx;
        y1 += sy;
      }
      if ( e2 >= dy ) {
        e += dy;
        x1 += sx;
      }

      // If we found the crossing, return it
      if ( this.#testSamples(x1, y1, samples) !== inside ) {
        return inside === enter
          ? [{x: x1, y: y1, inside: !inside}, {x: x0, y: y0, inside}]
          : [{x: x0, y: y0, inside}, {x: x1, y: y1, inside: !inside}];
      }

      x0 = x1;
      y0 = y1;
    }
    return [{x: x1, y: y1, inside}, {x: x1, y: y1, inside}];
  }

  /* -------------------------------------------- */

  /**
   * Find the next interior/exterior position along the line from (x0, y0) to (x1, y1).
   * @param {number} x0          The start x-coordinate.
   * @param {number} y0          The start y-coordinate.
   * @param {number} x1          The end x-coordinate.
   * @param {number} y1          The end y-coordinate.
   * @param {boolean} samples    The samples.
   * @param {boolean} inside     Find first interior point? Otherwise find first exterior point.
   * @returns {{x: number; y: number; inside: boolean}}
   */
  #findNextInteriorExteriorPosition(x0, y0, x1, y1, samples, inside) {
    if ( this.#testSamplesInteriorExterior(x0, y0, samples, inside) ) return {x: x0, y: y0, inside};
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    const dx = Math.abs(x0 - x1);
    const dy = 0 - Math.abs(y0 - y1);
    let e = dx + dy;
    while ( (x0 !== x1) || (y0 !== y1) ) {
      const e2 = e * 2;
      if ( e2 <= dx ) {
        e += dx;
        y0 += sy;
      }
      if ( e2 >= dy ) {
        e += dy;
        x0 += sx;
      }
      if ( this.#testSamplesInteriorExterior(x0, y0, samples, inside) ) return {x: x0, y: y0, inside};
    }
    return {x: x1, y: y1, inside: this.#testSamples(x1, y1, samples)};
  }

  /* -------------------------------------------- */

  /**
   * Test whether one/all of the samples relative to the given position is/are in the interior/exterior of this Region.
   * @param {number} x             The x-coordinate of the position.
   * @param {number} y             The y-coordinate of the position.
   * @param {Point[]} samples      The samples relative to the position.
   * @param {boolean} inside       If true, test whether at least one point is in the interior, if false, test
   *                               whether all points are in the exterior.
   * @returns {boolean}            Is one of the samples contained within this Region?
   */
  #testSamplesInteriorExterior(x, y, samples, inside) {
    const point = RegionDocument.#SHARED_POINT;
    const n = samples.length;
    const radius = RegionDocument.#MIN_BOUNDARY_DISTANCE;
    for ( let i = 0; i < n; i++ ) {
      const sample = samples[i];
      point.x = x + sample.x;
      point.y = y + sample.y;
      const result = this.#polygonTree.testCircle(point, radius);
      if ( result === 0 ) return false;
      if ( result === 1 ) return inside;
    }
    return !inside;
  }

  /* -------------------------------------------- */
  /*  Document Event Handlers                     */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);

    // Update the shapes
    if ( "shapes" in changed ) {
      this.#regionShapes = undefined;
      this.#polygons = undefined;
      this.#polygonTree = undefined;
      this.#clipperPaths = undefined;
      this.#triangulation = undefined;
      this.#bounds = undefined;
    }
  }

  /* -------------------------------------------- */
  /*  API Methods                                 */
  /* -------------------------------------------- */

  /**
   * Teleport a Token into this Region.
   * The Token may be in the same Scene as this Region, or in a different Scene.
   * The current User must be an owner of the Token Document in order to teleport it
   * For teleportation to a different Scene the current User requires `TOKEN_CREATE` and
   * `TOKEN_DELETE` permissions. If the Token is teleported to different Scene, it is deleted
   * and a new Token Document in the other Scene is created.
   * @param {TokenDocument} token         An existing Token Document to teleport
   * @returns {Promise<TokenDocument>}    The same Token Document if teleported within the same Scene,
   *                                      or a new Token Document if teleported to a different Scene
   */
  async teleportToken(token) {
    if ( !token.isOwner ) throw new Error("You must be an owner of the Token in order to teleport it.");
    if ( (token.parent !== this.parent) && !(game.user.can("TOKEN_CREATE") && game.user.can("TOKEN_DELETE")) ) {
      throw new Error("You must have TOKEN_CREATE and TOKEN_DELETE permissions to teleport the Token to a different Scene.");
    }
    const originScene = token.parent;
    const destinationScene = this.parent;
    let destinationToken;
    if ( originScene === destinationScene ) destinationToken = token;
    else {
      const originTokenData = token.toObject();
      delete originTokenData._id;
      destinationToken = foundry.documents.TokenDocument.implementation.fromSource(originTokenData,
        {parent: destinationScene});
    }

    // Get the destination position
    const destination = this.#getDestination(destinationToken);

    // If we didn't find a position that places the token within the destination region,
    // the region is not a valid destination for teleporation or we didn't have luck finding one in 10 tries.
    if ( !destination ) throw new Error(`${this.uuid} cannot accomodate ${token.uuid}`);

    // If the origin and destination scene are the same
    if ( token === destinationToken ) {
      await token.move({...destination, action: "displace"});
      return token;
    }

    // Otherwise teleport the token to the different scene
    destinationToken.updateSource(destination);

    // Create the new token
    const destinationTokenData = destinationToken.toObject();
    if ( destinationScene.tokens.has(token.id) ) delete destinationTokenData._id;
    else destinationTokenData._id = token.id;
    destinationToken = await foundry.documents.TokenDocument.implementation.create(destinationTokenData,
      {parent: destinationScene, keepId: true});
    if ( !destinationToken ) throw new Error("Failed to create Token in destination Scene");

    // Delete the old token
    await token.delete({replacements: {[token.id]: destinationToken.uuid}});

    return destinationToken;
  }

  /* ---------------------------------------- */

  /**
   * Get a destination for the Token within this Region that places the Token and its center point inside it.
   * @param {TokenDocument} token          The token that is teleported.
   * @returns {ElevatedPoint|undefined}    The destination, if there is one.
   */
  #getDestination(token) {
    const scene = this.parent;

    // Not all regions are valid teleportation destinations
    if ( this.polygons.length === 0 ) return;

    // Clamp the elevation of the token the elevation range of the destination region
    const elevation = Math.clamp(token._source.elevation, this.elevation.bottom, this.elevation.top);

    // Now we look for a random position within the destination region for the token
    let position;
    const {width, height, shape} = token._source;
    const pivot = token.getCenterPoint({x: 0, y: 0, elevation: 0, width, height, shape});

    // Find a random snapped position in square/hexagonal grids that place the token within the destination region
    const grid = scene.grid;
    if ( !grid.isGridless ) {

      // Identify token positions that place the token and its center point within the region
      const positions = [];
      const [i0, j0, i1, j1] = grid.getOffsetRange(new PIXI.Rectangle(
        0, 0, scene.dimensions.width, scene.dimensions.height).fit(this.bounds).pad(1));
      for ( let i = i0; i < i1; i++ ) {
        for ( let j = j0; j < j1; j++ ) {

          // Drop the token with its center point on the grid space center and snap the token position
          const center = grid.getCenterPoint({i, j});

          // The grid space center must be inside the region to be a valid drop target
          if ( !this.polygonTree.testPoint(center) ) continue;

          const position = token.getSnappedPosition({x: center.x - pivot.x, y: center.y - pivot.y,
            elevation: 0, width, height, shape});
          const x = position.x = Math.round(position.x);
          const y = position.y = Math.round(position.y);
          position.elevation = elevation;
          const data = {x, y, elevation, width, height, shape};

          // The center point of the token must be inside the region
          if ( !this.polygonTree.testPoint(token.getCenterPoint(data)) ) continue;

          // The token itself must be inside the region
          if ( !token.testInsideRegion(this, data) ) continue;

          positions.push(position);
        }
      }

      // Pick a random position
      if ( positions.length !== 0 ) position = positions[Math.floor(positions.length * Math.random())];
    }

    // If we found a snapped position, we're done. Otherwise, search for an unsnapped position.
    if ( position ) return position;

    // Calculate the areas of each triangle of the triangulation
    const {vertices, indices} = this.triangulation;
    const areas = [];
    let totalArea = 0;
    for ( let k = 0; k < indices.length; k += 3 ) {
      const i0 = indices[k] * 2;
      const i1 = indices[k + 1] * 2;
      const i2 = indices[k + 2] * 2;
      const x0 = vertices[i0];
      const y0 = vertices[i0 + 1];
      const x1 = vertices[i1];
      const y1 = vertices[i1 + 1];
      const x2 = vertices[i2];
      const y2 = vertices[i2 + 1];
      const area = Math.abs(((x1 - x0) * (y2 - y0)) - ((x2 - x0) * (y1 - y0))) / 2;
      totalArea += area;
      areas.push(area);
    }

    // Try to find a position that places the token inside the region
    for ( let n = 0; n < 10; n++ ) {

      // Choose a triangle randomly weighted by area
      let j;
      let a = totalArea * Math.random();
      for ( j = 0; j < areas.length - 1; j++ ) {
        a -= areas[j];
        if ( a < 0 ) break;
      }
      const k = 3 * j;
      const i0 = indices[k] * 2;
      const i1 = indices[k + 1] * 2;
      const i2 = indices[k + 2] * 2;
      const x0 = vertices[i0];
      const y0 = vertices[i0 + 1];
      const x1 = vertices[i1];
      const y1 = vertices[i1 + 1];
      const x2 = vertices[i2];
      const y2 = vertices[i2 + 1];

      // Select a random point within the triangle
      const r1 = Math.sqrt(Math.random());
      const r2 = Math.random();
      const s = r1 * (1 - r2);
      const t = r1 * r2;
      const x = Math.round(x0 + ((x1 - x0) * s) + ((x2 - x0) * t) - pivot.x);
      const y = Math.round(y0 + ((y1 - y0) * s) + ((y2 - y0) * t) - pivot.y);
      const data = {x, y, elevation, width, height, shape};

      // The center point of the token must be inside the region
      if ( !this.polygonTree.testPoint(token.getCenterPoint(data)) ) continue;

      // The token itself must be inside the region
      if ( !token.testInsideRegion(this, data) ) continue;

      return {x, y, elevation};
    }
  }

  /* -------------------------------------------- */
  /*  Socket Listeners and Handlers               */
  /* -------------------------------------------- */

  /**
   * Activate the Socket event listeners.
   * @param {io.Socket} socket    The active game socket
   * @internal
   */
  static _activateSocketListeners(socket) {
    socket.on("regionEvent", this.#onSocketEvent.bind(this));
  }

  /* -------------------------------------------- */

  /**
   * Handle the Region event received via the socket.
   * @param {RegionSocketEvent} socketEvent    The socket Region event
   */
  static async #onSocketEvent(socketEvent) {
    const {regionUuid, userId, eventName, eventData, eventDataUuids} = socketEvent;
    if ( userId === game.user.id ) return; // Already handled when the event was triggered
    const region = await fromUuid(regionUuid);
    if ( !region ) return;
    for ( const key of eventDataUuids ) {
      const uuid = foundry.utils.getProperty(eventData, key);
      const document = await fromUuid(uuid);
      foundry.utils.setProperty(eventData, key, document);
    }
    const event = {name: eventName, data: eventData, region, user: game.users.get(userId)};
    await region._handleEvent(event);
  }

  /* -------------------------------------------- */

  /**
   * Update the tokens of the given regions.
   * @param {RegionDocument[]} regions           The Regions documents, which must be all in the same Scene
   * @param {object} [options={}]                Additional options
   * @param {boolean} [options.deleted=false]    Are the Region documents deleted?
   */
  static async #updateTokens(regions, {deleted=false}={}) {
    if ( regions.length === 0 ) return;
    const updates = [];
    const scene = regions[0].parent;
    if ( deleted ) {
      const deletedRegionIds = new Set();
      const affectedTokens = new Set();
      for ( const region of regions ) {
        deletedRegionIds.add(region.id);
        for ( const token of region.tokens ) affectedTokens.add(token);
      }
      for ( const token of affectedTokens ) {
        const updatedRegionIds = token._source._regions.filter(id => !deletedRegionIds.has(id));
        if ( updatedRegionIds.length === token._source._regions.length ) continue;
        updates.push({_id: token.id, _regions: updatedRegionIds});
      }
    } else {
      for ( const token of scene.tokens ) {
        const regionIds = new Set(token._source._regions);
        let regionsChanged = false;
        for ( const region of regions ) {
          const inside = token.testInsideRegion(region);
          if ( inside === regionIds.has(region.id) ) continue;
          if ( inside ) regionIds.add(region.id);
          else regionIds.delete(region.id);
          regionsChanged = true;
        }
        if ( !regionsChanged ) continue;
        updates.push({_id: token.id, _regions: Array.from(regionIds).sort()});
      }
    }
    if ( updates.length === 0 ) return;
    await scene.updateEmbeddedDocuments("Token", updates, {diff: false, noHook: true});
  }

  /* -------------------------------------------- */

  /** @override */
  static async _onCreateOperation(documents, operation, user) {
    if ( user.isSelf ) {
      // noinspection ES6MissingAwait
      RegionDocument.#updateTokens(documents);
    }
    for ( const region of documents ) {
      const status = {active: true};
      region._handleEvent({name: REGION_EVENTS.BEHAVIOR_ACTIVATED, data: {}, region, user});
      if ( region.parent.isView ) {
        status.viewed = true;
        // noinspection ES6MissingAwait
        region._handleEvent({name: REGION_EVENTS.BEHAVIOR_VIEWED, data: {}, region, user});
      }
      // noinspection ES6MissingAwait
      /** @deprecated since v13 */
      region._handleEvent({name: "behaviorStatus", data: status, region, user});
    }
  }

  /* -------------------------------------------- */

  /** @override */
  static async _onUpdateOperation(documents, operation, user) {
    const changedRegions = [];
    for ( let i = 0; i < documents.length; i++ ) {
      const changed = operation.updates[i];
      if ( ("shapes" in changed) || ("elevation" in changed) ) changedRegions.push(documents[i]);
    }
    if ( user.isSelf ) {
      // noinspection ES6MissingAwait
      RegionDocument.#updateTokens(changedRegions);
    }
    for ( const region of changedRegions ) {
      // noinspection ES6MissingAwait
      region._handleEvent({
        name: REGION_EVENTS.REGION_BOUNDARY,
        data: {},
        region,
        user
      });
    }
  }

  /* -------------------------------------------- */

  /** @override */
  static async _onDeleteOperation(documents, operation, user) {
    if ( user.isSelf ) {
      // noinspection ES6MissingAwait
      RegionDocument.#updateTokens(documents, {deleted: true});
    }
    const regionEvents = [];
    for ( const region of documents ) {
      for ( const token of region.tokens ) {
        region.tokens.delete(token);
        regionEvents.push({
          name: REGION_EVENTS.TOKEN_EXIT,
          data: {token, movement: null},
          region,
          user
        });
      }
      region.tokens.clear();
    }
    for ( const region of documents ) {
      const status = {active: false};
      if ( region.parent.isView ) {
        status.viewed = false;
        regionEvents.push({name: REGION_EVENTS.BEHAVIOR_UNVIEWED, data: {}, region, user});
      }
      regionEvents.push({name: REGION_EVENTS.BEHAVIOR_DEACTIVATED, data: {}, region, user});
      /** @deprecated since v13 */
      regionEvents.push({name: "behaviorStatus", data: status, region, user});
    }
    for ( const event of regionEvents ) {
      // noinspection ES6MissingAwait
      event.region._handleEvent(event);
    }
  }

  /* -------------------------------------------- */

  /**
   * Trigger the Region event.
   * @param {string} eventName        The event name
   * @param {object} eventData        The event data
   * @returns {Promise<void>}
   * @internal
   */
  async _triggerEvent(eventName, eventData) {
    const event = {name: eventName, data: eventData, region: this, user: game.user};

    // Serialize Documents in the event data as UUIDs
    eventData = foundry.utils.deepClone(eventData);
    const eventDataUuids = [];
    const serializeDocuments = (object, key, path=key) => {
      const value = object[key];
      if ( (value === null) || (typeof value !== "object") ) return;
      if ( !value.constructor || (value.constructor === Object) ) {
        for ( const key in value ) serializeDocuments(value, key, `${path}.${key}`);
      } else if ( Array.isArray(value) ) {
        for ( let i = 0; i < value.length; i++ ) serializeDocuments(value, i, `${path}.${i}`);
      } else if ( value instanceof foundry.abstract.Document ) {
        object[key] = value.uuid;
        eventDataUuids.push(path);
      }
    };
    for ( const key in eventData ) serializeDocuments(eventData, key);

    // Emit socket event
    game.socket.emit("regionEvent", {
      regionUuid: this.uuid,
      userId: game.user.id,
      eventName,
      eventData,
      eventDataUuids
    });

    // Handle event for the current user immediately
    await this._handleEvent(event);
  }

  /* -------------------------------------------- */

  /**
   * Handle the Region event.
   * @param {RegionEvent} event    The Region event
   * @returns {Promise<void>}
   * @internal
   */
  async _handleEvent(event) {
    const results = await Promise.allSettled(this.behaviors.filter(b => !b.disabled)
      .map(b => b._handleRegionEvent(event)));
    for ( const result of results ) {
      if ( result.status === "rejected" ) console.error(result.reason);
    }
  }

  /* -------------------------------------------- */
  /*  Database Event Handlers                     */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _onCreateDescendantDocuments(parent, collection, documents, data, options, userId) {
    super._onCreateDescendantDocuments(parent, collection, documents, data, options, userId);
    if ( collection !== "behaviors" ) return;

    // Trigger events
    const user = game.users.get(userId);
    for ( let i = 0; i < documents.length; i++ ) {
      const behavior = documents[i];
      if ( behavior.disabled ) continue;

      // Trigger status event
      behavior._handleRegionEvent({name: REGION_EVENTS.BEHAVIOR_ACTIVATED, data: {}, region: this, user});
      const status = {active: true};
      if ( this.parent.isView ) {
        status.viewed = true;
        behavior._handleRegionEvent({name: REGION_EVENTS.BEHAVIOR_VIEWED, data: {}, region: this, user});
      }
      /** @deprecated since v13 */
      behavior._handleRegionEvent({name: "behaviorStatus", data: status, region: this, user});

      // Trigger enter events
      for ( const token of this.tokens ) {
        const deleted = !this.parent.tokens.has(token.id);
        if ( deleted ) continue;
        behavior._handleRegionEvent({
          name: REGION_EVENTS.TOKEN_ENTER,
          data: {token, movement: null},
          region: this,
          user
        });
      }
    }
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onUpdateDescendantDocuments(parent, collection, documents, changes, options, userId) {
    super._onUpdateDescendantDocuments(parent, collection, documents, changes, options, userId);
    if ( collection !== "behaviors" ) return;

    // Trigger events
    const user = game.users.get(userId);
    for ( let i = 0; i < documents.length; i++ ) {
      const disabled = changes[i].disabled;
      if ( disabled === undefined ) continue;
      const behavior = documents[i];

      // Trigger exit events
      if ( disabled ) {
        for ( const token of this.tokens ) {
          behavior._handleRegionEvent({
            name: REGION_EVENTS.TOKEN_EXIT,
            data: {token, movement: null},
            region: this,
            user
          });
        }
      }

      // Triger status event
      if ( disabled ) {
        if ( this.parent.isView ) {
          behavior._handleRegionEvent({name: REGION_EVENTS.BEHAVIOR_UNVIEWED, data: {}, region: this, user});
        }
        behavior._handleRegionEvent({name: REGION_EVENTS.BEHAVIOR_DEACTIVATED, data: {}, region: this, user});
      } else {
        behavior._handleRegionEvent({name: REGION_EVENTS.BEHAVIOR_ACTIVATED, data: {}, region: this, user});
        if ( this.parent.isView ) {
          behavior._handleRegionEvent({name: REGION_EVENTS.BEHAVIOR_VIEWED, data: {}, region: this, user});
        }
      }
      const status = {active: !disabled};
      if ( this.parent.isView ) status.viewed = !disabled;
      /** @deprecated since v13 */
      behavior._handleRegionEvent({name: "behaviorStatus", data: status, region: this, user});

      // Trigger enter events
      if ( !disabled ) {
        for ( const token of this.tokens ) {
          const deleted = !this.parent.tokens.has(token.id);
          if ( deleted ) continue;
          behavior._handleRegionEvent({
            name: REGION_EVENTS.TOKEN_ENTER,
            data: {token, movement: null},
            region: this,
            user
          });
        }
      }
    }
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onDeleteDescendantDocuments(parent, collection, documents, ids, options, userId) {
    super._onDeleteDescendantDocuments(parent, collection, ids, options, userId);
    if ( collection !== "behaviors" ) return;

    // Trigger events
    const user = game.users.get(userId);
    for ( let i = 0; i < documents.length; i++ ) {
      const behavior = documents[i];
      if ( behavior.disabled ) continue;

      // Trigger exit events
      for ( const token of this.tokens ) {
        const deleted = !this.parent.tokens.has(token.id);
        if ( deleted ) continue;
        behavior._handleRegionEvent({
          name: REGION_EVENTS.TOKEN_EXIT,
          data: {token, movement: null},
          region: this,
          user
        });
      }

      // Trigger status event
      const status = {active: false};
      if ( this.parent.isView ) {
        status.viewed = false;
        behavior._handleRegionEvent({name: REGION_EVENTS.BEHAVIOR_UNVIEWED, data: {}, region: this, user});
      }
      behavior._handleRegionEvent({name: REGION_EVENTS.BEHAVIOR_DEACTIVATED, data: {}, region: this, user});
      /** @deprecated since v13 */
      behavior._handleRegionEvent({name: "behaviorStatus", data: status, region: this, user});
    }
  }
}

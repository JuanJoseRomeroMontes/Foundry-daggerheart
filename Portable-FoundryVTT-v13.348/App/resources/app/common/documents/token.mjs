import Document from "../abstract/document.mjs";
import BaseScene from "./scene.mjs";
import {mergeObject} from "../utils/helpers.mjs";
import * as CONST from "../constants.mjs";
import {GRID_SNAPPING_MODES, TOKEN_SHAPES} from "../constants.mjs";
import * as fields from "../data/fields.mjs";
import {LightData, TextureData} from "../data/data.mjs";

/**
 * @import {Point, ElevatedPoint, DeepReadonly} from "../_types.mjs";
 * @import {TokenShapeType} from "../constants.mjs";
 * @import {TokenHexagonalOffsetsData, TokenHexagonalShapeData, TokenDimensions, TokenPosition} from "./_types.mjs";
 * @import {GridOffset2D, GridOffset3D} from "../grid/_types.mjs";
 * @import {TokenData} from "./_types.mjs";
 * @import {SquareGrid} from "../grid/_module.mjs";
 * @import {DataModelUpdateOptions, DocumentPermissionTest} from "@common/abstract/_types.mjs";
 */

/**
 * The Token Document.
 * Defines the DataSchema and common behaviors for a Token which are shared between both client and server.
 * @extends {Document<TokenData>}
 * @mixes TokenData
 * @category Documents
 */
export default class BaseToken extends Document {

  /* -------------------------------------------- */
  /*  Model Configuration                         */
  /* -------------------------------------------- */

  /** @inheritdoc */
  static metadata = Object.freeze(mergeObject(super.metadata, {
    name: "Token",
    collection: "tokens",
    label: "DOCUMENT.Token",
    labelPlural: "DOCUMENT.Tokens",
    isEmbedded: true,
    embedded: {
      ActorDelta: "delta"
    },
    permissions: {
      create: "TOKEN_CREATE",
      update: this.#canUpdate,
      delete: "TOKEN_DELETE"
    },
    schemaVersion: "13.341"
  }, {inplace: false}));

  /* -------------------------------------------- */

  /** @inheritdoc */
  static defineSchema() {
    const documents = foundry.documents;
    return {
      _id: new fields.DocumentIdField(),
      name: new fields.StringField({required: true, blank: true, textSearch: true}),
      displayName: new fields.NumberField({required: true, initial: CONST.TOKEN_DISPLAY_MODES.NONE,
        choices: Object.values(CONST.TOKEN_DISPLAY_MODES),
        validationError: "must be a value in CONST.TOKEN_DISPLAY_MODES"
      }),
      actorId: new fields.ForeignDocumentField(documents.BaseActor, {idOnly: true}),
      actorLink: new fields.BooleanField(),
      delta: new ActorDeltaField(documents.BaseActorDelta),
      width: new fields.NumberField({required: true, nullable: false, positive: true, initial: 1}),
      height: new fields.NumberField({required: true, nullable: false, positive: true, initial: 1}),
      texture: new TextureData({}, {initial: {src: () => this.DEFAULT_ICON, anchorX: 0.5, anchorY: 0.5, fit: "contain",
        alphaThreshold: 0.75}, wildcard: true}),
      shape: new fields.NumberField({initial: CONST.TOKEN_SHAPES.RECTANGLE_1,
        choices: Object.values(CONST.TOKEN_SHAPES)}),
      x: new fields.NumberField({required: true, integer: true, nullable: false, initial: 0}),
      y: new fields.NumberField({required: true, integer: true, nullable: false, initial: 0}),
      elevation: new fields.NumberField({required: true, nullable: false, initial: 0}),
      sort: new fields.NumberField({required: true, integer: true, nullable: false, initial: 0}),
      locked: new fields.BooleanField(),
      lockRotation: new fields.BooleanField(),
      rotation: new fields.AngleField(),
      alpha: new fields.AlphaField(),
      hidden: new fields.BooleanField(),
      disposition: new fields.NumberField({required: true, choices: Object.values(CONST.TOKEN_DISPOSITIONS),
        initial: CONST.TOKEN_DISPOSITIONS.HOSTILE,
        validationError: "must be a value in CONST.TOKEN_DISPOSITIONS"
      }),
      displayBars: new fields.NumberField({required: true, choices: Object.values(CONST.TOKEN_DISPLAY_MODES),
        initial: CONST.TOKEN_DISPLAY_MODES.NONE,
        validationError: "must be a value in CONST.TOKEN_DISPLAY_MODES"
      }),
      bar1: new fields.SchemaField({
        attribute: new fields.StringField({required: true, nullable: true, blank: false,
          initial: () => game?.system.primaryTokenAttribute || null})
      }),
      bar2: new fields.SchemaField({
        attribute: new fields.StringField({required: true, nullable: true, blank: false,
          initial: () => game?.system.secondaryTokenAttribute || null})
      }),
      light: new fields.EmbeddedDataField(LightData),
      sight: new fields.SchemaField({
        enabled: new fields.BooleanField({initial: data => Number(data?.sight?.range) > 0}),
        range: new fields.NumberField({required: true, nullable: true, min: 0, step: 0.01, initial: 0}),
        angle: new fields.AngleField({initial: 360, normalize: false}),
        visionMode: new fields.StringField({required: true, blank: false, initial: "basic"}),
        color: new fields.ColorField(),
        attenuation: new fields.AlphaField({initial: 0.1}),
        brightness: new fields.NumberField({required: true, nullable: false, initial: 0, min: -1, max: 1}),
        saturation: new fields.NumberField({required: true, nullable: false, initial: 0, min: -1, max: 1}),
        contrast: new fields.NumberField({required: true, nullable: false, initial: 0, min: -1, max: 1})
      }),
      detectionModes: new fields.ArrayField(new fields.SchemaField({
        id: new fields.StringField(),
        enabled: new fields.BooleanField({initial: true}),
        range: new fields.NumberField({required: true, min: 0, step: 0.01})
      }), {
        validate: BaseToken.#validateDetectionModes
      }),
      occludable: new fields.SchemaField({
        radius: new fields.NumberField({required: true, nullable: false, min: 0, step: 0.01, initial: 0})
      }),
      ring: new fields.SchemaField({
        enabled: new fields.BooleanField(),
        colors: new fields.SchemaField({
          ring: new fields.ColorField(),
          background: new fields.ColorField()
        }),
        effects: new fields.NumberField({required: true, nullable: false, integer: true, initial: 1, min: 0,
          max: 8388607}),
        subject: new fields.SchemaField({
          scale: new fields.NumberField({required: true, nullable: false, initial: 1, min: 0.5}),
          texture: new fields.FilePathField({categories: ["IMAGE"]})
        })
      }),
      turnMarker: new fields.SchemaField({
        mode: new fields.NumberField({required: true, choices: Object.values(CONST.TOKEN_TURN_MARKER_MODES),
          initial: CONST.TOKEN_TURN_MARKER_MODES.DEFAULT,
          validationError: "must be a value in CONST.TOKEN_TURN_MARKER_MODES"
        }),
        animation: new fields.StringField({required: true, blank: false, nullable: true}),
        src: new fields.FilePathField({categories: ["IMAGE", "VIDEO"]}),
        disposition: new fields.BooleanField()
      }),
      movementAction: new fields.StringField({required: true, blank: false, nullable: true, initial: null,
        choices: CONFIG.Token.movement?.actions}),
      /** @internal */
      _movementHistory: new fields.ArrayField(new fields.SchemaField({
        x: new fields.NumberField({required: true, nullable: false, integer: true, initial: undefined}),
        y: new fields.NumberField({required: true, nullable: false, integer: true, initial: undefined}),
        elevation: new fields.NumberField({required: true, nullable: false, initial: undefined}),
        width: new fields.NumberField({required: true, nullable: false, positive: true, initial: undefined}),
        height: new fields.NumberField({required: true, nullable: false, positive: true, initial: undefined}),
        shape: new fields.NumberField({required: true, initial: undefined, choices: Object.values(CONST.TOKEN_SHAPES)}),
        action: new fields.StringField({required: true, blank: false, initial: undefined}),
        terrain: CONFIG.Token.movement?.TerrainData ? new fields.EmbeddedDataField(CONFIG.Token.movement.TerrainData,
          {nullable: true, initial: undefined}) : new fields.ObjectField({nullable: true, initial: undefined}),
        snapped: new fields.BooleanField({initial: undefined}),
        explicit: new fields.BooleanField({initial: undefined}),
        checkpoint: new fields.BooleanField({initial: undefined}),
        intermediate: new fields.BooleanField({initial: undefined}),
        userId: new fields.ForeignDocumentField(documents.BaseUser, {idOnly: true, required: true, initial: undefined}),
        movementId: new fields.StringField({required: true, blank: false, initial: undefined,
          validate: value => {
            if ( !foundry.data.validators.isValidId(value) ) throw new Error("must be a valid 16-character alphanumeric ID");
          }
        }),
        cost: new fields.NumberField({required: true, nullable: true, min: 0, initial: undefined})
      })),
      /** @internal */
      _regions: new fields.ArrayField(new fields.ForeignDocumentField(documents.BaseRegion, {idOnly: true})),
      flags: new fields.DocumentFlagsField()
    };
  }

  /* -------------------------------------------- */

  /** @override */
  static LOCALIZATION_PREFIXES = ["DOCUMENT", "TOKEN"];

  /**
   * The fields of the data model for which changes count as a movement action.
   * @type {Readonly<["x", "y", "elevation", "width", "height", "shape"]>}
   * @readonly
   */
  static MOVEMENT_FIELDS = Object.freeze(["x", "y", "elevation", "width", "height", "shape"]);

  /* -------------------------------------------- */

  /**
   * Are the given positions equal?
   * @param {TokenPosition} position1
   * @param {TokenPosition} position2
   * @returns {boolean}
   */
  static arePositionsEqual(position1, position2) {
    return (position1 === position2) || this.MOVEMENT_FIELDS.every(k => position1[k] === position2[k]);
  }

  /* -------------------------------------------- */

  /**
   * Validate the structure of the detection modes array
   * @param {object[]} modes    Configured detection modes
   * @throws                    An error if the array is invalid
   */
  static #validateDetectionModes(modes) {
    const seen = new Set();
    for ( const mode of modes ) {
      if ( mode.id === "" ) continue;
      if ( seen.has(mode.id) ) {
        throw new Error(`may not have more than one configured detection mode of type "${mode.id}"`);
      }
      seen.add(mode.id);
    }
  }

  /* -------------------------------------------- */

  /**
   * The default icon used for newly created Token documents
   * @type {string}
   */
  static DEFAULT_ICON = CONST.DEFAULT_TOKEN;

  /* -------------------------------------------- */

  /**
   * Is a User able to update an existing Token? One can update a Token embedded in a World Scene if they own the
   * corresponding Actor.
   * @type {DocumentPermissionTest}
   */
  static #canUpdate(user, doc, data) {
    if ( user.isGM ) return true;                     // GM users can do anything
    if ( doc.inCompendium ) return doc.testUserPermission(user, "OWNER");
    if ( doc.actor ) {                                // You can update Tokens for Actors you control
      return doc.actor.testUserPermission(user, "OWNER");
    }
    return !doc.actorId;                              // Actor-less Tokens can be updated by anyone
  }

  /* -------------------------------------------- */
  /*  Data Management                             */
  /* -------------------------------------------- */

  /**
   * Prepare changes to a descendent delta collection.
   * @param {object} changes                  Candidate source changes.
   * @param {DataModelUpdateOptions} options  Options which determine how the new data is merged.
   * @internal
   */
  _prepareDeltaUpdate(changes={}, options={}) {
    if ( changes.delta && this.delta ) this.delta._prepareDeltaUpdate(changes.delta, options);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  updateSource(changes={}, options={}) {
    this._prepareDeltaUpdate(changes, options);
    return super.updateSource(changes, options);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  clone(data={}, context={}) {
    const clone = super.clone(data, context);
    if ( (clone instanceof Promise) || clone.actorLink ) return clone;
    // Extra care needs to be taken when temporarily cloning an unlinked TokenDocument.
    // Preparation of the clone's synthetic Actor using the embedded ActorDelta can easily enter an infinite loop.
    // In this case we need to eagerly evaluate the clone ActorDelta instance so it is available immediately.
    clone.delta; // Resolve lazy getter
    return clone;
  }

  /* -------------------------------------------- */
  /*  Token Methods                               */
  /* -------------------------------------------- */

  /**
   * Get the snapped position of the Token.
   * @param {Partial<ElevatedPoint & TokenDimensions>} [data] The position and dimensions
   * @returns {ElevatedPoint}                                 The snapped position
   */
  getSnappedPosition(data={}) {
    const grid = this.parent?.grid ?? BaseScene.defaultGrid;
    const x = data.x ?? this.x;
    const y = data.y ?? this.y;
    let elevation = data.elevation ?? this.elevation;
    const unsnapped = {x, y, elevation};

    // Gridless grid
    if ( grid.isGridless ) return unsnapped;

    // Get position and elevation
    elevation = Math.round(elevation / grid.distance) * grid.distance;

    // Round width and height to nearest multiple of 0.5
    const width = Math.round((data.width ?? this.width) * 2) / 2;
    const height = Math.round((data.height ?? this.height) * 2) / 2;
    const shape = data.shape ?? this.shape;

    // Square grid
    let snapped;
    if ( grid.isSquare ) snapped = BaseToken.#getSnappedPositionInSquareGrid(grid, unsnapped, width, height);

    // Hexagonal grid
    else snapped = BaseToken.#getSnappedPositionInHexagonalGrid(grid, unsnapped, width, height, shape);
    return {x: snapped.x, y: snapped.y, elevation};
  }

  /* -------------------------------------------- */

  /**
   * Get the snapped position on a square grid.
   * @param {SquareGrid} grid     The square grid
   * @param {Point} position      The position that is snapped or grid offset
   * @param {number} width        The width in grid spaces (positive)
   * @param {number} height       The height in grid spaces (positive)
   * @returns {Point}             The snapped position
   */
  static #getSnappedPositionInSquareGrid(grid, position, width, height) {

    // Small tokens snap to any vertex of the subgrid with resolution 4
    // where the token is fully contained within the grid space
    const isSmall = ((width === 0.5) && (height <= 1)) || ((width <= 1) && (height === 0.5));
    if ( isSmall ) {
      let x = position.x / grid.size;
      let y = position.y / grid.size;
      if ( width === 1 ) x = Math.round(x);
      else {
        x = Math.floor(x * 8);
        const k = ((x % 8) + 8) % 8;
        if ( k >= 6 ) x = Math.ceil(x / 8);
        else if ( k === 5 ) x = Math.floor(x / 8) + 0.5;
        else x = Math.round(x / 2) / 4;
      }
      if ( height === 1 ) y = Math.round(y);
      else {
        y = Math.floor(y * 8);
        const k = ((y % 8) + 8) % 8;
        if ( k >= 6 ) y = Math.ceil(y / 8);
        else if ( k === 5 ) y = Math.floor(y / 8) + 0.5;
        else y = Math.round(y / 2) / 4;
      }
      x *= grid.size;
      y *= grid.size;
      return {x, y};
    }

    const M = GRID_SNAPPING_MODES;
    const modeX = Number.isInteger(width) ? M.VERTEX : M.VERTEX | M.EDGE_MIDPOINT | M.CENTER;
    const modeY = Number.isInteger(height) ? M.VERTEX : M.VERTEX | M.EDGE_MIDPOINT | M.CENTER;
    if ( modeX === modeY ) return grid.getSnappedPoint(position, {mode: modeX});
    return {
      x: grid.getSnappedPoint(position, {mode: modeX}).x,
      y: grid.getSnappedPoint(position, {mode: modeY}).y
    };
  }

  /* -------------------------------------------- */

  /**
   * Get the snapped position on a hexagonal grid.
   * @param {SquareGrid} grid       The hexagonal grid
   * @param {Point} position        The position that is snapped or grid offset
   * @param {number} width          The width in grid spaces (positive)
   * @param {number} height         The height in grid spaces (positive)
   * @param {TokenShapeType} shape  The shape (one of {@link CONST.TOKEN_SHAPES})
   * @returns {Point}               The snapped position
   */
  static #getSnappedPositionInHexagonalGrid(grid, position, width, height, shape) {

    // Hexagonal shape
    const hexagonalShape = BaseToken.#getHexagonalShape(width, height, shape, grid.columns);
    if ( hexagonalShape ) {
      const offsetX = hexagonalShape.anchor.x * grid.sizeX;
      const offsetY = hexagonalShape.anchor.y * grid.sizeY;
      position = grid.getCenterPoint({x: position.x + offsetX, y: position.y + offsetY});
      position.x -= offsetX;
      position.y -= offsetY;
      return position;
    }

    // Rectagular shape
    const M = GRID_SNAPPING_MODES;
    return grid.getSnappedPoint(position, {mode: M.CENTER | M.VERTEX | M.CORNER | M.SIDE_MIDPOINT});
  }

  /* -------------------------------------------- */

  /**
   * Get the top-left grid offset of the Token.
   * @param {Partial<ElevatedPoint & TokenDimensions>} [data]      The position and dimensions
   * @returns {GridOffset3D}                                       The top-left grid offset
   * @internal
   */
  _positionToGridOffset(data={}) {
    let x = Math.round(data.x ?? this.x);
    let y = Math.round(data.y ?? this.y);
    const elevation = data.elevation ?? this.elevation;

    // Gridless grid
    const grid = this.parent?.grid ?? BaseScene.defaultGrid;
    if ( grid.isGridless ) return grid.getOffset({x, y, elevation});

    // Round width and height to nearest multiple of 0.5
    const width = Math.round((data.width ?? this.width) * 2) / 2;
    const height = Math.round((data.height ?? this.height) * 2) / 2;

    // Square grid
    if ( grid.isSquare ) {
      x += (grid.size * (Number.isInteger(width) ? 0.5 : 0.25));
      y += (grid.size * (Number.isInteger(height) ? 0.5 : 0.25));
    }

    // Hexagonal grid
    else {
      const {anchor} = BaseToken._getHexagonalOffsets(width, height, data.shape ?? this.shape, grid.columns);
      x += (grid.sizeX * anchor.x);
      y += (grid.sizeY * anchor.y);
    }

    return grid.getOffset({x, y, elevation});
  }

  /* -------------------------------------------- */

  /**
   * Get the position of the Token from the top-left grid offset.
   * @param {GridOffset3D } offset                 The top-left grid offset
   * @param {Partial<TokenDimensions>} [data]      The dimensions that override the current dimensions
   * @returns {ElevatedPoint}                      The snapped position
   * @internal
   */
  _gridOffsetToPosition(offset, data={}) {
    const grid = this.parent?.grid ?? BaseScene.defaultGrid;

    // Gridless grid
    if ( grid.isGridless ) return {x: offset.j, y: offset.i, elevation: offset.k / grid.size * grid.distance};

    // Round width and height to nearest multiple of 0.5
    const width = Math.round((data.width ?? this.width) * 2) / 2;
    const height = Math.round((data.height ?? this.height) * 2) / 2;

    let x;
    let y;

    // Square grid
    if ( grid.isSquare ) {
      x = offset.j;
      y = offset.i;
      const isSmall = ((width === 0.5) && (height <= 1)) || ((width <= 1) && (height === 0.5));
      if ( isSmall ) {
        if ( width === 0.5 ) x += 0.25;
        if ( height === 0.5 ) y += 0.25;
      }
      x *= grid.size;
      y *= grid.size;
    }

    // Hexagonal grid
    else {
      const {anchor} = BaseToken._getHexagonalOffsets(width, height, data.shape ?? this.shape, grid.columns);
      const position = grid.getCenterPoint(offset);
      x = position.x - (anchor.x * grid.sizeX);
      y = position.y - (anchor.y * grid.sizeY);
    }

    return {x, y, elevation: offset.k * grid.distance};
  }

  /* -------------------------------------------- */

  /**
   * Get the width and height of the Token in pixels.
   * @param {Partial<{width: number; height: number}>} [data] The width and/or height in grid units (must be positive)
   * @returns {{width: number; height: number}} The width and height in pixels
   */
  getSize(data={}) {
    let width = data.width ?? this.width;
    let height = data.height ?? this.height;

    const grid = this.parent?.grid ?? BaseScene.defaultGrid;
    if ( grid.isHexagonal ) {
      if ( grid.columns ) width = (0.75 * Math.floor(width)) + (0.5 * (width % 1)) + 0.25;
      else height = (0.75 * Math.floor(height)) + (0.5 * (height % 1)) + 0.25;
    }

    width *= grid.sizeX;
    height *= grid.sizeY;
    return {width, height};
  }

  /* -------------------------------------------- */

  /**
   * Get the center point of the Token.
   * @param {Partial<ElevatedPoint & TokenDimensions>} [data] The position and dimensions
   * @returns {ElevatedPoint}                                 The center point
   */
  getCenterPoint(data={}) {
    const x = data.x ?? this.x;
    const y = data.y ?? this.y;
    const elevation = data.elevation ?? this.elevation;

    // Hexagonal shape
    const grid = this.parent?.grid ?? BaseScene.defaultGrid;
    if ( grid.isHexagonal ) {
      const width = data.width ?? this.width;
      const height = data.height ?? this.height;
      const hexagonalShape = BaseToken.#getHexagonalShape(width, height, data.shape ?? this.shape, grid.columns);
      if ( hexagonalShape ) {
        const center = hexagonalShape.center;
        return {x: x + (center.x * grid.sizeX), y: y + (center.y * grid.sizeY), elevation};
      }

      // No hexagonal shape for this combination of shape type, width, and height.
      // Fallback to the center of the rectangle.
    }

    // Rectangular shape
    const {width, height} = this.getSize(data);
    return {x: x + (width / 2), y: y + (height / 2), elevation};
  }

  /* -------------------------------------------- */

  /**
   * Get the grid space polygon of the Token.
   * Returns undefined in gridless grids because there are no grid spaces.
   * @param {Partial<TokenDimensions>} [data] The dimensions
   * @returns {Point[]|void}                  The grid space polygon or undefined if gridless
   */
  getGridSpacePolygon(data={}) {
    const grid = this.parent?.grid ?? BaseScene.defaultGrid;

    // Gridless grid
    if ( grid.isGridless ) return;

    // Hexagonal shape
    if ( grid.isHexagonal ) {
      const width = data.width ?? this.width;
      const height = data.height ?? this.height;
      const hexagonalShape = BaseToken.#getHexagonalShape(width, height, data.shape ?? this.shape, grid.columns);
      if ( hexagonalShape ) {
        const points = [];
        for ( let i = 0; i < hexagonalShape.points.length; i += 2 ) {
          points.push({x: hexagonalShape.points[i] * grid.sizeX, y: hexagonalShape.points[i + 1] * grid.sizeY});
        }
        return points;
      }

      // No hexagonal shape for this combination of shape type, width, and height.
      // Fallback to rectangular shape.
    }

    // Rectangular shape
    const {width, height} = this.getSize(data);
    return [{x: 0, y: 0}, {x: width, y: 0}, {x: width, y: height}, {x: 0, y: height}];
  }

  /* -------------------------------------------- */

  /**
   * Get the offsets of grid spaces that are occupied by this Token at the current or given position.
   * The grid spaces the Token occupies are those that are covered by the Token's shape in the snapped position.
   * Returns an empty array in gridless grids.
   * @param {Partial<Point & TokenDimensions>} [data] The position and dimensions
   * @returns {GridOffset2D[]}                        The offsets of occupied grid spaces
   */
  getOccupiedGridSpaceOffsets(data={}) {
    const offsets = [];
    const grid = this.parent?.grid ?? BaseScene.defaultGrid;

    // No grid spaces in gridless grids
    if ( grid.isGridless ) return offsets;

    // Get the top-left grid offset
    const {i: i0, j: j0} = this._positionToGridOffset(data);

    // Round width and height to nearest multiple of 0.5
    const width = Math.round((data.width ?? this.width) * 2) / 2;
    const height = Math.round((data.height ?? this.height) * 2) / 2;

    // Square grid
    if ( grid.isSquare ) {
      const i1 = i0 + Math.ceil(height);
      const j1 = j0 + Math.ceil(width);
      for ( let i = i0; i < i1; i++ ) {
        for ( let j = j0; j < j1; j++ ) {
          offsets.push({i, j});
        }
      }
    }

    // Hexagonal grid
    else {
      const {even: offsetsEven, odd: offsetsOdd} = BaseToken._getHexagonalOffsets(
        width, height, data.shape ?? this.shape, grid.columns);
      const isEven = ((grid.columns ? j0 : i0) % 2 === 0) === grid.even;
      for ( const {i: di, j: dj} of (isEven ? offsetsEven : offsetsOdd) ) {
        offsets.push({i: i0 + di, j: j0 + dj});
      }
    }

    return offsets;
  }

  /* -------------------------------------------- */
  /*  Hexagonal Helpers                           */
  /* -------------------------------------------- */

  /**
   * The cache of hexagonal offsets.
   * @type {Map<string, DeepReadonly<TokenHexagonalOffsetsData>>}
   */
  static #hexagonalOffsets = new Map();

  /* -------------------------------------------- */

  /**
   * Get the hexagonal offsets given the type, width, and height.
   * @param {number} width                                 The width of the Token (positive)
   * @param {number} height                                The height of the Token (positive)
   * @param {TokenShapeType} shape                         The shape (one of {@link CONST.TOKEN_SHAPES})
   * @param {boolean} columns                              Column-based instead of row-based hexagonal grid?
   * @returns {DeepReadonly<TokenHexagonalOffsetsData>}    The hexagonal offsets
   * @internal
   */
  static _getHexagonalOffsets(width, height, shape, columns) {
    // TODO: can we set a max of 2^13 on width and height so that we may use an integer key?
    const key = `${width},${height},${shape}${columns ? "C" : "R"}`;
    let offsets = BaseToken.#hexagonalOffsets.get(key);
    if ( offsets ) return offsets;

    let anchor;
    let data = BaseToken.#getHexagonalShape(width, height, shape, columns);

    // Hexagonal shape
    if ( data ) anchor = data.anchor;

    // Fallback for non-hexagonal shapes
    else {
      if ( columns ) {
        height += 0.5;
        width = Math.round(width);
        if ( width === 1 ) height = Math.floor(height);
        else if ( height === 1 ) height += 0.5;
      } else {
        width += 0.5;
        height = Math.round(height);
        if ( height === 1 ) width = Math.floor(width);
        else if ( width === 1 ) width += 0.5;
      }
      data = BaseToken.#getHexagonalShape(width, height, TOKEN_SHAPES.RECTANGLE_1, columns);
      anchor = {x: data.anchor.x - 0.25, y: data.anchor.y - 0.25};
    }

    // Cache the offsets
    offsets = foundry.utils.deepFreeze({
      even: data.offsets.even,
      odd: data.offsets.odd,
      anchor
    });
    BaseToken.#hexagonalOffsets.set(key, offsets);
    return offsets;
  }

  /* -------------------------------------------- */

  /**
   * The cache of hexagonal shapes.
   * @type {Map<string, DeepReadonly<TokenHexagonalShapeData>>}
   */
  static #hexagonalShapes = new Map();

  /* -------------------------------------------- */

  /**
   * Get the hexagonal shape given the type, width, and height.
   * @param {number} width                                    The width of the Token (positive)
   * @param {number} height                                   The height of the Token (positive)
   * @param {TokenShapeType} shape                            The shape (one of {@link CONST.TOKEN_SHAPES})
   * @param {boolean} columns                                 Column-based instead of row-based hexagonal grid?
   * @returns {DeepReadonly<TokenHexagonalShapeData>|null}    The hexagonal shape or null if there is no shape
   *                                                          for the given combination of arguments
   */
  static #getHexagonalShape(width, height, shape, columns) {
    if ( !Number.isInteger(width * 2) || !Number.isInteger(height * 2) ) return null;

    // TODO: can we set a max of 2^13 on width and height so that we may use an integer key?
    const key = `${width},${height},${shape}${columns ? "C" : "R"}`;
    let data = BaseToken.#hexagonalShapes.get(key);
    if ( data ) return data;

    // Hexagon symmetry
    if ( columns ) {
      const rowData = BaseToken.#getHexagonalShape(height, width, shape, false);
      if ( !rowData ) return null;

      // Transpose the offsets/points of the shape in row orientation
      const offsets = {even: [], odd: []};
      for ( const {i, j} of rowData.offsets.even ) offsets.even.push({i: j, j: i});
      for ( const {i, j} of rowData.offsets.odd ) offsets.odd.push({i: j, j: i});
      offsets.even.sort(({i: i0, j: j0}, {i: i1, j: j1}) => (j0 - j1) || (i0 - i1));
      offsets.odd.sort(({i: i0, j: j0}, {i: i1, j: j1}) => (j0 - j1) || (i0 - i1));
      const points = [];
      for ( let i = rowData.points.length; i > 0; i -= 2 ) {
        points.push(rowData.points[i - 1], rowData.points[i - 2]);
      }
      data = {
        offsets,
        points,
        center: {x: rowData.center.y, y: rowData.center.x},
        anchor: {x: rowData.anchor.y, y: rowData.anchor.x}
      };
    }

    // Small hexagon
    else if ( (width === 0.5) && (height === 0.5) ) {
      data = {
        offsets: {even: [{i: 0, j: 0}], odd: [{i: 0, j: 0}]},
        points: [0.25, 0.0, 0.5, 0.125, 0.5, 0.375, 0.25, 0.5, 0.0, 0.375, 0.0, 0.125],
        center: {x: 0.25, y: 0.25},
        anchor: {x: 0.25, y: 0.25}
      };
    }

    // Normal hexagon
    else if ( (width === 1) && (height === 1) ) {
      data = {
        offsets: {even: [{i: 0, j: 0}], odd: [{i: 0, j: 0}]},
        points: [0.5, 0.0, 1.0, 0.25, 1, 0.75, 0.5, 1.0, 0.0, 0.75, 0.0, 0.25],
        center: {x: 0.5, y: 0.5},
        anchor: {x: 0.5, y: 0.5}
      };
    }

    // Hexagonal ellipse or trapezoid
    else if ( shape <= TOKEN_SHAPES.TRAPEZOID_2 ) {
      data = BaseToken.#createHexagonalEllipseOrTrapezoid(width, height, shape);
    }

    // Hexagonal rectangle
    else if ( shape <= TOKEN_SHAPES.RECTANGLE_2 ) {
      data = BaseToken.#createHexagonalRectangle(width, height, shape);
    }

    // Cache the shape
    if ( data ) {
      foundry.utils.deepFreeze(data);
      BaseToken.#hexagonalShapes.set(key, data);
    }
    return data;
  }

  /* -------------------------------------------- */

  /**
   * Create the row-based hexagonal ellipse/trapezoid given the type, width, and height.
   * @param {number} width                   The width of the Token (positive)
   * @param {number} height                  The height of the Token (positive)
   * @param {number} shape                   The shape type (must be ELLIPSE_1, ELLIPSE_1, TRAPEZOID_1, or TRAPEZOID_2)
   * @returns {TokenHexagonalShapeData|null} The hexagonal shape or null if there is no shape for the given combination
   *                                         of arguments
   */
  static #createHexagonalEllipseOrTrapezoid(width, height, shape) {
    if ( !Number.isInteger(width) || !Number.isInteger(height) ) return null;
    const points = [];
    let top;
    let bottom;
    switch ( shape ) {
      case TOKEN_SHAPES.ELLIPSE_1:
        if ( height >= 2 * width ) return null;
        top = Math.floor(height / 2);
        bottom = Math.floor((height - 1) / 2);
        break;
      case TOKEN_SHAPES.ELLIPSE_2:
        if ( height >= 2 * width ) return null;
        top = Math.floor((height - 1) / 2);
        bottom = Math.floor(height / 2);
        break;
      case TOKEN_SHAPES.TRAPEZOID_1:
        if ( height > width ) return null;
        top = height - 1;
        bottom = 0;
        break;
      case TOKEN_SHAPES.TRAPEZOID_2:
        if ( height > width ) return null;
        top = 0;
        bottom = height - 1;
        break;
    }
    const offsets = {even: [], odd: []};
    for ( let i = bottom; i > 0; i-- ) {
      for ( let j = 0; j < width - i; j++ ) {
        offsets.even.push({i: bottom - i, j: j + (((bottom & 1) + i + 1) >> 1)});
        offsets.odd.push({i: bottom - i, j: j + (((bottom & 1) + i) >> 1)});
      }
    }
    for ( let i = 0; i <= top; i++ ) {
      for ( let j = 0; j < width - i; j++ ) {
        offsets.even.push({i: bottom + i, j: j + (((bottom & 1) + i + 1) >> 1)});
        offsets.odd.push({i: bottom + i, j: j + (((bottom & 1) + i) >> 1)});
      }
    }
    let x = 0.5 * bottom;
    let y = 0.25;
    for ( let k = width - bottom; k--; ) {
      points.push(x, y);
      x += 0.5;
      y -= 0.25;
      points.push(x, y);
      x += 0.5;
      y += 0.25;
    }
    points.push(x, y);
    for ( let k = bottom; k--; ) {
      y += 0.5;
      points.push(x, y);
      x += 0.5;
      y += 0.25;
      points.push(x, y);
    }
    y += 0.5;
    for ( let k = top; k--; ) {
      points.push(x, y);
      x -= 0.5;
      y += 0.25;
      points.push(x, y);
      y += 0.5;
    }
    for ( let k = width - top; k--; ) {
      points.push(x, y);
      x -= 0.5;
      y += 0.25;
      points.push(x, y);
      x -= 0.5;
      y -= 0.25;
    }
    points.push(x, y);
    for ( let k = top; k--; ) {
      y -= 0.5;
      points.push(x, y);
      x -= 0.5;
      y -= 0.25;
      points.push(x, y);
    }
    y -= 0.5;
    for ( let k = bottom; k--; ) {
      points.push(x, y);
      x += 0.5;
      y -= 0.25;
      points.push(x, y);
      y -= 0.5;
    }
    return {
      offsets,
      points,
      // We use the centroid of the polygon for ellipse and trapzoid shapes
      center: foundry.utils.polygonCentroid(points),
      anchor: bottom % 2 ? {x: 0.0, y: 0.5} : {x: 0.5, y: 0.5}
    };
  }

  /* -------------------------------------------- */

  /**
   * Create the row-based hexagonal rectangle given the type, width, and height.
   * @param {number} width                      The width of the Token (positive)
   * @param {number} height                     The height of the Token (positive)
   * @param {TokenShapeType} shape              The shape type (must be RECTANGLE_1 or RECTANGLE_2)
   * @returns {TokenHexagonalShapeData|null}    The hexagonal shape or null if there is no shape
   *                                            for the given combination of arguments
   */
  static #createHexagonalRectangle(width, height, shape) {
    if ( (width < 1) || !Number.isInteger(height) ) return null;
    if ( (width === 1) && (height > 1) ) return null;
    if ( !Number.isInteger(width) && (height === 1) ) return null;
    const even = (shape === TOKEN_SHAPES.RECTANGLE_1) || (height === 1);
    const offsets = {even: [], odd: []};
    for ( let i = 0; i < height; i++) {
      const j0 = even ? 0 : (i + 1) & 1;
      const j1 = ((width + ((i & 1) * 0.5)) | 0) - (even ? (i & 1) : 0);
      for ( let j = j0; j < j1; j++ ) {
        offsets.even.push({i, j: j + (i & 1)});
        offsets.odd.push({i, j});
      }
    }
    let x = even ? 0.0 : 0.5;
    let y = 0.25;
    const points = [x, y];
    while ( x + 1 <= width ) {
      x += 0.5;
      y -= 0.25;
      points.push(x, y);
      x += 0.5;
      y += 0.25;
      points.push(x, y);
    }
    if ( x !== width ) {
      y += 0.5;
      points.push(x, y);
      x += 0.5;
      y += 0.25;
      points.push(x, y);
    }
    while ( y + 1.5 <= 0.75 * height ) {
      y += 0.5;
      points.push(x, y);
      x -= 0.5;
      y += 0.25;
      points.push(x, y);
      y += 0.5;
      points.push(x, y);
      x += 0.5;
      y += 0.25;
      points.push(x, y);
    }
    if ( y + 0.75 < 0.75 * height ) {
      y += 0.5;
      points.push(x, y);
      x -= 0.5;
      y += 0.25;
      points.push(x, y);
    }
    y += 0.5;
    points.push(x, y);
    while ( x - 1 >= 0 ) {
      x -= 0.5;
      y += 0.25;
      points.push(x, y);
      x -= 0.5;
      y -= 0.25;
      points.push(x, y);
    }
    if ( x !== 0 ) {
      y -= 0.5;
      points.push(x, y);
      x -= 0.5;
      y -= 0.25;
      points.push(x, y);
    }
    while ( y - 1.5 > 0 ) {
      y -= 0.5;
      points.push(x, y);
      x += 0.5;
      y -= 0.25;
      points.push(x, y);
      y -= 0.5;
      points.push(x, y);
      x -= 0.5;
      y -= 0.25;
      points.push(x, y);
    }
    if ( y - 0.75 > 0 ) {
      y -= 0.5;
      points.push(x, y);
      x += 0.5;
      y -= 0.25;
      points.push(x, y);
    }
    return {
      offsets,
      points,
      // We use center of the rectangle (and not the centroid of the polygon) for the rectangle shapes
      center: {
        x: width / 2,
        y: ((0.75 * Math.floor(height)) + (0.5 * (height % 1)) + 0.25) / 2
      },
      anchor: even ? {x: 0.5, y: 0.5} : {x: 0.0, y: 0.5}
    };
  }

  /* -------------------------------------------- */
  /*  Document Methods                            */
  /* -------------------------------------------- */

  /** @inheritDoc */
  getUserLevel(user) {
    if ( this.actor ) return this.actor.getUserLevel(user);
    return super.getUserLevel(user);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  toObject(source=true) {
    const obj = super.toObject(source);
    obj.delta = obj.actorLink ? null : this.delta.toObject(source);
    return obj;
  }

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /** @inheritDoc */
  static migrateData(data) {
    // Remember that any migrations defined here may also be required for the PrototypeToken model.
    /**
     * Migration of hexagonalShape to shape.
     * @deprecated since v13
     */
    if ( ("hexagonalShape" in data) && !("shape" in data) ) {
      data.shape = data.hexagonalShape;
      delete data.hexagonalShape;
    }
    return super.migrateData(data);
  }

  /* ----------------------------------------- */

  /** @inheritdoc */
  static shimData(data, options) {
    // Remember that any shims defined here may also be required for the PrototypeToken model.
    this._addDataFieldShim(data, "effects", undefined, {value: [], since: 12, until: 14,
      warning: "TokenDocument#effects is deprecated in favor of using ActiveEffect documents on the associated Actor"});
    this._addDataFieldShim(data, "overlayEffect", undefined, {value: "", since: 12, until: 14,
      warning: "TokenDocument#overlayEffect is deprecated in favor of using"
        + " ActiveEffect documents on the associated Actor"});
    this._addDataFieldShim(data, "hexagonalShape", "shape", {since: 13, until: 15,
      warning: "TokenDocument#hexagonalShape is deprecated in favor of TokenDocument#shape."});
    return super.shimData(data, options);
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  get effects() {
    foundry.utils.logCompatibilityWarning("TokenDocument#effects is deprecated in favor of using ActiveEffect"
      + " documents on the associated Actor", {since: 12, until: 14, once: true});
    return [];
  }

  /**
   * @deprecated since v12
   * @ignore
   */
  get overlayEffect() {
    foundry.utils.logCompatibilityWarning("TokenDocument#overlayEffect is deprecated in favor of using"
      + " ActiveEffect documents on the associated Actor", {since: 12, until: 14, once: true});
    return "";
  }

  /**
   * @deprecated since v13
   * @ignore
   */
  get hexagonalShape() {
    foundry.utils.logCompatibilityWarning("TokenDocument#hexagonalShape is deprecated in favor of TokenDocument#shape.",
      {since: 13, until: 15, once: true});
    return this.shape;
  }
}

/* -------------------------------------------- */

/**
 * A special subclass of EmbeddedDocumentField which allows construction of the ActorDelta to be lazily evaluated.
 */
export class ActorDeltaField extends fields.EmbeddedDocumentField {
  /** @inheritdoc */
  initialize(value, model, options = {}) {
    if ( !value ) return value;
    const descriptor = Object.getOwnPropertyDescriptor(model, this.name);
    if ( (descriptor === undefined) || (!descriptor.get && !descriptor.value) ) {
      return () => {
        const m = new this.model(value, {...options, parent: model, parentCollection: this.name});
        Object.defineProperty(m, "schema", {value: this});
        Object.defineProperty(model, this.name, {
          value: m,
          configurable: true,
          writable: true
        });
        return m;
      };
    }
    else if ( descriptor.get instanceof Function ) return descriptor.get;
    model[this.name]._initialize(options);
    return model[this.name];
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _updateCommit(source, key, value, diff, options) {
    super._updateCommit(source, key, value, diff, options);
    options._deltaModel?.updateSyntheticActor?.();
  }
}

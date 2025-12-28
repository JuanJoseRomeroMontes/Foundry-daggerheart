import PlaceableObject from "./placeable-object.mjs";
import TokenRing from "./tokens/ring.mjs";
import Ray from "../geometry/shapes/ray.mjs";
import {loadTexture} from "../loader.mjs";
import MouseInteractionManager from "../interaction/mouse-handler.mjs";
import PrimaryCanvasGroup from "../groups/primary.mjs";
import PrimarySpriteMesh from "../primary/primary-sprite-mesh.mjs";
import PreciseText from "../containers/elements/precise-text.mjs";
import CanvasAnimation from "../animation/canvas-animation.mjs";
import PointMovementSource from "../sources/point-movement-source.mjs";
import InvisibilityFilter from "../rendering/filters/invisibility.mjs";
import TextureTransitionFilter from "../rendering/filters/transition.mjs";
import {BaseSamplerShader, PrimaryBaseSamplerShader} from "../rendering/shaders/_module.mjs";
import TokenTurnMarker from "./tokens/turn-marker.mjs";
import {CLIPPER_SCALING_FACTOR, REGION_MOVEMENT_SEGMENTS, TOKEN_DISPLAY_MODES, TOKEN_SHAPES} from "@common/constants.mjs";
import TokenDocument from "@client/documents/token.mjs";
import Hooks from "@client/helpers/hooks.mjs";
import {Color} from "@common/utils/_module.mjs";

/**
 * @import {DeepReadonly, ElevatedPoint, Point} from "@common/_types.mjs";
 * @import {TokenDisplayMode} from "@common/constants.mjs";
 * @import {TokenDetectionMode, TokenDimensions, TokenPosition} from "@common/documents/_types.mjs";
 * @import {DatabaseUpdateOperation} from "@common/abstract/_types.mjs";
 * @import {GridMeasurePathResult} from "@common/grid/_types.mjs";
 * @import {
 *   TokenFindMovementPathWaypoint, TokenFindMovementPathJob, TokenDragContext, TokenConstrainMovementPathOptions,
 *   TokenFindMovementPathOptions, TokenAnimationContext, TokenAnimationData, TokenAnimationOptions, ReticuleOptions,
 *   TokenAnimationTransition, TokenConstrainMovementPathWaypoint, TokenPlannedMovement, TokenTerrainMovementWaypoint,
 *   TokenConstrainedMovementWaypoint, TokenGetTerrainMovementPathWaypoint
 * } from "../../_types.mjs";
 * @import {
 *   TokenMovementCostFunction, TokenMeasureMovementPathOptions, TokenMeasureMovementPathWaypoint,
 *   TokenMeasuredMovementWaypoint, TokenMovementWaypoint
 * } from "../../documents/_types.mjs";
 * @import {PointSourcePolygonType} from "../geometry/_types.mjs";
 * @import PolygonVertex from "../geometry/edges/vertex.mjs";
 * @import {CanvasAnimationAttribute} from "../animation/_types.mjs";
 * @import Region from "./region.mjs";
 * @import BaseTokenRuler from "./tokens/base-ruler.mjs";
 * @import AbstractBaseFilter from "../rendering/filters/base-filter.mjs";
 * @import {LightSourceData} from "../sources/base-light-source.mjs";
 * @import {VisionSourceData} from "../sources/point-vision-source.mjs";
 * @import {PointLightSource, PointVisionSource} from "../sources/_module.mjs";
 * @import {Actor, Combatant, User} from "../../documents/_module.mjs";
 */

/**
 * A Token is an implementation of PlaceableObject which represents an {@link foundry.documents.Actor} within a viewed
 * Scene on the game canvas.
 * @category Canvas
 * @see {@link foundry.documents.TokenDocument}
 * @see {@link foundry.canvas.layers.TokenLayer}
 */
export default class Token extends PlaceableObject {
  /**
   *
   * @param {TokenDocument} document   The TokenDocument that this Token represents
   */
  constructor(document) {
    super(document);
    this.#initialize();
  }

  /** @inheritdoc */
  static embeddedName = "Token";

  /** @override */
  static RENDER_FLAGS = {
    redraw: {propagate: ["refresh"]},
    redrawEffects: {},
    refresh: {propagate: ["refreshState", "refreshTransform", "refreshMesh", "refreshNameplate", "refreshElevation",
      "refreshRingVisuals", "refreshRuler", "refreshTurnMarker"], alias: true},
    refreshState: {propagate: ["refreshVisibility", "refreshTarget"]},
    refreshVisibility: {},
    refreshTransform: {propagate: ["refreshPosition", "refreshRotation", "refreshSize"], alias: true},
    refreshPosition: {},
    refreshRotation: {},
    refreshSize: {propagate: ["refreshPosition", "refreshShape", "refreshBars", "refreshEffects", "refreshNameplate", "refreshTarget", "refreshTooltip"]},
    refreshElevation: {propagate: ["refreshTooltip"]},
    refreshMesh: {propagate: ["refreshShader"]},
    refreshShader: {},
    refreshShape: {propagate: ["refreshVisibility", "refreshPosition", "refreshBorder", "refreshEffects"]},
    refreshBorder: {},
    refreshBars: {},
    refreshEffects: {},
    refreshNameplate: {},
    refreshTarget: {},
    refreshTooltip: {},
    refreshRingVisuals: {},
    refreshRuler: {},
    refreshTurnMarker: {},
    /** @deprecated since v12 Stable 4 */
    recoverFromPreview: {deprecated: {since: 12, until: 14}}
  };

  /**
   * Used in {@link Token#_renderDetectionFilter}.
   * @type {[detectionFilter: PIXI.Filter|null]}
   */
  static #DETECTION_FILTER_ARRAY = [null];

  /**
   * The shape of this token.
   * @type {PIXI.Rectangle|PIXI.Polygon|PIXI.Circle|PIXI.Ellipse}
   */
  shape;

  /**
   * Defines the filter to use for detection.
   * @type {PIXI.Filter|null} filter
   */
  detectionFilter = null;

  /**
   * A Graphics instance which renders the border frame for this Token inside the GridLayer.
   * @type {PIXI.Graphics}
   */
  border;

  /**
   * The effects icons of temporary ActiveEffects that are applied to the Actor of this Token.
   * @type {PIXI.Container}
   */
  effects;

  /**
   * The attribute bars of this Token.
   * @type {PIXI.Container}
   */
  bars;

  /**
   * The tooltip text of this Token, which contains its elevation.
   * @type {PreciseText}
   */
  tooltip;

  /**
   * The target arrows marker, which indicates that this Token is targeted by this User.
   * @type {PIXI.Graphics}
   */
  targetArrows;

  /**
   * The target pips marker, which indicates that this Token is targeted by other User(s).
   * @type {PIXI.Graphics}
   */
  targetPips;

  /**
   * The nameplate of this Token, which displays its name.
   * @type {PreciseText}
   */
  nameplate;

  /**
   * The ruler of this Token.
   * @type {BaseTokenRuler|null}
   */
  ruler;

  /**
   * The ruler data.
   * @type {{[userId: string]: TokenPlannedMovement}}
   * @protected
   */
  _plannedMovement = {};

  /**
   * Track the set of User documents which are currently targeting this Token
   * @type {Set<User>}
   */
  targeted = new Set([]);

  /**
   * A reference to the SpriteMesh which displays this Token in the PrimaryCanvasGroup.
   * @type {PrimarySpriteMesh}
   */
  mesh;

  /**
   * Renders the mesh of this Token with ERASE blending in the Token.
   * @type {PIXI.Container}
   */
  voidMesh;

  /**
   * Renders the mesh of with the detection filter.
   * @type {PIXI.Container}
   */
  detectionFilterMesh;

  /**
   * The texture of this Token, which is used by its mesh.
   * @type {PIXI.Texture}
   */
  texture;

  /**
   * A reference to the VisionSource object which defines this vision source area of effect.
   * This is undefined if the Token does not provide an active source of vision.
   * @type {PointVisionSource}
   */
  vision;

  /**
   * A reference to the LightSource object which defines this light source area of effect.
   * This is undefined if the Token does not provide an active source of light.
   * @type {PointLightSource}
   */
  light;

  /**
   * The Turn Marker of this Token.
   * Only a subset of Token objects have a turn marker at any given time.
   * @type {TokenTurnMarker|null}
   */
  turnMarker = null;

  /**
   * The center point adjustment. See {@link Token#getMovementAdjustedPoint}.
   * @type {Point}
   */
  #centerOffset;

  /**
   * The animated center point adjustment.
   * @type {Point}
   */
  #animationCenterOffset;

  /**
   * The Token central coordinate, adjusted for its most recent movement vector.
   * @type {Point}
   */
  #adjustedCenter;

  /**
   * A flag to capture whether this Token has an unlinked video texture.
   * @type {boolean}
   */
  #unlinkedVideo = false;

  /**
   * The current animation data of this Token.
   * @type {TokenAnimationData}
   */
  #animationData;

  /**
   * The prior animation data of this Token.
   * @type {TokenAnimationData}
   */
  #priorAnimationData;

  /**
   * A map of effects id and their filters applied on this token placeable.
   * @type {Map<string, AbstractBaseFilter>}
   */
  #filterEffects = new Map();

  /**
   * The current animations of this Token.
   * @type {Map<string, TokenAnimationContext>}
   */
  get animationContexts() {
    return this.#animationContexts;
  }

  #animationContexts = new Map();

  /**
   * The general animation name used for this Token.
   * @type {string}
   */
  get animationName() {
    return this.#animationName ??= `${this.objectId}.animate`;
  }

  #animationName;

  /**
   * The animation name used to animate this Token's movement.
   * @type {string}
   */
  get movementAnimationName() {
    return this.#movementAnimationName ??= `${this.objectId}.animateMovement`;
  }

  #movementAnimationName;

  /**
   * The promise of the current movement animation chain of this Token
   * or null if there isn't a movement animation in progress.
   * @type {Promise<void>|null}
   */
  get movementAnimationPromise() {
    const context = this.#animationContexts.get(this.movementAnimationName);
    if ( !context ) return null;
    return context.chain.at(-1)?.promise ?? context.promise;
  }

  /**
   * Should the ruler of this Token be visible?
   * @type {boolean}
   */
  get showRuler() {
    if ( this.#showRuler ) return true;
    for ( const [userId, {hidden}] of Object.entries(this._plannedMovement) ) {
      if ( !hidden || (userId === game.user.id) ) return true;
    }
    return false;
  }

  #showRuler;

  /**
   * Prevent keyboard movement of this Token?
   * @type {boolean}
   * @internal
   */
  _preventKeyboardMovement = false;

  /**
   * A TokenRing instance which is used if this Token applies a dynamic ring.
   * This property is null if the Token does not use a dynamic ring.
   * @type {TokenRing|null}
   */
  get ring() {
    return this.#ring;
  }

  #ring;

  /**
   * A convenience boolean to test whether the Token is using a dynamic ring.
   * @type {boolean}
   */
  get hasDynamicRing() {
    return this.ring instanceof TokenRing;
  }

  /* -------------------------------------------- */
  /*  Initialization                              */
  /* -------------------------------------------- */

  /**
   * Establish an initial velocity of the token based on its direction of facing.
   * Assume the Token made some prior movement towards the direction that it is currently facing.
   */
  #initialize() {

    // Initialize prior movement
    const {x, y, rotation} = this.document;
    const r = Ray.fromAngle(x, y, Math.toRadians(rotation + 90), canvas.dimensions.size);

    // Initialize valid position
    this.#centerOffset = {x: Math.sign(r.dx), y: Math.sign(r.dy)};
    this.#animationCenterOffset = {x: this.#centerOffset.x, y: this.#centerOffset.y};
    this.#adjustedCenter = this.getMovementAdjustedPoint(this.document.getCenterPoint());

    // Initialize animation data
    this.#animationData = foundry.utils.deepSeal(this._getAnimationData());
    this.#priorAnimationData = foundry.utils.deepSeal(foundry.utils.deepClone(this.#animationData));
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  clone() {
    const clone = super.clone();
    clone.#centerOffset.x = clone.#animationCenterOffset.x = this.#centerOffset.x;
    clone.#centerOffset.y = clone.#animationCenterOffset.y = this.#centerOffset.y;
    clone.#adjustedCenter = clone.getMovementAdjustedPoint(clone.document.getCenterPoint());
    return clone;
  }

  /* -------------------------------------------- */

  /**
   * Initialize a TokenRing instance for this Token, if a dynamic ring is enabled.
   */
  #initializeRing() {

    // Construct a TokenRing instance
    if ( this.document.ring.enabled ) {
      if ( !this.hasDynamicRing ) {
        const cls = CONFIG.Token.ring.ringClass;
        if ( !foundry.utils.isSubclass(cls, TokenRing) ) {
          throw new Error("The configured CONFIG.Token.ring.ringClass is not a TokenRing subclass.");
        }
        this.#ring = new cls(this);
      }
      this.#ring.configure(this.mesh);
      return;
    }

    // Deactivate a prior TokenRing instance
    if ( this.hasDynamicRing ) this.#ring.clear();
    this.#ring = null;
  }

  /* -------------------------------------------- */
  /*  Permission Attributes
  /* -------------------------------------------- */

  /**
   * A convenient reference to the Actor object associated with the Token embedded document.
   * @returns {Actor|null}
   */
  get actor() {
    return this.document.actor;
  }

  /* -------------------------------------------- */

  /**
   * A boolean flag for whether the current game User has observer permission for the Token
   * @type {boolean}
   */
  get observer() {
    return game.user.isGM || !!this.actor?.testUserPermission(game.user, "OBSERVER");
  }

  /* -------------------------------------------- */

  /**
   * Convenience access to the token's nameplate string
   * @type {string}
   */
  get name() {
    return this.document.name;
  }

  /* -------------------------------------------- */
  /*  Rendering Attributes
  /* -------------------------------------------- */

  /** @override */
  get bounds() {
    const {x, y} = this.document;
    const {width, height} = this.document.getSize();
    return new PIXI.Rectangle(x, y, width, height);
  }

  /* -------------------------------------------- */

  /**
   * Translate the token's grid width into a pixel width based on the canvas size
   * @type {number}
   */
  get w() {
    return this.document.getSize().width;
  }

  /* -------------------------------------------- */

  /**
   * Translate the token's grid height into a pixel height based on the canvas size
   * @type {number}
   */
  get h() {
    return this.document.getSize().height;
  }

  /* -------------------------------------------- */

  /** @override */
  get center() {
    const {x, y} = this.document.getCenterPoint();
    return new PIXI.Point(x, y);
  }

  /* -------------------------------------------- */

  /**
   * The Token's central position, adjusted in each direction by one or zero pixels to offset it relative to walls.
   * @overload
   * @param {ElevatedPoint} point The center point with elevation.
   * @param {object} [options]
   * @param {number} [options.offsetX] The x-offset.
   * @param {number} [options.offsetY] The y-offset.
   * @returns {ElevatedPoint} The adjusted center point.
   */
  /**
   * @overload
   * @param {Point} point The center point.
   * @param {object} [options]
   * @param {number} [options.offsetX] The x-offset.
   * @param {number} [options.offsetY] The y-offset.
   * @returns {Point} The adjusted center point.
   */
  getMovementAdjustedPoint(point, {offsetX, offsetY}={}) {
    const x = Math.round(point.x);
    const y = Math.round(point.y);
    const elevation = point.elevation;
    point = elevation !== undefined ? {x, y, elevation} : {x, y};
    offsetX ??= this.#centerOffset.x;
    offsetY ??= this.#centerOffset.y;
    if ( (offsetX === 0) && (offsetY === 0) ) return point;

    // Define a bounding box around the point to query relevant edges using the Quadtree
    const bounds = new PIXI.Rectangle(point.x, point.y, 0, 0);

    // Define a collisionTest that returns only edges that block movement and are collinear with the point.
    const collisionTest = edge => (edge.move && (foundry.utils.orient2dFast(edge.a, edge.b, point) === 0));

    // Retrieve candidate edges. Include inner bounds.
    const size = canvas.edges.getEdges(bounds, {
      includeInnerBounds: true,
      includeOuterBounds: false,
      collisionTest
    }).size;

    // If at least one collinear, blocking edge is found, offset the point.
    if ( size > 0 ) {
      point.x -= offsetX;
      point.y -= offsetY;
    }
    return point;
  }

  /* -------------------------------------------- */

  /**
   * The HTML source element for the primary Tile texture
   * @type {PIXI.ImageSource|null}
   */
  get sourceElement() {
    return this.texture?.baseTexture.resource.source ?? null;
  }

  /* -------------------------------------------- */

  /** @override */
  get sourceId() {
    let id = `${this.document.documentName}.${this.document.id}`;
    if ( this.isPreview ) id += ".preview";
    return id;
  }

  /* -------------------------------------------- */

  /**
   * Does this Tile depict an animated video texture?
   * @type {boolean}
   */
  get isVideo() {
    const source = this.sourceElement;
    return source?.tagName === "VIDEO";
  }

  /* -------------------------------------------- */
  /*  State Attributes
  /* -------------------------------------------- */

  /**
   * An indicator for whether or not this token is currently involved in the active combat encounter.
   * @type {boolean}
   */
  get inCombat() {
    return this.document.inCombat;
  }

  /* -------------------------------------------- */

  /**
   * Return a reference to a Combatant that represents this Token, if one is present in the current encounter.
   * @type {Combatant|null}
   */
  get combatant() {
    return this.document.combatant;
  }

  /* -------------------------------------------- */

  /**
   * An indicator for whether the Token is currently targeted by the active game User
   * @type {boolean}
   */
  get isTargeted() {
    return this.targeted.has(game.user);
  }

  /* -------------------------------------------- */

  /**
   * Is this Token currently being dragged?
   * @type {boolean}
   */
  get isDragged() {
    return !!this.#getDragContext();
  }

  /* -------------------------------------------- */

  /**
   * Return a reference to the detection modes array.
   * @type {TokenDetectionMode[]}
   */
  get detectionModes() {
    return this.document.detectionModes;
  }

  /* -------------------------------------------- */

  /**
   * Determine whether the Token is visible to the calling user's perspective.
   * Hidden Tokens are only displayed to GM Users.
   * Non-hidden Tokens are always visible if Token Vision is not required.
   * Controlled tokens are always visible.
   * All Tokens are visible to a GM user if no Token is controlled.
   *
   * @see {CanvasVisibility#testVisibility}
   * @type {boolean}
   */
  get isVisible() {
    // Clear the detection filter
    this.detectionFilter = null;

    // Only GM users can see hidden tokens
    const gm = game.user.isGM;
    if ( this.document.hidden && !gm ) return false;

    // Some tokens are always visible
    if ( !canvas.visibility.tokenVision ) return true;
    if ( this.controlled ) return true;

    // Otherwise, test visibility against current sight polygons
    if ( this.vision?.active ) return true;
    const {width, height} = this.document.getSize();
    const tolerance = Math.min(width, height) / 4;
    return canvas.visibility.testVisibility(this.center, {tolerance, object: this});
  }

  /* -------------------------------------------- */
  /*  Lighting and Vision Attributes
  /* -------------------------------------------- */

  /**
   * Test whether the Token has sight (or blindness) at any radius
   * @type {boolean}
   */
  get hasSight() {
    return this.document.sight.enabled;
  }

  /* -------------------------------------------- */

  /**
   * Does this Token actively emit light given its properties and the current darkness level of the Scene?
   * @returns {boolean}
   * @protected
   */
  _isLightSource() {
    const {hidden, light} = this.document;
    if ( hidden ) return false;
    if ( !(light.dim || light.bright) ) return false;
    const darkness = canvas.darknessLevel;
    if ( !darkness.between(light.darkness.min, light.darkness.max)) return false;
    return !this.document.hasStatusEffect(CONFIG.specialStatusEffects.BURROW);
  }

  /* -------------------------------------------- */

  /**
   * Does this token actively emit darkness given its properties and the current darkness level of the Scene?
   * @type {boolean}
   */
  get emitsDarkness() {
    return this.document.light.negative && this._isLightSource();
  }

  /* -------------------------------------------- */

  /**
   * Does this token actively emit light given its properties and the current darkness level of the Scene?
   * @type {boolean}
   */
  get emitsLight() {
    return !this.document.light.negative && this._isLightSource();
  }

  /* -------------------------------------------- */

  /**
   * Test whether the Token uses a limited angle of vision or light emission.
   * @type {boolean}
   */
  get hasLimitedSourceAngle() {
    const doc = this.document;
    return (this.hasSight && (doc.sight.angle !== 360)) || (this._isLightSource() && (doc.light.angle !== 360));
  }

  /* -------------------------------------------- */

  /**
   * Translate the token's dim light distance in units into a radius in pixels.
   * @type {number}
   */
  get dimRadius() {
    return this.getLightRadius(this.document.light.dim);
  }

  /* -------------------------------------------- */

  /**
   * Translate the token's bright light distance in units into a radius in pixels.
   * @type {number}
   */
  get brightRadius() {
    return this.getLightRadius(this.document.light.bright);
  }

  /* -------------------------------------------- */

  /**
   * The maximum radius in pixels of the light field
   * @type {number}
   */
  get radius() {
    return Math.max(Math.abs(this.dimRadius), Math.abs(this.brightRadius));
  }

  /* -------------------------------------------- */

  /**
   * The range of this token's light perception in pixels.
   * @type {number}
   */
  get lightPerceptionRange() {
    const mode = this.document.detectionModes.find(m => m.id === "lightPerception");
    return mode?.enabled ? this.getLightRadius(mode.range) : 0;
  }

  /* -------------------------------------------- */

  /**
   * Translate the token's vision range in units into a radius in pixels.
   * @type {number}
   */
  get sightRange() {
    return this.getLightRadius(this.document.sight.range);
  }

  /* -------------------------------------------- */

  /**
   * Translate the token's maximum vision range that takes into account lights.
   * @type {number}
   */
  get optimalSightRange() {
    let lightRadius = 0;
    const mode = this.document.detectionModes.find(m => m.id === "lightPerception");
    if ( mode?.enabled ) {
      lightRadius = Math.max(this.document.light.bright, this.document.light.dim);
      lightRadius = Math.min(lightRadius, mode.range);
    }
    return this.getLightRadius(Math.max(this.document.sight.range, lightRadius));
  }

  /* -------------------------------------------- */

  /**
   * Update the light and vision source objects associated with this Token.
   * @param {object} [options={}]       Options which configure how perception sources are updated
   * @param {boolean} [options.deleted=false]       Indicate that this light and vision source has been deleted
   */
  initializeSources({deleted=false}={}) {
    this.#adjustedCenter = this.getMovementAdjustedPoint(this.document.getCenterPoint(),
      this.#animationCenterOffset);
    this.initializeLightSource({deleted});
    this.initializeVisionSource({deleted});
  }

  /* -------------------------------------------- */

  /**
   * Update an emitted light source associated with this Token.
   * @param {object} [options={}]
   * @param {boolean} [options.deleted]    Indicate that this light source has been deleted.
   */
  initializeLightSource({deleted=false}={}) {
    // Gather current state
    const sourceId = this.sourceId;
    const wasLight = canvas.effects.lightSources.has(sourceId);
    const wasDarkness = canvas.effects.darknessSources.has(sourceId);
    const previousPriority = this.lightSource?.priority ?? 0;
    const actualPriority = this.document.light.priority ?? 0;
    const isDarkness = this.document.light.negative;
    const perceptionFlags = {
      refreshEdges: wasDarkness || isDarkness,
      initializeVision: wasDarkness || isDarkness,
      initializeLighting: wasDarkness || isDarkness,
      refreshLighting: true,
      refreshVision: true
    };

    // Did the lightsource previously create edges?
    const edgesBefore = wasDarkness || (wasLight && (previousPriority > 0));

    // Should the lightsource create edges now?
    const edgesNow = isDarkness || (actualPriority > 0);

    // Check for key changes
    const darknessChanged = (wasDarkness !== isDarkness);
    const priorityChanged = (previousPriority !== actualPriority);
    const edgesChanged = (edgesBefore !== edgesNow);
    const fullUpdate = darknessChanged || edgesChanged || priorityChanged;

    // Handle deletion
    if ( deleted || !this._isLightSource() ) {
      if ( !this.light ) return;
      if ( this.light.active ) canvas.perception.update(perceptionFlags);
      this.#destroyLightSource();
      return;
    }

    // Otherwise handle potential recreation
    if ( fullUpdate ) this.#destroyLightSource();

    // Create a light source if necessary
    this.light ??= this.#createLightSource();

    // Re-initialize source data and add to the active collection
    this.light.initialize(this._getLightSourceData());
    this.light.add();

    // If darkness or edges changed, we need a full edge-based refresh
    if ( fullUpdate ) {
      perceptionFlags.refreshEdges = perceptionFlags.initializeVision = perceptionFlags.initializeLighting = true;
    }

    // Update perception and rendering
    canvas.perception.update(perceptionFlags);
  }

  /* -------------------------------------------- */

  /**
   * Get the light source data.
   * @returns {LightSourceData}
   * @protected
   */
  _getLightSourceData() {
    const {x, y} = this.#adjustedCenter;
    const {elevation, rotation} = this.document;
    const lightDoc = this.document.light;
    return foundry.utils.mergeObject(lightDoc.toObject(false), {
      x, y, elevation, rotation,
      dim: this.getLightRadius(lightDoc.dim),
      bright: this.getLightRadius(lightDoc.bright),
      externalRadius: this.externalRadius,
      seed: this.document.getFlag("core", "animationSeed"),
      preview: this.isPreview,
      disabled: !this._isLightSource() || this.#isUnreachableDragPreview
    });
  }

  /* -------------------------------------------- */

  /**
   * Update the VisionSource instance associated with this Token.
   * @param {object} [options]        Options which affect how the vision source is updated
   * @param {boolean} [options.deleted]   Indicate that this vision source has been deleted.
   */
  initializeVisionSource({deleted=false}={}) {

    // Remove a deleted vision source from the active collection
    if ( deleted || !this._isVisionSource() ) {
      if ( !this.vision ) return;
      if ( this.vision.active ) canvas.perception.update({
        initializeVisionModes: true,
        refreshVision: true,
        refreshLighting: true
      });
      this.#destroyVisionSource();
      return;
    }

    // Create a vision source if necessary
    const wasVision = !!this.vision;
    this.vision ??= this.#createVisionSource();

    // Re-initialize source data
    const previousActive = this.vision.active;
    const previousVisionMode = this.vision.visionMode;
    const blindedStates = this._getVisionBlindedStates();
    for ( const state in blindedStates ) this.vision.blinded[state] = blindedStates[state];
    this.vision.initialize(this._getVisionSourceData());
    this.vision.add();
    canvas.perception.update({
      initializeVisionModes: !wasVision
        || (this.vision.active !== previousActive)
        || (this.vision.visionMode !== previousVisionMode),
      refreshVision: true,
      refreshLighting: true
    });
  }

  /* -------------------------------------------- */

  /**
   * Returns a record of blinding state.
   * @returns {Record<string, boolean>}
   * @protected
   */
  _getVisionBlindedStates() {
    return {
      blind: this.document.hasStatusEffect(CONFIG.specialStatusEffects.BLIND),
      burrow: this.document.hasStatusEffect(CONFIG.specialStatusEffects.BURROW)
    };
  }

  /* -------------------------------------------- */

  /**
   * Get the vision source data.
   * @returns {VisionSourceData}
   * @protected
   */
  _getVisionSourceData() {
    const {x, y} = this.#adjustedCenter;
    const {elevation, rotation} = this.document;
    const sight = this.document.sight;
    return {
      x, y, elevation, rotation,
      radius: this.sightRange,
      lightRadius: this.lightPerceptionRange,
      externalRadius: this.externalRadius,
      angle: sight.angle,
      contrast: sight.contrast,
      saturation: sight.saturation,
      brightness: sight.brightness,
      attenuation: sight.attenuation,
      visionMode: sight.visionMode,
      color: sight.color,
      preview: this.isPreview,
      disabled: this.#isUnreachableDragPreview
    };
  }

  /* -------------------------------------------- */

  /**
   * Test whether this Token is a viable vision source for the current User.
   * @returns {boolean}
   * @protected
   */
  _isVisionSource() {
    if ( !canvas.visibility.tokenVision || !this.hasSight ) return false;

    // Only display hidden tokens for the GM
    const isGM = game.user.isGM;
    if ( this.document.hidden && !isGM ) return false;

    // Always display controlled tokens which have vision
    if ( this.controlled ) return true;

    // Otherwise, vision is ignored for GM users
    if ( isGM ) return false;

    // If a non-GM user controls no other tokens with sight, display sight
    const canObserve = this.actor?.testUserPermission(game.user, "OBSERVER") ?? false;
    if ( !canObserve ) return false;
    return !this.layer.controlled.some(t => !t.document.hidden && t.hasSight);
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /**
   * Render the bound mesh detection filter.
   * Note: this method does not verify that the detection filter exists.
   * @param {PIXI.Renderer} renderer
   * @protected
   */
  _renderDetectionFilter(renderer) {
    if ( !this.mesh ) return;

    Token.#DETECTION_FILTER_ARRAY[0] = this.detectionFilter;

    // Rendering the mesh
    const originalFilters = this.mesh.filters;
    const originalTint = this.mesh.tint;
    const originalAlpha = this.mesh.worldAlpha;
    this.mesh.filters = Token.#DETECTION_FILTER_ARRAY;
    this.mesh.tint = 0xFFFFFF;
    this.mesh.worldAlpha = 1;
    this.mesh.pluginName = BaseSamplerShader.classPluginName;
    this.mesh.render(renderer);
    this.mesh.filters = originalFilters;
    this.mesh.tint = originalTint;
    this.mesh.worldAlpha = originalAlpha;
    this.mesh.pluginName = null;

    Token.#DETECTION_FILTER_ARRAY[0] = null;
  }

  /* -------------------------------------------- */

  /** @override */
  clear() {
    this.ruler?.clear();
    if ( this.mesh ) {
      this.mesh.texture = PIXI.Texture.EMPTY;
      this.mesh.visible = false;
    }
    if ( this.#unlinkedVideo ) this.texture?.baseTexture?.destroy(); // Destroy base texture if the token has an unlinked video
    this.#unlinkedVideo = false;
    if ( this.hasActiveHUD ) this.layer.hud.close();
    return this;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _destroy(options) {
    this.#cancelDrag();
    this._removeAllFilterEffects();
    this.stopAnimation();                       // Cancel movement animations
    canvas.primary.removeToken(this);           // Remove the PrimarySpriteMesh from the PrimaryCanvasGroup
    this.#destroyLightSource();                 // Destroy the LightSource
    this.#destroyVisionSource();                // Destroy the VisionSource
    this.ruler?.destroy();                      // Destroy the ruler
    if ( this.#unlinkedVideo ) this.texture?.baseTexture?.destroy();  // Destroy base texture if the token has an unlinked video
    if ( this.turnMarker ) canvas.tokens.turnMarkers.delete(this); // Unregister active turn marker
    this.removeChildren().forEach(c => c.destroy({children: true}));
    this.texture = undefined;
    this.#unlinkedVideo = false;
  }

  /* -------------------------------------------- */

  /** @override */
  async _draw(options) {
    this.#cleanData();

    // Load token texture
    let texture;
    if ( this._original ) texture = this._original.texture?.clone();
    else texture = await loadTexture(this.document.texture.src, {fallback: CONST.DEFAULT_TOKEN});

    // Cache token ring subject texture if needed
    const ring = this.document.ring;
    if ( ring.enabled && ring.subject.texture ) await loadTexture(ring.subject.texture);

    // Manage video playback
    let video = game.video.getVideoSource(texture);
    this.#unlinkedVideo = !!video && !this._original;
    if ( this.#unlinkedVideo ) {
      texture = await game.video.cloneTexture(video);
      video = game.video.getVideoSource(texture);
      const playOptions = {volume: 0};
      if ( (this.document.getFlag("core", "randomizeVideo") !== false) && Number.isFinite(video.duration) ) {
        playOptions.offset = Math.random() * video.duration;
      }
      game.video.play(video, playOptions);
    }
    this.texture = texture;

    // Draw the token's PrimarySpriteMesh in the PrimaryCanvasGroup
    this.mesh = canvas.primary.addToken(this);

    // Initialize token ring
    this.#initializeRing();

    // Draw the border
    this.border ||= this.addChild(new PIXI.Graphics());

    // Draw the void of the token's PrimarySpriteMesh
    if ( !this.voidMesh ) {
      this.voidMesh = this.addChild(new PIXI.Container());
      this.voidMesh.updateTransform = () => {};
      this.voidMesh.render = renderer => this.mesh?._renderVoid(renderer);
    }

    // Draw the detection filter of the token's PrimarySpriteMesh
    if ( !this.detectionFilterMesh ) {
      this.detectionFilterMesh = this.addChild(new PIXI.Container());
      this.detectionFilterMesh.updateTransform = () => {};
      this.detectionFilterMesh.render = renderer => {
        if ( this.detectionFilter ) this._renderDetectionFilter(renderer);
      };
    }

    // Draw Token interface components
    this.bars ||= this.addChild(this.#drawAttributeBars());
    this.tooltip ||= this.addChild(this.#drawTooltip());
    this.effects ||= this.addChild(new PIXI.Container());
    this.targetArrows ||= this.addChild(new PIXI.Graphics());
    this.targetPips ||= this.addChild(new PIXI.Graphics());
    this.nameplate ||= this.addChild(this.#drawNameplate());
    this.sortableChildren = true;

    // Initialize and draw the ruler
    if ( this.ruler === undefined ) this.ruler = this._initializeRuler();
    if ( this.ruler ) await this.ruler.draw();

    // Add filter effects
    this._updateSpecialStatusFilterEffects();

    // Draw elements
    await this._drawEffects();

    // Initialize sources
    if ( !this.isPreview ) this.initializeSources();
  }

  /* -------------------------------------------- */

  /**
   * Create the BaseTokenRuler instance for this Token, if any.
   * This function is called when the Token is drawn for the first time.
   * @returns {BaseTokenRuler|null}
   * @protected
   */
  _initializeRuler() {
    const rulerClass = CONFIG.Token.rulerClass;
    if ( !rulerClass ) return null;
    return new rulerClass(this);
  }

  /* -------------------------------------------- */

  /**
   * Create a point light source according to token options.
   * @returns {PointDarknessSource|PointLightSource}
   */
  #createLightSource() {
    const lightSourceClass = this.document.light.negative
      ? CONFIG.Canvas.darknessSourceClass : CONFIG.Canvas.lightSourceClass;
    return new lightSourceClass({sourceId: this.sourceId, object: this});
  }

  /* -------------------------------------------- */

  /**
   * Destroy the PointLightSource or PointDarknessSource instance associated with this Token.
   */
  #destroyLightSource() {
    this.light?.destroy();
    this.light = undefined;
  }

  /* -------------------------------------------- */

  /**
   * Create a point vision source for the Token.
   * @returns {PointVisionSource}
   */
  #createVisionSource() {
    return new CONFIG.Canvas.visionSourceClass({sourceId: this.sourceId, object: this});
  }

  /* -------------------------------------------- */

  /**
   * Destroy the PointVisionSource instance associated with this Token.
   */
  #destroyVisionSource() {
    this.vision?.visionMode?.deactivate(this.vision);
    this.vision?.destroy();
    this.vision = undefined;
  }

  /* -------------------------------------------- */

  /**
   * Apply initial sanitizations to the provided input data to ensure that a Token has valid required attributes.
   * Constrain the Token position to remain within the Canvas rectangle.
   */
  #cleanData() {
    const d = this.scene.dimensions;
    const {x: cx, y: cy} = this.document.getCenterPoint({x: 0, y: 0});
    this.document.x = Math.clamp(this.document.x, -cx, d.width - cx);
    this.document.y = Math.clamp(this.document.y, -cy, d.height - cy);
  }

  /* -------------------------------------------- */

  /**
   * Draw resource bars for the Token
   * @returns {PIXI.Container}
   */
  #drawAttributeBars() {
    const bars = new PIXI.Container();
    bars.bar1 = bars.addChild(new PIXI.Graphics());
    bars.bar2 = bars.addChild(new PIXI.Graphics());
    return bars;
  }

  /* -------------------------------------------- */
  /*  Incremental Refresh                         */
  /* -------------------------------------------- */

  /** @override */
  _applyRenderFlags(flags) {
    if ( flags.refreshState ) this._refreshState();
    if ( flags.refreshVisibility ) this._refreshVisibility();
    if ( flags.refreshPosition ) this._refreshPosition();
    if ( flags.refreshRotation ) this._refreshRotation();
    if ( flags.refreshSize ) this._refreshSize();
    if ( flags.refreshElevation ) this._refreshElevation();
    if ( flags.refreshMesh ) this._refreshMesh();
    if ( flags.refreshShader ) this._refreshShader();
    if ( flags.refreshShape ) this._refreshShape();
    if ( flags.refreshBorder ) this._refreshBorder();
    if ( flags.refreshBars ) this.drawBars();
    if ( flags.refreshNameplate ) this._refreshNameplate();
    if ( flags.refreshTarget ) this._refreshTarget();
    if ( flags.refreshTooltip ) this._refreshTooltip();
    if ( flags.recoverFromPreview ) this._recoverFromPreview();
    if ( flags.refreshRingVisuals ) this._refreshRingVisuals();
    if ( flags.redrawEffects ) this.drawEffects();
    if ( flags.refreshEffects ) this._refreshEffects();
    if ( flags.refreshTurnMarker ) this._refreshTurnMarker();
    if ( flags.refreshRuler ) this._refreshRuler();
  }

  /* -------------------------------------------- */

  /**
   * Refresh the token ring visuals if necessary.
   * @protected
   */
  _refreshRingVisuals() {
    if ( this.hasDynamicRing ) this.ring.configureVisuals();
  }

  /* -------------------------------------------- */

  /**
   * Refresh the visibility.
   * @protected
   */
  _refreshVisibility() {
    const wasVisible = this.visible;
    this.visible = this.isVisible;
    if ( this.visible !== wasVisible ) MouseInteractionManager.emulateMoveEvent();
    this.mesh.visible = this.visible && this.renderable;
    if ( this.layer.occlusionMode === CONST.TOKEN_OCCLUSION_MODES.VISIBLE ) {
      canvas.perception.update({refreshOcclusion: true});
    }
  }

  /* -------------------------------------------- */

  /**
   * Refresh aspects of the user interaction state.
   * For example the border, nameplate, or bars may be shown on Hover or on Control.
   * @protected
   */
  _refreshState() {
    this.alpha = this._getTargetAlpha();
    this.border.tint = this.#getBorderColor();
    const isSecret = this.document.isSecret;
    const isHover = this.hover || this.layer.highlightObjects;
    this.border.zIndex = isHover ? Infinity : -1;
    this.border.visible = !isSecret && (this.controlled || isHover);
    this.nameplate.visible = !isSecret && this._canViewMode(this.document.displayName);
    this.bars.visible = !isSecret && (this.actor && this._canViewMode(this.document.displayBars));
    this.tooltip.visible = !isSecret;
    this.effects.visible = !isSecret;
    this.targetPips.visible = this.targetArrows.visible = !isSecret;
    this.cursor = !isSecret ? "pointer" : null;
    this.zIndex = this.mesh.zIndex = this.controlled ? 2 : this.hover ? 1 : 0;
    this.mesh.sort = this.document.sort;
    this.mesh.sortLayer = PrimaryCanvasGroup.SORT_LAYERS.TOKENS;
    this.mesh.alpha = this.alpha * this.document.alpha;
    this.mesh.hidden = this.document.hidden;
    if ( this.ruler ) this.ruler.visible = this.ruler.isVisible;
  }

  /* -------------------------------------------- */

  /**
   * Resize mesh and handle scale adjustment.
   * @protected
   */
  _refreshMeshSizeAndScale() {
    const {width, height} = this.document.getSize();
    const fit = this.document.texture.fit;
    let {scaleX, scaleY} = this.document.texture;

    // Configure ring size
    if ( this.hasDynamicRing ) {
      this.ring.configureSize({fit});

      // Handle dynamic ring scale adjustments
      if ( CONFIG.Token.ring.isGridFitMode ) {
        scaleX *= this.ring.subjectScaleAdjustment;
        scaleY *= this.ring.subjectScaleAdjustment;
      }
    }

    // Resize the mesh based on the computed fit and scale
    this.mesh.resize(width, height, {fit, scaleX, scaleY});
  }

  /* -------------------------------------------- */

  /**
   * Refresh the size.
   * @protected
   */
  _refreshSize() {
    this._refreshMeshSizeAndScale();

    // Adjust nameplate and tooltip positioning
    const {width, height} = this.document.getSize();

    this.nameplate.position.set(width / 2, height + 2);
    this.tooltip.position.set(width / 2, -2);

    // Adjust turn marker size (150% size by default);
    if ( this.turnMarker ) {
      const mesh = this.turnMarker.mesh;
      mesh.width = mesh.height = this.externalRadius * 3;
    }
  }

  /* -------------------------------------------- */

  /**
   * Refresh the token mesh.
   * @protected
   */
  _refreshMesh() {
    this._refreshMeshSizeAndScale();

    // Set additional properties specific to the token mesh
    const {alpha, texture: {anchorX, anchorY, tint, alphaThreshold}} = this.document;

    this.mesh.anchor.set(anchorX, anchorY);
    this.mesh.alpha = this.alpha * alpha;
    this.mesh.tint = tint;
    this.mesh.textureAlphaThreshold = alphaThreshold;
    this.mesh.occludedAlpha = 0.5;
  }

  /* -------------------------------------------- */

  /**
   * Refresh the shape.
   * @protected
   */
  _refreshShape() {
    this.shape = this.getShape();
    this.hitArea = this.shape;
    MouseInteractionManager.emulateMoveEvent();
  }

  /* -------------------------------------------- */

  /**
   * Refresh the rotation.
   * @protected
   */
  _refreshRotation() {
    this.mesh.angle = this.document.lockRotation ? 0 : this.document.rotation;
  }

  /* -------------------------------------------- */

  /**
   * Refresh the position.
   * @protected
   */
  _refreshPosition() {
    const {x, y} = this.document;
    if ( (this.position.x !== x) || (this.position.y !== y) ) MouseInteractionManager.emulateMoveEvent();
    this.position.set(x, y);
    const center = this.mesh.position = this.center;
    if ( this.turnMarker ) this.turnMarker.position.set(center.x - x, center.y - y);
  }

  /* -------------------------------------------- */

  /**
   * Refresh the elevation
   * @protected
   */
  _refreshElevation() {
    this.mesh.elevation = this.document.elevation;
  }

  /* -------------------------------------------- */

  /**
   * Refresh the tooltip.
   * @protected
   */
  _refreshTooltip() {
    this.tooltip.text = this._getTooltipText();
    this.tooltip.style = this._getTextStyle();
  }

  /* -------------------------------------------- */

  /**
   * Refresh the text content, position, and visibility of the Token nameplate.
   * @protected
   */
  _refreshNameplate() {
    this.nameplate.text = this.document.name;
    this.nameplate.style = this._getTextStyle();
  }

  /* -------------------------------------------- */

  /**
   * Refresh the token mesh shader.
   * @protected
   */
  _refreshShader() {
    if ( this.hasDynamicRing ) this.mesh.setShaderClass(CONFIG.Token.ring.shaderClass);
    else this.mesh.setShaderClass(PrimaryBaseSamplerShader);
  }

  /* -------------------------------------------- */

  /**
   * Refresh the border.
   * @protected
   */
  _refreshBorder() {
    const thickness = CONFIG.Canvas.objectBorderThickness * canvas.dimensions.uiScale;
    this.border.clear();
    this.border.lineStyle({width: thickness, color: 0x000000, alignment: 0.75, join: PIXI.LINE_JOIN.ROUND});
    this.border.drawShape(this.shape);
    this.border.lineStyle({width: thickness / 2, color: 0xFFFFFF, alignment: 1, join: PIXI.LINE_JOIN.ROUND});
    this.border.drawShape(this.shape);
  }

  /* -------------------------------------------- */

  /**
   * Get the hex color that should be used to render the Token border
   * @returns {number}          The hex color used to depict the border color
   * @protected
   */
  _getBorderColor() {
    const colors = CONFIG.Canvas.dispositionColors;
    if ( this.controlled || (this.isOwner && !game.user.isGM) ) return colors.CONTROLLED;
    return this.getDispositionColor();
  }

  /* -------------------------------------------- */

  /**
   * Get the Color used to represent the disposition of this Token.
   * @returns {number}
   */
  getDispositionColor() {
    const colors = CONFIG.Canvas.dispositionColors;
    const D = CONST.TOKEN_DISPOSITIONS;
    switch ( this.document.disposition ) {
      case D.SECRET: return colors.SECRET;
      case D.HOSTILE: return colors.HOSTILE;
      case D.NEUTRAL: return colors.NEUTRAL;
      case D.FRIENDLY: return this.actor?.hasPlayerOwner ? colors.PARTY : colors.FRIENDLY;
      default: return colors.INACTIVE;
    }
  }

  /* -------------------------------------------- */

  /**
   * Get the hex color that should be used to render the Token border
   * @returns {number}            The border color
   */
  #getBorderColor() {
    let color = this._getBorderColor();
    /** @deprecated since v12 */
    if ( typeof color !== "number" ) {
      color = CONFIG.Canvas.dispositionColors.INACTIVE;
      const msg = "Token#_getBorderColor returning null is deprecated.";
      foundry.utils.logCompatibilityWarning(msg, {since: 12, until: 14, once: true});
    }
    return color;
  }

  /* -------------------------------------------- */

  /**
   * Refresh the target indicators for the Token.
   * Draw both target arrows for the primary User and indicator pips for other Users targeting the same Token.
   * @protected
   */
  _refreshTarget() {
    this._drawTargetArrows({border: {width: 2 * canvas.dimensions.uiScale}});
    this._drawTargetPips();
  }

  /* -------------------------------------------- */

  /**
   * Draw the targeting arrows around this token.
   * @param {ReticuleOptions} [reticule]  Additional parameters to configure how the targeting reticule is drawn.
   * @protected
   */
  _drawTargetArrows({margin: m=0, alpha=1, size, color, border: {width=2, color: lineColor=0}={}}={}) {
    size ??= CONFIG.Canvas.targeting.size;
    this.targetArrows.clear();

    // We don't show the target arrows for a secret token disposition, non-GM users or for other users.
    if ( !this.targeted.size || !this.targeted.has(game.user) ) return;

    const l = size * 100 * canvas.dimensions.uiScale; // Side length.
    const {h, w} = this;
    const lineStyle = {color: lineColor, alpha, width, cap: PIXI.LINE_CAP.ROUND, join: PIXI.LINE_JOIN.BEVEL};
    color ??= this.#getBorderColor();
    m *= l * -1;
    this.targetArrows.beginFill(color, alpha).lineStyle(lineStyle)
      .drawPolygon([-m, -m, -m-l, -m, -m, -m-l]) // Top left
      .drawPolygon([w+m, -m, w+m+l, -m, w+m, -m-l]) // Top right
      .drawPolygon([-m, h+m, -m-l, h+m, -m, h+m+l]) // Bottom left
      .drawPolygon([w+m, h+m, w+m+l, h+m, w+m, h+m+l]); // Bottom right
  }

  /* -------------------------------------------- */

  /**
   * Draw the targeting pips around this token.
   * @protected
   */
  _drawTargetPips() {
    this.targetPips.clear();

    // We don't show the target arrows for a secret token disposition and non-GM users
    if ( !this.targeted.size ) return;

    // Get other users targeting this token
    const otherUsers = Array.from(this.targeted).filter(u => u !== game.user);
    if ( !otherUsers.length ) return;

    // For other users, draw offset pips
    const s = canvas.dimensions.uiScale;
    const hw = (this.w / 2) + (otherUsers.length % 2 === 0 ? 8 : 0);
    for ( const [i, u] of otherUsers.entries() ) {
      const offset = Math.floor((i+1) / 2) * 16;
      const sign = i % 2 === 0 ? 1 : -1;
      const x = hw + (sign * offset);
      this.targetPips.beginFill(u.color, 1.0).lineStyle(2 * s, 0x0000000).drawCircle(x, 0, 6 * s);
    }
  }

  /* -------------------------------------------- */

  /**
   * Refresh the display of Token attribute bars, rendering its latest resource data.
   * If the bar attribute is valid (has a value and max), draw the bar. Otherwise hide it.
   */
  drawBars() {
    if ( !this.actor || (this.document.displayBars === TOKEN_DISPLAY_MODES.NONE) ) return;
    ["bar1", "bar2"].forEach((b, i) => {
      const bar = this.bars[b];
      const attr = this.document.getBarAttribute(b);
      if ( !attr || (attr.type !== "bar") || (attr.max === 0) ) return bar.visible = false;
      this._drawBar(i, bar, attr);
      bar.visible = true;
    });
  }

  /* -------------------------------------------- */

  /**
   * Draw a single resource bar, given provided data
   * @param {number} number       The Bar number
   * @param {PIXI.Graphics} bar   The Bar container
   * @param {Object} data         Resource data for this bar
   * @protected
   */
  _drawBar(number, bar, data) {
    const val = Number(data.value);
    const pct = Math.clamp(val, 0, data.max) / data.max;

    // Determine sizing
    const {width, height} = this.document.getSize();
    const s = canvas.dimensions.uiScale;
    const bw = width;
    const bh = 8 * (this.document.height >= 2 ? 1.5 : 1) * s;

    // Determine the color to use
    let color;
    if ( number === 0 ) color = Color.fromRGB([1 - (pct / 2), pct, 0]);
    else color = Color.fromRGB([0.5 * pct, 0.7 * pct, 0.5 + (pct / 2)]);

    // Draw the bar
    bar.clear();
    bar.lineStyle(s, 0x000000, 1.0);
    bar.beginFill(0x000000, 0.5).drawRoundedRect(0, 0, bw, bh, 3 * s);
    bar.beginFill(color, 1.0).drawRoundedRect(0, 0, pct * bw, bh, 2 * s);

    // Set position
    const posY = number === 0 ? height - bh : 0;
    bar.position.set(0, posY);
    return true;
  }

  /* -------------------------------------------- */

  /**
   * Draw the token's nameplate as a text object
   * @returns {PreciseText}    The Text object for the Token nameplate
   */
  #drawNameplate() {
    const s = canvas.dimensions.uiScale;
    const nameplate = new PreciseText(this.document.name, this._getTextStyle());
    nameplate.anchor.set(0.5, 0);
    nameplate.scale.set(s, s);
    return nameplate;
  }

  /* -------------------------------------------- */

  /**
   * Draw a text tooltip for the token which can be used to display Elevation or a resource value
   * @returns {PreciseText}     The text object used to render the tooltip
   */
  #drawTooltip() {
    const s = canvas.dimensions.uiScale;
    const tooltip = new PreciseText(this._getTooltipText(), this._getTextStyle());
    tooltip.anchor.set(0.5, 1);
    tooltip.scale.set(s, s);
    return tooltip;
  }

  /* -------------------------------------------- */

  /**
   * Return the text which should be displayed in a token's tooltip field
   * @returns {string}
   * @protected
   */
  _getTooltipText() {
    const elevation = this.document.elevation.toNearest(0.01);
    if ( !Number.isFinite(elevation) || (elevation === 0) ) return "";
    return `${elevation.signedString()} ${canvas.grid.units}`.trim();
  }

  /* -------------------------------------------- */

  /**
   * Get the text style that should be used for this Token's tooltip.
   * @returns {PIXI.TextStyle}
   * @protected
   */
  _getTextStyle() {
    const style = CONFIG.canvasTextStyle.clone();
    style.fontSize = 24;
    style.wordWrapWidth = this.w * 2.5;
    return style;
  }

  /* -------------------------------------------- */

  /**
   * Draw the effect icons for ActiveEffect documents which apply to the Token's Actor.
   */
  async drawEffects() {
    return this._partialDraw(() => this._drawEffects());
  }

  /* -------------------------------------------- */

  /**
   * Draw the effect icons for ActiveEffect documents which apply to the Token's Actor.
   * Called by {@link Token#drawEffects}.
   * @protected
   */
  async _drawEffects() {
    this.effects.renderable = false;

    // Clear Effects Container
    this.effects.removeChildren().forEach(c => c.destroy());
    this.effects.bg = this.effects.addChild(new PIXI.Graphics());
    this.effects.bg.zIndex = -1;
    this.effects.overlay = null;

    // Categorize effects
    const activeEffects = this.actor?.temporaryEffects || [];
    const overlayEffect = activeEffects.findLast(e => e.img && e.getFlag("core", "overlay"));

    // Draw effects
    const promises = [];
    for ( const [i, effect] of activeEffects.entries() ) {
      if ( !effect.img ) continue;
      const promise = effect === overlayEffect
        ? this._drawOverlay(effect.img, effect.tint)
        : this._drawEffect(effect.img, effect.tint);
      promises.push(promise.then(e => {
        if ( e ) e.zIndex = i;
      }));
    }
    await Promise.allSettled(promises);

    this.effects.sortChildren();
    this.effects.renderable = true;
    this.renderFlags.set({refreshEffects: true});
  }

  /* -------------------------------------------- */

  /**
   * Draw a status effect icon
   * @param {string} src
   * @param {PIXI.ColorSource|null} tint
   * @returns {Promise<PIXI.Sprite|undefined>}
   * @protected
   */
  async _drawEffect(src, tint) {
    if ( !src ) return;
    const tex = await loadTexture(src, {fallback: "icons/svg/hazard.svg"});
    const icon = new PIXI.Sprite(tex);
    icon.tint = tint ?? 0xFFFFFF;
    return this.effects.addChild(icon);
  }

  /* -------------------------------------------- */

  /**
   * Draw the overlay effect icon
   * @param {string} src
   * @param {number|null} tint
   * @returns {Promise<PIXI.Sprite>}
   * @protected
   */
  async _drawOverlay(src, tint) {
    const icon = await this._drawEffect(src, tint);
    if ( icon ) icon.alpha = 0.8;
    this.effects.overlay = icon ?? null;
    return icon;
  }

  /* -------------------------------------------- */

  /**
   * Refresh the display of status effects, adjusting their position for the token width and height.
   * @protected
   */
  _refreshEffects() {
    const s = canvas.dimensions.uiScale;
    let i = 0;
    const size = 20 * s;
    const rows = Math.floor((this.document.getSize().height / size) + 1e-6);
    const bg = this.effects.bg.clear().beginFill(0x000000, 0.40).lineStyle(s, 0x000000);
    for ( const effect of this.effects.children ) {
      if ( effect === bg ) continue;

      // Overlay effect
      if ( effect === this.effects.overlay ) {
        const {width, height} = this.document.getSize();
        const size = Math.min(width * 0.6, height * 0.6);
        effect.width = effect.height = size;
        effect.position = this.document.getCenterPoint({x: 0, y: 0});
        effect.anchor.set(0.5, 0.5);
      }

      // Status effect
      else {
        effect.width = effect.height = size;
        effect.x = Math.floor(i / rows) * size;
        effect.y = (i % rows) * size;
        bg.drawRoundedRect(effect.x + s, effect.y + s, size - (2 * s), size - (2 * s), 2 * s);
        i++;
      }
    }
  }

  /* -------------------------------------------- */

  /**
   * Refresh presentation of the Token's combat turn marker, if any.
   * @protected
   */
  _refreshTurnMarker() {

    // Should a Turn Marker be active?
    const {turnMarker} = this.document;
    const markersEnabled = CONFIG.Combat.settings.turnMarker.enabled
      && (turnMarker.mode !== CONST.TOKEN_TURN_MARKER_MODES.DISABLED);
    const c = game.combat?.active ? game.combat.combatant : null;
    const isTurn = c && (c.tokenId === this.id);
    const markerActive = markersEnabled && isTurn;

    // Activate a Turn Marker
    if ( markerActive ) {
      if ( !this.turnMarker ) this.turnMarker = this.addChildAt(new TokenTurnMarker(this), 0);
      canvas.tokens.turnMarkers.add(this);
      this.turnMarker.draw();
    }

    // Remove a Turn Marker
    else if ( this.turnMarker ) {
      canvas.tokens.turnMarkers.delete(this);
      this.turnMarker.destroy();
      this.turnMarker = null;
    }
  }

  /* -------------------------------------------- */

  /**
   * Refresh the display of the ruler.
   * @protected
   */
  _refreshRuler() {
    if ( !this.ruler ) return;
    const movement = this.document.movement;
    let passedWaypoints;
    let pendingWaypoints;
    if ( movement.showRuler && ((movement.state === "pending") || (movement.state === "paused")
      || this.animationContexts.has(this.movementAnimationName)) ) {
      passedWaypoints = [
        ...movement.history.recorded.waypoints,
        ...movement.history.unrecorded.waypoints,
        ...movement.passed.waypoints
      ];
      if ( (movement.state === "pending") || (movement.state === "paused") ) pendingWaypoints = movement.pending.waypoints;
      else pendingWaypoints = [];
    } else {
      passedWaypoints = this.document.movementHistory;
      pendingWaypoints = [];
    }
    const plannedMovement = {};
    for ( const [userId, movement] of Object.entries(this._plannedMovement) ) {
      if ( movement.hidden && (userId !== game.user.id) ) continue;
      plannedMovement[userId] = movement;
    }
    this.ruler.refresh({passedWaypoints, pendingWaypoints, plannedMovement});
  }

  /* -------------------------------------------- */

  /**
   * Helper method to determine whether a token attribute is viewable under a certain mode
   * @param {TokenDisplayMode} mode   The mode from {@link CONST.TOKEN_DISPLAY_MODES}
   * @returns {boolean}                  Is the attribute viewable?
   * @protected
   */
  _canViewMode(mode) {
    if ( mode === TOKEN_DISPLAY_MODES.NONE ) return false;
    else if ( mode === TOKEN_DISPLAY_MODES.ALWAYS ) return true;
    else if ( mode === TOKEN_DISPLAY_MODES.CONTROL ) return this.controlled;
    else if ( mode === TOKEN_DISPLAY_MODES.HOVER ) return this.hover || this.layer.highlightObjects;
    else if ( mode === TOKEN_DISPLAY_MODES.OWNER_HOVER ) return this.isOwner
      && (this.hover || this.layer.highlightObjects);
    else if ( mode === TOKEN_DISPLAY_MODES.OWNER ) return this.isOwner;
    return false;
  }

  /* -------------------------------------------- */
  /*  Token Ring                                  */
  /* -------------------------------------------- */

  /**
   * Override ring colors for this particular Token instance.
   * @returns {{[ring]: Color, [background]: Color}}
   */
  getRingColors() {
    return {};
  }

  /* -------------------------------------------- */

  /**
   * Apply additional ring effects for this particular Token instance.
   * Effects are returned as an array of integers in {@link foundry.canvas.placeables.tokens.TokenRing.effects}.
   * @returns {number[]}
   */
  getRingEffects() {
    return [];
  }

  /* -------------------------------------------- */
  /*  Token Animation                             */
  /* -------------------------------------------- */

  /**
   * Get the animation data for the current state of the document.
   * @returns {TokenAnimationData}         The target animation data object
   * @protected
   */
  _getAnimationData() {
    const doc = this.document;
    const {x, y, elevation, width, height, rotation, alpha} = doc;
    const {src, anchorX, anchorY, scaleX, scaleY, tint} = doc.texture;
    const texture = {src, anchorX, anchorY, scaleX, scaleY, tint};
    const subject = {
      texture: doc.ring.subject.texture,
      scale: doc.ring.subject.scale
    };
    return {x, y, elevation, width, height, rotation, alpha, texture, ring: {subject}};
  }

  /* -------------------------------------------- */

  /**
   * Animate from the old to the new state of this Token.
   * @param {Partial<TokenAnimationData>} to      The animation data to animate to
   * @param {TokenAnimationOptions} [options]     The options that configure the animation behavior
   * @returns {Promise<void>}                     A promise which resolves once the animation has finished or stopped
   */
  animate(to, options={}) {
    return this.#animate(to, options, false);
  }

  /* -------------------------------------------- */

  /**
   * Animate from the old to the new state of this Token.
   * @param {Partial<TokenAnimationData>} to    The animation data to animate to
   * @param {TokenAnimationOptions} options     The options that configure the animation behavior
   * @param {boolean} chained                   Is this animation being chained to the current context?
   * @returns {Promise<void>}                   A promise which resolves once the animation has finished or stopped
   */
  #animate(to, options, chained) {

    /** @deprecated since v12 */
    if ( "a0" in options ) {
      const msg = "Passing a0 to Token#animate is deprecated without replacement.";
      foundry.utils.logCompatibilityWarning(msg, {since: 12, until: 14});
    }

    // Get the name and the from and to animation data
    let name = options.name;
    if ( name === undefined ) name = this.animationName;
    else name ||= Symbol(this.animationName);
    let from = this.#animationData;
    to = foundry.utils.filterObject(to, this.#animationData);
    let context = this.#animationContexts.get(name);

    // Use default options of movement action
    if ( TokenDocument._isMovementUpdate(to, from) ) {
      options = {...options};
      options.action ??= this.document.movementAction;
      const defaults = CONFIG.Token.movement.actions[options.action].getAnimationOptions(this);
      for ( const key in defaults ) options[key] ??= defaults[key];
    }

    let duration = options.duration;

    // Chain to exiting animation if requested
    if ( context && options.chain ) {

      // Get the animation duration ahead of time
      if ( duration === undefined ) {
        from = foundry.utils.mergeObject(from, context.to, {inplace: false});
        for ( const {to} of context.chain ) foundry.utils.mergeObject(from, to);
        const changes = foundry.utils.diffObject(from, to);
        duration = (foundry.utils.isEmpty(changes) ? 0 : this._getAnimationDuration(from, to, options));
      }

      let chainLink;
      const chainPromise = new Promise((resolve, reject) => {
        chainLink = {to, options: {...options, duration, chain: false}, promise: null, resolve, reject};
        context.chain.push(chainLink);
      });
      chainLink.promise = chainPromise;
      return chainPromise;
    }

    let chain;
    let time;

    // This animation was chained to the current context
    if ( chained ) {
      chain = context.chain;
      time = context.time - context.duration;
      this.#animationContexts.delete(name);
      for ( const fn of context.postAnimate ) fn(context);

      // Resolve current animation before the chained animation starts
      const animation = CanvasAnimation.getAnimation(name);
      animation?.resolve(true);
    }

    // Otherwise merge into existing animation if there is one
    else {
      if ( context ) to = foundry.utils.mergeObject(context.to, to, {inplace: false});

      // Conclude the current animation
      if ( context ) this.#animationContexts.delete(name);
      CanvasAnimation.terminateAnimation(name);
      if ( context ) {
        for ( const fn of context.postAnimate ) fn(context);
        for ( const {resolve} of context.chain ) resolve();
      }

      chain = [];
      time = 0;
    }

    // Compute animation data changes
    const changes = foundry.utils.diffObject(from, to);

    // Get the animation duration and create the animation context
    duration ??= (foundry.utils.isEmpty(changes) ? 0 : this._getAnimationDuration(from, to, options));
    let resolve;
    context = {name, chain, to, duration, time: 0, preAnimate: [], postAnimate: [], onAnimate: [],
      promise: new Promise(r => { resolve = r; })};

    // Set the animation context
    this.#animationContexts.set(name, context);

    // Prepare the animation data changes
    const attributes = this._prepareAnimation(from, changes, context, options);

    // Dispatch the animation
    const {easing, ontick} = options;
    CanvasAnimation.animate(attributes, {
      name,
      context: this,
      time,
      duration,
      easing,
      priority: PIXI.UPDATE_PRIORITY.OBJECTS + 1, // Before perception updates and Token render flags
      wait: context.preAnimate.length !== 0 ? Promise.all(context.preAnimate.map(fn => fn(context))) : undefined,
      ontick: (elapsedMS, animation) => {
        context.time = animation.time;
        if ( ontick ) ontick(elapsedMS, animation, this.#animationData);
        this.#animateFrame(context);
      }
    }).finally(() => {
      if ( this.#animationContexts.get(name) === context ) {
        this.#animationContexts.delete(name);
        for ( const fn of context.postAnimate ) fn(context);
        for ( const {resolve} of context.chain ) resolve();
      }
      resolve();
    });
    return context.promise;
  }

  /* -------------------------------------------- */

  /**
   * Get the duration of the animation.
   * @param {DeepReadonly<TokenAnimationData>} from           The animation data to animate from
   * @param {DeepReadonly<Partial<TokenAnimationData>>} to    The animation data to animate to
   * @param {TokenAnimationOptions} options                   The options that configure the animation behavior
   * @returns {number}                                        The duration of the animation in milliseconds
   * @protected
   */
  _getAnimationDuration(from, to, options) {
    let duration;
    if ( TokenDocument._isMovementUpdate(to, from) ) {
      const movementSpeed = this._modifyAnimationMovementSpeed(options.movementSpeed
        ?? this._getAnimationMovementSpeed(options), options);
      duration = Token.#getMovementAnimationDuration(from, to, movementSpeed);
    }
    const dr = from.rotation - (to.rotation ?? from.rotation);
    if ( dr ) {
      duration ??= 0;
      if ( this._requiresRotationAnimation() ) {
        const rotationSpeed = this._getAnimationRotationSpeed(options);
        duration = Math.max(duration, Math.abs(((Math.abs(dr) + 180) % 360) - 180) / (rotationSpeed * 60) * 1000);
      }
    }
    return duration ?? 1000; // The default animation duration is 1 second
  }

  /* -------------------------------------------- */

  /**
   * Get the base movement speed for the animation in grid size per second.
   * The default implementation returns `CONFIG.Token.movement.defaultSpeed`.
   * @param {TokenAnimationOptions} options                   The options that configure the animation behavior
   * @returns {number}                                        The base movement speed in grid size per second
   * @protected
   */
  _getAnimationMovementSpeed(options) {
    return CONFIG.Token.movement.defaultSpeed;
  }

  /* -------------------------------------------- */

  /**
   * Modify the base movement speed of the animation.
   * Divides by the terrain difficulty, if present, by default.
   * @param {number} speed                                    The base movement speed in grid size per second
   * @param {TokenAnimationOptions} options                   The options that configure the animation behavior
   * @returns {number}                                        The modified movement speed in grid size per second
   * @protected
   */
  _modifyAnimationMovementSpeed(speed, options) {
    if ( options.terrain instanceof foundry.data.TerrainData ) speed /= Math.min(options.terrain.difficulty, 10);
    return speed;
  }

  /* -------------------------------------------- */

  /**
   * Calculate the movement animation duration.
   * @param {Omit<TokenPosition, "elevation"|"shape">} from           The from-position
   * @param {Partial<Omit<TokenPosition, "elevation"|"shape">>} to    The (partial) to-position
   * @param {number} movementSpeed                                    The movement speed
   * @returns {number}                                                The movement animation duration
   */
  static #getMovementAnimationDuration(from, to, movementSpeed) {
    const dx = from.x - (to.x ?? from.x);
    const dy = from.y - (to.y ?? from.y);
    const dw = from.width - (to.width ?? from.width);
    const dh = from.height - (to.height ?? from.height);
    return Math.max(Math.hypot(dx, dy) / canvas.dimensions.size, Math.hypot(dw, dh) * 0.5) / movementSpeed * 1000;
  }

  /* -------------------------------------------- */

  /**
   * Configure the animation movement speed based on the given animation duration.
   * @param {DatabaseUpdateOperation} operation    The update operation
   * @param {TokenPosition} origin                 The origin
   * @param {TokenMovementWaypoint[]} waypoints    The candidante waypoints
   * @param {TokenDocument} document               The token document
   * @internal
   */
  static _configureAnimationMovementSpeed(operation, origin, waypoints, document) {
    if ( !document.rendered ) return;
    const animationDuration = operation.animation?.duration;
    if ( (animationDuration === undefined) || (operation.animation.movementSpeed !== undefined) ) return;
    if ( animationDuration === 0 ) operation.animation.movementSpeed = Number.MAX_VALUE;
    else {
      let normalizedDuration = 0;
      let previousWaypoint = origin;
      for ( const waypoint of waypoints ) {
        if ( CONFIG.Token.movement.actions[waypoint.action].getAnimationOptions(document.object).duration !== 0 ) {
          normalizedDuration += this.#getMovementAnimationDuration(previousWaypoint, waypoint, 1);
        }
        previousWaypoint = waypoint;
      }
      if ( normalizedDuration !== 0 ) {
        operation.animation.movementSpeed = Math.min(normalizedDuration / animationDuration, Number.MAX_VALUE);
      }
    }
  }

  /* -------------------------------------------- */

  /**
   * Get the rotation speed for the animation in 60 degrees per second.
   * Returns the movement speed by default.
   * @param {TokenAnimationOptions} options                   The options that configure the animation behavior
   * @returns {number}                                        The rotation speed in 60 degrees per second
   * @protected
   */
  _getAnimationRotationSpeed(options) {
    return options.movementSpeed ?? this._getAnimationMovementSpeed(options);
  }

  /* -------------------------------------------- */

  /**
   * Does this Token require rotation changes to be animated?
   * If false is returned, the rotation speed is set to infinity.
   * @returns {boolean}
   * @protected
   */
  _requiresRotationAnimation() {
    return !this.document.lockRotation || this.hasLimitedSourceAngle;
  }

  /* -------------------------------------------- */

  /**
   * Handle a single frame of a token animation.
   * @param {TokenAnimationContext} context    The animation context
   */
  #animateFrame(context) {
    const completed = context.time >= context.duration;
    if ( completed ) foundry.utils.mergeObject(this.#animationData, context.to);
    const animationData = foundry.utils.filterObject(this.#animationData, context.to);
    const changed = foundry.utils.diffObject(this.#priorAnimationData, animationData);
    foundry.utils.mergeObject(this.#priorAnimationData, changed);
    foundry.utils.mergeObject(this.document, this.#animationData, {insertKeys: false});
    for ( const fn of context.onAnimate ) fn(context);
    this._onAnimationUpdate(changed, context);
    if ( completed ) this.#completeAnimation(context);
  }

  /* -------------------------------------------- */

  /**
   * Complete the token animation.
   * @param {TokenAnimationContext} context    The animation context
   */
  #completeAnimation(context) {
    if ( context.chain.length === 0 ) {
      this.#animationContexts.delete(context.name);
      for ( const fn of context.postAnimate ) fn(context);
    } else {
      const {to, options, resolve} = context.chain.shift();
      // noinspection ES6MissingAwait
      this.#animate(to, options, true).finally(resolve);
    }
  }

  /* -------------------------------------------- */

  /**
   * Called each animation frame.
   * @param {Partial<TokenAnimationData>} changed    The animation data that changed
   * @param {TokenAnimationContext} context          The animation context
   * @protected
   */
  _onAnimationUpdate(changed, context) {
    const positionChanged = ("x" in changed) || ("y" in changed);
    const elevationChanged = "elevation" in changed;
    const rotationChanged = "rotation" in changed;
    const sizeChanged = ("width" in changed) || ("height" in changed);
    const textureChanged = "texture" in changed;
    const ringEnabled = this.document.ring.enabled;
    const ringChanged = "ring" in changed;
    const ringSubjectChanged = ringEnabled && ringChanged && ("subject" in changed.ring);
    const ringSubjectTextureChanged = ringSubjectChanged && ("texture" in changed.ring.subject);
    const ringSubjectScaleChanged = ringSubjectChanged && ("scale" in changed.ring.subject);
    this.renderFlags.set({
      redraw: (textureChanged && ("src" in changed.texture)) || ringSubjectTextureChanged,
      refreshVisibility: positionChanged || sizeChanged,
      refreshPosition: positionChanged,
      refreshElevation: elevationChanged,
      refreshRotation: rotationChanged && !this.document.lockRotation,
      refreshSize: sizeChanged || ringSubjectScaleChanged,
      refreshMesh: textureChanged || ("alpha" in changed)
    });

    // Update occlusion and/or sounds and the HUD if necessary
    if ( positionChanged || elevationChanged || sizeChanged ) {
      canvas.perception.update({refreshSounds: true, refreshOcclusionMask: true, refreshOcclusionStates: true});
      if ( this.hasActiveHUD ) this.layer.hud.setPosition();
    }

    // Update light and sight sources unless Vision Animation is disabled
    if ( !game.settings.get("core", "visionAnimation") ) return;
    const perspectiveChanged = positionChanged || elevationChanged || sizeChanged
      || (rotationChanged && this.hasLimitedSourceAngle);
    const visionChanged = perspectiveChanged && this.hasSight;
    const lightChanged = perspectiveChanged && this._isLightSource();
    if ( visionChanged || lightChanged ) this.initializeSources();
  }

  /* -------------------------------------------- */

  /**
   * Terminate the animations of this particular Token, if exists.
   * @param {object} [options]                Additional options.
   * @param {boolean} [options.reset=true]    Reset the TokenDocument?
   */
  stopAnimation({reset=true}={}) {
    if ( reset ) this.document.reset();
    for ( const [name, context] of this.#animationContexts.entries() ) {
      CanvasAnimation.terminateAnimation(name);
      for ( const fn of context.postAnimate ) fn(context);
      for ( const {resolve} of context.chain ) resolve();
    }
    this.#animationContexts.clear();
    const to = this._getAnimationData();
    const changes = foundry.utils.diffObject(this.#animationData, to);
    foundry.utils.mergeObject(this.#animationData, to);
    foundry.utils.mergeObject(this.#priorAnimationData, this.#animationData);
    if ( foundry.utils.isEmpty(changes) ) return;
    const context = {name: Symbol(this.animationName), chain: [], to, duration: 0, time: 0,
      preAnimate: [], postAnimate: [], onAnimate: [], promise: Promise.resolve()};
    this.#animationContexts.set(context.name, context);
    this._onAnimationUpdate(changes, context);
    this.#animationContexts.clear();
  }

  /* -------------------------------------------- */
  /*  Animation Preparation Methods               */
  /* -------------------------------------------- */

  /**
   * Handle the rotation changes for the animation, ensuring the shortest rotation path.
   * @param {DeepReadonly<TokenAnimationData>} from    The animation data to animate from
   * @param {Partial<TokenAnimationData>} changes      The animation data changes
   */
  static #handleRotationChanges(from, changes) {
    if ( "rotation" in changes ) {
      let dr = changes.rotation - from.rotation;
      while ( dr > 180 ) dr -= 360;
      while ( dr < -180 ) dr += 360;
      changes.rotation = from.rotation + dr;
    }
  }

  /* -------------------------------------------- */

  /**
   * Update the padding for both the source and target tokens to ensure they are square.
   * @param {PrimarySpriteMesh} sourceMesh  The source mesh
   * @param {PrimarySpriteMesh} targetMesh  The target mesh
   */
  static #updatePadding(sourceMesh, targetMesh) {
    const calculatePadding = ({width, height}) => ({
      x: width > height ? 0 : (height - width) / 2,
      y: height > width ? 0 : (width - height) / 2
    });

    const paddingSource = calculatePadding(sourceMesh.texture);
    sourceMesh.paddingX = paddingSource.x;
    sourceMesh.paddingY = paddingSource.y;

    const paddingTarget = calculatePadding(targetMesh.texture);
    targetMesh.paddingX = paddingTarget.x;
    targetMesh.paddingY = paddingTarget.y;
  }

  /* -------------------------------------------- */

  /**
   * Create a texture transition filter with the given options.
   * @param {TokenAnimationOptions} options    The options that configure the animation behavior
   * @returns {TextureTransitionFilter}        The created filter
   */
  #createTransitionFilter(options) {
    const filter = TextureTransitionFilter.create();
    filter.enabled = false;
    filter.type = options.transition ?? this._getAnimationTransition(options);
    return filter;
  }

  /* -------------------------------------------- */

  /**
   * Get the texture transition type.
   * Returns `"fade"` by default.
   * @param {TokenAnimationOptions} options    The options that configure the animation behavior
   * @returns {TokenAnimationTransition}       The transition type
   * @protected
   */
  _getAnimationTransition(options) {
    return "fade";
  }

  /* -------------------------------------------- */

  /**
   * Prepare the animation data changes: performs special handling required for animating rotation.
   * @param {DeepReadonly<TokenAnimationData>} from             The animation data to animate from
   * @param {Partial<TokenAnimationData>} changes               The animation data changes
   * @param {Omit<TokenAnimationContext, "promise">} context    The animation context
   * @param {TokenAnimationOptions} options                     The options that configure the animation behavior
   * @returns {CanvasAnimationAttribute[]}                      The animation attributes
   * @protected
   */
  _prepareAnimation(from, changes, context, options) {
    const attributes = [];

    // TODO: handle teleportation
    Token.#handleRotationChanges(from, changes);
    this.#handleTransitionChanges(changes, context, options, attributes);

    // Create animation attributes from the changes
    const recur = (changes, parent) => {
      for ( const [attribute, to] of Object.entries(changes) ) {
        const type = foundry.utils.getType(to);
        if ( type === "Object" ) recur(to, parent[attribute]);
        else if ( type === "number" || type === "Color" ) attributes.push({attribute, parent, to});
      }
    };
    recur(changes, this.#animationData);
    return attributes;
  }

  /* -------------------------------------------- */

  /**
   * Handle the transition changes, creating the necessary filter and preparing the textures.
   * @param {Partial<TokenAnimationData>} changes               The animation data that changed
   * @param {Omit<TokenAnimationContext, "promise">} context    The animation context
   * @param {TokenAnimationOptions} options                     The options that configure the animation behavior
   * @param {CanvasAnimationAttribute[]} attributes             The array to push animation attributes to
   */
  #handleTransitionChanges(changes, context, options, attributes) {
    const textureChanged = ("texture" in changes) && ("src" in changes.texture);
    const ringEnabled = this.document.ring.enabled;
    const subjectTextureChanged = ringEnabled && ("ring" in changes) && ("subject" in changes.ring) && ("texture" in changes.ring.subject);

    // If no texture has changed, no need for a transition
    if ( !(textureChanged || subjectTextureChanged) ) return;

    const filter = this.#createTransitionFilter(options);
    let renderTexture;
    let targetMesh;
    let targetToken;

    if ( this.mesh ) {
      this.mesh.filters ??= [];
      this.mesh.filters.unshift(filter);
    }

    context.preAnimate.push(async context => {
      const targetAsset = !ringEnabled ? changes.texture.src
        : (subjectTextureChanged ? changes.ring.subject.texture : this.document.ring.subject.texture);
      const targetTexture = await loadTexture(targetAsset, {fallback: CONST.DEFAULT_TOKEN});
      targetToken = this.#prepareTargetToken(targetTexture);

      // Create target primary sprite mesh and assign to the target token
      targetMesh = new PrimarySpriteMesh({object: targetToken});
      targetMesh.texture = targetTexture;
      targetToken.mesh = targetMesh;

      // Prepare source and target meshes and shader class
      if ( ringEnabled ) {
        targetToken.#ring = new CONFIG.Token.ring.ringClass(targetToken);
        targetToken.#ring.configure(targetMesh);
        targetMesh.setShaderClass(CONFIG.Token.ring.shaderClass);
      }
      else {
        Token.#updatePadding(this.mesh, targetMesh);
        targetMesh.setShaderClass(PrimaryBaseSamplerShader);
      }

      // Prepare mesh position for rendering
      targetMesh.position.set(targetMesh.paddingX, targetMesh.paddingY);

      // Configure render texture and render the target mesh into it
      const renderer = canvas.app.renderer;
      renderTexture = renderer.generateTexture(targetMesh, {resolution: targetMesh.texture.resolution});

      // Add animation function if ring effects are enabled
      if ( targetToken.hasDynamicRing && (this.document.ring.effects > CONFIG.Token.ring.ringClass.effects.ENABLED) ) {
        context.onAnimate.push(function() {
          canvas.app.renderer.render(targetMesh, {renderTexture});
        });
      }

      // Preparing the transition filter
      filter.targetTexture = renderTexture;
      filter.enabled = true;
    });

    context.postAnimate.push(async context => {
      await Promise.resolve();
      // Clean up after the current tick because the redraw triggered by _onAnimationUpdate
      // won't take effect in the last frame of the animation
      targetMesh?.destroy();
      renderTexture?.destroy(true);
      targetToken?.destroy({children: true});
      this.mesh?.filters?.findSplice(f => f === filter);
      if ( !this.hasDynamicRing && this.mesh ) this.mesh.padding = 0;
    });

    attributes.push({attribute: "progress", parent: filter.uniforms, to: 1});
  }

  /* -------------------------------------------- */

  /**
   * Prepare a target token by cloning the current token and setting its texture.
   * @param {PIXI.Texture} targetTexture  The texture to set on the target token
   * @returns {Token}  The prepared target token
   */
  #prepareTargetToken(targetTexture) {
    const cloneDoc = this.document.clone();
    const clone = cloneDoc.object;
    clone.texture = targetTexture;
    return clone;
  }

  /* -------------------------------------------- */
  /*  Methods
  /* -------------------------------------------- */

  /**
   * Get the drop position for the given token.
   * @param {TokenDocument} token
   * @param {{x: number; y: number; elevation?: number}} point
   * @param {object} [options]
   * @param {boolean} [options.snap=false]
   * @returns {TokenPosition}
   * @see {@link foundry.canvas.layers.TokenLayer#_onDropActorData}
   * @internal
   */
  static _getDropActorPosition(token, point, {snap=false}={}) {
    const {width, height, shape} = token._source;
    const pivot = token.getCenterPoint({x: 0, y: 0, elevation: 0, width, height, shape});
    let position = {
      x: point.x - pivot.x,
      y: point.y - pivot.y,
      elevation: (point.elevation ?? 0) - pivot.elevation,
      width, height, shape
    };
    if ( snap ) position = token.getSnappedPosition(position);
    position.x = Math.round(position.x);
    position.y = Math.round(position.y);
    position.width = width;
    position.height = height;
    position.shape = shape;
    return position;
  }

  /* -------------------------------------------- */

  /**
   * Check for collision when attempting a move to a new position.
   *
   * The result of this function must not be affected by the animation of this Token.
   * @param {Point|ElevatedPoint} destination         The central destination point of the attempted movement.
   *                                                  The elevation defaults to the elevation of the origin.
   * @param {object} [options={}]                     Additional options forwarded to PointSourcePolygon.testCollision
   * @param {Point|ElevatedPoint} [options.origin]    The origin to be used instead of the current origin. The elevation
   *                                                  defaults to the current elevation.
   * @param {PointSourcePolygonType} [options.type="move"]    The collision type
   * @param {"any"|"all"|"closest"} [options.mode="any"]      The collision mode to test: "any", "all", or "closest"
   * @returns {boolean|PolygonVertex|PolygonVertex[]|null}    The collision result depends on the mode of the test:
   *                                                * any: returns a boolean for whether any collision occurred
   *                                                * all: returns a sorted array of PolygonVertex instances
   *                                                * closest: returns a PolygonVertex instance or null
   */
  checkCollision(destination, {origin, type="move", mode="any"}={}) {

    // Round origin and destination such that the top-left point (i.e. the Token's position) is integer
    const {elevation, width, height, shape} = this.document._source;
    const {x: cx, y: cy} = this.document.getCenterPoint({x: 0, y: 0, elevation, width, height, shape});
    if ( !origin ) origin = this.document.getCenterPoint(this.document._source);
    else {
      origin = {
        x: Math.round(origin.x - cx) + cx,
        y: Math.round(origin.y - cy) + cy,
        elevation: origin.elevation ?? elevation
      };
    }
    destination = {
      x: Math.round(destination.x - cx) + cx,
      y: Math.round(destination.y - cy) + cy,
      elevation: destination.elevation ?? origin.elevation
    };

    // The test destination is the adjusted point based on the proposed movement vector
    const dx = destination.x - origin.x;
    const dy = destination.y - origin.y;
    const offsetX = dx === 0 ? this.#centerOffset.x : Math.sign(dx);
    const offsetY = dy === 0 ? this.#centerOffset.y : Math.sign(dy);
    destination = this.getMovementAdjustedPoint(destination, {offsetX, offsetY});
    origin = this.getMovementAdjustedPoint(origin);

    // Reference the correct source object
    let source;
    switch ( type ) {
      case "move":
        source = this.#getMovementSource(origin); break;
      case "sight":
        source = this.vision; break;
      case "light":
        source = this.light; break;
      case "sound":
        throw new Error("Collision testing for Token sound sources is not supported at this time");
    }

    // Create a movement source passed to the polygon backend
    return CONFIG.Canvas.polygonBackends[type].testCollision(origin, destination, {type, mode, source});
  }

  /* -------------------------------------------- */

  /**
   * Prepare a PointMovementSource for the document
   * @param {ElevatedPoint} origin        The origin of the source
   * @returns {PointMovementSource}
   */
  #getMovementSource(origin) {
    const movement = new PointMovementSource({object: this});
    movement.initialize(origin);
    return movement;
  }

  /* -------------------------------------------- */

  /**
   * Get the shape of this Token.
   * @returns {PIXI.Rectangle|PIXI.Polygon|PIXI.Circle|PIXI.Ellipse}
   */
  getShape() {
    if ( this.scene.grid.isGridless ) {
      const {width, height} = this.document.getSize();
      const shape = this.document.shape;
      if ( (shape === TOKEN_SHAPES.ELLIPSE_1) || (shape === TOKEN_SHAPES.ELLIPSE_2) ) {
        if ( width === height ) {
          const radius = width / 2;
          return new PIXI.Circle(radius, radius, radius);
        }
        const radiusX = width / 2;
        const radiusY = height / 2;
        return new PIXI.Ellipse(radiusX, radiusY, radiusX, radiusY);
      }
      return new PIXI.Rectangle(0, 0, width, height);
    }
    return new PIXI.Polygon(this.document.getGridSpacePolygon());
  }

  /* -------------------------------------------- */

  /**
   * Get the center point of the Token.
   * @param {Point} [position]  The position in pixels
   * @returns {Point}           The center point
   */
  getCenterPoint(position) {
    const {x, y} = this.document.getCenterPoint(position ? {x: position.x, y: position.y} : undefined);
    return {x, y};
  }

  /* -------------------------------------------- */

  /** @override */
  getSnappedPosition(position) {
    const {x, y} = this.document.getSnappedPosition(position ? {x: position.x, y: position.y} : undefined);
    return {x, y};
  }

  /* -------------------------------------------- */

  /** @override */
  _pasteObject(offset, {hidden=false, snap=true}={}) {
    const {x, y} = this.document;
    let position = {x: x + offset.x, y: y + offset.y};
    const data = this.document.toObject();
    delete data._id;
    data.hidden ||= hidden;
    const document = this.scene === canvas.scene ? this.document
      : foundry.utils.getDocumentClass("Token").fromSource(data, {parent: canvas.scene});
    const {elevation, width, height, shape} = data;
    if ( snap ) position = document.getSnappedPosition({x: position.x, y: position.y, elevation, width, height, shape});
    position.x = Math.round(position.x);
    position.y = Math.round(position.y);
    const d = canvas.dimensions;
    const {x: cx, y: cy} = document.getCenterPoint({x: 0, y: 0, elevation, width, height, shape});
    data.x = Math.clamp(position.x, -Math.floor(cx), d.width - Math.ceil(cx));
    data.y = Math.clamp(position.y, -Math.floor(cy), d.height - Math.ceil(cy));
    return data;
  }

  /* -------------------------------------------- */

  /**
   * Measure the movement path for this Token.
   * @param {TokenMeasureMovementPathWaypoint[]} waypoints    The waypoints of movement
   * @param {TokenMeasureMovementPathOptions} [options]       Additional options that affect cost calculations
   *                                                          (passed to {@link Token#_getMovementCostFunction})
   * @returns {GridMeasurePathResult}
   */
  measureMovementPath(waypoints, options) {
    const cost = this._getMovementCostFunction(options);
    return this.document.measureMovementPath(waypoints, {cost});
  }

  /* -------------------------------------------- */

  /**
   * Create the movement cost function for this Token.
   * In square and hexagonal grids it calculates the cost for single grid space move between two grid space offsets.
   * For tokens that occupy more than one grid space the cost of movement is calculated as the median of all individual
   * grid space moves unless the cost of any of these is infinite, in which case total cost is always infinite.
   * In gridless grids the `from` and `to` parameters of the cost function are top-left offsets.
   * If the movement cost function is undefined, the cost equals the distance moved.
   * @param {TokenMeasureMovementPathOptions} [options]    Additional options that affect cost calculations
   * @returns {TokenMovementCostFunction|void}
   * @protected
   */
  _getMovementCostFunction(options) {
    const calculateTerrainCost = CONFIG.Token.movement.TerrainData.getMovementCostFunction(this.document, options);
    const actionCostFunctions = {};
    return (from, to, distance, segment) => {
      const terrainCost = calculateTerrainCost(from, to, distance, segment);
      const calculateActionCost = actionCostFunctions[segment.action]
        ??= segment.actionConfig.getCostFunction(this.document, options);
      return calculateActionCost(terrainCost, from, to, distance, segment);
    };
  }

  /* -------------------------------------------- */

  /**
   * Constrain the given movement path.
   *
   * The result of this function must not be affected by the animation of this Token.
   * @param {TokenConstrainMovementPathWaypoint[]} waypoints    The waypoints of movement
   * @param {TokenConstrainMovementPathOptions} [options]       Additional options
   * @returns {[constrainedPath: TokenConstrainedMovementWaypoint[], wasConstrained: boolean]}
   *   The (constrained) path of movement and a boolean that is true if and only if the path was constrained.
   *   If it wasn't constrained, then a copy of the path of all given waypoints with all default values filled in
   *   is returned.
   */
  constrainMovementPath(waypoints, {preview=false, ignoreWalls=false, ignoreCost=false, history=false}={}) {

    // Ignore preview if token vision is disabled or the current user is a GM
    if ( !canvas.visibility.tokenVision || game.user.isGM ) preview = false;

    // Compute the path up until the next waypoint that is blocked by a wall
    const result = {path: [], constrained: false};
    const source = this.document._source;
    let {x=source.x, y=source.y, elevation=source.elevation, width=source.width, height=source.height,
      shape=source.shape, action=this.document.movementAction, terrain=null, snapped=false, explicit=false,
      checkpoint=false, intermediate=false} = waypoints[0];
    x = Math.round(x);
    y = Math.round(y);
    if ( terrain ) terrain = terrain.clone();
    let waypoint = {x, y, elevation, width, height, shape, action, terrain, snapped, explicit, checkpoint,
      intermediate};
    result.path.push(waypoint);

    // Compute adjusted origin
    let origin;
    let offsetX;
    let offsetY;
    let center;
    if ( !ignoreWalls ) {
      offsetX = this.#centerOffset.x;
      offsetY = this.#centerOffset.y;
      center = this.document.getCenterPoint(waypoint);
      origin = this.getMovementAdjustedPoint(center, {offsetX, offsetY});
    }

    for ( let i = 1; i < waypoints.length; i++ ) {
      const priorWaypoint = waypoint;
      let {x=waypoint.x, y=waypoint.y, elevation=waypoint.elevation, width=waypoint.width, height=waypoint.height,
        shape=waypoint.shape, action=waypoint.action, terrain=null, snapped=false, explicit=false,
        checkpoint=false, intermediate=false} = waypoints[i];
      x = Math.round(x);
      y = Math.round(y);
      if ( terrain ) terrain = terrain.clone();
      waypoint = {x, y, elevation, width, height, shape, action, terrain, snapped, explicit, checkpoint, intermediate};

      // Test scene bounds
      const priorCenter = center;
      center = this.document.getCenterPoint(waypoint);
      if ( !canvas.dimensions.rect.contains(center.x, center.y) ) {
        result.constrained = true;
        break;
      }

      // Compute adjusted destination
      let destination;
      const priorOffsetX = offsetX;
      const priorOffsetY = offsetY;
      if ( !ignoreWalls ) {
        const ox = Math.sign(center.x - priorCenter.x);
        const oy = Math.sign(center.y - priorCenter.y);
        if ( ox !== 0 ) offsetX = ox;
        if ( oy !== 0 ) offsetY = oy;
        destination = this.getMovementAdjustedPoint(center, {offsetX, offsetY});
      }

      // Check for collisions with walls unless teleporting
      const wallType = CONFIG.Token.movement.actions[action].walls;
      if ( !ignoreWalls && wallType ) {
        let collision = this.#testWallCollision(origin, destination, wallType, preview);
        if ( collision ) {
          result.constrained = true;

          // Calculate the 3D collision point
          collision = {
            x: Math.round(collision.x - (center.x - waypoint.x)),
            y: Math.round(collision.y - (center.y - waypoint.y)),
            elevation: Math.mix(origin.elevation, destination.elevation, collision._distance)
          };

          // Restore prior center and x/y-offset
          center = priorCenter;
          offsetX = priorOffsetX;
          offsetY = priorOffsetY;

          // Get the collision waypoint
          const collisionWaypoint = this.#getCollisionWaypoint(waypoint, collision, origin, center, offsetX, offsetY,
            wallType, preview);
          if ( !collisionWaypoint ) {

            // The last waypoint must not be intermediate
            if ( priorWaypoint.intermediate ) {
              priorWaypoint.intermediate = false;
              priorWaypoint.explicit = false;
            }
            break;
          }

          // Skip if collision waypoint is almost the same as the origin waypoint
          if ( Math.max(Math.abs(collisionWaypoint.x - priorWaypoint.x),
            Math.abs(collisionWaypoint.y - priorWaypoint.y)) <= 1 ) break;

          // Add collision waypoint to the result
          result.path.push(collisionWaypoint);
          break;
        }
      }

      result.path.push(waypoint);
      origin = destination;
    }

    // Allow only movement with finite cost
    if ( !ignoreCost ) this.#constrainMovementPathCost(result, {preview, history});

    return [result.path, result.constrained];
  }

  /* -------------------------------------------- */

  /**
   * Get the collision waypoint for the given segment where a collision occurred.
   * @param {TokenMovementWaypoint} waypoint  The destination waypoint
   * @param {ElevatedPoint} collision         The point of collision with the wall
   * @param {ElevatedPoint} origin            The adjusted center point of the origin waypoint
   * @param {ElevatedPoint} center            The unadjusted center point of the origin waypoint
   * @param {number} offsetX                  The current x-offset
   * @param {number} offsetY                  The current y-offset
   * @param {string} type                     The wall type
   * @param {boolean} preview                 Is this a preview?
   * @returns {TokenConstrainedMovementWaypoint|void}    The collision waypoint, or undefined if the movement
   *                                                     should stop at the origin
   */
  #getCollisionWaypoint(waypoint, collision, origin, center, offsetX, offsetY, type, preview) {
    const priorOffsetX = offsetX;
    const priorOffsetY = offsetY;

    // If not snapped or gridless, we use the exact point of collision if possible
    if ( !waypoint.snapped || canvas.grid.isGridless ) {
      const k = Math.ceil(canvas.dimensions.size / 4);
      const n = Math.ceil(Math.hypot(collision.x - origin.x, collision.y - origin.y));
      for ( let j = 0; j < n; j += Math.clamp(j, 1, k) ) {
        const t = j / n;
        const p = {
          x: Math.round(Math.mix(collision.x, origin.x, t)),
          y: Math.round(Math.mix(collision.y, origin.y, t)),
          elevation: Math.mix(collision.elevation, origin.elevation, t),
          width: waypoint.width, height: waypoint.height, shape: waypoint.shape,
          action: waypoint.action, terrain: waypoint.terrain, snapped: false, explicit: false, checkpoint: false,
          intermediate: false
        };
        const c = this.document.getCenterPoint(p);
        const ox = Math.sign(c.x - center.x);
        const oy = Math.sign(c.y - center.y);
        if ( ox !== 0 ) offsetX = ox;
        if ( oy !== 0 ) offsetY = oy;
        const destination = this.getMovementAdjustedPoint(c, {offsetX, offsetY});
        if ( !this.#testWallCollision(origin, destination, type, preview) ) return p;
        offsetX = priorOffsetX;
        offsetY = priorOffsetY;
      }
    }

    // Otherwise we try to find the closest snapped position between the origin and the collision.
    // Note that this algorithm might not return the closest (best) snapped position.
    else {
      const d = canvas.dimensions;
      const n = Math.ceil(Math.hypot(collision.x - origin.x, collision.y - origin.y,
        (collision.elevation - origin.elevation) * d.distancePixels) / (d.size / 4));
      for ( let j = 0; j < n; j++ ) {
        const t = j / n;
        const p = this.document.getSnappedPosition({
          x: Math.mix(collision.x, origin.x, t),
          y: Math.mix(collision.y, origin.y, t),
          elevation: Math.mix(collision.elevation, origin.elevation, t),
          width: waypoint.width, height: waypoint.height, shape: waypoint.shape
        });
        p.x = Math.round(p.x);
        p.y = Math.round(p.y);
        p.width = waypoint.width;
        p.height = waypoint.height;
        p.shape = waypoint.shape;
        const c = this.document.getCenterPoint(p);
        const ox = Math.sign(c.x - center.x);
        const oy = Math.sign(c.y - center.y);
        if ( ox !== 0 ) offsetX = ox;
        if ( oy !== 0 ) offsetY = oy;
        const destination = this.getMovementAdjustedPoint(c, {offsetX, offsetY});
        if ( !this.#testWallCollision(origin, destination, type, preview) ) {
          p.action = waypoint.action;
          p.terrain = waypoint.terrain;
          p.snapped = true;
          p.explicit = false;
          p.checkpoint = false;
          p.intermediate = false;
          return p;
        }
        offsetX = priorOffsetX;
        offsetY = priorOffsetY;
      }
    }
  }

  /* -------------------------------------------- */

  /**
   * Test for wall collision for a movement between two points.
   * @param {ElevatedPoint} origin         The adjusted origin
   * @param {ElevatedPoint} destination    The adjusted destination
   * @param {string} type                  The wall type
   * @param {boolean} preview              Is preview?
   * @returns {PolygonVertex|null}         The collision point with a wall, if any
   */
  #testWallCollision(origin, destination, type, preview) {
    let collision = null;
    const source = this.#getMovementSource(origin);
    const polygonBackend = CONFIG.Canvas.polygonBackends[type];
    if ( preview ) {
      // TODO: open doors that are not visible should be considered closed
      const collisions = polygonBackend.testCollision(origin, destination, {type, mode: "all", source});

      // Only visible or explored collisions block preview movement
      for ( const c of collisions ) {
        if ( canvas.fog.isPointExplored(c) || canvas.visibility.testVisibility(c, {tolerance: 1})) {
          collision = c;
          break;
        }
      }
    }
    else collision = polygonBackend.testCollision(origin, destination, {type, mode: "closest", source});
    return collision;
  }

  /* -------------------------------------------- */

  /**
   * Discard the first waypoint that requires an infinite cost to move to and all waypoints after this one.
   * @param {{path: TokenMovementWaypoint[], constrained: boolean}} result            The result
   * @param {Pick<TokenConstrainMovementPathOptions, "preview"|"history">} options    The options
   */
  #constrainMovementPathCost(result, {preview, history}) {
    if ( result.path.length === 0 ) return;
    if ( !Array.isArray(history) ) history = history ? this.document.movementHistory : [];

    // Bridge the gap between the last recorded position and the first of the given waypoints
    // so that the gap is measured with 0 cost
    const previous = history.at(-1);
    if ( previous ) {
      const origin = result.path[0];
      if ( !TokenDocument.arePositionsEqual(previous, origin) ) {
        const {x, y, elevation, width, height, shape} = origin;
        history = [...history, {x, y, elevation, width, height, shape, action: "displace", cost: 0}];
      }
    }

    // Discard the first waypoint that requires an infinite cost to move to and all waypoints after this one
    const measurement = this.measureMovementPath(history.concat(result.path), {preview});
    if ( measurement.cost !== Infinity ) return;
    let n = history.length;
    while ( (n < measurement.waypoints.length) && (measurement.waypoints[n].backward?.cost !== Infinity) ) n++;
    n -= history.length;
    if ( result.path.length === n ) return;
    if ( n > 0 ) {

      // The last waypoint must not be intermediate
      const last = result.path[n - 1];
      if ( last.intermediate ) {
        last.intermediate = false;
        last.explicit = false;
      }
    }
    result.path.length = n;
    result.constrained = true;
  }

  /* -------------------------------------------- */

  /**
   * Find a movement path through the waypoints.
   * The path may not necessarily be one with the least cost.
   * The path returned may be partial, i.e. it doesn't go through all waypoints, but must always start with the first
   * waypoints unless the waypoints are empty, in which case an empty path is returned.
   *
   * The result of this function must not be affected by the animation of this Token.
   * @param {TokenFindMovementPathWaypoint[]} waypoints    The waypoints of movement
   * @param {TokenFindMovementPathOptions} [options]       Additional options
   * @returns {TokenFindMovementPathJob}                   The job of the movement pathfinder
   */
  findMovementPath(waypoints, options) {

    // Add terrain waypoints
    let path = this.createTerrainMovementPath(waypoints, {preview: options.preview});

    // Constrain path with terrain data
    [path] = this.constrainMovementPath(path, options);

    // Remove waypoints and delete properties added because of terrain
    path = path.filter(waypoint => !waypoint.intermediate);
    for ( const waypoint of path ) {
      delete waypoint.terrain;
      delete waypoint.intermediate;
    }

    return {result: path, promise: Promise.resolve(path), cancel: () => {}};
  }

  /* -------------------------------------------- */

  /**
   * This function adds intermediate waypoints pre/post enter and exit for a {@link Region} if the Region
   * has at least one Behavior that could affect the movement, which is determined by
   * {@link foundry.data.regionBehaviors.RegionBehaviorType#_getTerrainEffects}.
   * For each segment of the movement path the terrain data is created from all behaviors that
   * could affect the movement of this Token with {@link CONFIG.Token.movement.TerrainData.resolveTerrainEffects}.
   * This terrain data is included in the returned regionalized movement path.
   * This terrain data may then be used in {@link Token#_getMovementCostFunction} and
   * {@link Token#constrainMovementPath}.
   * @param {TokenGetTerrainMovementPathWaypoint[]} waypoints    The waypoints of movement
   * @param {object} [options]                                   Additional options
   * @param {boolean} [options.preview=false]                    Is preview?
   * @returns {TokenTerrainMovementWaypoint[]}                   The movement path with terrain data
   */
  createTerrainMovementPath(waypoints, {preview=false}={}) {
    if ( !this.scene ) throw new Error("The Token must be in a Scene");
    const path = [];
    if ( waypoints.length === 0 ) return path;

    // Ignore preview if token vision is disabled or the current user is a GM
    if ( !canvas.visibility.tokenVision || game.user.isGM ) preview = false;

    // Add first waypoint
    const source = this.document._source;
    let {x=source.x, y=source.y, elevation=source.elevation, width=source.width, height=source.height,
      shape=source.shape, action=this.document.movementAction, snapped=false, explicit=false,
      checkpoint=false} = waypoints[0];
    x = Math.round(x);
    y = Math.round(y);
    path.push({x, y, elevation, width, height, shape, action, terrain: null, snapped, explicit, checkpoint,
      intermediate: false});
    let from = {x, y, elevation, width, height, shape, action};

    // Create region states
    const regionStates = this.scene.regions.map(region => ({region, active: false, effects: []}));

    const distancePixels = this.scene.dimensions.distancePixels;
    for ( let i = 1; i < waypoints.length; i++ ) {
      let {x=from.x, y=from.y, elevation=from.elevation, width=from.width, height=from.height, shape=from.shape,
        action=from.action, snapped=false, explicit=false, checkpoint=false} = waypoints[i];
      x = Math.round(x);
      y = Math.round(y);
      const to = {x, y, elevation, width, height, shape, action};

      // If preview, subdivide segments in explored/visible and unexplored/invisible sub-segments
      const subwaypoints = [];
      if ( !preview ) subwaypoints.push([to, undefined]);
      else {
        const c0 = this.document.getCenterPoint(from);
        const c1 = this.document.getCenterPoint(to);
        const pivot = this.document.getCenterPoint({x: 0, y: 0, elevation: 0, width, height, shape});
        const d = Math.hypot(c0.x - c1.x, c0.y - c1.y);
        const n = Math.ceil((d / canvas.dimensions.size) - 1e-6);
        let wasExplored;
        for ( let i = 0; i < n; i++ ) {
          const a0 = (i + (1 / 3)) / n;
          const p0 = {x: Math.mix(c0.x, c1.x, a0), y: Math.mix(c0.y, c1.y, a0)};
          const a1 = (i + (2 / 3)) / n;
          const p1 = {x: Math.mix(c0.x, c1.x, a1), y: Math.mix(c0.y, c1.y, a1)};
          const explored = (canvas.fog.isPointExplored(p0) || canvas.visibility.testVisibility(p0, {tolerance: 1}))
            && (canvas.fog.isPointExplored(p1) || canvas.visibility.testVisibility(p1, {tolerance: 1}));
          if ( explored === wasExplored ) continue;
          if ( wasExplored !== undefined ) {
            const a = i / n;
            const x = Math.round(Math.mix(c0.x, c1.x, a) - pivot.x);
            const y = Math.round(Math.mix(c0.y, c1.y, a) - pivot.y);
            const elevation = Math.mix(c0.elevation, c1.elevation, a) - pivot.elevation;
            subwaypoints.push([{x, y, elevation, width, height, shape}, wasExplored]);
          }
          wasExplored = explored;
        }
        subwaypoints.push([to, wasExplored ?? (canvas.fog.isPointExplored(c0)
          || canvas.visibility.testVisibility(c0, {tolerance: 1}))]);
      }

      // Iterate for each sub-waypoint of this segment
      const segment = {width, height, shape, action, preview};
      let previousTerrain;
      for ( let i = 0; i < subwaypoints.length; i++ ) {
        const [to, explored] = subwaypoints[i];

        // Initialize region states for this segment
        for ( const state of regionStates ) {
          const hadEffects = state.effects.length !== 0;
          state.effects.length = 0;
          if ( explored !== false ) {
            for ( const behavior of state.region.behaviors ) {
              if ( behavior.disabled ) continue;
              state.effects.push(...behavior.system._getTerrainEffects(this.document, segment));
            }
          }
          if ( state.effects.length === 0 ) state.active = false;
          else if ( !hadEffects ) state.active = this.document.testInsideRegion(state.region, from);
        }

        // Find region waypoints
        const regionWaypoints = [];
        const previousCenter = this.document.getCenterPoint(from);
        for ( const state of regionStates ) {
          if ( state.effects.length === 0 ) continue;
          const segments = this.document.segmentizeRegionMovementPath(state.region, [from, to]);
          for ( const {type, from} of segments ) {
            const center = this.document.getCenterPoint(from);
            const dx = center.x - previousCenter.x;
            const dy = center.y - previousCenter.y;
            const dz = (center.elevation - previousCenter.elevation) * distancePixels;
            const t = (dx * dx) + (dy * dy) + (dz * dz);
            regionWaypoints.push({t, x: from.x, y: from.y, elevation: from.elevation,
              width: from.width, height: from.height, shape: from.shape,
              crosses: type !== REGION_MOVEMENT_SEGMENTS.MOVE, state, terrain: null});
          }
        }

        // Sort region waypoints
        regionWaypoints.sort((w0, w1) => w0.t - w1.t);

        // Process region waypoints
        let n = regionWaypoints.length;
        if ( n !== 0 ) {
          let k = 0;
          let d = 0;
          for (let j = 0; j + 1 < n; j++) {
            const w0 = regionWaypoints[j];
            const w1 = regionWaypoints[j + 1];

            // Same position: combine them
            if ( TokenDocument.arePositionsEqual(w0, w1) ) {
              k++;
              d++;
              continue;
            }

            // Different position: set regions of the previous region waypoint
            w0.terrain = CONFIG.Token.movement.TerrainData.resolveTerrainEffects(
              regionStates.reduce((effects, state) => {
                if ( state.active ) effects.push(...state.effects);
                return effects;
              }, [])
            );

            // Update active states: moving to w1
            if ( w0.crosses ) w0.state.active = !w0.state.active;
            while ( d !== 0 ) {
              const w = regionWaypoints[j - d--];
              if ( w.crosses ) w.state.active = !w.state.active;
            }

            if ( k !== 0 ) regionWaypoints[j - k] = w0;
          }

          // Process the last region waypoint
          const w1 = regionWaypoints[n - 1];
          w1.terrain = CONFIG.Token.movement.TerrainData.resolveTerrainEffects(
            regionStates.reduce((effects, state) => {
              if ( state.active ) effects.push(...state.effects);
              return effects;
            }, [])
          );

          // Update active states: moving past the last waypoint
          if ( w1.crosses ) w1.state.active = !w1.state.active;
          while ( d !== 0 ) {
            const w = regionWaypoints[n - 1 - d--];
            if ( w.crosses ) w.state.active = !w.state.active;
          }

          if ( k !== 0 ) {
            regionWaypoints[n - 1 - k] = w1;
            n -= k;
          }
        }

        let terrain;

        let j = 0;
        if ( n !== 0 ) {

          // Skip the first region waypoint if it matches the previous movement waypoint
          const first = regionWaypoints[0];
          if ( TokenDocument.arePositionsEqual(first, from) ) j = 1;

          // Skip the last region waypoint if it matches the current movement waypoint
          const last = regionWaypoints[n - 1];
          if ( TokenDocument.arePositionsEqual(last, to) ) {
            n -= 1;
            terrain = last.terrain;
          }
        }

        // Add the region waypoints between the previous and the current movement waypoint
        while ( j < n ) {
          const {x, y, elevation, width, height, shape, terrain} = regionWaypoints[j++];

          // Remove redundant region waypoints
          if ( (previousTerrain !== undefined) && (!previousTerrain === !terrain)
            && (!previousTerrain || previousTerrain.equals(terrain)) ) {
            path.pop();
          }

          path.push({x, y, elevation, width, height, shape, action, terrain, snapped: false,
            explicit: true, checkpoint: false, intermediate: true});
          previousTerrain = terrain;
        }

        if ( terrain === undefined ) {
          terrain = CONFIG.Token.movement.TerrainData.resolveTerrainEffects(
            regionStates.reduce((effects, state) => {
              if ( state.active ) effects.push(...state.effects);
              return effects;
            }, [])
          );
        }

        // Remove redundant region waypoint
        if ( (previousTerrain !== undefined) && (!previousTerrain === !terrain)
          && (!previousTerrain || previousTerrain.equals(terrain)) ) {
          path.pop();
        }

        // Add the current movement waypoint
        path.push({...to, action, terrain, snapped, explicit, checkpoint,
          intermediate: i < subwaypoints.length - 1});
        previousTerrain = terrain;

        from = to;
      }
    }

    return path;
  }

  /* -------------------------------------------- */

  /**
   * Create the animation path.
   * @param {TokenPosition} origin                               The origin of movement
   * @param {TokenMeasuredMovementWaypoint[]} passedWaypoints    The passed waypoints
   * @returns {[waypoints: (Omit<TokenMovementWaypoint, "snapped"|"explicit"|"checkpoint">
   *    & {regions: Set<RegionDocument>; ray: Ray|null})[], initialRegions: Set<RegionDocument>])}
   *                                                             The regionalized animation path
   */
  #createAnimationMovementPath(origin, passedWaypoints) {
    const path = [];
    const initialRegions = new Set();
    if ( passedWaypoints.length === 0 ) return [path, initialRegions];

    let from = origin;
    let previousCenter = this.document.getCenterPoint(from);
    let rayIndex = 0;

    // Create region states
    const regionStates = [];
    for ( const region of this.scene.regions ) {
      if ( region.behaviors.some(b => !b.disabled && (b.hasEvent(CONST.REGION_EVENTS.TOKEN_ANIMATE_IN)
        || b.hasEvent(CONST.REGION_EVENTS.TOKEN_ANIMATE_OUT))) ) {
        const active = this.document.testInsideRegion(region, from);
        if ( active ) initialRegions.add(region);
        regionStates.push({region, active});
      }
    }

    const distancePixels = this.scene.dimensions.distancePixels;
    for ( let i = 0; i < passedWaypoints.length; i++ ) {
      const to = passedWaypoints[i];
      if ( to.intermediate && !to.explicit ) continue;

      // Find region waypoints
      const regionWaypoints = [];
      for ( const state of regionStates ) {
        const segments = this.document.segmentizeRegionMovementPath(state.region, [from, to]);
        for ( const {type, from} of segments ) {
          const center = this.document.getCenterPoint(from);
          const dx = center.x - previousCenter.x;
          const dy = center.y - previousCenter.y;
          const dz = (center.elevation - previousCenter.elevation) * distancePixels;
          const t = (dx * dx) + (dy * dy) + (dz * dz);
          regionWaypoints.push({t, x: from.x, y: from.y, elevation: from.elevation,
            width: from.width, height: from.height, shape: from.shape,
            crosses: type !== REGION_MOVEMENT_SEGMENTS.MOVE, state, regions: null});
        }
      }

      // Sort region waypoints
      regionWaypoints.sort((w0, w1) => w0.t - w1.t);

      // Process region waypoints
      let n = regionWaypoints.length;
      if ( n !== 0 ) {
        let k = 0;
        let d = 0;
        for (let j = 0; j + 1 < n; j++) {
          const w0 = regionWaypoints[j];
          const w1 = regionWaypoints[j + 1];

          // Same position: combine them
          if ( TokenDocument.arePositionsEqual(w0, w1) ) {
            k++;
            d++;
            continue;
          }

          // Different position: set regions of the previous region waypoint
          w0.regions = new Set();
          for ( const state of regionStates ) {
            if ( state.active ) w0.regions.add(state.region);
          }

          // Update active states: moving to w1
          if ( w0.crosses ) w0.state.active = !w0.state.active;
          while ( d !== 0 ) {
            const w = regionWaypoints[j - d--];
            if ( w.crosses ) w.state.active = !w.state.active;
          }

          if ( k !== 0 ) regionWaypoints[j - k] = w0;
        }

        // Process the last region waypoint
        const w1 = regionWaypoints[n - 1];
        w1.regions = new Set();
        for ( const state of regionStates ) {
          if ( state.active ) w1.regions.add(state.region);
        }

        // Update active states: moving past the last waypoint
        if ( w1.crosses ) w1.state.active = !w1.state.active;
        while ( d !== 0 ) {
          const w = regionWaypoints[n - 1 - d--];
          if ( w.crosses ) w.state.active = !w.state.active;
        }

        if ( k !== 0 ) {
          regionWaypoints[n - 1 - k] = w1;
          n -= k;
        }
      }

      let regions;

      let j = 0;
      if ( n !== 0 ) {

        // Skip the first region waypoint if it matches the previous movement waypoint
        const first = regionWaypoints[0];
        if ( TokenDocument.arePositionsEqual(first, from) ) j = 1;

        // Skip the last region waypoint if it matches the current movement waypoint
        const last = regionWaypoints[n - 1];
        if ( TokenDocument.arePositionsEqual(last, to) ) {
          n -= 1;
          regions = last.regions;
        }
      }

      let previousRegions;

      // Add the region waypoints between the previous and the current movement waypoint
      while ( j < n ) {
        const {x, y, elevation, width, height, shape, regions} = regionWaypoints[j++];

        // Remove redundant region waypoints
        if ( previousRegions?.equals(regions) ) path.pop();

        path.push({x, y, elevation, width, height, shape, action: to.action, terrain: to.terrain, regions, ray: null});
        previousRegions = regions;
      }

      if ( regions === undefined ) {
        regions = new Set();
        for ( const state of regionStates ) {
          if ( state.active ) regions.add(state.region);
        }
      }

      // Remove redundant region waypoint
      if ( previousRegions?.equals(regions) ) path.pop();

      // Add the current movement waypoint
      path.push({x: to.x, y: to.y, elevation: to.elevation, width: to.width, height: to.height, shape: to.shape,
        action: to.action, terrain: to.terrain, regions, ray: null});

      if ( !to.intermediate ) {
        const center = this.document.getCenterPoint(to);
        path[rayIndex].ray = new Ray(previousCenter, center);
        previousCenter = center;
        rayIndex = path.length;
      }

      from = to;
    }

    return [path, initialRegions];
  }

  /* -------------------------------------------- */

  /**
   * Set this Token as an active target for the current game User.
   * @param {boolean} targeted                        Is the Token now targeted?
   * @param {object} [options={}]                     Additional option which modify how targets are acquired
   * @param {boolean} [options.releaseOthers=true]    Release other active targets?
   */
  setTarget(targeted=true, {releaseOthers=true}={}) {
    if ( this.isPreview ) return;
    const mode = targeted ? (releaseOthers ? "replace" : "acquire") : "release";
    canvas.tokens.setTargets([this.id], {mode});
  }

  /* -------------------------------------------- */

  /**
   * Handle updating the targeting state of this Token for a particular User.
   * @param {boolean} targeted    Is the token now targeted?
   * @param {User} user           The user whose targeting state has changed
   * @internal
   */
  _updateTarget(targeted, user) {
    const wasTargeted = this.targeted.has(user);
    if ( targeted ) {
      this.targeted.add(user);
      user.targets.add(this);
    }

    // Release target
    else {
      this.targeted.delete(user);
      user.targets.delete(this);
    }

    // If target status changed
    if ( wasTargeted !== targeted ) {
      this.renderFlags.set({refreshTarget: true});
      if ( this.hasActiveHUD ) this.layer.hud.render();
    }
  }

  /* -------------------------------------------- */

  /**
   * The external radius of the token in pixels.
   * @type {number}
   */
  get externalRadius() {
    const {width, height} = this.document.getSize();
    return Math.min(width, height) / 2;
  }

  /* -------------------------------------------- */

  /**
   * A generic transformation to turn a certain number of grid units into a radius in canvas pixels.
   * This function adds additional padding to the light radius equal to the external radius of the token.
   * This causes light to be measured from the outer token edge, rather than from the center-point.
   * @param {number} units  The radius in grid units
   * @returns {number}      The radius in pixels
   */
  getLightRadius(units) {
    if ( units === 0 ) return 0;
    return ((Math.abs(units) * canvas.dimensions.distancePixels) + this.externalRadius) * Math.sign(units);
  }

  /* -------------------------------------------- */

  /**
   * Obtain a shifted waypoint for the Token. The returned waypoint must move the Token to a snapped position.
   * @param {-1|0|1} dx                   The number of grid units to shift along the X-axis
   * @param {-1|0|1} dy                   The number of grid units to shift along the Y-axis
   * @param {-1|0|1} dz                   The number of grid units to shift along the Z-axis
   * @returns {Partial<TokenPosition>}    The shifted target waypoint (snapped if square/hexagonal grid)
   * @override
   * @internal
   */
  _getShiftedPosition(dx, dy, dz) {
    const {x, y, elevation, width, height, shape} = this.document._source;
    const snapped = this.document.getSnappedPosition({x, y, elevation, width, height, shape});
    return PlaceableObject._getShiftedPosition(dx, dy, dz, {x, y, elevation}, snapped, this.scene.grid);
  }

  /* -------------------------------------------- */

  /**
   * Get the movement action in {@link CONFIG.Token.movement | CONFIG.Token.movement.actions} to be used for keyboard
   * movement.
   * The default implementation returns `this.document.movementAction`.
   * @returns {string}
   * @protected
   */
  _getKeyboardMovementAction() {
    return this.document.movementAction;
  }

  /* -------------------------------------------- */

  /**
   * Get the position for movement via the Token HUD.
   * @param {number} elevation
   * @returns {Partial<TokenPosition>}
   * @see {@link foundry.applications.hud.TokenHUD#_onSubmit}
   * @internal
   */
  _getHUDMovementPosition(elevation) {
    return {elevation};
  }

  /* -------------------------------------------- */

  /**
   * Get the movement action in {@link CONFIG.Token.movement | CONFIG.Token.movement.actions} to be used for movement
   * via the Token HUD.
   * The default implementation returns `this.document.movementAction`.
   * @returns {string}
   * @see {@link foundry.applications.hud.TokenHUD#_onSubmit}
   * @protected
   */
  _getHUDMovementAction() {
    return this.document.movementAction;
  }

  /* -------------------------------------------- */

  /**
   * Get the position for movement via the Token Config.
   * @param {Partial<TokenPosition>} changes
   * @returns {Partial<TokenPosition>}
   * @see {@link foundry.applications.sheets.TokenConfig#_processSubmitData}
   * @internal
   */
  _getConfigMovementPosition(changes) {
    return {...changes};
  }

  /* -------------------------------------------- */

  /** @override */
  _updateRotation({angle, delta=0, snap=0}={}) {
    let degrees = Number.isNumeric(angle) ? angle : this.document.rotation + delta;
    const isHexRow = [CONST.GRID_TYPES.HEXODDR, CONST.GRID_TYPES.HEXEVENR].includes(canvas.grid.type);
    if ( isHexRow ) degrees -= 30;
    if ( snap > 0 ) degrees = degrees.toNearest(snap);
    if ( isHexRow ) degrees += 30;
    return Math.normalizeDegrees(degrees);
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _onCreate(data, options, userId) {
    super._onCreate(data, options, userId);
    this.initializeSources(); // Update vision and lighting sources
    if ( !game.user.isGM && this.isOwner && !this.document.hidden && !canvas.tokens.controlled.length ) {
      this.control({pan: true}); // Assume control
    }
    canvas.perception.update({refreshOcclusion: true});
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);
    const doc = this.document;

    // Update the center offset
    this.#onUpdateCenterOffset(options);

    // Update drag preview
    this.#onUpdateDrag(changed, options, userId);

    // Acquire or release Token control
    const hiddenChanged = "hidden" in changed;
    if ( hiddenChanged ) {
      if ( !game.user.isGM ) {
        // Release your controlled token if it becomes hidden
        if ( this.controlled && changed.hidden ) this.release();
        // Gain control over your token if it becomes visible and you don't already control something
        else if ( this.isOwner && (changed.hidden === false) && !canvas.tokens.controlled.length ) {
          this.control({pan: true});
        }
      }
      if ( this.isOwner && (this.layer.occlusionMode & CONST.TOKEN_OCCLUSION_MODES.OWNED) ) {
        canvas.perception.update({refreshOcclusion: true});
      }
    }

    // Automatically pan the canvas
    const positionChanged = ("x" in changed) || ("y" in changed);
    if ( positionChanged && this.controlled && (options.pan !== false) ) this.#panCanvas();

    // Handle animation
    this.#onUpdateAnimation(changed, options, userId);

    // Process Combat Tracker changes
    if ( this.inCombat && ("name" in changed) ) game.combat.debounceSetup();

    // Source and perception updates
    if ( hiddenChanged || ("light" in changed) || ("sight" in changed) || ("detectionModes" in changed) ) {
      this.initializeSources();
    }
    if ( !game.user.isGM && this.controlled && (hiddenChanged || (("sight" in changed) && ("enabled" in changed.sight))) ) {
      for ( const token of this.layer.placeables ) {
        if ( (token !== this) && (!token.vision === token._isVisionSource()) ) token.initializeVisionSource();
      }
    }
    if ( hiddenChanged ) canvas.perception.update({refreshVision: true, refreshSounds: true, refreshOcclusion: true});
    if ( "occludable" in changed ) canvas.perception.update({refreshOcclusionMask: true});

    // Incremental refresh
    const textureChanged = "texture" in changed;
    const ringEnabled = doc.ring.enabled;
    const ringChanged = "ring" in changed;
    const ringEnabledChanged = ringChanged && ("enabled" in changed.ring);
    const ringVisualsChanged = ringEnabled && ringChanged && (("colors" in changed.ring) || ("effects" in changed.ring));
    this.renderFlags.set({
      redraw: ringEnabledChanged || ("actorId" in changed) || ("actorLink" in changed),
      refreshState: hiddenChanged || ("sort" in changed) || ("disposition" in changed) || ("displayBars" in changed) || ("displayName" in changed),
      refreshRotation: "lockRotation" in changed,
      refreshMesh: textureChanged && ("fit" in changed.texture),
      refreshShape: "shape" in changed,
      refreshBars: ["displayBars", "bar1", "bar2"].some(k => k in changed),
      refreshNameplate: ["displayName", "name"].some(k => k in changed),
      refreshRingVisuals: ringVisualsChanged,
      refreshTurnMarker: ("turnMarker" in changed) || ("disposition" in changed),
      refreshRuler: "_movementHistory" in changed
    });
  }

  /* -------------------------------------------- */

  /**
   * Update the center offset.
   * @param {TokenPosition} origin                                 The origin
   * @param {TokenPosition & {intermediate?: boolean}} waypoints   The waypoints
   */
  #updateCenterOffset(origin, waypoints) {
    if ( waypoints.length === 0 ) return;
    let c0 = this.document.getCenterPoint(origin);
    for ( const waypoint of waypoints ) {
      if ( waypoint.intermediate ) continue;
      const c1 = this.document.getCenterPoint(waypoint);
      if ( c1.x !== c0.x ) this.#centerOffset.x = Math.sign(c1.x - c0.x);
      if ( c1.y !== c0.y ) this.#centerOffset.y = Math.sign(c1.y - c0.y);
      c0 = c1;
    }
  }

  /* -------------------------------------------- */

  /**
   * Update the center offset unless animating.
   * Called in {@link Token#_onUpdate}.
   * @param {object} options    The update options
   */
  #onUpdateCenterOffset(options) {
    const movement = options._movement?.[this.document.id];
    if ( movement ) this.#updateCenterOffset(movement.origin, movement.passed.waypoints);

    // If animating, we update the animated center offset for each movement waypoint in Token##onUpdateAnimation
    if ( options.animate !== false ) return;
    this.#animationCenterOffset.x = this.#centerOffset.x;
    this.#animationCenterOffset.y = this.#centerOffset.y;
  }

  /* -------------------------------------------- */

  /**
   * Update drag preview and the ruler path.
   * Called in {@link Token#_onUpdate}.
   * @param {object} changed    The changes
   * @param {object} options    The update options
   * @param {string} userId     The ID of the User that initiated the update operation
   */
  #onUpdateDrag(changed, options, userId) {
    const context = this.#getDragContext();
    if ( !context ) return;
    if ( foundry.utils.isEmpty(changed) ) return;

    // Update the preview token, but keep current position
    context.clonedToken.document.updateSource(changed);
    context.clonedToken.document.x = context.destination.x;
    context.clonedToken.document.y = context.destination.y;
    context.clonedToken.document.elevation = context.destination.elevation;
    context.clonedToken.document.width = context.destination.width ?? this.document._source.width;
    context.clonedToken.document.height = context.destination.height ?? this.document._source.height;
    context.clonedToken.document.shape = context.destination.shape ?? this.document._source.shape;
    context.clonedToken.renderFlags.set({refresh: true});

    // The ruler only needs updating if the position, size, or shape changed, or the movement history changed
    const hasMoved = TokenDocument._isMovementUpdate(changed);
    if ( !hasMoved && !("_movementHistory" in changed) ) return;
    if ( hasMoved ) {

      // Prevent panning
      options.pan = false;

      // Update the origin
      const oldOrigin = context.origin;
      const newOrigin = context.origin = {
        x: this.document._source.x,
        y: this.document._source.y,
        elevation: this.document._source.elevation,
        width: this.document._source.width,
        height: this.document._source.height,
        shape: this.document._source.shape
      };

      // Update the waypoints and destination
      const updateWaypoint = (waypoint, ignoreElevation=true) => {

        // Update (x, y, elevation) such that center point before and after is the same
        const center = this.document.getCenterPoint({x: waypoint.x, y: waypoint.y,
          elevation: waypoint.elevation, width: waypoint.width ?? oldOrigin.width,
          height: waypoint.height ?? oldOrigin.height, shape: waypoint.shape ?? oldOrigin.shape});
        const pivot = this.document.getCenterPoint({x: 0, y: 0, elevation: 0, width: newOrigin.width,
          height: newOrigin.height, shape: newOrigin.shape});
        waypoint.x = Math.round(center.x - pivot.x);
        waypoint.y = Math.round(center.y - pivot.y);
        waypoint.elevation = center.elevation - pivot.elevation;

        // Check that after resizing the waypoint is still in a snapped position
        if ( waypoint.snapped ) {
          const {x, y, elevation} = waypoint;
          const {width=newOrigin.width, height=newOrigin.height, shape=newOrigin.shape} = waypoint;
          const snapped = this.document.getSnappedPosition({x, y, elevation, width, height, shape});
          if ( !((x === Math.round(snapped.x)) && (y === Math.round(snapped.y))
            && (ignoreElevation || elevation.almostEqual(snapped.elevation))) ) {
            waypoint.snapped = false;
          }
        }
      };
      context.waypoints.forEach(updateWaypoint);
      updateWaypoint(context.destination, false);

      // Update destination of the preview
      Token.#updateDragPreview(context.clonedToken, context.destination);
    }

    // Update the ruler path
    this.recalculatePlannedMovementPath();
  }

  /* -------------------------------------------- */

  /**
   * Animate the changes to this Token.
   * Called in {@link Token#_onUpdate}.
   * @param {object} changed    The changes
   * @param {object} options    The update options
   * @param {string} userId     The ID of the User that initiated the update operation
   */
  #onUpdateAnimation(changed, options, userId) {
    if ( options.animate === false ) {
      this.stopAnimation({reset: false});
      this.#showRuler = false;
      this._preventKeyboardMovement = false;
      return;
    }
    const movement = options._movement?.[this.document.id];
    const animationData = this._getAnimationData();
    const to = foundry.utils.filterObject(animationData, changed);

    // Delete positional and size from the animation data, which we are animating separately
    for ( const k of TokenDocument.MOVEMENT_FIELDS ) delete to[k];
    if ( movement && movement.autoRotate ) delete to.rotation;

    // TODO: Can we find a solution that doesn't require special handling for hidden?
    if ( "hidden" in changed ) to.alpha = animationData.alpha;

    // We need to infer subject texture if ring is enabled and texture is changed
    const ringEnabled = this.document.ring.enabled;
    const ringChanged = "ring" in changed;
    const ringEnabledChanged = ringChanged && ("enabled" in changed.ring);
    const ringSubjectChanged = ringEnabled && ringChanged && ("subject" in changed.ring);
    const ringSubjectTextureChanged = ringSubjectChanged && ("texture" in changed.ring.subject);
    if ( (ringEnabled || ringEnabledChanged) && !ringSubjectTextureChanged && ("texture" in changed)
      && ("src" in changed.texture) && !this.document._source.ring.subject.texture ) {
      foundry.utils.mergeObject(to, {ring: {subject: {texture: animationData.ring.subject.texture}}});
    }

    // Animate movement separately from the non-movement-related fields
    let movementAnimationDuration;
    if ( movement ) {
      const previousMovementAnimationPromise = this.movementAnimationPromise;
      let movementAnimationPromise = previousMovementAnimationPromise;
      this.#showRuler = movement.showRuler;

      // Prevent keyboard movement until right before the movement animation ends
      this._preventKeyboardMovement = true;

      const rotationSpeed = 24;  // 250 ms per 360 degrees
      const runningAnimations = [];
      const [animationPath, initialRegions] = this.#createAnimationMovementPath(movement.origin,
        movement.passed.waypoints);
      for ( const waypoint of animationPath ) {

        // If there's a ray, it's the first waypoint on a segment
        const ray = waypoint.ray;
        if ( waypoint.ray ) {
          if ( movement.autoRotate ) {
            if ( ray.distance > 0 ) {
              const rotation = Math.toDegrees(ray.angle) + (movement.method === "undo" ? 90 : -90);
              movementAnimationPromise = this.animate({rotation}, {
                name: this.movementAnimationName,
                chain: true,
                action: waypoint.action,
                movementSpeed: rotationSpeed
              });
            }

            // Update center offset
            const updateCenterOffset = () => {
              if ( ray.dx !== 0 ) this.#animationCenterOffset.x = Math.sign(ray.dx);
              if ( ray.dy !== 0 ) this.#animationCenterOffset.y = Math.sign(ray.dy);
            };
            if ( movementAnimationPromise ) movementAnimationPromise.finally(updateCenterOffset);
            else updateCenterOffset();
          }
        }

        // Dispatch animation for the waypoint
        const start = movementAnimationPromise;
        const end = this.animate({
          x: waypoint.x,
          y: waypoint.y,
          elevation: waypoint.elevation,
          width: waypoint.width,
          height: waypoint.height,
          shape: waypoint.shape
        }, {
          name: this.movementAnimationName,
          chain: true,
          action: waypoint.action,
          terrain: waypoint.terrain,
          movementSpeed: options.animation?.movementSpeed
        });
        const context = this.#animationContexts.get(this.movementAnimationName);
        const duration = context ? context.chain.at(-1)?.options.duration ?? context.duration : 0;
        runningAnimations.push({start, end, duration});

        movementAnimationPromise = end;
      }
      if ( movement.autoRotate ) {
        movementAnimationPromise = this.animate({rotation: animationData.rotation}, {
          name: this.movementAnimationName,
          chain: true,
          action: animationPath.at(-1).action,
          movementSpeed: rotationSpeed
        });
      }

      // Handle region animation events
      this.#handleAnimateInOutRegionEvents(movement.origin, animationPath, initialRegions, runningAnimations);

      // Hide ruler at the end of the movement animation
      if ( movement.showRuler ) {
        if ( movementAnimationPromise ) {
          const movementId = movement.id;
          movementAnimationPromise.finally(() => {
            if ( this.document.movement.id !== movementId ) return;
            if ( ["completed", "stopped"].includes(this.document.movement.state) ) this.#showRuler = false;
          });
        }
        else if ( ["completed", "stopped"].includes(this.document.movement.state) ) this.#showRuler = false;
      }

      // Refresh ruler
      this.renderFlags.set({refreshRuler: true, refreshState: true});
      movementAnimationPromise?.finally(() => this.renderFlags.set({refreshRuler: true, refreshState: true}));

      // Update light and sight source after the animation finished if Vision Animation is disabled
      if ( !game.settings.get("core", "visionAnimation") ) {
        const initializeSources = () => {
          const positionChanged = ("x" in changed) || ("y" in changed);
          const elevationChanged = "elevation" in changed;
          const rotationChanged = "rotation" in changed;
          const sizeChanged = ("width" in changed) || ("height" in changed);
          const perspectiveChanged = positionChanged || elevationChanged || sizeChanged
            || (rotationChanged && this.hasLimitedSourceAngle);
          const visionChanged = perspectiveChanged && this.hasSight;
          const lightChanged = perspectiveChanged && this._isLightSource();
          if ( visionChanged || lightChanged ) this.initializeSources();
        };
        if ( movementAnimationPromise ) movementAnimationPromise.finally(initializeSources);
        else initializeSources();
      }

      // Calculate movement duration
      movementAnimationDuration = 0;
      const context = this.#animationContexts.get(this.movementAnimationName);
      if ( context ) {
        movementAnimationDuration = context.duration;
        for ( const {options: {duration}} of context.chain ) movementAnimationDuration += duration;
        movementAnimationDuration = Math.max(movementAnimationDuration - context.time, 0);
      }

      // Calculate the duration after which the movement is to be continued
      const movementContinuationDuration = this.document.movement.state !== "pending"
        ? movementAnimationDuration : Math.max(movementAnimationDuration - (2 * game.time.averageLatency) - 50, 0);

      // Unblock keyboard movement 500 ms before the movement animation ends or the movement would be continued,
      // but not before the previous movement animation completed
      if ( movementAnimationPromise ) {
        const movementId = movement.id;
        Promise.allSettled([
          previousMovementAnimationPromise ?? Promise.resolve(),
          Promise.race([movementAnimationPromise, new Promise(resolve => {
            setTimeout(resolve, Math.max(movementContinuationDuration - 500, 0));
          })])
        ]).finally(() => {
          if ( movementId !== this.document.movement.id ) return;
          this._preventKeyboardMovement = false;
        });
      } else {
        this._preventKeyboardMovement = false;
      }

      // Create promise for when to continue movement
      this.document._movementContinuation.waitPromise = new Promise(resolve => {

        // If no animation or browser tab inactive, resolve immediately
        if ( !movementAnimationPromise || window.document.hidden ) {
          this.document._movementContinuation.resolveWaitPromise = () => {};
          resolve();
          return;
        }

        // Otherwise resolve once the browser tab becomes inactive, the movement animation
        // resolves or the movement continuation timeout has completed
        let visibilitychange = event => {
          if ( window.document.hidden ) callback();
        };
        const callback = () => {
          if ( !visibilitychange ) return;
          window.document.removeEventListener("visibilitychange", visibilitychange);
          visibilitychange = undefined;
          resolve();
        };
        window.document.addEventListener("visibilitychange", visibilitychange);
        this.document._movementContinuation.resolveWaitPromise = callback;
        movementAnimationPromise.finally(callback);
        setTimeout(callback, movementContinuationDuration);
      });
    }

    // Set the duration of non-movement properties to the animation duration of movement if requested
    const {linkToMovement, ...animationOptions} = options.animation ?? {};
    if ( (linkToMovement === true) && (movementAnimationDuration !== undefined) ) {
      animationOptions.duration ??= movementAnimationDuration;
    }

    // Dispatch the animation
    // noinspection ES6MissingAwait
    this.animate(to, animationOptions);
  }

  /* -------------------------------------------- */

  /**
   * Handle TOKEN_ANIMATE_IN/_OUT region events.
   * @param {TokenPosition} origin                                                                The origin of movement
   * @param {(TokenPosition & {regions: Set<RegionDocument>})[]} animationPath                    The animation path
   * @param {Set<RegionDocument>} initialRegions                                                  The initial regions
   * @param {{start: Promise<void>; end: Promise<void>; duration: number}[]} runningAnimations    The running animations
   */
  #handleAnimateInOutRegionEvents(origin, animationPath, initialRegions, runningAnimations) {
    let from = origin;
    let activeRegions = initialRegions;
    for ( let i = 0; i < animationPath.length; i++ ) {
      const to = animationPath[i];
      const regionsIn = to.regions.difference(activeRegions);
      const regionsOut = activeRegions.difference(to.regions);
      const eventDataOut = {
        token: this.document,
        position: {
          x: from.x,
          y: from.y,
          elevation: from.elevation,
          width: from.width,
          height: from.height,
          shape: from.shape
        }
      };
      const handleRegionEventsOut = () => {
        for ( const region of regionsOut ) {
          region._handleEvent({
            name: CONST.REGION_EVENTS.TOKEN_ANIMATE_OUT,
            data: eventDataOut,
            region,
            user: game.user
          });
        }
      };
      const promiseOut = runningAnimations[i].start;
      if ( promiseOut ) promiseOut.finally(handleRegionEventsOut);
      else handleRegionEventsOut();
      const eventDataIn = {
        token: this.document,
        position: {
          x: to.x,
          y: to.y,
          elevation: to.elevation,
          width: to.width,
          height: to.height,
          shape: to.shape
        }
      };
      const handleRegionEventsIn = () => {
        for ( const region of regionsIn ) {
          region._handleEvent({
            name: CONST.REGION_EVENTS.TOKEN_ANIMATE_IN,
            data: eventDataIn,
            region,
            user: game.user
          });
        }
      };
      const promiseIn = i > 0 ? runningAnimations[i - 1].end : undefined;
      if ( promiseIn ) promiseIn.finally(handleRegionEventsIn);
      else handleRegionEventsIn();
      from = to;
      activeRegions = to.regions;
    }
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onDelete(options, userId) {
    game.user.targets.delete(this);
    this.initializeSources({deleted: true});
    canvas.perception.update({refreshOcclusion: true});
    return super._onDelete(options, userId);
  }

  /* -------------------------------------------- */

  /**
   * Automatically pan the canvas when a controlled Token moves offscreen.
   */
  #panCanvas() {

    // Target center point in screen coordinates
    const c = this.center;
    const {x: sx, y: sy} = canvas.stage.transform.worldTransform.apply(c);

    // Screen rectangle minus padding space
    const pad = 50;
    const sidebarPad = document.getElementById("sidebar").clientWidth + pad;
    const rect = new PIXI.Rectangle(pad, pad, window.innerWidth - sidebarPad, window.innerHeight - pad);

    // Pan the canvas if the target center-point falls outside the screen rect
    if ( !rect.contains(sx, sy) ) canvas.animatePan(this.center);
  }

  /* -------------------------------------------- */

  /**
   * Handle changes to Token behavior when a significant status effect is applied
   * @param {string} statusId       The status effect ID being applied, from {@link CONFIG.specialStatusEffects}
   * @param {boolean} active        Is the special status effect now active?
   * @protected
   */
  _onApplyStatusEffect(statusId, active) {
    switch ( statusId ) {
      case CONFIG.specialStatusEffects.BURROW:
        this.initializeSources();
        break;
      case CONFIG.specialStatusEffects.FLY:
      case CONFIG.specialStatusEffects.HOVER:
        canvas.perception.update({refreshVision: true});
        break;
      case CONFIG.specialStatusEffects.INVISIBLE:
        canvas.perception.update({refreshVision: true});
        this._configureFilterEffect(statusId, active);
        break;
      case CONFIG.specialStatusEffects.BLIND:
        this.initializeVisionSource();
        break;
    }

    // Call hooks
    Hooks.callAll("applyTokenStatusEffect", this, statusId, active);
  }

  /* -------------------------------------------- */

  /**
   * Add/Modify a filter effect on this token.
   * @param {string} statusId       The status effect ID being applied, from {@link CONFIG.specialStatusEffects}
   * @param {boolean} active        Is the special status effect now active?
   * @internal
   */
  _configureFilterEffect(statusId, active) {
    let filterClass = null;
    const filterUniforms = {};

    // TODO: The filter class should be into CONFIG with specialStatusEffects or conditions.
    switch ( statusId ) {
      case CONFIG.specialStatusEffects.INVISIBLE:
        filterClass = InvisibilityFilter;
        break;
    }
    if ( !filterClass ) return;

    const target = this.mesh;
    target.filters ??= [];

    // Is a filter active for this id?
    let filter = this.#filterEffects.get(statusId);
    if ( !filter && active ) {
      filter = filterClass.create(filterUniforms);

      // Push the filter and set the filter effects map
      target.filters.push(filter);
      this.#filterEffects.set(statusId, filter);
    }
    else if ( filter ) {
      filter.enabled = active;
      foundry.utils.mergeObject(filter.uniforms, filterUniforms, {
        insertKeys: false,
        overwrite: true,
        enforceTypes: true
      });
      if ( active && !target.filters.find(f => f === filter) ) target.filters.push(filter);
    }
  }

  /* -------------------------------------------- */

  /**
   * Update the filter effects depending on special status effects
   * TODO: replace this method by something more convenient.
   * @internal
   */
  _updateSpecialStatusFilterEffects() {
    const invisible = CONFIG.specialStatusEffects.INVISIBLE;
    this._configureFilterEffect(invisible, this.document.hasStatusEffect(invisible));
  }

  /* -------------------------------------------- */

  /**
   * Remove all filter effects on this placeable.
   * @internal
   */
  _removeAllFilterEffects() {
    const target = this.mesh;
    if ( target?.filters?.length ) {
      for ( const filterEffect of this.#filterEffects.values() ) {
        target.filters.findSplice(f => f === filterEffect);
      }
    }
    this.#filterEffects.clear();
  }

  /* -------------------------------------------- */

  /**
   * Additional events that trigger once control of the Token is established
   * @param {object} options Optional parameters which apply for specific implementations
   * @param {boolean} [options.releaseOthers=true] Release control of all other Tokens
   * @param {bolean} [options.pan=false] Pan to the controlled Token
   * @protected
   * @override
   */
  _onControl({releaseOthers=true, pan=false, ...options}={}) {
    super._onControl(options);
    for ( const token of this.layer.placeables ) {
      if ( !token.vision === token._isVisionSource() ) token.initializeVisionSource();
    }
    _token = this; // Debugging global window variable
    canvas.perception.update({
      refreshVision: true,
      refreshSounds: true,
      refreshOcclusion: this.layer.occlusionMode & CONST.TOKEN_OCCLUSION_MODES.CONTROLLED
    });
    if ( pan ) canvas.animatePan(this.center);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onRelease(options) {
    super._onRelease(options);
    for ( const token of this.layer.placeables ) {
      if ( !token.vision === token._isVisionSource() ) token.initializeVisionSource();
    }
    canvas.perception.update({
      refreshVision: true,
      refreshSounds: true,
      refreshOcclusion: this.layer.occlusionMode & CONST.TOKEN_OCCLUSION_MODES.CONTROLLED
    });
  }

  /* -------------------------------------------- */

  /** @override */
  _overlapsSelection(rectangle) {
    if ( !this.shape ) return false;
    const {x, y} = this.position;
    const shape = this.shape;
    const isRectangle = shape instanceof PIXI.Rectangle;
    if ( !isRectangle ) {
      const {width, height} = this.document.getSize();
      const bounds = new PIXI.Rectangle(x, y, width, height);
      if ( !rectangle.intersects(bounds) ) return false;
    }
    const localRectangle = new PIXI.Rectangle(
      rectangle.x - x,
      rectangle.y - y,
      rectangle.width,
      rectangle.height
    );
    if ( isRectangle ) return localRectangle.intersects(shape);
    const shapePolygon = shape instanceof PIXI.Polygon ? shape : shape.toPolygon();
    const intersection = localRectangle.intersectPolygon(shapePolygon, {scalingFactor: CLIPPER_SCALING_FACTOR});
    return intersection.points.length !== 0;
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /** @override */
  _canControl(user, event) {
    if ( this.layer._draggedToken ) return false;
    if ( !this.layer.active || this.isPreview ) return false;
    if ( canvas.controls.ruler.active || (CONFIG.Canvas.rulerClass.canMeasure && (event?.type === "pointerdown")) ) return false;
    if ( game.activeTool === "target" ) return true;
    return super._canControl(user, event);
  }

  /* -------------------------------------------- */

  /** @override */
  _canHUD(user, event) {
    if ( this.layer._draggedToken ) return false;
    if ( !this.layer.active || this.isPreview ) return false;
    if ( canvas.controls.ruler.active || (CONFIG.Canvas.rulerClass.canMeasure && (event?.type === "pointerdown")) ) return false;
    return user.isGM || (this.actor?.testUserPermission(user, "OWNER") ?? false);
  }

  /* -------------------------------------------- */

  /** @override */
  _canConfigure(user, event) {
    if ( this.layer._draggedToken ) return false;
    if ( !this.layer.active || this.isPreview ) return false;
    if ( canvas.controls.ruler.active || (CONFIG.Canvas.rulerClass.canMeasure && (event?.type === "pointerdown")) ) return false;
    return true;
  }

  /* -------------------------------------------- */

  /** @override */
  _canHover(user, event) {
    return !this.isPreview;
  }

  /* -------------------------------------------- */

  /** @override */
  _canView(user, event) {
    if ( this.layer._draggedToken ) return false;
    if ( !this.layer.active || this.isPreview ) return false;
    if ( canvas.controls.ruler.active || (CONFIG.Canvas.rulerClass.canMeasure && (event?.type === "pointerdown")) ) return false;
    if ( !this.actor ) ui.notifications.warn("TOKEN.WarningNoActor", {localize: true});
    return this.actor?.testUserPermission(user, "LIMITED");
  }

  /* -------------------------------------------- */

  /** @override */
  _canDrag(user, event) {
    if ( this.layer._draggedToken ) return false;
    if ( !this.layer.active || this.isPreview ) return false;
    if ( !this.controlled ) return false;
    return game.activeTool === "select";
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onHoverIn(event, options) {
    const combatant = this.combatant;
    if ( combatant ) ui.combat.hoverCombatant(combatant, ui.combat._isTokenVisible(this));
    if ( this.layer.occlusionMode & CONST.TOKEN_OCCLUSION_MODES.HOVERED ) {
      canvas.perception.update({refreshOcclusion: true});
    }
    return super._onHoverIn(event, options);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onHoverOut(event) {
    const combatant = this.combatant;
    if ( combatant ) ui.combat.hoverCombatant(combatant, false);
    if ( this.layer.occlusionMode & CONST.TOKEN_OCCLUSION_MODES.HOVERED ) {
      canvas.perception.update({refreshOcclusion: true});
    }
    return super._onHoverOut(event);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onClickLeft(event) {
    const tool = game.activeTool;
    if ( tool === "target" ) {
      event.stopPropagation();
      if ( this.document.isSecret ) return;
      return this.setTarget(!this.isTargeted, {releaseOthers: !event.shiftKey});
    }
    super._onClickLeft(event);
  }

  /* -------------------------------------------- */

  /** @override */
  _propagateLeftClick(event) {
    return CONFIG.Canvas.rulerClass.canMeasure;
  }

  /* -------------------------------------------- */

  /** @override */
  _onClickLeft2(event) {
    if ( !this._propagateLeftClick(event) ) event.stopPropagation();
    const sheet = this.actor?.sheet;
    if ( sheet?.rendered ) {
      sheet.maximize();
      sheet.bringToFront();
    }
    else sheet?.render(true, {token: this.document});
  }

  /* -------------------------------------------- */

  /** @override */
  _onClickRight2(event) {
    if ( !this._propagateRightClick(event) ) event.stopPropagation();
    if ( this.isOwner && game.user.can("TOKEN_CONFIGURE") ) return super._onClickRight2(event);
    if ( this.document.isSecret ) return;
    return this.setTarget(!this.targeted.has(game.user), {releaseOthers: !event.shiftKey});
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _initializeDragLeft(event) {
    super._initializeDragLeft(event);

    // This token is now dragged
    this.layer._draggedToken = this;

    // Initialize the drag contexts
    const contexts = event.interactionData.contexts = {};
    for ( const clone of event.interactionData.clones ) {
      const token = clone._original;

      // Create the drag context
      contexts[token.document.id] = token.#initializeDragContext(event, clone);

      // Update planned movement
      token.#updatePlannedMovement();
    }

    // Initialize waypoint mode
    event.interactionData.dropped = false;
    event.interactionData.cancelled = false;
    event.interactionData.released = false;
  }

  /* -------------------------------------------- */

  /**
   * Initialize the drag context for this Token.
   * @param {PIXI.FederatedEvent} event    The pointermove event
   * @param {Token} clonedToken            The preview token
   * @returns {TokenDragContext}           The drag context
   */
  #initializeDragContext(event, clonedToken) {
    const {x, y, elevation, width, height, shape} = this.document._source;
    let snapped = false;
    if ( !canvas.grid.isGridless ) {
      const snappedPosition = this.document.getSnappedPosition({x, y, elevation, width, height, shape});
      snapped = (x === Math.round(snappedPosition.x)) && (y === Math.round(snappedPosition.y))
        && (elevation.almostEqual(snappedPosition.elevation));
    }
    const origin = {x, y, elevation, width, height, shape};
    const destination = {x, y, elevation, width, height, shape, action: this.document.movementAction,
      snapped, explicit: true, checkpoint: true};
    return {
      token: this,
      clonedToken,
      origin,
      destination,
      waypoints: [],
      foundPath: [destination],
      unreachableWaypoints: [],
      hidden: event.altKey,
      updating: false,
      search: null,
      searching: false,
      searchId: 0
    };
  }

  /* -------------------------------------------- */

  /**
   * Get the context of the current drag workflow for this Token.
   * @returns {TokenDragContext|void}    The drag context if the Token is being dragged
   */
  #getDragContext() {
    if ( this.isPreview ) return;
    const context = this.layer._draggedToken?.mouseInteractionManager.interactionData.contexts[this.document.id];
    if ( context ) return context;
  }

  /* -------------------------------------------- */

  /**
   * Is this a preview of drag operation and the destination is unreachable?
   * @type {boolean}
   */
  get #isUnreachableDragPreview() {
    if ( !this.isPreview ) return false;
    const context = this.layer._draggedToken?.mouseInteractionManager.interactionData.contexts[this.document.id];
    if ( !context ) return false;
    return context.unreachableWaypoints.length > 0;
  }

  /* -------------------------------------------- */

  /**
   * Get the constrain options used during the drag operation.
   * @returns {Omit<TokenConstrainMovementPathOptions, "preview"|"history">}    The constrain options
   * @protected
   */
  _getDragConstrainOptions() {
    const unconstrainedMovement = game.user.isGM && game.settings.get("core", "unconstrainedMovement");
    return {ignoreWalls: unconstrainedMovement, ignoreCost: unconstrainedMovement};
  }

  /* -------------------------------------------- */

  /**
   * Get the search options used during the drag operation to find the path of movement through the waypoints.
   * @returns {TokenFindMovementPathOptions}    The search options
   * @protected
   */
  _getDragPathfindingOptions() {
    return {...this._getDragConstrainOptions(), preview: true, history: true, delay: 250};
  }

  /* -------------------------------------------- */

  /**
   * Get the movement action for the waypoints placed during a drag operation.
   * @returns {string}    The movement action
   * @protected
   */
  _getDragMovementAction() {
    return this.layer._dragMovementAction ?? this.document.movementAction;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onDragLeftDrop(event) {
    if ( !event.interactionData.dropped && this._shouldPreventDragLeftDrop(event) ) {
      event.interactionData.released = true;
      event.preventDefault(); // Prevent drop workflow
      return;
    }
    event.interactionData.dropped = true;
    return super._onDragLeftDrop(event);
  }

  /* -------------------------------------------- */

  /**
   * Prevent the drop event?
   * Called by {@link Token#_onDragLeftDrop}.
   * @param {PIXI.FederatedEvent} event    The pointerup event
   * @returns {boolean}
   * @protected
   */
  _shouldPreventDragLeftDrop(event) {
    return (event.ctrlKey || event.metaKey) && !!this.ruler;
  }

  /* -------------------------------------------- */

  /** @override */
  _prepareDragLeftDropUpdates(event) {
    const updates = [];
    const movement = {};
    for ( const [id, context] of Object.entries(event.interactionData.contexts) ) {
      if ( context.foundPath.length <= 1 ) continue;
      updates.push({_id: id});
      movement[id] = {waypoints: context.foundPath.slice(1), method: "dragging",
        constrainOptions: this._getDragConstrainOptions()};
    }
    return [updates, {movement}];
  }

  /* -------------------------------------------- */

  /** @override */
  _onDragLeftMove(event) {

    // Update the destinations of the drag previews and rulers
    this._updateDragDestination(event.interactionData.destination, {snap: !event.shiftKey});

    // Pan the canvas if the drag event approaches the edge
    canvas._onDragCanvasPan(event);
  }

  /* -------------------------------------------- */

  /**
   * Update the destinations of the drag previews and rulers
   * @param {Point} point                     The (unsnapped) center point of the waypoint
   * @param {object} [options]                Additional options
   * @param {boolean} [options.snap=false]    Snap the destination?
   * @protected
   */
  _updateDragDestination(point, {snap=false}={}) {
    const contexts = Object.values(this.mouseInteractionManager.interactionData.contexts);
    if ( canvas.grid.isGridless ) snap = false;

    // Determine dragged distance
    const origin = this._getDragOrigin();
    const dx = point.x - origin.x;
    const dy = point.y - origin.y;

    // Update the destinations
    for ( const context of contexts ) {
      const {x, y} = context.token.document._source;
      const destination = context.token._getDragWaypointPosition(context.destination, {x: x + dx, y: y + dy}, {snap});
      // The movement action is set in Token.#recalculatePlannedMovementPath
      destination.action = undefined;
      // Elevation is ignored here, but is considered in Token.#recalculatePlannedMovementPath
      destination.snapped = snap;
      destination.explicit = true;
      destination.checkpoint = true;
      if ( Object.keys(context.destination).every(k => context.destination[k] === destination[k]) ) continue;
      context.destination = destination;

      // Update the position of the preview token
      Token.#updateDragPreview(context.clonedToken, destination);

      // Update the ruler path
      Token.#recalculatePlannedMovementPath(context);
    }
  }

  /* -------------------------------------------- */

  /**
   * Get the origin of the drag operation.
   * @returns {Point}
   * @internal
   */
  _getDragOrigin() {
    return this.document.getCenterPoint(this.document._source);
  }

  /* -------------------------------------------- */

  /**
   * Called by {@link foundry.canvas.layers.TokenLayer#_onClickLeft} while this Token is in a drag workflow.
   * @param {PIXI.FederatedEvent} event    The pointerdown event
   * @protected
   */
  _onDragClickLeft(event) {

    // Add waypoints if CTRL is down
    const isCtrl = event.ctrlKey || event.metaKey;
    if ( isCtrl && this.ruler ) this._addDragWaypoint(event.interactionData.origin, {snap: !event.shiftKey});

    // Otherwise drop the token
    else this._triggerDragLeftDrop();

    // Prevent left-click drag workflow on the canvas
    canvas.mouseInteractionManager.cancel();
  }

  /* -------------------------------------------- */

  /**
   * Add ruler waypoints and update ruler paths.
   * @param {Point} point                     The (unsnapped) center point of the waypoint
   * @param {object} [options]                Additional options
   * @param {boolean} [options.snap=false]    Snap the added waypoint?
   * @protected
   */
  _addDragWaypoint(point, {snap=false}={}) {
    const contexts = Object.values(this.mouseInteractionManager.interactionData.contexts);
    if ( canvas.grid.isGridless ) snap = false;

    // Determine dragged distance
    const origin = this._getDragOrigin();
    const dx = point.x - origin.x;
    const dy = point.y - origin.y;

    // Add waypoints and update ruler paths
    let redundantWaypoint = true;
    for ( const context of contexts ) {
      const {x, y} = context.origin;
      const waypoint = context.token._getDragWaypointPosition(context.destination, {x: x + dx, y: y + dy}, {snap});
      waypoint.action = context.token._getDragMovementAction();
      waypoint.snapped = snap && context.destination.elevation.almostEqual(waypoint.elevation);
      waypoint.explicit = true;
      waypoint.checkpoint = true;
      context.waypoints.push(waypoint);

      const lastWaypoint = context.waypoints.at(-2) ?? context.origin;
      if ( !TokenDocument.arePositionsEqual(lastWaypoint, waypoint) ) {
        Token.#recalculatePlannedMovementPath(context);
        redundantWaypoint = false;
      } else if ( lastWaypoint.snapped !== waypoint.snapped ) {
        lastWaypoint.snapped = waypoint.snapped;
        Token.#recalculatePlannedMovementPath(context);
      }
    }

    // If the waypoint is matching the last waypoint for all rulers,
    // remove that were waypoints that were just added
    if ( redundantWaypoint ) contexts.forEach(context => context.waypoints.pop());
  }

  /* -------------------------------------------- */

  /**
   * Trigger drop event. This drop cannot be prevented by {@link Token#_shouldPreventDragLeftDrop}.
   * @protected
   */
  _triggerDragLeftDrop() {
    const eventSystem = canvas.app.renderer.events;
    const rootBoundary = eventSystem.rootBoundary;
    const dropEvent = rootBoundary.createPointerEvent(eventSystem.pointer, "pointerup", this);
    dropEvent.defaultPrevented = false;
    dropEvent.path = null;
    try {
      this.mouseInteractionManager.interactionData.dropped = true;
      this.mouseInteractionManager.handleEvent(dropEvent);
    } finally {
      rootBoundary.freeEvent(dropEvent);
    }
  }

  /* -------------------------------------------- */

  /**
   * Called by {@link foundry.canvas.layers.TokenLayer#_onClickLeft2} while this Token is in a drag workflow.
   * @param {PIXI.FederatedEvent} event    The pointerdown event
   * @protected
   */
  _onDragClickLeft2(event) {

    // Prevent left-click drag workflow on the canvas
    canvas.mouseInteractionManager.cancel();
  }

  /* -------------------------------------------- */

  /**
   * Called by {@link foundry.canvas.layers.TokenLayer#_onClickRight} while this Token is in a drag workflow.
   * @param {PIXI.FederatedEvent} event    The pointerdown event
   * @protected
   */
  _onDragClickRight(event) {

    // Remove last waypoints
    if ( this.ruler ) this._removeDragWaypoint();

    // Otherwise cancel the drag workflow
    else this._triggerDragLeftCancel();

    // Prevent right-click drag workflow on the canvas
    canvas.mouseInteractionManager.cancel();
  }

  /* -------------------------------------------- */

  /**
   * Remove last ruler waypoints and update ruler paths.
   * @protected
   */
  _removeDragWaypoint() {

    // Update those ruler that have their path changed
    for ( const context of Object.values(this.mouseInteractionManager.interactionData.contexts) ) {

      // If one ruler has no waypoints, all of them have none: cancel the drag workflow
      if ( context.waypoints.length === 0 ) {
        this._triggerDragLeftCancel();
        break;
      }

      // Recalculate path if the waypoints change
      const previousWaypoint = context.waypoints.at(-2) ?? context.origin;
      const lastWaypoint = context.waypoints.pop();
      if ( !TokenDocument.arePositionsEqual(lastWaypoint, previousWaypoint) ) {
        Token.#recalculatePlannedMovementPath(context);
      }
    }
  }

  /* -------------------------------------------- */

  /**
   * Cancel the drag workflow. This cancellation cannot be prevented by {@link Token#_onDragLeftCancel}.
   * @protected
   */
  _triggerDragLeftCancel() {
    this.mouseInteractionManager.interactionData.cancelled = true;
    this.mouseInteractionManager.cancel();
  }

  /* -------------------------------------------- */

  /**
   * Called by {@link foundry.canvas.layers.TokenLayer#_onClickRight2} while this Token is in a drag workflow.
   * @param {PIXI.FederatedEvent} event    The pointerdown event
   * @protected
   */
  _onDragClickRight2(event) {

    // Prevent right-click drag workflow on the canvas
    canvas.mouseInteractionManager.cancel();
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onDragLeftCancel(event) {
    if ( event.interactionData.cancelled || event.interactionData.dropped ) return true;
    if ( event.interactionData.released ) return false;
    if ( event.interactionData.contexts[this.document.id].waypoints.length > 0 ) {
      this._removeDragWaypoint();
      return false;
    }
    return super._onDragLeftCancel(event);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _finalizeDragLeft(event) {

    // This token is no longer dragged
    this.layer._draggedToken = null;

    // Reset the movement action override
    this.layer._dragMovementAction = null;

    // Cancel path searches and refesh ruler visualization
    for ( const context of Object.values(event.interactionData.contexts) ) {
      context.search?.cancel();
      context.token.#updatePlannedMovement();
    }

    super._finalizeDragLeft(event);
  }

  /* -------------------------------------------- */

  /** @override */
  _onDragEnd() {
    this.initializeSources({deleted: true});
    this._original?.initializeSources();
    super._onDragEnd();
  }

  /* -------------------------------------------- */

  /**
   * Change the elevation of Token during dragging.
   * @param {WheelEvent} event    The mousewheel event
   * @protected
   */
  _onDragMouseWheel(event) {
    const isCtrl = game.keyboard.isModifierActive("CONTROL"); // We cannot trust event.ctrlKey because of touchpads
    if ( !isCtrl ) return;
    this._changeDragElevation(-Math.sign(event.delta), {precise: event.shiftKey});
  }

  /* -------------------------------------------- */

  /**
   * Change the elevation of the dragged Tokens.
   * @param {number} delta                       The number vertical steps
   * @param {object} [options]                   Additional options
   * @param {boolean} [options.precise=false]    Round elevations to multiples of the grid distance divided by
   *                                             `CONFIG.Canvas.elevationSnappingPrecision`?
   *                                             If false, rounds to multiples of the grid distance.
   * @protected
   */
  _changeDragElevation(delta, {precise=false}={}) {

    // Calculate the elevation interval and delta
    const interval = canvas.dimensions.distance / (precise ? CONFIG.Canvas.elevationSnappingPrecision : 1);

    // Update the destination elevation of each ruler
    for ( const context of Object.values(this.mouseInteractionManager.interactionData.contexts) ) {
      const elevation = (context.destination.elevation + (delta * interval)).toNearest(interval, delta > 0 ? "floor" : "ceil");
      const destination = context.token._getDragWaypointPosition(context.destination, {elevation},
        {snap: context.destination.snap});
      if ( TokenDocument.arePositionsEqual(context.destination, destination) ) continue;
      for ( const k of TokenDocument.MOVEMENT_FIELDS ) context.destination[k] = destination[k];

      // Update the destination of the preview token
      Token.#updateDragPreview(context.clonedToken, destination);

      // Update the ruler path
      Token.#recalculatePlannedMovementPath(context);
    }
  }

  /* -------------------------------------------- */

  /**
   * Get the drag waypoint position.
   * @param {DeepReadonly<Pick<TokenPosition, "x"|"y"|"elevation">>} current
   * @param {DeepReadonly<Partial<ElevatedPoint>>} changes
   * @param {object} [options]
   * @param {boolean} [options.snap=false]
   * @returns {Pick<TokenPosition, "x"|"y"|"elevation"> & Partial<TokenDimensions>}
   * @internal
   */
  _getDragWaypointPosition(current, changes, {snap=false}={}) {
    const x = Math.round(changes.x ?? current.x);
    const y = Math.round(changes.y ?? current.y);
    const elevation = changes.elevation ?? current.elevation;
    if ( !snap ) return {x, y, elevation};
    const {width, height, shape} = this.document._source;
    const position = this.document.getSnappedPosition({x, y, elevation, width, height, shape});
    position.x = Math.round(position.x);
    position.y = Math.round(position.y);
    position.elevation = elevation;
    return position;
  }

  /* -------------------------------------------- */

  /**
   * Update the position of the preview token.
   * @param {Token} preview                         The preview token
   * @param {Partial<TokenPosition>} destination    The destination
   */
  static #updateDragPreview(preview, destination) {
    const source = preview._original.document._source;
    const {x=source.x, y=source.y, elevation=source.elevation, width=source.width, height=source.height,
      shape=source.shape} = destination;
    const refreshPosition = (preview.document.x !== x) || (preview.document.y !== y);
    const refreshElevation = preview.document.elevation !== elevation;
    const refreshSize = (preview.document.width !== width) || (preview.document.height !== height);
    const refreshShape = preview.document.shape !== shape;
    preview.document.x = x;
    preview.document.y = y;
    preview.document.elevation = elevation;
    preview.document.width = width;
    preview.document.height = height;
    preview.document.shape = shape;
    preview.renderFlags.set({refreshPosition, refreshElevation, refreshSize, refreshShape});
  }

  /* -------------------------------------------- */

  /**
   * Cancel the drag workflow if this Token is the one the drag operation was initiated on, or
   * otherwise remove this Token from the drag operation if it is being part of it.
   */
  #cancelDrag() {
    if ( !this.layer._draggedToken ) return; // No drag workflow
    if ( this.isPreview ) return; // Previews cannot be dragged

    // If this token is the dragged token, cancel the drag workflow
    if ( this.layer._draggedToken === this ) {
      this._triggerDragLeftCancel();
      return;
    }

    // If this token not the dragged token but part of a drag operation,...
    const interactionData = this.layer._draggedToken.mouseInteractionManager.interactionData;
    const context = interactionData.contexts[this.document.id];
    if ( !context ) return;

    // ... cancel pathfinding, delete the drag context, and destroy the preview token
    context.search?.cancel();
    delete interactionData.contexts[this.document.id];
    interactionData.clones.findSplice(clone => clone === context.clonedToken);
    context.clonedToken._onDragEnd();
    context.clonedToken.destroy({children: true});
  }

  /* -------------------------------------------- */

  /**
   * Recalculate the planned movement path of this Token for the current User.
   */
  recalculatePlannedMovementPath() {
    const context = this.#getDragContext();
    if ( !context || context.updating ) return;
    context.updating = true;
    context.search?.cancel();
    canvas.app.ticker.addOnce(() => {
      context.updating = false;
      Token.#recalculatePlannedMovementPath(context);
    }, undefined, PIXI.UPDATE_PRIORITY.OBJECTS + 2);
  }

  /* -------------------------------------------- */

  /**
   * Update the planned movement path.
   * @param {TokenDragContext} context    The drag context
   */
  static #recalculatePlannedMovementPath(context) {
    if ( context.updating ) return;

    // Cancel current pathfinding job
    context.search?.cancel();

    // Remove repeating explicit waypoints
    const explicitWaypoints = [{...context.origin}];
    const destination = {...context.destination};
    destination.action = context.token._getDragMovementAction();
    destination.snapped &&= destination.elevation.almostEqual(
      context.token.document.getSnappedPosition(destination).elevation);
    for ( const {x, y, elevation, width=context.origin.width, height=context.origin.height, shape=context.origin.shape,
      action, snapped, explicit, checkpoint} of [...context.waypoints, destination] ) {
      const waypoint = {x, y, elevation, width, height, shape, action, snapped, explicit, checkpoint};
      const lastWaypoint = explicitWaypoints.at(-1);
      if ( TokenDocument.arePositionsEqual(lastWaypoint, waypoint) ) continue;
      explicitWaypoints.push(waypoint);
    }

    // Reuse parts of the previous found path that pass through the current explicit waypoints
    let lastReachedWaypointIndex = 0;
    let reachableWaypoints = 0;
    for ( let i = 0; (i < context.foundPath.length) && (reachableWaypoints < explicitWaypoints.length); i++ ) {
      const waypoint = context.foundPath[i];
      const explicitWaypoint = explicitWaypoints[reachableWaypoints];
      if ( TokenDocument.arePositionsEqual(explicitWaypoint, waypoint) ) {
        reachableWaypoints++;
        lastReachedWaypointIndex = i;
      }
    }
    context.foundPath = context.foundPath.slice(0, lastReachedWaypointIndex + 1);
    context.unreachableWaypoints = explicitWaypoints.slice(reachableWaypoints);
    context.searching = true;

    // Start new pathfinding job
    context.searchId += 1;
    const searchId = context.searchId;
    const searchStartTime = canvas.app.ticker.lastTime;
    if ( context.token.ruler ) {
      const searchOptions = context.token._getDragPathfindingOptions();
      context.search = context.token.findMovementPath(explicitWaypoints, searchOptions);
    } else {
      const foundPath = [];
      for ( const {x, y, elevation, width=context.origin.width, height=context.origin.height,
        shape=context.origin.shape, action=context.token.document.movementAction, snapped=false,
        explicit=false, checkpoint=false} of explicitWaypoints ) {
        foundPath.push({x, y, elevation, width, height, shape, action, snapped, explicit, checkpoint});
      }
      context.search = {
        result: foundPath,
        promise: Promise.resolve(foundPath),
        cancel: () => {}
      };
    }

    // Handle result of pathfinding job
    const handleResult = async foundPath => {
      if ( !foundPath || (context.searchId !== searchId) ) return; // Search was cancelled
      if ( context.token.destroyed || context.clonedToken.destroyed ) return;

      // If the path was found quickly but not before the the first frame was rendered with the search animation,
      // delay refreshing the ruler to prevent very brief flickering
      const elapsedTime = canvas.app.ticker.lastTime - searchStartTime;
      if ( elapsedTime > 0 ) {
        const minDuration = 500; // The minimum duration of the search animation
        if ( elapsedTime < minDuration ) {
          await new Promise(resolve => {
            setTimeout(resolve, minDuration - elapsedTime);
          });

          // Another pathfinding job was started while we delayed
          if ( context.searchId !== searchId ) return;
        }
      }

      // Identify reachable waypoints, which are those that passed through by the found path
      let reachableWaypoints = 0;
      for ( const waypoint of foundPath ) {
        const explicitWaypoint = explicitWaypoints[reachableWaypoints];
        if ( TokenDocument.arePositionsEqual(explicitWaypoint, waypoint) ) reachableWaypoints++;
      }
      context.foundPath = foundPath;
      context.unreachableWaypoints = explicitWaypoints.slice(reachableWaypoints);
      context.searching = false;

      // Update planned movement
      context.token.#updatePlannedMovement();
    };

    // Handle the search result immediately if the path was found instantly
    if ( context.search.result !== undefined ) handleResult(context.search.result);

    // Otherwise handle the result once the path is found
    else {
      context.search.promise.then(handleResult);

      // Update planned movement just before the next frame is rendered so that we don't broadcast
      // a state where searching is in progress when we find the path before the next frame
      canvas.app.ticker.addOnce(() => {
        if ( context.searching && (context.searchId === searchId) ) context.token.#updatePlannedMovement();
      }, undefined, PIXI.UPDATE_PRIORITY.OBJECTS + 1);
    }
  }

  /* -------------------------------------------- */

  /**
   * Update the planned movement for the current user.
   */
  #updatePlannedMovement() {
    const context = this.#getDragContext();
    if ( !context ) {
      if ( game.user.id in this._plannedMovement ) {
        delete this._plannedMovement[game.user.id];
        this.renderFlags.set({refreshRuler: true, refreshState: true});
        this.#throttleBroadcastPlannedMovement();
      }
      return;
    }

    // Add drag ruler state for the current user
    const foundPath = this.document.getCompleteMovementPath(
      this.createTerrainMovementPath(context.foundPath, {preview: true}));
    const unreachableWaypoints = this.document.getCompleteMovementPath(
      this.createTerrainMovementPath([foundPath.at(-1), ...context.unreachableWaypoints], {preview: true})).slice(1);
    const combinedPath = [...this.document.movementHistory, ...foundPath, ...unreachableWaypoints];
    const measurement = this.measureMovementPath(combinedPath, {preview: true});
    for ( let i = this.document.movementHistory.length; i < combinedPath.length; i++ ) {
      const waypoint = combinedPath[i];
      waypoint.cost = measurement.waypoints[i].backward?.cost ?? 0;
    }

    // Configure the origin of the found path based on the last recorded waypoint
    const current = this.document.movementHistory.at(-1);
    const origin = foundPath[0];
    origin.action = (current !== undefined) && !TokenDocument.arePositionsEqual(current, origin)
      ? "displace" : (current?.action ?? foundPath[0].action);
    origin.terrain = null;
    origin.snapped = false;
    origin.explicit = false;
    origin.checkpoint = true;
    origin.cost = 0;

    // Update planned movement and broadcast if it changed
    const previousPlannedMovement = this._plannedMovement[game.user.id];
    const plannedMovement = {foundPath, unreachableWaypoints, history: this.document.movementHistory,
      hidden: context.hidden, searching: context.searching};
    if ( foundry.utils.objectsEqual(previousPlannedMovement, plannedMovement) ) return;
    this._plannedMovement[game.user.id] = plannedMovement;
    this.#throttleBroadcastPlannedMovement();

    // Refresh ruler and state
    this.renderFlags.set({refreshRuler: true, refreshState: !previousPlannedMovement});

    // Update the center offset of the preview token
    context.clonedToken.#centerOffset.x = this.#centerOffset.x;
    context.clonedToken.#centerOffset.y = this.#centerOffset.y;
    context.clonedToken.#updateCenterOffset(origin, foundPath.slice(1).concat(unreachableWaypoints));
    context.clonedToken.#animationCenterOffset.x = context.clonedToken.#centerOffset.x;
    context.clonedToken.#animationCenterOffset.y = context.clonedToken.#centerOffset.y;

    // Update light and/or vision sources of the preview token if Token Drag Preview is enabled
    if ( game.settings.get("core", "tokenDragPreview") ) {
      context.clonedToken.initializeSources();
      canvas.perception.update({refreshLighting: true, refreshVision: true});
    } else {
      context.clonedToken.#adjustedCenter = context.clonedToken.getMovementAdjustedPoint(
        context.clonedToken.document.getCenterPoint());
    }
  }

  /* -------------------------------------------- */

  /**
   * A throttled function that broadcasts the planned movement.
   * @type {() => void}
   */
  #throttleBroadcastPlannedMovement = foundry.utils.throttle(this.#broadcastPlannedMovement.bind(this), 100);

  /* -------------------------------------------- */

  /**
   * Broadcast the planned movement.
   */
  #broadcastPlannedMovement() {
    game.user.broadcastActivity({plannedMovements: {[this.document.id]: game.user.hasPermission("SHOW_RULER")
      ? (this._plannedMovement[game.user.id] ?? null) : null}});
  }

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  updateSource({deleted=false}={}) {
    const msg = "Token#updateSource has been deprecated in favor of Token#initializeSources";
    foundry.utils.logCompatibilityWarning(msg, {since: 12, until: 14, once: true});
    this.initializeSources({deleted});
  }

  /**
   * @deprecated since v12
   * @ignore
   */
  getCenter(x, y) {
    const msg = "Token#getCenter(x, y) has been deprecated in favor of Token#getCenterPoint(Point).";
    foundry.utils.logCompatibilityWarning(msg, {since: 12, until: 14, once: true});
    return this.getCenterPoint(x !== undefined ? {x, y} : undefined);
  }

  /**
   * @deprecated since v12
   * @ignore
   */
  get owner() {
    const msg = "Token#owner has been deprecated. Use Token#isOwner instead.";
    foundry.utils.logCompatibilityWarning(msg, {since: 12, until: 14});
    return this.isOwner;
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  async toggleCombat(combat) {
    foundry.utils.logCompatibilityWarning("Token#toggleCombat is deprecated in favor of TokenDocument#toggleCombatant,"
      + " TokenDocument.implementation.createCombatants, and TokenDocument.implementation.deleteCombatants", {since: 12, until: 14});
    const tokens = canvas.tokens.controlled.map(t => t.document);
    if ( !this.controlled ) tokens.push(this.document);
    if ( this.inCombat ) await TokenDocument.implementation.deleteCombatants(tokens);
    else await TokenDocument.implementation.createCombatants(tokens);
  }


  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  async toggleEffect(effect, {active, overlay=false}={}) {
    foundry.utils.logCompatibilityWarning("Token#toggleEffect is deprecated in favor of Actor#toggleStatusEffect",
      {since: 12, until: 14});
    if ( !this.actor || !effect.id ) return false;
    return this.actor.toggleStatusEffect(effect.id, {active, overlay});
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  async toggleVisibility() {
    foundry.utils.logCompatibilityWarning("Token#toggleVisibility is deprecated without replacement in favor of"
      + " updating the hidden field of the TokenDocument directly.", {since: 12, until: 14});
    const isHidden = this.document.hidden;
    const tokens = this.controlled ? canvas.tokens.controlled : [this];
    const updates = tokens.map(t => { return {_id: t.id, hidden: !isHidden};});
    return canvas.scene.updateEmbeddedDocuments("Token", updates);
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v12 Stable 4
   * @ignore
   */
  _recoverFromPreview() {
    foundry.utils.logCompatibilityWarning("Token#_recoverFromPreview is deprecated without replacement in favor of"
      + " recovering from preview directly into TokenConfig#_resetPreview.", {since: 12, until: 14});
    this.renderable = true;
    this.initializeSources();
    this.control();
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v13
   * @ignore
   */
  testInsideRegion(region, position) {
    foundry.utils.logCompatibilityWarning("Token#testInsideRegion is deprecated "
      + "in favor of TokenDocument#testInsideRegion.", {since: 13, until: 15});
    return this.document.testInsideRegion(region.document, position);
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v13
   * @ignore
   */
  segmentizeRegionMovement(region, waypoints, options) {
    foundry.utils.logCompatibilityWarning("Token#segmentizeRegionMovement is deprecated "
      + "in favor of TokenDocument#segmentizeRegionMovementPath.", {since: 13, until: 15});
    if ( options?.teleport !== undefined ) {
      waypoints = waypoints.map(waypoint => {
        waypoint = {...waypoint};
        waypoint.action ??= (options.teleport ? "displace" : this.document.movementAction);
        return waypoint;
      });
    }
    return this.document.segmentizeRegionMovementPath(region.document, waypoints);
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v13
   * @ignore
   */
  getSize() {
    foundry.utils.logCompatibilityWarning("Token#getSize is deprecated in favor of TokenDocument#getSize.", {since: 13, until: 14, once: true});
    return this.document.getSize();
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v13
   * @ignore
   */
  get target() {
    foundry.utils.logCompatibilityWarning("Token#target is deprecated and has been split into two new graphics "
      + "object: targetArrows and targetPips. targetArrows is returned by the deprecated target property.", {since: 13, until: 14, once: true});
    return this.targetArrows;
  }
}

import PrimarySpriteMesh from "../../primary/primary-sprite-mesh.mjs";
import CanvasAnimation from "../../animation/canvas-animation.mjs";
import Color from "@common/utils/color.mjs";

/**
 * @import {PrimarySpriteMeshConstructorOptions} from "../../primary/primary-sprite-mesh.mjs";
 * @import {CanvasAnimationData, CanvasAnimationAttribute} from "../../animation/_types.mjs";
 * @import {WallDoorAnimationConfig} from "@client/config.mjs";
 */

/**
 * @typedef DoorAnimationConfiguration
 * @property {number} [direction=1]
 * @property {boolean} [double=false]
 * @property {number} [duration=500]
 * @property {boolean} [flip=false]
 * @property {number} [strength=1.0]
 * @property {keyof typeof CONFIG.Wall.animationTypes} [type="swing"]
 * @property {DoorStyle} [style]
 * @property {WallDoorAnimationConfig} config
 */

/**
 * @typedef DoorStateSnapshot
 * @property {number} x
 * @property {number} y
 * @property {number} elevation
 * @property {number} sort
 * @property {number} rotation
 * @property {number} scaleX
 * @property {number} scaleY
 * @property {number} tint
 * @property {number} alpha
 */

/**
 * @typedef {typeof DoorMesh.DOOR_STYLES[keyof typeof DoorMesh.DOOR_STYLES]} DoorStyle
 */

/**
 * A special subclass of PrimarySpriteMesh used to render an interactive door.
 */
export default class DoorMesh extends PrimarySpriteMesh {
  /**
   * Construct a DoorMesh by providing PrimarySpriteMesh constructor options and specific door configuration.
   * @param {PrimarySpriteMeshConstructorOptions & DoorAnimationConfiguration & {style: DoorStyle}} options
   */
  constructor({direction, double, duration, flip, strength, type, style, ...spriteOptions}={}) {
    super(spriteOptions);
    this.initialize({direction, double, duration, flip, strength, style, type});
  }

  /**
   * The possible rendering styles for a door mesh.
   */
  static DOOR_STYLES = Object.freeze({
    SINGLE: "single",
    DOUBLE_LEFT: "doubleL",
    DOUBLE_RIGHT: "doubleR"
  });

  /**
   * The rendering style of the door
   * @type {DoorStyle}
   */
  #style;

  /**
   * The animation configuration of the door.
   * @type {Required<DoorAnimationConfiguration>}
   */
  #animation;

  /**
   * Is the door currently in the open state?
   * @type {boolean}
   */
  #open;

  /**
   * The original position of the door in its resting CLOSED state.
   * @type {DoorStateSnapshot}
   * @internal
   */
  _closedPosition;

  /**
   * The currently rendered position of the door.
   * @type {DoorStateSnapshot}
   * @internal
   */
  _animatedPosition;

  /**
   * An amount of pixel padding surrounding the door texture.
   * @type {number}
   */
  texturePadding = 0;

  /* -------------------------------------------- */

  /**
   * The identifier for this door animation.
   * @type {string}
   */
  get animationId() {
    return `Door.${this.object.id}.${this.#style}`;
  }

  /* -------------------------------------------- */
  /*  Initialization and Data Preparation         */
  /* -------------------------------------------- */

  /**
   * Configure and initialize the DoorMesh.
   * This is called automatically upon construction, but may be called manually later to update the DoorMesh.
   * @param {DoorAnimationConfiguration} animation
   */
  initialize(animation) {
    this.#configure(animation);
    if ( !this.#animation.config ) return;
    const {midpoint, initialize, animate} = this.#animation.config;
    this.anchor.set(midpoint ? 0.5 : 0, 0.5);

    // One-time initialization
    if ( initialize instanceof Function ) initialize.call(this, this.#open);

    // Initial animation
    if ( this.#open ) {
      const animation = animate.call(this, true);
      for ( const anim of animation ) foundry.utils.setProperty(anim.parent, anim.attribute, anim.to);
      this.#refresh();
    }
  }

  /* -------------------------------------------- */

  /**
   * Configure the door to be rendered in its current state.
   * @param {DoorAnimationConfiguration} animation
   */
  #configure(animation) {

    // Configure animation properties
    animation.type = (animation?.type in CONFIG.Wall.animationTypes) ? animation.type : "swing"; // Fallback to "swing"
    const defaults = foundry.documents.BaseWall.schema.fields.animation.clean({});
    this.#animation = Object.assign(defaults, animation);
    this.#animation.config = CONFIG.Wall.animationTypes[animation.type];

    // Configure rendering style
    this.#style ??= animation.style ?? DoorMesh.DOOR_STYLES[animation.double ? "DOUBLE_LEFT" : "SINGLE"];
    if ( this.#style === DoorMesh.DOOR_STYLES.DOUBLE_RIGHT ) this.#animation.direction *= -1;

    // Configure rendering data
    this._closedPosition = this.#getClosedPosition(animation);
    this._animatedPosition = foundry.utils.deepClone(this._closedPosition);

    // Assign initial properties of the sprite mesh
    this.name = this.animationId;
    this.hoverFade = false;
    this.#open = this.object.isOpen;
    this.#refresh();
  }

  /* -------------------------------------------- */

  /**
   * Refresh the displayed state of the mesh with it's animated position data.
   */
  #refresh() {
    const a = this._animatedPosition;
    this.elevation = a.elevation;
    this.sort = a.sort;
    this.position.set(a.x, a.y);
    this.rotation = a.rotation;
    this.scale.set(a.scaleX, a.scaleY);
    this.tint = a.tint;
    this.alpha = a.alpha;
  }

  /* -------------------------------------------- */

  /**
   * Extract and prepare data used to render the DoorMesh in its closed position.
   * @param {Partial<DoorAnimationConfiguration>} config
   * @returns {DoorClosedState}
   */
  #getClosedPosition({flip, sort}={}) {
    const ray = this.object.toRay();
    sort ??= -Infinity;
    const styles = DoorMesh.DOOR_STYLES;

    // Pivot point for the animation
    let point = this.#style === styles.DOUBLE_RIGHT ? ray.B : ray.A;
    if ( this.#animation.config.midpoint ) {
      switch ( this.#style ) {
        case styles.SINGLE: {
          const [mx, my] = this.object.midpoint;
          point = {x: mx, y: my};
          break;
        }
        case styles.DOUBLE_LEFT:
          point = ray.project(0.25);
          break;
        case styles.DOUBLE_RIGHT:
          point = ray.project(0.75);
          break;
      }
    }

    // The texture is scaled to fill the full horizontal space
    const width = this.#style === styles.SINGLE ? ray.distance : (ray.distance / 2);
    const textureWidth = this.texture.width - (2 * this.texturePadding);
    const scaleX = width / textureWidth;

    // The texture is scaled vertically according to its native grid size
    const gridSize = canvas.dimensions.size;
    const textureGridSize = this.object.document?.flags.core?.textureGridSize ?? CONFIG.Wall.textureGridSize;
    const scaleY = (gridSize / textureGridSize) * (flip ? -1 : 1) * (this.#style === styles.DOUBLE_RIGHT ? -1 : 1);

    // Wall Elevation
    // TODO Unsupported except using a temporary core flag. Eventually elevation will become part of the Wall data model
    /** @deprecated since v13 until v14 */
    const elevation = this.object.document?.getFlag("core", "elevation") ?? (canvas.scene.foregroundElevation - 1);

    // Texture rotation
    const rotation = this.#style === styles.DOUBLE_RIGHT ? (ray.angle - Math.PI) : ray.angle;
    return {x: point.x, y: point.y, elevation, sort, rotation, scaleX, scaleY, tint: 0xFFFFFF, alpha: 1};
  }

  /* -------------------------------------------- */
  /*  Rendering and Animation                     */
  /* -------------------------------------------- */

  /**
   * Animate the door to its current rendered state.
   * @param {boolean} open      Is the door now open or closed?
   * @returns {Promise<void>}
   */
  async animate(open) {
    open ??= this.object.isOpen;
    if ( (open === this.#open) || !this.#animation.config ) return;

    // Immediately record the new "true state"
    this.#open = open;

    // Animate the change
    const {animate, easing, preAnimate, postAnimate} = this.#animation.config;
    const animation = animate.call(this, open);
    if ( preAnimate instanceof Function ) await preAnimate.call(this, open);
    await CanvasAnimation.animate(animation, {
      name: this.animationId,
      duration: this.#animation.duration,
      easing: easing || CanvasAnimation.easeInOutCosine,
      ontick: this.#refresh.bind(this)
    });
    if ( postAnimate instanceof Function ) await postAnimate.call(this, open);
  }

  /* -------------------------------------------- */

  /**
   * Configure the "swing" animation.
   * @this {DoorMesh}
   * @param {boolean} open
   * @returns {CanvasAnimationAttribute[]}
   */
  static animateSwing(open) {
    let {rotation} = this._closedPosition;
    const {strength, direction} = this.#animation;
    const delta = Math.PI * direction * strength / 2;
    if ( open ) rotation += delta;
    return [{parent: this._animatedPosition, attribute: "rotation", to: rotation}];
  }

  /* -------------------------------------------- */

  /**
   * Configure the "ascend" animation.
   * @this {DoorMesh}
   * @param {boolean} open
   * @returns {CanvasAnimationAttribute[]}
   */
  static animateAscend(open) {
    const {strength} = this.#animation;
    const {scaleX, scaleY} = this._closedPosition;
    const alpha = 0.25 * strength;
    const scale = open ? (0.1 * strength) : 0;
    const parent = this._animatedPosition;
    return [
      {parent, attribute: "alpha", to: open ? 1-alpha : 1.0},
      {parent, attribute: "scaleX", to: (Math.abs(scaleX) + scale) * Math.sign(scaleX)},
      {parent, attribute: "scaleY", to: (Math.abs(scaleY) + scale) * Math.sign(scaleY)},
      {parent, attribute: "tint", to: new Color(open ? 0x222222 : 0xFFFFFF)}
    ];
  }

  /* -------------------------------------------- */

  /**
   * Special initialization needed for descending door types.
   * @this {DoorMesh}
   * @param {boolean} open
   */
  static initializeDescend(open) {
    if ( open ) {
      this.elevation = 0;
      this.sort = Infinity;
    }
  }

  /* -------------------------------------------- */

  /**
   * When closing a descending door, shift its elevation to the foreground before animation.
   * @this {DoorMesh}
   * @param {boolean} open
   * @returns {Promise<void>}
   */
  static async preAnimateDescend(open) {
    if ( !open ) {
      this.elevation = this._closedPosition.elevation;
      this.sort = this._closedPosition.sort;
    }
  }

  /* -------------------------------------------- */

  /**
   * Configure the "descend" animation.
   * @this {DoorMesh}
   * @param {boolean} open
   * @returns {CanvasAnimationAttribute[]}
   */
  static animateDescend(open) {
    const {strength} = this.#animation;
    const {scaleX, scaleY} = this._closedPosition;
    const scale = open ? (0.05 * strength) : 0;
    const parent = this._animatedPosition;
    return [
      {parent, attribute: "scaleX", to: (Math.abs(scaleX) - scale) * Math.sign(scaleX)},
      {parent, attribute: "scaleY", to: (Math.abs(scaleY) - scale) * Math.sign(scaleY)},
      {parent, attribute: "tint", to: new Color(open ? 0x666666 : 0xFFFFFF)}
    ];
  }


  /* -------------------------------------------- */

  /**
   * When opening a descending door, shift its elevation to the background after animation.
   * @this {DoorMesh}
   * @param {boolean} open
   * @returns {Promise<void>}
   */
  static async postAnimateDescend(open) {
    if ( open ) {
      this.elevation = 0;
      this.sort = Infinity;
    }
  }

  /* -------------------------------------------- */

  /**
   * Configure the "slide" animation.
   * @this {DoorMesh}
   * @param {boolean} open
   * @returns {CanvasAnimationAttribute[]}
   */
  static animateSlide(open) {
    const {x, y} = this._closedPosition;
    const {direction, strength} = this.#animation;
    const {a, b} = this.object.edge;
    const m = this.#style === DoorMesh.DOOR_STYLES.SINGLE ? strength : (strength * 0.5);
    const dx = open ? (a.x - b.x) * direction * m : 0; // Retract towards A
    const dy = open ? (a.y - b.y) * direction * m : 0;
    const parent = this._animatedPosition;
    return [
      {parent, attribute: "x", to: x + dx},
      {parent, attribute: "y", to: y + dy}
    ];
  }
}

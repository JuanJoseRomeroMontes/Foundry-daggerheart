import PlaceableObject from "./placeable-object.mjs";
import Edge from "../geometry/edges/edge.mjs";
import Ray from "../geometry/shapes/ray.mjs";
import {getTexture, loadTexture} from "../loader.mjs";
import MouseInteractionManager from "../interaction/mouse-handler.mjs";
import WallsLayer from "../layers/walls.mjs";
import DoorMesh from "../containers/elements/door-mesh.mjs";

/**
 * A Wall is an implementation of PlaceableObject which represents a physical or visual barrier within the Scene.
 * Walls are used to restrict Token movement or visibility as well as to define the areas of effect for ambient lights
 * and sounds.
 * @category Canvas
 * @see {@link foundry.documents.WallDocument}
 * @see {@link foundry.canvas.layers.WallsLayer}
 */
export default class Wall extends PlaceableObject {
  constructor(document) {
    super(document);
    this.#edge = this.#createEdge();
    this.#priorDoorState = this.document.ds;
  }

  /** @inheritdoc */
  static embeddedName = "Wall";

  /** @override */
  static RENDER_FLAGS = {
    redraw: {propagate: ["refresh"]},
    refresh: {propagate: ["refreshState", "refreshLine"], alias: true},
    refreshState: {propagate: ["refreshEndpoints", "refreshHighlight"]},
    refreshLine: {propagate: ["refreshEndpoints", "refreshHighlight", "refreshDirection"]},
    refreshEndpoints: {},
    refreshDirection: {},
    refreshHighlight: {}
  };

  /**
   * A reference the Door Control icon associated with this Wall, if any
   * @type {DoorControl|null}
   */
  doorControl;

  /**
   * A set of optional DoorMesh instances used to render a door animation for this Wall.
   * @type {Set<DoorMesh>}
   */
  get doorMeshes() {
    return this.#doorMeshes;
  }

  #doorMeshes = new Set();

  /**
   * The line segment that represents the Wall.
   * @type {PIXI.Graphics}
   */
  line;

  /**
   * The endpoints of the Wall line segment.
   * @type {PIXI.Graphics}
   */
  endpoints;

  /**
   * The icon that indicates the direction of the Wall.
   * @type {PIXI.Sprite|null}
   */
  directionIcon;

  /**
   * A Graphics object used to highlight this wall segment. Only used when the wall is controlled.
   * @type {PIXI.Graphics}
   */
  highlight;

  /**
   * Cache the prior door state so that we can identify changes in the door state.
   * @type {number}
   */
  #priorDoorState;

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * A convenience reference to the coordinates Array for the Wall endpoints, [x0,y0,x1,y1].
   * @type {number[]}
   */
  get coords() {
    return this.document.c;
  }

  /* -------------------------------------------- */

  /**
   * The Edge instance which represents this Wall.
   * The Edge is re-created when data for the Wall changes.
   * @type {Edge}
   */
  get edge() {
    return this.#edge;
  }

  #edge;

  /* -------------------------------------------- */

  /** @inheritdoc */
  get bounds() {
    const [x0, y0, x1, y1] = this.document.c;
    return new PIXI.Rectangle(x0, y0, x1-x0, y1-y0).normalize();
  }

  /* -------------------------------------------- */

  /**
   * A boolean for whether this wall contains a door
   * @type {boolean}
   */
  get isDoor() {
    return this.document.door > CONST.WALL_DOOR_TYPES.NONE;
  }

  /* -------------------------------------------- */

  /**
   * A boolean for whether the wall contains an open door
   * @returns {boolean}
   */
  get isOpen() {
    return this.isDoor && (this.document.ds === CONST.WALL_DOOR_STATES.OPEN);
  }

  /* -------------------------------------------- */

  /**
   * Return the coordinates [x,y] at the midpoint of the wall segment
   * @returns {Array<number>}
   */
  get midpoint() {
    return [(this.coords[0] + this.coords[2]) / 2, (this.coords[1] + this.coords[3]) / 2];
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  get center() {
    const [x, y] = this.midpoint;
    return new PIXI.Point(x, y);
  }

  /* -------------------------------------------- */

  /**
   * Get the direction of effect for a directional Wall
   * @type {number|null}
   */
  get direction() {
    const d = this.document.dir;
    if ( !d ) return null;
    const c = this.coords;
    const angle = Math.atan2(c[3] - c[1], c[2] - c[0]);
    if ( d === CONST.WALL_DIRECTIONS.LEFT ) return angle + (Math.PI / 2);
    else return angle - (Math.PI / 2);
  }

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /** @override */
  getSnappedPosition(position) {
    throw new Error("Wall#getSnappedPosition is not supported: WallDocument does not have a (x, y) position");
  }

  /* -------------------------------------------- */

  /** @override */
  _pasteObject(offset, options) {
    const c = this.document.c;
    const dx = Math.round(offset.x);
    const dy = Math.round(offset.y);
    const a = {x: c[0] + dx, y: c[1] + dy};
    const b = {x: c[2] + dx, y: c[3] + dy};
    const data = this.document.toObject();
    delete data._id;
    data.c = [a.x, a.y, b.x, b.y];
    return data;
  }

  /* -------------------------------------------- */

  /**
   * Initialize the edge which represents this Wall.
   * @param {object} [options]              Options which modify how the edge is initialized
   * @param {boolean} [options.deleted]     Has the edge been deleted?
   */
  initializeEdge({deleted=false}={}) {

    // The wall has been deleted
    if ( deleted ) {
      if ( this.#edge ) {
        canvas.edges.delete(this.#edge.id);
        this.#edge = null;
      }
      return;
    }

    // Re-create the Edge for the wall
    this.#edge = this.#createEdge();
    canvas.edges.set(this.#edge.id, this.#edge);
  }

  /* -------------------------------------------- */

  /**
   * Create an Edge from the Wall placeable.
   * @returns {Edge}
   */
  #createEdge() {
    let {c, light, sight, sound, move, dir, threshold} = this.document;
    if ( this.isOpen ) light = sight = sound = move = CONST.WALL_SENSE_TYPES.NONE;
    const dpx = this.scene.dimensions.distancePixels;
    return new Edge({x: c[0], y: c[1]}, {x: c[2], y: c[3]}, {
      id: `wall.${this.id}`,
      object: this,
      type: "wall",
      direction: dir,
      light,
      sight,
      sound,
      move,
      threshold: {
        light: threshold.light * dpx,
        sight: threshold.sight * dpx,
        sound: threshold.sound * dpx,
        attenuation: threshold.attenuation
      }
    });
  }

  /* -------------------------------------------- */

  /**
   * This helper converts the wall segment to a Ray
   * @returns {Ray}    The wall in Ray representation
   */
  toRay() {
    return Ray.fromArrays(this.coords.slice(0, 2), this.coords.slice(2));
  }

  /* -------------------------------------------- */

  /** @override */
  async _draw(options) {
    this.line = this.addChild(new PIXI.Graphics());
    this.line.eventMode = "auto";
    this.directionIcon = this.addChild(this.#drawDirection());
    this.directionIcon.eventMode = "none";
    this.endpoints = this.addChild(new PIXI.Graphics());
    this.endpoints.eventMode = "auto";
    this.cursor = "pointer";
    this.createDoorMeshes();
  }

  /* -------------------------------------------- */

  /** @override */
  clear() {
    this.clearDoorControl();
    return super.clear();
  }

  /* -------------------------------------------- */

  /**
   * Draw a directional prompt icon for one-way walls to illustrate their direction of effect.
   * @returns {PIXI.Sprite|null}   The drawn icon
   */
  #drawDirection() {
    if ( this.directionIcon ) return null;

    // Create the icon
    const tex = getTexture(CONFIG.controlIcons.wallDirection);
    const icon = new PIXI.Sprite(tex);

    // Set icon initial state
    icon.width = icon.height = 32 * canvas.dimensions.uiScale;
    icon.anchor.set(0.5, 0.5);
    icon.visible = false;
    return icon;
  }

  /* -------------------------------------------- */

  /**
   * Compute an approximate Polygon which encloses the line segment providing a specific hitArea for the line
   * @param {number} pad          The amount of padding to apply
   * @returns {PIXI.Polygon}      A constructed Polygon for the line
   */
  #getHitPolygon(pad) {
    const c = this.document.c;

    // Identify wall orientation
    const dx = c[2] - c[0];
    const dy = c[3] - c[1];

    // Define the array of polygon points
    let points;
    if ( Math.abs(dx) >= Math.abs(dy) ) {
      const sx = Math.sign(dx);
      points = [
        c[0]-(pad*sx), c[1]-pad,
        c[2]+(pad*sx), c[3]-pad,
        c[2]+(pad*sx), c[3]+pad,
        c[0]-(pad*sx), c[1]+pad
      ];
    } else {
      const sy = Math.sign(dy);
      points = [
        c[0]-pad, c[1]-(pad*sy),
        c[2]-pad, c[3]+(pad*sy),
        c[2]+pad, c[3]+(pad*sy),
        c[0]+pad, c[1]-(pad*sy)
      ];
    }

    // Return a Polygon which pads the line
    return new PIXI.Polygon(points);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  control({chain=false, ...options}={}) {
    const controlled = super.control(options);
    if ( controlled && chain ) {
      const links = this.getLinkedSegments();
      for ( const l of links.walls ) {
        l.control({releaseOthers: false});
        this.layer.controlledObjects.set(l.id, l);
      }
    }
    return controlled;
  }

  /* -------------------------------------------- */

  /** @override */
  _destroy(options) {
    this.clearDoorControl();
  }

  /* -------------------------------------------- */

  /**
   * Test whether the Wall direction lies between two provided angles
   * This test is used for collision and vision checks against one-directional walls
   * @param {number} lower    The lower-bound limiting angle in radians
   * @param {number} upper    The upper-bound limiting angle in radians
   * @returns {boolean}
   */
  isDirectionBetweenAngles(lower, upper) {
    let d = this.direction;
    if ( d < lower ) {
      while ( d < lower ) d += (2 * Math.PI);
    } else if ( d > upper ) {
      while ( d > upper ) d -= (2 * Math.PI);
    }
    return ( d > lower && d < upper );
  }

  /* -------------------------------------------- */

  /**
   * A simple test for whether a Ray can intersect a directional wall
   * @param {Ray} ray     The ray to test
   * @returns {boolean}    Can an intersection occur?
   */
  canRayIntersect(ray) {
    if ( this.direction === null ) return true;
    return this.isDirectionBetweenAngles(ray.angle - (Math.PI/2), ray.angle + (Math.PI/2));
  }

  /* -------------------------------------------- */

  /**
   * Get an Array of Wall objects which are linked by a common coordinate
   * @returns {Object}    An object reporting ids and endpoints of the linked segments
   */
  getLinkedSegments() {
    const test = new Set();
    const done = new Set();
    const ids = new Set();
    const objects = [];

    // Helper function to add wall points to the set
    const _addPoints = w => {
      const p0 = w.coords.slice(0, 2).join(".");
      if ( !done.has(p0) ) test.add(p0);
      const p1 = w.coords.slice(2).join(".");
      if ( !done.has(p1) ) test.add(p1);
    };

    // Helper function to identify other walls which share a point
    const _getWalls = p => {
      return canvas.walls.placeables.filter(w => {
        if ( ids.has(w.id) ) return false;
        const p0 = w.coords.slice(0, 2).join(".");
        const p1 = w.coords.slice(2).join(".");
        return ( p === p0 ) || ( p === p1 );
      });
    };

    // Seed the initial search with this wall's points
    _addPoints(this);

    // Begin recursively searching
    while ( test.size > 0 ) {
      const testIds = [...test];
      for ( const p of testIds ) {
        const walls = _getWalls(p);
        walls.forEach(w => {
          _addPoints(w);
          if ( !ids.has(w.id) ) objects.push(w);
          ids.add(w.id);
        });
        test.delete(p);
        done.add(p);
      }
    }

    // Return the wall IDs and their endpoints
    return {
      ids: [...ids],
      walls: objects,
      endpoints: [...done].map(p => p.split(".").map(Number))
    };
  }

  /* -------------------------------------------- */
  /*  Incremental Refresh                         */
  /* -------------------------------------------- */

  /** @override */
  _applyRenderFlags(flags) {
    if ( flags.refreshState ) this._refreshState();
    if ( flags.refreshLine ) this._refreshLine();
    if ( flags.refreshEndpoints ) this._refreshEndpoints();
    if ( flags.refreshDirection ) this._refreshDirection();
    if ( flags.refreshHighlight ) this._refreshHighlight();
  }

  /* -------------------------------------------- */

  /**
   * Refresh the displayed position of the wall which refreshes when the wall coordinates or type changes.
   * @protected
   */
  _refreshLine() {
    const c = this.document.c;
    const wc = this._getWallColor();
    const lw = Wall.#getLineWidth();

    // Draw line
    this.line.clear()
      .lineStyle(lw * 3, 0x000000, 1.0)  // Background black
      .moveTo(c[0], c[1])
      .lineTo(c[2], c[3]);
    this.line.lineStyle(lw, wc, 1.0)  // Foreground color
      .lineTo(c[0], c[1]);

    // Tint direction icon
    if ( this.directionIcon ) {
      this.directionIcon.position.set((c[0] + c[2]) / 2, (c[1] + c[3]) / 2);
      this.directionIcon.tint = wc;
    }

    // Re-position door control icon
    if ( this.doorControl ) this.doorControl.reposition();

    // Update hit area for interaction
    const priorHitArea = this.line.hitArea;
    this.line.hitArea = this.#getHitPolygon(lw * 3);
    if ( !priorHitArea
      || (this.line.hitArea.x !== priorHitArea.x)
      || (this.line.hitArea.y !== priorHitArea.y)
      || (this.line.hitArea.width !== priorHitArea.width)
      || (this.line.hitArea.height !== priorHitArea.height) ) {
      MouseInteractionManager.emulateMoveEvent();
    }
  }

  /* -------------------------------------------- */

  /**
   * Refresh the display of wall endpoints which refreshes when the wall position or state changes.
   * @protected
   */
  _refreshEndpoints() {
    const c = this.coords;
    const wc = this._getWallColor();
    const lw = Wall.#getLineWidth();
    const cr = (this.hover || this.layer.highlightObjects) ? lw * 4 : lw * 3;
    this.endpoints.clear()
      .lineStyle(lw, 0x000000, 1.0)
      .beginFill(wc, 1.0)
      .drawCircle(c[0], c[1], cr)
      .drawCircle(c[2], c[3], cr)
      .endFill();
  }

  /* -------------------------------------------- */

  /**
   * Draw a directional prompt icon for one-way walls to illustrate their direction of effect.
   * @protected
   */
  _refreshDirection() {
    if ( !this.document.dir ) return this.directionIcon.visible = false;

    // Set icon state and rotation
    const icon = this.directionIcon;
    const iconAngle = -Math.PI / 2;
    const angle = this.direction;
    icon.rotation = iconAngle + angle;
    icon.visible = true;
  }

  /* -------------------------------------------- */

  /**
   * Refresh the appearance of the wall control highlight graphic. Occurs when wall control or position changes.
   * @protected
   */
  _refreshHighlight() {

    // Remove highlight
    if ( !this.controlled ) {
      if ( this.highlight ) {
        this.removeChild(this.highlight).destroy();
        this.highlight = undefined;
      }
      return;
    }

    // Add highlight
    if ( !this.highlight ) {
      this.highlight = this.addChildAt(new PIXI.Graphics(), 0);
      this.highlight.eventMode = "none";
    }
    else this.highlight.clear();

    // Configure highlight
    const c = this.coords;
    const lw = Wall.#getLineWidth();
    const cr = lw * 2;
    const cr2 = cr * 2;
    const cr4 = cr * 4;

    // Draw highlight
    this.highlight.lineStyle({width: cr, color: 0xFF9829})
      .drawRoundedRect(c[0] - cr2, c[1] - cr2, cr4, cr4, cr)
      .drawRoundedRect(c[2] - cr2, c[3] - cr2, cr4, cr4, cr)
      .lineStyle({width: cr2, color: 0xFF9829})
      .moveTo(c[0], c[1]).lineTo(c[2], c[3]);
  }

  /* -------------------------------------------- */

  /**
   * Refresh the displayed state of the Wall.
   * @protected
   */
  _refreshState() {
    this.alpha = this._getTargetAlpha();
    this.zIndex = this.controlled ? 2 : this.hover ? 1 : 0;
  }

  /* -------------------------------------------- */

  /**
   * Given the properties of the wall - decide upon a color to render the wall for display on the WallsLayer
   * @returns {number}
   * @protected
   */
  _getWallColor() {
    const senses = CONST.WALL_SENSE_TYPES;

    // Invisible Walls
    if ( this.document.sight === senses.NONE ) return 0x77E7E8;

    // Terrain Walls
    else if ( this.document.sight === senses.LIMITED ) return 0x81B90C;

    // Windows (Sight Proximity)
    else if ( [senses.PROXIMITY, senses.DISTANCE].includes(this.document.sight) ) return 0xc7d8ff;

    // Ethereal Walls
    else if ( this.document.move === senses.NONE ) return 0xCA81FF;

    // Doors
    else if ( this.document.door === CONST.WALL_DOOR_TYPES.DOOR ) {
      const ds = this.document.ds || CONST.WALL_DOOR_STATES.CLOSED;
      if ( ds === CONST.WALL_DOOR_STATES.CLOSED ) return 0x6666EE;
      else if ( ds === CONST.WALL_DOOR_STATES.OPEN ) return 0x66CC66;
      else if ( ds === CONST.WALL_DOOR_STATES.LOCKED ) return 0xEE4444;
    }

    // Secret Doors
    else if ( this.document.door === CONST.WALL_DOOR_TYPES.SECRET ) {
      const ds = this.document.ds || CONST.WALL_DOOR_STATES.CLOSED;
      if ( ds === CONST.WALL_DOOR_STATES.CLOSED ) return 0xA612D4;
      else if ( ds === CONST.WALL_DOOR_STATES.OPEN ) return 0x7C1A9b;
      else if ( ds === CONST.WALL_DOOR_STATES.LOCKED ) return 0xEE4444;
    }

    // Standard Walls
    return 0xFFFFBB;
  }

  /* -------------------------------------------- */

  /**
   * Adapt the width that the wall should be rendered based on the grid size.
   * @returns {number}
   */
  static #getLineWidth() {
    return 2 * canvas.dimensions.uiScale;
  }

  /* -------------------------------------------- */
  /*  Socket Listeners and Handlers               */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _onCreate(data, options, userId) {
    super._onCreate(data, options, userId);
    this.layer._cloneType = this.document.toJSON();
    this.initializeEdge();
    this.#onModifyWall(this.document.door !== CONST.WALL_DOOR_TYPES.NONE);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);

    // Update the clone tool wall data
    this.layer._cloneType = this.document.toJSON();

    // Handle wall changes which require perception changes.
    const edgeChange = ("c" in changed) || CONST.WALL_RESTRICTION_TYPES.some(k => k in changed)
      || ("dir" in changed) || ("threshold" in changed);
    const doorChange = ["door", "ds"].some(k => k in changed);
    if ( edgeChange || doorChange ) {
      this.initializeEdge();
      this.#onModifyWall(doorChange);
    }

    // DoorMesh animation
    const replaceDoorMesh = (!!this.#doorMeshes.size !== this.hasDoorMesh)
      || (changed.animation?.double !== undefined)
      || (changed.animation?.texture !== undefined);
    if ( replaceDoorMesh ) this.createDoorMeshes();
    else if ( this.#doorMeshes.size ) {
      for ( const doorMesh of this.#doorMeshes ) {
        if ( edgeChange || ("animation" in changed) ) doorMesh.initialize(this.document.animation);
        if ( "ds" in changed ) doorMesh.animate(this.isOpen);
      }
    }

    // Trigger door interaction sounds
    if ( "ds" in changed ) {
      const states = CONST.WALL_DOOR_STATES;
      let interaction;
      if ( changed.ds === states.LOCKED ) interaction = "lock";
      else if ( changed.ds === states.OPEN ) interaction = "open";
      else if ( changed.ds === states.CLOSED ) {
        if ( this.#priorDoorState === states.OPEN ) interaction = "close";
        else if ( this.#priorDoorState === states.LOCKED ) interaction = "unlock";
      }
      if ( options.sound !== false ) this._playDoorSound(interaction);
      this.#priorDoorState = changed.ds;
    }

    // Incremental Refresh
    this.renderFlags.set({
      refreshLine: edgeChange || doorChange,
      refreshDirection: "dir" in changed
    });
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onDelete(options, userId) {
    super._onDelete(options, userId);
    this.clearDoorControl();
    this.destroyDoorMeshes();
    this.initializeEdge({deleted: true});
    this.#onModifyWall(false);
  }

  /* -------------------------------------------- */

  /**
   * Callback actions when a wall that contains a door is moved or its state is changed
   * @param {boolean} doorChange   Update vision and sound restrictions
   */
  #onModifyWall(doorChange=false) {
    canvas.perception.update({
      refreshEdges: true,         // Recompute edge intersections
      initializeLighting: true,   // Recompute light sources
      initializeVision: true,     // Recompute vision sources
      initializeSounds: true      // Recompute sound sources
    });

    // Re-draw door icons
    if ( doorChange ) {
      const dt = this.document.door;
      const hasCtrl = (dt === CONST.WALL_DOOR_TYPES.DOOR) || ((dt === CONST.WALL_DOOR_TYPES.SECRET) && game.user.isGM);
      if ( hasCtrl ) {
        if ( this.doorControl ) this.doorControl.draw(); // Asynchronous
        else this.createDoorControl();
      }
      else this.clearDoorControl();
    }
    else if ( this.doorControl ) this.doorControl.reposition();
  }

  /* -------------------------------------------- */
  /*  Animation                                   */
  /* -------------------------------------------- */

  /**
   * Should this Wall have a corresponding DoorMesh?
   * @type {boolean}
   */
  get hasDoorMesh() {
    const animation = this.document.animation;
    if ( !this.isDoor || !animation ) return false;
    return !!(animation.type && animation.texture);
  }

  /* -------------------------------------------- */

  /**
   * Create and add a DoorMesh to the PrimaryCanvasContainer.
   * @returns {Promise<void>}
   */
  async createDoorMeshes() {
    this.destroyDoorMeshes();
    if ( this.isPreview || !this.hasDoorMesh ) return;
    const {texture: textureSrc, ...animation} = this.document.animation;
    try {
      const texture = await loadTexture(textureSrc);
      const styles = [animation.double ? DoorMesh.DOOR_STYLES.DOUBLE_LEFT : DoorMesh.DOOR_STYLES.SINGLE];
      if ( animation.double ) styles.push(DoorMesh.DOOR_STYLES.DOUBLE_RIGHT);
      for ( const style of styles ) {
        const mesh = new DoorMesh({object: this, texture, style, ...animation});
        this.#doorMeshes.add(mesh);
        canvas.primary.addChild(mesh);
      }
    } catch(err) {
      console.error(err);
      this.#doorMeshes.clear();
    }
  }

  /* -------------------------------------------- */

  /**
   * Remove and destroy a DoorMesh from the PrimaryCanvasContainer.
   */
  destroyDoorMeshes() {
    if ( !this.#doorMeshes.size ) return;
    for ( const mesh of this.#doorMeshes ) {
      canvas.primary.removeChild(mesh);
      if ( mesh.destroyed === false ) mesh.destroy();
    }
    this.#doorMeshes.clear();
  }

  /* -------------------------------------------- */

  /**
   * Play a door interaction sound.
   * This plays locally, each client independently applies this workflow.
   * @param {string} interaction      The door interaction: "open", "close", "lock", "unlock", or "test".
   * @protected
   */
  _playDoorSound(interaction) {
    if ( !CONST.WALL_DOOR_INTERACTIONS.includes(interaction) ) {
      throw new Error(`"${interaction}" is not a valid door interaction type`);
    }
    if ( !this.isDoor ) return;

    // Identify which door sound effect to play
    const doorSound = CONFIG.Wall.doorSounds[this.document.doorSound];
    let sounds = doorSound?.[interaction];
    if ( sounds && !Array.isArray(sounds) ) sounds = [sounds];
    else if ( !sounds?.length ) {
      if ( interaction !== "test" ) return;
      sounds = [CONFIG.sounds.lock];
    }
    const src = sounds[Math.floor(Math.random() * sounds.length)];

    // Play the door sound as a localized sound effect
    canvas.sounds.playAtPosition(src, this.center, this.soundRadius, {
      volume: 1.0,
      easing: true,
      walls: false,
      gmAlways: true,
      muffledEffect: {type: "lowpass", intensity: 5}
    });
  }

  /* -------------------------------------------- */

  /**
   * Customize the audible radius of sounds emitted by this wall, for example when a door opens or closes.
   * @type {number}
   */
  get soundRadius() {
    return canvas.dimensions.distance * 12; // 60 feet on a 5ft grid
  }

  /* -------------------------------------------- */
  /*  Interactivity                               */
  /* -------------------------------------------- */

  /**
   * Draw a control icon that is used to manipulate the door's open/closed state
   * @returns {DoorControl}
   */
  createDoorControl() {
    if ((this.document.door === CONST.WALL_DOOR_TYPES.SECRET) && !game.user.isGM) return null;
    this.doorControl = canvas.controls.doors.addChild(new CONFIG.Canvas.doorControlClass(this));
    this.doorControl.draw();
    return this.doorControl;
  }

  /* -------------------------------------------- */

  /**
   * Clear the door control if it exists.
   */
  clearDoorControl() {
    if ( this.doorControl ) {
      this.doorControl.destroy({children: true});
      this.doorControl = null;
    }
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _canControl(user, event) {
    if ( !this.layer.active || this.isPreview ) return false;
    // If the User is chaining walls, we don't want to control the last one
    const isChain = this.hover && game.keyboard.isModifierActive("CONTROL");
    return !isChain;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onHoverIn(event, options) {
    // Contrary to hover out, hover in is prevented in chain mode to avoid distracting the user
    if ( this.layer._chain ) return false;
    const dest = event.getLocalPosition(this.layer);
    this.layer._last = {
      point: WallsLayer.getClosestEndpoint(dest, this)
    };
    return super._onHoverIn(event, options);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onHoverOut(event) {
    const mgr = canvas.mouseInteractionManager;
    if ( this.hover && !this.layer._chain && (mgr.state < mgr.states.CLICKED) ) this.layer._last = {point: null};
    return super._onHoverOut(event);
  }

  /* -------------------------------------------- */

  /** @override */
  _overlapsSelection(rectangle) {
    const [ax, ay, bx, by] = this.document.c;
    const {x: px, y: py} = this.position;
    let {left, right, top, bottom} = rectangle;
    left -= px;
    right -= px;
    top -= py;
    bottom -= py;
    let tmin = -Infinity;
    let tmax = Infinity;
    const dx = bx - ax;
    if ( dx !== 0 ) {
      const tx1 = (left - ax) / dx;
      const tx2 = (right - ax) / dx;
      tmin = Math.max(tmin, Math.min(tx1, tx2));
      tmax = Math.min(tmax, Math.max(tx1, tx2));
    }
    else if ( (ax < left) || (ax > right) ) return false;
    const dy = by - ay;
    if ( dy !== 0 ) {
      const ty1 = (top - ay) / dy;
      const ty2 = (bottom - ay) / dy;
      tmin = Math.max(tmin, Math.min(ty1, ty2));
      tmax = Math.min(tmax, Math.max(ty1, ty2));
    }
    else if ( (ay < top) || (ay > bottom) ) return false;
    if ( (tmin > 1) || (tmax < 0) || (tmax < tmin) ) return false;
    return true;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onClickLeft(event) {
    if ( this.layer._chain ) return false;
    event.stopPropagation();
    const alt = game.keyboard.isModifierActive("ALT");
    const shift = game.keyboard.isModifierActive("SHIFT");
    if ( this.controlled && !alt ) {
      if ( shift ) return this.release();
      else if ( this.layer.controlled.length > 1 ) return this.layer._onDragLeftStart(event);
    }
    return this.control({releaseOthers: !shift, chain: alt});
  }

  /* -------------------------------------------- */

  /** @override */
  _onClickLeft2(event) {
    event.stopPropagation();
    this.sheet.render({force: true, walls: this.layer.controlled.map(w => w.document)});
  }

  /* -------------------------------------------- */

  /** @override */
  _onClickRight2(event) {
    event.stopPropagation();
    this.sheet.render({force: true, walls: this.layer.controlled.map(w => w.document)});
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onDragLeftStart(event) {
    const origin = event.interactionData.origin;
    const dLeft = Math.hypot(origin.x - this.coords[0], origin.y - this.coords[1]);
    const dRight = Math.hypot(origin.x - this.coords[2], origin.y - this.coords[3]);
    event.interactionData.fixed = dLeft < dRight ? 1 : 0; // Affix the opposite point
    return super._onDragLeftStart(event);
  }

  /* -------------------------------------------- */

  /** @override */
  _onDragLeftMove(event) {
    // Pan the canvas if the drag event approaches the edge
    canvas._onDragCanvasPan(event);

    // Group movement
    const {destination, fixed, origin} = event.interactionData;
    const clones = event.interactionData.clones || [];
    const snap = !event.shiftKey;

    if ( clones.length > 1 ) {
      // Drag a group of walls - snap to the end point maintaining relative positioning
      const p0 = fixed ? this.coords.slice(0, 2) : this.coords.slice(2, 4);
      // Get the snapped final point
      const pt = this.layer._getWallEndpointCoordinates({
        x: destination.x + (p0[0] - origin.x),
        y: destination.y + (p0[1] - origin.y)
      }, {snap});
      const dx = pt[0] - p0[0];
      const dy = pt[1] - p0[1];
      for ( const c of clones ) {
        c.document.c = c._original.document.c.map((p, i) => i % 2 ? p + dy : p + dx);
      }
    }

    // Single-wall pivot
    else if ( clones.length === 1 ) {
      const w = clones[0];
      const pt = this.layer._getWallEndpointCoordinates(destination, {snap});
      w.document.c = fixed ? pt.concat(this.coords.slice(2, 4)) : this.coords.slice(0, 2).concat(pt);
    }

    // Refresh display
    clones.forEach(c => c.renderFlags.set({refreshLine: true}));
  }

  /* -------------------------------------------- */

  /** @override */
  _prepareDragLeftDropUpdates(event) {
    const {clones, destination, fixed, origin} = event.interactionData;
    const snap = !event.shiftKey;
    const updates = [];

    // Pivot a single wall
    if ( clones.length === 1 ) {
      // Get the snapped final point
      const pt = this.layer._getWallEndpointCoordinates(destination, {snap});
      const p0 = fixed ? this.coords.slice(2, 4) : this.coords.slice(0, 2);
      const coords = fixed ? pt.concat(p0) : p0.concat(pt);

      // If we collapsed the wall, delete it
      if ( (coords[0] === coords[2]) && (coords[1] === coords[3]) ) {
        this.document.delete().finally(() => this.layer.clearPreviewContainer());
        return null; // No further updates
      }

      // Otherwise shift the last point
      this.layer._last.point = pt;
      updates.push({_id: clones[0]._original.id, c: coords});
      return updates;
    }

    // Drag a group of walls - snap to the end point maintaining relative positioning
    const p0 = fixed ? this.coords.slice(0, 2) : this.coords.slice(2, 4);
    const pt = this.layer._getWallEndpointCoordinates({
      x: destination.x + (p0[0] - origin.x),
      y: destination.y + (p0[1] - origin.y)
    }, {snap});
    const dx = pt[0] - p0[0];
    const dy = pt[1] - p0[1];
    for ( const clone of clones ) {
      const c = clone._original.document.c;
      updates.push({_id: clone._original.id, c: [c[0]+dx, c[1]+dy, c[2]+dx, c[3]+dy]});
    }
    return updates;
  }

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  get roof() {
    foundry.utils.logCompatibilityWarning("Wall#roof has been deprecated. There's no replacement", {since: 12, until: 14});
    return null;
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  get hasActiveRoof() {
    foundry.utils.logCompatibilityWarning("Wall#hasActiveRoof has been deprecated. There's no replacement", {since: 12, until: 14});
    return false;
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  identifyInteriorState() {
    foundry.utils.logCompatibilityWarning("Wall#identifyInteriorState has been deprecated. "
      + "It has no effect anymore and there's no replacement.", {since: 12, until: 14});
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  orientPoint(point) {
    foundry.utils.logCompatibilityWarning("Wall#orientPoint has been moved to foundry.canvas.geometry.edges.Edge#orientPoint",
      {since: 12, until: 14});
    return this.edge.orientPoint(point);
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  applyThreshold(sourceType, sourceOrigin, externalRadius=0) {
    foundry.utils.logCompatibilityWarning("Wall#applyThreshold has been moved to"
      + " foundry.canvas.geometry.edges.Edge#applyThreshold", {since: 12, until: 14});
    return this.edge.applyThreshold(sourceType, sourceOrigin, externalRadius);
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  get vertices() {
    foundry.utils.logCompatibilityWarning("Wall#vertices is replaced by Wall#edge", {since: 12, until: 14});
    return this.#edge;
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  get A() {
    foundry.utils.logCompatibilityWarning("Wall#A is replaced by Wall#edge#a", {since: 12, until: 14});
    return this.#edge.a;
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  get B() {
    foundry.utils.logCompatibilityWarning("Wall#A is replaced by Wall#edge#b", {since: 12, until: 14});
    return this.#edge.b;
  }
}

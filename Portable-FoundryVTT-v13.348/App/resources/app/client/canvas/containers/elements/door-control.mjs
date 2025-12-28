import {getTexture} from "../../loader.mjs";

/**
 * An icon representing a Door Control
 * @extends {PIXI.Container}
 */
export default class DoorControl extends PIXI.Container {
  constructor(wall) {
    super();
    this.wall = wall;
    this.visible = false;  // Door controls are not visible by default
  }

  /* -------------------------------------------- */

  /**
   * The center of the wall which contains the door.
   * @type {PIXI.Point}
   */
  get center() {
    return this.wall.center;
  }

  /* -------------------------------------------- */

  /**
   * Draw the DoorControl icon, displaying its icon texture and border
   * @returns {Promise<DoorControl>}
   */
  async draw() {
    const s = canvas.dimensions.uiScale;

    // Background
    this.bg = this.bg || this.addChild(new PIXI.Graphics());
    this.bg.clear().beginFill(0x000000, 1.0).drawRoundedRect(-2 * s, -2 * s, 44 * s, 44 * s, 5 * s).endFill();
    this.bg.alpha = 0;

    // Control Icon
    this.icon = this.icon || this.addChild(new PIXI.Sprite());
    this.icon.width = this.icon.height = 40 * s;
    this.icon.alpha = 0.6;
    this.icon.texture = this._getTexture();

    // Border
    this.border = this.border || this.addChild(new PIXI.Graphics());
    this.border.clear().lineStyle(s, 0xFF5500, 0.8).drawRoundedRect(-2 * s, -2 * s, 44 * s, 44 * s, 5 * s);
    this.border.visible = false;

    // Add control interactivity
    this.eventMode = "static";
    this.interactiveChildren = false;
    this.hitArea = new PIXI.Rectangle(-2 * s, -2 * s, 44 * s, 44 * s);
    this.cursor = "pointer";

    // Set position
    this.reposition();
    this.alpha = 1.0;

    // Activate listeners
    this.removeAllListeners();
    this.on("pointerover", this._onMouseOver).on("pointerout", this._onMouseOut)
      .on("pointerdown", this._onMouseDown).on("rightdown", this._onRightDown);
    return this;
  }


  /* -------------------------------------------- */

  /**
   * Get the icon texture to use for the Door Control icon based on the door state
   * @returns {PIXI.Texture}
   * @protected
   */
  _getTexture() {

    // Determine displayed door state
    const ds = CONST.WALL_DOOR_STATES;
    let s = this.wall.document.ds;
    if ( !game.user.isGM && (s === ds.LOCKED) ) s = ds.CLOSED;

    // Determine texture path
    const icons = CONFIG.controlIcons;
    let path = {
      [ds.LOCKED]: icons.doorLocked,
      [ds.CLOSED]: icons.doorClosed,
      [ds.OPEN]: icons.doorOpen
    }[s] || icons.doorClosed;
    if ( (s === ds.CLOSED) && (this.wall.document.door === CONST.WALL_DOOR_TYPES.SECRET) ) path = icons.doorSecret;

    // Obtain the icon texture
    return getTexture(path);
  }

  /* -------------------------------------------- */

  reposition() {
    const s = canvas.dimensions.uiScale;
    const pos = this.wall.midpoint.map(p => p - (20 * s));
    this.position.set(...pos);
  }

  /* -------------------------------------------- */

  /**
   * Determine whether the DoorControl is visible to the calling user's perspective.
   * The control is always visible if the user is a GM and no Tokens are controlled.
   * @see {CanvasVisibility#testVisibility}
   * @type {boolean}
   */
  get isVisible() {
    if ( !canvas.visibility.tokenVision ) return true;

    // Hide secret doors from players
    const w = this.wall;
    if ( (w.document.door === CONST.WALL_DOOR_TYPES.SECRET) && !game.user.isGM ) return false;

    // Test two points which are perpendicular to the door midpoint
    const ray = this.wall.toRay();
    const [x, y] = w.midpoint;
    const [dx, dy] = [-ray.dy, ray.dx];
    const t = 3 / (Math.abs(dx) + Math.abs(dy)); // Approximate with Manhattan distance for speed
    const points = [
      {x: x + (t * dx), y: y + (t * dy)},
      {x: x - (t * dx), y: y - (t * dy)}
    ];

    // Test each point for visibility
    return points.some(p => {
      return canvas.visibility.testVisibility(p, {object: this, tolerance: 0});
    });
  }

  /* -------------------------------------------- */
  /*  Event Handlers                              */
  /* -------------------------------------------- */

  /**
   * Handle mouse over events on a door control icon.
   * @param {PIXI.FederatedEvent} event      The originating interaction event
   * @protected
   */
  _onMouseOver(event) {
    if ( event.nativeEvent && (event.nativeEvent.target.id !== canvas.app.view.id) ) return;
    event.stopPropagation();
    const canControl = game.user.can("WALL_DOORS");
    const blockPaused = game.paused && !game.user.isGM;
    if ( !canControl || blockPaused ) return false;
    this.border.visible = true;
    this.icon.alpha = 1.0;
    this.bg.alpha = 0.25;
    canvas.walls.hover = this.wall;
  }

  /* -------------------------------------------- */

  /**
   * Handle mouse out events on a door control icon.
   * @param {PIXI.FederatedEvent} event      The originating interaction event
   * @protected
   */
  _onMouseOut(event) {
    if ( event.nativeEvent && (event.nativeEvent.target.id !== canvas.app.view.id) ) return;
    event.stopPropagation();
    if ( game.paused && !game.user.isGM ) return false;
    this.border.visible = false;
    this.icon.alpha = 0.6;
    this.bg.alpha = 0;
    canvas.walls.hover = null;
  }

  /* -------------------------------------------- */

  /**
   * Handle left mouse down events on a door control icon.
   * This should only toggle between the OPEN and CLOSED states.
   * @param {PIXI.FederatedEvent} event      The originating interaction event
   * @protected
   */
  _onMouseDown(event) {
    if ( event.button !== 0 ) return; // Only support standard left-click
    event.stopPropagation();
    const { ds } = this.wall.document;
    const states = CONST.WALL_DOOR_STATES;

    // Determine whether the player can control the door at this time
    if ( !game.user.can("WALL_DOORS") ) return false;
    if ( game.paused && !game.user.isGM ) {
      ui.notifications.warn("GAME.PausedWarning", {localize: true});
      return false;
    }

    const sound = !(game.user.isGM && game.keyboard.isModifierActive("ALT"));

    // Play an audio cue for testing locked doors, only for the current client
    if ( ds === states.LOCKED ) {
      if ( sound ) this.wall._playDoorSound("test");
      return false;
    }

    // Toggle between OPEN and CLOSED states
    return this.wall.document.update({ds: ds === states.CLOSED ? states.OPEN : states.CLOSED}, {sound});
  }

  /* -------------------------------------------- */

  /**
   * Handle right mouse down events on a door control icon.
   * This should toggle whether the door is LOCKED or CLOSED.
   * @param {PIXI.FederatedEvent} event      The originating interaction event
   * @protected
   */
  _onRightDown(event) {
    event.stopPropagation();
    if ( !game.user.isGM ) return;
    let state = this.wall.document.ds;
    const states = CONST.WALL_DOOR_STATES;
    if ( state === states.OPEN ) return;
    state = state === states.LOCKED ? states.CLOSED : states.LOCKED;
    const sound = !(game.user.isGM && game.keyboard.isModifierActive("ALT"));
    return this.wall.document.update({ds: state}, {sound});
  }
}

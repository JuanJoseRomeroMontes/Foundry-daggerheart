import InteractionLayer from "./base/interaction-layer.mjs";
import CanvasAnimation from "../animation/canvas-animation.mjs";
import Cursor from "../containers/elements/cursor.mjs";
import Ray from "../geometry/shapes/ray.mjs";
import Canvas from "../board.mjs";
import {UnboundContainer} from "../containers/_module.mjs";

/**
 * @import {PingData, PingOptions} from "../interaction/_types.mjs";
 * @import BaseRuler from "../interaction/ruler/base-ruler.mjs";
 * @import {ElevatedPoint, Point, Rectangle} from "@common/_types.mjs";
 * @import User from "../../documents/user.mjs";
 * @import {LineIntersection} from "@common/utils/_types.mjs";
 */

/**
 * A CanvasLayer for displaying UI controls which are overlayed on top of other layers.
 *
 * We track three types of events:
 * 1) Cursor movement
 * 2) Ruler measurement
 * 3) Map pings
 */
export default class ControlsLayer extends InteractionLayer {
  constructor() {
    super();

    // Always interactive even if disabled for doors controls
    this.interactiveChildren = true;

    /**
     * A container of DoorControl instances
     * @type {PIXI.Container}
     */
    this.doors = this.addChild(new PIXI.Container());

    /**
     * A container of pings interaction elements.
     * Contains pings elements.
     * @type {PIXI.Container}
     */
    this.pings = this.addChild(new PIXI.Container());
    this.pings.eventMode = "none";
    this.pings.mask = canvas.masks.canvas;

    /**
     * A container of cursor interaction elements not bound to stage transforms.
     * Contains cursors elements.
     * @type {UnboundContainer}
     */
    this.cursors = this.addChild(new UnboundContainer());
    this.cursors.eventMode = "none";

    /**
     * The ruler paths.
     * @type {PIXI.Container}
     * @internal
     */
    this._rulerPaths = this.addChild(new PIXI.Container());
    this._rulerPaths.eventMode = "none";

    /**
     * A graphics instance used for drawing debugging visualization
     * @type {PIXI.Graphics}
     */
    this.debug = this.addChild(new PIXI.Graphics());
    this.debug.eventMode = "none";

    // Register mouse move handler
    canvas.registerMouseMoveHandler(this._onMouseMove, Canvas.MOUSE_MOVE_HANDLER_PRIORITIES.HIGH, this, true);
  }

  /**
   * The Canvas selection rectangle
   * @type {PIXI.Graphics}
   */
  select;

  /**
   * A mapping of user IDs to Cursor instances for quick access
   * @type {Record<string, Cursor>}
   */
  #cursors = {};

  /**
   * A mapping of user IDs to Ruler instances for quick access
   * @type {Record<string, BaseRuler>}
   */
  #rulers = {};

  /**
   * The positions of any offscreen pings we are tracking.
   * @type {Record<string, Point>}
   */
  #offscreenPings = {};

  /* -------------------------------------------- */

  /** @override */
  static get layerOptions() {
    return foundry.utils.mergeObject(super.layerOptions, {
      name: "controls",
      zIndex: 1000
    });
  }

  /* -------------------------------------------- */
  /*  Properties and Public Methods               */
  /* -------------------------------------------- */

  /**
   * A convenience accessor to the Ruler for the active game user
   * @type {BaseRuler}
   */
  get ruler() {
    return this.getRulerForUser(game.user.id);
  }

  /* -------------------------------------------- */

  /**
   * Get the Ruler instance for a specific User ID.
   * @param {string} userId    The User ID
   * @returns {BaseRuler|null}
   */
  getRulerForUser(userId) {
    return this.#rulers[userId] ?? null;
  }

  /* -------------------------------------------- */

  /**
   * Get the Cursor instance for a specific User ID.
   * @param {string} userId    The User ID
   * @returns {Cursor|null}
   */
  getCursorForUser(userId) {
    return this.#cursors[userId] ?? null;
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async _draw(options) {
    await super._draw(options);

    // Create additional elements
    this.drawCursors();
    await this.drawRulers();
    this.drawDoors();
    this.select = this.addChild(new PIXI.Graphics());

    // Adjust scale
    const d = canvas.dimensions;
    this.hitArea = d.rect;
  }

  /* -------------------------------------------- */

  /** @override */
  async _tearDown(options) {
    this.select.destroy();
    this.doors.removeChildren();
    this.pings.removeChildren().forEach(c => c.destroy({children: true}));
    this.cursors.removeChildren().forEach(c => c.destroy({children: true}));
    this.#cursors = {};
    Object.values(this.#rulers).forEach(ruler => ruler.destroy());
    this.#rulers = {};
    this.debug.clear();
    this.debug.debugText?.removeChildren().forEach(c => c.destroy({children: true}));
  }

  /* -------------------------------------------- */

  /**
   * Draw the cursors container
   */
  drawCursors() {
    for ( const user of game.users ) {
      if ( user.active && !user.isSelf ) this.drawCursor(user);
    }
  }

  /* -------------------------------------------- */

  /**
   * Create and add Ruler instances for every game User.
   */
  async drawRulers() {
    const promises = [];
    for ( const user of game.users ) {
      if ( user.active ) promises.push(this.drawRuler(user));
    }
    await Promise.all(promises);
  }

  /* -------------------------------------------- */

  /**
   * Draw door control icons to the doors container.
   */
  drawDoors() {
    for ( const wall of canvas.walls.placeables ) {
      if ( wall.isDoor ) wall.createDoorControl();
    }
  }

  /* -------------------------------------------- */

  /**
   * Draw the select rectangle given an event originated within the base canvas layer
   * @param {Rectangle} coords    The rectangle
   */
  drawSelect({x, y, width, height}) {
    const s = this.select.clear();
    s.lineStyle(3 * canvas.dimensions.uiScale, 0xFF9829, 0.9).drawRect(x, y, width, height);
  }

  /* -------------------------------------------- */

  /** @override */
  _deactivate() {
    this.interactiveChildren = true;
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers
  /* -------------------------------------------- */

  /**
   * Handle mousemove events on the game canvas to broadcast activity. With SHOW_CURSOR permission enabled,
   * the user's cursor position is transmitted.
   * @param {PIXI.Point} currentPos
   * @internal
   */
  _onMouseMove(currentPos) {
    game.user.broadcastActivity(game.user.hasPermission("SHOW_CURSOR") ? {cursor: currentPos} : {});
  }

  /* -------------------------------------------- */

  /**
   * Handle pinging the canvas.
   * @param {PIXI.FederatedEvent}   event   The triggering canvas interaction event.
   * @param {PIXI.Point}            origin  The local canvas coordinates of the mousepress.
   * @protected
   */
  _onLongPress(event, origin) {
    const isCtrl = game.keyboard.isModifierActive("CONTROL");
    const isTokenLayer = canvas.activeLayer instanceof foundry.canvas.layers.TokenLayer;
    if ( !game.user.hasPermission("PING_CANVAS") || isCtrl || !isTokenLayer ) return;
    event.interactionData.cancelled = true;
    canvas.currentMouseManager.cancel(event);    // Cancel drag workflow
    return canvas.ping(origin);
  }

  /* -------------------------------------------- */

  /**
   * Handle the canvas panning to a new view.
   * @protected
   */
  _onCanvasPan() {
    for ( const cursor of Object.values(this.#cursors) ) cursor._updatePosition = true;
    for ( const [name, position] of Object.entries(this.#offscreenPings) ) {
      const { ray, intersection } = this.#findViewportIntersection(position);
      if ( intersection ) {
        const { x, y } = canvas.canvasCoordinatesFromClient(intersection);
        const ping = CanvasAnimation.getAnimation(name).context;
        ping.x = x;
        ping.y = y;
        ping.rotation = Math.normalizeRadians(ray.angle + (Math.PI * 1.5));
      } else CanvasAnimation.terminateAnimation(name);
    }
  }

  /* -------------------------------------------- */
  /*  Methods
  /* -------------------------------------------- */

  /**
   * Create and draw the Cursor object for a given User.
   * @param {User} user   The User document for whom to draw the cursor Container
   * @returns {Cursor}
   */
  drawCursor(user) {
    if ( user.id in this.#cursors ) this.#cursors[user.id].destroy({children: true});
    return this.#cursors[user.id] = this.cursors.addChild(new Cursor(user));
  }

  /* -------------------------------------------- */

  /**
   * Create and draw the Ruler object for a given User.
   * @param {User} user               The User document for whom to draw the Ruler
   * @returns {Promise<BaseRuler>}    The Ruler instance
   */
  async drawRuler(user) {
    if ( user.id in this.#rulers ) this.#rulers[user.id].destroy();
    const ruler = this.#rulers[user.id] = new CONFIG.Canvas.rulerClass(user);
    await ruler.draw();
    return ruler;
  }

  /* -------------------------------------------- */

  /**
   * Update the cursor when the user moves to a new position
   * @param {User} user           The User for whom to update the cursor
   * @param {Point} position      The new cursor position
   */
  updateCursor(user, position) {
    if ( !this.cursors ) return;
    const cursor = this.#cursors[user.id] ?? this.drawCursor(user);

    // Ignore cursors on other Scenes
    if ( ( position === null ) || (user.viewedScene !== canvas.scene.id) ) {
      if ( cursor ) cursor.visible = false;
      return;
    }

    // Show the cursor in its currently tracked position
    cursor.refreshVisibility(user);
    cursor.target = {x: position.x || 0, y: position.y || 0};
  }

  /* -------------------------------------------- */

  /**
   * Update the Ruler for a User given the provided path.
   * @param {User} user                                             The User for whom to update the Ruler
   * @param {{path: ElevatedPoint[], hidden: boolean}|null} data    The path and hidden state of the Ruler
   */
  async updateRuler(user, data) {
    if ( user.isSelf ) return;
    const ruler = this.getRulerForUser(user.id) ?? await this.drawRuler(user);
    ruler.path = data?.path ?? [];
    ruler.hidden = data?.hidden ?? false;
  }

  /* -------------------------------------------- */

  /**
   * Handle a broadcast ping.
   * @see {@link ControlsLayer#drawPing}
   * @param {User} user                 The user who pinged.
   * @param {Point} position            The position on the canvas that was pinged.
   * @param {PingData} [data]           The broadcast ping data.
   * @returns {Promise<boolean>}        A promise which resolves once the Ping has been drawn and animated
   */
  async handlePing(user, position, {scene, style="pulse", pull=false, zoom=1, ...pingOptions}={}) {
    if ( !canvas.ready || (canvas.scene?.id !== scene) || !position ) return;
    if ( pull && (user.isGM || user.isSelf) ) {
      await canvas.animatePan({
        x: position.x,
        y: position.y,
        scale: zoom,
        duration: CONFIG.Canvas.pings.pullSpeed
      });
    } else if ( canvas.isOffscreen(position) ) this.drawOffscreenPing(position, { style: "arrow", user });
    if ( game.settings.get("core", "photosensitiveMode") ) style = CONFIG.Canvas.pings.types.PULL;
    return this.drawPing(position, { style, user, ...pingOptions });
  }

  /* -------------------------------------------- */

  /**
   * @typedef PingOffscreenDrawOptions
   * @param {string} [style="arrow"]  The style of ping to draw, from {@link CONFIG.Canvas.pings}. Default: `"arrow"`.
   * @param {User} [user]             The User who pinged.
   */

  /**
   * Draw a ping at the edge of the viewport, pointing to the location of an off-screen ping.
   * @see {@link ControlsLayer#drawPing}
   * @param {Point} position                                    The coordinates of the off-screen ping.
   * @param {PingOptions & PingOffscreenDrawOptions} [options]  Additional options to configure how the ping is drawn.
   * @returns {Promise<boolean>}  A promise which resolves once the Ping has been drawn and animated.
   */
  async drawOffscreenPing(position, {style="arrow", user, ...pingOptions}={}) {
    const { ray, intersection } = this.#findViewportIntersection(position);
    if ( !intersection ) return;
    const name = `Ping.${foundry.utils.randomID()}`;
    this.#offscreenPings[name] = position;
    position = canvas.canvasCoordinatesFromClient(intersection);
    if ( game.settings.get("core", "photosensitiveMode") ) pingOptions.rings = 1;
    const animation = this.drawPing(position, { style, user, name, rotation: ray.angle, ...pingOptions });
    animation.finally(() => delete this.#offscreenPings[name]);
    return animation;
  }

  /* -------------------------------------------- */

  /**
   * @typedef PingDrawOptions
   * @param {string} [style="pulse"]  The style of ping to draw, from  {@link CONFIG.Canvas.pings}. Default: `"pulse"`.
   * @param {User} [user]             The User who pinged.
   */

  /**
   * Draw a ping on the canvas.
   * @see {@link foundry.canvas.interaction.Ping#animate}
   * @param {Point} position                           The position on the canvas that was pinged.
   * @param {PingOptions & PingDrawOptions} [options]  Additional options to configure how the ping is drawn.
   * @returns {Promise<boolean>}  A promise which resolves once the Ping has been drawn and animated.
   */
  async drawPing(position, {style="pulse", user, ...pingOptions}={}) {
    const cfg = CONFIG.Canvas.pings.styles[style] ?? CONFIG.Canvas.pings.styles.pulse;
    const options = {
      duration: cfg.duration,
      color: cfg.color ?? user?.color,
      size: 100 * (cfg.size || 1) * canvas.dimensions.uiScale
    };
    const ping = new cfg.class(position, foundry.utils.mergeObject(options, pingOptions));
    this.pings.addChild(ping);
    return ping.animate();
  }

  /* -------------------------------------------- */

  /**
   * Given off-screen coordinates, determine the closest point at the edge of the viewport to these coordinates.
   * @param {Point} position                                     The off-screen coordinates.
   * @returns {{ray: Ray, intersection: LineIntersection|null}}  The closest point at the edge of the viewport to these
   *                                                             coordinates and a ray cast from the centre of the
   *                                                             screen towards it.
   */
  #findViewportIntersection(position) {
    let { clientWidth: w, clientHeight: h } = document.documentElement;
    // Accommodate the sidebar.
    if ( !ui.sidebar._collapsed ) w -= ui.sidebar.options.width + 10;
    const [cx, cy] = [w / 2, h / 2];
    const ray = new Ray({x: cx, y: cy}, canvas.clientCoordinatesFromCanvas(position));
    const bounds = [[0, 0, w, 0], [w, 0, w, h], [w, h, 0, h], [0, h, 0, 0]];
    const intersections = bounds.map(ray.intersectSegment.bind(ray));
    const intersection = intersections.find(i => i !== null);
    return { ray, intersection };
  }
}

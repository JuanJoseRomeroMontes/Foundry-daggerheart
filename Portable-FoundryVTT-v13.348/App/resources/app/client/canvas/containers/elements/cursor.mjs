import PreciseText from "./precise-text.mjs";

/**
 * @import {Point} from "@common/_types.mjs";
 */

/**
 * A single Mouse Cursor
 */
export default class Cursor extends PIXI.Container {
  constructor(user) {
    super();
    this.draw(user);
  }

  /* -------------------------------------------- */

  /**
   * The target cursor position.
   * @type {Point}
   */
  target = {x: 0, y: 0};

  /* -------------------------------------------- */

  /**
   * The current cursor position.
   * @type {Point}
   */
  #current = {x: 0, y: 0};

  /* -------------------------------------------- */

  /**
   * To know if this cursor is animated
   * @type {boolean}
   */
  #animating;

  /* -------------------------------------------- */

  /**
   * Update the position of this cursor based on the current position?
   * @type {boolean}
   * @internal
   */
  _updatePosition = true;

  /* -------------------------------------------- */

  /** @override */
  updateTransform() {
    if ( this._updatePosition ) {
      this._updatePosition = false;
      canvas.app.stage.worldTransform.apply(this.#current, this.position);
    }
    super.updateTransform();
  }

  /* -------------------------------------------- */

  /**
   * Update visibility and animations
   * @param {User} user  The user
   */
  refreshVisibility(user) {
    const v = this.visible = !user.isSelf && user.hasPermission("SHOW_CURSOR");

    if ( v && !this.#animating ) {
      canvas.app.ticker.add(this.#animate, this);
      this.#animating = true; // Set flag to true when animation is added
    } else if ( !v && this.#animating ) {
      canvas.app.ticker.remove(this.#animate, this);
      this.#animating = false; // Set flag to false when animation is removed
    }
  }

  /* -------------------------------------------- */

  /**
   * Draw the user's cursor as a small dot with their user name attached as text
   * @param {User} user
   */
  draw(user) {
    const s = game.settings.get("core", "uiConfig").uiScale;

    // Cursor dot
    const d = this.addChild(new PIXI.Graphics());
    d.beginFill(user.color, 0.35).lineStyle(s, 0x000000, 0.5).drawCircle(0, 0, 6 * s);

    // Player name
    const style = CONFIG.canvasTextStyle.clone();
    style.fontSize = 14;
    const n = this.addChild(new PreciseText(user.name, style));
    n.x -= n.width / 2 * s;
    n.y += 10 * s;
    n.scale.set(s, s);

    // Refresh
    this.refreshVisibility(user);
  }

  /* -------------------------------------------- */

  /**
   * Move an existing cursor to a new position smoothly along the animation loop
   */
  #animate() {
    const dx = this.target.x - this.#current.x;
    const dy = this.target.y - this.#current.y;
    if ( !(dx || dy) ) return;
    if ( Math.abs(dx) + Math.abs(dy) < 0.5 / CONFIG.Canvas.maxZoom ) {
      this.#current.x = this.target.x;
      this.#current.y = this.target.y;
    } else {
      this.#current.x += dx / 10;
      this.#current.y += dy / 10;
    }
    this._updatePosition = true;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  destroy(options) {
    if ( this.#animating ) {
      canvas.app.ticker.remove(this.#animate, this);
      this.#animating = false;
    }
    super.destroy(options);
  }
}

import Token from "../token.mjs";
import {TOKEN_DISPOSITIONS} from "../../../../common/constants.mjs";

/**
 * @import Token from "../token.mjs";
 * @import {DeepReadonly, TokenRulerData} from "../../../_types.mjs";
 */

/**
 * The ruler of a Token visualizes
 *   - the movement history of the Token,
 *   - the movment path the Token currently animating along, and
 *   - the planned movement path while the Token is being dragged.
 * @abstract
 */
export default class BaseTokenRuler {

  /**
   * @param {Token} token    The Token that this ruler belongs to
   */
  constructor(token) {
    if ( !(token instanceof Token) ) throw new Error("The BaseTokenRuler may only be constructed with a Token instance.");
    this.#token = token;
  }

  /* -------------------------------------------- */

  /**
   * The reference to the Token this ruler belongs to.
   * @type {Token}
   */
  get token() {
    return this.#token;
  }

  #token;

  /* -------------------------------------------- */

  /**
   * Is the ruler visible?
   * @type {boolean}
   * @defaultValue false
   */
  get visible() {
    return this.#visible;
  }

  /**
   * Set to {@link BaseTokenRuler#isVisible} in {@link foundry.canvas.placeables.Token#_refreshState}.
   */
  set visible(value) {
    if ( this.#visible === value ) return;
    this.#visible = value;
    this._onVisibleChange();
  }

  #visible = false;

  /* -------------------------------------------- */

  /**
   * Called when the ruler becomes visible or invisible.
   * @abstract
   * @protected
   */
  _onVisibleChange() {
    throw new Error("A subclass of the BaseTokenRuler must implement the _onVisibleChange method.");
  }

  /* -------------------------------------------- */

  /**
   * Is the ruler supposed to be visible?
   * {@link BaseTokenRuler#visible} is set to {@link BaseTokenRuler#isVisible} in
   * {@link foundry.canvas.placeables.Token#_refreshState}.
   * @type {boolean}
   */
  get isVisible() {
    const show = this.token.hover || this.token.layer.highlightObjects || this.token.showRuler || this.token.isDragged;
    if ( !show ) return false;
    return (this.token.document.disposition === TOKEN_DISPOSITIONS.FRIENDLY) || this.token.document.testUserPermission(game.user, "OBSERVER");
  }

  /* -------------------------------------------- */

  /**
   * Draw the ruler.
   * Called in {@link foundry.canvas.placeables.Token#_draw}.
   * @abstract
   */
  async draw() {
    throw new Error("A subclass of the BaseTokenRuler must implement the draw method.");
  }

  /* -------------------------------------------- */

  /**
   * Clear the ruler.
   * Called in {@link foundry.canvas.placeables.Token#clear}.
   * @abstract
   */
  clear() {
    throw new Error("A subclass of the BaseTokenRuler must implement the clear method.");
  }

  /* -------------------------------------------- */

  /**
   * Destroy the ruler.
   * Called in {@link foundry.canvas.placeables.Token#_destroy}.
   * @abstract
   */
  destroy() {
    throw new Error("A subclass of the BaseTokenRuler must implement the destroy method.");
  }

  /* -------------------------------------------- */

  /**
   * Refresh the ruler.
   * Called in {@link foundry.canvas.placeables.Token#_refreshRuler}.
   * @param {DeepReadonly<TokenRulerData>} rulerData
   * @abstract
   */
  refresh(rulerData) {
    throw new Error("A subclass of the BaseTokenRuler must implement the refresh method.");
  }
}

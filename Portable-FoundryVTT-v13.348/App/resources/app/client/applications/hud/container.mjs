import ApplicationV2 from "../api/application.mjs";

/**
 * @import {DrawingHUD, TileHUD, TokenHUD} from "./_module.mjs";
 */

/**
 * The Heads-Up Display Container is a canvas-sized Application which renders HTML overtop of the game canvas.
 */
export default class HeadsUpDisplayContainer extends ApplicationV2 {

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    id: "hud",
    window: {
      frame: false,
      positioned: false
    },
    position: {
      zIndex: 100
    }
  };

  /* -------------------------------------------- */

  /**
   * Token HUD
   * @type {TokenHUD}
   */
  token = new CONFIG.Token.hudClass();

  /**
   * Tile HUD
   * @type {TileHUD}
   */
  tile = new CONFIG.Tile.hudClass();

  /**
   * Drawing HUD
   * @type {DrawingHUD}
   */
  drawing = new CONFIG.Drawing.hudClass();

  /**
   * Chat Bubbles
   * @type {ChatBubbles}
   */
  bubbles = new CONFIG.Canvas.chatBubblesClass();

  /* -------------------------------------------- */

  /** @override */
  async _renderHTML(_context, _options) {
    return `
    <template id="${this.tile.id}"></template>
    <template id="${this.drawing.id}"></template>
    <div id="chat-bubbles" class="themed theme-light"></div>
    <div id="measurement"></div>`;
  }

  /* -------------------------------------------- */

  /** @override */
  _replaceHTML(result, content, _options) {
    content.innerHTML = result;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onRender(context, options) {
    await super._onRender(context, options);
    this.align();
    if ( this.options.classes.includes("themed") ) return;
    this.element.classList.remove("theme-light", "theme-dark");
    const {colorScheme} = game.settings.get("core", "uiConfig");
    if ( colorScheme.interface ) this.element.classList.add("themed", `theme-${colorScheme.interface}`);
  }

  /* -------------------------------------------- */
  /*  Public API                                  */
  /* -------------------------------------------- */

  /**
   * Align the position of the HUD layer to the current position of the canvas
   */
  align() {
    if ( !this.rendered ) return; // Not yet rendered
    const hud = this.element;
    const {x, y} = canvas.primary.getGlobalPosition();
    const {width, height} = canvas.dimensions;
    const scale = canvas.stage.scale.x;
    Object.assign(hud.style, {
      width: `${width}px`,
      height: `${height}px`,
      left: `${x}px`,
      top: `${y}px`,
      transform: `scale(${scale})`
    });
  }
}

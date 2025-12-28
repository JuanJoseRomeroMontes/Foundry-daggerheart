import PreciseText from "../containers/elements/precise-text.mjs";
import CanvasAnimation from "../animation/canvas-animation.mjs";
import CanvasGroupMixin from "./canvas-group-mixin.mjs";
import VoidFilter from "../rendering/filters/void.mjs";

/**
 * @import {TextAnchorPoint} from "@common/constants.mjs"
 * @import Drawing from "../placeables/drawing.mjs"
 */

/**
 * A container group which displays interface elements rendered above other canvas groups.
 * @extends {CanvasGroupMixin(PIXI.Container)}
 */
export default class InterfaceCanvasGroup extends CanvasGroupMixin(PIXI.Container) {

  /** @override */
  static groupName = "interface";

  /**
   * A container dedicated to the display of scrolling text.
   * @type {PIXI.Container}
   */
  #scrollingText;

  /**
   * The interface drawings container.
   * @type {PIXI.Container}
   */
  #drawings;

  /* -------------------------------------------- */
  /*  Drawing Management                          */
  /* -------------------------------------------- */

  /**
   * Add a PrimaryGraphics to the group.
   * @param {Drawing} drawing      The Drawing being added
   * @returns {PIXI.Graphics}      The created Graphics instance
   */
  addDrawing(drawing) {
    const name = drawing.objectId;
    const shape = this.drawings.graphics.get(name) ?? this.#drawings.addChild(new PIXI.Graphics());
    shape.name = name;
    this.drawings.graphics.set(name, shape);
    return shape;
  }

  /* -------------------------------------------- */

  /**
   * Remove a PrimaryGraphics from the group.
   * @param {Drawing} drawing     The Drawing being removed
   */
  removeDrawing(drawing) {
    const name = drawing.objectId;
    if ( !this.drawings.graphics.has(name) ) return;
    const shape = this.drawings.graphics.get(name);
    if ( shape?.destroyed === false ) shape.destroy({children: true});
    this.drawings.graphics.delete(name);
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async _draw(options) {
    this.#drawOutline();
    this.#createInterfaceDrawingsContainer();
    this.#drawScrollingText();
    await super._draw(options);

    // Necessary so that Token#voidMesh don't earse non-interface elements
    this.filters = [new VoidFilter()];
    this.filterArea = canvas.app.screen;
  }

  /* -------------------------------------------- */

  /**
   * Draw a background outline which emphasizes what portion of the canvas is playable space and what is buffer.
   */
  #drawOutline() {
    const outline = this.addChild(new PIXI.Graphics());
    const {scene, dimensions} = canvas;
    const displayCanvasBorder = scene.padding !== 0;
    const displaySceneOutline = !scene.background.src;
    const s = canvas.dimensions.uiScale;
    if ( !(displayCanvasBorder || displaySceneOutline) ) return;
    if ( displayCanvasBorder ) outline.lineStyle({
      alignment: 1,
      alpha: 0.75,
      color: 0x000000,
      join: PIXI.LINE_JOIN.BEVEL,
      width: 4 * s
    }).drawShape(dimensions.rect);
    if ( displaySceneOutline ) outline.lineStyle({
      alignment: 1,
      alpha: 0.25,
      color: 0x000000,
      join: PIXI.LINE_JOIN.BEVEL,
      width: 4 * s
    }).drawShape(dimensions.sceneRect).endFill();
  }

  /* -------------------------------------------- */
  /*  Scrolling Text                              */
  /* -------------------------------------------- */

  /**
   * Draw the scrolling text.
   */
  #drawScrollingText() {
    this.#scrollingText = this.addChild(new PIXI.Container());

    const {width, height} = canvas.dimensions;
    this.#scrollingText.width = width;
    this.#scrollingText.height = height;
    this.#scrollingText.eventMode = "none";
    this.#scrollingText.interactiveChildren = false;
    this.#scrollingText.zIndex = CONFIG.Canvas.groups.interface.zIndexScrollingText;
  }

  /* -------------------------------------------- */

  /**
   * Create the interface drawings container.
   */
  #createInterfaceDrawingsContainer() {
    this.#drawings = this.addChild(new PIXI.Container());
    this.#drawings.sortChildren = function() {
      const children = this.children;
      for ( let i = 0, n = children.length; i < n; i++ ) children[i]._lastSortedIndex = i;
      children.sort(InterfaceCanvasGroup.#compareObjects);
      this.sortDirty = false;
    };
    this.#drawings.sortableChildren = true;
    this.#drawings.eventMode = "none";
    this.#drawings.interactiveChildren = false;
    this.#drawings.zIndex = CONFIG.Canvas.groups.interface.zIndexDrawings;
  }

  /* -------------------------------------------- */

  /**
   * The sorting function used to order objects inside the Interface Drawings Container
   * Overrides the default sorting function defined for the PIXI.Container.
   * @param {PrimaryCanvasObject|PIXI.DisplayObject} a     An object to display
   * @param {PrimaryCanvasObject|PIXI.DisplayObject} b     Some other object to display
   * @returns {number}
   */
  static #compareObjects(a, b) {
    return ((a.elevation || 0) - (b.elevation || 0))
      || ((a.sort || 0) - (b.sort || 0))
      || (a.zIndex - b.zIndex)
      || (a._lastSortedIndex - b._lastSortedIndex);
  }

  /* -------------------------------------------- */

  /**
   * Display scrolling status text originating from an origin point on the Canvas.
   * @param {Point} origin            An origin point where the text should first emerge
   * @param {string} content          The text content to display
   * @param {object} [options]        Options which customize the text animation
   * @param {number} [options.duration=2000]  The duration of the scrolling effect in milliseconds
   * @param {number} [options.distance]       The distance in pixels that the scrolling text should travel
   * @param {TextAnchorPoint} [options.anchor]    The original anchor point where the text appears
   * @param {TextAnchorPoint} [options.direction] The direction in which the text scrolls
   * @param {number} [options.jitter=0]       An amount of randomization between [0, 1] applied to the initial position
   * @param {object} [options.textStyle={}]   Additional parameters of PIXI.TextStyle which are applied to the text
   * @returns {Promise<void>}                 A promise that resolves after the scrolling text animation ended.
   */
  async createScrollingText(origin, content, {duration=2000, distance, jitter=0, anchor, direction, ...textStyle}={}) {
    if ( !game.settings.get("core", "scrollingStatusText") ) return;
    const s = canvas.dimensions.uiScale;

    // Create text object
    const style = PreciseText.getTextStyle({anchor, ...textStyle});
    const text = this.#scrollingText.addChild(new PreciseText(content, style));
    text.visible = false;

    // Set initial coordinates
    const jx = (jitter ? (Math.random()-0.5) * jitter : 0) * text.width * s;
    const jy = (jitter ? (Math.random()-0.5) * jitter : 0) * text.height * s;
    text.position.set(origin.x + jx, origin.y + jy);

    // Configure anchor point
    text.anchor.set(...{
      [CONST.TEXT_ANCHOR_POINTS.CENTER]: [0.5, 0.5],
      [CONST.TEXT_ANCHOR_POINTS.BOTTOM]: [0.5, 0],
      [CONST.TEXT_ANCHOR_POINTS.TOP]: [0.5, 1],
      [CONST.TEXT_ANCHOR_POINTS.LEFT]: [1, 0.5],
      [CONST.TEXT_ANCHOR_POINTS.RIGHT]: [0, 0.5]
    }[anchor ?? CONST.TEXT_ANCHOR_POINTS.CENTER]);

    // Configure animation distance
    let dx = 0;
    let dy = 0;
    switch ( direction ?? CONST.TEXT_ANCHOR_POINTS.TOP ) {
      case CONST.TEXT_ANCHOR_POINTS.BOTTOM:
        dy = distance ?? (2 * text.height * s); break;
      case CONST.TEXT_ANCHOR_POINTS.TOP:
        dy = -1 * (distance ?? (2 * text.height * s)); break;
      case CONST.TEXT_ANCHOR_POINTS.LEFT:
        dx = -1 * (distance ?? (2 * text.width * s)); break;
      case CONST.TEXT_ANCHOR_POINTS.RIGHT:
        dx = distance ?? (2 * text.width * s); break;
    }

    // Fade In
    await CanvasAnimation.animate([
      {parent: text, attribute: "alpha", from: 0, to: 1},
      {parent: text.scale, attribute: "x", from: 0.6 * s, to: s},
      {parent: text.scale, attribute: "y", from: 0.6 * s, to: s}
    ], {
      context: this,
      duration: duration * 0.25,
      easing: CanvasAnimation.easeInOutCosine,
      ontick: () => text.visible = true
    });

    // Scroll
    const scroll = [{parent: text, attribute: "alpha", to: 0}];
    if ( dx !== 0 ) scroll.push({parent: text, attribute: "x", to: text.position.x + dx});
    if ( dy !== 0 ) scroll.push({parent: text, attribute: "y", to: text.position.y + dy});
    await CanvasAnimation.animate(scroll, {
      context: this,
      duration: duration * 0.75,
      easing: CanvasAnimation.easeInOutCosine
    });

    // Clean-up
    this.#scrollingText.removeChild(text);
    text.destroy();
  }
}

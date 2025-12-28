import PlaceableObject from "./placeable-object.mjs";
import ControlIcon from "../containers/elements/control-icon.mjs";
import PreciseText from "../containers/elements/precise-text.mjs";
import MouseInteractionManager from "../interaction/mouse-handler.mjs";
import ImagePopout from "../../applications/apps/image-popout.mjs";
import Hooks from "../../helpers/hooks.mjs";

/**
 * A Note is an implementation of PlaceableObject which represents an annotated location within the Scene.
 * Each Note links to a JournalEntry document and represents its location on the map.
 * @category Canvas
 * @see {@link foundry.documents.NoteDocument}
 * @see {@link foundry.canvas.layers.NotesLayer}
 */
export default class Note extends PlaceableObject {

  /** @inheritdoc */
  static embeddedName = "Note";

  /** @override */
  static RENDER_FLAGS = {
    redraw: {propagate: ["refresh"]},
    refresh: {propagate: ["refreshState", "refreshPosition", "refreshTooltip", "refreshElevation"], alias: true},
    refreshState: {propagate: ["refreshVisibility"]},
    refreshVisibility: {},
    refreshPosition: {},
    refreshTooltip: {},
    refreshElevation: {propagate: ["refreshVisibility"]},
    /** @deprecated since v12 */
    refreshText: {propagate: ["refreshTooltip"], deprecated: {since: 12, until: 14}, alias: true}
  };

  /* -------------------------------------------- */

  /**
   * The control icon.
   * @type {ControlIcon}
   */
  controlIcon;

  /* -------------------------------------------- */

  /**
   * The tooltip.
   * @type {PreciseText}
   */
  tooltip;

  /* -------------------------------------------- */

  /** @override */
  get bounds() {
    const {x, y, iconSize} = this.document;
    const r = iconSize / 2;
    return new PIXI.Rectangle(x - r, y - r, 2*r, 2*r);
  }

  /* -------------------------------------------- */

  /**
   * The associated JournalEntry which is referenced by this Note
   * @type {JournalEntry}
   */
  get entry() {
    return this.document.entry;
  }

  /* -------------------------------------------- */

  /**
   * The specific JournalEntryPage within the associated JournalEntry referenced by this Note.
   */
  get page() {
    return this.document.page;
  }

  /* -------------------------------------------- */

  /**
   * Determine whether the Note is visible to the current user based on their perspective of the Scene.
   * Visibility depends on permission to the underlying journal entry, as well as the perspective of controlled Tokens.
   * If Token Vision is required, the user must have a token with vision over the note to see it.
   * @type {boolean}
   */
  get isVisible() {
    const accessTest = this.document.page ?? this.document.entry;
    const access = accessTest?.testUserPermission(game.user, "LIMITED") ?? true;
    if ( (access === false) || !canvas.visibility.tokenVision || this.document.global ) return access;
    const point = {x: this.document.x, y: this.document.y};
    const tolerance = this.document.iconSize / 4;
    return canvas.visibility.testVisibility(point, {tolerance, object: this});
  }

  /* -------------------------------------------- */
  /* Rendering
  /* -------------------------------------------- */

  /** @override */
  async _draw(options) {
    this.controlIcon = this.addChild(this._drawControlIcon());
    this.tooltip = this.addChild(this._drawTooltip());
  }

  /* -------------------------------------------- */

  /**
   * Draw the control icon.
   * @returns {ControlIcon}
   * @protected
   */
  _drawControlIcon() {
    const {texture, iconSize} = this.document;
    const icon = new ControlIcon({texture: texture.src, size: iconSize, tint: texture.tint});
    icon.x -= (iconSize / 2);
    icon.y -= (iconSize / 2);
    return icon;
  }

  /* -------------------------------------------- */

  /**
   * Draw the tooltip.
   * @returns {PreciseText}
   * @protected
   */
  _drawTooltip() {
    const tooltip = new PreciseText(this.document.label, this._getTextStyle());
    tooltip.eventMode = "none";
    return tooltip;
  }

  /* -------------------------------------------- */

  /**
   * Refresh the tooltip.
   * @protected
   */
  _refreshTooltip() {
    this.tooltip.text = this.document.label;
    this.tooltip.style = this._getTextStyle();
    const halfPad = (0.5 * this.document.iconSize) + 12;
    switch ( this.document.textAnchor ) {
      case CONST.TEXT_ANCHOR_POINTS.CENTER:
        this.tooltip.anchor.set(0.5, 0.5);
        this.tooltip.position.set(0, 0);
        break;
      case CONST.TEXT_ANCHOR_POINTS.BOTTOM:
        this.tooltip.anchor.set(0.5, 0);
        this.tooltip.position.set(0, halfPad);
        break;
      case CONST.TEXT_ANCHOR_POINTS.TOP:
        this.tooltip.anchor.set(0.5, 1);
        this.tooltip.position.set(0, -halfPad);
        break;
      case CONST.TEXT_ANCHOR_POINTS.LEFT:
        this.tooltip.anchor.set(1, 0.5);
        this.tooltip.position.set(-halfPad, 0);
        break;
      case CONST.TEXT_ANCHOR_POINTS.RIGHT:
        this.tooltip.anchor.set(0, 0.5);
        this.tooltip.position.set(halfPad, 0);
        break;
    }
  }

  /* -------------------------------------------- */

  /**
   * Define a PIXI TextStyle object which is used for the tooltip displayed for this Note
   * @returns {PIXI.TextStyle}
   * @protected
   */
  _getTextStyle() {
    const style = CONFIG.canvasTextStyle.clone();

    // Positioning
    if ( this.document.textAnchor === CONST.TEXT_ANCHOR_POINTS.LEFT ) style.align = "right";
    else if ( this.document.textAnchor === CONST.TEXT_ANCHOR_POINTS.RIGHT ) style.align = "left";

    // Font preferences
    style.fontFamily = this.document.fontFamily || CONFIG.defaultFontFamily;
    style.fontSize = this.document.fontSize;

    // Toggle stroke style depending on whether the text color is dark or light
    const color = this.document.textColor;
    style.fill = color;
    style.stroke = color.hsv[2] > 0.6 ? 0x000000 : 0xFFFFFF;
    style.strokeThickness = 4;
    return style;
  }

  /* -------------------------------------------- */
  /*  Incremental Refresh                         */
  /* -------------------------------------------- */

  /** @override */
  _applyRenderFlags(flags) {
    if ( flags.refreshState ) this._refreshState();
    if ( flags.refreshVisibility ) this._refreshVisibility();
    if ( flags.refreshPosition ) this._refreshPosition();
    if ( flags.refreshTooltip ) this._refreshTooltip();
    if ( flags.refreshElevation ) this._refreshElevation();
  }

  /* -------------------------------------------- */

  /**
   * Refresh the visibility.
   * @protected
   */
  _refreshVisibility() {
    const wasVisible = this.visible;
    this.visible = this.isVisible;
    if ( this.controlIcon ) this.controlIcon.refresh({
      visible: this.visible,
      borderVisible: this.hover || this.layer.highlightObjects
    });
    if ( wasVisible !== this.visible ) {
      ui.controls._updateNotesIcon();
      MouseInteractionManager.emulateMoveEvent();
    }
  }

  /* -------------------------------------------- */

  /**
   * Refresh the state of the Note. Called the Note enters a different interaction state.
   * @protected
   */
  _refreshState() {
    this.alpha = this._getTargetAlpha();
    this.tooltip.visible = this.hover || this.layer.highlightObjects;
    this.zIndex = this.hover ? 1 : 0;
  }

  /* -------------------------------------------- */

  /**
   * Refresh the position of the Note. Called with the coordinates change.
   * @protected
   */
  _refreshPosition() {
    const {x, y} = this.document;
    if ( (this.position.x !== x) || (this.position.y !== y) ) MouseInteractionManager.emulateMoveEvent();
    this.position.set(this.document.x, this.document.y);
  }

  /* -------------------------------------------- */

  /**
   * Refresh the elevation of the control icon.
   * @protected
   */
  _refreshElevation() {
    this.controlIcon.elevation = this.document.elevation;
  }

  /* -------------------------------------------- */
  /*  Document Event Handlers                     */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);

    // Incremental Refresh
    const positionChanged = ("x" in changed) || ("y" in changed);
    this.renderFlags.set({
      redraw: ("texture" in changed) || ("iconSize" in changed),
      refreshVisibility: positionChanged || ["entryId", "pageId", "global"].some(k => k in changed),
      refreshPosition: positionChanged,
      refreshTooltip: ["text", "fontFamily", "fontSize", "textAnchor", "textColor", "iconSize"].some(k => k in changed),
      refreshElevation: "elevation" in changed
    });
  }

  /* -------------------------------------------- */
  /*  Interactivity                               */
  /* -------------------------------------------- */

  /** @override */
  _canHover(user) {
    return true;
  }

  /* -------------------------------------------- */

  /** @override */
  _canView(user) {
    const {entry, page} = this.document;
    if ( !entry ) return false;
    if ( game.user.isGM ) return true;
    if ( page?.testUserPermission(game.user, "LIMITED", {exact: true}) ) {
      // Special-case handling for image pages.
      return page.type === "image";
    }
    const accessTest = page ?? entry;
    return accessTest.testUserPermission(game.user, "OBSERVER");
  }

  /* -------------------------------------------- */

  /** @override */
  _canConfigure(user) {
    return canvas.notes.active && this.document.canUserModify(game.user, "update");
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onClickLeft2(event) {
    const {entry, page} = this.document;
    if ( !entry ) return;
    const options = {};
    if ( page ) {
      options.mode = foundry.applications.sheets.journal.JournalEntrySheet.VIEW_MODES.SINGLE;
      options.pageId = page.id;
    }
    const allowed = Hooks.call("activateNote", this, options);
    if ( allowed === false ) return;
    if ( page?.type === "image" ) {
      return new ImagePopout({
        src: page.src,
        uuid: page.uuid,
        caption: page.image.caption,
        window: {title: page.name}
      }).render({force: true});
    }
    entry.sheet.render(true, options);
  }

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  get text() {
    const msg = "Note#text has been deprecated. Use Note#document#label instead.";
    foundry.utils.logCompatibilityWarning(msg, {since: 12, until: 14, once: true});
    return this.document.label;
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  get size() {
    const msg = "Note#size has been deprecated. Use Note#document#iconSize instead.";
    foundry.utils.logCompatibilityWarning(msg, {since: 12, until: 14, once: true});
    return this.document.iconSize;
  }
}

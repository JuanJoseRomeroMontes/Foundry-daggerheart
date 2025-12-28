import BaseRuler from "./base-ruler.mjs";
import Ray from "../../geometry/shapes/ray.mjs";
import {getTemplate, renderTemplate} from "@client/applications/handlebars.mjs";

/**
 * @import {RulerWaypoint} from "../../../_types.mjs";
 */

/**
 * The default implementation of the Ruler.
 */
export default class Ruler extends BaseRuler {
  constructor(user) {
    super(user);
    this.#path.visible = false;
  }

  /* -------------------------------------------- */

  /**
   * A handlebars template used to render each waypoint label.
   * @type {string}
   */
  static WAYPOINT_LABEL_TEMPLATE = "templates/hud/waypoint-label.hbs";

  /* -------------------------------------------- */

  /**
   * This element is a Graphics instance which draws the line and points of the measured path.
   * @type {PIXI.Graphics}
   */
  #path = new PIXI.Graphics();

  /* -------------------------------------------- */

  /**
   * An HTML element in the #measurement HUD container containing labels for this TokenRuler instance.
   * @type {HTMLDivElement}
   */
  #labels;

  /* -------------------------------------------- */

  /**
   * The thickness of the waypoint and segment outline in pixels.
   * @type {number}
   */
  #outlineThickness;

  /* -------------------------------------------- */

  /**
   * The color of the waypoint and segment outline.
   * @type {PIXI.ColorSource}
   */
  #outlineColor;

  /* -------------------------------------------- */

  /**
   * Configure the properties of the outline.
   * Called in {@link Ruler#draw}.
   * @returns {{thickness: number; color: PIXI.ColorSource}}    The thickness in pixels and the color
   * @protected
   */
  _configureOutline() {
    const scale = canvas.dimensions.uiScale;
    return {thickness: scale, color: 0x000000};
  }

  /* -------------------------------------------- */

  /** @override */
  async draw() {
    if ( this.constructor.WAYPOINT_LABEL_TEMPLATE ) await getTemplate(this.constructor.WAYPOINT_LABEL_TEMPLATE);
    canvas.controls._rulerPaths.addChild(this.#path);
    const {thickness, color} = this._configureOutline();
    this.#outlineThickness = thickness;
    this.#outlineColor = color;
  }

  /* -------------------------------------------- */

  /** @override */
  destroy() {
    this.#path.destroy({children: true});
    this.#labels?.remove();
    this.#labels = undefined;
  }

  /* -------------------------------------------- */

  /** @override */
  _refresh() {
    if ( !this.visible ) {
      this.#path.clear();
      this.#path.visible = false;
      this.#labels?.replaceChildren();
      return;
    }
    const waypoints = this.#getWaypoints();
    this.#drawPath(waypoints);
    this.#renderWaypointLabels(waypoints);
  }

  /* -------------------------------------------- */

  /**
   * Get the waypoints from the ruler path.
   * @returns {RulerWaypoint[]}    The waypoints
   */
  #getWaypoints() {
    const waypoints = [];
    const measurement = canvas.grid.measurePath(this.path);
    for (let i = 0; i < this.path.length; i++) {
      const {x, y, elevation} = this.path[i];
      let ray = null;
      if ( waypoints.length > 0 ) {
        const {x: x0, y: y0} = waypoints.at(-1);
        ray = new Ray({x: x0, y: y0}, {x, y});
      }
      waypoints.push({x, y, elevation, index: i, ray, measurement: measurement.waypoints[i],
        previous: null, next: null});
    }
    for (let i = 0; i < waypoints.length; i++) {
      const waypoint = waypoints[i];
      waypoint.previous = i > 0 ? waypoints[i - 1] : null;
      waypoint.next = i < waypoints.length - 1 ? waypoints[i + 1] : null;
    }
    return waypoints;
  }

  /* -------------------------------------------- */

  /**
   * Render waypoint labels using the defined Ruler.WAYPOINT_LABEL_TEMPLATE handlebars template.
   * @param {RulerWaypoint[]} waypoints     The waypoints to label
   */
  async #renderWaypointLabels(waypoints) {
    this.#labels = this.#getLabelsElement();
    if ( !this.#labels ) return;
    const labels = [];
    const state = {};
    for ( const waypoint of waypoints ) {
      const context = this._getWaypointLabelContext(waypoint, state);
      if ( !context ) continue;
      context.waypoint = waypoint;
      context.waypointType = "distance-ruler";
      context.uiScale ??= canvas.dimensions.uiScale;
      let html = await renderTemplate(this.constructor.WAYPOINT_LABEL_TEMPLATE, context);
      html = foundry.utils.parseHTML(html);
      html.style.setProperty("--position-x", `${context.position.x}px`);
      html.style.setProperty("--position-y", `${context.position.y}px`);
      html.style.setProperty("--ui-scale", context.uiScale);
      labels.push(html);
    }
    this.#labels.replaceChildren(...labels);
  }

  /* -------------------------------------------- */

  /**
   * Create the HTMLDivElement used for labels belonging to this Ruler class.
   * We do this lazily within the scope of a refresh() because the #hud element is created after the Ruler is drawn.
   * TODO could we wait to draw rulers until after the HUD is rendered or render the HUD earlier?
   * @returns {HTMLDivElement|undefined}
   */
  #getLabelsElement() {
    if ( this.#labels?.parent ) return this.#labels; // Cached and in DOM
    const measurement = document.querySelector("#hud #measurement");
    if ( !measurement ) return undefined;
    const rulerId = `distance-ruler-${this.user.id}`;
    let labels = measurement.querySelector(`#${rulerId}`);
    if ( !labels ) {
      labels = document.createElement("div");
      labels.classList.add("ruler-labels", "distance-ruler-labels");
      labels.id = rulerId;
    }
    if ( labels.parent !== measurement ) measurement.appendChild(labels);
    return labels;
  }

  /* -------------------------------------------- */

  /**
   * Get the context used to render a ruler waypoint label.
   * @param {DeepReadonly<RulerWaypoint>} waypoint
   * @param {object} state
   * @returns {object|void}
   * @protected
   */
  _getWaypointLabelContext(waypoint, state) {
    const {index, elevation, previous, ray} = waypoint;
    state.hasElevation ||= (elevation !== 0);
    if ( !previous ) return;
    const deltaElevation = elevation - previous.elevation;
    if ( (ray.distance === 0) && (deltaElevation === 0) ) return;

    // Prepare data structure
    const context = {
      action: {icon: "fa-solid fa-ruler"},
      cssClass: [
        this.hidden ? "secret" : "",
        waypoint.next ? "" : "last"
      ].filterJoin(" "),
      secret: this.hidden,
      units: canvas.grid.units,
      uiScale: canvas.dimensions.uiScale,
      position: {x: ray.B.x, y: ray.B.y - (16 * canvas.dimensions.uiScale)}
    };

    // Segment Distance
    context.distance = {total: waypoint.measurement.distance.toNearest(0.01).toLocaleString(game.i18n.lang)};
    if ( index >= 2 ) context.distance.delta = waypoint.measurement.backward.distance.toNearest(0.01).signedString();

    // Elevation
    context.elevation = {total: elevation, icon: "fa-solid fa-arrows-up-down", hidden: !state.hasElevation};
    if ( deltaElevation !== 0 ) context.elevation.delta = deltaElevation.signedString();

    return context;
  }

  /* -------------------------------------------- */

  /**
   * Draw the path segments and waypoints.
   * @param {RulerWaypoint[]} waypoints    The waypoints
   */
  #drawPath(waypoints) {
    this.#path.clear();
    this.#path.visible = waypoints.length !== 0;
    if ( waypoints.length === 0 ) return;

    // Create draw instructions
    const layer1 = [];
    const layer2 = [];
    const layer3 = [];
    let previousWidth = -1;
    let previousColor = -1;
    const first = waypoints[0];
    if ( first.previous ) {
      const {x: fromX, y: fromY} = first.previous.center;
      layer1.push(g => g.moveTo(fromX, fromY));
      layer2.push(g => g.moveTo(fromX, fromY));
    }
    for ( const waypoint of waypoints ) {

      // Create waypoint draw instruction
      const {radius, color=0xFFFFFF, alpha=1} = this._getWaypointStyle(waypoint);
      if ( alpha === 1 ) {
        layer3.push(g => {
          g.lineStyle(this.#outlineThickness, this.#outlineColor);
          g.beginFill(color, 1, this.#outlineThickness === 0);
          g.drawCircle(waypoint.x, waypoint.y, radius + (this.#outlineThickness / 2));
          g.endFill();
        });
      } else {
        layer3.push(g => {
          g.lineStyle(0);
          g.beginFill(this.#outlineColor, alpha, true);
          g.drawCircle(waypoint.x, waypoint.y, radius + this.#outlineThickness);
          g.endFill();
          g.beginFill(color, alpha, true);
          g.drawCircle(waypoint.x, waypoint.y, radius);
          g.endFill();
        });
      }

      // Create segment draw instruction
      if ( waypoint.previous ) {
        let {width, color=0xFFFFFF, alpha=1} = this._getSegmentStyle(waypoint);
        color = PIXI.Color.shared.setValue(color).toNumber(); // Convert color to a number

        // Create outline draw instruction
        if ( this.#outlineThickness > 0 ) {
          if ( width !== previousWidth ) {
            const style = {
              width: width + (this.#outlineThickness * 2),
              color: this.#outlineColor,
              alpha,
              join: PIXI.LINE_JOIN.ROUND,
              cap: PIXI.LINE_CAP.ROUND
            };
            layer1.push(g => g.lineStyle(style));
          }
          layer1.push(g => g.lineTo(waypoint.x, waypoint.y));
        }

        // Create segment draw instruction
        if ( (width !== previousWidth) || (color !== previousColor) ) {
          const style = {
            width,
            color,
            alpha,
            join: PIXI.LINE_JOIN.ROUND,
            cap: PIXI.LINE_CAP.ROUND
          };
          layer2.push(g => g.lineStyle(style));
        }
        layer2.push(g => g.lineTo(waypoint.x, waypoint.y));

        previousWidth = width;
        previousColor = color;
      } else {
        layer1.push(g => g.moveTo(waypoint.x, waypoint.y));
        layer2.push(g => g.moveTo(waypoint.x, waypoint.y));
      }
    }

    // Execute draw instructions
    for ( const instruction of layer1 ) instruction(this.#path);
    for ( const instruction of layer2 ) instruction(this.#path);
    for ( const instruction of layer3 ) instruction(this.#path);
  }

  /* -------------------------------------------- */

  /**
   * Get the style of the waypoint at the given waypoint.
   * @param {DeepReadonly<RulerWaypoint>} waypoint    The waypoint
   * @returns {{radius: number; color?: PIXI.ColorSource; alpha?: number}}
   *   The radius, color, and alpha of the waypoint
   * @protected
   */
  _getWaypointStyle(waypoint) {
    const scale = canvas.dimensions.uiScale;
    return {radius: 6 * scale, color: this.user.color, alpha: 1};
  }

  /* -------------------------------------------- */

  /**
   * Get the style of the segment from the previous to the given waypoint.
   * @param {DeepReadonly<RulerWaypoint>} waypoint    The waypoint
   * @returns {{width: number, color?: PIXI.ColorSource, alpha?: number}}
   *   The line width, color, and alpha of the segment
   * @protected
   */
  _getSegmentStyle(waypoint) {
    const scale = canvas.dimensions.uiScale;
    return {width: 4 * scale, color: this.user.color, alpha: 1};
  }

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /**
   * @deprecated since v13
   * @ignore
   */
  get color() {
    foundry.utils.logCompatibilityWarning("Ruler#color is deprecated. Use Ruler#user#color instead.",
      {since: 13, until: 15, once: true});
    return this.user.color;
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v13
   * @ignore
   */
  get ruler() {
    foundry.utils.logCompatibilityWarning("Ruler#ruler is deprecated without replacement.",
      {since: 13, until: 15, once: true});
    return this.#path;
  }
}

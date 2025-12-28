import BaseTokenRuler from "./base-ruler.mjs";
import Ray from "../../geometry/shapes/ray.mjs";
import DashLineShader from "../../rendering/shaders/graphics/dash-line.mjs";
import {getTemplate, renderTemplate} from "@client/applications/handlebars.mjs";
import TokenDocument from "@client/documents/token.mjs";

/**
 * @import {GridMeasurePathResultWaypoint, GridOffset3D} from "../../../../common/grid/_types.mjs";
 * @import {DeepReadonly, TokenRulerWaypoint} from "../../../_types.mjs";
 * @import {TokenMovementWaypoint, TokenMeasuredMovementWaypoint} from "../../../documents/_types.mjs";
 * @import GridHighlight from "../../containers/elements/grid-highlight.mjs"
 */

/**
 * The default implementation of the Token ruler.
 */
export default class TokenRuler extends BaseTokenRuler {
  constructor(token) {
    super(token);
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
   * The ID of the grid highlight layer.
   * @type {string|null}
   */
  #highlightId = null;

  /* -------------------------------------------- */

  /**
   * The grid highlight layer.
   * @type {GridHighlight|null}
   */
  #highlightLayer = null;

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
   * The dash lines.
   * @type {{[userId: string]: {
   *   offset: number;
   *   innerStart: number;
   *   outerStart: number;
   *   path: TokenRulerWaypoint[];
   *   shaders: {shader: DashLineShader; offset: number}[];
   *   animate: boolean
   * }}}
   */
  #dashLines = {};

  /* -------------------------------------------- */

  /**
   * Animate the dash line shader?
   * @type {boolean}
   */
  #dashLineAnimating = false;

  /* -------------------------------------------- */

  /**
   * The dash line dash in pixels.
   * @type {number}
   */
  #dashLineDash;

  /* -------------------------------------------- */

  /**
   * The dash line gap in pixels.
   * @type {number}
   */
  #dashLineGap;

  /* -------------------------------------------- */

  /**
   * The dash line speed.
   * @type {number}
   */
  #dashLineSpeed;

  /* -------------------------------------------- */

  /** @override */
  _onVisibleChange() {
    this.#path.visible = this.visible;
    this.#getLabelsElement().classList.toggle("hidden", !this.visible);
    if ( this.#highlightLayer ) this.#highlightLayer.visible = this.visible;
  }

  /* -------------------------------------------- */

  /**
   * Configure the properties of the outline.
   * Called in {@link TokenRuler#draw}.
   * @returns {{thickness: number; color: PIXI.ColorSource}}    The thickness in pixels and the color
   * @protected
   */
  _configureOutline() {
    const scale = canvas.dimensions.uiScale;
    return {thickness: scale, color: 0x000000};
  }

  /* -------------------------------------------- */

  /**
   * Configure the properties of the dash line.
   * Called in {@link TokenRuler#draw}.
   * @returns {{dash: number; gap: number; speed: number}}
   *   The dash in pixels, the gap in pixels, and the speed in pixels per second
   * @protected
   */
  _configureDashLine() {
    const scale = canvas.dimensions.uiScale;
    return {dash: 12 * scale, gap: 8 * scale, speed: 50 * scale};
  }

  /* -------------------------------------------- */

  /** @override */
  async draw() {
    if ( this.constructor.WAYPOINT_LABEL_TEMPLATE ) await getTemplate(this.constructor.WAYPOINT_LABEL_TEMPLATE);

    // Add ruler path
    this.token.layer._rulerPaths.addChild(this.#path);

    // Create labels
    this.#getLabelsElement().classList.toggle("hidden", !this.visible);

    // Create the grid highlight layer unless gridless
    if ( !this.#highlightLayer && !canvas.grid.isGridless ) {
      this.#highlightId = `TokenRuler.${this.token.document.id}`;
      if ( this.token.isPreview ) this.#highlightId += ".preview";
      this.#highlightLayer = canvas.interface.grid.addHighlightLayer(this.#highlightId);
      this.#highlightLayer.visible = this.visible;
    }

    // Configure outline
    const {thickness, color} = this._configureOutline();
    this.#outlineThickness = thickness;
    this.#outlineColor = color;

    // Configure dash line
    const {dash, gap, speed} = this._configureDashLine();
    this.#dashLineDash = dash;
    this.#dashLineGap = gap;
    this.#dashLineSpeed = speed / (PIXI.Ticker.targetFPMS * 1000);
  }

  /* -------------------------------------------- */

  /** @override */
  clear() {
    this.#path.clear();
    this.token.layer.removeChild(this.#path);
    this.#labels?.replaceChildren();
    if ( this.#highlightLayer ) this.#highlightLayer.clear();
    if ( this.#dashLineAnimating ) {
      this.#dashLineAnimating = false;
      canvas.app.ticker.remove(this.#tickDashLine, this);
    }
  }

  /* -------------------------------------------- */

  /** @override */
  destroy() {
    this.#path.destroy({children: true});
    this.#labels?.remove();
    this.#labels = undefined;
    canvas.interface.grid.destroyHighlightLayer(this.#highlightId);
    if ( this.#dashLineAnimating ) canvas.app.ticker.remove(this.#tickDashLine, this);
  }

  /* -------------------------------------------- */

  /**
   * Get the ruler path without intermediate waypoints.
   * @param {{waypoints: TokenMeasuredMovementWaypoint[]; stage: "passed"|"pending"|"planned";
   *   unreachable: boolean, userId?: string}[]} pathParts    The paths that are to be combined
   * @returns {Omit<TokenRulerWaypoint, "index"|"center"|"size"|"ray">[]}   The combined path
   */
  #getSnappedIntermediatePath(pathParts) {
    const path = [];
    const actionConfigs = CONFIG.Token.movement.actions;
    for ( const {waypoints, stage, hidden, unreachable, userId} of pathParts ) {
      for ( let waypoint of waypoints ) {
        const actionConfig = actionConfigs[waypoint.action] ?? actionConfigs.displace;
        waypoint = {...waypoint, actionConfig, stage, hidden, unreachable};
        if ( userId ) waypoint.userId = userId;
        waypoint.movementId ??= null;
        const {x, y, elevation} = this.token.document.getSnappedPosition(waypoint);
        waypoint.x = Math.round(x);
        waypoint.y = Math.round(y);
        waypoint.elevation = elevation;
        path.push(waypoint);
      }
    }
    this.#measurePathAndLinkWaypoints(path);
    return path;
  }

  /* -------------------------------------------- */

  /**
   * Get the snapped ruler path with intermediate waypoints.
   * @param {{waypoints: TokenMeasuredMovementWaypoint[]; stage: "passed"|"pending"|"planned";
   *   unreachable: boolean, userId?: string}[]} pathParts    The paths that are to be combined
   * @returns {TokenRulerWaypoint[]}         The combined path
   */
  #getNonintermediatePath(pathParts) {
    const path = [];
    const actionConfigs = CONFIG.Token.movement.actions;
    let index = 0;
    for ( const {waypoints, stage, hidden, unreachable, userId} of pathParts ) {
      let skippedCost = 0;
      for ( let waypoint of waypoints ) {
        if ( waypoint.intermediate ) {
          skippedCost += waypoint.cost;
          continue;
        }
        if ( waypoint.explicit ) index++;
        const actionConfig = actionConfigs[waypoint.action] ?? actionConfigs.displace;
        waypoint = {...waypoint, cost: waypoint.cost + skippedCost, actionConfig, index, stage, hidden, unreachable};
        if ( userId ) waypoint.userId = userId;
        waypoint.movementId ??= null;
        waypoint.center = this.token.document.getCenterPoint(waypoint);
        waypoint.size = this.token.document.getSize(waypoint);
        waypoint.ray = path.length > 0 ? new Ray(path.at(-1).center, waypoint.center) : null;
        path.push(waypoint);
        skippedCost = 0;
      }
    }
    this.#measurePathAndLinkWaypoints(path);
    return path;
  }

  /* -------------------------------------------- */

  /**
   * Measure the given path through the waypoints and link the waypoints.
   * @param {Partial<TokenRulerWaypoint>[]} waypoints    The waypoints
   */
  #measurePathAndLinkWaypoints(waypoints) {
    const measurement = this.token.measureMovementPath(waypoints);
    for (let i = 0; i < waypoints.length; i++) {
      const waypoint = waypoints[i];
      waypoint.measurement = measurement.waypoints[i];
      waypoint.previous = i > 0 ? waypoints[i - 1] : null;
      waypoint.next = i < waypoints.length - 1 ? waypoints[i + 1] : null;
    }
  }

  /* -------------------------------------------- */

  /** @override */
  refresh({passedWaypoints, pendingWaypoints, plannedMovement}) {
    const pathParts = [
      {waypoints: passedWaypoints, stage: "passed", hidden: false, unreachable: false},
      {waypoints: pendingWaypoints, stage: "pending", hidden: false, unreachable: false}
    ];
    const rulerPaths = [{waypoints: this.#getNonintermediatePath(pathParts), searching: false, userId: null}];
    const gridHightlightPaths = [this.#getSnappedIntermediatePath(pathParts)];

    // Make sure the paths and grid highlights of the current user are drawn on top
    const planned = Object.entries(plannedMovement);
    const selfIndex = planned.findIndex(([userId]) => userId === game.user.id);
    if ( (selfIndex >= 0) && (selfIndex < planned.length - 1) ) planned.push(...planned.splice(selfIndex, 1));

    for ( const [userId, {foundPath, unreachableWaypoints, history, hidden, searching}] of planned ) {
      let numNonintermediateHistory = 0;
      for ( const waypoint of history ) {
        if ( !waypoint.intermediate ) numNonintermediateHistory++;
      }
      const pathParts = [
        {waypoints: history, stage: "passed", hidden, unreachable: false},
        {waypoints: foundPath, stage: "planned", hidden, unreachable: false, userId},
        {waypoints: unreachableWaypoints, stage: "planned", hidden, unreachable: true, userId}
      ];
      rulerPaths.push({waypoints: this.#getNonintermediatePath(pathParts).slice(numNonintermediateHistory),
        searching, userId});
      gridHightlightPaths.push(this.#getSnappedIntermediatePath(pathParts).slice(history.length));
    }

    this.#updateDashLines(rulerPaths);
    this.#drawPaths(rulerPaths);
    this.#drawGridHighlights(gridHightlightPaths);
    this.#renderWaypointLabels(rulerPaths);
  }

  /* -------------------------------------------- */

  /**
   * Render waypoint labels using the defined TokenRuler.WAYPOINT_LABEL_TEMPLATE handlebars template.
   * @param {{waypoints: TokenRulerWaypoint[]}[]} paths    The paths
   */
  async #renderWaypointLabels(paths) {
    const labels = [];
    for ( const {waypoints} of paths ) {
      const state = {};
      for ( const waypoint of waypoints ) {
        const context = this._getWaypointLabelContext(waypoint, state);
        if ( !context ) continue;
        context.waypoint = waypoint;
        context.waypointType = "token-ruler";
        context.uiScale ??= canvas.dimensions.uiScale;
        let html = await renderTemplate(this.constructor.WAYPOINT_LABEL_TEMPLATE, context);
        html = foundry.utils.parseHTML(html);
        html.style.setProperty("--position-x", `${context.position.x}px`);
        html.style.setProperty("--position-y", `${context.position.y}px`);
        html.style.setProperty("--ui-scale", context.uiScale);
        labels.push(html);
      }
    }
    this.#getLabelsElement().replaceChildren(...labels);
  }

  /* -------------------------------------------- */

  /**
   * Create the HTMLDivElement used for labels belonging to this TokenRuler class.
   * We do this lazily within the scope of a refresh() because the #hud element is created after the Ruler is drawn.
   * TODO could we wait to draw rulers until after the HUD is rendered or render the HUD earlier?
   * @returns {HTMLDivElement}
   */
  #getLabelsElement() {
    let labels = this.#labels;
    if ( !labels ) {
      let rulerId = `token-ruler-${this.token.document.id}`;
      if ( this.token.isPreview ) rulerId += "-preview";
      labels = document.querySelector(`#hud #measurement #${rulerId}`);
      if ( !labels ) {
        labels = document.createElement("div");
        labels.classList.add("ruler-labels", "token-ruler-labels");
        if ( !this.visible ) labels.classList.add("hidden");
        labels.id = rulerId;
      }
      this.#labels = labels;
    }
    if ( labels.parent ) return labels;
    document.querySelector("#hud #measurement")?.appendChild(labels);
    return labels;
  }

  /* -------------------------------------------- */

  /**
   * Get the context used to render a ruler waypoint label.
   * @param {DeepReadonly<TokenRulerWaypoint>} waypoint
   * @param {object} state
   * @returns {object|void}
   * @protected
   */
  _getWaypointLabelContext(waypoint, state) {
    const {index, elevation, explicit, next, previous, ray} = waypoint;
    if ( !state.initialized ) {

      // If any of the prior waypoints has nonzero elevation, initialize to true
      state.hasElevation = false;
      let w = waypoint;
      while ( w && !state.hasElevation ) {
        state.hasElevation = (w.elevation !== 0);
        w = w.previous;
      }

      state.previousElevation = previous?.elevation ?? elevation;
      state.initialized = true;
    }
    state.hasElevation ||= (elevation !== 0);
    if ( !previous ) return;
    if ( !explicit && next && waypoint.actionConfig.visualize && next.actionConfig.visualize
      && (waypoint.action === next.action) ) return;
    if ( (ray.distance === 0) && (elevation === previous.elevation) ) return;

    // Prepare data structure
    const context = {
      action: waypoint.actionConfig,
      cssClass: [
        waypoint.hidden ? "secret" : "",
        waypoint.next ? "" : "last"
      ].filterJoin(" "),
      secret: waypoint.hidden,
      units: canvas.grid.units,
      uiScale: canvas.dimensions.uiScale,
      position: {x: ray.B.x, y: ray.B.y + (next ? 0 : 0.5 * this.token.h) + (16 * canvas.dimensions.uiScale)}
    };

    // Segment Distance
    context.distance = {total: waypoint.measurement.distance.toNearest(0.01).toLocaleString(game.i18n.lang)};
    if ( index >= 2 ) context.distance.delta = waypoint.measurement.backward.distance.toNearest(0.01).signedString();

    // Segment Cost
    const cost = waypoint.measurement.cost;
    const deltaCost = waypoint.cost;
    context.cost = {total: Number.isFinite(cost) ? cost.toNearest(0.01).toLocaleString(game.i18n.lang) : "∞", units: canvas.grid.units};
    if ( index >= 2 ) context.cost.delta = Number.isFinite(deltaCost) ? deltaCost.toNearest(0.01).signedString() : "∞";

    // Elevation
    const deltaElevation = elevation - state.previousElevation;
    context.elevation = {total: elevation, icon: "fa-solid fa-arrows-up-down", hidden: !state.hasElevation};
    if ( deltaElevation !== 0 ) context.elevation.delta = deltaElevation.signedString();
    state.previousElevation = elevation;

    return context;
  }

  /* -------------------------------------------- */

  /**
   * Draw the path segments and waypoints.
   * @param {{waypoints: TokenRulerWaypoint[]; searching: boolean; userId: string}[]} paths  The paths
   */
  #drawPaths(paths) {
    this.#path.clear();

    // Create draw instructions
    const layer1 = [];
    const layer2 = [];
    const layer3 = [];
    for ( const {waypoints, userId} of paths ) {
      if ( waypoints.length === 0 ) continue;
      let previousWidth = -1;
      let previousColor = -1;
      const dashLine = userId ? this.#getDashLine(userId) : null;
      let innerDash = false;
      let outerDash = false;
      let dashedDistance = 0;
      const first = waypoints[0];
      if ( first.previous ) {
        const {x: fromX, y: fromY} = first.previous.center;
        layer1.push(g => g.moveTo(fromX, fromY));
        layer2.push(g => g.moveTo(fromX, fromY));
      }
      for ( let i = 0; i < waypoints.length; i++ ) {
        const waypoint = waypoints[i];
        const to = waypoint.center;

        // Create waypoint draw instruction
        const {radius, color=0xFFFFFF, alpha=1} = this._getWaypointStyle(waypoint);
        if ( radius > 0 ) {
          if ( alpha === 1 ) {
            layer3.push(g => {
              g.lineStyle(this.#outlineThickness, this.#outlineColor);
              g.beginFill(color, 1, this.#outlineThickness === 0);
              g.drawCircle(to.x, to.y, radius + (this.#outlineThickness / 2));
              g.endFill();
            });
          } else {
            layer3.push(g => {
              g.lineStyle(0);
              g.beginFill(this.#outlineColor, alpha, true);
              g.drawCircle(to.x, to.y, radius + this.#outlineThickness);
              g.endFill();
              g.beginFill(color, alpha, true);
              g.drawCircle(to.x, to.y, radius);
              g.endFill();
            });
          }
        }

        // Create segment draw instruction
        if ( i > 0 ) {
          let {width, color=0xFFFFFF, alpha=1} = this._getSegmentStyle(waypoint);
          color = PIXI.Color.shared.setValue(color).toNumber(); // Convert color to a number
          if ( width > 0 ) {
            let forceInnerStyleChange = false;
            let forceOuterStyleChange = false;
            if ( dashLine ) {
              if ( !innerDash && (i >= dashLine.innerStart) ) {
                innerDash = true;
                forceInnerStyleChange = true;
              }
              if ( !outerDash && (i >= dashLine.outerStart) ) {
                outerDash = true;
                forceOuterStyleChange = true;
              }
            }

            // Create outline draw instruction
            if ( this.#outlineThickness > 0 ) {
              if ( (width !== previousWidth) || forceOuterStyleChange ) {
                const style = {
                  width: width + (this.#outlineThickness * 2),
                  color: this.#outlineColor,
                  alpha,
                  join: PIXI.LINE_JOIN.ROUND,
                  cap: PIXI.LINE_CAP.ROUND,
                  shader: outerDash ? this.#createOuterDashLineShader(dashLine, dashedDistance) : null
                };
                layer1.push(g => g.lineStyle(style));
              }
              layer1.push(g => g.lineTo(to.x, to.y));
            }

            // Create segment draw instruction
            if ( (width !== previousWidth) || (color !== previousColor) || forceInnerStyleChange ) {
              const style = {
                width,
                color,
                alpha,
                join: PIXI.LINE_JOIN.ROUND,
                cap: PIXI.LINE_CAP.ROUND,
                shader: innerDash ? this.#createInnerDashLineShader(dashLine, dashedDistance) : null
              };
              layer2.push(g => g.lineStyle(style));
            }
            layer2.push(g => g.lineTo(to.x, to.y));

            if ( innerDash ) dashedDistance += waypoint.ray.distance;
            previousWidth = width;
            previousColor = color;
          } else {
            layer1.push(g => g.moveTo(to.x, to.y));
            layer2.push(g => g.moveTo(to.x, to.y));
          }
        } else {
          layer1.push(g => g.moveTo(to.x, to.y));
          layer2.push(g => g.moveTo(to.x, to.y));
        }
      }

      // Execute draw instructions
      for ( const instruction of layer1 ) instruction(this.#path);
      for ( const instruction of layer2 ) instruction(this.#path);
      for ( const instruction of layer3 ) instruction(this.#path);
    }
  }

  /* -------------------------------------------- */

  /**
   * Get the style of the waypoint at the given waypoint.
   * @param {DeepReadonly<TokenRulerWaypoint>} waypoint       The waypoint
   * @returns {{radius: number; color?: PIXI.ColorSource; alpha?: number}}
   *   The radius, color, and alpha of the waypoint. If the radius is 0, no waypoint marker is drawn.
   * @protected
   */
  _getWaypointStyle(waypoint) {
    if ( !waypoint.explicit && waypoint.next && waypoint.previous && waypoint.actionConfig.visualize
      && waypoint.next.actionConfig.visualize && (waypoint.action === waypoint.next.action) ) return {radius: 0};
    const user = game.users.get(waypoint.userId);
    const scale = canvas.dimensions.uiScale;
    return {radius: 6 * scale, color: user?.color ?? 0x000000, alpha: 1};
  }

  /* -------------------------------------------- */

  /**
   * Get the style of the segment from the previous to the given waypoint.
   * @param {DeepReadonly<TokenRulerWaypoint>} waypoint      The waypoint
   * @returns {{width: number; color?: PIXI.ColorSource; alpha?: number}}
   *   The line width, color, and alpha of the segment.  If the width is 0, no segment is drawn.
   * @protected
   */
  _getSegmentStyle(waypoint) {
    if ( !waypoint.actionConfig.visualize ) return {width: 0};
    const user = game.users.get(waypoint.userId);
    const scale = canvas.dimensions.uiScale;
    return {width: 4 * scale, color: user?.color ?? 0x000000, alpha: 1};
  }

  /* -------------------------------------------- */

  /**
   * Draw the grid highlights.
   * @param {Omit<TokenRulerWaypoint, "index"|"center"|"size"|"ray">[][]} paths    The paths
   */
  #drawGridHighlights(paths) {
    if ( !this.#highlightLayer ) return;
    this.#highlightLayer.clear();

    // Iterate the paths in reverse
    for ( let i = paths.length - 1; i >= 0; i-- ) {
      const path = paths[i];

      // Iterate the path in reverse
      for ( let j = path.length - 1; j >= 0; j-- ) {
        const waypoint = path[j];

        // Highlight each occupied offset at this waypoint
        for ( const offset of this.token.document.getOccupiedGridSpaceOffsets(waypoint) ) {
          const offsetKey = `${offset.i},${offset.j}`;

          // Skip already highlighted grid spaces
          if ( this.#highlightLayer.positions.has(offsetKey) ) continue;

          // Get style for drawing the grid space polygon
          const {color=0xFFFFFF, alpha=0.5, texture=PIXI.Texture.WHITE,
            matrix=null} = this._getGridHighlightStyle(waypoint, offset);
          if ( !(alpha > 0) ) continue;

          this.#highlightLayer.beginTextureFill({texture, color, alpha, matrix, smooth: !canvas.grid.isSquare});
          this.#highlightLayer.drawPolygon(canvas.grid.getVertices(offset));
          this.#highlightLayer.endFill();
          this.#highlightLayer.positions.add(offsetKey);
        }
      }
    }
  }

  /* -------------------------------------------- */

  /**
   * Get the style to be used to highlight the grid offset.
   * @param {DeepReadonly<Omit<TokenRulerWaypoint, "index"|"center"|"size"|"ray">>} waypoint    The waypoint
   * @param {DeepReadonly<GridOffset3D>} offset  An occupied grid offset at the given waypoint that is to be highlighted
   * @returns {{color?: PIXI.ColorSource; alpha?: number; texture?: PIXI.Texture; matrix?: PIXI.Matrix | null}}
   *   The color, alpha, texture, and texture matrix to be used to draw the grid space.
   *   If the alpha is 0, the grid space is not highlighted.
   * @protected
   */
  _getGridHighlightStyle(waypoint, offset) {
    if ( waypoint.unreachable || (waypoint.actionConfig.teleport && waypoint.intermediate)
      || ((waypoint.stage === "planned") && (waypoint.previous?.stage === "passed")
      && !waypoint.actionConfig.teleport) ) return {alpha: 0};
    const user = game.users.get(waypoint.userId);
    return {color: user?.color ?? 0x000000, alpha: 0.5};
  }

  /* -------------------------------------------- */

  /**
   * Create an inner dash line shader.
   * @param {{offset: number; shaders: {shader: DashLineShader; offset: number}[]}} dashLine    The dash line
   * @param {number} distance     The current distance of the dashed path
   * @returns {DashLineShader}    The inner dash line shader
   */
  #createInnerDashLineShader(dashLine, distance) {
    const offset = this.#dashLineGap - distance;
    const shader = new DashLineShader({
      dash: this.#dashLineDash,
      gap: this.#dashLineGap,
      offset: dashLine.offset + offset
    });
    dashLine.shaders.push({shader, offset});
    return shader;
  }

  /* -------------------------------------------- */

  /**
   * Create an outer dash line shader.
   * @param {{offset: number; shaders: {shader: DashLineShader; offset: number}[]}} dashLine    The dash line
   * @param {number} distance     The current distance of the dashed path
   * @returns {DashLineShader}   The outer dash line shader
   */
  #createOuterDashLineShader(dashLine, distance) {
    const offset = this.#dashLineGap - distance - this.#outlineThickness;
    const shader = new DashLineShader({
      dash: this.#dashLineDash + (2 * this.#outlineThickness),
      gap: Math.max(this.#dashLineGap - (2 * this.#outlineThickness), 0),
      offset: dashLine.offset + offset
    });
    dashLine.shaders.push({shader, offset});
    return shader;
  }

  /* -------------------------------------------- */

  /**
   * Get the dash line for the given User ID.
   * @param {string} userId    The User ID
   * @returns {{
   *   offset: number;
   *   innerStart: number;
   *   outerStart: number;
   *   path: TokenRulerWaypoint[];
   *   shaders: {shader: DashLineShader; offset: number}[];
   *   animate: boolean
   * }}  The dash line
   */
  #getDashLine(userId) {
    let dashLine = this.#dashLines[userId];
    if ( !dashLine ) {
      this.#dashLines[userId] = dashLine = {
        offset: 0,
        innerStart: 0,
        outerStart: 0,
        path: [],
        shaders: [],
        animate: false
      };
    }
    return dashLine;
  }

  /* -------------------------------------------- */

  /**
   * Update the dash lines.
   * @param {{waypoints: TokenRulerWaypoint[]; searching: boolean; userId: string|null}[]} paths    The paths
   */
  #updateDashLines(paths) {
    let animate = false;
    const active = new Set();
    for ( const {waypoints, searching, userId} of paths ) {
      if ( !userId ) continue;
      active.add(userId);
      const dashLine = this.#getDashLine(userId);
      if ( searching ) dashLine.animate = animate = true;
      else dashLine.animate = false;
      const numWaypoints = waypoints.length;
      const unreachableIndex = waypoints.findIndex(waypoint => waypoint.unreachable);
      let index = searching ? 0 : unreachableIndex;
      let dashedPath;
      if ( index >= 0 ) dashedPath = waypoints.slice(Math.max(index - 1, 0));
      else {
        index = numWaypoints;
        dashedPath = [];
      }
      dashLine.innerStart = index;
      dashLine.outerStart = searching ? (unreachableIndex >= 0 ? unreachableIndex : numWaypoints) : index;
      const shift = this.#calculateDashOffsetShift(dashLine.path, dashedPath);
      dashLine.offset += shift;
      dashLine.path = dashedPath;
    }
    for ( const [userId, dashLine] of Object.entries(this.#dashLines) ) {
      dashLine.shaders.length = 0;
      if ( active.has(userId) ) continue;
      dashLine.offset = 0;
      dashLine.innerStart = 0;
      dashLine.outerStart = 0;
      dashLine.waypoints = [];
      dashLine.animate = false;
    }

    // Add/remove the ticker as necessary
    if ( this.#dashLineAnimating !== animate ) {
      this.#dashLineAnimating = animate;
      if ( animate ) canvas.app.ticker.add(this.#tickDashLine, this);
      else canvas.app.ticker.remove(this.#tickDashLine, this);
    }
  }

  /* -------------------------------------------- */

  /**
   * Calculate the necessary dash line offset shift to prevent the dashes of unreachable segments
   * to jump when the path is found and therefore the path changes.
   * @param {TokenMovementWaypoint[]} path1    The first path
   * @param {TokenMovementWaypoint[]} path2    The second path
   * @returns {number}                         The dash line offset shift
   */
  #calculateDashOffsetShift(path1, path2) {
    if ( !path1.length || !path2.length ) return 0;
    if ( path1.length < path2.length ) return -this.#calculateDashOffsetShift(path2, path1);

    // Find the longest common subpath (https://en.wikibooks.org/wiki/Algorithm_Implementation/Strings/Longest_common_substring#TypeScript)
    let i0 = 0;
    let j0 = 0;
    let maxD = -Infinity;
    let n0 = new Array(path2.length).fill(0);
    let n1 = new Array(path2.length).fill(0);
    let d0 = new Array(path2.length).fill(-Infinity);
    let d1 = new Array(path2.length).fill(-Infinity);
    for ( let i = 0; i < path1.length; i++ ) {
      const w1 = path1[i];
      for ( let j = 0; j < path2.length; j++ ) {
        const w2 = path2[j];
        if ( !(TokenDocument.arePositionsEqual(w1, w2) && (w1.unreachable === w2.unreachable)) ) {
          n1[j] = 0;
          d1[j] = -Infinity;
        } else {
          let n;
          let d;
          if ( (i === 0) || (j === 0) ) {
            n = n1[j] = 1;
            d = d1[j] = 0;
          } else {
            n = n1[j] = n0[j - 1] + 1;
            d = n1[j] = d0[j - 1] + path2[j].ray.distance;
          }
          if ( d > maxD ) {
            maxD = d;
            i0 = i - n + 1;
            j0 = j - n + 1;
          }
        }
      }
      [n0, n1] = [n1, n0];
      [d0, d1] = [d1, d0];
    }
    if ( maxD < 0 ) return 0;

    // Calculate shift, which is the difference in path length up to the start of the longest common subpath
    let o1 = 0;
    let o2 = 0;
    for ( let i = 1; i <= i0; i++ ) o1 += path1[i].ray.distance;
    for ( let j = 1; j <= j0; j++ ) o2 += path2[j].ray.distance;
    return o2 - o1;
  }

  /* -------------------------------------------- */

  /**
   * Animate the dash lines.
   * @param {number} deltaTime    The delta time
   */
  #tickDashLine(deltaTime) {
    const delta = this.#dashLineSpeed * deltaTime;
    const period = this.#dashLineDash + this.#dashLineGap;
    for ( const userId in this.#dashLines ) {
      const dashLine = this.#dashLines[userId];
      if ( !dashLine.animate ) continue;
      const baseOffset = dashLine.offset = (dashLine.offset + delta) % period;
      for ( const {shader, offset} of dashLine.shaders ) shader.uniforms.offset = offset + baseOffset;
    }
  }
}

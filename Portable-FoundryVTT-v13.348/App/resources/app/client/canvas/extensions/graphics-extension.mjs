/**
 * Extend PIXI.Graphics/SmoothGraphics with new methods AND replace PIXI.Graphics by SmoothGraphics.
 * The original PIXI.Graphics is put into PIXI.LegacyGraphics.
 */
export default function extendPIXIGraphics() {
  PIXI.LegacyGraphics = PIXI.Graphics;
  PIXI.Graphics = PIXI.smooth.SmoothGraphics;

  /**
   * Draws a path.
   * @param {number[]|PIXI.IPointData[]|PIXI.Polygon|...number|...PIXI.IPointData} path    The polygon or points.
   * @returns {PIXI.Graphics}    This Graphics instance.
   */
  PIXI.Graphics.prototype.drawPath = function(...path) {
    let closeStroke = false;
    let polygon = path[0];
    let points;
    if ( polygon.points ) {
      closeStroke = polygon.closeStroke;
      points = polygon.points;
    }
    else if ( Array.isArray(path[0]) ) {
      points = path[0];
    }
    else {
      points = path;
    }
    polygon = new PIXI.Polygon(points);
    polygon.closeStroke = closeStroke;
    return this.drawShape(polygon);
  };
  PIXI.LegacyGraphics.prototype.drawPath = PIXI.Graphics.prototype.drawPath;
  PIXI.smooth.SmoothGraphics.prototype.drawPath = PIXI.Graphics.prototype.drawPath;

  /* -------------------------------------------- */

  /**
   * Draws a smoothed polygon.
   * @param {number[]|PIXI.IPointData[]|PIXI.Polygon|...number|...PIXI.IPointData} path    The polygon or points.
   * @param {number} [smoothing=0]    The smoothness in the range [0, 1]. 0: no smoothing; 1: maximum smoothing.
   * @returns {PIXI.Graphics}         This Graphics instance.
   */
  PIXI.Graphics.prototype.drawSmoothedPolygon = function(...path) {
    let closeStroke = true;
    let polygon = path[0];
    let points;
    let factor;
    if ( polygon.points ) {
      closeStroke = polygon.closeStroke;
      points = polygon.points;
      factor = path[1];
    }
    else if ( Array.isArray(path[0]) ) {
      points = path[0];
      factor = path[1];
    }
    else if ( typeof path[0] === "number" ) {
      points = path;
      factor = path.length % 2 ? path.at(-1) : 0;
    }
    else {
      const n = path.length - (typeof path.at(-1) !== "object" ? 1 : 0);
      points = [];
      for ( let i = 0; i < n; i++ ) points.push(path[i].x, path[i].y);
      factor = path.at(n);
    }
    factor ??= 0;
    if ( (points.length < 6) || (factor <= 0) ) {
      polygon = new PIXI.Polygon(points.slice(0, points.length - (points.length % 2)));
      polygon.closeStroke = closeStroke;
      return this.drawShape(polygon);
    }
    const dedupedPoints = [points[0], points[1]];
    for ( let i = 2; i < points.length - 1; i += 2 ) {
      const x = points[i];
      const y = points[i + 1];
      if ( (x === points[i - 2]) && (y === points[i - 1]) ) continue;
      dedupedPoints.push(x, y);
    }
    points = dedupedPoints;
    if ( closeStroke && (points[0] === points.at(-2)) && (points[1] === points.at(-1)) ) points.length -= 2;
    if ( points.length < 6 ) {
      polygon = new PIXI.Polygon(points);
      polygon.closeStroke = closeStroke;
      return this.drawShape(polygon);
    }
    const getBezierControlPoints = (fromX, fromY, toX, toY, nextX, nextY) => {
      const vectorX = nextX - fromX;
      const vectorY = nextY - fromY;
      const preDistance = Math.hypot(toX - fromX, toY - fromY);
      const postDistance = Math.hypot(nextX - toX, nextY - toY);
      const totalDistance = preDistance + postDistance;
      const cp0d = 0.5 * factor * (preDistance / totalDistance);
      const cp1d = 0.5 * factor * (postDistance / totalDistance);
      return [
        toX - (vectorX * cp0d),
        toY - (vectorY * cp0d),
        toX + (vectorX * cp1d),
        toY + (vectorY * cp1d)
      ];
    };
    let [fromX, fromY, toX, toY] = points;
    let [cpX, cpY, cpXNext, cpYNext] = getBezierControlPoints(points.at(-2), points.at(-1), fromX, fromY, toX, toY);
    this.moveTo(fromX, fromY);
    for ( let i = 2, n = points.length + (closeStroke ? 2 : 0); i < n; i += 2 ) {
      const nextX = points[(i + 2) % points.length];
      const nextY = points[(i + 3) % points.length];
      cpX = cpXNext;
      cpY = cpYNext;
      let cpX2;
      let cpY2;
      [cpX2, cpY2, cpXNext, cpYNext] = getBezierControlPoints(fromX, fromY, toX, toY, nextX, nextY);
      if ( !closeStroke && (i === 2) ) this.quadraticCurveTo(cpX2, cpY2, toX, toY);
      else if ( !closeStroke && (i === points.length - 2) ) this.quadraticCurveTo(cpX, cpY, toX, toY);
      else this.bezierCurveTo(cpX, cpY, cpX2, cpY2, toX, toY);
      fromX = toX;
      fromY = toY;
      toX = nextX;
      toY = nextY;
    }
    if ( closeStroke ) this.closePath();
    this.finishPoly();
    return this;
  };
  PIXI.LegacyGraphics.prototype.drawSmoothedPolygon = PIXI.Graphics.prototype.drawSmoothedPolygon;
  PIXI.smooth.SmoothGraphics.prototype.drawSmoothedPolygon = PIXI.Graphics.prototype.drawSmoothedPolygon;

  /* -------------------------------------------- */

  /**
   * Draws a smoothed path.
   * @param {number[]|PIXI.IPointData[]|PIXI.Polygon|...number|...PIXI.IPointData} path    The polygon or points.
   * @param {number} [smoothing=0]    The smoothness in the range [0, 1]. 0: no smoothing; 1: maximum smoothing.
   */
  PIXI.Graphics.prototype.drawSmoothedPath = function(...path) {
    let closeStroke = false;
    let polygon = path[0];
    let points;
    let factor;
    if ( polygon.points ) {
      closeStroke = polygon.closeStroke;
      points = polygon.points;
      factor = path[1];
    }
    else if ( Array.isArray(path[0]) ) {
      points = path[0];
      factor = path[1];
    }
    else if ( typeof path[0] === "number" ) {
      points = path;
      factor = path.length % 2 ? path.at(-1) : 0;
    }
    else {
      const n = path.length - (typeof path.at(-1) !== "object" ? 1 : 0);
      points = [];
      for ( let i = 0; i < n; i++ ) points.push(path[i].x, path[i].y);
      factor = path.at(n);
    }
    polygon = new PIXI.Polygon(points);
    polygon.closeStroke = closeStroke;
    return this.drawSmoothedPolygon(polygon, factor);
  };
  PIXI.LegacyGraphics.prototype.drawSmoothedPath = PIXI.Graphics.prototype.drawSmoothedPath;
  PIXI.smooth.SmoothGraphics.prototype.drawSmoothedPath = PIXI.Graphics.prototype.drawSmoothedPath;
}

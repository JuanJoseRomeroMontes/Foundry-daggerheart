import BaseLightSource from "./base-light-source.mjs";
import PolygonMesher from "../geometry/shapes/polygon-mesher.mjs";
import PointSourcePolygon from "../geometry/shapes/source-polygon.mjs";

/**
 * A specialized subclass of the BaseLightSource which is used to render global light source linked to the scene.
 */
export default class GlobalLightSource extends BaseLightSource {

  /** @inheritDoc */
  static sourceType = "GlobalLight";

  /** @override */
  static effectsCollection = "lightSources";

  /** @inheritDoc */
  static defaultData = {
    ...super.defaultData,
    rotation: 0,
    angle: 360,
    attenuation: 0,
    priority: -Infinity,
    vision: false,
    walls: false,
    elevation: Infinity,
    darkness: {min: 0, max: 0}
  }

  /**
   * Name of this global light source.
   * @type {string}
   * @defaultValue GlobalLightSource.sourceType
   */
  name = this.constructor.sourceType;

  /**
   * A custom polygon placeholder.
   * @type {PIXI.Polygon|number[]|null}
   */
  customPolygon = null;

  /* -------------------------------------------- */
  /*  Global Light Source Initialization          */
  /* -------------------------------------------- */

  /** @override */
  _createShapes() {
    this.shape = this.customPolygon ?? canvas.dimensions.sceneRect.toPolygon();
  }

  /* -------------------------------------------- */

  /** @override */
  _initializeSoftEdges() {
    this._flags.renderSoftEdges = false;
  }

  /* -------------------------------------------- */

  /** @override */
  _updateGeometry() {
    const offset = this._flags.renderSoftEdges ? this.constructor.EDGE_OFFSET * (canvas.grid.size / 100) : 0;
    const pm = new PolygonMesher(this.shape, {offset});
    this._geometry = pm.triangulate(this._geometry);
    const bounds = this.shape instanceof PointSourcePolygon ? this.shape.bounds : this.shape.getBounds();
    if ( this._geometry.bounds ) this._geometry.bounds.copyFrom(bounds);
    else this._geometry.bounds = bounds;
  }


  /* -------------------------------------------- */

  /** @override */
  _updateCommonUniforms(shader) {
    super._updateCommonUniforms(shader);
    const {min, max} = this.data.darkness;
    const u = shader.uniforms;
    u.globalLight = true;
    u.globalLightThresholds[0] = min;
    u.globalLightThresholds[1] = max;
  }
}

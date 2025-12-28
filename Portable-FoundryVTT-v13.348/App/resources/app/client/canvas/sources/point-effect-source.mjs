import PointSourcePolygon from "../geometry/shapes/source-polygon.mjs";
import PolygonMesher from "../geometry/shapes/polygon-mesher.mjs";

/**
 * @import BaseEffectSource from "./base-effect-source.mjs"
 * @import {PointSourcePolygonConfig, ClockwiseSweepPolygonConfig} from "../_types.mjs"
 */

/**
 * @typedef PointEffectSourceData
 * @property {number} radius              The radius of the source
 * @property {number} externalRadius      A secondary radius used for limited angles
 * @property {number} rotation            The angle of rotation for this point source
 * @property {number} angle               The angle of emission for this point source
 * @property {boolean} walls              Whether or not the source is constrained by walls
 * @property {number} priority            Strength of this source to beat or not negative/positive sources
 */

/**
 * Provides a common framework for effect sources that emanate from a central point and extend within a specific radius.
 * This mixin can be used to manage any effect with a point-based origin, such as light, darkness, or other effects.
 * @template {class} T
 * @param {T} BaseSource  The base source class to extend
 */
export default function PointEffectSourceMixin(BaseSource) {
  /**
   * @extends {BaseEffectSource<BaseEffectSourceData & PointEffectSourceData, PointSourcePolygon>}
   * @abstract
   */
  return class PointEffectSource extends BaseSource {

    /** @inheritDoc */
    static defaultData = {
      ...super.defaultData,
      radius: 0,
      externalRadius: 0,
      rotation: 0,
      angle: 360,
      walls: true,
      priority: 0
    };

    /**
     * The Edge instances added by this source.
     * @type {Edge[]}
     */
    edges = [];

    /* -------------------------------------------- */

    /**
     * Whether this Point Effect source can create edges or not.
     * Overriding classes can define dynamic behavior if needed.
     * Default to false so that typical point sources do not create edges.
     * @type {boolean}
     */
    get requiresEdges() {
      return false;
    }

    /**
     * A convenience reference to the radius of the source.
     * @type {number}
     */
    get radius() {
      return this.data.radius ?? 0;
    }

    /**
     * The priority of this point effect source.
     * @type {number}
     */
    get priority() {
      return this.data.priority;
    }

    /**
     * The (elevated) origin of this point effect source.
     * @type {ElevatedPoint}
     */
    get origin() {
      return this.#origin;
    }

    #origin = Object.seal({
      x: 0,
      y: 0,
      elevation: 0
    });

    /* -------------------------------------------- */

    /** @inheritDoc */
    _configure(changes) {
      super._configure(changes);
      this._createEdges();
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    _initialize(data) {
      super._initialize(data);
      if ( this.data.radius > 0 ) this.data.radius = Math.max(this.data.radius, this.data.externalRadius);
      this.#origin.x = this.data.x;
      this.#origin.y = this.data.y;
      this.#origin.elevation = this.data.elevation;
    }

    /* -------------------------------------------- */
    /*  Point Source Geometry Methods               */
    /* -------------------------------------------- */

    /** @inheritDoc */
    _initializeSoftEdges() {
      super._initializeSoftEdges();
      const isCircle = (this.shape instanceof PointSourcePolygon) && this.shape.isCompleteCircle();
      this._flags.renderSoftEdges &&= !isCircle;
    }

    /* -------------------------------------------- */

    /**
     * Configure the parameters of the polygon that is generated for this source.
     * @returns {PointSourcePolygonConfig & ClockwiseSweepPolygonConfig}
     * @protected
     */
    _getPolygonConfiguration() {
      return {
        type: this.constructor.sourceType,
        edgeOptions: {
          wall: this.data.walls
        },
        radius: (this.data.disabled || this.suppressed) ? 0 : this.radius,
        externalRadius: this.data.externalRadius,
        angle: this.data.angle,
        rotation: this.data.rotation,
        priority: this.data.priority,
        source: this
      };
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    _createShapes() {
      this._deleteEdges();
      const config = this._getPolygonConfiguration();
      const polygonClass = CONFIG.Canvas.polygonBackends[this.constructor.sourceType];
      this.shape = polygonClass.create(this.origin, config);
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    _destroy() {
      this._deleteEdges();
      super._destroy();
    }

    /* -------------------------------------------- */
    /*  Rendering methods                           */
    /* -------------------------------------------- */

    /** @override */
    _drawMesh(layerId) {
      const mesh = super._drawMesh(layerId);
      if ( mesh ) mesh.scale.set(this.shape.config.radius);
      return mesh;
    }

    /** @override */
    _updateGeometry() {
      const {x, y} = this.shape.origin;
      const radius = this.shape.config.radius;
      const offset = this._flags.renderSoftEdges ? this.constructor.EDGE_OFFSET * (canvas.grid.size / 100) : 0;
      const pm = new PolygonMesher(this.shape, {x, y, radius, normalize: true, offset});
      this._geometry = pm.triangulate(this._geometry);
      const bounds = new PIXI.Rectangle(0, 0, 0, 0);
      if ( radius > 0 ) {
        const b = this.shape instanceof PointSourcePolygon ? this.shape.bounds : this.shape.getBounds();
        bounds.x = (b.x - x) / radius;
        bounds.y = (b.y - y) / radius;
        bounds.width = b.width / radius;
        bounds.height = b.height / radius;
      }
      if ( this._geometry.bounds ) this._geometry.bounds.copyFrom(bounds);
      else this._geometry.bounds = bounds;
    }

    /* -------------------------------------------- */
    /*  Edge Management                             */
    /* -------------------------------------------- */

    /**
     * Create the Edge instances that correspond to this source.
     * @protected
     */
    _createEdges() {
      if ( !this.requiresEdges || !this.active || this.isPreview ) return;
      const cls = foundry.canvas.geometry.edges.Edge;
      const block = CONST.WALL_SENSE_TYPES.NORMAL;
      const direction = CONST.WALL_DIRECTIONS.LEFT;
      const points = [...this.shape.points];

      // Prepare iteration
      let p0 = {x: points[0], y: points[1]};
      points.push(p0.x, p0.y);
      let p1;

      // Build edges from polygon points
      for ( let i = 2; i < points.length; i += 2 ) {
        p1 = {x: points[i], y: points[i + 1]};
        const id = `${this.constructor.sourceType}.${this.sourceId}.${i / 2}`;
        const edge = new cls(p0, p1, {
          type: this.constructor.sourceType,
          id,
          object: this.object,
          direction,
          light: block,
          sight: block,
          priority: this.data.priority
        });
        this.edges.push(edge);
        canvas.edges.set(edge.id, edge);
        p0 = p1;
      }
    }

    /* -------------------------------------------- */

    /**
     * Remove edges from the active Edges collection.
     * @protected
     */
    _deleteEdges() {
      for ( const edge of this.edges ) canvas.edges.delete(edge.id);
      this.edges.length = 0;
    }
  };
}


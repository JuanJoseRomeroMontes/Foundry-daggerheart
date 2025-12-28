import BaseLightSource from "./base-light-source.mjs";
import PointEffectSourceMixin from "./point-effect-source.mjs";
import PointSourcePolygon from "../geometry/shapes/source-polygon.mjs";
import PolygonMesher from "../geometry/shapes/polygon-mesher.mjs";
import {LIGHTING_LEVELS} from "../../../common/constants.mjs";
import AdaptiveDarknessShader from "../rendering/shaders/lighting/darkness-lighting.mjs";

/**
 * A specialized subclass of the BaseLightSource which renders a source of darkness as a point-based effect.
 * @extends {BaseLightSource}
 * @mixes PointEffectSource
 */
export default class PointDarknessSource extends PointEffectSourceMixin(BaseLightSource) {

  /** @override */
  static sourceType = "darkness";

  /** @override */
  static effectsCollection = "darknessSources";

  /** @override */
  static _dimLightingLevel = LIGHTING_LEVELS.HALFDARK;

  /** @override */
  static _brightLightingLevel = LIGHTING_LEVELS.DARKNESS;

  /** @override */
  static get ANIMATIONS() {
    return CONFIG.Canvas.darknessAnimations;
  }

  /** @override */
  static get _layers() {
    return {
      darkness: {
        defaultShader: AdaptiveDarknessShader,
        blendMode: "MAX_COLOR"
      }
    };
  }

  /**
   * The optional geometric shape is solely utilized for visual representation regarding darkness sources.
   * Used only when an additional radius is added for visuals.
   * @type {SourceShape}
   * @protected
   */
  _visualShape;

  /**
   * Padding applied on the darkness source shape for visual appearance only.
   * Note: for now, padding is increased radius. It might evolve in a future release.
   * @type {number}
   * @protected
   */
  _padding = (CONFIG.Canvas.darknessSourcePaddingMultiplier ?? 0) * canvas.grid.size;

  /**
   * The normalized border distance.
   * @type {number}
   */
  #borderDistance = 0;

  /* -------------------------------------------- */
  /*  Darkness Source Properties                  */
  /* -------------------------------------------- */

  /** @override */
  get requiresEdges() {
    return true;
  }

  /**
   * A convenience accessor to the darkness layer mesh.
   * @type {PointSourceMesh}
   */
  get darkness() {
    return this.layers.darkness.mesh;
  }

  /* -------------------------------------------- */
  /*  Source Suppression Management               */
  /* -------------------------------------------- */

  /**
   * Update light suppression according to light sources collection.
   */
  #updateLightSuppression() {
    const condition = lightSource => this.priority < lightSource.priority;
    this.suppression.light = canvas.effects.testInsideLight(this.origin, {condition});
  }

  /* -------------------------------------------- */
  /*  Visibility Testing                          */
  /* -------------------------------------------- */

  /** @override */
  testPoint(point) {
    const shape = this.shape;
    if ( !shape ) return false;
    const {x, y} = point;
    for ( let dx = -1; dx <= 1; dx += 1 ) {
      for ( let dy = -1; dy <= 1; dy += 1 ) {
        if ( shape.contains(x + dx, y + dy) ) return true;
      }
    }
    return false;
  }

  /* -------------------------------------------- */
  /*  Source Initialization and Management        */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _initialize(data) {
    super._initialize(data);
    this.data.radius = this.data.bright = this.data.dim = Math.max(this.data.dim ?? 0, this.data.bright ?? 0);
    this.#borderDistance = Number.isFinite(this.radius) ? this.radius / (this.radius + this._padding) : 1;
  }

  /* -------------------------------------------- */


  /** @override */
  _createShapes() {
    this._deleteEdges();
    this.#updateLightSuppression();
    const config = this._getPolygonConfiguration();
    const polygonClass = CONFIG.Canvas.polygonBackends[this.constructor.sourceType];

    // Create shapes based on padding
    if ( this.radius < config.radius ) {
      this._visualShape = polygonClass.create(this.origin, config);
      this.shape = this.#createShapeFromVisualShape(this.radius);
    }
    else {
      this._visualShape = null;
      this.shape = polygonClass.create(this.origin, config);
    }
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _getPolygonConfiguration() {
    return Object.assign(super._getPolygonConfiguration(), {
      useThreshold: true,
      radius: (this.data.disabled || this.suppressed) ? 0 : this.radius + this._padding
    });
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _drawMesh(layerId) {
    const mesh = super._drawMesh(layerId);
    if ( mesh ) mesh.scale.set((this._visualShape ?? this.shape).config.radius);
    return mesh;
  }

  /* -------------------------------------------- */

  /** @override */
  _updateGeometry() {
    const shape = this._visualShape ?? this.shape;
    const {x, y} = shape.origin;
    const radius = shape.config.radius;
    const offset = this._flags.renderSoftEdges ? this.constructor.EDGE_OFFSET * (canvas.grid.size / 100) : 0;
    const pm = new PolygonMesher(shape, {x, y, radius, normalize: true, offset});
    this._geometry = pm.triangulate(this._geometry);
    const bounds = new PIXI.Rectangle(0, 0, 0, 0);
    if ( radius > 0 ) {
      const b = shape instanceof PointSourcePolygon ? shape.bounds : shape.getBounds();
      bounds.x = (b.x - x) / radius;
      bounds.y = (b.y - y) / radius;
      bounds.width = b.width / radius;
      bounds.height = b.height / radius;
    }
    if ( this._geometry.bounds ) this._geometry.bounds.copyFrom(bounds);
    else this._geometry.bounds = bounds;
  }

  /* -------------------------------------------- */

  /**
   * Create a radius constrained polygon from the visual shape polygon.
   * If the visual shape is not created, no polygon is created.
   * @param {number} radius           The radius to constraint to.
   * @returns {PointSourcePolygon} The new polygon or null if no visual shape is present.
   */
  #createShapeFromVisualShape(radius) {
    if ( !this._visualShape ) return null;
    const {x, y} = this.data;
    const circle = new PIXI.Circle(x, y, radius);
    return this._visualShape.applyConstraint(circle);
  }

  /* -------------------------------------------- */
  /*  Shader Management                           */
  /* -------------------------------------------- */

  /**
   * Update the uniforms of the shader on the darkness layer.
   * @protected
   */
  _updateDarknessUniforms() {
    const u = this.layers.darkness.shader?.uniforms;
    if ( !u ) return;
    u.color = this.colorRGB ?? this.layers.darkness.shader.constructor.defaultUniforms.color;
    u.enableVisionMasking = canvas.scene.tokenVision && (canvas.effects.visionSources.some(s => s.active) || !game.user.isGM);
    u.borderDistance = this.#borderDistance;
    u.colorationAlpha = this.data.alpha * 2;

    // Passing screenDimensions to use screen size render textures
    u.screenDimensions = canvas.screenDimensions;
    if ( !u.depthTexture ) u.depthTexture = canvas.masks.depth.renderTexture;
    if ( !u.primaryTexture ) u.primaryTexture = canvas.primary.renderTexture;
    if ( !u.visionTexture ) u.visionTexture = canvas.masks.vision.renderTexture;

    // Flag uniforms as updated
    this.layers.darkness.reset = false;
  }

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  get isDarkness() {
    const msg = "BaseLightSource#isDarkness is now obsolete. Use DarknessSource instead.";
    foundry.utils.logCompatibilityWarning(msg, { since: 12, until: 14});
    return true;
  }
}

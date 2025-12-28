import CanvasLayer from "../base/canvas-layer.mjs";
import SpriteMesh from "../../containers/elements/sprite-mesh.mjs";
import PointSourceMesh from "../../containers/elements/point-source-mesh.mjs";
import CachedContainer from "../../containers/advanced/cached-container.mjs";
import BaselineIlluminationSamplerShader from "../../rendering/shaders/samplers/baseline-illumination.mjs";

/**
 * A CanvasLayer for displaying illumination visual effects
 * @category Canvas
 */
export default class CanvasIlluminationEffects extends CanvasLayer {
  constructor() {
    super();
    this.#initialize();
  }

  /**
   * The filter used to mask visual effects on this layer
   * @type {VisualEffectsMaskingFilter}
   */
  filter;

  /**
   * The container holding the lights.
   * @type {PIXI.Container}
   */
  lights = new PIXI.Container();

  /**
   * The base line mesh.
   * @type {SpriteMesh}
   */
  baselineMesh = new SpriteMesh();

  /**
   * The cached container holding the illumination meshes.
   * @type {CachedContainer}
   */
  darknessLevelMeshes = new DarknessLevelContainer();

  /* -------------------------------------------- */

  /**
   * To know if dynamic darkness level is active on this scene.
   * @returns {boolean}
   */
  get hasDynamicDarknessLevel() {
    return this.darknessLevelMeshes.children.length > 0;
  }

  /**
   * The illumination render texture.
   * @returns {PIXI.RenderTexture}
   */
  get renderTexture() {
    return this.darknessLevelMeshes.renderTexture;
  }

  /* -------------------------------------------- */

  /**
   * Initialize the layer.
   */
  #initialize() {

    // Configure the base line mesh
    this.baselineMesh.setShaderClass(BaselineIlluminationSamplerShader);
    this.baselineMesh.texture = this.darknessLevelMeshes.renderTexture;

    // Add children
    canvas.masks.addChild(this.darknessLevelMeshes);               // Region meshes cached container
    this.addChild(this.lights);                                    // Light and vision illumination

    // Add baseline rendering for light
    const originalRender = this.lights.render;
    const baseMesh = this.baselineMesh;
    this.lights.render = renderer => {
      baseMesh.render(renderer);
      originalRender.call(this.lights, renderer);
    };

    // Configure
    this.lights.sortableChildren = true;
  }

  /* -------------------------------------------- */

  /**
   * Clear illumination effects container
   */
  clear() {
    this.lights.removeChildren();
  }

  /* -------------------------------------------- */

  /**
   * Invalidate the cached container state to trigger a render pass.
   * @param {boolean} [force=false] Force cached container invalidation?
   */
  invalidateDarknessLevelContainer(force=false) {
    // If global light is enabled, the darkness level texture is affecting the vision mask
    if ( canvas.environment.globalLightSource.active ) canvas.masks.vision.renderDirty = true;
    if ( !(this.hasDynamicDarknessLevel || force) ) return;
    this.darknessLevelMeshes.renderDirty = true;
    // Sort by adjusted darkness level in descending order such that the final darkness level
    // at a point is the minimum of the adjusted darkness levels
    const compare = (a, b) => b.shader.darknessLevel - a.shader.darknessLevel;
    this.darknessLevelMeshes.children.sort(compare);
    canvas.visibility.vision.light.global.meshes.children.sort(compare);
  }

  /* -------------------------------------------- */

  /** @override */
  async _draw(options) {
    const maskingFilter = CONFIG.Canvas.visualEffectsMaskingFilter;
    this.darknessLevel = canvas.darknessLevel;
    this.filter = maskingFilter.create({
      visionTexture: canvas.masks.vision.renderTexture,
      darknessLevelTexture: canvas.effects.illumination.renderTexture,
      mode: maskingFilter.FILTER_MODES.ILLUMINATION
    });
    this.filter.blendMode = PIXI.BLEND_MODES.MULTIPLY;
    this.filterArea = canvas.app.renderer.screen;
    this.filters = [this.filter];
    canvas.effects.visualEffectsMaskingFilters.add(this.filter);
  }

  /* -------------------------------------------- */

  /** @override */
  async _tearDown(options) {
    canvas.effects.visualEffectsMaskingFilters.delete(this.filter);
    this.clear();
  }

  /* -------------------------------------------- */
  /*  Deprecations                                */
  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  background() {
    const msg = "CanvasIlluminationEffects#background is now obsolete.";
    foundry.utils.logCompatibilityWarning(msg, {since: 12, until: 14});
    return null;
  }

  /**
   * @deprecated since v12
   * @ignore
   */
  get globalLight() {
    const msg = "CanvasIlluminationEffects#globalLight has been deprecated without replacement. Check the" +
      "canvas.environment.globalLightSource.active instead.";
    foundry.utils.logCompatibilityWarning(msg, {since: 12, until: 14});
    return canvas.environment.globalLightSource.active;
  }
}

/**
 * Cached container used for dynamic darkness level. Display objects (of any type) added to this cached container will
 * contribute to computing the darkness level of the masked area. Only the red channel is utilized, which corresponds
 * to the desired darkness level. Other channels are ignored.
 */
export class DarknessLevelContainer extends CachedContainer {
  constructor(...args) {
    super(...args);
    this.autoRender = false;
    this.on("childAdded", this.#onChildChange);
    this.on("childRemoved", this.#onChildChange);
  }

  /** @override */
  static textureConfiguration = {
    scaleMode: PIXI.SCALE_MODES.NEAREST,
    format: PIXI.FORMATS.RED,
    multisample: PIXI.MSAA_QUALITY.NONE,
    mipmap: PIXI.MIPMAP_MODES.OFF
  };

  /**
   * Called when a display object is added or removed from this container.
   */
  #onChildChange() {
    this.autoRender = this.children.length > 0;
    this.renderDirty = true;
    canvas.perception.update({refreshVisionSources: true, refreshLightSources: true});
  }
}


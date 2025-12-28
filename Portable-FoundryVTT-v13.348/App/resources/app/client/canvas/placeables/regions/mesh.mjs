import AbstractBaseShader from "../../rendering/shaders/base-shader.mjs";
import RegionShader from "../../rendering/shaders/region/base.mjs";

/**
 * @import {Point} from "@common/_types.mjs";
 * @import Region from "../region.mjs";
 */

/**
 * A mesh of a {@link foundry.canvas.placeables.Region}.
 */
export default class RegionMesh extends PIXI.Container {

  /**
   * Create a RegionMesh.
   * @param {Region} region                       The Region to create the RegionMesh from.
   * @param {AbstractBaseShader} [shaderClass]    The shader class to use.
   */
  constructor(region, shaderClass=RegionShader) {
    super();
    this.#region = region;
    this.region.geometry.refCount++;
    if ( !AbstractBaseShader.isPrototypeOf(shaderClass) ) {
      throw new Error("RegionMesh shader class must inherit from AbstractBaseShader.");
    }
    this.#shader = shaderClass.create();
  }

  /* ---------------------------------------- */

  /**
   * Shared point instance.
   * @type {PIXI.Point}
   */
  static #SHARED_POINT = new PIXI.Point();

  /* ---------------------------------------- */

  /**
   * The Region of this RegionMesh.
   * @type {RegionMesh}
   */
  get region() {
    return this.#region;
  }

  #region;

  /* ---------------------------------------- */

  /**
   * The shader bound to this RegionMesh.
   * @type {AbstractBaseShader}
   */
  get shader() {
    return this.#shader;
  }

  #shader;

  /* ---------------------------------------- */

  /**
   * The blend mode assigned to this RegionMesh.
   * @type {PIXI.BLEND_MODES}
   */
  get blendMode() {
    return this.#state.blendMode;
  }

  set blendMode(value) {
    if ( this.#state.blendMode === value ) return;
    this.#state.blendMode = value;
    this._tintAlphaDirty = true;
  }

  #state = PIXI.State.for2d();

  /* ---------------------------------------- */

  /**
   * The tint applied to the mesh. This is a hex value.
   *
   * A value of 0xFFFFFF will remove any tint effect.
   * @type {number}
   * @defaultValue 0xFFFFFF
   */
  get tint() {
    return this._tintColor.value;
  }

  set tint(tint) {
    const currentTint = this._tintColor.value;
    this._tintColor.setValue(tint);
    if ( currentTint === this._tintColor.value ) return;
    this._tintAlphaDirty = true;
  }

  /* ---------------------------------------- */

  /**
   * The tint applied to the mesh. This is a hex value. A value of 0xFFFFFF will remove any tint effect.
   * @type {PIXI.Color}
   * @protected
   */
  _tintColor = new PIXI.Color(0xFFFFFF);

  /* ---------------------------------------- */

  /**
   * Cached tint value for the shader uniforms.
   * @type {[red: number, green: number, blue: number, alpha: number]}
   * @protected
   */
  _cachedTint = [1, 1, 1, 1];

  /* ---------------------------------------- */

  /**
   * Used to track a tint or alpha change to execute a recomputation of _cachedTint.
   * @type {boolean}
   * @protected
   */
  _tintAlphaDirty = true;

  /* ---------------------------------------- */

  /**
   * Initialize shader based on the shader class type.
   * @param {typeof AbstractBaseShader} shaderClass The shader class, which must inherit from AbstractBaseShader.
   */
  setShaderClass(shaderClass) {
    if ( !AbstractBaseShader.isPrototypeOf(shaderClass) ) {
      throw new Error("RegionMesh shader class must inherit from AbstractBaseShader.");
    }
    if ( this.#shader.constructor === shaderClass ) return;

    // Create shader program
    this.#shader = shaderClass.create();
  }

  /* ---------------------------------------- */

  /** @override */
  updateTransform() {
    super.updateTransform();

    // We set tintAlphaDirty to true if the worldAlpha has changed
    // It is needed to recompute the _cachedTint vec4 which is a combination of tint and alpha
    if ( this.#worldAlpha !== this.worldAlpha ) {
      this.#worldAlpha = this.worldAlpha;
      this._tintAlphaDirty = true;
    }
  }

  #worldAlpha;

  /* ---------------------------------------- */

  /** @override */
  _render(renderer) {
    if ( this._tintAlphaDirty ) {
      const premultiply = PIXI.utils.premultiplyBlendMode[1][this.blendMode] === this.blendMode;
      PIXI.Color.shared.setValue(this._tintColor)
        .premultiply(this.worldAlpha, premultiply)
        .toArray(this._cachedTint);
      this._tintAlphaDirty = false;
    }
    this.#shader._preRender(this, renderer);
    this.#shader.uniforms.translationMatrix = this.transform.worldTransform.toArray(true);

    // Flush batch renderer
    renderer.batch.flush();

    // Set state
    renderer.state.set(this.#state);

    // Bind shader and geometry
    renderer.shader.bind(this.#shader);
    const geometry = this.region.geometry;
    geometry._updateBuffers();
    renderer.geometry.bind(geometry, this.#shader);

    // Draw the geometry
    renderer.geometry.draw(PIXI.DRAW_MODES.TRIANGLES);
  }

  /* ---------------------------------------- */

  /** @override */
  _calculateBounds() {
    const {left, top, right, bottom} = this.region.bounds;
    this._bounds.addFrame(this.transform, left, top, right, bottom);
  }

  /* ---------------------------------------- */

  /**
   * Tests if a point is inside this RegionMesh.
   * @param {Point} point
   * @returns {boolean}
   */
  containsPoint(point) {
    return this.region.document.polygonTree.testPoint(
      this.worldTransform.applyInverse(point, RegionMesh.#SHARED_POINT));
  }

  /* ---------------------------------------- */

  /** @override */
  destroy(options) {
    super.destroy(options);
    const geometry = this.region.geometry;
    geometry.refCount--;
    if ( geometry.refCount === 0 ) geometry.dispose();
    this.#shader = null;
    this.#state = null;
  }
}

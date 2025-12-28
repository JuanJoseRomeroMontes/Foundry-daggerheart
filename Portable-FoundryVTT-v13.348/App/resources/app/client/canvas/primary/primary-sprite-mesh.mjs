import SpriteMesh from "../containers/elements/sprite-mesh.mjs";
import PrimaryOccludableObjectMixin from "./primary-occludable-object.mjs";
import TextureLoader from "../loader.mjs";
import PrimaryBaseSamplerShader from "../rendering/shaders/samplers/primary/primary.mjs";

/**
 * @typedef PrimarySpriteMeshConstructorOptions
 * @property {PIXI.Texture} [options.texture]                 Texture passed to the SpriteMesh.
 * @property {string|null} [options.name]                     The name of this sprite.
 * @property {*} [options.object]                             Any object that owns this sprite.
 * @param {typeof PrimaryBaseSamplerShader} [options.shaderClass] The shader class used to render this sprite
 */

/**
 * A basic PCO sprite mesh which is handling occlusion and depth.
 * @extends {SpriteMesh}
 * @mixes PrimaryOccludableObjectMixin
 * @mixes PrimaryCanvasObjectMixin
 * @property {PrimaryBaseSamplerShader} shader             The shader bound to this mesh.
 */
export default class PrimarySpriteMesh extends PrimaryOccludableObjectMixin(SpriteMesh) {
  /**
   * @param {PrimarySpriteMeshConstructorOptions|PIXI.Texture} [options]    Constructor options or a Texture
   * @param {typeof PrimaryBaseSamplerShader} shaderClass                   A shader class for the sprite
   */
  constructor(options, shaderClass) {
    let texture;
    if ( options instanceof PIXI.Texture ) {
      texture = options;
      options = {};
    } else if ( options instanceof Object ) {
      texture = options.texture;
      shaderClass = options.shaderClass;
    } else {
      options = {};
    }
    shaderClass ??= PrimaryBaseSamplerShader;
    if ( !foundry.utils.isSubclass(shaderClass, PrimaryBaseSamplerShader) ) {
      throw new Error(`${shaderClass.name} in not a subclass of PrimaryBaseSamplerShader`);
    }
    super(texture, shaderClass);
    this.name = options.name ?? null;
    this.object = options.object ?? null;
  }

  /* -------------------------------------------- */

  /**
   * A temporary point used by this class.
   * @type {PIXI.Point}
   */
  static #TEMP_POINT = new PIXI.Point();

  /* -------------------------------------------- */

  /**
   * The texture alpha data.
   * @type {TextureAlphaData|null}
   * @protected
   */
  _textureAlphaData = null;

  /* -------------------------------------------- */

  /**
   * The texture alpha threshold used for point containment tests.
   * If set to a value larger than 0, the texture alpha data is
   * extracted from the texture at 25% resolution.
   * @type {number}
   */
  textureAlphaThreshold = 0;

  /* -------------------------------------------- */
  /*  PIXI Events                                 */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _onTextureUpdate() {
    super._onTextureUpdate();
    this._textureAlphaData = null;
    this._canvasBoundsID++;
  }

  /* -------------------------------------------- */
  /*  Helper Methods                              */
  /* -------------------------------------------- */

  /** @inheritdoc */
  setShaderClass(shaderClass) {
    if ( !foundry.utils.isSubclass(shaderClass, PrimaryBaseSamplerShader) ) {
      throw new Error(`${shaderClass.name} in not a subclass of PrimaryBaseSamplerShader`);
    }
    super.setShaderClass(shaderClass);
  }

  /* -------------------------------------------- */

  /**
   * An all-in-one helper method: Resizing the PCO according to desired dimensions and options.
   * This helper computes the width and height based on the following factors:
   *
   * - The ratio of texture width and base width.
   * - The ratio of texture height and base height.
   *
   * Additionally, It takes into account the desired fit options:
   *
   * - (default) "fill" computes the exact width and height ratio.
   * - "cover" takes the maximum ratio of width and height and applies it to both.
   * - "contain" takes the minimum ratio of width and height and applies it to both.
   * - "width" applies the width ratio to both width and height.
   * - "height" applies the height ratio to both width and height.
   *
   * You can also apply optional scaleX and scaleY options to both width and height. The scale is applied after fitting.
   *
   * **Important**: By using this helper, you don't need to set the height, width, and scale properties of the DisplayObject.
   *
   * **Note**: This is a helper method. Alternatively, you could assign properties as you would with a PIXI DisplayObject.
   *
   * @param {number} baseWidth             The base width used for computations.
   * @param {number} baseHeight            The base height used for computations.
   * @param {object} [options]             The options.
   * @param {"fill"|"cover"|"contain"|"width"|"height"} [options.fit="fill"]  The fit type.
   * @param {number} [options.scaleX=1]    The scale on X axis.
   * @param {number} [options.scaleY=1]    The scale on Y axis.
   */
  resize(baseWidth, baseHeight, {fit="fill", scaleX=1, scaleY=1}={}) {
    if ( !((baseWidth >= 0) && (baseHeight >= 0)) ) {
      throw new Error(`Invalid baseWidth/baseHeight passed to ${this.constructor.name}#resize.`);
    }
    const {width: textureWidth, height: textureHeight} = this._texture;
    let sx;
    let sy;
    switch ( fit ) {
      case "fill":
        sx = baseWidth / textureWidth;
        sy = baseHeight / textureHeight;
        break;
      case "cover":
        sx = sy = Math.max(baseWidth / textureWidth, baseHeight / textureHeight);
        break;
      case "contain":
        sx = sy = Math.min(baseWidth / textureWidth, baseHeight / textureHeight);
        break;
      case "width":
        sx = sy = baseWidth / textureWidth;
        break;
      case "height":
        sx = sy = baseHeight / textureHeight;
        break;
      default:
        throw new Error(`Invalid fill type passed to ${this.constructor.name}#resize (fit=${fit}).`);
    }
    sx *= scaleX;
    sy *= scaleY;
    this.scale.set(sx, sy);
    this._width = Math.abs(sx * textureWidth);
    this._height = Math.abs(sy * textureHeight);
  }

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /** @inheritdoc */
  _updateBatchData() {
    super._updateBatchData();
    const batchData = this._batchData;
    batchData.elevation = this.elevation;
    batchData.textureAlphaThreshold = this.textureAlphaThreshold;
    batchData.unoccludedAlpha = this.unoccludedAlpha;
    batchData.occludedAlpha = this.occludedAlpha;
    const occlusionState = this._occlusionState;
    batchData.fadeOcclusion = occlusionState.fade;
    batchData.radialOcclusion = occlusionState.radial;
    batchData.visionOcclusion = occlusionState.vision;
    batchData.restrictionState = this._restrictionState;
  }

  /* -------------------------------------------- */

  /** @override */
  _calculateCanvasBounds() {
    if ( !this._texture ) return;
    const {width, height} = this._texture;
    let minX = 0;
    let minY = 0;
    let maxX = width;
    let maxY = height;
    const alphaData = this._textureAlphaData;
    if ( alphaData ) {
      const scaleX = width / alphaData.width;
      const scaleY = height / alphaData.height;
      minX = alphaData.minX * scaleX;
      minY = alphaData.minY * scaleY;
      maxX = alphaData.maxX * scaleX;
      maxY = alphaData.maxY * scaleY;
    }
    let {x: anchorX, y: anchorY} = this.anchor;
    anchorX *= width;
    anchorY *= height;
    minX -= anchorX;
    minY -= anchorY;
    maxX -= anchorX;
    maxY -= anchorY;
    this._canvasBounds.addFrameMatrix(this.canvasTransform, minX, minY, maxX, maxY);
  }

  /* -------------------------------------------- */

  /**
   * Is the given point in canvas space contained in this object?
   * @param {PIXI.IPointData} point             The point in canvas space
   * @param {number} [textureAlphaThreshold]    The minimum texture alpha required for containment
   * @returns {boolean}
   */
  containsCanvasPoint(point, textureAlphaThreshold=this.textureAlphaThreshold) {
    if ( textureAlphaThreshold > 1 ) return false;
    if ( !this.canvasBounds.contains(point.x, point.y) ) return false;
    point = this.canvasTransform.applyInverse(point, PrimarySpriteMesh.#TEMP_POINT);
    return this.#containsLocalPoint(point, textureAlphaThreshold);
  }

  /* -------------------------------------------- */

  /**
   * Is the given point in world space contained in this object?
   * @param {PIXI.IPointData} point             The point in world space
   * @param {number} [textureAlphaThreshold]    The minimum texture alpha required for containment
   * @returns {boolean}
   */
  containsPoint(point, textureAlphaThreshold=this.textureAlphaThreshold) {
    if ( textureAlphaThreshold > 1 ) return false;
    point = this.worldTransform.applyInverse(point, PrimarySpriteMesh.#TEMP_POINT);
    return this.#containsLocalPoint(point, textureAlphaThreshold);
  }

  /* -------------------------------------------- */

  /**
   * Is the given point in local space contained in this object?
   * @param {PIXI.IPointData} point           The point in local space
   * @param {number} textureAlphaThreshold    The minimum texture alpha required for containment
   * @returns {boolean}
   */
  #containsLocalPoint(point, textureAlphaThreshold) {
    const {width, height} = this._texture;
    const {x: anchorX, y: anchorY} = this.anchor;
    let {x, y} = point;
    x += (width * anchorX);
    y += (height * anchorY);
    if ( textureAlphaThreshold > 0 ) return this.#getTextureAlpha(x, y) >= textureAlphaThreshold;
    return (x >= 0) && (x < width) && (y >= 0) && (y < height);
  }

  /* -------------------------------------------- */

  /**
   * Get alpha value of texture at the given texture coordinates.
   * @param {number} x    The x-coordinate
   * @param {number} y    The y-coordinate
   * @returns {number}    The alpha value (0-1)
   */
  #getTextureAlpha(x, y) {
    if ( !this._texture ) return 0;
    if ( !this._textureAlphaData ) {
      this._textureAlphaData = TextureLoader.getTextureAlphaData(this._texture, 0.25);
      this._canvasBoundsID++;
    }

    // Transform the texture coordinates
    const {width, height} = this._texture;
    const alphaData = this._textureAlphaData;
    x *= (alphaData.width / width);
    y *= (alphaData.height / height);

    // First test against the bounding box
    const {minX, minY, maxX, maxY} = alphaData;
    if ( (x < minX) || (x >= maxX) || (y < minY) || (y >= maxY) ) return 0;

    // Get the alpha at the local coordinates
    return alphaData.data[((maxX - minX) * ((y | 0) - minY)) + ((x | 0) - minX)] / 255;
  }

  /* -------------------------------------------- */
  /*  Rendering Methods                           */
  /* -------------------------------------------- */

  /** @override */
  renderDepthData(renderer) {
    if ( !this.shouldRenderDepth || !this.visible || !this.renderable ) return;
    const shader = this._shader;
    const blendMode = this.blendMode;
    this.blendMode = PIXI.BLEND_MODES.MAX_COLOR;
    this._shader = shader.depthShader;
    if ( this.cullable ) this._renderWithCulling(renderer);
    else this._render(renderer);
    this._shader = shader;
    this.blendMode = blendMode;
  }

  /* -------------------------------------------- */

  /**
   * Render the sprite with ERASE blending.
   * Note: The sprite must not have visible/renderable children.
   * @param {PIXI.Renderer} renderer    The renderer
   * @internal
   */
  _renderVoid(renderer) {
    if ( !this.visible || (this.worldAlpha <= 0) || !this.renderable ) return;

    // Delegate to PrimarySpriteMesh#renderVoidAdvanced if the sprite has filter or mask
    if ( this._mask || this.filters?.length ) this.#renderVoidAdvanced(renderer);
    else {

      // Set the blend mode to ERASE before rendering
      const originalBlendMode = this.blendMode;
      this.blendMode = PIXI.BLEND_MODES.ERASE;

      // Render the sprite but not its children
      if ( this.cullable ) this._renderWithCulling(renderer);
      else this._render(renderer);

      // Restore the original blend mode after rendering
      this.blendMode = originalBlendMode;
    }
  }

  /* -------------------------------------------- */

  /**
   * Render the sprite that has a filter or a mask with ERASE blending.
   * Note: The sprite must not have visible/renderable children.
   * @param {PIXI.Renderer} renderer    The renderer
   */
  #renderVoidAdvanced(renderer) {

    // Same code as in PIXI.Container#renderAdvanced
    const filters = this.filters;
    const mask = this._mask;
    if ( filters ) {
      this._enabledFilters ||= [];
      this._enabledFilters.length = 0;
      for ( let i = 0; i < filters.length; i++ ) {
        if ( filters[i].enabled ) this._enabledFilters.push(filters[i]);
      }
    }
    const flush = (filters && this._enabledFilters.length) || (mask && (!mask.isMaskData
        || (mask.enabled && (mask.autoDetect || mask.type !== PIXI.MASK_TYPES.NONE))));
    if ( flush ) renderer.batch.flush();
    if ( filters && this._enabledFilters.length ) renderer.filter.push(this, this._enabledFilters);
    if ( mask ) renderer.mask.push(this, mask);

    // Set the blend mode to ERASE before rendering
    let filter;
    let originalBlendMode;
    const filterState = renderer.filter.defaultFilterStack.at(-1);
    if ( filterState.target === this ) {
      filter = filterState.filters.at(-1);
      originalBlendMode = filter.blendMode;
      filter.blendMode = PIXI.BLEND_MODES.ERASE;
    } else {
      originalBlendMode = this.blendMode;
      this.blendMode = PIXI.BLEND_MODES.ERASE;
    }

    // Same code as in PIXI.Container#renderAdvanced without the part that renders children
    if ( this.cullable ) this._renderWithCulling(renderer);
    else this._render(renderer);
    if ( flush ) renderer.batch.flush();
    if ( mask ) renderer.mask.pop(this);
    if ( filters && this._enabledFilters.length ) renderer.filter.pop();

    // Restore the original blend mode after rendering
    if ( filter ) filter.blendMode = originalBlendMode;
    else this.blendMode = originalBlendMode;
  }

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  getPixelAlpha(x, y) {
    const msg = `${this.constructor.name}#getPixelAlpha is deprecated without replacement.`;
    foundry.utils.logCompatibilityWarning(msg, {since: 12, until: 14});
    if ( !this._textureAlphaData ) return null;
    if ( !this.canvasBounds.contains(x, y) ) return -1;
    const point = PrimarySpriteMesh.#TEMP_POINT.set(x, y);
    this.canvasTransform.applyInverse(point, point);
    const {width, height} = this._texture;
    const {x: anchorX, y: anchorY} = this.anchor;
    x = point.x + (width * anchorX);
    y = point.y + (height * anchorY);
    return this.#getTextureAlpha(x, y) * 255;
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  _getAlphaBounds() {
    const msg = `${this.constructor.name}#_getAlphaBounds is deprecated without replacement.`;
    foundry.utils.logCompatibilityWarning(msg, {since: 12, until: 14});
    const m = this._textureAlphaData;
    const r = this.rotation;
    return PIXI.Rectangle.fromRotation(m.minX, m.minY, m.maxX - m.minX, m.maxY - m.minY, r).normalize();
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  _getTextureCoordinate(testX, testY) {
    const msg = `${this.constructor.name}#_getTextureCoordinate is deprecated without replacement.`;
    foundry.utils.logCompatibilityWarning(msg, {since: 12, until: 14});
    const point = {x: testX, y: testY};
    let {x, y} = this.canvasTransform.applyInverse(point, point);
    point.x = ((x / this._texture.width) + this.anchor.x) * this._textureAlphaData.width;
    point.y = ((y / this._texture.height) + this.anchor.y) * this._textureAlphaData.height;
    return point;
  }
}


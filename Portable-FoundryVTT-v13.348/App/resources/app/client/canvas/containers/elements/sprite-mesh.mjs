import BaseSamplerShader from "../../rendering/shaders/samplers/base-sampler.mjs";

/**
 * An extension of PIXI.Mesh which emulate a PIXI.Sprite with a specific shader.
 * @param {PIXI.Texture} [texture=PIXI.Texture.EMPTY]                 Texture bound to this sprite mesh.
 * @param {typeof BaseSamplerShader} [shaderClass=BaseSamplerShader]  Shader class used by this sprite mesh.
 */
export default class SpriteMesh extends PIXI.Container {
  constructor(texture, shaderClass=BaseSamplerShader) {
    super();
    // Create shader program
    if ( !foundry.utils.isSubclass(shaderClass, BaseSamplerShader) ) {
      throw new Error("SpriteMesh shader class must be a subclass of BaseSamplerShader.");
    }
    this._shader = shaderClass.create();

    // Initialize other data to emulate sprite
    this.vertexData = this.#geometry.buffers[0].data;
    this.uvs = this.#geometry.buffers[1].data;
    this.indices = this.#geometry.indexBuffer.data;

    this._texture = null;
    this._anchor = new PIXI.ObservablePoint(
      this._onAnchorUpdate,
      this,
      (texture ? texture.defaultAnchor.x : 0),
      (texture ? texture.defaultAnchor.y : 0)
    );
    this.texture = texture;
    this.isSprite = true;

    // Assigning some batch data that will not change during the life of this sprite mesh
    this._batchData.vertexData = this.vertexData;
    this._batchData.indices = this.indices;
    this._batchData.uvs = this.uvs;
    this._batchData.object = this;
  }

  /**
   * A temporary reusable rect.
   * @type {PIXI.Rectangle}
   */
  static #TEMP_RECT = new PIXI.Rectangle();

  /**
   * A temporary reusable point.
   * @type {PIXI.Point}
   */
  static #TEMP_POINT = new PIXI.Point();

  /**
   * Geometry bound to this SpriteMesh.
   * @type {PIXI.Geometry}
   */
  #geometry = new PIXI.Geometry()
    .addAttribute("aVertexPosition", new PIXI.Buffer(new Float32Array(8), false), 2)
    .addAttribute("aTextureCoord", new PIXI.Buffer(new Float32Array(8), true), 2)
    .addIndex([0, 1, 2, 0, 2, 3]);

  /**
   * Snapshot of some parameters of this display object to render in batched mode.
   * @type {{_tintRGB: number, _texture: PIXI.Texture, indices: number[],
   * uvs: number[], blendMode: PIXI.BLEND_MODES, vertexData: number[], worldAlpha: number}}
   * @protected
   */
  _batchData = {
    _texture: undefined,
    vertexData: undefined,
    indices: undefined,
    uvs: undefined,
    worldAlpha: undefined,
    _tintRGB: undefined,
    blendMode: undefined,
    object: undefined
  };

  /**
   * The indices of the geometry.
   * @type {Uint16Array}
   */
  indices;

  /**
   * The width of the sprite (this is initially set by the texture).
   * @type {number}
   * @protected
   */
  _width = 0;

  /**
   * The height of the sprite (this is initially set by the texture)
   * @type {number}
   * @protected
   */
  _height = 0;

  /**
   * The texture that the sprite is using.
   * @type {PIXI.Texture}
   * @protected
   */
  _texture;

  /**
   * The texture ID.
   * @type {number}
   * @protected
   */
  _textureID = -1;

  /**
   * Cached tint value so we can tell when the tint is changed.
   * @type {[red: number, green: number, blue: number, alpha: number]}
   * @protected
   */
  _cachedTint = [1, 1, 1, 1];

  /**
   * The texture trimmed ID.
   * @type {number}
   * @protected
   */
  _textureTrimmedID = -1;

  /**
   * This is used to store the uvs data of the sprite, assigned at the same time
   * as the vertexData in calculateVertices().
   * @type {Float32Array}
   * @protected
   */
  uvs;

  /**
   * The anchor point defines the normalized coordinates
   * in the texture that map to the position of this
   * sprite.
   *
   * By default, this is `(0,0)` (or `texture.defaultAnchor`
   * if you have modified that), which means the position
   * `(x,y)` of this `Sprite` will be the top-left corner.
   *
   * Note: Updating `texture.defaultAnchor` after
   * constructing a `Sprite` does _not_ update its anchor.
   *
   * {@link https://docs.cocos2d-x.org/cocos2d-x/en/sprites/manipulation.html}
   * @type {PIXI.ObservablePoint}
   * @protected
   */
  _anchor;

  /**
   * This is used to store the vertex data of the sprite (basically a quad).
   * @type {Float32Array}
   * @protected
   */
  vertexData;

  /**
   * This is used to calculate the bounds of the object IF it is a trimmed sprite.
   * @type {Float32Array|null}
   * @protected
   */
  vertexTrimmedData = null;

  /**
   * The transform ID.
   * @type {number}
   * @internal
   */
  _transformID = -1;

  /**
   * The transform ID.
   * @type {number}
   * @internal
   */
  _transformTrimmedID = -1;

  /**
   * The tint applied to the sprite. This is a hex value. A value of 0xFFFFFF will remove any tint effect.
   * @type {PIXI.Color}
   * @protected
   */
  _tintColor = new PIXI.Color(0xFFFFFF);

  /**
   * The tint applied to the sprite. This is a RGB value. A value of 0xFFFFFF will remove any tint effect.
   * @type {number}
   * @protected
   */
  _tintRGB = 0xFFFFFF;

  /**
   * An instance of a texture uvs used for padded SpriteMesh.
   * Instanced only when padding becomes non-zero.
   * @type {PIXI.TextureUvs|null}
   * @protected
   */
  _textureUvs = null;

  /**
   * Used to track a tint or alpha change to execute a recomputation of _cachedTint.
   * @type {boolean}
   * @protected
   */
  _tintAlphaDirty = true;

  /**
   * The PIXI.State of this SpriteMesh.
   * @type {PIXI.State}
   */
  #state = PIXI.State.for2d();

  /* ---------------------------------------- */

  /**
   * The shader bound to this mesh.
   * @type {BaseSamplerShader}
   */
  get shader() {
    return this._shader;
  }

  /**
   * The shader bound to this mesh.
   * @type {BaseSamplerShader}
   * @protected
   */
  _shader;

  /* ---------------------------------------- */

  /**
   * The x padding in pixels (must be a non-negative value.)
   * @type {number}
   */
  get paddingX() {
    return this._paddingX;
  }

  set paddingX(value) {
    if ( value < 0 ) throw new Error("The padding must be a non-negative value.");
    if ( this._paddingX === value ) return;
    this._paddingX = value;
    this._textureID = -1;
    this._textureTrimmedID = -1;
    this._textureUvs ??= new PIXI.TextureUvs();
  }

  /**
   * They y padding in pixels (must be a non-negative value.)
   * @type {number}
   */
  get paddingY() {
    return this._paddingY;
  }

  set paddingY(value) {
    if ( value < 0 ) throw new Error("The padding must be a non-negative value.");
    if ( this._paddingY === value ) return;
    this._paddingY = value;
    this._textureID = -1;
    this._textureTrimmedID = -1;
    this._textureUvs ??= new PIXI.TextureUvs();
  }

  /**
   * The maximum x/y padding in pixels (must be a non-negative value.)
   * @type {number}
   */
  get padding() {
    return Math.max(this._paddingX, this._paddingY);
  }

  set padding(value) {
    if ( value < 0 ) throw new Error("The padding must be a non-negative value.");
    this.paddingX = this.paddingY = value;
  }

  /**
   * @type {number}
   * @protected
   */
  _paddingX = 0;

  /**
   * @type {number}
   * @protected
   */
  _paddingY = 0;

  /* ---------------------------------------- */

  /**
   * The blend mode applied to the SpriteMesh.
   * @type {PIXI.BLEND_MODES}
   * @defaultValue PIXI.BLEND_MODES.NORMAL
   */
  set blendMode(value) {
    this.#state.blendMode = value;
  }

  get blendMode() {
    return this.#state.blendMode;
  }

  /* ---------------------------------------- */

  /**
   * If true PixiJS will Math.round() x/y values when rendering, stopping pixel interpolation.
   * Advantages can include sharper image quality (like text) and faster rendering on canvas.
   * The main disadvantage is movement of objects may appear less smooth.
   * To set the global default, change PIXI.settings.ROUND_PIXELS
   * @defaultValue PIXI.settings.ROUND_PIXELS
   */
  set roundPixels(value) {
    if ( this.#roundPixels !== value ) this._transformID = -1;
    this.#roundPixels = value;
  }

  get roundPixels() {
    return this.#roundPixels;
  }

  #roundPixels = PIXI.settings.ROUND_PIXELS;

  /* ---------------------------------------- */

  /**
   * Used to force an alpha mode on this sprite mesh.
   * If this property is non null, this value will replace the texture alphaMode when computing color channels.
   * Affects how tint, worldAlpha and alpha are computed each others.
   * @type {PIXI.ALPHA_MODES}
   */
  get alphaMode() {
    return this.#alphaMode ?? this._texture.baseTexture.alphaMode;
  }

  set alphaMode(mode) {
    if ( this.#alphaMode === mode ) return;
    this.#alphaMode = mode;
    this._tintAlphaDirty = true;
  }

  #alphaMode = null;

  /* ---------------------------------------- */

  /**
   * Returns the SpriteMesh associated batch plugin. By default the returned plugin is that of the associated shader.
   * If a plugin is forced, it will returns the forced plugin. A null value means that this SpriteMesh has no associated
   * plugin.
   * @type {string|null}
   */
  get pluginName() {
    return this.#pluginName ?? this._shader.pluginName;
  }

  set pluginName(name) {
    this.#pluginName = name;
  }

  #pluginName = null;

  /* ---------------------------------------- */

  /** @override */
  get width() {
    return Math.abs(this.scale.x) * this._texture.orig.width;
  }

  set width(width) {
    const s = Math.sign(this.scale.x) || 1;
    this.scale.x = s * width / this._texture.orig.width;
    this._width = width;
  }

  /* ---------------------------------------- */

  /** @override */
  get height() {
    return Math.abs(this.scale.y) * this._texture.orig.height;
  }

  set height(height) {
    const s = Math.sign(this.scale.y) || 1;
    this.scale.y = s * height / this._texture.orig.height;
    this._height = height;
  }

  /* ---------------------------------------- */

  /**
   * The texture that the sprite is using.
   * @type {PIXI.Texture}
   */
  get texture() {
    return this._texture;
  }

  set texture(texture) {
    texture = texture ?? null;
    if ( this._texture === texture ) return;
    if ( this._texture ) this._texture.off("update", this._onTextureUpdate, this);

    this._texture = texture || PIXI.Texture.EMPTY;
    this._textureID = this._textureTrimmedID = -1;
    this._tintAlphaDirty = true;

    if ( texture ) {
      if ( this._texture.baseTexture.valid ) this._onTextureUpdate();
      else this._texture.once("update", this._onTextureUpdate, this);
    }
  }

  /* ---------------------------------------- */

  /**
   * The anchor sets the origin point of the sprite. The default value is taken from the texture
   * and passed to the constructor.
   *
   * The default is `(0,0)`, this means the sprite's origin is the top left.
   *
   * Setting the anchor to `(0.5,0.5)` means the sprite's origin is centered.
   *
   * Setting the anchor to `(1,1)` would mean the sprite's origin point will be the bottom right corner.
   *
   * If you pass only single parameter, it will set both x and y to the same value as shown in the example below.
   * @type {PIXI.ObservablePoint}
   */
  get anchor() {
    return this._anchor;
  }

  set anchor(anchor) {
    this._anchor.copyFrom(anchor);
  }

  /* ---------------------------------------- */

  /**
   * The tint applied to the sprite. This is a hex value.
   *
   * A value of 0xFFFFFF will remove any tint effect.
   * @type {number}
   * @defaultValue 0xFFFFFF
   */
  get tint() {
    return this._tintColor.value;
  }

  set tint(tint) {
    this._tintColor.setValue(tint);
    const tintRGB = this._tintColor.toLittleEndianNumber();
    if ( tintRGB === this._tintRGB ) return;
    this._tintRGB = tintRGB;
    this._tintAlphaDirty = true;
  }

  /* ---------------------------------------- */

  /**
   * The HTML source element for this SpriteMesh texture.
   * @type {PIXI.ImageSource|null}
   */
  get sourceElement() {
    if ( !this.texture.valid ) return null;
    return this.texture?.baseTexture.resource?.source ?? null;
  }

  /* ---------------------------------------- */

  /**
   * Is this SpriteMesh rendering a video texture?
   * @type {boolean}
   */
  get isVideo() {
    const source = this.sourceElement;
    return source?.tagName === "VIDEO";
  }

  /* ---------------------------------------- */

  /**
   * When the texture is updated, this event will fire to update the scale and frame.
   * @protected
   */
  _onTextureUpdate() {
    this._textureID = this._textureTrimmedID = this._transformID = this._transformTrimmedID = -1;
    if ( this._width ) this.scale.x = Math.sign(this.scale.x) * this._width / this._texture.orig.width;
    if ( this._height ) this.scale.y = Math.sign(this.scale.y) * this._height / this._texture.orig.height;
    // Alpha mode of the texture could have changed
    this._tintAlphaDirty = true;
    this.updateUvs();
  }

  /* ---------------------------------------- */

  /**
   * Called when the anchor position updates.
   * @protected
   */
  _onAnchorUpdate() {
    this._textureID = this._textureTrimmedID = this._transformID = this._transformTrimmedID = -1;
  }

  /* ---------------------------------------- */

  /**
   * Update uvs and push vertices and uv buffers on GPU if necessary.
   */
  updateUvs() {
    if ( this._textureID !== this._texture._updateID ) {
      let textureUvs;
      if ( (this._paddingX !== 0) || (this._paddingY !== 0) ) {
        const texture = this._texture;
        const frame = SpriteMesh.#TEMP_RECT.copyFrom(texture.frame).pad(this._paddingX, this._paddingY);
        textureUvs = this._textureUvs;
        textureUvs.set(frame, texture.baseTexture, texture.rotate);
      } else {
        textureUvs = this._texture._uvs;
      }
      this.uvs.set(textureUvs.uvsFloat32);
      this.#geometry.buffers[1].update();
    }
  }

  /* ---------------------------------------- */

  /**
   * Initialize shader based on the shader class type.
   * @param {typeof BaseSamplerShader} shaderClass    The shader class
   */
  setShaderClass(shaderClass) {
    if ( !foundry.utils.isSubclass(shaderClass, BaseSamplerShader) ) {
      throw new Error("SpriteMesh shader class must inherit from BaseSamplerShader.");
    }
    if ( this._shader.constructor === shaderClass ) return;
    this._shader = shaderClass.create();
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

  /**
   * Calculates worldTransform * vertices, store it in vertexData.
   */
  calculateVertices() {
    if ( this._transformID === this.transform._worldID && this._textureID === this._texture._updateID ) return;

    // Update uvs if necessary
    this.updateUvs();
    this._transformID = this.transform._worldID;
    this._textureID = this._texture._updateID;

    // Set the vertex data
    const {a, b, c, d, tx, ty} = this.transform.worldTransform;
    const orig = this._texture.orig;
    const trim = this._texture.trim;
    const padX = this._paddingX;
    const padY = this._paddingY;

    let w1; let w0; let h1; let h0;
    if ( trim ) {
      // If the sprite is trimmed and is not a tilingsprite then we need to add the extra
      // space before transforming the sprite coords
      w1 = trim.x - (this._anchor._x * orig.width) - padX;
      w0 = w1 + trim.width + (2 * padX);
      h1 = trim.y - (this._anchor._y * orig.height) - padY;
      h0 = h1 + trim.height + (2 * padY);
    }
    else {
      w1 = (-this._anchor._x * orig.width) - padX;
      w0 = w1 + orig.width + (2 * padX);
      h1 = (-this._anchor._y * orig.height) - padY;
      h0 = h1 + orig.height + (2 * padY);
    }

    const vertexData = this.vertexData;
    vertexData[0] = (a * w1) + (c * h1) + tx;
    vertexData[1] = (d * h1) + (b * w1) + ty;
    vertexData[2] = (a * w0) + (c * h1) + tx;
    vertexData[3] = (d * h1) + (b * w0) + ty;
    vertexData[4] = (a * w0) + (c * h0) + tx;
    vertexData[5] = (d * h0) + (b * w0) + ty;
    vertexData[6] = (a * w1) + (c * h0) + tx;
    vertexData[7] = (d * h0) + (b * w1) + ty;

    if ( this.roundPixels ) {
      const r = PIXI.settings.RESOLUTION;
      for ( let i = 0; i < vertexData.length; ++i ) vertexData[i] = Math.round(vertexData[i] * r) / r;
    }
    this.#geometry.buffers[0].update();
  }

  /* ---------------------------------------- */

  /**
   * Calculates worldTransform * vertices for a non texture with a trim. store it in vertexTrimmedData.
   *
   * This is used to ensure that the true width and height of a trimmed texture is respected.
   */
  calculateTrimmedVertices() {
    if ( !this.vertexTrimmedData ) this.vertexTrimmedData = new Float32Array(8);
    else if ( (this._transformTrimmedID === this.transform._worldID)
      && (this._textureTrimmedID === this._texture._updateID) ) return;

    this._transformTrimmedID = this.transform._worldID;
    this._textureTrimmedID = this._texture._updateID;

    const texture = this._texture;
    const vertexData = this.vertexTrimmedData;
    const orig = texture.orig;
    const anchor = this._anchor;
    const padX = this._paddingX;
    const padY = this._paddingY;

    // Compute the new untrimmed bounds
    const wt = this.transform.worldTransform;
    const a = wt.a;
    const b = wt.b;
    const c = wt.c;
    const d = wt.d;
    const tx = wt.tx;
    const ty = wt.ty;

    const w1 = (-anchor._x * orig.width) - padX;
    const w0 = w1 + orig.width + (2 * padX);
    const h1 = (-anchor._y * orig.height) - padY;
    const h0 = h1 + orig.height + (2 * padY);

    vertexData[0] = (a * w1) + (c * h1) + tx;
    vertexData[1] = (d * h1) + (b * w1) + ty;
    vertexData[2] = (a * w0) + (c * h1) + tx;
    vertexData[3] = (d * h1) + (b * w0) + ty;
    vertexData[4] = (a * w0) + (c * h0) + tx;
    vertexData[5] = (d * h0) + (b * w0) + ty;
    vertexData[6] = (a * w1) + (c * h0) + tx;
    vertexData[7] = (d * h0) + (b * w1) + ty;

    if ( this.roundPixels ) {
      const r = PIXI.settings.RESOLUTION;
      for ( let i = 0; i < vertexData.length; ++i ) vertexData[i] = Math.round(vertexData[i] * r) / r;
    }
  }

  /* ---------------------------------------- */

  /** @override */
  _render(renderer) {
    const pluginName = this.pluginName;
    if ( pluginName ) this.#renderBatched(renderer, pluginName);
    else this.#renderDirect(renderer, this._shader);
  }

  /* ---------------------------------------- */

  /**
   * Render with batching.
   * @param {PIXI.Renderer} renderer    The renderer
   * @param {string} pluginName         The batch renderer
   */
  #renderBatched(renderer, pluginName) {
    this.calculateVertices();
    this._updateBatchData();
    const batchRenderer = renderer.plugins[pluginName];
    renderer.batch.setObjectRenderer(batchRenderer);
    batchRenderer.render(this._batchData);
  }

  /* ---------------------------------------- */

  /**
   * Render without batching.
   * @param {PIXI.Renderer} renderer     The renderer
   * @param {BaseSamplerShader} shader   The shader
   */
  #renderDirect(renderer, shader) {
    this.calculateVertices();
    if ( this._tintAlphaDirty ) {
      PIXI.Color.shared.setValue(this._tintColor)
        .premultiply(this.worldAlpha, this.alphaMode > 0)
        .toArray(this._cachedTint);
      this._tintAlphaDirty = false;
    }
    shader._preRender(this, renderer);
    renderer.batch.flush();
    renderer.shader.bind(shader);
    renderer.state.set(this.#state);
    renderer.geometry.bind(this.#geometry, shader);
    renderer.geometry.draw(PIXI.DRAW_MODES.TRIANGLES, 6, 0);
  }

  /* ---------------------------------------- */

  /**
   * Update the batch data object.
   * @protected
   */
  _updateBatchData() {
    this._batchData._texture = this._texture;
    this._batchData.worldAlpha = this.worldAlpha;
    this._batchData._tintRGB = this._tintRGB;
    this._batchData.blendMode = this.#state.blendMode;
  }

  /* ---------------------------------------- */

  /** @override */
  _calculateBounds() {
    const trim = this._texture.trim;
    const orig = this._texture.orig;

    // First lets check to see if the current texture has a trim.
    if ( !trim || ((trim.width === orig.width) && (trim.height === orig.height)) ) {
      this.calculateVertices();
      this._bounds.addQuad(this.vertexData);
    }
    else {
      this.calculateTrimmedVertices();
      this._bounds.addQuad(this.vertexTrimmedData);
    }
  }

  /* ---------------------------------------- */

  /** @override */
  getLocalBounds(rect) {
    // Fast local bounds computation if the sprite has no children!
    if ( this.children.length === 0 ) {
      if ( !this._localBounds ) this._localBounds = new PIXI.Bounds();

      const padX = this._paddingX;
      const padY = this._paddingY;
      const orig = this._texture.orig;
      this._localBounds.minX = (orig.width * -this._anchor._x) - padX;
      this._localBounds.minY = (orig.height * -this._anchor._y) - padY;
      this._localBounds.maxX = (orig.width * (1 - this._anchor._x)) + padX;
      this._localBounds.maxY = (orig.height * (1 - this._anchor._y)) + padY;

      if ( !rect ) {
        if ( !this._localBoundsRect ) this._localBoundsRect = new PIXI.Rectangle();
        rect = this._localBoundsRect;
      }

      return this._localBounds.getRectangle(rect);
    }

    return super.getLocalBounds(rect);
  }

  /* ---------------------------------------- */

  /**
   *
   * Check to see if a point is contained within this SpriteMesh Quad.
   * @param {PIXI.Point} point          Point to check if it's contained.
   * @returns {boolean} `true` if the point is contained within geometry.
   */
  containsPoint(point) {
    const tempPoint = SpriteMesh.#TEMP_POINT;
    this.worldTransform.applyInverse(point, tempPoint);

    const width = this._texture.orig.width;
    const height = this._texture.orig.height;
    const x1 = -width * this.anchor.x;
    let y1 = 0;

    if ( (tempPoint.x >= x1) && (tempPoint.x < (x1 + width)) ) {
      y1 = -height * this.anchor.y;
      if ( (tempPoint.y >= y1) && (tempPoint.y < (y1 + height)) ) return true;
    }
    return false;
  }

  /* ---------------------------------------- */

  /** @override */
  destroy(options) {
    super.destroy(options);
    this.#geometry.dispose();
    this.#geometry = null;
    this._shader = null;
    this.#state = null;
    this.uvs = null;
    this.indices = null;
    this.vertexData = null;
    this._texture.off("update", this._onTextureUpdate, this);
    this._anchor = null;
    const destroyTexture = (typeof options === "boolean" ? options : options?.texture);
    if ( destroyTexture ) {
      const destroyBaseTexture = (typeof options === "boolean" ? options : options?.baseTexture);
      this._texture.destroy(!!destroyBaseTexture);
    }
    this._texture = null;
  }

  /* ---------------------------------------- */

  /**
   * Create a SpriteMesh from another source.
   * You can specify texture options and a specific shader class derived from BaseSamplerShader.
   * @param {string|PIXI.Texture|HTMLCanvasElement|HTMLVideoElement} source  Source to create texture from.
   * @param {object} [textureOptions]               See PIXI.BaseTexture's constructor for options.
   * @param {BaseSamplerShader} [shaderClass]       The shader class to use. BaseSamplerShader by default.
   * @returns {SpriteMesh}
   */
  static from(source, textureOptions, shaderClass) {
    const texture = source instanceof PIXI.Texture ? source : PIXI.Texture.from(source, textureOptions);
    return new SpriteMesh(texture, shaderClass);
  }
}

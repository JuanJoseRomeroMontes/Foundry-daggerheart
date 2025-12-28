import CanvasAnimation from "../../animation/canvas-animation.mjs";
import TextureLoader, {getTexture} from "../../loader.mjs";
import Color from "@common/utils/color.mjs";

/**
 * @import Token from "../token.mjs";
 * @import {RingColorBand, RingData} from "../_types.mjs"
 */

/**
 * Dynamic Token Ring Manager.
 */
export default class TokenRing {
  /**
   * A TokenRing is constructed by providing a reference to a Token object.
   * @param {Token} token
   */
  constructor(token) {
    this.#token = new WeakRef(token);
  }

  /* -------------------------------------------- */
  /*  Rings System                                */
  /* -------------------------------------------- */

  /**
   * The effects which could be applied to a token ring (using bitwise operations).
   */
  static effects = Object.freeze({
    DISABLED: 0x00,
    ENABLED: 0x01,
    RING_PULSE: 0x02,
    RING_GRADIENT: 0x04,
    BKG_WAVE: 0x08,
    INVISIBILITY: 0x10, // Or spectral pulse effect
    COLOR_OVER_SUBJECT: 0x20
  });

  /* -------------------------------------------- */

  /**
   * Is the token rings framework enabled? Will be `null` if the system hasn't initialized yet.
   * @type {boolean|null}
   */
  static get initialized() {
    return this.#initialized;
  }

  static #initialized = null;

  /* -------------------------------------------- */

  /**
   * Token Rings sprite sheet base texture.
   * @type {PIXI.BaseTexture}
   */
  static baseTexture;

  /**
   * Rings and background textures UVs and center offset.
   * @type {Record<string, {UVs: Float32Array, center: {x: number, y: number}}>}
   */
  static texturesData;

  /**
   * The token ring shader class definition.
   * @type {typeof TokenRingSamplerShader}
   */
  static tokenRingSamplerShader;

  /**
   * The array of available RingData.
   * @type {RingData[]}
   */
  static #ringData;

  /**
   * Default ring thickness in normalized space.
   * @type {number}
   */
  static #defaultRingThickness = 0.1269848;

  /**
   * Default ring subject thickness in normalized space.
   * @type {number}
   */
  static #defaultSubjectThickness = 0.6666666;

  /* -------------------------------------------- */

  /**
   * Initialize the Token Rings system, registering the batch plugin and patching PrimaryCanvasGroup#addToken.
   */
  static initialize() {
    if ( TokenRing.#initialized ) return;
    TokenRing.#initialized = true;
    // Register batch plugin
    this.tokenRingSamplerShader = CONFIG.Token.ring.shaderClass;
    this.tokenRingSamplerShader.registerPlugin();
  }

  /* -------------------------------------------- */

  /**
   * Create texture UVs for each asset into the token rings sprite sheet.
   */
  static createAssetsUVs() {
    const spritesheet = TextureLoader.loader.getCache(CONFIG.Token.ring.spritesheet);
    if ( !spritesheet ) throw new Error("TokenRing UV generation failed because no spritesheet was loaded!");

    this.baseTexture = spritesheet.baseTexture;
    this.texturesData = {};
    this.#ringData = [];

    const {
      defaultColorBand={startRadius: 0.59, endRadius: 0.7225},
      defaultRingColor: drc,
      defaultBackgroundColor: dbc
    } = spritesheet.data.config ?? {};
    const defaultRingColor = Color.from(drc);
    const defaultBackgroundColor = Color.from(dbc);
    const validDefaultRingColor = defaultRingColor.valid ? defaultRingColor.littleEndian : null;
    const validDefaultBackgroundColor = defaultBackgroundColor.valid ? defaultBackgroundColor.littleEndian : null;

    const frames = Object.keys(spritesheet.data.frames || {});
    if ( !frames.length ) throw new Error("TokenRing UV generation failed because no frames were detected!");

    for ( const asset of frames ) {
      const assetTexture = PIXI.Assets.cache.get(asset);
      if ( !assetTexture ) continue;

      // Extracting texture UVs
      const frame = assetTexture.frame;
      const textureUvs = new PIXI.TextureUvs();
      textureUvs.set(frame, assetTexture.baseTexture, assetTexture.rotate);
      this.texturesData[asset] = {
        UVs: textureUvs.uvsFloat32,
        center: {
          x: frame.center.x / assetTexture.baseTexture.width,
          y: frame.center.y / assetTexture.baseTexture.height
        }
      };

      // Skip background assets
      if ( asset.includes("-bkg") || asset.includes("-msk") ) continue;

      // Extracting and determining final colors
      const {ringColor: rc, backgroundColor: bc, colorBand, gridTarget, ringThickness=this.#defaultRingThickness} =
        spritesheet.data.frames[asset] || {};

      const ringColor = Color.from(rc);
      const backgroundColor = Color.from(bc);

      const finalRingColor = ringColor.valid ? ringColor.littleEndian : validDefaultRingColor;
      const finalBackgroundColor = backgroundColor.valid ? backgroundColor.littleEndian : validDefaultBackgroundColor;
      const subjectScaleAdjustment = 1 / (ringThickness + this.#defaultSubjectThickness);

      const ringData = {
        ringName: asset,
        bkgName: `${asset}-bkg`,
        maskName: `${asset}-msk`,
        colorBand: foundry.utils.deepClone(colorBand ?? defaultColorBand),
        gridTarget: gridTarget ?? 1,
        defaultRingColorLittleEndian: finalRingColor,
        defaultBackgroundColorLittleEndian: finalBackgroundColor,
        subjectScaleAdjustment
      };
      this.#ringData.push(ringData);
    }

    // Sorting the rings data array
    this.#ringData.sort((a, b) => a.gridTarget - b.gridTarget);
  }

  /* -------------------------------------------- */

  /**
   * Get the UVs array for a given texture name and scale correction.
   * @param {string} name                  Name of the texture we want to get UVs.
   * @param {number} [scaleCorrection=1]   The scale correction applied to UVs.
   * @returns {Float32Array|void}
   */
  static getTextureUVs(name, scaleCorrection=1) {
    if ( !this.texturesData[name] ) return;
    if ( scaleCorrection === 1 ) return this.texturesData[name].UVs;
    const tUVs = this.texturesData[name].UVs;
    const c = this.texturesData[name].center;
    const UVs = new Float32Array(8);
    for ( let i=0; i<8; i+=2 ) {
      UVs[i] = ((tUVs[i] - c.x) * scaleCorrection) + c.x;
      UVs[i+1] = ((tUVs[i+1] - c.y) * scaleCorrection) + c.y;
    }
    return UVs;
  }

  /* -------------------------------------------- */

  /**
   * Get ring and background names for a given size.
   * @param {number} size   The size to match (grid size dimension)
   * @returns {RingData}
   */
  static getRingDataBySize(size) {
    if ( !Number.isFinite(size) || !this.#ringData.length ) {
      return {
        ringName: undefined,
        bkgName: undefined,
        maskName: undefined,
        colorBand: undefined,
        defaultRingColorLittleEndian: null,
        defaultBackgroundColorLittleEndian: null,
        subjectScaleAdjustment: null
      };
    }
    const rings = this.#ringData.map(r => [Math.abs(r.gridTarget - size), r]);

    // Sort rings on proximity to target size
    rings.sort((a, b) => a[0] - b[0]);

    // Choose the closest ring, access the second element of the first array which is the ring data object
    const closestRing = rings[0][1];

    return {
      ringName: closestRing.ringName,
      bkgName: closestRing.bkgName,
      maskName: closestRing.maskName,
      colorBand: closestRing.colorBand,
      defaultRingColorLittleEndian: closestRing.defaultRingColorLittleEndian,
      defaultBackgroundColorLittleEndian: closestRing.defaultBackgroundColorLittleEndian,
      subjectScaleAdjustment: closestRing.subjectScaleAdjustment
    };
  }

  /* -------------------------------------------- */
  /*  Attributes                                  */
  /* -------------------------------------------- */

  /** @type {string} */
  ringName;

  /** @type {string} */
  bkgName;

  /** @type {string} */
  maskName;

  /** @type {Float32Array} */
  ringUVs;

  /** @type {Float32Array} */
  bkgUVs;

  /** @type {Float32Array} */
  maskUVs;

  /** @type {number} */
  ringColorLittleEndian = 0xFFFFFF; // Little endian format => BBGGRR

  /** @type {number} */
  bkgColorLittleEndian = 0xFFFFFF; // Little endian format => BBGGRR

  /** @type {number|null} */
  defaultRingColorLittleEndian = null;

  /** @type {number|null} */
  defaultBackgroundColorLittleEndian = null;

  /** @type {number} */
  effects = 0;

  /** @type {number} */
  scaleCorrection = 1;

  /** @type {number} */
  scaleAdjustmentX = 1;

  /** @type {number} */
  scaleAdjustmentY = 1;

  /** @type {number} */
  subjectScaleAdjustment = 1;

  /** @type {number} */
  textureScaleAdjustment = 1;

  /** @type {RingColorBand} */
  colorBand;


  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * Reference to the token that should be animated.
   * @type {Token|void}
   */
  get token() {
    return this.#token.deref();
  }

  /**
   * Weak reference to the token being animated.
   * @type {WeakRef<Token>}
   */
  #token;

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /**
   * Configure the sprite mesh.
   * @param {PrimarySpriteMesh} [mesh]  The mesh to which TokenRing functionality is configured (default to token.mesh)
   */
  configure(mesh) {
    mesh ??= this.token.mesh;
    if ( !mesh ) return;
    this.#configureTexture(mesh);
    this.configureSize({fit: this.token.document.texture.fit});
    this.configureVisuals();
  }

  /* -------------------------------------------- */

  /**
   * Clear configuration pertaining to token ring from the mesh.
   */
  clear() {
    this.ringName = undefined;
    this.bkgName = undefined;
    this.maskName = undefined;
    this.ringUVs = undefined;
    this.bkgUVs = undefined;
    this.maskUVs = undefined;
    this.colorBand = undefined;
    this.ringColorLittleEndian = 0xFFFFFF;
    this.bkgColorLittleEndian = 0xFFFFFF;
    this.defaultRingColorLittleEndian = null;
    this.defaultBackgroundColorLittleEndian = null;
    this.scaleCorrection = 1;
    this.scaleAdjustmentX = 1;
    this.scaleAdjustmentY = 1;
    this.subjectScaleAdjustment = 1;
    this.textureScaleAdjustment = 1;
    const mesh = this.token.mesh;
    if ( mesh ) mesh.padding = 0;
  }

  /* -------------------------------------------- */

  /**
   * Configure token ring size according to mesh texture, token dimensions, fit mode, and dynamic ring fit mode.
   * @param {object} [options]
   * @param {string} [options.fit="contain"]     The desired fit mode
   * @param {number} [options.scaleMultiplier=1] A custom scale multiplier applied on scale correction
   */
  configureSize({fit = "contain", scaleMultiplier=1}={}) {
    const mesh = this.token.mesh;
    const {width: gridWidth, height: gridHeight} = this.token.document;
    const size = Math.min(gridWidth, gridHeight);
    const explicitSubject = this.token.document.hasDistinctSubjectTexture;

    // Set ring size and subject scale
    Object.assign(this, this.constructor.getRingDataBySize(size));
    this.scaleCorrection = this.token.document.ring.subject.scale * scaleMultiplier;

    // Extract dimensions from the mesh or token texture
    const {width: textureWidth, height: textureHeight} = mesh.texture ?? this.token.texture;

    // Extract long and short sides
    const longSide = Math.max(textureWidth, textureHeight);
    const shortSide = Math.min(textureWidth, textureHeight);

    // Initialize scale padding (0 by default with scale correction >= 1)
    let scalePadding = 0;

    // Calculate padding for scale correction < 1
    // With low scale correction, the ring could be larger than the token gl viewport. We need padding for this case.
    if ( this.scaleCorrection < 1 ) {
      const {width: tokenWidth, height: tokenHeight} = this.token.document.getSize();
      const maxSideLength = Math.max(tokenWidth, tokenHeight);
      const scaleFactor = 1 - this.scaleCorrection;
      const aspectRatioLengthAdjustment = (longSide - shortSide); // Adjustment for aspect ratio <> 1
      scalePadding = scaleFactor * maxSideLength + aspectRatioLengthAdjustment;

      // Apply scale padding to scale correction
      this.scaleCorrection *= (1 + ((scalePadding * 2) / longSide));
    }

    // Calculate padding for X and Y sides
    const padding = (longSide - shortSide) / 2;
    const paddingX = (textureWidth < textureHeight) ? padding : 0;
    const paddingY = (textureWidth > textureHeight) ? padding : 0;

    // Apply mesh padding and scaling adjustments
    mesh.paddingX = paddingX + scalePadding;
    mesh.paddingY = paddingY + scalePadding;

    const scaleAdjustment = longSide / (longSide + scalePadding * 2);
    const aspectRatioAdjustment = (shortSide / longSide) * scaleAdjustment;
    this.scaleAdjustmentX = paddingX ? aspectRatioAdjustment : scaleAdjustment;
    this.scaleAdjustmentY = paddingY ? aspectRatioAdjustment : scaleAdjustment;

    // Apply texture scale adjustments based on fit mode and subject presence
    if ( !explicitSubject ) {
      if ( CONFIG.Token.ring.isGridFitMode ) this.textureScaleAdjustment = this.subjectScaleAdjustment;

      // Adjust scale based on fit mode
      this.#adjustScaleByFitMode(fit, textureWidth, textureHeight);
    }

    // Otherwise do nothing and initialize texture scale adjustment to normal
    else this.textureScaleAdjustment = 1;

    // Get the scaled dynamic ring assets
    this.#setRingAssets();
  }

  /* -------------------------------------------- */

  /**
   * Adjust the scale correction based on the specified fit mode and various texture and grid dimensions.
   * @param {string} fit               The desired fit mode.
   * @param {number} textureWidth      The width of the token or mesh texture.
   * @param {number} textureHeight     The height of the token or mesh texture.
   */
  #adjustScaleByFitMode(fit, textureWidth, textureHeight) {
    if ( fit === "fill" ) {
      this.scaleCorrection *= (Math.max(textureWidth, textureHeight) / Math.min(textureWidth, textureHeight));
      return;
    }
    const {width: baseWidth, height: baseHeight} = this.token.document.getSize();
    let meshScale;
    switch ( fit ) {
      case "cover":
        meshScale = Math.max(baseWidth / textureWidth, baseHeight / textureHeight);
        break;
      case "contain":
        meshScale = Math.min(baseWidth / textureWidth, baseHeight / textureHeight);
        break;
      case "width":
        meshScale = baseWidth / textureWidth;
        break;
      case "height":
        meshScale = baseHeight / textureHeight;
        break;
    }
    const meshDiameter = Math.max(textureWidth, textureHeight) * meshScale;
    const ringDiameter = Math.min(baseWidth, baseHeight);
    this.scaleCorrection *= (meshDiameter / ringDiameter);
  }

  /* -------------------------------------------- */

  /**
   * Set dynamic ring assets UVs according to scale correction.
   */
  #setRingAssets() {
    this.ringUVs = this.constructor.getTextureUVs(this.ringName, this.scaleCorrection);
    this.bkgUVs = this.constructor.getTextureUVs(this.bkgName, this.scaleCorrection);
    this.maskUVs = this.constructor.getTextureUVs(this.maskName, this.scaleCorrection);
  }

  /* -------------------------------------------- */

  /**
   * Configure the token ring visuals properties.
   */
  configureVisuals() {
    const ring = this.token.document.ring;

    // Configure colors
    const colors = foundry.utils.mergeObject(ring.colors, this.token.getRingColors(), {inplace: false});
    const resolveColor = (color, defaultColor) => {
      const resolvedColor = Color.from(color ?? 0xFFFFFF).littleEndian;
      return ((resolvedColor === 0xFFFFFF) && (defaultColor !== null)) ? defaultColor : resolvedColor;
    };
    this.ringColorLittleEndian = resolveColor(colors?.ring, this.defaultRingColorLittleEndian);
    this.bkgColorLittleEndian = resolveColor(colors?.background, this.defaultBackgroundColorLittleEndian);

    // Configure effects
    const effectsToApply = this.token.getRingEffects();
    this.effects = ((ring.effects >= this.constructor.effects.DISABLED)
      ? ring.effects : this.constructor.effects.ENABLED)
      | effectsToApply.reduce((acc, e) => acc |= e, 0x0);

    // Mask with enabled effects for the current token ring configuration
    let mask = this.effects & CONFIG.Token.ring.ringClass.effects.ENABLED;
    for ( const key in CONFIG.Token.ring.effects ) {
      const v = CONFIG.Token.ring.ringClass.effects[key];
      if ( v !== undefined ) {
        mask |= v;
      }
    }
    this.effects &= mask;
  }

  /* -------------------------------------------- */

  /**
   * Configure dynamic token ring subject texture.
   * @param {PrimarySpriteMesh} mesh                  The mesh being configured
   */
  #configureTexture(mesh) {
    const src = this.token.document.ring.subject.texture;
    if ( PIXI.Assets.cache.has(src) ) {
      const subjectTexture = getTexture(src);
      if ( subjectTexture?.valid ) mesh.texture = subjectTexture;
    }
  }

  /* -------------------------------------------- */
  /*  Animations                                  */
  /* -------------------------------------------- */

  /**
   * Flash the ring briefly with a certain color.
   * @param {Color} color                              Color to flash.
   * @param {CanvasAnimationOptions} animationOptions  Options to customize the animation.
   * @returns {Promise<boolean|void>}
   */
  async flashColor(color, animationOptions={}) {
    if ( Number.isNaN(color) ) return;

    const baseDuration = 1600;
    const isPS = canvas.photosensitiveMode === true;
    if ( isPS ) {
      // Apply a minimal duration for photosensitive mode
      animationOptions.duration = Math.max(1000, animationOptions.duration ?? baseDuration);
      // Override completely easing option with a soft ping pong easing
      animationOptions.easing = this.constructor.easePingPong;
    }

    const defaultColorFallback = this.token.ring.defaultRingColorLittleEndian ?? 0xFFFFFF;
    const configuredColor = Color.from(foundry.utils.mergeObject(
      this.token.document.ring.colors,
      this.token.getRingColors(),
      {inplace: false}
    ).ring);
    const originalColor = configuredColor.valid ? configuredColor.littleEndian : defaultColorFallback;
    const target = new Color(color.littleEndian);

    // Washing target color for photosensitive mode. Needed to reduce contrast
    const softTarget = isPS ? Color.from(originalColor).mix(target, 0.4) : target;

    return await CanvasAnimation.animate([{
      attribute: "ringColorLittleEndian",
      parent: this,
      from: originalColor,
      to: softTarget,
      color: true
    }], foundry.utils.mergeObject({
      duration: baseDuration,
      priority: PIXI.UPDATE_PRIORITY.HIGH,
      easing: this.constructor.createSpikeEasing(.15)
    }, animationOptions));
  }

  /* -------------------------------------------- */

  /**
   * Create an easing function that spikes in the center. Ideal duration is around 1600ms.
   * @param {number} [spikePct=0.5]  Position on [0,1] where the spike occurs.
   * @returns {Function(number): number}
   */
  static createSpikeEasing(spikePct=0.5) {
    const scaleStart = 1 / spikePct;
    const scaleEnd = 1 / (1 - spikePct);
    return pt => {
      if ( pt < spikePct ) return CanvasAnimation.easeInCircle(pt * scaleStart);
      else return 1 - CanvasAnimation.easeOutCircle(((pt - spikePct) * scaleEnd));
    };
  }

  /* -------------------------------------------- */

  /**
   * Easing function that produces two peaks before returning to the original value. Ideal duration is around 500ms.
   * @param {number} pt     The proportional animation timing on [0,1].
   * @returns {number}      The eased animation progress on [0,1].
   */
  static easeTwoPeaks(pt) {
    return (Math.sin((4 * Math.PI * pt) - (Math.PI / 2)) + 1) / 2;
  }

  /* -------------------------------------------- */

  /**
   * Soft ping pong curve for photosensitive people.
   * @param {number} pt   The proportional animation timing on [0,1].
   * @returns {number}    The eased animation progress on [0,1].
   */
  static easePingPong(pt) {
    return Math.sin(Math.PI * pt);
  }

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /**
   * To avoid breaking dnd5e.
   * @deprecated since v12
   * @ignore
   */
  configureMesh() {}

  /**
   * To avoid breaking dnd5e.
   * @deprecated since v12
   * @ignore
   */
  configureNames() {}

}

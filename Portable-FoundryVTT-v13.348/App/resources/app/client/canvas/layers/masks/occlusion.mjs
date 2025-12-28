import CachedContainer from "../../containers/advanced/cached-container.mjs";

/**
 * The occlusion mask which contains radial occlusion and vision occlusion from tokens.
 * Red channel: Fade occlusion.
 * Green channel: Radial occlusion.
 * Blue channel: Vision occlusion.
 * @category Canvas
 */
export default class CanvasOcclusionMask extends CachedContainer {
  constructor(...args) {
    super(...args);
    this.#createOcclusion();
  }

  /** @override */
  static textureConfiguration = {
    scaleMode: PIXI.SCALE_MODES.NEAREST,
    format: PIXI.FORMATS.RGB,
    multisample: PIXI.MSAA_QUALITY.NONE
  };

  /**
   * Graphics in which token radial and vision occlusion shapes are drawn.
   * @type {PIXI.LegacyGraphics}
   */
  tokens;

  /**
   * The occludable tokens.
   * @type {Token[]}
   */
  #tokens;

  /** @override */
  clearColor = [0, 1, 1, 1];

  /** @override */
  autoRender = false;

  /**
   * The set of currently occluded canvas objects.
   * @type {Set<PrimaryCanvasObject>}
   */
  get occluded() {
    return this.#occluded;
  }
  #occluded = new Set();

  /* -------------------------------------------- */

  /**
   * Is vision occlusion active?
   * @type {boolean}
   */
  get vision() {
    return this.#vision;
  }

  /**
   * @type {boolean}
   */
  #vision = false;

  /**
   * The elevations of the elevation-to-depth mapping.
   * Supported are up to 255 unique elevations.
   * @type {Float64Array}
   */
  #elevations = new Float64Array([-Infinity]);

  /* -------------------------------------------- */

  /**
   * Initialize the depth mask with the roofs container and token graphics.
   */
  #createOcclusion() {
    this.alphaMode = PIXI.ALPHA_MODES.NO_PREMULTIPLIED_ALPHA;
    this.tokens = this.addChild(new PIXI.LegacyGraphics());
    this.tokens.blendMode = PIXI.BLEND_MODES.MIN_ALL;
  }

  /* -------------------------------------------- */

  /**
   * Clear the occlusion mask.
   * @override
   */
  clear() {
    this.tokens.clear();
    return this;
  }

  /* -------------------------------------------- */
  /*  Occlusion Management                        */
  /* -------------------------------------------- */

  /**
   * Map an elevation to a value in the range [0, 1] with 8-bit precision.
   * The radial and vision shapes are drawn with these values into the render texture.
   * @param {number} elevation    The elevation in distance units
   * @returns {number}            The value for this elevation in the range [0, 1] with 8-bit precision
   */
  mapElevation(elevation) {
    const E = this.#elevations;
    let i = 0;
    let j = E.length - 1;
    if ( elevation > E[j] ) return 1;
    while ( i < j ) {
      const k = (i + j) >> 1;
      const e = E[k];
      if ( e >= elevation ) j = k;
      else i = k + 1;
    }
    return i / 255;
  }

  /* -------------------------------------------- */

  /**
   * Update the set of occludable Tokens, redraw the occlusion mask, and update the occluded state
   * of all occludable objects.
   */
  updateOcclusion() {
    this.#tokens = canvas.tokens._getOccludableTokens();
    this._updateOcclusionMask();
    this._updateOcclusionStates();
  }

  /* -------------------------------------------- */

  /**
   * Draw occlusion shapes to the occlusion mask.
   * Fade occlusion draws to the red channel with varying intensity from [0, 1] based on elevation.
   * Radial occlusion draws to the green channel with varying intensity from [0, 1] based on elevation.
   * Vision occlusion draws to the blue channel with varying intensity from [0, 1] based on elevation.
   * @internal
   */
  _updateOcclusionMask() {
    this.#vision = false;
    this.tokens.clear();
    const elevations = [];
    for ( const token of this.#tokens.sort((a, b) => a.document.elevation - b.document.elevation) ) {
      const elevation = token.document.elevation;
      if ( elevation !== elevations.at(-1) ) elevations.push(elevation);
      const occlusionElevation = Math.min(elevations.length - 1, 255);

      // Draw vision occlusion
      if ( token.vision?.active ) {
        this.#vision = true;
        this.tokens.beginFill(0xFFFF00 | occlusionElevation).drawShape(token.vision.los).endFill();
      }

      // Draw radial occlusion (and radial into the vision channel if this token doesn't have vision)
      const origin = token.center;
      const occlusionRadius = Math.max(token.externalRadius, token.getLightRadius(token.document.occludable.radius));
      this.tokens.beginFill(0xFF0000 | (occlusionElevation << 8) | (token.vision?.active ? 0xFF : occlusionElevation))
        .drawCircle(origin.x, origin.y, occlusionRadius).endFill();
    }
    if ( !elevations.length ) elevations.push(-Infinity);
    else elevations.length = Math.min(elevations.length, 255);
    this.#elevations = new Float64Array(elevations);
    this.renderDirty = true;
  }

  /* -------------------------------------------- */

  /**
   * Update the current occlusion status of all Tile objects.
   * @internal
   */
  _updateOcclusionStates() {
    const occluded = this._identifyOccludedObjects(this.#tokens);
    for ( const pco of canvas.primary.children ) {
      const isOccludable = pco.isOccludable;
      if ( (isOccludable === undefined) || (!isOccludable && !pco.occluded) ) continue;
      pco.debounceSetOcclusion(occluded.has(pco));
    }
  }

  /* -------------------------------------------- */

  /**
   * Determine the set of objects which should be currently occluded by a Token.
   * @param {Token[]} tokens                   The set of currently controlled Token objects
   * @returns {Set<PrimaryCanvasObjectMixin>}  The PCO objects which should be currently occluded
   * @protected
   */
  _identifyOccludedObjects(tokens) {
    this.#occluded.clear();
    for ( const token of tokens ) {
      // Get the occludable primary canvas objects (PCO) according to the token bounds
      const matchingPCO = canvas.primary.quadtree.getObjects(token.bounds);
      for ( const pco of matchingPCO ) {
        // Don't bother re-testing a PCO or an object which is not occludable
        if ( !pco.isOccludable || this.#occluded.has(pco) ) continue;
        if ( pco.testOcclusion(token, {corners: pco.restrictsLight && pco.restrictsWeather}) ) this.#occluded.add(pco);
      }
    }
    return this.#occluded;
  }
}

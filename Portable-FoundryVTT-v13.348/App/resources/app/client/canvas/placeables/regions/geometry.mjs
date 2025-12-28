/**
 * @import Region from "../region.mjs";
 */

/**
 * The geometry of a {@link foundry.canvas.placeables.Region}.
 * - Vertex Attribute: `aVertexPosition` (`vec2`)
 * - Draw Mode: `PIXI.DRAW_MODES.TRIANGLES`
 */
export default class RegionGeometry extends PIXI.Geometry {

  /**
   * Create a RegionGeometry.
   * @param {Region} region    The Region to create the RegionGeometry from.
   * @internal
   */
  constructor(region) {
    super();
    this.#region = region;
    this.addAttribute("aVertexPosition", new PIXI.Buffer(new Float32Array(), true, false), 2);
    this.addIndex(new PIXI.Buffer(new Uint16Array(), true, true));
  }

  /* -------------------------------------------- */

  /**
   * The Region this geometry belongs to.
   * @type {Region}
   */
  get region() {
    return this.#region;
  }

  #region;

  /* -------------------------------------------- */

  /**
   * Do the buffers need to be updated?
   * @type {boolean}
   */
  #invalidBuffers = true;

  /* -------------------------------------------- */

  /**
   * Update the buffers.
   * @internal
   */
  _clearBuffers() {
    this.buffers[0].update(new Float32Array());
    this.indexBuffer.update(new Uint16Array());
    this.#invalidBuffers = true;
  }

  /* -------------------------------------------- */

  /**
   * Update the buffers.
   * @internal
   */
  _updateBuffers() {
    if ( !this.#invalidBuffers ) return;
    const triangulation = this.region.document.triangulation;
    this.buffers[0].update(triangulation.vertices);
    this.indexBuffer.update(triangulation.indices);
    this.#invalidBuffers = false;
  }
}

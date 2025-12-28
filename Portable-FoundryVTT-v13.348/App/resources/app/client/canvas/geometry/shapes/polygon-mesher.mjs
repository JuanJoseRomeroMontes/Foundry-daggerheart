/**
 * A helper class used to construct triangulated polygon meshes
 * Allow to add padding and a specific depth value.
 * @param {number[]|PIXI.Polygon} poly      Closed polygon to be processed and converted to a mesh
 *                                          (array of points or PIXI Polygon)
 * @param {object|{}} options               Various options : normalizing, offsetting, add depth, ...
 */
export default class PolygonMesher {
  constructor(poly, options = {}) {
    this.options = {...this.constructor._defaultOptions, ...options};
    const {normalize, x, y, radius, scale, offset} = this.options;

    // Creating the scaled values
    this.#scaled.sradius = radius * scale;
    this.#scaled.sx = x * scale;
    this.#scaled.sy = y * scale;
    this.#scaled.soffset = offset * scale;

    // Computing required number of pass (minimum 1)
    this.#nbPass = Math.ceil(Math.abs(offset) / 3);

    // Get points from poly param
    const points = poly instanceof PIXI.Polygon ? poly.points : poly;
    if ( !Array.isArray(points) ) {
      throw new Error("You must provide a Polygon or an array of vertices to the PolygonMesher constructor");
    }

    // Correcting normalize option if necessary. We can't normalize with a radius of 0.
    if ( normalize && (radius === 0) ) this.options.normalize = false;
    // Creating the mesh vertices
    this.#computePolygonMesh(points);
  }

  /**
   * Default options values
   * @type {Record<string,boolean|number>}
   */
  static _defaultOptions = {
    offset: 0,          // The position value in pixels
    normalize: false,   // Should the vertices be normalized?
    x: 0,               // The x origin
    y: 0,               // The y origin
    radius: 0,          // The radius
    depthOuter: 0,      // The depth value on the outer polygon
    depthInner: 1,      // The depth value on the inner(s) polygon(s)
    scale: 10e8,        // Constant multiplier to avoid floating point imprecision with ClipperLib
    miterLimit: 7,      // Distance of the miter limit, when sharp angles are cut during offsetting.
    interleaved: false  // Should the vertex data be interleaved into one VBO?
  };

  /* -------------------------------------------- */

  /**
   * Polygon mesh vertices
   * @type {number[]}
   */
  vertices = [];

  /**
   * Polygon mesh indices
   * @type {number[]}
   */
  indices = [];

  /**
   * Contains options to apply during the meshing process
   * @type {Record<string,boolean|number>}
   */
  options = {};

  /**
   * Contains some options values scaled by the constant factor
   * @type {Record<string,number>}
   */
  #scaled = {};

  /**
   * Polygon mesh geometry
   * @type {PIXI.Geometry}
   */
  #geometry = null;

  /**
   * Contain the polygon tree node object, containing the main forms and its holes and sub-polygons
   * @type {{poly: number[], nPoly: number[], children: object[]}}
   */
  #polygonNodeTree = null;

  /**
   * Contains the the number of offset passes required to compute the polygon
   * @type {number}
   */
  #nbPass;

  /* -------------------------------------------- */
  /*  Polygon Mesher static helper methods        */
  /* -------------------------------------------- */

  /**
   * Convert a flat points array into a 2 dimensional ClipperLib path
   * @param {number[]|PIXI.Polygon} poly             PIXI.Polygon or points flat array.
   * @param {number} [dimension=2]                   Dimension.
   * @returns {ClipperLib.Path|undefined}      The clipper lib path.
   */
  static getClipperPathFromPoints(poly, dimension = 2) {
    poly = poly instanceof PIXI.Polygon ? poly.points : poly;

    // If points is not an array or if its dimension is 1, 0 or negative, it can't be translated to a path.
    if ( !Array.isArray(poly) || dimension < 2 ) {
      throw new Error("You must provide valid coordinates to create a path.");
    }

    const path = new ClipperLib.Path();
    if ( poly.length <= 1 ) return path; // Returning an empty path if we have zero or one point.

    for ( let i = 0; i < poly.length; i += dimension ) {
      path.push(new ClipperLib.IntPoint(poly[i], poly[i + 1]));
    }
    return path;
  }

  /* -------------------------------------------- */
  /*  Polygon Mesher Methods                      */
  /* -------------------------------------------- */

  /**
   * Create the polygon mesh
   * @param {number[]} points
   */
  #computePolygonMesh(points) {
    if ( !points || points.length < 6 ) return;
    this.#updateVertices(points);
    this.#updatePolygonNodeTree();
  }

  /* -------------------------------------------- */

  /**
   * Update vertices and add depth
   * @param {number[]} vertices
   */
  #updateVertices(vertices) {
    const {offset, depthOuter, scale} = this.options;

    // Precompute the z value once
    const z = (offset === 0) ? 1.0 : depthOuter;

    // Reserve capacity if we know the size, for performance in some JS engines
    // Each point => 3 entries => (vertices.length/2 * 3)
    this.vertices = new Array((vertices.length / 2) * 3);

    // Fill
    let j = 0;
    for ( let i = 0; i < vertices.length; i += 2 ) {
      // Combine the scaling+rounding for x and y
      const x = Math.round(vertices[i] * scale);
      const y = Math.round(vertices[i + 1] * scale);

      this.vertices[j] = x;
      this.vertices[j + 1] = y;
      this.vertices[j + 2] = z;
      j += 3;
    }
  }

  /* -------------------------------------------- */

  /**
   * Create the polygon by generating the edges and the interior of the polygon if an offset != 0,
   * and just activate a fast triangulation if offset = 0
   */
  #updatePolygonNodeTree() {
    // Initializing the polygon node tree
    this.#polygonNodeTree = {poly: this.vertices, nPoly: this.#normalize(this.vertices), children: []};

    // Computing offset only if necessary
    if ( this.options.offset === 0 ) return this.#polygonNodeTree.fastTriangulation = true;

    // Creating the offsetter ClipperLib object, and adding our polygon path to it.
    const offsetter = new ClipperLib.ClipperOffset(this.options.miterLimit);
    // Launching the offset computation
    return this.#createOffsetPolygon(offsetter, this.#polygonNodeTree);
  }

  /* -------------------------------------------- */

  /**
   * Recursively create offset polygons in successive passes
   * @param {ClipperLib.ClipperOffset} offsetter    ClipperLib offsetter
   * @param {object} node                           A polygon node object to offset
   * @param {number} [pass=0]                       The pass number (initialized with 0 for the first call)
   */
  #createOffsetPolygon(offsetter, node, pass = 0) {
    // Time to stop recursion on this node branch?
    if ( pass >= this.#nbPass ) return;
    const path = PolygonMesher.getClipperPathFromPoints(node.poly, 3);                                   // Converting polygon points to ClipperLib path
    const passOffset = Math.round(this.#scaled.soffset / this.#nbPass);                                  // Mapping the offset for this path
    const depth = Math.mix(this.options.depthOuter, this.options.depthInner, (pass + 1) / this.#nbPass); // Computing depth according to the actual pass and maximum number of pass (linear interpolation)

    // Executing the offset
    const paths = new ClipperLib.Paths();
    offsetter.AddPath(path, ClipperLib.JoinType.jtMiter, ClipperLib.EndType.etClosedPolygon);
    offsetter.Execute(paths, passOffset);
    offsetter.Clear();

    // Verifying if we have pathes. If it's not the case, the area is too small to generate pathes with this offset.
    // It's time to stop recursion on this node branch.
    if ( !paths.length ) return;

    // Incrementing the number of pass to know when recursive offset should stop
    pass++;

    // Creating offsets for children
    for ( const path of paths ) {
      const flat = this.#flattenVertices(path, depth);
      const child = { poly: flat, nPoly: this.#normalize(flat), children: []};
      node.children.push(child);
      this.#createOffsetPolygon(offsetter, child, pass);
    }
  }

  /* -------------------------------------------- */

  /**
   * Flatten a ClipperLib path to array of numbers
   * @param {ClipperLib.IntPoint[]} path  path to convert
   * @param {number} depth                depth to add to the flattened vertices
   * @returns {number[]}                  flattened array of points
   */
  #flattenVertices(path, depth) {
    const n = path.length * 3;
    const flattened = new Array(n);
    let j = 0;
    for ( let i = 0; i < path.length; i++ ) {
      const {X, Y} = path[i];
      flattened[j] = X;
      flattened[j+1] = Y;
      flattened[j+2] = depth;
      j += 3;
    }
    return flattened;
  }

  /* -------------------------------------------- */

  /**
   * Normalize polygon coordinates and put result into nPoly property.
   * @param {number[]} poly       the poly to normalize
   * @returns {number[]}           the normalized poly array
   */
  #normalize(poly) {
    if ( !this.options.normalize ) return [];
    const {sx, sy, sradius} = this.#scaled;
    const nPoly = new Array(poly.length);
    for ( let i = 0; i < poly.length; i += 3 ) {
      const x = (poly[i] - sx) / sradius;
      const y = (poly[i+1] - sy) / sradius;
      nPoly[i]   = x;
      nPoly[i+1] = y;
      nPoly[i+2] = poly[i+2];
    }
    return nPoly;
  }

  /* -------------------------------------------- */

  /**
   * Execute the triangulation to create indices
   * @param {PIXI.Geometry} geometry    A geometry to update
   * @returns {PIXI.Geometry}           The resulting geometry
   */
  triangulate(geometry) {
    this.#geometry = geometry;
    // Can we draw at least one triangle (counting z now)? If not, update or create an empty geometry
    if ( this.vertices.length < 9 ) return this.#emptyGeometry();
    // Triangulate the mesh and create indices
    if ( this.#polygonNodeTree.fastTriangulation ) this.#triangulateFast();
    else this.#triangulateTree();
    // Update the geometry
    return this.#updateGeometry();
  }

  /* -------------------------------------------- */

  /**
   * Fast triangulation of the polygon node tree
   */
  #triangulateFast() {
    this.indices = PIXI.utils.earcut(this.vertices, null, 3);
    if ( this.options.normalize ) {
      this.vertices = this.#polygonNodeTree.nPoly;
    }
  }

  /* -------------------------------------------- */

  /**
   * Recursive triangulation of the polygon node tree
   */
  #triangulateTree() {
    this.vertices = [];
    this.indices = this.#triangulateNode(this.#polygonNodeTree);
  }

  /* -------------------------------------------- */

  /**
   * Triangulate a node and its children recursively to compose a mesh with multiple levels of depth.
   * Uses pre-allocated arrays instead of repeated push calls.
   * @param {object} node              The polygon node tree to triangulate
   * @param {number[]} [indices=[]]    An optional array to receive indices (used for recursion)
   * @returns {number[]}               The array of indices, result of the triangulation
   */
  #triangulateNode(node, indices=[]) {
    const {normalize} = this.options;
    const hasChildren = !!node.children.length;
    const polyLength = node.poly.length / 3;

    // If node.position is not set, mark it as 0 and copy node polygon into this.vertices
    if ( !node.position ) {
      node.position = 0;
      const poly = normalize ? node.nPoly : node.poly;
      const oldSize = this.vertices.length;
      this.vertices.length += poly.length;
      for ( let i = 0; i < poly.length; i++ ) {
        this.vertices[oldSize + i] = poly[i];
      }
    }

    // If no children, earcut immediately and return
    if ( !hasChildren ) {
      // Build local "vert" array for earcut
      const vert = new Array(node.poly.length);
      for ( let i = 0; i < node.poly.length; i++ ) {
        vert[i] = node.poly[i];
      }
      // Triangulate with earcut, offset the indices by node.position
      const earIndices = PIXI.utils.earcut(vert, null, 3);
      for ( let i = 0; i < earIndices.length; i++ ) {
        indices.push(earIndices[i] + node.position);
      }
      return indices;
    }

    // Has children => combine outer ring + children polygons
    // Compute total size (outer + each child)
    const {totalLength, childPolyCounts} = this.#computeCombinedLength(node);

    // Build the local 'vert' array
    const vert = new Array(totalLength);
    let vertPos = 0;
    // copy node.poly first
    for ( let i = 0; i < node.poly.length; i++ ) {
      vert[vertPos++] = node.poly[i];
    }

    // Prepare holes array
    const holes = [];
    let holePosition = polyLength;
    let holeGroupPosition = 0;

    // Copy each child's poly data into 'vert' and into 'this.vertices' if needed while also populating the holes array
    let childIndex = 0;
    for ( const nodeChild of node.children ) {
      holes.push(holePosition);
      nodeChild.position = (this.vertices.length / 3);

      // Store holeGroupPosition if not set
      if ( !holeGroupPosition ) holeGroupPosition = nodeChild.position;

      // childPolyCounts[childIndex]
      const cCount = childPolyCounts[childIndex++];
      holePosition += (cCount / 3);

      // copy child poly into local vert
      for ( let i = 0; i < cCount; i++ ) {
        vert[vertPos++] = nodeChild.poly[i];
      }

      // Also copy child data into this.vertices
      const poly = normalize ? nodeChild.nPoly : nodeChild.poly;
      const oldSize = this.vertices.length;
      this.vertices.length += poly.length;
      for ( let i = 0; i < poly.length; i++ ) {
        this.vertices[oldSize + i] = poly[i];
      }
    }

    // 4) Earcut pass for the combined outer+holes
    const holeGroupShift = holeGroupPosition - polyLength;
    const earIdx = earcut.earcutEdges(vert, holes);
    for ( let i = 0; i < earIdx.length; i++ ) {
      const v = earIdx[i];
      if ( v < polyLength ) indices.push(v + node.position);
      else indices.push(v + holeGroupShift);
    }

    // Recurse on each child
    for ( const nodeChild of node.children ) {
      this.#triangulateNode(nodeChild, indices);
    }
    return indices;
  }

  /* -------------------------------------------- */

  /**
   * Compute combined length of node.poly and all children polygons
   * @param {object} node
   * @returns {{totalLength: number, childPolyCounts: number[]}}
   */
  #computeCombinedLength(node) {
    // node.poly.length is the outer ring (3 floats per vertex)
    let totalLength = node.poly.length;

    // Store each child's length for easy reference
    const childPolyCounts = [];
    for ( const child of node.children ) {
      childPolyCounts.push(child.poly.length);
      totalLength += child.poly.length;
    }
    return {totalLength, childPolyCounts};
  }

  /* -------------------------------------------- */

  /**
   * Updating or creating the PIXI.Geometry that will be used by the mesh
   */
  #updateGeometry() {
    const {interleaved, normalize, scale} = this.options;

    // Unscale non normalized vertices
    if ( !normalize ) {
      for ( let i = 0; i < this.vertices.length; i+=3 ) {
        this.vertices[i] /= scale;
        this.vertices[i+1] /= scale;
      }
    }

    // If VBO shouldn't be interleaved, we create a separate array for vertices and depth
    let vertices; let depth;
    if ( !interleaved ) {
      const count = this.vertices.length / 3;
      vertices = new Array(count * 2);
      depth = new Array(count);

      let idxV = 0;
      let idxD = 0;
      for ( let i = 0; i < this.vertices.length; i += 3 ) {
        vertices[idxV++] = this.vertices[i];
        vertices[idxV++] = this.vertices[i + 1];
        depth[idxD++] = this.vertices[i + 2];
      }
    }
    else vertices = this.vertices;

    if ( this.#geometry ) {
      const vertBuffer = this.#geometry.getBuffer("aVertexPosition");
      vertBuffer.update(new Float32Array(vertices));
      const indicesBuffer = this.#geometry.getIndex();
      indicesBuffer.update(new Uint16Array(this.indices));
      if ( !interleaved ) {
        const depthBuffer = this.#geometry.getBuffer("aDepthValue");
        depthBuffer.update(new Float32Array(depth));
      }
    }
    else this.#geometry = this.#createGeometry(vertices, depth);
    return this.#geometry;
  }

  /* -------------------------------------------- */

  /**
   * Empty the geometry, or if geometry is null, create an empty geometry.
   */
  #emptyGeometry() {
    const {interleaved} = this.options;

    // Empty the current geometry if it exists
    if ( this.#geometry ) {
      const vertBuffer = this.#geometry.getBuffer("aVertexPosition");
      // Already empty? If yes, skip update and return geometry
      if ( vertBuffer.data.length === 2 ) return this.#geometry;
      vertBuffer.update(new Float32Array([0, 0]));
      const indicesBuffer = this.#geometry.getIndex();
      indicesBuffer.update(new Uint16Array([0, 0]));
      if ( !interleaved ) {
        const depthBuffer = this.#geometry.getBuffer("aDepthValue");
        depthBuffer.update(new Float32Array([0]));
      }
      return this.#geometry;
    }

    // If geometry doesn't exist, create an empty geometry
    if ( interleaved ) {
      return new PIXI.Geometry().addAttribute("aVertexPosition", [0, 0, 0], 3).addIndex([0, 0]);
    }
    else {
      this.#geometry = new PIXI.Geometry().addAttribute("aVertexPosition", [0, 0], 2)
      .addAttribute("aTextureCoord", [0, 0, 0, 1, 1, 1, 1, 0], 2)
      .addAttribute("aDepthValue", [0], 1)
      .addIndex([0, 0]);
    }
    return this.#geometry;
  }

  /* -------------------------------------------- */

  /**
   * Create a new Geometry from provided buffers
   * @param {number[]} vertices                 provided vertices array (interleaved or not)
   * @param {number[]} [depth=undefined]        provided depth array
   * @param {number[]} [indices=this.indices]   provided indices array
   * @returns {PIXI.Geometry}                    the new PIXI.Geometry constructed from the provided buffers
   */
  #createGeometry(vertices, depth=undefined, indices=this.indices) {
    if ( this.options.interleaved ) {
      return new PIXI.Geometry().addAttribute("aVertexPosition", vertices, 3).addIndex(indices);
    }
    if ( !depth ) throw new Error("You must provide a separate depth buffer when the data is not interleaved.");
    return new PIXI.Geometry()
    .addAttribute("aVertexPosition", vertices, 2)
    .addAttribute("aTextureCoord", [0, 0, 1, 0, 1, 1, 0, 1], 2)
    .addAttribute("aDepthValue", depth, 1)
    .addIndex(indices);
  }
}

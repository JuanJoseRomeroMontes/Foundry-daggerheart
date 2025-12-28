import TextureCompressor from "./workers/texture-worker.mjs";

/**
 * A class or interface that provide support for WebGL async read pixel/texture data extraction.
 */
export default class TextureExtractor {
  /**
   * @param {PIXI.Renderer} renderer                           The renderer
   * @param {object} [config={}]                               Worker initialization options
   * @param {PIXI.FORMATS} [config.format=PIXI.FORMATS.RED]    The texture format
   * @param {boolean} [config.controlHash=false]               Should use control hash?
   * @param {string} [config.callerName="TextureExtractor"]    The caller name
   * @param {boolean} [config.debug=false]                     Enable debug log?
   */
  constructor(renderer, {format=PIXI.FORMATS.RED, controlHash=false, callerName="TextureExtractor", debug=false}={}) {
    this.#renderer = renderer;
    this.#callerName = callerName;
    this.#compressor = new TextureCompressor(`TextureCompressor of ${callerName}`, {controlHash});

    // Verify that the required format is supported by the texture extractor
    if ( !((format === PIXI.FORMATS.RED) || (format === PIXI.FORMATS.RGBA)) ) {
      throw new Error("TextureExtractor supports format RED and RGBA only.");
    }

    // Assign format, types, and read mode
    this.#format = format;
    this.#type = PIXI.TYPES.UNSIGNED_BYTE;
    this.#readFormat = (((format === PIXI.FORMATS.RED) && !canvas.supported.readPixelsRED)
      || format === PIXI.FORMATS.RGBA) ? PIXI.FORMATS.RGBA : PIXI.FORMATS.RED;

    // We need to intercept context change
    this.#renderer.runners.contextChange.add(this);
  }

  /**
   * List of compression that could be applied with extraction
   * @enum {number}
   */
  static COMPRESSION_MODES = {
    NONE: 0,
    BASE64: 1
  };

  /**
   * The WebGL2 renderer.
   * @type {Renderer}
   */
  get renderer() {
    return this.#renderer;
  }

  #renderer;

  /**
   * The reference to a WebGL2 sync object.
   * @type {WebGLSync}
   */
  #glSync;

  /**
   * The texture format on which the Texture Extractor must work.
   * @type {PIXI.FORMATS}
   */
  get format() {
    return this.#format;
  }

  #format;

  /**
   * The texture type on which the Texture Extractor must work.
   * @type {PIXI.TYPES}
   */
  get type() {
    return this.#type;
  }

  #type;

  /**
   * The texture format on which the Texture Extractor should read.
   * @type {PIXI.FORMATS}
   */
  #readFormat;

  /**
   * The reference to the GPU buffer.
   * @type {WebGLBuffer}
   */
  #gpuBuffer;

  /**
   * To know if we need to create a GPU buffer.
   * @type {boolean}
   */
  #createBuffer = true;

  /**
   * Debug flag.
   * @type {boolean}
   */
  debug = false;

  /**
   * The reference to the pixel buffer.
   * @type {Uint8ClampedArray}
   */
  #pixelBuffer = new Uint8ClampedArray();

  /**
   * The width of the pixel buffer.
   * @type {number}
   */
  #pixelWidth = 0;

  /**
   * The height of the pixel buffer.
   * @type {number}
   */
  #pixelHeight = 0;

  /**
   * The pixel hash.
   * @type {string}
   */
  #pixelHash;

  /**
   * The caller name associated with this instance of texture extractor (optional, used for debug)
   * @type {string}
   */
  #callerName;

  /**
   * Generated RenderTexture for textures.
   * @type {PIXI.RenderTexture}
   */
  #generatedRenderTexture;

  /**
   * The base texture of the last extraction.
   * @type {WeakRef<PIXI.BaseTexture>}
   */
  #lastBaseTexture = null;

  /**
   * The dirtyId of the base texture of the last extraction.
   * @type {number}
   */
  #lastBaseTextureDirtyId = -1;

  /**
   * The frame of the last extraction.
   * @type {PIXI.Rectangle}
   */
  #lastFrame = new PIXI.Rectangle();

  /* -------------------------------------------- */
  /*  TextureExtractor Compression Worker         */
  /* -------------------------------------------- */

  /**
   * The compressor worker wrapper
   * @type {TextureCompressor}
   */
  #compressor;

  /* -------------------------------------------- */
  /*  TextureExtractor Properties                 */
  /* -------------------------------------------- */

  /**
   * Returns the read buffer width/height multiplier.
   * @returns {number}
   */
  get #readBufferMul() {
    return this.#readFormat === PIXI.FORMATS.RED ? 1 : 4;
  }

  /* -------------------------------------------- */
  /*  TextureExtractor Synchronization            */
  /* -------------------------------------------- */

  /**
   * Handling of the concurrency for the extraction (by default a queue of 1)
   * @type {Semaphore}
   */
  #queue = new foundry.utils.Semaphore();

  /* -------------------------------------------- */

  /**
   * @typedef TexturePixelsExtractionOptions
   * @property {PIXI.Texture|PIXI.RenderTexture} [texture]        The texture the pixels are extracted from.
   * @property {PIXI.Rectangle} [frame]                           The rectangle which the pixels are extracted from.
   * @property {0} [compression]                                  The NONE compression mode.
   * @property {ArrayBuffer} [out]                                The optional output buffer to write the pixels to.
   *                                                              May be detached.
   *                                                              The (new) output buffer is returned.
   */

  /**
   * @typedef TextureBase64ExtractionOptions
   * @property {PIXI.Texture|PIXI.RenderTexture} [texture]        The texture the pixels are extracted from.
   * @property {PIXI.Rectangle} [frame]                           The rectangle which the pixels are extracted from.
   * @property {1} compression                                    The BASE64 compression mode.
   * @property {string} [type="image/png"]                        The optional image mime type. Default: `"image/png"`.
   * @property {number} [quality=1]                               The optional image quality. Default: `1`.
   */

  /**
   * Extract a rectangular block of pixels from the texture (without un-pre-multiplying).
   * @overload
   * @param {TexturePixelsExtractionOptions} options    Options which configure pixels extraction behavior
   * @returns {Promise<{pixels: Uint8ClampedArray|undefined, width: number, height: number, out?: ArrayBuffer}>}
   *   The pixels or undefined if there's no change compared to the last time pixels were extracted and
   *   the control hash option is enabled. If an output buffer was passed, the (new) output buffer is included
   *   in the result, which may be different from the output buffer that was passed because it was detached.
   */
  /**
   * @overload
   * @param {TextureBase64ExtractionOptions} options    Options which configure base64 extraction behavior
   * @returns {Promise<string|undefined>}    The base64 string or undefined if there's no change compared
   *   to the last time base64 was extracted and the control hash option is enabled.
   */
  async extract(options={}) {
    return this.#queue.add(this.#extract.bind(this), options);
  }

  /* -------------------------------------------- */
  /*  TextureExtractor Methods/Interface          */
  /* -------------------------------------------- */

  /**
   * Extract a rectangular block of pixels from the texture (without un-pre-multiplying).
   * @overload
   * @param {TexturePixelsExtractionOptions} options    Options which configure pixels extraction behavior
   * @returns {Promise<{pixels: Uint8ClampedArray|undefined, width: number, height: number, out?: ArrayBuffer}>}
   *   The pixels or undefined if there's no change compared to the last time pixels were extracted and
   *   the control hash option is enabled. If an output buffer was passed, the (new) output buffer is included
   *   in the result, which may be different from the output buffer that was passed because it was detached.
   */
  /**
   * @overload
   * @param {TextureBase64ExtractionOptions} options    Options which configure base64 extraction behavior
   * @returns {Promise<string|undefined>}         The base64 string or undefined if there's no change compared
   *   to the last time base64 was extracted and the control hash option is enabled.
   */
  async #extract({texture, frame, compression, type, quality, out}={}) {
    if ( this.debug ) this.#consoleDebug("Begin texture extraction.");

    // Checking texture validity
    const baseTexture = texture?.baseTexture;
    if ( texture && (!baseTexture || !baseTexture.valid || baseTexture.parentTextureArray) ) {
      throw new Error("Texture passed to extractor is invalid.");
    }

    // Checking if texture is in RGBA format and premultiplied
    if ( texture && (texture.baseTexture.alphaMode > 0) && (texture.baseTexture.format === PIXI.FORMATS.RGBA) ) {
      throw new Error("Texture Extractor is not supporting premultiplied textures yet.");
    }

    // Check if pixels need to be read again
    let readPixels = true;
    if ( this.#lastBaseTexture ) {
      const lastBaseTexture = this.#lastBaseTexture.deref();
      const {x, y, width, height} = frame ?? texture.frame;
      if ( (lastBaseTexture === baseTexture) && (this.#lastBaseTextureDirtyId === baseTexture.dirtyId) ) {
        if ( (this.#lastFrame.x === x)
          && (this.#lastFrame.y === y)
          && (this.#lastFrame.width === width)
          && (this.#lastFrame.height === height) ) {
          readPixels = false;
        }
      }
    }

    let data;
    if ( readPixels ) {
      this.#lastBaseTexture = new WeakRef(baseTexture);
      this.#lastBaseTextureDirtyId = baseTexture.dirtyId;
      this.#lastFrame.copyFrom(frame ?? texture.frame);
      this.#pixelHash = undefined;

      const generateTexture = !((texture instanceof PIXI.RenderTexture) && ((baseTexture.format === this.#format)
        || (this.#readFormat === PIXI.FORMATS.RGBA)) && (baseTexture.type === this.#type));
      if ( generateTexture ) {
        texture = this.#generatedRenderTexture = this.#renderer.generateTexture(new PIXI.Sprite(texture), {
          format: this.#format,
          type: this.#type,
          resolution: baseTexture.resolution,
          multisample: PIXI.MSAA_QUALITY.NONE
        });
      }

      data = await this.#readPixels(texture, frame ?? texture.frame, texture.resolution);
    }
    else data = {buffer: this.#pixelBuffer, width: this.#pixelWidth, height: this.#pixelHeight};

    // Return the compressed image or the raw buffer
    let returnValue;
    if ( compression ) {
      returnValue = await this.#compressBuffer(data.buffer, data.width, data.height, {compression, type, quality});
    } else if ( (this.#format === PIXI.FORMATS.RED) && (this.#readFormat === PIXI.FORMATS.RGBA) ) {
      const result = await this.#compressor.reduceBufferRGBAToBufferRED(data.buffer, data.width, data.height,
        {out, hash: this.#pixelHash, debug: this.debug});
      // Returning control of the buffer to the extractor
      this.#pixelBuffer = result.buffer;
      this.#pixelHash = result.hash;
      returnValue = {pixels: result.redBuffer, width: data.width, height: data.height};
      if ( out ) returnValue.out = result.out;
    } else {
      const result = await this.#compressor.copyBuffer(data.buffer, {out, hash: this.#pixelHash, debug: this.debug});
      // Returning control of the buffer to the extractor
      this.#pixelBuffer = result.buffer;
      this.#pixelHash = result.hash;
      returnValue = {pixels: result.copy, width: data.width, height: data.height};
      if ( out ) returnValue.out = result.out;
    }
    if ( this.debug ) {
      if ( returnValue ) this.#consoleDebug("Texture extraction done.");
      else this.#consoleDebug("Texture extraction done. No change.");
    }
    return returnValue;
  }

  /* -------------------------------------------- */

  /**
   * Free all the bound objects.
   */
  reset() {
    if ( this.debug ) this.#consoleDebug("Data reset.");
    this.#clear({buffer: true, syncObject: true, rt: true});
  }

  /* -------------------------------------------- */

  /**
   * Destroy this TextureExtractor.
   */
  destroy() {
    if ( this.debug ) this.#consoleDebug("Destroyed.");
    this.#clear({buffer: true, syncObject: true, rt: true});
    this.#renderer.runners.contextChange.remove(this);
    this.#compressor.terminate();
  }

  /* -------------------------------------------- */

  /**
   * Called by the renderer contextChange runner.
   */
  contextChange() {
    if ( this.debug ) this.#consoleDebug("WebGL context has changed.");
    this.#glSync = undefined;
    this.#generatedRenderTexture = undefined;
    this.#gpuBuffer = undefined;
    this.#pixelBuffer = new Uint8ClampedArray();
    this.#pixelWidth = 0;
    this.#pixelHeight = 0;
    this.#createBuffer = true;
  }

  /* -------------------------------------------- */
  /*  TextureExtractor Management                 */
  /* -------------------------------------------- */


  /**
   * Compress the buffer and returns a base64 image.
   * @param {*} args
   * @returns {Promise<string>}
   */
  async #compressBuffer(...args) {
    if ( canvas.supported.offscreenCanvas ) return this.#compressBufferWorker(...args);
    else return this.#compressBufferLocal(...args);
  }

  /* -------------------------------------------- */

  /**
   * Compress the buffer into a worker and returns a base64 image
   * @param {Uint8ClampedArray} buffer          Buffer to convert into a compressed base64 image.
   * @param {number} width                      Width of the image.
   * @param {number} height                     Height of the image.
   * @param {object} [options]
   * @param {string} [options.type="image/png"] Format of the image.
   * @param {number} [options.quality=1]        Quality of the compression.
   * @returns {Promise<string>}
   */
  async #compressBufferWorker(buffer, width, height, {type, quality}={}) {
    let result;
    try {
      // Launch compression
      result = await this.#compressor.compressBufferBase64(buffer, width, height,
        {type, quality, hash: this.#pixelHash, debug: this.debug});
    }
    catch(e) {
      this.#consoleError("Buffer compression has failed!");
      throw e;
    }
    // Returning control of the buffer to the extractor
    this.#pixelBuffer = result.buffer;
    this.#pixelHash = result.hash;
    // Returning the result
    return result.base64img;
  }

  /* -------------------------------------------- */

  /**
   * Compress the buffer locally (but expand the buffer into a worker) and returns a base64 image.
   * The image format is forced to jpeg.
   * @param {Uint8ClampedArray} buffer          Buffer to convert into a compressed base64 image.
   * @param {number} width                      Width of the image.
   * @param {number} height                     Height of the image.
   * @param {object} [options]
   * @param {string} [options.type="image/png"] Format of the image.
   * @param {number} [options.quality=1]        Quality of the compression.
   * @returns {Promise<string>}
   */
  async #compressBufferLocal(buffer, width, height, {type="image/png", quality=1}={}) {
    let rgbaBuffer;
    if ( this.#readFormat === PIXI.FORMATS.RED ) {
      let result;
      try {
        // Launch buffer expansion on the worker thread
        result = await this.#compressor.expandBufferRedToBufferRGBA(buffer, width, height,
          {hash: this.#pixelHash, debug: this.debug});
      } catch(e) {
        this.#consoleError("Buffer expansion has failed!");
        throw e;
      }
      // Returning control of the buffer to the extractor
      this.#pixelBuffer = result.buffer;
      this.#pixelHash = result.hash;
      rgbaBuffer = result.rgbaBuffer;
    } else {
      rgbaBuffer = buffer;
    }
    if ( !rgbaBuffer ) return;

    // Proceed at the compression locally and return the base64 image
    const element = foundry.helpers.media.ImageHelper.pixelsToCanvas(rgbaBuffer, width, height);
    return await foundry.helpers.media.ImageHelper.canvasToBase64(element, type, quality);
  }

  /* -------------------------------------------- */

  /**
   * Prepare data for the asynchronous readPixel.
   * @param {PIXI.RenderTexture} texture
   * @param {PIXI.Rectangle} frame
   * @param {number} resolution
   * @returns {object}
   */
  async #readPixels(texture, frame, resolution) {

    // Bind the texture
    this.#renderer.renderTexture.bind(texture);

    const gl = this.#renderer.gl;

    // Set dimensions and buffer size
    const x = Math.round(frame.left * resolution);
    const y = Math.round(frame.top * resolution);
    const width = this.#pixelWidth = Math.round(frame.width * resolution);
    const height = this.#pixelHeight = Math.round(frame.height * resolution);
    const bufSize = width * height * this.#readBufferMul;

    // Set format and type needed for the readPixel command
    const format = this.#readFormat;
    const type = gl.UNSIGNED_BYTE;

    // Useful debug information
    if ( this.debug ) console.table({x, y, width, height, bufSize, format, type, extractorFormat: this.#format});

    // The buffer that will hold the pixel data
    const pixels = this.#getPixelCache(bufSize);

    // Start the non-blocking read
    // Create or reuse the GPU buffer and bind as buffer data
    if ( this.#createBuffer ) {
      if ( this.debug ) this.#consoleDebug("Creating buffer.");
      this.#createBuffer = false;
      if ( this.#gpuBuffer ) this.#clear({buffer: true});
      this.#gpuBuffer = gl.createBuffer();
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.#gpuBuffer);
      gl.bufferData(gl.PIXEL_PACK_BUFFER, pixels.buffer.byteLength, gl.DYNAMIC_READ);
    }
    else {
      if ( this.debug ) this.#consoleDebug("Reusing cached buffer.");
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.#gpuBuffer);
    }

    // Performs read pixels GPU Texture -> GPU Buffer
    gl.pixelStorei(gl.PACK_ALIGNMENT, 1);
    gl.readPixels(x, y, width, height, format, type, 0);
    gl.pixelStorei(gl.PACK_ALIGNMENT, 4);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);

    // Declare the sync object
    this.#glSync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);

    // Flush all pending gl commands, including the commands above (important: flush is non blocking)
    // The glSync will be complete when all commands will be executed
    gl.flush();

    // Waiting for the sync object to resolve
    await this.#wait();

    // Retrieve the GPU buffer data
    const data = this.#getGPUBufferData(pixels, width, height);

    // Clear the sync object and possible generated render texture
    this.#clear({syncObject: true, rt: true});

    // Return the data
    if ( this.debug ) this.#consoleDebug("Buffer data sent to caller.");

    return data;
  }

  /* -------------------------------------------- */

  /**
   * Retrieve the content of the GPU buffer and put it pixels.
   * Returns an object with the pixel buffer and dimensions.
   * @param {Uint8ClampedArray} buffer                        The pixel buffer.
   * @param {number} width                                    The width of the texture.
   * @param {number} height                                   The height of the texture.
   * @returns {object<Uint8ClampedArray, number, number>}
   */
  #getGPUBufferData(buffer, width, height) {
    const gl = this.#renderer.gl;

    // Retrieve the GPU buffer data
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.#gpuBuffer);
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, buffer, 0, buffer.length);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);

    return {buffer, width, height};
  }

  /* -------------------------------------------- */

  /**
   * Retrieve a pixel buffer of the given length.
   * A cache is provided for the last length passed only (to avoid too much memory consumption)
   * @param {number} length           Length of the required buffer.
   * @returns {Uint8ClampedArray}     The cached or newly created buffer.
   */
  #getPixelCache(length) {
    if ( this.#pixelBuffer.buffer.byteLength < length ) {
      this.#pixelBuffer = new Uint8ClampedArray(length);
      // If the pixel cache need to be (re)created, the same for the GPU buffer
      this.#createBuffer = true;
    } else if ( this.#pixelBuffer.length !== length ) {
      this.#pixelBuffer = new Uint8ClampedArray(this.#pixelBuffer.buffer, 0, length);
    }
    return this.#pixelBuffer;
  }

  /* -------------------------------------------- */

  /**
   * Wait for the synchronization object to resolve.
   * @returns {Promise}
   */
  async #wait() {
    // Preparing data for testFence
    const gl = this.#renderer.gl;
    const sync = this.#glSync;

    // Prepare for fence testing
    const result = await new Promise((resolve, reject) => {
      /**
       * Test the fence sync object
       */
      function wait() {
        const res = gl.clientWaitSync(sync, 0, 0);
        if ( res === gl.WAIT_FAILED ) {
          reject(false);
          return;
        }
        if ( res === gl.TIMEOUT_EXPIRED ) {
          setTimeout(wait, 10);
          return;
        }
        resolve(true);
      }
      wait();
    });

    // The promise was rejected?
    if ( !result ) {
      this.#clear({buffer: true, syncObject: true, data: true, rt: true});
      throw new Error("The sync object has failed to wait.");
    }
  }

  /* -------------------------------------------- */

  /**
   * Clear some key properties.
   * @param {object} options
   * @param {boolean} [options.buffer=false]
   * @param {boolean} [options.syncObject=false]
   * @param {boolean} [options.rt=false]
   */
  #clear({buffer=false, syncObject=false, rt=false}={}) {
    if ( syncObject && this.#glSync ) {
      // Delete the sync object
      this.#renderer.gl.deleteSync(this.#glSync);
      this.#glSync = undefined;
      if ( this.debug ) this.#consoleDebug("Free the sync object.");
    }
    if ( buffer ) {
      // Delete the buffers
      if ( this.#gpuBuffer ) {
        this.#renderer.gl.deleteBuffer(this.#gpuBuffer);
        this.#gpuBuffer = undefined;
      }
      this.#pixelBuffer = new Uint8ClampedArray();
      this.#pixelWidth = 0;
      this.#pixelHeight = 0;
      this.#createBuffer = true;
      if ( this.debug ) this.#consoleDebug("Free the cached buffers.");
    }
    if ( rt && this.#generatedRenderTexture ) {
      // Delete the generated render texture
      this.#generatedRenderTexture.destroy(true);
      this.#generatedRenderTexture = undefined;
      if ( this.debug ) this.#consoleDebug("Destroy the generated render texture.");
    }
  }

  /* -------------------------------------------- */

  /**
   * Convenience method to display the debug messages with the extractor.
   * @param {string} message      The debug message to display.
   */
  #consoleDebug(message) {
    console.debug(`${this.#callerName} | ${message}`);
  }

  /* -------------------------------------------- */

  /**
   * Convenience method to display the error messages with the extractor.
   * @param {string} message      The error message to display.
   */
  #consoleError(message) {
    console.error(`${this.#callerName} | ${message}`);
  }
}

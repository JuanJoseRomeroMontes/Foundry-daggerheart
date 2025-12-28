import {AsyncWorker} from "../../helpers/workers.mjs";

/**
 * Wrapper for a web worker meant to convert a pixel buffer to the specified image format
 * and quality and return a base64 image.
 */
export default class TextureCompressor extends AsyncWorker {
  /**
   * @param {string} [name="TextureCompressor"]      The worker name to be initialized
   * @param {object} [config]                        Worker initialization options
   * @param {boolean} [config.controlHash=false]     Should use control hash?
   * @param {boolean} [config.debug=false]           Should the worker run in debug mode?
   */
  constructor(name="TextureCompressor", config={}) {
    config.debug ??= false;
    config.scripts ??= ["/scripts/workers/image-compressor.js", "/scripts/spark-md5.min.js"];
    config.loadPrimitives ??= false;
    super(name, config);

    // Do we need to control the hash?
    this.#controlHash = config.controlHash ?? false;
  }

  /**
   * Boolean to know if the texture compressor should control the hash.
   * @type {boolean}
   */
  #controlHash;

  /**
   * Previous compressBufferBase64 hash.
   * @type {string}
   */
  #compressBufferBase64Hash = "";

  /**
   * Previous expandBufferRedToBufferRGBA hash.
   * @type {string}
   */
  #expandBufferRedToBufferRGBAHash = "";

  /**
   * Previous texture hash.
   * @type {string}
   */
  #reduceBufferRGBAToBufferREDHash = "";

  /**
   * Previous copyBufferHash hash.
   * @type {string}
   */
  #copyBufferHash = "";

  /* -------------------------------------------- */

  /**
   * Process the non-blocking image compression to a base64 string.
   * @param {Uint8ClampedArray} buffer                      Buffer used to create the image data.
   * @param {number} width                                  Buffered image width.
   * @param {number} height                                 Buffered image height.
   * @param {object} [options]
   * @param {string} [options.hash]                         The precomputed hash.
   * @param {boolean} [options.debug]                       The debug option.
   * @returns {Promise<*>}
   */
  async compressBufferBase64(buffer, width, height, options={}) {
    const params = {buffer, width, height, debug: options.debug};
    if ( this.#controlHash ) {
      if ( options.hash === this.#compressBufferBase64Hash ) {
        if ( options.debug ) console.debug("Compression | Skipped. Texture buffer has not changed.");
        return {base64img: undefined, buffer, hash: options.hash};
      }
      params.hash = options.hash ?? this.#compressBufferBase64Hash;
      params.skipHash = !!options.hash;
    }
    const result = await this.executeFunction("processBufferToBase64", [params], [buffer.buffer]);
    if ( result.hash ) this.#compressBufferBase64Hash = result.hash;
    return result;
  }

  /* -------------------------------------------- */

  /**
   * Expand a buffer in RED format to a buffer in RGBA format.
   * @param {Uint8ClampedArray} buffer               Buffer used to create the image data.
   * @param {number} width                           Buffered image width.
   * @param {number} height                          Buffered image height.
   * @param {object} [options]
   * @param {ArrayBuffer} [options.out]              The output buffer to write the expanded pixels to. May be detached.
   * @param {string} [options.hash]                  The precomputed hash.
   * @param {boolean} [options.debug]                The debug option.
   * @returns {Promise<unknown>}
   */
  async expandBufferRedToBufferRGBA(buffer, width, height, options={}) {
    if ( options.out?.byteLength < (buffer.length * 4) ) throw new Error("Output buffer is too small");
    const params = {buffer, width, height, out: options.out, debug: options.debug};
    if ( this.#controlHash ) {
      if ( options.hash === this.#expandBufferRedToBufferRGBAHash ) {
        if ( options.debug ) console.debug("Compression | Skipped. Texture buffer has not changed.");
        return {rgbaBuffer: undefined, buffer, out: options.out, hash: options.hash};
      }
      params.hash = options.hash ?? this.#expandBufferRedToBufferRGBAHash;
      params.skipHash = !!options.hash;
    }
    const transfer = [buffer.buffer];
    if ( options.out ) transfer.push(options.out);
    const result = await this.executeFunction("processBufferRedToBufferRGBA", [params], transfer);
    if ( result.hash ) this.#expandBufferRedToBufferRGBAHash = result.hash;
    return result;
  }

  /* -------------------------------------------- */

  /**
   * Reduce a buffer in RGBA format to a buffer in RED format.
   * @param {Uint8ClampedArray} buffer                Buffer used to create the image data.
   * @param {number} width                            Buffered image width.
   * @param {number} height                           Buffered image height.
   * @param {object} [options]
   * @param {ArrayBuffer} [options.out]               The output buffer to write the reduced pixels to. May be detached.
   * @param {string} [options.hash]                   The precomputed hash.
   * @param {boolean} [options.debug]                 The debug option.
   * @returns {Promise<unknown>}
   */
  async reduceBufferRGBAToBufferRED(buffer, width, height, options={}) {
    if ( options.out?.byteLength < (buffer.length / 4) ) throw new Error("Output buffer is too small");
    const params = {buffer, width, height, out: options.out, debug: options.debug};
    if ( this.#controlHash ) {
      if ( options.hash === this.#reduceBufferRGBAToBufferREDHash ) {
        if ( options.debug ) console.debug("Compression | Skipped. Texture buffer has not changed.");
        return {redBuffer: undefined, buffer, out: options.out, hash: options.hash};
      }
      params.hash = options.hash ?? this.#reduceBufferRGBAToBufferREDHash;
      params.skipHash = !!options.hash;
    }
    const transfer = [buffer.buffer];
    if ( options.out ) transfer.push(options.out);
    const result = await this.executeFunction("processBufferRGBAToBufferRED", [params], transfer);
    if ( result.hash ) this.#reduceBufferRGBAToBufferREDHash = result.hash;
    return result;
  }

  /* -------------------------------------------- */

  /**
   * Copy a buffer.
   * @param {Uint8ClampedArray} buffer                      Buffer used to create the image data.
   * @param {object} [options]
   * @param {ArrayBuffer} [options.out]                     The output buffer to copy the pixels to. May be detached.
   * @param {string} [options.hash]                         The precomputed hash.
   * @param {boolean} [options.debug]                       The debug option.
   * @returns {Promise<unknown>}
   */
  async copyBuffer(buffer, options={}) {
    if ( options.out?.byteLength < buffer.length ) throw new Error("Output buffer is too small");
    if ( !this.#controlHash ) {
      let copy;
      if ( !options.out ) copy = new Uint8ClampedArray(buffer);
      else {
        copy = new Uint8ClampedArray(options.out, 0, buffer.length);
        copy.set(buffer);
      }
      return {copy, buffer, out: options.out, hash: undefined};
    }
    if ( options.hash === this.#copyBufferHash ) {
      if ( options.debug ) console.debug("Compression | Skipped. Texture buffer has not changed.");
      return {copy: undefined, buffer, out: options.out, hash: options.hash};
    }
    if ( options.hash ) {
      let copy;
      if ( !options.out ) copy = new Uint8ClampedArray(buffer);
      else {
        copy = new Uint8ClampedArray(options.out, 0, buffer.length);
        copy.set(buffer);
      }
      return {copy, buffer, out: options.out, hash: options.hash};
    }
    const params = {buffer, out: options.out, hash: this.#copyBufferHash, skipHash: false, debug: options.debug};
    const transfer = [buffer.buffer];
    if ( options.out ) transfer.push(options.out);
    const result = await this.executeFunction("copyBuffer", [params], transfer);
    if ( result.hash ) this.#copyBufferHash = result.hash;
    return result;
  }
}

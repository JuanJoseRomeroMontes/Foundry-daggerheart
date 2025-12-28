/* -------------------------------------------- */
/*  Constants                                   */
/* -------------------------------------------- */

/**
 * Some texture formats
 * @enum {number}
 */
const FORMATS = {
  RED: 6403,
  RGBA: 6408
};

/* -------------------------------------------- */
/*  Image Compressor Worker Functions           */
/* -------------------------------------------- */

/**
 * Process the image compression.
 * @param {object} options
 * @param {Uint8ClampedArray} options.buffer              Buffer used to create the image data.
 * @param {number} options.width                          Buffered image width.
 * @param {number} options.height                         Buffered image height.
 * @param {string} [options.type="image/png"]             The required image type.
 * @param {number} [options.quality=1]                      The required image quality.
 * @param {string} [options.hash]                         Hash to test.
 * @param {boolean} [options.skipHash]                    Skip hash?
 * @param {boolean} [options.debug]                       The debug option.
 * @returns {[result: object, transfer: object[]]}
 */
async function processBufferToBase64({buffer, width, height, type="image/png", quality=1, hash, skipHash, debug}={}) {
  if ( debug ) console.debug(`Compression | The pixel buffer is processed [size: ${(buffer.length / (1e+6)).toFixed(2)} mB]`);

  // Control identical hashes
  const hashTest = skipHash ? {same: false, hash} : controlHashes(buffer, hash);
  if ( hashTest.same ) {
    if ( debug ) console.debug("Compression | Skipped. Texture buffer has not changed.");
    return [{base64img: undefined, buffer, hash: hashTest.hash}, [buffer.buffer]];
  }

  // Expand buffer from single R channel to RGBA channels (necessary for offscreen canvas)
  const rgbaBuffer = (width * height) === buffer.length ? expandBuffer(buffer, width, height, {debug}) : buffer;
  // Convert buffer to offscreen canvas image
  const offscreen = pixelsToOffscreenCanvas(rgbaBuffer, width, height, {debug});
  // Convert the RGBA buffer to a base64 string image
  const base64img = await offscreenToBase64(offscreen, type, quality, {debug});

  // Send the result
  if ( debug ) console.debug("Compression | base64 string sent to caller.");
  return [{base64img, buffer, hash: hashTest.hash ?? hash}, [buffer.buffer]];
}

/* -------------------------------------------- */

/**
 * Expand a single RED channel buffer into a RGBA buffer and returns it to the main thread.
 * The created RGBA buffer is transferred.
 * @param {object} options
 * @param {Uint8ClampedArray} options.buffer       Buffer to expand.
 * @param {number} options.width                   Width of the image.
 * @param {number} options.height                  Height of the image.
 * @param {ArrayBuffer} [options.out]              The output buffer.
 * @param {string} [options.hash]                  Hash to test.
 * @param {boolean} [options.skipHash]             Skip hash?
 * @param {boolean} [options.debug]                Debug option.
 * @returns {[result: object, transfer: object[]]}
 */
async function processBufferRedToBufferRGBA({buffer, width, height, out, hash, skipHash, debug}={}) {

  // Control identical hashes
  const hashTest = skipHash ? {same: false, hash} : controlHashes(buffer, hash);
  if ( hashTest.same ) {
    if ( debug ) console.debug("Compression | Skipped. Texture buffer has not changed.");
    const transfer = [buffer.buffer];
    if ( out ) transfer.push(out);
    return [{rgbaBuffer: undefined, buffer, out, hash: hashTest.hash}, transfer];
  }

  // Expanding the buffer from single channel to RGBA channel
  const rgbaBuffer = expandBuffer(buffer, width, height, {out, debug});
  if ( debug ) console.debug("Compression | RGBA buffer sent to caller.");
  return [{rgbaBuffer, buffer, out, hash: hashTest.hash ?? hash}, [rgbaBuffer.buffer, buffer.buffer]];
}

/* -------------------------------------------- */

/**
 * Reduce a RGBA buffer into a single RED buffer and returns it to the main thread.
 * The created RGBA buffer is transferred.
 * @param {object} options
 * @param {Uint8ClampedArray} options.buffer       Buffer to reduce.
 * @param {number} options.width                   Width of the image.
 * @param {number} options.height                  Height of the image.
 * @param {ArrayBuffer} [options.out]              The output buffer.
 * @param {string} [options.hash]                  Hash to test.
 * @param {boolean} [options.skipHash]             Skip hash?
 * @param {boolean} [options.debug]                Debug option.
 * @returns {[result: object, transfer: object[]]}
 */
async function processBufferRGBAToBufferRED({buffer, width, height, out, hash, skipHash, debug}={}) {

  // Control identical hashes
  const hashTest = skipHash ? {same: false, hash} : controlHashes(buffer, hash);
  if ( hashTest.same ) {
    if ( debug ) console.debug("Compression | Skipped. Texture buffer has not changed.");
    const transfer = [buffer.buffer];
    if ( out ) transfer.push(out);
    return [{redBuffer: undefined, buffer, out, hash: hashTest.hash}, transfer];
  }

  // Expanding the buffer from single channel to RGBA channel
  const redBuffer = reduceBuffer(buffer, width, height, {out, debug});
  if ( debug ) console.debug("Compression | RED buffer sent to caller.");
  return [{redBuffer, buffer, out, hash: hashTest.hash ?? hash}, [redBuffer.buffer, buffer.buffer]];
}

/* -------------------------------------------- */

/**
 * Copy the buffer.
 * @param {object} options
 * @param {Uint8ClampedArray} options.buffer       Buffer to copy.
 * @param {ArrayBuffer} [options.out]              The output buffer.
 * @param {string} [options.hash]                  Hash to test.
 * @param {boolean} [options.skipHash]             Skip hash?
 * @param {boolean} [options.debug]                Debug option.
 * @returns {[result: object, transfer: object[]]}
 */
async function copyBuffer({buffer, out, hash, skipHash, debug}={}) {

  // Control identical hashes
  const hashTest = skipHash ? {same: false, hash} : controlHashes(buffer, hash);
  if ( hashTest.same ) {
    if ( debug ) console.debug("Compression | Skipped. Texture buffer has not changed.");
    const transfer = [buffer.buffer];
    if ( out ) transfer.push(out);
    return [{copy: undefined, buffer, out, hash: hashTest.hash}, transfer];
  }

  // Copy the buffer
  let copy;
  if ( !out ) copy = new Uint8ClampedArray(buffer);
  else {
    copy = new Uint8ClampedArray(out, 0, buffer.length);
    copy.set(buffer);
  }
  if ( debug ) console.debug("Compression | Copy of buffer sent to caller.");
  return [{copy, buffer, out, hash: hashTest.hash ?? hash}, [copy.buffer, buffer.buffer]];
}

/* -------------------------------------------- */

/**
 * Control the hash of a provided buffer.
 * @param {Uint8ClampedArray} buffer                 Buffer to control.
 * @param {string} [hash]                            Hash to test.
 * @returns {{} | {same: boolean, hash: string}}     Returns an empty object if not control is made
 *                                                   else returns {same: <boolean to know if the hashes are the same>,
 *                                                                 hash: <the previous or the new hash>}
 */
function controlHashes(buffer, hash) {
  if ( hash === undefined ) return {};
  const textureHash = SparkMD5.ArrayBuffer.hash(buffer);
  const same = (hash === textureHash);
  hash = textureHash;
  return {same, hash};
}

/* -------------------------------------------- */

/**
 * Create an offscreen canvas element containing the pixel data.
 * @param {Uint8ClampedArray} buffer              Buffer used to create the image data.
 * @param {number} width                          Buffered image width.
 * @param {number} height                         Buffered image height.
 * @param {object} [options]
 * @returns {OffscreenCanvas}
 */
function pixelsToOffscreenCanvas(buffer, width, height, options={}) {
  if ( options.debug ) console.debug("Compression | Converting rgba buffer to image data");

  // Create offscreen canvas with provided dimensions
  const offscreen = new OffscreenCanvas(width, height);

  // Get the context and create a new image data with the buffer
  const context = offscreen.getContext("2d");
  const imageData = new ImageData(buffer, width, height);
  context.putImageData(imageData, 0, 0);

  // Return the offscreen canvas
  return offscreen;
}

/* -------------------------------------------- */

/**
 * Asynchronously convert a canvas element to base64.
 * @param {OffscreenCanvas} offscreen
 * @param {string} [type="image/png"]
 * @param {number} [quality]
 * @param {object} [options]
 * @returns {Promise<string>} The base64 string of the canvas.
 */
async function offscreenToBase64(offscreen, type, quality, options={}) {
  if ( options.debug ) {
    console.debug(`Compression | Compressing image data to ${type} with quality ${quality.toFixed(1)}`);
  }

  // Convert image to base64
  const base64img = await blobToBase64(await offscreen.convertToBlob({type, quality}));

  if ( options.debug ) {
    const m = (base64img.length * 2) / (1e+6);
    console.debug(`Compression | Image converted to a base64 string [size: ${m.toFixed(2)} mB]`);
  }
  return base64img;
}

/* -------------------------------------------- */

/**
 * Convert a blob to a base64 string.
 * @param {Blob} blob
 * @returns {Promise}
 */
async function blobToBase64(blob) {
  return new Promise((resolve, _) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

/* -------------------------------------------- */

/**
 * Expand a single RED channel buffer into a RGBA buffer.
 * @param {Uint8ClampedArray} buffer
 * @param {number} width
 * @param {number} height
 * @param {object} [options]
 * @param {ArrayBuffer} [options.out]              The output buffer.
 * @param {boolean} [options.debug]                Debug option.
 * @returns {Uint8ClampedArray}
 */
function expandBuffer(buffer, width, height, options={}) {
  // Creating the new buffer with the required size to handle 4 channels
  const rgbaBuffer = options.out ? new Uint8Array(options.out, 0, width * height * 4)
    : new Uint8Array(width * height * 4);

  // Converting the single channel buffer to RGBA buffer
  for ( let i = 0; i < buffer.length; i++ ) {
    rgbaBuffer[(i << 2)] = buffer[i];
    rgbaBuffer[(i << 2) + 3] = 0xFF;
  }

  if ( options.debug ) {
    console.debug(`Compression | Single channel buffer converted to rgba buffer [size: ${(rgbaBuffer.length / (1e+6)).toFixed(2)} mB]`);
  }
  return new Uint8ClampedArray(rgbaBuffer.buffer);
}

/* -------------------------------------------- */

/**
 * Reduce a RGBA channel buffer into a RED buffer (in-place).
 * @param {Uint8ClampedArray} buffer
 * @param {number} width
 * @param {number} height
 * @param {object} [options]
 * @param {ArrayBuffer} [options.out]              The output buffer.
 * @param {boolean} [options.debug]                Debug option.
 * @returns {Uint8ClampedArray}
 */
function reduceBuffer(buffer, width, height, options={}) {
  // Creating the new buffer with only a single channel
  const redBuffer = options.out ? new Uint8Array(options.out, 0, width * height) : new Uint8Array(width * height);

  // Converting the RGBA buffer to single channel RED buffer
  for ( let i = 0; i < buffer.length; i+=4 ) {
    redBuffer[i >> 2] = buffer[i];
  }

  if ( options.debug ) {
    console.debug(`Compression | RGBA channel buffer converted to RED buffer [size: ${(redBuffer.length / (1e+6)).toFixed(2)} mB]`);
  }
  return new Uint8ClampedArray(redBuffer.buffer);
}

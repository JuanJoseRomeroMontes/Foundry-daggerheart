import FilePicker from "@client/applications/apps/file-picker.mjs";

/**
 * A helper class to provide common functionality for working with Image objects.
 */
export default class ImageHelper {

  /**
   * Create thumbnail preview for a provided image path.
   * @param {string|PIXI.DisplayObject} src   The URL or display object of the texture to render to a thumbnail
   * @param {object} options    Additional named options passed to the compositeCanvasTexture function
   * @param {number} [options.width]        The desired width of the resulting thumbnail
   * @param {number} [options.height]       The desired height of the resulting thumbnail
   * @param {number} [options.tx]           A horizontal transformation to apply to the provided source
   * @param {number} [options.ty]           A vertical transformation to apply to the provided source
   * @param {boolean} [options.center]      Whether to center the object within the thumbnail
   * @param {string} [options.format]       The desired output image format
   * @param {number} [options.quality]      The desired output image quality
   * @returns {Promise<object>}  The parsed and converted thumbnail data
   */
  static async createThumbnail(src, {width, height, tx, ty, center, format, quality}) {
    if ( !src ) return null;

    // Load the texture and create a Sprite
    let object = src;
    if ( !(src instanceof PIXI.DisplayObject) ) {
      const texture = await foundry.canvas.loadTexture(src);
      object = PIXI.Sprite.from(texture);
    }

    // Reduce to the smaller thumbnail texture
    if ( !canvas.ready && canvas.initializing ) await canvas.initializing;
    const reduced = this.compositeCanvasTexture(object, {width, height, tx, ty, center});
    const thumb = await this.textureToImage(reduced, {format, quality});
    reduced.destroy(true);

    // Return the image data
    return { src, texture: reduced, thumb, width: object.width, height: object.height };
  }

  /* -------------------------------------------- */

  /**
   * Test whether a source file has a supported image extension type
   * @param {string} src      A requested image source path
   * @returns {boolean}       Does the filename end with a valid image extension?
   */
  static hasImageExtension(src) {
    return foundry.data.validators.hasFileExtension(src, Object.keys(CONST.IMAGE_FILE_EXTENSIONS));
  }

  /* -------------------------------------------- */

  /**
   * Composite a canvas object by rendering it to a single texture
   *
   * @param {PIXI.DisplayObject} object   The object to render to a texture
   * @param {object} [options]            Options which configure the resulting texture
   * @param {number} [options.width]        The desired width of the output texture
   * @param {number} [options.height]       The desired height of the output texture
   * @param {number} [options.tx]           A horizontal translation to apply to the object
   * @param {number} [options.ty]           A vertical translation to apply to the object
   * @param {boolean} [options.center]      Center the texture in the rendered frame?
   *
   * @returns {PIXI.Texture}              The composite Texture object
   */
  static compositeCanvasTexture(object, {width, height, tx=0, ty=0, center=true}={}) {
    if ( !canvas.app?.renderer ) throw new Error("Unable to compose texture because there is no game canvas");
    width = width ?? object.width;
    height = height ?? object.height;

    // Downscale the object to the desired thumbnail size
    const currentRatio = object.width / object.height;
    const targetRatio = width / height;
    const s = currentRatio > targetRatio ? (height / object.height) : (width / object.width);

    // Define a transform matrix
    const transform = PIXI.Matrix.IDENTITY.clone();
    transform.scale(s, s);

    // Translate position
    if ( center ) {
      tx = (width - (object.width * s)) / 2;
      ty = (height - (object.height * s)) / 2;
    } else {
      tx *= s;
      ty *= s;
    }
    transform.translate(tx, ty);

    // Create and render a texture with the desired dimensions
    const renderTexture = PIXI.RenderTexture.create({
      width: width,
      height: height,
      scaleMode: PIXI.SCALE_MODES.LINEAR,
      resolution: canvas.app.renderer.resolution
    });
    canvas.app.renderer.render(object, {
      renderTexture,
      transform
    });
    return renderTexture;
  }

  /* -------------------------------------------- */

  /**
   * Extract a texture to a base64 PNG string
   * @param {PIXI.Texture} texture      The texture object to extract
   * @param {object} options
   * @param {string} [options.format]   Image format, e.g. "image/jpeg" or "image/webp".
   * @param {number} [options.quality]  JPEG or WEBP compression from 0 to 1. Default is 0.92.
   * @returns {Promise<string>}         A base64 png string of the texture
   */
  static async textureToImage(texture, {format, quality}={}) {
    const s = new PIXI.Sprite(texture);
    return canvas.app.renderer.extract.base64(s, format, quality);
  }

  /* -------------------------------------------- */

  /**
   * Asynchronously convert a DisplayObject container to base64 using Canvas#toBlob and FileReader
   * @param {PIXI.DisplayObject} target     A PIXI display object to convert
   * @param {string} type                   The requested mime type of the output, default is image/png
   * @param {number} quality                A number between 0 and 1 for image quality if image/jpeg or image/webp
   * @returns {Promise<string>}             A processed base64 string
   */
  static async pixiToBase64(target, type, quality) {
    const extracted = canvas.app.renderer.extract.canvas(target);
    return this.canvasToBase64(extracted, type, quality);
  }

  /* -------------------------------------------- */

  /**
   * Asynchronously convert a canvas element to base64.
   * @param {HTMLCanvasElement} canvas
   * @param {string} [type="image/png"]
   * @param {number} [quality]
   * @returns {Promise<string>} The base64 string of the canvas.
   */
  static async canvasToBase64(canvas, type, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      }, type, quality);
    });
  }

  /* -------------------------------------------- */

  /**
   * Upload a base64 image string to a persisted data storage location
   * @param {string} base64       The base64 string
   * @param {string} fileName     The file name to upload
   * @param {string} filePath     The file path where the file should be uploaded
   * @param {object} [options]    Additional options which affect uploading
   * @param {string} [options.storage=data]   The data storage location to which the file should be uploaded
   * @param {string} [options.type]           The MIME type of the file being uploaded
   * @param {boolean} [options.notify=true]   Display a UI notification when the upload is processed.
   * @returns {Promise<object>}   A promise which resolves to the FilePicker upload response
   */
  static async uploadBase64(base64, fileName, filePath, {storage="data", type, notify=true}={}) {
    type ||= base64.split(";")[0].split("data:")[1];
    const blob = await fetch(base64).then(r => r.blob());
    const file = new File([blob], fileName, {type});
    return FilePicker.implementation.upload(storage, filePath, file, {}, {notify});
  }

  /* -------------------------------------------- */

  /**
   * Create a canvas element containing the pixel data.
   * @param {Uint8ClampedArray} pixels              Buffer used to create the image data.
   * @param {number} width                          Buffered image width.
   * @param {number} height                         Buffered image height.
   * @param {object} options
   * @param {HTMLCanvasElement} [options.element]   The element to use.
   * @param {number} [options.ew]                   Specified width for the element (default to buffer image width).
   * @param {number} [options.eh]                   Specified height for the element (default to buffer image height).
   * @returns {HTMLCanvasElement}
   */
  static pixelsToCanvas(pixels, width, height, {element, ew, eh}={}) {
    // If an element is provided, use it. Otherwise, create a canvas element
    element ??= document.createElement("canvas");

    // Assign specific element width and height, if provided. Otherwise, assign buffered image dimensions
    element.width = ew ?? width;
    element.height = eh ?? height;

    // Get the context and create a new image data with the buffer
    const context = element.getContext("2d");
    const imageData = new ImageData(pixels, width, height);
    context.putImageData(imageData, 0, 0);

    return element;
  }
}

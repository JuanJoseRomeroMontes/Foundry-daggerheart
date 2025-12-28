import {TEXT_FILE_EXTENSIONS} from "@common/constants.mjs"

/**
 * A Loader class which helps with loading video and image textures.
 */
export default class TextureLoader {

  /**
   * The duration in milliseconds for which a texture will remain cached
   * @type {number}
   */
  static CACHE_TTL = 1000 * 60 * 15;

  /**
   * @typedef TextureCacheEntry
   * @property {string} src   The URL of the texture.
   * @property {number} time  The timestamp when the texture was last accessed.
   * @property {number} size  The approximate memory usage of the texture in bytes.
   */

  /**
   * @typedef {Map<PIXI.BaseTexture|PIXI.Spritesheet, TextureCacheEntry>} TextureCacheMap
   * A mapping from a BaseTexture or Spritesheet to its cache entry data.
   */

  /**
   * Record the timestamps and approximate memory usage when each asset path is retrieved from cache
   * @type {TextureCacheMap}
   */
  static #cacheTime = new Map();

  /**
   * A mapping of cached texture data
   * @type {WeakMap<PIXI.BaseTexture,Map<string, TextureAlphaData>>}
   */
  static #textureDataMap = new WeakMap();

  /**
   * To know if the basis transcoder has been initialized
   * @type {boolean}
   */
  static #basisTranscoderInitialized = false;

  /**
   * A helper dictionary to define approximate memory limits based on canvas.performance.mode.
   * The limit is in bytes. Each entry is reduced by 15% to give a higher safety margin.
   * @type {number[]}
   */
  static #MEMORY_LIMITS = [
    2 * 1024 * 1024 * 1024 * 0.85,  // ~1.7 GB (LOW)
    4 * 1024 * 1024 * 1024 * 0.85,  // ~3.4 GB (MED)
    8 * 1024 * 1024 * 1024 * 0.85,  // ~6.8 GB (HIGH)
    12 * 1024 * 1024 * 1024 * 0.85  // ~10.2 GB (MAX)
  ];

  /**
   * A set of pinned source URLs that must never be evicted.
   * @type {Set<string>}
   */
  static #pinnedSources = new Set();

  /* -------------------------------------------- */

  /**
   * Initialize the basis/ktx2 transcoder for PIXI.Assets
   *
   * @license
   * PixiBasisKTX2 is a IIFE bundle created from pixi-basis-ktx2 package source by Kristof Van Der Haeghen
   *
   * The MIT License
   * Copyright (c) 2022-2025 Kristof Van Der Haeghen
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in
   * all copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
   * THE SOFTWARE.
   * Available here: https://github.com/Sparcks/pixi-basis-ktx2
   *
   * -----------------------------------------------
   *
   * The transcoder files are from Binomial LLC under Apache License Version 2.0, January 2004
   * Available here: https://github.com/BinomialLLC/basis_universal/tree/master/webgl/transcoder/build
   *
   * @returns {Promise<*>}
   */
  static async initializeBasisTranscoder() {
    if ( this.#basisTranscoderInitialized ) return;

    this.#basisTranscoderInitialized = true;

    const transcoderJSPath = "scripts/ktx2/basis_transcoder.js";
    const transcoderWASMPath = "scripts/ktx2/basis_transcoder.wasm";

    // Update PIXI.Assets with KTX2 and improved BASIS support
    PIXI.Assets.loader.parsers.push(PixiBasisKTX2.loadKTX2);
    PIXI.Assets.detections.push(PixiBasisKTX2.detectKTX2);
    PIXI.Assets.resolver.parsers.push(PixiBasisKTX2.resolveKTX2TextureUrl);
    PIXI.Assets.loader.parsers.push(PixiBasisKTX2.loadBasis);
    PIXI.Assets.detections.push(PixiBasisKTX2.detectBasis);

    // Loading the transcoders
    return await Promise.all([
      PIXI.TranscoderWorker.loadTranscoder(transcoderJSPath, transcoderWASMPath),
      PixiBasisKTX2.KTX2Parser.loadTranscoder(transcoderJSPath, transcoderWASMPath),
      PixiBasisKTX2.BasisParser.loadTranscoder(transcoderJSPath, transcoderWASMPath)
    ]);
  }

  /* -------------------------------------------- */

  /**
   * Check if a source has a text file extension.
   * @param {string} src          The source.
   * @returns {boolean}           If the source has a text extension or not.
   */
  static hasTextExtension(src) {
    return HAS_TEXT_REGEXP.test(src); // TODO @deprecated in v14
  }

  /* -------------------------------------------- */

  /**
   * @typedef TextureAlphaData
   * @property {number} width         The width of the (downscaled) texture.
   * @property {number} height        The height of the (downscaled) texture.
   * @property {number} minX          The minimum x-coordinate with alpha > 0.
   * @property {number} minY          The minimum y-coordinate with alpha > 0.
   * @property {number} maxX          The maximum x-coordinate with alpha > 0 plus 1.
   * @property {number} maxY          The maximum y-coordinate with alpha > 0 plus 1.
   * @property {Uint8Array} data      The array containing the texture alpha values (0-255)
   *                                  with the dimensions (maxX-minX)×(maxY-minY).
   */

  /**
   * Use the texture to create a cached mapping of pixel alpha and cache it.
   * Cache the bounding box of non-transparent pixels for the un-rotated shape.
   * @param {PIXI.Texture} texture                The provided texture.
   * @param {number} [resolution=1]               Resolution of the texture data output.
   * @returns {TextureAlphaData|undefined}        The texture data if the texture is valid, else undefined.
   */
  static getTextureAlphaData(texture, resolution=1) {

    // If texture is not present
    if ( !texture?.valid ) return;

    // Get the base tex and the stringified frame + width/height
    const width = Math.ceil(Math.round(texture.width * texture.resolution) * resolution);
    const height = Math.ceil(Math.round(texture.height * texture.resolution) * resolution);
    const baseTex = texture.baseTexture;
    const frame = texture.frame;
    const sframe = `${frame.x},${frame.y},${frame.width},${frame.height},${width},${height}`;

    // Get frameDataMap and textureData if they exist
    let textureData;
    let frameDataMap = this.#textureDataMap.get(baseTex);
    if ( frameDataMap ) textureData = frameDataMap.get(sframe);

    // If texture data exists for the baseTex/frame couple, we return it
    if ( textureData ) return textureData;
    else textureData = {};

    // Create a temporary Sprite using the provided texture
    const sprite = new PIXI.Sprite(texture);
    sprite.width = textureData.width = width;
    sprite.height = textureData.height = height;
    sprite.anchor.set(0, 0);

    // Create or update the alphaMap render texture
    const tex = PIXI.RenderTexture.create({width: width, height: height});
    canvas.app.renderer.render(sprite, {renderTexture: tex});
    sprite.destroy(false);
    const pixels = canvas.app.renderer.extract.pixels(tex);
    tex.destroy(true);

    // Trim pixels with zero alpha
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    for ( let i = 3, y = 0; y < height; y++ ) {
      for ( let x = 0; x < width; x++, i += 4 ) {
        const alpha = pixels[i];
        if ( alpha === 0 ) continue;
        if ( x < minX ) minX = x;
        if ( x >= maxX ) maxX = x + 1;
        if ( y < minY ) minY = y;
        if ( y >= maxY ) maxY = y + 1;
      }
    }

    // Special case when the whole texture is alpha 0
    if ( minX > maxX ) minX = minY = maxX = maxY = 0;

    // Set the bounds of the trimmed region
    textureData.minX = minX;
    textureData.minY = minY;
    textureData.maxX = maxX;
    textureData.maxY = maxY;

    // Create new buffer for storing the alpha channel only
    const data = textureData.data = new Uint8Array((maxX - minX) * (maxY - minY));
    for ( let i = 0, y = minY; y < maxY; y++ ) {
      for ( let x = minX; x < maxX; x++, i++ ) {
        data[i] = pixels[(((width * y) + x) * 4) + 3];
      }
    }

    // Saving the texture data
    if ( !frameDataMap ) {
      frameDataMap = new Map();
      this.#textureDataMap.set(baseTex, frameDataMap);
    }
    frameDataMap.set(sframe, textureData);
    return textureData;
  }

  /* -------------------------------------------- */

  /**
   * Load all the textures which are required for a particular Scene.
   * @param {Scene} scene                                 The Scene to load
   * @param {object} [options={}]                         Additional options that configure texture loading
   * @param {boolean} [options.expireCache=true]          Destroy other expired textures
   * @param {string[]} [options.additionalSources=[]]     Additional sources to load during canvas initialize
   * @param {number} [options.maxConcurrent]              The maximum number of textures that can be loaded concurrently
   * @returns {Promise<void>}
   */
  static async loadSceneTextures(scene, {expireCache=true, additionalSources=[], maxConcurrent}={}) {
    let toLoad = [];

    // Scene background and foreground textures
    if ( scene.background.src ) toLoad.push(scene.background.src);
    if ( scene.foreground ) toLoad.push(scene.foreground);
    if ( scene.fog.overlay ) toLoad.push(scene.fog.overlay);

    // Tiles
    toLoad = toLoad.concat(scene.tiles.reduce((arr, t) => {
      if ( t.texture.src ) arr.push(t.texture.src);
      return arr;
    }, []));

    // Tokens
    toLoad.push(CONFIG.Token.ring.spritesheet);
    toLoad = toLoad.concat(scene.tokens.reduce((arr, t) => {
      if ( t.texture.src ) arr.push(t.texture.src);
      if ( t.ring.enabled ) arr.push(t.ring.subject.texture);
      return arr;
    }, []));

    // Door Textures
    for ( const wall of scene.walls ) {
      if ( wall.animation?.texture ) toLoad.push(wall.animation.texture);
    }

    // Control Icons
    toLoad = toLoad.concat(Object.values(CONFIG.controlIcons));

    // Status Effect textures
    toLoad = toLoad.concat(CONFIG.statusEffects.map(e => e.img ?? /** @deprecated since v12 */ e.icon));

    // Configured scene textures
    if ( scene.isView ) {
      for ( const t of Object.values(canvas.sceneTextures) ) {
        if ( typeof t === "string" ) toLoad.push(t);
      }
    }

    // Additional requested sources
    toLoad.push(...additionalSources);

    // Load files
    const showName = scene.active || scene.visible;
    const loadName = showName ? scene.navName || scene.name : "...";
    return this.loader.load(toLoad, {
      localize: true,
      message: "SCENE.Loading",
      format: {name: loadName},
      expireCache,
      maxConcurrent
    });
  }

  /* -------------------------------------------- */

  /**
   * Load an Array of provided source URL paths.
   * Paths which begin with a special character "#" are ignored as texture references.
   * @param {string[]} sources      The source URLs to load
   * @param {object} [options={}]   Additional options which modify loading
   * @param {string} [options.message=""]        The status message to display in the load bar
   * @param {boolean} [options.localize=false]   Whether to localize the message content before displaying it
   * @param {boolean} [options.escape=true]      Whether to escape the values of `format`
   * @param {boolean} [options.clean=true]       Whether to clean the provided message string as untrusted user input.
   *                                             No cleaning is applied if `format` is passed and `escape` is true or
   *                                             `localize` is true and `format` is not passed.
   * @param {string} [options.format]            A mapping of formatting strings passed to Localization#format
   * @param {boolean} [options.expireCache=false]   Expire other cached textures?
   * @param {number} [options.maxConcurrent]        The maximum number of textures that can be loaded concurrently.
   * @param {boolean} [options.displayProgress]     Display loading progress bar
   * @returns {Promise<void>}     A Promise which resolves once all textures are loaded
   */
  async load(sources, {message="", localize=false, escape=true, clean=true, format, expireCache=false, maxConcurrent,
    displayProgress=true}={}) {

    // De-dupe sources to load
    const toLoad = new Set();
    for ( const s of sources ) {
      if ( s.startsWith("#") ) continue;
      toLoad.add(s);
    }

    // Create progress tracking
    console.groupCollapsed(`${CONST.vtt} | Loading ${toLoad.size} Assets`);
    let progress;
    if ( displayProgress ) {
      const bar = ui.notifications.info(message, {localize, escape, clean, format, console: false, progress: true});
      progress = {message, loaded: 0, failed: 0, total: toLoad.size, pct: 0, bar};
    }

    // Load individual texture
    const loadTexture = async src => {
      try {
        await this.loadTexture(src);
        if ( progress ) TextureLoader.#onProgress(src, progress);
      }
      catch(err) {
        if ( progress ) TextureLoader.#onError(src, progress, err);
      }
    };

    // Load all sources
    const promises = [];
    if ( maxConcurrent ) {
      const semaphore = new foundry.utils.Semaphore(maxConcurrent);
      for ( const src of toLoad ) promises.push(semaphore.add(loadTexture, src));
    }
    else {
      for ( const src of toLoad ) promises.push(loadTexture(src));
    }
    await Promise.allSettled(promises);
    console.groupEnd();

    // If we have expireCache set...
    if ( expireCache ) {
      // ...do the classic TTL-based cleaning first...
      await this.expireCache({exclude: toLoad});
      // ...then possibly evict old textures according to memory limits
      await TextureLoader.#enforceMemoryLimit({exclude: toLoad});
    }
  }

  /* -------------------------------------------- */

  /**
   * Load a single texture or spritesheet on-demand from a given source URL path
   * @param {string} src                                          The source texture path to load
   * @returns {Promise<PIXI.BaseTexture|PIXI.Spritesheet|null>}   The loaded texture object
   */
  async loadTexture(src) {
    const loadAsset = async (src, bustCache=false) => {
      if ( bustCache ) src = foundry.utils.getCacheBustURL(src);
      if ( !src ) return null;
      if ( CONFIG.debug.loader.load ) console.debug(`Texture Cache: Attempting to load texture from ${src}`);
      try {
        return await PIXI.Assets.load(src);
      }
      catch(err) {
        if ( bustCache ) throw err;
        return await loadAsset(src, true);
      }
    };
    let asset = await loadAsset(src);
    if ( !asset?.baseTexture?.valid ) return null;
    if ( CONFIG.debug.loader.load ) console.debug(`Texture Load: Successfully loaded texture from ${src}`);
    if ( asset instanceof PIXI.Texture ) asset = asset.baseTexture;
    this.setCache(src, asset);
    return asset;
  }

  /* --------------------------------------------- */

  /**
   * Use the Fetch API to retrieve a resource and return a Blob instance for it.
   * @param {string} src
   * @param {object} [options]                   Options to configure the loading behaviour.
   * @param {boolean} [options.bustCache=false]  Append a cache-busting query parameter to the request.
   * @returns {Promise<Blob>}                    A Blob containing the loaded data
   */
  static async fetchResource(src, {bustCache=false}={}) {
    return foundry.utils.fetchResource(src, {bustCache}); // TODO @deprecated in v14
  }

  /* -------------------------------------------- */

  /**
   * Log texture loading progress in the console and in the Scene loading bar
   * @param {string} src          The source URL being loaded
   * @param {object} progress     Loading progress
   */
  static #onProgress(src, progress) {
    progress.loaded++;
    progress.pct = (progress.loaded + progress.failed) / progress.total;
    progress.bar.update({pct: progress.pct});
    console.log(`Loaded ${src} (${(progress.pct * 100).toFixed(2)}%)`);
  }

  /* -------------------------------------------- */

  /**
   * Log failed texture loading
   * @param {string} src          The source URL being loaded
   * @param {object} progress     Loading progress
   * @param {Error} error         The error which occurred
   */
  static #onError(src, progress, error) {
    progress.failed++;
    progress.pct = (progress.loaded + progress.failed) / progress.total;
    progress.bar.update({pct: progress.pct});
    console.warn(`Loading failed for ${src} (${(progress.pct * 100).toFixed(2)}%): ${error.message}`);
  }

  /* -------------------------------------------- */
  /*  Cache Controls                              */
  /* -------------------------------------------- */

  /**
   * Add an image or a sprite sheet url to the assets cache. Include an approximate memory size in the stored data.
   * @param {string} src                                 The source URL.
   * @param {PIXI.BaseTexture|PIXI.Spritesheet} asset    The asset
   */
  setCache(src, asset) {
    const now = Date.now();
    let baseTex = (asset instanceof PIXI.Spritesheet) ? asset.baseTexture : asset;

    // Calculate approximate memory usage
    const size = TextureLoader.#approximateTextureSize(baseTex);
    if ( CONFIG.debug.loader.cache ) {
      const smb = size / (1024 * 1024);
      console.debug(`Texture Cache: Caching ${src} with approx size ${smb.toFixed(2)} MB`);
    }

    TextureLoader.#cacheTime.set(asset, {src, time:now, size});
  }

  /* -------------------------------------------- */

  /**
   * A helper to approximate the memory usage for a given baseTexture. We handle compressed textures (if supported),
   * and do a fallback for standard RGBA. Additionally, if canvas.performance.mipmap === "ON" for non-compressed textures,
   * we increase the usage by ~33% (which is another approximation)
   * @param {PIXI.BaseTexture} baseTex             The base texture to evaluate
   * @returns {number} Approximate usage in bytes
   */
  static #approximateTextureSize(baseTex) {
    // If it's a compressed texture resource, sum the level buffers if available
    const resource = baseTex.resource;
    if ( resource instanceof PIXI.CompressedTextureResource ) {
      // If we have levelBuffers, sum them directly
      const buffers = resource._levelBuffers;
      if ( buffers && buffers.length ) {
        let totalCompressed = 0;
        for ( const buf of buffers ) {
          totalCompressed += buf.levelBuffer.byteLength;
        }
        return totalCompressed;
      }
      // Fallback if we can't see buffers
      return TextureLoader.#fallbackCompressedSize(baseTex, 2);
    }

    // For non-compressed textures, we use w*h*4
    const w = baseTex.realWidth;
    const h = baseTex.realHeight;
    let size = w * h * 4;

    // If mipmap is ON for non-compressed textures, we assume ~33% extra memory for mip levels
    if ( canvas?.performance?.mipmap === "ON" ) size = Math.round(size * 1.33);
    return size;
  }

  /* -------------------------------------------- */

  /**
   * Fallback memory calculation for a compressed texture whose buffers aren't visible.
   * @param {PIXI.BaseTexture} baseTex
   * @param {number} [bytesPerPixel=2]
   * @returns {number}
   */
  static #fallbackCompressedSize(baseTex, bytesPerPixel=2) {
    const w = baseTex.realWidth;
    const h = baseTex.realHeight;
    return w * h * bytesPerPixel;
  }

  /* -------------------------------------------- */

  /**
   * Retrieve a texture or a sprite sheet from the assets cache
   * @param {string} src                                     The source URL
   * @returns {PIXI.BaseTexture|PIXI.Spritesheet|null}       The cached texture, a sprite sheet or null
   */
  getCache(src) {
    if ( !src ) return null;
    if ( !PIXI.Assets.cache.has(src) ) src = foundry.utils.getCacheBustURL(src) || src;
    let asset = PIXI.Assets.get(src);
    if ( !asset?.baseTexture?.valid ) return null;
    if ( asset instanceof PIXI.Texture ) asset = asset.baseTexture;
    if ( CONFIG.debug.loader.cache ) {
      if ( !PIXI.Assets.cache.has(src) ) console.debug(`Texture Cache: ${src} not found in cache (or invalid)`);
      else console.debug(`Texture Cache: ${src} retrieved from cache`);
    }
    this.setCache(src, asset);
    return asset;
  }

  /* -------------------------------------------- */

  /**
   * Expire and unload assets from the cache which have not been used for more than CACHE_TTL milliseconds.
   * @param {object} [options={}]
   * @param {Set<string>} [options.exclude]   A set of source URLs to *skip* from eviction checks.
   */
  async expireCache({exclude}={}) {
    const promises = [];
    const t = Date.now();
    if ( exclude ) {
      const excludeWithCacheBustURLs = new Set(exclude);
      for ( const src of exclude ) excludeWithCacheBustURLs.add(foundry.utils.getCacheBustURL(src));
      exclude = excludeWithCacheBustURLs;
    }
    for ( const [asset, {src, time}] of TextureLoader.#cacheTime.entries() ) {
      // Skip pinned or excluded source URLs
      if ( TextureLoader.#pinnedSources.has(src) || exclude?.has(src) ) {
        if ( CONFIG.debug.loader.cache ) console.debug(`Texture Cache: Exclude cached texture: ${src} from expiration`);
        continue;
      }

      const baseTexture = asset instanceof PIXI.Spritesheet ? asset.baseTexture : asset;
      if ( !baseTexture || baseTexture.destroyed ) {
        TextureLoader.#cacheTime.delete(asset);
        continue;
      }
      if ( (t - time) <= TextureLoader.CACHE_TTL ) continue;
      console.log(`${CONST.vtt} | Expiring cached texture: ${src}`);
      promises.push(PIXI.Assets.unload(src));
      TextureLoader.#cacheTime.delete(asset);

      if ( CONFIG.debug.loader.cache ) {
        console.debug(`Texture Cache: Expiring cached texture: ${src} (unused for ${t - time}ms)`);
      }
    }
    await Promise.allSettled(promises);

    if ( CONFIG.debug.loader.memory || CONFIG.debug.loader.cache ) {
      const newTotalMB = (TextureLoader.approximateTotalMemoryUsage / (1024 * 1024)).toFixed(2);
      console.debug(
        `Memory Debug: TTL-based eviction done. Approximate memory usage now: ${newTotalMB} MB`
      );
    }
  }

  /* -------------------------------------------- */

  /**
   * Return a URL with a cache-busting query parameter appended.
   * @param {string} src        The source URL being attempted
   * @returns {string|boolean}  The new URL, or false on a failure.
   */
  static getCacheBustURL(src) {
    return foundry.utils.getCacheBustURL(src); // TODO @deprecated in v14
  }

  /* -------------------------------------------- */
  /*  Memory Enforcement Logic                    */
  /* -------------------------------------------- */

  /**
   * We evict assets sorted by size descending, until we drop below the memory limit.
   * @param {object} [options={}]
   * @param {Set<string>} [options.exclude]   A set of source URLs to skip from eviction checks.
   */
  static async #enforceMemoryLimit({exclude}={}) {
    const limit = this.#getMemoryLimit();
    let total = this.#computeTotalMemory();

    if ( CONFIG.debug.loader.memory ) {
      const totalMB = (total / (1024 * 1024)).toFixed(2);
      const limitMB = (limit / (1024 * 1024)).toFixed(2);
      console.debug(
        `Memory Debug: Enforcing memory limit. ` +
        `Current usage: ${totalMB} MB, limit: ${limitMB} MB.`
      );
    }

    if ( total <= limit ) return;

    // Convert bytes to MB and GB
    const totalMB = total / (1024 * 1024);
    const totalGB = totalMB / 1024;
    const limitMB = limit / (1024 * 1024);
    const limitGB = limitMB / 1024;

    console.log(`${CONST.vtt} | Total estimated GPU memory usage ${totalMB.toFixed(1)} MB (~${totalGB.toFixed(
      2)} GB) ` + `exceeds limit ${limitMB.toFixed(1)} MB (~${limitGB.toFixed(2)} GB). Evicting old assets...`);

    // Sort assets by ascending time
    const entries = [...TextureLoader.#cacheTime.entries()].sort(([, a], [, b]) => a.time - b.time);

    if ( exclude ) {
      const excludeWithCacheBustURLs = new Set(exclude);
      for ( const src of exclude ) excludeWithCacheBustURLs.add(foundry.utils.getCacheBustURL(src));
      exclude = excludeWithCacheBustURLs;
    }

    const evictPromises = [];
    for ( const [asset, data] of entries ) {
      if ( total <= limit ) break;
      if ( this.#pinnedSources.has(data.src) || exclude?.has(data.src) ) {
        if ( CONFIG.debug.loader.eviction ) console.debug(`Texture Eviction: Exclude texture: ${data.src} from eviction`);
        continue;
      }

      try {
        console.log(`${CONST.vtt} | Evicting cached texture: ${data.src}`);
        evictPromises.push(PIXI.Assets.unload(data.src));
        TextureLoader.#cacheTime.delete(asset);
        total -= data.size;
      }
      catch(err) {
        console.warn(`Failed to unload old asset ${data.src}:`, err);
      }
    }
    await Promise.allSettled(evictPromises);

    if ( CONFIG.debug.loader.memory || CONFIG.debug.loader.eviction ) {
      const nau = (TextureLoader.#computeTotalMemory() / (1024 * 1024)).toFixed(2);
      console.debug(`Texture Eviction: Eviction complete. New approximate usage: ${nau} MB.`);
    }
  }

  /* -------------------------------------------- */

  /**
   * Compute total approximate memory usage for all currently cached assets.
   * @returns {number}  The total approximate usage in bytes.
   */
  static #computeTotalMemory() {
    let sum = 0;
    for ( const [asset, {size}] of this.#cacheTime.entries() ) {
      const baseTexture = (asset instanceof PIXI.Spritesheet) ? asset.baseTexture : asset;
      if ( !baseTexture?.destroyed ) sum += size || 0;
    }
    return sum;
  }

  /* -------------------------------------------- */

  /**
   * A public getter to expose the total approximate memory usage.
   * @returns {number}   The total usage in bytes.
   */
  static get approximateTotalMemoryUsage() {
    return this.#computeTotalMemory();
  }

  /* -------------------------------------------- */

  /**
   * Determine the memory limit in bytes based on canvas.performance.mode.
   * Defaults to HIGH if the mode is out of range or missing.
   * @returns {number}
   */
  static #getMemoryLimit() {
    const modes = CONST.CANVAS_PERFORMANCE_MODES;
    const defaultMode = modes.HIGH;   // fallback = 2 => 8GB * 0.85 => ~6.8 GB
    let mode = canvas?.performance?.mode ?? defaultMode;

    // Clamp the mode to a valid index [0..3]
    if ( !mode.between(modes.LOW, modes.MAX) ) mode = defaultMode;
    return this.#MEMORY_LIMITS[mode];
  }

  /* -------------------------------------------- */
  /*  Pinning Logic                               */
  /* -------------------------------------------- */

  /**
   * Pin a source URL so it cannot be evicted.
   * @param {string} src   The source URL to pin
   */
  static pinSource(src) {
    this.#pinnedSources.add(src);
    this.#pinnedSources.add(foundry.utils.getCacheBustURL(src));
  }

  /* -------------------------------------------- */

  /**
   * Unpin a source URL that was previously pinned.
   * @param {string} src   The source URL to unpin
   */
  static unpinSource(src) {
    this.#pinnedSources.delete(src);
    this.#pinnedSources.delete(foundry.utils.getCacheBustURL(src));
  }

  /* -------------------------------------------- */
  /*  Deprecations                                */
  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  static get textureBufferDataMap() {
    const warning = "TextureLoader.textureBufferDataMap is deprecated without replacement. Use " +
      "TextureLoader.getTextureAlphaData to create a texture data map and cache it automatically, or create your own" +
      " caching system.";
    foundry.utils.logCompatibilityWarning(warning, {since: 12, until: 14});
    return this.#textureBufferDataMap;
  }

  /**
   * @deprecated since v12
   * @ignore
   */
  static #textureBufferDataMap = new Map();
}

/**
 * A global reference to the singleton texture loader
 * @type {TextureLoader}
 */
TextureLoader.loader = new TextureLoader();

/* -------------------------------------------- */

/**
 * Test whether a file source exists by performing a HEAD request against it
 * @param {string} src          The source URL or path to test
 * @returns {Promise<boolean>}   Does the file exist at the provided url?
 */
export async function srcExists(src) {
  return foundry.utils.srcExists(src); // TODO @deprecated in v14
}

/* -------------------------------------------- */

/**
 * Get a single texture or sprite sheet from the cache.
 * @param {string} src                            The texture path to load.
 *                                                This may be a standard texture path or a "virtual texture" beginning
 *                                                with the "#" character that is retrieved from canvas.sceneTextures.
 * @returns {PIXI.Texture|PIXI.Spritesheet|null}  A texture, a sprite sheet or null if not found in cache.
 */
export function getTexture(src) {
  if ( !src ) return null;

  // Virtual textures referenced from the sceneTextures record
  if ( src[0] === "#" ) {
    const texturePath = src.slice(1);
    const vt = canvas.sceneTextures[texturePath];
    return vt instanceof PIXI.Texture ? vt : null;
  }

  // Standard file paths retrieved from the TextureLoader cache
  const asset = TextureLoader.loader.getCache(src);
  const baseTexture = asset instanceof PIXI.Spritesheet ? asset.baseTexture : asset;
  if ( !baseTexture?.valid ) return null;
  return (asset instanceof PIXI.Spritesheet ? asset : new PIXI.Texture(asset));
}

/* -------------------------------------------- */

/**
 * Load a single asset and return a Promise which resolves once the asset is ready to use
 * @param {string} src                           The requested texture source.
 *                                               This may be a standard texture path or a "virtual texture" beginning
 *                                               with the "#" character that is retrieved from canvas.sceneTextures.
 * @param {object} [options]                     Additional options which modify asset loading
 * @param {string} [options.fallback]            A fallback texture URL to use if the requested source is unavailable
 * @returns {PIXI.Texture|PIXI.Spritesheet|null} The loaded Texture or sprite sheet,
 *                                               or null if loading failed with no fallback
 */
export async function loadTexture(src, {fallback}={}) {
  let asset = src ? getTexture(src) : null;
  if ( asset?.valid ) return asset;
  let error;
  if ( !src ) error = new Error("Requested texture path is empty.");
  else if ( src[0] === "#" ) error = new Error(`Requested texture path "${src}" has not been loaded and registered.`);
  else {
    try {
      asset = await TextureLoader.loader.loadTexture(src);
      const baseTexture = asset instanceof PIXI.Spritesheet ? asset.baseTexture : asset;
      if ( !baseTexture?.valid ) error = new Error(`Invalid Asset ${src}`);
    }
    catch(err) {
      err.message = `The requested asset ${src} could not be loaded: ${err.message}`;
      error = err;
    }
  }
  if ( error ) {
    console.error(error);
    if ( src && HAS_TEXT_REGEXP.test(src) ) return null; // No fallback for spritesheets
    return fallback ? loadTexture(fallback) : null;
  }
  if ( asset instanceof PIXI.Spritesheet ) return asset;
  return new PIXI.Texture(asset);
}

/* -------------------------------------------- */

/**
 * RegExp testing text file extensions
 * @type {RegExp}
 */
const HAS_TEXT_REGEXP = new RegExp(`(\\.${Object.keys(TEXT_FILE_EXTENSIONS).join("|\\.")})(\\?.*)?`, "i");

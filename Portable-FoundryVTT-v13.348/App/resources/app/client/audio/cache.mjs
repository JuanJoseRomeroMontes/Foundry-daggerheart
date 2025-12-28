/**
 * @import {AudioBufferCacheEntry} from "./_types.mjs";
 */

 /**
 * A specialized cache used for audio buffers.
 * This is an LRU cache which expires buffers from the cache once the maximum cache size is exceeded.
 * @extends {Map<string, AudioBufferCacheEntry>}
 */
export default class AudioBufferCache extends Map {
  /**
   * Construct an AudioBufferCache providing a maximum disk size beyond which entries are expired.
   * @param {number} [cacheSize]    The maximum cache size in bytes. 1GB by default.
   */
  constructor(cacheSize=Math.pow(1024, 3)) {
    super();
    this.#maxSize = cacheSize;
  }

  /**
   * The maximum cache size in bytes.
   * @type {number}
   */
  #maxSize;

  /**
   * The current memory utilization in bytes.
   * @type {number}
   */
  #memorySize = 0;

  /**
   * The head of the doubly-linked list.
   * @type {AudioBufferCacheEntry}
   */
  #head;

  /**
   * The tail of the doubly-linked list
   * @type {AudioBufferCacheEntry}
   */
  #tail;

  /**
   * A string representation of the current cache utilization.
   * @type {{current: number, max: number, pct: number, currentString: string, maxString: string, pctString: string}}
   */
  get usage() {
    return {
      current: this.#memorySize,
      max: this.#maxSize,
      pct: this.#memorySize / this.#maxSize,
      currentString: foundry.utils.formatFileSize(this.#memorySize),
      maxString: foundry.utils.formatFileSize(this.#maxSize),
      pctString: `${(this.#memorySize * 100 / this.#maxSize).toFixed(2)}%`
    };
  }

  /* -------------------------------------------- */
  /*  Cache Methods                               */
  /* -------------------------------------------- */

  /**
   * Retrieve an AudioBuffer from the cache.
   * @param {string} src      The audio buffer source path
   * @returns {AudioBuffer}   The cached audio buffer, or undefined
   */
  getBuffer(src) {
    const node = super.get(src);
    let buffer;
    if ( node ) {
      buffer = node.buffer;
      if ( this.#head !== node ) this.#shift(node);
    }
    return buffer;
  }

  /* -------------------------------------------- */

  /**
   * Insert an AudioBuffer into the buffers cache.
   * @param {string} src          The audio buffer source path
   * @param {AudioBuffer} buffer  The audio buffer to insert
   * @returns {AudioBufferCache}
   */
  setBuffer(src, buffer) {
    if ( !(buffer instanceof AudioBuffer) ) {
      throw new Error("The AudioBufferCache is only used to store AudioBuffer instances");
    }
    let node = super.get(src);
    if ( node ) this.#remove(node);
    node = {src, buffer, size: buffer.length * buffer.numberOfChannels * 4, next: this.#head};
    super.set(src, node);
    this.#insert(node);
    game.audio.debug(`Cached audio buffer "${src}" | ${this}`);
    this.#expire();
    return this;
  }

  /* -------------------------------------------- */

  /**
   * Delete an entry from the cache.
   * @param {string} src          The audio buffer source path
   * @returns {boolean}           Was the buffer deleted from the cache?
   */
  delete(src) {
    const node = super.get(src);
    if ( node ) this.#remove(node);
    return super.delete(src);
  }

  /* -------------------------------------------- */

  /**
   * Lock a buffer, preventing it from being expired even if it is least-recently-used.
   * @param {string} src              The audio buffer source path
   * @param {boolean} [locked=true]   Lock the buffer, preventing its expiration?
   */
  lock(src, locked=true) {
    const node = super.get(src);
    if ( !node ) return;
    node.locked = locked;
  }

  /* -------------------------------------------- */

  /**
   * Insert a new node into the cache, updating the linked list and cache size.
   * @param {AudioBufferCacheEntry} node    The node to insert
   */
  #insert(node) {
    if ( this.#head ) {
      this.#head.previous = node;
      this.#head = node;
    }
    else this.#head = this.#tail = node;
    this.#memorySize += node.size;
  }

  /* -------------------------------------------- */

  /**
   * Remove a node from the cache, updating the linked list and cache size.
   * @param {AudioBufferCacheEntry} node    The node to remove
   */
  #remove(node) {
    if ( node.previous ) node.previous.next = node.next;
    else this.#head = node.next;
    if ( node.next ) node.next.previous = node.previous;
    else this.#tail = node.previous;
    this.#memorySize -= node.size;
  }

  /* -------------------------------------------- */

  /**
   * Shift an accessed node to the head of the linked list.
   * @param {AudioBufferCacheEntry} node    The node to shift
   */
  #shift(node) {
    node.previous = undefined;
    node.next = this.#head;
    this.#head.previous = node;
    this.#head = node;
  }

  /* -------------------------------------------- */

  /**
   * Recursively expire entries from the cache in least-recently used order.
   * Skip expiration of any entries which are locked.
   * @param {AudioBufferCacheEntry} [node]  A node from which to start expiring. Otherwise, starts from the tail.
   */
  #expire(node) {
    if ( this.#memorySize < this.#maxSize ) return;
    node ||= this.#tail;
    if ( !node.locked ) {
      this.#remove(node);
      game.audio.debug(`Expired audio buffer ${node.src} | ${this}`);
    }
    if ( node.previous ) this.#expire(node.previous);
  }

  /* -------------------------------------------- */

  /** @override */
  toString() {
    const {currentString, maxString, pctString} = this.usage;
    return `AudioBufferCache: ${currentString} / ${maxString} (${pctString})`;
  }
}

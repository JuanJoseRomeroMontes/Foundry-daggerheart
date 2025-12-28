/**
 * A helper class to provide common functionality for working with HTML5 video objects
 * A singleton instance of this class is available as ``game.video``
 */
export default class VideoHelper {
  constructor() {
    if ( game.video instanceof this.constructor ) {
      throw new Error("You may not re-initialize the singleton VideoHelper. Use game.video instead.");
    }

    /**
     * A user gesture must be registered before video playback can begin.
     * This Set records the video elements which await such a gesture.
     * @type {Set}
     */
    this.pending = new Set();

    /**
     * A mapping of base64 video thumbnail images
     * @type {Record<string, string>}
     */
    this.thumbs = new Map();

    /**
     * A flag for whether video playback is currently locked by awaiting a user gesture
     * @type {boolean}
     */
    this.locked = true;
  }

  /* -------------------------------------------- */

  /**
   * Store a Promise while the YouTube API is initializing.
   * @type {Promise}
   */
  #youTubeReady;

  /* -------------------------------------------- */

  /**
   * The YouTube URL regex.
   * @type {RegExp}
   */
  #youTubeRegex = /^https:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\/(?:watch\?v=([^&]+)|(?:embed\/)?([^?]+))/;

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /**
   * Return the HTML element which provides the source for a loaded texture.
   * @param {PIXI.Sprite|SpriteMesh} mesh                       The rendered mesh
   * @returns {HTMLImageElement|HTMLVideoElement|null}          The source HTML element
   */
  getSourceElement(mesh) {
    if ( !mesh.texture.valid ) return null;
    return mesh.texture.baseTexture.resource.source;
  }

  /* -------------------------------------------- */

  /**
   * Get the video element source corresponding to a Sprite or SpriteMesh.
   * @param {PIXI.Sprite|SpriteMesh|PIXI.Texture} object        The PIXI source
   * @returns {HTMLVideoElement|null}                           The source video element or null
   */
  getVideoSource(object) {
    if ( !object ) return null;
    const texture = object.texture || object;
    if ( !texture.valid ) return null;
    const source = texture.baseTexture.resource.source;
    return source?.tagName === "VIDEO" ? source : null;
  }

  /* -------------------------------------------- */

  /**
   * Clone a video texture so that it can be played independently of the original base texture.
   * @param {HTMLVideoElement} source     The video element source
   * @returns {Promise<PIXI.Texture>}     An unlinked PIXI.Texture which can be played independently
   */
  async cloneTexture(source) {
    const clone = source.cloneNode(true);
    const resource = new PIXI.VideoResource(clone, {autoPlay: false});
    resource.internal = true;
    await resource.load();
    return new PIXI.Texture(new PIXI.BaseTexture(resource, {
      alphaMode: await PIXI.utils.detectVideoAlphaMode()
    }));
  }

  /* -------------------------------------------- */

  /**
   * Check if a source has a video extension.
   * @param {string} src          The source.
   * @returns {boolean}           If the source has a video extension or not.
   */
  static hasVideoExtension(src) {
    if ( !src ) return false;
    let rgx = new RegExp(`(\\.${Object.keys(CONST.VIDEO_FILE_EXTENSIONS).join("|\\.")})(\\?.*)?`, "i");
    return rgx.test(src);
  }

  /* -------------------------------------------- */

  /**
   * Play a single video source
   * If playback is not yet enabled, add the video to the pending queue
   * @param {HTMLElement} video     The VIDEO element to play
   * @param {object} [options={}]   Additional options for modifying video playback
   * @param {boolean} [options.playing] Should the video be playing? Otherwise, it will be paused
   * @param {boolean} [options.loop]    Should the video loop?
   * @param {number} [options.offset]   A specific timestamp between 0 and the video duration to begin playback
   * @param {number} [options.volume]   Desired volume level of the video's audio channel (if any)
   */
  async play(video, {playing=true, loop=true, offset, volume}={}) {

    // Video offset time and looping
    video.loop = loop;
    offset ??= video.currentTime;

    // Playback volume and muted state
    if ( volume !== undefined ) video.volume = volume;

    // Pause playback
    if ( !playing ) return video.pause();

    // Wait for user gesture
    if ( this.locked ) return this.pending.add([video, offset]);

    // Begin playback
    video.currentTime = Math.clamp(offset, 0, video.duration);
    return video.play();
  }

  /* -------------------------------------------- */

  /**
   * Stop a single video source
   * @param {HTMLElement} video   The VIDEO element to stop
   */
  stop(video) {
    video.pause();
    video.currentTime = 0;
  }

  /* -------------------------------------------- */

  /**
   * Register an event listener to await the first mousemove gesture and begin playback once observed
   * A user interaction must involve a mouse click or keypress.
   * Listen for any of these events, and handle the first observed gesture.
   */
  awaitFirstGesture() {
    if ( !this.locked ) return;
    const interactions = ["contextmenu", "auxclick", "pointerdown", "pointerup", "keydown"];
    interactions.forEach(event => document.addEventListener(event, this.#onFirstGesture.bind(this), {once: true}));
  }

  /* -------------------------------------------- */

  /**
   * Handle the first observed user gesture
   * We need a slight delay because unfortunately Chrome is stupid and doesn't always acknowledge the gesture fast
   * enough.
   * @param {Event} event   The mouse-move event which enables playback
   */
  #onFirstGesture(event) {
    this.locked = false;
    if ( !this.pending.size ) return;
    console.log(`${CONST.vtt} | Activating pending video playback with user gesture.`);
    for ( const [video, offset] of Array.from(this.pending) ) {
      this.play(video, {offset, loop: video.loop});
    }
    this.pending.clear();
  }

  /* -------------------------------------------- */

  /**
   * Create and cache a static thumbnail to use for the video.
   * The thumbnail is cached using the video file path or URL.
   * @param {string} src        The source video URL
   * @param {object} options    Thumbnail creation options, including width and height
   * @returns {Promise<string>}  The created and cached base64 thumbnail image, or a placeholder image if the canvas is
   *                            disabled and no thumbnail can be generated.
   */
  async createThumbnail(src, options) {
    if ( game.settings.get("core", "noCanvas") ) return "icons/svg/video.svg";
    const t = await foundry.helpers.media.ImageHelper.createThumbnail(src, options);
    this.thumbs.set(src, t.thumb);
    return t.thumb;
  }

  /* -------------------------------------------- */
  /*  YouTube API                                 */
  /* -------------------------------------------- */

  /**
   * Lazily-load the YouTube API and retrieve a Player instance for a given iframe.
   * @param {string} id      The iframe ID.
   * @param {object} config  A player config object. See {@link https://developers.google.com/youtube/iframe_api_reference} for reference.
   * @returns {Promise<YT.Player>}
   */
  async getYouTubePlayer(id, config={}) {
    this.#youTubeReady ??= this.#injectYouTubeAPI();
    await this.#youTubeReady;
    return new Promise(resolve => new YT.Player(id, foundry.utils.mergeObject(config, {
      events: {
        onReady: event => resolve(event.target)
      }
    })));
  }

  /* -------------------------------------------- */

  /**
   * Retrieve a YouTube video ID from a URL.
   * @param {string} url  The URL.
   * @returns {string}
   */
  getYouTubeId(url) {
    const [, id1, id2] = url?.match(this.#youTubeRegex) || [];
    return id1 || id2 || "";
  }

  /* -------------------------------------------- */

  /**
   * Take a URL to a YouTube video and convert it into a URL suitable for embedding in a YouTube iframe.
   * @param {string} url   The URL to convert.
   * @param {object} vars  YouTube player parameters.
   * @returns {string}     The YouTube embed URL.
   */
  getYouTubeEmbedURL(url, vars={}) {
    const videoId = this.getYouTubeId(url);
    if ( !videoId ) return "";
    const embed = new URL(`https://www.youtube.com/embed/${videoId}`);
    embed.searchParams.append("enablejsapi", "1");
    Object.entries(vars).forEach(([k, v]) => embed.searchParams.append(k, v));
    // To loop a video with iframe parameters, we must additionally supply the playlist parameter that points to the
    // same video: https://developers.google.com/youtube/player_parameters#Parameters
    if ( vars.loop ) embed.searchParams.append("playlist", videoId);
    return embed.href;
  }

  /* -------------------------------------------- */

  /**
   * Test a URL to see if it points to a YouTube video.
   * @param {string} url  The URL to test.
   * @returns {boolean}
   */
  isYouTubeURL(url="") {
    return this.#youTubeRegex.test(url);
  }

  /* -------------------------------------------- */

  /**
   * Inject the YouTube API into the page.
   * @returns {Promise}  A Promise that resolves when the API has initialized.
   */
  #injectYouTubeAPI() {
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(script);
    return new Promise(resolve => {
      window.onYouTubeIframeAPIReady = () => {
        delete window.onYouTubeIframeAPIReady;
        resolve();
      };
    });
  }
}

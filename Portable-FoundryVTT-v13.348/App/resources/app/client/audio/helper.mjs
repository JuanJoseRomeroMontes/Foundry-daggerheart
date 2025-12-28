import Tile from "../canvas/placeables/tile.mjs";
import AudioBufferCache from "./cache.mjs";
import Sound from "./sound.mjs";
import Hooks from "@client/helpers/hooks.mjs";

/**
 * @import * as io from "socket.io-client";
 * @import {SoundCreationOptions} from "./_types.mjs";
 * @import {ContextName} from "./_types.mjs";
 * @import {BandName} from "./_types.mjs";
 * @import {AnalysisNodes} from "./_types.mjs";
 * @import {AnalysisDataValue} from "./_types.mjs";
 * @import {AnalysisData} from "./_types.mjs";
 */

/**
 * A helper class to provide common functionality for working with the Web Audio API.
 * https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API
 * A singleton instance of this class is available as game#audio.
 * @see {@link foundry.Game#audio}
 */
export default class AudioHelper {
  constructor() {
    if ( game.audio instanceof this.constructor ) {
      throw new Error("You may not re-initialize the singleton AudioHelper. Use game.audio instead.");
    }
    this.unlock = this.awaitFirstGesture();

    /**
     * Analyzers for each context, plus an internal ticker. Each context key
     * holds data about its AnalyserNode, a Float32Array for FFT data, and so on.
     * @type {AnalysisData}
     */
    this.analyzer = Object.seal({
      music: {active: false, node: null, dataArray: null, lastUsed: 0, db: {}, bands: {}},
      environment: {active: false, node: null, dataArray: null, lastUsed: 0, db: {}, bands: {}},
      interface: {active: false, node: null, dataArray: null, lastUsed: 0, db: {}, bands: {}},
      analysisLoopActive: false
    });
  }

  /**
   * An array containing all possible audio context names.
   * @type {ReadonlyArray<ContextName>}
   */
  static AUDIO_CONTEXTS = Object.freeze(["music", "environment", "interface"]);

  /**
   * The Native interval for the AudioHelper to analyse audio levels from streams
   * Any interval passed to startLevelReports() would need to be a multiple of this value.
   * @type {number}
   */
  static levelAnalyserNativeInterval = 50;

  /**
   * The cache size threshold after which audio buffers will be expired from the cache to make more room.
   * 1 gigabyte, by default.
   */
  static THRESHOLD_CACHE_SIZE_BYTES = Math.pow(1024, 3);

  /**
   * Audio Context singleton used for analysing audio levels of each stream
   * Only created if necessary to listen to audio streams.
   * @type {AudioContext}
   */
  static #analyzerContext;

  /**
   * The set of singleton Sound instances which are shared across multiple uses of the same sound path.
   * @type {Map<string,WeakRef<Sound>>}
   */
  sounds = new Map();

  /**
   * Get a map of the Sound objects which are currently playing.
   * @type {Map<number,Sound>}
   */
  playing = new Map();

  /**
   * A user gesture must be registered before audio can be played.
   * This Array contains the Sound instances which are requested for playback prior to a gesture.
   * Once a gesture is observed, we begin playing all elements of this Array.
   * @type {Function[]}
   * @see {@link foundry.audio.Sound}
   */
  pending = [];

  /**
   * A Promise which resolves once the game audio API is unlocked and ready to use.
   * @type {Promise<void>}
   */
  unlock;

  /**
   * A flag for whether video playback is currently locked by awaiting a user gesture
   * @type {boolean}
   */
  locked = true;

  /**
   * A singleton audio context used for playback of music.
   * @type {AudioContext}
   */
  music;

  /**
   * A singleton audio context used for playback of environmental audio.
   * @type {AudioContext}
   */
  environment;

  /**
   * A singleton audio context used for playback of interface sounds and effects.
   * @type {AudioContext}
   */
  interface;

  /**
   * For backwards compatibility, AudioHelper#context refers to the context used for music playback.
   * @type {AudioContext}
   */
  get context() {
    return this.music;
  }

  /**
   * Interval ID as returned by setInterval for analysing the volume of streams
   * When set to 0, means no timer is set.
   * @type {number}
   */
  #analyserInterval;

  /**
   * A singleton cache used for audio buffers.
   * @type {AudioBufferCache}
   */
  buffers = new AudioBufferCache(AudioHelper.THRESHOLD_CACHE_SIZE_BYTES);

  /**
   * Map of all streams that we listen to for determining the decibel levels.
   * Used for analyzing audio levels of each stream.
   * @type {Record<string, {stream: MediaStream, analyser: AnalyserNode, interval: number, callback: Function}>}
   */
  #analyserStreams = {};

  /**
   * Fast Fourier Transform Array.
   * Used for analysing the decibel level of streams. The array is allocated only once
   * then filled by the analyser repeatedly. We only generate it when we need to listen to
   * a stream's level, so we initialize it to null.
   * @type {Float32Array}
   */
  #fftArray = null;

  /* -------------------------------------------- */

  /**
   * A global mute which suppresses all 3 audio channels.
   * @type {boolean}
   */
  get globalMute() {
    return this.#globalMute;
  }

  set globalMute(muted) {
    if ( typeof muted !== "boolean" ) throw new Error("AudioHelper#globalMute must be a boolean");
    if ( muted ) {
      AudioHelper.#onChangeMusicVolume(0);
      AudioHelper.#onChangeEnvironmentVolume(0);
      AudioHelper.#onChangeInterfaceVolume(0);
    } else {
      AudioHelper.#onChangeMusicVolume(game.settings.get("core", "globalPlaylistVolume"));
      AudioHelper.#onChangeEnvironmentVolume(game.settings.get("core", "globalAmbientVolume"));
      AudioHelper.#onChangeInterfaceVolume(game.settings.get("core", "globalInterfaceVolume"));
    }
    this.#globalMute = muted;
  }

  #globalMute = false;

  /* -------------------------------------------- */

  /**
   * Create a Sound instance for a given audio source URL
   * @param {SoundCreationOptions} options        Sound creation options
   * @returns {Sound}
   */
  create({src, context, singleton=true, preload=false, autoplay=false, autoplayOptions={}}) {
    let sound;

    // Share singleton sounds across multiple use cases
    if ( singleton ) {
      const ref = this.sounds.get(src);
      sound = ref?.deref();
      if ( !sound ) {
        sound = new Sound(src, {context});
        this.sounds.set(src, new WeakRef(sound));
      }
    }

    // Create an independent sound instance
    else sound = new Sound(src, {context});

    // Preload or autoplay
    if ( preload && !sound.loaded ) sound.load({autoplay, autoplayOptions});
    else if ( autoplay ) sound.play(autoplayOptions);
    return sound;
  }

  /* -------------------------------------------- */

  /**
   * Test whether a source file has a supported audio extension type
   * @param {string} src      A requested audio source path
   * @returns {boolean}       Does the filename end with a valid audio extension?
   */
  static hasAudioExtension(src) {
    let rgx = new RegExp(`(\\.${Object.keys(CONST.AUDIO_FILE_EXTENSIONS).join("|\\.")})(\\?.*)?`, "i");
    return rgx.test(src);
  }

  /* -------------------------------------------- */

  /**
   * Given an input file path, determine a default name for the sound based on the filename
   * @param {string} src      An input file path
   * @returns {string}        A default sound name for the path
   */
  static getDefaultSoundName(src) {
    const parts = src.split("/").pop().split(".");
    parts.pop();
    const name = decodeURIComponent(parts.join("."));
    return name.replace(/[-_.]/g, " ").titleCase();
  }

  /* -------------------------------------------- */

  /**
   * Play a single Sound by providing its source.
   * @param {string} src            The file path to the audio source being played
   * @param {object} [options]      Additional options which configure playback
   * @param {AudioContext} [options.context]  A specific AudioContext within which to play
   * @returns {Promise<Sound>}      The created Sound which is now playing
   */
  async play(src, {context, ...options}={}) {
    const sound = new Sound(src, {context});
    await sound.load();
    sound.play(options);
    return sound;
  }

  /* -------------------------------------------- */

  /**
   * Register an event listener to await the first mousemove gesture and begin playback once observed.
   * @returns {Promise<void>}       The unlocked audio context
   */
  async awaitFirstGesture() {
    if ( !this.locked ) return;
    await new Promise(resolve => {
      for ( const eventName of ["contextmenu", "auxclick", "pointerdown", "pointerup", "keydown"] ) {
        document.addEventListener(eventName, event => this.#onFirstGesture(event, resolve), {once: true});
      }
    });
  }

  /* -------------------------------------------- */

  /**
   * Request that other connected clients begin preloading a certain sound path.
   * @param {string} src          The source file path requested for preload
   * @returns {Promise<Sound>}    A Promise which resolves once the preload is complete
   */
  preload(src) {
    if ( !src || !AudioHelper.hasAudioExtension(src) ) {
      throw new Error(`Invalid audio source path ${src} provided for preload request`);
    }
    game.socket.emit("preloadAudio", src);
    return this.constructor.preloadSound(src);
  }

  /* -------------------------------------------- */
  /*  Settings and Volume Controls                */
  /* -------------------------------------------- */

  /**
   * Register client-level settings for global volume controls.
   */
  static registerSettings() {

    // Playlist Volume
    game.settings.register("core", "globalPlaylistVolume", {
      name: "Global Playlist Volume",
      hint: "Define a global playlist volume modifier",
      scope: "client",
      config: false,
      type: new foundry.data.fields.AlphaField({required: true, initial: 0.5}),
      onChange: AudioHelper.#onChangeMusicVolume
    });

    // Ambient Volume
    game.settings.register("core", "globalAmbientVolume", {
      name: "Global Ambient Volume",
      hint: "Define a global ambient volume modifier",
      scope: "client",
      config: false,
      type: new foundry.data.fields.AlphaField({required: true, initial: 0.5}),
      onChange: AudioHelper.#onChangeEnvironmentVolume
    });

    // Interface Volume
    game.settings.register("core", "globalInterfaceVolume", {
      name: "Global Interface Volume",
      hint: "Define a global interface volume modifier",
      scope: "client",
      config: false,
      type: new foundry.data.fields.AlphaField({required: true, initial: 0.5}),
      onChange: AudioHelper.#onChangeInterfaceVolume
    });
  }

  /* -------------------------------------------- */

  /**
   * Handle changes to the global music volume slider.
   * @param {number} volume
   */
  static #onChangeMusicVolume(volume) {
    volume = Math.clamp(volume, 0, 1);
    const ctx = game.audio.music;
    if ( !ctx ) return;
    ctx.gainNode.gain.setValueAtTime(volume, ctx.currentTime);
    ui.playlists?.render();
    Hooks.callAll("globalPlaylistVolumeChanged", volume);
  }

  /* -------------------------------------------- */

  /**
   * Handle changes to the global environment volume slider.
   * @param {number} volume
   */
  static #onChangeEnvironmentVolume(volume) {
    volume = Math.clamp(volume, 0, 1);
    const ctx = game.audio.environment;
    if ( !ctx ) return;
    ctx.gainNode.gain.setValueAtTime(volume, ctx.currentTime);
    if ( canvas.ready ) {
      for ( const mesh of canvas.primary.videoMeshes ) {
        mesh.sourceElement.volume = mesh.object instanceof Tile ? mesh.object.volume : volume;
      }
    }
    ui.playlists?.render();
    Hooks.callAll("globalAmbientVolumeChanged", volume);
  }

  /* -------------------------------------------- */

  /**
   * Handle changes to the global interface volume slider.
   * @param {number} volume
   */
  static #onChangeInterfaceVolume(volume) {
    volume = Math.clamp(volume, 0, 1);
    const ctx = game.audio.interface;
    if ( !ctx ) return;
    ctx.gainNode.gain.setValueAtTime(volume, ctx.currentTime);
    ui.playlists?.render();
    Hooks.callAll("globalInterfaceVolumeChanged", volume);
  }

  /* -------------------------------------------- */
  /*  Socket Listeners and Handlers               */
  /* -------------------------------------------- */

  /**
   * Open socket listeners which transact ChatMessage data
   * @param {io.Socket} socket
   */
  static _activateSocketListeners(socket) {
    socket.on("playAudio", audioData => this.play(audioData, false));
    socket.on("playAudioPosition", args => canvas.sounds.playAtPosition(...args));
    socket.on("preloadAudio", src => this.preloadSound(src));
  }

  /* -------------------------------------------- */

  /**
   * Play a one-off sound effect which is not part of a Playlist
   *
   * @param {object} data        An object configuring the audio data to play.
   * @param {string} data.src    The audio source file path, either a public URL or a local path relative to the
   *                             public directory.
   * @param {string} [data.channel="interface"]  An audio channel in CONST.AUDIO_CHANNELS where the sound should play.
   *                                             Default: `"interface"`.
   * @param {number} [data.volume=1]        The volume level at which to play the audio, between 0 and 1. Default: `1`.
   * @param {boolean} [data.autoplay=false] Begin playback of the audio effect immediately once it is loaded.
   *                                        Default: `false`.
   * @param {boolean} [data.loop=false]     Loop the audio effect and continue playing it until it is manually stopped.
   *                                        Default: `false`.
   * @param {boolean|{recipients: string[]}} [socketOptions=false]  Options which only apply when emitting playback over
   *                       websocket. As a boolean, emits (true) or does not emit (false) playback to all other clients.
   *                       As an object, can configure which recipients (an array of User IDs) should receive the event
   *                       (all clients by default). Default: `false`.
   * @returns {Sound|void} A Sound instance which controls audio playback, or nothing if `data.autoplay` is false.
   *
   * @example Play the sound of a locked door for all players
   * ```js
   * AudioHelper.play({src: "sounds/lock.wav", volume: 0.8, loop: false}, true);
   * ```
   */
  static play(data, socketOptions) {
    const audioData = foundry.utils.mergeObject({
      src: null,
      volume: 1.0,
      loop: false,
      channel: "interface"
    }, data, {insertKeys: true});

    // Push the sound to other clients
    const push = socketOptions && (socketOptions !== false);
    if ( push ) {
      socketOptions = foundry.utils.getType(socketOptions) === "Object" ? socketOptions : {};
      if ( ("recipients" in socketOptions) && !Array.isArray(socketOptions.recipients)) {
        throw new Error("Socket recipients must be an array of User IDs");
      }
      game.socket.emit("playAudio", audioData, socketOptions);
    }

    // Backwards compatibility, if autoplay was passed as false take no further action
    if ( audioData.autoplay === false ) return;

    // Play the sound locally
    return game.audio.play(audioData.src, {
      volume: audioData.volume ?? 1.0,
      loop: audioData.loop,
      context: game.audio[audioData.channel]
    });
  }

  /* -------------------------------------------- */

  /**
   * Begin loading the sound for a provided source URL adding its
   * @param {string} src            The audio source path to preload
   * @returns {Promise<Sound>}      The created and loaded Sound ready for playback
   */
  static async preloadSound(src) {
    const sound = game.audio.create({src: src, preload: false, singleton: true});
    await sound.load();
    return sound;
  }

  /* -------------------------------------------- */

  /**
   * Returns the volume value based on a range input volume control's position.
   * This is using an exponential approximation of the logarithmic nature of audio level perception
   * @param {number|string} value   Value between [0, 1] of the range input
   * @param {number} [order=1.5]    The exponent of the curve
   * @returns {number}
   */
  static inputToVolume(value, order=1.5) {
    if ( typeof value === "string" ) value = parseFloat(value);
    return Math.pow(value, order);
  }

  /* -------------------------------------------- */

  /**
   * Counterpart to inputToVolume()
   * Returns the input range value based on a volume
   * @param {number} volume         Value between [0, 1] of the volume level
   * @param {number} [order=1.5]    The exponent of the curve
   * @returns {number}
   */
  static volumeToInput(volume, order=1.5) {
    return Math.pow(volume, 1 / order);
  }

  /* -------------------------------------------- */

  /**
   * Converts a volume level to a human-readable percentage value.
   * @param {number} volume                      Value in the interval [0, 1] of the volume level.
   * @param {object} [options]
   * @param {boolean} [options.label=false]      Prefix the returned tooltip with a localized 'Volume: ' label. This
   *                                             should be used if the returned string is intended for assistive
   *                                             technologies, such as the aria-valuetext attribute.
   * @param {number} [options.decimalPlaces=0]   The number of decimal places to round the percentage to.
   */
  static volumeToPercentage(volume, { label=false, decimalPlaces=0 }={}) {
    const pct = (volume * 100).toFixed(decimalPlaces);
    if ( label ) return game.i18n.format("PLAYLIST.VOLUME.TOOLTIP", { volume: pct });
    return `${pct}%`;
  }

  /* -------------------------------------------- */
  /*  Audio Stream Analysis                       */
  /* -------------------------------------------- */

  /**
   * Returns a singleton AudioContext if one can be created.
   * An audio context may not be available due to limited resources or browser compatibility
   * in which case null will be returned
   *
   * @returns {AudioContext}  A singleton AudioContext or null if one is not available
   */
  getAnalyzerContext() {
    if ( !AudioHelper.#analyzerContext ) AudioHelper.#analyzerContext = new AudioContext();
    return AudioHelper.#analyzerContext;
  }

  /* -------------------------------------------- */

  /**
   * Registers a stream for periodic reports of audio levels.
   * Once added, the callback will be called with the maximum decibel level of
   * the audio tracks in that stream since the last time the event was fired.
   * The interval needs to be a multiple of AudioHelper.levelAnalyserNativeInterval which defaults at 50ms
   *
   * @param {string} id             An id to assign to this report. Can be used to stop reports
   * @param {MediaStream} stream    The MediaStream instance to report activity on.
   * @param {Function} callback     The callback function to call with the decibel level. `callback(dbLevel)`
   * @param {number} [interval]     The interval at which to produce reports.
   * @param {number} [smoothing]    The smoothingTimeConstant to set on the audio analyser.
   * @returns {boolean}             Returns whether listening to the stream was successful
   */
  startLevelReports(id, stream, callback, interval=50, smoothing=0.1) {
    if ( !stream || !id ) return false;
    let audioContext = this.getAnalyzerContext();
    if (audioContext === null) return false;

    // Clean up any existing report with the same ID
    this.stopLevelReports(id);

    // Make sure this stream has audio tracks, otherwise we can't connect the analyser to it
    if (stream.getAudioTracks().length === 0) return false;

    // Create the analyser
    let analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = smoothing;

    // Connect the analyser to the MediaStreamSource
    audioContext.createMediaStreamSource(stream).connect(analyser);
    this.#analyserStreams[id] = {stream, analyser, interval, callback, _lastEmit: 0};

    // Ensure the analyser timer is started as we have at least one valid stream to listen to
    this.#ensureAnalyserTimer();
    return true;
  }

  /* -------------------------------------------- */

  /**
   * Stop sending audio level reports
   * This stops listening to a stream and stops sending reports.
   * If we aren't listening to any more streams, cancel the global analyser timer.
   * @param {string} id      The id of the reports that passed to startLevelReports.
   */
  stopLevelReports(id) {
    delete this.#analyserStreams[id];
    if ( foundry.utils.isEmpty(this.#analyserStreams) ) this.#cancelAnalyserTimer();
  }

  /* -------------------------------------------- */

  /**
   * Ensures the global analyser timer is started
   *
   * We create only one timer that runs every 50ms and only create it if needed, this is meant to optimize things
   * and avoid having multiple timers running if we want to analyse multiple streams at the same time.
   * I don't know if it actually helps much with performance but it's expected that limiting the number of timers
   * running at the same time is good practice and with JS itself, there's a potential for a timer congestion
   * phenomenon if too many are created.
   */
  #ensureAnalyserTimer() {
    if ( !this.#analyserInterval ) {
      this.#analyserInterval = setInterval(this.#emitVolumes.bind(this), AudioHelper.levelAnalyserNativeInterval);
    }
  }

  /* -------------------------------------------- */

  /**
   * Cancel the global analyser timer
   * If the timer is running and has become unnecessary, stops it.
   */
  #cancelAnalyserTimer() {
    if ( this.#analyserInterval ) {
      clearInterval(this.#analyserInterval);
      this.#analyserInterval = undefined;
    }
  }

  /* -------------------------------------------- */

  /**
   * Capture audio level for all speakers and emit a webrtcVolumes custom event with all the volume levels
   * detected since the last emit.
   * The event's detail is in the form of {userId: decibelLevel}
   */
  #emitVolumes() {
    for ( const stream of Object.values(this.#analyserStreams) ) {
      if ( ++stream._lastEmit < (stream.interval / AudioHelper.levelAnalyserNativeInterval) ) continue;

      // Create the Fast Fourier Transform Array only once. Assume all analysers use the same fftSize
      if ( this.#fftArray === null ) this.#fftArray = new Float32Array(stream.analyser.frequencyBinCount);

      // Fill the array
      stream.analyser.getFloatFrequencyData(this.#fftArray);
      const maxDecibel = Math.max(...this.#fftArray);
      stream.callback(maxDecibel, this.#fftArray);
      stream._lastEmit = 0;
    }
  }

  /* -------------------------------------------- */
  /*  Event Handlers                              */
  /* -------------------------------------------- */

  /**
   * Handle the first observed user gesture
   * @param {Event} event         The mouse-move event which enables playback
   * @param {Function} resolve    The Promise resolution function
   */
  #onFirstGesture(event, resolve) {
    if ( !this.locked ) return resolve();

    // Create audio contexts
    this.music = AudioHelper.#createContext("globalPlaylistVolume");
    this.environment = AudioHelper.#createContext("globalAmbientVolume");
    this.interface = AudioHelper.#createContext("globalInterfaceVolume");

    // Unlock and evaluate pending playbacks
    this.locked = false;
    if ( this.pending.length ) {
      console.log(`${CONST.vtt} | Activating pending audio playback with user gesture.`);
      this.pending.forEach(fn => fn());
      this.pending = [];
    }
    return resolve();
  }

  /* -------------------------------------------- */

  /**
   * Create an AudioContext with an attached GainNode for master volume control.
   * @returns {AudioContext}
   */
  static #createContext(volumeSetting) {
    const ctx = new AudioContext();
    ctx.gainNode = ctx.createGain();
    ctx.gainNode.connect(ctx.destination);
    const volume = game.settings.get("core", volumeSetting);
    ctx.gainNode.gain.setValueAtTime(volume, ctx.currentTime);
    return ctx;
  }

  /* -------------------------------------------- */

  /**
   * Log a debugging message if the audio debugging flag is enabled.
   * @param {string} message      The message to log
   */
  debug(message) {
    if ( CONFIG.debug.audio ) console.debug(`${CONST.vtt} | ${message}`);
  }

  /* -------------------------------------------- */
  /*  Public Analyzer Methods and Properties      */
  /* -------------------------------------------- */

  /**
   * A static inactivity threshold for audio analysis, in milliseconds.
   * If no band value is requested for a channel within this duration,
   * the analyzer is disabled to conserve resources (unless the analyzer is enabled with the `keepAlive=true` option)
   * @type {number}
   */
  static ANALYSIS_TIMEOUT_MS = 1000;

  /* -------------------------------------------- */

  /**
   * Enable the analyzer for a given context (music, environment, interface),
   * attaching an AnalyserNode to its gain node if not already active.
   * @param {ContextName} contextName
   * @param {object} [options={}]
   * @param {boolean} [options.keepAlive=false]  If true, this analyzer will not auto-disable after inactivity.
   */
  enableAnalyzer(contextName, {keepAlive=false}={}) {
    const data = this.analyzer[contextName];
    if ( !this[contextName] || data.active ) return;

    const ctx = this[contextName];
    if ( !ctx.gainNode ) return;

    data.node = ctx.createAnalyser();
    data.node.fftSize = 512;
    data.node.smoothingTimeConstant = 0.8;
    ctx.gainNode.connect(data.node);

    data.dataArray = new Float32Array(data.node.frequencyBinCount);
    data.lastUsed = performance.now();
    data.db = {bass: -Infinity, mid: -Infinity, treble: -Infinity, all: -Infinity};
    data.bands = {bass: 0, mid: 0, treble: 0, all: 0};
    data.active = true;
    data.keepAlive = keepAlive;
    this.#startAnalysisLoop();
  }

  /* -------------------------------------------- */

  /**
   * Disable the analyzer for a given context, disconnecting the AnalyserNode.
   * @param {ContextName} contextName
   */
  disableAnalyzer(contextName) {
    const data = this.analyzer[contextName];
    if ( !data.active ) return;
    data.active = false;
    if ( data.node ) {
      this[contextName].gainNode.disconnect(data.node);
      data.node.disconnect();
      data.node = null;
      data.dataArray = null;
      data.db = {bass: -Infinity, mid: -Infinity, treble: -Infinity, all: -Infinity};
      data.bands = {bass: 0, mid: 0, treble: 0, all: 0};
      data.keepAlive = false;
    }
    this.#checkStopAnalysisLoop();
  }

  /* -------------------------------------------- */

  /**
   * Returns a normalized band value in [0,1].
   * Optionally, we can subtract the actual gainNode (global) volume from the measurement.
   * - Important:
   *   - Local gain applied to {@link foundry.audio.Sound} source can't be ignored.
   *   - If this method needs to activate the analyzer, the latter requires a brief warm-up.
   *     One or two frames may be needed before it produces meaningful values (instead of returning 0).
   * @param {ContextName} contextName
   * @param {BandName} bandName
   * @param {object} [options={}]
   * @param {boolean} [options.ignoreVolume=false]  If true, remove the real-time channel volume from the measurement.
   * @returns {number} The normalized band value in [0,1].
   */
  getBandLevel(contextName, bandName, {ignoreVolume=false}={}) {
    /** @type {AnalysisDataValue} */
    const data = this.analyzer[contextName];

    // If the analyzer is not active, enable it automatically
    if ( !data.active ) this.enableAnalyzer(contextName);

    // Update the last time we requested data
    data.lastUsed = performance.now();

    // Retrieve the raw dB for the chosen band
    const rawDb = data.db[bandName] ?? -Infinity;

    // If we do not want to remove the channel volume, return the stored normalized value
    if ( !ignoreVolume ) return data.bands[bandName] ?? 0;

    // Otherwise, compute a "dry" decibel level by subtracting the real-time gain
    const ctx = this[contextName];
    if ( !ctx?.gainNode ) return data.bands[bandName] ?? 0;
    const vol = ctx.gainNode.gain.value;
    if ( vol <= 0 ) return 0;

    // Convert an amplitude ratio to decibels (dB). Decibels use a logarithmic scale.
    // In dBFS (decibels full scale), the reference amplitude is 1, so we have:
    // - dB = 20 * log10(amplitude / 1) = 20 * log10(amplitude)
    // - See https://en.wikipedia.org/wiki/DBFS for more details on dBFS
    const volDb = 20 * Math.log10(vol);
    const correctedDb = rawDb - volDb;
    return this.#dbToNormalized(correctedDb);
  }

  /* -------------------------------------------- */

  /**
   * Retrieve a single "peak" analyzer value across the three main audio contexts (music, environment, interface).
   * This takes the maximum of the three normalized [0,1] values for a given frequency band.
   * @param {BandName} [band="all"] The frequency band for which to retrieve an analyzer value.
   * @param {object} [options={}]
   * @param {boolean} [options.ignoreVolume=false] If true, remove the real-time channel volume from the measurement.
   * @returns {number} A number in the [0,1] range representing the loudest band value among the three contexts.
   */
  getMaxBandLevel(band="all", {ignoreVolume=false}={}) {
    let peak = 0;
    for ( const ctxName of AudioHelper.AUDIO_CONTEXTS ) {
      const val = this.getBandLevel(ctxName, band, {ignoreVolume});
      if ( val > peak ) peak = val;
    }
    return peak;
  }

  /* -------------------------------------------- */
  /*  Private Analyzer Methods                    */
  /* -------------------------------------------- */

  /**
   * Start the requestAnimationFrame loop for audio analysis if it's not already active.
   */
  #startAnalysisLoop() {
    if ( this.analyzer.analysisLoopActive ) return;
    this.analyzer.analysisLoopActive = true;
    const loop = () => {
      if ( !this.analyzer.analysisLoopActive ) return;
      this.#onAnalyzeAudioFrame();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  /* -------------------------------------------- */

  /**
   * Check if any analyzer is active. If none, stop the analysis loop.
   */
  #checkStopAnalysisLoop() {
    const activeAny = AudioHelper.AUDIO_CONTEXTS.some(c => this.analyzer[c].active);
    if ( !activeAny ) this.analyzer.analysisLoopActive = false;
  }

  /* -------------------------------------------- */

  /**
   * Invoked each frame while the internal loop is active. Updates FFT data for every active analyzer.
   * If the analyzer has not been queried for longer than {@link AudioHelper.ANALYSIS_TIMEOUT_MS},
   * it is disabled.
   */
  #onAnalyzeAudioFrame() {
    const now = performance.now();

    for ( const ctxName of AudioHelper.AUDIO_CONTEXTS ) {
      /** @type {AnalysisDataValue} */
      const data = this.analyzer[ctxName];
      if ( !data.active || !this[ctxName]?.gainNode || !data.node ) continue;

      // If we've exceeded the timeout without a request, disable the analyzer
      if ( !data.keepAlive && (now - data.lastUsed) > AudioHelper.ANALYSIS_TIMEOUT_MS ) {
        this.disableAnalyzer(ctxName);
        continue;
      }

      // Pull the FFT data into dataArray
      data.node.getFloatFrequencyData(data.dataArray);

      // Compute average decibel levels for several bands
      const bassDb = this.#computeAverageDb(data.dataArray, data.node.context.sampleRate, 20, 200);
      const midDb = this.#computeAverageDb(data.dataArray, data.node.context.sampleRate, 200, 2000);
      const trebleDb = this.#computeAverageDb(data.dataArray, data.node.context.sampleRate, 2000, 8000);
      const allDb = this.#computeAverageDb(data.dataArray, data.node.context.sampleRate, 20, 20000);

      // Store the raw dB values
      data.db.bass = bassDb;
      data.db.mid = midDb;
      data.db.treble = trebleDb;
      data.db.all = allDb;

      // Convert each band to [0..1] and store
      data.bands.bass = this.#dbToNormalized(bassDb);
      data.bands.mid = this.#dbToNormalized(midDb);
      data.bands.treble = this.#dbToNormalized(trebleDb);
      data.bands.all = this.#dbToNormalized(allDb);
    }

    // Possibly stop the analysis loop if no analyzer remains active
    this.#checkStopAnalysisLoop();
  }

  /* -------------------------------------------- */

  /**
   * Compute the average decibel value of a frequency band, without normalizing to [0,1].
   * @param {Float32Array} dataArray The frequency data array in decibels.
   * @param {number} sampleRate      The audio sample rate of the AnalyserNode context.
   * @param {number} freqMin         The lower bound of the frequency range.
   * @param {number} freqMax         The upper bound of the frequency range.
   * @returns {number}               The average decibel value (could be -Infinity if no bins).
   */
  #computeAverageDb(dataArray, sampleRate, freqMin, freqMax) {
    const fftSize = 512;
    const binHz = sampleRate / fftSize;

    const iMin = Math.floor(freqMin / binHz);
    const iMax = Math.floor(freqMax / binHz);

    let sum = 0;
    let count = 0;
    const start = Math.max(0, iMin);
    const end = Math.min(dataArray.length - 1, iMax);

    for ( let i = start; i <= end; i++ ) {
      sum += dataArray[i];
      count++;
    }
    if ( !count ) return -Infinity;
    return sum / count;
  }

  /* -------------------------------------------- */

  /**
   * Maps a dB value (in [-100, -30]) to a normalized [0,1].
   */
  #dbToNormalized(dbValue) {
    const minDb = -100;
    const maxDb = -30;
    if ( dbValue < minDb ) return 0;
    if ( dbValue > maxDb ) return 1;
    return (dbValue - minDb) / (maxDb - minDb);
  }

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  getCache(src) {
    foundry.utils.logCompatibilityWarning("AudioHelper#getCache is deprecated in favor of AudioHelper#buffers#get");
    return this.buffers.getBuffer(src, {since: 12, until: 14});
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  updateCache(src, playing=false) {
    foundry.utils.logCompatibilityWarning("AudioHelper#updateCache is deprecated without replacement");
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  setCache(src, buffer) {
    foundry.utils.logCompatibilityWarning("AudioHelper#setCache is deprecated in favor of AudioHelper#buffers#set");
    this.buffers.setBuffer(src, buffer);
  }
}

/**
 * @typedef AudioBufferCacheEntry
 * @property {string} src
 * @property {AudioBuffer} buffer
 * @property {number} size
 * @property {boolean} [locked]
 * @property {AudioBufferCacheEntry} [next]
 * @property {AudioBufferCacheEntry} [previous]
 */

/**
 * @typedef SoundCreationOptions
 * @property {string} src                    The source URL for the audio file
 * @property {AudioContext} [context]        A specific AudioContext to attach the sound to
 * @property {boolean} [singleton=true]      Reuse an existing Sound for this source?
 * @property {boolean} [preload=false]       Begin loading the audio immediately?
 * @property {boolean} [autoplay=false]      Begin playing the audio as soon as it is ready?
 * @property {SoundPlaybackOptions} [autoplayOptions={}]  Options passed to the play method if autoplay is true
 */

/**
 * @typedef SoundPlaybackOptions
 * @property {number} [delay=0]               A delay in seconds by which to delay playback
 * @property {number} [duration]              A limited duration in seconds for which to play
 * @property {number} [fade=0]                A duration in milliseconds over which to fade in playback
 * @property {boolean} [loop=false]           Should sound playback loop?
 * @property {number} [loopStart=0]           Seconds of the AudioBuffer when looped playback should start.
 *                                            Only works for AudioBufferSourceNode.
 * @property {number} [loopEnd]               Seconds of the Audio buffer when looped playback should restart.
 *                                            Only works for AudioBufferSourceNode.
 * @property {number} [offset=0]              An offset in seconds at which to start playback
 * @property {Function|null} [onended]        A callback function attached to the source node
 * @property {number} [volume=1.0]            The volume at which to play the sound
 */

/**
 * @callback SoundScheduleCallback
 * @param {Sound} sound                       The Sound instance being scheduled
 * @returns {any}                             A return value of the callback is returned as the resolved value of the
 *                                            Sound#schedule promise
 */

/**
 * An object representing the raw and normalized audio data produced by an AnalyserNode
 * for a given audio context (music, environment, interface).
 *
 * @typedef AnalysisDataValue
 * @property {boolean} active               Whether the analyzer is currently active.
 * @property {boolean} keepAlive            If true, the analyzer remains active and will not be disabled after inactivity.
 * @property {AnalyserNode|null} node       The AnalyserNode for this context, or null if inactive.
 * @property {Float32Array|null} dataArray  The FFT frequency data buffer used by the AnalyserNode.
 * @property {Object} db                    Raw average decibel values for each frequency band.
 * @property {number} db.bass               Average dB in ~20-200 Hz.
 * @property {number} db.mid                Average dB in ~200-2000 Hz.
 * @property {number} db.treble             Average dB in ~2000-8000 Hz.
 * @property {number} db.all                Average dB in ~20-20000 Hz.
 * @property {Object} bands                 Normalized [0,1] values for the same bands.
 * @property {number} bands.bass            Normalized amplitude for low frequencies.
 * @property {number} bands.mid             Normalized amplitude for midrange frequencies.
 * @property {number} bands.treble          Normalized amplitude for high frequencies.
 * @property {number} bands.all             Normalized amplitude for the entire audible range.
 * @property {number} lastUsed              The timestamp when data was last requested.
 */

/**
 * An object mapping each audio context name (music, environment, interface)
 * to an {@link foundry.audio.AnalysisDataValue}.
 *
 * @typedef AnalysisData
 * @property {AnalysisDataValue} music         Analysis data for the music context.
 * @property {AnalysisDataValue} environment   Analysis data for the ambient/environment context.
 * @property {AnalysisDataValue} interface     Analysis data for the interface context.
 * @property {boolean} analysisLoopActive      Whether the internal RAQ loop is currently running.
 */

/**
 * @typedef {"music"|"environment"|"interface"} ContextName
 */

/**
 * @typedef {"bass"|"mid"|"treble"|"all"} BandName
 */

/**
 * @typedef AnalysisNodes
 * @property {AnalyserNode|null} music         The AnalyserNode for music, or null if not active.
 * @property {AnalyserNode|null} environment   The AnalyserNode for ambient, or null if not active.
 * @property {AnalyserNode|null} interface     The AnalyserNode for interface, or null if not active.
 */





import BasePlaylistSound from "@common/documents/playlist-sound.mjs";
import ClientDocumentMixin from "./abstract/client-document.mjs";

/**
 * The client-side PlaylistSound document which extends the common BasePlaylistSound model.
 * Each PlaylistSound belongs to the sounds collection of a Playlist document.
 * @extends BasePlaylistSound
 * @mixes ClientDocumentMixin
 * @category Documents
 *
 * @see {@link foundry.documents.Playlist}: The Playlist document which contains PlaylistSound embedded
 *   documents
 * @see {@link foundry.applications.sheets.PlaylistSoundConfig}: The PlaylistSound configuration
 *   application
 * @see {@link foundry.audio.Sound}   The Sound API which manages web audio playback
 */
export default class PlaylistSound extends ClientDocumentMixin(BasePlaylistSound) {

  /**
   * The debounce tolerance for processing rapid volume changes into database updates in milliseconds
   * @type {number}
   */
  static VOLUME_DEBOUNCE_MS = 100;

  /**
   * The Sound which manages playback for this playlist sound.
   * The Sound is created lazily when playback is required.
   * @type {Sound|null}
   */
  sound;

  /**
   * Handle returned by {@link Sound#schedule} for the pending fade-out.
   * @type {Promise|undefined}
   */
  #fadeHandle;

  /**
   * A debounced function, accepting a single volume parameter to adjust the volume of this sound
   * @type {(volume: number) => void}
   */
  debounceVolume = foundry.utils.debounce(volume => {
    this.update({volume}, {diff: false, render: false});
  }, PlaylistSound.VOLUME_DEBOUNCE_MS);

  /* -------------------------------------------- */

  /**
   * Create a Sound used to play this PlaylistSound document
   * @returns {Sound|null}
   * @protected
   */
  _createSound() {
    if ( game.audio.locked ) {
      throw new Error("You may not call PlaylistSound#_createSound until after game audio is unlocked.");
    }
    if ( !(this.id && this.path) ) return null;
    const sound = game.audio.create({src: this.path, context: this.context, singleton: false});
    sound.addEventListener("play", this._onStart.bind(this));
    sound.addEventListener("end", this._onEnd.bind(this));
    sound.addEventListener("stop", this._onStop.bind(this));
    return sound;
  }

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * Determine the fade-in length:
   * - If the track is not decoded yet, just honor the configured value.
   * - Once we know the real duration, cap the fade to half duration of the track.
   * @type {number}
   */
  get fadeDuration() {
    const fade = this.fade ?? this.parent?.fade ?? 0;
    if ( fade <= 0 ) return 0;

    const soundDuration = this.sound?.duration;
    if ( !Number.isFinite(soundDuration) ) return fade;

    const half = Math.ceil(soundDuration / 2) * 1000;
    return Math.clamp(fade, 0, half);
  }

  /**
   * The audio context within which this sound is played.
   * This will be undefined if the audio context is not yet active.
   * @type {AudioContext|undefined}
   */
  get context() {
    const channel = (this.channel || this.parent.channel) ?? "music";
    return game.audio[channel];
  }

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /**
   * schedule the fade-out that should occur when repeat is off.
   * Does nothing if the sound is set to repeat or has no finite duration.
   * @protected
   */
  _scheduleFadeOut() {
    const {sound, repeat, fadeDuration} = this;
    if ( repeat || !sound || !Number.isFinite(sound.duration) ) return;

    // Cancel any previous handle
    this._cancelFadeOut();

    // Compute delay until fade should start
    const now = sound.currentTime ?? 0;
    const startAfter = Math.max(0, (sound.duration - now) - (fadeDuration / 1000));

    // Schedule and store the new handle
    this.#fadeHandle = sound.schedule(
      () => sound.fade(0, {duration: fadeDuration}),
      now + startAfter
    );
  }

  /* -------------------------------------------- */

  /**
   * Cancel any pending fade-out on the current sound.
   * @protected
   */
  _cancelFadeOut() {
    if ( this.#fadeHandle ) {
      this.sound.unschedule(this.#fadeHandle);
      this.#fadeHandle = undefined;
    }
  }

  /* -------------------------------------------- */

  /**
   * Synchronize playback for this particular PlaylistSound instance.
   */
  sync() {

    // Conclude playback
    if ( !this.playing ) {
      if ( this.sound?.playing ) this.sound.stop({fade: this.pausedTime ? 0 : this.fadeDuration, volume: 0});
      return;
    }

    // Create a Sound if necessary
    this.sound ||= this._createSound();
    const sound = this.sound;
    if ( !sound || sound.failed ) return;

    // Update an already playing sound
    if ( sound.playing ) {
      if ( sound.loop !== this.repeat ) { // loop change case
        sound.loop = this.repeat;
        if ( !this.repeat ) this._scheduleFadeOut();
        else this._cancelFadeOut();
      }
      sound.fade(this.volume, {duration: 500});
      return;
    }

    // Begin playback
    sound.load({
      autoplay: true,
      autoplayOptions: {
        loop: this.repeat,
        volume: this.volume,
        fade: this.fadeDuration,
        offset: this.pausedTime && !sound.playing ? this.pausedTime : undefined
      }
    });
  }

  /* -------------------------------------------- */

  /**
   * Load the audio for this sound for the current client.
   * @returns {Promise<void>}
   */
  async load() {
    this.sound ||= this._createSound();
    await this.sound.load();
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  toAnchor({classes=[], ...options}={}) {
    if ( this.playing ) classes.push("playing");
    if ( !this.isOwner ) classes.push("disabled");
    return super.toAnchor({classes, ...options});
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onClickDocumentLink(event) {
    if ( this.playing ) return this.parent.stopSound(this);
    return this.parent.playSound(this);
  }

  /* -------------------------------------------- */
  /*  Event Handlers                              */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async _preUpdate(changed, options, user) {
    if ( "channel" in changed ) changed.playing = false;
    return super._preUpdate(changed, options, user);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);
    if ( ("path" in changed) || ("channel" in changed) ) {
      if ( this.sound ) this.sound.stop();
      this.sound = this._createSound();
    }
    if ( ("sort" in changed) && this.parent ) {
      this.parent._playbackOrder = undefined;
    }
    this.sync();
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onDelete(options, userId) {
    super._onDelete(options, userId);
    this.playing = false;
    this._cancelFadeOut();
    this.sync();
  }

  /* -------------------------------------------- */

  /**
   * Special handling that occurs when playback of a PlaylistSound is started.
   * @protected
   */
  async _onStart() {
    if ( !this.playing ) return this.sound.stop();

    const fd = this.fadeDuration;
    if ( fd ) this.sound.fade(this.volume, {duration: fd, from: 0}); // fade-in from silence

    this._scheduleFadeOut();

    // Playlist-level orchestration actions
    return this.parent._onSoundStart(this);
  }

  /* -------------------------------------------- */

  /**
   * Special handling that occurs when a PlaylistSound reaches the natural conclusion of its playback.
   * @protected
   */
  async _onEnd() {
    if ( !this.parent.isOwner ) return;
    return this.parent._onSoundEnd(this);
  }

  /* -------------------------------------------- */

  /**
   * Special handling that occurs when a PlaylistSound is manually stopped before its natural conclusion.
   * @protected
   */
  async _onStop() {}

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /**
   * The effective volume at which this playlist sound is played, incorporating the global playlist volume setting.
   * @type {number}
   */
  get effectiveVolume() {
    foundry.utils.logCompatibilityWarning("PlaylistSound#effectiveVolume is deprecated in favor of using"
      + " PlaylistSound#volume directly", {since: 12, until: 14});
    return this.volume;
  }
}

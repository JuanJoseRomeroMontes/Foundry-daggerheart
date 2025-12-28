import BasePlaylist from "@common/documents/playlist.mjs";
import ClientDocumentMixin from "./abstract/client-document.mjs";
import {PLAYLIST_MODES, PLAYLIST_SORT_MODES} from "@common/constants.mjs";

/**
 * The client-side Playlist document which extends the common BasePlaylist model.
 * @extends BasePlaylist
 * @mixes ClientDocumentMixin
 * @category Documents
 *
 * @see {@link foundry.documents.collections.Playlists}: The world-level collection of Playlist documents
 * @see {@link foundry.documents.PlaylistSound}: The PlaylistSound embedded document within a parent
 *   Playlist
 * @see {@link foundry.applications.sheets.PlaylistConfig}: The Playlist configuration application
 */
export default class Playlist extends ClientDocumentMixin(BasePlaylist) {

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * Playlists may have a playback order which defines the sequence of Playlist Sounds
   * @type {string[]}
   */
  #playbackOrder;

  /**
   * The order in which sounds within this playlist will be played (if sequential or shuffled)
   * Uses a stored seed for randomization to guarantee that all clients generate the same random order.
   * @type {string[]}
   */
  get playbackOrder() {
    if ( this.#playbackOrder !== undefined ) return this.#playbackOrder;
    switch ( this.mode ) {

      // Shuffle all tracks
      case PLAYLIST_MODES.SHUFFLE: {
        const ids = this.sounds.map(s => s.id);
        const mt = new foundry.dice.MersenneTwister(this.seed ?? 0);
        const shuffle = ids.reduce((shuffle, id) => {
          shuffle[id] = mt.random();
          return shuffle;
        }, {});
        ids.sort((a, b) => shuffle[a] - shuffle[b]);
        return this.#playbackOrder = ids;
      }

      // Sorted sequential playback
      default: {
        const sorted = this.sounds.contents.sort(this._sortSounds.bind(this));
        return this.#playbackOrder = sorted.map(s => s.id);
      }
    }
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  get visible() {
    return this.isOwner || this.playing;
  }

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /**
   * Find all content links belonging to a given {@link Playlist} or {@link foundry.documents.PlaylistSound}.
   * @param {Playlist|PlaylistSound} doc  The Playlist or PlaylistSound.
   * @returns {NodeListOf<Element>}
   * @protected
   */
  static _getSoundContentLinks(doc) {
    return document.querySelectorAll(`a[data-link][data-uuid="${doc.uuid}"]`);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  prepareDerivedData() {
    this.playing = this.sounds.some(s => s.playing);
  }

  /* -------------------------------------------- */

  /**
   * Begin simultaneous playback for all sounds in the Playlist.
   * @returns {Promise<Playlist>} The updated Playlist document
   */
  async playAll() {
    if ( this.sounds.size === 0 ) return this;
    const updateData = { playing: true };
    const order = this.playbackOrder;

    // Handle different playback modes
    switch ( this.mode ) {

      // Soundboard Only
      case PLAYLIST_MODES.DISABLED:
        updateData.playing = false;
        break;

      // Sequential or Shuffled Playback
      case PLAYLIST_MODES.SEQUENTIAL:
      case PLAYLIST_MODES.SHUFFLE: {
        const paused = this.sounds.find(s => s.pausedTime);
        const nextId = paused?.id || order[0];
        updateData.sounds = this.sounds.map(s => {
          return {_id: s.id, playing: s.id === nextId};
        });
        break;
      }

      // Simultaneous - play all tracks
      case PLAYLIST_MODES.SIMULTANEOUS:
        updateData.sounds = this.sounds.map(s => {
          return {_id: s.id, playing: true};
        });
        break;
    }

    // Update the Playlist
    return this.update(updateData);
  }

  /* -------------------------------------------- */

  /**
   * Play the next Sound within the sequential or shuffled Playlist.
   * @param {string} [soundId]      The currently playing sound ID, if known
   * @param {object} [options={}]   Additional options which configure the next track
   * @param {number} [options.direction=1] Whether to advance forward (if 1) or backwards (if -1)
   * @returns {Promise<this|null|undefined>} If successfully updated, this Playlist document
   */
  async playNext(soundId, {direction=1}={}) {
    if ( ![PLAYLIST_MODES.SEQUENTIAL, PLAYLIST_MODES.SHUFFLE].includes(this.mode) ) return null;

    // Determine the next sound
    if ( !soundId ) {
      const current = this.sounds.find(s => s.playing);
      soundId = current?.id ?? null;
    }
    let next = direction === 1 ? this._getNextSound(soundId) : this._getPreviousSound(soundId);
    if ( !this.playing ) next = null;

    // Enact playlist updates
    const sounds = this.sounds.map(s => ({_id: s.id, playing: s.id === next?.id, pausedTime: null}));
    const updateOptions = next?.id === soundId ? {diff: false, render: false, forceSync: true} : undefined;
    return this.update({sounds}, updateOptions);
  }

  /* -------------------------------------------- */

  /**
   * Begin playback of a specific Sound within this Playlist.
   * Determine which other sounds should remain playing, if any.
   * @param {PlaylistSound} sound       The desired sound that should play
   * @returns {Promise<Playlist>}       The updated Playlist
   */
  async playSound(sound) {
    const updates = {playing: true};
    switch ( this.mode ) {
      case PLAYLIST_MODES.SEQUENTIAL:
      case PLAYLIST_MODES.SHUFFLE:
        updates.sounds = this.sounds.map(s => {
          const isPlaying = s.id === sound.id;
          return {_id: s.id, playing: isPlaying, pausedTime: isPlaying ? s.pausedTime : null};
        });
        break;
      default:
        updates.sounds = [{_id: sound.id, playing: true}];
    }
    return this.update(updates);
  }

  /* -------------------------------------------- */

  /**
   * Stop playback of a specific Sound within this Playlist.
   * Determine which other sounds should remain playing, if any.
   * @param {PlaylistSound} sound       The desired sound that should play
   * @returns {Promise<Playlist>}       The updated Playlist
   */
  async stopSound(sound) {
    return this.update({
      playing: this.sounds.some(s => (s.id !== sound.id) && s.playing),
      sounds: [{_id: sound.id, playing: false, pausedTime: null}]
    });
  }

  /* -------------------------------------------- */

  /**
   * End playback for any/all currently playing sounds within the Playlist.
   * @returns {Promise<Playlist>} The updated Playlist document
   */
  async stopAll() {
    return this.update({
      playing: false,
      sounds: this.sounds.map(s => {
        return {_id: s.id, playing: false};
      })
    });
  }

  /* -------------------------------------------- */

  /**
   * Cycle the playlist mode
   * @returns {Promise<Playlist>}   A promise which resolves to the updated Playlist instance
   */
  async cycleMode() {
    const modes = Object.values(PLAYLIST_MODES);
    let mode = this.mode + 1;
    mode = mode > Math.max(...modes) ? modes[0] : mode;
    for ( const s of this.sounds ) s.playing = false;
    return this.update({sounds: this.sounds.toJSON(), mode: mode});
  }

  /* -------------------------------------------- */

  /**
   * Get the next sound in the cached playback order. For internal use.
   * @param {number} soundId
   * @protected
   */
  _getNextSound(soundId) {
    const order = this.playbackOrder;
    let idx = order.indexOf(soundId);
    if ( idx === order.length - 1 ) idx = -1;
    return this.sounds.get(order[idx+1]);
  }

  /* -------------------------------------------- */

  /**
   * Get the previous sound in the cached playback order. For internal use.
   * @param {number} soundId
   * @protected
   */
  _getPreviousSound(soundId) {
    const order = this.playbackOrder;
    let idx = order.indexOf(soundId);
    if ( idx === -1 ) idx = 1;
    else if ( idx === 0 ) idx = order.length;
    return this.sounds.get(order[idx-1]);
  }

  /* -------------------------------------------- */

  /**
   * Define the sorting order for the Sounds within this Playlist. For internal use.
   * If sorting alphabetically, the sounds are sorted with a locale-independent comparator
   * to ensure the same order on all clients.
   * @param {Sound} a
   * @param {Sound} b
   * @protected
   */
  _sortSounds(a, b) {
    switch ( this.sorting ) {
      case PLAYLIST_SORT_MODES.ALPHABETICAL: return a.name.compare(b.name);
      case PLAYLIST_SORT_MODES.MANUAL: return a.sort - b.sort;
    }
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
    if ( this.playing ) return this.stopAll();
    return this.playAll();
  }

  /* -------------------------------------------- */
  /*  Event Handlers                              */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async _preUpdate(changed, options, user) {
    if ( "channel" in changed ) {
      changed.playing = false;
      const sounds = (changed.sounds ??= this.sounds.map(s => ({_id: s._id})));
      for ( const sound of sounds ) {
        sound.playing = false;
        sound.pausedTime = null;
      }
    }
    if ((("mode" in changed) || ("playing" in changed)) && !("seed" in changed)) {
      changed.seed = Math.floor(Math.random() * 1000);
    }
    return super._preUpdate(changed, options, user);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);
    if ( "seed" in changed || "mode" in changed || "sorting" in changed ) this.#playbackOrder = undefined;
    if ( game.audio.locked ) return;

    if ( "channel" in changed ) {
      for ( const s of this.sounds ) {
        if ( s.sound ) s.sound.stop();
        s.sound = s._createSound();
        s.sync();
      }
    }
    else if ( (("sounds" in changed) || (options.forceSync === true)) && !game.audio.locked ) {
      this.sounds.forEach(s => s.sync());
    }
    this.#updateContentLinkPlaying(changed);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onDelete(options, userId) {
    super._onDelete(options, userId);
    this.sounds.forEach(s => s.sound?.stop());
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onCreateDescendantDocuments(parent, collection, documents, data, options, userId) {
    super._onCreateDescendantDocuments(parent, collection, documents, data, options, userId);
    this.#playbackOrder = undefined;
    if ( options.render !== false ) this.collection.render();
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onUpdateDescendantDocuments(parent, collection, documents, changes, options, userId) {
    super._onUpdateDescendantDocuments(parent, collection, documents, changes, options, userId);
    if ( (collection === "sounds") && changes.some(c => "sort" in c) ) this.#playbackOrder = undefined;
    if ( options.render !== false ) this.collection.render();
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onDeleteDescendantDocuments(parent, collection, documents, ids, options, userId) {
    super._onDeleteDescendantDocuments(parent, collection, documents, ids, options, userId);
    this.#playbackOrder = undefined;
    if ( options.render !== false ) this.collection.render();
  }

  /* -------------------------------------------- */

  /**
   * Handle callback logic when an individual sound within the Playlist concludes playback naturally
   * @param {PlaylistSound} sound
   * @internal
   */
  async _onSoundEnd(sound) {
    switch ( this.mode ) {
      case PLAYLIST_MODES.SEQUENTIAL:
      case PLAYLIST_MODES.SHUFFLE:
        return this.playNext(sound.id);
      case PLAYLIST_MODES.SIMULTANEOUS:
      case PLAYLIST_MODES.DISABLED: {
        const updates = {playing: true, sounds: [{_id: sound.id, playing: false, pausedTime: null}]};
        for ( const s of this.sounds ) {
          if ( (s !== sound) && s.playing ) break;
          updates.playing = false;
        }
        return this.update(updates);
      }
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle callback logic when playback for an individual sound within the Playlist is started.
   * Schedule auto-preload of next track
   * @param {PlaylistSound} sound
   * @internal
   */
  async _onSoundStart(sound) {
    if ( ![PLAYLIST_MODES.SEQUENTIAL, PLAYLIST_MODES.SHUFFLE].includes(this.mode) ) return;
    const apl = CONFIG.Playlist.autoPreloadSeconds;
    if ( !Number.isNumeric(apl) || !Number.isFinite(sound.sound.duration) ) return;

    // If active timeout, clear it
    clearTimeout(sound._preloadTimer);

    // Clamp to 0 to avoid negative values
    const delayMS = Math.max(0, (sound.sound.duration - apl) * 1000);

    // Launch the preload timeout
    sound._preloadTimer = setTimeout(() => {
      if ( !sound.playing ) return;
      this._getNextSound(sound.id)?.load();
    }, delayMS);
  }

  /* -------------------------------------------- */

  /**
   * Update the playing status of this Playlist in content links.
   * @param {object} changed  The data changes.
   */
  #updateContentLinkPlaying(changed) {
    if ( "playing" in changed ) {
      this.constructor._getSoundContentLinks(this).forEach(el => el.classList.toggle("playing", changed.playing));
    }
    if ( "sounds" in changed ) changed.sounds.forEach(update => {
      const sound = this.sounds.get(update._id);
      if ( !("playing" in update) || !sound ) return;
      this.constructor._getSoundContentLinks(sound).forEach(el => el.classList.toggle("playing", update.playing));
    });
  }

  /* -------------------------------------------- */
  /*  Importing and Exporting                     */
  /* -------------------------------------------- */

  /**
   * Spawn a dialog for bulk importing sound files into a playlist.
   * @returns {Promise<boolean>}  Returns true if any sound files were successfully imported.
   */
  bulkImportDialog() {
    const filePicker = new foundry.applications.elements.HTMLFilePickerElement();
    Object.assign(filePicker, { type: "folder", noupload: true });
    return foundry.applications.api.DialogV2.prompt({
      window: {
        title: "PLAYLIST.BulkImport.Title",
        icon: "fa-solid fa-files"
      },
      content: `<p>${game.i18n.localize("PLAYLIST.BulkImport.Hint")}</p>${filePicker.outerHTML}`,
      ok: {
        label: "PLAYLIST.BulkImport.Button",
        callback: async (event, button) => {
          const picker = button.form.querySelector("file-picker").picker;
          const result = (await picker.browse(picker.target, { type: "audio", render: false })).result;
          const paths = result?.files ?? [];
          if ( !paths.length ) return false;
          const created = await this.bulkImportSounds(paths);
          if ( created.length ) return true;
          ui.notifications.warn("PLAYLIST.BulkImport.Warning", { format: { path: picker.target } });
          return false;
        }
      }
    });
  }

  /* -------------------------------------------- */

  /**
   * Create PlaylistSounds in this Playlist from the given file paths.
   * @param {string[]} paths  File paths to import.
   * @returns {Promise<PlaylistSound[]>}
   */
  async bulkImportSounds(paths) {
    const currentSources = new Set(this.sounds.map(s => s.path));
    const toCreate = paths.reduce((list, path) => {
      if ( !foundry.audio.AudioHelper.hasAudioExtension(path) || currentSources.has(path) ) return list;
      list.push({ path, name: foundry.audio.AudioHelper.getDefaultSoundName(path) });
      return list;
    }, []);
    return this.createEmbeddedDocuments("PlaylistSound", toCreate);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  toCompendium(pack, options={}) {
    const data = super.toCompendium(pack, options);
    if ( options.clearState ) {
      data.playing = false;
      for ( const s of data.sounds ) {
        s.playing = false;
      }
    }
    return data;
  }
}

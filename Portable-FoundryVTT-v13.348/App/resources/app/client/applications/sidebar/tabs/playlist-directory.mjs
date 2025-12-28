import DocumentDirectory from "../document-directory.mjs";
import PlaylistSound from "@client/documents/playlist-sound.mjs";
import {PLAYLIST_MODES} from "@common/constants.mjs";
import {NumberField, StringField} from "@common/data/fields.mjs";
import TextEditor from "@client/applications/ux/text-editor.mjs";

/**
 * @import {HandlebarsRenderOptions} from "../../api/handlebars-application.mjs"
 * @import {ApplicationRenderContext} from "../../_types.mjs"
 * @import {ContextMenuEntry} from "../../ux/context-menu.mjs";
 * @import Playlist from "@client/documents/playlist.mjs";
 */

/**
 * @typedef _PlaylistDirectoryRenderContext
 * @property {object} controls                                      Volume control context.
 * @property {boolean} controls.expanded                            The expanded state of the volume controls.
 * @property {PlaylistDirectoryVolumeContext} controls.music        Music volume context.
 * @property {PlaylistDirectoryVolumeContext} controls.environment  Environment volume context.
 * @property {PlaylistDirectoryVolumeContext} controls.interface    Interface volume context.
 * @property {object} currentlyPlaying                              Currently playing context.
 * @property {string} currentlyPlaying.class                        The CSS class of the currently playing widget.
 * @property {object} currentlyPlaying.location                     Location information for the currently playing
 *                                                                  widget.
 * @property {boolean} currentlyPlaying.location.top                The widget is affixed to the top of the directory.
 * @property {boolean} currentlyPlaying.location.bottom             The widget is affixed to the bottom of the
 *                                                                  directory.
 * @property {object} currentlyPlaying.pin                          Render context for the currently playing pin icon.
 * @property {string} currentlyPlaying.pin.label                    The icon tooltip.
 * @property {string} currentlyPlaying.pin.caret                    The icon class.
 * @property {PlaylistSoundRenderContext[]} currentlyPlaying.sounds Render context for the currently playing
 *                                                                  PlaylistSound documents.
 * @property {PlaylistDirectoryTreeContext} tree                    Render context for the directory tree.
 */

/**
 * @typedef {ApplicationRenderContext & _PlaylistDirectoryRenderContext} PlaylistDirectoryRenderContext
 */

/**
 * @typedef PlaylistDirectoryVolumeContext
 * @property {number} modifier                 The volume modifier in the interval [0, 1].
 * @property {NumberField} field               The DataField specification for the form input.
 * @property {string} [name]                   The form input name.
 * @property {Record<string, string>} dataset  HTML dataset attributes.
 * @property {Record<string, string>} aria     HTML ARIA attributes.
 */

/**
 * @typedef PlaylistDirectoryTreeContext
 * @property {PlaylistRenderContext[]} entries          Render context for the Playlist documents at this node.
 * @property {PlaylistDirectoryTreeContext[]} children  Render context for this node's children.
 * @property {Folder} folder                            The Folder document that represents this node.
 * @property {number} depth                             The node's depth in the tree.
 */

/**
 * @typedef PlaylistDirectoryControlContext
 * @property {string} icon   The button icon.
 * @property {string} label  The button label.
 */

/**
 * @typedef PlaylistRenderContext
 * @property {string} id                            The Playlist ID.
 * @property {string} name                          The Playlist name.
 * @property {boolean} expanded                     Whether the Playlist is expanded in the sidebar.
 * @property {boolean} isOwner                      Whether the current user has ownership of this Playlist.
 * @property {PlaylistSoundRenderContext[]} sounds  Render context for this Playlist's PlaylistSounds.
 * @property {PlaylistDirectoryControlContext} mode The mode icon context.
 * @property {boolean} disabled                     Whether the Playlist is currently disabled.
 * @property {string} css                           The CSS class.
 */

/**
 * @typedef PlaylistSoundRenderContext
 * @property {string} id                              The PlaylistSound ID.
 * @property {string} name                            The track name.
 * @property {boolean} playing                        Whether the PlaylistSound is currently playing.
 * @property {boolean} repeat                         Whether the track is set to loop.
 * @property {boolean} isOwner                        Whether the current user has ownership of this PlaylistSound.
 * @property {string} playlistId                      The parent Playlist ID.
 * @property {string} css                             The CSS class.
 * @property {PlaylistDirectoryControlContext} play   The play button context.
 * @property {object} pause                           PlaylistSound pause context.
 * @property {boolean} pause.paused                   Whether the PlaylistSound is currently paused.
 * @property {string} pause.icon                      The pause icon.
 * @property {boolean} pause.disabled                 Whether the pause button is disabled.
 * @property {PlaylistDirectoryVolumeContext} volume  PlaylistSound volume context.
 * @property {string} currentTime                     The current playing timestamp.
 * @property {string} durationTime                    The duration timestamp.
 */

/**
 * The World Playlist directory listing.
 * @extends {DocumentDirectory<Playlist>}
 */
export default class PlaylistDirectory extends DocumentDirectory {
  /** @override */
  static DEFAULT_OPTIONS = {
    collection: "Playlist",
    renderUpdateKeys: ["playing", "mode", "sounds", "sorting"],
    actions: {
      pinCurrentlyPlaying: PlaylistDirectory.#onPinCurrentlyPlaying,
      playlistBackward: PlaylistDirectory.#onPlaylistSkip,
      playlistForward: PlaylistDirectory.#onPlaylistSkip,
      playlistMode: PlaylistDirectory.#onPlaylistCycleMode,
      playlistPlay: PlaylistDirectory.#onPlaylistPlayback,
      playlistStop: PlaylistDirectory.#onPlaylistPlayback,
      soundCreate: PlaylistDirectory.#onSoundCreate,
      soundPause: PlaylistDirectory.#onSoundPlayback,
      soundPlay: PlaylistDirectory.#onSoundPlayback,
      soundRepeat: PlaylistDirectory.#onSoundToggleMode,
      soundStop: PlaylistDirectory.#onSoundPlayback,
      volumeExpand: PlaylistDirectory.#onVolumeExpand
    }
  };

  /** @override */
  static tabName = "playlists";

  /** @override */
  static PARTS = {
    header: super.PARTS.header,
    controls: {
      template: "templates/sidebar/tabs/playlist/controls.hbs"
    },
    directory: super.PARTS.directory,
    playing: {
      template: "templates/sidebar/tabs/playlist/playing.hbs",
      templates: ["templates/sidebar/tabs/playlist/sound-partial.hbs"]
    },
    footer: super.PARTS.footer
  };

  /**
   * Playlist mode button descriptors.
   * @type {Record<PLAYLIST_MODES, PlaylistDirectoryControlContext>}
   */
  static PLAYLIST_MODES = {
    [PLAYLIST_MODES.DISABLED]: {
      icon: "fa-solid fa-ban",
      label: "PLAYLIST.ModeDisabled"
    },
    [PLAYLIST_MODES.SEQUENTIAL]: {
      icon: "fa-regular fa-circle-right",
      label: "PLAYLIST.ModeSequential"
    },
    [PLAYLIST_MODES.SHUFFLE]: {
      icon: "fa-solid fa-shuffle",
      label: "PLAYLIST.ModeShuffle"
    },
    [PLAYLIST_MODES.SIMULTANEOUS]: {
      icon: "fa-solid fa-minimize",
      label: "PLAYLIST.ModeSimultaneous"
    }
  };

  /** @override */
  static _entryPartial = "templates/sidebar/tabs/playlist/playlist-partial.hbs";

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * Track the playlist IDs which are currently expanded in the display.
   * @type {Set<string>}
   * @protected
   */
  _expanded = this.collection.reduce((set, {id, playing}) => {
    if ( playing ) set.add(id);
    return set;
  }, new Set());

  /**
   * Cache the set of Playlist and PlaylistSound documents that are displayed as playing when the directory is rendered.
   * @type {{context: PlaylistSoundRenderContext[], playlists: Playlist[], sounds: PlaylistSound[]}}
   * @protected
   */
  _playing = {
    context: [],
    playlists: [],
    sounds: []
  };

  /**
   * Whether the global volume controls are currently expanded.
   * @type {boolean}
   * @protected
   */
  _volumeExpanded = true;

  /**
   * The location of the currently-playing widget.
   * @type {"top"|"bottom"}
   */
  get currentlyPlayingLocation() {
    return game.settings.get("core", "playlist.playingLocation");
  }

  /**
   * The Playlist documents that are currently playing.
   * @returns {Playlist[]}
   */
  get playing() {
    return this._playing.playlists;
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @override */
  _createContextMenus() {
    /** @fires {hookEvents:getFolderContextOptions} */
    this._createContextMenu(this._getFolderContextOptions, ".folder .folder-header", {
      fixed: true,
      hookName: "getFolderContextOptions",
      parentClassHooks: false
    });
    /** @fires {hookEvents:getPlaylistContextOptions} */
    this._createContextMenu(this._getEntryContextOptions, ".playlist > header", {
      fixed: true,
      hookName: "getPlaylistContextOptions",
      parentClassHooks: false
    });
    /** @fires {hookEvents:getPlaylistSoundContextOptions} */
    this._createContextMenu(this._getSoundContextOptions, ".playlist .sound", {
      fixed: true,
      hookName: "getPlaylistSoundContextOptions",
      parentClassHooks: false
    });
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _getEntryContextOptions() {
    return [{
      name: "PLAYLIST.Edit",
      icon: '<i class="fa-solid fa-pen-to-square"></i>',
      callback: header => {
        const entry = header.closest("[data-entry-id]");
        const sheet = game.playlists.get(entry.dataset.entryId)?.sheet;
        if ( !sheet ) return;
        const options = { force: true };
        if ( !this.isPopout ) options.position = {
          top: entry.offsetTop - 24,
          left: window.innerWidth - ui.sidebar.element.offsetWidth - sheet.options.position.width - 10
        };
        return sheet.render(options);
      }
    }, {
      name: "PLAYLIST.BulkImport.Title",
      icon: '<i class="fa-solid fa-files"></i>',
      callback: async header => {
        const { entryId } = header.closest("[data-entry-id]")?.dataset ?? {};
        const playlist = game.playlists.get(entryId);
        if ( await playlist?.bulkImportDialog() ) this._expanded.add(playlist.id);
      }
    }].concat(super._getEntryContextOptions());
  }

  /* -------------------------------------------- */

  /**
   * Context menu options for individual PlaylistSounds.
   * @returns {ContextMenuEntry[]}
   * @protected
   */
  _getSoundContextOptions() {
    return [{
      name: "PLAYLIST.SoundEdit",
      icon: '<i class="fa-solid fa-pen-to-square"></i>',
      callback: li => {
        const {playlistId, soundId} = li.dataset;
        const sheet = game.playlists.get(playlistId)?.sounds.get(soundId)?.sheet;
        if ( !sheet ) return;
        const options = { force: true };
        if ( !this.isPopout ) options.position = {
          top: li.offsetTop - 24,
          left: window.innerWidth - ui.sidebar.element.offsetWidth - sheet.options.position.width - 10
        };
        return sheet.render(options);
      }
    }, {
      name: "PLAYLIST.SoundPreload",
      icon: '<i class="fa-solid fa-download"></i>',
      callback: li => {
        const {playlistId, soundId} = li.dataset;
        const sound = game.playlists.get(playlistId)?.sounds.get(soundId);
        if ( sound ) return game.audio.preload(sound.path);
      }
    }, {
      name: "PLAYLIST.SoundDelete",
      icon: '<i class="fa-solid fa-trash"></i>',
      callback: li => {
        const {playlistId, soundId} = li.dataset;
        return game.playlists.get(playlistId)?.sounds.get(soundId)?.deleteDialog({
          position: {
            top: Math.min(li.offsetTop, window.innerHeight - 350),
            left: window.innerWidth - 720
          }
        });
      }
    }];
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    if ( !this.isPopout ) setInterval(this.updateTimestamps.bind(this), 1000);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onRender(context, options) {
    await super._onRender(context, options);

    if ( options.parts.includes("playing") ) {
      const playing = this.element.querySelector(".currently-playing");
      playing.hidden = !this._playing.sounds.length;
      const directory = this.element.querySelector(".directory-list");
      directory.insertAdjacentElement(context.currentlyPlaying.location.top ? "beforebegin" : "afterend", playing);
    }

    if ( options.parts.includes("directory") ) {
      new foundry.applications.ux.DragDrop.implementation({
        dragSelector: ".directory-list .sound",
        dropSelector: ".directory-list",
        permissions: {
          dragstart: this._canDragStart.bind(this),
          drop: this._canDragDrop.bind(this)
        },
        callbacks: {
          dragstart: this._onDragStart.bind(this),
          drop: this._onDrop.bind(this)
        }
      }).bind(this.element);
    }
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareDirectoryContext(context, options) {
    await super._prepareDirectoryContext(context, options);
    Object.assign(this._playing, { context: [], playlists: [], sounds: [] });
    context.tree = this._prepareTreeContext(context, this.collection.tree);
  }

  /* -------------------------------------------- */

  /**
   * Augment the tree directory structure with playlist-level data objects for rendering.
   * @param {PlaylistDirectoryRenderContext} root   The root render context.
   * @param {object} node                           The tree node being prepared.
   * @returns {PlaylistDirectoryTreeContext}
   * @protected
   */
  _prepareTreeContext(root, node) {
    const { folder, depth } = node;
    return {
      folder, depth,
      entries: node.entries.map(p => this._preparePlaylistContext(root, p)),
      children: node.children.map(child => this._prepareTreeContext(root, child))
    };
  }

  /* -------------------------------------------- */

  /**
   * Prepare render context for a playlist.
   * @param {PlaylistDirectoryRenderContext} root  The root render context.
   * @param {Playlist} playlist                    The Playlist document.
   * @returns {PlaylistRenderContext}
   * @protected
   */
  _preparePlaylistContext(root, playlist) {
    const { volumeToInput, volumeToPercentage } = foundry.audio.AudioHelper;
    if ( playlist.playing ) this._playing.playlists.push(playlist);

    // Playlist sounds
    const sounds = [];
    for ( const soundId of playlist.playbackOrder ) {
      const sound = playlist.sounds.get(soundId);
      if ( !sound.isOwner && !sound.playing ) continue;
      const { id, uuid, isOwner, name, pausedTime, playing, repeat, volume } = sound;
      const s = {
        id, uuid, isOwner, name, playing, repeat,
        playlistId: playlist.id,
        css: playing ? "playing" : "",
        play: {
          icon: `fa-solid ${playing ? "fa-square" : pausedTime ? "fa-play-circle" : "fa-play"}`,
          label: pausedTime ? "PLAYLIST.SoundResume" : "PLAYLIST.SoundPlay"
        }
      };
      if ( sound.sound && !sound.sound.failed && (playing || pausedTime) ) {
        const paused = !playing && pausedTime;
        const modifier = volumeToInput(volume);
        s.pause = {
          paused,
          disabled: !isOwner || paused,
          icon: `fa-solid ${playing && !sound.sound?.loaded ? "fa-spinner fa-spin" : "fa-pause"}`
        };
        s.volume = {
          modifier,
          field: new NumberField({ min: 0, max: 1, step: .05 }),
          dataset: {
            tooltip: volumeToPercentage(modifier)
          },
          aria: {
            label: game.i18n.localize("PLAYLIST_SOUND.FIELDS.volume.label"),
            valuetext: volumeToPercentage(modifier, { label: true })
          }
        };
        s.currentTime = this.constructor.formatTimestamp(playing ? sound.sound.currentTime : pausedTime);
        s.durationTime = this.constructor.formatTimestamp(sound.sound.duration);
        this._playing.sounds.push(sound);
        this._playing.context.push(s);
      }

      sounds.push(s);
    }

    // Playlist configuration
    const { id, isOwner, mode, name, playing } = playlist;
    const expanded = this._expanded.has(id);
    return {
      expanded, id, isOwner, name, playing, sounds,
      mode: this.constructor.PLAYLIST_MODES[mode],
      disabled: !isOwner || (mode === PLAYLIST_MODES.DISABLED),
      css: [expanded ? "expanded" : "", playing ? "playing": ""].filterJoin(" ")
    };
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    switch ( partId ) {
      case "controls": await this._prepareControlsContext(context, options); break;
      case "playing": await this._preparePlayingContext(context, options); break;
    }
    return context;
  }

  /* -------------------------------------------- */

  /**
   * Prepare render context for the volume controls part.
   * @param {PlaylistDirectoryRenderContext} context
   * @param {HandlebarsRenderOptions} options
   * @returns {Promise<void>}
   * @protected
   */
  async _prepareControlsContext(context, options) {
    const { volumeToInput, volumeToPercentage } = foundry.audio.AudioHelper;
    const settings = ["globalPlaylistVolume", "globalAmbientVolume", "globalInterfaceVolume"];
    const [music, environment, iface] = settings.map(setting => volumeToInput(game.settings.get("core", setting)));
    context.controls = {
      expanded: this._volumeExpanded,
      icon: game.audio.globalMute ? "fa-volume-xmark" : "fa-volume-low",
      music: {
        modifier: music,
        name: "globalPlaylistVolume",
        field: new NumberField({ min: 0, max: 1, step: .05 }),
        dataset: {
          tooltip: volumeToPercentage(music)
        },
        aria: {
          label: game.i18n.localize("AUDIO.CHANNELS.MUSIC.label"),
          valuetext: volumeToPercentage(music, { label: true })
        }
      },
      environment: {
        modifier: environment,
        name: "globalAmbientVolume",
        field: new NumberField({ min: 0, max: 1, step: .05 }),
        dataset: {
          tooltip: volumeToPercentage(environment)
        },
        aria: {
          label: game.i18n.localize("AUDIO.CHANNELS.ENVIRONMENT.label"),
          valuetext: volumeToPercentage(environment, { label: true })
        }
      },
      interface: {
        modifier: iface,
        name: "globalInterfaceVolume",
        field: new NumberField({ min: 0, max: 1, step: .05 }),
        dataset: {
          tooltip: volumeToPercentage(iface)
        },
        aria: {
          label: game.i18n.localize("AUDIO.CHANNELS.INTERFACE.label"),
          valuetext: volumeToPercentage(iface, { label: true })
        }
      }
    };
  }

  /* -------------------------------------------- */

  /**
   * Prepare render context for the currently playing part.
   * @param {PlaylistDirectoryRenderContext} context
   * @param {HandlebarsRenderOptions} options
   * @returns {Promise<void>}
   * @protected
   */
  async _preparePlayingContext(context, options) {
    const top = this.currentlyPlayingLocation === "top";
    context.currentlyPlaying = {
      class: `location-${top ? "top" : "bottom"}`,
      location: { top, bottom: !top },
      pin: {
        label: `PLAYLIST.PinTo${top ? "Bottom" : "Top"}`,
        caret: top ? "down" : "up"
      },
      sounds: this._playing.context
    };
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _prepareDuplicateData(document) {

    // Ensure playback is disabled for playlists and their sounds
    const data = super._prepareDuplicateData(document);
    data.playing = false;
    data.sounds = document.sounds.toObject();
    for ( const sound of data.sounds ) sound.playing = false;
    return data;
  }

  /* -------------------------------------------- */
  /*  Public API                                  */
  /* -------------------------------------------- */

  /** @inheritDoc */
  collapseAll() {
    super.collapseAll();
    this._expanded.clear();
    this._volumeExpanded = false;
    this.element.querySelectorAll(".playlist.document").forEach(p => p.classList.remove("expanded"));
    this.element.querySelector(".global-volume").classList.remove("expanded");
  }

  /* -------------------------------------------- */
  /*  Event Listeners & Handlers                  */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _attachFrameListeners() {
    super._attachFrameListeners();
    this.element.addEventListener("change", this.#onVolumeChange.bind(this));
  }

  /* -------------------------------------------- */

  /** @override */
  async _onClickEntry(event, target) {
    const entry = target.closest("[data-entry-id]");
    const { entryId } = entry.dataset;
    entry.classList.toggle("expanded");
    if ( entry.classList.contains("expanded") ) this._expanded.add(entryId);
    else this._expanded.delete(entryId);
  }

  /* -------------------------------------------- */

  /**
   * Handle modifying a global volume slider.
   * @param {HTMLRangePickerElement} slider  The slider.
   * @protected
   */
  _onGlobalVolume(slider) {
    const { inputToVolume, volumeToPercentage } = foundry.audio.AudioHelper;
    const volume = inputToVolume(slider.value);
    const tooltip = volumeToPercentage(slider.value);
    const label = volumeToPercentage(slider.value, { label: true });
    slider.dataset.tooltipText = tooltip;
    slider.ariaValueText = label;
    game.tooltip.activate(slider, { text: tooltip });
    game.settings.set("core", slider.name, volume);
    if ( game.audio.globalMute ) {
      game.audio.globalMute = false;
      ui.hotbar._updateToggles();
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle changing the location of the currently playing widget.
   * @this {PlaylistDirectory}
   */
  static #onPinCurrentlyPlaying() {
    game.settings.set("core", "playlist.playingLocation", this.currentlyPlayingLocation === "top" ? "bottom" : "top");
  }

  /* -------------------------------------------- */

  /**
   * Handle cycling the playlist's playback mode.
   * @this {PlaylistDirectory}
   * @param {PointerEvent} event  The triggering event.
   * @param {HTMLElement} target  The action target.
   */
  static #onPlaylistCycleMode(event, target) {
    const playlist = game.playlists.get(target.closest("[data-entry-id]")?.dataset.entryId);
    return playlist?.cycleMode();
  }

  /* -------------------------------------------- */

  /**
   * Handle starting or stopping a playlist.
   * @this {PlaylistDirectory}
   * @param {PointerEvent} event  The triggering event.
   * @param {HTMLElement} target  The action target.
   */
  static #onPlaylistPlayback(event, target) {
    const playing = target.dataset.action === "playlistPlay";
    const playlist = game.playlists.get(target.closest("[data-entry-id]")?.dataset.entryId);
    if ( playing ) return playlist?.playAll();
    return playlist?.stopAll();
  }

  /* -------------------------------------------- */

  /**
   * Handle advancing the playlist to the next or previous sound.
   * @this {PlaylistDirectory}
   * @param {PointerEvent} event  The triggering event.
   * @param {HTMLElement} target  The action target.
   */
  static #onPlaylistSkip(event, target) {
    const direction = target.dataset.action === "playlistForward" ? 1 : -1;
    const playlist = game.playlists.get(target.closest("[data-entry-id]")?.dataset.entryId);
    return playlist?.playNext(null, { direction });
  }

  /* -------------------------------------------- */

  /**
   * Handle adding a new track to a playlist.
   * @this {PlaylistDirectory}
   * @param {PointerEvent} event  The triggering event.
   * @param {HTMLElement} target  The action target.
   */
  static #onSoundCreate(event, target) {
    const playlist = game.playlists.get(target.closest("[data-entry-id]")?.dataset.entryId);
    if ( !playlist ) return;
    const sound = new PlaylistSound.implementation({ name: game.i18n.localize("SOUND.New") }, { parent: playlist });
    sound.sheet.render({ force: true, position: { top: target.offsetTop, left: window.innerWidth - 670 } });
  }

  /* -------------------------------------------- */

  /**
   * Handle starting, stopping, or pausing a track.
   * @this {PlaylistDirectory}
   * @param {PointerEvent} event  The triggering event.
   * @param {HTMLElement} target  The action target.
   */
  static #onSoundPlayback(event, target) {
    const {playlistId, soundId} = target.closest(".sound")?.dataset ?? {};
    const playlist = game.playlists.get(playlistId);
    const sound = playlist?.sounds.get(soundId);
    switch ( target.dataset.action ) {
      case "soundPause": return sound.update({ playing: false, pausedTime: sound.sound.currentTime });
      case "soundPlay": return playlist.playSound(sound);
      case "soundStop": return playlist.stopSound(sound);
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle toggling the sound's repeat mode.
   * @this {PlaylistDirectory}
   * @param {PointerEvent} event  The triggering event.
   * @param {HTMLElement} target  The action target.
   */
  static #onSoundToggleMode(event, target) {
    const {playlistId, soundId} = target.closest(".sound")?.dataset ?? {};
    const sound = game.playlists.get(playlistId)?.sounds.get(soundId);
    return sound?.update({repeat: !sound?.repeat});
  }

  /* -------------------------------------------- */

  /**
   * Handle modifying a playing PlaylistSound's volume.
   * @param {HTMLRangePickerElement} slider  The volume slider.
   * @protected
   */
  _onSoundVolume(slider) {
    const {inputToVolume, volumeToPercentage} = foundry.audio.AudioHelper;
    const li = slider.closest(".sound");
    const playlist = game.playlists.get(li.dataset.playlistId);
    const sound = playlist.sounds.get(li.dataset.soundId);

    // Get the desired target volume.
    const volume = inputToVolume(slider.value);
    if ( volume === sound.volume ) return;

    // Immediately apply a local adjustment.
    sound.updateSource({volume});
    sound.sound?.fade(volume, { duration: PlaylistSound.VOLUME_DEBOUNCE_MS });
    const tooltip = volumeToPercentage(slider.value);
    const label = volumeToPercentage(slider.value, {label: true});
    slider.dataset.tooltipText = tooltip;
    slider.ariaValueText = label;
    game.tooltip.activate(slider, {text: tooltip});

    // Debounce a change to the database.
    if ( sound.isOwner ) sound.debounceVolume(volume);
  }

  /* -------------------------------------------- */

  /**
   * Handle a sound or global volume change.
   * @param {ChangeEvent} event  The triggering event.
   */
  #onVolumeChange(event) {
    const target = event.target.closest(".global-volume-slider, .sound-volume");
    if ( !target ) return;
    if ( target.matches(".global-volume-slider") ) this._onGlobalVolume(target);
    else this._onSoundVolume(target);
  }

  /* -------------------------------------------- */

  /**
   * Handle global volume control expand and collapse.
   * @this {PlaylistDirectory}
   * @param {PointerEvent} event  The triggering event.
   * @param {HTMLElement} target  The action target element.
   */
  static #onVolumeExpand(event, target) {
    const entry = target.closest(".global-volume");
    entry.classList.toggle("expanded");
    this._volumeExpanded = entry.classList.contains("expanded");
  }

  /* -------------------------------------------- */

  /**
   * Update the displayed timestamps for all currently playing audio sources every second.
   */
  updateTimestamps() {
    const playing = document.querySelectorAll(".playlists-sidebar .currently-playing");
    if ( !playing.length || !this._playing.sounds.length ) return;
    for ( const el of playing ) {
      for ( const sound of this._playing.sounds ) {
        const li = el.querySelector(`.sound[data-sound-uuid="${sound.uuid}"]`);
        if ( !li ) continue;

        // Update current and max playback time.
        const current = li.querySelector(".current");
        const ct = sound.playing ? sound.sound.currentTime : sound.pausedTime;
        if ( current ) current.textContent = this.constructor.formatTimestamp(ct);
        const max = li.querySelector(".duration");
        if ( max ) max.textContent = this.constructor.formatTimestamp(sound.sound.duration);

        // Remove the loading spinner.
        const play = li.querySelector(".pause");
        if ( play.classList.contains("fa-spinner") ) {
          play.classList.remove("fa-spin");
          play.classList.replace("fa-spinner", "fa-pause");
        }
      }
    }
  }

  /* -------------------------------------------- */
  /*  Search & Filter                             */
  /* -------------------------------------------- */

  /**
   * Recursively marks a folder and all of its descendants as visible.
   * @param {Folder} folder                  The folder whose subtree must be shown.
   * @param {Set<string>} entryIds           IDs of playlists to keep visible.
   * @param {Set<string>} soundIds           IDs of tracks to keep visible.
   * @param {Set<string>} folderIds          IDs of folders to keep visible.
   * @param {Set<string>} autoExpandIds      IDs of folders to auto-expand.
   */
  #addFolderSubtree(folder, entryIds, soundIds, folderIds, autoExpandIds) {
    folderIds.add(folder.id);
    autoExpandIds.add(folder.id);

    // Playlists directly under this folder
    for ( const p of folder.contents ) {
      entryIds.add(p.id);
      p.sounds.forEach(s => soundIds.add(s.id));
    }

    // Recurse into sub-folders
    for ( const child of folder.children ) {
      this.#addFolderSubtree(child, entryIds, soundIds, folderIds, autoExpandIds);
    }
  }

  /* -------------------------------------------- */

  /** @override */
  _onMatchSearchEntry(query, entryIds, element, {soundIds=new Set(), plNameHits=new Set()}={}) {
    const entryId = element.dataset.entryId;
    const playlistVisible = !query || entryIds.has(entryId);
    const playlistNameHit = plNameHits.has(entryId);

    // Playlist row
    element.style.display = playlistVisible ? "flex" : "none";

    // Track rows
    for ( const tr of element.querySelectorAll(".sound") ) {
      const showTrack = !query || playlistNameHit || soundIds.has(tr.dataset.soundId);
      tr.style.display = showTrack ? "flex" : "none";
    }

    // Expansion state
    element.classList.toggle("expanded", this._expanded.has(entryId) || (query && playlistVisible));
  }

  /* -------------------------------------------- */

  /** @override */
  _matchSearchEntries(query, entryIds, folderIds, autoExpandIds, options={}) {
    const clean = foundry.applications.ux.SearchFilter.cleanQuery;
    const soundIds = options.soundIds ??= new Set();
    const plNameHits = options.plNameHits ??= new Set();

    // Folder name matches
    if ( query ) {
      for ( const folder of this.collection.folders ) {
        if ( query.test(clean(folder.name)) ) {
          this.#addFolderSubtree(folder, entryIds, soundIds, folderIds, autoExpandIds);
        }
      }
    }

    // Playlists and tracks
    for ( const pl of this.collection ) {
      const nameHit = query && query.test(clean(pl.name));
      if ( nameHit ) plNameHits.add(pl.id);

      let trackHit = false;
      for ( const s of pl.sounds ) {
        if ( nameHit || (query && query.test(clean(s.name))) ) {
          soundIds.add(s.id);
          trackHit = true;
        }
      }

      if ( nameHit || trackHit ) {
        entryIds.add(pl.id);
        for ( let f = pl.folder; f; f = f.folder ) {
          folderIds.add(f.id);
          autoExpandIds.add(f.id);
        }
      }
    }
  }

  /* -------------------------------------------- */

  /** @override */
  _matchSearchFolders(query, folderIds, autoExpandIds) {
    // Do not attempt to match folder names.
  }

  /* -------------------------------------------- */
  /*  Drag & Drop                                 */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _onDragStart(event) {
    if ( event.target.classList.contains("sound") ) {
      const {playlistId, soundId} = event.target.dataset;
      const sound = game.playlists.get(playlistId)?.sounds.get(soundId);
      if ( sound ) event.dataTransfer.setData("text/plain", JSON.stringify(sound.toDragData()));
      return;
    }
    super._onDragStart(event);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onDrop(event) {
    const data = TextEditor.implementation.getDragEventData(event);
    if ( data.type !== "PlaylistSound" ) return super._onDrop(event);

    // Reference the target playlist and sound elements.
    const target = event.target.closest(".sound, .playlist");
    if ( !target ) return;
    const sound = await PlaylistSound.implementation.fromDropData(data);
    const playlist = sound.parent;
    const targetPlaylistId = target.dataset.entryId || target.dataset.playlistId;

    // Copying to another playlist.
    if ( targetPlaylistId !== playlist?.id ) {
      const targetPlaylist = game.playlists.get(targetPlaylistId);
      await PlaylistSound.implementation.create(sound, {parent: targetPlaylist});
      return;
    }

    // If there's nothing to sort relative to, or the sound was dropped onto itself, do nothing.
    const targetId = target.dataset.soundId;
    if ( !targetId || !playlist || (targetId === sound.id) ) return;
    await sound.sortRelative({
      target: playlist.sounds.get(targetId),
      siblings: playlist.sounds.filter(s => s.id !== sound.id)
    });
  }

  /* -------------------------------------------- */
  /*  Helpers                                     */
  /* -------------------------------------------- */

  /**
   * Format the displayed timestamp given a number of seconds as input.
   * @param {number} seconds  The current playback time in seconds.
   * @returns {string}        The formatted timestamp.
   * @protected
   */
  static formatTimestamp(seconds) {
    if ( !Number.isFinite(seconds) ) return "∞";
    seconds ??= 0;
    const minutes = Math.floor(seconds / 60);
    seconds = Math.round(seconds % 60);
    return `${minutes}:${seconds.paddedString(2)}`;
  }

  /* -------------------------------------------- */

  /**
   * Register playlist directory specific settings.
   * @internal
   */
  static _registerSettings() {
    game.settings.register("core", "playlist.playingLocation", {
      scope: "client",
      config: false,
      type: new StringField({choices: ["top", "bottom"], initial: "top"}),
      onChange: () => ui.playlists.render({parts: ["playing"]})
    });
  }
}

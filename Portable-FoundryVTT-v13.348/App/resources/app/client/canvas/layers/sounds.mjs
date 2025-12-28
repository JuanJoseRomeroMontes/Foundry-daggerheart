import PlaceablesLayer from "./base/placeables-layer.mjs";
import SceneControls from "../../applications/ui/scene-controls.mjs";
import PlaylistSound from "../../documents/playlist-sound.mjs";
import Sound from "../../audio/sound.mjs";
import Canvas from "../board.mjs";

/**
 * @import Collection from "@common/utils/collection.mjs";
 * @import {ElevatedPoint, Point} from "../../_types.mjs";
 * @import {AmbientSoundPlaybackConfig} from "./_types.mjs";
 * @import {PointEffectSourceData} from "../sources/point-effect-source.mjs";
 * @import {PositionalSoundPlaybackOptions} from "@client/audio/sound.mjs";
 */

/**
 * This Canvas Layer provides a container for AmbientSound objects.
 * @category Canvas
 */
export default class SoundsLayer extends PlaceablesLayer {
  constructor(...args) {
    super(...args);
    canvas.registerMouseMoveHandler(this._onMouseMove, Canvas.MOUSE_MOVE_HANDLER_PRIORITIES.MEDIUM, this);
  }

  /**
   * Track whether to actively preview ambient sounds with mouse cursor movements
   * @type {boolean}
   */
  livePreview = false;

  /**
   * A mapping of ambient audio sources which are active within the rendered Scene
   * @type {Collection<string, PointSoundSource>}
   */
  sources = new foundry.utils.Collection();

  /**
   * Darkness change event handler function.
   * @type {_onDarknessChange}
   */
  #onDarknessChange;

  /* -------------------------------------------- */

  /** @inheritdoc */
  static get layerOptions() {
    return foundry.utils.mergeObject(super.layerOptions, {
      name: "sounds",
      zIndex: 900
    });
  }

  /** @inheritdoc */
  static documentName = "AmbientSound";

  /* -------------------------------------------- */

  /** @inheritdoc */
  get hookName() {
    return SoundsLayer.name;
  }

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async _draw(options) {
    await super._draw(options);
    this.#onDarknessChange = this._onDarknessChange.bind(this);
    canvas.environment.addEventListener("darknessChange", this.#onDarknessChange);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _tearDown(options) {
    this.stopAll();
    canvas.environment.removeEventListener("darknessChange", this.#onDarknessChange);
    this.#onDarknessChange = undefined;
    return super._tearDown(options);
  }

  /* -------------------------------------------- */

  /** @override */
  _activate() {
    super._activate();
    for ( const p of this.placeables ) p.renderFlags.set({refreshField: true});
  }

  /* -------------------------------------------- */

  /**
   * Initialize all AmbientSound sources which are present on this layer
   */
  initializeSources() {
    for ( const sound of this.placeables ) {
      sound.initializeSoundSource();
    }
    for ( const sound of this.preview.children ) {
      sound.initializeSoundSource();
    }
  }

  /* -------------------------------------------- */

  /**
   * Update all AmbientSound effects in the layer by toggling their playback status.
   * Sync audio for the positions of tokens which are capable of hearing.
   * @param {object} [options={}]   Additional options forwarded to AmbientSound synchronization
   */
  refresh(options={}) {
    if ( !this.placeables.length ) return;
    for ( const sound of this.placeables ) sound.source.refresh();
    if ( game.audio.locked ) {
      return game.audio.pending.push(() => this.refresh(options));
    }
    const listeners = this.getListenerPositions();
    this._syncPositions(listeners, options);
  }

  /* -------------------------------------------- */

  /**
   * Preview ambient audio for a given position
   * @param {Point|ElevatedPoint} position    The position to preview
   */
  previewSound(position) {
    if ( !this.placeables.length || game.audio.locked ) return;
    if ( position.elevation === undefined ) position = {x: position.x, y: position.y, elevation: 0};
    return this._syncPositions([position], {fade: 50});
  }

  /* -------------------------------------------- */

  /**
   * Terminate playback of all ambient audio sources
   */
  stopAll() {
    this.placeables.forEach(s => s.sync(false));
  }

  /* -------------------------------------------- */

  /**
   * Get an array of listener positions for Tokens which are able to hear environmental sound.
   * @returns {ElevatedPoint[]}
   */
  getListenerPositions() {
    const listeners = canvas.tokens.controlled.map(token => token.document.getCenterPoint());
    if ( !listeners.length && !game.user.isGM ) {
      for ( const token of canvas.tokens.placeables ) {
        if ( token.actor?.isOwner && token.isVisible ) listeners.push(token.document.getCenterPoint());
      }
    }
    return listeners;
  }

  /* -------------------------------------------- */

  /**
   * Sync the playing state and volume of all AmbientSound objects based on the position of listener points
   * @param {ElevatedPoint[]} listeners    Locations of listeners which have the capability to hear
   * @param {object} [options={}]          Additional options forwarded to AmbientSound synchronization
   * @protected
   */
  _syncPositions(listeners, options) {
    if ( !this.placeables.length || game.audio.locked ) return;
    /** @type {Record<string, Partial<AmbientSoundPlaybackConfig>>} */
    const paths = {};
    for ( const /** @type {AmbientSound} */ object of this.placeables ) {
      const {path, easing, volume, walls} = object.document;
      if ( !path ) continue;
      const {sound, source} = object;

      // Track a singleton record per unique audio path
      paths[path] ||= {sound, source, object, volume: 0};
      const config = paths[path];
      if ( !config.sound && sound ) Object.assign(config, {sound, source, object}); // First defined Sound

      // Identify the closest listener to each sound source
      if ( !object.isAudible || !source.active ) continue;
      for ( let l of listeners ) {
        /** @deprecated since v13 */
        if ( l.elevation === undefined ) {
          foundry.utils.logCompatibilityWarning("SoundsLayer#_syncPositions(listener: Point[], options: object) has been deprecated "
            + "in favor of SoundsLayer#_syncPositions(listener: ElevatedPoint[], options: object).", {since: 13, until: 15, once: true});
          l = {x: l.x, y: l.y, elevation: 0};
        }
        const v = volume * source.getVolumeMultiplier(l, {easing});
        if ( v > config.volume ) {
          Object.assign(config, {source, object, listener: l, volume: v, walls});
          config.sound ??= sound; // We might already have defined Sound
        }
      }
    }

    // Compute the effective volume for each sound path
    for ( const config of Object.values(paths) ) {
      this._configurePlayback(config);
      config.object.sync(config.volume > 0, config.volume, {...options, muffled: config.muffled});
    }
  }


  /* -------------------------------------------- */

  /**
   * Configure playback by assigning the muffled state and final playback volume for the sound.
   * This method should mutate the config object by assigning the volume and muffled properties.
   * @param {AmbientSoundPlaybackConfig} config
   * @internal
   */
  _configurePlayback(config) {
    const {source, walls} = config;

    // Inaudible sources
    if ( !config.listener ) {
      config.volume = 0;
      config.muffled = false;
      return;
    }

    // Exactly audible
    if ( (config.listener.x === source.x) && (config.listener.y === source.y)
      && (config.listener.elevation === source.elevation) ) {
      config.volume = 1;
      config.muffled = false;
      return;
    }

    // Blocked by walls
    if ( walls ) {
      config.muffled = false;
      return;
    }

    // Muffled by walls
    const polygonCls = CONFIG.Canvas.polygonBackends.sound;
    const x = polygonCls.testCollision(config.listener, source, {mode: "closest", type: "sound", source});
    config.muffled = !!x && (x._distance < 1); // Collided before reaching the source
  }

  /* -------------------------------------------- */

  /**
   * Actions to take when the darkness level of the Scene is changed
   * @param {PIXI.FederatedEvent} event
   * @internal
   */
  _onDarknessChange(event) {
    const {darknessLevel, priorDarknessLevel} = event.environmentData;
    for ( const sound of this.placeables ) {
      const {min, max} = sound.document.darkness;
      if ( darknessLevel.between(min, max) === priorDarknessLevel.between(min, max) ) continue;
      sound.initializeSoundSource();
      if ( this.active ) sound.renderFlags.set({refreshState: true});
    }
  }

  /* -------------------------------------------- */

  /**
   * Play a one-shot Sound originating from a predefined point on the canvas.
   * The sound plays locally for the current client only.
   * To play a sound for all connected clients use {@link SoundsLayer#emitAtPosition}.
   *
   * @param {string} src                    The sound source path to play
   * @param {Point|ElevatedPoint} origin    The canvas coordinates from which the sound originates
   * @param {number} radius                 The radius of effect in distance units
   * @param {PositionalSoundPlaybackOptions} options  Options passed to {@link Sound#playAtPosition}
   * @returns {Promise<Sound|null>}         A Promise which resolves to the played Sound, or null
   *
   * @example Play the sound of a trap springing
   * ```js
   * const src = "modules/my-module/sounds/spring-trap.ogg";
   * const origin = {x: 5200, y: 3700};  // The origin point for the sound
   * const radius = 30;                  // Audible in a 30-foot radius
   * await canvas.sounds.playAtPosition(src, origin, radius);
   * ```
   *
   * @example A Token casts a spell
   * ```js
   * const src = "modules/my-module/sounds/spells-sprite.ogg";
   * const origin = token.center;         // The origin point for the sound
   * const radius = 60;                   // Audible in a 60-foot radius
   * await canvas.sounds.playAtPosition(src, origin, radius, {
   *   walls: false,                      // Not constrained by walls with a lowpass muffled effect
   *   muffledEffect: {type: "lowpass", intensity: 6},
   *   sourceData: {
   *     angle: 120,                      // Sound emitted at a limited angle
   *     rotation: 270                    // Configure the direction of sound emission
   *   }
   *   playbackOptions: {
   *     loopStart: 12,                   // Audio sprite timing
   *     loopEnd: 16,
   *     fade: 300,                      // Fade-in 300ms
   *     onended: () => console.log("Do something after the spell sound has played")
   *   }
   * });
   * ```
   */
  async playAtPosition(src, origin, radius, options={}) {
    const sound = new Sound(src, {context: game.audio.environment});
    await sound.load();
    return sound.playAtPosition(origin, radius, options);
  }

  /* -------------------------------------------- */

  /**
   * Emit playback to other connected clients to occur at a specified position.
   * @param {...*} args           Arguments passed to SoundsLayer#playAtPosition
   * @returns {Promise<void>}     A Promise which resolves once playback for the initiating client has completed
   */
  async emitAtPosition(...args) {
    game.socket.emit("playAudioPosition", args);
    return this.playAtPosition(...args);
  }

  /* -------------------------------------------- */

  /** @override */
  static prepareSceneControls() {
    const sc = SceneControls;
    return {
      name: "sounds",
      order: 7,
      title: "CONTROLS.GroupSound",
      layer: "sounds",
      icon: "fa-solid fa-music",
      visible: game.user.isGM,
      onChange: (_event, active) => {
        if ( active ) canvas.sounds.activate();
      },
      onToolChange: () => canvas.sounds.setAllRenderFlags({refreshState: true}),
      tools: {
        sound: {
          name: "sound",
          order: 1,
          title: "CONTROLS.SoundDraw",
          icon: "fa-solid fa-volume-high",
          toolclip: {
            src: "toolclips/tools/sound-draw.webm",
            heading: "CONTROLS.SoundDraw",
            items: sc.buildToolclipItems(["create", "edit", "rotate", "onOff"])
          }
        },
        preview: {
          name: "preview",
          order: 2,
          title: "CONTROLS.SoundPreview",
          icon: "fa-solid fa-headphones",
          toggle: true,
          active: canvas.sounds?.livePreview ?? false,
          onChange: (_event, toggled) => {
            canvas.sounds.livePreview = toggled;
            canvas.sounds.refresh();
          },
          toolclip: {
            src: "toolclips/tools/sound-preview.webm",
            heading: "CONTROLS.SoundPreview",
            items: [{paragraph: "CONTROLS.SoundPreviewP"}]
          }
        },
        clear: {
          name: "clear",
          order: 3,
          title: "CONTROLS.SoundClear",
          icon: "fa-solid fa-trash",
          onChange: () => canvas.sounds.deleteAll(),
          button: true
        }
      },
      activeTool: "sound"
    };
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /**
   * Handle mouse cursor movements which may cause ambient audio previews to occur
   * @param {PIXI.Point} currentPos
   * @internal
   */
  _onMouseMove(currentPos) {
    if ( !this.livePreview ) return;
    if ( canvas.tokens.active && canvas.tokens.controlled.length ) return;
    this.previewSound(currentPos);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onDragLeftStart(event) {
    super._onDragLeftStart(event);
    const interaction = event.interactionData;

    // Snap the origin to the grid
    if ( !event.shiftKey ) interaction.origin = this.getSnappedPoint(interaction.origin);

    // Create a pending AmbientSoundDocument
    const cls = foundry.utils.getDocumentClass("AmbientSound");
    const doc = new cls({type: "l", ...interaction.origin}, {parent: canvas.scene});

    // Create the preview AmbientSound object
    const sound = new this.constructor.placeableClass(doc);
    doc._object = sound;
    interaction.preview = this.preview.addChild(sound);
    interaction.soundState = 1;
    this.preview._creating = false;
    sound.draw();
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onDragLeftMove(event) {
    const {destination, soundState, preview, origin} = event.interactionData;
    if ( soundState === 0 ) return;
    const radius = Math.hypot(destination.x - origin.x, destination.y - origin.y);
    preview.document.updateSource({radius: radius / canvas.dimensions.distancePixels});
    preview.initializeSoundSource();
    preview.renderFlags.set({refreshState: true});
    event.interactionData.soundState = 2;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onDragLeftDrop(event) {
    // Snap the destination to the grid
    const interaction = event.interactionData;
    if ( !event.shiftKey ) interaction.destination = this.getSnappedPoint(interaction.destination);
    const {soundState, destination, origin, preview} = interaction;
    if ( soundState !== 2 ) return;

    // Render the preview sheet for confirmation
    const radius = Math.hypot(destination.x - origin.x, destination.y - origin.y);
    if ( radius < (canvas.dimensions.size / 2) ) return;
    preview.document.updateSource({radius: radius / canvas.dimensions.distancePixels});
    preview.initializeSoundSource();
    preview.renderFlags.set({refreshState: true});
    preview.sheet.render(true);
    this.preview._creating = true;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onDragLeftCancel(event) {
    if ( this.preview._creating ) return;
    return super._onDragLeftCancel(event);
  }

  /* -------------------------------------------- */

  /**
   * Handle PlaylistSound document drop data.
   * @param {DragEvent} event  The drag drop event
   * @param {object} data      The dropped transfer data.
   * @protected
   */
  async _onDropData(event, data) {
    const playlistSound = await PlaylistSound.implementation.fromDropData(data);
    if ( !playlistSound ) return false;
    let origin;
    if ( (data.x === undefined) || (data.y === undefined) ) {
      const coords = this._canvasCoordinatesFromDrop(event, {center: false});
      if ( !coords ) return false;
      origin = {x: coords[0], y: coords[1]};
    } else {
      origin = {x: data.x, y: data.y};
    }
    if ( !event.shiftKey ) origin = this.getSnappedPoint(origin);
    if ( !canvas.dimensions.rect.contains(origin.x, origin.y) ) return false;
    const soundData = {
      path: playlistSound.path,
      volume: playlistSound.volume,
      x: origin.x,
      y: origin.y,
      radius: canvas.dimensions.distance * 2
    };
    return this._createPreview(soundData, {top: event.clientY - 20, left: event.clientX + 40});
  }
}

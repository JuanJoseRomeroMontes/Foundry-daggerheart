import PlaceableObject from "./placeable-object.mjs";
import ControlIcon from "../containers/elements/control-icon.mjs";
import MouseInteractionManager from "../interaction/mouse-handler.mjs";
import {getTexture} from "../loader.mjs";

/**
 * An AmbientSound is an implementation of PlaceableObject which represents a dynamic audio source within the Scene.
 * @category Canvas
 * @see {@link foundry.documents.AmbientSoundDocument}
 * @see {@link foundry.canvas.layers.SoundsLayer}
 */
export default class AmbientSound extends PlaceableObject {

  /**
   * The Sound which manages playback for this AmbientSound effect
   * @type {Sound|null}
   */
  sound;

  /**
   * A sound effect attached to the managed Sound instance.
   * @type {BaseSoundEffect}
   */
  #baseEffect;

  /**
   * A  sound effect attached to the managed Sound instance when the sound source is muffled.
   * @type {BaseSoundEffect}
   */
  #muffledEffect;

  /**
   * Track whether audio effects have been initialized.
   * @type {boolean}
   */
  #effectsInitialized = false;

  /**
   * Is this AmbientSound currently muffled?
   * @type {boolean}
   */
  #muffled = false;

  /**
   * A SoundSource object which manages the area of effect for this ambient sound
   * @type {PointSoundSource}
   */
  source;

  /**
   * The area that is affected by this ambient sound.
   * @type {PIXI.Graphics}
   */
  field;

  /** @inheritdoc */
  static embeddedName = "AmbientSound";

  /** @override */
  static RENDER_FLAGS = {
    redraw: {propagate: ["refresh"]},
    refresh: {propagate: ["refreshState", "refreshField", "refreshElevation"], alias: true},
    refreshField: {propagate: ["refreshPosition"]},
    refreshPosition: {},
    refreshState: {},
    refreshElevation: {}
  };

  /* -------------------------------------------- */

  /**
   * Create a Sound used to play this AmbientSound object
   * @returns {Sound|null}
   * @protected
   */
  _createSound() {
    const path = this.document.path;
    if ( !this.id || !path ) return null;
    return game.audio.create({src: path, context: game.audio.environment, singleton: true});
  }

  /* -------------------------------------------- */

  /**
   * Create special effect nodes for the Sound.
   * This only happens once the first time the AmbientSound is synced and again if the effect data changes.
   */
  #createEffects() {
    const sfx = CONFIG.soundEffects;
    const {base, muffled} = this.document.effects;
    this.#baseEffect = this.#muffledEffect = undefined;

    // Base effect
    if ( base.type in sfx ) {
      const cfg = sfx[base.type];
      this.#baseEffect = new cfg.effectClass(this.sound.context, base);
    }

    // Muffled effect
    if ( muffled.type in sfx ) {
      const cfg = sfx[muffled.type];
      this.#muffledEffect = new cfg.effectClass(this.sound.context, muffled);
    }
    this.#effectsInitialized = true;
  }

  /* -------------------------------------------- */

  /**
   * Update the set of effects which are applied to the managed Sound.
   * @param {object} [options]
   * @param {boolean} [options.muffled]     Is the sound currently muffled?
   */
  applyEffects({muffled=false}={}) {
    const effects = [];
    if ( muffled ) {
      const effect = this.#muffledEffect || this.#baseEffect;
      if ( effect ) effects.push(effect);
    }
    else if ( this.#baseEffect ) effects.push(this.#baseEffect);
    this.sound.applyEffects(effects);
  }

  /* -------------------------------------------- */
  /* Properties
  /* -------------------------------------------- */

  /**
   * Is this ambient sound is currently audible based on its hidden state and the darkness level of the Scene?
   * @type {boolean}
   */
  get isAudible() {
    if ( this.document.hidden || !this.document.radius ) return false;
    return canvas.darknessLevel.between(this.document.darkness.min ?? 0, this.document.darkness.max ?? 1);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  get bounds() {
    const {x, y} = this.document;
    const r = this.radius;
    return new PIXI.Rectangle(x-r, y-r, 2*r, 2*r);
  }

  /* -------------------------------------------- */

  /**
   * A convenience accessor for the sound radius in pixels
   * @type {number}
   */
  get radius() {
    return this.document.radius * canvas.dimensions.distancePixels;
  }

  /* -------------------------------------------- */
  /* Methods
  /* -------------------------------------------- */

  /**
   * Toggle playback of the sound depending on whether it is audible.
   * @param {boolean} isAudible     Is the sound audible?
   * @param {number} [volume]       The target playback volume
   * @param {object} [options={}]   Additional options which affect sound synchronization
   * @param {number} [options.fade=250]       A duration in milliseconds to fade volume transition
   * @param {boolean} [options.muffled=false] Is the sound current muffled?
   * @returns {Promise<void>}       A promise which resolves once sound playback is synchronized
   */
  async sync(isAudible, volume, {fade=250, muffled=false}={}) {

    // Discontinue playback
    if ( !isAudible ) {
      if ( !this.sound ) return;
      this.sound._manager = null;
      await this.sound.stop({volume: 0, fade});
      this.#muffled = false;
      return;
    }

    // Begin playback
    this.sound ||= this._createSound();
    if ( this.sound === null ) return;
    const sound = this.sound;

    // Track whether the AmbientSound placeable managing Sound playback has changed
    const objectChange = sound._manager !== this;
    const requireLoad = !sound.loaded && !sound._manager;
    sound._manager = this;

    // Load the buffer if necessary
    if ( requireLoad ) await sound.load();
    if ( !sound.loaded ) return;  // Some other Placeable may be loading the sound

    // Update effects
    const muffledChange = this.#muffled !== muffled;
    this.#muffled = muffled;
    if ( objectChange && !this.#effectsInitialized ) this.#createEffects();
    if ( objectChange || muffledChange ) this.applyEffects({muffled});

    // Begin playback at the desired volume
    if ( !sound.playing ) {
      const offset = sound.context.currentTime % sound.duration;
      await sound.play({volume, offset, fade, loop: true});
      return;
    }

    // Adjust volume
    await sound.fade(volume, {duration: fade});
  }

  /* -------------------------------------------- */
  /* Rendering
  /* -------------------------------------------- */

  /** @inheritdoc */
  clear() {
    if ( this.controlIcon ) {
      this.controlIcon.parent.removeChild(this.controlIcon).destroy();
      this.controlIcon = null;
    }
    return super.clear();
  }

  /* -------------------------------------------- */

  /** @override */
  async _draw(options) {
    this.field = this.addChild(new PIXI.Graphics());
    this.field.eventMode = "none";
    this.controlIcon = this.addChild(this.#drawControlIcon());
  }

  /* -------------------------------------------- */

  /** @override */
  _destroy(options) {
    this.#destroySoundSource();
  }

  /* -------------------------------------------- */

  /**
   * Draw the ControlIcon for the AmbientLight
   * @returns {ControlIcon}
   */
  #drawControlIcon() {
    const size = 60 * canvas.dimensions.uiScale;
    const icon = new ControlIcon({texture: CONFIG.controlIcons.sound, size});
    icon.x -= (size * 0.5);
    icon.y -= (size * 0.5);
    return icon;
  }

  /* -------------------------------------------- */
  /*  Incremental Refresh                         */
  /* -------------------------------------------- */

  /** @override */
  _applyRenderFlags(flags) {
    if ( flags.refreshState ) this._refreshState();
    if ( flags.refreshPosition ) this._refreshPosition();
    if ( flags.refreshField ) this._refreshField();
    if ( flags.refreshElevation ) this._refreshElevation();
  }

  /* -------------------------------------------- */

  /**
   * Refresh the shape of the sound field-of-effect. This is refreshed when the SoundSource fov polygon changes.
   * @protected
   */
  _refreshField() {
    this.field.clear();
    if ( !this.source?.shape ) return;
    const s = canvas.dimensions.uiScale;
    this.field.lineStyle(s, 0xFFFFFF, 0.5).beginFill(0xAADDFF, 0.15).drawShape(this.source.shape).endFill();
    this.field.position.set(-this.source.x, -this.source.y);
  }

  /* -------------------------------------------- */

  /**
   * Refresh the position of the AmbientSound. Called with the coordinates change.
   * @protected
   */
  _refreshPosition() {
    const {x, y} = this.document;
    if ( (this.position.x !== x) || (this.position.y !== y) ) MouseInteractionManager.emulateMoveEvent();
    this.position.set(x, y);
  }

  /* -------------------------------------------- */

  /**
   * Refresh the state of the light. Called when the disabled state or darkness conditions change.
   * @protected
   */
  _refreshState() {
    this.alpha = this._getTargetAlpha();
    this.zIndex = this.hover ? 1 : 0;
    this.refreshControl();
  }

  /* -------------------------------------------- */

  /**
   * Refresh the display of the ControlIcon for this AmbientSound source.
   */
  refreshControl() {
    const isHidden = this.id && (this.document.hidden || !this.document.path);
    this.controlIcon.tintColor = isHidden ? 0xFF3300 : 0xFFFFFF;
    this.controlIcon.borderColor = isHidden ? 0xFF3300 : 0xFF5500;
    this.controlIcon.texture = getTexture(this.isAudible ? CONFIG.controlIcons.sound : CONFIG.controlIcons.soundOff);
    this.controlIcon.elevation = this.document.elevation;
    this.controlIcon.refresh({visible: this.layer.active, borderVisible: this.hover || this.layer.highlightObjects});
    this.controlIcon.draw();
  }

  /* -------------------------------------------- */

  /**
   * Refresh the elevation of the control icon.
   * @protected
   */
  _refreshElevation() {
    this.controlIcon.elevation = this.document.elevation;
  }

  /* -------------------------------------------- */
  /*  Sound Source Management                     */
  /* -------------------------------------------- */

  /**
   * Compute the field-of-vision for an object, determining its effective line-of-sight and field-of-vision polygons
   * @param {object} [options={}]   Options which modify how the audio source is updated
   * @param {boolean} [options.deleted]  Indicate that this SoundSource has been deleted.
   */
  initializeSoundSource({deleted=false}={}) {
    const wasActive = this.layer.sources.has(this.sourceId);
    const perceptionFlags = {refreshSounds: true};

    // Remove the audio source from the Scene
    if ( deleted ) {
      if ( !wasActive ) return;
      this.#destroySoundSource();
      canvas.perception.update(perceptionFlags);
      return;
    }

    // Create the sound source if necessary
    this.source ??= this.#createSoundSource();

    // Re-initialize source data and add to the active collection
    this.source.initialize(this._getSoundSourceData());
    this.source.add();

    // Schedule a perception refresh, unless that operation is deferred for some later workflow
    canvas.perception.update(perceptionFlags);
    if ( this.layer.active ) this.renderFlags.set({refreshField: true});
  }

  /* -------------------------------------------- */

  /**
   * Create a new point sound source for this AmbientSound.
   * @returns {PointSoundSource} The created source
   */
  #createSoundSource() {
    const cls = CONFIG.Canvas.soundSourceClass;
    return new cls({sourceId: this.sourceId, object: this});
  }

  /* -------------------------------------------- */

  /**
   * Destroy the point sound source for this AmbientSound.
   */
  #destroySoundSource() {
    this.source?.destroy();
    this.source = undefined;
  }

  /* -------------------------------------------- */

  /**
   * Get the sound source data.
   * @returns {BaseEffectSourceData}
   * @protected
   */
  _getSoundSourceData() {
    return {
      x: this.document.x,
      y: this.document.y,
      elevation: this.document.elevation,
      radius: this.radius,
      walls: this.document.walls,
      disabled: !this.isAudible
    };
  }

  /* -------------------------------------------- */
  /*  Document Event Handlers                     */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _onCreate(data, options, userId) {
    super._onCreate(data, options, userId);
    this.initializeSoundSource();
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);

    // Change the Sound buffer
    if ( "path" in changed ) {
      if ( this.sound ) this.sound.stop();
      this.sound = this._createSound();
    }

    // Update special effects
    if ( "effects" in changed ) {
      this.#effectsInitialized = false;
      if ( this.sound?._manager === this ) this.sound._manager = null;
    }

    // Re-initialize SoundSource
    this.initializeSoundSource();

    // Incremental Refresh
    this.renderFlags.set({
      refreshState: ("hidden" in changed) || ("path" in changed) || ("darkness" in changed),
      refreshElevation: "elevation" in changed
    });
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onDelete(options, userId) {
    this.sound?.stop();
    this.initializeSoundSource({deleted: true});
    super._onDelete(options, userId);
  }

  /* -------------------------------------------- */
  /*  Interactivity                               */
  /* -------------------------------------------- */

  /** @inheritdoc */
  _canHUD(user, event) {
    return user.isGM; // Allow GMs to single right-click
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _canConfigure(user, event) {
    return false; // Double-right does nothing
  }

  /* -------------------------------------------- */

  /** @override */
  _onClickRight(event) {
    this.document.update({hidden: !this.document.hidden});
    if ( !this._propagateRightClick(event) ) event.stopPropagation();
  }

  /* -------------------------------------------- */

  /** @override */
  _onDragLeftMove(event) {
    super._onDragLeftMove(event);
    const clones = event.interactionData.clones || [];
    for ( let c of clones ) {
      c.initializeSoundSource();
    }
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onDragEnd() {
    this.initializeSoundSource({deleted: true});
    this._original?.initializeSoundSource();
    super._onDragEnd();
  }

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  updateSource({defer=false, deleted=false}={}) {
    const msg = "AmbientSound#updateSource has been deprecated in favor of AmbientSound#initializeSoundSource";
    foundry.utils.logCompatibilityWarning(msg, {since: 12, until: 14, once: true});
    this.initializeSoundSource({defer, deleted});
  }
}

import {WALL_SENSE_TYPES} from "../../../common/constants.mjs";
import {DocumentSheetV2, HandlebarsApplicationMixin} from "../api/_module.mjs";

/**
 * The Application responsible for configuring a single Wall document within a parent Scene.
 * @extends DocumentSheetV2
 * @mixes HandlebarsApplication
 */
export default class WallConfig extends HandlebarsApplicationMixin(DocumentSheetV2) {
  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    classes: ["wall-config"],
    position: {width: 480},
    window: {
      contentClasses: ["standard-form"],
      icon: "fa-solid fa-block-brick"
    },
    form: {closeOnSubmit: true},
    actions: {previewSound: WallConfig.#onPreviewSound}
  };

  /** @override */
  static PARTS = {
    body: {template: "templates/scene/wall-config.hbs"},
    footer: {template: "templates/generic/form-footer.hbs"}
  };

  /** Wall sense types affected by proximity threshold attenuation */
  static #PROXIMITY_SENSE_TYPES = [WALL_SENSE_TYPES.PROXIMITY, WALL_SENSE_TYPES.DISTANCE];

  /**
   * The set of Wall documents that should all be edited when changes to this config form are submitted.
   * @type {ReadonlySet<WallDocument>}
   */
  get editTargets() {
    return this.#editTargets;
  }

  #editTargets = new Set([this.document]);

  /**
   * A tracking value corresponding with the index of an entry in CONFIG.Wall.doorSounds: each click of the preview
   * button plays the next sound in an entry.
   * @type {number}
   */
  #audioPreviewState = 0;

  /** @inheritDoc */
  get title() {
    return this.#editTargets.size > 1 ? game.i18n.localize("WALL.TitleMany") : super.title;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _configureRenderOptions(options) {
    if ( options.isFirstRender ) {
      this.#editTargets = Array.isArray(options.walls)
        ? new Set([this.document, ...options.walls])
        : new Set([this.document]);
    }
    super._configureRenderOptions(options);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const {document, source, fields} = context;
    const c = source.c;
    const coordinates = this.#editTargets.size > 1
      ? game.i18n.format("WALL.NWalls", {n: this.#editTargets.size})
      : game.i18n.format("WALL.CoordinateRange", {p0X: c[0], p0Y: c[1], p1X: c[2], p1Y: c[3]});
    const thresholdFields = ["light", "sight", "sound"].map(k => ({
      name: k,
      label: fields[k].label,
      choices: fields[k].choices,
      disabled: !WallConfig.#PROXIMITY_SENSE_TYPES.includes(source[k])
    }));
    const animationDirections = [
      {value: -1, label: game.i18n.localize("WALL.ANIMATION_DIRECTIONS.REVERSE")},
      {value: 1, label: game.i18n.localize("WALL.ANIMATION_DIRECTIONS.DEFAULT")}
    ];
    return Object.assign(context, {
      coordinates,
      thresholdFields,
      animation: source.animation || fields.animation.clean({}),
      animationDirections,
      animationTypes: CONFIG.Wall.animationTypes,
      animationFieldsetClass: (document.door > 0) && document.animation?.type ? "" : "hidden",
      editingMany: this.#editTargets.length > 1,
      rootId: this.#editTargets.length > 1 ? foundry.utils.randomID() : this.id,
      gridUnits: document.parent.grid.units || game.i18n.localize("GridUnits"),
      doorSounds: CONFIG.Wall.doorSounds,
      buttons: [{type: "submit", icon: "fa-solid fa-floppy-disk", label: "WALL.Submit"}]
    });
  }

  /* -------------------------------------------- */

  /** @override */
  _onChangeForm(_formConfig, event) {
    switch (event.target.name) {
      case "door":
        this.#toggleDoorOptions(Number(event.target.value) > CONST.WALL_DOOR_TYPES.NONE);
        this.#toggleAnimationOptions();
        break;
      case "doorSound":
        // Reset the audio preview state
        this.#audioPreviewState = 0;
        break;
      case "light":
      case "sight":
      case "sound":
        this.#toggleThresholdInputVisibility();
        break;
      case "animation.type":
        this.#toggleAnimationOptions();
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle previewing a sound file for a Wall setting
   * @this {WallConfig}
   * @returns {Promise<void>}
   */
  static async #onPreviewSound() {
    const doorSoundName = this.form["doorSound"].value;
    const doorSound = CONFIG.Wall.doorSounds[doorSoundName];
    if ( !doorSound ) return;
    const interactions = CONST.WALL_DOOR_INTERACTIONS;
    const interaction = interactions[this.#audioPreviewState++ % interactions.length];
    let sounds = doorSound[interaction];
    if ( !sounds ) return;
    if ( !Array.isArray(sounds) ) sounds = [sounds];
    const src = sounds[Math.floor(Math.random() * sounds.length)];
    await game.audio.play(src, {context: game.audio.interface});
  }

  /* -------------------------------------------- */

  /**
   * Toggle the disabled attributes of the door options and show/hide their containing fieldset.
   * @param {boolean} isDoor
   * @returns {void}
   */
  #toggleDoorOptions(isDoor) {
    for ( const name of ["ds", "doorSound", "animation.type"] ) {
      const select = this.form[name];
      select.disabled = !isDoor;
      select.closest(".form-group").hidden = !isDoor;
    }
    this.setPosition(); // Form height changed
  }

  /* -------------------------------------------- */

  /**
   * Toggle the display of the advanced Door Animation section.
   */
  #toggleAnimationOptions() {
    const showOptions = (Number(this.form.door.value) > 0) && !!this.form["animation.type"].value;
    const fieldset = this.element.querySelector("fieldset.door-animation");
    fieldset.classList.toggle("hidden", !showOptions);
    this.setPosition(); // Form height changed
  }

  /* -------------------------------------------- */

  /**
   * Toggle the disabled and hidden attributes of proximity input fields.
   * @returns {void}
   */
  #toggleThresholdInputVisibility() {
    for ( const sense of ["light", "sight", "sound"] ) {
      const type = Number(this.form[sense].value);
      const input = this.form[`threshold.${sense}`];
      input.disabled = input.hidden = !WallConfig.#PROXIMITY_SENSE_TYPES.includes(type);
    }
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _prepareSubmitData(event, form, formData, updateData) {
    const submitData = super._prepareSubmitData(event, form, formData, updateData);
    const thresholds = (submitData.threshold ??= {});
    for ( const sense of ["light", "sight", "sound"] ) {
      if ( !WallConfig.#PROXIMITY_SENSE_TYPES.includes(submitData[sense]) ) thresholds[sense] = null;
    }
    if ( submitData.door === CONST.WALL_DOOR_TYPES.NONE ) submitData.animation = null; // Purge animation data
    return submitData;
  }

  /* -------------------------------------------- */

  /** @override */
  async _processSubmitData(_event, _form, submitData, options) {
    if ( !this.document.id ) throw new Error("WallDocument creation from WallConfig is not currently supported.");
    const scene = this.document.parent;
    if ( !scene ) throw new Error("A WallDocument must have a parent Scene.");
    const updates = Array.from(this.#editTargets)
      .filter((w) => scene.walls.has(w.id))
      .map((w) => ({_id: w.id, ...submitData}));
    await scene.updateEmbeddedDocuments("Wall", updates, options);
  }
}

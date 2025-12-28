import {DocumentSheetV2, HandlebarsApplicationMixin} from "../api/_module.mjs";

/**
 * The Application responsible for configuring a single PlaylistSound document within a parent Playlist.
 * @extends DocumentSheetV2
 * @mixes HandlebarsApplication
 */
export default class PlaylistSoundConfig extends HandlebarsApplicationMixin(DocumentSheetV2) {

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    classes: ["playlist-sound-config"],
    window: {
      contentClasses: ["standard-form"],
      icon: "fa-solid fa-music"
    },
    position: {width: 480},
    form: {closeOnSubmit: true},
    canCreate: true
  };

  /** @override */
  static PARTS = {
    sheet: {template: "templates/sheets/playlist/sound-config.hbs", root: true},
    footer: {template: "templates/generic/form-footer.hbs"}
  };

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    return Object.assign(context, {
      lvolume: foundry.audio.AudioHelper.volumeToInput(this.document._source.volume),
      channels: Object.entries(CONST.AUDIO_CHANNELS).reduce((channels, [key, value]) => {
        channels[key] = game.i18n.localize(value);
        return channels;
      }, {}),
      defaultChannel: game.i18n.localize("PLAYLIST.DefaultChannel"),
      milliseconds: game.i18n.localize("TIME.Millisecond.abbr"),
      buttons: [{type: "submit", icon: "fa-solid fa-floppy-disk", label: "PLAYLIST_SOUND.Update"}]
    });
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onChangeForm(formConfig, event) {
    super._onChangeForm(formConfig, event);
    if ( event.target === this.form.elements.path ) {
      this.form.elements.name.value = foundry.audio.AudioHelper.getDefaultSoundName(event.target.value);
    }
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _processSubmitData(event, form, submitData, options) {
    submitData.volume = foundry.audio.AudioHelper.inputToVolume(submitData.volume);
    return super._processSubmitData(event, form, submitData, options);
  }
}

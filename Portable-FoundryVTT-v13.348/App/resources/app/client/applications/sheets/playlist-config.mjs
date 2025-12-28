import {DocumentSheetV2, HandlebarsApplicationMixin} from "../api/_module.mjs";

/**
 * @import {FormFooterButton} from "../_types.mjs";
 */

/**
 * The Application responsible for configuring a single Playlist document
 * @extends DocumentSheetV2
 * @mixes HandlebarsApplication
 */
export default class PlaylistConfig extends HandlebarsApplicationMixin(DocumentSheetV2) {

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    classes: ["playlist-config"],
    window: {
      contentClasses: ["standard-form"],
      icon: "fa-solid fa-list-music"
    },
    position: {width: 480},
    form: {closeOnSubmit: true}
  };

  /** @override */
  static PARTS = {
    sheet: {template: "templates/sheets/playlist/playlist-config.hbs", root: true},
    footer: {template: "templates/generic/form-footer.hbs"}
  };

  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    return Object.assign(context, {
      modes: Object.entries(CONST.PLAYLIST_MODES).reduce((modes, [key, value]) => {
        modes[value] = game.i18n.localize(`PLAYLIST.Mode${key.titleCase()}`);
        return modes;
      }, {}),
      sortModes: Object.entries(CONST.PLAYLIST_SORT_MODES).reduce((sortings, [key, value]) => {
        sortings[value] = game.i18n.localize(`PLAYLIST.Sort${key.titleCase()}`);
        return sortings;
      }, {}),
      channels: Object.entries(CONST.AUDIO_CHANNELS).reduce((channels, [value, locPath]) => {
        channels[value] = game.i18n.localize(locPath);
        return channels;
      }, {}),
      milliseconds: game.i18n.localize("TIME.Millisecond.abbr"),
      buttons: [{type: "submit", icon: "fa-solid fa-floppy-disk", label: "PLAYLIST.Update"}]
    });
  }
}

import ApplicationV2 from "../api/application.mjs";

/**
 * The Game Paused banner.
 * @extends {ApplicationV2}
 */
export default class GamePause extends ApplicationV2 {

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    id: "pause",
    tag: "figure",
    window: {
      frame: false,
      positioned: false
    }
  };

  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(_options) {
    return {
      cssClass: game.paused ? "paused" : "",
      icon: "ui/pause.svg",
      text: game.i18n.localize("GAME.Paused"),
      spin: true
    };
  }

  /* -------------------------------------------- */

  /** @override */
  async _renderHTML(context, options) {
    const img = document.createElement("img");
    img.src = context.icon;
    if ( context.spin ) img.classList.add("fa-spin");
    const caption = document.createElement("figcaption");
    caption.innerText = context.text;
    return [img, caption];
  }

  /* -------------------------------------------- */

  /** @override */
  _replaceHTML(result, content, _options) {
    content.classList.toggle("paused", game.paused);
    content.replaceChildren(...result);
  }
}

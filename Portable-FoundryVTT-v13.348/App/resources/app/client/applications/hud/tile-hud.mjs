import BasePlaceableHUD from "./placeable-hud.mjs";
import HandlebarsApplicationMixin from "../api/handlebars-application.mjs";

/**
 * @import Tile from "../../canvas/placeables/tile.mjs";
 * @import TileDocument from "../../documents/tile.mjs";
 * @import TilesLayer from "../../canvas/layers/tiles.mjs";
 */

/**
 * An implementation of the PlaceableHUD base class which renders a heads-up-display interface for Tile objects.
 * The TileHUD implementation can be configured and replaced via {@link CONFIG.Tile.hudClass}.
 * @extends {BasePlaceableHUD<Tile, TileDocument, TilesLayer>}
 * @mixes HandlebarsApplication
 */
export default class TileHUD extends HandlebarsApplicationMixin(BasePlaceableHUD) {

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    id: "tile-hud",
    actions: {
      video: TileHUD.#onControlVideo
    }
  };

  /** @override */
  static PARTS = {
    hud: {
      root: true,
      template: "templates/hud/tile-hud.hbs"
    }
  };

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const {isVideo, sourceElement} = this.object;
    const isPlaying = isVideo && !sourceElement.paused && !sourceElement.ended;
    return Object.assign(context, {
      isVideo: isVideo,
      videoIcon: isPlaying ? "fa-solid fa-pause" : "fa-solid fa-play",
      videoTitle: game.i18n.localize(isPlaying ? "HUD.TilePause" : "HUD.TilePlay")
    });
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /**
   * Toggle playback of a video tile.
   * @this {TileHUD}
   * @param {PointerEvent} event
   * @param {HTMLButtonElement} target
   * @returns {Promise<void>}
   */
  static #onControlVideo(event, target) {
    const {sourceElement, document} = this.object;
    const icon = target.children[0];
    const isPlaying = !sourceElement.paused && !sourceElement.ended;

    // Intercepting state change if the source is not looping and not playing
    if ( !sourceElement.loop && !isPlaying ) {
      sourceElement.onpause = () => {
        if ( this.object?.sourceElement ) {
          icon.classList.replace("fa-pause", "fa-play");
        }
        sourceElement.onpause = null;
      };
    }

    // Update the video playing state
    return document.update({"video.autoplay": false}, {
      diff: false,
      playVideo: !isPlaying,
      offset: sourceElement.ended ? 0 : null
    });
  }
}

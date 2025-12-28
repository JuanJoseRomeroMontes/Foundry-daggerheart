import JournalEntryPageHandlebarsSheet from "./journal-entry-page-hbs-sheet.mjs";
import {NumberField} from "@common/data/fields.mjs";
import {createTextInput} from "../../forms/fields.mjs";

/**
 * An Application responsible for displaying and editing a single video-type JournalEntryPage Document.
 * @extends JournalEntryPageHandlebarsSheet
 */
export default class JournalEntryPageVideoSheet extends JournalEntryPageHandlebarsSheet {
  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["video"],
    window: {
      icon: "fa-solid fa-video"
    }
  };

  /** @inheritDoc */
  static EDIT_PARTS = {
    header: super.EDIT_PARTS.header,
    content: {
      template: "templates/journal/pages/video/edit.hbs",
      classes: ["standard-form"]
    },
    footer: super.EDIT_PARTS.footer
  };

  /** @inheritDoc */
  static VIEW_PARTS = {
    content: {
      template: "templates/journal/pages/video/view.hbs",
      root: true
    }
  };

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContentContext(context, options) {
    await super._prepareContentContext(context, options);
    const { src, video } = this.page;
    const { h, m, s } = this._timestampToTimeComponents(video.timestamp);
    Object.assign(context, {
      src,
      srcInput: this.#createSourceInput.bind(this),
      flexRatio: !video.width && !video.height,
      isYouTube: game.video.isYouTubeURL(src),
      timestamp: {
        h: {
          field: new NumberField({ integer: true, min: 0, step: 1 }),
          value: h
        },
        m: {
          field: new NumberField({ integer: true, min: 0, max: 59, step: 1 }),
          input: (field, config) => createTextInput(config),
          value: m
        },
        s: {
          field: new NumberField({ integer: true, min: 0, max: 59, step: 1 }),
          input: (field, config) => createTextInput(config),
          value: s
        }
      },
      yt: {
        id: `youtube-${foundry.utils.randomID()}`,
        url: game.video.getYouTubeEmbedURL(src, this._getYouTubeVars())
      }
    });
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onRender(context, options) {
    await super._onRender(context, options);
    if ( !this.isView ) return;
    const { video: config } = this.page;
    const iframe = this.element.querySelector("iframe[id]");
    if ( iframe ) game.video.getYouTubePlayer(iframe.id, {
      events: {
        onStateChange: event => {
          if ( event.data === YT.PlayerState.PLAYING ) event.target.setVolume(config.volume * 100);
        }
      }
    }).then(player => {
      if ( config.timestamp ) player.seekTo(config.timestamp, true);
    });
    const video = this.element.querySelector("video");
    video?.addEventListener("loadedmetadata", () => {
      video.volume = config.volume;
      if ( config.timestamp ) video.currentTime = config.timestamp;
    });
  }

  /* -------------------------------------------- */

  /**
   * Get the YouTube player parameters depending on whether the sheet is being viewed or edited.
   * @returns {object}
   * @protected
   */
  _getYouTubeVars() {
    const { video } = this.page;
    const vars = { playsinline: 1, modestbranding: 1 };
    if ( this.isView ) {
      Object.assign(vars, {
        controls: video.controls ? 1 : 0,
        autoplay: video.autoplay ? 1 : 0,
        loop: video.loop ? 1 : 0
      });
      if ( video.timestamp ) vars.start = video.timestamp;
    }
    return vars;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _prepareSubmitData(event, form, formData, updateData) {
    const submitData = super._prepareSubmitData(event, form, formData, updateData);
    const { timestamp } = foundry.utils.expandObject(formData.object);
    foundry.utils.setProperty(submitData, "video.timestamp", this._timeComponentsToTimestamp(timestamp));
    return submitData;
  }

  /* -------------------------------------------- */

  /**
   * Convert time components to a timestamp in seconds.
   * @param {{ [h]: number, [m]: number, [s]: number }} components  The time components.
   * @returns {number}                                              The timestamp, in seconds.
   * @protected
   */
  _timeComponentsToTimestamp({ h=0, m=0, s=0 }) {
    return (h * 3600) + (m * 60) + s;
  }

  /* -------------------------------------------- */

  /**
   * Convert a timestamp in seconds into separate time components.
   * @param {number} timestamp                             The timestamp, in seconds.
   * @returns {{ [h]: number, [m]: number, [s]: number }}  The individual time components.
   * @protected
   */
  _timestampToTimeComponents(timestamp) {
    if ( !timestamp ) return {};
    const components = {};
    const h = Math.floor(timestamp / 3600);
    if ( h ) components.h = h;
    const m = Math.floor((timestamp % 3600) / 60);
    if ( m ) components.m = m;
    components.s = timestamp - (h * 3600) - (m * 60);
    return components;
  }

  /* -------------------------------------------- */

  /**
   * Create a FilePicker input for the video source field.
   * @param {DataField} field              The source field.
   * @param {FormInputConfig} inputConfig  The form input configuration.
   * @returns {HTMLFilePickerElement}
   */
  #createSourceInput(field, inputConfig) {
    return foundry.applications.elements.HTMLFilePickerElement.create({ type: "video", ...inputConfig });
  }
}

import {ApplicationV2, HandlebarsApplicationMixin} from "../api/_module.mjs";

/**
 * @import Document from "@common/abstract/document.mjs";
 * @import {ApplicationConfiguration} from "../_types.mjs";
 */

/**
 * @typedef ImagePopoutConfiguration
 * @property {string} src              The URL to the image or video file
 * @property {string} [caption]        Caption text to display below the image.
 * @property {string|null} [uuid=null] The UUID of some related {@link foundry.abstract.Document}.
 * @property {boolean} [showTitle]     Force showing or hiding the title.
 */

/**
 * @typedef ShareImageConfig
 * @property {string} image         The image URL to share.
 * @property {string} title         The image title.
 * @property {string} [uuid]        The UUID of a {@link foundry.abstract.Document} related to the image,
 *                                  used to determine permission to see the image title.
 * @property {boolean} [showTitle]  If this is provided, the permissions of the related Document will be ignored and
 *                                  the title will be shown based on this parameter.
 * @property {string[]} [users]     A list of user IDs to show the image to.
 */


/**
 * An Image Popout Application which features a single image in a lightbox style frame.
 * Furthermore, this application allows for sharing the display of an image with other connected players.
 *
 * @extends {ApplicationV2<ApplicationConfiguration & ImagePopoutConfiguration>}
 * @mixes HandlebarsApplication
 * @property {string} src The URL to the image or video file
 * @example Creating an Image Popout
 * ```js
 * // Construct the Application instance
 * const ip = new ImagePopout({
 *   src: "path/to/image.jpg",
 *   uuid: game.actors.getName("My Hero").uuid
 *   window: {title: "My Featured Image"}
 * });
 *
 * // Display the image popout
 * ip.render(true);
 *
 * // Share the image with other connected players
 * ip.shareImage();
 * ```
 */
export default class ImagePopout extends HandlebarsApplicationMixin(ApplicationV2) {
  // eslint-disable-next-line jsdoc/require-param
  /**
   * @param {ApplicationConfiguration & ImagePopoutConfiguration} options Application configuration options
   */
  constructor(options, _options={}) {
    if ( typeof options === "string" ) {
      foundry.utils.logCompatibilityWarning(
        "An ImagePopout image path must be assigned to options.src.",
        {since: 13, until: 15}
      );
      _options.src = options;
      super(_options);
    } else {
      super(options);
    }
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    classes: ["image-popout"],
    caption: "",
    uuid: null,
    actions: {shareImage: function() {this.shareImage();}},
    window: {
      resizable: true,
      icon: "fa-solid fa-image",
      controls: [{
        label: "JOURNAL.ActionShow",
        icon: "fa-solid fa-eye",
        action: "shareImage",
        visible: () => game.user.isGM
      }]
    }
  };

  /* -------------------------------------------- */

  /** @override */
  static PARTS = {popout: {template: "templates/apps/image-popout.hbs"}};

  /* -------------------------------------------- */

  /**
   * A cached reference to the related Document.
   * @type {Document|null}
   */
  #related = null;

  /* -------------------------------------------- */

  /** @inheritDoc */
  get title() {
    const isVisible = this.options.showTitle ?? this.#related?.testUserPermission(game.user, "LIMITED") ?? true;
    return isVisible ? super.title : "";
  }

  /* -------------------------------------------- */

  /**
   * Whether the application should display video content.
   * @type {boolean}
   */
  get isVideo() {
    return foundry.helpers.media.VideoHelper.hasVideoExtension(this.options.src);
  }

  /* -------------------------------------------- */

  /**
   * Share the displayed image with other connected Users
   * @param {ShareImageConfig} [options]
   */
  shareImage(options={}) {
    const title = options.title ?? this.options.window.title;
    game.socket.emit("shareImage", {
      image: options.image ?? this.options.src,
      title,
      caption: options.caption ?? this.options.caption,
      uuid: options.uuid ?? this.options.uuid,
      showTitle: options.showTitle ?? this.options.showTitle,
      users: Array.isArray(options.users) ? options.users : undefined
    });
    ui.notifications.info("JOURNAL.ActionShowSuccess", {format: {mode: "image", title, which: "all"}});
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _initializeApplicationOptions(options) {
    const initialized = super._initializeApplicationOptions(options);
    if ( typeof initialized.title === "string" ) {
      foundry.utils.logCompatibilityWarning(
        "An ImagePopout title must be assigned to options.window.title.",
        {since: 13, until: 15}
      );
      initialized.window.title = initialized.title;
      delete initialized.title;
    }
    return initialized;
  }

  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    if ( options.isFirstRender ) {
      this.#related = this.options.uuid ? await foundry.utils.fromUuid(this.options.uuid) : null;
      options.window.title = this.options.window.title = this.title.trim();
    }
    const title = this.options.window.title;
    return {
      caption: this.options.caption,
      image: this.options.src,
      isVideo: this.isVideo,
      title,
      altText: title || game.i18n.localize("APPLICATION.IMAGE_POPOUT.AltText")
    };
  }

  /* -------------------------------------------- */

  /** @override */
  async _preFirstRender(_context, options) {
    Object.assign(options.position, await ImagePopout.#getDimensions(this.options.src));
  }

  /* -------------------------------------------- */
  /*  Helper Methods                              */
  /* -------------------------------------------- */

  /**
   * Determine the correct dimensions for the displayed image
   * @param {string} img  The image URL.
   * @returns {Object}    The positioning object which should be used for rendering
   */
  static async #getDimensions(img) {
    if ( !img ) return {width: 480, height: 480};
    let w;
    let h;
    try {
      [w, h] = this.isVideo ? await this.#getVideoSize(img) : await this.#getImageSize(img);
    } catch(err) {
      return {width: 480, height: 480};
    }
    const position = {};

    // Compare the image aspect ratio to the screen aspect ratio
    const sr = window.innerWidth / window.innerHeight;
    const ar = w / h;

    // The image is constrained by the screen width, display at max width
    if ( ar > sr ) {
      position.width = Math.min(w * 2, window.innerWidth - 80);
      position.height = position.width / ar;
    }

    // The image is constrained by the screen height, display at max height
    else {
      position.height = Math.min(h * 2, window.innerHeight - 120);
      position.width = position.height * ar;
    }
    return position;
  }

  /* -------------------------------------------- */

  /**
   * Determine the Image dimensions given a certain path
   * @param {string} path  The image source.
   * @returns {Promise<[number, number]>}
   */
  static #getImageSize(path) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        resolve([img.width, img.height]);
      };
      img.onerror = reject;
      img.src = path;
    });
  }

  /* -------------------------------------------- */

  /**
   * Determine the dimensions of the given video file.
   * @param {string} src  The URL to the video.
   * @returns {Promise<[number, number]>}
   */
  static #getVideoSize(src) {
    return new Promise((resolve, reject) => {
      const video = document.createElement("video");
      video.onloadedmetadata = () => {
        video.onloadedmetadata = null;
        resolve([video.videoWidth, video.videoHeight]);
      };
      video.onerror = reject;
      video.src = src;
    });
  }

  /* -------------------------------------------- */

  /**
   * Handle a received request to display an image.
   * @param {ShareImageConfig} config  The image configuration data.
   * @returns {ImagePopout}
   * @internal
   */
  static _handleShareImage({image, title, caption, uuid, showTitle}={}) {
    const ip = new ImagePopout({src: image, caption, uuid, showTitle, window: {title}});
    ip.render(true);
    return ip;
  }
}

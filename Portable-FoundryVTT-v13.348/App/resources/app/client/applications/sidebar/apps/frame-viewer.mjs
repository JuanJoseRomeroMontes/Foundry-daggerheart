import {ApplicationV2} from "../../api/_module.mjs";

/** @import {ApplicationConfiguration} from "../../_types.mjs"; */

/**
 * @typedef FrameViewerConfiguration
 * @property {string} url The initial URL to navigate to
 */

/**
 * A simple window application which shows the built documentation pages within an iframe
 * @extends ApplicationV2<ApplicationConfiguration & FrameViewerConfiguration>
 * @deprecated since V13
 */
export default class FrameViewer extends ApplicationV2 {

  constructor(...args) {
    super(...args);
    const warning = "FrameViewer has been deprecated with no replacement.";
    foundry.utils.logCompatibilityWarning(warning, {since: 13, until: 15, once: true});
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    id: "frame-viewer",
    classes: ["theme-dark"],
    window: {icon: "fa-solid fa-browser"},
    url: undefined
  };

  /* -------------------------------------------- */

  /** @inheritDoc */
  _configureRenderOptions(options) {
    super._configureRenderOptions(options);
    const position = options.position;
    position.height = window.innerHeight * 0.9;
    position.width = Math.min(window.innerWidth * 0.9, 1200);
    position.top = (window.innerHeight - position.height) / 2;
    position.left = (window.innerWidth - position.width) / 2;
  }

  /* -------------------------------------------- */

  /**
   * Create the iframe and set its `src`.
   * @returns {HTMLIFrameElement}
   * @override
   */
  _renderHTML(_context, options) {
    const iframe = document.createElement("iframe");
    iframe.src = this.options.url;
    return iframe;
  }

  /* -------------------------------------------- */

  /** @override */
  _replaceHTML(iframe, content) {
    content.replaceChildren(iframe);
  }
}

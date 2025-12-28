import ApplicationV2 from "./api/application.mjs";
import HandlebarsApplicationMixin from "./api/handlebars-application.mjs";

/**
 * Application documentation here.
 *
 * @extends ApplicationV2
 * @mixes HandlebarsApplication
 */
export default class AppV2QuickStartTemplate extends HandlebarsApplicationMixin(ApplicationV2) {

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    id: "appid",
    classes: [],
    tag: "div",
    window: {
      frame: false,
      positioned: false
    },
    actions: {
    }
  };

  /** @override */
  static PARTS = {
    part: {
      template: "templates/path/part.hbs"
    }
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */
  /** @override */
  async _prepareContext(_options) {
  }

  /* -------------------------------------------- */
  /*  Public API                                  */
  /* -------------------------------------------- */

  /* -------------------------------------------- */
  /*  Action Event Handlers                       */
  /* -------------------------------------------- */

  /* -------------------------------------------- */
  /*  Drag and Drop                               */
  /* -------------------------------------------- */

  /* -------------------------------------------- */
  /*  Compatibility and Deprecations              */
  /* -------------------------------------------- */

}

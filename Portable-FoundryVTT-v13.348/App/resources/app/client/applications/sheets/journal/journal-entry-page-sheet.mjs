import JournalEntryPage from "@client/documents/journal-entry-page.mjs";
import DocumentSheetV2 from "../../api/document-sheet.mjs";
import {DOCUMENT_OWNERSHIP_LEVELS} from "@common/constants.mjs";

/**
 * @import {DocumentSheetConfiguration, DocumentSheetRenderOptions} from "../../api/document-sheet.mjs";
 * @import {JournalEntryPageHeading} from "@client/_types.mjs";
 */

/**
 * @typedef {DocumentSheetConfiguration} JournalPageSheetConfiguration
 * @property {boolean} [includeTOC]  Whether the sheet includes additional table of contents elements besides its title.
 * @property {"edit"|"view"} [mode]  Whether the sheet is in edit or view mode.
 * @property {string} [viewClasses]  Classes appended to the page's root element when embedded in another sheet in view
 *                                   mode.
 */

/**
 * An abstract Application responsible for displaying and editing a single JournalEntryPage Document.
 * @extends {DocumentSheetV2<JournalPageSheetConfiguration, DocumentSheetRenderOptions>}
 * @mixes HandlebarsApplication
 */
export default class JournalEntryPageSheet extends DocumentSheetV2 {
  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["journal-sheet", "journal-entry-page"],
    includeTOC: false,
    mode: "edit",
    viewPermission: DOCUMENT_OWNERSHIP_LEVELS.OBSERVER,
    viewClasses: [],
    window: {
      resizable: true
    },
    position: {
      width: 600,
      height: 680
    },
    form: {
      submitOnChange: true
    }
  };

  /** @inheritDoc */
  static emittedEvents = Object.freeze([...super.emittedEvents, "closeView"]);

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * The table of contents for this text page.
   * @type {Record<string, JournalEntryPageHeading>}
   */
  toc;

  /**
   * Indicates that the sheet renders with App V2 rather than V1.
   * @type {boolean}
   */
  static isV2 = true;

  /**
   * Indicates that the sheet renders with App V2 rather than V1.
   * @type {boolean}
   */
  isV2 = this.constructor.isV2;

  /**
   * Whether the sheet is in view mode.
   * @returns {boolean}
   */
  get isView() {
    return this.options.mode === "view";
  }

  /**
   * The JournalEntryPage for this sheet.
   * @returns {JournalEntryPage}
   */
  get page() {
    return this.document;
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _insertElement(element) {
    if ( this.options.window.frame ) super._insertElement(element);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const { name, title, uuid } = this.page;
    Object.assign(context, { name, title, uuid });
    return context;
  }

  /* -------------------------------------------- */

  /**
   * Prepare heading level choices.
   * @returns {Record<string, string>}
   * @protected
   */
  _prepareHeadingLevels() {
    return Array.fromRange(3, 1).reduce((obj, level) => {
      obj[level] = game.i18n.format("JOURNALENTRYPAGE.Level", { level });
      return obj;
    }, {});
  }

  /* -------------------------------------------- */
  /*  Events                                      */
  /* -------------------------------------------- */

  /**
   * Actions performed when this sheet is closed in some parent view.
   * @protected
   */
  _onCloseView() {}

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onRender(context, options) {
    await super._onRender(context, options);
    if ( this.options.includeTOC ) this.toc = JournalEntryPage.implementation.buildTOC(this.element);
  }
}

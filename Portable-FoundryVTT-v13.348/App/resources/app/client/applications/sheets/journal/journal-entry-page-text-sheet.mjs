import {JOURNAL_ENTRY_PAGE_FORMATS, SHOWDOWN_OPTIONS} from "@common/constants.mjs";
import JournalEntryPageHandlebarsSheet from "./journal-entry-page-hbs-sheet.mjs";

/**
 * @import showdown from "showdown"
 * @import {ApplicationRenderContext} from "../../_types.mjs"
 */

/**
 * An abstract Application responsible for displaying and editing a single text-type JournalEntryPage Document.
 * @extends JournalEntryPageHandlebarsSheet
 */
export default class JournalEntryPageTextSheet extends JournalEntryPageHandlebarsSheet {
  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["text"],
    includeTOC: true
  };

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * Bi-directional HTML <-> Markdown converter.
   * @type {showdown.Converter}
   * @protected
   */
  static _converter = (function() {
    Object.entries(SHOWDOWN_OPTIONS).forEach(([k, v]) => window.showdown.setOption(k, v));
    return new window.showdown.Converter();
  })();

  /**
   * The format used to edit text content in this sheet.
   * @type {number}
   */
  static format = JOURNAL_ENTRY_PAGE_FORMATS.HTML;

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.text = { ...this.page.text };
    this.#convertFormats(context);
    return context;
  }

  /* -------------------------------------------- */
  /*  Form Submission                             */
  /* -------------------------------------------- */

  /**
   * Determine if any editors have unsaved changes.
   * @returns {boolean}
   * @abstract
   * @protected
   */
  _isEditorDirty() {
    return false;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _prepareSubmitData(event, form, formData, updateData) {
    const submitData = super._prepareSubmitData(event, form, formData, updateData);
    if ( (this.constructor.format === JOURNAL_ENTRY_PAGE_FORMATS.HTML) && this._isEditorDirty() ) {
      // Clear any stored markdown so it can be re-converted.
      foundry.utils.mergeObject(submitData, {
        text: {
          format: JOURNAL_ENTRY_PAGE_FORMATS.HTML,
          markdown: ""
        }
      });
    }
    return submitData;
  }

  /* -------------------------------------------- */
  /*  Conversion                                  */
  /* -------------------------------------------- */

  /**
   * Lazily convert text formats if we detect the document being opened in a different format.
   * @param {ApplicationRenderContext} context
   */
  #convertFormats(context) {
    const formats = JOURNAL_ENTRY_PAGE_FORMATS;
    const text = this.page.text;
    if ( (this.constructor.format === formats.MARKDOWN) && text.content?.length && !text.markdown?.length ) {
      // We've opened an HTML document in a markdown editor, so we need to convert the HTML to markdown for editing.
      context.text.markdown = this.constructor._converter.makeMarkdown(text.content.trim());
    }
  }
}

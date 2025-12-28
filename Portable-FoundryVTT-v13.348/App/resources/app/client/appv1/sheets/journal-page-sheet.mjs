import DocumentSheet from "../api/document-sheet-v1.mjs";
import {DOCUMENT_OWNERSHIP_LEVELS, JOURNAL_ENTRY_PAGE_FORMATS, SHOWDOWN_OPTIONS} from "@common/constants.mjs";
import JournalEntryPage from "../../documents/journal-entry-page.mjs";
import TextEditor from "../../applications/ux/text-editor.mjs";

/**
 * @import {ApplicationV1Options} from "../api/application-v1.mjs";
 * @import {DocumentSheetV1Options} from "../api/document-sheet-v1.mjs";
 */

/**
 * The Application responsible for displaying and editing a single JournalEntryPage document.
 * @deprecated since v13
 * @param {JournalEntryPage} object         The JournalEntryPage instance which is being edited.
 * @param {ApplicationV1Options & DocumentSheetV1Options} [options]  Application options.
 */
export class JournalPageSheet extends DocumentSheet {

  /** @inheritdoc */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["sheet", "journal-sheet", "journal-entry-page"],
      viewClasses: [],
      width: 600,
      height: 680,
      resizable: true,
      closeOnSubmit: false,
      submitOnClose: true,
      viewPermission: DOCUMENT_OWNERSHIP_LEVELS.OBSERVER,
      includeTOC: true
    });
  }

  /**
   * Indicates that the sheet renders with App V2 rather than V1.
   * @type {boolean}
   */
  static isV2 = false;

  /**
   * Indicates that the sheet renders with App V2 rather than V1.
   * @type {boolean}
   */
  isV2 = this.constructor.isV2;

  /* -------------------------------------------- */

  /** @inheritdoc */
  get template() {
    return `templates/journal/page-${this.document.type}-${this.isEditable ? "edit" : "view"}.html`;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  get title() {
    return this.object.permission ? this.object.name : "";
  }

  /* -------------------------------------------- */

  /**
   * The table of contents for this JournalTextPageSheet.
   * @type {Record<string, JournalEntryPageHeading>}
   */
  toc = {};

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @inheritdoc */
  getData(options={}) {
    const comparator = foundry.documents.JournalEntry.implementation.sortCategories;
    const categories = this.object.parent.categories.contents.sort(comparator);
    const context = foundry.utils.mergeObject(super.getData(options), {
      headingLevels: Object.fromEntries(Array.fromRange(3, 1).map(level => {
        return [level, game.i18n.format("JOURNALENTRYPAGE.Level", {level})];
      }))
    });
    if ( categories.length ) context.categories = [
      { value: "", label: game.i18n.localize("JOURNAL.Uncategorized") },
      ...categories.map(({ id, name }) => ({ value: id, label: name }))
    ];
    return context;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _renderInner(...args) {
    await foundry.applications.handlebars.loadTemplates({
      journalEntryPageHeader: "templates/journal/parts/page-header.html",
      journalEntryPageFooter: "templates/journal/parts/page-footer.html"
    });
    const html = await super._renderInner(...args);
    if ( this.options.includeTOC ) this.toc = JournalEntryPage.implementation.buildTOC(html.get());
    return html;
  }

  /* -------------------------------------------- */

  /**
   * A method called by the journal sheet when the view mode of the page sheet is closed.
   * @internal
   */
  _closeView() {}

  /* -------------------------------------------- */
  /*  Text Secrets Management                     */
  /* -------------------------------------------- */

  /** @inheritdoc */
  _getSecretContent(secret) {
    return this.object.text.content;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _updateSecret(secret, content) {
    return this.object.update({"text.content": content});
  }

  /* -------------------------------------------- */
  /*  Text Editor Integration                     */
  /* -------------------------------------------- */

  /** @inheritdoc */
  async activateEditor(name, options={}, initialContent="") {
    options.fitToSize = true;
    options.relativeLinks = true;
    const editor = await super.activateEditor(name, options, initialContent);
    this.form.querySelector('[role="application"]')?.style.removeProperty("height");
    return editor;
  }

  /* -------------------------------------------- */

  /**
   * Update the parent sheet if it is open when the server autosaves the contents of this editor.
   * @param {string} html  The updated editor contents.
   * @internal
   */
  _onAutosave(html) {
    this.object.parent?.sheet?.render(false);
  }

  /* -------------------------------------------- */

  /**
   * Update the UI appropriately when receiving new steps from another client.
   * @internal
   */
  _onNewSteps() {
    this.form.querySelectorAll('[data-action="save-html"]').forEach(el => el.disabled = true);
  }
}

/**
 * The Application responsible for displaying and editing a single JournalEntryPage text document.
 * @extends {JournalPageSheet}
 */
export class JournalTextPageSheet extends JournalPageSheet {
  /**
   * Bi-directional HTML <-> Markdown converter.
   * @type {showdown.Converter}
   * @protected
   */
  static _converter = (() => {
    Object.entries(SHOWDOWN_OPTIONS).forEach(([k, v]) => showdown.setOption(k, v));
    return new showdown.Converter();
  })();

  /* -------------------------------------------- */

  /**
   * Declare the format that we edit text content in for this sheet so we can perform conversions as necessary.
   * @type {number}
   */
  static get format() {
    return JOURNAL_ENTRY_PAGE_FORMATS.HTML;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  static get defaultOptions() {
    const options = super.defaultOptions;
    options.classes.push("text");
    options.secrets.push({parentSelector: "section.journal-page-content"});
    return options;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async getData(options={}) {
    const data = super.getData(options);
    this._convertFormats(data);
    data.editor = {
      engine: "prosemirror",
      collaborate: true,
      content: await TextEditor.implementation.enrichHTML(data.document.text.content, {
        relativeTo: this.object,
        secrets: this.object.isOwner
      })
    };
    return data;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async close(options={}) {
    Object.values(this.editors).forEach(ed => {
      if ( ed.instance ) ed.instance.destroy();
    });
    return super.close(options);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _render(force, options) {
    if ( !this.#canRender(options.resync) ) return this.maximize().then(() => this.bringToTop());
    return super._render(force, options);
  }

  /* -------------------------------------------- */

  /**
   * Suppress re-rendering the sheet in cases where an active editor has unsaved work.
   * In such cases we rely upon collaborative editing to save changes and re-render.
   * @param {boolean} [resync]    Was the application instructed to re-sync?
   * @returns {boolean}           Should a render operation be allowed?
   */
  #canRender(resync) {
    if ( resync || (this._state !== DocumentSheet.RENDER_STATES.RENDERED) || !this.isEditable ) return true;
    return !this.isEditorDirty();
  }

  /* -------------------------------------------- */

  /**
   * Determine if any editors are dirty.
   * @returns {boolean}
   */
  isEditorDirty() {
    for ( const editor of Object.values(this.editors) ) {
      if ( editor.active && editor.instance?.isDirty() ) return true;
    }
    return false;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _updateObject(event, formData) {
    if ( (this.constructor.format === JOURNAL_ENTRY_PAGE_FORMATS.HTML) && this.isEditorDirty() ) {
      // Clear any stored markdown so it can be re-converted.
      formData["text.markdown"] = "";
      formData["text.format"] = JOURNAL_ENTRY_PAGE_FORMATS.HTML;
    }
    return super._updateObject(event, formData);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async saveEditor(name, { preventRender=true, ...options }={}) {
    return super.saveEditor(name, { ...options, preventRender });
  }

  /* -------------------------------------------- */

  /**
   * Lazily convert text formats if we detect the document being saved in a different format.
   * @param {object} renderData  Render data.
   * @protected
   */
  _convertFormats(renderData) {
    const formats = JOURNAL_ENTRY_PAGE_FORMATS;
    const text = this.object.text;
    if ( (this.constructor.format === formats.MARKDOWN) && text.content?.length && !text.markdown?.length ) {
      // We've opened an HTML document in a markdown editor, so we need to convert the HTML to markdown for editing.
      renderData.data.text.markdown = this.constructor._converter.makeMarkdown(text.content.trim());
    }
  }
}

/* -------------------------------------------- */

/**
 * A subclass of {@link foundry.appv1.sheets.JournalTextPageSheet} that implements a TinyMCE editor.
 * @extends {JournalTextPageSheet}
 * @deprecated since v13 until v14
 */
export class JournalTextTinyMCESheet extends JournalTextPageSheet {
  /** @inheritdoc */
  async getData(options={}) {
    const data = await super.getData(options);
    data.editor.engine = "tinymce";
    data.editor.collaborate = false;
    return data;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async close(options = {}) {
    return JournalPageSheet.prototype.close.call(this, options);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _render(force, options) {
    return JournalPageSheet.prototype._render.call(this, force, options);
  }
}

import JournalEntryPageTextSheet from "./journal-entry-page-text-sheet.mjs";
import {JOURNAL_ENTRY_PAGE_FORMATS} from "@common/constants.mjs";
import TextEditor from "@client/applications/ux/text-editor.mjs";

/**
 * An Application responsible for displaying a single text-type JournalEntryPage Document, and editing it with a
 * Markdown editor.
 * @extends JournalEntryPageTextSheet
 */
export default class JournalEntryPageMarkdownSheet extends JournalEntryPageTextSheet {
  /** @override */
  static DEFAULT_OPTIONS = {
    window: {
      contentClasses: ["flexcol"],
      icon: "fa-brands fa-markdown"
    }
  };

  /** @inheritDoc */
  static EDIT_PARTS = {
    header: super.EDIT_PARTS.header,
    content: {
      classes: ["flex1", "flexcol"],
      template: "templates/journal/pages/markdown/edit.hbs"
    },
    footer: super.EDIT_PARTS.footer
  };

  /** @override */
  static VIEW_PARTS = {
    content: {
      root: true,
      template: "templates/journal/pages/text/view.hbs"
    }
  };

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /** @override */
  static format = JOURNAL_ENTRY_PAGE_FORMATS.MARKDOWN;

  /**
   * Store the dirty flag for this editor.
   * @type {boolean}
   */
  #isDirty = false;

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContentContext(context, options) {
    if ( this.isView ) context.text.enriched = await TextEditor.implementation.enrichHTML(context.text.content, {
      relativeTo: this.page,
      secrets: this.page.isOwner
    });
    else context.markdownFormat = JOURNAL_ENTRY_PAGE_FORMATS.MARKDOWN;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _preSyncPartState(partId, newElement, priorElement, state) {
    super._preSyncPartState(partId, newElement, priorElement, state);
    if ( !this.isView && (partId === "content") ) {
      state.cursor = priorElement?.querySelector("code-mirror")?.cursor ?? null;
    }
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _syncPartState(partId, newElement, priorElement, state) {
    super._syncPartState(partId, newElement, priorElement, state);
    if ( !this.isView && (partId === "content") && Number.isFinite(state.cursor) ) {
      newElement.querySelector("code-mirror").scrollTo({ top: state.cursor });
    }
  }

  /* -------------------------------------------- */
  /*  Event Listeners & Handlers                  */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _attachFrameListeners() {
    super._attachFrameListeners();
    this.element.addEventListener("keypress", this.#onEdit.bind(this), { passive: true });
    this.element.addEventListener("paste", this.#onEdit.bind(this), { passive: true });
    this.element.addEventListener("drop", this._onDrop.bind(this));
  }

  /* -------------------------------------------- */

  /**
   * Handle dropping something onto the markdown editor.
   * @param {DragEvent} event  The triggering event.
   * @protected
   */
  _onDrop(event) {
    if ( !event.target.closest("code-mirror") ) return;
    event.preventDefault();
    const eventData = TextEditor.implementation.getDragEventData(event);
    return this._onDropContentLink(event, eventData);
  }

  /* -------------------------------------------- */

  /**
   * Handle dropping a content link onto the markdown editor.
   * @param {DragEvent} event   The originating drop event.
   * @param {object} eventData  The parsed event data.
   * @protected
   * @returns {Promise<void>}
   */
  async _onDropContentLink(event, eventData) {
    const link = await TextEditor.implementation.getContentLink(eventData, { relativeTo: this.page });
    if ( !link ) return;
    const editor = this.form.elements["text.markdown"];
    const content = editor.value;
    const pos = editor.posAtCoords({ x: event.clientX, y: event.clientY });
    editor.value = content.substring(0, pos) + link + content.substring(pos);
    this.#isDirty = true;
  }

  /* -------------------------------------------- */

  /**
   * Handle an editing event.
   * @param {Event} event  The triggering event.
   */
  #onEdit(event) {
    // When pasting to a brand-new line of a CodeMirror editor, the event target seems to be an un-parented <br> tag.
    if ( event.target.closest("code-mirror") || (event.target.tagName === "BR") ) this.#isDirty = true;
  }

  /* -------------------------------------------- */
  /*  Form Submission                             */
  /* -------------------------------------------- */

  /** @override */
  _isEditorDirty() {
    return this.#isDirty;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _prepareSubmitData(event, form, formData, updateData) {
    const submitData = super._prepareSubmitData(event, form, formData, updateData);
    // Do not persist the markdown conversion if the contents have not been edited.
    if ( !this._isEditorDirty() ) {
      delete submitData.text.markdown;
      delete submitData.text.format;
    }
    return submitData;
  }
}

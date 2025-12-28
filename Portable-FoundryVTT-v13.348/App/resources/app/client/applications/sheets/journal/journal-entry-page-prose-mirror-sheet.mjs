import TextEditor from "@client/applications/ux/text-editor.mjs";
import JournalEntryPageTextSheet from "./journal-entry-page-text-sheet.mjs";

/**
 * @import {ProseMirrorPluginsEvent} from "../../elements/prosemirror-editor.mjs";
 */

/**
 * An Application responsible for displaying a single text-type JournalEntryPage Document, and editing it with a
 * ProseMirror editor.
 * @extends JournalEntryPageTextSheet
 */
export default class JournalEntryPageProseMirrorSheet extends JournalEntryPageTextSheet {
  /** @override */
  static DEFAULT_OPTIONS = {
    window: {
      icon: "fa-solid fa-feather"
    }
  };

  /** @inheritDoc */
  static EDIT_PARTS = {
    header: super.EDIT_PARTS.header,
    content: {
      template: "templates/journal/pages/text/edit.hbs"
    },
    footer: super.EDIT_PARTS.footer
  };

  /** @override */
  static VIEW_PARTS = {
    content: {
      template: "templates/journal/pages/text/view.hbs",
      root: true
    }
  };

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @override */
  _canRender(options) {
    if ( options.resync || !this.rendered || !this.options.window.frame ) return true;
    return !this._isEditorDirty();
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContentContext(context, options) {
    if ( this.isView ) context.text.enriched = await TextEditor.implementation.enrichHTML(context.text.content, {
      relativeTo: this.page,
      secrets: this.page.isOwner
    });
  }

  /* -------------------------------------------- */
  /*  Form Submission                             */
  /* -------------------------------------------- */

  /** @override */
  _isEditorDirty() {
    return this.form.querySelector("prose-mirror")?.isDirty();
  }

  /* -------------------------------------------- */
  /*  Event Listeners & Handlers                  */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _attachFrameListeners() {
    super._attachFrameListeners();
    this.element.addEventListener("plugins", this._onConfigurePlugins.bind(this));
  }

  /* -------------------------------------------- */

  /**
   * Update the parent sheet if it is open when the server autosaves the contents of this editor.
   * @param {string} content  The updated editor contents.
   * @internal
   */
  _onAutosave(content) {
    this.page.parent.render(false);
  }

  /* -------------------------------------------- */

  /**
   * Configure plugins for the ProseMirror instance.
   * @param {ProseMirrorPluginsEvent} event
   * @protected
   */
  _onConfigurePlugins(event) {
    event.plugins.highlightDocumentMatches =
      ProseMirror.ProseMirrorHighlightMatchesPlugin.build(ProseMirror.defaultSchema);
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

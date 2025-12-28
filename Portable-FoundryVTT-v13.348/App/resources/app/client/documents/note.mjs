import BaseNote from "@common/documents/note.mjs";
import CanvasDocumentMixin from "./abstract/canvas-document.mjs";

/**
 * @import JournalEntry from "./journal-entry.mjs";
 * @import JournalEntryPage from "./journal-entry-page.mjs";
 */

/**
 * The client-side Note document which extends the common BaseNote document model.
 * @extends BaseNote
 * @mixes ClientDocumentMixin
 * @category Documents
 *
 * @see {@link foundry.documents.Scene}: The Scene document type which contains Note documents
 * @see {@link foundry.applications.sheets.NoteConfig}: The Note configuration application
 */
export default class NoteDocument extends CanvasDocumentMixin(BaseNote) {
  /** @inheritDoc */
  static async createDialog(noteData={}, createOptions={}, dialogOptions={}) {
    const parent = (createOptions.parent ??= canvas.scene);
    foundry.utils.mergeObject(dialogOptions, {
      folders: game.journal._formatFolderSelectOptions() ?? [],
      template: "templates/scene/note/create-dialog.hbs",
      position: {width: 500},
      ok: {
        callback: async event => {
          const form = event.target.closest("form");
          const fd = new foundry.applications.ux.FormDataExtended(form).object;
          if ( !fd.folder ) delete fd.folder;
          if ( !fd.name.trim() ) {
            fd.name = fd.journal
              ? foundry.documents.JournalEntry.implementation.defaultName()
              : this.implementation.defaultName({parent});
          }
          const newEntry = fd.journal ? await foundry.documents.JournalEntry.implementation.create(
            fd, {renderSheet: true}) : null;
          // Create a note for a created JournalEntry
          if ( game.journal.has(newEntry?.id) ) {
            noteData.entryId = newEntry.id;
            return this.implementation.create(noteData, createOptions);
          }
          // Create a preview Note
          else {
            noteData.entryId = canvas.scene.journal?.id ?? null;
            noteData.text = fd.name;
            return canvas.notes._createPreview(noteData, {top: event.clientY - 20, left: event.clientX + 40});
          }
        }
      },
      render: event => {
        const form = event.target.element.querySelector("form");
        if ( !form.folder ) return;
        form.folder.disabled = true;
        form.journal.addEventListener("change", () => {
          form.folder.disabled = !form.journal.checked;
          form.name.placeholder = form.journal.checked
            ? foundry.documents.JournalEntry.implementation.defaultName()
            : this.implementation.defaultName({parent});
        });
      }
    }, {overwrite: false});
    return super.createDialog(noteData, createOptions, dialogOptions);
  }

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * The associated JournalEntry which is referenced by this Note
   * @type {JournalEntry}
   */
  get entry() {
    return game.journal.get(this.entryId);
  }

  /* -------------------------------------------- */

  /**
   * The specific JournalEntryPage within the associated JournalEntry referenced by this Note.
   * @type {JournalEntryPage}
   */
  get page() {
    return this.entry?.pages.get(this.pageId);
  }

  /* -------------------------------------------- */

  /**
   * The text label used to annotate this Note
   * @type {string}
   */
  get label() {
    return this.text || this.page?.name || this.entry?.name || game?.i18n?.localize("NOTE.Unknown") || "Unknown";
  }
}

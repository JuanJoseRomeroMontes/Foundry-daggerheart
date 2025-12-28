import BaseJournalEntryCategory from "@common/documents/journal-entry-category.mjs";
import ClientDocumentMixin from "./abstract/client-document.mjs";

/**
 * The client-side JournalEntryCategory document which extends the common BaseJournalEntryCategory model.
 * @extends BaseJournalEntryCategory
 * @mixes ClientDocumentMixin
 * @category Documents
 */
export default class JournalEntryCategory extends ClientDocumentMixin(BaseJournalEntryCategory) {
  /** @inheritDoc */
  prepareDerivedData() {
    super.prepareDerivedData();
    this.name ||= game.i18n.localize("JOURNAL.UnnamedCategory");
  }
}

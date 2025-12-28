import BaseJournalEntry from "@common/documents/journal-entry.mjs";
import ClientDocumentMixin from "./abstract/client-document.mjs";

/**
 * @import Note from "@client/canvas/placeables/note.mjs";
 * @import JournalEntryCategory from "./journal-entry-category.mjs";
 */

/**
 * The client-side JournalEntry document which extends the common BaseJournalEntry model.
 * @extends BaseJournalEntry
 * @mixes ClientDocumentMixin
 * @category Documents
 *
 * @see {@link foundry.documents.collections.Journal}: The world-level collection of JournalEntry documents
 * @see {@link foundry.applications.sheets.journal.JournalEntrySheet}: The JournalEntry sheet
 *   application
 */
export default class JournalEntry extends ClientDocumentMixin(BaseJournalEntry) {

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * A boolean indicator for whether the JournalEntry is visible to the current user in the directory sidebar
   * @type {boolean}
   */
  get visible() {
    return this.testUserPermission(game.user, "OBSERVER");
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  getUserLevel(user) {
    // Upgrade to OBSERVER ownership if the journal entry is in a LIMITED compendium, as LIMITED has no special meaning
    // for journal entries in this context.
    if ( this.inCompendium && (this.collection.getUserLevel(user) === CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED) ) {
      return CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
    }
    return super.getUserLevel(user);
  }

  /* -------------------------------------------- */

  /**
   * Return a reference to the Note instance for this Journal Entry in the current Scene, if any.
   * If multiple notes are placed for this Journal Entry, only the first will be returned.
   * @type {Note|null}
   */
  get sceneNote() {
    if ( !canvas.ready ) return null;
    return canvas.notes.placeables.find(n => n.document.entryId === this.id) || null;
  }

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /**
   * Show the JournalEntry to connected players.
   * By default, the entry will only be shown to players who have permission to observe it.
   * If the parameter force is passed, the entry will be shown to all players regardless of normal permission.
   *
   * @param {boolean} [force=false]    Display the entry to all players regardless of normal permissions
   * @returns {Promise<JournalEntry>}  A Promise that resolves back to the shown entry once the request is processed
   */
  async show(force=false) {
    return foundry.documents.collections.Journal.show(this, {force});
  }

  /* -------------------------------------------- */

  /**
   * If the JournalEntry has a pinned note on the canvas, this method will animate to that note
   * The note will also be highlighted as if hovered upon by the mouse
   * @param {object} [options={}]         Options which modify the pan operation
   * @param {number} [options.scale=1.5]          The resulting zoom level
   * @param {number} [options.duration=250]       The speed of the pan animation in milliseconds
   * @returns {Promise<void>}             A Promise which resolves once the pan animation has concluded
   */
  panToNote(options={}) {
    return canvas.notes.panToNote(this.sceneNote, options);
  }

  /* -------------------------------------------- */
  /*  Event Handlers                              */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);
    if ( !canvas.ready ) return;
    if ( ["name", "ownership", "==ownership"].some(k => k in changed) ) {
      canvas.notes.placeables.filter(n => n.document.entryId === this.id).forEach(n => n.draw());
    }
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onDelete(options, userId) {
    super._onDelete(options, userId);
    if ( !canvas.ready ) return;
    for ( const n of canvas.notes.placeables ) {
      if ( n.document.entryId === this.id ) n.draw();
    }
  }

  /* -------------------------------------------- */
  /*  Helpers                                     */
  /* -------------------------------------------- */

  /**
   * A sorting comparator for JournalEntryCategory documents.
   * @param {JournalEntryCategory} a
   * @param {JournalEntryCategory} b
   * @returns {number}                An integer in the range [-1, 1].
   */
  static sortCategories(a, b) {
    return a.sort - b.sort;
  }
}

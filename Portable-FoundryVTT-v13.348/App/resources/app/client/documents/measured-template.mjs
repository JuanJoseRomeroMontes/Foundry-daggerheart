import BaseMeasuredTemplate from "@common/documents/measured-template.mjs";
import CanvasDocumentMixin from "./abstract/canvas-document.mjs";

/**
 * The client-side MeasuredTemplate document which extends the common BaseMeasuredTemplate document model.
 * @extends BaseMeasuredTemplate
 * @mixes ClientDocumentMixin
 * @category Documents
 *
 * @see {@link foundry.documents.Scene}: The Scene document type which contains MeasuredTemplate documents
 * @see {@link foundry.applications.sheets.MeasuredTemplateConfig}: The MeasuredTemplate
 *   configuration application
 */
export default class MeasuredTemplateDocument extends CanvasDocumentMixin(BaseMeasuredTemplate) {

  /* -------------------------------------------- */
  /*  Model Properties                            */
  /* -------------------------------------------- */

  /**
   * Rotation is an alias for direction
   * @returns {number}
   */
  get rotation() {
    return this.direction;
  }

  /* -------------------------------------------- */

  /**
   * Is the current User the author of this template?
   * @type {boolean}
   */
  get isAuthor() {
    return game.user === this.author;
  }
}

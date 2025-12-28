import BaseAmbientSound from "@common/documents/ambient-sound.mjs";
import CanvasDocumentMixin from "./abstract/canvas-document.mjs";

/**
 * The client-side AmbientSound document which extends the common BaseAmbientSound document model.
 * @extends BaseAmbientSound
 * @mixes ClientDocumentMixin
 * @category Documents
 *
 * @see {@link foundry.documents.Scene}: The Scene document type which contains AmbientSound documents
 * @see {@link foundry.applications.sheets.AmbientSoundConfig}: The AmbientSound configuration
 *   application
 */
export default class AmbientSoundDocument extends CanvasDocumentMixin(BaseAmbientSound) {}

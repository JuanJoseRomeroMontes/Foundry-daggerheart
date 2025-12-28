import BaseWall from "@common/documents/wall.mjs";
import CanvasDocumentMixin from "./abstract/canvas-document.mjs";

/**
 * The client-side Wall document which extends the common BaseWall document model.
 * @extends BaseWall
 * @mixes ClientDocumentMixin
 * @category Documents
 *
 * @see {@link foundry.documents.Scene}: The Scene document type which contains Wall documents
 * @see {@link foundry.applications.sheets.WallConfig}: The Wall configuration application
 */
export default class WallDocument extends CanvasDocumentMixin(BaseWall) {}

import BaseTile from "@common/documents/tile.mjs";
import CanvasDocumentMixin from "./abstract/canvas-document.mjs";

/**
 * The client-side Tile document which extends the common BaseTile document model.
 * @extends BaseTile
 * @mixes ClientDocumentMixin
 * @category Documents
 *
 * @see {@link foundry.documents.Scene}: The Scene document type which contains Tile documents
 * @see {@link foundry.applications.sheets.TileConfig}: The Tile configuration application
 */
export default class TileDocument extends CanvasDocumentMixin(BaseTile) {

  /** @inheritDoc */
  prepareDerivedData() {
    super.prepareDerivedData();
    const d = this.parent?.dimensions;
    if ( !d ) return;
    const securityBuffer = Math.max(d.size / 5, 20).toNearest(0.1);
    const maxX = d.width - securityBuffer;
    const maxY = d.height - securityBuffer;
    const minX = (this.width - securityBuffer) * -1;
    const minY = (this.height - securityBuffer) * -1;
    this.x = Math.clamp(this.x.toNearest(0.1), minX, maxX);
    this.y = Math.clamp(this.y.toNearest(0.1), minY, maxY);
  }
}

import ClientDocumentMixin from "./client-document.mjs";

/**
 * @import Document from "@common/abstract/document.mjs";
 * @import PlaceableObject from "@client/canvas/placeables/placeable-object.mjs";
 * @import PlaceablesLayer from "@client/canvas/layers/base/placeables-layer.mjs";
 */

/**
 * A specialized subclass of the ClientDocumentMixin which is used for document types that are intended to be
 * represented upon the game Canvas.
 * @category Mixins
 * @param {typeof Document} Base        The base document class mixed with client and canvas features
 */
export default function CanvasDocumentMixin(Base) {
  /**
   * A ClientDocument class with additional facilities for utilizing the {@link foundry.canvas.Canvas} API
   */
  class CanvasDocument extends ClientDocumentMixin(Base) {

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * A lazily constructed PlaceableObject instance which can represent this Document on the game canvas.
     * @type {PlaceableObject|null}
     */
    get object() {
      if ( this._object || this._destroyed ) return this._object;
      if ( !this.parent?.isView || !this.layer ) return null;
      return this._object = this.layer.createObject(this);
    }

    /**
     * @type {PlaceableObject|null}
     * @internal
     */
    _object = this._object ?? null;

    /**
     * Has this object been deliberately destroyed as part of the deletion workflow?
     * @type {boolean}
     * @internal
     */
    _destroyed = false;

    /* -------------------------------------------- */

    /**
     * A reference to the CanvasLayer which contains Document objects of this type.
     * @type {PlaceablesLayer}
     */
    get layer() {
      return canvas.getLayerByEmbeddedName(this.documentName);
    }

    /* -------------------------------------------- */

    /**
     * An indicator for whether this document is currently rendered on the game canvas.
     * @type {boolean}
     */
    get rendered() {
      return this._object && !this._object.destroyed;
    }

    /* -------------------------------------------- */
    /*  Event Handlers                              */
    /* -------------------------------------------- */

    /** @inheritDoc */
    async _preCreate(data, options, user) {
      const allowed = await super._preCreate(data, options, user);
      if ( allowed === false ) return false;
      if ( !this.schema.has("sort") || ("sort" in data) ) return;
      let sort = 0;
      for ( const document of this.collection ) sort = Math.max(sort, document.sort + 1);
      this.updateSource({sort});
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    _onCreate(data, options, userId) {
      super._onCreate(data, options, userId);
      const object = this.object;
      if ( !object ) return;
      this.layer.objects.addChild(object);
      object.draw().then(() => {
        object?._onCreate(data, options, userId);
      });
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    _onUpdate(changed, options, userId) {
      super._onUpdate(changed, options, userId);
      this._object?._onUpdate(changed, options, userId);
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    _onDelete(options, userId) {
      super._onDelete(options, userId);
      this._object?._onDelete(options, userId);

      // Remove from clipboard
      this.layer.clipboard.objects = this.layer.clipboard.objects.filter(o => o.document !== this);
    }
  }
  return CanvasDocument;
}

import {Plugin} from "prosemirror-state";
import ProseMirrorPlugin from "./plugin.mjs";
import {hasFileExtension, isBase64Data} from "../data/validators.mjs";

/**
 * @import {Slice} from "prosemirror-model";
 * @import {EditorView} from "prosemirror-view";
 */

/**
 * A class responsible for handle drag-and-drop and pasting of image content. Ensuring no base64 data is injected
 * directly into the journal content and it is instead uploaded to the user's data directory.
 * @extends {ProseMirrorPlugin}
 */
export default class ProseMirrorImagePlugin extends ProseMirrorPlugin {
  /**
   * @param {Schema} schema                    The ProseMirror schema.
   * @param {object} options                   Additional options to configure the plugin's behaviour.
   * @param {ClientDocument} options.document  A related Document to store extract base64 images for.
   */
  constructor(schema, {document}={}) {
    super(schema);

    if ( !document ) {
      throw new Error("The image drop and pasting plugin requires a reference to a related Document to function.");
    }

    /**
     * The related Document to store extracted base64 images for.
     * @type {ClientDocument}
     */
    Object.defineProperty(this, "document", {value: document, writable: false});
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  static build(schema, options={}) {
    const plugin = new ProseMirrorImagePlugin(schema, options);
    return new Plugin({
      props: {
        handleDrop: plugin._onDrop.bind(plugin),
        handlePaste: plugin._onPaste.bind(plugin)
      }
    });
  }

  /* -------------------------------------------- */

  /**
   * Handle a drop onto the editor.
   * @param {EditorView} view  The ProseMirror editor view.
   * @param {DragEvent} event  The drop event.
   * @param {Slice} slice      A slice of editor content.
   * @param {boolean} moved    Whether the slice has been moved from a different part of the editor.
   * @protected
   */
  _onDrop(view, event, slice, moved) {
    // This is a drag-drop of internal editor content which we do not need to handle specially.
    if ( moved ) return;
    const pos = view.posAtCoords({left: event.clientX, top: event.clientY});
    if ( !pos ) return; // This was somehow dropped outside the editor content.

    if ( event.dataTransfer.types.some(t => t === "text/uri-list") ) {
      const uri = event.dataTransfer.getData("text/uri-list");
      if ( !isBase64Data(uri) ) return; // This is a direct URL hotlink which we can just embed without issue.
    }

    // Handle image drops.
    if ( event.dataTransfer.files.length ) {
      this._uploadImages(view, event.dataTransfer.files, pos.pos);
      return true;
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle a paste into the editor.
   * @param {EditorView} view       The ProseMirror editor view.
   * @param {ClipboardEvent} event  The paste event.
   * @protected
   */
  _onPaste(view, event) {
    if ( event.clipboardData.files.length ) {
      this._uploadImages(view, event.clipboardData.files);
      return true;
    }
    const html = event.clipboardData.getData("text/html");
    if ( !html ) return; // We only care about handling rich content.
    const images = this._extractBase64Images(html);
    if ( !images.length ) return; // If there were no base64 images, defer to the default paste handler.
    this._replaceBase64Images(view, html, images);
    return true;
  }

  /* -------------------------------------------- */

  /**
   * Upload any image files encountered in the drop.
   * @param {EditorView} view  The ProseMirror editor view.
   * @param {FileList} files   The files to upload.
   * @param {number} [pos]     The position in the document to insert at. If not provided, the current selection will be
   *                           replaced instead.
   * @protected
   */
  async _uploadImages(view, files, pos) {
    const image = this.schema.nodes.image;
    const imageExtensions = Object.keys(CONST.IMAGE_FILE_EXTENSIONS);
    for ( const file of files ) {
      if ( !hasFileExtension(file.name, imageExtensions) ) continue;
      const src = await foundry.applications.ux.TextEditor.implementation._uploadImage(this.document.uuid, file);
      if ( !src ) continue;
      const node = image.create({src});
      if ( pos === undefined ) {
        pos = view.state.selection.from;
        view.dispatch(view.state.tr.replaceSelectionWith(node));
      } else view.dispatch(view.state.tr.insert(pos, node));
      pos += 2; // Advance the position past the just-inserted image so the next image is inserted below it.
    }
  }

  /* -------------------------------------------- */

  /**
   * Capture any base64-encoded images embedded in the rich text paste and upload them.
   * @param {EditorView} view                                      The ProseMirror editor view.
   * @param {string} html                                          The HTML data as a string.
   * @param {[full: string, mime: string, data: string][]} images  An array of extracted base64 image data.
   * @protected
   */
  async _replaceBase64Images(view, html, images) {
    const byMimetype = Object.fromEntries(Object.entries(CONST.IMAGE_FILE_EXTENSIONS).map(([k, v]) => [v, k]));
    let cleaned = html;
    for ( const [full, mime, data] of images ) {
      const file = this.constructor.base64ToFile(data, `pasted-image.${byMimetype[mime]}`, mime);
      const path = await foundry.applications.ux.TextEditor.implementation._uploadImage(this.document.uuid, file) ?? "";
      cleaned = cleaned.replace(full, path);
    }
    const doc = foundry.prosemirror.dom.parseString(cleaned);
    view.dispatch(view.state.tr.replaceSelectionWith(doc));
  }

  /* -------------------------------------------- */

  /**
   * Detect base64 image data embedded in an HTML string and extract it.
   * @param {string} html  The HTML data as a string.
   * @returns {[full: string, mime: string, data: string][]}
   * @protected
   */
  _extractBase64Images(html) {
    const images = Object.values(CONST.IMAGE_FILE_EXTENSIONS);
    const rgx = new RegExp(`data:(${images.join("|")});base64,([^"']+)`, "g");
    return [...html.matchAll(rgx)];
  }

  /* -------------------------------------------- */

  /**
   * Convert a base64 string into a File object.
   * @param {string} data      Base64 encoded data.
   * @param {string} filename  The filename.
   * @param {string} mimetype  The file's mimetype.
   * @returns {File}
   */
  static base64ToFile(data, filename, mimetype) {
    const bin = atob(data);
    let n = bin.length;
    const buf = new ArrayBuffer(n);
    const bytes = new Uint8Array(buf);
    while ( n-- ) bytes[n] = bin.charCodeAt(n);
    return new File([bytes], filename, {type: mimetype});
  }
}

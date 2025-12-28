import {mergeObject} from "../../utils/helpers.mjs";
import ImageNode from "./image-node.mjs";
import LinkMark from "./link-mark.mjs";
import SchemaDefinition from "./schema-definition.mjs";

/**
 * A class responsible for encapsulating logic around image-link nodes in the ProseMirror schema.
 * @extends {SchemaDefinition}
 */
export default class ImageLinkNode extends SchemaDefinition {
  /** @override */
  static tag = "a";

  /* -------------------------------------------- */

  /** @override */
  static get attrs() {
    return mergeObject(ImageNode.attrs, LinkMark.attrs);
  }

  /* -------------------------------------------- */

  /** @override */
  static getAttrs(el) {
    if ( (el.children.length !== 1) || (el.children[0].tagName !== "IMG") ) return false;
    const attrs = ImageNode.getAttrs(el.children[0]);
    attrs.href = el.href;
    attrs.title = el.title;
    return attrs;
  }

  /* -------------------------------------------- */

  /** @override */
  static toDOM(node) {
    const spec = LinkMark.toDOM(node);
    spec.push(ImageNode.toDOM(node));
    return spec;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  static make() {
    return mergeObject(super.make(), {
      group: "block",
      draggable: true,
      managed: { styles: ["float"], classes: ["centered"] }
    });
  }

  /* -------------------------------------------- */

  /**
   * Handle clicking on image links while editing.
   * @param {EditorView} view     The ProseMirror editor view.
   * @param {number} pos          The position in the ProseMirror document that the click occurred at.
   * @param {PointerEvent} event  The click event.
   * @param {Node} node           The Node instance.
   */
  static onClick(view, pos, event, node) {
    if ( (event.ctrlKey || event.metaKey) && node.attrs.href ) window.open(node.attrs.href, "_blank");
    // For some reason, calling event.preventDefault in this (mouseup) handler is not enough to cancel the default click
    // behaviour. It seems to be related to the outer anchor being set to contenteditable="false" by ProseMirror.
    // This workaround seems to prevent the click.
    const parent = event.target.parentElement;
    if ( (parent.tagName === "A") && !parent.isContentEditable ) parent.contentEditable = "true";
    return true;
  }
}

import SchemaDefinition from "./schema-definition.mjs";
import {mergeObject} from "../../utils/helpers.mjs";

/**
 * A class responsible for encapsulating logic around link marks in the ProseMirror schema.
 * @extends {SchemaDefinition}
 */
export default class LinkMark extends SchemaDefinition {
  /** @override */
  static tag = "a";

  /* -------------------------------------------- */

  /** @override */
  static get attrs() {
    return {
      href: { default: null },
      title: { default: null }
    }
  }

  /* -------------------------------------------- */

  /** @override */
  static getAttrs(el) {
    if ( (el.children.length === 1) && (el.children[0]?.tagName === "IMG") ) return false;
    return { href: el.href, title: el.title };
  }

  /* -------------------------------------------- */

  /** @override */
  static toDOM(node) {
    const { href, title } = node.attrs;
    const attrs = {};
    if ( href ) attrs.href = href;
    if ( title ) attrs.title = title;
    return ["a", attrs];
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  static make() {
    return mergeObject(super.make(), {
      inclusive: false
    });
  }

  /* -------------------------------------------- */

  /**
   * Handle clicks on link marks while editing.
   * @param {EditorView} view     The ProseMirror editor view.
   * @param {number} pos          The position in the ProseMirror document that the click occurred at.
   * @param {PointerEvent} event  The click event.
   * @param {Mark} mark           The Mark instance.
   * @returns {boolean|void}      Returns true to indicate the click was handled here and should not be propagated to
   *                              other plugins.
   */
  static onClick(view, pos, event, mark) {
    if ( (event.ctrlKey || event.metaKey) && mark.attrs.href ) window.open(mark.attrs.href, "_blank");
    return true;
  }
}

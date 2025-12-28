import SchemaDefinition from "./schema-definition.mjs";
import {mergeObject} from "../../utils/helpers.mjs";

/**
 * A class responsible for encapsulating logic around image nodes in the ProseMirror schema.
 * @extends {SchemaDefinition}
 */
export default class ImageNode extends SchemaDefinition {
  /** @override */
  static tag = "img[src]";

  /* -------------------------------------------- */

  /** @override */
  static get attrs() {
    return {
      src: {},
      alt: {default: null},
      title: {default: null},
      width: {default: ""},
      height: {default: ""},
      alignment: {default: "", formatting: true}
    };
  }

  /* -------------------------------------------- */

  /** @override */
  static getAttrs(el) {
    const attrs = {
      src: el.getAttribute("src"),
      title: el.title,
      alt: el.alt
    };
    if ( el.classList.contains("centered") ) attrs.alignment = "center";
    else if ( el.style.float ) attrs.alignment = el.style.float;
    if ( el.hasAttribute("width") ) attrs.width = el.width;
    if ( el.hasAttribute("height") ) attrs.height = el.height;
    return attrs;
  }

  /* -------------------------------------------- */

  /** @override */
  static toDOM(node) {
    const {src, alt, title, width, height, alignment} = node.attrs;
    const attrs = {src};
    if ( alignment === "center" ) attrs.class = "centered";
    else if ( alignment ) attrs.style = `float: ${alignment};`;
    if ( alt ) attrs.alt = alt;
    if ( title ) attrs.title = title;
    if ( width ) attrs.width = width;
    if ( height ) attrs.height = height;
    return ["img", attrs];
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  static make() {
    return mergeObject(super.make(), {
      managed: {styles: ["float"], classes: ["centered"]},
      group: "block",
      draggable: true
    });
  }
}

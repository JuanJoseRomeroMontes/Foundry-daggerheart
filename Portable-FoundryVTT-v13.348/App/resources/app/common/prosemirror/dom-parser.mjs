import {DOMParser as BaseDOMParser} from "prosemirror-model";

export default class DOMParser extends BaseDOMParser {
  /** @inheritdoc */
  parse(dom, options) {
    this.#unwrapImages(dom);
    return super.parse(dom, options);
  }

  /* -------------------------------------------- */

  /**
   * Unwrap any image tags that may have been wrapped in <p></p> tags in earlier iterations of the schema.
   * @param {HTMLElement} dom  The root HTML element to parse.
   */
  #unwrapImages(dom) {
    dom.querySelectorAll("img").forEach(img => {
      const paragraph = img.parentElement;
      if ( paragraph?.tagName !== "P" ) return;
      const parent = paragraph.parentElement || dom;
      parent.insertBefore(img, paragraph);
      // If the paragraph element was purely holding the image element and is now empty, we can remove it.
      if ( !paragraph.childNodes.length ) paragraph.remove();
    });
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  static fromSchema(schema) {
    if ( schema.cached.domParser ) return schema.cached.domParser;
    return schema.cached.domParser = new this(schema, this.schemaRules(schema));
  }
}

/**
 * An abstract interface for a ProseMirror schema definition.
 * @abstract
 */
export default class SchemaDefinition {
  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * The HTML tag selector this node is associated with.
   * @type {string}
   */
  static tag = "";

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /**
   * Schema attributes.
   * @returns {Record<string, AttributeSpec>}
   * @abstract
   */
  static get attrs() {
    throw new Error("SchemaDefinition subclasses must implement the attrs getter.");
  }

  /* -------------------------------------------- */

  /**
   * Check if an HTML element is appropriate to represent as this node, and if so, extract its schema attributes.
   * @param {HTMLElement} el    The HTML element.
   * @returns {object|boolean}  Returns false if the HTML element is not appropriate for this schema node, otherwise
   *                            returns its attributes.
   * @abstract
   */
  static getAttrs(el) {
    throw new Error("SchemaDefinition subclasses must implement the getAttrs method.");
  }

  /* -------------------------------------------- */

  /**
   * Convert a ProseMirror Node back into an HTML element.
   * @param {Node} node  The ProseMirror node.
   * @returns {[string, any]}
   * @abstract
   */
  static toDOM(node) {
    throw new Error("SchemaDefinition subclasses must implement the toDOM method.");
  }

  /* -------------------------------------------- */

  /**
   * Create the ProseMirror schema specification.
   * @returns {NodeSpec|MarkSpec}
   * @abstract
   */
  static make() {
    return {
      attrs: this.attrs,
      parseDOM: [{tag: this.tag, getAttrs: this.getAttrs.bind(this)}],
      toDOM: this.toDOM.bind(this)
    };
  }
}

import {DOMSerializer} from "prosemirror-model";
import {getType, isEmpty} from "../utils/helpers.mjs";

/**
 * @import {ProseMirrorMarkOutput, ProseMirrorNodeOutput} from "./_types.mjs";
 */

/**
 * A class responsible for serializing a ProseMirror document into a string of HTML.
 */
export default class StringSerializer {
  /**
   * @param {Record<string, ProseMirrorNodeOutput>} nodes  The node output specs.
   * @param {Record<string, ProseMirrorMarkOutput>} marks  The mark output specs.
   */
  constructor(nodes, marks) {
    this.#nodes = nodes;
    this.#marks = marks;
  }

  /* -------------------------------------------- */

  /**
   * The node output specs.
   * @type {Record<string, ProseMirrorNodeOutput>}
   */
  #nodes;

  /* -------------------------------------------- */

  /**
   * The mark output specs.
   * @type {Record<string, ProseMirrorMarkOutput>}
   */
  #marks;

  /* -------------------------------------------- */

  /**
   * Build a serializer for the given schema.
   * @param {Schema} schema  The ProseMirror schema.
   * @returns {StringSerializer}
   */
  static fromSchema(schema) {
    if ( schema.cached.stringSerializer ) return schema.cached.stringSerializer;
    return schema.cached.stringSerializer =
      new StringSerializer(DOMSerializer.nodesFromSchema(schema), DOMSerializer.marksFromSchema(schema));
  }

  /* -------------------------------------------- */

  /**
   * Create a StringNode from a ProseMirror DOMOutputSpec.
   * @param {DOMOutputSpec} spec                            The specification.
   * @param {boolean} inline                                Whether this is a block or inline node.
   * @returns {{outer: StringNode, [content]: StringNode}}  An object describing the outer node, and a reference to the
   *                                                        child node where content should be appended, if applicable.
   * @protected
   */
  _specToStringNode(spec, inline) {
    if ( typeof spec === "string" ) {
      // This is raw text content.
      const node = new StringNode();
      node.appendChild(spec);
      return {outer: node};
    }

    // Our schema only uses the array type of DOMOutputSpec so we don't need to support the other types here.
    // Array specs take the form of [tagName, ...tail], where the tail elements may be an object of attributes, another
    // array representing a child spec, or the value 0 (read 'hole').
    let attrs = {};
    let [tagName, ...tail] = spec;
    if ( getType(tail[0]) === "Object" ) attrs = tail.shift();
    const outer = new StringNode(tagName, attrs, inline);
    let content;

    for ( const innerSpec of tail ) {
      if ( innerSpec === 0 ) {
        if ( tail.length > 1 ) throw new RangeError("Content hole must be the only child of its parent node.");
        // The outer node and the node to append content to are the same node. The vast majority of our output specs
        // are like this.
        return {outer, content: outer};
      }

      // Otherwise, recursively build any inner specifications and update our content reference to point to wherever the
      // hole is found.
      const {outer: inner, content: innerContent} = this._specToStringNode(innerSpec, true);
      outer.appendChild(inner);
      if ( innerContent ) {
        if ( content ) throw new RangeError("Multiple content holes.");
        content = innerContent;
      }
    }
    return {outer, content};
  }

  /* -------------------------------------------- */

  /**
   * Serialize a ProseMirror fragment into an HTML string.
   * @param {Fragment} fragment    The ProseMirror fragment, a collection of ProseMirror nodes.
   * @param {StringNode} [target]  The target to append to. Not required for the top-level invocation.
   * @returns {StringNode}         A DOM tree representation as a StringNode.
   */
  serializeFragment(fragment, target) {
    target = target ?? new StringNode();
    const stack = [];
    let parent = target;
    fragment.forEach(node => {
      /**
       * Handling marks is a little complicated as ProseMirror stores them in a 'flat' structure, rather than a
       * nested structure that is more natural for HTML. For example, the following HTML:
       *   <em>Almost before <strong>we knew it</strong>, we had left the ground.</em>
       * is represented in ProseMirror's internal structure as:
       *   {marks: [ITALIC], content: "Almost before "}, {marks: [ITALIC, BOLD], content: "we knew it"},
       *   {marks: [ITALIC], content: ", we had left the ground"}
       * In order to translate from the latter back into the former, we maintain a stack. When we see a new mark, we
       * push it onto the stack so that content is appended to that mark. When the mark stops appearing in subsequent
       * nodes, we pop off the stack until we find a mark that does exist, and start appending to that one again.
       *
       * The order that marks appear in the node.marks array is guaranteed to be the order that they were declared in
       * the schema.
       */
      if ( stack.length || node.marks.length ) {
        // Walk along the stack to find a mark that is not already pending (i.e. we haven't seen it yet).
        let pos = 0;
        while ( (pos < stack.length) && (pos < node.marks.length) ) {
          const next = node.marks[pos];
          // If the mark does not span multiple nodes, we can serialize it now rather than waiting.
          if ( !next.eq(stack[pos].mark) || (next.type.spec.spanning === false) ) break;
          pos++;
        }

        // Pop off the stack to reach the position of our mark.
        while ( pos < stack.length ) parent = stack.pop().parent;

        // Add the marks from this point.
        for ( let i = pos; i < node.marks.length; i++ ) {
          const mark = node.marks[i];
          const {outer, content} = this._serializeMark(mark, node.isInline);
          stack.push({mark, parent});
          parent.appendChild(outer);
          parent = content ?? outer;
        }
      }

      // Finally append the content to whichever parent node we've arrived at.
      parent.appendChild(this._toStringNode(node));
    });
    return target;
  }

  /* -------------------------------------------- */

  /**
   * Convert a ProseMirror node representation to a StringNode.
   * @param {Node} node  The ProseMirror node.
   * @returns {StringNode}
   * @protected
   */
  _toStringNode(node) {
    const {outer, content} = this._specToStringNode(this.#nodes[node.type.name](node), node.type.inlineContent);
    if ( content ) {
      if ( node.isLeaf ) throw new RangeError("Content hole not allowed in a leaf node spec.");
      this.serializeFragment(node.content, content);
    }
    return outer;
  }

  /* -------------------------------------------- */

  /**
   * Convert a ProseMirror mark representation to a StringNode.
   * @param {Mark} mark       The ProseMirror mark.
   * @param {boolean} inline  Does the mark appear in an inline context?
   * @returns {{outer: StringNode, [content]: StringNode}}
   * @protected
   */
  _serializeMark(mark, inline) {
    return this._specToStringNode(this.#marks[mark.type.name](mark, inline), true);
  }
}

/**
 * A class that behaves like a lightweight DOM node, allowing children to be appended. Serializes to an HTML string.
 */
class StringNode {
  /**
   * @param {string} [tag]            The tag name. If none is provided, this node's children will not be wrapped in an
   *                                  outer tag.
   * @param {Record<string, string>} [attrs]  The tag attributes.
   * @param {boolean} [inline=false]  Whether the node appears inline or as a block.
   */
  constructor(tag, attrs={}, inline=true) {
    /**
     * The tag name.
     * @type {string}
     */
    Object.defineProperty(this, "tag", {value: tag, writable: false});

    /**
     * The tag attributes.
     * @type {Record<string, string>}
     */
    Object.defineProperty(this, "attrs", {value: attrs, writable: false});

    this.#inline = inline;
  }

  /* -------------------------------------------- */

  /**
   * A list of HTML void elements that do not have a closing tag.
   * @type {Set<string>}
   */
  static #VOID = new Set([
    "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"
  ]);

  /* -------------------------------------------- */

  /**
   * A list of children. Either other StringNodes, or plain strings.
   * @type {Array<StringNode|string>}
   */
  #children = [];

  /* -------------------------------------------- */

  /**
   * @ignore
   */
  #inline;

  /**
   * Whether the node appears inline or as a block.
   */
  get inline() {
    if ( !this.tag || StringNode.#VOID.has(this.tag) || !this.#children.length ) return true;
    return this.#inline;
  }

  /* -------------------------------------------- */

  /**
   * Append a child to this string node.
   * @param {StringNode|string} child  The child node or string.
   * @throws If attempting to append a child to a void element.
   */
  appendChild(child) {
    if ( StringNode.#VOID.has(this.tag) ) throw new Error("Void elements cannot contain children.");
    this.#children.push(child);
  }

  /* -------------------------------------------- */

  /**
   * Serialize the StringNode structure into a single string.
   * @param {string|number} spaces  The number of spaces to use for indentation (maximum 10). If this value is a string,
   *                                that string is used as indentation instead (or the first 10 characters if it is
   *                                longer).
   */
  toString(spaces=0, {_depth=0, _inlineParent=false}={}) {
    let indent = "";
    const isRoot = _depth < 1;
    if ( !_inlineParent ) {
      if ( typeof spaces === "number" ) indent = " ".repeat(Math.min(10, spaces));
      else if ( typeof spaces === "string" ) indent = spaces.substring(0, 10);
      indent = indent.repeat(Math.max(0, _depth - 1));
    }
    const attrs = isEmpty(this.attrs) ? "" : " " + Object.entries(this.attrs).map(([k, v]) => `${k}="${foundry.utils.escapeHTML(v)}"`).join(" ");
    const open = this.tag ? `${indent}<${this.tag}${attrs}>` : "";
    if ( StringNode.#VOID.has(this.tag) ) return open;
    const close = this.tag ? `${this.inline && !isRoot ? "" : indent}</${this.tag}>` : "";
    const children = this.#children.map(c => {
      let content = c.toString(spaces, {_depth: _depth + 1, _inlineParent: this.inline});
      if ( !isRoot && !this.tag ) content = StringNode.#escapeHTML(content);
      return content;
    });
    const lineBreak = (this.inline && !isRoot) || !spaces ? "" : "\n";
    return [open, ...children, close].filterJoin(lineBreak);
  }

  /* -------------------------------------------- */

  /**
   * Escape HTML tags within string content.
   * @param {string} content  The string content.
   * @returns {string}
   */
  static #escapeHTML(content) {
    return content.replace(/[<>]/g, char => {
      switch ( char ) {
        case "<": return "&lt;";
        case ">": return "&gt;";
      }
      return char;
    });
  }
}

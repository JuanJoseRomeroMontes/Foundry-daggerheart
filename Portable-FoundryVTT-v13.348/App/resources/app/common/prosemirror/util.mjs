import {schema as defaultSchema} from "./schema.mjs";
import DOMParser from "./dom-parser.mjs";
import StringSerializer from "./string-serializer.mjs";
import {Slice} from "prosemirror-model";

/**
 * @import {ProseMirrorSliceTransformer} from "./_types.mjs";
 */

/**
 * Use the DOM and ProseMirror's DOMParser to construct a ProseMirror document state from an HTML string. This cannot be
 * used server-side.
 * @param {string} htmlString  A string of HTML.
 * @param {Schema} [schema]    The ProseMirror schema to use instead of the default one.
 * @returns {Node}             The document node.
 */
export function parseHTMLString(htmlString, schema) {
  const target = document.createElement("template");
  target.innerHTML = htmlString;
  return DOMParser.fromSchema(schema ?? defaultSchema).parse(target.content);
}

/**
 * Use the StringSerializer to convert a ProseMirror document into an HTML string. This can be used server-side.
 * @param {Node} doc                        The ProseMirror document.
 * @param {object} [options]                Additional options to configure serialization behavior.
 * @param {Schema} [options.schema]         The ProseMirror schema to use instead of the default one.
 * @param {string|number} [options.spaces]  The number of spaces to use for indentation. See {@link StringNode#toString}
 *                                          for details.
 * @returns {string}
 */
export function serializeHTMLString(doc, {schema, spaces}={}) {
  schema = schema ?? defaultSchema;
  // If the only content is an empty <p></p> tag, return an empty string.
  if ( (doc.size < 3) && (doc.content[0].type === schema.nodes.paragraph) ) return "";
  return StringSerializer.fromSchema(schema).serializeFragment(doc.content).toString(spaces);
}

/**
 * Apply a transformation to some nodes in a slice, and return the new slice.
 * @param {Slice} slice           The slice to transform.
 * @param {ProseMirrorSliceTransformer} transformer  The transformation function.
 * @returns {Slice}               Either the original slice if no changes were made, or the newly-transformed slice.
 */
export function transformSlice(slice, transformer) {
  const nodeTree = new Map();
  slice.content.nodesBetween(0, slice.content.size, (node, start, parent, index) => {
    nodeTree.set(node, { parent, index });
  });
  let newSlice;
  const replaceNode = (node, { parent, index }) => {
    // If there is a parent, make the replacement, then recurse up the tree to the root, creating new nodes as we go.
    if ( parent ) {
      const newContent = parent.content.replaceChild(index, node);
      const newParent = parent.copy(newContent);
      replaceNode(newParent, nodeTree.get(parent));
      return;
    }

    // Otherwise, handle replacing the root slice's content.
    const targetSlice = newSlice ?? slice;
    const fragment = targetSlice.content;
    const newFragment = fragment.replaceChild(index, node);
    newSlice = new Slice(newFragment, targetSlice.openStart, targetSlice.openEnd);
  }
  for ( const [node, treeInfo] of nodeTree.entries() ) {
    const newNode = transformer(node);
    if ( newNode ) replaceNode(newNode, treeInfo);
  }
  return newSlice ?? slice;
}

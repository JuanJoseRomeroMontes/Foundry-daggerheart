import SchemaDefinition from "./schema-definition.mjs";
import {mergeObject, randomID} from "../../utils/helpers.mjs";

/**
 * A class responsible for encapsulating logic around secret nodes in the ProseMirror schema.
 * @extends {SchemaDefinition}
 */
export default class SecretNode extends SchemaDefinition {
  /** @override */
  static tag = "section";

  /* -------------------------------------------- */

  /** @override */
  static get attrs() {
    return {
      revealed: { default: false },
      id: {}
    };
  }

  /* -------------------------------------------- */

  /** @override */
  static getAttrs(el) {
    if ( !el.classList.contains("secret") ) return false;
    return {
      revealed: el.classList.contains("revealed"),
      id: el.id || `secret-${randomID()}`
    };
  }

  /* -------------------------------------------- */

  /** @override */
  static toDOM(node) {
    const attrs = {
      id: node.attrs.id,
      class: `secret${node.attrs.revealed ? " revealed" : ""}`
    };
    return ["section", attrs, 0];
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  static make() {
    return mergeObject(super.make(), {
      content: "block+",
      group: "block",
      defining: true,
      managed: { attributes: ["id"], classes: ["revealed"] }
    });
  }

  /* -------------------------------------------- */

  /**
   * Handle splitting a secret block in two, making sure the new block gets a unique ID.
   * @param {EditorState} state                   The ProseMirror editor state.
   * @param {(tr: Transaction) => void} dispatch  The editor dispatch function.
   */
  static split(state, dispatch) {
    const secret = state.schema.nodes.secret;
    const { $cursor } = state.selection;
    // Check we are actually on a blank line and not splitting text content.
    if ( !$cursor || $cursor.parent.content.size ) return false;
    // Check that we are actually in a secret block.
    if ( $cursor.node(-1).type !== secret ) return false;
    // Check that the block continues past the cursor.
    if ( $cursor.after() === $cursor.end(-1) ) return false;
    const before = $cursor.before(); // The previous line.
    // Ensure a new ID assigned to the new secret block.
    dispatch(state.tr.split(before, 1, [{type: secret, attrs: {id: `secret-${randomID()}`}}]));
    return true;
  }
}

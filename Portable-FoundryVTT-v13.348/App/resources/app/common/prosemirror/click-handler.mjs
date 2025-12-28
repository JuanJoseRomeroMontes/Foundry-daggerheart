import ProseMirrorPlugin from "./plugin.mjs";
import {Plugin} from "prosemirror-state";

/**
 * A class responsible for managing click events inside a ProseMirror editor.
 * @extends {ProseMirrorPlugin}
 */
export default class ProseMirrorClickHandler extends ProseMirrorPlugin {
  /** @override */
  static build(schema, options={}) {
    const plugin = new ProseMirrorClickHandler(schema);
    return new Plugin({
      props: {
        handleClickOn: plugin._onClick.bind(plugin)
      }
    });
  }

  /* -------------------------------------------- */

  /**
   * Handle a click on the editor.
   * @param {EditorView} view     The ProseMirror editor view.
   * @param {number} pos          The position in the ProseMirror document that the click occurred at.
   * @param {Node} node           The current ProseMirror Node that the click has bubbled to.
   * @param {number} nodePos      The position of the click within this Node.
   * @param {PointerEvent} event  The click event.
   * @param {boolean} direct      Whether this Node is the one that was directly clicked on.
   * @returns {boolean|void}      A return value of true indicates the event has been handled, it will not propagate to
   *                              other plugins, and ProseMirror will call preventDefault on it.
   * @protected
   */
  _onClick(view, pos, node, nodePos, event, direct) {
    // If this is the inner-most click bubble, check marks for onClick handlers.
    if ( direct ) {
      const $pos = view.state.doc.resolve(pos);
      for ( const mark of $pos.marks() ) {
        if ( mark.type.onClick?.(view, pos, event, mark) === true ) return true;
      }
    }

    // Check the current Node for onClick handlers.
    return node.type.onClick?.(view, pos, event, node);
  }
}

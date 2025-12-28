import ProseMirrorPlugin from "./plugin.mjs";
import { Plugin } from "prosemirror-state";
import { randomID } from "../utils/helpers.mjs";
import { transformSlice } from "./util.mjs";

/**
 * A class responsible for applying transformations to content pasted inside the editor.
 */
export default class ProseMirrorPasteTransformer extends ProseMirrorPlugin {
  /** @override */
  static build(schema, options={}) {
    const plugin = new ProseMirrorPasteTransformer(schema);
    return new Plugin({
      props: {
        transformPasted: plugin.#onPaste.bind(plugin)
      }
    });
  }

  /* -------------------------------------------- */

  /**
   * Transform content before it is injected into the ProseMirror document.
   * @param {Slice} slice      The content slice.
   * @param {EditorView} view  The ProseMirror editor view.
   * @returns {Slice}          The transformed content.
   */
  #onPaste(slice, view) {
    // Give pasted secret blocks new IDs.
    const secret = view.state.schema.nodes.secret;
    return transformSlice(slice, node => {
      if ( node.type === secret ) {
        return secret.create({ ...node.attrs, id: `secret-${randomID()}` }, node.content, node.marks);
      }
    });
  }
}

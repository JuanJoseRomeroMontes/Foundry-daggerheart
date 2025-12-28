import {EditorView} from "codemirror";

/**
 * A CodeMirror EditorView that doesn't mount styles
 * @ignore
 */
export default class EditorViewFVTT extends EditorView {
  /** @override */
  mountStyles() {}
}

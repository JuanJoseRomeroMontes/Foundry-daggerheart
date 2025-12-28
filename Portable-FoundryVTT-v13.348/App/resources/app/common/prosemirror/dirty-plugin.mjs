import ProseMirrorPlugin from "./plugin.mjs";
import {Plugin} from "prosemirror-state";

/**
 * A simple plugin that records the dirty state of the editor.
 * @extends {ProseMirrorPlugin}
 */
export default class ProseMirrorDirtyPlugin extends ProseMirrorPlugin {
  /** @inheritdoc */
  static build(schema, options={}) {
    return new Plugin({
      state: {
        init() {
          return false;
        },
        apply() {
          return true; // If any transaction is applied to the state, we mark the editor as dirty.
        }
      }
    });
  }
}

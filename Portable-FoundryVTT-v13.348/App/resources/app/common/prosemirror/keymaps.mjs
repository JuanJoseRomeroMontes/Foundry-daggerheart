import {keymap} from "prosemirror-keymap";
import {redo, undo} from "prosemirror-history";
import {undoInputRule} from "prosemirror-inputrules";
import {
  chainCommands,
  exitCode,
  joinDown,
  joinUp,
  lift,
  selectParentNode,
  setBlockType,
  toggleMark
} from "prosemirror-commands";
import {liftListItem, sinkListItem, wrapInList} from "prosemirror-schema-list";
import ProseMirrorPlugin from "./plugin.mjs";

/**
 * @import {ProseMirrorCommand} from "./_types.mjs";
 */

/**
 * A class responsible for building the keyboard commands for the ProseMirror editor.
 * @extends {ProseMirrorPlugin}
 */
export default class ProseMirrorKeyMaps extends ProseMirrorPlugin {
  /**
   * @param {Schema} schema              The ProseMirror schema to build keymaps for.
   * @param {object} [options]           Additional options to configure the plugin's behaviour.
   * @param {Function} [options.onSave]  A function to call when Ctrl+S is pressed.
   */
  constructor(schema, {onSave}={}) {
    super(schema);

    /**
     * A function to call when Ctrl+S is pressed.
     * @type {Function}
     */
    Object.defineProperty(this, "onSave", {value: onSave, writable: false});
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  static build(schema, options={}) {
    const keymaps = new this(schema, options);
    return keymap(keymaps.buildMapping());
  }

  /* -------------------------------------------- */

  /**
   * Build keyboard commands for nodes and marks present in the schema.
   * @returns {Record<string, ProseMirrorCommand>}  An object of keyboard shortcuts to editor functions.
   */
  buildMapping() {
    // TODO: Figure out how to integrate this with our keybindings system.
    const mapping = {};

    // Undo, Redo, Backspace.
    mapping["Mod-z"] = undo;
    mapping["Shift-Mod-z"] = redo;
    mapping["Backspace"] = undoInputRule;

    // ProseMirror-specific block operations.
    mapping["Alt-ArrowUp"] = joinUp;
    mapping["Alt-ArrowDown"] = joinDown;
    mapping["Mod-BracketLeft"] = lift;
    mapping["Escape"] = selectParentNode;

    // Bold.
    if ( "strong" in this.schema.marks ) {
      mapping["Mod-b"] = toggleMark(this.schema.marks.strong);
      mapping["Mod-B"] = toggleMark(this.schema.marks.strong);
    }

    // Italic.
    if ( "em" in this.schema.marks ) {
      mapping["Mod-i"] = toggleMark(this.schema.marks.em);
      mapping["Mod-I"] = toggleMark(this.schema.marks.em);
    }

    // Underline.
    if ( "underline" in this.schema.marks ) {
      mapping["Mod-u"] = toggleMark(this.schema.marks.underline);
      mapping["Mod-U"] = toggleMark(this.schema.marks.underline);
    }

    // Inline code.
    if ( "code" in this.schema.marks ) mapping["Mod-`"] = toggleMark(this.schema.marks.code);

    // Bulleted list.
    if ( "bullet_list" in this.schema.nodes ) mapping["Shift-Mod-8"] = wrapInList(this.schema.nodes.bullet_list);

    // Numbered list.
    if ( "ordered_list" in this.schema.nodes ) mapping["Shift-Mod-9"] = wrapInList(this.schema.nodes.ordered_list);

    // Blockquotes.
    if ( "blockquote" in this.schema.nodes ) mapping["Mod->"] = wrapInList(this.schema.nodes.blockquote);

    // Line breaks.
    if ( "hard_break" in this.schema.nodes ) this.#lineBreakMapping(mapping);

    // Block splitting.
    this.#newLineMapping(mapping);

    // List items.
    if ( "list_item" in this.schema.nodes ) {
      const li = this.schema.nodes.list_item;
      mapping["Shift-Tab"] = liftListItem(li);
      mapping["Tab"] = sinkListItem(li);
    }

    // Paragraphs.
    if ( "paragraph" in this.schema.nodes ) mapping["Shift-Mod-0"] = setBlockType(this.schema.nodes.paragraph);

    // Code blocks.
    if ( "code_block" in this.schema.nodes ) mapping["Shift-Mod-\\"] = setBlockType(this.schema.nodes.code_block);

    // Headings.
    if ( "heading" in this.schema.nodes ) this.#headingsMapping(mapping, 6);

    // Horizontal rules.
    if ( "horizontal_rule" in this.schema.nodes ) this.#horizontalRuleMapping(mapping);

    // Saving.
    if ( this.onSave ) this.#addSaveMapping(mapping);

    return mapping;
  }

  /* -------------------------------------------- */

  /**
   * Implement keyboard commands for heading levels.
   * @param {Record<string, ProseMirrorCommand>} mapping  The keyboard mapping.
   * @param {number} maxLevel                     The maximum level of headings.
   */
  #headingsMapping(mapping, maxLevel) {
    const h = this.schema.nodes.heading;
    Array.fromRange(maxLevel, 1).forEach(level => mapping[`Shift-Mod-${level}`] = setBlockType(h, {level}));
  }

  /* -------------------------------------------- */

  /**
   * Implement keyboard commands for horizontal rules.
   * @param {Record<string, ProseMirrorCommand>} mapping  The keyboard mapping.
   */
  #horizontalRuleMapping(mapping) {
    const hr = this.schema.nodes.horizontal_rule;
    mapping["Mod-_"] = (state, dispatch) => {
      dispatch(state.tr.replaceSelectionWith(hr.create()).scrollIntoView());
      return true;
    };
  }

  /* -------------------------------------------- */

  /**
   * Implement line-break keyboard commands.
   * @param {Record<string, ProseMirrorCommand>} mapping  The keyboard mapping.
   */
  #lineBreakMapping(mapping) {
    const br = this.schema.nodes.hard_break;

    // Exit a code block if we're in one, then create a line-break.
    const cmd = chainCommands(exitCode, (state, dispatch) => {
      dispatch(state.tr.replaceSelectionWith(br.create()).scrollIntoView());
      return true;
    });

    mapping["Mod-Enter"] = cmd;
    mapping["Shift-Enter"] = cmd;
  }

  /* -------------------------------------------- */

  /**
   * Implement some custom logic for how to split special blocks.
   * @param {Record<string, ProseMirrorCommand>} mapping  The keyboard mapping.
   */
  #newLineMapping(mapping) {
    const cmds = Object.values(this.schema.nodes).reduce((arr, node) => {
      if ( node.split instanceof Function ) arr.push(node.split);
      return arr;
    }, []);
    if ( !cmds.length ) return;
    mapping["Enter"] = cmds.length < 2 ? cmds[0] : chainCommands(...cmds);
  }

  /* -------------------------------------------- */

  /**
   * Implement save shortcut.
   * @param {Record<string, ProseMirrorCommand>} mapping  The keyboard mapping.
   */
  #addSaveMapping(mapping) {
    mapping["Mod-s"] = () => {
      this.onSave();
      return true;
    };
  }
}

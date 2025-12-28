import {ellipsis, InputRule, inputRules, textblockTypeInputRule, wrappingInputRule} from "prosemirror-inputrules";
import ProseMirrorPlugin from "./plugin.mjs";

/**
 * A class responsible for building the input rules for the ProseMirror editor.
 * @extends {ProseMirrorPlugin}
 */
export default class ProseMirrorInputRules extends ProseMirrorPlugin {
  /**
   * Build the plugin.
   * @param {Schema} schema     The ProseMirror schema to build the plugin against.
   * @param {object} [options]  Additional options to pass to the plugin.
   * @param {number} [options.minHeadingLevel=0]  The minimum heading level to start from when generating heading input
   *                                              rules. The resulting heading level for a heading rule is equal to the
   *                                              number of leading hashes minus this number.
   * */
  static build(schema, {minHeadingLevel=0}={}) {
    const rules = new this(schema, {minHeadingLevel});
    return inputRules({rules: rules.buildRules()});
  }

  /* -------------------------------------------- */

  /**
   * Build input rules for node types present in the schema.
   * @returns {InputRule[]}
   */
  buildRules() {
    const rules = [ellipsis, ProseMirrorInputRules.#emDashRule()];
    if ( "blockquote" in this.schema.nodes ) rules.push(this.#blockQuoteRule());
    if ( "ordered_list" in this.schema.nodes ) rules.push(this.#orderedListRule());
    if ( "bullet_list" in this.schema.nodes ) rules.push(this.#bulletListRule());
    if ( "code_block" in this.schema.nodes ) rules.push(this.#codeBlockRule());
    if ( "heading" in this.schema.nodes ) rules.push(this.#headingRule(1, 6));
    if ( "horizontal_rule" in this.schema.nodes ) rules.push(this.#hrRule());
    return rules;
  }

  /* -------------------------------------------- */

  /**
   * Turn a "&gt;" at the start of a textblock into a blockquote.
   * @returns {InputRule}
   */
  #blockQuoteRule() {
    return wrappingInputRule(/^\s*>\s$/, this.schema.nodes.blockquote);
  }

  /* -------------------------------------------- */

  /**
   * Turn a number followed by a dot at the start of a textblock into an ordered list.
   * @returns {InputRule}
   */
  #orderedListRule() {
    return wrappingInputRule(
      /^(\d+)\.\s$/, this.schema.nodes.ordered_list,
      match => ({order: Number(match[1])}),
      (match, node) => (node.childCount + node.attrs.order) === Number(match[1])
    );
  }

  /* -------------------------------------------- */

  /**
   * Turn a -, +, or * at the start of a textblock into a bulleted list.
   * @returns {InputRule}
   */
  #bulletListRule() {
    return wrappingInputRule(/^\s*[-+*]\s$/, this.schema.nodes.bullet_list);
  }

  /* -------------------------------------------- */

  /**
   * Turn three backticks at the start of a textblock into a code block.
   * @returns {InputRule}
   */
  #codeBlockRule() {
    return textblockTypeInputRule(/^```$/, this.schema.nodes.code_block);
  }

  /* -------------------------------------------- */

  /**
   * Turns a double dash anywhere into an em-dash. Does not match at the start of the line to avoid conflict with the
   * HR rule.
   * @returns {InputRule}
   */
  static #emDashRule() {
    return new InputRule(/[^-]+(--)/, "—");
  }

  /* -------------------------------------------- */

  /**
   * Turns a number of # characters followed by a space at the start of a textblock into a heading up to a maximum
   * level.
   * @param {number} minLevel  The minimum heading level to start generating input rules for.
   * @param {number} maxLevel  The maximum number of heading levels.
   * @returns {InputRule}
   */
  #headingRule(minLevel, maxLevel) {
    const range = maxLevel - minLevel + 1;
    return textblockTypeInputRule(
      new RegExp(`^(#{1,${range}})\\s$`), this.schema.nodes.heading,
      match => {
        const level = match[1].length;
        return {level: level + minLevel - 1};
      }
    );
  }

  /* -------------------------------------------- */

  /**
   * Turns three hyphens at the start of a line into a horizontal rule.
   * @returns {InputRule}
   */
  #hrRule() {
    const hr = this.schema.nodes.horizontal_rule;
    return new InputRule(/^---$/, (state, match, start, end) => {
      return state.tr.replaceRangeWith(start, end, hr.create()).scrollIntoView();
    });
  }
}

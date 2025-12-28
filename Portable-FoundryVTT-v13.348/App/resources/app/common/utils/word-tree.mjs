import StringTree from "./string-tree.mjs";

/**
 * @import {StringTreeEntryFilter, StringTreeNode, WordTreeEntry} from "./_types.mjs";
 */

/**
 * A data structure for quickly retrieving objects by a string prefix.
 * Note that this works well for languages with alphabets (latin, cyrillic, korean, etc.), but may need more nuanced
 * handling for languages that compose characters and letters.
 * @extends {StringTree}
 */
export default class WordTree extends StringTree {
  /**
   * Insert an entry into the tree.
   * @param {string} string        The string key for the entry.
   * @param {WordTreeEntry} entry  The entry to store.
   * @returns {StringTreeNode}     The node the entry was added to.
   */
  addLeaf(string, entry) {
    string = string.toLocaleLowerCase(game.i18n.lang);
    return super.addLeaf(Array.from(string), entry);
  }

  /* -------------------------------------------- */

  /**
   * Return entries that match the given string prefix.
   * @param {string} prefix              The prefix.
   * @param {object} [options]           Additional options to configure behaviour.
   * @param {number} [options.limit=10]  The maximum number of items to retrieve. It is important to set this value as
   *                                     very short prefixes will naturally match large numbers of entries.
   * @param {StringTreeEntryFilter} [options.filterEntries]  A filter function to apply to each candidate entry.
   * @returns {WordTreeEntry[]}          A number of entries that have the given prefix.
   */
  lookup(prefix, { limit=10, filterEntries }={}) {
    return super.lookup(prefix, { limit, filterEntries });
  }

  /* -------------------------------------------- */

  /**
   * Returns the node at the given prefix.
   * @param {string} prefix  The prefix.
   * @returns {StringTreeNode}
   */
  nodeAtPrefix(prefix) {
    prefix = prefix.toLocaleLowerCase(game.i18n.lang);
    return super.nodeAtPrefix(Array.from(prefix));
  }
}

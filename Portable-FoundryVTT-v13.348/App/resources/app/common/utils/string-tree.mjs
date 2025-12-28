/**
 * @import {StringTreeEntryFilter, StringTreeNode} from "./_types.mjs";
 */

/**
 * A data structure representing a tree of string nodes with arbitrary object leaves.
 */
export default class StringTree {
  /**
   * The key symbol that stores the leaves of any given node.
   * @type {symbol}
   */
  static get leaves() {
    return StringTree.#leaves;
  }

  static #leaves = Symbol();

  /* -------------------------------------------- */

  /**
   * The tree's root.
   * @type {StringTreeNode}
   */
  #root = this.#createNode();

  /* -------------------------------------------- */

  /**
   * Create a new node.
   * @returns {StringTreeNode}
   */
  #createNode() {
    return { [StringTree.leaves]: [] };
  }

  /* -------------------------------------------- */

  /**
   * Insert an entry into the tree.
   * @param {string[]} strings  The string parents for the entry.
   * @param {any} entry         The entry to store.
   * @returns {StringTreeNode}  The node the entry was added to.
   */
  addLeaf(strings, entry) {
    let node = this.#root;
    for ( const string of strings ) {
      node[string] ??= this.#createNode();
      node = node[string];
    }

    // Once we've traversed the tree, we add our entry.
    node[StringTree.leaves].push(entry);
    return node;
  }

  /* -------------------------------------------- */

  /**
   * Traverse the tree along the given string path and return any entries reachable from the node.
   * @param {string[]} strings                               The string path to the desired node.
   * @param {object} [options]
   * @param {number} [options.limit]                         The maximum number of items to retrieve.
   * @param {StringTreeEntryFilter} [options.filterEntries]  A filter function to apply to each candidate entry.
   * @returns {any[]}
   */
  lookup(strings, { limit, filterEntries }={}) {
    const entries = [];
    const node = this.nodeAtPrefix(strings);
    if ( !node ) return []; // No matching entries.
    const queue = [node];
    while ( queue.length ) {
      if ( limit && (entries.length >= limit) ) break;
      this._breadthFirstSearch(queue.shift(), entries, queue, { limit, filterEntries });
    }
    return entries;
  }

  /* -------------------------------------------- */

  /**
   * Returns the node at the given path through the tree.
   * @param {string[]} strings                    The string path to the desired node.
   * @param {object} [options]
   * @param {boolean} [options.hasLeaves=false]   Only return the most recently visited node that has leaves, otherwise
   *                                              return the exact node at the prefix, if it exists.
   * @returns {StringTreeNode|void}
   */
  nodeAtPrefix(strings, { hasLeaves=false }={}) {
    let node = this.#root;
    let withLeaves = node;
    for ( const string of strings ) {
      if ( !(string in node) ) return hasLeaves ? withLeaves : undefined;
      node = node[string];
      if ( node[StringTree.leaves].length ) withLeaves = node;
    }
    return hasLeaves ? withLeaves : node;
  }

  /* -------------------------------------------- */

  /**
   * Perform a breadth-first search starting from the given node and retrieving any entries reachable from that node,
   * until we reach the limit.
   * @param {StringTreeNode} node                            The starting node.
   * @param {any[]} entries                                  The accumulated entries.
   * @param {StringTreeNode[]} queue                         The working queue of nodes to search.
   * @param {object} [options]
   * @param {number} [options.limit]                         The maximum number of entries to retrieve before stopping.
   * @param {StringTreeEntryFilter} [options.filterEntries]  A filter function to apply to each candidate entry.
   * @protected
   */
  _breadthFirstSearch(node, entries, queue, { limit, filterEntries }={}) {
    // Retrieve the entries at this node.
    let leaves = node[StringTree.leaves];
    if ( filterEntries instanceof Function ) leaves = leaves.filter(filterEntries);
    entries.push(...leaves);
    if ( limit && (entries.length >= limit) ) return;
    // Push this node's children onto the end of the queue.
    for ( const key of Object.keys(node) ) {
      if ( typeof key === "string" ) queue.push(node[key]);
    }
  }
}

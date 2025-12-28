import {ResolvedPos} from "prosemirror-model";

/**
 * Determine whether a given position has an ancestor node of the given type.
 * @param {NodeType} other  The other node type.
 * @param {object} [attrs]  An object of attributes that must also match, if provided.
 * @returns {boolean}
 */
ResolvedPos.prototype.hasAncestor = function(other, attrs) {
  if ( !this.depth ) return false;
  for ( let i = this.depth; i > 0; i-- ) { // Depth 0 is the root document, so we don't need to test that.
    const node = this.node(i);
    if ( node.type === other ) {
      const nodeAttrs = foundry.utils.deepClone(node.attrs);
      delete nodeAttrs._preserve; // Do not include our internal attributes in the comparison.
      if ( attrs ) return foundry.utils.objectsEqual(nodeAttrs, attrs);
      return true;
    }
  }
  return false;
};

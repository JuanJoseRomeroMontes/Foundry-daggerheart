/** @typedef {{flavor?: string|null; [key: string]: unknown}} RollOptions */

/**
 * @typedef DiceTermResult
 * @property {number} result        The numeric result
 * @property {boolean} [active]     Is this result active, contributing to the total?
 * @property {number} [count]       A value that the result counts as, otherwise the result is not used directly as
 * @property {boolean} [success]    Does this result denote a success?
 * @property {boolean} [failure]    Does this result denote a failure?
 * @property {boolean} [discarded]  Was this result discarded?
 * @property {boolean} [rerolled]   Was this result rerolled?
 * @property {boolean} [exploded]   Was this result exploded?
 */

/* -------------------------------------------- */
/*  Roll Parsing Types                          */
/* -------------------------------------------- */

/**
 * @typedef RollParseNode
 * @property {string} class    The class name for this node.
 * @property {string} formula  The original matched text for this node.
 */

/**
 * @typedef {RollParseNode} RollParseTreeNode
 * @property {string} operator                          The binary operator.
 * @property {[RollParseNode, RollParseNode]} operands  The two operands.
 */

/**
 * @typedef {RollParseNode} FlavorRollParseNode
 * @property {object} options
 * @property {string} options.flavor  Flavor text associated with the node.
 */

/**
 * @typedef {FlavorRollParseNode} ModifiersRollParseNode
 * @property {string} modifiers  The matched modifiers string.
 */

/**
 * @typedef {FlavorRollParseNode} NumericRollParseNode
 * @property {number} number  The number.
 */

/**
 * @typedef {FlavorRollParseNode} FunctionRollParseNode
 * @property {string} fn              The function name.
 * @property {RollParseNode[]} terms  The arguments to the function.
 */

/**
 * @typedef {ModifiersRollParseNode} PoolRollParseNode
 * @property {RollParseNode[]} terms  The pool terms.
 */

/**
 * @typedef {FlavorRollParseNode} ParentheticalRollParseNode
 * @property {string} term  The inner parenthetical term.
 */

/**
 * @typedef {FlavorRollParseNode} StringParseNode
 * @property {string} term  The unclassified string term.
 */

/**
 * @typedef {ModifiersRollParseNode} DiceRollParseNode
 * @property {number|ParentheticalRollParseNode} number        The number of dice.
 * @property {string|number|ParentheticalRollParseNode} faces  The number of faces or a string denomination like "c" or
 *                                                             "f".
 */

/**
 * @typedef {null|number|string|RollParseNode|RollParseArg[]} RollParseArg
 */

import {getType} from "@common/utils/helpers.mjs";
import OperatorTerm from "./terms/operator.mjs";

/**
 * @import {
 *   RollParseNode,
 *   RollParseTreeNode,
 *   NumericRollParseNode,
 *   FunctionRollParseNode,
 *   PoolRollParseNode,
 *   ParentheticalRollParseNode,
 *   DiceRollParseNode,
 *   RollParseArg
 * } from "./_types.mjs";
 */

/**
 * A class for transforming events from the Peggy grammar lexer into various formats.
 */
export default class RollParser {
  /**
   * @param {string} formula  The full formula.
   */
  constructor(formula) {
    this.formula = formula;
  }

  /**
   * The full formula.
   * @type {string}
   */
  formula;

  /* -------------------------------------------- */
  /*  Parse Events                                */
  /* -------------------------------------------- */

  /**
   * Handle a base roll expression.
   * @param {RollParseNode} head                The first operand.
   * @param {[string[], RollParseNode][]} tail  Zero or more subsequent (operators, operand) tuples.
   * @param {string} [leading]                  A leading operator.
   * @param {string} formula                    The original matched text.
   * @param {Function} error                    The peggy error callback to invoke on a parse error.
   * @returns {RollParseTreeNode}
   * @protected
   */
  _onExpression(head, tail, leading, formula, error) {
    if ( CONFIG.debug.rollParsing ) console.debug(this.constructor.formatDebug("onExpression", head, tail));
    if ( leading.length ) leading = this._collapseOperators(leading);
    if ( leading === "-" ) head = this._wrapNegativeTerm(head);

    // We take the list of (operator, operand) tuples and arrange them into a left-skewed binary tree.
    return tail.reduce((acc, [operators, operand]) => {
      let operator;
      let [multiplicative, ...additive] = operators;
      if ( additive.length ) additive = this._collapseOperators(additive);
      if ( multiplicative ) {
        operator = multiplicative;
        if ( additive === "-" ) operand = this._wrapNegativeTerm(operand);
      }
      else operator = additive;
      if ( typeof operator !== "string" ) error(`Failed to parse ${formula}. Unexpected operator.`);
      const operands = [acc, operand];
      return { class: "Node", formula: `${acc.formula} ${operator} ${operand.formula}`, operands, operator };
    }, head);
  }

  /* -------------------------------------------- */

  /**
   * Handle a dice term.
   * @param {NumericRollParseNode|ParentheticalRollParseNode|null} number  The number of dice.
   * @param {string|NumericRollParseNode|ParentheticalRollParseNode|null} faces  The number of die faces or a string
   *                                                                             denomination like "c" or "f".
   * @param {string|null} modifiers                                        The matched modifiers string.
   * @param {string|null} flavor                                           Associated flavor text.
   * @param {string} formula                                               The original matched text.
   * @returns {DiceRollParseNode}
   * @protected
   */
  _onDiceTerm(number, faces, modifiers, flavor, formula) {
    if ( CONFIG.debug.rollParsing ) {
      console.debug(this.constructor.formatDebug("onDiceTerm", number, faces, modifiers, flavor, formula));
    }
    return { class: "DiceTerm", formula, modifiers, number, faces, evaluated: false, options: { flavor } };
  }

  /* -------------------------------------------- */

  /**
   * Handle a numeric term.
   * @param {number} number  The number.
   * @param {string} flavor  Associated flavor text.
   * @returns {NumericRollParseNode}
   * @protected
   */
  _onNumericTerm(number, flavor) {
    if ( CONFIG.debug.rollParsing ) console.debug(this.constructor.formatDebug("onNumericTerm", number, flavor));
    return {
      class: "NumericTerm", number,
      formula: `${number}${flavor ? `[${flavor}]` : ""}`,
      evaluated: false,
      options: { flavor }
    };
  }

  /* -------------------------------------------- */

  /**
   * Handle a math term.
   * @param {string} fn             The Math function.
   * @param {RollParseNode} head    The first term.
   * @param {RollParseNode[]} tail  Zero or more additional terms.
   * @param {string} flavor         Associated flavor text.
   * @param {string} formula        The original matched text.
   * @returns {FunctionRollParseNode}
   * @protected
   */
  _onFunctionTerm(fn, head, tail, flavor, formula) {
    if ( CONFIG.debug.rollParsing ) {
      console.debug(this.constructor.formatDebug("onFunctionTerm", fn, head, tail, flavor, formula));
    }
    const terms = [];
    if ( head ) terms.push(head, ...tail);
    return { class: "FunctionTerm", fn, terms, formula, evaluated: false, options: { flavor } };
  }

  /* -------------------------------------------- */

  /**
   * Handle a pool term.
   * @param {RollParseNode} head     The first term.
   * @param {RollParseNode[]} tail   Zero or more additional terms.
   * @param {string|null} modifiers  The matched modifiers string.
   * @param {string|null} flavor     Associated flavor text.
   * @param {string} formula         The original matched text.
   * @returns {PoolRollParseNode}
   * @protected
   */
  _onPoolTerm(head, tail, modifiers, flavor, formula) {
    if ( CONFIG.debug.rollParsing ) {
      console.debug(this.constructor.formatDebug("onPoolTerm", head, tail, modifiers, flavor, formula));
    }
    const terms = [];
    if ( head ) terms.push(head, ...tail);
    return { class: "PoolTerm", terms, formula, modifiers, evaluated: false, options: { flavor } };
  }

  /* -------------------------------------------- */

  /**
   * Handle a parenthetical.
   * @param {RollParseNode} term  The inner term.
   * @param {string|null} flavor  Associated flavor text.
   * @param {string} formula      The original matched text.
   * @returns {ParentheticalRollParseNode}
   * @protected
   */
  _onParenthetical(term, flavor, formula) {
    if ( CONFIG.debug.rollParsing ) {
      console.debug(this.constructor.formatDebug("onParenthetical", term, flavor, formula));
    }
    return { class: "ParentheticalTerm", term, formula, evaluated: false, options: { flavor } };
  }

  /* -------------------------------------------- */

  /**
   * Handle some string that failed to be classified.
   * @param {string} term  The term.
   * @param {string|null} [flavor]  Associated flavor text.
   * @returns {StringParseNode}
   * @protected
   */
  _onStringTerm(term, flavor) {
    return { class: "StringTerm", term, evaluated: false, options: { flavor } };
  }

  /* -------------------------------------------- */

  /**
   * Collapse multiple additive operators into a single one.
   * @param {string[]} operators  A sequence of additive operators.
   * @returns {string}
   * @protected
   */
  _collapseOperators(operators) {
    let head = operators.pop();
    for ( const operator of operators ) {
      if ( operator === "-" ) head = head === "+" ? "-" : "+";
    }
    return head;
  }

  /* -------------------------------------------- */

  /**
   * Wrap a term with a leading minus.
   * @param {RollParseNode} term  The term to wrap.
   * @returns {RollParseNode}
   * @protected
   */
  _wrapNegativeTerm(term) {
    // Special case when we have a numeric term, otherwise we wrap it in a parenthetical.
    if ( term.class === "NumericTerm" ) {
      term.number *= -1;
      term.formula = `-${term.formula}`;
      return term;
    }

    return foundry.dice.RollGrammar.parse(`(${term.formula} * -1)`, { parser: this.constructor });
  }

  /* -------------------------------------------- */
  /*  Tree Manipulation                           */
  /* -------------------------------------------- */

  /**
   * Flatten a tree structure (either a parse tree or AST) into an array with operators in infix notation.
   * @param {RollParseNode} root  The root of the tree.
   * @returns {RollParseNode[]}
   */
  static flattenTree(root) {
    const list = [];

    /**
     * Flatten the given node.
     * @param {RollParseNode} node  The node.
     */
    function flattenNode(node) {
      if ( node.class !== "Node" ) {
        list.push(node);
        return;
      }

      const [left, right] = node.operands;
      flattenNode(left);
      list.push({ class: "OperatorTerm", operator: node.operator });
      flattenNode(right);
    }

    flattenNode(root);
    return list;
  }

  /* -------------------------------------------- */

  /**
   * Use the Shunting Yard algorithm to convert a parse tree or list of terms into an AST with correct operator
   * precedence.
   * See https://en.wikipedia.org/wiki/Shunting_yard_algorithm for a description of the algorithm in detail.
   * @param {RollParseNode|RollTerm[]} root  The root of the parse tree or a list of terms.
   * @returns {RollParseNode}                The root of the AST.
   */
  static toAST(root) {
    // Flatten the parse tree to an array representing the original formula in infix notation.
    const list = Array.isArray(root) ? root : this.flattenTree(root);
    const operators = [];
    const output = [];

    /**
     * Pop operators from the operator stack and push them onto the output stack until we reach an operator with lower
     * or equal precedence and left-associativity.
     * @param {RollParseNode} op  The target operator to push.
     */
    function pushOperator(op) {
      let peek = operators.at(-1);
      // We assume all our operators are left-associative, so we only check if the precedence is lower or equal here.
      while ( peek && ((OperatorTerm.PRECEDENCE[peek.operator] ?? 0) >= (OperatorTerm.PRECEDENCE[op.operator] ?? 0)) ) {
        output.push(operators.pop());
        peek = operators.at(-1);
      }
      operators.push(op);
    }

    for ( const node of list ) {
      // If this is an operator, push it onto the operators stack.
      if ( this.isOperatorTerm(node) ) {
        pushOperator(node);
        continue;
      }

      // Recursively reorganize inner terms to AST sub-trees.
      if ( node.class === "ParentheticalTerm" ) node.term = this.toAST(node.term);
      else if ( (node.class === "FunctionTerm") || (node.class === "PoolTerm") ) {
        node.terms = node.terms.map(term => this.toAST(term));
      }

      // Push the node onto the output stack.
      output.push(node);
    }

    // Pop remaining operators off the operator stack and onto the output stack.
    while ( operators.length ) output.push(operators.pop());

    // The output now contains the formula in postfix notation, with correct operator precedence applied. We recombine
    // it into a tree by matching each postfix operator with two operands.
    const ast = [];
    for ( const node of output ) {
      if ( !this.isOperatorTerm(node) ) {
        ast.push(node);
        continue;
      }
      const right = ast.pop();
      const left = ast.pop();
      ast.push({ class: "Node", operator: node.operator, operands: [left, right] });
    }

    // The postfix array has been recombined into an array of one element, which is the root of the new AST.
    return ast.pop();
  }

  /* -------------------------------------------- */

  /**
   * Determine if a given node is an operator term.
   * @param {RollParseNode|RollTerm} node
   */
  static isOperatorTerm(node) {
    return (node instanceof OperatorTerm) || (node.class === "OperatorTerm");
  }

  /* -------------------------------------------- */
  /*  Debug Formatting                            */
  /* -------------------------------------------- */

  /**
   * Format a list argument.
   * @param {RollParseArg[]} list  The list to format.
   * @returns {string}
   */
  static formatList(list) {
    if ( !list ) return "[]";
    return `[${list.map(RollParser.formatArg).join(", ")}]`;
  }

  /* -------------------------------------------- */

  /**
   * Format a parser argument.
   * @param {RollParseArg} arg  The argument.
   * @returns {string}
   */
  static formatArg(arg) {
    switch ( getType(arg) ) {
      case "null": return "null";
      case "number": return `${arg}`;
      case "string": return `"${arg}"`;
      case "Object": return arg.class;
      case "Array": return RollParser.formatList(arg);
    }
  }

  /* -------------------------------------------- */

  /**
   * Format arguments for debugging.
   * @param {string} method         The method name.
   * @param {...RollParseArg} args  The arguments.
   * @returns {string}
   */
  static formatDebug(method, ...args) {
    return `${method}(${args.map(RollParser.formatArg).join(", ")})`;
  }
}

import Roll from "../roll.mjs";
import RollTerm from "./term.mjs";

/**
 * @import {DiceTerm, ParentheticalTerm} from "./_module.mjs";
 */

/**
 * A type of RollTerm used to enclose a parenthetical expression to be recursively evaluated.
 */
export default class ParentheticalTerm extends RollTerm {
  constructor({term, roll, options}) {
    super({options});
    this.term = term;
    this.roll = roll;

    // If a roll was explicitly passed in, the parenthetical may have already been evaluated
    if ( this.roll ) {
      this.term = roll.formula;
      this._evaluated = this.roll._evaluated;
    }
  }

  /**
   * The original provided string term used to construct the parenthetical
   * @type {string}
   */
  term;

  /**
   * An already-evaluated Roll instance used instead of the string term.
   * @type {Roll}
   */
  roll;

  /** @inheritdoc */
  isIntermediate = true;

  /**
   * The regular expression pattern used to identify the opening of a parenthetical expression.
   * This could also identify the opening of a math function.
   * @type {RegExp}
   */
  static OPEN_REGEXP = /([A-z][A-z0-9]+)?\(/g;

  /**
   * A regular expression pattern used to identify the closing of a parenthetical expression.
   * @type {RegExp}
   */
  static CLOSE_REGEXP = /\)(?:\$\$F[0-9]+\$\$)?/g;

  /** @inheritdoc */
  static SERIALIZE_ATTRIBUTES = ["term", "roll"];

  /* -------------------------------------------- */
  /*  Parenthetical Term Attributes               */
  /* -------------------------------------------- */

  /**
   * An array of evaluated DiceTerm instances that should be bubbled up to the parent Roll
   * @type {DiceTerm[]}
   */
  get dice() {
    return this.roll?.dice;
  }

  /** @inheritdoc */
  get total() {
    return this.roll.total;
  }

  /** @inheritdoc */
  get expression() {
    return `(${this.term})`;
  }

  /** @inheritdoc */
  get isDeterministic() {
    return Roll.create(this.term).isDeterministic;
  }

  /* -------------------------------------------- */
  /*  Parenthetical Term Methods                  */
  /* -------------------------------------------- */

  /** @inheritdoc */
  _evaluate(options={}) {
    const roll = this.roll || Roll.create(this.term);
    if ( this._root ) roll._root = this._root;
    if ( options.maximize || options.minimize || roll.isDeterministic ) return this._evaluateSync(roll, options);
    return this._evaluateAsync(roll, options);
  }

  /* -------------------------------------------- */

  /**
   * Evaluate this parenthetical when it contains any non-deterministic sub-terms.
   * @param {Roll} roll  The inner Roll instance to evaluate.
   * @param {object} [options]
   * @returns {Promise<RollTerm>}
   * @protected
   */
  async _evaluateAsync(roll, options={}) {
    this.roll = await roll.evaluate(options);
    this.roll.propagateFlavor(this.flavor);
    return this;
  }

  /* -------------------------------------------- */

  /**
   * Evaluate this parenthetical when it contains only deterministic sub-terms.
   * @param {Roll} roll  The inner Roll instance to evaluate.
   * @param {object} [options]
   * @returns {RollTerm}
   * @protected
   */
  _evaluateSync(roll, options={}) {
    this.roll = roll.evaluateSync(options);
    this.roll.propagateFlavor(this.flavor);
    return this;
  }

  /* -------------------------------------------- */

  /**
   * Construct a ParentheticalTerm from an Array of component terms which should be wrapped inside the parentheses.
   * @param {RollTerm[]} terms      The array of terms to use as internal parts of the parenthetical
   * @param {object} [options={}]   Additional options passed to the ParentheticalTerm constructor
   * @returns {ParentheticalTerm}   The constructed ParentheticalTerm instance
   *
   * @example Create a Parenthetical Term from an array of component RollTerm instances
   * ```js
   * const d6 = new Die({number: 4, faces: 6});
   * const plus = new OperatorTerm({operator: "+"});
   * const bonus = new NumericTerm({number: 4});
   * t = ParentheticalTerm.fromTerms([d6, plus, bonus]);
   * t.formula; // (4d6 + 4)
   * ```
   */
  static fromTerms(terms, options) {
    const roll = Roll.defaultImplementation.fromTerms(terms);
    return new this({roll, options});
  }

  /* -------------------------------------------- */

  /** @override */
  static fromParseNode(node) {
    const roll = Roll.defaultImplementation.fromTerms(Roll.defaultImplementation.instantiateAST(node.term));
    return this.fromData({ ...node, roll, term: roll.formula });
  }
}

import Roll from "../roll.mjs";
import RollTerm from "./term.mjs";
import DiceTerm from "./dice.mjs";

/**
 * @import {RollFunction} from "@client/config.mjs";
 */

/**
 * A type of RollTerm used to apply a function.
 */
export default class FunctionTerm extends RollTerm {
  constructor({fn, terms=[], rolls=[], result, options={}}={}) {
    super({options});
    this.fn = fn;
    this.terms = terms;
    this.rolls = (rolls.length === terms.length) ? rolls : this.terms.map(t => Roll.create(t));
    this.result = result;
    if ( result !== undefined ) this._evaluated = true;
  }

  /**
   * The name of the configured function, or one in the Math environment, which should be applied to the term
   * @type {string}
   */
  fn;

  /**
   * An array of string argument terms for the function
   * @type {string[]}
   */
  terms;

  /**
   * The cached Roll instances for each function argument
   * @type {Roll[]}
   */
  rolls = [];

  /**
   * The cached result of evaluating the method arguments
   * @type {string|number}
   */
  result;

  /** @inheritdoc */
  isIntermediate = true;

  /** @inheritdoc */
  static SERIALIZE_ATTRIBUTES = ["fn", "terms", "rolls", "result"];

  /* -------------------------------------------- */
  /*  Function Term Attributes                    */
  /* -------------------------------------------- */

  /**
   * An array of evaluated DiceTerm instances that should be bubbled up to the parent Roll
   * @type {DiceTerm[]}
   */
  get dice() {
    return this.rolls.flatMap(r => r.dice);
  }

  /** @inheritdoc */
  get total() {
    return this.result;
  }

  /** @inheritdoc */
  get expression() {
    return `${this.fn}(${this.terms.join(",")})`;
  }

  /**
   * The function this term represents.
   * @returns {RollFunction}
   */
  get function() {
    return CONFIG.Dice.functions[this.fn] ?? Math[this.fn];
  }

  /** @inheritdoc */
  get isDeterministic() {
    if ( this.function?.constructor.name === "AsyncFunction" ) return false;
    return this.terms.every(t => Roll.create(t).isDeterministic);
  }

  /* -------------------------------------------- */
  /*  Math Term Methods                           */
  /* -------------------------------------------- */

  /** @inheritdoc */
  _evaluate(options={}) {
    if ( RollTerm.isDeterministic(this, options) ) return this._evaluateSync(options);
    return this._evaluateAsync(options);
  }

  /* -------------------------------------------- */

  /**
   * Evaluate this function when it contains any non-deterministic sub-terms.
   * @param {object} [options]
   * @returns {Promise<RollTerm>}
   * @protected
   */
  async _evaluateAsync(options={}) {
    const args = await Promise.all(this.rolls.map(async roll => {
      if ( this._root ) roll._root = this._root;
      await roll.evaluate({ ...options, allowStrings: true });
      roll.propagateFlavor(this.flavor);
      return this.#parseArgument(roll);
    }));
    const fn = this.function;
    if ( !fn ) throw new Error(`The function "${this.fn}" is not registered in CONFIG.Dice.functions`);
    this.result = await fn.apply(this, args);
    if ( !options.allowStrings ) this.result = Number(this.result);
    return this;
  }

  /* -------------------------------------------- */

  /**
   * Evaluate this function when it contains only deterministic sub-terms.
   * @param {object} [options]
   * @returns {RollTerm}
   * @protected
   */
  _evaluateSync(options={}) {
    const args = [];
    for ( const roll of this.rolls ) {
      roll.evaluateSync({ ...options, allowStrings: true });
      roll.propagateFlavor(this.flavor);
      args.push(this.#parseArgument(roll));
    }
    const fn = this.function;
    if ( !fn ) throw new Error(`The function "${this.fn}" is not registered in CONFIG.Dice.functions`);
    this.result = fn.apply(this, args);
    if ( !options.allowStrings ) this.result = Number(this.result);
    return this;
  }

  /* -------------------------------------------- */

  /**
   * Parse a function argument from its evaluated Roll instance.
   * @param {Roll} roll  The evaluated Roll instance that wraps the argument.
   * @returns {string|number}
   */
  #parseArgument(roll) {
    const { product } = roll;
    if ( typeof product !== "string" ) return product;
    const [, value] = product.match(/^ᚖ([^ᚖ]+)ᚖ$/) || [];
    return value ? JSON.parse(value) : product;
  }

  /* -------------------------------------------- */
  /*  Saving and Loading                          */
  /* -------------------------------------------- */

  /** @inheritDoc */
  static _fromData(data) {
    data.rolls = (data.rolls || []).map(r => r instanceof Roll ? r : Roll.fromData(r));
    return super._fromData(data);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  toJSON() {
    const data = super.toJSON();
    data.rolls = data.rolls.map(r => r.toJSON());
    return data;
  }

  /* -------------------------------------------- */

  /** @override */
  static fromParseNode(node) {
    const rolls = node.terms.map(t => {
      return Roll.defaultImplementation.fromTerms(Roll.defaultImplementation.instantiateAST(t));
    });
    const modifiers = Array.from((node.modifiers || "").matchAll(DiceTerm.MODIFIER_REGEXP)).map(([m]) => m);
    return this.fromData({ ...node, rolls, modifiers, terms: rolls.map(r => r.formula) });
  }
}

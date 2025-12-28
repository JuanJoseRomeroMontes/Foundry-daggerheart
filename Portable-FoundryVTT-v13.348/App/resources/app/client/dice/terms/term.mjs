import Roll from "../roll.mjs";
import {deepClone} from "@common/utils/_module.mjs";

/**
 * @import {RollTermData} from "./_types.mjs";
 * @import {RollParseNode} from "../_types.mjs";
 * @import RollResolver from "../../applications/dice/roll-resolver.mjs";
 */

/**
 * An abstract class which represents a single token that can be used as part of a Roll formula.
 * Every portion of a Roll formula is parsed into a subclass of RollTerm in order for the Roll to be fully evaluated.
 */
export default class RollTerm {

  /**
   * @param {object} [termData]
   * @param {object} [termData.options] An object of additional options which describes and modifies the term.
   */
  constructor({options={}}={}) {
    this.options = options;
  }

  /**
   * An object of additional options which describes and modifies the term.
   * @type {object}
   */
  options;

  /**
   * An internal flag for whether the term has been evaluated
   * @type {boolean}
   * @internal
   */
  _evaluated = false;

  /**
   * A reference to the Roll at the root of the evaluation tree.
   * @type {Roll}
   * @internal
   */
  _root;

  /**
   * Is this term intermediate, and should be evaluated first as part of the simplification process?
   * @type {boolean}
   */
  isIntermediate = false;

  /**
   * A regular expression pattern which identifies optional term-level flavor text
   * @type {string}
   */
  static FLAVOR_REGEXP_STRING = "(?:\\[([^\\]]+)\\])";

  /**
   * A regular expression which identifies term-level flavor text
   * @type {RegExp}
   */
  static FLAVOR_REGEXP = new RegExp(RollTerm.FLAVOR_REGEXP_STRING, "g");

  /**
   * A regular expression used to match a term of this type
   * @type {RegExp}
   */
  static REGEXP = undefined;

  /**
   * An array of additional attributes which should be retained when the term is serialized
   * @type {string[]}
   */
  static SERIALIZE_ATTRIBUTES = [];

  /* -------------------------------------------- */
  /*  RollTerm Attributes                         */
  /* -------------------------------------------- */

  /**
   * A string representation of the formula expression for this RollTerm, prior to evaluation.
   * @type {string}
   */
  get expression() {
    throw new Error(`The ${this.constructor.name} class must implement the expression attribute`);
  }

  /**
   * A string representation of the formula, including optional flavor text.
   * @type {string}
   */
  get formula() {
    let f = this.expression;
    if ( this.flavor ) f += `[${this.flavor}]`;
    return f;
  }

  /**
   * A string or numeric representation of the final output for this term, after evaluation.
   * @type {number|string|void}
   */
  get total() {
    throw new Error(`The ${this.constructor.name} class must implement the total attribute`);
  }

  /**
   * Optional flavor text which modifies and describes this term.
   * @type {string}
   */
  get flavor() {
    return this.options.flavor || "";
  }

  /**
   * Whether this term is entirely deterministic or contains some randomness.
   * @type {boolean}
   */
  get isDeterministic() {
    return true;
  }

  /**
   * A reference to the RollResolver app being used to externally resolve this term.
   * @type {RollResolver}
   */
  get resolver() {
    return this._root?._resolver;
  }

  /* -------------------------------------------- */
  /*  RollTerm Methods                            */
  /* -------------------------------------------- */

  /**
   * Evaluate the term, processing its inputs and finalizing its total.
   * @param {object} [options={}]                   Options which modify how the RollTerm is evaluated
   * @param {boolean} [options.minimize=false]      Minimize the result, obtaining the smallest possible value.
   * @param {boolean} [options.maximize=false]      Maximize the result, obtaining the largest possible value.
   * @param {boolean} [options.allowStrings=false]  If true, string terms will not throw an error when evaluated.
   * @returns {Promise<RollTerm>|RollTerm}          Returns a Promise if the term is non-deterministic.
   */
  evaluate(options={}) {
    if ( this._evaluated ) {
      throw new Error(`The ${this.constructor.name} has already been evaluated and is now immutable`);
    }
    this._evaluated = true;
    return this._evaluate(options);
  }

  /* -------------------------------------------- */

  /**
   * Evaluate the term.
   * @param {object} [options={}]           Options which modify how the RollTerm is evaluated, see RollTerm#evaluate
   * @returns {Promise<RollTerm>|RollTerm}  Returns a Promise if the term is non-deterministic.
   * @protected
   */
  _evaluate(options={}) {
    return this;
  }

  /* -------------------------------------------- */

  /**
   * Determine if evaluating a given RollTerm with certain evaluation options can be done so deterministically.
   * @param {RollTerm} term               The term.
   * @param {object} [options]            Options for evaluating the term.
   * @param {boolean} [options.maximize]  Force the result to be maximized.
   * @param {boolean} [options.minimize]  Force the result to be minimized.
   */
  static isDeterministic(term, { maximize, minimize }={}) {
    return maximize || minimize || term.isDeterministic;
  }

  /* -------------------------------------------- */
  /*  Serialization and Loading                   */
  /* -------------------------------------------- */

  /**
   * Construct a RollTerm from a provided data object
   * @param {RollTermData} data Provided data from an un-serialized term
   * @returns {RollTerm}        The constructed RollTerm
   */
  static fromData(data) {
    let cls = CONFIG.Dice.termTypes[data.class];
    if ( !cls ) {
      cls = Object.values(CONFIG.Dice.terms).find(c => c.name === data.class) || foundry.dice.terms.Die;
    }
    return cls._fromData(data);
  }

  /* -------------------------------------------- */

  /**
   * Construct a RollTerm from parser information.
   * @param {RollParseNode} node  The node.
   * @returns {RollTerm}
   */
  static fromParseNode(node) {
    return this.fromData(deepClone(node));
  }

  /* -------------------------------------------- */

  /**
   * Define term-specific logic for how a de-serialized data object is restored as a functional RollTerm
   * @param {RollTermData} data The de-serialized term data
   * @returns {RollTerm}        The re-constructed RollTerm object
   * @protected
   */
  static _fromData(data) {
    if ( data.roll && !(data.roll instanceof Roll) ) data.roll = Roll.fromData(data.roll);
    const term = new this(data);
    term._evaluated = data.evaluated ?? true;
    return term;
  }

  /* -------------------------------------------- */

  /**
   * Reconstruct a RollTerm instance from a provided JSON string
   * @param {string} json   A serialized JSON representation of a DiceTerm
   * @returns {RollTerm}    A reconstructed RollTerm from the provided JSON
   */
  static fromJSON(json) {
    let data;
    try {
      data = JSON.parse(json);
    } catch(err) {
      throw new Error("You must pass a valid JSON string");
    }
    return this.fromData(data);
  }

  /* -------------------------------------------- */

  /**
   * Serialize the RollTerm to a JSON string which allows it to be saved in the database or embedded in text.
   * This method should return an object suitable for passing to the JSON.stringify function.
   * @returns {RollTermData}
   */
  toJSON() {
    const data = {
      class: this.constructor.name,
      options: this.options,
      evaluated: this._evaluated
    };
    for ( const attr of this.constructor.SERIALIZE_ATTRIBUTES ) {
      data[attr] = this[attr];
    }
    return data;
  }
}

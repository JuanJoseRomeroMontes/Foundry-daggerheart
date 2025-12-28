import RollTerm from "./term.mjs";

/**
 * A type of RollTerm used to denote and perform an arithmetic operation.
 */
export default class OperatorTerm extends RollTerm {
  constructor({operator, options}={}) {
    super({options});
    this.operator = operator;
    this._evaluated = true; // Operator terms are always evaluated
  }

  /**
   * The term's operator value.
   * @type {string}
   */
  operator;

  /**
   * An object of operators with their precedence values.
   * @type {Readonly<Record<string, number>>}
   */
  static PRECEDENCE = Object.freeze({
    "+": 10,
    "-": 10,
    "*": 20,
    "/": 20,
    "%": 20
  });

  /**
   * An array of operators which represent arithmetic operations
   * @type {string[]}
   */
  static OPERATORS = Object.keys(this.PRECEDENCE);

  /** @override */
  static REGEXP = new RegExp(this.OPERATORS.map(o => `\\${o}`).join("|"), "g");

  /** @override */
  static SERIALIZE_ATTRIBUTES = ["operator"];

  /** @override */
  static _fromData(data) {
    return new this(data);
  }

  /** @override */
  get flavor() {
    return ""; // Operator terms cannot have flavor text
  }

  /** @override */
  get expression() {
    return ` ${this.operator} `;
  }

  /** @override */
  get total() {
    return ` ${this.operator} `;
  }
}


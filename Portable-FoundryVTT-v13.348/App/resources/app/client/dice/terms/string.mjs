import Roll from "../roll.mjs";
import RollTerm from "./term.mjs";

/**
 * A type of RollTerm used to represent strings which have not yet been matched.
 */
export default class StringTerm extends RollTerm {
  constructor({term, options}={}) {
    super({options});
    this.term = term;
  }

  /**
   * The term's string value.
   * @type {string}
   */
  term;

  /** @inheritdoc */
  static SERIALIZE_ATTRIBUTES = ["term"];

  /** @inheritdoc */
  get expression() {
    return this.term;
  }

  /** @inheritdoc */
  get total() {
    return this.term;
  }

  /** @inheritdoc */
  get isDeterministic() {
    const classified = Roll.defaultImplementation._classifyStringTerm(this.term, {intermediate: false});
    if ( classified instanceof StringTerm ) return true;
    return classified.isDeterministic;
  }

  /** @inheritdoc */
  evaluate({ allowStrings=false }={}) {
    if ( !allowStrings ) throw new Error(`Unresolved StringTerm ${this.term} requested for evaluation`);
    return this;
  }
}


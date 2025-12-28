import DiceTerm from "./dice.mjs";
import Die from "./die.mjs";

/**
 * A type of DiceTerm used to represent a three-sided Fate/Fudge die.
 * Mathematically behaves like 1d3-2
 */
export default class FateDie extends DiceTerm {
  constructor(termData) {
    termData.faces = 3;
    super(termData);
  }

  /** @inheritdoc */
  static DENOMINATION = "f";

  /** @inheritdoc */
  static MODIFIERS = {
    r: Die.prototype.reroll,
    rr: Die.prototype.rerollRecursive,
    k: Die.prototype.keep,
    kh: Die.prototype.keep,
    kl: Die.prototype.keep,
    d: Die.prototype.drop,
    dh: Die.prototype.drop,
    dl: Die.prototype.drop
  };

  /* -------------------------------------------- */

  /** @inheritdoc */
  async roll({minimize=false, maximize=false, ...options}={}) {
    /** @type {result: number; active: boolean} */
    const roll = {result: undefined, active: true};
    if ( minimize ) roll.result = -1;
    else if ( maximize ) roll.result = 1;
    else roll.result = await this._roll(options);
    if ( roll.result === undefined ) roll.result = this.randomFace();
    if ( roll.result === -1 ) roll.failure = true;
    if ( roll.result === 1 ) roll.success = true;
    this.results.push(roll);
    return roll;
  }

  /* -------------------------------------------- */

  /** @override */
  mapRandomFace(randomUniform) {
    return Math.ceil((randomUniform * this.faces) - 2);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  getResultLabel(result) {
    return {
      "-1": "-",
      0: "&nbsp;",
      1: "+"
    }[result.result];
  }
}

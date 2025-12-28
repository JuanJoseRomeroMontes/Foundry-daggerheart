import DiceTerm from "./dice.mjs";

/**
 * A type of DiceTerm used to represent rolling a fair n-sided die.
 *
 * @example Roll four six-sided dice
 * ```js
 * let die = new Die({faces: 6, number: 4}).evaluate();
 * ```
 */
export default class Die extends DiceTerm {
  /** @inheritDoc */
  static DENOMINATION = "d";

  /** @inheritDoc */
  static MODIFIERS = {
    r: "reroll",
    rr: "rerollRecursive",
    x: "explode",
    xo: "explodeOnce",
    k: "keep",
    kh: "keep",
    kl: "keep",
    d: "drop",
    dh: "drop",
    dl: "drop",
    min: "minimum",
    max: "maximum",
    even: "countEven",
    odd: "countOdd",
    cs: "countSuccess",
    cf: "countFailures",
    df: "deductFailures",
    sf: "subtractFailures",
    ms: "marginSuccess"
  };

  /* -------------------------------------------- */

  /** @inheritDoc */
  get total() {
    const total = super.total;
    if ( this.options.marginSuccess ) return total - parseInt(this.options.marginSuccess);
    else if ( this.options.marginFailure ) return parseInt(this.options.marginFailure) - total;
    else return total;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  get denomination() {
    return `d${this.faces}`;
  }

  /* -------------------------------------------- */
  /*  Term Modifiers                              */
  /* -------------------------------------------- */

  /**
   * Re-roll the Die, rolling additional results for any values which fall within a target set.
   * If no target number is specified, re-roll the lowest possible result.
   *
   * 20d20r         reroll all 1s
   * 20d20r1        reroll all 1s
   * 20d20r=1       reroll all 1s
   * 20d20r1=1      reroll a single 1
   *
   * @param {string} modifier        The matched modifier query
   * @param {boolean} recursive      Reroll recursively, continuing to reroll until the condition is no longer met
   * @returns {Promise<false|void>}  False if the modifier was unmatched
   */
  async reroll(modifier, {recursive=false}={}) {

    // Match the re-roll modifier
    const rgx = /rr?([0-9]+)?([<>=]+)?([0-9]+)?/i;
    const match = modifier.match(rgx);
    if ( !match ) return false;
    let [max, comparison, target] = match.slice(1);

    // If no comparison or target are provided, treat the max as the target
    if ( max && !(target || comparison) ) {
      target = max;
      max = null;
    }

    // Determine target values
    max = Number.isNumeric(max) ? parseInt(max) : null;
    target = Number.isNumeric(target) ? parseInt(target) : 1;
    comparison = comparison || "=";

    // Recursively reroll until there are no remaining results to reroll
    let checked = 0;
    const initial = this.results.length;
    while ( checked < this.results.length ) {
      const r = this.results[checked];
      checked++;
      if ( !r.active ) continue;

      // Maybe we have run out of rerolls
      if ( (max !== null) && (max <= 0) ) break;

      // Determine whether to re-roll the result
      if ( DiceTerm.compareResult(r.result, comparison, target) ) {
        r.rerolled = true;
        r.active = false;
        await this.roll({ reroll: true });
        if ( max !== null ) max -= 1;
      }

      // Limit recursion
      if ( !recursive && (checked >= initial) ) checked = this.results.length;
      if ( checked > 1000 ) throw new Error("Maximum recursion depth for exploding dice roll exceeded");
    }
  }

  /**
   * Reroll recursively.
   * @param {string} modifier
   * @see {@link Die#reroll}
   */
  async rerollRecursive(modifier) {
    return this.reroll(modifier, {recursive: true});
  }

  /* -------------------------------------------- */

  /**
   * Explode the Die, rolling additional results for any values which match the target set.
   * If no target number is specified, explode the highest possible result.
   * Explosion can be a "small explode" using a lower-case x or a "big explode" using an upper-case "X"
   *
   * @param {string} modifier        The matched modifier query
   * @param {boolean} recursive      Explode recursively, such that new rolls can also explode?
   * @returns {Promise<false|void>}  False if the modifier was unmatched.
   */
  async explode(modifier, {recursive=true}={}) {

    // Match the "explode" or "explode once" modifier
    const rgx = /xo?([0-9]+)?([<>=]+)?([0-9]+)?/i;
    const match = modifier.match(rgx);
    if ( !match ) return false;
    let [max, comparison, target] = match.slice(1);

    // If no comparison or target are provided, treat the max as the target value
    if ( max && !(target || comparison) ) {
      target = max;
      max = null;
    }

    // Determine target values
    target = Number.isNumeric(target) ? parseInt(target) : this.faces;
    comparison = comparison || "=";

    // Determine the number of allowed explosions
    max = Number.isNumeric(max) ? parseInt(max) : null;

    // Recursively explode until there are no remaining results to explode
    let checked = 0;
    const initial = this.results.length;
    while ( checked < this.results.length ) {
      const r = this.results[checked];
      checked++;
      if ( !r.active ) continue;

      // Maybe we have run out of explosions
      if ( (max !== null) && (max <= 0) ) break;

      // Determine whether to explode the result and roll again!
      if ( DiceTerm.compareResult(r.result, comparison, target) ) {
        r.exploded = true;
        await this.roll({ explode: true });
        if ( max !== null ) max -= 1;
      }

      // Limit recursion
      if ( !recursive && (checked === initial) ) break;
      if ( checked > 1000 ) throw new Error("Maximum recursion depth for exploding dice roll exceeded");
    }
  }

  /**
   * Explode non-recursively.
   * @param {string} modifier
   * @see {@link Die#explode}
   */
  async explodeOnce(modifier) {
    return this.explode(modifier, {recursive: false});
  }

  /* -------------------------------------------- */

  /**
   * Keep a certain number of highest or lowest dice rolls from the result set.
   *
   * 20d20k       Keep the 1 highest die
   * 20d20kh      Keep the 1 highest die
   * 20d20kh10    Keep the 10 highest die
   * 20d20kl      Keep the 1 lowest die
   * 20d20kl10    Keep the 10 lowest die
   *
   * @param {string} modifier     The matched modifier query
   */
  keep(modifier) {
    const rgx = /k([hl])?([0-9]+)?/i;
    const match = modifier.match(rgx);
    if ( !match ) return false;
    let [direction, number] = match.slice(1);
    direction = direction ? direction.toLowerCase() : "h";
    number = parseInt(number) || 1;
    DiceTerm._keepOrDrop(this.results, number, {keep: true, highest: direction === "h"});
  }

  /* -------------------------------------------- */

  /**
   * Drop a certain number of highest or lowest dice rolls from the result set.
   *
   * 20d20d       Drop the 1 lowest die
   * 20d20dh      Drop the 1 highest die
   * 20d20dl      Drop the 1 lowest die
   * 20d20dh10    Drop the 10 highest die
   * 20d20dl10    Drop the 10 lowest die
   *
   * @param {string} modifier     The matched modifier query
   */
  drop(modifier) {
    const rgx = /d([hl])?([0-9]+)?/i;
    const match = modifier.match(rgx);
    if ( !match ) return false;
    let [direction, number] = match.slice(1);
    direction = direction ? direction.toLowerCase() : "l";
    number = parseInt(number) || 1;
    DiceTerm._keepOrDrop(this.results, number, {keep: false, highest: direction !== "l"});
  }

  /* -------------------------------------------- */

  /**
   * Count the number of successful results which occurred in a given result set.
   * Successes are counted relative to some target, or relative to the maximum possible value if no target is given.
   * Applying a count-success modifier to the results re-casts all results to 1 (success) or 0 (failure)
   *
   * 20d20cs      Count the number of dice which rolled a 20
   * 20d20cs>10   Count the number of dice which rolled higher than 10
   * 20d20cs<10   Count the number of dice which rolled less than 10
   *
   * @param {string} modifier     The matched modifier query
   */
  countSuccess(modifier) {
    const rgx = /(?:cs)([<>=]+)?([0-9]+)?/i;
    const match = modifier.match(rgx);
    if ( !match ) return false;
    let [comparison, target] = match.slice(1);
    comparison = comparison || "=";
    target = parseInt(target) ?? this.faces;
    DiceTerm._applyCount(this.results, comparison, target, {flagSuccess: true});
  }

  /* -------------------------------------------- */

  /**
   * Count the number of failed results which occurred in a given result set.
   * Failures are counted relative to some target, or relative to the lowest possible value if no target is given.
   * Applying a count-failures modifier to the results re-casts all results to 1 (failure) or 0 (non-failure)
   *
   * 6d6cf      Count the number of dice which rolled a 1 as failures
   * 6d6cf<=3   Count the number of dice which rolled less than 3 as failures
   * 6d6cf>4    Count the number of dice which rolled greater than 4 as failures
   *
   * @param {string} modifier     The matched modifier query
   */
  countFailures(modifier) {
    const rgx = /(?:cf)([<>=]+)?([0-9]+)?/i;
    const match = modifier.match(rgx);
    if ( !match ) return false;
    let [comparison, target] = match.slice(1);
    comparison = comparison || "=";
    target = parseInt(target) ?? 1;
    DiceTerm._applyCount(this.results, comparison, target, {flagFailure: true});
  }

  /* -------------------------------------------- */

  /**
   * Count the number of even results which occurred in a given result set.
   * Even numbers are marked as a success and counted as 1
   * Odd numbers are marked as a non-success and counted as 0.
   *
   * 6d6even    Count the number of even numbers rolled
   *
   * @param {string} modifier     The matched modifier query (unused here, but passed to overrides anyway)
   */
  countEven(modifier) {
    for ( const r of this.results ) {
      r.success = ( (r.result % 2) === 0 );
      r.count = r.success ? 1 : 0;
    }
  }

  /* -------------------------------------------- */

  /**
   * Count the number of odd results which occurred in a given result set.
   * Odd numbers are marked as a success and counted as 1
   * Even numbers are marked as a non-success and counted as 0.
   *
   * 6d6odd    Count the number of odd numbers rolled
   *
   * @param {string} modifier     The matched modifier query (unused here, but passed to overrides anyway)
   */
  countOdd(modifier) {
    for ( const r of this.results ) {
      r.success = ( (r.result % 2) !== 0 );
      r.count = r.success ? 1 : 0;
    }
  }

  /* -------------------------------------------- */

  /**
   * Deduct the number of failures from the dice result, counting each failure as -1
   * Failures are identified relative to some target, or relative to the lowest possible value if no target is given.
   * Applying a deduct-failures modifier to the results counts all failed results as -1.
   *
   * 6d6df      Subtract the number of dice which rolled a 1 from the non-failed total.
   * 6d6cs>3df  Subtract the number of dice which rolled a 3 or less from the non-failed count.
   * 6d6cf<3df  Subtract the number of dice which rolled less than 3 from the non-failed count.
   *
   * @param {string} modifier     The matched modifier query
   */
  deductFailures(modifier) {
    const rgx = /(?:df)([<>=]+)?([0-9]+)?/i;
    const match = modifier.match(rgx);
    if ( !match ) return false;
    let [comparison, target] = match.slice(1);
    if ( comparison || target ) {
      comparison = comparison || "=";
      target = parseInt(target) ?? 1;
    }
    DiceTerm._applyDeduct(this.results, comparison, target, {deductFailure: true});
  }

  /* -------------------------------------------- */

  /**
   * Subtract the value of failed dice from the non-failed total, where each failure counts as its negative value.
   * Failures are identified relative to some target, or relative to the lowest possible value if no target is given.
   * Applying a deduct-failures modifier to the results counts all failed results as -1.
   *
   * 6d6df<3    Subtract the value of results which rolled less than 3 from the non-failed total.
   *
   * @param {string} modifier     The matched modifier query
   */
  subtractFailures(modifier) {
    const rgx = /(?:sf)([<>=]+)?([0-9]+)?/i;
    const match = modifier.match(rgx);
    if ( !match ) return false;
    let [comparison, target] = match.slice(1);
    if ( comparison || target ) {
      comparison = comparison || "=";
      target = parseInt(target) ?? 1;
    }
    DiceTerm._applyDeduct(this.results, comparison, target, {invertFailure: true});
  }

  /* -------------------------------------------- */

  /**
   * Subtract the total value of the DiceTerm from a target value, treating the difference as the final total.
   * Example: 6d6ms>12    Roll 6d6 and subtract 12 from the resulting total.
   * @param {string} modifier     The matched modifier query
   */
  marginSuccess(modifier) {
    const rgx = /(?:ms)([<>=]+)?([0-9]+)?/i;
    const match = modifier.match(rgx);
    if ( !match ) return false;
    let [comparison, target] = match.slice(1);
    target = parseInt(target);
    if ( [">", ">=", "=", undefined].includes(comparison) ) this.options.marginSuccess = target;
    else if ( ["<", "<="].includes(comparison) ) this.options.marginFailure = target;
  }

  /* -------------------------------------------- */

  /**
   * Constrain each rolled result to be at least some minimum value.
   * Example: 6d6min2    Roll 6d6, each result must be at least 2
   * @param {string} modifier     The matched modifier query
   */
  minimum(modifier) {
    const rgx = /(?:min)([0-9]+)/i;
    const match = modifier.match(rgx);
    if ( !match ) return false;
    let [target] = match.slice(1);
    target = parseInt(target);
    for ( const r of this.results ) {
      if ( r.result < target ) {
        r.count = target;
        r.rerolled = true;
      }
    }
  }

  /* -------------------------------------------- */

  /**
   * Constrain each rolled result to be at most some maximum value.
   * Example: 6d6max5    Roll 6d6, each result must be at most 5
   * @param {string} modifier     The matched modifier query
   */
  maximum(modifier) {
    const rgx = /(?:max)([0-9]+)/i;
    const match = modifier.match(rgx);
    if ( !match ) return false;
    let [target] = match.slice(1);
    target = parseInt(target);
    for ( const r of this.results ) {
      if ( r.result > target ) {
        r.count = target;
        r.rerolled = true;
      }
    }
  }
}

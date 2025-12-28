import Roll from "../roll.mjs";
import RollTerm from "./term.mjs";

/**
 * @import {DiceTermResult} from "../_types.mjs";
 */

/**
 * An abstract base class for any type of RollTerm which involves randomized input from dice, coins, or other devices.
 */
export default class DiceTerm extends RollTerm {
  /**
   * @param {object} termData                  Data used to create the Dice Term, including the following:
   * @param {number|Roll} [termData.number=1]  The number of dice of this term to roll, before modifiers are applied, or
   *                                           a Roll instance that will be evaluated to a number.
   * @param {number|Roll} [termData.faces=6]   The number of faces on each die of this type, or a Roll instance that
   *                                           will be evaluated to a number.
   * @param {string} termData.method           The resolution method used to resolve DiceTerm.
   * @param {string[]} [termData.modifiers]    An array of modifiers applied to the results
   * @param {DiceTermResult[]} [termData.results]      An optional array of pre-cast results for the term
   * @param {object} [termData.options]        Additional options that modify the term
   */
  constructor({number=1, faces=6, method, modifiers=[], results=[], options={}}) {
    super({options});

    this._number = number;
    this._faces = faces;
    this.method = method;
    this.modifiers = modifiers;
    this.results = results;

    // If results were explicitly passed, the term has already been evaluated
    if ( results.length ) this._evaluated = true;
  }

  /* -------------------------------------------- */

  /**
   * The resolution method used to resolve this DiceTerm.
   * @type {string}
   */
  get method() {
    return this.#method;
  }

  set method(method) {
    if ( this.#method || !(method in CONFIG.Dice.fulfillment.methods) ) return;
    this.#method = method;
  }

  #method;

  /**
   * An Array of dice term modifiers which are applied
   * @type {string[]}
   */
  modifiers;

  /**
   * The array of dice term results which have been rolled
   * @type {DiceTermResult[]}
   */
  results;

  /**
   * Define the denomination string used to register this DiceTerm type in CONFIG.Dice.terms
   * @type {string}
   */
  static DENOMINATION = "";

  /**
   * Define the named modifiers that can be applied for this particular DiceTerm type.
   * @type {Record<string, string|Function>}
   */
  static MODIFIERS = {};

  /**
   * A regular expression pattern which captures the full set of term modifiers
   * Anything until a space, group symbol, or arithmetic operator
   * @type {string}
   */
  static MODIFIERS_REGEXP_STRING = "([^ (){}[\\]+\\-*/]+)";

  /**
   * A regular expression used to separate individual modifiers
   * @type {RegExp}
   */
  static MODIFIER_REGEXP = /([A-z]+)([^A-z\s()+\-*/]+)?/g;

  /** @inheritDoc */
  static REGEXP = new RegExp(`^([0-9]+)?[dD]([A-z]|[0-9]+)${this.MODIFIERS_REGEXP_STRING}?${this.FLAVOR_REGEXP_STRING}?$`);

  /** @inheritDoc */
  static SERIALIZE_ATTRIBUTES = ["number", "faces", "modifiers", "results", "method"];

  /* -------------------------------------------- */
  /*  Dice Term Attributes                        */
  /* -------------------------------------------- */

  /**
   * The number of dice of this term to roll. Returns undefined if the number is a complex term that has not yet been
   * evaluated.
   * @type {number|void}
   */
  get number() {
    if ( typeof this._number === "number" ) return this._number;
    else if ( this._number?._evaluated ) return this._number.total;
  }

  /**
   * The number of dice of this term to roll, before modifiers are applied, or a Roll instance that will be evaluated to
   * a number.
   * @type {number|Roll}
   * @protected
   */
  _number;

  /**
   * @param {number|Roll} value
   */
  set number(value) {
    this._number = value;
  }

  /* -------------------------------------------- */

  /**
   * The number of faces on the die. Returns undefined if the faces are represented as a complex term that has not yet
   * been evaluated.
   * @type {number|void}
   */
  get faces() {
    if ( typeof this._faces === "number" ) return this._faces;
    else if ( this._faces?._evaluated ) return this._faces.total;
  }

  /**
   * The number of faces on the die, or a Roll instance that will be evaluated to a number.
   * @type {number|Roll}
   * @protected
   */
  _faces;

  /**
   * @param {number|Roll} value
   */
  set faces(value) {
    this._faces = value;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  get expression() {
    const x = this.constructor.DENOMINATION === "d" ? this._faces : this.constructor.DENOMINATION;
    return `${this._number}d${x}${this.modifiers.join("")}`;
  }

  /* -------------------------------------------- */

  /**
   * The denomination of this DiceTerm instance.
   * @type {string}
   */
  get denomination() {
    return this.constructor.DENOMINATION;
  }

  /* -------------------------------------------- */

  /**
   * An array of additional DiceTerm instances involved in resolving this DiceTerm.
   * @type {DiceTerm[]}
   */
  get dice() {
    const dice = [];
    if ( this._number instanceof Roll ) dice.push(...this._number.dice);
    if ( this._faces instanceof Roll ) dice.push(...this._faces.dice);
    return dice;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  get total() {
    if ( !this._evaluated ) return undefined;
    let total = this.results.reduce((t, r) => {
      if ( !r.active ) return t;
      if ( r.count !== undefined ) return t + r.count;
      else return t + r.result;
    }, 0);
    if ( this.number < 0 ) total *= -1;
    return total;
  }

  /* -------------------------------------------- */

  /**
   * Return an array of rolled values which are still active within this term
   * @type {number[]}
   */
  get values() {
    return this.results.reduce((arr, r) => {
      if ( !r.active ) return arr;
      arr.push(r.result);
      return arr;
    }, []);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  get isDeterministic() {
    return false;
  }

  /* -------------------------------------------- */
  /*  Dice Term Methods                           */
  /* -------------------------------------------- */

  /**
   * Alter the DiceTerm by adding or multiplying the number of dice which are rolled
   * @param {number} multiply   A factor to multiply. Dice are multiplied before any additions.
   * @param {number} add        A number of dice to add. Dice are added after multiplication.
   * @returns {DiceTerm}        The altered term
   */
  alter(multiply, add) {
    if ( this._evaluated ) throw new Error("You may not alter a DiceTerm after it has already been evaluated");
    multiply = Number.isFinite(multiply) && (multiply >= 0) ? multiply : 1;
    add = Number.isInteger(add) ? add : 0;
    if ( multiply >= 0 ) {
      if ( this._number instanceof Roll ) this._number = Roll.create(`(${this._number} * ${multiply})`);
      else this._number = Math.round(this.number * multiply);
    }
    if ( add ) {
      if ( this._number instanceof Roll ) this._number = Roll.create(`(${this._number} + ${add})`);
      else this._number += add;
    }
    return this;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _evaluate(options={}) {
    if ( RollTerm.isDeterministic(this, options) ) return this._evaluateSync(options);
    return this._evaluateAsync(options);
  }

  /* -------------------------------------------- */

  /**
   * Evaluate this dice term asynchronously.
   * @param {object} [options]  Options forwarded to inner Roll evaluation.
   * @returns {Promise<DiceTerm>}
   * @protected
   */
  async _evaluateAsync(options={}) {
    for ( const roll of [this._faces, this._number] ) {
      if ( !(roll instanceof Roll) ) continue;
      if ( this._root ) roll._root = this._root;
      await roll.evaluate(options);
    }
    if ( Math.abs(this.number) > 999 ) {
      throw new Error("You may not evaluate a DiceTerm with more than 999 requested results");
    }
    // If this term was an intermediate term, it has not yet been added to the resolver, so we add it here.
    if ( this.resolver && !this._id ) await this.resolver.addTerm(this);
    for ( let n = this.results.length; n < Math.abs(this.number); n++ ) await this.roll(options);
    await this._evaluateModifiers();
    return this;
  }

  /* -------------------------------------------- */

  /**
   * Evaluate deterministic values of this term synchronously.
   * @param {object} [options]
   * @param {boolean} [options.maximize]  Force the result to be maximized.
   * @param {boolean} [options.minimize]  Force the result to be minimized.
   * @param {boolean} [options.strict]    Throw an error if attempting to evaluate a die term in a way that cannot be
   *                                      done synchronously.
   * @returns {DiceTerm}
   * @protected
   */
  _evaluateSync(options={}) {
    if ( this._faces instanceof Roll ) this._faces.evaluateSync(options);
    if ( this._number instanceof Roll ) this._number.evaluateSync(options);
    if ( Math.abs(this.number) > 999 ) {
      throw new Error("You may not evaluate a DiceTerm with more than 999 requested results");
    }
    for ( let n = this.results.length; n < Math.abs(this.number); n++ ) {
      const roll = { active: true };
      if ( options.minimize ) roll.result = Math.min(1, this.faces);
      else if ( options.maximize ) roll.result = this.faces;
      else if ( options.strict ) throw new Error("Cannot synchronously evaluate a non-deterministic term.");
      else continue;
      this.results.push(roll);
    }
    return this;
  }

  /* -------------------------------------------- */

  /**
   * Roll the DiceTerm by mapping a random uniform draw against the faces of the dice term.
   * @param {object} [options={}]                 Options which modify how a random result is produced
   * @param {boolean} [options.minimize=false]    Minimize the result, obtaining the smallest possible value.
   * @param {boolean} [options.maximize=false]    Maximize the result, obtaining the largest possible value.
   * @returns {Promise<DiceTermResult>}           The produced result
   */
  async roll({minimize=false, maximize=false, ...options}={}) {
    const roll = {result: undefined, active: true};
    roll.result = await this._roll(options);
    if ( minimize ) roll.result = Math.min(1, this.faces);
    else if ( maximize ) roll.result = this.faces;
    else if ( roll.result === undefined ) roll.result = this.randomFace();
    this.results.push(roll);
    return roll;
  }

  /* -------------------------------------------- */

  /**
   * Generate a roll result value for this DiceTerm based on its fulfillment method.
   * @param {object} [options]        Options forwarded to the fulfillment method handler.
   * @returns {Promise<number|void>}  Returns a Promise that resolves to the fulfilled number, or undefined if it could
   *                                  not be fulfilled.
   * @protected
   */
  async _roll(options={}) {
    return this.#invokeFulfillmentHandler(options);
  }

  /* -------------------------------------------- */

  /**
   * Invoke the configured fulfillment handler for this term to produce a result value.
   * @param {object} [options]        Options forwarded to the fulfillment method handler.
   * @returns {Promise<number|void>}  Returns a Promise that resolves to the fulfilled number, or undefined if it could
   *                                  not be fulfilled.
   */
  async #invokeFulfillmentHandler(options={}) {
    const config = game.settings.get("core", Roll.DICE_CONFIGURATION_SETTING);
    const method = config[this.denomination] || CONFIG.Dice.fulfillment.defaultMethod;
    if ( (method === "manual") && !game.user.hasPermission("MANUAL_ROLLS") ) return;
    const { handler, interactive } = CONFIG.Dice.fulfillment.methods[method] ?? {};
    if ( interactive && this.resolver ) return this.resolver.resolveResult(this, method, options);
    return handler?.(this, options);
  }

  /* -------------------------------------------- */

  /**
   * Maps a randomly-generated value in the interval [0, 1) to a face value on the die.
   * @param {number} randomUniform  A value to map. Must be in the interval [0, 1).
   * @returns {number}              The face value.
   */
  mapRandomFace(randomUniform) {
    return Math.ceil((1 - randomUniform) * this.faces);
  }

  /* -------------------------------------------- */

  /**
   * Generate a random face value for this die using the configured PRNG.
   * @returns {number}
   */
  randomFace() {
    return this.mapRandomFace(CONFIG.Dice.randomUniform());
  }

  /* -------------------------------------------- */

  /**
   * Return a string used as the label for each rolled result
   * @param {DiceTermResult} result     The rolled result
   * @returns {string}                   The result label
   */
  getResultLabel(result) {
    return String(result.result);
  }

  /* -------------------------------------------- */

  /**
   * Get the CSS classes that should be used to display each rolled result
   * @param {DiceTermResult} result The rolled result
   * @returns {(string|null)[]}     The desired classes
   */
  getResultCSS(result) {
    const hasSuccess = result.success !== undefined;
    const hasFailure = result.failure !== undefined;
    const isMax = result.result === this.faces;
    const isMin = result.result === 1;
    return [
      this.constructor.name.toLowerCase(),
      `d${this.faces}`,
      result.success ? "success" : null,
      result.failure ? "failure" : null,
      result.rerolled ? "rerolled" : null,
      result.exploded ? "exploded" : null,
      result.discarded ? "discarded" : null,
      !(hasSuccess || hasFailure) && isMin ? "min" : null,
      !(hasSuccess || hasFailure) && isMax ? "max" : null
    ];
  }

  /* -------------------------------------------- */

  /**
   * Render the tooltip HTML for a Roll instance
   * @returns {object}      The data object used to render the default tooltip template for this DiceTerm
   */
  getTooltipData() {
    const { total, faces, flavor } = this;
    const method = CONFIG.Dice.fulfillment.methods[this.method];
    const icon = method?.interactive ? (method.icon ?? '<i class="fa-solid fa-bluetooth"></i>') : null;
    return {
      total, faces, flavor, icon,
      method: method?.label,
      formula: this.expression,
      rolls: this.results.map(r => {
        return {
          result: this.getResultLabel(r),
          classes: this.getResultCSS(r).filterJoin(" ")
        };
      })
    };
  }

  /* -------------------------------------------- */
  /*  Modifier Methods                            */
  /* -------------------------------------------- */

  /**
   * Sequentially evaluate each dice roll modifier by passing the term to its evaluation function
   * Augment or modify the results array.
   * @internal
   */
  async _evaluateModifiers() {
    const cls = this.constructor;
    const requested = foundry.utils.deepClone(this.modifiers);
    this.modifiers = [];

    // Sort modifiers from longest to shortest to ensure that the matching algorithm greedily matches the longest
    // prefixes first.
    const allModifiers = Object.keys(cls.MODIFIERS).sort((a, b) => b.length - a.length);

    // Iterate over requested modifiers
    for ( const m of requested ) {
      let command = m.match(/[A-z]+/)[0].toLowerCase();

      // Matched command
      if ( command in cls.MODIFIERS ) {
        await this._evaluateModifier(command, m);
        continue;
      }

      // Unmatched compound command
      while ( command ) {
        let matched = false;
        for ( const modifier of allModifiers ) {
          if ( command.startsWith(modifier) ) {
            matched = true;
            await this._evaluateModifier(modifier, modifier);
            command = command.replace(modifier, "");
            break;
          }
        }
        if ( !matched ) command = "";
      }
    }
  }

  /* -------------------------------------------- */

  /**
   * Asynchronously evaluate a single modifier command, recording it in the array of evaluated modifiers
   * @param {string} command        The parsed modifier command
   * @param {string} modifier       The full modifier request
   * @internal
   */
  async _evaluateModifier(command, modifier) {
    let fn = this.constructor.MODIFIERS[command];
    if ( typeof fn === "string" ) fn = this[fn];
    if ( fn instanceof Function ) {
      const result = await fn.call(this, modifier);
      const earlyReturn = (result === false) || (result === this); // Handling this is backwards compatibility
      if ( !earlyReturn ) this.modifiers.push(modifier.toLowerCase());
    }
  }

  /* -------------------------------------------- */

  /**
   * A helper comparison function.
   * Returns a boolean depending on whether the result compares favorably against the target.
   * @param {number} result         The result being compared
   * @param {string} comparison     The comparison operator in [=,&lt;,&lt;=,>,>=]
   * @param {number} target         The target value
   * @returns {boolean}             Is the comparison true?
   */
  static compareResult(result, comparison, target) {
    switch ( comparison ) {
      case "=":
        return result === target;
      case "<":
        return result < target;
      case "<=":
        return result <= target;
      case ">":
        return result > target;
      case ">=":
        return result >= target;
    }
  }

  /* -------------------------------------------- */

  /**
   * A helper method to modify the results array of a dice term by flagging certain results are kept or dropped.
   * @param {object[]} results      The results array
   * @param {number} number         The number to keep or drop
   * @param {object} [options]
   * @param {boolean} [options.keep]        Keep results?
   * @param {boolean} [options.highest]     Keep the highest?
   * @returns {object[]}            The modified results array
   */
  static _keepOrDrop(results, number, {keep=true, highest=true}={}) {

    // Sort remaining active results in ascending (keep) or descending (drop) order
    const ascending = keep === highest;
    const values = results.reduce((arr, r) => {
      if ( r.active ) arr.push(r.result);
      return arr;
    }, []).sort((a, b) => ascending ? a - b : b - a);

    // Determine the cut point, beyond which to discard
    number = Math.clamp(keep ? values.length - number : number, 0, values.length);
    const cut = values[number];

    // Track progress
    let discarded = 0;
    const ties = [];
    const comp = ascending ? "<" : ">";

    // First mark results on the wrong side of the cut as discarded
    results.forEach(r => {
      if ( !r.active ) return;  // Skip results which have already been discarded
      const discard = this.compareResult(r.result, comp, cut);
      if ( discard ) {
        r.discarded = true;
        r.active = false;
        discarded++;
      }
      else if ( r.result === cut ) ties.push(r);
    });

    // Next discard ties until we have reached the target
    ties.forEach(r => {
      if ( discarded < number ) {
        r.discarded = true;
        r.active = false;
        discarded++;
      }
    });
    return results;
  }

  /* -------------------------------------------- */

  /**
   * A reusable helper function to handle the identification and deduction of failures
   */
  static _applyCount(results, comparison, target, {flagSuccess=false, flagFailure=false}={}) {
    for ( const r of results ) {
      const success = this.compareResult(r.result, comparison, target);
      if (flagSuccess) {
        r.success = success;
        if (success) delete r.failure;
      }
      else if (flagFailure ) {
        r.failure = success;
        if (success) delete r.success;
      }
      r.count = success ? 1 : 0;
    }
  }

  /* -------------------------------------------- */

  /**
   * A reusable helper function to handle the identification and deduction of failures
   */
  static _applyDeduct(results, comparison, target, {deductFailure=false, invertFailure=false}={}) {
    for ( const r of results ) {

      // Flag failures if a comparison was provided
      if (comparison) {
        const fail = this.compareResult(r.result, comparison, target);
        if ( fail ) {
          r.failure = true;
          delete r.success;
        }
      }

      // Otherwise treat successes as failures
      else {
        if ( r.success === false ) {
          r.failure = true;
          delete r.success;
        }
      }

      // Deduct failures
      if ( deductFailure ) {
        if ( r.failure ) r.count = -1;
      }
      else if ( invertFailure ) {
        if ( r.failure ) r.count = -1 * r.result;
      }
    }
  }

  /* -------------------------------------------- */
  /*  Factory Methods                             */
  /* -------------------------------------------- */

  /**
   * Determine whether a string expression matches this type of term
   * @param {string} expression               The expression to parse
   * @param {object} [options={}]             Additional options which customize the match
   * @param {boolean} [options.imputeNumber=true]  Allow the number of dice to be optional, i.e. "d6"
   * @returns {RegExpMatchArray|null}
   */
  static matchTerm(expression, {imputeNumber=true}={}) {
    const match = expression.match(this.REGEXP);
    if ( !match ) return null;
    if ( (match[1] === undefined) && !imputeNumber ) return null;
    return match;
  }

  /* -------------------------------------------- */

  /**
   * Construct a term of this type given a matched regular expression array.
   * @param {RegExpMatchArray} match          The matched regular expression array
   * @returns {DiceTerm}                      The constructed term
   */
  static fromMatch(match) {
    let [number, denomination, modifiers, flavor] = match.slice(1);

    // Get the denomination of DiceTerm
    denomination = denomination.toLowerCase();
    const cls = denomination in CONFIG.Dice.terms ? CONFIG.Dice.terms[denomination] : CONFIG.Dice.terms.d;
    if ( !foundry.utils.isSubclass(cls, foundry.dice.terms.DiceTerm) ) {
      throw new Error(`DiceTerm denomination ${denomination} not registered to CONFIG.Dice.terms as a valid DiceTerm class`);
    }

    // Get the term arguments
    number = Number.isNumeric(number) ? parseInt(number) : 1;
    const faces = Number.isNumeric(denomination) ? parseInt(denomination) : null;

    // Match modifiers
    modifiers = Array.from((modifiers || "").matchAll(this.MODIFIER_REGEXP)).map(m => m[0]);

    // Construct a term of the appropriate denomination
    return new cls({number, faces, modifiers, options: {flavor}});
  }

  /* -------------------------------------------- */

  /** @override */
  static fromParseNode(node) {
    let { number, faces } = node;
    let denomination = "d";
    if ( number === null ) number = 1;
    if ( number.class ) {
      number = Roll.defaultImplementation.fromTerms(Roll.defaultImplementation.instantiateAST(number));
    }
    if ( typeof faces === "string" ) denomination = faces.toLowerCase();
    else if ( faces.class ) {
      faces = Roll.defaultImplementation.fromTerms(Roll.defaultImplementation.instantiateAST(faces));
    }
    const modifiers = Array.from((node.modifiers || "").matchAll(this.MODIFIER_REGEXP)).map(([m]) => m);
    const cls = CONFIG.Dice.terms[denomination];
    const data = { ...node, number, modifiers, class: cls.name };
    if ( denomination === "d" ) data.faces = faces;
    return this.fromData(data);
  }

  /* -------------------------------------------- */
  /*  Serialization & Loading                     */
  /* -------------------------------------------- */

  /** @inheritDoc */
  toJSON() {
    const data = super.toJSON();
    if ( this._number instanceof Roll ) data._number = this._number.toJSON();
    if ( this._faces instanceof Roll ) data._faces = this._faces.toJSON();
    return data;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  static _fromData(data) {
    if ( data._number ) data.number = Roll.fromData(data._number);
    if ( data._faces ) data.faces = Roll.fromData(data._faces);
    return super._fromData(data);
  }
}

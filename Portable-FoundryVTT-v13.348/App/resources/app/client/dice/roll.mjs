/**
 * @import {DiceTerm, RollTerm} from "./terms/_module.mjs";
 * @import {RollOptions, RollParseNode} from "./_types.mjs";
 * @import RollResolver from "../applications/dice/roll-resolver.mjs";
 */

/**
 * An interface and API for constructing and evaluating dice rolls.
 * The basic structure for a dice roll is a string formula and an object of data against which to parse it.
 *
 * @example Attack with advantage
 * ```js
 * // Construct the Roll instance
 * let r = new Roll("2d20kh + @prof + @strMod", {prof: 2, strMod: 4});
 *
 * // The parsed terms of the roll formula
 * console.log(r.terms);    // [Die, OperatorTerm, NumericTerm, OperatorTerm, NumericTerm]
 *
 * // Execute the roll
 * await r.evaluate();
 *
 * // The resulting equation after it was rolled
 * console.log(r.result);   // 16 + 2 + 4
 *
 * // The total resulting from the roll
 * console.log(r.total);    // 22
 * ```
 */
export default class Roll {
  /**
   * @param {string} formula    The string formula to parse
   * @param {object} data       The data object against which to parse attributes within the formula
   * @param {RollOptions} [options]  Options modifying or describing the Roll
   */
  constructor(formula="", data={}, options={}) {
    if ( typeof formula !== "string" ) throw new Error(game.i18n.format("DICE.ErrorNotParsable", {formula}));
    this.data = this._prepareData(data);
    this.options = options;
    this.terms = this.constructor.parse(formula, this.data);
    this._formula = this.resetFormula();
  }

  /**
   * Dice Configuration setting name.
   * @readonly
   */
  static DICE_CONFIGURATION_SETTING = "diceConfiguration";

  /**
   * The original provided data object which substitutes into attributes of the roll formula.
   * @type {object}
   */
  data;

  /**
   * Options modifying or describing the Roll
   * @type {RollOptions}
   */
  options;

  /**
   * The identified terms of the Roll
   * @type {RollTerm[]}
   */
  terms;

  /**
   * An array of inner DiceTerms that were evaluated as part of the Roll evaluation
   * @type {DiceTerm[]}
   * @internal
   */
  _dice = [];

  /**
   * Store the original cleaned formula for the Roll, prior to any internal evaluation or simplification
   * @type {string}
   * @internal
   */
  _formula;

  /**
   * Track whether this Roll instance has been evaluated or not. Once evaluated the Roll is immutable.
   * @type {boolean}
   * @internal
   */
  _evaluated = false;

  /**
   * Cache the numeric total generated through evaluation of the Roll.
   * @type {number}
   * @internal
   */
  _total;

  /**
   * A reference to the Roll at the root of the evaluation tree.
   * @type {Roll}
   * @internal
   */
  _root;

  /**
   * A reference to the RollResolver app being used to externally resolve this Roll.
   * @type {RollResolver}
   * @internal
   */
  _resolver;

  /**
   * A Proxy environment for safely evaluating a string using only available Math functions
   * @type {Math}
   */
  static MATH_PROXY = new Proxy(Math, {
    has: () => true, // Include everything
    get: (t, k) => k === Symbol.unscopables ? undefined : t[k],
    set: () => console.error("You may not set properties of the Roll.MATH_PROXY environment") // No-op
  });

  /**
   * The HTML template path used to render a complete Roll object to the chat log
   * @type {string}
   */
  static CHAT_TEMPLATE = "templates/dice/roll.hbs";

  /**
   * The HTML template used to render an expanded Roll tooltip to the chat log
   * @type {string}
   */
  static TOOLTIP_TEMPLATE = "templates/dice/tooltip.hbs";

  /**
   * A mapping of Roll instances to currently-active resolvers.
   * @type {Map<Roll, RollResolver>}
   */
  static RESOLVERS = new Map();

  /* -------------------------------------------- */

  /**
   * Prepare the data structure used for the Roll.
   * This is factored out to allow for custom Roll classes to do special data preparation using provided input.
   * @param {object} data   Provided roll data
   * @returns {object}      The prepared data object
   * @protected
   */
  _prepareData(data) {
    return data;
  }

  /* -------------------------------------------- */
  /*  Roll Attributes                             */
  /* -------------------------------------------- */

  /**
   * Return an Array of the individual DiceTerm instances contained within this Roll.
   * @type {DiceTerm[]}
   */
  get dice() {
    return this._dice.concat(this.terms.flatMap(t => {
      const dice = [];
      dice.push(...(t.dice ?? []));
      if ( t instanceof foundry.dice.terms.DiceTerm ) dice.push(t);
      return dice;
    }));
  }

  /* -------------------------------------------- */

  /**
   * Return a standardized representation for the displayed formula associated with this Roll.
   * @type {string}
   */
  get formula() {
    return this.constructor.getFormula(this.terms);
  }

  /* -------------------------------------------- */

  /**
   * The resulting arithmetic expression after rolls have been evaluated
   * @type {string}
   */
  get result() {
    return this.terms.map(t => t.total).join("");
  }

  /* -------------------------------------------- */

  /**
   * Return the total result of the Roll expression if it has been evaluated.
   * @type {number}
   */
  get total() {
    return Number(this._total) || 0;
  }

  /* -------------------------------------------- */

  /**
   * Return the arbitrary product of evaluating this Roll.
   * @returns {any}
   */
  get product() {
    return this._total;
  }

  /* -------------------------------------------- */

  /**
   * Whether this Roll contains entirely deterministic terms or whether there is some randomness.
   * @type {boolean}
   */
  get isDeterministic() {
    return this.terms.every(t => t.isDeterministic);
  }

  /* -------------------------------------------- */
  /*  Roll Instance Methods                       */
  /* -------------------------------------------- */

  /**
   * Alter the Roll expression by adding or multiplying the number of dice which are rolled
   * @param {number} multiply   A factor to multiply. Dice are multiplied before any additions.
   * @param {number} add        A number of dice to add. Dice are added after multiplication.
   * @param {boolean} [multiplyNumeric]  Apply multiplication factor to numeric scalar terms
   * @returns {Roll}            The altered Roll expression
   */
  alter(multiply, add, {multiplyNumeric=false}={}) {
    if ( this._evaluated ) throw new Error("You may not alter a Roll which has already been evaluated");

    // Alter dice and numeric terms
    this.terms = this.terms.map(term => {
      if ( term instanceof foundry.dice.terms.DiceTerm ) return term.alter(multiply, add);
      else if ( (term instanceof foundry.dice.terms.NumericTerm) && multiplyNumeric ) term.number *= multiply;
      return term;
    });

    // Update the altered formula and return the altered Roll
    this.resetFormula();
    return this;
  }

  /* -------------------------------------------- */

  /**
   * Clone the Roll instance, returning a new Roll instance that has not yet been evaluated.
   * @returns {Roll}
   */
  clone() {
    return new this.constructor(this._formula, this.data, this.options);
  }

  /* -------------------------------------------- */

  /**
   * Execute the Roll asynchronously, replacing dice and evaluating the total result
   * @param {object} [options={}]                      Options which inform how the Roll is evaluated
   * @param {boolean} [options.minimize=false]         Minimize the result, obtaining the smallest possible value.
   * @param {boolean} [options.maximize=false]         Maximize the result, obtaining the largest possible value.
   * @param {boolean} [options.allowStrings=false]     If true, string terms will not cause an error to be thrown during
   *                                                   evaluation.
   * @param {boolean} [options.allowInteractive=true]  If false, force the use of non-interactive rolls and do not
   *                                                   prompt the user to make manual rolls.
   * @returns {Promise<Roll>}                          The evaluated Roll instance
   *
   * @example Evaluate a Roll expression
   * ```js
   * let r = new Roll("2d6 + 4 + 1d4");
   * await r.evaluate();
   * console.log(r.result); // 5 + 4 + 2
   * console.log(r.total);  // 11
   * ```
   */
  async evaluate({minimize=false, maximize=false, allowStrings=false, allowInteractive=true, ...options}={}) {
    if ( this._evaluated ) {
      throw new Error(`The ${this.constructor.name} has already been evaluated and is now immutable`);
    }
    this._evaluated = true;
    if ( CONFIG.debug.dice ) console.debug(`Evaluating roll with formula "${this.formula}"`);

    // Migration path for async rolls
    if ( "async" in options ) {
      foundry.utils.logCompatibilityWarning("The async option for Roll#evaluate has been removed. "
        + "Use Roll#evaluateSync for synchronous roll evaluation.");
    }
    return this._evaluate({minimize, maximize, allowStrings, allowInteractive});
  }

  /* -------------------------------------------- */

  /**
   * Execute the Roll synchronously, replacing dice and evaluating the total result.
   * @param {object} [options={}]
   * @param {boolean} [options.minimize=false]      Minimize the result, obtaining the smallest possible value.
   * @param {boolean} [options.maximize=false]      Maximize the result, obtaining the largest possible value.
   * @param {boolean} [options.strict=true]         Throw an Error if the Roll contains non-deterministic terms that
   *                                                cannot be evaluated synchronously. If this is set to false,
   *                                                non-deterministic terms will be ignored.
   * @param {boolean} [options.allowStrings=false]  If true, string terms will not cause an error to be thrown during
   *                                                evaluation.
   * @returns {Roll}                                The evaluated Roll instance.
   */
  evaluateSync({minimize=false, maximize=false, allowStrings=false, strict=true}={}) {
    if ( this._evaluated ) {
      throw new Error(`The ${this.constructor.name} has already been evaluated and is now immutable.`);
    }
    this._evaluated = true;
    if ( CONFIG.debug.dice ) console.debug(`Synchronously evaluating roll with formula "${this.formula}"`);
    return this._evaluateSync({minimize, maximize, allowStrings, strict});
  }

  /* -------------------------------------------- */

  /**
   * Evaluate the roll asynchronously.
   * @param {object} [options]                    Options which inform how evaluation is performed
   * @param {boolean} [options.minimize]          Force the result to be minimized
   * @param {boolean} [options.maximize]          Force the result to be maximized
   * @param {boolean} [options.allowStrings]      If true, string terms will not cause an error to be thrown during
   *                                              evaluation.
   * @param {boolean} [options.allowInteractive]  If false, force the use of digital rolls and do not prompt the user to
   *                                              make manual rolls.
   * @returns {Promise<Roll>}
   * @protected
   */
  async _evaluate(options={}) {
    // If the user has configured alternative dice fulfillment methods, prompt for the first pass of fulfillment here.
    let resolver;
    const { allowInteractive, minimize, maximize } = options;
    if ( !this._root && (allowInteractive !== false) && (maximize !== true) && (minimize !== true) ) {
      resolver = new this.constructor.resolverImplementation(this);
      this._resolver = resolver;
      await resolver.awaitFulfillment();
    }

    const ast = CONFIG.Dice.parser.toAST(this.terms);
    this._total = await this._evaluateASTAsync(ast, options);
    resolver?.close();
    return this;
  }

  /* -------------------------------------------- */

  /**
   * Evaluate an AST asynchronously.
   * @param {RollParseNode|RollTerm} node     The root node or term.
   * @param {object} [options]                Options which inform how evaluation is performed
   * @param {boolean} [options.minimize]      Force the result to be minimized
   * @param {boolean} [options.maximize]      Force the result to be maximized
   * @param {boolean} [options.allowStrings]  If true, string terms will not cause an error to be thrown during
   *                                          evaluation.
   * @returns {Promise<string|number>}
   * @protected
   */
  async _evaluateASTAsync(node, options={}) {
    if ( node.class !== "Node" ) {
      if ( !node._evaluated ) {
        node._root = this._root ?? this;
        await node.evaluate(options);
      }
      return node.total;
    }

    let [left, right] = node.operands;
    [left, right] = [await this._evaluateASTAsync(left, options), await this._evaluateASTAsync(right, options)];

    switch ( node.operator ) {
      case "-": return left - right;
      case "*": return left * right;
      case "/": return left / right;
      case "%": return left % right;

      // Treat an unknown operator as addition.
      default: return left + right;
    }
  }

  /* -------------------------------------------- */

  /**
   * Evaluate the roll synchronously.
   * @param {object} [options]                Options which inform how evaluation is performed
   * @param {boolean} [options.minimize]      Force the result to be minimized
   * @param {boolean} [options.maximize]      Force the result to be maximized
   * @param {boolean} [options.strict]        Throw an error if encountering a term that cannot be synchronously
   *                                          evaluated.
   * @param {boolean} [options.allowStrings]  If true, string terms will not cause an error to be thrown during
   *                                          evaluation.
   * @returns {Roll}
   * @protected
   */
  _evaluateSync(options={}) {
    const ast = CONFIG.Dice.parser.toAST(this.terms);
    this._total = this._evaluateASTSync(ast, options);
    return this;
  }

  /* -------------------------------------------- */

  /**
   * Evaluate an AST synchronously.
   * @param {RollParseNode|RollTerm} node     The root node or term.
   * @param {object} [options]                Options which inform how evaluation is performed
   * @param {boolean} [options.minimize]      Force the result to be minimized
   * @param {boolean} [options.maximize]      Force the result to be maximized
   * @param {boolean} [options.strict]        Throw an error if encountering a term that cannot be synchronously
   *                                          evaluated.
   * @param {boolean} [options.allowStrings]  If true, string terms will not cause an error to be thrown during
   *                                          evaluation.
   * @returns {string|number}
   * @protected
   */
  _evaluateASTSync(node, options={}) {
    const { maximize, minimize, strict } = options;
    if ( node.class !== "Node" ) {
      if ( node._evaluated ) return node.total;
      if ( foundry.dice.terms.RollTerm.isDeterministic(node, { maximize, minimize }) ) {
        node.evaluate(options);
        return node.total;
      }
      if ( strict ) throw new Error("This Roll contains terms that cannot be synchronously evaluated.");
      return 0;
    }

    let [left, right] = node.operands;
    [left, right] = [this._evaluateASTSync(left, options), this._evaluateASTSync(right, options)];

    switch ( node.operator ) {
      case "-": return left - right;
      case "*": return left * right;
      case "/": return left / right;
      case "%": return left % right;

      // Treat an unknown operator as addition.
      default: return left + right;
    }
  }

  /* -------------------------------------------- */

  /**
   * Safely evaluate the final total result for the Roll using its component terms.
   * @returns {number}    The evaluated total
   * @protected
   */
  _evaluateTotal() {
    const expression = this.terms.map(t => t.total).join(" ");
    const total = this.constructor.safeEval(expression);
    if ( !Number.isNumeric(total) ) {
      throw new Error(game.i18n.format("DICE.ErrorNonNumeric", {formula: this.formula}));
    }
    return total;
  }

  /* -------------------------------------------- */

  /**
   * Alias for evaluate.
   * @see {Roll#evaluate}
   * @param {object} options    Options passed to Roll#evaluate
   * @returns {Promise<Roll>}
   */
  async roll(options={}) {
    return this.evaluate(options);
  }

  /* -------------------------------------------- */

  /**
   * Create a new Roll object using the original provided formula and data.
   * Each roll is immutable, so this method returns a new Roll instance using the same data.
   * @param {object} [options={}]  Evaluation options passed to Roll#evaluate
   * @returns {Promise<Roll>}      A new Roll object, rolled using the same formula and data
   */
  async reroll(options={}) {
    const r = this.clone();
    return r.evaluate(options);
  }

  /* -------------------------------------------- */

  /**
   * Recompile the formula string that represents this Roll instance from its component terms.
   * @returns {string}                The re-compiled formula
   */
  resetFormula() {
    return this._formula = this.constructor.getFormula(this.terms);
  }

  /* -------------------------------------------- */

  /**
   * Propagate flavor text across all terms that do not have any.
   * @param {string} flavor  The flavor text.
   */
  propagateFlavor(flavor) {
    if ( !flavor ) return;
    this.terms.forEach(t => t.options.flavor ??= flavor);
  }

  /* -------------------------------------------- */

  /** @override */
  toString() {
    return this._formula;
  }

  /* -------------------------------------------- */
  /*  Static Class Methods                        */
  /* -------------------------------------------- */

  /**
   * A factory method which constructs a Roll instance using the default configured Roll class.
   * @param {string} formula        The formula used to create the Roll instance
   * @param {object} [data={}]      The data object which provides component data for the formula
   * @param {object} [options={}]   Additional options which modify or describe this Roll
   * @returns {Roll}                The constructed Roll instance
   */
  static create(formula, data={}, options={}) {
    const cls = CONFIG.Dice.rolls[0];
    return new cls(formula, data, options);
  }

  /* -------------------------------------------- */

  /**
   * Get the default configured Roll class.
   * @returns {typeof Roll}
   */
  static get defaultImplementation() {
    return CONFIG.Dice.rolls[0];
  }

  /* -------------------------------------------- */

  /**
   * Retrieve the appropriate resolver implementation based on the user's configuration.
   * @returns {typeof RollResolver}
   */
  static get resolverImplementation() {
    const config = game.settings.get("core", Roll.DICE_CONFIGURATION_SETTING);
    const methods = new Set(Object.values(config).filter(method => {
      if ( !method || (method === "manual") ) return false;
      return CONFIG.Dice.fulfillment.methods[method]?.interactive;
    }));

    // If there is more than one interactive method configured, use the default resolver which has a combined, method-
    // agnostic interface.
    if ( methods.size !== 1 ) return foundry.applications.dice.RollResolver;

    // Otherwise use the specific resolver configured for that method, if any.
    const method = CONFIG.Dice.fulfillment.methods[methods.first()];
    return method.resolver ?? foundry.applications.dice.RollResolver;
  }

  /* -------------------------------------------- */

  /**
   * Transform an array of RollTerm objects into a cleaned string formula representation.
   * @param {RollTerm[]} terms      An array of terms to represent as a formula
   * @returns {string}              The string representation of the formula
   */
  static getFormula(terms) {
    return terms.map(t => t.formula).join("");
  }

  /* -------------------------------------------- */

  /**
   * A sandbox-safe evaluation function to execute user-input code with access to scoped Math methods.
   * @param {string} expression   The input string expression
   * @returns {number}            The numeric evaluated result
   */
  static safeEval(expression) {
    let result;
    try {
      // eslint-disable-next-line no-new-func
      const evl = new Function("sandbox", `with (sandbox) { return ${expression}}`);
      result = evl(this.MATH_PROXY);
    } catch(err) {
      result = undefined;
    }
    if ( !Number.isNumeric(result) ) {
      throw new Error(`Roll.safeEval produced a non-numeric result from expression "${expression}"`);
    }
    return result;
  }

  /* -------------------------------------------- */

  /**
   * After parenthetical and arithmetic terms have been resolved, we need to simplify the remaining expression.
   * Any remaining string terms need to be combined with adjacent non-operators in order to construct parsable terms.
   * @param {RollTerm[]} terms      An array of terms which is eligible for simplification
   * @returns {RollTerm[]}          An array of simplified terms
   */
  static simplifyTerms(terms) {
    const {OperatorTerm, StringTerm} = foundry.dice.terms;

    // Simplify terms by combining with pending strings
    let simplified = terms.reduce((terms, term) => {
      const prior = terms[terms.length - 1];
      const isOperator = term instanceof OperatorTerm;

      // Combine a non-operator term with prior StringTerm
      if ( !isOperator && (prior instanceof StringTerm) ) {
        prior.term += term.total;
        foundry.utils.mergeObject(prior.options, term.options);
        return terms;
      }

      // Combine StringTerm with a prior non-operator term
      const priorOperator = prior instanceof OperatorTerm;
      if ( prior && !priorOperator && (term instanceof StringTerm) ) {
        term.term = String(prior.total) + term.term;
        foundry.utils.mergeObject(term.options, prior.options);
        terms[terms.length - 1] = term;
        return terms;
      }

      // Otherwise continue
      terms.push(term);
      return terms;
    }, []);

    // Convert remaining String terms to a RollTerm which can be evaluated
    simplified = simplified.map(term => {
      if ( !(term instanceof StringTerm) ) return term;
      const t = this._classifyStringTerm(term.formula, {intermediate: false});
      t.options = foundry.utils.mergeObject(term.options, t.options, {inplace: false});
      return t;
    });

    // Eliminate leading or trailing arithmetic
    if ( (simplified[0] instanceof OperatorTerm) && (simplified[0].operator !== "-") ) simplified.shift();
    if ( simplified.at(-1) instanceof OperatorTerm ) simplified.pop();
    return simplified;
  }

  /* -------------------------------------------- */

  /**
   * Simulate a roll and evaluate the distribution of returned results
   * @param {string} formula      The Roll expression to simulate
   * @param {number} n            The number of simulations
   * @returns {Promise<number[]>} The rolled totals
   */
  static async simulate(formula, n=10000) {
    const results = await Promise.all([...Array(n)].map(async () => {
      const r = new this(formula);
      return (await r.evaluate({allowInteractive: false})).total;
    }, []));
    const summary = results.reduce((sum, v) => {
      sum.total = sum.total + v;
      if ( (sum.min === null) || (v < sum.min) ) sum.min = v;
      if ( (sum.max === null) || (v > sum.max) ) sum.max = v;
      return sum;
    }, {total: 0, min: null, max: null});
    summary.mean = summary.total / n;
    console.log(`Formula: ${formula} | Iterations: ${n} | Mean: ${summary.mean} | Min: ${summary.min} | Max: ${summary.max}`);
    return results;
  }

  /* -------------------------------------------- */

  /**
   * Register an externally-fulfilled result with an active RollResolver.
   * @param {string} method        The fulfillment method.
   * @param {string} denomination  The die denomination being fulfilled.
   * @param {number} result        The obtained result.
   * @returns {boolean|void}       Whether the result was consumed. Returns undefined if no resolver was available.
   */
  static registerResult(method, denomination, result) {
    // TODO: Currently this only takes the first Resolver, but the logic for which Resolver to use could be improved.
    for ( const app of foundry.applications.instances.values() ) {
      if ( (app instanceof foundry.applications.dice.RollResolver) && app.rendered ) {
        return app.registerResult(method, denomination, result);
      }
    }
  }

  /* -------------------------------------------- */
  /*  Roll Formula Parsing                        */
  /* -------------------------------------------- */

  /**
   * Parse a formula expression using the compiled peggy grammar.
   * @param {string} formula  The original string expression to parse.
   * @param {object} data     A data object used to substitute for attributes in the formula.
   * @returns {RollTerm[]}
   */
  static parse(formula="", data={}) {
    if ( typeof formula !== "string" ) throw new Error(game.i18n.format("DICE.ErrorNotParsable", {formula}));
    if ( !formula ) return [];

    // Step 1: Replace formula and remove all spaces.
    const replaced = this.replaceFormulaData(formula, data, { missing: "0" });

    // Step 2: Use configured RollParser to parse the formula into a parse tree.
    const tree = foundry.dice.RollGrammar.parse(replaced);

    // Step 3: Flatten the tree into infix notation and instantiate all the nodes as RollTerm instances.
    return this.instantiateAST(tree);
  }

  /* -------------------------------------------- */

  /**
   * Instantiate the nodes in an AST sub-tree into RollTerm instances.
   * @param {RollParseNode} ast  The root of the AST sub-tree.
   * @returns {RollTerm[]}
   */
  static instantiateAST(ast) {
    return CONFIG.Dice.parser.flattenTree(ast).map(node => {
      const cls = foundry.dice.terms[node.class] ?? foundry.dice.terms.RollTerm;
      return cls.fromParseNode(node);
    });
  }

  /* -------------------------------------------- */

  /**
   * Replace referenced data attributes in the roll formula with values from the provided data.
   * Data references in the formula use the \@attr syntax and would reference the corresponding attr key.
   *
   * @param {string} formula          The original formula within which to replace
   * @param {object} data             The data object which provides replacements
   * @param {object} [options]        Options which modify formula replacement
   * @param {string} [options.missing]      The value that should be assigned to any unmatched keys.
   *                                        If null, the unmatched key is left as-is.
   * @param {boolean} [options.warn=false]  Display a warning notification when encountering an un-matched key.
   */
  static replaceFormulaData(formula, data, {missing, warn=false}={}) {
    const dataRgx = new RegExp(/@([a-z.0-9_-]+)/gi);
    return formula.replace(dataRgx, (match, term) => {
      let value = foundry.utils.getProperty(data, term);
      if ( value == null ) {
        if ( warn && ui.notifications ) ui.notifications.warn("DICE.WarnMissingData", {format: {match}});
        return (missing !== undefined) ? String(missing) : match;
      }
      switch ( foundry.utils.getType(value) ) {
        case "string": return value.trim();
        case "number": case "boolean": return String(value);
        case "Unknown":
          if ( value.toString instanceof Function ) return value.toString();
          break;
        case "Set": value = Array.from(value); break;
        case "Map": value = Object.fromEntries(Array.from(value)); break;
      }
      return `ᚖ${JSON.stringify(value)}ᚖ`;
    });
  }

  /* -------------------------------------------- */

  /**
   * Validate that a provided roll formula can represent a valid
   * @param {string} formula    A candidate formula to validate
   * @returns {boolean}         Is the provided input a valid dice formula?
   */
  static validate(formula) {
    if ( typeof formula !== "string" ) return false;

    // Replace all data references with an arbitrary number
    formula = formula.replace(/@([a-z.0-9_-]+)/gi, "1");

    // Attempt to evaluate the roll
    try {
      const r = new this(formula);
      r.evaluateSync({ strict: false });
      return true;
    }

    // If we weren't able to evaluate, the formula is invalid
    catch(err) {
      return false;
    }
  }

  /* -------------------------------------------- */

  /**
   * Determine which of the given terms require external fulfillment.
   * @param {RollTerm[]} terms  The terms.
   * @returns {DiceTerm[]}
   */
  static identifyFulfillableTerms(terms) {
    const fulfillable = [];
    const config = game.settings.get("core", Roll.DICE_CONFIGURATION_SETTING);
    const allowManual = game.user.hasPermission("MANUAL_ROLLS");

    /**
     * Determine if a given term should be externally fulfilled.
     * @param {RollTerm} term  The term.
     */
    const identifyTerm = term => {
      if ( !(term instanceof foundry.dice.terms.DiceTerm) || !term.number || !term.faces ) return;
      const method = config[term.denomination] || CONFIG.Dice.fulfillment.defaultMethod;
      if ( (method === "manual") && !allowManual ) return;
      if ( CONFIG.Dice.fulfillment.methods[method]?.interactive ) fulfillable.push(term);
    };

    /**
     * Identify any DiceTerms in the provided list of terms.
     * @param {RollTerm[]} terms  The terms.
     */
    const identifyDice = (terms=[]) => {
      terms.forEach(term => {
        identifyTerm(term);
        if ( "dice" in term ) identifyDice(term.dice);
      });
    };

    identifyDice(terms);
    return fulfillable;
  }

  /* -------------------------------------------- */

  /**
   * Classify a remaining string term into a recognized RollTerm class
   * @param {string} term         A remaining un-classified string
   * @param {object} [options={}] Options which customize classification
   * @param {boolean} [options.intermediate=true]  Allow intermediate terms
   * @param {RollTerm|string} [options.prior]       The prior classified term
   * @param {RollTerm|string} [options.next]        The next term to classify
   * @returns {RollTerm}          A classified RollTerm instance
   * @internal
   */
  static _classifyStringTerm(term, {intermediate=true, prior, next}={}) {
    const {DiceTerm, NumericTerm, RollTerm, StringTerm} = foundry.dice.terms;

    // Terms already classified
    if ( term instanceof RollTerm ) return term;

    // Numeric terms
    const numericMatch = NumericTerm.matchTerm(term);
    if ( numericMatch ) return NumericTerm.fromMatch(numericMatch);

    // Dice terms
    const diceMatch = DiceTerm.matchTerm(term, {imputeNumber: !intermediate});
    if ( diceMatch ) {
      if ( intermediate && (prior?.isIntermediate || next?.isIntermediate) ) return new StringTerm({term});
      return DiceTerm.fromMatch(diceMatch);
    }

    // Remaining strings
    return new StringTerm({term});
  }

  /* -------------------------------------------- */
  /*  Chat Messages                               */
  /* -------------------------------------------- */

  /**
   * Render the tooltip HTML for a Roll instance
   * @returns {Promise<string>}     The rendered HTML tooltip as a string
   */
  async getTooltip() {
    const parts = this.dice.map(d => d.getTooltipData());
    return foundry.applications.handlebars.renderTemplate(this.constructor.TOOLTIP_TEMPLATE, {parts});
  }

  /* -------------------------------------------- */

  /**
   * Render a Roll instance to HTML
   * @param {object} [options={}]               Options which affect how the Roll is rendered
   * @param {string} [options.flavor]             Flavor text to include
   * @param {string} [options.template]           A custom HTML template path
   * @param {boolean} [options.isPrivate=false]   Is the Roll displayed privately?
   * @returns {Promise<string>}                 The rendered HTML template as a string
   */
  async render({flavor, template=this.constructor.CHAT_TEMPLATE, isPrivate=false, ...options}={}) {
    if ( !this._evaluated ) await this.evaluate({allowInteractive: !isPrivate});
    const chatData = await this._prepareChatRenderContext({flavor, isPrivate, ...options});
    return foundry.applications.handlebars.renderTemplate(template, chatData);
  }

  /* -------------------------------------------- */

  /**
   * Prepare context data used to render the CHAT_TEMPLATE for this roll.
   * @param {object} options
   * @param {string} [options.flavor]
   * @param {boolean} [options.isPrivate=false]
   * @returns {Promise<{object}>}
   * @protected
   */
  async _prepareChatRenderContext({flavor, isPrivate=false, ...options}={}) {
    return {
      formula: isPrivate ? "???" : this._formula,
      flavor: isPrivate ? null : flavor ?? this.options.flavor,
      user: game.user.id,
      tooltip: isPrivate ? "" : await this.getTooltip(),
      total: isPrivate ? "?" : Math.round(this.total * 100) / 100
    };
  }

  /* -------------------------------------------- */

  /**
   * Transform a Roll instance into a ChatMessage, displaying the roll result.
   * This function can either create the ChatMessage directly, or return the data object that will be used to create.
   *
   * @param {object} messageData          The data object to use when creating the message
   * @param {object} [options]            Additional options which modify the created message.
   * @param {string} [options.rollMode]   The template roll mode to use for the message from CONFIG.Dice.rollModes
   * @param {boolean} [options.create=true]   Whether to automatically create the chat message, or only return the
   *                                          prepared chatData object.
   * @returns {Promise<ChatMessage|object>} A promise which resolves to the created ChatMessage document if create is
   *                                        true, or the Object of prepared chatData otherwise.
   */
  async toMessage(messageData={}, {rollMode, create=true}={}) {
    if ( rollMode === "roll" ) rollMode = undefined;
    rollMode ||= game.settings.get("core", "rollMode");

    // Perform the roll, if it has not yet been rolled
    if ( !this._evaluated ) await this.evaluate({allowInteractive: rollMode !== CONST.DICE_ROLL_MODES.BLIND});

    // Prepare chat data
    messageData = foundry.utils.mergeObject({
      author: game.user.id,
      content: String(this.total),
      sound: CONFIG.sounds.dice
    }, messageData);
    messageData.rolls = [this];

    // Either create the message or just return the chat data
    const cls = foundry.utils.getDocumentClass("ChatMessage");
    const msg = new cls(messageData);
    msg.applyRollMode(rollMode);

    // Either create or return the data
    if ( create ) return cls.create(msg);
    return msg.toObject();
  }

  /* -------------------------------------------- */
  /*  Interface Helpers                           */
  /* -------------------------------------------- */

  /**
   * Expand an inline roll element to display its contained dice result as a tooltip.
   * @param {HTMLAnchorElement} a     The inline-roll button
   * @returns {Promise<void>}
   */
  static async expandInlineResult(a) {
    if ( !a.classList.contains("inline-roll") ) return;
    if ( a.classList.contains("expanded") ) return;

    // Create a new tooltip
    const roll = this.fromJSON(unescape(a.dataset.roll));
    const tip = document.createElement("div");
    tip.innerHTML = await roll.getTooltip();

    // Add the tooltip
    const tooltip = tip.querySelector(".dice-tooltip");
    if ( !tooltip ) return;
    a.appendChild(tooltip);
    a.classList.add("expanded");

    // Set the position
    const pa = a.getBoundingClientRect();
    const pt = tooltip.getBoundingClientRect();
    tooltip.style.left = `${Math.min(pa.x, window.innerWidth - (pt.width + 3))}px`;
    tooltip.style.top = `${Math.min(pa.y + pa.height + 3, window.innerHeight - (pt.height + 3))}px`;
    tooltip.popover = "manual";
    tooltip.showPopover();

    // Disable tooltip while expanded
    delete a.dataset.tooltip;
    game.tooltip.deactivate();
  }

  /* -------------------------------------------- */

  /**
   * Collapse an expanded inline roll to conceal its tooltip.
   * @param {HTMLAnchorElement} a     The inline-roll button
   */
  static collapseInlineResult(a) {
    if ( !a.classList.contains("inline-roll") ) return;
    if ( !a.classList.contains("expanded") ) return;
    const tooltip = a.querySelector(".dice-tooltip");
    if ( tooltip ) tooltip.remove();
    const roll = this.fromJSON(unescape(a.dataset.roll));
    a.dataset.tooltipText = roll.formula;
    return a.classList.remove("expanded");
  }

  /* -------------------------------------------- */

  /**
   * Construct an inline roll link for this Roll.
   * @param {object} [options]                  Additional options to configure how the link is constructed.
   * @param {string} [options.label]            A custom label for the total.
   * @param {Record<string, string>} [options.attrs]    Attributes to set on the link.
   * @param {Record<string, string>} [options.dataset]  Custom data attributes to set on the link.
   * @param {string[]} [options.classes]        Additional classes to add to the link. The classes `inline-roll`
   *                                            and `inline-result` are added by default.
   * @param {string} [options.icon]             A font-awesome icon class to use as the icon instead of a d20.
   * @returns {HTMLAnchorElement}
   */
  toAnchor({attrs={}, dataset={}, classes=[], label, icon}={}) {
    dataset = foundry.utils.mergeObject({roll: escape(JSON.stringify(this))}, dataset);
    const a = document.createElement("a");
    a.classList.add("inline-roll", "inline-result", ...classes);
    a.dataset.tooltipText = this.formula;
    Object.entries(attrs).forEach(([k, v]) => a.setAttribute(k, v));
    Object.entries(dataset).forEach(([k, v]) => a.dataset[k] = v);
    label = label ? `${label}: ${this.total}` : this.total;
    const i = document.createElement("i");
    i.className = icon ?? "fa-solid fa-dice-d20";
    i.inert = true;
    a.append(i, label);
    return a;
  }

  /* -------------------------------------------- */
  /*  Serialization and Loading                   */
  /* -------------------------------------------- */

  /**
   * Represent the data of the Roll as an object suitable for JSON serialization.
   * @returns {object}     Structured data which can be serialized into JSON
   */
  toJSON() {
    return {
      class: this.constructor.name,
      options: this.options,
      dice: this._dice,
      formula: this._formula,
      terms: this.terms.map(t => t.toJSON()),
      total: this._total,
      evaluated: this._evaluated
    };
  }

  /* -------------------------------------------- */

  /**
   * Recreate a Roll instance using a provided data object
   * @param {object} data   Unpacked data representing the Roll
   * @returns {Roll}         A reconstructed Roll instance
   */
  static fromData(data) {
    const {DiceTerm, RollTerm} = foundry.dice.terms;

    // Redirect to the proper Roll class definition
    if ( data.class && (data.class !== this.name) ) {
      const cls = CONFIG.Dice.rolls.find(cls => cls.name === data.class);
      if ( !cls ) throw new Error(`Unable to recreate ${data.class} instance from provided data`);
      return cls.fromData(data);
    }

    // Create the Roll instance
    const roll = new this(data.formula, data.data, data.options);

    // Expand terms
    roll.terms = data.terms.map(t => {
      if ( t.class ) {
        if ( t.class === "DicePool" ) t.class = "PoolTerm"; // Backwards compatibility
        if ( t.class === "MathTerm" ) t.class = "FunctionTerm";
        return RollTerm.fromData(t);
      }
      return t;
    });

    // Repopulate evaluated state
    if ( data.evaluated ?? true ) {
      roll._total = data.total;
      roll._dice = (data.dice || []).map(t => DiceTerm.fromData(t));
      roll._evaluated = true;
    }
    return roll;
  }

  /* -------------------------------------------- */

  /**
   * Recreate a Roll instance using a provided JSON string
   * @param {string} json   Serialized JSON data representing the Roll
   * @returns {Roll}        A reconstructed Roll instance
   */
  static fromJSON(json) {
    return this.fromData(JSON.parse(json));
  }

  /* -------------------------------------------- */

  /**
   * Manually construct a Roll object by providing an explicit set of input terms
   * @param {RollTerm[]} terms      The array of terms to use as the basis for the Roll
   * @param {object} [options={}]   Additional options passed to the Roll constructor
   * @returns {Roll}                The constructed Roll instance
   *
   * @example Construct a Roll instance from an array of component terms
   * ```js
   * const t1 = new Die({number: 4, faces: 8};
   * const plus = new OperatorTerm({operator: "+"});
   * const t2 = new NumericTerm({number: 8});
   * const roll = Roll.fromTerms([t1, plus, t2]);
   * roll.formula; // 4d8 + 8
   * ```
   */
  static fromTerms(terms, options={}) {
    const {OperatorTerm, RollTerm} = foundry.dice.terms;

    // Validate provided terms
    if ( !terms.every(t => t instanceof RollTerm ) ) {
      throw new Error("All provided terms must be RollTerm instances");
    }
    const allEvaluated = terms.every(t => t._evaluated);
    const noneEvaluated = terms.every(t => !t._evaluated || (t instanceof OperatorTerm));
    if ( !(allEvaluated || noneEvaluated) ) {
      throw new Error("You can only call Roll.fromTerms with an array of terms which are either all evaluated, or none evaluated");
    }

    // Construct the roll
    const formula = this.getFormula(terms);
    const roll = new this(formula, {}, options);
    roll.terms = terms;
    roll._evaluated = allEvaluated;
    if ( roll._evaluated ) roll._total = roll._evaluateTotal();
    return roll;
  }
}

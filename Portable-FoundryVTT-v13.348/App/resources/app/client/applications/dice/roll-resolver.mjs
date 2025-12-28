import HandlebarsApplicationMixin from "../api/handlebars-application.mjs";
import ApplicationV2 from "../api/application.mjs";
import FormDataExtended from "../ux/form-data-extended.mjs";
import Roll from "../../dice/roll.mjs";
import {createFontAwesomeIcon} from "../forms/fields.mjs";

/**
 * @typedef DiceTermFulfillmentDescriptor
 * @property {string} id        A unique identifier for the term.
 * @property {DiceTerm} term    The term.
 * @property {string} method    The fulfillment method.
 * @property {boolean} [isNew]  Was the term newly-added to this resolver?
 */

/**
 * An application responsible for handling unfulfilled dice terms in a roll.
 * @extends {ApplicationV2<ApplicationConfiguration, ApplicationRenderOptions>}
 * @mixes HandlebarsApplication
 */
export default class RollResolver extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(roll, options={}) {
    super(options);
    this.#roll = roll;
  }

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    id: "roll-resolver-{id}",
    tag: "form",
    classes: ["roll-resolver"],
    window: {
      title: "DICE.RollResolution"
    },
    position: {width: 500},
    form: {
      submitOnChange: false,
      closeOnSubmit: false,
      handler: this._fulfillRoll
    }
  };

  /** @override */
  static PARTS = {
    form: {
      id: "form",
      template: "templates/dice/roll-resolver.hbs"
    }
  };

  /**
   * A collection of fulfillable dice terms.
   * @type {Map<string, DiceTermFulfillmentDescriptor>}
   */
  get fulfillable() {
    return this.#fulfillable;
  }

  #fulfillable = new Map();

  /**
   * A function to call when the first pass of fulfillment is complete.
   * @type {function}
   */
  #resolve;

  /**
   * The roll being resolved.
   * @type {Roll}
   */
  get roll() {
    return this.#roll;
  }

  #roll;

  /* -------------------------------------------- */

  /**
   * Identify any terms in this Roll that should be fulfilled externally, and prompt the user to do so.
   * @returns {Promise<void>}  Returns a Promise that resolves when the first pass of fulfillment is complete.
   */
  async awaitFulfillment() {
    const fulfillable = await this.#identifyFulfillableTerms(this.roll.terms);
    if ( !fulfillable.length ) return;
    Roll.defaultImplementation.RESOLVERS.set(this.roll, this);
    this.render(true);
    return new Promise(resolve => this.#resolve = resolve);
  }

  /* -------------------------------------------- */

  /**
   * Register a fulfilled die roll.
   * @param {string} method        The method used for fulfillment.
   * @param {string} denomination  The denomination of the fulfilled die.
   * @param {number} result        The rolled number.
   * @returns {boolean}            Whether the result was consumed.
   */
  registerResult(method, denomination, result) {
    const query = `label[data-denomination="${denomination}"][data-method="${method}"] > input:not(:disabled)`;
    const term = Array.from(this.element.querySelectorAll(query)).find(input => input.value === "");
    if ( !term ) {
      ui.notifications.warn(`${denomination} roll was not needed by the resolver.`);
      return false;
    }
    term.value = `${result}`;
    const submitTerm = term.closest(".form-fields")?.querySelector("button");
    if ( submitTerm ) submitTerm.dispatchEvent(new MouseEvent("click"));
    else this._checkDone();
    return true;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async close(options={}) {
    if ( this.rendered ) await this.constructor._fulfillRoll.call(this, null, null, new FormDataExtended(this.element));
    Roll.defaultImplementation.RESOLVERS.delete(this.roll);
    this.#resolve?.();
    return super.close(options);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(_options) {
    const context = {
      formula: this.roll.formula,
      groups: {}
    };
    for ( const fulfillable of this.fulfillable.values() ) {
      const { id, term, method, isNew } = fulfillable;
      fulfillable.isNew = false;
      const config = CONFIG.Dice.fulfillment.methods[method];
      const group = context.groups[id] = {
        results: [],
        label: term.expression,
        icon: config.icon ?? '<i class="fa-solid fa-bluetooth"></i>',
        tooltip: game.i18n.localize(config.label)
      };
      const { denomination, faces } = term;
      const icon = CONFIG.Dice.fulfillment.dice[denomination]?.icon;
      for ( let i = 0; i < Math.max(term.number ?? 1, term.results.length); i++ ) {
        const result = term.results[i];
        const { result: value, exploded, rerolled } = result ?? {};
        group.results.push({
          denomination, faces, id, method, icon, exploded, rerolled, isNew,
          value: value ?? "",
          readonly: method !== "manual",
          disabled: !!result
        });
      }
    }
    return context;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onSubmitForm(formConfig, event) {
    this._toggleSubmission(false);
    this.element.querySelectorAll("input").forEach(input => {
      if ( !isNaN(input.valueAsNumber) ) return;
      const { term } = this.fulfillable.get(input.name);
      input.value = `${term.randomFace()}`;
    });
    await super._onSubmitForm(formConfig, event);
    this.element?.querySelectorAll("input").forEach(input => input.disabled = true);
    this.#resolve();
  }

  /* -------------------------------------------- */

  /**
   * Handle prompting for a single extra result from a term.
   * @param {DiceTerm} term  The term.
   * @param {string} method  The method used to obtain the result.
   * @param {object} [options]
   * @param {boolean} [options.reroll=false]
   * @param {boolean} [options.explode=false]
   * @returns {Promise<number|void>}
   */
  async resolveResult(term, method, {reroll=false, explode=false}={}) {
    const group = this.element.querySelector(`fieldset[data-term-id="${term._id}"]`);
    if ( !group ) {
      console.warn("Attempted to resolve a single result for an unregistered DiceTerm.");
      return;
    }
    const fields = document.createElement("div");
    fields.classList.add("form-fields");
    const label = document.createElement("label");
    label.classList.add("icon", "die-input", "new-addition");
    label.dataset.denomination = term.denomination;
    label.dataset.method = method;
    const input = foundry.applications.fields.createNumberInput({
      name: term._id,
      min: 1,
      max: term.faces,
      step: 1,
      readonly: method !== "manual",
      placeholder: game.i18n.localize(term.denomination)
    });
    label.append(input);
    if ( reroll ) {
      label.append(createFontAwesomeIcon("arrow-rotate-right"));
    }
    if ( explode ) {
      label.append(createFontAwesomeIcon("burst"));
    }
    const icon = CONFIG.Dice.fulfillment.dice[term.denomination]?.icon;
    if ( icon ) {
      const div = document.createElement("div");
      div.innerHTML = icon;
      label.append(...div.childNodes);
    }
    const button = document.createElement("button");
    button.type = "button";
    button.classList.add("submit-result");
    button.dataset.tooltip = "DICE.SubmitRoll";
    button.ariaLabel = game.i18n.localize("DICE.SubmitRoll");
    button.innerHTML = '<i class="fas fa-arrow-right"></i>';
    fields.append(label, button);
    group.appendChild(fields);
    this.setPosition({ height: "auto" });
    return new Promise(resolve => {
      const button = fields.querySelector("button");
      const input = fields.querySelector("input");
      button.addEventListener("click", () => {
        if ( !input.validity.valid ) {
          input.form.reportValidity();
          return;
        }
        let value = input.valueAsNumber;
        if ( !value ) value = term.randomFace();
        input.value = `${value}`;
        input.disabled = true;
        button.remove();
        resolve(value);
      });
    });
  }

  /* -------------------------------------------- */

  /**
   * Update the Roll instance with the fulfilled results.
   * @this {RollResolver}
   * @param {SubmitEvent} event          The originating form submission event.
   * @param {HTMLFormElement} form       The form element that was submitted.
   * @param {FormDataExtended} formData  Processed data for the submitted form.
   * @returns {Promise<void>}
   * @protected
   */
  static async _fulfillRoll(event, form, formData) {
    // Update the DiceTerms with the fulfilled values.
    for ( let [id, results] of Object.entries(formData.object) ) {
      const { term } = this.fulfillable.get(id);
      if ( !Array.isArray(results) ) results = [results];
      for ( const result of results ) {
        const roll = { result: undefined, active: true };
        // A null value indicates the user wishes to skip external fulfillment and fall back to the digital roll.
        if ( result === null ) roll.result = term.randomFace();
        else roll.result = result;
        term.results.push(roll);
      }
    }
  }

  /* -------------------------------------------- */

  /**
   * Identify any of the given terms which should be fulfilled externally.
   * @param {RollTerm[]} terms               The terms.
   * @param {object} [options]
   * @param {boolean} [options.isNew=false]  Whether this term is a new addition to the already-rendered RollResolver.
   * @returns {Promise<DiceTerm[]>}
   */
  async #identifyFulfillableTerms(terms, { isNew=false }={}) {
    const config = game.settings.get("core", Roll.DICE_CONFIGURATION_SETTING);
    const fulfillable = Roll.defaultImplementation.identifyFulfillableTerms(terms);
    fulfillable.forEach(term => {
      if ( term._id ) return;
      const method = config[term.denomination] || CONFIG.Dice.fulfillment.defaultMethod;
      const id = foundry.utils.randomID();
      term._id = id;
      term.method = method;
      this.fulfillable.set(id, { id, term, method, isNew });
    });
    return fulfillable;
  }

  /* -------------------------------------------- */

  /**
   * Add a new term to the resolver.
   * @param {DiceTerm} term    The term.
   * @returns {Promise<void>}  Returns a Promise that resolves when the term's results have been externally fulfilled.
   */
  async addTerm(term) {
    if ( !(term instanceof foundry.dice.terms.DiceTerm) ) {
      throw new Error("Only DiceTerm instances may be added to the RollResolver.");
    }
    const fulfillable = await this.#identifyFulfillableTerms([term], { isNew: true });
    if ( !fulfillable.length ) return;
    this.render({ force: true, position: { height: "auto" } });
    return new Promise(resolve => this.#resolve = resolve);
  }

  /* -------------------------------------------- */

  /**
   * Check if all rolls have been fulfilled.
   * @protected
   */
  _checkDone() {
    // If the form has already in the submission state, we don't need to re-submit.
    const submitter = this.element.querySelector('button[type="submit"]');
    if ( submitter.disabled ) return;

    // If there are any manual inputs, or if there are any empty inputs, then fulfillment is not done.
    if ( this.element.querySelector("input:not([readonly], :disabled)") ) return;
    for ( const input of this.element.querySelectorAll("input[readonly]:not(:disabled)") ) {
      if ( input.value === "" ) return;
    }
    this.element.requestSubmit(submitter);
  }

  /* -------------------------------------------- */

  /**
   * Toggle the state of the submit button.
   * @param {boolean} enabled  Whether the button is enabled.
   * @protected
   */
  _toggleSubmission(enabled) {
    const submit = this.element.querySelector("button[type=submit]");
    const icon = submit.querySelector("i");
    icon.className = `fa-solid ${enabled ? "fa-check" : "fa-spinner fa-pulse"}`;
    submit.disabled = !enabled;
  }
}

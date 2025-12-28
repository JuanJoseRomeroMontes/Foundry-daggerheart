import ApplicationV2 from "./application.mjs";
import FormDataExtended from "../ux/form-data-extended.mjs";
import {mergeObject} from "../../../common/utils/helpers.mjs";

/**
 * @import {ApplicationConfiguration} from "../_types.mjs";
 */

/**
 * @typedef DialogV2Button
 * @property {string} action                      The button action identifier.
 * @property {string} label                       The button label. Will be localized.
 * @property {string} [icon]                      FontAwesome icon classes.
 * @property {string} [class]                     CSS classes to apply to the button.
 * @property {Record<string, string>} [style]     CSS style to apply to the button.
 * @property {string} [type="submit"]             The button type.
 * @property {boolean} [disabled]                 Whether the button is disabled
 * @property {boolean} [default]                  Whether this button represents the default action to take if the user
 *                                                submits the form without pressing a button, i.e. with an Enter
 *                                                keypress.
 * @property {DialogV2ButtonCallback} [callback]  A function to invoke when the button is clicked. The value returned
 *                                                from this function will be used as the dialog's submitted value.
 *                                                Otherwise, the button's identifier is used.
 */

/**
 * @callback DialogV2ButtonCallback
 * @param {PointerEvent|SubmitEvent} event        The button click event, or a form submission event if the dialog was
 *                                                submitted via keyboard.
 * @param {HTMLButtonElement} button              If the form was submitted via keyboard, this will be the default
 *                                                button, otherwise the button that was clicked.
 * @param {DialogV2} dialog                       The DialogV2 instance.
 * @returns {Promise<any>}
 */

/**
 * @typedef DialogV2Configuration
 * @property {boolean} [modal]                    Modal dialogs prevent interaction with the rest of the UI until they
 *                                                are dismissed or submitted.
 * @property {DialogV2Button[]} buttons           Button configuration.
 * @property {string|HTMLDivElement} [content]    The dialog content: a HTML string or a <div> element. If string,
 *                                                the content is cleaned with {@link foundry.utils.cleanHTML}.
 *                                                Otherwise, the content is not cleaned.
 * @property {DialogV2SubmitCallback} [submit]    A function to invoke when the dialog is submitted. This will not be
 *                                                called if the dialog is dismissed.
 */

/**
 * @callback DialogV2RenderCallback
 * @param {Event} event                           The render event.
 * @param {DialogV2} dialog                       The DialogV2 instance.
 */

/**
 * @callback DialogV2CloseCallback
 * @param {Event} event                           The close event.
 * @param {DialogV2} dialog                       The DialogV2 instance.
 */

/**
 * @callback DialogV2SubmitCallback
 * @param {any} result                            Either the identifier of the button that was clicked to submit the
 *                                                dialog, or the result returned by that button's callback.
 * @param {DialogV2} dialog                       The DialogV2 instance.
 * @returns {Promise<void>}
 */

/**
 * @typedef DialogV2WaitOptions
 * @property {DialogV2RenderCallback} [render] A synchronous function to invoke whenever the dialog is rendered.
 * @property {DialogV2CloseCallback} [close]   A synchronous function to invoke when the dialog is closed under any
 *                                             circumstances.
 * @property {boolean} [rejectClose=false]     Throw a Promise rejection if the dialog is dismissed.
 */

/**
 * A lightweight Application that renders a dialog containing a form with arbitrary content, and some buttons.
 * @extends {ApplicationV2<ApplicationConfiguration & DialogV2Configuration>}
 *
 * @example Prompt the user to confirm an action.
 * ```js
 * const proceed = await foundry.applications.api.DialogV2.confirm({
 *   content: "Are you sure?",
 *   rejectClose: false,
 *   modal: true
 * });
 * if ( proceed ) console.log("Proceed.");
 * else console.log("Do not proceed.");
 * ```
 *
 * @example Prompt the user for some input.
 * ```js
 * let guess;
 * try {
 *   guess = await foundry.applications.api.DialogV2.prompt({
 *     window: { title: "Guess a number between 1 and 10" },
 *     content: '<input name="guess" type="number" min="1" max="10" step="1" autofocus>',
 *     ok: {
 *       label: "Submit Guess",
 *       callback: (event, button, dialog) => button.form.elements.guess.valueAsNumber
 *     }
 *   });
 * } catch {
 *   console.log("User did not make a guess.");
 *   return;
 * }
 * const n = Math.ceil(CONFIG.Dice.randomUniform() * 10);
 * if ( n === guess ) console.log("User guessed correctly.");
 * else console.log("User guessed incorrectly.");
 * ```
 *
 * @example A custom dialog.
 * ```js
 * new foundry.applications.api.DialogV2({
 *   window: { title: "Choose an option" },
 *   content: `
 *     <label><input type="radio" name="choice" value="one" checked> Option 1</label>
 *     <label><input type="radio" name="choice" value="two"> Option 2</label>
 *     <label><input type="radio" name="choice" value="three"> Options 3</label>
 *   `,
 *   buttons: [{
 *     action: "choice",
 *     label: "Make Choice",
 *     default: true,
 *     callback: (event, button, dialog) => button.form.elements.choice.value
 *   }, {
 *     action: "all",
 *     label: "Take All"
 *   }],
 *   submit: result => {
 *     if ( result === "all" ) console.log("User picked all options.");
 *     else console.log(`User picked option: ${result}`);
 *   }
 * }).render({ force: true });
 * ```
 */
export default class DialogV2 extends ApplicationV2 {

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    id: "dialog-{id}",
    classes: ["dialog"],
    tag: "dialog",
    form: {
      closeOnSubmit: true
    },
    window: {
      frame: true,
      positioned: true,
      minimizable: false
    }
  };

  /* -------------------------------------------- */

  /** @inheritDoc */
  _initializeApplicationOptions(options) {
    options = super._initializeApplicationOptions(options);
    options.content ||= "";
    if ( options.content instanceof HTMLElement ) {
      if ( options.content.tagName !== "DIV" ) throw new Error("config.content must be <div> element");
      if ( options.content.attributes.length ) throw new Error("config.content element must have no attributes");
      options.content = options.content.innerHTML;
    }
    else options.content = foundry.utils.cleanHTML(String(options.content));
    if ( !options.buttons?.length ) throw new Error("You must define at least one entry in config.buttons");
    options.buttons = options.buttons.reduce((obj, button) => {
      options.actions[button.action] = this.constructor._onClickButton;
      obj[button.action] = button;
      return obj;
    }, {});
    return options;
  }

  /* -------------------------------------------- */

  /** @override */
  async _renderHTML(_context, _options) {
    const form = document.createElement("form");
    form.className = "dialog-form standard-form";
    form.autocomplete = "off";
    form.innerHTML = `
      ${this.options.content ? `<div class="dialog-content standard-form">${this.options.content}</div>` : ""}
      <footer class="form-footer">${this._renderButtons()}</footer>
    `;
    form.addEventListener("submit", event => this._onSubmit(event.submitter, event));
    return form;
  }

  /* -------------------------------------------- */

  /**
   * Render configured buttons.
   * @returns {string}
   * @protected
   */
  _renderButtons() {
    const buttons = Object.values(this.options.buttons);
    return buttons.map((buttonOptions, i) => {
      const { action, label, icon, class: cls="", style={}, type="submit", disabled } = buttonOptions;
      const isDefault = !!buttonOptions.default || ((i === 0) && !buttons.some(b => b.default));
      const button = document.createElement("button");
      button.setAttribute("type", type);
      button.setAttribute("data-action", action);
      button.setAttribute("class", cls);
      for ( const [key, value] of Object.entries(style) ) {
        if ( key in button.style ) button.style[key] = value;
        else button.style.setProperty(key, value);
      }
      button.toggleAttribute("disabled", !!disabled);
      button.toggleAttribute("autofocus", isDefault);
      if ( icon ) {
        const i = document.createElement("i");
        i.className = icon;
        button.appendChild(i);
      }
      const span = document.createElement("span");
      span.innerText = game.i18n.localize(label);
      button.appendChild(span);
      return button.outerHTML;
    }).join("");
  }

  /* -------------------------------------------- */

  /**
   * Handle submitting the dialog.
   * @param {HTMLButtonElement} target        The button that was clicked or the default button.
   * @param {PointerEvent|SubmitEvent} event  The triggering event.
   * @returns {Promise<DialogV2>}
   * @protected
   */
  async _onSubmit(target, event) {
    event.preventDefault();
    const priorDisabledStates = [];
    for ( const action of Object.keys(this.options.buttons) ) {
      const button = this.element.querySelector(`button[data-action="${action}"]`);
      priorDisabledStates.push([button, button.disabled]);
      button.disabled = true;
    }
    const button = this.options.buttons[target?.dataset.action];
    const result = (await button?.callback?.(event, target, this)) ?? button?.action;
    await this.options.submit?.(result, this);
    for ( const [button, disabled] of priorDisabledStates ) button.disabled = disabled;
    return this.options.form.closeOnSubmit ? this.close({ submitted: true }) : this;
  }

  /* -------------------------------------------- */

  /** @override */
  async _onFirstRender(_context, _options) {
    if ( this.options.modal ) this.element.showModal();
    else this.element.show();
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _attachFrameListeners() {
    super._attachFrameListeners();
    this.element.addEventListener("keydown", this._onKeyDown.bind(this));
  }

  /* -------------------------------------------- */

  /** @override */
  _replaceHTML(result, content, _options) {
    content.replaceChildren(result);
  }

  /* -------------------------------------------- */

  /**
   * Handle keypresses within the dialog.
   * @param {KeyboardEvent} event  The triggering event.
   * @protected
   */
  _onKeyDown(event) {
    // Capture Escape keypresses for dialogs to ensure that close is called properly.
    if ( event.key === "Escape" ) {
      event.preventDefault(); // Prevent default browser dialog dismiss behavior.
      event.stopPropagation();
      this.close();
    }
  }

  /* -------------------------------------------- */

  /**
   * Redirect all clicks of buttons with action specifications to the submit handler.
   * @this {DialogV2}
   * @param {PointerEvent} event        The originating click event.
   * @param {HTMLButtonElement} target  The button element that was clicked.
   * @protected
   */
  static _onClickButton(event, target) {
    this._onSubmit(target, event);
  }

  /* -------------------------------------------- */
  /*  Factory Methods                             */
  /* -------------------------------------------- */

  /**
   * A utility helper to generate a dialog with yes and no buttons.
   * @param {Partial<ApplicationConfiguration & DialogV2Configuration & DialogV2WaitOptions>} [config]
   * @param {Partial<DialogV2Button>} [config.yes] Options to overwrite the default yes button configuration.
   * @param {Partial<DialogV2Button>} [config.no]  Options to overwrite the default no button configuration.
   * @returns {Promise<any>}                Resolves to true if the yes button was pressed, or false if the no button
   *                                        was pressed. If additional buttons were provided, the Promise resolves to
   *                                        the identifier of the one that was pressed, or the value returned by its
   *                                        callback. If the dialog was dismissed, and rejectClose is false, the
   *                                        Promise resolves to null.
   */
  static async confirm({yes={}, no={}, ...config}={}) {
    config.buttons ??= [];
    config.buttons.unshift(mergeObject({
      action: "yes", label: "Yes", icon: "fa-solid fa-check", callback: () => true
    }, yes), mergeObject({
      action: "no", label: "No", icon: "fa-solid fa-xmark", default: true, callback: () => false
    }, no));
    return this.wait(foundry.utils.mergeObject({ position: { width: 400 } }, config));
  }

  /* -------------------------------------------- */

  /**
   * A utility helper to generate a dialog with a single confirmation button.
   * @param {Partial<ApplicationConfiguration & DialogV2Configuration & DialogV2WaitOptions>} [config]
   * @param {Partial<DialogV2Button>} [config.ok]   Options to overwrite the default confirmation button configuration.
   * @returns {Promise<any>}                        Resolves to the identifier of the button used to submit the dialog,
   *                                                or the value returned by that button's callback. If additional
   *                                                buttons were provided, the Promise resolves to the identifier of
   *                                                the one that was pressed, or the value returned by its callback.
   *                                                If the dialog was dismissed, and rejectClose is false, the Promise
   *                                                resolves to null.
   */
  static async prompt({ok={}, ...config}={}) {
    config.buttons ??= [];
    config.buttons.unshift(mergeObject({
      action: "ok", label: "Confirm", icon: "fa-solid fa-check", default: true
    }, ok));
    return this.wait(foundry.utils.mergeObject({ position: { width: 400 } }, config));
  }

  /* -------------------------------------------- */

  /**
   * A utility helper to generate a dialog for user input.
   * @param {Partial<ApplicationConfiguration & DialogV2Configuration & DialogV2WaitOptions>} [config]
   * @param {Partial<DialogV2Button>} [config.ok]   Options to overwrite the default confirmation button configuration.
   * @returns {Promise<any>}                        Resolves to the data of the form if the ok button was pressed,
   *                                                or the value returned by that button's callback. If additional
   *                                                buttons were provided, the Promise resolves to the identifier of
   *                                                the one that was pressed, or the value returned by its callback.
   *                                                If the dialog was dismissed, and rejectClose is false, the Promise
   *                                                resolves to null.
   */
  static async input({ok, ...config}={}) {
    const callback = (_event, button) => new FormDataExtended(button.form).object;
    return this.prompt({ok: {callback, ...ok}, ...config});
  }

  /* -------------------------------------------- */

  /**
   * Spawn a dialog and wait for it to be dismissed or submitted.
   * @param {Partial<ApplicationConfiguration & DialogV2Configuration & DialogV2WaitOptions>} [config]
   * @returns {Promise<any>}                          Resolves to the identifier of the button used to submit the
   *                                                  dialog, or the value returned by that button's callback. If the
   *                                                  dialog was dismissed, and rejectClose is false, the Promise
   *                                                  resolves to null.
   */
  static async wait({rejectClose=false, close, render, ...config}={}) {
    return new Promise((resolve, reject) => {
      // Wrap submission handler with Promise resolution.
      const originalSubmit = config.submit;
      config.submit = async (result, dialog) => {
        await originalSubmit?.(result, dialog);
        resolve(result);
      };

      const dialog = new this(config);
      dialog.addEventListener("close", event => {
        const result = close instanceof Function ? close(event, dialog) : undefined;
        if ( rejectClose ) reject(new Error("Dialog was dismissed without pressing a button."));
        else resolve(result ?? null);
      }, {once: true});
      if ( render instanceof Function ) {
        dialog.addEventListener("render", event => render(event, dialog));
      }
      dialog.render({force: true});
    });
  }

  /* -------------------------------------------- */

  /**
   * Present an asynchronous Dialog query to a specific User for response.
   * @param {User|string} user                A User instance or a User id
   * @param {"prompt"|"confirm"|"input"|"wait"} type  The type of Dialog to present
   * @param {object} [config]                 Dialog configuration forwarded on to the Dialog.prompt, Dialog.confirm,
   *                                          Dialog.input, or Dialog.wait function depending on the query type.
   *                                          Callback options are not supported.
   * @returns {Promise<any|null>}             The query response or null if no response was provided
   *
   * @see {@link DialogV2.prompt}
   * @see {@link DialogV2.confirm}
   * @see {@link DialogV2.input}
   * @see {@link DialogV2.wait}
   */
  static async query(user, type, config={}) {
    if ( typeof user === "string" ) {
      const userId = user;
      user = game.users.get(userId);
      if ( !user ) throw new Error(`User [${userId}] does not exist`);
    }
    if ( user.isSelf ) return this[type](config);
    return user.query("dialog", {type, config});
  }

  /* -------------------------------------------- */

  /**
   * The dialog query handler.
   * @type {({type, config}: {type: "prompt"|"confirm"|"input"|"wait"; config: object}) => Promise<any>}
   * @internal
   */
  static _handleQuery = ({type, config}) => {
    switch ( type ) {
      case "confirm": return this.confirm(config);
      case "input": return this.input(config);
      case "prompt": return this.prompt(config);
      case "wait": return this.wait(config);
      default: new Error(`Invalid dialog type "${type}"`);
    }
  };
}

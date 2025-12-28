import Application from "./application-v1.mjs";

/**
 * @import {ApplicationV1Options} from "./application-v1.mjs"
 */

/**
 * @typedef DialogV1Options
 * @property {boolean} [jQuery=true]  Whether to provide jQuery objects to callback functions (if true) or plain
 *                                    HTMLElement instances (if false). This is currently true by default but in the
 *                                    future will become false by default.
 */

/**
 * @typedef DialogV1Button
 * @property {string} icon                  A Font Awesome icon for the button
 * @property {string} label                 The label for the button
 * @property {boolean} disabled             Whether the button is disabled
 * @property {function(jQuery)} [callback]  A callback function that fires when the button is clicked
 */

/**
 * @typedef DialogData
 * @property {string} title                 The window title displayed in the dialog header
 * @property {string} content               HTML content for the dialog form
 * @property {Record<string, DialogV1Button>} buttons The buttons which are displayed as action choices for the dialog
 * @property {string} [default]             The name of the default button which should be triggered on Enter keypress
 * @property {function(jQuery)} [render]    A callback function invoked when the dialog is rendered
 * @property {function(jQuery)} [close]     Common callback operations to perform when the dialog is closed
 */

/**
 * Create a dialog window displaying a title, a message, and a set of buttons which trigger callback functions.
 *
 * @example Constructing a custom dialog instance
 * ```js
 * let d = new Dialog({
 *  title: "Test Dialog",
 *  content: "<p>You must choose either Option 1, or Option 2</p>",
 *  buttons: {
 *   one: {
 *    icon: '<i class="fa-solid fa-check"></i>',
 *    label: "Option One",
 *    callback: () => console.log("Chose One")
 *   },
 *   two: {
 *    icon: '<i class="fa-solid fa-xmark"></i>',
 *    label: "Option Two",
 *    callback: () => console.log("Chose Two")
 *   }
 *  },
 *  default: "two",
 *  render: html => console.log("Register interactivity in the rendered dialog"),
 *  close: html => console.log("This always is logged no matter which option is chosen")
 * });
 * d.render(true);
 * ```
 * @deprecated since v13
 */
export default class Dialog extends Application {
  /**
   * @param {DialogData} data          An object of dialog data which configures how the modal window is rendered
   * @param {ApplicationV1Options & DialogV1Options} [options]  Dialog rendering options, see
   *                                                            {@link foundry.appv1.api.Application}.
   */
  constructor(data, options) {
    super(options);
    this.data = data;
  }

  /**
   * A bound instance of the _onKeyDown method which is used to listen to keypress events while the Dialog is active.
   * @type {(event: KeyboardEvent) => void|Promise<void>}
   */
  #onKeyDown;

  /* -------------------------------------------- */

  /**
   * @override
   * @returns {DialogV1Options}
   */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      template: "templates/hud/dialog.html",
      focus: true,
      classes: ["dialog"],
      width: 400,
      jQuery: true
    });
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  get title() {
    return this.data.title || "Dialog";
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  getData(_options) {
    const buttons = Object.keys(this.data.buttons).reduce((obj, key) => {
      const b = this.data.buttons[key];
      b.cssClass = (this.data.default === key ? [key, "default", "bright"] : [key]).join(" ");
      if ( b.condition !== false ) obj[key] = b;
      return obj;
    }, {});
    return {
      content: this.data.content,
      buttons: buttons
    };
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  activateListeners(html) {
    html.find(".dialog-button").click(this.#onClickButton.bind(this));

    // Prevent the default form submission action if any forms are present in this dialog.
    html.find("form").each((_i, el) => el.onsubmit = evt => evt.preventDefault());
    if ( !this.#onKeyDown ) {
      this.#onKeyDown = this._onKeyDown.bind(this);
      document.addEventListener("keydown", this.#onKeyDown);
    }
    if ( this.data.render instanceof Function ) this.data.render(this.options.jQuery ? html : html[0]);

    if ( this.options.focus ) {
      // Focus the default option
      html.find(".default").focus();
    }

    html.find("[autofocus]")[0]?.focus();
  }

  /* -------------------------------------------- */

  /**
   * Handle a left-mouse click on one of the dialog choice buttons
   * @param {MouseEvent} event    The left-mouse click event
   */
  #onClickButton(event) {
    const id = event.currentTarget.dataset.button;
    const button = this.data.buttons[id];
    this.submit(button, event);
  }

  /* -------------------------------------------- */

  /**
   * Handle a keydown event while the dialog is active
   * @param {KeyboardEvent} event   The keydown event
   * @protected
   */
  _onKeyDown(event) {

    // Cycle Options
    if ( event.key === "Tab" ) {
      const dialog = this.element[0];

      // If we are already focused on the Dialog, let the default browser behavior take over
      if ( dialog.contains(document.activeElement) ) return;

      // If we aren't focused on the dialog, bring focus to one of its buttons
      event.preventDefault();
      event.stopPropagation();
      const dialogButtons = Array.from(document.querySelectorAll(".dialog-button"));
      const targetButton = event.shiftKey ? dialogButtons.pop() : dialogButtons.shift();
      targetButton.focus();
    }

    // Close dialog
    if ( event.key === "Escape" ) {
      event.preventDefault();
      event.stopPropagation();
      return this.close();
    }

    // Confirm choice
    if ( event.key === "Enter" ) {

      // Only handle Enter presses if an input element within the Dialog has focus
      const dialog = this.element[0];
      if ( !dialog.contains(document.activeElement) || (document.activeElement instanceof HTMLTextAreaElement) ) return;
      event.preventDefault();
      event.stopPropagation();

      // Prefer a focused button, or enact the default option for the dialog
      const button = document.activeElement.dataset.button || this.data.default;
      const choice = this.data.buttons[button];
      return this.submit(choice);
    }
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _renderOuter() {
    const html = await super._renderOuter();
    const app = html[0];
    app.setAttribute("role", "dialog");
    app.setAttribute("aria-modal", "true");
    return html;
  }

  /* -------------------------------------------- */

  /**
   * Submit the Dialog by selecting one of its buttons.
   * @param {Object} button         The configuration of the chosen button
   * @param {PointerEvent} event    The originating click event
   */
  submit(button, event) {
    const target = this.options.jQuery ? this.element : this.element[0];
    try {
      if ( button.callback ) button.callback.call(this, target, event);
      this.close();
    } catch(err) {
      ui.notifications.error(err.message);
      throw new Error(err);
    }
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async close(options={}) {
    if ( this.data.close ) this.data.close(this.options.jQuery ? this.element : this.element[0]);
    if ( this.#onKeyDown ) {
      document.removeEventListener("keydown", this.#onKeyDown);
      this.#onKeyDown = undefined;
    }
    return super.close(options);
  }

  /* -------------------------------------------- */
  /*  Factory Methods                             */
  /* -------------------------------------------- */

  /**
   * @typedef DialogV1ConfirmOptions
   * @property {Function} [yes]               Callback function upon yes
   * @property {Function} [no]                Callback function upon no
   * @property {boolean} [defaultYes=true]    Make "yes" the default choice?
   * @property {boolean} [rejectClose=false]  Reject the Promise if the Dialog is closed without making a choice.
   * @param {ApplicationV1Options & DialogV1Options} [config.options]  Additional rendering options passed to the Dialog
   */

  /**
   * A helper factory method to create simple confirmation dialog windows which consist of simple yes/no prompts.
   * If you require more flexibility, a custom Dialog instance is preferred.
   *
   * @param {DialogData & DialogV1ConfirmOptions} [config]    Dialog configuration options
   * @returns {Promise<any>}    A promise which resolves once the user makes a choice or closes the window
   *
   * @example Prompt the user with a yes or no question
   * ```js
   * let d = Dialog.confirm({
   *  title: "A Yes or No Question",
   *  content: "<p>Choose wisely.</p>",
   *  yes: () => console.log("You chose ... wisely"),
   *  no: () => console.log("You chose ... poorly"),
   *  defaultYes: false
   * });
   * ```
   */
  static async confirm({title, content, yes, no, render, defaultYes=true, rejectClose=false, options={}}={}) {
    return this.wait({
      title, content, render,
      focus: true,
      default: defaultYes ? "yes" : "no",
      close: () => {
        if ( rejectClose ) return;
        return null;
      },
      buttons: {
        yes: {
          icon: '<i class="fa-solid fa-check"></i>',
          label: game.i18n.localize("Yes"),
          callback: html => yes ? yes(html) : true
        },
        no: {
          icon: '<i class="fa-solid fa-xmark"></i>',
          label: game.i18n.localize("No"),
          callback: html => no ? no(html) : false
        }
      }
    }, options);
  }

  /* -------------------------------------------- */

  /**
   * @typedef DialogV1PromptOptions
   * @param {string} [label]              The label of the button
   * @param {Function} [callback]         A callback function to fire when the button is clicked
   * @param {boolean} [rejectClose=true]  Reject the promise if the dialog is closed without confirming the
   *                                      choice, otherwise resolve as null
   * @param {ApplicationV1Options & DialogV1Options} [config.options]  Additional rendering options passed to the Dialog
   */

  /**
   * A helper factory method to display a basic "prompt" style Dialog with a single button
   * @param {DialogData & DialogV1PromptOptions} [config]    Dialog configuration options
   * @returns {Promise<any>}    The returned value from the provided callback function, if any
   */
  static async prompt({title, content, label, callback, render, rejectClose=true, options={}}={}) {
    return this.wait({
      title, content, render,
      default: "ok",
      close: () => {
        if ( rejectClose ) return;
        return null;
      },
      buttons: {
        ok: { icon: '<i class="fa-solid fa-check"></i>', label, callback }
      }
    }, options);
  }

  /* -------------------------------------------- */

  /**
   * Wrap the Dialog with an enclosing Promise which resolves or rejects when the client makes a choice.
   * @param {DialogData} [data]        Data passed to the Dialog constructor.
   * @param {ApplicationV1Options & DialogV1Options} [options]  Options passed to the Dialog constructor.
   * @param {object} [renderOptions]   Options passed to the Dialog render call.
   * @returns {Promise<any>}           A Promise that resolves to the chosen result.
   */
  static async wait(data={}, options={}, renderOptions={}) {
    return new Promise((resolve, reject) => {

      // Wrap buttons with Promise resolution.
      const buttons = foundry.utils.deepClone(data.buttons);
      for ( const [id, button] of Object.entries(buttons) ) {
        const cb = button.callback;
        const callback = function(html, event) {
          const result = cb instanceof Function ? cb.call(this, html, event) : undefined;
          resolve(result === undefined ? id : result);
        };
        button.callback = callback;
      }

      // Wrap close with Promise resolution or rejection.
      const originalClose = data.close;
      const close = () => {
        const result = originalClose instanceof Function ? originalClose() : undefined;
        if ( result !== undefined ) resolve(result);
        else reject(new Error("The Dialog was closed without a choice being made."));
      };

      // Construct the dialog.
      const dialog = new this({ ...data, buttons, close }, options);
      dialog.render(true, renderOptions);
    });
  }
}

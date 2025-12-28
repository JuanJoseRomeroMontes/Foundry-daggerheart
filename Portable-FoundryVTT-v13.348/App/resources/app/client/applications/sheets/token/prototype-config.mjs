import {PrototypeToken} from "@common/data/data.mjs";
import ApplicationV2 from "../../api/application.mjs";
import TokenApplicationMixin from "./mixin.mjs";

/**
 * @import {ApplicationClickAction, ApplicationFormSubmission} from "../../_types.mjs";
 * @import DocumentSheetV2 from "../../api/document-sheet.mjs";
 */

/**
 * The Application responsible for configuring an actor's PrototypeToken
 * @extends ApplicationV2
 * @mixes TokenApplication
 */
export default class PrototypeTokenConfig extends TokenApplicationMixin(ApplicationV2) {

  /** @inheritDoc */
  constructor(options) {
    super(options);
    this.#prototype = this.options.prototype;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    tag: "form",
    classes: ["prototype-token-config"],
    actions: {
      assignToken: PrototypeTokenConfig.#onAssignToken
    },
    form: {
      handler: PrototypeTokenConfig.#onSubmit
    }
  };

  /* -------------------------------------------- */

  /**
   * The prototype token being edited
   * @type {PrototypeToken}
   */
  #prototype;

  /** @override */
  isPrototype = true;

  /** @override */
  get title() {
    return `${game.i18n.localize("TOKEN.TitlePrototype")}: ${this.actor.name}`;
  }

  /** @override */
  get token() {
    return this._preview ?? this.#prototype;
  }

  /** @override */
  get actor() {
    return this.#prototype.parent;
  }

  /** @override */
  get _fields() {
    return PrototypeToken.schema.fields;
  }

  /**
   * Is this sheet visible to the user?
   * @returns {boolean}
   */
  get isVisible() {
    const ownsActor = this.actor?.isOwner ?? false;
    return ownsActor && game.user.can("TOKEN_CONFIGURE");
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _canRender(options) {
    if ( !this.isVisible ) throw new Error(game.i18n.format("SHEETS.DocumentSheetPrivate", {type: "DOCUMENT.Token"}));
    return super._canRender(options);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _initializeApplicationOptions(options) {
    const initialized = super._initializeApplicationOptions(options);
    if ( options.prototype.parent?.uuid ) {
      const uuid = options.prototype.parent.uuid;
      initialized.id = `${this.constructor.name}-${uuid.replaceAll(".", "-")}`;
    }
    else throw new Error(`Prototype token ${options.prototype.name} lacks an identifiable parent.`);
    return initialized;
  }

  /* -------------------------------------------- */

  /** @override */
  async _initializeTokenPreview() {
    this._preview = this.#prototype.clone();
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _configureRenderOptions(options) {
    super._configureRenderOptions(options);
    options.resetPreview ??= !options.isFirstRender; // Reset the preview unless requested otherwise
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _prepareButtons() {
    const buttons = super._prepareButtons();
    buttons.unshift({type: "button", icon: "fa-solid fa-user", label: "TOKEN.Assign", action: "assignToken"});
    return buttons;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    this.#prototype.actor.apps[this.id] = this;
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /**
   * Handle Token assignment requests to update the default prototype Token
   * @this {PrototypeTokenConfig}
   * @type {ApplicationClickAction}
   */
  static async #onAssignToken() {
    // Get controlled Token data
    const tokens = canvas.ready ? canvas.tokens.controlled : [];
    if ( tokens.length !== 1 ) {
      ui.notifications.warn("TOKEN.AssignWarn", {localize: true});
      return;
    }
    const token = tokens.pop().document.toObject();
    token.tokenId = token.x = token.y = null;
    token.randomImg = this.form.elements.randomImg.checked;
    if ( token.randomImg ) delete token.texture.src;

    // Update the prototype token for the actor using the existing Token instance
    await this.actor.update({prototypeToken: token}, {diff: false, recursive: false, noHook: true});
    ui.notifications.info("TOKEN.AssignSuccess", {format: {name: this.actor.name}});
  }

  /* -------------------------------------------- */
  /*  Form Submission                             */
  /* -------------------------------------------- */

  /**
   * Customize how form data is extracted into an expanded object.
   * @param {SubmitEvent|null} event    The originating form submission event
   * @param {HTMLFormElement} form      The form element that was submitted
   * @param {FormDataExtended} formData Processed data for the submitted form
   * @returns {object} An expanded object of processed form data
   * @throws {Error}   Subclasses may throw validation errors here to prevent form submission
   * @protected
   */
  _processFormData(event, form, formData) {
    return foundry.utils.expandObject(formData.object);
  }

  /* -------------------------------------------- */

  /**
   * Process form submission for the sheet
   * @this {PrototypeTokenConfig}
   * @type {ApplicationFormSubmission}
   */
  static async #onSubmit(event, form, formData) {
    const submitData = this._processFormData(event, form, formData);
    submitData.detectionModes ??= []; // Clear detection modes array
    this._processChanges(submitData);
    const changes = {prototypeToken: submitData};
    this.actor.validate({changes, clean: true, fallback: false});
    await this.actor.update(changes);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _tearDown(options) {
    super._tearDown(options);
    delete this.#prototype.actor.apps[this.id];
  }
}

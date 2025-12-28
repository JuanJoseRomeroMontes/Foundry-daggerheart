import BaseSetting from "@common/documents/setting.mjs";
import ClientDocumentMixin from "./abstract/client-document.mjs";

/**
 * The client-side Setting document which extends the common BaseSetting model.
 * @extends BaseSetting
 * @mixes ClientDocumentMixin
 * @category Documents
 *
 * @see {@link foundry.documents.collections.WorldSettings}: The world-level collection of Setting
 *   documents
 */
export default class Setting extends ClientDocumentMixin(BaseSetting) {

  /**
   * The types of settings which should be constructed as a function call rather than as a class constructor.
   */
  static #PRIMITIVE_TYPES = Object.freeze([String, Number, Boolean, Array, BigInt]);

  /**
   * The setting configuration for this setting document.
   * @type {foundry.applications.settings.SettingsConfig|undefined}
   */
  get config() {
    return game.settings?.settings.get(this.key);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _initialize(options={}) {
    super._initialize(options);
    this.value = this._castType();
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onCreate(data, options, userId) {
    super._onCreate(data, options, userId);
    const onChange = this.config?.onChange;
    if ( onChange instanceof Function ) onChange(this.value, options, userId);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);
    const onChange = this.config?.onChange;
    if ( ("value" in changed) && (onChange instanceof Function) ) onChange(this.value, options, userId);
  }

  /* -------------------------------------------- */

  /**
   * Cast the value of the Setting into its defined type.
   * @returns {*}     The initialized type of the Setting document.
   * @protected
   */
  _castType() {

    // Allow undefined and null directly
    if ( (this.value === null) || (this.value === undefined) ) return this.value;

    const type = this.config?.type;

    // DataField types
    if ( type instanceof foundry.data.fields.DataField ) {
      return type.initialize(type.clean(this.value));
    }

    // Undefined type stays as a string
    if ( !(type instanceof Function) ) return this.value;

    // DataModel types
    if ( foundry.utils.isSubclass(type, foundry.abstract.DataModel) ) {
      return type.fromSource(this.value);
    }

    // Primitive types
    if ( Setting.#PRIMITIVE_TYPES.includes(type) ) {
      if ( (type === String) && (typeof this.value !== "string") ) return JSON.stringify(this.value);
      if ( this.value instanceof type ) return this.value;
      return type(this.value);
    }

    // Constructed types
    const isConstructed = type?.prototype?.constructor === type;
    return isConstructed ? new type(this.value) : type(this.value);
  }
}

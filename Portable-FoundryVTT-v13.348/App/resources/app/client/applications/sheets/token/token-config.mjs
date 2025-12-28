import BaseToken from "@common/documents/token.mjs";
import DocumentSheetV2 from "../../api/document-sheet.mjs";
import FormDataExtended from "../../ux/form-data-extended.mjs";
import TokenApplicationMixin from "./mixin.mjs";
import TokenDocument from "@client/documents/token.mjs";

/**
 * The Application responsible for configuring a single token document within a parent Scene
 * @extends ApplicationSheetV2
 * @mixes TokenApplication
 */
export default class TokenConfig extends TokenApplicationMixin(DocumentSheetV2) {

  /** @override */
  isPrototype = false;

  /** @override */
  get token() {
    return this._preview ?? this.document;
  }

  /** @override */
  get actor() {
    return this.document.actor;
  }

  /** @override */
  get _fields() {
    return BaseToken.schema.fields;
  }

  /** @inheritDoc */
  get isVisible() {
    return super.isVisible && game.user.can("TOKEN_CONFIGURE");
  }

  /* -------------------------------------------- */

  /** @override */
  async _initializeTokenPreview() {
    if ( !this.document.object ) {
      this._preview = null;
      return;
    }
    if ( !this._preview ) {
      const clone = this.document.object.clone({}, {keepId: true});
      this._preview = clone.document;
      clone.control({releaseOthers: true});
    }
    await this._preview.object.draw();
    this.document.object.renderable = false;
    this.document.object.initializeSources({deleted: true});
    this._preview.object.layer._configPreview.addChild(this._preview.object);
    this._previewChanges();
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.gridUnits = this.token.parent?.grid.units || game.i18n.localize("GridUnits");
    return context;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareAppearanceTab(options) {
    const context = await super._prepareAppearanceTab(options);
    const gridType = this.token.parent?.grid.type;
    if ( gridType === CONST.GRID_TYPES.SQUARE ) {
      context.shapes = {
        [CONST.TOKEN_SHAPES.RECTANGLE_1]: game.i18n.localize("TOKEN.SHAPES.RECTANGLE.label")
      };
    }
    else if ( gridType === CONST.GRID_TYPES.GRIDLESS ) {
      context.shapes = {
        [CONST.TOKEN_SHAPES.ELLIPSE_1]: game.i18n.localize("TOKEN.SHAPES.ELLIPSE.label"),
        [CONST.TOKEN_SHAPES.RECTANGLE_1]: game.i18n.localize("TOKEN.SHAPES.RECTANGLE.label")
      };
    }
    return context;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _toggleDisabled(disabled) {
    super._toggleDisabled(disabled);
    const anchor = this.element.querySelector("a[data-action=addDetectionMode]");
    anchor.classList.toggle("disabled", disabled);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _previewChanges(changes) {
    super._previewChanges(changes);
    if ( this._preview?.object?.destroyed === false ) {
      this._preview.object.initializeSources();
      this._preview.object.renderFlags.set({refresh: true});
    }
  }

  /* -------------------------------------------- */

  /**
   * Reset the temporary preview of the Token when the form is submitted or closed.
   * @protected
   */
  #resetPreview() {
    if ( !this._preview ) return;
    if ( this._preview.object?.destroyed === false ) {
      this._preview.object.destroy({children: true});
    }
    this._preview.baseActor?._unregisterDependentToken(this._preview);
    this._preview = null;
    const object = this.document.object;
    if ( object?.destroyed === false ) {
      object.renderable = true;
      object.initializeSources();
      object.control();
      object.renderFlags.set({refresh: true});
    }
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _onRender(context, options) {
    this.#toggleTurnMarkerDisabledFields();
    return super._onRender(context, options);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onChangeForm(formConfig, event) {
    super._onChangeForm(formConfig, event);
    if ( ["bar1", "bar2"].includes(event.target.name) ) {
      this._onChangeBar(event);
    }
    const formData = new FormDataExtended(this.form);
    const submitData = this._prepareSubmitData(event, this.form, formData);
    this._previewChanges(submitData);

    // Turn Marker Disabled/Enabled
    if ( event.target.name === "turnMarker.mode" ) this.#toggleTurnMarkerDisabledFields();

    // Special handling for darkness state change
    if ( event.target.name === "light.negative") this.render({parts: ["light"]});
  }

  /* -------------------------------------------- */

  /**
   * Toggle the disabled state for certain turn marker fields depending on the mode.
   */
  #toggleTurnMarkerDisabledFields() {
    const notCustom = this.form["turnMarker.mode"].value !== "2";
    for ( const field of Object.values(this.document.schema.fields.turnMarker.fields) ) {
      if ( field.name === "mode" ) continue;
      const input = this.form[field.fieldPath];
      if ( input ) input.disabled = notCustom;
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle changing the attribute bar in the drop-down selector to update the default current and max value
   * @param {Event} event  The select input change event
   * @protected
   */
  _onChangeBar(event) {
    const form = this.form;
    const attr = this.token.getBarAttribute("", {alternative: event.target.value});
    const barName = event.target.name;
    form.querySelector(`input[data-${barName}-value]`).value = attr !== null ? attr.value : "";
    form.querySelector(`input[data-${barName}-max]`).value = ((attr !== null) && (attr.type === "bar")) ? attr.max : "";
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onClose(options) {
    super._onClose(options);
    this.#resetPreview();
  }

  /* -------------------------------------------- */
  /*  Form Submission                             */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _processFormData(event, form, formData) {
    const submitData = super._processFormData(event, form, formData);
    submitData.detectionModes ??= []; // Clear detection modes array
    this._processChanges(submitData);
    return submitData;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _processSubmitData(event, form, submitData, options) {
    let waypoint = {};
    for ( const k of TokenDocument.MOVEMENT_FIELDS ) {
      if ( k in submitData ) {
        if ( submitData[k] !== this.document._source[k] ) waypoint[k] = submitData[k];
        delete submitData[k];
      }
    }
    await super._processSubmitData(event, form, submitData, options);
    this.#resetPreview();
    if ( foundry.utils.isEmpty(waypoint) ) return;
    if ( this.document.rendered ) waypoint = this.document.object._getConfigMovementPosition(waypoint);
    waypoint.action = "displace";
    waypoint.snapped = false;
    waypoint.explicit = true;
    waypoint.checkpoint = true;
    await this.document.move(waypoint, {method: "config", autoRotate: false, showRuler: false,
      constrainOptions: {ignoreWalls: true, ignoreCost: true}});
  }
}

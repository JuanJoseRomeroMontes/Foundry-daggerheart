import DocumentSheetV2 from "../api/document-sheet.mjs";
import HandlebarsApplicationMixin from "../api/handlebars-application.mjs";

/**
 * @import {FormNode, FormFooterButton} from "../_types.mjs";
 */

/**
 * The Scene Region configuration application.
 * @extends DocumentSheetV2
 * @mixes HandlebarsApplication
 */
export default class RegionBehaviorConfig extends HandlebarsApplicationMixin(DocumentSheetV2) {
  constructor(options) {
    super(options);
    this.options.window.icon = CONFIG.RegionBehavior.typeIcons[this.document.type];
  }

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    classes: ["region-behavior-config"],
    window: {
      contentClasses: ["standard-form"],
      icon: undefined // Defined in constructor
    },
    position: {width: 480},
    form: {
      closeOnSubmit: true
    }
  };

  /** @override */
  static PARTS = {
    form: {
      template: "templates/generic/form-fields.hbs",
      scrollable: [""]
    },
    footer: {
      template: "templates/generic/form-footer.hbs"
    }
  };

  /* -------------------------------------------- */
  /*  Context Preparation                         */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    return Object.assign(context, {
      region: context.document,
      fields: this._getFields(),
      buttons: this._getButtons()
    });
  }

  /* -------------------------------------------- */

  /**
   * Prepare form field structure for rendering.
   * @returns {FormNode[]}
   * @protected
   */
  _getFields() {
    const doc = this.document;
    const source = doc._source;
    const fields = doc.schema.fields;
    const {events, ...systemFields} = CONFIG.RegionBehavior.dataModels[doc.type].schema.fields;
    const fieldsets = [];

    // Identity
    fieldsets.push({
      fieldset: true,
      legend: "BEHAVIOR.SECTIONS.identity",
      fields: [
        {field: fields.name, value: source.name}
      ]
    });

    // Status
    fieldsets.push({
      fieldset: true,
      legend: "BEHAVIOR.SECTIONS.status",
      fields: [
        {field: fields.disabled, value: source.disabled}
      ]
    });

    // Subscribed events
    if ( events ) {
      fieldsets.push({
        fieldset: true,
        legend: "BEHAVIOR.TYPES.base.SECTIONS.events",
        fields: [
          {field: events, value: source.system.events}
        ]
      });
    }

    // Other system fields
    const sf = {fieldset: true, legend: CONFIG.RegionBehavior.typeLabels[doc.type], fields: []};
    this.#addSystemFields(sf, systemFields, source);
    if ( sf.fields.length ) fieldsets.push(sf);
    return fieldsets;
  }

  /* -------------------------------------------- */

  /**
   * Recursively add system model fields to the fieldset.
   */
  #addSystemFields(fieldset, schema, source, _path="system") {
    for ( const field of Object.values(schema) ) {
      const path = `${_path}.${field.name}`;
      if ( field instanceof foundry.data.fields.SchemaField ) {
        this.#addSystemFields(fieldset, field.fields, source, path);
      }
      else if ( field.constructor.hasFormSupport ) {
        fieldset.fields.push({field, value: foundry.utils.getProperty(source, path)});
      }
    }
  }

  /* -------------------------------------------- */

  /**
   * Get footer buttons for this behavior config sheet.
   * @returns {FormFooterButton[]}
   * @protected
   */
  _getButtons() {
    return [
      {type: "submit", icon: "fa-solid fa-floppy-disk", label: "BEHAVIOR.ACTIONS.update"}
    ];
  }
}

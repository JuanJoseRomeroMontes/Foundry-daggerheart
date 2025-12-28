import {DocumentSheetV2, HandlebarsApplicationMixin} from "../api/_module.mjs";
import Adventure from "@client/documents/adventure.mjs";
import TextEditor from "../ux/text-editor.mjs";

/**
 * @import {AdventureImportData, AdventureImportOptions, AdventureImportResult} from "@client/documents/_types.mjs";
 * @import {ApplicationFormConfiguration} from "../_types.mjs";
 * @import {SchemaField} from "@common/data/fields.mjs";
 * @import Adventure from "@client/documents/adventure.mjs";
 */

/**
 * This Document Sheet is responsible for rendering an Adventure and providing an interface to import it.
 * @extends DocumentSheetV2
 * @mixes HandlebarsApplicationMixin
 */
export default class AdventureImporterV2 extends HandlebarsApplicationMixin(DocumentSheetV2) {

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    classes: ["adventure-importer"],
    window: {
      contentClasses: ["standard-form"],
      icon: "fa-solid fa-download"
    },
    position: {width: 920},
    form: {
      submitOnClose: false,
      closeOnSubmit: true
    }
  };

  /** @override */
  static PARTS = {
    body: {template: "templates/adventure/importer.hbs"},
    footer: {template: "templates/generic/form-footer.hbs"}
  };

  /**
   * A convenience alias for AdventureImporter#document
   * @type {Adventure}
   */
  get adventure() {
    return this.document;
  }

  /** @override */
  get isEditable() {
    // We don't care for the purposes of import whether the compendium pack is locked
    return this.document.testUserPermission(game.user, this.options.editPermission);
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const adventure = context.document;
    const description = await TextEditor.implementation.enrichHTML(adventure.description, {secrets: adventure.isOwner});
    return Object.assign(context, {
      adventure,
      description,
      contents: this._getContentList(),
      imported: !!game.settings.get("core", "adventureImports")?.[adventure.uuid],
      optionsSchema: this._prepareImportOptionsSchema(options),
      buttons: [{ type: "submit", icon: "fa-solid fa-download", label: "ADVENTURE.ImportSubmit" }]
    });
  }

  /* -------------------------------------------- */

  /**
   * Prepare import options schema.
   * Options are rendered using the DataField#toInput method.
   * @param {AdventureImportOptions} options
   * @returns {SchemaField|undefined}
   * @protected
   */
  _prepareImportOptionsSchema(options) {}

  /* -------------------------------------------- */

  /**
   * Prepare a list of content types provided by this adventure.
   * @returns {{icon: string, label: string, count: number}[]}
   * @protected
   */
  _getContentList() {
    return Object.entries(Adventure.contentFields).reduce((arr, [field, cls]) => {
      const count = this.adventure[field].size;
      if ( !count ) return arr;
      arr.push({
        icon: CONFIG[cls.documentName].sidebarIcon,
        label: game.i18n.localize(count > 1 ? cls.metadata.labelPlural : cls.metadata.label),
        count, field
      });
      return arr;
    }, []);
  }

  /* -------------------------------------------- */
  /*  Import Workflows                            */
  /* -------------------------------------------- */

  /**
   * Configure how adventures that use this sheet class are imported.
   * This can be implemented by subclasses to implement custom import workflows.
   * @param {AdventureImportOptions} importOptions
   * @returns {Promise<void>}
   * @internal
   */
  async _configureImport(importOptions) {}

  /* -------------------------------------------- */

  /**
   * Configure how adventures that use this sheet class are imported.
   * This can be implemented by subclasses to implement custom import workflows.
   * @param {AdventureImportData} importData
   * @param {AdventureImportOptions} importOptions
   * @returns {Promise<void>}
   * @internal
   */
  async _preImport(importData, importOptions) {}

  /* -------------------------------------------- */

  /**
   * Configure how adventures that use this sheet class are imported.
   * This can be implemented by subclasses to implement custom import workflows.
   * @param {AdventureImportResult} importResult
   * @param {AdventureImportOptions} importOptions
   * @returns {Promise<void>}
   * @internal
   */
  async _onImport(importResult, importOptions) {}

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /** @override */
  _prepareSubmitData(event, form, formData, _updateData) {
    // Unlike parent document sheets, the form data here is arbitrary
    return this._processFormData(event, form, formData);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onChangeForm(formConfig, event) {
    if ( (event.target.name === "importFields") && (event.target.value === "all") ) this._onToggleImportAll(event);
    super._onChangeForm(formConfig, event);
  }

  /* -------------------------------------------- */

  /**
   * Handle toggling the import all checkbox.
   * @param {Event} event  The change event.
   * @protected
   */
  _onToggleImportAll(event) {
    const target = event.target;
    const section = target.closest(".import-controls");
    const checked = target.checked;
    section.querySelectorAll("input").forEach(input => {
      if ( input === target ) return;
      if ( input.value !== "folders" ) input.disabled = checked;
      if ( checked ) input.checked = true;
    });
  }

  /* -------------------------------------------- */

  /** @override */
  async _processSubmitData(_event, _form, submitData, _options) {
    await this.adventure.import(submitData);
  }
}

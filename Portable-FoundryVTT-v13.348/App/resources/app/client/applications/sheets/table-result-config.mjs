import {CompendiumCollection} from "@client/documents/collections/_module.mjs";
import {DocumentSheetV2, HandlebarsApplicationMixin} from "../api/_module.mjs";
import TableResult from "@client/documents/table-result.mjs";

/**
 * @import {DeepPartial, TableResultData} from "@common/documents/_types.mjs";
 */

/**
 * The Application responsible for configuring a single TableResult document within a parent RollTable.
 * @extends DocumentSheetV2
 * @mixes HandlebarsApplication
 */
export default class TableResultConfig extends HandlebarsApplicationMixin(DocumentSheetV2) {

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    classes: ["table-result-config"],
    window: {
      contentClasses: ["standard-form"],
      icon: "fa-solid fa-table-rows"
    },
    position: {width: 560},
    form: {
      closeOnSubmit: true
    }
  };

  /** @override */
  static PARTS = {
    sheet: {template: "templates/sheets/table-result-config.hbs", root: true},
    footer: {template: "templates/generic/form-footer.hbs"}
  };

  /**
   * TableResult types with localized labels
   * @returns {{value: string; label: string}[]}
   */
  static get RESULT_TYPES() {
    return TableResultConfig.#RESULT_TYPES ??= TableResult.TYPES.map(value => ({
      value,
      label: game.i18n.localize(`TABLE_RESULT.TYPES.${value}`)
    }));
  }

  /** @type {{value: string; label: string}[]|undefined} */
  static #RESULT_TYPES;

  /* -------------------------------------------- */

  /**
   * Prepare the update data of a single TableResult document to ensure joint validation.
   * @param {DeepPartial<TableResultData>} data The TableResult update data
   */
  static prepareResultUpdateData(data) {
    if ( data.type === "text" ) {
      data.documentUuid = null;
    }
    else if ( data.documentUuid ) {
      const {id, collection} = foundry.utils.parseUuid(data.documentUuid) ?? {};
      if (!id || !collection) return;

      // Get the original document: if the name still matches, take no action
      const docsOrIndex = collection instanceof CompendiumCollection ? collection.index : collection;
      const original = docsOrIndex.get(id);
      if (original?.name === data.name) return;

      // Otherwise, find the document by name
      const document = original ?? collection.getName(data.name);
      if ( !document ) return;
      data.documentUuid = document.uuid ?? foundry.utils.buildUuid({...document, id: document._id});
      data.name = document.name ?? "";
      data.img = document.thumb ?? document.img ?? null;
    }
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const source = context.source;
    context.types = TableResultConfig.RESULT_TYPES;
    context.resultDocument = await foundry.utils.fromUuid(source.documentUuid);
    context.buttons = [{type: "submit", icon: "fa-solid fa-floppy-disk", label: "TABLE_RESULT.ACTIONS.Submit"}];
    return context;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _prepareSubmitData(event, form, formData, updateData) {
    const submitData = super._prepareSubmitData(event, form, formData, updateData);
    TableResultConfig.prepareResultUpdateData(submitData);
    return submitData;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onChangeForm(formConfig, event) {
    super._onChangeForm(formConfig, event);
    const elements = this.form.elements;
    if ( event.target === elements.type ) {
      const isText = event.target.value === "text";
      elements.documentUuid.closest(".form-group").hidden = isText;
    }
    else if ( event.target === elements.description ) {
      this.submit();
    }
  }
}

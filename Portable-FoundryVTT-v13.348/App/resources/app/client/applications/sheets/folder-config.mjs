import {DocumentSheetV2, HandlebarsApplicationMixin} from "../api/_module.mjs";

/**
 * The Application responsible for configuring a single Folder document.
 * @extends DocumentSheetV2
 * @mixes HandlebarsApplication
 */
export default class FolderConfig extends HandlebarsApplicationMixin(DocumentSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["folder-config"],
    canCreate: true,
    window: {
      contentClasses: ["standard-form"],
      icon: "fa-solid fa-folder"
    },
    position: {width: 480},
    form: {
      closeOnSubmit: true
    }
  };

  /** @override */
  static PARTS = {
    body: {template: "templates/sheets/folder-config.hbs"},
    footer: {template: "templates/generic/form-footer.hbs"}
  };

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const folder = context.document;
    const folderExists = !!folder.collection?.has(folder.id) || folder.inCompendium;
    if ( folderExists ) context.name = context.namePlaceholder = folder._source.name;
    else {
      context.name = "";
      context.namePlaceholder = folder.constructor.defaultName({pack: folder.pack});
    }
    const submitText = folderExists ? "FOLDER.Update" : "SIDEBAR.ACTIONS.CREATE.Folder";
    context.buttons = [{type: "submit", icon: "fa-solid fa-floppy-disk", label: submitText}];
    return context;
  }

  /* -------------------------------------------- */

  /** @override */
  _onChangeForm(_formConfig, event) {

    // Update the window title to reflect the new name
    if ( event.target.name === "name" ) {
      const newValue = event.target.value.trim() || event.target.placeholder;
      const windowTitle = `${game.i18n.localize("DOCUMENT.Folder")}: ${newValue}`;
      this.element.querySelector(":scope > header > h1").innerText = windowTitle;
    }
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _processFormData(event, form, formData) {
    const submitData = super._processFormData(event, form, formData);
    if ( !submitData.name.trim() ) {
      const folder = this.document;
      const folderExists = !!folder.collection?.has(folder.id) || folder.inCompendium;
      if ( folderExists ) delete submitData.name;
      else submitData.name = form.name.placeholder;
    }
    return submitData;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _processSubmitData(event, form, submitData, options) {
    const folder = this.document;
    if ( folder.inCompendium ) {
      await folder.update(submitData, options);
      return;
    }
    return super._processSubmitData(event, form, submitData, options);
  }
}

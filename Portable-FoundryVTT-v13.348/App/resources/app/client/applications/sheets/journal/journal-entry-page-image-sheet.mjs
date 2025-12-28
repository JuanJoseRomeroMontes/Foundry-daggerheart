import JournalEntryPageHandlebarsSheet from "./journal-entry-page-hbs-sheet.mjs";

/**
 * An Application responsible for displaying and editing a single image-type JournalEntryPage Document.
 * @extends JournalEntryPageHandlebarsSheet
 */
export default class JournalEntryPageImageSheet extends JournalEntryPageHandlebarsSheet {
  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["image"],
    window: {
      icon: "fa-solid fa-image"
    }
  };

  /** @inheritDoc */
  static EDIT_PARTS = {
    header: super.EDIT_PARTS.header,
    content: {
      template: "templates/journal/pages/image/edit.hbs",
      classes: ["standard-form"]
    },
    footer: super.EDIT_PARTS.footer
  };

  /** @override */
  static VIEW_PARTS = {
    content: {
      template: "templates/journal/pages/image/view.hbs",
      root: true
    }
  };

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const { image, src } = this.page;
    Object.assign(context, { src, caption: image.caption, srcInput: this.#createSourceInput.bind(this) });
    return context;
  }

  /* -------------------------------------------- */

  /**
   * Create a FilePicker input for the image source field.
   * @param {DataField} field              The source field.
   * @param {FormInputConfig} inputConfig  The form input configuration.
   * @returns {HTMLFilePickerElement}
   */
  #createSourceInput(field, inputConfig) {
    return foundry.applications.elements.HTMLFilePickerElement.create({ type: "image", ...inputConfig });
  }
}

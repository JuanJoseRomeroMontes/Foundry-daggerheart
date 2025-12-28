import {DocumentSheetV2, HandlebarsApplicationMixin} from "../api/_module.mjs";
import {StringField} from "@common/data/fields.mjs";
import TextEditor from "../ux/text-editor.mjs";

/**
 * The Application responsible for displaying a basic sheet for any Document sub-types that do not have a sheet
 * registered.
 * @extends DocumentSheetV2
 * @mixes HandlebarsApplication
 */
export default class BaseSheet extends HandlebarsApplicationMixin(DocumentSheetV2) {
  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    classes: ["base-sheet"],
    position: {width: 480},
    window: {
      contentClasses: ["standard-form"],
      resizable: true
    },
    form: {
      submitOnChange: true
    }
  };

  static PARTS = {
    sheet: {
      template: "templates/sheets/base-sheet.hbs",
      root: true
    }
  };

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const {document, fields} = context;
    const hasDescription = ("description" in fields) && (fields.description instanceof StringField);
    if ( hasDescription ) {
      context.descriptionHTML = await TextEditor.implementation.enrichHTML(document.description, {
        secrets: document.isOwner,
        relativeTo: document
      });
    }
    context.hasNothing = !hasDescription && !("img" in fields) && !("name" in fields);
    return context;
  }
}

import HandlebarsApplicationMixin from "../../api/handlebars-application.mjs";
import JournalEntryPageSheet from "./journal-entry-page-sheet.mjs";
import JournalEntry from "@client/documents/journal-entry.mjs";

/**
 * @import {ApplicationRenderContext} from "../../_types.mjs"
 * @import {HandlebarsTemplatePart, HandlebarsRenderOptions} from "../../api/handlebars-application.mjs"
 */

/**
 * An abstract subclass that contains specialised handlebars logic for JournalEntryPageSheets.
 * @extends JournalEntryPageSheet
 * @mixes HandlebarsApplication
 */
export default class JournalEntryPageHandlebarsSheet extends HandlebarsApplicationMixin(JournalEntryPageSheet) {
  /**
   * Handlebars parts to render in edit mode.
   * @type {Record<string, HandlebarsTemplatePart>}
   */
  static EDIT_PARTS = {
    header: {
      template: "templates/journal/parts/page-header.hbs"
    },
    footer: {
      template: "templates/journal/parts/page-footer.hbs",
      classes: ["journal-footer", "flexrow"]
    }
  };

  /**
   * Handlebars part to render in view mode.
   * @type {Record<string, HandlebarsTemplatePart>}
   */
  static VIEW_PARTS = {};

  /* -------------------------------------------- */

  /** @override */
  _configureRenderParts(options) {
    const parts = this.isView ? this.constructor.VIEW_PARTS : this.constructor.EDIT_PARTS;
    return foundry.utils.deepClone(parts);
  }

  /* -------------------------------------------- */

  /**
   * Prepare render context for the content part.
   * @param {ApplicationRenderContext} context
   * @param {HandlebarsRenderOptions} options
   * @returns {Promise<void>}
   * @protected
   */
  async _prepareContentContext(context, options) {}

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    switch ( partId ) {
      case "header": await this._prepareHeaderContext(context, options); break;
      case "footer": await this._prepareFooterContext(context, options); break;
      case "content": await this._prepareContentContext(context, options); break;
    }
    return context;
  }

  /* -------------------------------------------- */

  /**
   * Prepare render context for the footer part.
   * @param {ApplicationRenderContext} context
   * @param {HandlebarsRenderOptions} options
   * @returns {Promise<void>}
   * @protected
   */
  async _prepareFooterContext(context, options) {
    context.buttons = [{
      type: "submit",
      cssClass: "",
      icon: "fa-solid fa-feather-pointed",
      label: "JOURNAL.Submit"
    }];
  }

  /* -------------------------------------------- */

  /**
   * Prepare render context for the header part.
   * @param {ApplicationRenderContext} context
   * @param {HandlebarsRenderOptions} options
   * @returns {Promise<void>}
   * @protected
   */
  async _prepareHeaderContext(context, options) {
    const categories = this.page.parent.categories.contents.sort(JournalEntry.sortCategories);
    if ( categories.length ) context.categories = [
      { value: "", label: game.i18n.localize("JOURNAL.Uncategorized") },
      ...categories.map(({ id, name }) => ({ value: id, label: name }))
    ];
    context.headingLevels = this._prepareHeadingLevels();
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _prepareSubmitData(event, form, formData, updateData) {
    if ( formData.object.category === "" ) formData.set("category", null);
    return super._prepareSubmitData(event, form, formData, updateData);
  }
}

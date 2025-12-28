import {StringField} from "@common/data/fields.mjs";
import DocumentSheetV2 from "@client/applications/api/document-sheet.mjs";
import HandlebarsApplicationMixin from "@client/applications/api/handlebars-application.mjs";
import FormDataExtended from "@client/applications/ux/form-data-extended.mjs";
import JournalEntry from "@client/documents/journal-entry.mjs";

/**
 * @import JournalEntryCategory from "@client/documents/journal-entry-category.mjs"
 */

/**
 * An Application responsible for managing a journal entry's categories.
 * @extends DocumentSheetV2
 * @mixes HandlebarsApplication
 */
export default class JournalEntryCategoryConfig extends HandlebarsApplicationMixin(DocumentSheetV2) {
  /** @override */
  static DEFAULT_OPTIONS = {
    id: "journal-category-config-{id}",
    classes: ["journal-category-config"],
    window: {
      icon: "fa-solid fa-chart-tree-map",
      contentClasses: ["standard-form"]
    },
    position: {
      width: 480
    },
    actions: {
      addCategory: JournalEntryCategoryConfig.#onAddCategory,
      removeCategory: JournalEntryCategoryConfig.#onRemoveCategory,
      sortDown: JournalEntryCategoryConfig.#onSort,
      sortUp: JournalEntryCategoryConfig.#onSort
    },
    form: {
      submitOnChange: true
    }
  };

  /** @override */
  static PARTS = {
    form: {
      template: "templates/journal/category-config.hbs"
    }
  };

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /** @override */
  get title() {
    return game.i18n.format("JOURNAL.ConfigureCategoriesTitle", { name: this.document.name });
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.categories = this.document.categories.contents.sort(JournalEntry.sortCategories).map((category, i) => {
      const field = new StringField({ blank: false });
      field.name = `${i}.name`;
      return {
        field,
        placeholder: game.i18n.localize("JOURNAL.CategoryName"),
        name: category._source.name,
        id: category.id,
        sort: category.sort
      };
    });
    return context;
  }

  /* -------------------------------------------- */
  /*  Event Listeners & Handlers                  */
  /* -------------------------------------------- */

  /**
   * Add a new category to the journal entry.
   * @this {JournalEntryCategoryConfig}
   * @returns {Promise<JournalEntryCategory>}
   */
  static #onAddCategory() {
    const categories = this.#prepareCategories();
    const cls = getDocumentClass("JournalEntryCategory");
    const parent = this.document;
    return cls.create({
      name: cls.defaultName({ parent, pack: this.document.pack }),
      sort: (categories.length + 1) * CONST.SORT_INTEGER_DENSITY
    }, { parent });
  }

  /* -------------------------------------------- */

  /**
   * Remove a category from the journal entry.
   * @this {JournalEntryCategoryConfig}
   * @param {PointerEvent} event  The triggering event.
   * @param {HTMLElement} target  The action target element.
   * @returns {Promise<JournalEntryCategory>}
   */
  static #onRemoveCategory(event, target) {
    const { categoryId } = target.closest("[data-category-id]").dataset;
    return this.document.categories.get(categoryId)?.delete();
  }

  /* -------------------------------------------- */

  /**
   * Sort categories between each other.
   * @this {JournalEntryCategoryConfig}
   * @param {PointerEvent} event  The triggering event.
   * @param {HTMLElement} target  The action target element.
   * @returns {Promise<JournalEntry>}
   */
  static #onSort(event, target) {
    const { action } = target.dataset;
    const category = target.closest("[data-category-id]");
    if ( (action === "sortUp") && category.previousElementSibling ) {
      category.previousElementSibling.insertAdjacentElement("beforebegin", category);
    } else if ( (action === "sortDown") && category.nextElementSibling ) {
      category.nextElementSibling.insertAdjacentElement("afterend", category);
    }
    return this.document.update({ categories: this.#prepareCategories() });
  }

  /* -------------------------------------------- */

  /** @override */
  async _processSubmitData(event, form, submitData, options) {
    this.document.update({ categories: this.#prepareCategories() }, options);
  }

  /* -------------------------------------------- */

  /**
   * Prepare category data for update.
   * @returns {JournalEntryCategory[]}
   */
  #prepareCategories() {
    this.element.querySelectorAll(".sort-field").forEach((el, i) => el.value = (i + 1) * CONST.SORT_INTEGER_DENSITY);
    return Object.values(foundry.utils.expandObject(new FormDataExtended(this.form).object));
  }
}

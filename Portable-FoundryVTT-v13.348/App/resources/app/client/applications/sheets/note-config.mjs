import {DocumentSheetV2, HandlebarsApplicationMixin} from "../api/_module.mjs";
import FontConfig from "@client/applications/settings/menus/font-config.mjs";

/**
 * The Application responsible for configuring a single Note document within a parent Scene.
 * @extends DocumentSheetV2
 * @mixes HandlebarsApplication
 */
export default class NoteConfig extends HandlebarsApplicationMixin(DocumentSheetV2) {
  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    classes: ["note-config"],
    canCreate: true,
    position: {width: 480},
    window: {
      contentClasses: ["standard-form"],
      icon: "fa-solid fa-bookmark"
    },
    form: {
      closeOnSubmit: true
    }
  };

  /** @override */
  static PARTS = {
    body: {template: "templates/scene/note/config.hbs"},
    footer: {template: "templates/generic/form-footer.hbs"}
  };

  /** @inheritDoc */
  get title() {
    if ( !this.document.id ) return game.i18n.localize("NOTE.Create");
    const textLabel = this.document.text;
    return textLabel ? `${game.i18n.localize("DOCUMENT.Note")}: ${textLabel}` : super.title;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const {document, source} = context;
    const entry = game.journal.get(source.entryId) ?? null;
    const {icons, icon} = this.#prepareIcons(source.texture.src);
    const textAnchors = Object.entries(CONST.TEXT_ANCHOR_POINTS).reduce((anchors, e) => {
      anchors[e[1]] = game.i18n.localize(`JOURNAL.Anchor${e[0].titleCase()}`);
      return anchors;
    }, {});
    const isCreated = !!document.collection?.has(document.id);
    const submitText = isCreated ? "NOTE.Update" : "NOTE.Create";
    return Object.assign(context, {
      entries: game.journal
        .filter(e => e.isOwner)
        .map(e => ({value: e.id, label: e.name}))
        .sort((a, b) => a.label.localeCompare(b.label, game.i18n.lang)),
      entry,
      pages: this.#preparePages(entry),
      global: isCreated ? source.global : !document.parent?.tokenVision,
      icons,
      icon,
      fontFamilies: FontConfig.getAvailableFontChoices(),
      textAnchors,
      gridUnits: document.parent?.grid.units || game.i18n.localize("GridUnits"),
      buttons: [{type: "submit", icon: "fa-solid fa-floppy-disk", label: submitText}]
    });
  }

  /* -------------------------------------------- */

  /**
   * Get all pages from a journal entry in a form suitable for passing to a selectOptions helper.
   * @param {JournalEntry|null} entry
   * @returns {Record<string, string>}
   */
  #preparePages(entry) {
    return entry?.pages.contents.sort((a, b) => a.sort - b.sort).reduce((obj, page) => {
      obj[page.id] = page.name;
      return obj;
    }, {}) ?? {};
  }

  /* -------------------------------------------- */

  /**
   * Localize and sort available icon options and determine whether a custom icon is in use.
   * @returns {{icons: Record<string, string>; icon: {selected: string; custom: string}}}
   */
  #prepareIcons() {
    const icons = Object.entries(CONFIG.JournalEntry.noteIcons)
      .sort(([a], [b]) => a.localeCompare(b, game.i18n.lang))
      .reduce((obj, [label, src]) => {
        obj[src] = label;
        return obj;
      }, {"": game.i18n.localize("NOTE.Custom")});
    const currentIcon = this.document._source.texture.src;
    const usingCustom = (currentIcon === "") || !(currentIcon in icons);
    const icon = {
      selected: usingCustom ? "" : currentIcon,
      custom: usingCustom ? currentIcon : ""
    };
    return {icons, icon};
  }

  /* -------------------------------------------- */

  /**
   * @param {Event} event
   * @override
   */
  _onChangeForm(_formConfig, event) {
    switch (event.target.name) {
      // Replace pageId selectOptions with list from the newly selected journal entry
      case "entryId": {
        const entry = game.journal.get(event.target.value) ?? null;
        const newOptions = this.#preparePages(entry);
        this.form["pageId"].innerHTML = foundry.applications.handlebars.selectOptions(newOptions, {hash: {blank: ""}});
        break;
      }
      // Show/hide the Custom Icon field depending on whether the Entry Icon "Custom" option is selected
      case "icon.selected":
        this.element.querySelector("[data-icon-custom]").hidden = event.target.value !== "";
        break;
      // Change the window title to reflect the changed text label
      case "text": {
        const newValue = event.target.value.trim();
        const windowTitle = newValue ? `${game.i18n.localize("DOCUMENT.Note")}: ${newValue}` : this.title;
        this.element.querySelector(":scope > header > h1").innerText = windowTitle;
      }
    }
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _processFormData(event, form, formData) {
    const fields = formData.object;
    fields["texture.src"] = fields["icon.selected"] || fields["icon.custom"];
    delete fields["icon.selected"];
    delete fields["icon.custom"];
    return super._processFormData(event, form, formData);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onClose(options) {
    super._onClose(options);
    const obj = this.document.object;
    if ( obj?.isPreview ) obj.destroy({children: true});
  }
}

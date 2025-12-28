import DocumentSheet from "../api/document-sheet-v1.mjs";
import Adventure from "../../documents/adventure.mjs";
import Hooks from "../../helpers/hooks.mjs";

/**
 * An interface for importing an adventure from a compendium pack.
 * @deprecated since v13
 */
export default class AdventureImporter extends DocumentSheet {

  /**
   * An alias for the Adventure document
   * @type {Adventure}
   */
  adventure = this.object;

  /** @override */
  get isEditable() {
    return game.user.isGM;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      template: "templates/adventure/importer-v1.hbs",
      id: "adventure-importer",
      classes: ["sheet", "adventure", "adventure-importer"],
      width: 800,
      height: "auto",
      submitOnClose: false,
      closeOnSubmit: true
    });
  }

  /* -------------------------------------------- */

  /** @override */
  async getData(options={}) {
    return {
      adventure: this.adventure,
      contents: this._getContentList(),
      imported: !!game.settings.get("core", "adventureImports")?.[this.adventure.uuid]
    };
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  activateListeners(html) {
    super.activateListeners(html);
    html.find('[value="all"]').on("change", this._onToggleImportAll.bind(this));
  }

  /* -------------------------------------------- */

  /**
   * Handle toggling the import all checkbox.
   * @param {Event} event  The change event.
   * @protected
   */
  _onToggleImportAll(event) {
    const target = event.currentTarget;
    const section = target.closest(".import-controls");
    const checked = target.checked;
    section.querySelectorAll("input").forEach(input => {
      if ( input === target ) return;
      if ( input.value !== "folders" ) input.disabled = checked;
      if ( checked ) input.checked = true;
    });
  }

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

  /** @inheritdoc */
  _getHeaderButtons() {
    const buttons = super._getHeaderButtons();
    buttons.findSplice(b => b.class === "import");
    return buttons;
  }

  /* -------------------------------------------- */

  /** @override */
  async _updateObject(event, formData) {
    const prepareImportDefined = foundry.utils.getDefiningClass(this, "_prepareImportData");
    const importContentDefined = foundry.utils.getDefiningClass(this, "_importContent");
    if ( (prepareImportDefined !== AdventureImporter) || (importContentDefined !== AdventureImporter) ) {
      return this._importLegacy(formData);
    }

    // Perform the standard Adventure import workflow
    return this.adventure.import(formData);
  }

  /* -------------------------------------------- */

  /**
   * Mirror Adventure#import but call AdventureImporter#_importContent and AdventureImport#_prepareImportData
   * @param {object} formData
   */
  async _importLegacy(formData) {

    // Prepare the content for import
    const {toCreate, toUpdate, documentCount} = await this._prepareImportData(formData);

    // Allow modules to preprocess adventure data or to intercept the import process
    const allowed = Hooks.call("preImportAdventure", this.adventure, formData, toCreate, toUpdate);
    if ( allowed === false ) {
      return console.log(`"${this.adventure.name}" Adventure import was prevented by the "preImportAdventure" hook`);
    }

    // Warn the user if the import operation will overwrite existing World content
    if ( !foundry.utils.isEmpty(toUpdate) ) {
      const alert = game.i18n.localize("Warning");
      const warning = game.i18n.format("ADVENTURE.ImportOverwriteWarning", {name: this.adventure.name});
      const confirm = await foundry.applications.api.DialogV2.confirm({
        window: {title: "ADVENTURE.ImportOverwriteTitle"},
        position: {width: 480},
        content: `<p><strong>${alert}:</strong> ${warning}</p>`
      });
      if ( !confirm ) return;
    }

    // Perform the import
    const {created, updated} = await this._importContent(toCreate, toUpdate, documentCount);

    // Refresh the sidebar display
    ui.sidebar.render();

    // Allow modules to react to the import process
    Hooks.callAll("importAdventure", this.adventure, formData, created, updated);
  }

  /* -------------------------------------------- */
  /*  Deprecations                                */
  /* -------------------------------------------- */

  /**
   * @deprecated since v11
   * @ignore
   */
  async _prepareImportData(formData) {
    foundry.utils.logCompatibilityWarning("AdventureImporter#_prepareImportData is deprecated. "
      + "Please use Adventure#prepareImport instead.", {since: 11, until: 16});
    return this.adventure.prepareImport(formData);
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v11
   * @ignore
   */
  async _importContent(toCreate, toUpdate, documentCount) {
    foundry.utils.logCompatibilityWarning("AdventureImporter#_importContent is deprecated. "
      + "Please use Adventure#importContent instead.", {since: 11, until: 16});
    return this.adventure.importContent({toCreate, toUpdate, documentCount});
  }
}

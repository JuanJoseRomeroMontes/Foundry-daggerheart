import BaseAdventure from "@common/documents/adventure.mjs";
import ClientDocumentMixin from "./abstract/client-document.mjs";
import {getDocumentClass} from "../utils/helpers.mjs";
import Hooks from "../helpers/hooks.mjs";

/**
 * @import {AdventureImportData, AdventureImportOptions, AdventureImportResult} from "./_types.mjs";
 */

/**
 * The client-side Adventure document which extends the common {@link foundry.documents.BaseAdventure} model.
 *
 * ### Hook Events
 * - {@link hookEvents.preImportAdventure} (emitted by {@link Adventure#import})
 * - {@link hookEvents.importAdventure} (emitted by {@link Adventure#import})
 *
 * @extends BaseAdventure
 * @mixes ClientDocumentMixin
 * @category Documents
 */
export default class Adventure extends ClientDocumentMixin(BaseAdventure) {

  /** @inheritDoc */
  static fromSource(source, options={}) {
    const pack = game.packs.get(options.pack);
    if ( pack && !pack.metadata.system ) {
      // Omit system-specific documents from this Adventure's data.
      source.actors = [];
      source.items = [];
      source.folders = source.folders.filter(f => !CONST.SYSTEM_SPECIFIC_COMPENDIUM_TYPES.includes(f.type));
    }
    return super.fromSource(source, options);
  }

  /* -------------------------------------------- */

  /**
   * Perform a full import workflow of this Adventure.
   * Create new and update existing documents within the World.
   * @param {AdventureImportOptions} [options]    Options which configure and customize the import process
   * @returns {Promise<AdventureImportResult>}    The import result
   */
  async import(options={}) {
    options.dialog ??= true;
    options.importFields ??= [];
    options.preImport ??= [];
    options.postImport ??= [];
    const sheet = /** @type {AdventureImporter|foundry.applications.sheets.AdventureImporterV2} */ this.sheet;

    // Prepare import data
    await sheet._configureImport?.(options);
    const importData = await this.prepareImport(options);

    // Allow modules to preprocess adventure data or to intercept the import process
    const allowed = Hooks.call("preImportAdventure", this, options, importData.toCreate, importData.toUpdate);
    if ( allowed === false ) {
      console.log(`"${this.name}" Adventure import was prevented by the "preImportAdventure" hook`);
      return {created: [], updated: []};
    }

    // Invoke custom preImport workflows
    for ( const fn of options.preImport ) {
      await fn.call(this, importData, options);
    }
    await sheet._preImport?.(importData, options);

    // Warn the user if the import operation will overwrite existing World content
    if ( !foundry.utils.isEmpty(importData.toUpdate) && options.dialog ) {
      const alert = game.i18n.localize("Warning");
      const warning = game.i18n.format("ADVENTURE.ImportOverwriteWarning", {name: this.name});
      const confirm = await foundry.applications.api.DialogV2.confirm({
        window: {title: "ADVENTURE.ImportOverwriteTitle"},
        position: {width: 480},
        content: `<p><strong>${alert}:</strong> ${warning}</p>`
      });
      if ( !confirm ) return {created: [], updated: []};
    }

    // Perform the import
    const result = await this.importContent(importData);

    // Allow modules to perform additional post-import workflows
    Hooks.callAll("importAdventure", this, options, result.created, result.updated);

    // Update the imported state of the adventure.
    const imports = game.settings.get("core", "adventureImports");
    imports[this.uuid] = true;
    await game.settings.set("core", "adventureImports", imports);

    // Invoke custom preImport workflows
    for ( const fn of options.postImport ) {
      await fn.call(this, result, options);
    }
    await sheet._onImport?.(result, options);

    // Perform an extra refresh of the sidebar (all tabs) since many documents have changed
    await ui.sidebar.render();
    return result;
  }

  /* -------------------------------------------- */

  /**
   * Prepare Adventure data for import into the World.
   * @param {AdventureImportOptions} [options]  Options which configure import behavior
   * @returns {Promise<AdventureImportData>}
   */
  async prepareImport(options) {
    const importFields = new Set(options.importFields);
    const adventureData = this.toObject();
    const toCreate = {};
    const toUpdate = {};
    let documentCount = 0;
    const importAll = !importFields.size || importFields.has("all");
    const keep = new Set();
    for ( const [field, cls] of Object.entries(Adventure.contentFields) ) {
      if ( !importAll && !importFields.has(field) ) continue;
      keep.add(cls.documentName);
      const collection = game.collections.get(cls.documentName);
      let [c, u] = adventureData[field].partition(d => collection.has(d._id));
      if ( (field === "folders") && !importAll ) {
        c = c.filter(f => keep.has(f.type));
        u = u.filter(f => keep.has(f.type));
      }
      if ( c.length ) {
        toCreate[cls.documentName] = c;
        documentCount += c.length;
      }
      if ( u.length ) {
        toUpdate[cls.documentName] = u;
        documentCount += u.length;
      }
    }
    return {toCreate, toUpdate, documentCount};
  }

  /* -------------------------------------------- */

  /**
   * Execute an Adventure import workflow, creating and updating documents in the World.
   * @param {AdventureImportData} data          Prepared adventure data to import
   * @returns {Promise<AdventureImportResult>}  The import result
   */
  async importContent({toCreate, toUpdate, documentCount}={}) {
    const created = {};
    const updated = {};
    const bar = ui.notifications.info("ADVENTURE.ImportProgress", {localize: true, progress: true});

    // Create new documents
    let nImported = 0;
    for ( const [documentName, createData] of Object.entries(toCreate) ) {
      const cls = getDocumentClass(documentName);
      const docs = await cls.createDocuments(createData, {
        keepId: true,       // Keep adventure document IDs
        render: false,      // Do not re-render related applications
        renderSheet: false  // Do not render new sheets
      });
      created[documentName] = docs;
      nImported += docs.length;
      bar.update({pct: nImported / documentCount});
    }

    // Update existing documents
    for ( const [documentName, updateData] of Object.entries(toUpdate) ) {
      const cls = getDocumentClass(documentName);
      const docs = await cls.updateDocuments(updateData, {
        diff: false,
        recursive: false,
        noHook: true,
        render: false      // Do not re-render related applications
      });
      updated[documentName] = docs;
      nImported += docs.length;
      bar.update({pct: nImported / documentCount});
    }
    bar.update({pct: 1});
    return {created, updated};
  }
}

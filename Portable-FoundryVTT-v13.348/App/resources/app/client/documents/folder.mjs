import BaseFolder from "@common/documents/folder.mjs";
import ClientDocumentMixin from "./abstract/client-document.mjs";
import {getDocumentClass} from "../utils/helpers.mjs";

/**
 * @import WorldCollection from "./abstract/world-collection.mjs";
 * @import Collection from "@common/utils/collection.mjs";
 * @import CompendiumCollection from "./collections/compendium-collection.mjs";
 * @import {FolderChildNode} from "./_types.mjs";
 */

/**
 * The client-side Folder document which extends the common BaseFolder model.
 * @extends BaseFolder
 * @mixes ClientDocumentMixin
 * @category Documents
 *
 * @see {@link foundry.documents.collections.Folders}: The world-level collection of Folder documents
 * @see {@link foundry.applications.sheets.FolderConfig}: The Folder configuration application
 */
export default class Folder extends ClientDocumentMixin(BaseFolder) {

  /**
   * The depth of this folder in its sidebar tree
   * @type {number}
   */
  depth;

  /**
   * An array of nodes representing the children of this one. This differs from the results of
   * {@link Folder.getSubfolders}, which reports the subset of child Folders displayed to the current User in the UI.
   * @type {FolderChildNode[]}
   */
  children;

  /**
   * Return whether the folder is displayed in the sidebar to the current User.
   * @type {boolean}
   */
  displayed = false;

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * The array of the Document instances which are contained within this Folder,
   * unless it's a Folder inside a Compendium pack, in which case it's the array
   * of objects inside the index of the pack that are contained in this Folder.
   * @type {(ClientDocument|object)[]}
   */
  get contents() {
    if ( this.#contents ) return this.#contents;
    if ( this.pack ) return game.packs.get(this.pack).index.filter(d => d.folder === this.id );
    return this.documentCollection?.filter(d => d.folder === this) ?? [];
  }

  set contents(value) {
    this.#contents = value;
  }

  #contents;

  /* -------------------------------------------- */

  /**
   * The reference to the Document type which is contained within this Folder.
   * @type {Function}
   */
  get documentClass() {
    return CONFIG[this.type].documentClass;
  }

  /* -------------------------------------------- */

  /**
   * The reference to the WorldCollection instance which provides Documents to this Folder,
   * unless it's a Folder inside a Compendium pack, in which case it's the index of the pack.
   * A world Folder containing CompendiumCollections will have neither.
   * @type {WorldCollection|Collection|undefined}
   */
  get documentCollection() {
    if ( this.pack ) return game.packs.get(this.pack).index;
    return game.collections.get(this.type);
  }

  /* -------------------------------------------- */

  /**
   * Return whether the folder is currently expanded within the sidebar interface.
   * @type {boolean}
   */
  get expanded() {
    return game.folders._expanded[this.uuid] || false;
  }

  /* -------------------------------------------- */

  /**
   * Return the list of ancestors of this folder, starting with the parent.
   * @type {Folder[]}
   */
  get ancestors() {
    if ( !this.folder ) return [];
    return [this.folder, ...this.folder.ancestors];
  }

  /* -------------------------------------------- */

  /** @override */
  get inCompendium() {
    return !!game.packs.get(this.pack)?.folders.has(this.id);
  }

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async _preCreate(data, options, user) {

    // If the folder would be created past the maximum depth, throw an error
    if ( data.folder ) {
      const collection = data.pack ? game.packs.get(data.pack).folders : game.folders;
      const parent = collection.get(data.folder);
      if ( !parent ) return;
      const maxDepth = data.pack ? (CONST.FOLDER_MAX_DEPTH - 1) : CONST.FOLDER_MAX_DEPTH;
      if ( (parent.ancestors.length + 1) >= maxDepth ) throw new Error(game.i18n.format("FOLDER.ExceededMaxDepth", {depth: maxDepth}));
    }

    return super._preCreate(data, options, user);
  }

  /* -------------------------------------------- */

  /** @override */
  static async createDialog(data={}, createOptions={}, dialogOptions={}) {
    const applicationOptions = {
      top: "position", left: "position", width: "position", height: "position", scale: "position", zIndex: "position",
      title: "window", id: "", classes: ""
    };
    for ( const [k, v] of Object.entries(createOptions) ) {
      if ( k in applicationOptions ) {
        foundry.utils.logCompatibilityWarning("The Folder.createDialog signature has changed. "
          + "It now accepts database operation options in its second parameter, "
          + "and FolderConfig options in its third parameter.", {since: 13, until: 15, once: true});
        const dialogOption = applicationOptions[k];
        if ( dialogOption ) foundry.utils.setProperty(dialogOptions, `${dialogOption}.${k}`, v);
        else dialogOptions[k] = v;
        delete createOptions[k];
      }
    }
    const folder = new Folder.implementation(foundry.utils.mergeObject({
      name: Folder.implementation.defaultName({pack: createOptions.pack}),
      sorting: "a"
    }, data), createOptions);
    return new Promise(resolve => {
      dialogOptions.document = folder;
      dialogOptions.resolve = resolve;
      new foundry.applications.sheets.FolderConfig(dialogOptions).render({force: true});
    });
  }

  /* -------------------------------------------- */

  /**
   * Export all Documents contained in this Folder to a given Compendium pack.
   * Optionally update existing Documents within the Pack by name, otherwise append all new entries.
   * @param {CompendiumCollection} pack       A Compendium pack to which the documents will be exported
   * @param {object} [options]                Additional options which customize how content is exported.
   *                                          See ClientDocumentMixin#toCompendium.
   * @param {boolean} [options.updateByName=false]    Update existing entries in the Compendium pack, matching by name
   * @param {boolean} [options.keepId=false]          Retain the original _id attribute when updating an document
   * @param {boolean} [options.keepFolders=false]     Retain the existing Folder structure
   * @param {string} [options.folder]                 A target folder id to which the documents will be exported
   * @returns {Promise<CompendiumCollection>}  The updated Compendium Collection instance
   */
  async exportToCompendium(pack, options={}) {
    const updateByName = options.updateByName ?? false;
    const index = await pack.getIndex();
    ui.notifications.info("FOLDER.Exporting", {format: {compendium: pack.collection,
      type: game.i18n.localize(getDocumentClass(this.type).metadata.labelPlural)}});
    options.folder ||= null;

    // Classify creations and updates
    const foldersToCreate = [];
    const foldersToUpdate = [];
    const documentsToCreate = [];
    const documentsToUpdate = [];

    // Ensure we do not overflow maximum allowed folder depth
    const originDepth = this.ancestors.length;
    const targetDepth = options.folder ? ((pack.folders.get(options.folder)?.ancestors.length ?? 0) + 1) : 0;

    /**
     * Recursively extract the contents and subfolders of a Folder into the Pack
     * @param {Folder} folder       The Folder to extract
     * @param {number} [_depth]     An internal recursive depth tracker
     */
    const extractFolder = async (folder, _depth=0) => {
      const folderData = folder.toCompendium(pack, {...options, clearSort: false, keepId: true});

      if ( options.keepFolders ) {
        // Ensure that the exported folder is within the maximum allowed folder depth
        const currentDepth = _depth + targetDepth - originDepth;
        const exceedsDepth = currentDepth > pack.maxFolderDepth;
        if ( exceedsDepth ) {
          throw new Error(`Folder "${folder.name}" exceeds maximum allowed folder depth of ${pack.maxFolderDepth}`);
        }

        // Re-parent child folders into the target folder or into the compendium root
        if ( folderData.folder === this.id ) folderData.folder = options.folder;

        // Classify folder data for creation or update
        if ( folder !== this ) {
          const existing = updateByName ? pack.folders.find(f => f.name === folder.name) : pack.folders.get(folder.id);
          if ( existing ) {
            folderData._id = existing._id;
            foldersToUpdate.push(folderData);
          }
          else foldersToCreate.push(folderData);
        }
      }

      // Iterate over Documents in the Folder, preparing each for export
      for ( const doc of folder.contents ) {
        const data = doc.toCompendium(pack, options);

        // Re-parent immediate child documents into the target folder.
        if ( data.folder === this.id ) data.folder = options.folder;

        // Otherwise retain their folder structure if keepFolders is true.
        else data.folder = options.keepFolders ? folderData._id : options.folder;

        // Generate thumbnails for Scenes
        if ( doc instanceof foundry.documents.Scene ) {
          const { thumb } = await doc.createThumbnail({ img: data.background.src });
          data.thumb = thumb;
        }

        // Classify document data for creation or update
        const existing = updateByName ? index.find(i => i.name === data.name) : index.find(i => i._id === data._id);
        if ( existing ) {
          data._id = existing._id;
          documentsToUpdate.push(data);
        }
        else documentsToCreate.push(data);
        console.log(`Prepared "${data.name}" for export to "${pack.collection}"`);
      }

      // Iterate over subfolders of the Folder, preparing each for export
      for ( const c of folder.children ) await extractFolder(c.folder, _depth+1);
    };

    // Prepare folders for export
    try {
      await extractFolder(this, 0);
    } catch(err) {
      const msg = `Cannot export Folder "${this.name}" to Compendium pack "${pack.collection}":\n${err.message}`;
      return ui.notifications.error(msg, {console: true});
    }

    // Create and update Folders
    if ( foldersToUpdate.length ) {
      await this.constructor.updateDocuments(foldersToUpdate, {
        pack: pack.collection,
        diff: false,
        recursive: false,
        render: false
      });
    }
    if ( foldersToCreate.length ) {
      await this.constructor.createDocuments(foldersToCreate, {
        pack: pack.collection,
        keepId: true,
        render: false
      });
    }

    // Create and update Documents
    const cls = pack.documentClass;
    if ( documentsToUpdate.length ) await cls.updateDocuments(documentsToUpdate, {
      pack: pack.collection,
      diff: false,
      recursive: false,
      render: false
    });
    if ( documentsToCreate.length ) await cls.createDocuments(documentsToCreate, {
      pack: pack.collection,
      keepId: options.keepId,
      render: false
    });

    // Re-render the pack
    ui.notifications.info("FOLDER.ExportDone", {format: {compendium: pack.collection,
      type: game.i18n.localize(getDocumentClass(this.type).metadata.labelPlural)}});
    pack.render(false);
    return pack;
  }

  /* -------------------------------------------- */

  /**
   * Provide a dialog form that allows for exporting the contents of a Folder into an eligible Compendium pack.
   * @param {string|null} pack                      A pack ID to set as the default choice in the select input
   * @param {object} [options]                      Additional options which customize how content is exported
   * @param {boolean} [options.merge=true]          Update existing entries in the Compendium pack, matching by name
   * @param {boolean} [options.keepId=true]         Retain the original _id attribute when updating an document
   * @param {boolean} [options.keepFolders=true]    Retain the existing Folder structure
   * @returns {Promise<void>}    A Promise which resolves or rejects once the dialog has been submitted or closed
   */
  async exportDialog(pack, options={}) {

    // Get eligible pack destinations
    const packs = game.packs.filter(p => (p.documentName === this.type) && !p.locked);
    if ( !packs.length ) {
      return ui.notifications.warn("FOLDER.ExportWarningNone", {format: {
        type: game.i18n.localize(getDocumentClass(this.type).metadata.label)
      }});
    }

    // Render the HTML form
    const html = await foundry.applications.handlebars.renderTemplate("templates/sidebar/apps/folder-export.hbs", {
      packs: packs.reduce((obj, p) => {
        obj[p.collection] = p.title;
        return obj;
      }, {}),
      pack,
      merge: options.merge ?? true,
      keepId: options.keepId ?? true,
      keepFolders: options.keepFolders ?? true,
      hasFolders: pack?.folders?.length ?? false,
      folders: pack?.folders?.map(f => ({id: f.id, name: f.name})) || []
    });
    const content = document.createElement("div");
    content.innerHTML = html;

    // Display it as a dialog prompt
    return foundry.applications.sidebar.apps.FolderExport.prompt({
      window: {title: `${game.i18n.localize("FOLDER.ExportTitle")}: ${this.name}`}, // FIXME: double localization
      content,
      ok: {
        label: "FOLDER.ExportTitle",
        callback: (event, button) => {
          const form = button.form;
          const pack = game.packs.get(form.pack.value);
          return this.exportToCompendium(pack, {
            updateByName: form.merge.checked,
            keepId: form.keepId.checked,
            keepFolders: form.keepFolders.checked,
            folder: form.folder.value
          });
        }
      }
    });
  }

  /* -------------------------------------------- */

  /**
   * Get the Folder documents which are sub-folders of the current folder, either direct children or recursively.
   * @param {boolean} [recursive=false] Identify child folders recursively, if false only direct children are returned
   * @returns {Folder[]}  An array of Folder documents which are subfolders of this one
   */
  getSubfolders(recursive=false) {
    let subfolders = game.folders.filter(f => f._source.folder === this.id);
    if ( recursive && subfolders.length ) {
      for ( const f of subfolders ) {
        const children = f.getSubfolders(true);
        subfolders = subfolders.concat(children);
      }
    }
    return subfolders;
  }

  /* -------------------------------------------- */

  /**
   * Get the Folder documents which are parent folders of the current folder or any if its parents.
   * @returns {Folder[]}    An array of Folder documents which are parent folders of this one
   */
  getParentFolders() {
    const folders = [];
    let parent = this.folder;
    while ( parent ) {
      folders.push(parent);
      parent = parent.folder;
    }
    return folders;
  }
}

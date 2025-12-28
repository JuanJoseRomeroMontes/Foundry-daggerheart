import {DocumentSheetV2, HandlebarsApplicationMixin} from "../api/_module.mjs";
import Adventure from "@client/documents/adventure.mjs";
import {getDocumentClass} from "@client/utils/helpers.mjs";
import TextEditor from "../ux/text-editor.mjs";

/**
 * @import {ApplicationClickAction} from "../_types.mjs";
 */

/**
 * @typedef AdventureContentTreeNode
 * @property {string} id        An alias for folder.id
 * @property {string} name      An alias for folder.name
 * @property {Folder} folder    The Folder at this node level
 * @property {string} state     The modification state of the Folder
 * @property {AdventureContentTreeNode[]} children  An array of child nodes
 * @property {{id: string, name: string, document: ClientDocument, state: string}[]} documents  An array of documents
 */

/**
 * @typedef {AdventureContentTreeNode} AdventureContentTreeRoot
 * @property {null} id                The folder ID is null at the root level
 * @property {string} documentName    The Document name contained in this tree
 * @property {string} collection      The Document collection name of this tree
 * @property {string} name            The name displayed at the root level of the tree
 * @property {string} icon            The icon displayed at the root level of the tree
 * @property {string} collapseIcon    The icon which represents the current collapsed state of the tree
 * @property {boolean} cleared        Has the section been tentatively cleared of its contents?
 * @property {string} cssClass        CSS classes which describe the display of the tree
 * @property {number} documentCount   The number of documents which are present in the tree
 */

/**
 * An interface for packaging Adventure content and loading it to a compendium pack.
 * @extends DocumentSheetV2
 * @mixes HandlebarsApplication
 */
export default class AdventureExporter extends HandlebarsApplicationMixin(DocumentSheetV2) {

  constructor(options={}) {
    super(options);
    if ( !options.document.pack ) {
      throw new Error("You may not export an Adventure that does not belong to a Compendium pack");
    }
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    id: "adventure-exporter",
    classes: ["adventure-exporter"],
    window: {
      contentClasses: ["standard-form"],
      icon: "fa-solid fa-upload"
    },
    position: {width: 560},
    form: {
      closeOnSubmit: true
    },
    actions: {
      clearSection: AdventureExporter.#onClearSection,
      collapseSection: AdventureExporter.#onCollapseSection,
      removeContent: AdventureExporter.#onRemoveContent
    },
    canCreate: true
  };

  /** @override */
  static PARTS = {
    tabs: {template: "templates/generic/tab-navigation.hbs"},
    summary: {
      template: "templates/adventure/exporter/summary.hbs",
      scrollable: [""]
    },
    contents: {
      template: "templates/adventure/exporter/contents.hbs",
      scrollable: [""]
    },
    footer: {template: "templates/generic/form-footer.hbs"}
  };

  static TABS = {
    sheet: {
      tabs: [
        {id: "summary", icon: "fa-solid fa-feather-pointed"},
        {id: "contents", icon: "fa-solid fa-folder-tree"}
      ],
      initial: "summary",
      labelPrefix: "ADVENTURE.TABS"
    }
  };

  /* -------------------------------------------- */

  /**
   * The prepared document tree which is displayed in the form.
   * @type {Record<string, AdventureContentTreeRoot>}
   */
  contentTree = {};

  /**
   * A mapping which allows convenient access to content tree nodes by their folder ID
   * @type {Record<string, AdventureContentTreeNode>}
   */
  #treeNodes = {};

  /**
   * Track data for content which has been added to the adventure.
   * @type {Record<string, Set<ClientDocument>>}
   */
  #addedContent = Object.keys(Adventure.contentFields).reduce((obj, f) => {
    obj[f] = new Set();
    return obj;
  }, {});

  /**
   * Track the IDs of content which has been removed from the adventure.
   * @type {Record<string, Set<string>>}
   */
  #removedContent = Object.keys(Adventure.contentFields).reduce((obj, f) => {
    obj[f] = new Set();
    return obj;
  }, {});

  /**
   * Track which sections of the contents are collapsed.
   * @type {Set<string>}
   */
  #collapsedSections = new Set();

  /* -------------------------------------------- */
  /*  Application Rendering                       */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.contentTree = this.contentTree = this.#organizeContentTree();
    context.adventure = this.document;
    return context;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    switch ( partId ) {
      case "footer":
        context.buttons = [{type: "submit", icon: "fa-solid fa-upload", label: "ADVENTURE.ExportSubmit"}];
        break;
      default: {
        const tab = context.tabs[partId];
        if ( tab ) context.tab = tab;
      }
    }
    return context;
  }

  /* -------------------------------------------- */

  /**
   * Organize content in the adventure into a tree structure which is displayed in the UI.
   * @returns {Record<string, AdventureContentTreeRoot>}
   */
  #organizeContentTree() {
    const content = {};
    const adventure = this.document;
    let remainingFolders = [...adventure.folders, ...(this.#addedContent.folders ?? [])];

    // Prepare each content section
    for ( const [name, cls] of Object.entries(Adventure.contentFields) ) {
      if ( name === "folders" ) continue;

      // Partition content for the section
      const currentContent = adventure[name];
      let documents = [...currentContent, ...(this.#addedContent[name] ?? [])];
      let folders;
      [remainingFolders, folders] = remainingFolders.partition(f => f.type === cls.documentName);
      if ( !(documents.length || folders.length) ) continue;

      // Prepare the root node
      const collapsed = this.#collapsedSections.has(cls.documentName);
      const removedContent = this.#removedContent[name];
      const section = content[name] = {
        documentName: cls.documentName,
        collection: cls.collectionName,
        id: null,
        name: game.i18n.localize(cls.metadata.labelPlural),
        icon: CONFIG[cls.documentName].sidebarIcon,
        cssClass: [cls.collectionName, collapsed ? "collapsed" : ""].filterJoin(" "),
        documentCount: documents.length - removedContent.size,
        cleared: currentContent.size > 0 && currentContent.every(d => removedContent.has(d.id)),
        folder: null,
        state: "root",
        children: [],
        documents: []
      };

      // Recursively populate the tree
      [folders, documents] = this.#populateNode(section, folders, documents);

      // Add leftover documents to the section root
      for ( const document of documents ) {
        const state = this.#getDocumentState(document);
        section.documents.push({
          document,
          id: document.id,
          name: document.name,
          state,
          stateLabel: `ADVENTURE.Document${state.titleCase()}`
        });
      }
    }
    return content;
  }

  /* -------------------------------------------- */

  /**
   * Populate one node of the content tree with folders and documents
   * @param {AdventureContentTreeNode} node       The node being populated
   * @param {Folder[]} remainingFolders           Folders which have yet to be populated to a node
   * @param {ClientDocument[]} remainingDocuments Documents which have yet to be populated to a node
   * @returns {Array<Folder[], ClientDocument[]>} Folders and Documents which still have yet to be populated
   */
  #populateNode(node, remainingFolders, remainingDocuments) {

    // Allocate Documents to this node
    let documents;
    [remainingDocuments, documents] = remainingDocuments.partition(d => d._source.folder === node.id );
    for ( const doc of documents ) {
      const state = this.#getDocumentState(doc);
      node.documents.push({
        document: doc,
        id: doc.id,
        name: doc.name,
        state,
        stateLabel: `ADVENTURE.Document${state.titleCase()}`
      });
    }

    // Allocate Folders to this node
    let folders;
    [remainingFolders, folders] = remainingFolders.partition(f => f._source.folder === node.id);
    for ( const folder of folders ) {
      const state = this.#getDocumentState(folder);
      const child = {
        folder,
        id: folder.id,
        name: folder.name,
        state,
        stateLabel: `ADVENTURE.Document${state.titleCase()}`,
        children: [],
        documents: []
      };
      [remainingFolders, remainingDocuments] = this.#populateNode(child, remainingFolders, remainingDocuments);
      node.children.push(child);
      this.#treeNodes[folder.id] = child;
    }
    return [remainingFolders, remainingDocuments];
  }

  /* -------------------------------------------- */

  /**
   * Get the Document instance from the clicked content tag.
   * @param {string} documentName         The document type
   * @param {string} documentId           The document ID
   * @returns {ClientDocument|null}       The Document instance, or null
   */
  #getDocument(documentName, documentId) {
    const cls = getDocumentClass(documentName);
    const cn = cls.collectionName;
    const existing = this.document[cn].find(d => d.id === documentId);
    if ( existing ) return existing;
    const added = this.#addedContent[cn].find(d => d.id === documentId);
    return added ?? null;
  }

  /* -------------------------------------------- */

  /**
   * Flag the current state of each document which is displayed
   * @param {ClientDocument} document The document being modified
   * @returns {string}                The document state
   */
  #getDocumentState(document) {
    const cn = document.collectionName;
    if ( this.#removedContent[cn].has(document.id) ) return "remove";
    if ( this.#addedContent[cn].has(document) ) return "add";
    const worldCollection = game.collections.get(document.documentName);
    if ( !worldCollection.has(document.id) ) return "missing";
    return "update";
  }

  /* -------------------------------------------- */

  /** @override */
  async _processSubmitData(event, form, submitData, options={}) {
    const adventure = this.document;

    // Build the adventure data content
    for ( const [name, cls] of Object.entries(Adventure.contentFields) ) {
      const collection = game.collections.get(cls.documentName);
      submitData[name] = [];
      const addDoc = id => {
        if ( this.#removedContent[name].has(id) ) return;
        let data;

        // Prepare world document data
        const doc = collection.get(id);
        if ( doc ) {
          data = doc.toCompendium(adventure.collection, {
            clearSort: false,
            clearFolder: false,
            clearFlags: false,
            clearSource: false,
            clearOwnership: true,
            clearState: true,
            keepId: true
          });
        }

        // Fall-back to preexisting adventure data
        data ??= adventure[name].find(d => d.id === id);
        if ( data ) submitData[name].push(data);
      };
      for ( const d of adventure[name] ) addDoc(d.id);
      for ( const d of this.#addedContent[name] ) addDoc(d.id);
    }

    const pack = adventure.collection;
    const restrictedDocuments = submitData.actors?.length || submitData.items?.length
      || submitData.folders?.some(f => CONST.SYSTEM_SPECIFIC_COMPENDIUM_TYPES.includes(f.type));
    if ( restrictedDocuments && !pack?.metadata.system ) {
      return ui.notifications.error("ADVENTURE.ExportPackNoSystem", {localize: true, permanent: true});
    }

    // Clear all pending additions and removals in case this Application stays in memory after submitting.
    Object.values(this.#addedContent).forEach(s => s.clear());
    Object.values(this.#removedContent).forEach(s => s.clear());

    // Create/update the document or save progress to the clone
    const operation = Object.assign({
      pack: adventure.pack,
      keepId: true,
      keepEmbeddedIds: true,
      diff: false,
      recursive: false
    }, options);
    await super._processSubmitData(event, form, submitData, operation);

    const locKey = pack.has(adventure.id) ? "ADVENTURE.UpdateSuccess": "ADVENTURE.CreateSuccess";
    ui.notifications.info(locKey, {format: {name: adventure.name}});
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onRender(context, options) {
    new foundry.applications.ux.DragDrop.implementation({
      dropSelector: ".window-content",
      permissions: {
        dragstart: () => false,
        drop: () => this.isEditable
      },
      callbacks: {
        drop: this.#onDrop.bind(this)
      }
    }).bind(this.element);
    return super._onRender(context, options);
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /**
   * Clear all content from a particular document-type section.
   * @this {AdventureExporter}
   * @type {ApplicationClickAction}
   */
  static async #onClearSection(event) {
    const section = event.target.closest("[data-document-name]");
    const documentName = section.dataset.documentName;
    const cls = getDocumentClass(documentName);
    const collectionName = cls.collectionName;
    const currentContent = this.document[collectionName];
    const removedContent = this.#removedContent[collectionName];
    if ( (currentContent.size > 0) && currentContent.every(d => removedContent.has(d.id)) ) {
      this.#restoreNode(this.contentTree[collectionName]);
    }
    else this.#removeNode(this.contentTree[collectionName], {force: true});
    this.render({parts: ["contents"]});
  }

  /* -------------------------------------------- */

  /**
   * Collapse the content section of a particular Document type.
   * @this {AdventureExporter}
   * @type {ApplicationClickAction}
   */
  static async #onCollapseSection(event) {
    const section = event.target.closest("[data-document-name]");
    const documentName = section.dataset.documentName;
    if ( this.#collapsedSections.has(documentName) ) {
      this.#collapsedSections.delete(documentName);
      section.classList.remove("collapsed");
    }
    else {
      this.#collapsedSections.add(documentName);
      section.classList.add("collapsed");
    }
  }

  /* -------------------------------------------- */

  /**
   * Remove a single piece of content.
   * @this {AdventureExporter}
   * @type {ApplicationClickAction}
   */
  static async #onRemoveContent(event) {
    const node = event.target.closest("[data-document-id]");
    const isFolder = "folder" in node.dataset;
    const documentName = isFolder ? "Folder" : event.target.closest("[data-document-name]").dataset.documentName;
    const document = this.#getDocument(documentName, node.dataset.documentId);
    if ( document ) this.removeContent(document);
  }

  /* -------------------------------------------- */

  /**
   * Handle drop of a new content Document.
   * @param {DragEvent} event
   */
  async #onDrop(event) {
    const data = TextEditor.implementation.getDragEventData(event);
    const cls = getDocumentClass(data?.type);
    if ( !cls || !(cls.collectionName in Adventure.contentFields) ) return;
    const document = await cls.fromDropData(data);
    const isPackFolder = (data.type === "Folder") && (document.type === "Compendium");
    if ( document.pack || document.isEmbedded || isPackFolder ) {
      return ui.notifications.error("ADVENTURE.ExportPrimaryDocumentsOnly", {localize: true});
    }
    const pack = this.document.collection;
    const type = data?.type === "Folder" ? document.type : data?.type;
    if ( !pack?.metadata.system && CONST.SYSTEM_SPECIFIC_COMPENDIUM_TYPES.includes(type) ) {
      return ui.notifications.error("ADVENTURE.ExportPackNoSystem", {localize: true});
    }
    this.addContent(document);
  }

  /* -------------------------------------------- */
  /*  Content Management Workflows                */
  /* -------------------------------------------- */

  /**
   * Stage a document for addition to the Adventure.
   * This adds the Document locally, the change is not yet submitted to the database.
   * @param {Folder|ClientDocument} document    Some document to be added to the Adventure.
   */
  addContent(document) {
    if ( document instanceof foundry.documents.BaseFolder ) this.#addFolder(document);
    if ( document.folder ) this.#addDocument(document.folder);
    this.#addDocument(document);
    this.render({parts: ["contents"]});
  }

  /* -------------------------------------------- */

  /**
   * Remove or restore a single Document from the Adventure.
   * @param {ClientDocument} document The Document being removed from the Adventure.
   */
  removeContent(document) {
    if ( document instanceof foundry.documents.BaseFolder ) {
      const node = this.#treeNodes[document.id];
      if ( !node ) return;
      if ( this.#removedContent.folders.has(node.id) ) this.#restoreNode(node);
      else this.#removeNode(node, {force: true});
    }
    else this.#removeDocument(document);
    this.render({parts: ["contents"]});
  }

  /* -------------------------------------------- */

  /**
   * Remove or restore a node of Documents from the content tree.
   * @param {AdventureContentTreeNode} node The node to remove
   * @param {object} [options]
   * @param {boolean} [options.force] If true, only ever remove Documents and never restore.
   */
  #removeNode(node, {force=false}={}) {
    for ( const child of node.children ) this.#removeNode(child, {force});
    for ( const d of node.documents ) this.#removeDocument(d.document, {force});
    if ( node.folder ) this.#removeDocument(node.folder, {force});
  }

  /* -------------------------------------------- */

  /**
   * Restore a removed node back to the content tree.
   * @param {AdventureContentTreeNode} node The node to restore
   */
  #restoreNode(node) {
    for ( const child of node.children ) this.#restoreNode(child);
    for ( const d of node.documents ) this.#removedContent[d.document.collectionName].delete(d.id);
    return this.#removedContent.folders.delete(node.id);
  }

  /* -------------------------------------------- */

  /**
   * Remove a single Document from the content tree, or restore it if already pending removal.
   * @param {ClientDocument} document The Document to remove
   * @param {object} [options]
   * @param {boolean} [options.force] If true, only remove the Document.
   */
  #removeDocument(document, {force=false}={}) {
    const cn = document.collectionName;

    // If the Document was already removed, re-add it
    if ( !force && this.#removedContent[cn].delete(document.id) ) return;

    // If the content was temporarily added, remove it
    if ( this.#addedContent[cn].delete(document) ) return;

    // Otherwise, mark the content as removed
    this.#removedContent[cn].add(document.id);
  }

  /* -------------------------------------------- */

  /**
   * Add an entire folder tree including contained documents and subfolders to the Adventure.
   * @param {Folder} folder The folder to add
   */
  #addFolder(folder) {
    this.#addDocument(folder);
    for ( const doc of folder.contents ) {
      this.#addDocument(doc);
    }
    for ( const sub of folder.getSubfolders() ) {
      this.#addFolder(sub);
    }
  }

  /* -------------------------------------------- */

  /**
   * Add a single document to the Adventure.
   * @param {ClientDocument} document The Document to add
   */
  #addDocument(document) {
    const cn = document.collectionName;

    // If the document was previously removed, restore it
    if ( this.#removedContent[cn].delete(document.id) ) return;

    // Otherwise, add documents that don't yet exist
    if ( !this.document[cn].some(d => d.id === document.id) ) {
      this.#addedContent[cn].add(document);
    }
  }
}

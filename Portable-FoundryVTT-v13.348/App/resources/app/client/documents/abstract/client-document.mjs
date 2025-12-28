import {BASE_DOCUMENT_TYPE, DOCUMENT_OWNERSHIP_LEVELS, PRIMARY_DOCUMENT_TYPES,
  WORLD_DOCUMENT_TYPES} from "@common/constants.mjs";
import CompendiumCollection from "../collections/compendium-collection.mjs";
import Hooks from "@client/helpers/hooks.mjs";
import TextEditor from "@client/applications/ux/text-editor.mjs";

/**
 * @import Document from "@common/abstract/document.mjs";
 * @import {Application, ApplicationV2} from "@client/applications/api/_module.mjs";
 * @import {DatabaseCreateOperation, DatabaseDeleteOperation} from "@common/abstract/_types.mjs";
 * @import Collection from "@common/utils/collection.mjs";
 * @import {DocumentConstructionContext} from "@common/abstract/_types.mjs";
 */

/**
 * A mixin which extends each Document definition with specialized client-side behaviors.
 * This mixin defines the client-side interface for database operations and common document behaviors.
 * @category Mixins
 * @param {typeof Document} Base    The base Document class to be mixed
 */
export default function ClientDocumentMixin(Base) {
  /**
   * The ClientDocument extends the base Document class by adding client-specific behaviors to all Document types.
   */
  class ClientDocument extends Base {
    constructor(data, context) {
      super(data, context);

      /**
       * A collection of Application instances which should be re-rendered whenever this document is updated.
       * The keys of this object are the application ids and the values are Application instances.
       * @type {Record<string,Application|ApplicationV2>}
       */
      Object.defineProperty(this, "apps", {
        value: {},
        writable: false,
        enumerable: false
      });

      /**
       * A cached reference to the Application instance used to configure this Document.
       * @type {Application|ApplicationV2|null}
       * @internal
       */
      Object.defineProperty(this, "_sheet", {value: null, writable: true, enumerable: false});
    }

    /** @inheritDoc */
    static name = "ClientDocumentMixin";

    /* -------------------------------------------- */

    /**
     * @inheritDoc
     * @this {ClientDocument}
     */
    _initialize(options={}) {
      super._initialize(options);
      if ( !game._documentsReady ) return;
      if ( this.parent?.collections[this.parentCollection]?._initialized === false ) {
        return; // Skip documents in uninitialized embedded collections
      }
      this._safePrepareData();
    }

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * Return a reference to the parent Collection instance that contains this Document.
     * @this {ClientDocument}
     * @returns {Collection|null}
     */
    get collection() {
      if ( this.isEmbedded ) return this.parent[this.parentCollection];
      if ( this.inCompendium ) return game.packs.get(this.pack, {strict: true});
      return CONFIG[this.documentName].collection?.instance ?? null;
    }

    /* -------------------------------------------- */

    /** @override */
    get compendium() {
      return this.inCompendium ? game.packs.get(this.pack) : null;
    }

    /* -------------------------------------------- */

    /**
     * Is this document in a compendium? A stricter check than Document#inCompendium.
     * @returns {boolean}
     * @override
     */
    get inCompendium() {
      return this.parent?.inCompendium ?? (this.documentName === game.packs.get(this.pack)?.documentName);
    }

    /* -------------------------------------------- */

    /**
     * A boolean indicator for whether the current game User has ownership rights for this Document.
     * Different Document types may have more specialized rules for what constitutes ownership.
     * @type {boolean}
     */
    get isOwner() {
      return this.testUserPermission(game.user, "OWNER");
    }

    /* -------------------------------------------- */

    /**
     * Test whether this Document is owned by any non-Gamemaster User.
     * @type {boolean}
     */
    get hasPlayerOwner() {
      return game.users.some(u => !u.isGM && this.testUserPermission(u, "OWNER"));
    }

    /* ---------------------------------------- */

    /**
     * A boolean indicator for whether the current game User has exactly LIMITED visibility (and no greater).
     * @type {boolean}
     */
    get limited() {
      return this.testUserPermission(game.user, "LIMITED", {exact: true});
    }

    /* -------------------------------------------- */

    /**
     * Return a string which creates a dynamic link to this Document instance.
     * @returns {string}
     */
    get link() {
      return `@UUID[${this.uuid}]{${foundry.utils.escapeHTML(this.name)}}`;
    }

    /* ---------------------------------------- */

    /**
     * Return the permission level that the current game User has over this Document.
     * See the CONST.DOCUMENT_OWNERSHIP_LEVELS object for an enumeration of these levels.
     * @type {number}
     *
     * @example Get the permission level the current user has for a document
     * ```js
     * game.user.id; // "dkasjkkj23kjf"
     * actor.data.permission; // {default: 1, "dkasjkkj23kjf": 2};
     * actor.permission; // 2
     * ```
     */
    get permission() {
      if ( game.user.isGM ) return DOCUMENT_OWNERSHIP_LEVELS.OWNER;
      if ( this.isEmbedded ) return this.parent.permission;
      return this.getUserLevel(game.user);
    }

    /* -------------------------------------------- */

    /**
     * Lazily obtain a Application instance used to configure this Document, or null if no sheet is available.
     * @type {Application|ApplicationV2|null}
     */
    get sheet() {
      if ( !this._sheet ) {
        const cls = this._getSheetClass();

        // Application V1 Document Sheets
        if ( foundry.utils.isSubclass(cls, foundry.appv1.api.Application) ) {
          this._sheet = new cls(this, {editable: this.isOwner});
        }

        // Application V2 Document Sheets
        else if ( foundry.utils.isSubclass(cls, foundry.applications.api.DocumentSheetV2) ) {
          this._sheet = new cls({document: this});
        }

        // No valid sheet class
        else this._sheet = null;
      }
      return this._sheet;
    }

    /* -------------------------------------------- */

    /**
     * A boolean indicator for whether the current game User has at least limited visibility for this Document.
     * Different Document types may have more specialized rules for what determines visibility.
     * @type {boolean}
     */
    get visible() {
      if ( this.isEmbedded ) return this.parent.visible;
      return this.testUserPermission(game.user, "LIMITED");
    }

    /* -------------------------------------------- */
    /*  Methods                                     */

    /* -------------------------------------------- */

    /**
     * Obtain the Application class constructor which should be used to configure this Document.
     * @returns {Function|null}
     * @internal
     */
    _getSheetClass() {
      const cfg = CONFIG[this.documentName];
      const type = this.type ?? BASE_DOCUMENT_TYPE;
      const sheets = cfg.sheetClasses[type] || {};

      // Sheet selection overridden at the instance level
      const override = this.getFlag("core", "sheetClass") ?? null;
      if ( (override !== null) && (override in sheets) ) return sheets[override].cls;

      // Default sheet selection for the type
      const classes = Object.values(sheets);
      if ( !classes.length ) return foundry.applications.sheets.BaseSheet;
      return (classes.find(s => s.default) ?? classes.find(s => s.canBeDefault) ?? classes.pop()).cls;
    }

    /* -------------------------------------------- */

    /**
     * Safely prepare data for a Document, catching any errors.
     * @internal
     */
    _safePrepareData() {
      try {
        this.prepareData();
      } catch(err) {
        Hooks.onError("ClientDocumentMixin#_initialize", err, {
          msg: `Failed data preparation for ${this.uuid}`,
          log: "error",
          uuid: this.uuid
        });
      }
    }

    /* -------------------------------------------- */

    /**
     * Prepare data for the Document. This method provides an opportunity for Document classes to define special data
     * preparation logic to compute values that don't need to be stored in the database, such as a "bloodied" hp value
     * or the total carrying weight of items. The work done by this method should be idempotent per initialization.
     * There are situations in which prepareData may be called more than once.
     *
     * By default, foundry calls the following methods in order whenever the document is created or updated.
     * 1. {@link reset} (Inherited from DataModel)
     * 2. {@link _initialize} (Inherited from DataModel)
     * 3. {@link prepareData}
     * 4. {@link foundry.abstract.TypeDataModel.prepareBaseData | TypeDataModel#prepareBaseData}
     * 5. {@link prepareBaseData}
     * 6. {@link prepareEmbeddedDocuments}
     * 7. {@link foundry.abstract.TypeDataModel.prepareDerivedData | TypeDataModel#prepareBaseData}
     * 8. {@link prepareDerivedData}
     *
     * Do NOT invoke database operations like {@link update} or {@link setFlag} within data prep, as that can cause an
     * infinite loop by re-triggering the data initialization process.
     *
     * If possible you should extend {@link prepareBaseData} and {@link prepareDerivedData} instead of this function
     * directly, but some systems with more complicated calculations may want to override this function to add extra
     * steps, such as to calculate certain item values after actor data prep.
     */
    prepareData() {
      const isTypeData = this.system instanceof foundry.abstract.TypeDataModel;
      if ( isTypeData ) this.system.prepareBaseData();
      this.prepareBaseData();
      this.prepareEmbeddedDocuments();
      if ( isTypeData ) this.system.prepareDerivedData();
      this.prepareDerivedData();
    }

    /* -------------------------------------------- */

    /**
     * Prepare data related to this Document itself, before any embedded Documents or derived data is computed.
     *
     * If possible when modifying the `system` object you should use
     * {@link foundry.abstract.TypeDataModel.prepareBaseData | TypeDataModel#prepareBaseData} on your data models
     * instead of this method directly on the document.
     */
    prepareBaseData() {}

    /* -------------------------------------------- */

    /**
     * Prepare all embedded Document instances which exist within this primary Document.
     */
    prepareEmbeddedDocuments() {
      for ( const collectionName of Object.keys(this.constructor.hierarchy || {}) ) {
        for ( const e of this.getEmbeddedCollection(collectionName) ) {
          e._safePrepareData();
        }
      }
    }

    /* -------------------------------------------- */

    /**
     * Apply transformations or derivations to the values of the source data object.
     * Compute data fields whose values are not stored to the database.
     *
     * If possible when modifying the `system` object you should use
     * {@link foundry.abstract.TypeDataModel.prepareDerivedData | TypeDataModel#prepareDerivedData} on your data models
     * instead of this method directly on the document.
     */
    prepareDerivedData() {}

    /* -------------------------------------------- */

    /**
     * Render all Application instances which are connected to this document by calling their respective
     * @see {@link foundry.applications.api.ApplicationV2#render}
     * @param {boolean} [force=false]     Force rendering
     * @param {object} [context={}]       Optional context
     */
    render(force=false, context={}) {
      for ( const app of Object.values(this.apps) ) {
        app.render(force, foundry.utils.deepClone(context));
      }
    }

    /* -------------------------------------------- */

    /**
     * Determine the sort order for this Document by positioning it relative a target sibling.
     * See SortingHelper.performIntegerSort for more details
     * @param {object} [options]            Sorting options provided to SortingHelper.performIntegerSort
     * @param {object} [options.updateData] Additional data changes applied to each sorted document
     * @param {object} [options.sortOptions] Options passed to the foundry.utils.performIntegerSort method
     * @returns {Promise<Document>}       The Document after it has been re-sorted
     */
    async sortRelative({updateData={}, ...sortOptions}={}) {
      const sorting = foundry.utils.performIntegerSort(this, sortOptions);
      const updates = [];
      for ( const s of sorting ) {
        const doc = s.target;
        const update = foundry.utils.mergeObject(updateData, s.update, {inplace: false});
        update._id = doc._id;
        if ( doc.sheet && doc.sheet.rendered ) await doc.sheet.submit({updateData: update});
        else updates.push(update);
      }
      if ( updates.length ) await this.constructor.updateDocuments(updates, {parent: this.parent, pack: this.pack});
      return this;
    }

    /* -------------------------------------------- */

    /**
     * Construct a UUID relative to another document.
     * @param {ClientDocument} relative  The document to compare against.
     */
    getRelativeUUID(relative) {
      const collection = this.collection;

      // The Documents are in two different compendia.
      if ( collection instanceof CompendiumCollection && (collection !== relative.collection) ) return this.uuid;

      // This Document is a sibling of the relative Document.
      if ( this.isEmbedded && (collection === relative.collection) ) return `.${this.id}`;

      // This Document may be a descendant of the relative Document, so walk up the hierarchy to check.
      const parts = [this.documentName, this.id];
      let parent = this.parent;
      while ( parent ) {
        if ( parent === relative ) break;
        parts.unshift(parent.documentName, parent.id);
        parent = parent.parent;
      }

      // The relative Document was a parent or grandparent of this one.
      if ( parent === relative ) return `.${parts.join(".")}`;

      // The relative Document was unrelated to this one.
      return this.uuid;
    }

    /* -------------------------------------------- */

    /**
     * Create a content link for this document.
     * @param {object} eventData                     The parsed object of data provided by the drop transfer event.
     * @param {object} [options]                     Additional options to configure link generation.
     * @param {ClientDocument} [options.relativeTo]  A document to generate a link relative to.
     * @param {string} [options.label]               A custom label to use instead of the document's name.
     * @returns {string}
     * @internal
     */
    _createDocumentLink(eventData, {relativeTo, label}={}) {
      if ( !relativeTo && !label ) return this.link;
      label ??= foundry.utils.escapeHTML(this.name);
      if ( relativeTo ) return `@UUID[${this.getRelativeUUID(relativeTo)}]{${label}}`;
      return `@UUID[${this.uuid}]{${label}}`;
    }

    /* -------------------------------------------- */

    /**
     * Handle clicking on a content link for this document.
     * @param {PointerEvent} event The triggering click event.
     * @returns {Application|Promise<ApplicationV2>|null}
     * @protected
     */
    _onClickDocumentLink(event) {
      return this.sheet?.render(true) ?? null;
    }

    /* -------------------------------------------- */
    /*  Event Handlers                              */
    /* -------------------------------------------- */

    /** @inheritDoc */
    async _preCreate(data, options, user) {
      const allowed = await super._preCreate(data, options, user);
      if ( allowed === false ) return false;

      // Forward to type data model
      if ( this.system instanceof foundry.abstract.TypeDataModel ) {
        return this.system._preCreate(data, options, user);
      }
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    _onCreate(data, options, userId) {
      super._onCreate(data, options, userId);

      // Render the sheet for this application
      if ( options.renderSheet && (userId === game.user.id) && this.sheet ) {
        const options = {
          renderContext: `create${this.documentName}`,
          renderData: data
        };
        /** @deprecated since v12 */
        Object.defineProperties(options, {
          action: { get() {
            foundry.utils.logCompatibilityWarning("The render options 'action' property is deprecated. "
              + "Please use 'renderContext' instead.", {since: 12, until: 14});
            return "create";
          } },
          data: { get() {
            foundry.utils.logCompatibilityWarning("The render options 'data' property is deprecated. "
              + "Please use 'renderData' instead.", {since: 12, until: 14});
            return data;
          } }
        });
        this.sheet.render(true, options);
      }

      // Update Compendium and global indices
      if ( this.inCompendium && !this.isEmbedded ) {
        if ( this instanceof foundry.documents.Folder ) this.collection.folders.set(this.id, this);
        else this.collection.indexDocument(this);
      }
      if ( this.constructor.metadata.indexed ) game.documentIndex.addDocument(this);

      // Update support metadata
      game.issues._countDocumentSubType(this.constructor, this._source);

      // Forward to type data model
      if ( this.system instanceof foundry.abstract.TypeDataModel ) {
        this.system._onCreate(data, options, userId);
      }
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    async _preUpdate(changes, options, user) {
      const allowed = await super._preUpdate(changes, options, user);
      if ( allowed === false ) return false;

      // Forward to type data model
      if ( this.system instanceof foundry.abstract.TypeDataModel ) {
        return this.system._preUpdate(changes, options, user);
      }
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    _onUpdate(changed, options, userId) {
      super._onUpdate(changed, options, userId);

      // Clear cached sheet if a new sheet is chosen, or the Document's sub-type changes.
      const sheetChanged = ("type" in changed) || ("sheetClass" in (changed.flags?.core || {}));
      if ( !options.preview && sheetChanged ) this._onSheetChange();

      // Otherwise re-render associated applications.
      else if ( options.render !== false ) {
        const options = {
          renderContext: `update${this.documentName}`,
          renderData: changed
        };
        /** @deprecated since v12 */
        Object.defineProperties(options, {
          action: {
            get() {
              foundry.utils.logCompatibilityWarning("The render options 'action' property is deprecated. "
                + "Please use 'renderContext' instead.", { since: 12, until: 14 });
              return "update";
            }
          },
          data: {
            get() {
              foundry.utils.logCompatibilityWarning("The render options 'data' property is deprecated. "
                + "Please use 'renderData' instead.", { since: 12, until: 14 });
              return changed;
            }
          }
        });
        this.render(false, options);
      }

      // Update Compendium and global indices
      if ( this.inCompendium && !this.isEmbedded ) {
        if ( this instanceof foundry.documents.Folder ) this.collection.folders.set(this.id, this);
        else this.collection.indexDocument(this);
      }
      if ( "name" in changed ) game.documentIndex.replaceDocument(this);

      // Forward to type data model
      if ( this.system instanceof foundry.abstract.TypeDataModel ) {
        this.system._onUpdate(changed, options, userId);
      }
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    async _preDelete(options, user) {
      const allowed = await super._preDelete(options, user);
      if ( allowed === false ) return false;

      // Forward to type data model
      if ( this.system instanceof foundry.abstract.TypeDataModel ) {
        return this.system._preDelete(options, user);
      }
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    _onDelete(options, userId) {
      super._onDelete(options, userId);
      this.#closeApplications(this);

      // Update Compendium and global indices
      if ( this.inCompendium && !this.isEmbedded ) {
        if ( this instanceof foundry.documents.Folder ) this.collection.folders.delete(this.id);
        else this.collection.index.delete(this.id);
      }
      game.documentIndex.removeDocument(this);

      // Update support metadata
      game.issues._countDocumentSubType(this.constructor, this._source, {decrement: true});

      // Forward to type data model
      if ( this.system instanceof foundry.abstract.TypeDataModel ) {
        this.system._onDelete(options, userId);
      }
    }

    /**
     * Close open Applications for this Document and its children.
     * @param {ClientDocument} document
     * @param {object} [closingOptions]
     */
    #closeApplications(document, closingOptions) {
      if ( !closingOptions ) {
        closingOptions = {
          submit: false,
          renderContext: `delete${this.documentName}`,
          renderData: this
        };
        /** @deprecated since v12 */
        Object.defineProperties(closingOptions, {
          action: {
            get() {
              foundry.utils.logCompatibilityWarning("The render options 'action' property is deprecated. "
                + "Please use 'renderContext' instead.", {since: 12, until: 14});
              return "delete";
            }
          },
          data: {
            get() {
              foundry.utils.logCompatibilityWarning("The render options 'data' property is deprecated. "
                + "Please use 'renderData' instead.", {since: 12, until: 14});
              return this;
            }
          }
        });
      }
      Object.values(document.apps).forEach(a => a.close(closingOptions));
      for ( const collection of Object.values(document.collections) ) {
        for (const child of collection ) {
          this.#closeApplications(child, closingOptions);
        }
      }
    }

    /* -------------------------------------------- */
    /*  Descendant Document Events                  */
    /* -------------------------------------------- */

    /**
     * Orchestrate dispatching descendant document events to parent documents when embedded children are modified.
     * @param {string} event                The event name, preCreate, onCreate, etc...
     * @param {string} collection           The collection name being modified within this parent document
     * @param {Array<*>} args               Arguments passed to each dispatched function
     * @param {ClientDocument} [_parent]    The document with directly modified embedded documents.
     *                                      Either this document or a descendant of this one.
     * @internal
     */
    _dispatchDescendantDocumentEvents(event, collection, args, _parent) {
      _parent ||= this;

      // Dispatch the event to this Document
      const fn = this[`_${event}DescendantDocuments`];
      if ( !(fn instanceof Function) ) throw new Error(`Invalid descendant document event "${event}"`);
      fn.call(this, _parent, collection, ...args);

      // Bubble the event to the parent Document
      /** @type ClientDocument */
      const parent = this.parent;
      if ( !parent ) return;
      parent._dispatchDescendantDocumentEvents(event, collection, args, _parent);
    }

    /* -------------------------------------------- */

    /**
     * Actions taken after descendant documents have been created, but before changes are applied to the client data.
     * @param {Document} parent         The direct parent of the created Documents, may be this Document or a child
     * @param {string} collection       The collection within which documents are being created
     * @param {object[]} data           The source data for new documents that are being created
     * @param {object} options          Options which modified the creation operation
     * @param {string} userId           The ID of the User who triggered the operation
     * @protected
     */
    _preCreateDescendantDocuments(parent, collection, data, options, userId) {}

    /* -------------------------------------------- */

    /**
     * Actions taken after descendant documents have been created and changes have been applied to client data.
     * @param {Document} parent         The direct parent of the created Documents, may be this Document or a child
     * @param {string} collection       The collection within which documents were created
     * @param {Document[]} documents    The array of created Documents
     * @param {object[]} data           The source data for new documents that were created
     * @param {object} options          Options which modified the creation operation
     * @param {string} userId           The ID of the User who triggered the operation
     * @protected
     */
    _onCreateDescendantDocuments(parent, collection, documents, data, options, userId) {
      if ( options.render === false ) return;
      this.render(false, {renderContext: `create${collection}`, renderData: data});
    }

    /* -------------------------------------------- */

    /**
     * Actions taken after descendant documents have been updated, but before changes are applied to the client data.
     * @param {Document} parent         The direct parent of the updated Documents, may be this Document or a child
     * @param {string} collection       The collection within which documents are being updated
     * @param {object[]} changes        The array of differential Document updates to be applied
     * @param {object} options          Options which modified the update operation
     * @param {string} userId           The ID of the User who triggered the operation
     * @protected
     */
    _preUpdateDescendantDocuments(parent, collection, changes, options, userId) {}

    /* -------------------------------------------- */

    /**
     * Actions taken after descendant documents have been updated and changes have been applied to client data.
     * @param {Document} parent         The direct parent of the updated Documents, may be this Document or a child
     * @param {string} collection       The collection within which documents were updated
     * @param {Document[]} documents    The array of updated Documents
     * @param {object[]} changes        The array of differential Document updates which were applied
     * @param {object} options          Options which modified the update operation
     * @param {string} userId           The ID of the User who triggered the operation
     * @protected
     */
    _onUpdateDescendantDocuments(parent, collection, documents, changes, options, userId) {
      if ( options.render === false ) return;
      this.render(false, {renderContext: `update${collection}`, renderData: changes});
    }

    /* -------------------------------------------- */

    /**
     * Actions taken after descendant documents have been deleted, but before deletions are applied to the client data.
     * @param {Document} parent         The direct parent of the deleted Documents, may be this Document or a child
     * @param {string} collection       The collection within which documents were deleted
     * @param {string[]} ids            The array of document IDs which were deleted
     * @param {object} options          Options which modified the deletion operation
     * @param {string} userId           The ID of the User who triggered the operation
     * @protected
     */
    _preDeleteDescendantDocuments(parent, collection, ids, options, userId) {}

    /* -------------------------------------------- */

    /**
     * Actions taken after descendant documents have been deleted and those deletions have been applied to client data.
     * @param {Document} parent         The direct parent of the deleted Documents, may be this Document or a child
     * @param {string} collection       The collection within which documents were deleted
     * @param {Document[]} documents    The array of Documents which were deleted
     * @param {string[]} ids            The array of document IDs which were deleted
     * @param {object} options          Options which modified the deletion operation
     * @param {string} userId           The ID of the User who triggered the operation
     * @protected
     */
    _onDeleteDescendantDocuments(parent, collection, documents, ids, options, userId) {
      if ( options.render === false ) return;
      this.render(false, {renderContext: `delete${collection}`, renderData: ids});
    }

    /* -------------------------------------------- */

    /**
     * Whenever the Document's sheet changes, close any existing applications for this Document, and re-render the new
     * sheet if one was already open.
     * @param {object} [options]
     * @param {boolean} [options.sheetOpen]  Whether the sheet was originally open and needs to be re-opened.
     * @internal
     */
    async _onSheetChange({ sheetOpen }={}) {
      sheetOpen ??= this.sheet.rendered;
      await Promise.all(Object.values(this.apps).map(app => app.close()));
      this._sheet = null;
      if ( sheetOpen ) this.sheet.render(true);

      // Re-draw the parent sheet in case of a dependency on the child sheet.
      this.parent?.sheet?.render(false);
    }

    /* -------------------------------------------- */

    /**
     * Gets the default new name for a Document
     * @param {object} context                    The context for which to create the Document name.
     * @param {string} [context.type]             The sub-type of the document
     * @param {Document|null} [context.parent]    A parent document within which the created Document should belong
     * @param {string|null} [context.pack]        A compendium pack within which the Document should be created
     * @returns {string}
     */
    static defaultName({type, parent, pack}={}) {
      const documentName = this.metadata.name;
      let collection;
      if ( parent ) collection = parent.getEmbeddedCollection(documentName);
      else if ( pack ) collection = game.packs.get(pack);
      else collection = game.collections.get(documentName);
      const takenNames = new Set();
      for ( const document of collection ) takenNames.add(document.name);
      let baseNameKey = this.metadata.label;
      if ( type && this.hasTypeData ) {
        const typeNameKey = CONFIG[documentName].typeLabels?.[type];
        if ( typeNameKey && game.i18n.has(typeNameKey) ) baseNameKey = typeNameKey;
      }
      const baseName = game.i18n.localize(baseNameKey);
      let name = baseName;
      let index = 1;
      while ( takenNames.has(name) ) name = `${baseName} (${++index})`;
      return name;
    }

    /* -------------------------------------------- */
    /*  Importing and Exporting                     */
    /* -------------------------------------------- */

    /**
     * Present a Dialog form to create a new Document of this type.
     * Choose a name and a type from a select menu of types.
     * @param {object} data                Document creation data
     * @param {DatabaseCreateOperation} [createOptions]  Document creation options.
     * @param {object} [options={}]        Options forwarded to DialogV2.prompt
     * @param {{id: string; name: string}[]} [options.folders] Available folders in which the new Document can be place
     * @param {string[]} [options.types]   A restriction of the selectable sub-types of the Dialog.
     * @param {string} [options.template]  A template to use for the dialog contents instead of the default.
     * @param {object} [options.context]   Additional render context to provide to the template.
     * @returns {Promise<Document|null>}   A Promise which resolves to the created Document, or null if the dialog was
     *                                     closed.
     */
    static async createDialog(data={}, createOptions={}, {folders, types, template, context, ...dialogOptions}={}) {
      const applicationOptions = {
        top: "position", left: "position", width: "position", height: "position", scale: "position", zIndex: "position",
        title: "window", id: "", classes: "", jQuery: ""
      };

      for ( const [k, v] of Object.entries(createOptions) ) {
        if ( k in applicationOptions ) {
          foundry.utils.logCompatibilityWarning("The ClientDocument.createDialog signature has changed. "
            + "It now accepts database operation options in its second parameter, "
            + "and options for DialogV2.prompt in its third parameter.", { since: 13, until: 15, once: true });
          const dialogOption = applicationOptions[k];
          if ( dialogOption ) foundry.utils.setProperty(dialogOptions, `${dialogOption}.${k}`, v);
          else dialogOptions[k] = v;
          delete createOptions[k];
        }
      }

      const { parent, pack } = createOptions;
      const cls = this.implementation;

      // Identify allowed types
      const documentTypes = [];
      let defaultType = CONFIG[this.documentName]?.defaultType;
      let defaultTypeAllowed = false;
      let hasTypes = false;
      if ( this.TYPES.length > 1 ) {
        if ( types?.length === 0 ) throw new Error("The array of sub-types to restrict to must not be empty");

        // Register supported types
        for ( const type of this.TYPES ) {
          if ( type === BASE_DOCUMENT_TYPE ) continue;
          if ( types && !types.includes(type) ) continue;
          let label = CONFIG[this.documentName]?.typeLabels?.[type];
          label = label && game.i18n.has(label) ? game.i18n.localize(label) : type;
          documentTypes.push({value: type, label});
          if ( type === defaultType ) defaultTypeAllowed = true;
        }
        if ( !documentTypes.length ) throw new Error("No document types were permitted to be created");

        if ( !defaultTypeAllowed ) defaultType = documentTypes[0].value;
        // Sort alphabetically
        documentTypes.sort((a, b) => a.label.localeCompare(b.label, game.i18n.lang));
        hasTypes = true;
      }

      // Identify destination collection
      let collection;
      if ( !parent ) {
        if ( pack ) collection = game.packs.get(pack);
        else collection = game.collections.get(this.documentName);
      }

      // Collect data
      folders ??= collection?._formatFolderSelectOptions() ?? [];
      const label = game.i18n.localize(this.metadata.label);
      const title = game.i18n.format("DOCUMENT.Create", {type: label});
      const type = data.type || defaultType;

      // Render the document creation form
      template ??= "templates/sidebar/document-create.html";
      const html = await foundry.applications.handlebars.renderTemplate(template, {
        folders, hasTypes, type,
        name: data.name || "",
        defaultName: cls.defaultName({type, parent, pack}),
        folder: data.folder,
        hasFolders: folders.length >= 1,
        types: documentTypes,
        ...context
      });
      const content = document.createElement("div");
      content.innerHTML = html;

      // Render the confirmation dialog window
      return foundry.applications.api.DialogV2.prompt(foundry.utils.mergeObject({
        content,
        window: {title}, // FIXME: double localization
        position: {width: 360},
        render: (event, dialog) => {
          if ( !hasTypes ) return;
          dialog.element.querySelector('[name="type"]').addEventListener("change", e => {
            const nameInput = dialog.element.querySelector('[name="name"]');
            nameInput.placeholder = cls.defaultName({type: e.target.value, parent, pack});
          });
        },
        ok: {
          label: title, // FIXME: double localization
          callback: (event, button) => {
            const fd = new foundry.applications.ux.FormDataExtended(button.form);
            foundry.utils.mergeObject(data, fd.object);
            if ( !data.folder ) delete data.folder;
            if ( !data.name?.trim() ) data.name = cls.defaultName({type: data.type, parent, pack});
            return cls.create(data, {renderSheet: true, ...createOptions});
          }
        }
      }, dialogOptions));
    }

    /* -------------------------------------------- */

    /**
     * Present a Dialog form to confirm deletion of this Document.
     * @param {object} [options] Additional options passed to `DialogV2.confirm`
     * @param {DatabaseDeleteOperation} [operation]  Document deletion options.
     * @returns {Promise<Document>} A Promise that resolves to the deleted Document
     */
    async deleteDialog(options={}, operation={}) {
      const positionKeys = ["top", "left", "width", "height", "scale", "zIndex"];
      if ( positionKeys.some(k => k in options) ) {
        foundry.utils.logCompatibilityWarning(
          "options is now an object containing entries supported by DialogV2.confirm.",
          {since: 13, until: 15}
        );
        options.position = positionKeys.reduce((position, key) => {
          if ( options[key] !== undefined ) position[key] = options[key];
          delete options[key];
          return position;
        }, {});
      }
      let content = options.content;
      const type = game.i18n.localize(this.constructor.metadata.label);
      if ( !content ) {
        const question = game.i18n.localize("AreYouSure");
        const warning = game.i18n.format("SIDEBAR.DeleteWarning", {type});
        content = `<p><strong>${question}</strong> ${warning}</p>`;
      }
      return foundry.applications.api.DialogV2.confirm(foundry.utils.mergeObject(
        {
          content,
          yes: {callback: () => this.delete(operation)},
          window: {
            icon: "fa-solid fa-trash",
            title: `${game.i18n.format("DOCUMENT.Delete", {type})}: ${this.name}` // FIXME: double localization
          }
        },
        options
      ));
    }

    /* -------------------------------------------- */

    /**
     * Export document data to a JSON file which can be saved by the client and later imported into a different session.
     * Only world Documents may be exported.
     * @param {object} [options]      Additional options passed to the {@link ClientDocument#toCompendium} method
     */
    exportToJSON(options) {
      if ( !WORLD_DOCUMENT_TYPES.includes(this.documentName) ) {
        throw new Error("Only world Documents may be exported");
      }
      const data = this.toCompendium(null, options);
      data._stats ??= {};
      data._stats.exportSource = {
        worldId: game.world.id,
        uuid: this.uuid,
        coreVersion: game.version,
        systemId: game.system.id,
        systemVersion: game.system.version
      };
      const filename = ["fvtt", this.documentName, this.name?.slugify(), this.id].filterJoin("-");
      foundry.utils.saveDataToFile(JSON.stringify(data, null, 2), "text/json", `${filename}.json`);
    }

    /* -------------------------------------------- */

    /**
     * Serialize salient information about this Document when dragging it.
     * @returns {object}  An object of drag data.
     */
    toDragData() {
      const dragData = {type: this.documentName};
      if ( this.id ) dragData.uuid = this.uuid;
      else dragData.data = this.toObject();
      return dragData;
    }

    /* -------------------------------------------- */

    /**
     * A helper function to handle obtaining the relevant Document from dropped data provided via a DataTransfer event.
     * The dropped data could have:
     * 1. A data object explicitly provided
     * 2. A UUID
     *
     * @param {object} data           The data object extracted from a DataTransfer event
     * @returns {Promise<Document>}   The resolved Document
     * @throws If a Document could not be retrieved from the provided data.
     */
    static async fromDropData(data) {
      let document = null;

      // Case 1 - Data explicitly provided
      if ( data.data ) document = new this(data.data);

      // Case 2 - UUID provided
      else if ( data.uuid ) document = await foundry.utils.fromUuid(data.uuid);

      // Ensure that we retrieved a valid document
      if ( !document ) {
        throw new Error("Failed to resolve Document from provided DragData. Either data or a UUID must be provided.");
      }
      if ( document.documentName !== this.documentName ) {
        throw new Error(`Invalid Document type '${document.type}' provided to ${this.name}.fromDropData.`);
      }

      // Flag the source UUID
      if ( document.id && !document._stats?.compendiumSource ) {
        document.updateSource({"_stats.compendiumSource": document.uuid});
      }
      return document;
    }

    /* -------------------------------------------- */

    /**
     * Create the Document from the given source with migration applied to it.
     * Only primary Documents may be imported.
     *
     * This function must be used to create a document from data that predates the current core version.
     * It must be given nonpartial data matching the schema it had in the core version it is coming from.
     * It applies legacy migrations to the source data before calling {@link foundry.abstract.Document.fromSource}.
     * If this function is not used to import old data, necessary migrations may not applied to the data
     * resulting in an incorrectly imported document.
     *
     * The core version is recorded in the `_stats` field, which all primary documents have. If the given source data
     * doesn't contain a `_stats` field, the data is assumed to be pre-V10, when the `_stats` field didn't exist yet.
     * The `_stats` field must not be stripped from the data before it is exported!
     * @param {object} source                  The document data that is imported.
     * @param {DocumentConstructionContext} [context] The model construction context passed to
     *                                                {@link foundry.abstract.Document.fromSource}. Strict validation is
     *                                                enabled by default.
     * @returns {Promise<Document>}
     */
    static async fromImport(source, context) {
      if ( !PRIMARY_DOCUMENT_TYPES.includes(this.documentName) ) {
        throw new Error("Only primary Documents may be imported");
      }
      const coreVersion = source._stats?.coreVersion;
      if ( coreVersion && foundry.utils.isNewerVersion(coreVersion, game.version) ) {
        throw new Error("Documents from a core version newer than the running version cannot be imported");
      }
      if ( coreVersion !== game.version ) {
        const response = await new Promise(resolve => {
          game.socket.emit("migrateDocumentData", this.documentName, source, resolve);
        });
        if ( response.error ) throw new Error(response.error);
        source = response.source;
      }
      return this.fromSource(source, {strict: true, ...context});
    }

    /* -------------------------------------------- */

    /**
     * Update this Document using a provided JSON string.
     * Only world Documents may be imported.
     * @this {ClientDocument}
     * @param {string} json                 Raw JSON data to import
     * @returns {Promise<ClientDocument>}   The updated Document instance
     */
    async importFromJSON(json) {
      if ( !WORLD_DOCUMENT_TYPES.includes(this.documentName) ) {
        throw new Error("Only world Documents may be imported");
      }

      // Create a document from the JSON data
      const parsedJSON = JSON.parse(json);
      const doc = await this.constructor.fromImport(parsedJSON);

      // Treat JSON import using the same workflows that are used when importing from a compendium pack
      const data = this.collection.fromCompendium(doc);

      // Preserve certain fields from the destination document
      for ( const k of this.constructor.metadata.preserveOnImport ) delete data[k];

      // Commit the import as an update to this document
      await this.update(data, {diff: false, recursive: false, noHook: true});
      ui.notifications.info("DOCUMENT.Imported", {format: {document: this.documentName, name: this.name}});
      return this;
    }

    /* -------------------------------------------- */

    /**
     * Render an import dialog for updating the data related to this Document through an exported JSON file
     * @returns {Promise<void>}
     */
    async importFromJSONDialog() {
      await foundry.applications.api.DialogV2.wait({
        window: {title: `${game.i18n.localize("DOCUMENT.ImportData")}: ${this.name}`}, // FIXME: double localization
        position: {width: 400},
        content: await foundry.applications.handlebars.renderTemplate("templates/apps/import-data.hbs", {
          hint1: game.i18n.format("DOCUMENT.ImportDataHint1", {document: this.documentName}),
          hint2: game.i18n.format("DOCUMENT.ImportDataHint2", {name: this.name})
        }),
        buttons: [{
          action: "import",
          label: "Import",
          icon: "fa-solid fa-file-import",
          callback: (event, button) => {
            const form = button.form;
            if ( !form.data.files.length ) {
              return ui.notifications.error("DOCUMENT.ImportDataError", {localize: true});
            }
            foundry.utils.readTextFromFile(form.data.files[0]).then(json => this.importFromJSON(json));
          },
          default: true
        }, {
          action: "no",
          label: "Cancel",
          icon: "fa-solid fa-xmark"
        }]
      });
    }

    /* -------------------------------------------- */

    /**
     * Transform the Document data to be stored in a Compendium pack.
     * Remove any features of the data which are world-specific.
     * @param {CompendiumCollection} [pack]   A specific pack being exported to
     * @param {object} [options]              Additional options which modify how the document is converted
     * @param {boolean} [options.clearFlags=false]      Clear the flags object
     * @param {boolean} [options.clearSource=true]      Clear any prior source information
     * @param {boolean} [options.clearSort=true]        Clear the currently assigned sort order
     * @param {boolean} [options.clearFolder=false]     Clear the currently assigned folder
     * @param {boolean} [options.clearOwnership=true]   Clear document ownership (recursive). Default ownership is
     *                                                  preserved.
     * @param {boolean} [options.clearState=true]       Clear fields which store document state (recursive)
     * @param {boolean} [options.keepId=false]          Retain the current Document id
     * @returns {object}                      A data object of cleaned data suitable for compendium import
     */
    toCompendium(pack, {clearSort=true, clearFolder=false, clearFlags=false, clearSource=true, clearOwnership=true,
      clearState=true, keepId=false} = {}) {
      const data = this.toObject();
      const fieldsToClearRecursively = [];
      if ( !keepId ) delete data._id;
      if ( clearSort ) delete data.sort;
      if ( clearFolder ) delete data.folder;
      if ( clearFlags ) delete data.flags;
      if ( clearSource ) fieldsToClearRecursively.push("_stats.compendiumSource", "_stats.duplicateSource", "_stats.exportSource");
      if ( clearState ) delete data.active;
      this.constructor._clearFieldsRecursively(data, fieldsToClearRecursively);
      if ( clearOwnership ) this.constructor._clearFieldsRecursively(data, ["ownership"], {
        callback: data => {
          if ( !("ownership" in data) ) return;
          const defaultOwnership = foundry.utils.getProperty(data, "ownership.default");
          foundry.utils.deleteProperty(data, "ownership");
          if ( typeof defaultOwnership === "number" ) data.ownership = { default: defaultOwnership };
        }
      });
      return data;
    }

    /* -------------------------------------------- */
    /*  Enrichment                                  */
    /* -------------------------------------------- */

    /**
     * Create a content link for this Document.
     * @param {Partial<EnrichmentAnchorOptions>} [options]  Additional options to configure how the link is constructed.
     * @returns {HTMLAnchorElement}
     */
    toAnchor({attrs={}, dataset={}, classes=[], name, icon}={}) {

      // Build dataset
      const documentConfig = CONFIG[this.documentName];
      const documentName = game.i18n.localize(`DOCUMENT.${this.documentName}`);
      let anchorIcon = icon ?? documentConfig.sidebarIcon;
      if ( !classes.includes("content-link") ) classes.unshift("content-link");
      attrs = foundry.utils.mergeObject({ draggable: "true" }, attrs);
      dataset = foundry.utils.mergeObject({
        link: "",
        uuid: this.uuid,
        id: this.id,
        type: this.documentName,
        pack: this.pack,
        tooltip: documentName
      }, dataset);

      // If this is a typed document, add the type to the dataset
      if ( this.type ) {
        const typeLabel = documentConfig.typeLabels[this.type];
        const typeName = game.i18n.has(typeLabel) ? `${game.i18n.localize(typeLabel)}` : "";
        dataset.tooltipText ??= typeName
          ? game.i18n.format("DOCUMENT.TypePageFormat", {type: typeName, page: documentName})
          : documentName;
        anchorIcon = icon ?? documentConfig.typeIcons?.[this.type] ?? documentConfig.sidebarIcon;
      }

      name ??= this.name;
      return TextEditor.implementation.createAnchor({ attrs, dataset, name, classes, icon: anchorIcon });
    }

    /* -------------------------------------------- */

    /**
     * Convert a Document to some HTML display for embedding purposes.
     * @param {DocumentHTMLEmbedConfig} config  Configuration for embedding behavior.
     * @param {EnrichmentOptions} [options]     The original enrichment options for cases where the Document embed
     *                                          content also contains text that must be enriched.
     * @returns {Promise<HTMLDocumentEmbedElement|HTMLElement|null>} A representation of the Document as HTML content,
     *                                          or null if such a representation could not be generated.
     */
    async toEmbed(config, options={}) {
      const content = await this._buildEmbedHTML(config, options);
      if ( !content ) return null;

      // Structure the embed as inline or figure unless it is already explicitly a <document-embed> element
      const embedCls = foundry.applications.elements.HTMLDocumentEmbedElement;
      let embed;
      if ( content instanceof embedCls ) embed = content;
      else {
        if ( config.inline ) embed = await this._createInlineEmbed(content, config, options);
        else embed = await this._createFigureEmbed(content, config, options);
      }

      // Attach required attributes
      if ( embed ) {
        embed.setAttribute("uuid", this.uuid);
        embed.dataset.uuid = this.uuid;
        embed.dataset.contentEmbed = "";
        if ( config.classes ) embed.classList.add(...config.classes.split(" "));
      }
      return embed;
    }

    /* -------------------------------------------- */

    /**
     * Specific callback actions to take when the embedded HTML for this Document has been added to the DOM.
     * @param {HTMLDocumentEmbedElement} element      The embedded document HTML
     */
    onEmbed(element) {}

    /* -------------------------------------------- */

    /**
     * A method that can be overridden by subclasses to customize embedded HTML generation.
     * @param {DocumentHTMLEmbedConfig} config  Configuration for embedding behavior.
     * @param {EnrichmentOptions} [options]     The original enrichment options for cases where the Document embed
     *                                          content also contains text that must be enriched.
     * @returns {Promise<HTMLElement|HTMLCollection|null>}  Either a single root element to append, or a collection of
     *                                                      elements that comprise the embedded content.
     * @protected
     */
    async _buildEmbedHTML(config, options={}) {
      return this.system instanceof foundry.abstract.TypeDataModel ? this.system.toEmbed(config, options) : null;
    }

    /* -------------------------------------------- */

    /**
     * A method that can be overridden by subclasses to customize inline embedded HTML generation.
     * @param {HTMLElement|HTMLCollection} content  The embedded content.
     * @param {DocumentHTMLEmbedConfig} [config]    Configuration for embedding behavior.
     * @param {EnrichmentOptions} [options]         The original enrichment options for cases where the Document embed
     *                                              content also contains text that must be enriched.
     * @returns {Promise<HTMLElement|null>}
     * @protected
     */
    async _createInlineEmbed(content, config, options) {
      const embed = new foundry.applications.elements.HTMLDocumentEmbedElement();
      if ( content instanceof HTMLCollection ) embed.append(...content);
      else embed.append(content);
      return embed;
    }

    /* -------------------------------------------- */

    /**
     * A method that can be overridden by subclasses to customize the generation of the embed figure.
     * @param {HTMLElement|HTMLCollection} content  The embedded content.
     * @param {DocumentHTMLEmbedConfig} config      Configuration for embedding behavior.
     * @param {EnrichmentOptions} [options]         The original enrichment options for cases where the Document embed
     *                                              content also contains text that must be enriched.
     * @returns {Promise<HTMLElement|null>}
     * @protected
     */
    async _createFigureEmbed(content, { cite, caption, captionPosition="bottom", label }, options) {
      const figure = document.createElement("figure");
      if ( content instanceof HTMLCollection ) figure.append(...content);
      else figure.append(content);
      if ( cite || caption ) {
        const figcaption = document.createElement("figcaption");
        if ( caption ) {
          const el = document.createElement("strong");
          el.classList.add("embed-caption");
          el.append(label || this.name);
          figcaption.append(el);
        }
        if ( cite ) {
          const el = document.createElement("cite");
          el.append(this.toAnchor());
          figcaption.append(el);
        }
        figure.insertAdjacentElement(captionPosition === "bottom" ? "beforeend" : "afterbegin", figcaption);
        if ( (captionPosition === "top") && cite ) figure.append(figcaption.querySelector(":scope > cite"));
      }
      figure.classList.add("content-embed"); // For backwards compatibility
      return this._createInlineEmbed(figure);
    }
  }
  return ClientDocument;
}

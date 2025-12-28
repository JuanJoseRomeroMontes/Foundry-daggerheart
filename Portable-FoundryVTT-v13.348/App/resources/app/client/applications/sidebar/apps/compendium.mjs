import {DOCUMENT_OWNERSHIP_LEVELS} from "@common/constants.mjs";
import DocumentDirectory from "../document-directory.mjs";
import Adventure from "@client/documents/adventure.mjs";

/**
 * An Application that displays the indexed contents of a Compendium pack.
 * @template {ClientDocument} TDocument
 * @extends {DocumentDirectory<TDocument>}
 */
export default class Compendium extends DocumentDirectory {
  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["compendium-directory", "sidebar-popout"],
    window: {
      frame: true,
      positioned: true
    },
    position: {
      top: 70,
      left: 120,
      width: 350,
      height: window.innerHeight - 100
    }
  };

  /** @override */
  static PARTS = {
    header: {
      template: "templates/sidebar/apps/compendium/header.hbs"
    },
    directory: {
      template: "templates/sidebar/apps/compendium/directory.hbs",
      templates: ["templates/sidebar/directory/directory.hbs"],
      scrollable: [".directory-list"]
    },
    footer: super.PARTS.footer
  };

  /** @override */
  static _entryPartial = "templates/sidebar/apps/compendium/index-partial.hbs";

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /** @override */
  get isPopout() {
    return false;
  }

  /** @override */
  get title() {
    return game.i18n.localize(this.collection.title);
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _initializeApplicationOptions(options) {
    options = super._initializeApplicationOptions(options);
    options.id = `compendium-${options.collection.collection.replaceAll(".", "_")}`;
    return options;
  }

  /* -------------------------------------------- */

  /** @override */
  _canCreateEntry() {
    const isOwner = this.collection.testUserPermission(game.user, "OWNER");
    return !this.collection.locked && isOwner && this.documentClass.canUserCreate(game.user);
  }

  /* -------------------------------------------- */

  /** @override */
  _canCreateFolder() {
    return this._canCreateEntry();
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _canRender(options) {
    if ( !this.collection.visible ) {
      if ( options.force ) ui.notifications.warn("COMPENDIUM.CannotViewWarning", { localize: true });
      return false;
    }
    return super._canRender(options);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _configureRenderOptions(options) {
    super._configureRenderOptions(options);
    options.window ||= {};
    options.window.icon ||= `fa-solid fa-lock${this.collection.locked ? "" : "-open"}`;
  }

  /* -------------------------------------------- */

  /** @override */
  _getEntryContextOptions() {
    const isAdventure = this.documentName === "Adventure";
    const isScene = this.documentName === "Scene";
    return [{
      name: "COMPENDIUM.ImportEntry",
      icon: '<i class="fa-solid fa-download"></i>',
      condition: () => !isAdventure && this.documentClass.canUserCreate(game.user),
      callback: li => {
        const collection = game.collections.get(this.documentName);
        return collection.importFromCompendium(this.collection, li.dataset.entryId, {}, {renderSheet: true});
      }
    }, {
      name: "ADVENTURE.ExportEdit",
      icon: '<i class="fa-solid fa-pen-to-square"></i>',
      condition: () => isAdventure && game.user.isGM && !this.collection.locked,
      callback: async li => {
        const document = await this.collection.getDocument(li.dataset.entryId);
        return new CONFIG.Adventure.exporterClass({
          document: document.clone({}, {keepId: true})
        }).render({force: true});
      }
    }, {
      name: "SCENE.GenerateThumb",
      icon: '<i class="fa-solid fa-image"></i>',
      condition: () => !this.collection.locked && isScene,
      callback: async li => {
        const scene = await this.collection.getDocument(li.dataset.entryId);
        try {
          const { thumb } = await scene?.createThumbnail() ?? {};
          if ( thumb ) await scene.update({thumb}, {diff: false});
          ui.notifications.info("SCENE.GenerateThumbSuccess", {format: {name: scene.name}});
        } catch(err) {
          ui.notifications.error(err.message);
        }
      }
    }, {
      name: "COMPENDIUM.DeleteEntry",
      icon: '<i class="fa-solid fa-trash"></i>',
      condition: () => game.user.isGM && !this.collection.locked,
      callback: async li => {
        const document = await this.collection.getDocument(li.dataset.entryId);
        return document?.deleteDialog();
      }
    }];
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _getFolderContextOptions() {
    return super._getFolderContextOptions().filter(({ name }) => {
      return (name !== "OWNERSHIP.Configure") && (name !== "FOLDER.Export");
    });
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareHeaderContext(context, options) {
    await super._prepareHeaderContext(context, options);
    Object.assign(context, {collection: this.collection, title: this.title});
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onRender(context, options) {
    await super._onRender(context, options);
    if ( this.options.classes.includes("themed") ) return;
    this.element.classList.remove("theme-light", "theme-dark");
    const { colorScheme } = game.settings.get("core", "uiConfig");
    if ( colorScheme.interface ) this.element.classList.add("themed", `theme-${colorScheme.interface}`);
  }

  /* -------------------------------------------- */
  /*  Event Listeners & Handlers                  */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _onCreateEntry(event, target) {
    // If this is an Adventure, use the Adventure Exporter application.
    if ( this.documentName === "Adventure" ) {
      const pack = this.collection.collection;
      const name = Adventure.implementation.defaultName({ pack });
      const adventure = new Adventure.implementation({ name }, { pack });
      return new CONFIG.Adventure.exporterClass({document: adventure}).render({force: true});
    }
    return super._onCreateEntry(event, target);
  }

  /* -------------------------------------------- */
  /*  Drag & Drop                                 */
  /* -------------------------------------------- */

  /** @override */
  _canDragDrop(selector) {
    return this.collection.testUserPermission(game.user, DOCUMENT_OWNERSHIP_LEVELS.OWNER);
  }

  /* -------------------------------------------- */


  /** @override */
  _createDroppedEntry(entry, updates={}) {
    const doc = entry.clone(updates, {keepId: true});
    return this.collection.importDocument(doc);
  }

  /* -------------------------------------------- */

  /** @override */
  _entryAlreadyExists(entry) {
    return (entry.collection === this.collection) && this.collection.index.has(entry.id);
  }

  /* -------------------------------------------- */

  /** @override */
  _getEntryDragData(entryId) {
    return {
      type: this.documentName,
      uuid: this.collection.getUuid(entryId)
    };
  }
}

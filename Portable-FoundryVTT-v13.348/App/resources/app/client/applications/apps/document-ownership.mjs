import {DOCUMENT_META_OWNERSHIP_LEVELS, DOCUMENT_OWNERSHIP_LEVELS} from "@common/constants.mjs";
import DocumentSheetV2 from "../api/document-sheet.mjs";
import HandlebarsApplicationMixin from "../api/handlebars-application.mjs";
import Folder from "@client/documents/folder.mjs";

/**
 * @import {ApplicationFormSubmission} from "../_types.mjs";
 */

/**
 * A generic application for configuring permissions for various Document types.
 * @extends DocumentSheetV2
 * @mixes HandlebarsApplication
 */
export default class DocumentOwnershipConfig extends HandlebarsApplicationMixin(DocumentSheetV2) {

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    classes: ["document-ownership"],
    template: "templates/apps/document-ownership.hbs",
    viewPermission: DOCUMENT_OWNERSHIP_LEVELS.OWNER,
    window: {
      contentClasses: ["standard-form"],
      icon: "fa-solid fa-file-lock"
    },
    position: {width: 420},
    form: {
      handler: DocumentOwnershipConfig.#onSubmitForm,
      closeOnSubmit: true
    },
    sheetConfig: false
  };

  /** @override */
  static PARTS = {
    ownership: {
      template: "templates/apps/document-ownership.hbs",
      root: true,
      scrollable: ["menu.scrollable"]
    },
    footer: {
      template: "templates/generic/form-footer.hbs"
    }
  };

  /**
   * Are Gamemaster users currently hidden?
   * @type {boolean}
   */
  static #gmHidden = true;

  /* -------------------------------------------- */

  /** @override */
  get title() {
    return game.i18n.format("OWNERSHIP.Title", {object: this.document.name});
  }

  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const document = context.document;
    const isFolder = document instanceof Folder;
    const isEmbedded = document.isEmbedded;
    const ownership = document.ownership;
    if ( !ownership && !isFolder ) {
      throw new Error(`The ${document.documentName} document does not contain ownership data`);
    }

    // User permission levels
    const playerLevels = Object.entries(DOCUMENT_META_OWNERSHIP_LEVELS).map(([name, level]) => {
      return {level, label: game.i18n.localize(`OWNERSHIP.${name}`)};
    });

    if ( !isFolder ) playerLevels.pop();
    for ( const [name, level] of Object.entries(DOCUMENT_OWNERSHIP_LEVELS) ) {
      if ( (level < 0) && !isEmbedded ) continue;
      playerLevels.push({level, label: game.i18n.localize(`OWNERSHIP.${name}`)});
    }

    // Default permission levels
    const defaultLevels = foundry.utils.deepClone(playerLevels);
    defaultLevels.shift();

    // Player users
    const users = game.users.map(user => ({
      user,
      level: isFolder ? DOCUMENT_META_OWNERSHIP_LEVELS.NOCHANGE : ownership[user.id],
      isAuthor: document.author === user
    })).sort((a, b) => a.user.name.localeCompare(b.user.name, game.i18n.lang));

    // Construct and return the data object
    return Object.assign(
      context,
      {
        currentDefault: ownership?.default ?? DOCUMENT_META_OWNERSHIP_LEVELS.DEFAULT,
        instructions: game.i18n.localize(isFolder ? "OWNERSHIP.HintFolder" : "OWNERSHIP.HintDocument"),
        defaultLevels,
        playerLevels,
        isFolder,
        showGM: !DocumentOwnershipConfig.#gmHidden,
        users,
        buttons: [{type: "submit", icon: "fa-solid fa-floppy-disk", label: "OWNERSHIP.Save"}]
      }
    );
  }

  /** @inheritDoc */
  async _onRender(context, options) {
    await super._onRender(context, options);
    this.#toggleGamemasters(DocumentOwnershipConfig.#gmHidden);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onChangeForm(formConfig, event) {
    super._onChangeForm(formConfig, event);

    // Toggle GM user visibility
    const toggle = this.element.querySelector("input[data-show-gm-toggle]");
    if ( event.target === toggle ) this.#toggleGamemasters(!DocumentOwnershipConfig.#gmHidden);
  }

  /* -------------------------------------------- */

  /**
   * Toggle CSS classes which display or hide gamemaster users
   * @param {boolean} hidden      Should gamemaster users be hidden?
   */
  #toggleGamemasters(hidden) {
    this.form.classList.toggle("no-gm", hidden);
    DocumentOwnershipConfig.#gmHidden = hidden;
  }

  /* -------------------------------------------- */

  /**
   * Update ownership level of this document for one or more users.
   * @this {DocumentOwnershipConfig}
   * @type {ApplicationFormSubmission}
   */
  static async #onSubmitForm(_event, _form, {object}) {
    // Collect new ownership levels from the form data
    const document = this.document;
    const metaLevels = DOCUMENT_META_OWNERSHIP_LEVELS;
    const isFolder = document instanceof Folder;
    const omit = isFolder ? metaLevels.NOCHANGE : metaLevels.DEFAULT;
    const ownershipLevels = Object.entries(object).reduce((levels, [userId, level]) => {
      if ( level === omit ) {
        delete levels[userId];
        return levels;
      }
      levels[userId] = level;
      return levels;
    }, {});

    // Update all documents in a Folder
    if ( document instanceof Folder ) {
      const cls = foundry.utils.getDocumentClass(document.type);
      const updates = document.contents.map(doc => {
        const ownership = foundry.utils.deepClone(doc.ownership);
        for ( const [userId, value] of Object.entries(ownershipLevels) ) {
          ownership[userId] = value;
        }
        return {_id: doc.id, "==ownership": ownership};
      });
      await cls.updateDocuments(updates, {noHook: true});
    }
    // Update a single Document
    else {
      await document.update({"==ownership": ownershipLevels}, {noHook: true});
    }

  }
}

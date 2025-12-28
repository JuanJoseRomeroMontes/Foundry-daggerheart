import DocumentSheetConfig from "@client/applications/apps/document-sheet-config.mjs";
import FilePicker from "@client/applications/apps/file-picker.mjs";
import FormApplication from "@client/appv1/api/form-application-v1.mjs";
import HTMLSecret from "@client/applications/ux/html-secret.mjs";

/**
 * @import Document from "@common/abstract/document.mjs";
 * @import {HTMLSecretConfiguration} from "@client/applications/ux/html-secret.mjs";
 */

/**
 * @typedef DocumentSheetV1Options
 * @property {number} viewPermission                The default permissions required to view this Document sheet.
 * @property {HTMLSecretConfiguration[]} [secrets]  An array of {@link foundry.applications.ux.HTMLSecret}
 *                                                  configuration objects.
 */

/**
 * Extend the FormApplication pattern to incorporate specific logic for viewing or editing Document instances.
 * See the FormApplication documentation for more complete description of this interface.
 *
 * @abstract
 * @deprecated since V13
 */
export default class DocumentSheet extends FormApplication {
  /**
   * @param {Document} object                     A Document instance which should be managed by this form.
   * @param {FormApplicationOptions & DocumentSheetV1Options} [options={}] Optional configuration parameters for how the
   *                                                                       form behaves.
   */
  constructor(object, options={}) {
    super(object, options);
    this._secrets = this._createSecretHandlers();
  }

  /* -------------------------------------------- */

  /**
   * The list of handlers for secret block functionality.
   * @type {HTMLSecret[]}
   * @protected
   */
  _secrets = [];

  /* -------------------------------------------- */

  /**
   * @override
   * @returns {FormApplicationOptions & DocumentSheetV1Options}
   */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["sheet"],
      template: `templates/sheets/${this.name.toLowerCase()}.html`,
      viewPermission: CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED,
      sheetConfig: true,
      secrets: []
    });
  }

  /* -------------------------------------------- */

  /**
   * A semantic convenience reference to the Document instance which is the target object for this form.
   * @type {ClientDocument}
   */
  get document() {
    return this.object;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  get id() {
    const suffix = this.document.uuid ?? foundry.utils.randomID();
    return `${this.constructor.name}-${suffix.replace(/\./g, "-")}`;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  get isEditable() {
    let editable = this.options.editable && this.document.isOwner;
    if ( this.document.pack ) {
      const pack = game.packs.get(this.document.pack);
      if ( pack.locked ) editable = false;
    }
    return editable;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  get title() {
    const reference = this.document.name ? `: ${this.document.name}` : "";
    return `${game.i18n.localize(this.document.constructor.metadata.label)}${reference}`;
  }

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async close(options={}) {
    await super.close(options);
    delete this.object.apps?.[this.appId];
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  getData(_options) {
    const data = this.document.toObject(false);
    const isEditable = this.isEditable;
    return {
      cssClass: isEditable ? "editable" : "locked",
      editable: isEditable,
      document: this.document,
      data: data,
      limited: this.document.limited,
      options: this.options,
      owner: this.document.isOwner,
      title: this.title
    };
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _activateCoreListeners(html) {
    super._activateCoreListeners(html);
    if ( this.isEditable ) html.find("img[data-edit]").on("click", this._onEditImage.bind(this));
    if ( !this.document.isOwner ) return;
    this._secrets.forEach(secret => secret.bind(html[0]));
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async activateEditor(name, options={}, initialContent="") {
    const editor = this.editors[name];
    options.document = this.document;
    if ( editor?.options.engine === "prosemirror" ) {
      options.plugins = foundry.utils.mergeObject({
        highlightDocumentMatches: ProseMirror.ProseMirrorHighlightMatchesPlugin.build(ProseMirror.defaultSchema)
      }, options.plugins);
    }
    return super.activateEditor(name, options, initialContent);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _render(force, options={}) {

    // Verify user permission to view and edit
    if ( !this._canUserView(game.user) ) {
      if ( !force ) return;
      const err = game.i18n.format("SHEETS.DocumentSheetPrivate", {
        type: game.i18n.localize(this.object.constructor.metadata.label)
      });
      ui.notifications.warn(err);
      return;
    }
    options.editable = options.editable ?? this.object.isOwner;

    // Parent class rendering workflow
    await super._render(force, options);

    // Register the active Application with the referenced Documents
    this.object.apps[this.appId] = this;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _renderOuter() {
    const html = await super._renderOuter();
    this._createDocumentIdLink(html);
    return html;
  }

  /* -------------------------------------------- */

  /**
   * Create an ID link button in the document sheet header which displays the document ID and copies to clipboard
   * @param {jQuery} html
   * @protected
   */
  _createDocumentIdLink(html) {
    if ( !(this.object instanceof foundry.abstract.Document) || !this.object.id ) return;
    const title = html.find(".window-title");
    const label = game.i18n.localize(this.object.constructor.metadata.label);
    const idLink = document.createElement("a");
    idLink.classList.add("document-id-link");
    idLink.ariaLabel = game.i18n.localize("SHEETS.CopyUuid");
    idLink.dataset.tooltip = "SHEETS.CopyUuid";
    idLink.dataset.tooltipDirection = "UP";
    idLink.innerHTML = '<i class="fa-solid fa-passport"></i>';
    idLink.addEventListener("click", event => {
      event.preventDefault();
      game.clipboard.copyPlainText(this.object.uuid);
      ui.notifications.info("DOCUMENT.IdCopiedClipboard", {format: {label, type: "uuid", id: this.object.uuid}});
    });
    idLink.addEventListener("contextmenu", event => {
      event.preventDefault();
      game.clipboard.copyPlainText(this.object.id);
      ui.notifications.info("DOCUMENT.IdCopiedClipboard", {format: {label, type: "id", id: this.object.id}});
    });
    title.append(idLink);
  }

  /* -------------------------------------------- */

  /**
   * Test whether a certain User has permission to view this Document Sheet.
   * @param {User} user     The user requesting to render the sheet
   * @returns {boolean}     Does the User have permission to view this sheet?
   * @protected
   */
  _canUserView(user) {
    return this.object.testUserPermission(user, this.options.viewPermission);
  }

  /* -------------------------------------------- */

  /**
   * Create objects for managing the functionality of secret blocks within this Document's content.
   * @returns {HTMLSecret[]}
   * @protected
   */
  _createSecretHandlers() {
    const document = this.document;
    if ( !document.isOwner || (document.inCompendium && document.collection.locked) ) return [];
    return this.options.secrets.map(config => {
      config.callbacks = {
        content: this._getSecretContent.bind(this),
        update: this._updateSecret.bind(this)
      };
      return new HTMLSecret(config);
    });
  }

  /* -------------------------------------------- */
  /*  Event Handlers                              */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _getHeaderButtons() {
    const buttons = super._getHeaderButtons();

    // Compendium Import
    const {documentName, isEmbedded, inCompendium} = this.document;
    if ( (documentName !== "Folder") && !isEmbedded && inCompendium
      && this.document.constructor.canUserCreate(game.user) ) {
      buttons.unshift({
        label: "Import",
        class: "import",
        icon: "fa-solid fa-download",
        onclick: async () => {
          await this.close();
          return game.collections.get(documentName).importFromCompendium(this.document.collection, this.document.id);
        }
      });
    }

    // Sheet Configuration
    if ( this.options.sheetConfig && this.isEditable && (this.document.getFlag("core", "sheetLock") !== true) ) {
      buttons.unshift({
        label: "Sheet",
        class: "configure-sheet",
        icon: "fa-solid fa-gear",
        onclick: ev => this._onConfigureSheet(ev)
      });
    }
    return buttons;
  }

  /* -------------------------------------------- */

  /**
   * Get the HTML content that a given secret block is embedded in.
   * @param {HTMLElement} secret  The secret block.
   * @returns {string|void}
   * @protected
   */
  _getSecretContent(secret) {
    const edit = secret.closest("[data-edit]")?.dataset.edit;
    if ( edit ) return foundry.utils.getProperty(this.document, edit);
  }

  /* -------------------------------------------- */

  /**
   * Update the HTML content that a given secret block is embedded in.
   * @param {HTMLElement} secret         The secret block.
   * @param {string} content             The new content.
   * @returns {Promise<ClientDocument|undefined>|void} The updated Document.
   * @protected
   */
  _updateSecret(secret, content) {
    const edit = secret.closest("[data-edit]")?.dataset.edit;
    if ( edit ) return this.document.update({[edit]: content});
  }

  /* -------------------------------------------- */

  /**
   * Handle requests to configure the default sheet used by this Document
   * @param {jQuery.ClickEvent} event
   * @protected
   */
  _onConfigureSheet(event) {
    event.preventDefault();
    new DocumentSheetConfig({
      document: this.document,
      position: {
        top: this.position.top + 40,
        left: this.position.left + ((this.position.width - DocumentSheet.defaultOptions.width) / 2)
      }
    }).render({ force: true });
  }

  /* -------------------------------------------- */

  /**
   * Handle changing a Document's image.
   * @param {MouseEvent} event  The click event.
   * @returns {Promise<FilePicker>}
   * @protected
   */
  _onEditImage(event) {
    const attr = event.currentTarget.dataset.edit;
    const current = foundry.utils.getProperty(this.object, attr);
    const { img } = this.document.constructor.getDefaultArtwork?.(this.document.toObject()) ?? {};
    const fp = new FilePicker.implementation({
      current,
      type: "image",
      redirectToRoot: img ? [img] : [],
      callback: path => {
        event.currentTarget.src = path;
        if ( this.options.submitOnChange ) return this._onSubmit(event);
      },
      top: this.position.top + 40,
      left: this.position.left + 10
    });
    return fp.browse();
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _updateObject(_event, formData) {
    if ( !this.object.id ) return;
    return this.object.update(formData);
  }
}

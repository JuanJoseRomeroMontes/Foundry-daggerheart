import BaseTableResult from "@common/documents/table-result.mjs";
import ClientDocumentMixin from "./abstract/client-document.mjs";
import TextEditor from "../applications/ux/text-editor.mjs";
import {fromUuidSync} from "../utils/helpers.mjs";

/**
 * The client-side TableResult document which extends the common BaseTableResult document model.
 * @extends BaseTableResult
 * @mixes ClientDocumentMixin
 * @category Documents
 *
 * @see {@link foundry.documents.RollTable}: The RollTable document type which contains TableResult
 *   documents
 */
export default class TableResult extends ClientDocumentMixin(BaseTableResult) {

  /**
   * A path reference to the icon image used to represent this result
   * @type {string}
   */
  get icon() {
    return this.img ?? CONFIG.RollTable.resultIcon;
  }

  /* -------------------------------------------- */

  /** @override */
  prepareBaseData() {
    super.prepareBaseData();
    if ( this.type === "text" ) this.documentUuid &&= null;
    else if ( this.type === "document" && game._documentsReady ) {
      const resultDocument = fromUuidSync(this.documentUuid);
      this.name ||= resultDocument?.name || "";
      this.img ??= resultDocument?.img ?? null;
    }
  }

  /* -------------------------------------------- */

  /**
   * Prepare a string representation for this result.
   * @returns {Promise<string>} The enriched text to display
   */
  async getHTML() {
    const documentLink = this.documentToAnchor()?.outerHTML ?? null;
    const description = await TextEditor.implementation.enrichHTML(this.description, {relativeTo: this,
      secrets: this.isOwner});
    const data = {result: {name: this.name, documentLink, description}};
    return foundry.applications.handlebars.renderTemplate("templates/sheets/roll-table/result-details.hbs", data);
  }

  /* -------------------------------------------- */

  /**
   * Create a content-link anchor from this Result's referenced Document.
   * @returns {HTMLAnchorElement|null}
   */
  documentToAnchor() {
    if ( this.type === "text" || !this.documentUuid ) return null;

    const document = fromUuidSync(this.documentUuid);
    if ( document instanceof foundry.abstract.Document ) return document.toAnchor();
    const {id, type, name, pack, documentName, uuid} = this.#documentDataFromUuid(this.documentUuid ?? "");
    const documentConfig = CONFIG[documentName];
    const typeName = game.i18n.localize(documentConfig?.typeLabels?.[type] ?? "");
    const documentNameLabel = documentName ? game.i18n.localize(`DOCUMENT.${documentName}`) : "";
    const tooltip = typeName
      ? game.i18n.format("DOCUMENT.TypePageFormat", {type: typeName, page: documentNameLabel})
      : documentNameLabel;
    const classes = ["content-link"];
    if ( !id || !documentName ) classes.push("broken");
    return TextEditor.implementation.createAnchor({
      classes,
      attrs: {draggable: "true"},
      dataset: {link: "", uuid, id, type: documentName, pack, tooltip},
      name: this.name || name || game.i18n.localize("Unknown"),
      icon: documentConfig?.typeIcons?.[type] ?? documentConfig?.sidebarIcon ?? "fa-solid fa-link-slash"
    });
  }

  /* -------------------------------------------- */

  /**
   * Acquire necessary data to create a content link from a Document uuid.
   * @param {string} uuid
   * @returns {object}
   */
  #documentDataFromUuid(uuid) {
    const parsedUuid = foundry.utils.parseUuid(uuid) ?? {};
    const documentOrIndexEntry = fromUuidSync(uuid) ?? {};
    const collection = documentOrIndexEntry.collection ?? parsedUuid.collection;
    return {
      id: parsedUuid.id,
      type: documentOrIndexEntry.type,
      name: documentOrIndexEntry.name,
      pack: collection?.metadata?.id,
      documentName: parsedUuid.type,
      uuid
    };
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _preUpdate(changes, options, user) {
    if ( (changes.type === "text") && this._source.documentUuid ) {
      changes.documentUuid = null;
    }
    return super._preUpdate(changes, options, user);
  }

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /**
   * @deprecated since V13
   * @ignore
   */
  getChatText() {
    const warning = "TableResult#getChatText is deprecated. Use the asynchronous TableResult#getHTML instead.";
    foundry.utils.logCompatibilityWarning(warning, {since: 13, until: 15});
    return this.type === "document" ? `@UUID[${this.documentUuid}]{${this.name}}` : this.description;
  }

}

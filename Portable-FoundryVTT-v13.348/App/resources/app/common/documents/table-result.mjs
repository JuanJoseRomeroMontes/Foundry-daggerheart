import Document from "../abstract/document.mjs";
import {buildUuid, mergeObject, parseUuid} from "../utils/helpers.mjs";
import {TABLE_RESULT_TYPES} from "../constants.mjs";
import * as fields from "../data/fields.mjs";

/**
 * @import {TableResultData} from "./_types.mjs";
 * @import {DocumentPermissionTest} from "@common/abstract/_types.mjs";
 */

/**
 * The TableResult Document.
 * Defines the DataSchema and common behaviors for a TableResult which are shared between both client and server.
 * @extends {Document<TableResultData>}
 * @mixes TableResultData
 * @category Documents
 */
export default class BaseTableResult extends Document {

  /* -------------------------------------------- */
  /*  Model Configuration                         */
  /* -------------------------------------------- */

  /** @inheritDoc */
  static metadata = Object.freeze(mergeObject(super.metadata, {
    name: "TableResult",
    collection: "results",
    label: "DOCUMENT.TableResult",
    labelPlural: "DOCUMENT.TableResults",
    coreTypes: Object.values(TABLE_RESULT_TYPES),
    permissions: {
      create: "OWNER",
      update: this.#canUpdate,
      delete: "OWNER"
    },
    compendiumIndexFields: ["type"],
    schemaVersion: "13.341"
  }, {inplace: false}));

  /** @override */
  static LOCALIZATION_PREFIXES = ["TABLE_RESULT"];

  /* -------------------------------------------- */

  /** @inheritDoc */
  static defineSchema() {
    return {
      _id: new fields.DocumentIdField(),
      type: new fields.DocumentTypeField(this, {initial: TABLE_RESULT_TYPES.TEXT}),
      name: new fields.StringField({required: true, nullable: false, blank: true, initial: "", textSearch: true}),
      img: new fields.FilePathField({categories: ["IMAGE"]}),
      description: new fields.HTMLField({textSearch: true}),
      documentUuid: new fields.DocumentUUIDField({required: false, nullable: true, initial: undefined}),
      weight: new fields.NumberField({required: true, integer: true, positive: true, nullable: false, initial: 1}),
      range: new fields.ArrayField(new fields.NumberField({integer: true}), {
        min: 2,
        max: 2,
        validate: r => r[1] >= r[0],
        validationError: "must be a length-2 array of ascending integers"
      }),
      drawn: new fields.BooleanField(),
      flags: new fields.DocumentFlagsField(),
      _stats: new fields.DocumentStatsField()
    };
  }

  /* -------------------------------------------- */

  /**
   * Is a user able to update an existing TableResult?
   * @type {DocumentPermissionTest}
   */
  static #canUpdate(user, doc, data) {
    if ( user.isGM ) return true;                               // GM users can do anything
    if ( !doc.testUserPermission(user, "OWNER") ) return false;
    const wasDrawn = new Set(["drawn", "_id"]);                 // Users can update the drawn status of a result
    if ( new Set(Object.keys(data)).equals(wasDrawn) ) return true;
    return doc.parent.testUserPermission(user, "OWNER");        // Otherwise, go by parent document permission
  }

  /* ---------------------------------------- */
  /*  Deprecations and Compatibility          */
  /* ---------------------------------------- */

  /**
   * @deprecated since V13
   * @ignore
   */
  get text() {
    const cls = this.constructor.name;
    const message = `${cls}#text is deprecated. Use ${cls}#name or ${cls}#description instead.`;
    foundry.utils.logCompatibilityWarning(message, {since: 13, until: 15, once: true});
    return this.type === "text" ? this.description : this.name;
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since V13
   * @ignore
   */
  get documentId() {
    const cls = this.constructor.name;
    const message = `${cls}#documentId is deprecated. Consult ${cls}#uuid instead.`;
    foundry.utils.logCompatibilityWarning(message, {since: 13, until: 15, once: true});
    return parseUuid(this.documentUuid)?.id ?? null;
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since V13
   * @ignore
   */
  get documentCollection() {
    const cls = this.constructor.name;
    const message = `${cls}#documentCollection is deprecated. Consult ${cls}#uuid instead.`;
    foundry.utils.logCompatibilityWarning(message, {since: 13, until: 15, once: true});
    const parsedUuid = parseUuid(this.documentUuid);
    const collection = parsedUuid?.collection;
    if ( collection instanceof foundry.documents.collections.CompendiumCollection ) return collection.metadata.id;
    return parsedUuid?.type ?? "";
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  static migrateData(data) {
    const TYPES = CONST.TABLE_RESULT_TYPES;

    /**
     * V12 migration of type from number to string.
     * @deprecated since v12
     */
    if ( typeof data.type === "number" ) {
      data.type = data.type === 0 ? TYPES.TEXT : TYPES.DOCUMENT;
    }

    // Since V13, the "compendium" type has been dropped.
    if ( data.type === "pack" ) data.type = TYPES.DOCUMENT;
    BaseTableResult.#migrateDocumentUuid(data);

    return super.migrateData(data);
  }

  /* -------------------------------------------- */

  /**
   * The documentId and documentCollection fields have been replaced with a single uuid field.
   * @param {object} data
   * @deprecated since V13
   */
  static #migrateDocumentUuid(data) {
    const hasRealProperty = p => Object.hasOwn(data, p) && !Object.getOwnPropertyDescriptor(data, p).get;
    if ( ["documentId", "documentCollection"].every(p => hasRealProperty(p)) ) {
      if ( data.type === CONST.TABLE_RESULT_TYPES.DOCUMENT ) {
        data.name = data.text;
        data.text = "";
        const [documentName, pack] = CONST.COMPENDIUM_DOCUMENT_TYPES.includes(data.documentCollection)
          ? [data.documentCollection, undefined]
          : [null, data.documentCollection];
        data.documentUuid = buildUuid({id: data.documentId, documentName, pack});
      }
      delete data.documentId;
      delete data.documentCollection;
    }
    this._addDataFieldMigration(data, "text", "description");
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  static shimData(data, options) {
    if ( Object.isSealed(data) || Object.hasOwn(data, "documentId") ) {
      return super.shimData(data, options);
    }
    BaseTableResult.#shimDocumentUuid(data);
    this._addDataFieldShim(data, "text", "description", {since: 13, until: 15});
    return super.shimData(data, options);
  }

  /* -------------------------------------------- */

  /**
   * Provide accessors for documentId and documentCollection, attempting to preserve a well-formed uuid on set.
   * @param {object} data
   */
  static #shimDocumentUuid(data) {
    const obj = "TableResultData";
    Object.defineProperties(data, {
      documentId: {
        get() {
          const message = `${obj}#documentId is deprecated. Consult ${obj}#documentUuid instead.`;
          foundry.utils.logCompatibilityWarning(message, {since: 13, until: 15, once: true});
          return parseUuid(data.documentUuid)?.id ?? null;
        },
        set(id) {
          const message = `${obj}#documentId is deprecated. Update ${obj}#documentUuid instead.`;
          foundry.utils.logCompatibilityWarning(message, {since: 13, until: 15, once: true});
          const [documentName, pack] = CONST.WORLD_DOCUMENT_TYPES.includes(data.documentCollection)
            ? [data.documentCollection, undefined]
            : [null, data.documentCollection];
          data.documentUuid = buildUuid({id, documentName, pack, once: true});
        }
      },
      documentCollection: {
        get() {
          const message = `${obj}#documentCollection is deprecated. Consult ${obj}#documentUuid instead.`;
          foundry.utils.logCompatibilityWarning(message, {since: 13, until: 15});
          const parsedUuid = parseUuid(data.documentUuid);
          return parsedUuid?.collection?.metadata?.id ?? parsedUuid.type ?? "";
        },
        set(value) {
          const message = `${obj}#documentCollection is deprecated. Update ${obj}#documentUuid instead.`;
          foundry.utils.logCompatibilityWarning(message, {since: 13, until: 15, once: true});
          data.documentUuid = CONST.WORLD_DOCUMENT_TYPES.includes(value)
            ? buildUuid({id: data.documentId, documentName: value})
            : buildUuid({id: data.documentId, pack: value});
        }
      }
    });
  }
}

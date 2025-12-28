/**
 * @import {DataModel, Document} from "./_module.mjs"
 * @import {DOCUMENT_OWNERSHIP_LEVELS, USER_ROLES} from "@common/constants.mjs"
 * @import {DataField} from "@common/data/fields.mjs";
 * @import BaseUser from "@common/documents/user.mjs"
 */

/**
 * @typedef {Record<string, DataField>} DataSchema
 */

/**
 * @typedef _DocumentConstructionContext
 * @property {Document|null} [parent=null]    The parent Document of this one, if this one is embedded
 * @property {string|null} [pack=null]        The compendium collection ID which contains this Document, if any
 * @property {boolean} [strict=true]          Whether to validate initial data strictly?
 * @property {string|null} [parentCollection] The name of the parent Document's collection that would contain this one
 */

/**
 * @typedef {DataModelConstructionContext & _DocumentConstructionContext} DocumentConstructionContext
 */

/**
 * @typedef DataModelValidationOptions
 * @property {boolean} [fields]           Validate each individual field
 * @property {boolean} [joint]            Perform joint validation on the full data model?
 *                                        Joint validation will be performed by default if no changes are passed.
 *                                        Joint validation will be disabled by default if changes are passed.
 *                                        Joint validation can be performed on a complete set of changes (for example
 *                                        testing a complete data model) by explicitly passing true.
 * @property {object} [changes]           A specific set of proposed changes to validate, rather than the full
 *                                        source data of the model.
 * @property {boolean} [clean]            If changes are provided, attempt to clean the changes before validating
 *                                        them? This option mutates the provided changes.
 * @property {boolean} [strict=true]      Throw an error if validation fails.
 * @property {boolean} [fallback=false]   Allow replacement of invalid values with valid defaults? This option mutates
 *                                        the provided changes.
 * @property {boolean} [dropInvalidEmbedded=false]  If true, invalid embedded documents will emit a warning and be
 *                                        placed in the invalidDocuments collection rather than causing the parent
 *                                        to be considered invalid. This option mutates the provided changes.
 */

/**
 * @typedef DataModelConstructionOptions
 * @property {DataModel|null} [parent]    A parent DataModel instance to which this DataModel belongs
 */

/**
 * @typedef {DataModelConstructionOptions &
 *           Pick<DataModelValidationOptions, "strict"|"fallback"|"dropInvalidEmbedded">} DataModelConstructionContext
 */

/**
 * @typedef DataModelUpdateOptions
 * @property {boolean} [dryRun=false]     Do not finally apply the change, but instead simulate the update workflow
 * @property {boolean} [fallback=false]   Allow automatic fallback to a valid initial value if the value provided for
 *                                        a field in the model is invalid.
 * @property {boolean} [recursive=true]   Apply changes to inner objects recursively rather than replacing the
 *                                         top-level object.
 * @property {boolean} [restoreDelta]     An advanced option used specifically and internally by the ActorDelta model
 */

/**
 * @typedef {"get"|"create"|"update"|"delete"} DatabaseAction
 */

/**
 * @typedef DatabaseGetOperation
 * @property {Record<string, any>} query        A query object which identifies the set of Documents retrieved
 * @property {"get"} action                     The action of this database operation
 * @property {false} [broadcast]                Get requests are never broadcast
 * @property {boolean} [index]                  Return indices only instead of full Document records
 * @property {string[]} [indexFields]           An array of field identifiers which should be indexed
 * @property {string|null} [pack=null]          A compendium collection ID which contains the Documents
 * @property {Document|null} [parent=null]      A parent Document within which Documents are embedded
 * @property {string} [parentUuid]              A parent Document UUID provided when the parent instance is unavailable
 */

/**
 * @typedef DatabaseCreateOperation
 * @property {boolean} broadcast                Whether the database operation is broadcast to other connected clients
 * @property {"create"} action                  The action of this database operation
 * @property {object[]} data                    An array of data objects from which to create Documents
 * @property {boolean} [keepId=false]           Retain the _id values of provided data instead of generating new ids
 * @property {boolean} [keepEmbeddedIds=true]   Retain the _id values of embedded document data instead of generating
 *                                              new ids for each embedded document
 * @property {number} [modifiedTime]            The timestamp when the operation was performed
 * @property {boolean} [noHook=false]           Block the dispatch of hooks related to this operation
 * @property {boolean} [render=true]            Re-render Applications whose display depends on the created Documents
 * @property {boolean} [renderSheet=false]      Render the sheet Application for any created Documents
 * @property {Document|null} [parent=null]      A parent Document within which Documents are embedded
 * @property {string|null} pack                 A compendium collection ID which contains the Documents
 * @property {string|null} [parentUuid]         A parent Document UUID provided when the parent instance is unavailable
 * @property {Record<string, object>} [_createData] Used internally by server-side backend
 * @property {(string|object)[]} [_result]      Used internally by the server-side backend
 */

/**
 * @typedef DatabaseUpdateOperation
 * @property {boolean} broadcast                Whether the database operation is broadcast to other connected clients
 * @property {"update"} action                  The action of this database operation
 * @property {object[]} updates                 An array of data objects used to update existing Documents.
 *                                              Each update object must contain the _id of the target Document
 * @property {boolean} [diff=true]              Difference each update object against current Document data and only use
 *                                              differential data for the update operation
 * @property {number} [modifiedTime]            The timestamp when the operation was performed
 * @property {boolean} [recursive=true]         Merge objects recursively. If false, inner objects will be replaced
 *                                              explicitly. Use with caution!
 * @property {boolean} [render=true]            Re-render Applications whose display depends on the created Documents
 * @property {boolean} [noHook=false]           Block the dispatch of hooks related to this operation
 * @property {Document|null} [parent=null]      A parent Document within which Documents are embedded
 * @property {string|null} pack                 A compendium collection ID which contains the Documents
 * @property {string|null} [parentUuid]         A parent Document UUID provided when the parent instance is unavailable
 * @property {Record<string, object>} [_updateData] Used internally by the server-side backend
 * @property {(string|object)[]} [_result]      Used internally by the server-side backend
 */

/**
 * @typedef DatabaseDeleteOperation
 * @property {boolean} broadcast                Whether the database operation is broadcast to other connected clients
 * @property {"delete"} action                  The action of this database operation
 * @property {string[]} ids                     An array of Document ids which should be deleted
 * @property {boolean} [deleteAll=false]        Delete all documents in the Collection, regardless of _id
 * @property {Record<string, string>} [replacements] The mapping of IDs of deleted Documents to the UUIDs of the
 *                                              Documents that replace the deleted Documents
 * @property {number} [modifiedTime]            The timestamp when the operation was performed
 * @property {boolean} [noHook=false]           Block the dispatch of hooks related to this operation
 * @property {boolean} [render=true]            Re-render Applications whose display depends on the deleted Documents
 * @property {Document|null} [parent=null]      A parent Document within which Documents are embedded
 * @property {string|null} pack                 A compendium collection ID which contains the Documents
 * @property {string|null} [parentUuid]         A parent Document UUID provided when the parent instance is unavailable
 * @property {(string|object)[]} [_result]      An alias for 'ids' used internally by the server-side backend
 */

/**
 * @typedef {DatabaseGetOperation
 *   |DatabaseCreateOperation
 *   |DatabaseUpdateOperation
 *   |DatabaseDeleteOperation} DatabaseOperation
 */

/**
 * @typedef DocumentSocketRequest
 * @property {string} type                      The type of Document being transacted
 * @property {DatabaseAction} action            The action of the request
 * @property {DatabaseOperation} operation      Operation parameters for the request
 * @property {string} userId                    The id of the requesting User
 * @property {boolean} broadcast                Should the response be broadcast to other connected clients?
 */

/**
 * @typedef DataModelFromSourceOptions
 * @property {boolean} [strict=false]    Models created from trusted source data are validated non-strictly.
 *                                       Default: `false`.
 */

/**
 * @typedef DocumentCloneOptions
 * @property {boolean} [save=false]             Save the clone to the World database? Default: `false`.
 * @property {boolean} [keepId=false]           Keep the same ID of the original document. Default: `false`.
 * @property {boolean} [addSource=false]        Track the clone source. Default: `false`.
 */

/**
 * @callback DocumentPermissionTest
 * @param {BaseUser} user         The User attempting the operation
 * @param {Document} document     The Document being operated upon
 * @param {object} [data]         Data provided to a creation or update operation
 * @returns {boolean}
 */

/**
 * @typedef DocumentClassMetadata
 * @property {string} name
 * @property {string} label
 * @property {string[]} coreTypes
 * @property {string} collection
 * @property {Record<string, string>} embedded
 * @property {Record<
 *   "view"|"create"|"update"|"delete", keyof USER_ROLES|keyof DOCUMENT_OWNERSHIP_LEVELS|DocumentPermissionTest
 * >} permissions
 * @property {boolean} hasTypeData
 * @property {boolean} indexed
 * @property {string[]} compendiumIndexFields
 * @property {string[]} preserveOnImport
 * @property {string} [schemaVersion]
 */

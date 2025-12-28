/**
 * @import {Document} from "../abstract/_module.mjs";
 * @import {Point} from "../_types.mjs";
 */

/**
 * @typedef LineIntersection
 * @property {number} x               The x-coordinate of intersection
 * @property {number} y               The y-coordinate of intersection
 * @property {number} t0              The vector distance from A to B on segment AB
 * @property {number} [t1]            The vector distance from C to D on segment CD
 */

/**
 * @typedef LineCircleIntersection
 * @property {boolean} aInside        Is point A inside the circle?
 * @property {boolean} bInside        Is point B inside the circle?
 * @property {boolean} contained      Is the segment AB contained within the circle?
 * @property {boolean} outside        Is the segment AB fully outside the circle?
 * @property {boolean} tangent        Is the segment AB tangent to the circle?
 * @property {Point[]} intersections  Intersection points: zero, one, or two
 */

/**
 * @typedef ResolvedUUID
 * @property {string} uuid                      The original UUID.
 * @property {string} [type]                    The type of Document referenced. Legacy compendium UUIDs will not
 *                                              populate this field if the compendium is not active in the World.
 * @property {string} id                        The ID of the Document referenced.
 * @property {string} [primaryType]             The primary Document type of this UUID. Only present if the Document
 *                                              is embedded.
 * @property {string} [primaryId]               The primary Document ID of this UUID. Only present if the Document
 *                                              is embedded.
 * @property {DocumentCollection} [collection]  The Collection containing the referenced Document unless that Document
 *                                              is embedded, in which case the Collection of the primary Document.
 * @property {string[]} embedded                Additional Embedded Document parts.
 * @property {string} [documentType]            Either the document type or the parent type. Retained for backwards
 *                                              compatibility.
 * @property {string} [documentId]              Either the document id or the parent id. Retained for backwards
 *                                              compatibility.
 */

/**
 * @typedef IterableWeakMapHeldValue
 * @property {Set<WeakRef<any>>} set  The set to be cleaned.
 * @property {WeakRef<any>} ref       The ref to remove.
 */

/**
 * @typedef IterableWeakMapValue
 * @property {any} value         The value.
 * @property {WeakRef<any>} ref  The weak ref of the key.
 */

/**
 * @typedef {Record<string, StringTreeNode|any>} StringTreeNode
 * A string tree node consists of zero-or-more string keys, and a leaves property that contains any objects that
 * terminate at the current node.
 */

/**
 * @callback StringTreeEntryFilter
 * @param {any} entry  The entry to filter.
 * @returns {boolean}  Whether the entry should be included in the result set.
 */

/**
 * @typedef WordTreeEntry
 * A leaf entry in the tree.
 * @property {Document|object} entry  An object that this entry represents.
 * @property {string} documentName    The document type.
 * @property {string} uuid            The document's UUID.
 * @property {string} [pack]          The pack ID.
 */

/**
 * @callback EmittedEventListener
 * @param {Event} event         The emitted event
 * @returns {any}
 */

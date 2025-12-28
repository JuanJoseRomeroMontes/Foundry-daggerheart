import {ALLOWED_HTML_ATTRIBUTES, ALLOWED_HTML_TAGS, ALLOWED_URL_SCHEMES, ALLOWED_URL_SCHEMES_APPLIED_TO_ATTRIBUTES,
  TRUSTED_IFRAME_DOMAINS, SORT_INTEGER_DENSITY} from "@common/constants.mjs";
import CompendiumCollection from "@client/documents/collections/compendium-collection.mjs";

/**
 * @import Document from "@common/abstract/document.mjs";
 * @import PlaceableObject from "@client/canvas/placeables/placeable-object.mjs";
 */

/**
 * Clean a provided HTML fragment, closing unbalanced tags and stripping some undesirable properties
 * @param {string} raw      A raw HTML string
 * @returns {string}        The cleaned HTML content
 */
export function cleanHTML(raw) {
  const document = domParser.parseFromString(raw, "text/html");
  const cleanedBody = document.createElement("body");
  for ( const childNode of document.body.childNodes ) cleanedBody.appendChild(cleanNode(childNode));
  return cleanedBody.innerHTML;
}

/**
 * The retry string used by {@link getCacheBustURL}
 * @type {string}
 */
const CACHE_BUST_RETRY_STRING = Date.now().toString();

/**
 * The DOMParser instance used by {@link cleanHTML}.
 * @type {DOMParser}
 */
const domParser = new DOMParser();

/**
 * The list of allowed HTML tags.
 * Used by {@link cleanNode}.
 * @type {Set<string>}
 */
const allowedHtmlTags = new Set(ALLOWED_HTML_TAGS.map(tag => tag.toUpperCase()));

/**
 * The list of allowed attributes in HTML elements.
 * Used by {@link cleanNode}.
 * @type {Map<string, RegExp>}
 */
const allowedHtmlAttributes = new Map(Object.entries(ALLOWED_HTML_ATTRIBUTES).map(
  ([tag, attributes]) => [tag.toUpperCase(), new RegExp(`^${attributes.join("|").replaceAll("*", ".*")}$`)]));

/**
 * The list of allowed URL schemes.
 * Used by {@link cleanNode}.
 * @type {Set<string>}
 */
const allowedUrlSchemes = new Set(ALLOWED_URL_SCHEMES.map(scheme => `${scheme}:`));

/**
 * The list of attributes validated as URLs.
 * Used by {@link cleanNode}.
 * @type {Set<string>}
 */
const allowedUrlSchemesAppliedToAttributes = new Set(ALLOWED_URL_SCHEMES_APPLIED_TO_ATTRIBUTES);

/**
 * Clean the provided HTML node.
 * @param {Node} node   A node
 * @returns {Node}      The cleaned node
 */
function cleanNode(node) {
  if ( node.nodeType === Node.TEXT_NODE ) return node.cloneNode(true);
  if ( (node.nodeType !== Node.ELEMENT_NODE) || !allowedHtmlTags.has(node.tagName) ) {
    return node.ownerDocument.createDocumentFragment();
  }
  const cleanedNode = node.ownerDocument.createElement(node.tagName);

  // Sanitize attributes
  const allowedAttributesGlobal = allowedHtmlAttributes.get("*");
  const allowedAttributesLocal = allowedHtmlAttributes.get(node.tagName);
  if ( allowedAttributesGlobal || allowedAttributesLocal ) {
    for ( const attribute of node.attributes ) {
      if ( (allowedAttributesGlobal?.test(attribute.name) !== true)
        && (allowedAttributesLocal?.test(attribute.name) !== true) ) continue;
      if ( allowedUrlSchemesAppliedToAttributes.has(attribute.name) ) {
        const url = URL.parseSafe(attribute.value);
        if ( url && !allowedUrlSchemes.has(url.protocol) ) continue;
      }
      cleanedNode.setAttribute(attribute.name, attribute.value);
    }
  }

  // Sanitize child nodes
  for ( const childNode of node.childNodes ) cleanedNode.appendChild(cleanNode(childNode));

  // Automatically add a sandbox attribute to iframes from untrusted domains
  if ( cleanedNode.tagName === "IFRAME" ) {
    const url = URL.parseSafe(cleanedNode.getAttribute("src"));
    const host = url?.hostname;
    const isTrusted = TRUSTED_IFRAME_DOMAINS.some(domain => (host === domain) || host?.endsWith(`.${domain}`));
    if ( isTrusted ) cleanedNode.removeAttribute("sandbox");
    else cleanedNode.setAttribute("sandbox", "allow-scripts allow-forms");
  }

  // Parse data-tooltip contents as HTML and sanitize it as well
  if ( cleanedNode.hasAttribute("data-tooltip") ) {
    cleanedNode.setAttribute("data-tooltip", cleanHTML(cleanedNode.getAttribute("data-tooltip")));
  }
  return cleanedNode;
}

/* -------------------------------------------- */

/**
 * Export data content to be saved to a local file
 * @param {string} data       Data content converted to a string
 * @param {string} type       The type of
 * @param {string} filename   The filename of the resulting download
 */
export function saveDataToFile(data, type, filename) {
  const blob = new Blob([data], {type: type});

  // Create an element to trigger the download
  const a = document.createElement("a");
  a.href = window.URL.createObjectURL(blob);
  a.download = filename;

  // Dispatch a click event to the element
  a.dispatchEvent(new MouseEvent("click", {bubbles: true, cancelable: true, view: window}));
  setTimeout(() => window.URL.revokeObjectURL(a.href), 100);
}

/* -------------------------------------------- */

/**
 * Read text data from a user provided File object
 * @param {File} file           A File object
 * @returns {Promise<string>}   A Promise which resolves to the loaded text data
 */
export function readTextFromFile(file) {
  const reader = new FileReader();
  return new Promise((resolve, reject) => {
    reader.onload = ev => {
      resolve(reader.result);
    };
    reader.onerror = ev => {
      reader.abort();
      reject();
    };
    reader.readAsText(file);
  });
}

/* -------------------------------------------- */

/**
 * Retrieve a Document by its Universally Unique Identifier (uuid).
 * @param {string} uuid                      The uuid of the Document to retrieve.
 * @param {object} [options]                 Options to configure how a UUID is resolved.
 * @param {Document} [options.relative]      A Document to resolve relative UUIDs against.
 * @param {boolean} [options.invalid=false]  Allow retrieving an invalid Document.
 * @returns {Promise<Document|null>}         Returns the Document if it could be found, otherwise null.
 */
export async function fromUuid(uuid, options={}) {
  if ( !uuid ) return null;
  const {relative, invalid=false} = options;
  let {type, id, primaryId, collection, embedded, doc} = foundry.utils.parseUuid(uuid, {relative}) ?? {};
  if ( collection instanceof CompendiumCollection ) {
    if ( type === "Folder" ) return collection.folders.get(id);
    doc = await collection.getDocument(primaryId ?? id);
  }
  else doc = doc ?? collection?.get(primaryId ?? id, {invalid});
  if ( embedded?.length ) doc = _resolveEmbedded(doc, embedded, {invalid});
  return doc || null;
}

/* -------------------------------------------- */

/**
 * Retrieve a Document by its Universally Unique Identifier (uuid) synchronously. If the uuid resolves to a compendium
 * document, that document's index entry will be returned instead.
 * @param {string} uuid                      The uuid of the Document to retrieve.
 * @param {object} [options]                 Options to configure how a UUID is resolved.
 * @param {Document} [options.relative]      A Document to resolve relative UUIDs against.
 * @param {boolean} [options.invalid=false]  Allow retrieving an invalid Document.
 * @param {boolean} [options.strict=true]    Throw an error if the UUID cannot be resolved synchronously.
 * @returns {Document|object|null}           The Document or its index entry if it resides in a Compendium, otherwise
 *                                           null.
 * @throws If the uuid resolves to a Document that cannot be retrieved synchronously, and the strict option is true.
 */
export function fromUuidSync(uuid, options={}) {
  if ( !uuid ) return null;
  const {relative, invalid=false, strict=true} = options;
  let {type, id, primaryId, collection, embedded, doc} = foundry.utils.parseUuid(uuid, {relative}) ?? {};
  if ( !id || !collection ) return null;
  if ( (collection instanceof CompendiumCollection) && embedded?.length ) {
    if ( !strict ) return null;
    throw new Error(
      `fromUuidSync was invoked on UUID '${uuid}' which references an Embedded Document and cannot be retrieved `
      + "synchronously.");
  }
  const baseId = primaryId ?? id;
  if ( collection instanceof CompendiumCollection ) {
    if ( type === "Folder" ) return collection.folders.get(id);
    doc = doc ?? collection.get(baseId, {invalid}) ?? collection.index.get(baseId);
    if ( doc && !doc.pack ) doc.pack = collection.collection;
  }
  else {
    doc = doc ?? collection.get(baseId, {invalid});
    if ( embedded?.length ) doc = _resolveEmbedded(doc, embedded, {invalid});
  }
  return doc || null;
}

/* -------------------------------------------- */

/**
 * Resolve a series of embedded document UUID parts against a parent Document.
 * @param {Document} parent                  The parent Document.
 * @param {string[]} parts                   A series of Embedded Document UUID parts.
 * @param {object} [options]                 Additional options to configure Embedded Document resolution.
 * @param {boolean} [options.invalid=false]  Allow retrieving an invalid Embedded Document.
 * @returns {Document}                       The resolved Embedded Document.
 */
function _resolveEmbedded(parent, parts, {invalid=false}={}) {
  let doc = parent;
  while ( doc && (parts.length > 1) ) {
    const [embeddedName, embeddedId] = parts.splice(0, 2);
    doc = doc.getEmbeddedDocument(embeddedName, embeddedId, {invalid});
  }
  return doc;
}

/* -------------------------------------------- */

/**
 * Return a reference to the Document class implementation which is configured for use.
 * @param {string} documentName               The canonical Document name, for example "Actor"
 * @returns {typeof Document|undefined}       The configured Document class implementation
 */
export function getDocumentClass(documentName) {
  return CONFIG[documentName]?.documentClass;
}

/* -------------------------------------------- */

/**
 * Return a reference to the PlaceableObject class implementation which is configured for use.
 * @param {string} documentName                  The canonical Document name, for example "Actor"
 * @returns {typeof PlaceableObject|undefined}   The configured PlaceableObject class implementation
 */
export function getPlaceableObjectClass(documentName) {
  return CONFIG[documentName]?.objectClass;
}

/* -------------------------------------------- */

/**
 * Given a source object to sort, a target to sort relative to, and an Array of siblings in the container:
 * Determine the updated sort keys for the source object, or all siblings if a reindex is required.
 * Return an Array of updates to perform, it is up to the caller to dispatch these updates.
 * Each update is structured as:
 * {
 *   target: object,
 *   update: {sortKey: sortValue}
 * }
 *
 * @param {object} source       The source object being sorted
 * @param {object} [options]    Options which modify the sort behavior
 * @param {object|null} [options.target]  The target object relative which to sort
 * @param {object[]} [options.siblings]   The Array of siblings which the source should be sorted within
 * @param {string} [options.sortKey=sort] The property name within the source object which defines the sort key
 * @param {boolean} [options.sortBefore]  Explicitly sort before (true) or sort after( false).
 *                                        If undefined the sort order will be automatically determined.
 * @returns {object[]}          An Array of updates for the caller of the helper function to perform
 */
export function performIntegerSort(source, {target=null, siblings=[], sortKey="sort", sortBefore}={}) {

  // Automatically determine the sorting direction
  sortBefore ??= ((source[sortKey] || 0) > (target?.[sortKey] || 0));

  // Ensure the siblings are sorted
  siblings = Array.from(siblings).sort((a, b) => a[sortKey] - b[sortKey]);

  // Determine the index target for the sort
  const defaultIdx = sortBefore ? siblings.length : 0;
  const idx = target ? siblings.findIndex(sib => sib === target) : defaultIdx;

  // Determine the indices to sort between
  const [min, max] = sortBefore ? _sortBefore(siblings, idx, sortKey) : _sortAfter(siblings, idx, sortKey);

  // Easiest case - no siblings
  if ( siblings.length === 0 ) {
    return [{target: source, update: {[sortKey]: SORT_INTEGER_DENSITY}}];
  }

  // No minimum - sort to beginning
  else if ( Number.isFinite(max) && (min === null) ) {
    return [{target: source, update: {[sortKey]: max - SORT_INTEGER_DENSITY}}];
  }

  // No maximum - sort to end
  else if ( Number.isFinite(min) && (max === null) ) {
    return [{target: source, update: {[sortKey]: min + SORT_INTEGER_DENSITY}}];
  }

  // Sort between two
  else if ( Number.isFinite(min) && Number.isFinite(max) && (Math.abs(max - min) > 1) ) {
    return [{target: source, update: {[sortKey]: Math.round(0.5 * (min + max))}}];
  }

  // Reindex all siblings
  else {
    siblings.splice(idx + (sortBefore ? 0 : 1), 0, source);
    return siblings.map((sib, i) => ({target: sib, update: {[sortKey]: (i+1) * SORT_INTEGER_DENSITY}}));
  }
}

/* -------------------------------------------- */

/**
 * Given an ordered Array of siblings and a target position, return the [min,max] indices to sort before the target.
 */
function _sortBefore(siblings, idx, sortKey) {
  const max = siblings[idx] ? siblings[idx][sortKey] : null;
  const min = siblings[idx-1] ? siblings[idx-1][sortKey] : null;
  return [min, max];
}

/* -------------------------------------------- */

/**
 * Given an ordered Array of siblings and a target position, return the [min,max] indices to sort after the target.
 */
function _sortAfter(siblings, idx, sortKey) {
  const min = siblings[idx] ? siblings[idx][sortKey] : null;
  const max = siblings[idx+1] ? siblings[idx+1][sortKey] : null;
  return [min, max];
}

/* -------------------------------------------- */

/**
 * Express a timestamp as a relative string.
 * This helper internally uses GameTime#format using the relative formatter and the Earth calendar.
 * @param {Date|string} timeStamp   A timestamp string or Date object to be formatted as a relative time
 * @returns {string}                A string expression for the relative time
 */
export function timeSince(timeStamp) {
  timeStamp = new Date(timeStamp);
  const now = new Date();
  const seconds = (now - timeStamp) / 1000;
  const components = game.time.earthCalendar.timeToComponents(seconds);
  return game.time.earthCalendar.format(components, "ago", {
    short: true,
    separator: " ",
    maxTerms: 2
  });
}

/* -------------------------------------------- */

/**
 * Parse an HTML string, returning a processed HTMLElement or HTMLCollection.
 * A single HTMLElement is returned if the provided string contains only a single top-level element.
 * An HTMLCollection is returned if the provided string contains multiple top-level elements.
 * @param {string} htmlString
 * @returns {HTMLCollection|HTMLElement}
 */
export function parseHTML(htmlString) {
  const div = document.createElement("div");
  div.innerHTML = htmlString;
  const children = div.children;
  return children.length > 1 ? children : children[0];
}

/* -------------------------------------------- */

/**
 * Return a URL with a cache-busting query parameter appended.
 * @param {string} src        The source URL being attempted
 * @returns {string|boolean}  The new URL, or false on a failure.
 */
export function getCacheBustURL(src) {
  const url = URL.parseSafe(src);
  if ( !url ) return false;
  if ( url.origin === window.location.origin ) return false;
  url.searchParams.append("cors-retry", CACHE_BUST_RETRY_STRING);
  return url.href;
}

/* -------------------------------------------- */

/**
 * Use the Fetch API to retrieve a resource and return a Blob instance for it.
 * @param {string} src
 * @param {object} [options]                   Options to configure the loading behaviour.
 * @param {boolean} [options.bustCache=false]  Append a cache-busting query parameter to the request.
 * @returns {Promise<Blob>}                    A Blob containing the loaded data
 */
export async function fetchResource(src, {bustCache=false}={}) {
  const fail = `Failed to load texture ${src}`;
  const req = bustCache ? getCacheBustURL(src) : src;
  if ( !req ) throw new Error(`${fail}: Invalid URL`);
  let res;
  try {
    res = await fetch(req, {mode: "cors", credentials: "same-origin"});
  }
  catch(err) {
    // We may have encountered a common CORS limitation: https://bugs.chromium.org/p/chromium/issues/detail?id=409090
    if ( !bustCache ) return fetchResource(src, {bustCache: true});
    throw new Error(`${fail}: CORS failure`);
  }
  if ( !res.ok ) throw new Error(`${fail}: Server responded with ${res.status}`);
  return res.blob();
}

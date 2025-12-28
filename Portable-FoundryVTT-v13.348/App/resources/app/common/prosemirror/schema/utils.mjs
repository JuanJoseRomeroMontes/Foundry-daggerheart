import {mergeObject} from "../../utils/helpers.mjs";

// A list of tag names that are considered allowable inside a node that only supports inline content.
const INLINE_TAGS = new Set(["A", "EM", "I", "STRONG", "B", "CODE", "U", "S", "DEL", "SUP", "SUB", "SPAN"]);

/**
 * Determine if an HTML element contains purely inline content, i.e. only text nodes and 'mark' elements.
 * @param {HTMLElement} element  The element.
 * @returns {boolean}
 */
export function onlyInlineContent(element) {
  for ( const child of element.children ) {
    if ( !INLINE_TAGS.has(child.tagName) ) return false;
  }
  return true;
}

/* -------------------------------------------- */

/**
 * Determine if an HTML element is empty.
 * @param {HTMLElement} element  The element.
 * @returns {boolean}
 */
export function isElementEmpty(element) {
  return !element.childNodes.length;
}

/* -------------------------------------------- */

/**
 * Convert an element's style attribute string into an object.
 * @param {string} str  The style string.
 * @returns {object}
 */
export function stylesFromString(str) {
  return Object.fromEntries(str.split(/;\s*/g).map(prop => prop.split(/:\s*/)));
}

/* -------------------------------------------- */

/**
 * Merge two style attribute strings.
 * @param {string} a  The first style string.
 * @param {string} b  The second style string.
 * @returns {string}
 */
export function mergeStyle(a, b) {
  const allStyles = mergeObject(stylesFromString(a), stylesFromString(b));
  return Object.entries(allStyles).map(([k, v]) => v ? `${k}: ${v}` : null).filterJoin("; ");
}

/* -------------------------------------------- */

/**
 * Convert an element's class attribute string into an array of class names.
 * @param {string} str  The class string.
 * @returns {string[]}
 */
export function classesFromString(str) {
  return str.split(/\s+/g);
}

/* -------------------------------------------- */

/**
 * Merge two class attribute strings.
 * @param {string} a  The first class string.
 * @param {string} b  The second class string.
 * @returns {string}
 */
export function mergeClass(a, b) {
  const allClasses = classesFromString(a).concat(classesFromString(b));
  return Array.from(new Set(allClasses)).join(" ");
}

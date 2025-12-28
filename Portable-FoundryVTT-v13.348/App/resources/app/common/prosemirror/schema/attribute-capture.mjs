import {ALLOWED_HTML_ATTRIBUTES} from "../../constants.mjs";
import {getType, mergeObject} from "../../utils/helpers.mjs";
import {classesFromString, mergeClass, mergeStyle, stylesFromString} from "./utils.mjs";

/**
 * @import {AllowedAttributeConfiguration, ManagedAttributesSpec} from "./_types.mjs";
 */

/**
 * A class responsible for injecting attribute capture logic into the ProseMirror schema.
 */
export default class AttributeCapture {
  constructor() {
    this.#parseAllowedAttributesConfig(ALLOWED_HTML_ATTRIBUTES ?? {});
  }

  /* -------------------------------------------- */

  /**
   * The configuration of attributes that are allowed on HTML elements.
   * @type {Record<string, AllowedAttributeConfiguration>}
   */
  #allowedAttrs = {};

  /* -------------------------------------------- */

  /**
   * Augments the schema definition to allow each node or mark to capture all the attributes on an element and preserve
   * them when re-serialized back into the DOM.
   * @param {NodeSpec|MarkSpec} spec  The schema specification.
   */
  attributeCapture(spec) {
    if ( !spec.parseDOM ) return;
    if ( !spec.attrs ) spec.attrs = {};
    spec.attrs._preserve = { default: {}, formatting: true };
    spec.parseDOM.forEach(rule => {
      if ( rule.style ) return; // This doesn't work for style rules. We need a different solution there.
      const getAttrs = rule.getAttrs;
      rule.getAttrs = el => {
        let attrs = getAttrs?.(el);
        if ( attrs === false ) return false;
        if ( typeof attrs !== "object" ) attrs = {};
        mergeObject(attrs, rule.attrs);
        mergeObject(attrs, { _preserve: this.#captureAttributes(el, spec.managed) });
        return attrs;
      };
    });
    const toDOM = spec.toDOM;
    spec.toDOM = node => {
      const domSpec = toDOM(node);
      const attrs = domSpec[1];
      const preserved = node.attrs._preserve ?? {};
      if ( preserved.style ) preserved.style = preserved.style.replaceAll('"', "'");
      if ( getType(attrs) === "Object" ) {
        domSpec[1] = mergeObject(preserved, attrs, { inplace: false });
        if ( ("style" in preserved) && ("style" in attrs) ) domSpec[1].style = mergeStyle(preserved.style, attrs.style);
        if ( ("class" in preserved) && ("class" in attrs) ) domSpec[1].class = mergeClass(preserved.class, attrs.class);
      }
      else domSpec.splice(1, 0, { ...preserved });
      return domSpec;
    };
  }

  /* -------------------------------------------- */

  /**
   * Capture all allowable attributes present on an HTML element and store them in an object for preservation in the
   * schema.
   * @param {HTMLElement} el                 The element.
   * @param {ManagedAttributesSpec} managed  An object containing the attributes, styles, and classes that are managed
   *                                         by the ProseMirror node and should not be preserved.
   * @returns {Attrs}
   */
  #captureAttributes(el, managed={}) {
    const allowed = this.#allowedAttrs[el.tagName.toLowerCase()] ?? this.#allowedAttrs["*"];
    return Array.from(el.attributes).reduce((obj, attr) => {
      if ( attr.name.startsWith("data-pm-") ) return obj; // Ignore attributes managed by the ProseMirror editor itself.
      if ( managed.attributes?.includes(attr.name) ) return obj; // Ignore attributes managed by the node.
      // Ignore attributes that are not allowed.
      if ( !allowed.wildcards.some(prefix => attr.name.startsWith(prefix)) && !allowed.attrs.has(attr.name) ) {
        return obj;
      }
      if ( (attr.name === "class") && managed.classes?.length ) {
        obj.class = classesFromString(attr.value).filter(cls => !managed.classes.includes(cls)).join(" ");
        return obj;
      }
      if ( (attr.name === "style") && managed.styles?.length ) {
        const styles = stylesFromString(attr.value);
        managed.styles.forEach(style => delete styles[style]);
        obj.style = Object.entries(styles).map(([k, v]) => v ? `${k}: ${v}` : null).filterJoin("; ");
        return obj;
      }
      obj[attr.name] = attr.value;
      return obj;
    }, {});
  }

  /* -------------------------------------------- */

  /**
   * Parse the configuration of allowed attributes into a more performant structure.
   * @param {Record<string, string[]>} config  The allowed attributes configuration.
   */
  #parseAllowedAttributesConfig(config) {
    const all = this.#allowedAttrs["*"] = this.#parseAllowedAttributes(config["*"] ?? []);
    for ( const [tag, attrs] of Object.entries(config ?? {}) ) {
      if ( tag === "*" ) continue;
      const allowed = this.#allowedAttrs[tag] = this.#parseAllowedAttributes(attrs);
      all.attrs.forEach(allowed.attrs.add, allowed.attrs);
      allowed.wildcards.push(...all.wildcards);
    }
  }

  /* -------------------------------------------- */

  /**
   * Parse an allowed attributes configuration into a more efficient structure.
   * @param {string[]} attrs  The list of allowed attributes.
   * @returns {AllowedAttributeConfiguration}
   */
  #parseAllowedAttributes(attrs) {
    const allowed = { wildcards: [], attrs: new Set() };
    for ( const attr of attrs ) {
      const wildcard = attr.indexOf("*");
      if ( wildcard < 0 ) allowed.attrs.add(attr);
      else allowed.wildcards.push(attr.substring(0, wildcard));
    }
    return allowed;
  }
}

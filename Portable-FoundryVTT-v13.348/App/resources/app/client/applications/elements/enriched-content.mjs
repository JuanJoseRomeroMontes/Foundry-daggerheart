/**
 * A custom HTMLElement that is used to wrap enriched content that requires additional interactivity.
 */
export default class HTMLEnrichedContentElement extends HTMLElement {

  /**
   * The HTML tag named used by this element.
   * @type {string}
   */
  static tagName = "enriched-content";

  /**
   * Attributes requiring change notifications
   * @type {string[]}
   */
  static observedAttributes = ["enricher"];

  /**
   * The enricher configuration that applies to this element.
   * @type {TextEditorEnricherConfig}
   */
  #enricher;

  /* -------------------------------------------- */
  /*  Element Lifecycle                           */
  /* -------------------------------------------- */

  /**
   * Invoke the enricher onRender callback when it is added to the DOM.
   */
  connectedCallback() {
    this.#enricher = CONFIG.TextEditor.enrichers.find(e => e.id === this.getAttribute("enricher"));
    if ( !(this.#enricher?.onRender instanceof Function) ) return;
    this.#enricher.onRender(this);
  }

  /* -------------------------------------------- */

  /**
   * Fire a callback on change to an observed attribute.
   * @param {string} attrName The name of the attribute
   * @param {string|null} oldValue The old value: null indicates the attribute was not present.
   * @param {string|null} newValue The new value: null indicates the attribute is removed.
   */
  attributeChangedCallback(attrName, oldValue, newValue) {
    if ( attrName === "enricher" ) {
      this.#enricher = CONFIG.TextEditor.enrichers.find(e => e.id === this.getAttribute("enricher"));
    }
  }
}

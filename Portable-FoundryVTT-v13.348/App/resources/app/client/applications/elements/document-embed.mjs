/**
 * A custom HTMLElement that is used to wrap enriched content that requires additional interactivity.
 */
export default class HTMLDocumentEmbedElement extends HTMLElement {

  /**
   * The HTML tag named used by this element.
   * @type {string}
   */
  static tagName = "document-embed";

  /**
   * Invoke the Document#onEmbed callback when it is added to the DOM.
   */
  connectedCallback() {
    const uuid = this.getAttribute("uuid");
    if ( !uuid ) return;
    foundry.utils.fromUuid(uuid).then(doc => doc.onEmbed(this));
  }
}

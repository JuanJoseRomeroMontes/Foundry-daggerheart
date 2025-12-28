/**
 * A custom HTML element used to wrap secret blocks in HTML content in order to provide additional interactivity.
 */
export default class HTMLSecretBlockElement extends HTMLElement {
  /**
   * The HTML tag named used by this element.
   * @type {string}
   */
  static tagName = "secret-block";

  /* -------------------------------------------- */

  /**
   * A reference to the reveal button, if it exists.
   * @type {HTMLButtonElement}
   */
  #button;

  /* -------------------------------------------- */

  /**
   * The wrapped secret block.
   * @type {HTMLElement}
   */
  get secret() {
    return this.querySelector(":scope > .secret");
  }

  /* -------------------------------------------- */

  /**
   * The revealed state of the secret block.
   * @type {boolean}
   */
  get revealed() {
    return this.secret.classList.contains("revealed");
  }

  /* -------------------------------------------- */

  /** @override */
  connectedCallback() {
    if ( !this.#button ) this.#addRevealButton();
  }

  /* -------------------------------------------- */

  /**
   * Toggle the secret revealed or hidden state in content that this secret block represents.
   * @param {string} content  The raw string content for this secret.
   * @returns {string}        The modified raw content.
   */
  toggleRevealed(content) {
    const id = this.secret.id;
    const regex = new RegExp(`<section[^i]+id="${id}"[^>]*>`);
    return content.replace(regex, () => `<section class="secret${this.revealed ? "" : " revealed"}" id="${id}">`);
  }

  /* -------------------------------------------- */

  /**
   * Add a button that can be used to reveal or hide the secret block.
   */
  #addRevealButton() {
    const button = this.#button = document.createElement("button");
    Object.assign(button, { type: "button", className: "reveal" });
    button.append(game.i18n.localize(`EDITOR.${this.revealed ? "Hide" : "Reveal"}`));
    button.addEventListener("click", this.#onReveal.bind(this));
    this.secret.insertAdjacentElement("afterbegin", button);
  }

  /* -------------------------------------------- */

  /**
   * Handle toggling the hidden/revealed state of the secret block.
   */
  #onReveal() {
    this.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
  }
}

/**
 * A singleton helper class to manage requesting clipboard permissions.
 * Provoides common functionality for working with the clipboard.
 * @see {@link foundry.Game#clipboard}
 */
export default class ClipboardHelper {
  constructor() {
    if ( game.clipboard instanceof this.constructor ) {
      throw new Error("You may not re-initialize the singleton ClipboardHelper. Use game.clipboard instead.");
    }
  }

  /* -------------------------------------------- */

  /**
   * Copies plain text to the clipboard in a cross-browser compatible way.
   * @param {string} text  The text to copy.
   * @returns {Promise<void>}
   */
  async copyPlainText(text) {
    // The clipboard-write permission name is not supported in Firefox.
    try {
      const result = await navigator.permissions.query({name: "clipboard-write"});
      if ( ["granted", "prompt"].includes(result.state) ) {
        return navigator.clipboard.writeText(text);
      }
    } catch(err) {}

    // Fallback to deprecated execCommand here if writeText is not supported in this browser or security context.
    document.addEventListener("copy", event => {
      event.clipboardData.setData("text/plain", text);
      event.preventDefault();
    }, {once: true});
    document.execCommand("copy");
  }
}

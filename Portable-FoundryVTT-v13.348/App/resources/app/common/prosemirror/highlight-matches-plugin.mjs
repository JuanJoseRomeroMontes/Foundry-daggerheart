import ProseMirrorPlugin from "./plugin.mjs";
import {Plugin} from "prosemirror-state";

/**
 * @import {ProseMirrorContentLinkOptions} from "./_types.mjs";
 */

/**
 * A class responsible for handling the display of automated link recommendations when a user highlights text in a
 * ProseMirror editor.
 */
class PossibleMatchesTooltip {

  /**
   * @param {EditorView} view   The editor view.
   */
  constructor(view) {
    this.update(view, null);
  }

  /* -------------------------------------------- */

  /**
   * A reference to any existing tooltip that has been generated as part of a highlight match.
   * @type {HTMLElement}
   */
  tooltip;

  /* -------------------------------------------- */

  /**
   * Update the tooltip based on changes to the selected text.
   * @param {EditorView} view   The editor view.
   * @param {State} lastState   The previous state of the document.
   */
  async update(view, lastState) {
    if ( !game.settings.get("core", "pmHighlightDocumentMatches") ) return;
    const state = view.state;

    // Deactivate tooltip if the document/selection didn't change or is empty
    const stateUnchanged = lastState && (lastState.doc.eq(state.doc) && lastState.selection.eq(state.selection));
    if ( stateUnchanged || state.selection.empty ) return this.#deactivateTooltip();

    const selection = state.selection.content().content;
    const highlighted = selection.textBetween(0, selection.size);

    // If the user selected fewer than a certain amount of characters appropriate for the language, we bail out.
    if ( highlighted.length < CONFIG.i18n.searchMinimumCharacterLength ) return this.#deactivateTooltip();

    // Look for any matches based on the contents of the selection
    let html = this.#findMatches(highlighted);

    // If html is an empty string bail out and deactivate tooltip
    if ( !html ) return this.#deactivateTooltip();

    // Enrich the matches HTML to get proper content links
    html = await foundry.applications.ux.TextEditor.implementation.enrichHTML(html);
    html = html.replace(/data-tooltip="[^"]+"/g, "");

    // In-screen coordinates
    const start = view.coordsAtPos(state.selection.from);

    // Position the tooltip. This needs to be very close to the user's cursor, otherwise the locked tooltip will be
    // immediately dismissed for being too far from the tooltip.
    // TODO: We use the selection endpoints here which works fine for single-line selections, but not multi-line.
    const left = `${(start.left + 3)}px`;
    const bottom = `${window.innerHeight - start.bottom + 25}px`;
    const position = {bottom, left};

    if ( this.tooltip ) this.#updateTooltip(html);
    else this.#createTooltip(position, html, {cssClass: "link-matches"});
  }

  /* -------------------------------------------- */

  /**
   * Create a locked tooltip at the given position.
   * @param {object} position             A position object with coordinates for where the tooltip should be placed
   * @param {string} position.top         Explicit top position for the tooltip
   * @param {string} position.right       Explicit right position for the tooltip
   * @param {string} position.bottom      Explicit bottom position for the tooltip
   * @param {string} position.left        Explicit left position for the tooltip
   * @param {string} text                 Explicit tooltip text or HTML to display.
   * @param {object} [options={}]         Additional options which can override tooltip behavior.
   * @param {string} [options.cssClass]   An optional, space-separated list of CSS classes to apply to the activated
   *                                      tooltip.
   */
  #createTooltip(position, text, options) {
    this.tooltip = game.tooltip.createLockedTooltip(position, text, options);
  }

  /* -------------------------------------------- */

  /**
   * Update the tooltip with new HTML
   * @param {string} html      The HTML to be included in the tooltip
   */
  #updateTooltip(html) {
    this.tooltip.innerHTML = html;
  }

  /* -------------------------------------------- */

  /**
   * Dismiss all locked tooltips and set this tooltip to undefined.
   */
  #deactivateTooltip() {
    if ( !this.tooltip ) return;
    game.tooltip.dismissLockedTooltip(this.tooltip);
    this.tooltip = undefined;
  }

  /* -------------------------------------------- */

  /**
   * Find all Documents in the world/compendia with names that match the selection insensitive to case.
   * @param {string} text      A string which will be matched against document names
   * @returns {string}
   */
  #findMatches(text) {
    let html = "";
    const matches = game.documentIndex.lookup(text.trim(), {ownership: "OBSERVER"});
    for ( const [type, collection] of Object.entries(matches) ) {
      if ( collection.length === 0 ) continue;
      html += `<section><h4>${type}</h4><p>`;
      for ( const document of collection ) {
        html += document.entry?.link ? document.entry.link : `@UUID[${document.uuid}]{${foundry.utils.escapeHTML(document.entry.name)}}`;
      }
      html += "</p></section>";
    }
    return html;
  }
}

/**
 * A ProseMirrorPlugin wrapper around the PossibleMatchesTooltip class.
 */
export default class ProseMirrorHighlightMatchesPlugin extends ProseMirrorPlugin {
  /**
   * @param {Schema} schema                     The ProseMirror schema.
   * @param {ProseMirrorMenuOptions} [options]  Additional options to configure the plugin's behaviour.
   */
  constructor(schema, options={}) {
    super(schema);
    this.options = options;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  static build(schema, options={}) {
    return new Plugin({
      view(editorView) {
        return new PossibleMatchesTooltip(editorView);
      },
      isHighlightMatchesPlugin: true
    });
  }
}

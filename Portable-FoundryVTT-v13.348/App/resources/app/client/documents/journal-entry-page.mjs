import BaseJournalEntryPage from "@common/documents/journal-entry-page.mjs";
import ClientDocumentMixin from "./abstract/client-document.mjs";
import TextEditor from "../applications/ux/text-editor.mjs";

/**
 * @import {JournalEntryPageHeading} from "@client/_types.mjs";
 * @import Note from "@client/canvas/placeables/note.mjs";
 */

/**
 * The client-side JournalEntryPage document which extends the common BaseJournalEntryPage document model.
 * @extends BaseJournalEntryPage
 * @mixes ClientDocumentMixin
 * @category Documents
 *
 * @see {@link foundry.documents.JournalEntry}: The JournalEntry document type which contains
 *   JournalEntryPage embedded documents.
 */
export default class JournalEntryPage extends ClientDocumentMixin(BaseJournalEntryPage) {

  /**
   * The cached table of contents for this JournalEntryPage.
   * @type {Record<string, JournalEntryPageHeading>}
   * @protected
   */
  _toc;

  /* -------------------------------------------- */

  /**
   * The table of contents for this JournalEntryPage.
   * @type {Record<string, JournalEntryPageHeading>}
   */
  get toc() {
    if ( this.type !== "text" ) return {};
    if ( this._toc ) return this._toc;
    const renderTarget = document.createElement("template");
    renderTarget.innerHTML = this.text.content;
    this._toc = this.constructor.buildTOC(Array.from(renderTarget.content.children), {includeElement: false});
    return this._toc;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  get permission() {
    if ( game.user.isGM ) return CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
    return this.getUserLevel(game.user);
  }

  /* -------------------------------------------- */

  /**
   * Return a reference to the Note instance for this Journal Entry Page in the current Scene, if any.
   * If multiple notes are placed for this Journal Entry, only the first will be returned.
   * @type {Note|null}
   */
  get sceneNote() {
    if ( !canvas.ready ) return null;
    return canvas.notes.placeables.find(n => {
      return (n.document.entryId === this.parent.id) && (n.document.pageId === this.id);
    }) || null;
  }

  /* -------------------------------------------- */
  /*  Table of Contents                           */
  /* -------------------------------------------- */

  /**
   * Convert a heading into slug suitable for use as an identifier.
   * @param {HTMLHeadingElement|string} heading  The heading element or some text content.
   * @returns {string}
   */
  static slugifyHeading(heading) {
    if ( heading instanceof HTMLElement ) heading = heading.textContent;
    return heading.slugify().replace(/["']/g, "").substring(0, 64);
  }

  /* -------------------------------------------- */

  /**
   * Build a table of contents for the given HTML content.
   * @param {HTMLElement|HTMLElement[]} html         The HTML content to generate a ToC outline for.
   * @param {object} [options]                       Additional options to configure ToC generation.
   * @param {boolean} [options.includeElement=true]  Include references to the heading DOM elements in the returned ToC.
   * @returns {Record<string, JournalEntryPageHeading>}
   */
  static buildTOC(html, {includeElement=true}={}) {
    // A pseudo root heading element to start at.
    const root = {level: 0, children: []};
    // Perform a depth-first-search down the DOM to locate heading nodes.
    const stack = [root];
    const searchHeadings = element => {
      if ( (element instanceof HTMLHeadingElement) && !("noToc" in element.dataset) ) {
        const node = this._makeHeadingNode(element, {includeElement});
        let parent = stack.at(-1);
        if ( node.level <= parent.level ) {
          stack.pop();
          parent = stack.at(-1);
        }
        parent.children.push(node);
        stack.push(node);
      }
      for ( const child of (element.children || []) ) {
        searchHeadings(child);
      }
    };
    if ( Array.isArray(html) ) html.forEach(searchHeadings);
    else searchHeadings(html);
    return this._flattenTOC(root.children);
  }

  /* -------------------------------------------- */

  /**
   * Flatten the tree structure into a single object with each node's slug as the key.
   * @param {JournalEntryPageHeading[]} nodes  The root ToC nodes.
   * @returns {Record<string, JournalEntryPageHeading>}
   * @protected
   */
  static _flattenTOC(nodes) {
    let order = 0;
    const toc = {};
    const addNode = node => {
      if ( toc[node.slug] ) {
        let i = 1;
        while ( toc[`${node.slug}$${i}`] ) i++;
        node.slug = `${node.slug}$${i}`;
      }
      node.order = order++;
      toc[node.slug] = node;
      return node.slug;
    };
    const flattenNode = node => {
      const slug = addNode(node);
      while ( node.children.length ) {
        if ( typeof node.children[0] === "string" ) break;
        const child = node.children.shift();
        node.children.push(flattenNode(child));
      }
      return slug;
    };
    nodes.forEach(flattenNode);
    return toc;
  }

  /* -------------------------------------------- */

  /**
   * Construct a table of contents node from a heading element.
   * @param {HTMLHeadingElement} heading             The heading element.
   * @param {object} [options]                       Additional options to configure the returned node.
   * @param {boolean} [options.includeElement=true]  Whether to include the DOM element in the returned ToC node.
   * @returns {JournalEntryPageHeading}
   * @protected
   */
  static _makeHeadingNode(heading, {includeElement=true}={}) {
    const node = {
      text: heading.innerText,
      level: Number(heading.tagName[1]),
      slug: heading.id || this.slugifyHeading(heading),
      children: []
    };
    if ( includeElement ) node.element = heading;
    return node;
  }

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _createDocumentLink(eventData, {relativeTo, label}={}) {
    const uuid = relativeTo ? this.getRelativeUUID(relativeTo) : this.uuid;
    if ( eventData.anchor?.slug ) {
      label ??= foundry.utils.escapeHTML(eventData.anchor.name);
      return `@UUID[${uuid}#${eventData.anchor.slug}]{${label}}`;
    }
    return super._createDocumentLink(eventData, {relativeTo, label});
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onClickDocumentLink(event) {
    const target = event.target.closest("a[data-link]");
    return this.parent.sheet.render(true, {pageId: this.id, anchor: target.dataset.hash});
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);
    if ( "text.content" in foundry.utils.flattenObject(changed) ) this._toc = null;
    if ( !canvas.ready ) return;
    if ( ["name", "ownership", "==ownership"].some(k => k in changed) ) {
      canvas.notes.placeables.filter(n => n.page === this).forEach(n => n.draw());
    }
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _buildEmbedHTML(config, options={}) {
    const embed = await super._buildEmbedHTML(config, options);
    if ( !embed ) {
      if ( this.type === "text" ) return this._embedTextPage(config, options);
      else if ( this.type === "image" ) return this._embedImagePage(config, options);
    }
    return embed;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _createFigureEmbed(content, config, options) {
    const figure = await super._createFigureEmbed(content, config, options);
    if ( (this.type === "image") && config.caption && !config.label && this.image.caption ) {
      const caption = figure.querySelector("figcaption > .embed-caption");
      if ( caption ) caption.innerText = this.image.caption;
    }
    return figure;
  }

  /* -------------------------------------------- */

  /**
   * Embed text page content.
   * @param {DocumentHTMLEmbedConfig & EnrichmentOptions} config  Configuration for embedding behavior. This can include
   *                                                              enrichment options to override those passed as part of
   *                                                              the root enrichment process.
   * @param {EnrichmentOptions} [options]     The original enrichment options to propagate to the embedded text page's
   *                                          enrichment.
   * @returns {Promise<HTMLElement|HTMLCollection|null>}
   * @protected
   *
   * @example Embed the content of the Journal Entry Page as a figure.
   * ```@Embed[.yDbDF1ThSfeinh3Y classes="small right"]{Special caption}```
   * becomes
   * ```html
   * <figure class="content-embed small right" data-content-embed
   *         data-uuid="JournalEntry.ekAeXsvXvNL8rKFZ.JournalEntryPage.yDbDF1ThSfeinh3Y">
   *   <p>The contents of the page</p>
   *   <figcaption>
   *     <strong class="embed-caption">Special caption</strong>
   *     <cite>
   *       <a class="content-link" draggable="true" data-link
   *          data-uuid="JournalEntry.ekAeXsvXvNL8rKFZ.JournalEntryPage.yDbDF1ThSfeinh3Y"
   *          data-id="yDbDF1ThSfeinh3Y" data-type="JournalEntryPage" data-tooltip="Text Page">
   *         <i class="fa-solid fa-file-lines"></i> Text Page
   *       </a>
   *     </cite>
   *   <figcaption>
   * </figure>
   * ```
   *
   * @example Embed the content of the Journal Entry Page into the main content flow.
   * ```@Embed[.yDbDF1ThSfeinh3Y inline]```
   * becomes
   * ```html
   * <section class="content-embed" data-content-embed
   *          data-uuid="JournalEntry.ekAeXsvXvNL8rKFZ.JournalEntryPage.yDbDF1ThSfeinh3Y">
   *   <p>The contents of the page</p>
   * </section>
   * ```
   */
  async _embedTextPage(config, options={}) {
    options = { ...options, relativeTo: this };
    const {
      secrets=options.secrets ?? this.isOwner,
      documents=options.documents,
      links=options.links,
      rolls=options.rolls,
      embeds=options.embeds
    } = config;
    foundry.utils.mergeObject(options, { secrets, documents, links, rolls, embeds });
    const enrichedPage = await TextEditor.implementation.enrichHTML(this.text.content, options);
    const container = document.createElement("div");
    container.innerHTML = enrichedPage;
    return container.children;
  }

  /* -------------------------------------------- */

  /**
   * Embed image page content.
   * @param {DocumentHTMLEmbedConfig} config  Configuration for embedding behavior.
   * @param {string} [config.alt]             Alt text for the image, otherwise the caption will be used.
   * @param {EnrichmentOptions} [options]     The original enrichment options for cases where the Document embed content
   *                                          also contains text that must be enriched.
   * @returns {Promise<HTMLElement|HTMLCollection|null>}
   * @protected
   *
   * @example Create an embedded image from a sibling journal entry page.
   * ```@Embed[.QnH8yGIHy4pmFBHR classes="small right"]{Special caption}```
   * becomes
   * ```html
   * <figure class="content-embed small right" data-content-embed
   *         data-uuid="JournalEntry.xFNPjbSEDbWjILNj.JournalEntryPage.QnH8yGIHy4pmFBHR">
   *   <img src="path/to/image.webp" alt="Special caption">
   *   <figcaption>
   *     <strong class="embed-caption">Special caption</strong>
   *     <cite>
   *       <a class="content-link" draggable="true" data-link
   *          data-uuid="JournalEntry.xFNPjbSEDbWjILNj.JournalEntryPage.QnH8yGIHy4pmFBHR"
   *          data-id="QnH8yGIHy4pmFBHR" data-type="JournalEntryPage" data-tooltip="Image Page">
   *         <i class="fa-solid fa-file-image"></i> Image Page
   *       </a>
   *     </cite>
   *   </figcaption>
   * </figure>
   * ```
   */
  async _embedImagePage({ alt, label }, options={}) {
    const img = document.createElement("img");
    img.src = this.src;
    img.alt = alt || label || this.image.caption || this.name;
    return img;
  }
}

import ProseMirrorEditor from "./prosemirror-editor.mjs";
import FilePicker from "../apps/file-picker.mjs";
import Hooks from "@client/helpers/hooks.mjs";
import Roll from "@client/dice/roll.mjs";

/**
 * @import TinyMCE from "tinymce"
 */

/**
 * @typedef EnrichmentOptions
 * @property {boolean} [secrets=false]      Include unrevealed secret tags in the final HTML? If false, unrevealed
 *                                          secret blocks will be removed.
 * @property {boolean} [documents=true]     Replace dynamic document links?
 * @property {boolean} [links=true]         Replace hyperlink content?
 * @property {boolean} [rolls=true]         Replace inline dice rolls?
 * @property {boolean} [embeds=true]        Replace embedded content?
 * @property {boolean} [custom=true]        Apply custom enrichers?
 * @property {object|Function} [rollData]   The data object providing context for inline rolls, or a function that
 *                                          produces it.
 * @property {ClientDocument} [relativeTo]  A document to resolve relative UUIDs against.
 */

/**
 * @typedef EnrichmentAnchorOptions
 * @property {Record<string, string>} [attrs]    Attributes to set on the anchor.
 * @property {Record<string, string>} [dataset]  Data- attributes to set on the anchor.
 * @property {string[]} [classes]                Classes to add to the anchor.
 * @property {string} [name]                     The anchor's content.
 * @property {string} [icon]                     A font-awesome icon class to use as the icon.
 */

/**
 * @typedef TextReplacementOptions
 * @property {boolean} [replaceParent=false]  Hoist the replacement element out of its containing element if it
 *                                            would be the only child of that element.
 */

/**
 * @callback TextContentReplacer
 * @param {RegExpMatchArray} match            The regular expression match.
 * @returns {Promise<HTMLElement>}            The HTML to replace the matched content with.
 */

/**
 * @typedef DocumentHTMLEmbedConfig
 * @property {string[]} values         Any strings that did not have a key name associated with them.
 * @property {string} [classes]        Classes to attach to the outermost element.
 * @property {boolean} [inline=false]  By default Documents are embedded inside a figure element. If this option is
 *                                     passed, the embed content will instead be included as part of the rest of the
 *                                     content flow, but still wrapped in a section tag for styling purposes.
 * @property {boolean} [cite=true]     Whether to include a content link to the original Document as a citation. This
 *                                     options is ignored if the Document is inlined.
 * @property {boolean} [caption=true]  Whether to include a caption. The caption will depend on the Document being
 *                                     embedded, but if an explicit label is provided, that will always be used as the
 *                                     caption. This option is ignored if the Document is inlined.
 * @property {string} [captionPosition="bottom"]  Controls whether the caption is rendered above or below the embedded
 *                                                content.
 * @property {string} [label]          The label.
 */

/**
 * A collection of helper functions and utility methods related to the rich text editor.
 */
export default class TextEditor {

  /**
   * A singleton text area used for HTML decoding.
   * @type {HTMLTextAreaElement}
   */
  static #decoder = document.createElement("textarea");

  /**
   * Create a Rich Text Editor. The current implementation uses TinyMCE
   * @param {object} options                   Configuration options provided to the Editor init
   * @param {string} [options.engine=tinymce]  Which rich text editor engine to use, "tinymce" or "prosemirror". TinyMCE
   *                                           is deprecated and will be removed in a later version.
   * @param {string} content                   Initial HTML or text content to populate the editor with
   * @returns {Promise<TinyMCE.Editor|ProseMirrorEditor>}  The editor instance.
   */
  static async create({engine="tinymce", ...options}={}, content="") {
    if ( engine === "prosemirror" ) {
      const {target, ...rest} = options;
      return ProseMirrorEditor.create(target, content, rest);
    }
    if ( engine === "tinymce" ) {
      const warning = 'The editor engine option of "tinymce" is deprecated and will be removed in V14.'
        + 'Please use "prosemirror" instead.';
      foundry.utils.logCompatibilityWarning(warning, {since: 13, until: 14});
      return this._createTinyMCE(options, content);
    }
    throw new Error(`Provided engine '${engine}' is not a valid TextEditor engine.`);
  }

  /**
   * A list of elements that are retained when truncating HTML.
   * @type {Set<string>}
   */
  static #PARAGRAPH_ELEMENTS = new Set([
    "header", "main", "section", "article", "div", "footer", // Structural Elements
    "h1", "h2", "h3", "h4", "h5", "h6", // Headers
    "p", "blockquote", "summary", "span", "a", "mark", // Text Types
    "strong", "em", "b", "i", "u" // Text Styles
  ]);

  /* -------------------------------------------- */

  /**
   * Create a TinyMCE editor instance.
   * @param {object} [options]           Configuration options passed to the editor.
   * @param {string} [content=""]        Initial HTML or text content to populate the editor with.
   * @returns {Promise<TinyMCE.Editor>}  The TinyMCE editor instance.
   * @protected
   */
  static async _createTinyMCE(options={}, content="") {
    const mceConfig = foundry.utils.mergeObject(CONFIG.TinyMCE, options, {inplace: false});
    mceConfig.target = options.target;

    mceConfig.file_picker_callback = function(pickerCallback, value, meta) {
      const filePicker = new FilePicker.implementation({
        type: "image",
        callback: path => {
          pickerCallback(path);
          // Reset our z-index for next open
          document.querySelector(".tox-tinymce-aux").style.zIndex = "";
        }
      });
      filePicker.render();
      // Set the TinyMCE dialog to be below the FilePicker
      document.querySelector(".tox-tinymce-aux").style.zIndex = Math.min(++foundry.applications.api.ApplicationV2._maxZ, 9999);
    };
    if ( mceConfig.content_css instanceof Array ) {
      mceConfig.content_css = mceConfig.content_css.map(c => foundry.utils.getRoute(c)).join(",");
    }
    mceConfig.init_instance_callback = editor => {
      const window = editor.getWin();
      editor.focus();
      if ( content ) editor.resetContent(content);
      editor.selection.setCursorLocation(editor.getBody(), editor.getBody().childElementCount);
      window.addEventListener("wheel", event => {
        if ( event.ctrlKey ) event.preventDefault();
      }, {passive: false});
      editor.off("drop dragover"); // Remove the default TinyMCE dragdrop handlers.
      editor.on("drop", event => TextEditor.#onDropEditorData(event, editor));
    };
    const [editor] = await tinyMCE.init(mceConfig);
    editor.document = options.document;
    return editor;
  }

  /* -------------------------------------------- */
  /*  HTML Manipulation Helpers                   */
  /* -------------------------------------------- */

  /**
   * Safely decode an HTML string, removing invalid tags and converting entities back to unicode characters.
   * @param {string} html     The original encoded HTML string
   * @returns {string}        The decoded unicode string
   */
  static decodeHTML(html) {
    const d = TextEditor.#decoder;
    d.innerHTML = html;
    const decoded = d.value;
    d.innerHTML = "";
    return decoded;
  }

  /* -------------------------------------------- */

  /**
   * Enrich HTML content by replacing or augmenting components of it
   * @param {string} content                  The original HTML content (as a string)
   * @param {EnrichmentOptions} [options={}]  Additional options which configure how HTML is enriched
   * @returns {Promise<string>}               The enriched HTML content
   */
  static async enrichHTML(content, options={}) {
    if ( this !== CONFIG.ux.TextEditor ) return TextEditor.implementation.enrichHTML(content, options);
    const {secrets=false, documents=true, links=true, embeds=true, rolls=true, custom=true, rollData} = options;
    if ( !content?.length ) return "";

    // Create the HTML element
    const html = document.createElement("div");
    html.innerHTML = String(content || "");

    // Remove unrevealed secret blocks
    if ( !secrets ) html.querySelectorAll("section.secret:not(.revealed)").forEach(secret => secret.remove());

    // Increment embedded content depth recursion counter.
    options = {...options, _embedDepth: (options._embedDepth ?? -1) + 1};

    // Plan text content replacements
    const fns = [];
    if ( documents ) fns.push(this._enrichContentLinks.bind(this));
    if ( links ) fns.push(this._enrichHyperlinks.bind(this));
    if ( rolls ) fns.push(this._enrichInlineRolls.bind(this, rollData));
    if ( embeds ) fns.push(this._enrichEmbeds.bind(this));
    if ( custom ) {
      for ( const config of CONFIG.TextEditor.enrichers ) {
        fns.push(this._applyCustomEnrichers.bind(this, config));
      }
    }

    // Perform enrichment
    let text = TextEditor.#getTextNodes(html);
    await this._primeCompendiums(text, options);

    let updateTextArray = false;
    for ( const fn of fns ) {
      if ( updateTextArray ) text = TextEditor.#getTextNodes(html);
      updateTextArray = await fn(text, options);
    }

    TextEditor.#wrapSecrets(html);
    await this._finalizeEnrichedHTML(html, options);
    return html.innerHTML;
  }

  /* -------------------------------------------- */

  /**
   * Scan for compendium UUIDs and retrieve Documents in batches so that they are in cache when enrichment proceeds.
   * @param {Text[]} text                   The text nodes to scan.
   * @param {EnrichmentOptions} [options]   Options provided to customize text enrichment
   * @protected
   */
  static async _primeCompendiums(text, options={}) {
    // Scan for any UUID that looks like a compendium UUID. This should catch content links as well as UUIDs appearing
    // in embeds.
    const rgx = /Compendium\.[\w-]+\.[^.]+\.[a-zA-Z\d.]+/g;
    const packs = new Map();
    for ( const t of text ) {
      for ( const [uuid] of t.textContent.matchAll(rgx) ) {
        const {collection, documentId} = foundry.utils.parseUuid(uuid) ?? {};
        if ( !collection || collection.has(documentId) ) continue;
        if ( !packs.has(collection) ) packs.set(collection, []);
        packs.get(collection).push(documentId);
      }
    }
    for ( const [pack, ids] of packs.entries() ) {
      await pack.getDocuments({ _id__in: ids });
    }
  }

  /* -------------------------------------------- */

  /**
   * Convert text of the form @UUID[uuid]{name} to anchor elements.
   * @param {Text[]} text                    The existing text content
   * @param {EnrichmentOptions} [options]    Options provided to customize text enrichment
   * @param {Document} [options.relativeTo]  A document to resolve relative UUIDs against.
   * @returns {Promise<boolean>}             Whether any content links were replaced and the text nodes need to be
   *                                         updated.
   * @protected
   */
  static async _enrichContentLinks(text, options={}) {
    const documentTypes = CONST.DOCUMENT_LINK_TYPES.concat(["Compendium", "UUID"]);
    const rgx = new RegExp(`@(${documentTypes.join("|")})\\[([^#\\]]+)(?:#([^\\]]+))?](?:{([^}]+)})?`, "g");
    return this._replaceTextContent(text, rgx, match => this._createContentLink(match, options));
  }

  /* -------------------------------------------- */

  /**
   * Handle embedding Document content with @Embed[uuid]{label} text.
   * @param {Text[]} text                  The existing text content.
   * @param {EnrichmentOptions} [options]  Options provided to customize text enrichment.
   * @returns {Promise<boolean>}           Whether any embeds were replaced and the text nodes need to be updated.
   * @protected
   */
  static async _enrichEmbeds(text, options={}) {
    const rgx = /@Embed\[(?<config>[^\]]+)](?:{(?<label>[^}]+)})?/gi;
    return this._replaceTextContent(text, rgx, match => this._embedContent(match, options),
      {replaceParent: true});
  }

  /* -------------------------------------------- */

  /**
   * Convert URLs into anchor elements.
   * @param {Text[]} text                 The existing text content
   * @param {EnrichmentOptions} [options] Options provided to customize text enrichment
   * @returns {Promise<boolean>}          Whether any hyperlinks were replaced and the text nodes need to be updated
   * @protected
   */
  static async _enrichHyperlinks(text, options={}) {
    const rgx = /(https?:\/\/)(www\.)?([^\s<]+)/gi;
    return this._replaceTextContent(text, rgx, match => this._createHyperlink(match, options));
  }

  /* -------------------------------------------- */

  /**
   * Convert text of the form [[roll]] to anchor elements.
   * @param {object|Function} rollData    The data object providing context for inline rolls.
   * @param {Text[]} text                 The existing text content.
   * @param {EnrichmentOptions} [options] Options provided to customize text enrichment.
   * @returns {Promise<boolean>}          Whether any inline rolls were replaced and the text nodes need to be updated.
   * @protected
   */
  static async _enrichInlineRolls(rollData, text, options={}) {
    rollData = rollData instanceof Function ? rollData() : (rollData || {});
    const rgx = /\[\[(\/[a-zA-Z]+\s)?(.*?)(]{2,3})(?:{([^}]+)})?/gi;
    return this._replaceTextContent(text, rgx, match => this._createInlineRoll(match, rollData, options));
  }

  /* -------------------------------------------- */

  /**
   * Match any custom registered regex patterns and apply their replacements.
   * @param {TextEditorEnricherConfig} config  The custom enricher configuration.
   * @param {Text[]} text                      The existing text content.
   * @param {EnrichmentOptions} [options]      Options provided to customize text enrichment
   * @returns {Promise<boolean>}               Whether any replacements were made, requiring the text nodes to be
   *                                           updated.
   * @protected
   */
  static async _applyCustomEnrichers({id, pattern, enricher, onRender, replaceParent}, text, options) {
    const wrapElement = !!id && (onRender instanceof Function);
    const enrich = async match => {
      let result = await enricher(match, options);
      if ( result && wrapElement ) {
        const wrapCls = foundry.applications.elements.HTMLEnrichedContentElement;
        if ( !(result instanceof wrapCls) ) {
          const wrap = new wrapCls();
          wrap.appendChild(result);
          result = wrap;
        }
        result.setAttribute("enricher", id);
      }
      return result;
    };
    return this._replaceTextContent(text, pattern, enrich, {replaceParent});
  }

  /* -------------------------------------------- */

  /**
   * A method that can be extended by subclasses to perform final post-enrichment operations on an HTML fragment.
   * Final changes should be made in-place, mutating the provided HTML element.
   * Note: This API is experimental and may be removed in later versions without deprecation.
   * @param {HTMLDivElement} html             A div element containing the enriched HTML
   * @param {EnrichmentOptions} options       Provided enrichment options
   * @returns {Promise<void>}                 A promise which resolves once finalization has completed
   * @protected
   * @internal
   */
  static async _finalizeEnrichedHTML(html, options) {}

  /* -------------------------------------------- */

  /**
   * Preview an HTML fragment by constructing a substring of a given length from its inner text.
   * @param {string} content    The raw HTML to preview
   * @param {number} length     The desired length
   * @returns {string}          The previewed HTML
   */
  static previewHTML(content, length=250) {
    let div = document.createElement("div");
    div.innerHTML = content;
    div = this.truncateHTML(div);
    div.innerText = this.truncateText(div.innerText, {maxLength: length});
    return div.innerHTML;
  }

  /* --------------------------------------------- */

  /**
   * Sanitises an HTML fragment and removes any non-paragraph-style text.
   * @param {HTMLElement} html       The root HTML element.
   * @returns {HTMLElement}
   */
  static truncateHTML(html) {
    const truncate = root => {
      for ( const node of root.childNodes ) {
        if ( [Node.COMMENT_NODE, Node.TEXT_NODE].includes(node.nodeType) ) continue;
        if ( node.nodeType === Node.ELEMENT_NODE ) {
          if ( TextEditor.#PARAGRAPH_ELEMENTS.has(node.tagName.toLowerCase()) ) truncate(node);
          else node.remove();
        }
      }
    };

    const clone = html.cloneNode(true);
    truncate(clone);
    return clone;
  }

  /* -------------------------------------------- */

  /**
   * Truncate a fragment of text to a maximum number of characters.
   * @param {string} text           The original text fragment that should be truncated to a maximum length
   * @param {object} [options]      Options which affect the behavior of text truncation
   * @param {number} [options.maxLength]    The maximum allowed length of the truncated string.
   * @param {boolean} [options.splitWords]  Whether to truncate by splitting on white space (if true) or breaking words.
   * @param {string|null} [options.suffix]  A suffix string to append to denote that the text was truncated.
   * @returns {string}              The truncated text string
   */
  static truncateText(text, {maxLength=50, splitWords=true, suffix="…"}={}) {
    if ( text.length <= maxLength ) return text;

    // Split the string (on words if desired)
    let short;
    if ( splitWords ) {
      short = text.slice(0, maxLength + 10);
      while ( short.length > maxLength ) {
        if ( /\s/.test(short) ) short = short.replace(/[\s]+([\S]+)?$/, "");
        else short = short.slice(0, maxLength);
      }
    } else {
      short = text.slice(0, maxLength);
    }

    // Add a suffix and return
    suffix = suffix ?? "";
    return short + suffix;
  }

  /* -------------------------------------------- */

  /**
   * Wrap secrets in a custom element for interactivity handling.
   * @param {HTMLDivElement} html  The post-enriched HTML.
   */
  static #wrapSecrets(html) {
    for ( const secret of html.querySelectorAll("section.secret") ) {
      if ( secret.closest("secret-block, [data-content-embed]") ) continue;
      const block = document.createElement("secret-block");
      secret.replaceWith(block);
      block.append(secret);
    }
  }

  /* -------------------------------------------- */
  /*  Text Node Manipulation                      */
  /* -------------------------------------------- */

  /**
   * Recursively identify the text nodes within a parent HTML node for potential content replacement.
   * @param {HTMLElement} parent    The parent HTML Element
   * @returns {Text[]}              An array of contained Text nodes
   */
  static #getTextNodes(parent) {
    const text = [];
    const walk = document.createTreeWalker(parent, NodeFilter.SHOW_TEXT);
    while ( walk.nextNode() ) text.push(walk.currentNode);
    return text;
  }

  /* -------------------------------------------- */

  /**
   * Facilitate the replacement of text node content using a matching regex rule and a provided replacement function.
   * @param {Text[]} text                       The text nodes to match and replace.
   * @param {RegExp} rgx                        The provided regular expression for matching and replacement
   * @param {TextContentReplacer} func          The replacement function
   * @param {TextReplacementOptions} [options]  Options to configure text replacement behavior.
   * @returns {boolean}                         Whether a replacement was made.
   * @protected
   */
  static async _replaceTextContent(text, rgx, func, options={}) {
    let replaced = false;
    for ( const t of text ) {
      const matches = t.textContent.matchAll(rgx);
      for ( const match of Array.from(matches).reverse() ) {
        let result;
        try {
          result = await func(match);
        } catch(err) {
          Hooks.onError("TextEditor.enrichHTML", err, { log: "error" });
        }
        if ( result ) {
          TextEditor.#replaceTextNode(t, match, result, options);
          replaced = true;
        }
      }
    }
    return replaced;
  }

  /* -------------------------------------------- */

  /**
   * Replace a matched portion of a Text node with a replacement Node
   * @param {Text} text                         The Text node containing the match.
   * @param {RegExpMatchArray} match            The regular expression match.
   * @param {Node} replacement                  The replacement Node.
   * @param {TextReplacementOptions} [options]  Options to configure text replacement behavior.
   */
  static #replaceTextNode(text, match, replacement, {replaceParent=false}={}) {
    let target = text;
    if ( match.index > 0 ) target = text.splitText(match.index);
    if ( match[0].length < target.length ) target.splitText(match[0].length);
    const parent = target.parentElement;
    if ( parent.parentElement && (parent.childNodes.length < 2) && replaceParent ) parent.replaceWith(replacement);
    else target.replaceWith(replacement);
  }

  /* -------------------------------------------- */
  /*  Text Replacement Functions                  */
  /* -------------------------------------------- */

  /**
   * Create a dynamic document link from a regular expression match
   * @param {RegExpMatchArray} match         The regular expression match
   * @param {EnrichmentOptions} [options]    Additional options to configure enrichment behaviour
   * @param {Document} [options.relativeTo]  A document to resolve relative UUIDs against.
   * @returns {Promise<HTMLAnchorElement>}   An HTML element for the document link.
   * @protected
   */
  static async _createContentLink(match, {relativeTo}={}) {
    const [type, target, hash, name] = match.slice(1, 5);

    // Prepare replacement data
    const data = {
      classes: ["content-link"],
      attrs: { draggable: "true" },
      dataset: { link: "" },
      name
    };

    let doc;
    let broken = false;
    if ( type === "UUID" ) {
      Object.assign(data.dataset, {link: "", uuid: target});
      doc = await foundry.utils.fromUuid(target, {relative: relativeTo});
    }
    else broken = TextEditor.#createLegacyContentLink(type, target, name, data);

    if ( doc ) {
      if ( doc.documentName ) return doc.toAnchor({ name: data.name, dataset: { hash } });
      data.name = data.name || doc.name || target;
      const type = game.packs.get(doc.pack)?.documentName;
      Object.assign(data.dataset, {type, id: doc._id, pack: doc.pack});
      if ( hash ) data.dataset.hash = hash;
      data.icon = CONFIG[type].sidebarIcon;
    }

    // The UUID lookup failed so this is a broken link.
    else if ( type === "UUID" ) broken = true;

    // Broken links
    if ( broken ) {
      delete data.dataset.link;
      delete data.attrs.draggable;
      data.icon = "fa-solid fa-link-slash";
      data.classes.push("broken");
    }
    return this.createAnchor(data);
  }

  /* -------------------------------------------- */

  /**
   * Helper method to create an anchor element.
   * @param {Partial<EnrichmentAnchorOptions>} [options]  Options to configure the anchor's construction.
   * @returns {HTMLAnchorElement}
   */
  static createAnchor({ attrs={}, dataset={}, classes=[], name, icon }={}) {
    name ??= game.i18n.localize("Unknown");
    const a = document.createElement("a");
    a.classList.add(...classes);
    for ( const [k, v] of Object.entries(attrs) ) {
      if ( (v !== null) && (v !== undefined) ) a.setAttribute(k, v);
    }
    for ( const [k, v] of Object.entries(dataset) ) {
      if ( (v !== null) && (v !== undefined) ) a.dataset[k] = v;
    }
    if ( icon ) {
      const i = document.createElement("i");
      i.className = icon;
      i.inert = true;
      a.append(i);
    }
    a.append(name);
    return a;
  }

  /* -------------------------------------------- */

  /**
   * Embed content from another Document.
   * @param {RegExpMatchArray} match         The regular expression match.
   * @param {EnrichmentOptions} [options]    Options provided to customize text enrichment.
   * @returns {Promise<HTMLElement|null>}    A representation of the Document as HTML content, or null if the Document
   *                                         could not be embedded.
   * @protected
   */
  static async _embedContent(match, options={}) {
    if ( options._embedDepth > CONST.TEXT_ENRICH_EMBED_MAX_DEPTH ) {
      console.warn(`Nested Document embedding is restricted to a maximum depth of ${CONST.TEXT_ENRICH_EMBED_MAX_DEPTH}.`
        + ` ${match.input} cannot be fully enriched.`);
      return null;
    }

    const { label } = match.groups;
    const config = this._parseEmbedConfig(match.groups.config, { relative: options.relativeTo });
    const doc = await foundry.utils.fromUuid(config.uuid, { relative: options.relativeTo });
    if ( doc ) return doc.toEmbed({ label, ...config }, options);

    const broken = document.createElement("p");
    broken.classList.add("broken", "content-embed");
    const i = document.createElement("i");
    i.classList.add("fa-solid", "fa-circle-exclamation");
    i.inert = true;
    broken.append(i, game.i18n.format("EDITOR.EmbedFailed", { uuid: config.uuid }));
    return broken;
  }

  /* -------------------------------------------- */

  /**
   * Parse the embed configuration to be passed to ClientDocument#toEmbed.
   * The return value will be an object of any key=value pairs included with the configuration, as well as a separate
   * values property that contains all the options supplied that were not in key=value format.
   * If a uuid key is supplied it is used as the Document's UUID, otherwise the first supplied UUID is used.
   * @param {string} raw        The raw matched config string.
   * @param {object} [options]  Options forwarded to parseUuid.
   * @returns {DocumentHTMLEmbedConfig}
   * @protected
   *
   * @example Example configurations.
   * ```js
   * TextEditor._parseEmbedConfig('uuid=Actor.xyz caption="Example Caption" cite=false');
   * // Returns: { uuid: "Actor.xyz", caption: "Example Caption", cite: false, values: [] }
   *
   * TextEditor._parseEmbedConfig('Actor.xyz caption="Example Caption" inline');
   * // Returns: { uuid: "Actor.xyz", caption: "Example Caption", values: ["inline"] }
   * ```
   */
  static _parseEmbedConfig(raw, options={}) {
    const config = { values: [] };
    for ( const part of raw.match(/(?:[^\s"]+|"[^"]*")+/g) ) {
      if ( !part ) continue;
      const [key, value] = part.split("=");
      const valueLower = value?.toLowerCase();
      if ( value === undefined ) config.values.push(key.replace(/(^"|"$)/g, ""));
      else if ( (valueLower === "true") || (valueLower === "false") ) config[key] = valueLower === "true";
      else if ( Number.isNumeric(value) ) config[key] = Number(value);
      else config[key] = value.replace(/(^"|"$)/g, "");
    }

    // Handle default embed configuration options.
    if ( !("cite" in config) ) config.cite = true;
    if ( !("caption" in config) ) config.caption = true;
    if ( !("inline" in config) ) {
      const idx = config.values.indexOf("inline");
      if ( idx > -1 ) {
        config.inline = true;
        config.values.splice(idx, 1);
      }
    }
    if ( !config.uuid ) {
      for ( const [i, value] of config.values.entries() ) {
        try {
          const parsed = foundry.utils.parseUuid(value, options);
          if ( parsed?.documentId ) {
            config.uuid = value;
            config.values.splice(i, 1);
            break;
          }
        } catch{}
      }
    }
    return config;
  }

  /* -------------------------------------------- */

  /**
   * Create a dynamic document link from an old-form document link expression.
   * @param {string} type    The matched document type, or "Compendium".
   * @param {string} target  The requested match target (_id or name).
   * @param {string} name    A customized or overridden display name for the link.
   * @param {object} data    Data containing the properties of the resulting link element.
   * @returns {boolean}      Whether the resulting link is broken or not.
   */
  static #createLegacyContentLink(type, target, name, data) {
    let broken = false;

    // Get a matched World document
    if ( CONST.WORLD_DOCUMENT_TYPES.includes(type) ) {

      // Get the linked Document
      const config = CONFIG[type];
      const collection = game.collections.get(type);
      const document = foundry.data.validators.isValidId(target) ? collection.get(target) : collection.getName(target);
      if ( !document ) broken = true;

      // Update link data
      data.name = data.name || (broken ? target : document.name);
      data.icon = config.sidebarIcon;
      Object.assign(data.dataset, {type, uuid: document?.uuid});
    }

    // Get a matched PlaylistSound
    else if ( type === "PlaylistSound" ) {
      const [, playlistId, , soundId] = target.split(".");
      const playlist = game.playlists.get(playlistId);
      const sound = playlist?.sounds.get(soundId);
      if ( !playlist || !sound ) broken = true;

      data.name = data.name || (broken ? target : sound.name);
      data.icon = CONFIG.Playlist.sidebarIcon;
      Object.assign(data.dataset, {type, uuid: sound?.uuid});
      if ( sound?.playing ) data.cls.push("playing");
      if ( !game.user.isGM ) data.cls.push("disabled");
    }

    // Get a matched Compendium document
    else if ( type === "Compendium" ) {

      // Get the linked Document
      const {collection: pack, id} = foundry.utils.parseUuid(`Compendium.${target}`) ?? {};
      if ( id && pack ) {
        Object.assign(data.dataset, {pack: pack.collection, uuid: pack.getUuid(id)});
        data.icon = CONFIG[pack.documentName].sidebarIcon;

        // If the pack is indexed, retrieve the data
        if ( pack.index.size ) {
          const index = pack.index.find(i => (i._id === id) || (i.name === id));
          if ( index ) {
            if ( !data.name ) data.name = index.name;
            data.dataset.id = index._id;
            data.dataset.uuid = index.uuid;
          }
          else broken = true;
        }

        // Otherwise assume the link may be valid, since the pack has not been indexed yet
        if ( !data.name ) data.name = data.dataset.lookup = id;
      }
      else broken = true;
    }
    return broken;
  }

  /* -------------------------------------------- */

  /**
   * Replace a hyperlink-like string with an actual HTML &lt;a> tag
   * @param {RegExpMatchArray} match        The regular expression match
   * @param {EnrichmentOptions} [options]   Options provided to customize text enrichment
   * @returns {Promise<HTMLAnchorElement>}  An HTML element for the document link
   * @protected
   */
  static async _createHyperlink(match, options={}) {
    const href = match[0];
    const a = document.createElement("a");
    a.classList.add("hyperlink");
    a.href = a.textContent = href;
    a.target = "_blank";
    a.rel = "nofollow noopener";
    return a;
  }

  /* -------------------------------------------- */

  /**
   * Replace an inline roll formula with a rollable &lt;a> element or an eagerly evaluated roll result
   * @param {RegExpMatchArray} match             The regular expression match array
   * @param {object} rollData                    Provided roll data for use in roll evaluation
   * @param {EnrichmentOptions} [options]        Options provided to customize text enrichment.
   * @returns {Promise<HTMLAnchorElement|null>}  The replaced match. Returns null if the contained command is not a
   *                                             valid roll expression.
   * @protected
   */
  static async _createInlineRoll(match, rollData, options={}) {
    let [command, formula, closing, label] = match.slice(1, 5);
    const rollCls = Roll.defaultImplementation;

    // Handle the possibility of the roll formula ending with a closing bracket
    if ( closing.length === 3 ) formula += "]";

    // If the tag does not contain a command, it may only be an eagerly-evaluated inline roll
    if ( !command ) {
      if ( !rollCls.validate(formula) ) return null;
      try {
        const anchorOptions = {classes: ["inline-roll", "inline-result"], dataset: {tooltip: formula}, label};
        const roll = await rollCls.create(formula, rollData).evaluate({ allowInteractive: false });
        return roll.toAnchor(anchorOptions);
      }
      catch(err) { return null; }
    }

    // Otherwise verify that the tag contains a valid roll command
    const chatCommand = `${command}${formula}`;
    const ChatLog = foundry.applications.sidebar.tabs.ChatLog;
    let parsedCommand = null;
    try {
      parsedCommand = ChatLog.parse(chatCommand);
    }
    catch(err) { return null; }
    const [cmd, matches] = parsedCommand;
    if ( !["roll", "gmroll", "blindroll", "selfroll", "publicroll"].includes(cmd) ) return null;

    // Extract components of the matched command
    const matchedCommand = ChatLog.MULTILINE_COMMANDS.has(cmd) ? matches.pop() : matches;
    const matchedFormula = rollCls.replaceFormulaData(matchedCommand[2].trim(), rollData || {});
    const matchedFlavor = matchedCommand[3]?.trim();

    // Construct the deferred roll element
    const a = document.createElement("a");
    a.classList.add("inline-roll", parsedCommand[0]);
    a.dataset.mode = parsedCommand[0];
    a.dataset.flavor = matchedFlavor ?? label ?? "";
    a.dataset.formula = matchedFormula;
    a.dataset.tooltipText = formula;
    const i = document.createElement("i");
    i.classList.add("fa-solid", "fa-dice-d20");
    i.inert = true;
    a.append(i, label || matchedFormula);
    return a;
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /**
   * Activate interaction listeners for the interior content of the editor frame.
   */
  static activateListeners() {
    document.body.addEventListener("click", event => {
      if ( event.target?.closest("a[data-link]") ) TextEditor.#onClickContentLink(event);
      if ( event.target?.closest("a.inline-roll") ) this._onClickInlineRoll(event);
    });
    document.body.addEventListener("dragstart", event => {
      if ( event.target?.closest("a[data-link]") ) TextEditor.#onDragContentLink(event);
    });
  }

  /* -------------------------------------------- */

  /**
   * Handle click events on Document Links
   * @param {Event} event
   */
  static async #onClickContentLink(event) {
    event.preventDefault();
    const doc = await foundry.utils.fromUuid(event.target.closest("a[data-link]").dataset.uuid);
    return doc?._onClickDocumentLink(event);
  }

  /* -------------------------------------------- */

  /**
   * Handle left-mouse clicks on an inline roll, dispatching the formula or displaying the tooltip
   * @param {MouseEvent} event    The initiating click event
   * @protected
   */
  static async _onClickInlineRoll(event) {
    event.preventDefault();
    const a = event.target.closest("a.inline-roll");

    // For inline results expand or collapse the roll details
    if ( a.classList.contains("inline-result") ) {
      if ( a.classList.contains("expanded") ) {
        return Roll.defaultImplementation.collapseInlineResult(a);
      } else {
        return Roll.defaultImplementation.expandInlineResult(a);
      }
    }

    // Get the current speaker
    const cls = foundry.utils.getDocumentClass("ChatMessage");
    const speaker = cls.getSpeaker();
    const actor = cls.getSpeakerActor(speaker);
    let rollData = actor ? actor.getRollData() : {};

    // Obtain roll data from the contained sheet, if the inline roll is within an Actor or Item sheet
    const sheet = a.closest(".sheet");
    if ( sheet ) {
      const app = ui.windows[sheet.dataset.appid] ?? foundry.applications.instances.get(sheet.id);
      if ( ["Actor", "Item"].includes(app?.document?.documentName) ) rollData = app.document.getRollData();
    }

    // Execute a deferred roll
    const roll = Roll.create(a.dataset.formula, rollData);
    return roll.toMessage({flavor: a.dataset.flavor, speaker}, {rollMode: a.dataset.mode});
  }

  /* -------------------------------------------- */

  /**
   * Begin a Drag+Drop workflow for a dynamic content link
   * @param {Event} event   The originating drag event
   */
  static #onDragContentLink(event) {
    event.stopPropagation();
    const a = event.target.closest("a[data-link]");
    let dragData = null;

    // Case 1 - Compendium Link
    if ( a.dataset.pack ) {
      const pack = game.packs.get(a.dataset.pack);
      let id = a.dataset.id;
      if ( a.dataset.lookup && pack.index.size ) {
        const entry = pack.index.find(i => (i._id === a.dataset.lookup) || (i.name === a.dataset.lookup));
        if ( entry ) id = entry._id;
      }
      if ( !a.dataset.uuid && !id ) return false;
      const uuid = a.dataset.uuid || pack.getUuid(id);
      dragData = { type: a.dataset.type || pack.documentName, uuid };
    }

    // Case 2 - World Document Link
    else {
      const doc = foundry.utils.fromUuidSync(a.dataset.uuid);
      dragData = doc.toDragData();
    }

    event.dataTransfer.setData("text/plain", JSON.stringify(dragData));
  }

  /* -------------------------------------------- */

  /**
   * Handle dropping of transferred data onto the active rich text editor
   * @param {DragEvent} event     The originating drop event which triggered the data transfer
   * @param {TinyMCE} editor      The TinyMCE editor instance being dropped on
   */
  static async #onDropEditorData(event, editor) {
    event.preventDefault();
    const eventData = TextEditor.implementation.getDragEventData(event);
    const link = await TextEditor.implementation.getContentLink(eventData, {relativeTo: editor.document});
    if ( link ) editor.insertContent(link);
  }

  /* -------------------------------------------- */

  /**
   * Extract JSON data from a drag/drop event.
   * @param {DragEvent} event       The drag event which contains JSON data.
   * @returns {object}              The extracted JSON data. The object will be empty if the DragEvent did not contain
   *                                JSON-parseable data.
   */
  static getDragEventData(event) {
    if ( !("dataTransfer" in event) ) {  // Clumsy because (event instanceof DragEvent) doesn't work
      console.warn("Incorrectly attempted to process drag event data for an event which was not a DragEvent.");
      return {};
    }
    try {
      return JSON.parse(event.dataTransfer.getData("text/plain"));
    } catch(err) {
      return {};
    }
  }

  /* -------------------------------------------- */

  /**
   * Given a Drop event, returns a Content link if possible such as "@Actor[ABC123]", else `null`
   * @param {object} eventData                     The parsed object of data provided by the transfer event
   * @param {object} [options]                     Additional options to configure link creation.
   * @param {ClientDocument} [options.relativeTo]  A document to generate the link relative to.
   * @param {string} [options.label]               A custom label to use instead of the document's name.
   * @returns {Promise<string|null>}
   */
  static async getContentLink(eventData, options={}) {
    const cls = foundry.utils.getDocumentClass(eventData.type);
    if ( !cls ) return null;
    const document = await cls.fromDropData(eventData);
    if ( !document ) return null;
    return document._createDocumentLink(eventData, options);
  }

  /* -------------------------------------------- */

  /**
   * Upload an image to a document's asset path.
   * @param {string} uuid        The document's UUID.
   * @param {File} file          The image file to upload.
   * @returns {Promise<string|void>} The path to the uploaded image.
   * @internal
   */
  static async _uploadImage(uuid, file) {
    if ( !game.user.hasPermission("FILES_UPLOAD") ) {
      ui.notifications.error("EDITOR.NoUploadPermission", {localize: true});
      return;
    }

    ui.notifications.info("EDITOR.UploadingFile", {localize: true});
    const response = await FilePicker.upload(null, null, file, {uuid});
    return response?.path;
  }

  /* -------------------------------------------- */
  /*  Factory Methods                             */
  /* -------------------------------------------- */

  /**
   * Retrieve the configured TextEditor implementation.
   * @type {typeof TextEditor}
   */
  static get implementation() {
    if ( !foundry.utils.isSubclass(CONFIG.ux.TextEditor, TextEditor) ) {
      console.warn("Configured TextEditor override must be a subclass of TextEditor.");
      CONFIG.ux.TextEditor = TextEditor;
    }
    return CONFIG.ux.TextEditor;
  }
}

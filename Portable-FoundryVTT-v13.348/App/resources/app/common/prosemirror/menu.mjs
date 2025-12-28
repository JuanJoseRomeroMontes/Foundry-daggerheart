import {Plugin, TextSelection} from "prosemirror-state";
import {autoJoin, toggleMark, wrapIn} from "prosemirror-commands";
import {liftTarget} from "prosemirror-transform";
import ProseMirrorPlugin from "./plugin.mjs";
import {wrapInList} from "prosemirror-schema-list";
import ProseMirrorDropDown from "./dropdown.mjs";
import {
  addColumnAfter, addColumnBefore, deleteColumn, addRowAfter, addRowBefore, deleteRow, mergeCells, splitCell,
  deleteTable
} from "prosemirror-tables";

/**
 * @import {Schema} from "prosemirror-model"
 * @import {EditorView} from "prosemirror-view"
 * @import {MenuToggleBlockWrapCommand, ProseMirrorContentLinkOptions, ProseMirrorDropDownConfig,
 *   ProseMirrorMenuItem, ProseMirrorMenuOptions} from "./_types.mjs"
 */

/**
 * A class responsible for building a menu for a ProseMirror instance.
 * @extends {ProseMirrorPlugin}
 */
export default class ProseMirrorMenu extends ProseMirrorPlugin {

  /**
   * @param {Schema} schema                     The ProseMirror schema to build a menu for.
   * @param {EditorView} view                   The editor view.
   * @param {ProseMirrorMenuOptions} [options]  Additional options to configure the plugin's behaviour.
   */
  constructor(schema, view, options={}) {
    super(schema);
    this.options = options;

    /**
     * The editor view.
     * @type {EditorView}
     */
    Object.defineProperty(this, "view", {value: view});

    /**
     * The items configured for this menu.
     * @type {ProseMirrorMenuItem[]}
     */
    Object.defineProperty(this, "items", {value: this._getMenuItems()});

    /**
     * The ID of the menu element in the DOM.
     * @type {string}
     */
    Object.defineProperty(this, "id", {value: `prosemirror-menu-${foundry.utils.randomID()}`, writable: false});

    this._createDropDowns();
    this._wrapEditor();
  }

  /* -------------------------------------------- */

  /**
   * An enumeration of editor scopes in which a menu item can appear
   * @enum {string}
   * @protected
   */
  static _MENU_ITEM_SCOPES = {
    BOTH: "",
    TEXT: "text",
    HTML: "html"
  };

  /* -------------------------------------------- */

  /**
   * Additional options to configure the plugin's behaviour.
   * @type {ProseMirrorMenuOptions}
   */
  options;

  /* -------------------------------------------- */

  /**
   * An HTML element that we write HTML to before injecting it into the DOM.
   * @type {HTMLTemplateElement}
   */
  #renderTarget = document.createElement("template");

  /* -------------------------------------------- */

  /**
   * Track whether we are currently in a state of editing the HTML source.
   * @type {boolean}
   */
  get editingSource() {
    return this.#editingSource;
  }

  #editingSource = false;

  /* -------------------------------------------- */

  /** @inheritdoc */
  static build(schema, options={}) {
    return new Plugin({
      view: editorView => {
        return new this(schema, editorView, options).render();
      }
    });
  }

  /* -------------------------------------------- */

  /**
   * Render the menu's HTML.
   * @returns {ProseMirrorMenu}
   */
  render() {
    const scopes = this.constructor._MENU_ITEM_SCOPES;
    const scopeKey = this.editingSource ? "HTML" : "TEXT";

    // Dropdown Menus
    const dropdowns = this.dropdowns.map(d => `<li class="text">${d.render()}</li>`);

    // Button items
    const buttons = this.items.reduce((buttons, item) => {
      if ( ![scopes.BOTH, scopes[scopeKey]].includes(item.scope) ) return buttons;
      const li = document.createElement("li");
      if ( item.active ) li.classList.add("active");
      if ( item.cssClass ) li.classList.add(...item.cssClass.split(/ +/));
      if ( item.scope ) li.classList.add(item.scope);
      const button = document.createElement("button");
      button.type = "button";
      if ( item.active ) button.classList.add("active");
      button.dataset.tooltip = item.title;
      button.dataset.action = item.action;
      button.innerHTML = item.icon;
      li.append(button);
      buttons.push(li.outerHTML);
      return buttons;
    }, []);

    // Add collaboration indicator.
    const collaborating = document.getElementById(this.id)?.querySelector(".concurrent-users");
    const tooltip = collaborating?.dataset.tooltipText || game.i18n.localize("EDITOR.CollaboratingUsers");
    buttons.push(`
      <li class="concurrent-users" data-tooltip-text="${foundry.utils.escapeHTML(tooltip)}">
        ${collaborating?.innerHTML || ""}
      </li>
    `);

    // Replace Menu HTML
    this.#renderTarget.innerHTML = `
      <menu class="editor-menu" id="${this.id}">
        ${dropdowns.join("")}
        ${buttons.join("")}
      </menu>
    `;
    document.getElementById(this.id).replaceWith(this.#renderTarget.content.getElementById(this.id));
    if ( !this.view.editable ) document.getElementById(this.id).querySelectorAll("button").forEach(b => b.disabled = true);

    // Toggle source editing state for the parent
    const editor = this.view.dom.closest(".editor");
    editor.classList.toggle("editing-source", this.editingSource);

    // Menu interactivity
    this.activateListeners(document.getElementById(this.id));
    return this;
  }

  /* -------------------------------------------- */

  /**
   * Attach event listeners.
   * @param {HTMLMenuElement} html  The root menu element.
   */
  activateListeners(html) {
    html.querySelectorAll("button[data-action]").forEach(button => button.onclick = evt => this._onAction(evt));
    this.dropdowns.map(d => d.activateListeners(html));
  }

  /* -------------------------------------------- */

  /**
   * Called whenever the view's state is updated.
   * @param {EditorView} view       The current editor state.
   * @param {EditorView} prevState  The previous editor state.
   */
  update(view, prevState) {
    this.dropdowns.forEach(d => d.forEachItem(item => {
      item.active = this._isItemActive(item);
    }));
    this.items.forEach(item => item.active = this._isItemActive(item));
    this.render();
  }

  /* -------------------------------------------- */

  /**
   * Called when the view is destroyed or receives a state with different plugins.
   */
  destroy() {
    const menu = this.view.dom.closest(".editor").querySelector("menu");
    menu.nextElementSibling.remove();
    menu.remove();
  }

  /* -------------------------------------------- */

  /**
   * Instantiate the ProseMirrorDropDown instances and configure them with the defined menu items.
   * @protected
   */
  _createDropDowns() {
    const dropdowns = Object.values(this._getDropDownMenus()).map(({title, cssClass, icon, entries}) => {
      return new ProseMirrorDropDown(title, entries, { cssClass, icon, onAction: this._onAction.bind(this) });
    });

    /**
     * The dropdowns configured for this menu.
     * @type {ProseMirrorDropDown[]}
     */
    Object.defineProperty(this, "dropdowns", {value: dropdowns});
  }

  /* -------------------------------------------- */

  /**
   * Configure dropdowns for this menu. Each entry in the top-level array corresponds to a separate drop-down.
   * @returns {Record<string, ProseMirrorDropDownConfig>}
   * @protected
   */
  _getDropDownMenus() {
    const menus = {
      format: {
        title: "EDITOR.Format",
        cssClass: "format",
        entries: [
          {
            action: "block",
            title: "EDITOR.Block",
            children: [{
              action: "paragraph",
              title: "EDITOR.Paragraph",
              priority: 3,
              node: this.schema.nodes.paragraph
            }, {
              action: "blockquote",
              title: "EDITOR.Blockquote",
              priority: 1,
              node: this.schema.nodes.blockquote,
              cmd: () => this._toggleBlock(this.schema.nodes.blockquote, wrapIn)
            }, {
              action: "code-block",
              title: "EDITOR.CodeBlock",
              priority: 1,
              node: this.schema.nodes.code_block,
              cmd: () => this._toggleTextBlock(this.schema.nodes.code_block)
            }, {
              action: "secret",
              title: "EDITOR.Secret",
              priority: 1,
              node: this.schema.nodes.secret,
              cmd: () => {
                this._toggleBlock(this.schema.nodes.secret, wrapIn, {
                  attrs: {
                    id: `secret-${foundry.utils.randomID()}`
                  }
                });
              }
            }]
          }, {
            action: "inline",
            title: "EDITOR.Inline",
            children: [{
              action: "bold",
              title: "EDITOR.Bold",
              priority: 2,
              style: "font-weight: bold;",
              mark: this.schema.marks.strong,
              cmd: toggleMark(this.schema.marks.strong)
            }, {
              action: "italic",
              title: "EDITOR.Italic",
              priority: 2,
              style: "font-style: italic;",
              mark: this.schema.marks.em,
              cmd: toggleMark(this.schema.marks.em)
            }, {
              action: "code",
              title: "EDITOR.Code",
              priority: 2,
              style: "font-family: monospace;",
              mark: this.schema.marks.code,
              cmd: toggleMark(this.schema.marks.code)
            }, {
              action: "underline",
              title: "EDITOR.Underline",
              priority: 2,
              style: "text-decoration: underline;",
              mark: this.schema.marks.underline,
              cmd: toggleMark(this.schema.marks.underline)
            }, {
              action: "strikethrough",
              title: "EDITOR.Strikethrough",
              priority: 2,
              style: "text-decoration: line-through;",
              mark: this.schema.marks.strikethrough,
              cmd: toggleMark(this.schema.marks.strikethrough)
            }, {
              action: "superscript",
              title: "EDITOR.Superscript",
              priority: 2,
              mark: this.schema.marks.superscript,
              cmd: toggleMark(this.schema.marks.superscript)
            }, {
              action: "subscript",
              title: "EDITOR.Subscript",
              priority: 2,
              mark: this.schema.marks.subscript,
              cmd: toggleMark(this.schema.marks.subscript)
            }]
          }, {
            action: "alignment",
            title: "EDITOR.Alignment",
            children: [{
              action: "align-left",
              title: "EDITOR.AlignmentLeft",
              priority: 4,
              node: this.schema.nodes.paragraph,
              attrs: {alignment: "left"},
              cmd: () => this.#toggleAlignment("left")
            }, {
              action: "align-center",
              title: "EDITOR.AlignmentCenter",
              priority: 4,
              node: this.schema.nodes.paragraph,
              attrs: {alignment: "center"},
              cmd: () => this.#toggleAlignment("center")
            }, {
              action: "align-justify",
              title: "EDITOR.AlignmentJustify",
              priority: 4,
              node: this.schema.nodes.paragraph,
              attrs: {alignment: "justify"},
              cmd: () => this.#toggleAlignment("justify")
            }, {
              action: "align-right",
              title: "EDITOR.AlignmentRight",
              priority: 4,
              node: this.schema.nodes.paragraph,
              attrs: {alignment: "right"},
              cmd: () => this.#toggleAlignment("right")
            }]
          }
        ]
      }
    };

    const headings = Array.fromRange(6, 1).map(level => ({
      action: `h${level}`,
      title: game.i18n.format("EDITOR.Heading", {level}),
      priority: 1,
      class: `level${level}`,
      node: this.schema.nodes.heading,
      attrs: {level},
      cmd: () => this._toggleTextBlock(this.schema.nodes.heading, {attrs: {level}})
    }));

    menus.format.entries.unshift({
      action: "headings",
      title: "EDITOR.Headings",
      children: headings
    });

    const fonts = foundry.applications.settings.menus.FontConfig.getAvailableFonts().sort().map(family => ({
      action: `font-family-${family.slugify()}`,
      title: family,
      priority: 2,
      style: `font-family: '${family}';`,
      mark: this.schema.marks.font,
      attrs: {family},
      cmd: toggleMark(this.schema.marks.font, {family})
    }));

    if ( this.options.compact ) {
      menus.format.entries.push({
        action: "fonts",
        title: "EDITOR.Font",
        children: fonts
      });
    } else {
      menus.fonts = {
        title: "EDITOR.Font",
        cssClass: "fonts",
        entries: fonts
      };
    }

    menus.table = {
      title: "EDITOR.Table",
      cssClass: "tables",
      icon: '<i class="fa-solid fa-table fa-fw"></i>',
      entries: [{
        action: "insert-table",
        title: "EDITOR.TableInsert",
        group: 1,
        cmd: this._insertTablePrompt.bind(this)
      }, {
        action: "delete-table",
        title: "EDITOR.TableDelete",
        group: 1,
        cmd: deleteTable
      }, {
        action: "add-col-after",
        title: "EDITOR.TableAddColumnAfter",
        group: 2,
        cmd: addColumnAfter
      }, {
        action: "add-col-before",
        title: "EDITOR.TableAddColumnBefore",
        group: 2,
        cmd: addColumnBefore
      }, {
        action: "delete-col",
        title: "EDITOR.TableDeleteColumn",
        group: 2,
        cmd: deleteColumn
      }, {
        action: "add-row-after",
        title: "EDITOR.TableAddRowAfter",
        group: 3,
        cmd: addRowAfter
      }, {
        action: "add-row-before",
        title: "EDITOR.TableAddRowBefore",
        group: 3,
        cmd: addRowBefore
      }, {
        action: "delete-row",
        title: "EDITOR.TableDeleteRow",
        group: 3,
        cmd: deleteRow
      }, {
        action: "merge-cells",
        title: "EDITOR.TableMergeCells",
        group: 4,
        cmd: mergeCells
      }, {
        action: "split-cell",
        title: "EDITOR.TableSplitCell",
        group: 4,
        cmd: splitCell
      }]
    };

    Hooks.callAll("getProseMirrorMenuDropDowns", this, menus);
    return menus;
  }

  /* -------------------------------------------- */

  /**
   * Configure the items for this menu.
   * @returns {ProseMirrorMenuItem[]}
   * @protected
   */
  _getMenuItems() {
    const scopes = this.constructor._MENU_ITEM_SCOPES;
    const items = [
      {
        action: "bullet-list",
        title: "EDITOR.BulletList",
        icon: '<i class="fa-solid fa-list-ul fa-fw"></i>',
        node: this.schema.nodes.bullet_list,
        scope: scopes.TEXT,
        cmd: () => this._toggleBlock(this.schema.nodes.bullet_list, wrapInList)
      },
      {
        action: "number-list",
        title: "EDITOR.NumberList",
        icon: '<i class="fa-solid fa-list-ol fa-fw"></i>',
        node: this.schema.nodes.ordered_list,
        scope: scopes.TEXT,
        cmd: () => this._toggleBlock(this.schema.nodes.ordered_list, wrapInList)
      },
      {
        action: "horizontal-rule",
        title: "EDITOR.HorizontalRule",
        icon: '<i class="fa-solid fa-horizontal-rule fa-fw"></i>',
        scope: scopes.TEXT,
        cmd: this.#insertHorizontalRule.bind(this)
      },
      {
        action: "image",
        title: "EDITOR.InsertImage",
        icon: '<i class="fa-solid fa-image fa-fw"></i>',
        scope: scopes.TEXT,
        node: this.schema.nodes.image,
        cmd: this._insertImagePrompt.bind(this)
      },
      {
        action: "link",
        title: "EDITOR.Link",
        icon: '<i class="fa-solid fa-link fa-fw"></i>',
        scope: scopes.TEXT,
        mark: this.schema.marks.link,
        cmd: this._insertLinkPrompt.bind(this)
      },
      {
        action: "clear-formatting",
        title: "EDITOR.ClearFormatting",
        icon: '<i class="fa-solid fa-text-slash fa-fw"></i>',
        scope: scopes.TEXT,
        cmd: this._clearFormatting.bind(this)
      },
      {
        action: "cancel-html",
        title: "EDITOR.DiscardHTML",
        icon: '<i class="fa-solid fa-xmark fa-fw"></i>',
        scope: scopes.HTML,
        cmd: this.#clearSourceEditor.bind(this)
      }
    ];

    if ( this.view.state.plugins.some(p => p.spec.isHighlightMatchesPlugin) ) {
      items.push({
        action: "toggle-matches",
        title: "EDITOR.EnableHighlightDocumentMatches",
        icon: '<i class="fa-solid fa-wand-magic-sparkles fa-fw"></i>',
        scope: scopes.TEXT,
        cssClass: "toggle-matches",
        cmd: this._toggleMatches.bind(this),
        active: game.settings.get("core", "pmHighlightDocumentMatches")
      });
    }

    if ( this.options.onSave ) {
      items.push({
        action: "save",
        title: `EDITOR.${this.options.destroyOnSave ? "SaveAndClose" : "Save"}`,
        icon: `<i class="fa-solid fa-${this.options.destroyOnSave ? "floppy-disk-circle-arrow-right" : "save"} fa-fw"></i>`,
        scope: scopes.BOTH,
        cssClass: "right",
        cmd: this._handleSave.bind(this)
      });
    }

    items.push({
      action: "source-code",
      title: "EDITOR.SourceHTML",
      icon: '<i class="fa-solid fa-code fa-fw"></i>',
      scope: scopes.BOTH,
      cssClass: "source-code-edit right",
      cmd: this.#toggleSource.bind(this)
    });

    Hooks.callAll("getProseMirrorMenuItems", this, items);
    return items;
  }

  /* -------------------------------------------- */

  /**
   * Determine whether the given menu item is currently active or not.
   * @param {ProseMirrorMenuItem} item  The menu item.
   * @returns {boolean}                 Whether the cursor or selection is in a state represented by the given menu
   *                                    item.
   * @protected
   */
  _isItemActive(item) {
    if ( item.action === "source-code" ) return !!this.#editingSource;
    if ( item.action === "toggle-matches" ) return game.settings.get("core", "pmHighlightDocumentMatches");
    if ( item.mark ) return this._isMarkActive(item);
    if ( item.node ) return this._isNodeActive(item);
    return false;
  }

  /* -------------------------------------------- */

  /**
   * Determine whether the given menu item representing a mark is active or not.
   * @param {ProseMirrorMenuItem} item  The menu item representing a MarkType.
   * @returns {boolean}                 Whether the cursor or selection is in a state represented by the given mark.
   * @protected
   */
  _isMarkActive(item) {
    const state = this.view.state;
    const {from, $from, to, empty} = state.selection;
    const markCompare = mark => {
      if ( mark.type !== item.mark ) return false;
      const attrs = foundry.utils.deepClone(mark.attrs);
      delete attrs._preserve;
      if ( item.attrs ) return foundry.utils.objectsEqual(attrs, item.attrs);
      return true;
    };
    if ( empty ) return $from.marks().some(markCompare);
    let active = false;
    state.doc.nodesBetween(from, to, node => {
      if ( node.marks.some(markCompare) ) active = true;
      return !active;
    });
    return active;
  }

  /* -------------------------------------------- */

  /**
   * Determine whether the given menu item representing a node is active or not.
   * @param {ProseMirrorMenuItem} item  The menu item representing a NodeType.
   * @returns {boolean}                 Whether the cursor or selection is currently within a block of this menu item's
   *                                    node type.
   * @protected
   */
  _isNodeActive(item) {
    const state = this.view.state;
    const {$from, $to, empty} = state.selection;
    const sameParent = empty || $from.sameParent($to);
    // If the selection spans multiple nodes, give up on detecting whether we're in a given block.
    // TODO: Add more complex logic for detecting if all selected nodes belong to the same parent.
    if ( !sameParent ) return false;
    return (state.doc.nodeAt($from.pos)?.type === item.node) || $from.hasAncestor(item.node, item.attrs);
  }

  /* -------------------------------------------- */

  /**
   * Handle a button press.
   * @param {MouseEvent} event  The click event.
   * @protected
   */
  _onAction(event) {
    event.preventDefault();
    const action = event.currentTarget.dataset.action;
    let item;

    // Check dropdowns first
    this.dropdowns.forEach(d => d.forEachItem(i => {
      if ( i.action !== action ) return;
      item = i;
      return false;
    }));

    // Menu items
    if ( !item ) item = this.items.find(i => i.action === action);
    item?.cmd?.(this.view.state, this.view.dispatch, this.view);

    // Destroy the dropdown, if present, & refocus the editor.
    document.getElementById("prosemirror-dropdown")?.remove();
    this.view.focus();
  }

  /* -------------------------------------------- */

  /**
   * Wrap the editor view element and inject our template ready to be rendered into.
   * @protected
   */
  _wrapEditor() {
    const wrapper = document.createElement("div");
    const template = document.createElement("template");
    wrapper.classList.add("editor-container");
    template.setAttribute("id", this.id);
    this.view.dom.before(template);
    this.view.dom.replaceWith(wrapper);
    wrapper.appendChild(this.view.dom);
  }

  /* -------------------------------------------- */

  /**
   * Handle requests to save the editor contents
   * @protected
   */
  _handleSave() {
    if ( this.#editingSource ) this.#commitSourceEdits();
    return this.options.onSave?.();
  }

  /* -------------------------------------------- */

  /**
   * Global listeners for the drop-down menu.
   */
  static eventListeners() {
    document.addEventListener("pointerdown", event => {
      if ( !event.target.closest("#prosemirror-dropdown") ) {
        document.getElementById("prosemirror-dropdown")?.remove();
      }
    }, { passive: true, capture: true });
  }

  /* -------------------------------------------- */
  /*  Source Code Textarea Management             */
  /* -------------------------------------------- */

  /**
   * Handle a request to edit the source HTML directly.
   */
  #toggleSource() {
    if ( this.editingSource ) return this.#commitSourceEdits();
    this.#activateSourceEditor();
  }

  /* -------------------------------------------- */

  /**
   * Conclude editing the HTML source. Remove the editor and return its contents.
   * @returns {string} The HTML text contained within the CodeMirror editor before it was cleared
   */
  #clearSourceEditor() {
    const editor = this.view.dom.closest(".editor");
    const htmlEditor = editor.querySelector(":scope > code-mirror[language=html]");
    const html = htmlEditor.value;
    htmlEditor.remove();
    this.#editingSource = false;
    this.items.find(i => i.action === "source-code").active = false;
    this.render();
    return html;
  }

  /* -------------------------------------------- */

  /**
   * Create and activate the HTML source editor.
   */
  #activateSourceEditor() {
    const editor = this.view.dom.closest(".editor");
    const htmlEditor = document.createElement("code-mirror");
    Object.assign(htmlEditor, { language: "html", indent: 4, className: "source-editor", managed: true });
    htmlEditor.value = ProseMirror.dom.serializeString(this.view.state.doc.content, {spaces: 4});
    editor.appendChild(htmlEditor);
    htmlEditor
      .querySelector("[contenteditable]")
      .addEventListener("keydown", event => this.#handleSourceKeydown(event));
    this.#editingSource = true;
    this.items.find(i => i.action === "source-code").active = true;
    this.render();
  }

  /* -------------------------------------------- */

  /**
   * Commit changes from the source textarea to the view.
   */
  #commitSourceEdits() {
    const html = this.#clearSourceEditor();
    const newDoc = ProseMirror.dom.parseString(html);
    const selection = new ProseMirror.AllSelection(this.view.state.doc);
    this.view.dispatch(this.view.state.tr.setSelection(selection).replaceSelectionWith(newDoc));
  }

  /* -------------------------------------------- */

  /**
   * Handle keypresses while editing editor source.
   * @param {KeyboardEvent} event  The keyboard event.
   */
  #handleSourceKeydown(event) {
    if ( game.keyboard.isModifierActive("CONTROL") && (event.key === "s") ) {
      event.preventDefault();
      this._handleSave();
    }
  }

  /* -------------------------------------------- */

  /**
   * Display the insert image prompt.
   * @protected
   */
  async _insertImagePrompt() {
    const state = this.view.state;
    const { $from, empty } = state.selection;
    const image = this.schema.nodes.image;
    const data = { src: "", alt: "", width: "", height: "" };
    if ( !empty ) {
      const selected = state.doc.nodeAt($from.pos);
      Object.assign(data, selected?.attrs ?? {});
    }
    const dialog = await this._showDialog("image", "templates/journal/insert-image.html", { data });
    const form = dialog.querySelector("form");
    const src = form.elements.src;
    form.elements.save.addEventListener("click", () => {
      if ( !src.value ) return;
      this.view.dispatch(this.view.state.tr.replaceSelectionWith(image.create({
        src: src.value,
        alt: form.elements.alt.value,
        width: form.elements.width.value,
        height: form.elements.height.value
      })).scrollIntoView());
    });
  }

  /* -------------------------------------------- */

  /**
   * Display the insert link prompt.
   * @protected
   */
  async _insertLinkPrompt() {
    const state = this.view.state;
    const {$from, $to, $cursor} = state.selection;

    // Capture the selected text.
    const selection = state.selection.content().content;
    const data = {text: selection.textBetween(0, selection.size), href: "", title: ""};

    // Check if the user has placed the cursor within a single link, or has selected a single link.
    const links = [];
    state.doc.nodesBetween($from.pos, $to.pos, (node, pos) => {
      if ( node.marks.some(m => m.type === this.schema.marks.link) ) links.push([node, pos]);
    });
    const existing = links.length === 1 && links[0];
    if ( existing ) {
      const [node] = existing;
      if ( $cursor ) data.text = node.text;
      // Pre-fill the dialog with the existing link's attributes.
      const link = node.marks.find(m => m.type === this.schema.marks.link);
      data.href = link.attrs.href;
      data.title = link.attrs.title;
    }

    const dialog = await this._showDialog("link", "templates/journal/insert-link.html", {data});
    const form = dialog.querySelector("form");
    form.elements.save.addEventListener("click", () => {
      const href = form.elements.href.value;
      const text = form.elements.text.value || href;
      if ( !href ) return;
      const link = this.schema.marks.link.create({href, title: form.elements.title.value});
      const tr = state.tr;

      // The user has placed the cursor within a link they wish to edit.
      if ( existing && $cursor ) {
        const [node, pos] = existing;
        const selection = TextSelection.create(state.doc, pos, pos + node.nodeSize);
        tr.setSelection(selection);
      }

      tr.addStoredMark(link).replaceSelectionWith(this.schema.text(text)).scrollIntoView();
      this.view.dispatch(tr);
    });
  }

  /* -------------------------------------------- */

  /**
   * Display the insert table prompt.
   * @protected
   */
  async _insertTablePrompt() {
    const dialog = await this._showDialog("insert-table", "templates/journal/insert-table.html");
    const form = dialog.querySelector("form");
    form.elements.save.addEventListener("click", () => {
      const rows = Number(form.elements.rows.value) || 1;
      const cols = Number(form.elements.cols.value) || 1;
      const html = `
        <table>
          ${Array.fromRange(rows).reduce(row => row + `
            <tr>${Array.fromRange(cols).reduce(col => col + "<td></td>", "")}</tr>
          `, "")}
        </table>
      `;
      const table = ProseMirror.dom.parseString(html, this.schema);
      this.view.dispatch(this.view.state.tr.replaceSelectionWith(table).scrollIntoView());
    });
  }

  /* -------------------------------------------- */

  /**
   * Create a dialog for a menu button.
   * @param {string} action                      The unique menu button action.
   * @param {string} template                    The dialog's template.
   * @param {object} [options]                   Additional options to configure the dialog's behaviour.
   * @param {object} [options.data={}]           Data to pass to the template.
   * @returns {HTMLDialogElement}
   * @protected
   */
  async _showDialog(action, template, {data={}}={}) {
    let button = document.getElementById("prosemirror-dropdown")?.querySelector(`[data-action="${action}"]`);
    button ??= this.view.dom.closest(".editor").querySelector(`[data-action="${action}"]`);
    button.classList.add("active");
    const rect = button.getBoundingClientRect();
    const dialog = document.createElement("dialog");
    dialog.classList.add("application", "menu-dialog", "prosemirror");
    const nearestThemed = this.view.dom.closest(".themed") ?? document.body;
    const [, theme] = nearestThemed.className.match(/(?:^|\s)(theme-\w+)/);
    if ( theme ) dialog.classList.add("themed", theme);
    dialog.innerHTML = await foundry.applications.handlebars.renderTemplate(template, data);
    document.body.appendChild(dialog);
    dialog.addEventListener("click", event => {
      if ( event.target.closest("form") ) return;
      button.classList.remove("active");
      dialog.remove();
    });
    const form = dialog.querySelector("form");
    form.classList.add("standard-form");
    Object.assign(form.style, { top: `${rect.top + 30}px`, left: `${rect.left - 200 + 15}px` });
    dialog.style.zIndex = ++foundry.applications.api.ApplicationV2._maxZ;
    form.elements.save?.addEventListener("click", () => {
      button.classList.remove("active");
      dialog.remove();
      this.view.focus();
    });
    dialog.open = true;
    return dialog;
  }

  /* -------------------------------------------- */

  /**
   * Clear any marks from the current selection.
   * @protected
   */
  _clearFormatting() {
    const state = this.view.state;
    const {empty, $from, $to} = state.selection;
    if ( empty ) return;
    const tr = this.view.state.tr;
    for ( const markType of Object.values(this.schema.marks) ) {
      if ( state.doc.rangeHasMark($from.pos, $to.pos, markType) ) tr.removeMark($from.pos, $to.pos, markType);
    }
    const range = $from.blockRange($to);
    const nodePositions = [];
    // Capture any nodes that are completely encompassed by the selection, or ones that begin and end exactly at the
    // selection boundaries (i.e., the user has selected all text inside the node).
    tr.doc.nodesBetween($from.pos, $to.pos, (node, pos) => {
      if ( node.isText ) return false;
      // Node is entirely contained within the selection.
      if ( (pos >= range.start) && (pos + node.nodeSize <= range.end) ) nodePositions.push(pos);
    });
    // Clear marks and attributes from all eligible nodes.
    nodePositions.forEach(pos => {
      const node = state.doc.nodeAt(pos);
      const attrs = {...node.attrs};
      for ( const [attr, spec] of Object.entries(node.type.spec.attrs) ) {
        if ( spec.formatting ) delete attrs[attr];
      }
      tr.setNodeMarkup(pos, null, attrs);
    });
    this.view.dispatch(tr);
  }

  /* -------------------------------------------- */

  /**
   * Toggle link recommendations
   * @protected
   */
  async _toggleMatches() {
    const enabled = game.settings.get("core", "pmHighlightDocumentMatches");
    await game.settings.set("core", "pmHighlightDocumentMatches", !enabled);
    this.items.find(i => i.action === "toggle-matches").active = !enabled;
    this.render();
  }

  /* -------------------------------------------- */

  /**
   * Inserts a horizontal rule at the cursor.
   */
  #insertHorizontalRule() {
    const hr = this.schema.nodes.horizontal_rule;
    this.view.dispatch(this.view.state.tr.replaceSelectionWith(hr.create()).scrollIntoView());
  }

  /* -------------------------------------------- */

  /**
   * Toggle a particular alignment for the given selection.
   * @param {string} alignment  The text alignment to toggle.
   */
  #toggleAlignment(alignment) {
    const state = this.view.state;
    const {$from, $to} = state.selection;
    const range = $from.blockRange($to);
    if ( !range ) return;
    const {paragraph, image} = this.schema.nodes;
    const positions = [];
    // The range positions are absolute, so we need to convert them to be relative to the parent node.
    const blockStart = range.parent.eq(state.doc) ? 0 : range.start;
    // Calculate the positions of all the paragraph nodes that are direct descendents of the blockRange parent node.
    range.parent.nodesBetween(range.start - blockStart, range.end - blockStart, (node, pos) => {
      if ( ![paragraph, image].includes(node.type) ) return false;
      positions.push({pos: blockStart + pos, attrs: node.attrs});
    });
    const tr = state.tr;
    positions.forEach(({pos, attrs}) => {
      const node = state.doc.nodeAt(pos);
      tr.setNodeMarkup(pos, null, {
        ...attrs, alignment: attrs.alignment === alignment ? node.type.attrs.alignment.default : alignment
      });
    });
    this.view.dispatch(tr);
  }

  /* -------------------------------------------- */

  /**
   * Toggle the given selection by wrapping it in a given block or lifting it out of one.
   * @param {NodeType} node                    The type of node being interacted with.
   * @param {MenuToggleBlockWrapCommand} wrap  The wrap command specific to the given node.
   * @param {object} [options]                 Additional options to configure behaviour.
   * @param {object} [options.attrs]           Attributes for the node.
   * @protected
   */
  _toggleBlock(node, wrap, {attrs=null}={}) {
    const state = this.view.state;
    const {$from, $to} = state.selection;
    const range = $from.blockRange($to);
    if ( !range ) return;
    const inBlock = $from.hasAncestor(node);
    if ( inBlock ) {
      // FIXME: This will lift out of the closest block rather than only the given one, and doesn't work on multiple
      // list elements.
      const target = liftTarget(range);
      if ( target != null ) this.view.dispatch(state.tr.lift(range, target));
    } else autoJoin(wrap(node, attrs), [node.name])(state, this.view.dispatch);
  }

  /* -------------------------------------------- */

  /**
   * Toggle the given selection by wrapping it in a given text block, or reverting to a paragraph block.
   * @param {NodeType} node           The type of node being interacted with.
   * @param {object} [options]        Additional options to configure behaviour.
   * @param {object} [options.attrs]  Attributes for the node.
   * @protected
   */
  _toggleTextBlock(node, {attrs=null}={}) {
    const state = this.view.state;
    const {$from, $to} = state.selection;
    const range = $from.blockRange($to);
    if ( !range ) return;
    const inBlock = $from.hasAncestor(node, attrs);
    if ( inBlock ) node = this.schema.nodes.paragraph;
    this.view.dispatch(state.tr.setBlockType(range.start, range.end, node, attrs));
  }
}

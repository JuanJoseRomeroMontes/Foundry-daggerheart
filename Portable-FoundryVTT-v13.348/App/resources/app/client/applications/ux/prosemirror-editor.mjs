import Hooks from "../../helpers/hooks.mjs";

/**
 * @typedef ProseMirrorHistory
 * @property {string} userId  The ID of the user who submitted the step.
 * @property {Step} step      The step that was submitted.
 */

/**
 * A class responsible for managing state and collaborative editing of a single ProseMirror instance.
 */
export default class ProseMirrorEditor {
  /**
   * @param {string} uuid                        A string that uniquely identifies this ProseMirror instance.
   * @param {EditorView} view                    The ProseMirror EditorView.
   * @param {Plugin} isDirtyPlugin               The plugin to track the dirty state of the editor.
   * @param {boolean} collaborate                Whether this is a collaborative editor.
   * @param {object} [options]                   Additional options.
   * @param {ClientDocument} [options.document]  A document associated with this editor.
   */
  constructor(uuid, view, isDirtyPlugin, collaborate, options={}) {
    /**
     * A string that uniquely identifies this ProseMirror instance.
     * @type {string}
     */
    Object.defineProperty(this, "uuid", {value: uuid, writable: false});

    /**
     * The ProseMirror EditorView.
     * @type {EditorView}
     */
    Object.defineProperty(this, "view", {value: view, writable: false});

    /**
     * Whether this is a collaborative editor.
     * @type {boolean}
     */
    Object.defineProperty(this, "collaborate", {value: collaborate, writable: false});

    this.options = options;
    this.#isDirtyPlugin = isDirtyPlugin;
  }

  /* -------------------------------------------- */

  /**
   * A list of active editor instances by their UUIDs.
   * @type {Map<string, ProseMirrorEditor>}
   */
  static #editors = new Map();

  /* -------------------------------------------- */

  /**
   * The plugin to track the dirty state of the editor.
   * @type {Plugin}
   */
  #isDirtyPlugin;

  /* -------------------------------------------- */

  /**
   * Retire this editor instance and clean up.
   */
  destroy() {
    ProseMirrorEditor.#editors.delete(this.uuid);
    this.view.destroy();
    if ( this.collaborate ) game.socket.emit("pm.endSession", this.uuid);
  }

  /* -------------------------------------------- */

  /**
   * Have the contents of the editor been edited by the user?
   * @returns {boolean}
   */
  isDirty() {
    return this.#isDirtyPlugin.getState(this.view.state);
  }

  /* -------------------------------------------- */

  /**
   * Handle new editing steps supplied by the server.
   * @param {string} offset                 The offset into the history, representing the point at which it was last
   *                                        truncated.
   * @param {ProseMirrorHistory[]} history  The entire edit history.
   * @protected
   */
  _onNewSteps(offset, history) {
    this._disableSourceCodeEditing();
    this.options.document?.sheet?._onNewSteps?.();
    const version = ProseMirror.collab.getVersion(this.view.state);
    const newSteps = history.slice(version - offset);

    // Flatten out the data into a format that ProseMirror.collab.receiveTransaction can understand.
    const [steps, ids] = newSteps.reduce(([steps, ids], entry) => {
      steps.push(ProseMirror.Step.fromJSON(ProseMirror.defaultSchema, entry.step));
      ids.push(entry.userId);
      return [steps, ids];
    }, [[], []]);

    const tr = ProseMirror.collab.receiveTransaction(this.view.state, steps, ids);
    this.view.dispatch(tr);
  }

  /* -------------------------------------------- */

  /**
   * Disable source code editing if the user was editing it when new steps arrived.
   * @protected
   */
  _disableSourceCodeEditing() {
    const htmlEditor = this.view.dom.closest(".editor")?.querySelector(":scope > code-mirror[language=html]");
    if ( !htmlEditor ) return;
    htmlEditor.disabled = true;
    ui.notifications.warn("EDITOR.EditingHTMLWarning", {localize: true, permanent: true});
  }

  /* -------------------------------------------- */

  /**
   * The state of this ProseMirror editor has fallen too far behind the central authority's and must be re-synced.
   * @protected
   */
  _resync() {
    // Copy the editor's current state to the clipboard to avoid data loss.
    const existing = this.view.dom;
    existing.contentEditable = false;
    const selection = document.getSelection();
    selection.removeAllRanges();
    const range = document.createRange();
    range.selectNode(existing);
    selection.addRange(range);
    // We cannot use navigator.clipboard.write here as it is disabled or not fully implemented in some browsers.
    // https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Interact_with_the_clipboard
    document.execCommand("copy");
    ui.notifications.warn("EDITOR.Resync", {localize: true, permanent: true});
    this.destroy();
    this.options.document?.sheet?.render(true, {resync: true});
  }

  /* -------------------------------------------- */

  /**
   * Handle users joining or leaving collaborative editing.
   * @param {string[]} users  The IDs of users currently editing (including ourselves).
   * @protected
   */
  _updateUserDisplay(users) {
    const editor = this.view.dom.closest(".editor");
    editor.classList.toggle("collaborating", users.length > 1);
    const pips = users.map(id => {
      const user = game.users.get(id);
      if ( !user ) return "";
      return `
        <span class="scene-player" style="background: ${user.color}; border: 1px solid ${user.border.css};">
          ${user.name[0]}
        </span>
      `;
    }).join("");
    const collaborating = editor.querySelector("menu .concurrent-users");
    collaborating.dataset.tooltipText = users.map(id => game.users.get(id)?.name).join(", ");
    collaborating.innerHTML = `
      <i class="fa-solid fa-user-group"></i>
      ${pips}
    `;
  }

  /* -------------------------------------------- */

  /**
   * Handle an autosave update for an already-open editor.
   * @param {string} html  The updated editor contents.
   * @protected
   */
  _handleAutosave(html) {
    this.options.document?.sheet?._onAutosave?.(html);
  }

  /* -------------------------------------------- */

  /**
   * Create a ProseMirror editor instance.
   * @param {HTMLElement} target                     An HTML element to mount the editor to.
   * @param {string} [content=""]                    Content to populate the editor with.
   * @param {object} [options]                       Additional options to configure the ProseMirror instance.
   * @param {string} [options.uuid]                  A string to uniquely identify this ProseMirror instance. Ignored
   *                                                 for a collaborative editor.
   * @param {ClientDocument} [options.document]      A Document whose content is being edited. Required for
   *                                                 collaborative editing and relative UUID generation.
   * @param {string} [options.fieldName]             The field within the Document that is being edited. Required for
   *                                                 collaborative editing.
   * @param {Record<string, Plugin>} [options.plugins]       Plugins to include with the editor.
   * @param {boolean} [options.collaborate=false]    Whether collaborative editing enabled.
   * @param {boolean} [options.relativeLinks=false]  Whether to generate relative UUID links to Documents that are
   *                                                 dropped on the editor.
   * @param {object} [options.props]                 Additional ProseMirror editor properties.
   * @returns {Promise<ProseMirrorEditor>}
   */
  static async create(target, content="", {uuid, document, fieldName, plugins={}, collaborate=false,
    relativeLinks=false, props={}}={}) {

    if ( collaborate && (!document || !fieldName) ) {
      throw new Error("A document and fieldName must be provided when creating an editor with collaborative editing.");
    }

    uuid = collaborate ? `${document.uuid}#${fieldName}` : uuid ?? `ProseMirror.${foundry.utils.randomID()}`;
    const state = ProseMirror.EditorState.create({doc: ProseMirror.dom.parseString(content)});
    plugins = Object.assign({}, ProseMirror.defaultPlugins, plugins);
    plugins.contentLinks = ProseMirror.ProseMirrorContentLinkPlugin.build(ProseMirror.defaultSchema, {
      document, relativeLinks
    });

    if ( document ) {
      plugins.images = ProseMirror.ProseMirrorImagePlugin.build(ProseMirror.defaultSchema, {document});
    }

    const options = {state};
    Hooks.callAll("createProseMirrorEditor", uuid, plugins, options);

    const view = collaborate
      ? await this._createCollaborativeEditorView(uuid, target, options.state, Object.values(plugins), props)
      : this._createLocalEditorView(target, options.state, Object.values(plugins), props);
    const editor = new ProseMirrorEditor(uuid, view, plugins.isDirty, collaborate, {document});
    ProseMirrorEditor.#editors.set(uuid, editor);
    return editor;
  }

  /* -------------------------------------------- */

  /**
   * Create an EditorView with collaborative editing enabled.
   * @param {string} uuid         The ProseMirror instance UUID.
   * @param {HTMLElement} target  An HTML element to mount the editor view to.
   * @param {EditorState} state   The ProseMirror editor state.
   * @param {Plugin[]} plugins    The ProseMirror editor plugins to load.
   * @param {object} props        Additional ProseMirror editor properties.
   * @returns {Promise<EditorView>}
   * @protected
   */
  static async _createCollaborativeEditorView(uuid, target, state, plugins, props) {
    const authority = await new Promise((resolve, reject) => {
      game.socket.emit("pm.editDocument", uuid, state, authority => {
        if ( authority.state ) resolve(authority);
        else reject();
      });
    });
    return new ProseMirror.EditorView({mount: target}, {
      ...props,
      state: ProseMirror.EditorState.fromJSON({
        schema: ProseMirror.defaultSchema,
        plugins: [
          ...plugins,
          ProseMirror.collab.collab({version: authority.version, clientID: game.userId})
        ]
      }, authority.state),
      dispatchTransaction(tr) {
        const newState = this.state.apply(tr);
        this.updateState(newState);
        const sendable = ProseMirror.collab.sendableSteps(newState);
        if ( sendable ) game.socket.emit("pm.receiveSteps", uuid, sendable.version, sendable.steps);
      }
    });
  }

  /* -------------------------------------------- */

  /**
   * Create a plain EditorView without collaborative editing.
   * @param {HTMLElement} target  An HTML element to mount the editor view to.
   * @param {EditorState} state   The ProseMirror editor state.
   * @param {Plugin[]} plugins    The ProseMirror editor plugins to load.
   * @param {object} props        Additional ProseMirror editor properties.
   * @returns {EditorView}
   * @protected
   */
  static _createLocalEditorView(target, state, plugins, props) {
    return new ProseMirror.EditorView({mount: target}, {
      ...props, state: ProseMirror.EditorState.create({doc: state.doc, plugins}),
    });
  }

  /* -------------------------------------------- */
  /*  Socket Handlers                             */
  /* -------------------------------------------- */

  /**
   * Handle new editing steps supplied by the server.
   * @param {string} uuid                   The UUID that uniquely identifies the ProseMirror instance.
   * @param {number} offset                 The offset into the history, representing the point at which it was last
   *                                        truncated.
   * @param {ProseMirrorHistory[]} history  The entire edit history.
   * @protected
   */
  static _onNewSteps(uuid, offset, history) {
    const editor = ProseMirrorEditor.#editors.get(uuid);
    if ( editor ) editor._onNewSteps(offset, history);
    else {
      console.warn(`New steps were received for UUID '${uuid}' which is not a ProseMirror editor instance.`);
    }
  }

  /* -------------------------------------------- */

  /**
   * Our client is too far behind the central authority's state and must be re-synced.
   * @param {string} uuid  The UUID that uniquely identifies the ProseMirror instance.
   * @protected
   */
  static _onResync(uuid) {
    const editor = ProseMirrorEditor.#editors.get(uuid);
    if ( editor ) editor._resync();
    else {
      console.warn(`A resync request was received for UUID '${uuid}' which is not a ProseMirror editor instance.`);
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle users joining or leaving collaborative editing.
   * @param {string} uuid       The UUID that uniquely identifies the ProseMirror instance.
   * @param {string[]} users    The IDs of the users editing (including ourselves).
   * @protected
   */
  static _onUsersEditing(uuid, users) {
    const editor = ProseMirrorEditor.#editors.get(uuid);
    if ( editor ) editor._updateUserDisplay(users);
    else {
      console.warn(`A user update was received for UUID '${uuid}' which is not a ProseMirror editor instance.`);
    }
  }

  /* -------------------------------------------- */

  /**
   * Update client state when the editor contents are autosaved server-side.
   * @param {string} uuid  The UUID that uniquely identifies the ProseMirror instance.
   * @param {string} html  The updated editor contents.
   * @protected
   */
  static async _onAutosave(uuid, html) {
    const editor = ProseMirrorEditor.#editors.get(uuid);
    const [docUUID, field] = uuid?.split("#") ?? [];
    const doc = await foundry.utils.fromUuid(docUUID);
    if ( doc ) doc.updateSource({[field]: html});
    if ( editor ) editor._handleAutosave(html);
    else doc.render(false);
  }

  /* -------------------------------------------- */

  /**
   * Listen for ProseMirror collaboration events.
   * @param {Socket} socket  The open websocket.
   * @internal
   */
  static _activateSocketListeners(socket) {
    socket.on("pm.newSteps", this._onNewSteps.bind(this));
    socket.on("pm.resync", this._onResync.bind(this));
    socket.on("pm.usersEditing", this._onUsersEditing.bind(this));
    socket.on("pm.autosave", this._onAutosave.bind(this));
  }
}

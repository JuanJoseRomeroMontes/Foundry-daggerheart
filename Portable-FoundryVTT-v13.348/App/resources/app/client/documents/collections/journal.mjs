import WorldCollection from "../abstract/world-collection.mjs";

/**
 * @import JournalEntry from "../journal-entry.mjs";
 * @import JournalEntryPage from "../journal-entry-page.mjs";
 * @import {ShareImageConfig} from "@client/applications/apps/image-popout.mjs";
 */

/**
 * The singleton collection of JournalEntry documents which exist within the active World.
 * This Collection is accessible within the Game object as game.journal.
 * @extends {WorldCollection<JournalEntry>}
 * @category Collections
 *
 * @see {@link foundry.documents.JournalEntry}: The JournalEntry document
 * @see {@link foundry.applications.sidebar.tabs.JournalDirectory}: The JournalDirectory sidebar
 *   directory
 */
export default class Journal extends WorldCollection {

  /** @override */
  static documentName = "JournalEntry";

  /* -------------------------------------------- */
  /*  Interaction Dialogs                         */
  /* -------------------------------------------- */

  /**
   * Display a dialog which prompts the user to show a JournalEntry or JournalEntryPage to other players.
   * @param {JournalEntry|JournalEntryPage} doc  The JournalEntry or JournalEntryPage to show.
   * @returns {Promise<void>}
   */
  static async showDialog(doc) {
    if ( !((doc instanceof foundry.documents.JournalEntry)
      || (doc instanceof foundry.documents.JournalEntryPage)) ) return;
    if ( !doc.isOwner ) {
      ui.notifications.error("JOURNAL.ShowBadPermissions", {localize: true});
      return;
    }
    if ( game.users.size < 2 ) {
      ui.notifications.warn("JOURNAL.ShowNoPlayers", {localize: true});
      return;
    }
    new foundry.applications.sheets.journal.ShowToPlayersDialog({ document: doc }).render({ force: true });
  }

  /* -------------------------------------------- */

  /**
   * Show the JournalEntry or JournalEntryPage to connected players.
   * By default, the document will only be shown to players who have permission to observe it.
   * If the force parameter is passed, the document will be shown to all players regardless of normal permission.
   * @param {JournalEntry|JournalEntryPage} doc  The JournalEntry or JournalEntryPage to show.
   * @param {object} [options]                   Additional options to configure behaviour.
   * @param {boolean} [options.force=false]      Display the entry to all players regardless of normal permissions.
   * @param {string[]} [options.users]           An optional list of user IDs to show the document to. Otherwise it will
   *                                             be shown to all connected clients.
   * @returns {Promise<JournalEntry|JournalEntryPage>|void}  A Promise that resolves back to the shown document once the
   *                                                         request is processed.
   * @throws {Error}                             If the user does not own the document they are trying to show.
   */
  static async show(doc, {force=false, users=[]}={}) {
    if ( !((doc instanceof foundry.documents.JournalEntry)
      || (doc instanceof foundry.documents.JournalEntryPage)) ) return;
    if ( !doc.isOwner ) throw new Error(game.i18n.localize("JOURNAL.ShowBadPermissions"));
    const strings = Object.fromEntries(["all", "authorized", "selected"].map(k => [k, game.i18n.localize(k)]));
    return new Promise(resolve => {
      game.socket.emit("showEntry", doc.uuid, {force, users}, () => {
        Journal._showEntry(doc.uuid, force);
        ui.notifications.info("JOURNAL.ActionShowSuccess", {format: {title: doc.name,
          which: users.length ? strings.selected : force ? strings.all : strings.authorized}});
        return resolve(doc);
      });
    });
  }

  /* -------------------------------------------- */

  /**
   * Share an image with connected players.
   * @param {string} src                 The image URL to share.
   * @param {ShareImageConfig} [config]  Image sharing configuration.
   */
  static showImage(src, {users=[], ...options}={}) {
    game.socket.emit("shareImage", {image: src, users, ...options});
    const strings = Object.fromEntries(["all", "selected"].map(k => [k, game.i18n.localize(k)]));
    ui.notifications.info("JOURNAL.ImageShowSuccess", {format: {which: users.length ? strings.selected : strings.all}});
  }

  /* -------------------------------------------- */
  /*  Socket Listeners and Handlers               */
  /* -------------------------------------------- */

  /**
   * Open Socket listeners which transact JournalEntry data
   * @param {Socket} socket       The open websocket
   */
  static _activateSocketListeners(socket) {
    socket.on("showEntry", this._showEntry.bind(this));
    socket.on("shareImage", foundry.applications.apps.ImagePopout._handleShareImage);
  }

  /* -------------------------------------------- */

  /**
   * Handle a received request to show a JournalEntry or JournalEntryPage to the current client
   * @param {string} uuid            The UUID of the document to display for other players
   * @param {boolean} [force=false]  Display the document regardless of normal permissions
   * @internal
   */
  static async _showEntry(uuid, force=false) {
    let entry = await foundry.utils.fromUuid(uuid);
    const {VIEW_MODES} = foundry.appv1.sheets.JournalSheet;
    const options = {tempOwnership: force, mode: VIEW_MODES.MULTIPLE, pageIndex: 0};
    const {OBSERVER} = CONST.DOCUMENT_OWNERSHIP_LEVELS;
    if ( entry instanceof foundry.documents.JournalEntryPage ) {
      options.mode = VIEW_MODES.SINGLE;
      options.pageId = entry.id;
      // Set temporary observer permissions for this page.
      if ( entry.getUserLevel(game.user) < OBSERVER ) entry.ownership[game.userId] = OBSERVER;
      entry = entry.parent;
    }
    else if ( entry instanceof foundry.documents.JournalEntry ) {
      if ( entry.getUserLevel(game.user) < OBSERVER ) entry.ownership[game.userId] = OBSERVER;
    }
    else return;
    if ( !force && !entry.visible ) return;

    // Show the sheet with the appropriate mode
    entry.sheet.render(true, options);
  }
}

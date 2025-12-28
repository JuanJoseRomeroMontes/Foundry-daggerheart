import PlaceablesLayer from "./base/placeables-layer.mjs";
import JournalEntry from "../../documents/journal-entry.mjs";
import JournalEntryPage from "../../documents/journal-entry-page.mjs";

/**
 * @import Note from "../placeables/note.mjs";
 */

/**
 * The Notes Layer which contains Note canvas objects.
 * @category Canvas
 */
export default class NotesLayer extends PlaceablesLayer {

  /** @inheritdoc */
  static get layerOptions() {
    return foundry.utils.mergeObject(super.layerOptions, {
      name: "notes",
      zIndex: 800
    });
  }

  /** @inheritdoc */
  static documentName = "Note";

  /**
   * The named core setting which tracks the toggled visibility state of map notes
   * @type {string}
   */
  static TOGGLE_SETTING = "notesDisplayToggle";

  /* -------------------------------------------- */

  /** @inheritdoc */
  get hookName() {
    return NotesLayer.name;
  }

  /* -------------------------------------------- */

  /** @override */
  interactiveChildren = game.settings.get("core", this.constructor.TOGGLE_SETTING);

  /* -------------------------------------------- */
  /*  Methods
  /* -------------------------------------------- */

  /** @inheritDoc */
  _getCopyableObjects(options) {
    if ( !game.user.can("NOTE_CREATE") ) return [];
    return super._getCopyableObjects(options);
  }

  /* -------------------------------------------- */

  /** @override */
  _deactivate() {
    super._deactivate();
    const isToggled = game.settings.get("core", this.constructor.TOGGLE_SETTING);
    this.objects.visible = this.interactiveChildren = isToggled;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _draw(options) {
    await super._draw(options);
    const isToggled = game.settings.get("core", this.constructor.TOGGLE_SETTING);
    this.objects.visible ||= isToggled;
    ui.controls._updateNotesIcon();
  }

  /* -------------------------------------------- */

  /**
   * Register game settings used by the NotesLayer
   */
  static registerSettings() {
    game.settings.register("core", this.TOGGLE_SETTING, {
      name: "Map Note Toggle",
      scope: "client",
      config: false,
      type: new foundry.data.fields.BooleanField({initial: true}),
      onChange: value => {
        if ( !canvas.ready ) return;
        const layer = canvas.notes;
        layer.objects.visible = layer.interactiveChildren = layer.active || value;
        ui.controls._updateNotesIcon();
      }
    });
  }

  /* -------------------------------------------- */

  /**
   * Pan to a given note on the layer.
   * @param {Note} note                      The note to pan to.
   * @param {object} [options]               Options which modify the pan operation.
   * @param {number} [options.scale=1.5]     The resulting zoom level.
   * @param {number} [options.duration=250]  The speed of the pan animation in milliseconds.
   * @returns {Promise<void>}                A Promise which resolves once the pan animation has concluded.
   */
  panToNote(note, {scale=1.5, duration=250}={}) {
    if ( !note ) return Promise.resolve();
    if ( note.visible && !this.active ) this.activate();
    return canvas.animatePan({x: note.x, y: note.y, scale, duration}).then(() => {
      if ( this.hover ) this.hover._onHoverOut(new Event("pointerout"));
      note._onHoverIn(new Event("pointerover"), {hoverOutOthers: true});
    });
  }

  /* -------------------------------------------- */

  /** @override */
  static prepareSceneControls() {
    return {
      name: "notes",
      order: 10,
      title: "CONTROLS.GroupNotes",
      layer: "notes",
      icon: "fa-solid fa-bookmark",
      onChange: (event, active) => {
        if ( active ) canvas.notes.activate();
      },
      onToolChange: () => canvas.notes.setAllRenderFlags({refreshState: true}),
      tools: {
        select: {
          name: "select",
          order: 1,
          title: "CONTROLS.NoteSelect",
          icon: "fa-solid fa-expand"
        },
        journal: {
          name: "journal",
          order: 2,
          title: "NOTE.Create",
          visible: game.user.hasPermission("NOTE_CREATE"),
          icon: CONFIG.JournalEntry.sidebarIcon
        },
        toggle: {
          name: "toggle",
          order: 3,
          title: "CONTROLS.NoteToggle",
          icon: "fa-solid fa-map-pin",
          toggle: true,
          active: game.settings.get("core", NotesLayer.TOGGLE_SETTING),
          onChange: (event, toggled) => game.settings.set("core", NotesLayer.TOGGLE_SETTING, toggled)
        },
        clear: {
          name: "clear",
          order: 4,
          title: "CONTROLS.NoteClear",
          icon: "fa-solid fa-trash",
          visible: game.user.isGM,
          onChange: () => canvas.notes.deleteAll(),
          button: true
        }
      },
      activeTool: "select"
    };
  }

  /* -------------------------------------------- */
  /*  Event Handlers                              */
  /* -------------------------------------------- */

  /** @inheritdoc */
  async _onClickLeft(event) {
    if ( game.activeTool !== "journal" ) return super._onClickLeft(event);
    const origin = event.getLocalPosition(canvas.stage);
    const noteData = canvas.grid.getCenterPoint(origin);
    const cls = foundry.utils.getDocumentClass("Note");
    await cls.createDialog(noteData);
  }

  /* -------------------------------------------- */

  /**
   * Handle JournalEntry document drop data
   * @param {DragEvent} event   The drag drop event
   * @param {object} data       The dropped data transfer data
   * @protected
   */
  async _onDropData(event, data) {
    let entry;
    let origin;
    if ( (data.x === undefined) || (data.y === undefined) ) {
      const coords = this._canvasCoordinatesFromDrop(event, {center: false});
      if ( !coords ) return false;
      origin = {x: coords[0], y: coords[1]};
    } else {
      origin = {x: data.x, y: data.y};
    }
    if ( !event.shiftKey ) origin = this.getSnappedPoint(origin);
    if ( !canvas.dimensions.rect.contains(origin.x, origin.y) ) return false;
    const noteData = {x: origin.x, y: origin.y};
    if ( data.type === "JournalEntry" ) entry = await JournalEntry.implementation.fromDropData(data);
    if ( data.type === "JournalEntryPage" ) {
      const page = await JournalEntryPage.implementation.fromDropData(data);
      entry = page.parent;
      noteData.pageId = page.id;
    }
    if ( entry?.inCompendium ) {
      const journalData = game.journal.fromCompendium(entry);
      entry = await JournalEntry.implementation.create(journalData);
    }
    noteData.entryId = entry?.id;
    return this._createPreview(noteData, {top: event.clientY - 20, left: event.clientX + 40});
  }
}

import DialogV2 from "../../api/dialog.mjs";
import HandlebarsApplicationMixin from "../../api/handlebars-application.mjs";
import Journal from "@client/documents/collections/journal.mjs";
import {BooleanField, NumberField} from "@common/data/fields.mjs";
import JournalEntryPage from "@client/documents/journal-entry-page.mjs";

/**
 * A dialog for configuring options when showing content to players.
 * @extends DialogV2
 * @mixes HandlebarsApplication
 */
export default class ShowToPlayersDialog extends HandlebarsApplicationMixin(DialogV2) {
  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["show-to-players"],
    modal: true,
    buttons: [{
      label: "JOURNAL.ActionShow",
      type: "submit",
      icon: "fa-solid fa-check"
    }],
    window: {
      contentTag: "form",
      contentClasses: ["standard-form"]
    },
    position: {
      width: 500
    },
    form: {
      handler: ShowToPlayersDialog.#onFormSubmit,
      closeOnSubmit: true
    }
  };

  /** @override */
  static PARTS = {
    body: {
      classes: ["standard-form"],
      template: "templates/journal/dialog-show.hbs"
    },
    footer: {
      template: "templates/generic/form-footer.hbs"
    }
  };

  /**
   * The Document that is being shown.
   * @type {JournalEntry|JournalEntryPage}
   */
  get document() {
    return this.options.document;
  }

  /**
   * Whether the Document that is being shown is an image-type JournalEntryPage.
   * @type {boolean}
   */
  get isImage() {
    return (this.document instanceof JournalEntryPage) && (this.document.type === "image");
  }

  /** @override */
  get title() {
    return game.i18n.format("JOURNAL.ShowEntry", { name: this.document.name });
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const ownership = Object.entries(CONST.DOCUMENT_OWNERSHIP_LEVELS);
    if ( this.document.isEmbedded ) ownership.shift();
    Object.assign(context, {
      buttons: this.options.buttons,
      isImage: this.isImage,
      image: {
        only: new BooleanField({ label: "JOURNALENTRYPAGE.ShowImageOnly" }),
        title: new BooleanField({ label: "JOURNALENTRYPAGE.ShowImageTitle" }),
        caption: new BooleanField({ label: "JOURNALENTRYPAGE.ShowImageCaption" })
      },
      users: game.users.filter(u => !u.isSelf),
      ownership: new NumberField({ label: "OWNERSHIP.Configure", blank: false, required: true }),
      levels: [
        { value: CONST.DOCUMENT_META_OWNERSHIP_LEVELS.NOCHANGE, label: "OWNERSHIP.NOCHANGE" },
        ...ownership.map(([name, level]) => ({ value: level, label: `OWNERSHIP.${name}` }))
      ]
    });
    return context;
  }

  /* -------------------------------------------- */

  /** @override */
  _onChangeForm(formConfig, event) {
    if ( event.target.name !== "allPlayers" ) return;
    const checked = event.target.checked;
    this.form.querySelectorAll('[name="players"]').forEach(i => Object.assign(i, { checked, disabled: checked }));
  }

  /* -------------------------------------------- */

  /**
   * Handle submitting the dialog.
   * @this {ShowToPlayersDialog}
   * @param {SubmitEvent} event          The submission event.
   * @param {HTMLFormElement} form       The submitted form element.
   * @param {FormDataExtended} formData  The submitted form data.
   * @returns {Promise<void>}
   */
  static async #onFormSubmit(event, form, formData) {
    let { allPlayers, imageOnly, showImageCaption, showImageTitle, players } = formData.object;
    let users = game.users.filter(u => !u.isSelf).map(u => u.id);
    if ( !allPlayers ) {
      if ( !players ) return;
      if ( !Array.isArray(players) ) players = [players];
      users = players.reduce((arr, id) => {
        const u = game.users.get(id);
        if ( u && !u.isSelf ) arr.push(id);
        return arr;
      }, []);
    }
    if ( !users.length ) return;
    const document = this.document;
    if ( formData.object.ownership >= CONST.DOCUMENT_OWNERSHIP_LEVELS.INHERIT ) {
      const target = formData.object.ownership;
      const { ownership } = document;
      if ( allPlayers ) ownership.default = target;
      for ( const id of users ) {
        if ( allPlayers ) {
          if ( (id in ownership) && (ownership[id] <= target) ) delete ownership[id];
          continue;
        }
        if ( ownership[id] === CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE ) ownership[id] = target;
        ownership[id] = Math.max(ownership[id] ?? -Infinity, target);
      }
      await document.update({"==ownership": ownership}, {render: false});
    }
    if ( imageOnly ) return Journal.showImage(document.src, {
      users,
      title: document.name,
      caption: showImageCaption ? document.caption : undefined,
      showTitle: showImageTitle,
      uuid: document.uuid
    });
    return Journal.show(document, { users, force: true });
  }
}

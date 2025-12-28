import DocumentSheetV2 from "../api/document-sheet.mjs";
import HandlebarsApplicationMixin from "../api/handlebars-application.mjs";

/**
 * The User configuration application.
 * @extends DocumentSheetV2
 * @mixes HandlebarsApplication
 */
export default class UserConfig extends HandlebarsApplicationMixin(DocumentSheetV2) {

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    classes: ["user-config"],
    position: {width: 480},
    window: {
      contentClasses: ["standard-form"],
      icon: "fa-solid fa-user"
    },
    actions: {
      releaseCharacter: UserConfig.#onReleaseCharacter
    },
    form: {
      closeOnSubmit: true
    }
  };

  /** @override */
  static PARTS = {
    form: {
      id: "form",
      template: "templates/sheets/user-config.hbs",
      scrollable: [""]
    },
    footer: {template: "templates/generic/form-footer.hbs"}
  };

  /* -------------------------------------------- */

  /** @inheritDoc */
  get title() {
    return `${game.i18n.localize("PLAYERS.ConfigTitle")}: ${this.document.name}`;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.user = context.document;
    context.characterWidget = this.#characterChoiceWidget.bind(this);
    context.buttons = [{type: "submit", icon: "fa-solid fa-floppy-disk", label: "USER.SHEET.BUTTONS.SAVE"}];
    return context;
  }

  /* -------------------------------------------- */

  /**
   * Render the Character field as a choice between observed Actors.
   * @returns {HTMLDivElement}
   */
  #characterChoiceWidget(field, _groupConfig, inputConfig) {

    // Create the form field
    const fg = document.createElement("div");
    fg.className = "form-group stacked character";
    const ff = fg.appendChild(document.createElement("div"));
    ff.className = "form-fields";
    fg.insertAdjacentHTML("beforeend", `<p class="hint">${field.hint}</p>`);

    // Actor select
    const others = game.users.reduce((s, u) => {
      if ( u.character && !u.isSelf ) s.add(u.character.id);
      return s;
    }, new Set());

    const options = [];
    const ownerGroup = game.i18n.localize("OWNERSHIP.OWNER");
    const observerGroup = game.i18n.localize("OWNERSHIP.OBSERVER");
    for ( const actor of game.actors ) {
      if ( !actor.testUserPermission(this.document, "OBSERVER") ) continue;
      const a = {value: actor.id, label: actor.name, disabled: others.has(actor.id)};
      options.push({group: actor.isOwner ? ownerGroup : observerGroup, ...a});
    }

    const input = foundry.applications.fields.createSelectInput({...inputConfig,
      name: field.fieldPath,
      options,
      blank: "",
      sort: true
    });
    ff.appendChild(input);

    // Player character
    const c = this.document.character;
    if ( c ) {
      ff.insertAdjacentHTML("afterbegin", `<img class="avatar" src="${foundry.utils.escapeHTML(c.img)}" alt="${foundry.utils.escapeHTML(c.name)}">`);
      const release = `<button type="button" class="icon fa-solid fa-ban" data-action="releaseCharacter"
                               data-tooltip="USER.SHEET.BUTTONS.RELEASE"></button>`;
      ff.insertAdjacentHTML("beforeend", release);
    }
    return fg;
  }

  /* -------------------------------------------- */

  /**
   * Handle button clicks to release the currently selected character.
   * @param {PointerEvent} event
   */
  static #onReleaseCharacter(event) {
    event.preventDefault();
    const button = event.target;
    const fields = button.parentElement;
    fields.querySelector("select[name=character]").value = "";
    fields.querySelector("img.avatar").remove();
    button.remove();
    this.setPosition({height: "auto"});
  }
}

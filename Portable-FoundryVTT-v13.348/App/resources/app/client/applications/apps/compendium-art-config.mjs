import HandlebarsApplicationMixin from "../api/handlebars-application.mjs";
import ApplicationV2 from "../api/application.mjs";
import SettingsConfig from "../settings/config.mjs";

/**
 * An application for configuring compendium art priorities.
 * @extends ApplicationV2
 * @mixes HandlebarsApplication
 */
export default class CompendiumArtConfig extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @override */
  static DEFAULT_OPTIONS = {
    id: "compendium-art-config",
    tag: "form",
    window: {
      contentClasses: ["standard-form"],
      icon: "fa-solid fa-palette",
      title: "COMPENDIUM.ART.SETTING.Title"
    },
    position: {width: 600},
    form: {
      closeOnSubmit: true,
      handler: CompendiumArtConfig.#onSubmit
    },
    actions: {
      priority: CompendiumArtConfig.#onAdjustPriority
    }
  };

  /** @override */
  static PARTS = {
    priorities: {
      id: "priorities",
      template: "templates/apps/compendium-art-config.hbs"
    },
    footer: {
      template: "templates/generic/form-footer.hbs"
    }
  };

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(_options={}) {
    return {
      config: game.compendiumArt.getPackages(),
      buttons: [{ type: "submit", icon: "fa-solid fa-floppy-disk", label: "SETUP.SaveConfiguration" }]
    };
  }

  /* -------------------------------------------- */
  /*  Event Handlers                              */
  /* -------------------------------------------- */

  /**
   * Adjust the priority of a package.
   * @this {ApplicationV2}
   * @param {MouseEvent} _event         The click event.
   * @param {HTMLButtonElement} target  The button that was clicked.
   */
  static async #onAdjustPriority(_event, target) {
    const row = target.closest("[data-package-id]");
    const { packageId } = row.dataset;
    const configs = [];
    for ( const element of this.element.elements ) {
      const [id, key] = element.name.split(".");
      if ( key === "priority" ) configs.push({ packageId: id, priority: Number(element.value) });
    }
    const idx = configs.findIndex(config => config.packageId === packageId);
    if ( idx < 0 ) return;
    const sortBefore = "increase" in target.dataset;
    if ( sortBefore && (idx === 0) ) return;
    if ( !sortBefore && (idx >= configs.length - 1) ) return;
    const config = configs[idx];
    const sortTarget = configs[sortBefore ? idx - 1 : idx + 1];
    configs.splice(idx, 1);
    const updates = foundry.utils.performIntegerSort(config, {
      sortBefore, target: sortTarget, siblings: configs, sortKey: "priority"
    });
    updates.forEach(({ target, update }) => {
      this.element.elements[`${target.packageId}.priority`].value = update.priority;
    });
    if ( sortBefore ) row.previousElementSibling.insertAdjacentElement("beforebegin", row);
    else row.nextElementSibling.insertAdjacentElement("afterend", row);
  }

  /* -------------------------------------------- */

  /**
   * Save the compendium art configuration.
   * @this {ApplicationV2}
   * @param {SubmitEvent} _event         The form submission event.
   * @param {HTMLFormElement} _form      The form element that was submitted.
   * @param {FormDataExtended} formData  Processed data for the submitted form.
   */
  static async #onSubmit(_event, _form, formData) {
    await game.settings.set("core", game.compendiumArt.SETTING, foundry.utils.expandObject(formData.object));
    return SettingsConfig.reloadConfirm({ world: true });
  }
}

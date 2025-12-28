import {ApplicationV2, HandlebarsApplicationMixin} from "../api/_module.mjs";
import Combat from "@client/documents/combat.mjs";

/**
 * @import {ApplicationClickAction} from "../_types.mjs";
 */

/**
 * The Application responsible for configuring the CombatTracker and its contents.
 * @extends ApplicationV2
 * @mixes HandlebarsApplication
 */
export default class CombatTrackerConfig extends HandlebarsApplicationMixin(ApplicationV2) {

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    id: "combat-tracker-config",
    tag: "form",
    window: {
      contentClasses: ["standard-form"],
      icon: "fa-solid fa-swords",
      title: "COMBAT.Settings"
    },
    position: {width: 480},
    form: {
      closeOnSubmit: true,
      handler: CombatTrackerConfig.#saveSettings
    },
    actions: {
      previewTheme: CombatTrackerConfig.#onPreviewTheme
    }
  };

  /** @override */
  static PARTS = {
    body: {template: "templates/apps/combat-tracker-config.hbs", scrollable: [""]},
    footer: {template: "templates/generic/form-footer.hbs"}
  };

  /* -------------------------------------------- */

  /** @override */
  async _prepareContext() {
    const TokenDocument = foundry.utils.getDocumentClass("Token");
    const attributes = TokenDocument.getTrackedAttributes();
    attributes.bar.forEach(a => a.push("value"));
    const combatThemeSetting = game.settings.settings.get("core.combatTheme");
    return {
      rootId: this.id,
      attributeChoices: TokenDocument.getTrackedAttributeChoices(attributes),
      canConfigure: game.user.can("SETTINGS_MODIFY"),
      combatTheme: combatThemeSetting,
      fields: CONFIG.Combat.settings.constructor.schema.fields,
      selectedTheme: game.settings.get("core", "combatTheme"),
      settings: game.settings.get("core", Combat.CONFIG_SETTING),
      animationChoices: CONFIG.Combat.settings.turnMarkerAnimations,
      buttons: [{type: "submit", icon: "fa-solid fa-floppy-disk", label: "COMBAT.SettingsSave"}]
    };
  }

  /* -------------------------------------------- */

  /**
   * @inheritDoc
   */
  _onChangeForm(formConfig, event) {
    switch ( event.target.name ) {
      case "core.combatTheme":
        this.#audioPreviewState = 0;
        break;
      case "core.combatTrackerConfig.turnMarker.enabled": {
        const elements = this.form.elements;
        for ( const fieldName of ["animation", "src", "disposition"] ) {
          elements[`core.combatTrackerConfig.turnMarker.${fieldName}`].disabled = !event.target.checked;
        }
      }
    }
    super._onChangeForm(formConfig, event);
  }

  /* -------------------------------------------- */
  /*  Event Handlers                              */
  /* -------------------------------------------- */

  #audioPreviewState = 0;

  /**
   * Handle previewing a sound file for a Combat Tracker setting
   * @type {ApplicationClickAction}
   * @this CombatTrackerConfig
   */
  static async #onPreviewTheme(_event, target) {
    const themeId = target.previousElementSibling.value;
    const theme = CONFIG.Combat.sounds[themeId];
    if ( !theme ) return;
    const announcements = CONST.COMBAT_ANNOUNCEMENTS;
    const announcement = announcements[this.#audioPreviewState++ % announcements.length];
    const sounds = theme[announcement];
    if ( !sounds ) return;
    const src = sounds[Math.floor(Math.random() * sounds.length)];
    game.audio.play(src, {context: game.audio.interface});
  }

  /* -------------------------------------------- */

  /**
   * Save all settings.
   * @type {ApplicationClickAction}
   * @this CombatTrackerConfig
   */
  static async #saveSettings(_event, _form, submitData) {
    const settings = foundry.utils.expandObject(submitData.object);
    await game.settings.set("core", "combatTheme", settings.core.combatTheme);
    if ( game.user.can("SETTINGS_MODIFY") ) {
      await game.settings.set("core", Combat.CONFIG_SETTING, settings.core[Combat.CONFIG_SETTING]);
    }
  }
}

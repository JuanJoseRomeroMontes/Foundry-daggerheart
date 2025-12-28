import HandlebarsApplicationMixin from "../../api/handlebars-application.mjs";
import AbstractSidebarTab from "../sidebar-tab.mjs";

/**
 * The sidebar settings tab.
 * @extends {AbstractSidebarTab}
 * @mixes HandlebarsApplication
 */
export default class Settings extends HandlebarsApplicationMixin(AbstractSidebarTab) {
  /** @override */
  static DEFAULT_OPTIONS = {
    window: {
      title: "SIDEBAR.TabSettings"
    },
    actions: {
      openApp: Settings.#onOpenApp,
      notifyUpdate: Settings.#onNotifyUpdate
    }
  };

  /** @override */
  static tabName = "settings";

  /** @override */
  static PARTS = {
    settings: {
      template: "templates/sidebar/tabs/settings.hbs",
      root: true
    }
  };

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const coreUpdate = game.user.isGM && game.data.coreUpdate.hasUpdate
      ? game.i18n.format("SETUP.UpdateAvailable", {
        type: game.i18n.localize("Software"),
        channel: game.data.coreUpdate.channel,
        version: game.data.coreUpdate.version
      })
      : null;
    const systemUpdate = game.user.isGM && game.data.systemUpdate.hasUpdate
      ? game.i18n.format("SETUP.UpdateAvailable", {
        type: game.i18n.localize("System"),
        channel: game.data.system.title,
        version: game.data.systemUpdate.version
      })
      : null;
    const issues = CONST.WORLD_DOCUMENT_TYPES.reduce((count, documentName) => {
      const collection = CONFIG[documentName].collection.instance;
      return count + collection.invalidDocumentIds.size;
    }, 0) + Object.values(game.issues.packageCompatibilityIssues).reduce((count, {error}) => {
      return count + error.length;
    }, 0) + Object.keys(game.issues.usabilityIssues).length;
    const isDemo = game.data.demoMode;
    return Object.assign(context, {
      system: game.system,
      release: game.data.release,
      versionDisplay: game.release.display,
      canConfigure: game.user.can("SETTINGS_MODIFY") && !isDemo,
      canEditWorld: game.user.hasRole("GAMEMASTER") && !isDemo,
      canManagePlayers: game.user.isGM && !isDemo,
      canReturnSetup: game.user.hasRole("GAMEMASTER") && !isDemo,
      modules: game.modules.reduce((n, m) => n + (m.active ? 1 : 0), 0),
      issues,
      isDemo,
      coreUpdate,
      systemUpdate
    });
  }

  /* -------------------------------------------- */

  /**
   * Open an application.
   * @this {Settings}
   * @type {ApplicationClickAction}
   */
  static async #onOpenApp(event) {
    switch (event.target.dataset.app) {
      case "configure":
        game.settings.sheet.render({force: true});
        break;
      case "modules":
        new foundry.applications.sidebar.apps.ModuleManagement().render({force: true});
        break;
      case "world":
        new foundry.applications.sidebar.apps.WorldConfig({world: game.world}).render({force: true});
        break;
      case "players":
        return ui.menu.items.players.onClick();
      case "setup":
        return game.shutDown();
      case "support":
        new foundry.applications.sidebar.apps.SupportDetails().render({force: true});
        break;
      case "controls":
        new foundry.applications.sidebar.apps.ControlsConfig().render({force: true});
        break;
      case "tours":
        new foundry.applications.sidebar.apps.ToursManagement().render({force: true});
        break;
      case "invitations":
        new foundry.applications.sidebar.apps.InvitationLinks().render({force: true});
        break;
      case "logout":
        return game.logOut();
    }
  }

  /* -------------------------------------------- */

  static async #onNotifyUpdate(event) {
    const key = event.target.dataset.update === "core" ? "CoreUpdateInstructions" : "SystemUpdateInstructions";
    ui.notifications.info(`SETUP.${key}`, {localize: true});
  }
}

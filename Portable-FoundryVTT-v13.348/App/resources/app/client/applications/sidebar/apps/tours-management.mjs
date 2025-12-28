import Tour from "@client/nue/tour.mjs";
import CategoryBrowser from "@client/applications/api/category-browser.mjs";
import DialogV2 from "@client/applications/api/dialog.mjs";

/**
 * @import {ApplicationClickAction} from "../../_types.mjs";
 */

/**
 * A management app for configuring which Tours are available or have been completed.
 */
export default class ToursManagement extends CategoryBrowser {

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    id: "tours-management",
    window: {
      title: "SIDEBAR.SETTINGS.ACTIONS.Tours",
      icon: "fa-solid fa-person-hiking",
      resizable: true
    },
    position: {
      width: 780,
      height: 680
    },
    actions: {
      resetDefaults: ToursManagement.#onResetDefaults,
      play: ToursManagement.#onPlayTour,
      reset: ToursManagement.#onResetTour
    },
    initialCategory: "core",
    subtemplates: {
      category: "templates/sidebar/apps/tours-management-category.hbs",
      sidebarFooter: "templates/category-browser/reset.hbs"
    }
  };

  /* -------------------------------------------- */
  /*  Application Overrides                       */
  /* -------------------------------------------- */

  /** @override */
  _prepareCategoryData() {
    const categories = {};
    const getCategory = namespace => {
      const {id, label} = this.#categorizeEntry(namespace);
      return categories[id] ??= {id, label, entries: []};
    };

    for ( const tour of game.tours ) {
      if ( !tour.config.display || (tour.config.restricted && !game.user.isGM) ) continue;

      // Determine what category the action belongs to
      const category = getCategory(tour.namespace);

      // Convert Tour to render data
      const data = {
        id: `${tour.namespace}.${tour.id}`,
        label: tour.title,
        completed: tour.status === Tour.STATUS.COMPLETED,
        hint: [
          tour.config.restricted ? game.i18n.localize("KEYBINDINGS.Restricted") : "",
          tour.description
        ].filterJoin("<br>")
      };
      switch ( tour.status ) {
        case Tour.STATUS.UNSTARTED: {
          data.status = game.i18n.localize("TOURS.NotStarted");
          data.canPlay = tour.canStart;
          data.startOrResume = game.i18n.localize("TOURS.Start");
          break;
        }
        case Tour.STATUS.IN_PROGRESS: {
          data.status = game.i18n.format("TOURS.InProgress", {
            current: (tour.stepIndex + 1) || 0,
            total: tour.steps.length ?? 0
          });
          data.canPlay = tour.canStart;
          data.canReset = true;
          data.startOrResume = game.i18n.localize(`TOURS.${tour.config.canBeResumed ? "Resume" : "Restart"}`);
          break;
        }
        case Tour.STATUS.COMPLETED: {
          data.status = game.i18n.localize("TOURS.Completed");
          data.canReset = true;
          break;
        }
      }
      category.entries.push(data);
    }
    return categories;
  }

  /* -------------------------------------------- */

  /** @override */
  _sortCategories(a, b) {
    const categoryOrder = {core: 0, system: 1};
    const indexOfA = categoryOrder[a.id] ?? 2;
    const indexOfB = categoryOrder[b.id] ?? 2;
    return (indexOfA - indexOfB) || a.label.localeCompare(b.label, game.i18n.lang);
  }

  /* -------------------------------------------- */
  /*  Private Application Methods                 */
  /* -------------------------------------------- */

  /**
   * Classify what Category an Action belongs to
   * @param {string} namespace The entry to classify
   * @returns {{id: string; label: string}} The category the entry belongs to
   */
  #categorizeEntry(namespace) {
    switch ( namespace ) {
      case "core":
        return {id: "core", label: game.i18n.localize("PACKAGECONFIG.TABS.core")};
      case game.system.id:
        return {id: "system", label: game.system.title};
      default: {
        const module = game.modules.get(namespace);
        return module
          ? {id: module.id, label: module.title}
          : {id: "unmapped", label: game.i18n.localize("PACKAGECONFIG.TABS.unmapped")};
      }
    }
  }

  /* -------------------------------------------- */
  /*  Application Actions Handlers                */
  /* -------------------------------------------- */

  /**
   * Play the selected tour. Close the application window.
   * @this {ToursManagement}
   * @type {ApplicationClickAction}
   */
  static async #onPlayTour(_event, form) {
    const tour = game.tours.get(form.dataset.tour);
    if ( tour ) this.minimize();
    await tour?.start();
  }

  /* -------------------------------------------- */

  /**
   * Reset the selected tour.
   * @this {ToursManagement}
   * @type {ApplicationClickAction}
   */
  static async #onResetTour(_event, form) {
    const tour = game.tours.get(form.dataset.tour);
    await tour?.reset();
    await this.render();
  }

  /* -------------------------------------------- */

  /**
   * Reset all tours.
   * @this {ToursManagement}
   * @type {ApplicationClickAction}
   */
  static async #onResetDefaults() {
    return DialogV2.confirm({
      window: {
        title: "TOURS.ResetTitle",
        icon: "fa-solid fa-arrow-rotate-left"
      },
      content: `<p>${game.i18n.localize("TOURS.ResetWarning")}</p>`,
      yes: {
        callback: async () => {
          await Promise.all(game.tours.contents.map(tour => tour.reset()));
          ui.notifications.info("TOURS.ResetSuccess", {localize: true});
          await this.render();
        }
      }
    });
  }
}

import Tour from "../tour.mjs";

/**
 * @typedef {TourConfig} SetupTourConfig
 * @property {boolean} [closeWindows=true]  Whether to close all open windows before beginning the tour.
 */

/**
 * A Tour subclass that handles controlling the UI state of the Setup screen
 */
export default class SetupTour extends Tour {

  /**
   * Stores a currently open Application for future steps
   * @type {Application}
   */
  focusedApp;

  /* -------------------------------------------- */

  /** @override */
  get canStart() {
    return game.view === "setup";
  }

  /* -------------------------------------------- */

  /** @override */
  get steps() {
    return this.config.steps; // A user is always "GM" for Setup Tours
  }

  /* -------------------------------------------- */

  /** @override */
  async _preStep() {
    await super._preStep();

    // Close currently open applications
    if ( (this.stepIndex === 0) && (this.config.closeWindows !== false) ) {
      for ( const app of Object.values(ui.windows) ) {
        app.close();
      }
    }

    // Configure specific steps
    switch ( this.id ) {
      case "installingASystem": return this.#installingASystem();
      case "creatingAWorld": return this.#creatingAWorld();
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle Step setup for the Installing a System Tour
   * @returns {Promise<void>}
   */
  async #installingASystem() {
    // Activate Systems tab and warm cache
    if ( this.currentStep.id === "systemsTab" ) {
      ui.setupPackages.changeTab("systems", "primary");

      // noinspection ES6MissingAwait
      game.warmPackages({type: "system"});
    }

    // Render the InstallPackage app with a filter
    else if ( this.currentStep.id === "searching" ) {
      await game.browsePackages("system", {search: "Simple Worldbuilding"});
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle Step setup for the Creating a World Tour
   * @returns {Promise<void>}
   */
  async #creatingAWorld() {

    // Activate the World tab
    if ( this.currentStep.id === "worldTab" ) {
      ui.setupPackages.changeTab("worlds", "primary");
    }
    else if ( this.currentStep.id === "worldTitle" ) {
      const world = new foundry.packages.World({
        name: "my-first-world",
        title: "My First World",
        system: Array.from(game.systems)[0].id,
        coreVersion: game.release.version,
        description: game.i18n.localize("SETUP.NueWorldDescription")
      });

      // Render the World configuration application
      this.focusedApp = new foundry.applications.sidebar.apps.WorldConfig({world});
      await this.focusedApp.render({force: true});
    }
    else if ( this.currentStep.id === "launching" ) {
      await this.focusedApp.submit();
    }
  }
}

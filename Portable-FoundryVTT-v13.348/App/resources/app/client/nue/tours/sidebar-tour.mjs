import Tour from "../tour.mjs";

/**
 * A Tour subclass for the Sidebar Tour
 */
export default class SidebarTour extends Tour {

  /** @override */
  async start() {
    game.togglePause(false);
    await super.start();
  }

  /* -------------------------------------------- */

  /** @override */
  async _preStep() {
    await super._preStep();

    // Configure specific steps
    if ( (this.id === "sidebar") || (this.id === "welcome") ) {
      await ui[this.currentStep.sidebarTab]?.activate();
    }
  }
}

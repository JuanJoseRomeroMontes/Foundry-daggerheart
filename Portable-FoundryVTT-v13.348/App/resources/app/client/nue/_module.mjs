/** @module nue */

import * as tours from "./tours/_module.mjs";
import Tour from "./tour.mjs";

export {tours, Tour};
export {default as NewUserExperienceManager} from "./nue-manager.mjs";
export {default as ToursCollection} from "./tours-collection.mjs";

/**
 * Register core Tours.
 * @returns {Promise<void>}
 */
export async function registerTours() {
  try {
    game.tours.register("core", "welcome", await tours.SidebarTour.fromJSON("/tours/welcome.json"));
    game.tours.register("core", "installingASystem", await tours.SetupTour.fromJSON("/tours/installing-a-system.json"));
    game.tours.register("core", "creatingAWorld", await tours.SetupTour.fromJSON("/tours/creating-a-world.json"));
    game.tours.register("core", "backupsOverview", await tours.SetupTour.fromJSON("/tours/backups-overview.json"));
    game.tours.register("core", "compatOverview", await tours.SetupTour.fromJSON("/tours/compatibility-preview-overview.json"));
    game.tours.register("core", "uiOverview", await Tour.fromJSON("/tours/ui-overview.json"));
    game.tours.register("core", "sidebar", await tours.SidebarTour.fromJSON("/tours/sidebar.json"));
    game.tours.register("core", "canvasControls", await tours.CanvasTour.fromJSON("/tours/canvas-controls.json"));
  }
  catch(err) {
    console.error(err);
  }
}

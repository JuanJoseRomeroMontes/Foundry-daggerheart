import BasePlaceableHUD from "./placeable-hud.mjs";
import HandlebarsApplicationMixin from "../api/handlebars-application.mjs";

/**
 * @import Drawing from "../../canvas/placeables/drawing.mjs";
 * @import DrawingDocument from "../../documents/drawing.mjs";
 * @import DrawingsLayer from "../../canvas/layers/drawings.mjs";
 */

/**
 * An implementation of the PlaceableHUD base class which renders a heads-up-display interface for Drawing objects.
 * The DrawingHUD implementation can be configured and replaced via {@link CONFIG.Drawing.hudClass}.
 * @extends {BasePlaceableHUD<Drawing, DrawingDocument, DrawingsLayer>}
 * @mixes HandlebarsApplication
 */
export default class DrawingHUD extends HandlebarsApplicationMixin(BasePlaceableHUD) {

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    id: "drawing-hud"
  };

  /** @override */
  static PARTS = {
    hud: {
      root: true,
      template: "templates/hud/drawing-hud.hbs"
    }
  };
}

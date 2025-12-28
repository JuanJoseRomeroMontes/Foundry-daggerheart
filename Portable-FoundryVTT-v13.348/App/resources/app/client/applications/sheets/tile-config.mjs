import {DocumentSheetV2, HandlebarsApplicationMixin} from "../api/_module.mjs";
import FormDataExtended from "../ux/form-data-extended.mjs";
import Color from "@common/utils/color.mjs";

/**
 * The Application responsible for configuring a single Tile document within a parent Scene.
 * @extends DocumentSheetV2
 * @mixes HandlebarsApplication
 */
export default class TileConfig extends HandlebarsApplicationMixin(DocumentSheetV2) {
  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    classes: ["tile-config"],
    canCreate: true,
    window: {
      contentClasses: ["standard-form"],
      icon: "fa-solid fa-cubes"
    },
    position: {width: 480},
    form: {
      closeOnSubmit: true
    }
  };

  /** @override */
  static PARTS = {
    tabs: {template: "templates/generic/tab-navigation.hbs"},
    position: {template: "templates/scene/tile/position.hbs"},
    appearance: {template: "templates/scene/tile/appearance.hbs"},
    overhead: {template: "templates/scene/tile/overhead.hbs"},
    footer: {template: "templates/generic/form-footer.hbs"}
  };

  /** @override */
  static TABS = {
    sheet: {
      tabs: [
        {id: "position", icon: "fa-solid fa-location-dot"},
        {id: "appearance", icon: "fa-solid fa-image"},
        {id: "overhead", icon: "fa-solid fa-house"}
      ],
      initial: "position",
      labelPrefix: "TILE.TABS"
    }
  };

  /* -------------------------------------------- */

  /** @inheritDoc */
  get title() {
    if ( !this.document.id ) return game.i18n.localize("TILE.ACTIONS.CREATE");
    return super.title;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _configureRenderOptions(options) {
    if (options.isFirstRender && !this.document._source.texture.src) {
      this.tabGroups.sheet = "appearance";
    }
    return super._configureRenderOptions(options);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const document = context.document;
    const submitText = `TILE.ACTIONS.${document.collection?.has(document.id) ? "UPDATE" : "CREATE"}`;
    return Object.assign(context, {
      gridUnits: document.parent.grid.units || game.i18n.localize("GridUnits"),
      buttons: [{type: "submit", icon: "fa-solid fa-floppy-disk", label: submitText}]
    });
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _preparePartContext(partId, context, options) {
    const partContext = await super._preparePartContext(partId, context, options);
    if ( partId === "appearance" ) {
      partContext.hasVideo = foundry.helpers.media.VideoHelper.hasVideoExtension(this.document._source.texture.src);
    }
    const tab = partContext.tabs[partId];
    if ( tab ) partContext.tab = tab;
    return partContext;
  }

  /* -------------------------------------------- */

  /** @override */
  _onChangeForm() {
    const fdo = new FormDataExtended(this.form).object;

    // Show/hide video options
    const hasVideo = foundry.helpers.media.VideoHelper.hasVideoExtension(fdo["texture.src"]);
    this.element.querySelector("fieldset[data-video-options]").hidden = !hasVideo;

    // To allow a preview without glitches
    fdo.width = Math.abs(fdo.width);
    fdo.height = Math.abs(fdo.height);

    // Handle tint exception
    const tint = fdo["texture.tint"];
    if ( !foundry.data.validators.isColorString(tint) ) fdo["texture.tint"] = "#ffffff";
    fdo["texture.tint"] = Color.from(fdo["texture.tint"]);

    // Update preview object
    foundry.utils.mergeObject(this.document, fdo);
    this.document.object.refresh();
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onClose(options) {
    super._onClose(options);
    if ( this.document.object?.isPreview ) this.document.object.destroy();
  }
}

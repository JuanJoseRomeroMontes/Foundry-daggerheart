import ApplicationV2 from "../api/application.mjs";
import HandlebarsApplicationMixin from "../api/handlebars-application.mjs";
import RegionDocument from "@client/documents/region.mjs";
import DragDrop from "../ux/drag-drop.mjs";

/**
 * Scene Region Legend.
 * @extends ApplicationV2
 * @mixes HandlebarsApplication
 */
export default class RegionLegend extends HandlebarsApplicationMixin(ApplicationV2) {

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    id: "region-legend",
    tag: "aside",
    window: {
      title: "REGION.LEGEND.title",
      icon: "fa-regular fa-game-board",
      minimizable: false
    },
    position: {width: 320},
    actions: {
      config: RegionLegend.#onConfig,
      control: RegionLegend.#onControl,
      create: RegionLegend.#onCreate,
      delete: RegionLegend.#onDelete,
      lock: RegionLegend.#onLock
    }
  };

  /** @override */
  static PARTS = {
    list: {
      id: "list",
      template: "templates/scene/region-legend.hbs",
      scrollable: ["ol.region-list"]
    }
  };

  /* -------------------------------------------- */

  /**
   * The currently filtered Regions.
   * @type {{bottom: number, top: number}}
   */
  #visibleRegions = new Set();

  /* -------------------------------------------- */

  /**
   * The currently viewed elevation range.
   * @type {{bottom: number, top: number}}
   */
  elevation = {bottom: -Infinity, top: Infinity};

  /* -------------------------------------------- */

  /** @type {foundry.applications.ux.SearchFilter} */
  #searchFilter = new foundry.applications.ux.SearchFilter({
    inputSelector: 'input[name="search"]',
    contentSelector: ".region-list",
    callback: this.#onSearchFilter.bind(this)
  });

  /* -------------------------------------------- */

  /**
   * Record a reference to the currently highlighted Region.
   * @type {Region|null}
   */
  #hoveredRegion = null;

  /* -------------------------------------------- */

  /** @override */
  _configureRenderOptions(options) {
    super._configureRenderOptions(options);
    if ( options.isFirstRender && ui.nav ) {
      const {right, top} = ui.nav.element.getBoundingClientRect();
      const uiScale = game.settings.get("core", "uiConfig").uiScale;
      options.position.left ??= right + (16 * uiScale);
      options.position.top ??= top;
    }
  }

  /* -------------------------------------------- */

  /** @override */
  _canRender(options) {
    const rc = options.renderContext;
    if ( rc && !["createregions", "updateregions", "deleteregions"].includes(rc) ) return false;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _renderFrame(options) {
    const frame = await super._renderFrame(options);
    this.window.close.remove(); // Prevent closing
    return frame;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async close(options={}) {
    if ( !options.closeKey ) return super.close(options);
    return this;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    canvas.scene.apps[this.id] = this;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onRender(context, options) {
    await super._onRender(context, options);
    new DragDrop.implementation({
      dragSelector: ".region-name",
      permissions: {
        dragstart: () => true,
        drop: () => false
      },
      callbacks: {
        dragstart: this.#onDragStart.bind(this)
      }
    }).bind(this.element);
    this.#searchFilter.bind(this.element);
    for ( const li of this.element.querySelectorAll(".region") ) {
      li.addEventListener("mouseover", this.#onRegionHoverIn.bind(this));
      li.addEventListener("mouseout", this.#onRegionHoverOut.bind(this));
    }
    this.element.querySelector("input[name=elevationBottom]")
      .addEventListener("change", this.#onElevationBottomChange.bind(this));
    this.element.querySelector("input[name=elevationTop]")
      .addEventListener("change", this.#onElevationTopChange.bind(this));
    this.#updateVisibleRegions();
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onClose(options) {
    super._onClose(options);
    this.#visibleRegions.clear();
    this.elevation.bottom = -Infinity;
    this.elevation.top = Infinity;
    if ( canvas.scene ) delete canvas.scene.apps[this.id];
  }

  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(_options) {
    const regions = canvas.scene.regions.map(r => this.#prepareRegion(r));
    regions.sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
    return {
      regions,
      elevation: {
        bottom: Number.isFinite(this.elevation.bottom) ? this.elevation.bottom : "",
        top: Number.isFinite(this.elevation.top) ? this.elevation.top : ""
      }
    };
  }

  /* -------------------------------------------- */

  /**
   * Prepare each Region for rendering in the legend.
   * @param {Region} region
   * @returns {object}
   */
  #prepareRegion(region) {
    const hasElv = Number.isFinite(region.elevation.bottom) || Number.isFinite(region.elevation.top);
    return {
      id: region.id,
      name: region.name,
      color: region.color.css,
      elevation: region.elevation,
      elevationLabel: hasElv ? `[${Number.isFinite(region.elevation.bottom)
        ? region.elevation.bottom.toNearest(0.01).toLocaleString(game.i18n.lang) : "&minus;&infin;"}, `
        + `${Number.isFinite(region.elevation.top) ? region.elevation.top.toNearest(0.01).toLocaleString(game.i18n.lang)
          : "&plus;&infin;"}]` : "",
      empty: !region.shapes.length,
      locked: region.locked,
      controlled: region.object?.controlled,
      hover: region.object?.hover,
      buttons: [
        {
          action: "config",
          icon: "fa-cogs",
          tooltip: game.i18n.localize("REGION.LEGEND.config"),
          disabled: ""
        },
        {
          action: "lock",
          icon: region.locked ? "fa-lock" : "fa-unlock",
          tooltip: game.i18n.localize(region.locked ? "REGION.LEGEND.unlock" : "REGION.LEGEND.lock"),
          disabled: ""
        },
        {
          action: "delete",
          icon: "fa-trash",
          tooltip: game.i18n.localize("REGION.LEGEND.delete"),
          disabled: region.locked ? "disabled" : ""
        }
      ]
    };
  }

  /* -------------------------------------------- */

  /**
   * Update the region list and hide regions that are not visible.
   */
  #updateVisibleRegions() {
    this.#visibleRegions.clear();
    for ( const li of this.element.querySelectorAll(".region-list > .region") ) {
      const id = li.dataset.regionId;
      const region = canvas.scene.regions.get(id);
      const hidden = !((this.#searchFilter.rgx?.test(this.#searchFilter.constructor.cleanQuery(region.name)) !== false)
        && (Math.max(region.elevation.bottom, this.elevation.bottom)
          <= Math.min(region.elevation.top, this.elevation.top)));
      if ( !hidden ) this.#visibleRegions.add(region);
      li.classList.toggle("hidden", hidden);
    }
    this.setPosition({height: "auto"});
    for ( const region of canvas.regions.placeables ) region.renderFlags.set({refreshState: true});
  }

  /* -------------------------------------------- */

  /**
   * An event that occurs when a drag workflow begins.
   * @param {DragEvent} event    The initiating drag start event
   */
  #onDragStart(event) {
    const regionId = event.currentTarget.closest("[data-region-id]").dataset.regionId;
    const region = canvas.scene.regions.get(regionId);
    const dragData = region.toDragData();
    event.dataTransfer.setData("text/plain", JSON.stringify(dragData));
  }

  /* -------------------------------------------- */

  /**
   * Filter regions.
   * @param {KeyboardEvent} event   The key-up event from keyboard input
   * @param {string} query          The raw string input to the search field
   * @param {RegExp} rgx            The regular expression to test against
   * @param {HTMLElement} html      The HTML element which should be filtered
   */
  #onSearchFilter(event, query, rgx, html) {
    if ( !this.rendered ) return;
    this.#updateVisibleRegions();
  }

  /* -------------------------------------------- */

  /**
   * Handle change events of the elevation range (bottom) input.
   * @param {KeyboardEvent} event
   */
  #onElevationBottomChange(event) {
    this.elevation.bottom = Number(event.currentTarget.value || -Infinity);
    this.#updateVisibleRegions();
  }

  /* -------------------------------------------- */

  /**
   * Handle change events of the elevation range (top) input.
   * @param {KeyboardEvent} event
   */
  #onElevationTopChange(event) {
    this.elevation.top = Number(event.currentTarget.value || Infinity);
    this.#updateVisibleRegions();
  }

  /* -------------------------------------------- */

  /**
   * Is this Region visible in this RegionLegend?
   * @param {Region} region    The region
   * @returns {boolean}
   * @internal
   */
  _isRegionVisible(region) {
    if ( !this.rendered ) return true;
    return this.#visibleRegions.has(region.document);
  }

  /* -------------------------------------------- */

  /**
   * Handle mouse-in events on a region in the legend.
   * @param {PointerEvent} event
   */
  #onRegionHoverIn(event) {
    event.preventDefault();
    if ( !canvas.ready ) return;
    const li = event.currentTarget.closest(".region");
    const region = canvas.regions.get(li.dataset.regionId);
    region._onHoverIn(event, {hoverOutOthers: true, updateLegend: false});
    this.#hoveredRegion = region;
    li.classList.add("hovered");
  }

  /* -------------------------------------------- */

  /**
   * Handle mouse-out events for a region in the legend.
   * @param {PointerEvent} event
   */
  #onRegionHoverOut(event) {
    event.preventDefault();
    const li = event.currentTarget.closest(".region");
    this.#hoveredRegion?._onHoverOut(event, {updateLegend: false});
    this.#hoveredRegion = null;
    li.classList.remove("hovered");
  }

  /* -------------------------------------------- */

  /**
   * Highlight a hovered region in the legend.
   * @param {Region} region    The Region
   * @param {boolean} hover    Whether they are being hovered in or out.
   * @internal
   */
  _hoverRegion(region, hover) {
    if ( !this.rendered ) return;
    const li = this.element.querySelector(`.region[data-region-id="${region.id}"]`);
    if ( !li ) return;
    if ( hover ) li.classList.add("hovered");
    else li.classList.remove("hovered");
  }

  /* -------------------------------------------- */

  /**
   * Handle clicks to configure a Region.
   * @param {PointerEvent} event
   */
  static #onConfig(event) {
    const regionId = event.target.closest(".region").dataset.regionId;
    const region = canvas.scene.regions.get(regionId);
    region.sheet.render({force: true});
  }

  /* -------------------------------------------- */

  /**
   * Handle clicks to assume control over a Region.
   * @param {PointerEvent} event
   */
  static #onControl(event) {
    const regionId = event.target.closest(".region").dataset.regionId;
    const region = canvas.scene.regions.get(regionId);

    // Double-click = toggle sheet
    if ( event.detail === 2 ) {
      region.object.control({releaseOthers: true});
      region.sheet.render({force: true});
    }

    // Single-click = toggle control
    else if ( event.detail === 1 ) {
      if ( region.object.controlled ) region.object.release();
      else region.object.control({releaseOthers: true});
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle button clicks to create a new Region.
   * @param {PointerEvent} event
   */
  static async #onCreate(event) {
    await canvas.scene.createEmbeddedDocuments("Region", [{
      name: RegionDocument.implementation.defaultName({parent: canvas.scene})
    }]);
  }

  /* -------------------------------------------- */

  /**
   * Handle clicks to delete a Region.
   * @param {PointerEvent} event
   */
  static async #onDelete(event) {
    const regionId = event.target.closest(".region").dataset.regionId;
    const region = canvas.scene.regions.get(regionId);
    await region.deleteDialog();
  }

  /* -------------------------------------------- */

  /**
   * Handle clicks to toggle the locked state of a Region.
   * @param {PointerEvent} event
   */
  static async #onLock(event) {
    const regionId = event.target.closest(".region").dataset.regionId;
    const region = canvas.scene.regions.get(regionId);
    await region.update({locked: !region.locked});
  }
}

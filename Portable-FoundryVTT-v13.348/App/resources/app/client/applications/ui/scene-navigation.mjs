import ApplicationV2 from "../api/application.mjs";
import HandlebarsApplicationMixin from "../api/handlebars-application.mjs";
import Hooks from "../../helpers/hooks.mjs";

/**
 * The Scene Navigation UI element.
 * @extends ApplicationV2
 * @mixes HandlebarsApplication
 */
export default class SceneNavigation extends HandlebarsApplicationMixin(ApplicationV2) {

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    id: "scene-navigation",
    classes: ["faded-ui", "flexcol"],
    tag: "nav",
    window: {
      frame: false,
      positioned: false
    },
    actions: {
      viewScene: SceneNavigation.#onViewScene,
      toggleExpand: SceneNavigation.#onToggleExpand
    }
  };

  /** @override */
  static PARTS = {
    scenes: {
      root: true,
      template: "templates/ui/scene-navigation.hbs"
    }
  };

  /**
   * A reference to the Scene currently being dragged.
   * @type {Scene}
   */
  #dragScene;

  /**
   * An HTMLElement which is temporarily the drop target for a drag-and-drop operation.
   * @type {HTMLElement}
   */
  #dropTarget;

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * Whether the scene navigation is currently expanded.
   * @type {boolean}
   */
  get expanded() {
    return this.element.classList.contains("expanded");
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(_options) {
    const scenes = this.#prepareScenes();
    return {
      scenes,
      canExpand: scenes.inactive.length
    };
  }

  /* -------------------------------------------- */

  /**
   * Prepare Scene data for rendering.
   * @returns {{inactive: object[], active: object[]}}
   */
  #prepareScenes() {
    const userScenes = game.users.reduce((obj, u) => {
      if ( !u.active ) return obj;
      obj[u.viewedScene] ||= [];
      obj[u.viewedScene].push({name: u.name, letter: u.name[0], color: u.color.multiply(0.5).css, border: u.color});
      return obj;
    }, {});
    const scenes = {active: [], inactive: []};
    for ( const scene of game.scenes ) {
      const {active, isView} = scene;
      const visible = active || isView || (scene.navigation && scene.visible);
      if ( !visible ) continue;
      const s = {
        id: scene.id,
        active,
        isView,
        navOrder: scene.navOrder,
        name: scene.navName || scene.name,
        tooltip: (scene.navName && game.user.isGM) ? scene.name : "",
        users: userScenes[scene.id],
        cssClass: [
          isView ? "view" : null,
          active ? "active" : null,
          scene.ownership.default === 0 ? "gm" : null
        ].filterJoin(" ")
      };
      if ( active || isView || s.users?.length ) scenes.active.push(s);
      else scenes.inactive.push(s);
    }
    scenes.active.sort((a, b) => (b.isView - a.isView) || (b.active - a.active) || (a.navOrder - b.navOrder));
    scenes.inactive.sort((a, b) => a.navOrder - b.navOrder);
    return scenes;
  }

  /* -------------------------------------------- */

  /** @override */
  async _onFirstRender(_context, _options) {
    game.scenes.apps.push(this);
    if ( !game.user.isGM ) return;
    /** @fires {hookEvents:getSceneContextOptions} */
    this._createContextMenu(this._getContextMenuOptions, ".scene", {
      fixed: true,
      hookName: "getSceneContextOptions",
      parentClassHooks: false
    });
  }

  /* -------------------------------------------- */

  /** @override */
  async _onRender(_context, _options) {
    this.#setCollapseTooltip(`SCENE_NAVIGATION.${this.expanded ? "COLLAPSE" : "EXPAND"}`);
    if ( !game.user.isGM ) return;

    // Drag and Drop
    new foundry.applications.ux.DragDrop.implementation({
      dragSelector: ".scene",
      dropSelector: "#scene-navigation-inactive",
      callbacks: {
        dragstart: this.#onDragStart.bind(this),
        dragover: this.#onDragOver.bind(this),
        drop: this.#onDragDrop.bind(this)
      }
    }).bind(this.element);
  }

  /* -------------------------------------------- */

  /**
   * Toggle the tooltip and aria-label properties of the collapse/expand button.
   * @param {string} tooltip
   */
  #setCollapseTooltip(tooltip) {
    const button = this.element.querySelector("#scene-navigation-expand");
    if ( !button ) return;
    button.dataset.tooltip = tooltip;
    button.setAttribute("aria-label", game.i18n.localize(tooltip));
  }

  /* -------------------------------------------- */

  /**
   * Get the set of ContextMenu options which should be applied for Scenes in the menu.
   * @returns {ContextMenuEntry[]}   The Array of context options passed to the ContextMenu instance
   * @protected
   */
  _getContextMenuOptions() {
    return [
      {
        name: "SCENE.Activate",
        icon: '<i class="fa-solid fa-bullseye"></i>',
        condition: li => game.user.isGM && !game.scenes.get(li.dataset.sceneId).active,
        callback: li => {
          const scene = game.scenes.get(li.dataset.sceneId);
          scene.activate();
        }
      },
      {
        name: "SCENE.Configure",
        icon: '<i class="fa-solid fa-gears"></i>',
        condition: game.user.isGM,
        callback: li => {
          const scene = game.scenes.get(li.dataset.sceneId);
          scene.sheet.render(true);
        }
      },
      {
        name: "SCENE.Notes",
        icon: '<i class="fa-solid fa-scroll"></i>',
        condition: li => {
          if ( !game.user.isGM ) return false;
          const scene = game.scenes.get(li.dataset.sceneId);
          return !!scene.journal;
        },
        callback: li => {
          const scene = game.scenes.get(li.dataset.sceneId);
          const entry = scene.journal;
          if ( entry ) {
            const sheet = entry.sheet;
            const options = {};
            if ( scene.journalEntryPage ) options.pageId = scene.journalEntryPage;
            sheet.render(true, options);
          }
        }
      },
      {
        name: "SCENE.Preload",
        icon: '<i class="fa-solid fa-download"></i>',
        condition: game.user.isGM,
        callback: li => {
          const sceneId = li.dataset.sceneId;
          game.scenes.preload(sceneId, true);
        }
      },
      {
        name: "SCENE.ToggleNav",
        icon: '<i class="fas fa-compass"></i>',
        condition: li => {
          const scene = game.scenes.get(li.dataset.sceneId);
          return game.user.isGM && !scene.active;
        },
        callback: li => {
          const scene = game.scenes.get(li.dataset.sceneId);
          scene.update({navigation: !scene.navigation});
        }
      }
    ];
  }

  /* -------------------------------------------- */
  /*  Public API                                 */
  /* -------------------------------------------- */

  /**
   * Expand Scene Navigation, displaying inactive Scenes.
   * @fires {hookEvents:collapseSceneNavigation}
   */
  expand() {
    this.toggleExpanded(true);
  }

  /* -------------------------------------------- */

  /**
   * Collapse Scene Navigation, hiding inactive Scenes.
   * @fires {hookEvents:collapseSceneNavigation}
   */
  async collapse() {
    this.toggleExpanded(false);
  }

  /* -------------------------------------------- */

  /**
   * Toggle the expanded state of scene navigation.
   * @param {boolean} [expanded]  Force the expanded state to the provided value, otherwise toggle the state.
   * @fires {hookEvents:collapseSceneNavigation}
   */
  toggleExpanded(expanded) {
    expanded ??= !this.expanded;
    this.element.classList.toggle("expanded");
    this.#setCollapseTooltip(`SCENE_NAVIGATION.${expanded ? "COLLAPSE" : "EXPAND"}`);
    Hooks.callAll("collapseSceneNavigation", this, !expanded);
  }

  /* -------------------------------------------- */
  /*  Action Event Handlers                      */
  /* -------------------------------------------- */

  /**
   * Handle a click event to view a certain Scene.
   * @this {SceneNavigation}
   * @param {PointerEvent} event
   * @returns {Promise<void>}
   */
  static async #onViewScene(event) {
    const sceneId = event.target.closest(".scene").dataset.sceneId;
    const scene = game.scenes.get(sceneId);
    if ( !scene ) return;
    await scene.view();
  }

  /* -------------------------------------------- */

  /**
   * Handle a click event to view a certain Scene.
   * @this {SceneNavigation}
   */
  static #onToggleExpand() {
    this.toggleExpanded();
  }

  /* -------------------------------------------- */

  /**
   * Begin dragging a Scene to change its navigation order.
   * @param {DragEvent} event
   */
  #onDragStart(event) {
    const target = event.target.closest(".scene");
    this.#dragScene = game.scenes.get(target.dataset.sceneId);
  }

  /* -------------------------------------------- */

  /**
   * Highlight the Scene which becomes the drop target for drag-and-drop handling.
   * @param {DragEvent} event
   */
  #onDragOver(event) {
    const target = event.target.closest(".scene");
    if ( target === this.#dropTarget ) return;

    // Remove drop target highlight
    if ( this.#dropTarget ) this.#dropTarget.classList.remove("drop-target-before", "drop-target-after");
    this.#dropTarget = target;
    if ( !target || ( target.dataset.sceneId === this.#dragScene.id) ) return;

    // Add drop target highlight
    const scene = game.scenes.get(target.dataset.sceneId);
    const dropClass = this.#dragScene.navOrder < scene.navOrder ? "drop-target-after" : "drop-target-before";
    target.classList.add(dropClass);
  }

  /* -------------------------------------------- */

  /**
   * Conclude dragging a Scene to change its navigation order.
   * @param {DragEvent} event
   */
  async #onDragDrop(event) {
    if ( this.#dropTarget ) {
      this.#dropTarget.classList.remove("drop-target-before", "drop-target-after");
      this.#dropTarget = undefined;
    }

    // Retrieve the drag target Scene
    const scene = this.#dragScene;
    this.#dragScene = undefined;
    if ( !scene ) return;

    // Retrieve the drop target Scene
    const li = event.target.closest(".scene");
    const target = game.scenes.get(li?.dataset.sceneId);
    if ( !target || (target === scene) ) return;

    // Sort Scenes on navOrder relative to siblings
    const siblings = game.scenes.filter(s => s !== scene);
    await scene.sortRelative({sortKey: "navOrder", target, siblings});
  }

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /**
   * @deprecated since v13
   * @ignore
   */
  static displayProgressBar({label, pct} = {}) {
    foundry.utils.logCompatibilityWarning("SceneNavigation.displayProgressBar is deprecated in favor of "
      + "Notifications#notify using the {progress: true} option", {since: 13, until: 15});
    let bar = SceneNavigation.#loadingBar;
    if ( !bar || !ui.notifications.has(bar) ) {
      bar = SceneNavigation.#loadingBar = ui.notifications.info(label, {progress: true});
    }
    pct = Math.clamp(pct, 0, 100) / 100;
    bar.update({message: label, pct});
  }

  static #loadingBar;
}

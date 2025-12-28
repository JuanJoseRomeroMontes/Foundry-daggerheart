import ApplicationV2 from "../api/application.mjs";
import HandlebarsApplicationMixin from "../api/handlebars-application.mjs";

/**
 * The main menu application which is toggled via the ESC key.
 * @extends ApplicationV2
 * @mixes HandlebarsApplication
 */
export default class MainMenu extends HandlebarsApplicationMixin(ApplicationV2) {

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    id: "menu",
    classes: ["themed", "theme-dark"],
    tag: "dialog",
    window: {
      frame: false,
      positioned: false
    },
    actions: {
      menuItem: MainMenu.#onClickMenuItem
    }
  };

  /** @override */
  static PARTS = {
    items: {
      template: "templates/ui/main-menu.hbs"
    }
  };

  /**
   * @typedef MainMenuItem
   * @property {string} label
   * @property {string} icon
   * @property {boolean|function():boolean} enbaled
   * @property {function(event):void} onClick
   */

  /**
   * Configuration of Main Menu items.
   * @type {Record<string, MainMenuItem>}
   */
  static ITEMS = {
    reload: {
      label: "MENU.Reload",
      icon: '<i class="fa-solid fa-arrow-rotate-right"></i>',
      enabled: true,
      onClick: () => window.location.reload()
    },
    logout: {
      label: "MENU.Logout",
      icon: '<i class="fa-solid fa-user"></i>',
      enabled: true,
      onClick: () => game.logOut()
    },
    players: {
      label: "MENU.Players",
      icon: '<i class="fa-solid fa-users"></i>',
      enabled: () => game.user.isGM && !game.data.demoMode,
      onClick: () => window.location.href = "./players"
    },
    world: {
      label: "GAME.ReturnSetup",
      icon: '<i class="fa-solid fa-globe"></i>',
      enabled: () => game.user.hasRole("GAMEMASTER") && !game.data.demoMode,
      onClick: function() {
        this.close();
        game.shutDown();
      }
    }
  };

  /* ----------------------------------------- */

  /**
   * A record of menu items which are currently enabled.
   * @returns {Record<string, MainMenuItem>}
   */
  get items() {
    const items = {};
    for ( const [k, v] of Object.entries(MainMenu.ITEMS) ) {
      if ( (v.enabled === false) || ((v.enabled instanceof Function) && !v.enabled()) ) continue;
      items[k] = v;
    }
    return items;
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @override */
  _insertElement(element) {
    const existing = document.getElementById(element.id);
    if ( existing ) existing.replaceWith(element);
    else {
      const parent = document.getElementById("interface");
      parent.append(element);
    }
  }

  /* -------------------------------------------- */

  /** @override */
  async _onFirstRender(context, options) {
    this.element.showModal();
  }

  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(_options) {
    return {
      items: this.items
    };
  }

  /* ----------------------------------------- */

  /**
   * Toggle display of the menu, or render it in the first place.
   * @returns {Promise<void>}
   */
  async toggle() {
    if ( this.rendered ) {
      this.element.classList.remove("active");
      await this._awaitTransition(this.element, 10000);
      await this.close();
    } else {
      await this.render({force: true});
      this.element.classList.add("active");
    }
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /**
   * Handle click actions on menu items.
   * @this {MainMenu}
   * @param {PointerEvent} event
   */
  static #onClickMenuItem(event) {
    const li = event.target.closest(".menu-item");
    const item = this.items[li.dataset.menuItem];
    if ( item.onClick instanceof Function ) item.onClick.call(this, event);
  }
}

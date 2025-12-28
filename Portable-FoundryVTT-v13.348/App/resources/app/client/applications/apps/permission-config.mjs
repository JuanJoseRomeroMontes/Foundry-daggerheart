import ApplicationV2 from "../api/application.mjs";
import HandlebarsApplicationMixin from "../api/handlebars-application.mjs";

/**
 * An application for configuring the permissions which are available to each User role.
 * @extends ApplicationV2
 * @mixes HandlebarsApplication
 */
export default class PermissionConfig extends HandlebarsApplicationMixin(ApplicationV2) {

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    id: "permissions-config",
    tag: "form",
    window: {
      contentClasses: ["standard-form"],
      icon: "fa-solid fa-shield-keyhole",
      title: "PERMISSION.Title"
    },
    position: {width: 660},
    form: {
      closeOnSubmit: true,
      handler: PermissionConfig.#onSubmit
    },
    actions: {
      reset: PermissionConfig.#onReset
    }
  };

  /** @override */
  static PARTS = {
    permissions: {
      id: "permissions",
      template: "templates/apps/permission-config.hbs",
      root: true,
      scrollable: [".permissions-list"]
    },
    footer: {
      template: "templates/generic/form-footer.hbs"
    }
  };


  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(_options={}) {
    const current = await game.settings.get("core", "permissions");
    return {
      roles: Object.keys(CONST.USER_ROLES).reduce((obj, r) => {
        if ( r === "NONE" ) return obj;
        obj[r] = `USER.Role${r.titleCase()}`;
        return obj;
      }, {}),
      permissions: this.#preparePermissions(current),
      buttons: [
        {type: "reset", action: "reset", icon: "fa-solid fa-arrows-rotate", label: "PERMISSION.Reset"},
        {type: "submit", icon: "fa-solid fa-floppy-disk", label: "PERMISSION.Submit"}
      ]
    };
  }

  /* -------------------------------------------- */

  /**
   * Prepare the permissions object used to render the configuration template
   * @param {object} current      The current permission configuration
   * @returns {object[]}          Permission data for sheet rendering
   */
  #preparePermissions(current) {
    const r = CONST.USER_ROLES;
    const rgm = r.GAMEMASTER;

    // Get permissions
    const perms = Object.entries(CONST.USER_PERMISSIONS).reduce((arr, e) => {
      const perm = foundry.utils.deepClone(e[1]);
      perm.id = e[0];
      perm.label = game.i18n.localize(perm.label);
      perm.hint = game.i18n.localize(perm.hint);
      arr.push(perm);
      return arr;
    }, []);
    perms.sort((a, b) => a.label.localeCompare(b.label, game.i18n.lang));

    // Configure permission roles
    for ( const p of perms ) {
      const roles = current[p.id] || Array.fromRange(rgm + 1).slice(p.defaultRole);
      p.roles = Object.values(r).reduce((arr, role) => {
        if ( role === r.NONE ) return arr;
        arr.push({
          name: `${p.id}.${role}`,
          value: roles.includes(role),
          readonly: (role === rgm) && (!p.disableGM) ? "readonly" : ""
        });
        return arr;
      }, []);
    }
    return perms;
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /**
   * Handle submission
   * @this {DocumentSheetV2}                      The handler is called with the application as its bound scope
   * @param {SubmitEvent} event                   The originating form submission event
   * @param {HTMLFormElement} form                The form element that was submitted
   * @param {FormDataExtended} formData           Processed data for the submitted form
   * @returns {Promise<void>}
   */
  static async #onSubmit(event, form, formData) {
    const permissions = foundry.utils.expandObject(formData.object);
    for ( const [k, v] of Object.entries(permissions) ) {
      if ( !(k in CONST.USER_PERMISSIONS ) ) {
        delete permissions[k];
        continue;
      }
      permissions[k] = Object.entries(v).reduce((arr, r) => {
        if ( r[1] === true ) arr.push(parseInt(r[0]));
        return arr;
      }, []);
    }
    await game.settings.set("core", "permissions", permissions);
    ui.notifications.info("SETTINGS.PermissionUpdate", {localize: true});
  }

  /* -------------------------------------------- */

  /**
   * Handle click actions to reset all permissions back to their initial state.
   * @this {PermissionConfig}
   * @param {PointerEvent} event
   * @returns {Promise<void>}
   */
  static async #onReset(event) {
    event.preventDefault();
    const defaults = Object.entries(CONST.USER_PERMISSIONS).reduce((obj, [id, perm]) => {
      obj[id] = Array.fromRange(CONST.USER_ROLES.GAMEMASTER + 1).slice(perm.defaultRole);
      return obj;
    }, {});
    await game.settings.set("core", "permissions", defaults);
    ui.notifications.info("SETTINGS.PermissionReset", {localize: true});
    await this.render();
  }
}

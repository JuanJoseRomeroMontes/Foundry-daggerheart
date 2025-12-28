import {ApplicationV2, HandlebarsApplicationMixin} from "../../api/_module.mjs";

/**
 * @import {ApplicationClickAction} from "@client/applications/_types.mjs";
 */

export default class InvitationLinks extends HandlebarsApplicationMixin(ApplicationV2) {

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    id: "invitation-links",
    position: {width: 420},
    window: {
      contentClasses: ["standard-form"],
      icon: "fa-solid fa-wifi",
      title: "INVITATIONS.Title"
    },
    actions: {
      copyLink: InvitationLinks.#onCopyLink,
      recheckInternet: InvitationLinks.#onRecheckInternet,
      showLink: InvitationLinks.#onShowLink,
      hideLink: InvitationLinks.#onHideLink
    }
  };

  /** @override */
  static PARTS = {
    body: {template: "templates/sidebar/apps/invitation-links.hbs", root: true}
  };

  /* -------------------------------------------- */

  /** @override */
  async _prepareContext() {
    const addresses = game.data.addresses;
    // Check for IPv6 detection, and don't display connectivity info if so
    if ( addresses.remote === undefined ) return addresses;

    // Otherwise, handle remote connection test
    if ( addresses.remoteIsAccessible === null ) {
      addresses.remoteClass = "unknown-connection";
      addresses.remoteTitle = game.i18n.localize("INVITATIONS.UnknownConnection");
      addresses.failedCheck = true;
    }
    else if ( addresses.remoteIsAccessible ) {
      addresses.remoteClass = "connection";
      addresses.remoteTitle = game.i18n.localize("INVITATIONS.OpenConnection");
      addresses.canConnect = true;
    }
    else {
      addresses.remoteClass = "no-connection";
      addresses.remoteTitle = game.i18n.localize("INVITATIONS.ClosedConnection");
      addresses.canConnect = false;
    }
    return {...addresses, rootId: this.id};
  }

  /* -------------------------------------------- */

  /**
   * Copy the local or public URL to the server
   * @this {InvitationLinks}
   * @type {ApplicationClickAction}
   */
  static #onCopyLink(_event, target) {
    target.select();
    game.clipboard.copyPlainText(target.value);
    ui.notifications.info("INVITATIONS.Copied", {localize: true});
  }

  /* -------------------------------------------- */

  /**
   * Hide the local or public URL to the server
   * @this {InvitationLinks}
   * @type {ApplicationClickAction}
   */
  static #onRecheckInternet(event, target) {
    event.preventDefault();
    const icon = target.querySelector("i");
    icon.className = "fa-solid fa-arrows-rotate fa-pulse";
    setTimeout(() => {
      game.socket.emit("refreshAddresses", addresses => {
        game.data.addresses = addresses;
        this.render();
      });
    }, 250);
  }

  /* -------------------------------------------- */

  /**
   * Show the local or public URL to the server
   * @this {InvitationLinks}
   * @type {ApplicationClickAction}
   */
  static #onShowLink(_event, target) {
    const icon = target.querySelector("i");
    const input = this.element.querySelector(`#${this.id}-internet`);
    target.dataset.action = "hideLink";
    icon.classList.replace("fa-eye", "fa-eye-slash");
    input.type = "text";
  }

  /* -------------------------------------------- */

  /**
   * Hide the local or public URL to the server
   * @this {InvitationLinks}
   * @type {ApplicationClickAction}
   */
  static #onHideLink(_event, target) {
    const icon = target.querySelector("i");
    const input = this.element.querySelector(`#${this.id}-internet`);
    target.dataset.action = "showLink";
    icon.classList.replace("fa-eye-slash", "fa-eye");
    input.type = "password";
  }
}

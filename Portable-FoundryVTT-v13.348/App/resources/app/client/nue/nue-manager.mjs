import Hooks from "../helpers/hooks.mjs";
import ChatMessage from "../documents/chat-message.mjs";
import Scene from "@client/documents/scene.mjs";

/**
 * Responsible for managing the New User Experience workflows.
 * @see {@link foundry.Game#nue}
 */
export default class NewUserExperienceManager {
  constructor() {
    if ( game.nue ) throw new Error("You may not re-construct the singleton NewUserExperienceManager");
    Hooks.on("renderChatMessageHTML", this.#onRenderChatMessageHTML.bind(this));
  }

  /* -------------------------------------------- */

  /**
   * Initialize the new user experience.
   * Currently, this generates some chat messages with hints for getting started if we detect this is a new world.
   */
  initialize() {
    // If there are no documents, we can reasonably assume this is a new World.
    const isNewWorld = !(game.actors.size + game.scenes.size + game.items.size + game.journal.size);
    if ( !isNewWorld ) return;
    this.#createInitialChatMessages();
    // noinspection JSIgnoredPromiseFromCall
    this.#showNewWorldTour();
  }

  /* -------------------------------------------- */

  /**
   * Show chat tips for first launch.
   */
  #createInitialChatMessages() {
    if ( game.settings.get("core", "nue.shownTips") ) return;

    // Get GM's
    const gms = ChatMessage.implementation.getWhisperRecipients("GM");

    // Build Chat Messages
    const content = [`
      <h3 class="nue">${game.i18n.localize("NUE.FirstLaunchHeader")}</h3>
      <p class="nue">${game.i18n.localize("NUE.FirstLaunchBody")}</p>
      <p class="nue">${game.i18n.localize("NUE.FirstLaunchKB")}</p>
      <footer class="nue">${game.i18n.localize("NUE.FirstLaunchHint")}</footer>
    `, `
      <h3 class="nue">${game.i18n.localize("NUE.FirstLaunchInvite")}</h3>
      <p class="nue">${game.i18n.localize("NUE.FirstLaunchInviteBody")}</p>
      <p class="nue">${game.i18n.localize("NUE.FirstLaunchTroubleshooting")}</p>
      <footer class="nue">${game.i18n.localize("NUE.FirstLaunchHint")}</footer>
    `];
    const chatData = content.map(c => {
      return {
        whisper: gms,
        speaker: {alias: game.i18n.localize("Foundry Virtual Tabletop")},
        flags: {core: {nue: true, canPopout: true}},
        content: c
      };
    });
    ChatMessage.implementation.createDocuments(chatData);

    // Store flag indicating this was shown
    game.settings.set("core", "nue.shownTips", true);
  }

  /* -------------------------------------------- */

  /**
   * Create a default scene for the new world.
   * @param {Partial<SceneData>} sceneData      Additional data to merge with the default scene
   * @returns {Promise<Scene>}                  The created default scene
   */
  async createDefaultScene(sceneData={}) {
    const filePath = foundry.utils.getRoute("/nue/defaultscene/scene.json");
    const response = await foundry.utils.fetchWithTimeout(filePath, {method: "GET"});
    const json = await response.json();
    delete sceneData._id;
    sceneData = foundry.utils.mergeObject(json, sceneData);
    return Scene.implementation.create(sceneData, {keepId: true});
  }

  /* -------------------------------------------- */

  /**
   * Automatically show uncompleted Tours related to new worlds.
   */
  async #showNewWorldTour() {
    const tour = game.tours.get("core.welcome");
    if ( tour?.status === foundry.nue.Tour.STATUS.UNSTARTED ) {

      // Get or create the welcome Scene
      let scene = game.scenes.get("NUEDEFAULTSCENE0");
      if ( scene ) await scene.view();
      else if ( Scene.canUserCreate(game.user) ) scene = await this.createDefaultScene({active: true});
      if ( scene ) {
        await new Promise(resolve => window.setTimeout(resolve, 1000));
        await canvas.animatePan({...scene.dimensions.rect.center, scale: 0.7, duration: 1000});
      }

      // Start the tour
      tour.start();
    }
  }

  /* -------------------------------------------- */

  /**
   * Add event listeners to the chat card links.
   * @param {ChatMessage} msg     The ChatMessage being rendered.
   * @param {HTMLElement} html    The HTML content of the message.
   */
  #onRenderChatMessageHTML(msg, html) {
    if ( !msg.getFlag("core", "nue") ) return;
    html.querySelectorAll(".nue-tab").forEach(e => e.addEventListener("click", this.#onTabLink.bind(this)));
    html.querySelectorAll(".nue-action").forEach(e => e.addEventListener("click", this.#onActionLink.bind(this)));
  }

  /* -------------------------------------------- */

  /**
   * Perform some special action triggered by clicking on a link in a NUE chat card.
   * @param {TriggeredEvent} event  The click event.
   */
  #onActionLink(event) {
    event.preventDefault();
    const action = event.currentTarget.dataset.action;
    switch ( action ) {
      case "invite": return new foundry.applications.sidebar.apps.InvitationLinks().render({force: true});
    }
  }

  /* -------------------------------------------- */

  /**
   * Switch to the appropriate tab when a user clicks on a link in the chat message.
   * @param {TriggeredEvent} event  The click event.
   */
  #onTabLink(event) {
    event.preventDefault();
    const tab = event.currentTarget.dataset.tab;
    ui[tab]?.activate();
  }
}

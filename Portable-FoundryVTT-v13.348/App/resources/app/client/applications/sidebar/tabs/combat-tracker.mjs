import HandlebarsApplicationMixin from "../../api/handlebars-application.mjs";
import AbstractSidebarTab from "../sidebar-tab.mjs";
import Combat from "@client/documents/combat.mjs";

/**
 * @import {ApplicationRenderContext} from "../../_types.mjs";
 * @import {HandlebarsRenderOptions} from "../../api/handlebars-application.mjs";
 * @import {ContextMenuEntry} from "../../ux/context-menu.mjs";
 * @import Scene from "@client/documents/scene.mjs";
 */

/**
 * An Application that manages switching between Combats and tracking the Combatants in those Combats.
 * @extends {AbstractSidebarTab}
 * @mixes HandlebarsApplication
 */
export default class CombatTracker extends HandlebarsApplicationMixin(AbstractSidebarTab) {

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    window: {
      title: "COMBAT.SidebarTitle"
    },
    actions: {
      activateCombatant: CombatTracker.#onCombatantMouseDown,
      cycleCombat: CombatTracker.#onCombatCycle,
      createCombat: CombatTracker.#onCombatCreate,
      panToCombatant: CombatTracker.#onCombatantControl,
      pingCombatant: CombatTracker.#onCombatantControl,
      rollInitiative: CombatTracker.#onCombatantControl,
      toggleDefeated: CombatTracker.#onCombatantControl,
      toggleHidden: CombatTracker.#onCombatantControl,
      trackerSettings: CombatTracker.#onConfigure
    }
  };

  /** @override */
  static tabName = "combat";

  /** @override */
  static PARTS = {
    header: {
      template: "templates/sidebar/tabs/combat/header.hbs"
    },
    tracker: {
      template: "templates/sidebar/tabs/combat/tracker.hbs",
      scrollable: [""]
    },
    footer: {
      template: "templates/sidebar/tabs/combat/footer.hbs"
    }
  };

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * The list combats applicable to the active Scene.
   * @type {Combat[]}
   */
  get combats() {
    return game.combats.combats;
  }

  /**
   * Record a reference to the currently highlighted Token.
   * @type {Token|null}
   */
  #highlighted = null;

  /**
   * Record the currently tracked combat encounter.
   * @type {Combat|null}
   */
  get viewed() {
    if ( this.isPopout ) return ui.combat.viewed;
    return this.#viewed;
  }

  set viewed(combat) {
    if ( this.isPopout ) ui.combat.viewed = combat;
    else {
      if ( combat !== this.#viewed ) this.#highlighted = null;
      this.#viewed = combat || null;
    }
  }

  #viewed = null;

  /**
   * The Scene linked to the currently viewed Combat, if any
   * @type {Scene|null}
   */
  get scene() {
    return this.viewed?.scene ?? null;
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _configureRenderOptions(options) {
    super._configureRenderOptions(options);
    let combat = "combat" in options ? options.combat : this.viewed;
    if ( !this.isPopout && (combat === null) ) {
      combat = this.#inferCombat();
      combat?.updateCombatantActors();
    }
    this.viewed = combat;
  }

  /* -------------------------------------------- */

  /**
   * Format a tooltip for displaying overflowing effects.
   * @param {{ img: string, name: string }[]} effects  The effect names and icons.
   * @returns {string}
   * @protected
   */
  _formatEffectsTooltip(effects) {
    if ( !effects.length ) return "";
    const ul = document.createElement("ul");
    ul.classList.add("effects-tooltip", "plain");
    for ( const effect of effects ) {
      const img = document.createElement("img");
      img.src = effect.img;
      img.alt = effect.name;
      const span = document.createElement("span");
      span.textContent = effect.name;
      const li = document.createElement("li");
      li.append(img, span);
      ul.append(li);
    }
    return ul.outerHTML;
  }

  /* -------------------------------------------- */

  /**
   * Retrieve a source image for a combatant. If it is a video, use the first frame.
   * @param {Combatant} combatant  The Combatant.
   * @returns {Promise<string>}    The image URL.
   * @protected
   */
  async _getCombatantThumbnail(combatant) {
    if ( combatant._videoSrc && !combatant.img ) {
      if ( combatant._thumb ) return combatant._thumb;
      return combatant._thumb = await game.video.createThumbnail(combatant._videoSrc, { width: 100, height: 100 });
    }
    return combatant.img ?? CONST.DEFAULT_TOKEN;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    if ( !this.isPopout ) game.combats.apps.push(this);

    // Combatant context menu
    /** @fires {hookEvents:getCombatantContextOptions} */
    this._createContextMenu(this._getEntryContextOptions, ".combatant", {fixed: true});

    // Combat controls menu
    if ( game.user.isGM ) {
      /** @fires {hookEvents:getCombatContextOptions} */
      this._createContextMenu(this._getCombatContextOptions, ".encounter-context-menu", {
        eventName: "click",
        fixed: true,
        hookName: "getCombatContextOptions",
        parentClassHooks: false
      });
    }
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onRender(context, options) {
    await super._onRender(context, options);
    const { parts, renderContext, renderData } = options;
    const data = (renderData ?? []).find(d => d._id === this.viewed?.id);
    // If the turn changes and the active combatant is out of view, scroll it into view.
    if ( parts.includes("tracker") && (renderContext === "updateCombat") && ("turn" in (data ?? {})) ) {
      const tracker = this.element.querySelector(".combat-tracker");
      const active = tracker.querySelector(".combatant.active");
      if ( ((active?.offsetTop ?? 0) - tracker.offsetTop) <= tracker.scrollTop ) active?.scrollIntoView(true);
      if ( active?.offsetTop >= (tracker.offsetHeight + tracker.scrollTop) ) active?.scrollIntoView(false);
    }
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    switch ( partId ) {
      case "footer": case "header": await this._prepareCombatContext(context, options); break;
      case "tracker": await this._prepareTrackerContext(context, options); break;
    }
    return context;
  }

  /* -------------------------------------------- */

  /**
   * Prepare render context for the footer part.
   * @param {ApplicationRenderContext} context
   * @param {HandlebarsRenderOptions} options
   * @returns {Promise<void>}
   * @protected
   */
  async _prepareCombatContext(context, options) {
    const combat = this.viewed;
    const hasCombat = combat !== null;
    const combats = this.combats;
    const currentIdx = combats.indexOf(combat);
    const previousId = combats[currentIdx - 1]?.id;
    const nextId = combats[currentIdx + 1]?.id;
    const isPlayerTurn = combat?.combatant?.players?.includes(game.user);
    const canControl = combat?.turn && combat.turn.between(1, combat.turns.length - 2)
      ? combat.canUserModify(game.user, "update", { turn: 0 })
      : combat?.canUserModify(game.user, "update", { round: 0 });

    Object.assign(context, {
      combat, hasCombat, nextId, previousId,
      combats: combats.map(({ id }, i) => ({ id, label: i + 1, active: i === currentIdx })),
      control: isPlayerTurn && canControl,
      css: combats.length > 7 ? "cycle" : combats.length ? "tabbed" : "",
      currentIndex: currentIdx + 1,
      displayCycle: combats.length > 7,
      initiativeIcon: CONFIG.Combat.initiativeIcon,
      linked: combat?.scene !== null,
      labels: {
        scope: game.i18n.localize(`COMBAT.${combat?.scene ? "Linked" : "Unlinked"}`)
      }
    });
  }

  /* -------------------------------------------- */

  /**
   * Prepare render context for the tracker part.
   * @param {ApplicationRenderContext} context
   * @param {HandlebarsRenderOptions} options
   * @returns {Promise<void>}
   * @protected
   */
  async _prepareTrackerContext(context, options) {
    const combat = this.viewed;
    if ( !combat ) return;
    let hasDecimals = false;
    const turns = context.turns = [];
    for ( const [i, combatant] of combat.turns.entries() ) {
      if ( !combatant.visible ) continue;
      const turn = await this._prepareTurnContext(combat, combatant, i);
      if ( turn.hasDecimals ) hasDecimals = true;
      turns.push(turn);
    }

    // Format initiative numeric precision.
    const precision = CONFIG.Combat.initiative.decimals;
    turns.forEach(t => {
      if ( Number.isFinite(t.initiative) ) t.initiative = t.initiative.toFixed(hasDecimals ? precision : 0);
    });
    context.hasDecimals = hasDecimals;
  }

  /* -------------------------------------------- */

  /**
   * Prepare render context for a single entry in the combat tracker.
   * @param {Combat} combat        The active combat.
   * @param {Combatant} combatant  The Combatant whose turn is being prepared.
   * @param {number} index         The index of this entry in the turn order.
   * @returns {Promise<object>}
   * @protected
   */
  async _prepareTurnContext(combat, combatant, index) {
    const { id, name, isOwner, isDefeated, hidden, initiative, permission } = combatant;
    const resource = permission >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER ? combatant.resource : null;
    const hasDecimals = Number.isFinite(initiative) && !Number.isInteger(initiative);
    const turn = {
      hasDecimals, hidden, id, isDefeated, initiative, isOwner, name, resource,
      active: index === combat.turn,
      canPing: (combatant.sceneId === canvas.scene?.id) && game.user.hasPermission("PING_CANVAS"),
      img: await this._getCombatantThumbnail(combatant)
    };
    turn.css = [
      turn.active ? "active" : null,
      hidden ? "hide" : null,
      isDefeated ? "defeated" : null
    ].filterJoin(" ");
    const effects = [];
    for ( const effect of combatant.actor?.temporaryEffects ?? [] ) {
      if ( effect.statuses.has(CONFIG.specialStatusEffects.DEFEATED) ) turn.isDefeated = true;
      else if ( effect.img ) effects.push({ img: effect.img, name: effect.name });
    }
    turn.effects = {
      icons: effects,
      tooltip: this._formatEffectsTooltip(effects)
    };
    return turn;
  }

  /* -------------------------------------------- */
  /*  Event Listeners & Handlers                  */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _attachFrameListeners() {
    super._attachFrameListeners();
    this.element.addEventListener("pointerover", this._onCombatantHoverIn.bind(this), { passive: true });
    this.element.addEventListener("pointerout", this._onCombatantHoverOut.bind(this), { passive: true });
    this.element.addEventListener("dblclick", event => {
      const target = event.target.closest("[data-combatant-id]");
      if ( target ) this._onCombatantMouseDown(event, target);
    }, { passive: true });
    this.element.addEventListener("change", this._onChangeInput.bind(this), { passive: true });
    this.element.addEventListener("focusin", event => {
      if ( event.target instanceof HTMLInputElement ) event.target.select();
    }, { passive: true });
  }

  /* -------------------------------------------- */

  /**
   * Get context menu entries for Combatants in the tracker.
   * @returns {ContextMenuEntry[]}
   * @protected
   */
  _getEntryContextOptions() {
    const getCombatant = li => this.viewed.combatants.get(li.dataset.combatantId);
    return [{
      name: "COMBAT.CombatantUpdate",
      icon: '<i class="fa-solid fa-pen-to-square"></i>',
      condition: () => game.user.isGM,
      callback: li => getCombatant(li)?.sheet.render({
        force: true,
        position: {
          top: Math.min(li.offsetTop, window.innerHeight - 350),
          left: window.innerWidth - 720
        }
      })
    }, {
      name: "COMBAT.CombatantClear",
      icon: '<i class="fa-solid fa-arrow-rotate-left"></i>',
      condition: li => game.user.isGM && Number.isFinite(getCombatant(li)?.initiative),
      callback: li => getCombatant(li)?.update({ initiative: null })
    }, {
      name: "COMBAT.CombatantReroll",
      icon: '<i class="fa-solid fa-dice-d20"></i>',
      condition: () => game.user.isGM,
      callback: li => {
        const combatant = getCombatant(li);
        if ( combatant ) return this.viewed.rollInitiative([combatant.id]);
      }
    }, {
      name: "COMBAT.CombatantClearMovementHistory",
      icon: '<i class="fa-solid fa-shoe-prints"></i>',
      condition: li => game.user.isGM && (getCombatant(li)?.token?.movementHistory.length > 0),
      callback: async li => {
        const combatant = getCombatant(li);
        if ( !combatant ) return;
        await combatant.clearMovementHistory();
        ui.notifications.info("COMBAT.CombatantMovementHistoryCleared", {format: {name: combatant.token.name}});
      }
    }, {
      name: "COMBAT.CombatantRemove",
      icon: '<i class="fa-solid fa-trash"></i>',
      condition: () => game.user.isGM,
      callback: li => getCombatant(li)?.delete()
    }];
  }

  /* -------------------------------------------- */

  /**
   * Get context menu entries for Combat in the tracker.
   * @returns {ContextMenuEntry[]}
   * @protected
   */
  _getCombatContextOptions() {
    return [{
      name: "COMBAT.InitiativeReset",
      icon: '<i class="fa-solid fa-arrow-rotate-left"></i>',
      condition: () => game.user.isGM && (this.viewed?.turns.length > 0),
      callback: () => this.viewed.resetAll()
    }, {
      name: "COMBAT.ClearMovementHistories",
      icon: '<i class="fa-solid fa-shoe-prints"></i>',
      condition: () => game.user.isGM && (this.viewed?.combatants.size > 0),
      callback: () => this.viewed.clearMovementHistories()
    }, {
      name: "COMBAT.ACTIONS.LinkToScene",
      icon: '<i class="fa-solid fa-link"></i>',
      condition: () => game.user.isGM && !this.scene,
      callback: () => this.viewed.toggleSceneLink()
    }, {
      name: "COMBAT.ACTIONS.UnlinkFromScene",
      icon: '<i class="fa-solid fa-unlink"></i>',
      condition: () => game.user.isGM && !!this.scene,
      callback: () => this.viewed.toggleSceneLink()
    }, {
      name: "COMBAT.Delete",
      icon: '<i class="fa-solid fa-trash"></i>',
      condition: () => game.user.isGM && !!this.viewed,
      callback: () => this.viewed.endCombat()
    }];
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onClickAction(event, target) {
    if ( !event.target.closest(".combat-control") ) return;
    const combat = this.viewed;
    target.disabled = true;
    try { await combat[target.dataset.action]?.(); }
    finally { target.disabled = false; }
  }

  /* -------------------------------------------- */

  /**
   * Cycle to a different combat encounter in the tracker.
   * @this {CombatTracker}
   * @param {...any} args
   */
  static #onCombatCycle(...args) {
    return this._onCombatCycle(...args);
  }

  /* -------------------------------------------- */

  /**
   * Cycle to a different combat encounter in the tracker.
   * @param {PointerEvent} event  The triggering event.
   * @param {HTMLElement} target  The action target element.
   * @protected
   */
  _onCombatCycle(event, target) {
    const { combatId } = target.dataset;
    return game.combats.get(combatId)?.activate({ render: false });
  }

  /* -------------------------------------------- */

  /**
   * Create a new combat.
   * @this {CombatTracker}
   * @param {...any} args
   * @returns {Promise<void>}
   */
  static #onCombatCreate(...args) {
    return this._onCombatCreate(...args);
  }

  /* -------------------------------------------- */

  /**
   * Create a new combat.
   * @param {PointerEvent} event  The triggering event.
   * @param {HTMLElement} target  The action target element.
   * @returns {Promise<void>}
   * @protected
   */
  async _onCombatCreate(event, target) {
    const combat = await Combat.implementation.create();
    combat.activate({ render: false });
  }

  /* -------------------------------------------- */

  /**
   * Spawn the combat tracker settings dialog.
   * @this {CombatTracker}
   * @param {PointerEvent} event  The triggering event.
   * @param {HTMLElement} target  The action target element.
   */
  static #onConfigure(event, target) {
    return new foundry.applications.apps.CombatTrackerConfig().render({ force: true });
  }

  /* -------------------------------------------- */

  /**
   * Handle performing some action for an individual combatant.
   * @this {CombatTracker}
   * @param {...any} args
   */
  static #onCombatantControl(...args) {
    return this._onCombatantControl(...args);
  }

  /* -------------------------------------------- */

  /**
   * Handle performing some action for an individual combatant.
   * @param {PointerEvent} event  The triggering event.
   * @param {HTMLElement} target  The action target element.
   * @protected
   */
  _onCombatantControl(event, target) {
    const { combatantId } = target.closest("[data-combatant-id]")?.dataset ?? {};
    const combatant = this.viewed?.combatants.get(combatantId);
    if ( !combatant ) return;

    switch ( target.dataset.action ) {
      case "pingCombatant": return this._onPingCombatant(combatant);
      case "panToCombatant": return this._onPanToCombatant(combatant);
      case "rollInitiative": return this._onRollInitiative(combatant);
      case "toggleDefeated": return this._onToggleDefeatedStatus(combatant);
      case "toggleHidden": return this._onToggleHidden(combatant);
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle hovering over a combatant in the tracker.
   * @param {PointerEvent} event  The triggering event.
   * @protected
   */
  _onCombatantHoverIn(event) {
    const { combatantId } = event.target.closest(".combatant[data-combatant-id]")?.dataset ?? {};
    if ( !canvas.ready || !combatantId ) return;
    const combatant = this.viewed.combatants.get(combatantId);
    const token = combatant.token?.object;
    if ( token && token._canHover(game.user, event) && this._isTokenVisible(token) ) {
      token._onHoverIn(event, { hoverOutOthers: true });
      this.#highlighted = token;
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle hovering out a combatant in the tracker.
   * @param {PointerEvent} event  The triggering event.
   * @protected
   */
  _onCombatantHoverOut(event) {
    this.#highlighted?._onHoverOut(event);
    this.#highlighted = null;
  }

  /* -------------------------------------------- */

  /**
   * Handle activating a combatant in the tracker.
   * @this {CombatTracker}
   * @param {...any} args
   */
  static #onCombatantMouseDown(...args) {
    return this._onCombatantMouseDown(...args);
  }

  /* -------------------------------------------- */

  /**
   * Handle activating a combatant in the tracker.
   * @param {PointerEvent} event  The triggering event.
   * @param {HTMLElement} target  The action target element.
   * @protected
   */
  _onCombatantMouseDown(event, target) {
    if ( (event.target instanceof HTMLInputElement) || (event.target instanceof HTMLButtonElement) ) return;
    const { combatantId } = target?.dataset ?? {};
    const combatant = this.viewed.combatants.get(combatantId);
    if ( !combatant ) return;
    if ( event.type === "dblclick" ) {
      if ( combatant.actor?.testUserPermission(game.user, "OBSERVER") ) combatant.actor?.sheet.render(true);
      return;
    }
    const token = combatant.token?.object;
    if ( !token ) return;
    const controlled = token.control({ releaseOthers: true });
    if ( controlled ) canvas.animatePan(token.center);
  }

  /* -------------------------------------------- */

  /**
   * Handle panning to a combatant's token.
   * @param {Combatant} combatant  The combatant.
   * @protected
   */
  _onPanToCombatant(combatant) {
    if ( !canvas.ready || (combatant.sceneId !== canvas.scene.id) ) return;
    const token = combatant.token?.object;
    if ( !token || !this._isTokenVisible(token) ) {
      ui.notifications.warn("COMBAT.WarnNonVisibleToken", { localize: true });
      return;
    }
    const { x, y } = token.center;
    return canvas.animatePan({ x, y, scale: Math.max(canvas.stage.scale.x, canvas.dimensions.scale.default) });
  }

  /* -------------------------------------------- */

  /**
   * Handle pinging a combatant's token.
   * @param {Combatant} combatant  The combatant.
   * @protected
   */
  _onPingCombatant(combatant) {
    if ( !canvas.ready || (combatant.sceneId !== canvas.scene.id) ) return;
    const token = combatant.token?.object;
    if ( !token || !this._isTokenVisible(token) ) {
      ui.notifications.warn("COMBAT.WarnNonVisibleToken", { localize: true });
      return;
    }
    return canvas.ping(token.center);
  }

  /* -------------------------------------------- */

  /**
   * Handle rolling initiative for a single combatant.
   * @param {Combatant} combatant  The combatant.
   * @protected
   */
  _onRollInitiative(combatant) {
    return this.viewed.rollInitiative([combatant.id]);
  }

  /* -------------------------------------------- */

  /**
   * Handle toggling the defeated status effect on a combatant token.
   * @param {Combatant} combatant  The combatant.
   * @returns {Promise<void>}
   * @protected
   */
  async _onToggleDefeatedStatus(combatant) {
    const isDefeated = !combatant.isDefeated;
    await combatant.update({ defeated: isDefeated });
    const defeatedId = CONFIG.specialStatusEffects.DEFEATED;
    await combatant.actor?.toggleStatusEffect(defeatedId, { overlay: true, active: isDefeated });
  }

  /* -------------------------------------------- */

  /**
   * Toggle a combatant's hidden state in the tracker.
   * @param {Combatant} combatant  The combatant.
   * @protected
   */
  _onToggleHidden(combatant) {
    return combatant.update({ hidden: !combatant.hidden });
  }

  /* -------------------------------------------- */

  /**
   * The CombatTracker application is not a <form> element by default, but it does handle specific input events.
   * @param {Event} event  The triggering change event.
   * @protected
   */
  _onChangeInput(event) {
    const input = event.target;
    if ( input.classList.contains("initiative-input") ) {
      return this._onUpdateInitiative(event);
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle updating a combatant's initiative in-sheet.
   * @param {Event} event  The triggering change event.
   * @protected
   */
  _onUpdateInitiative(event) {
    const { combatantId } = event.target.closest("[data-combatant-id]")?.dataset ?? {};
    const combatant = this.viewed.combatants.get(combatantId);
    if ( !combatant ) return;
    const raw = event.target.value;
    const isDelta = /^[+-]/.test(raw);
    if ( !isDelta || (raw[0] === "=") ) {
      return combatant.update({ initiative: raw ? Number(raw.replace(/^=/, "")) : null });
    }
    const delta = parseInt(raw);
    if ( !isNaN(delta) ) return combatant.update({ initiative: combatant.initiative + delta });
  }

  /* -------------------------------------------- */
  /*  Public API                                  */
  /* -------------------------------------------- */

  /**
   * Highlight a hovered combatant in the tracker.
   * @param {Combatant} combatant  The Combatant.
   * @param {boolean} hover        Whether they are being hovered in or out.
   */
  hoverCombatant(combatant, hover) {
    const trackers = [this.element];
    if ( this.popout?.rendered ) trackers.push(this.popout.element);
    for ( const tracker of trackers ) {
      const li = tracker.querySelector(`.combatant[data-combatant-id="${combatant.id}"]`);
      if ( !li ) break;
      if ( hover ) li.classList.add("hover");
      else li.classList.remove("hover");
    }
  }

  /* -------------------------------------------- */

  /**
   * Is the token of the combatant visible?
   * @param {Token} token    The token of the combatant
   * @returns {boolean}      Is the token visible?
   * @protected
   */
  _isTokenVisible(token) {
    return token.visible;
  }

  /* -------------------------------------------- */

  /**
   * Infer which Combat document should be viewed on the tracker, if any.
   * If the active combat is available for the current scene, prioritize it.
   * Otherwise, choose the most recently modified Combat encounter as the one we should view.
   * @returns {Combat|null}
   */
  #inferCombat() {
    const sceneCombats = [];
    for ( const c of game.combats ) {
      if ( c.isActive ) return c;
      else if ( !c.scene || (c.scene === game.scenes.current) ) sceneCombats.push(c);
    }
    sceneCombats.sort((a, b) => b._stats.modifiedTime - a._stats.modifiedTime); // Most recent
    return sceneCombats[0] || null;
  }

  /* -------------------------------------------- */

  /**
   * Scroll to the current combatant in the combat log.
   */
  scrollToTurn() {
    this.element.querySelector(".active")?.scrollIntoView();
  }

  /* -------------------------------------------- */
  /*  Deprecations                                */
  /* -------------------------------------------- */

  /**
   * @deprecated since v13
   * @ignore
   */
  initialize({combat=null, render=true}={}) {
    foundry.utils.logCompatibilityWarning("CombatTracker#initialize is deprecated. "
      + "The currently viewed combat can be changed by assigning to ui.combat.viewed directly, "
      + "passed as an option to ui.combat.render, or by setting a Combat as active.", { since: 13, until: 15 });
    if ( this.isPopout ) return;
    if ( render ) this.render({ combat });
    else this.viewed = combat;
  }
}

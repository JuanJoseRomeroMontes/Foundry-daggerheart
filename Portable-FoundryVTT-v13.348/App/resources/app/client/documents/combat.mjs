import BaseCombat from "@common/documents/combat.mjs";
import ClientDocumentMixin from "./abstract/client-document.mjs";
import Hooks from "../helpers/hooks.mjs";

/**
 * @import Combatant from "./combatant.mjs";
 * @import Actor from "./actor.mjs";
 * @import TokenDocument from "./token.mjs";
 * @import User from "./user.mjs";
 * @import {CombatHistoryData, CombatRoundEventContext, CombatTurnEventContext} from "./_types.mjs";
 * @import {DatabaseDeleteOperation, DatabaseUpdateOperation} from "@common/abstract/_types.mjs";
 */

/**
 * The client-side Combat document which extends the common BaseCombat model.
 *
 * ### Hook Events
 * - {@link hookEvents.combatRound}
 * - {@link hookEvents.combatStart}
 * - {@link hookEvents.combatTurn}
 * - {@link hookEvents.combatTurnChange}
 *
 * @extends BaseCombat
 * @mixes ClientDocumentMixin
 * @category Documents
 *
 * @see {@link foundry.documents.collections.CombatEncounters}: The world-level collection of Combat
 *   documents
 * @see {@link Combatant}: The Combatant embedded document which exists within a Combat
 *   document
 * @see {@link foundry.applications.sidebar.tabs.CombatTracker}: The CombatTracker application
 * @see {@link foundry.applications.apps.CombatTrackerConfig}: The CombatTracker configuration
 *   application
 */
export default class Combat extends ClientDocumentMixin(BaseCombat) {

  /**
   * Track the sorted turn order of this combat encounter
   * @type {Combatant[]}
   */
  turns = this.turns || [];

  /**
   * Record the current round, turn, and tokenId to understand changes in the encounter state
   * @type {CombatHistoryData}
   */
  current = this._getCurrentState();

  /**
   * Track the previous round, turn, and tokenId to understand changes in the encounter state
   * @type {CombatHistoryData}
   */
  previous = undefined;

  /**
   * The configuration setting used to record Combat preferences
   * @type {string}
   */
  static CONFIG_SETTING = "combatTrackerConfig";

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * Get the Combatant who has the current turn.
   * @type {Combatant|null}
   */
  get combatant() {
    return this.turn !== null ? this.turns[this.turn] : null;
  }

  /* -------------------------------------------- */

  /**
   * Get the Combatant who has the next turn.
   * @type {Combatant}
   */
  get nextCombatant() {
    if ( this.turn === this.turns.length - 1 ) return this.turns[0];
    return this.turns[this.turn + 1];
  }

  /* -------------------------------------------- */

  /**
   * Return the object of settings which modify the Combat Tracker behavior
   * @type {object}
   */
  get settings() {
    return foundry.documents.collections.CombatEncounters.settings;
  }

  /* -------------------------------------------- */

  /**
   * Has this combat encounter been started?
   * @type {boolean}
   */
  get started() {
    return this.round > 0;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  get visible() {
    return true;
  }

  /* -------------------------------------------- */

  /**
   * Is this combat active in the current scene?
   * @type {boolean}
   */
  get isActive() {
    if ( !this.scene ) return this.active;
    return this.scene.isView && this.active;
  }

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /**
   * A convenience alias for updating this document to become active.
   * @param {Partial<DatabaseUpdateOperation>} [options] Additional context to customize the update workflow
   * @returns {Promise<this>}
   */
  async activate(options) {
    return this.update({active: true}, options);
  }

  /* -------------------------------------------- */

  /** @override */
  prepareDerivedData() {
    if ( this.combatants.size && !this.turns?.length ) this.setupTurns();
  }

  /* -------------------------------------------- */

  /**
   * Get a Combatant using its Token id
   * @param {string|TokenDocument} token    A Token ID or a TokenDocument instance
   * @returns {Combatant[]}                 An array of Combatants which represent the Token
   */
  getCombatantsByToken(token) {
    const tokenId = token instanceof foundry.documents.TokenDocument ? token.id : token;
    return this.combatants.filter(c => c.tokenId === tokenId);
  }

  /* -------------------------------------------- */

  /**
   * Get a Combatant that represents the given Actor or Actor ID.
   * @param {string|Actor} actor              An Actor ID or an Actor instance
   * @returns {Combatant[]}
   */
  getCombatantsByActor(actor) {
    const isActor = actor instanceof foundry.documents.Actor;
    if ( isActor && actor.isToken ) return this.getCombatantsByToken(actor.token);
    const actorId = isActor ? actor.id : actor;
    return this.combatants.filter(c => c.actorId === actorId);
  }

  /* -------------------------------------------- */

  /**
   * Calculate the time delta between two turns.
   * @param {number} fromRound        The from-round
   * @param {number|null} fromTurn    The from-turn
   * @param {number} toRound          The to-round
   * @param {number|null} toTurn      The to-turn
   * @returns {number}                The time delta
   */
  getTimeDelta(fromRound, fromTurn, toRound, toTurn) {
    const rounds = Math.max(toRound, 1) - Math.max(fromRound, 1);
    let turns = Math.max(rounds - 1, 0) * this.turns.length;
    if ( fromRound < toRound ) {
      turns += (toTurn === null ? 0 : toTurn);
      if ( fromRound > 0 ) turns += (fromTurn === null ? 0 : this.turns.length - fromTurn);
    } else if ( fromRound > toRound ) {
      turns -= (fromTurn === null ? 0 : fromTurn + 1);
      if ( fromRound > 0 ) turns -= (toTurn === null ? 0 : this.turns.length - (toTurn + 1));
    }
    else turns += (toTurn - fromTurn);
    return (rounds * CONFIG.time.roundTime) + (turns * CONFIG.time.turnTime);
  }

  /* -------------------------------------------- */

  /**
   * Begin the combat encounter, advancing to round 1 and turn 1
   * @returns {Promise<this>}
   */
  async startCombat() {
    this._playCombatSound("startEncounter");
    const updateData = {round: 1, turn: 0};
    Hooks.callAll("combatStart", this, updateData);
    await this.update(updateData);
    return this;
  }

  /* -------------------------------------------- */

  /**
   * Advance the combat to the next round
   * @returns {Promise<this>}
   */
  async nextRound() {
    let turn = (this.turn === null) || (this.turns.length === 0) ? null : 0; // Preserve the fact that it's no-one's turn currently.
    if ( this.settings.skipDefeated && (turn !== null) ) {
      turn = this.turns.findIndex(t => !t.isDefeated);
      if ( turn === -1 ) {
        ui.notifications.warn("COMBAT.NoneRemaining", {localize: true});
        turn = 0;
      }
    }
    const nextRound = this.round + 1;
    const advanceTime = this.getTimeDelta(this.round, this.turn, nextRound, turn);

    // Update the document, passing data through a hook first
    const updateData = {round: nextRound, turn};
    const updateOptions = {direction: 1, worldTime: {delta: advanceTime}};
    Hooks.callAll("combatRound", this, updateData, updateOptions);
    await this.update(updateData, updateOptions);
    return this;
  }

  /* -------------------------------------------- */

  /**
   * Rewind the combat to the previous round
   * @returns {Promise<this>}
   */
  async previousRound() {
    if ( this.round === 0 ) return this;
    const turn = (this.round === 1) || (this.turn === null) || (this.turns.length === 0) ? null : this.turns.length - 1;
    const previousRound = this.round - 1;
    const advanceTime = this.getTimeDelta(this.round, this.turn, previousRound, turn);

    // Update the document, passing data through a hook first
    const updateData = {round: previousRound, turn};
    const updateOptions = {direction: -1, worldTime: {delta: advanceTime}};
    Hooks.callAll("combatRound", this, updateData, updateOptions);
    await this.update(updateData, updateOptions);
    return this;
  }

  /* -------------------------------------------- */

  /**
   * Advance the combat to the next turn
   * @returns {Promise<this>}
   */
  async nextTurn() {
    if ( this.round === 0 ) return this.nextRound();

    const turn = this.turn ?? -1;

    // Determine the next turn number
    let nextTurn = null;
    if ( this.settings.skipDefeated ) {
      for ( let i = turn + 1; i < this.turns.length; i++ ) {
        if ( !this.turns[i].isDefeated ) {
          nextTurn = i;
          break;
        }
      }
    }
    else nextTurn = turn + 1;

    // Maybe advance to the next round
    if ( (nextTurn === null) || (nextTurn >= this.turns.length) ) return this.nextRound();

    const advanceTime = this.getTimeDelta(this.round, this.turn, this.round, nextTurn);

    // Update the document, passing data through a hook first
    const updateData = {round: this.round, turn: nextTurn};
    const updateOptions = {direction: 1, worldTime: {delta: advanceTime}};
    Hooks.callAll("combatTurn", this, updateData, updateOptions);
    await this.update(updateData, updateOptions);
    return this;
  }

  /* -------------------------------------------- */

  /**
   * Rewind the combat to the previous turn
   * @returns {Promise<this>}
   */
  async previousTurn() {
    if ( this.round === 0 ) return this;
    if ( (this.turn === 0) || (this.turns.length === 0) ) return this.previousRound();
    const previousTurn = (this.turn ?? this.turns.length) - 1;
    const advanceTime = this.getTimeDelta(this.round, this.turn, this.round, previousTurn);

    // Update the document, passing data through a hook first
    const updateData = {round: this.round, turn: previousTurn};
    const updateOptions = {direction: -1, worldTime: {delta: advanceTime}};
    Hooks.callAll("combatTurn", this, updateData, updateOptions);
    await this.update(updateData, updateOptions);
    return this;
  }

  /* -------------------------------------------- */

  /**
   * Display a dialog querying the GM whether they wish to end the combat encounter and empty the tracker
   * @returns {Promise<this>}
   */
  async endCombat() {
    await foundry.applications.api.DialogV2.confirm({
      window: {title: "COMBAT.EndTitle"},
      content: `<p>${game.i18n.localize("COMBAT.EndConfirmation")}</p>`,
      yes: {callback: () => this.delete()},
      modal: true
    });
    return this;
  }

  /* -------------------------------------------- */

  /**
   * Toggle whether this combat is linked to the scene or globally available.
   * @returns {Promise<this>}
   */
  async toggleSceneLink() {
    const scene = this.scene ? null : (game.scenes.current?.id || null);
    if ( (scene !== null) && this.combatants.some(c => c.sceneId && (c.sceneId !== scene)) ) {
      ui.notifications.error("COMBAT.CannotLinkToScene", {localize: true});
      return this;
    }
    await this.update({scene});
    return this;
  }

  /* -------------------------------------------- */

  /**
   * Reset all combatant initiative scores.
   * @param {object} [options={}]                   Additional options
   * @param {boolean} [options.updateTurn=true]     Update the Combat turn after resetting initiative scores to
   *                                                keep the turn on the same Combatant.
   * @returns {Promise<this>}
   */
  async resetAll({updateTurn=true}={}) {
    const currentId = this.combatant?.id;
    for ( const c of this.combatants ) c.updateSource({initiative: null});
    this.setupTurns();
    const update = {combatants: this.combatants.toObject()};
    if ( updateTurn && currentId ) update.turn = this.turns.findIndex(t => t.id === currentId);
    await this.update(update, {turnEvents: false, diff: false});
  }

  /* -------------------------------------------- */

  /**
   * Roll initiative for one or multiple Combatants within the Combat document
   * @param {string|string[]} ids     A Combatant id or Array of ids for which to roll
   * @param {object} [options={}]     Additional options which modify how initiative rolls are created or presented.
   * @param {string|null} [options.formula]         A non-default initiative formula to roll. Otherwise, the system
   *                                                default is used.
   * @param {boolean} [options.updateTurn=true]     Update the Combat turn after adding new initiative scores to
   *                                                keep the turn on the same Combatant.
   * @param {object} [options.messageOptions={}]    Additional options with which to customize created Chat Messages
   * @returns {Promise<this>}       A promise which resolves to the updated Combat document once updates are complete.
   */
  async rollInitiative(ids, {formula=null, updateTurn=true, messageOptions={}}={}) {

    // Structure input data
    ids = typeof ids === "string" ? [ids] : ids;
    const chatRollMode = game.settings.get("core", "rollMode");

    // Iterate over Combatants, performing an initiative roll for each
    const updates = [];
    const messages = [];
    for ( const [i, id] of ids.entries() ) {

      // Get Combatant data (non-strictly)
      const combatant = this.combatants.get(id);
      if ( !combatant?.isOwner ) continue;

      // Produce an initiative roll for the Combatant
      const roll = combatant.getInitiativeRoll(formula);
      await roll.evaluate();
      updates.push({_id: id, initiative: roll.total});

      // If the combatant is hidden, use a private roll unless an alternative rollMode was explicitly requested
      const rollMode = "rollMode" in messageOptions ? messageOptions.rollMode
        : (combatant.hidden ? CONST.DICE_ROLL_MODES.PRIVATE : chatRollMode);

      // Construct chat message data
      const messageData = foundry.utils.mergeObject({
        speaker: foundry.documents.ChatMessage.implementation.getSpeaker({
          actor: combatant.actor,
          token: combatant.token,
          alias: combatant.name
        }),
        flavor: game.i18n.format("COMBAT.RollsInitiative", {name: foundry.utils.escapeHTML(combatant.name)}),
        flags: {"core.initiativeRoll": true}
      }, messageOptions);
      const chatData = await roll.toMessage(messageData, {rollMode, create: false});

      // Play 1 sound for the whole rolled set
      if ( i > 0 ) chatData.sound = null;
      messages.push(chatData);
    }
    if ( !updates.length ) return this;

    // Update combatants and combat turn
    const updateOptions = { turnEvents: false };
    if ( !updateTurn ) updateOptions.combatTurn = this.turn;
    await this.updateEmbeddedDocuments("Combatant", updates, updateOptions);

    // Create multiple chat messages
    await foundry.documents.ChatMessage.implementation.create(messages);
    return this;
  }

  /* -------------------------------------------- */

  /**
   * Roll initiative for all combatants which have not already rolled
   * @param {object} [options={}]   Additional options forwarded to the Combat.rollInitiative method
   * @returns {Promise<this>}
   */
  async rollAll(options) {
    const ids = this.combatants.reduce((ids, c) => {
      if ( c.isOwner && (c.initiative === null) ) ids.push(c.id);
      return ids;
    }, []);
    return this.rollInitiative(ids, options);
  }

  /* -------------------------------------------- */

  /**
   * Roll initiative for all non-player actors who have not already rolled
   * @param {object} [options={}]   Additional options forwarded to the Combat.rollInitiative method
   * @returns {Promise<this>}
   */
  async rollNPC(options={}) {
    const ids = this.combatants.reduce((ids, c) => {
      if ( c.isOwner && c.isNPC && (c.initiative === null) ) ids.push(c.id);
      return ids;
    }, []);
    return this.rollInitiative(ids, options);
  }

  /* -------------------------------------------- */

  /**
   * Assign initiative for a single Combatant within the Combat encounter.
   * Update the Combat turn order to maintain the same combatant as the current turn.
   * @param {string} id         The combatant ID for which to set initiative
   * @param {number} value      A specific initiative value to set
   */
  async setInitiative(id, value) {
    const combatant = this.combatants.get(id, {strict: true});
    await combatant.update({initiative: value});
  }

  /* -------------------------------------------- */

  /**
   * Return the Array of combatants sorted into initiative order, breaking ties alphabetically by name.
   * @returns {Combatant[]}
   */
  setupTurns() {
    this.turns ||= [];

    // Determine the turn order and the current turn
    const turns = this.combatants.contents.sort(this._sortCombatants);
    if ( this.turn !== null ) {
      if ( this.turn < 0 ) this.turn = 0;
      else if ( this.turn >= turns.length ) {
        this.turn = 0;
        this.round++;
      }
    }

    // Update state tracking
    const c = turns[this.turn];
    this.current = this._getCurrentState(c);

    // One-time initialization of the previous state
    if ( !this.previous ) this.previous = this.current;

    // Return the array of prepared turns
    return this.turns = turns;
  }

  /* -------------------------------------------- */

  /**
   * Debounce changes to the composition of the Combat encounter to de-duplicate multiple concurrent Combatant changes.
   * If this is the currently viewed encounter, re-render the CombatTracker application.
   * @type {Function}
   */
  debounceSetup = foundry.utils.debounce(() => {
    this.current.round = this.round;
    this.current.turn = this.turn;
    this.setupTurns();
    if ( ui.combat.viewed === this ) ui.combat.render();
  }, 50);

  /* -------------------------------------------- */

  /**
   * Update active effect durations for all actors present in this Combat encounter.
   */
  updateCombatantActors() {
    for ( const combatant of this.combatants ) combatant.actor?.render(false, {renderContext: "updateCombat"});
  }

  /* -------------------------------------------- */

  /**
   * Loads the registered Combat Theme (if any) and plays the requested type of sound.
   * If multiple exist for that type, one is chosen at random.
   * @param {string} announcement     The announcement that should be played: "startEncounter", "nextUp", or "yourTurn".
   * @protected
   */
  _playCombatSound(announcement) {
    if ( !CONST.COMBAT_ANNOUNCEMENTS.includes(announcement) ) {
      throw new Error(`"${announcement}" is not a valid Combat announcement type`);
    }
    const theme = CONFIG.Combat.sounds[game.settings.get("core", "combatTheme")];
    if ( !theme || theme === "none" ) return;
    const sounds = theme[announcement];
    if ( !sounds ) return;
    const src = sounds[Math.floor(Math.random() * sounds.length)];
    game.audio.play(src, {context: game.audio.interface});
  }

  /* -------------------------------------------- */

  /**
   * Define how the array of Combatants is sorted in the displayed list of the tracker.
   * This method can be overridden by a system or module which needs to display combatants in an alternative order.
   * The default sorting rules sort in descending order of initiative using combatant IDs for tiebreakers.
   * @param {Combatant} a     Some combatant
   * @param {Combatant} b     Some other combatant
   * @protected
   */
  _sortCombatants(a, b) {
    const ia = Number.isNumeric(a.initiative) ? a.initiative : -Infinity;
    const ib = Number.isNumeric(b.initiative) ? b.initiative : -Infinity;
    return (ib - ia) || (a.id > b.id ? 1 : -1);
  }

  /* -------------------------------------------- */

  /**
   * Refresh the Token HUD under certain circumstances.
   * @param {Combatant[]} documents  A list of Combatant documents that were added or removed.
   * @protected
   */
  _refreshTokenHUD(documents) {
    if ( documents.some(doc => doc.token?.object?.hasActiveHUD) ) canvas.tokens.hud.render();
  }

  /* -------------------------------------------- */

  /**
   * Clear the movement history of all Tokens within this Combat.
   * @overload
   * @returns {Promise<void>}
   */
  /**
   * Clear the movement history of the Combatants' Tokens.
   * @overload
   * @param {Iterable<Combatant>} combatants    The combatants whose movement history is cleared
   * @returns {Promise<void>}
   */
  async clearMovementHistories(combatants) {
    combatants ??= this.combatants;
    const tokensByScene = new Map();
    for ( const combatant of combatants ) {
      if ( combatant.parent !== this ) throw Error("Combatant must be in this Combat");
      const token = combatant.token;
      if ( !token || (token._source._movementHistory.length === 0) ) continue;
      const scene = token.parent;
      let tokens = tokensByScene.get(scene);
      if ( !tokens ) tokensByScene.set(scene, tokens = new Set());
      tokens.add(token);
    }
    const promises = [];
    for ( const [scene, tokens] of tokensByScene.entries() ) {
      promises.push(scene.updateEmbeddedDocuments("Token", Array.from(tokens, t => ({_id: t.id})),
        {diff: false, noHook: true, _clearMovementHistory: true}));
    }
    await Promise.all(promises);
  }

  /* -------------------------------------------- */
  /*  Event Handlers                              */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _onCreate(data, options, userId) {
    super._onCreate(data, options, userId);
    if ( !this.collection.viewed && this.collection.combats.includes(this) ) ui.combat.viewed = this;
    if ( game.user.isActiveGM ) {
      for ( const combatant of this.combatants ) this.#onEnter(combatant);
    }
    this._manageTurnEvents();
    this._updateTurnMarkers();
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);
    const priorState = foundry.utils.deepClone(this.current);
    if ( !this.previous ) this.previous = priorState; // Just in case

    // Determine the new turn order
    if ( "combatants" in changed ) this.setupTurns(); // Update all combatants
    else this.current = this._getCurrentState();      // Update turn or round

    // Record the prior state and manage turn events
    const stateChanged = this.#recordPreviousState(priorState);
    if ( stateChanged && (options.turnEvents !== false) ) this._manageTurnEvents();

    // Render applications for Actors involved in the Combat
    this.updateCombatantActors();

    // Render the CombatTracker sidebar
    if ( (changed.active === true) && this.isActive ) ui.combat.render({combat: this});
    else if ( "scene" in changed ) ui.combat.render({combat: null});

    // Refresh token combat markers
    if ( stateChanged ) this._updateTurnMarkers();

    // Trigger combat sound cues in the active encounter
    if ( this.active && stateChanged && this.started && priorState.round ) {
      const play = c => c && (game.user.isGM ? !c.hasPlayerOwner : c.isOwner);
      if ( play(this.combatant) ) this._playCombatSound("yourTurn");
      else if ( play(this.nextCombatant) ) this._playCombatSound("nextUp");
    }
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onDelete(options, userId) {
    super._onDelete(options, userId);
    if ( this.collection.viewed === this ) ui.combat.render({ combat: null });
    if ( userId === game.userId ) this.collection.viewed?.activate();
    this._updateTurnMarkers();
    if ( game.user.isActiveGM ) {
      for ( const combatant of this.combatants ) this.#onExit(combatant);
    }
  }

  /* -------------------------------------------- */
  /*  Combatant Management Workflows              */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _onCreateDescendantDocuments(parent, collection, documents, data, options, userId) {
    super._onCreateDescendantDocuments(parent, collection, documents, data, options, userId);
    if ( collection !== "combatants" ) return;
    if ( game.user.isActiveGM ) {
      for ( const combatant of documents ) this.#onEnter(combatant);
    }
    this.#onModifyCombatants(parent, documents, options);
    if ( this.started ) this._updateTurnMarkers();
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onUpdateDescendantDocuments(parent, collection, documents, changes, options, userId) {
    super._onUpdateDescendantDocuments(parent, collection, documents, changes, options, userId);
    if ( collection !== "combatants" ) return;
    this.#onModifyCombatants(parent, documents, options);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onDeleteDescendantDocuments(parent, collection, documents, ids, options, userId) {
    super._onDeleteDescendantDocuments(parent, collection, documents, ids, options, userId);
    if ( collection !== "combatants" ) return;
    if ( game.user.isActiveGM ) {
      for ( const combatant of documents ) this.#onExit(combatant);
    }
    this.#onModifyCombatants(parent, documents, options);
  }

  /* -------------------------------------------- */

  /**
   * Shared actions taken when Combatants are modified within this Combat document.
   * @param {Document} parent         The direct parent of the created Documents, may be this Document or a child
   * @param {Document[]} documents    The array of created Documents
   * @param {object} options          Options which modified the operation
   */
  #onModifyCombatants(parent, documents, options) {
    const {combatTurn, turnEvents, render} = options;
    if ( parent === this ) this._refreshTokenHUD(documents);
    const priorState = foundry.utils.deepClone(this.current);
    if ( typeof combatTurn === "number" ) this.updateSource({turn: combatTurn});
    this.setupTurns();

    // Additional actions if the turn order changed
    const turnChange = this.#recordPreviousState(priorState);
    if ( turnChange ) {
      if ( turnEvents !== false ) this._manageTurnEvents();
      this._updateTurnMarkers();
    }
    if ( (ui.combat.viewed === parent) && (render !== false) ) ui.combat.render();
  }

  /* -------------------------------------------- */

  /**
   * This workflow occurs after a Combatant is added to the Combat.
   * This method only executes for one designated GM user. If no GM users are present this method will not be called.
   * @param {Combatant} combatant    The Combatant that entered the Combat
   * @returns {Promise<void>}
   */
  async #onEnter(combatant) {
    if ( CONFIG.debug.combat ) console.debug(` | Combat Enter: ${combatant.name}`);
    await this._onEnter(combatant);
  }

  /* -------------------------------------------- */

  /**
   * This workflow occurs after a Combatant is added to the Combat.
   * This can be overridden to implement system-specific combat tracking behaviors.
   * The default implementation of this function does nothing.
   * This method only executes for one designated GM user. If no GM users are present this method will not be called.
   * @param {Combatant} combatant    The Combatant that entered the Combat
   * @returns {Promise<void>}
   * @protected
   */
  async _onEnter(combatant) {}

  /* -------------------------------------------- */

  /**
   * This workflow occurs after a Combatant is removed from the Combat.
   * This method only executes for one designated GM user. If no GM users are present this method will not be called.
   * @param {Combatant} combatant    The Combatant that exited the Combat
   * @returns {Promise<void>}
   */
  async #onExit(combatant) {
    if ( CONFIG.debug.combat ) console.debug(` | Combat Exit: ${combatant.name}`);
    await this._onExit(combatant);
    if ( combatant.token ) await this._clearMovementHistoryOnExit(combatant);
  }

  /* -------------------------------------------- */

  /**
   * This workflow occurs after a Combatant is removed from the Combat.
   * This can be overridden to implement system-specific combat tracking behaviors.
   * The default implementation of this function does nothing.
   * This method only executes for one designated GM user. If no GM users are present this method will not be called.
   * @param {Combatant} combatant    The Combatant that exited the Combat
   * @returns {Promise<void>}
   * @protected
   */
  async _onExit(combatant) {}

  /* -------------------------------------------- */

  /**
   * Called after {@link Combat#_onExit} and takes care of clearing the movement history of the
   * Combatant's Token.
   * This function is not called for Combatants that don't have a Token.
   * The default implementation clears the movement history always.
   * @param {Combatant} combatant    The Combatant that exited the Combat
   * @returns {Promise<void>}
   * @protected
   */
  async _clearMovementHistoryOnExit(combatant) {
    await combatant.token.clearMovementHistory();
  }

  /* -------------------------------------------- */

  /**
   * Get the current history state of the Combat encounter.
   * @param {Combatant} [combatant]       The new active combatant
   * @returns {CombatHistoryData}
   * @protected
   */
  _getCurrentState(combatant) {
    combatant ||= this.combatant;
    return {
      round: this.round,
      turn: this.turn ?? null,
      combatantId: combatant?.id || null,
      tokenId: combatant?.tokenId || null
    };
  }

  /* -------------------------------------------- */

  /**
   * Update the previous turn data.
   * Compare the state with the new current state. Only update the previous state if there is a difference.
   * @param {CombatHistoryData} priorState    A cloned copy of the current history state before changes
   * @returns {boolean}                       Has the combat round or current combatant changed?
   */
  #recordPreviousState(priorState) {
    const {round, turn, combatantId} = this.current;
    const turnChange = (combatantId !== priorState.combatantId) || (round !== priorState.round)
      || (turn !== priorState.turn);
    Object.assign(this.previous, priorState);
    return turnChange;
  }

  /* -------------------------------------------- */

  /**
   * Update display of Token combat turn markers.
   * @protected
   */
  _updateTurnMarkers() {
    if ( !canvas.ready ) return;
    const currentToken = this.combatant?.token?._object;
    for ( const token of canvas.tokens.turnMarkers ) {
      if ( token !== currentToken ) token.renderFlags.set({refreshTurnMarker: true});
    }
    if ( this.active && currentToken ) currentToken.renderFlags.set({refreshTurnMarker: true});
  }

  /* -------------------------------------------- */
  /*  Turn Events                                 */
  /* -------------------------------------------- */

  /**
   * Manage the execution of Combat lifecycle events.
   * This method orchestrates the execution of four events in the following order, as applicable:
   * 1. End Turn
   * 2. End Round
   * 3. Begin Round
   * 4. Begin Turn
   * Each lifecycle event is an async method, and each is awaited before proceeding.
   * @returns {Promise<void>}
   * @protected
   */
  async _manageTurnEvents() {
    if ( !this.started ) return;

    // Capture current and previous states
    const {current, previous} = this;

    // Gamemaster handling only
    if ( game.user.isActiveGM ) await this.#triggerTurnEvents();

    // Hooks handled by all clients
    Hooks.callAll("combatTurnChange", this, previous, current);
  }

  /* -------------------------------------------- */

  /**
   * Trigger round/turn events.
   * @returns {Promise<void>}
   */
  async #triggerTurnEvents() {
    const {turns, current, previous} = this;
    const intervals = [];
    let roundDelta = current.round - previous.round;

    // Add intervals for turn advancement within the current round
    if ( roundDelta === 0 ) {
      if ( (current.round > 0) && (previous.turn < current.turn) ) intervals.push([previous.turn + 1, current.turn]);
    }

    // Add intervals for round advancement
    else if ( roundDelta > 0 ) {
      if ( previous.round > 0 ) intervals.push([previous.turn + 1, turns.length - 1]);
      while ( --roundDelta ) intervals.push([0, turns.length - 1]);
      intervals.push([0, current.turn ?? 0]);
    }

    // Dispatch events when either the round or turn progressed
    if ( intervals.length > 0 ) {
      let prior = {
        combatant: this.combatants.get(previous.combatantId) ?? null,
        round: previous.round,
        turn: previous.turn,
        skipped: false
      };
      for ( const [from, to] of intervals ) {
        for ( let turn = from; turn <= to; turn++ ) {
          const round = prior.round + (turn === 0);
          const next = {
            combatant: turns[turn],
            round,
            turn,
            skipped: (round !== current.round) || (turn !== current.turn)
          };
          if ( prior.combatant ) {
            await this.#onEndTurn(prior.combatant, {round: prior.round, turn: prior.turn, skipped: prior.skipped});
          }
          if ( prior.round !== next.round ) {
            await this.#onEndRound({round: prior.round, skipped: prior.round !== previous.round});
            await this.#onStartRound({round: next.round, skipped: next.round !== current.round});
          }
          if ( next.combatant ) {
            await this.#onStartTurn(next.combatant, {round: next.round, turn: next.turn, skipped: next.skipped});
          }
          prior = next;
        }
      }
    }

    // Dispatch events when the turn order is changed
    else {
      const changeCombatant = (current.combatantId !== previous.combatantId)
        && (current.round === previous.round) && (current.turn === previous.turn);
      if ( changeCombatant ) {
        const prior = this.combatants.get(previous.combatantId);
        const next = this.combatant;
        if ( prior ) await this.#onEndTurn(prior, { round: current.round, turn: current.turn, skipped: false });
        if ( next ) await this.#onStartTurn(next, { round: current.round, turn: current.turn, skipped: false });
      }
    }
  }

  /* -------------------------------------------- */

  /**
   * A workflow that occurs at the end of each Combat Turn.
   * This workflow occurs after the Combat document update.
   * This method only executes for one designated GM user. If no GM users are present this method will not be called.
   * @param {Combatant} combatant               The Combatant whose turn just ended
   * @param {CombatTurnEventContext} context    The context of the turn that just ended
   * @returns {Promise<void>}
   */
  async #onEndTurn(combatant, context) {
    if ( CONFIG.debug.combat ) console.debug(` | Combat End Turn: ${combatant.name}`);
    await this._onEndTurn(combatant, context);
    // noinspection ES6MissingAwait
    this.#triggerRegionEvents(CONST.REGION_EVENTS.TOKEN_TURN_END, context, [combatant]);
  }

  /* -------------------------------------------- */

  /**
   * A workflow that occurs at the end of each Combat Turn.
   * This workflow occurs after the Combat document update.
   * This can be overridden to implement system-specific combat tracking behaviors.
   * The default implementation of this function does nothing.
   * This method only executes for one designated GM user. If no GM users are present this method will not be called.
   * @param {Combatant} combatant               The Combatant whose turn just ended
   * @param {CombatTurnEventContext} context    The context of the turn that just ended
   * @returns {Promise<void>}
   * @protected
   */
  async _onEndTurn(combatant, context) {}

  /* -------------------------------------------- */

  /**
   * A workflow that occurs at the end of each Combat Round.
   * This workflow occurs after the Combat document update.
   * This method only executes for one designated GM user. If no GM users are present this method will not be called.
   * @param {CombatRoundEventContext} context    The context of the round that just ended
   * @returns {Promise<void>}
   */
  async #onEndRound(context) {
    if ( CONFIG.debug.combat ) console.debug(` | Combat End Round: ${context.round}`);
    await this._onEndRound(context);
    // noinspection ES6MissingAwait
    this.#triggerRegionEvents(CONST.REGION_EVENTS.TOKEN_ROUND_END, context, this.combatants);
  }

  /* -------------------------------------------- */

  /**
   * A workflow that occurs at the end of each Combat Round.
   * This workflow occurs after the Combat document update.
   * This can be overridden to implement system-specific combat tracking behaviors.
   * The default implementation of this function does nothing.
   * This method only executes for one designated GM user. If no GM users are present this method will not be called.
   * @param {CombatRoundEventContext} context    The context of the round that just ended
   * @returns {Promise<void>}
   * @protected
   */
  async _onEndRound(context) {}

  /* -------------------------------------------- */

  /**
   * A workflow that occurs at the start of each Combat Round.
   * This workflow occurs after the Combat document update.
   * This method only executes for one designated GM user. If no GM users are present this method will not be called.
   * @param {CombatRoundEventContext} context    The context of the round that just started
   * @returns {Promise<void>}
   */
  async #onStartRound(context) {
    if ( CONFIG.debug.combat ) console.debug(` | Combat Start Round: ${context.round}`);
    await this._onStartRound(context);
    // noinspection ES6MissingAwait
    this.#triggerRegionEvents(CONST.REGION_EVENTS.TOKEN_ROUND_START, context, this.combatants);
  }

  /* -------------------------------------------- */

  /**
   * A workflow that occurs at the start of each Combat Round.
   * This workflow occurs after the Combat document update.
   * This can be overridden to implement system-specific combat tracking behaviors.
   * The default implementation of this function does nothing.
   * This method only executes for one designated GM user. If no GM users are present this method will not be called.
   * @param {CombatRoundEventContext} context    The context of the round that just started
   * @returns {Promise<void>}
   * @protected
   */
  async _onStartRound(context) {}

  /* -------------------------------------------- */

  /**
   * A workflow that occurs at the start of each Combat Turn.
   * This workflow occurs after the Combat document update.
   * This method only executes for one designated GM user. If no GM users are present this method will not be called.
   * @param {Combatant} combatant               The Combatant whose turn just started
   * @param {CombatTurnEventContext} context    The context of the turn that just started
   * @returns {Promise<void>}
   */
  async #onStartTurn(combatant, context) {
    if ( CONFIG.debug.combat ) console.debug(` | Combat Start Turn: ${combatant.name}`);
    await this._onStartTurn(combatant, context);
    if ( combatant.token ) await this._clearMovementHistoryOnStartTurn(combatant, context);
    // noinspection ES6MissingAwait
    this.#triggerRegionEvents(CONST.REGION_EVENTS.TOKEN_TURN_START, context, [combatant]);
  }

  /* -------------------------------------------- */

  /**
   * A workflow that occurs at the start of each Combat Turn.
   * This workflow occurs after the Combat document update.
   * This can be overridden to implement system-specific combat tracking behaviors.
   * The default implementation of this function does nothing.
   * This method only executes for one designated GM user. If no GM users are present this method will not be called.
   * @param {Combatant} combatant               The Combatant whose turn just started
   * @param {CombatTurnEventContext} context    The context of the turn that just started
   * @returns {Promise<void>}
   * @protected
   */
  async _onStartTurn(combatant, context) {}

  /* -------------------------------------------- */

  /**
   * Called after {@link Combat#_onStartTurn} and takes care of clearing the movement history of the
   * Combatant's Token.
   * This function is not called for Combatants that don't have a Token.
   * The default implementation clears the movement history always.
   * @param {Combatant} combatant               The Combatant whose turn just started
   * @param {CombatTurnEventContext} context    The context of the turn that just started
   * @returns {Promise<void>}
   * @protected
   */
  async _clearMovementHistoryOnStartTurn(combatant, context) {
    await combatant.token.clearMovementHistory();
  }

  /* -------------------------------------------- */

  /**
   * Trigger Region events for Combat events.
   * @param {string} eventName                  The event name
   * @param {object & {token: never, combatant: never, combat: never}} eventData
   *                                            The event data (without `token`, `combatant`, and `combat`)
   * @param {Iterable<Combatant>} combatants    The combatants to trigger the event for
   * @returns {Promise<void>}
   */
  async #triggerRegionEvents(eventName, eventData, combatants) {
    const promises = [];
    for ( const combatant of combatants ) {
      const token = combatant.token;
      if ( !token ) continue;
      for ( const region of token.regions ) {
        promises.push(region._triggerEvent(eventName, {token, combatant, combat: this, ...eventData}));
      }
    }
    await Promise.allSettled(promises);
  }

  /* -------------------------------------------- */

  /**
   * When Tokens are deleted, handle actions to update/delete Combatants of these Tokens.
   * @param {TokenDocument[]} tokens               An array of Tokens which have been deleted
   * @param {DatabaseDeleteOperation} operation    The operation that deleted the Tokens
   * @param {User} user                            The User that deleted the Tokens
   * @internal
   */
  static _onDeleteTokens(tokens, operation, user) {
    if ( operation.pack ) return;
    const sceneId = operation.parent.id;

    // Prepare Combatant updates and deletions
    const modifications = [];
    for ( const token of tokens ) {
      const replacement = operation.replacements?.[token.id];
      if ( replacement ) {
        const {primaryId: newSceneId, id: newTokenId} = foundry.utils.parseUuid(replacement);
        modifications.push([token.id, newSceneId, newTokenId]);
      }
      else modifications.push([token.id]);
    }

    // Iterate over all potentially relevant Combat encounters
    for ( const combat of game.combats ) {

      // Skip Combats that cannot contain the deleted Tokens
      if ( (combat.scene !== null) && (combat.scene !== sceneId) ) continue;

      // Determine necessary Combatant updates and deletions
      const updates = [];
      const deletions = [];
      for ( const combatant of combat.combatants ) {
        for ( const [tokenId, newSceneId, newTokenId] of modifications ) {
          if ( (combatant.sceneId === sceneId) && (combatant.tokenId === tokenId) ) {

            // Token was replaced
            if ( newTokenId ) updates.push({_id: combatant.id, sceneId: newSceneId, tokenId: newTokenId});

            // Token was deleted
            else deletions.push(combatant.id);
          }
        }
      }

      // Perform necessary Combatant updates and deletions
      if ( updates.length ) combat.updateEmbeddedDocuments("Combatant", updates);
      if ( deletions.length ) combat.deleteEmbeddedDocuments("Combatant", deletions);
    }
  }

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  getCombatantByActor(actor) {
    const combatants = this.getCombatantsByActor(actor);
    return combatants?.[0] || null;
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  getCombatantByToken(token) {
    const combatants = this.getCombatantsByToken(token);
    return combatants?.[0] || null;
  }
}

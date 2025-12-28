import BaseCombatant from "@common/documents/combatant.mjs";
import ClientDocumentMixin from "./abstract/client-document.mjs";

/**
 * @import Combat from "./combat.mjs";
 * @import User from "./user.mjs";
 * @import Actor from "./actor.mjs";
 * @import TokenDocument from "./token.mjs";
 * @import {Roll} from "../dice/_module.mjs";
 */

/**
 * The client-side Combatant document which extends the common BaseCombatant model.
 *
 * @extends BaseCombatant
 * @mixes ClientDocumentMixin
 * @category Documents
 *
 * @see {@link foundry.documents.Combat}: The Combat document which contains Combatant embedded documents
 * @see {@link foundry.applications.sheets.CombatantConfig}: The application which configures a
 *   Combatant
 */
export default class Combatant extends ClientDocumentMixin(BaseCombatant) {

  /**
   * The token video source image (if any)
   * @type {string|null}
   * @internal
   */
  _videoSrc = null;

  /**
   * The current value of the special tracked resource which pertains to this Combatant
   * @type {object|null}
   */
  resource = null;

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * A convenience alias of Combatant#parent which is more semantically intuitive
   * @type {Combat|null}
   */
  get combat() {
    return this.parent;
  }

  /* -------------------------------------------- */

  /**
   * This is treated as a non-player combatant if it has no associated actor and no player users who can control it
   * @type {boolean}
   */
  get isNPC() {
    return !this.actor || !this.hasPlayerOwner;
  }

  /* -------------------------------------------- */

  /**
   * Eschew `ClientDocument`'s redirection to `Combat#permission` in favor of special ownership determination.
   * @override
   */
  get permission() {
    if ( game.user.isGM ) return CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
    return this.getUserLevel(game.user);
  }

  /* -------------------------------------------- */

  /** @override */
  get visible() {
    return this.isOwner || !this.hidden;
  }

  /* -------------------------------------------- */

  /**
   * A reference to the Actor document which this Combatant represents, if any
   * @type {Actor|null}
   */
  get actor() {
    if ( this.token ) return this.token.actor;
    return game.actors.get(this.actorId) || null;
  }

  /* -------------------------------------------- */

  /**
   * A reference to the Token document which this Combatant represents, if any
   * @type {TokenDocument|null}
   */
  get token() {
    const scene = this.sceneId ? game.scenes.get(this.sceneId) : this.parent?.scene;
    return scene?.tokens.get(this.tokenId) || null;
  }

  /* -------------------------------------------- */

  /**
   * An array of non-Gamemaster Users who have ownership of this Combatant.
   * @type {User[]}
   */
  get players() {
    return game.users.filter(u => !u.isGM && this.testUserPermission(u, "OWNER"));
  }

  /* -------------------------------------------- */

  /**
   * Has this combatant been marked as defeated?
   * @type {boolean}
   */
  get isDefeated() {
    return this.defeated || !!this.actor?.statuses.has(CONFIG.specialStatusEffects.DEFEATED);
  }

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /**
   * Get a Roll object which represents the initiative roll for this Combatant.
   * @param {string} formula        An explicit Roll formula to use for the combatant.
   * @returns {Roll}                The unevaluated Roll instance to use for the combatant.
   */
  getInitiativeRoll(formula) {
    formula = formula || this._getInitiativeFormula();
    const rollData = this.actor?.getRollData() || {};
    return foundry.dice.Roll.create(formula, rollData);
  }

  /* -------------------------------------------- */

  /**
   * Roll initiative for this particular combatant.
   * @param {string} [formula]      A dice formula which overrides the default for this Combatant.
   * @returns {Promise<Combatant>}  The updated Combatant.
   */
  async rollInitiative(formula) {
    const roll = this.getInitiativeRoll(formula);
    await roll.evaluate();
    return this.update({initiative: roll.total});
  }

  /* -------------------------------------------- */

  /** @override */
  prepareDerivedData() {
    const token = this.token;
    this.actorId ??= token?.actorId ?? null;
    const tex = token?.texture.src;
    this._videoSrc = foundry.helpers.media.VideoHelper.hasVideoExtension(tex) ? tex : null;

    // Assign image for combatant (undefined if the token src image is a video)
    this.img ||= (this._videoSrc ? undefined : (token?.texture.src || this.actor?.img));
    this.name ||= token?.name || this.actor?.name || game.i18n.localize("COMBAT.UnknownCombatant");

    this.updateResource();
    this._prepareGroup();
  }

  /* -------------------------------------------- */

  /**
   * Update the value of the tracked resource for this Combatant.
   * @returns {null|object}
   */
  updateResource() {
    if ( !this.actor || !this.combat ) return this.resource = null;
    return this.resource = foundry.utils.getProperty(this.actor.system, this.parent.settings.resource) || null;
  }

  /* -------------------------------------------- */

  /**
   * Acquire the default dice formula which should be used to roll initiative for this combatant.
   * Modules or systems could choose to override or extend this to accommodate special situations.
   * @returns {string}               The initiative formula to use for this combatant.
   * @protected
   */
  _getInitiativeFormula() {
    return String(CONFIG.Combat.initiative.formula || game.system.initiative);
  }

  /* -------------------------------------------- */

  /**
   * Prepare derived data based on group membership.
   * @protected
   */
  _prepareGroup() {
    const group = this.parent.groups.get(this._source.group);
    if ( !group ) return;
    group.members.add(this);
    group.hidden &&= this.hidden;
    group.defeated &&= this.isDefeated;
    if ( Number.isFinite(group.initiative) ) this.initiative = group.initiative;
    this.group = group;
  }

  /* -------------------------------------------- */

  /**
   * Clear the movement history of the Combatant's Token.
   * @returns {Promise<void>}
   */
  async clearMovementHistory() {
    await this.token?.clearMovementHistory();
  }

  /* -------------------------------------------- */
  /*  Database Lifecycle Events                   */
  /* -------------------------------------------- */

  /** @override */
  static async _preCreateOperation(documents, operation, _user) {
    const combatant = operation.parent?.combatant;
    if ( !combatant ) return;
    const combat = operation.parent.clone();
    combat.updateSource({combatants: documents.map(d => d.toObject())});
    combat.setupTurns();
    operation.combatTurn = Math.max(combat.turns.findIndex(t => t.id === combatant.id), 0);
    operation.turnEvents = false;
  }

  /* -------------------------------------------- */

  /** @override */
  static async _preUpdateOperation(_documents, operation, _user) {
    const combatant = operation.parent?.combatant;
    if ( !combatant ) return;
    const combat = operation.parent.clone();
    combat.updateSource({combatants: operation.updates});
    combat.setupTurns();
    if ( operation.combatTurn === undefined ) {
      operation.combatTurn = Math.max(combat.turns.findIndex(t => t.id === combatant.id), 0);
      operation.turnEvents = false;
    }
  }

  /* -------------------------------------------- */

  /** @override */
  static async _preDeleteOperation(_documents, operation, _user) {
    const combatant = operation.parent?.combatant;
    if ( !combatant ) return;

    // Simulate new turns
    const combat = operation.parent.clone();
    for ( const id of operation.ids ) combat.combatants.delete(id);
    combat.setupTurns();

    // If the current combatant was deleted
    if ( operation.ids.includes(combatant?.id) ) {
      const {prevSurvivor, nextSurvivor} = operation.parent.turns.reduce((obj, t, i) => {
        let valid = !operation.ids.includes(t.id);
        if ( combat.settings.skipDefeated ) valid &&= !t.isDefeated;
        if ( !valid ) return obj;
        if ( i < this.turn ) obj.prevSurvivor = t;
        if ( !obj.nextSurvivor && (i >= this.turn) ) obj.nextSurvivor = t;
        return obj;
      }, {});
      const survivor = nextSurvivor || prevSurvivor;
      if ( survivor ) {
        operation.combatTurn = combat.turns.findIndex(t => t.id === survivor.id);
        operation.turnEvents = (survivor === nextSurvivor);
      }
    }

    // Otherwise maintain the same combatant turn
    else {
      operation.combatTurn = Math.max(combat.turns.findIndex(t => t.id === combatant.id), 0);
      operation.turnEvents = false;
    }
  }
}

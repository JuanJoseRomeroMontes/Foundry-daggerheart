import BaseActiveEffect from "@common/documents/active-effect.mjs";
import ClientDocumentMixin from "./abstract/client-document.mjs";
import Actor from "./actor.mjs";
import Hooks from "../helpers/hooks.mjs";

/**
 * @import {ActiveEffectData, ActiveEffectDuration, EffectChangeData} from "@client/documents/_types.mjs";
 * @import {DocumentConstructionContext} from "@common/abstract/_types.mjs";
 * @import Document from "@common/abstract/document.mjs";
 */

/**
 * The client-side ActiveEffect document which extends the common BaseActiveEffect model.
 * Each ActiveEffect belongs to the effects collection of its parent Document.
 * Each ActiveEffect contains a ActiveEffectData object which provides its source data.
 *
 * ### Hook Events
 * - {@link hookEvents.applyActiveEffect}
 *
 * @extends BaseActiveEffect
 * @mixes ClientDocumentMixin
 * @category Documents
 *
 * @see {@link foundry.documents.Actor}: The Actor document which contains ActiveEffect embedded documents
 * @see {@link foundry.documents.Item}: The Item document which contains ActiveEffect embedded documents
 *
 * @property {ActiveEffectDuration} duration        Expanded effect duration data.
 */
export default class ActiveEffect extends ClientDocumentMixin(BaseActiveEffect) {

  /**
   * Create an ActiveEffect instance from some status effect ID.
   * Delegates to {@link ActiveEffect._fromStatusEffect} to create the ActiveEffect instance
   * after creating the ActiveEffect data from the status effect data if `CONFIG.statusEffects`.
   * @param {string} statusId                             The status effect ID.
   * @param {DocumentConstructionContext} [options]       Additional options to pass to the ActiveEffect constructor.
   * @returns {Promise<ActiveEffect>}                     The created ActiveEffect instance.
   *
   * @throws {Error} An error if there is no status effect in `CONFIG.statusEffects` with the given status ID and if
   * the status has implicit statuses but doesn't have a static _id.
   */
  static async fromStatusEffect(statusId, options={}) {
    const status = CONFIG.statusEffects.find(e => e.id === statusId);
    if ( !status ) throw new Error(`Invalid status ID "${statusId}" provided to ActiveEffect#fromStatusEffect`);
    /** @deprecated since v12 */
    for ( const [oldKey, newKey] of Object.entries({label: "name", icon: "img"}) ) {
      if ( !(newKey in status) && (oldKey in status) ) {
        const msg = `StatusEffectConfig#${oldKey} has been deprecated in favor of StatusEffectConfig#${newKey}`;
        foundry.utils.logCompatibilityWarning(msg, {since: 12, until: 14, once: true});
      }
    }
    const {id, label, icon, hud: _hud, ...effectData} = foundry.utils.deepClone(status);
    effectData.name = game.i18n.localize(effectData.name ?? /** @deprecated since v12 */ label);
    effectData.img ??= /** @deprecated since v12 */ icon;
    effectData.statuses = Array.from(new Set([id, ...effectData.statuses ?? []]));
    if ( (effectData.statuses.length > 1) && !status._id ) {
      throw new Error("Status effects with implicit statuses must have a static _id");
    }
    return ActiveEffect.implementation._fromStatusEffect(statusId, effectData, options);
  }

  /* -------------------------------------------- */

  /**
   * Create an ActiveEffect instance from status effect data.
   * Called by {@link ActiveEffect.fromStatusEffect}.
   * @param {string} statusId                          The status effect ID.
   * @param {ActiveEffectData} effectData              The status effect data.
   * @param {DocumentConstructionContext} [options]    Additional options to pass to the ActiveEffect constructor.
   * @returns {Promise<ActiveEffect>}                  The created ActiveEffect instance.
   * @protected
   */
  static async _fromStatusEffect(statusId, effectData, options) {
    return new this(effectData, options);
  }

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * Is there some system logic that makes this active effect ineligible for application?
   * @type {boolean}
   */
  get isSuppressed() {
    if ( this.system instanceof foundry.abstract.TypeDataModel ) return this.system.isSuppressed ?? false;
    return false;
  }

  /* --------------------------------------------- */

  /**
   * Retrieve the Document that this ActiveEffect targets for modification.
   * @type {Document|null}
   */
  get target() {
    if ( this.parent instanceof Actor ) return this.parent;
    if ( CONFIG.ActiveEffect.legacyTransferral ) return this.transfer ? null : this.parent;
    return this.transfer ? (this.parent.parent ?? null) : this.parent;
  }

  /* -------------------------------------------- */

  /**
   * Whether the Active Effect is currently applying its changes to the target.
   * @type {boolean}
   */
  get active() {
    return !this.disabled && !this.isSuppressed;
  }

  /* -------------------------------------------- */

  /**
   * Does this Active Effect currently modify an Actor?
   * @type {boolean}
   */
  get modifiesActor() {
    if ( !this.active ) return false;
    if ( CONFIG.ActiveEffect.legacyTransferral ) return this.parent instanceof Actor;
    return this.target instanceof Actor;
  }

  /* --------------------------------------------- */

  /** @inheritDoc */
  prepareDerivedData() {
    this.updateDuration();
  }

  /* --------------------------------------------- */

  /**
   * Update derived Active Effect duration data.
   * Configure the remaining and label properties to be getters which lazily recompute only when necessary.
   * @returns {ActiveEffectDuration}
   */
  updateDuration() {
    const {remaining, label, ...durationData} = this._prepareDuration();
    Object.assign(this.duration, durationData);
    const getOrUpdate = (attr, value) => this._requiresDurationUpdate() ? this.updateDuration()[attr] : value;
    Object.defineProperties(this.duration, {
      remaining: {
        get: getOrUpdate.bind(this, "remaining", remaining),
        configurable: true
      },
      label: {
        get: getOrUpdate.bind(this, "label", label),
        configurable: true
      }
    });
    return this.duration;
  }

  /* --------------------------------------------- */

  /**
   * Determine whether the ActiveEffect requires a duration update.
   * True if the worldTime has changed for an effect whose duration is tracked in seconds.
   * True if the combat turn has changed for an effect tracked in turns where the effect target is a combatant.
   * @returns {boolean}
   * @protected
   */
  _requiresDurationUpdate() {
    const {_worldTime, _combatTime, type} = this.duration;
    if ( type === "seconds" ) return game.time.worldTime !== _worldTime;
    if ( (type === "turns") && game.combat ) {
      const ct = this._getCombatTime(game.combat.round, game.combat.turn);
      return (ct !== _combatTime) && !!this.target?.inCombat;
    }
    return false;
  }

  /* --------------------------------------------- */

  /**
   * Compute derived data related to active effect duration.
   * @returns {{
   *   type: string,
   *   duration: number|null,
   *   remaining: number|null,
   *   label: string,
   *   [_worldTime]: number,
   *   [_combatTime]: number}
   * }
   * @internal
   */
  _prepareDuration() {
    const d = this.duration;

    // Time-based duration
    if ( Number.isNumeric(d.seconds) ) {
      const wt = game.time.worldTime;
      const start = (d.startTime || wt);
      const elapsed = wt - start;
      const remaining = d.seconds - elapsed;
      return {
        type: "seconds",
        duration: d.seconds,
        remaining: remaining,
        label: `${remaining} ${game.i18n.localize("Seconds")}`,
        _worldTime: wt
      };
    }

    // Turn-based duration
    else if ( d.rounds || d.turns ) {
      const cbt = game.combat;
      if ( !cbt ) return {
        type: "turns",
        _combatTime: undefined
      };

      // Determine the current combat duration
      const c = {round: cbt.round ?? 0, turn: cbt.turn ?? 0, nTurns: cbt.turns.length || 1};
      const current = this._getCombatTime(c.round, c.turn);
      const duration = this._getCombatTime(d.rounds, d.turns);
      const start = this._getCombatTime(d.startRound, d.startTurn, c.nTurns);

      // If the effect has not started yet display the full duration
      if ( current <= start ) return {
        type: "turns",
        duration: duration,
        remaining: duration,
        label: this._getDurationLabel(d.rounds, d.turns),
        _combatTime: current
      };

      // Some number of remaining rounds and turns (possibly zero)
      const remaining = Math.max(((start + duration) - current).toNearest(0.01), 0);
      const remainingRounds = Math.floor(remaining);
      let remainingTurns = 0;
      if ( remaining > 0 ) {
        let nt = c.turn - d.startTurn;
        while ( nt < 0 ) nt += c.nTurns;
        remainingTurns = nt > 0 ? c.nTurns - nt : 0;
      }
      return {
        type: "turns",
        duration: duration,
        remaining: remaining,
        label: this._getDurationLabel(remainingRounds, remainingTurns),
        _combatTime: current
      };
    }

    // No duration
    return {
      type: "none",
      duration: null,
      remaining: null,
      label: game.i18n.localize("None")
    };
  }

  /* -------------------------------------------- */

  /**
   * Format a round+turn combination as a decimal
   * @param {number} round    The round number
   * @param {number} turn     The turn number
   * @param {number} [nTurns] The maximum number of turns in the encounter
   * @returns {number}        The decimal representation
   * @internal
   */
  _getCombatTime(round, turn, nTurns) {
    if ( nTurns !== undefined ) turn = Math.min(turn, nTurns);
    round = Math.max(round, 0);
    turn = Math.max(turn, 0);
    return (round || 0) + ((turn || 0) / 100);
  }

  /* -------------------------------------------- */

  /**
   * Format a number of rounds and turns into a human-readable duration label
   * @param {number} rounds   The number of rounds
   * @param {number} turns    The number of turns
   * @returns {string}        The formatted label
   * @internal
   */
  _getDurationLabel(rounds, turns) {
    const parts = [];
    const pluralRules = new Intl.PluralRules(game.i18n.lang);
    if ( rounds > 0 ) {
      const unit = game.i18n.localize(`COMBAT.DURATION.ROUNDS.${pluralRules.select(rounds)}`);
      parts.push(`${rounds} ${unit}`);
    }
    if ( turns > 0 ) {
      const unit = game.i18n.localize(`COMBAT.DURATION.TURNS.${pluralRules.select(turns)}`);
      parts.push(game.i18n.localize(`${turns} ${unit}`));
    }
    else if (( rounds + turns ) === 0 ) parts.push(game.i18n.localize("COMBAT.DURATION.None"));
    return game.i18n.getListFormatter({style: "narrow"}).format(parts);
  }

  /* -------------------------------------------- */

  /**
   * Describe whether the ActiveEffect has a temporary duration based on combat turns or rounds.
   * @type {boolean}
   */
  get isTemporary() {
    const duration = this.duration.seconds ?? (this.duration.rounds || this.duration.turns) ?? 0;
    return (duration > 0) || (this.statuses.size > 0);
  }

  /* -------------------------------------------- */

  /**
   * The source name of the Active Effect. The source is retrieved synchronously.
   * Therefore "Unknown" (localized) is returned if the origin points to a document inside a compendium.
   * Returns "None" (localized) if it has no origin, and "Unknown" (localized) if the origin cannot be resolved.
   * @type {string}
   */
  get sourceName() {
    if ( !this.origin ) return game.i18n.localize("None");
    let name;
    try {
      name = foundry.utils.fromUuidSync(this.origin)?.name;
    } catch(e) {}
    return name || game.i18n.localize("Unknown");
  }

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /**
   * Apply EffectChangeData to a field within a DataModel.
   * @param {DataModel} model          The model instance.
   * @param {EffectChangeData} change  The change to apply.
   * @param {DataField} [field]        The field. If not supplied, it will be retrieved from the supplied model.
   * @returns {*}                      The updated value.
   */
  static applyField(model, change, field) {
    field ??= model.schema.getField(change.key);
    const current = foundry.utils.getProperty(model, change.key);
    const update = field.applyChange(current, model, change);
    if ( update !== undefined ) foundry.utils.setProperty(model, change.key, update);
    return update;
  }

  /* -------------------------------------------- */

  /**
   * Apply this ActiveEffect to a provided Actor.
   * @param {Actor} actor                   The Actor to whom this effect should be applied
   * @param {EffectChangeData} change       The change data being applied
   * @returns {Record<string, *>}           An object of property paths and their updated values.
   */

  apply(actor, change) {
    // TODO: This method is poorly conceived. Its functionality is static, applying a provided change to an Actor
    // TODO: When we revisit this in Active Effects V2 this should become an Actor method, or a static method
    let field;
    const changes = {};
    if ( change.key.startsWith("system.") ) {
      if ( actor.system instanceof foundry.abstract.DataModel ) {
        field = actor.system.schema.getField(change.key.slice(7));
      }
    } else field = actor.schema.getField(change.key);
    if ( field ) changes[change.key] = this.constructor.applyField(actor, change, field);
    else this._applyLegacy(actor, change, changes);
    return changes;
  }

  /* -------------------------------------------- */

  /**
   * Apply this ActiveEffect to a provided Actor using a heuristic to infer the value types based on the current value
   * and/or the default value in the template.json.
   * @param {Actor} actor                The Actor to whom this effect should be applied.
   * @param {EffectChangeData} change    The change data being applied.
   * @param {Record<string, *>} changes  The aggregate update paths and their updated values.
   * @protected
   */
  _applyLegacy(actor, change, changes) {
    // Determine the data type of the target field
    const current = foundry.utils.getProperty(actor, change.key) ?? null;
    let target = current;
    if ( current === null ) {
      const model = game.model.Actor[actor.type] || {};
      target = foundry.utils.getProperty(model, change.key) ?? null;
    }
    const targetType = foundry.utils.getType(target);

    // Cast the effect change value to the correct type
    let delta;
    try {
      if ( targetType === "Array" ) {
        const innerType = target.length ? foundry.utils.getType(target[0]) : "string";
        delta = this.#castArray(change.value, innerType);
      }
      else delta = this.#castDelta(change.value, targetType);
    } catch(err) {
      console.warn(`Actor [${actor.id}] | Unable to parse active effect change for ${change.key}: "${change.value}"`);
      return;
    }

    // Apply the change depending on the application mode
    const modes = CONST.ACTIVE_EFFECT_MODES;
    switch ( change.mode ) {
      case modes.ADD:
        this._applyAdd(actor, change, current, delta, changes);
        break;
      case modes.MULTIPLY:
        this._applyMultiply(actor, change, current, delta, changes);
        break;
      case modes.OVERRIDE:
        this._applyOverride(actor, change, current, delta, changes);
        break;
      case modes.UPGRADE:
      case modes.DOWNGRADE:
        this._applyUpgrade(actor, change, current, delta, changes);
        break;
      default:
        this._applyCustom(actor, change, current, delta, changes);
        break;
    }

    // Apply all changes to the Actor data
    foundry.utils.mergeObject(actor, changes);
  }

  /* -------------------------------------------- */

  /**
   * Cast a raw EffectChangeData change string to the desired data type.
   * @param {string} raw      The raw string value
   * @param {string} type     The target data type that the raw value should be cast to match
   * @returns {*}             The parsed delta cast to the target data type
   */
  #castDelta(raw, type) {
    let delta;
    switch ( type ) {
      case "boolean":
        delta = Boolean(this.#parseOrString(raw));
        break;
      case "number":
        delta = Number.fromString(raw);
        if ( Number.isNaN(delta) ) delta = 0;
        break;
      case "string":
        delta = String(raw);
        break;
      default:
        delta = this.#parseOrString(raw);
    }
    return delta;
  }

  /* -------------------------------------------- */

  /**
   * Cast a raw EffectChangeData change string to an Array of an inner type.
   * @param {string} raw      The raw string value
   * @param {string} type     The target data type of inner array elements
   * @returns {Array<*>}      The parsed delta cast as a typed array
   */
  #castArray(raw, type) {
    let delta;
    try {
      delta = this.#parseOrString(raw);
      delta = delta instanceof Array ? delta : [delta];
    } catch(e) {
      delta = [raw];
    }
    return delta.map(d => this.#castDelta(d, type));
  }

  /* -------------------------------------------- */

  /**
   * Parse serialized JSON, or retain the raw string.
   * @param {string} raw      A raw serialized string
   * @returns {*}             The parsed value, or the original value if parsing failed
   */
  #parseOrString(raw) {
    try {
      return JSON.parse(raw);
    } catch(err) {
      return raw;
    }
  }

  /* -------------------------------------------- */

  /**
   * Apply an ActiveEffect that uses an ADD application mode.
   * The way that effects are added depends on the data type of the current value.
   *
   * If the current value is null, the change value is assigned directly.
   * If the current type is a string, the change value is concatenated.
   * If the current type is a number, the change value is cast to numeric and added.
   * If the current type is an array, the change value is appended to the existing array if it matches in type.
   *
   * @param {Actor} actor                   The Actor to whom this effect should be applied
   * @param {EffectChangeData} change       The change data being applied
   * @param {*} current                     The current value being modified
   * @param {*} delta                       The parsed value of the change object
   * @param {object} changes                An object which accumulates changes to be applied
   * @protected
   */
  _applyAdd(actor, change, current, delta, changes) {
    let update;
    const ct = foundry.utils.getType(current);
    switch ( ct ) {
      case "boolean":
        update = current || delta;
        break;
      case "null":
        update = delta;
        break;
      case "Array":
        update = current.concat(delta);
        break;
      default:
        update = current + delta;
        break;
    }
    if ( update !== current ) changes[change.key] = update;
  }

  /* -------------------------------------------- */

  /**
   * Apply an ActiveEffect that uses a MULTIPLY application mode.
   * Changes which MULTIPLY must be numeric to allow for multiplication.
   * @param {Actor} actor                   The Actor to whom this effect should be applied
   * @param {EffectChangeData} change       The change data being applied
   * @param {*} current                     The current value being modified
   * @param {*} delta                       The parsed value of the change object
   * @param {object} changes                An object which accumulates changes to be applied
   * @protected
   */
  _applyMultiply(actor, change, current, delta, changes) {
    let update;
    const ct = foundry.utils.getType(current);
    switch ( ct ) {
      case "boolean":
        update = current && delta;
        break;
      case "number":
        update = current * delta;
        break;
    }
    if ( update !== current ) changes[change.key] = update;
  }

  /* -------------------------------------------- */

  /**
   * Apply an ActiveEffect that uses an OVERRIDE application mode.
   * Numeric data is overridden by numbers, while other data types are overridden by any value
   * @param {Actor} actor                   The Actor to whom this effect should be applied
   * @param {EffectChangeData} change       The change data being applied
   * @param {*} current                     The current value being modified
   * @param {*} delta                       The parsed value of the change object
   * @param {object} changes                An object which accumulates changes to be applied
   * @protected
   */
  _applyOverride(actor, change, current, delta, changes) {
    if ( delta !== current ) changes[change.key] = delta;
  }

  /* -------------------------------------------- */

  /**
   * Apply an ActiveEffect that uses an UPGRADE, or DOWNGRADE application mode.
   * Changes which UPGRADE or DOWNGRADE must be numeric to allow for comparison.
   * @param {Actor} actor                   The Actor to whom this effect should be applied
   * @param {EffectChangeData} change       The change data being applied
   * @param {*} current                     The current value being modified
   * @param {*} delta                       The parsed value of the change object
   * @param {object} changes                An object which accumulates changes to be applied
   * @protected
   */
  _applyUpgrade(actor, change, current, delta, changes) {
    let update;
    const ct = foundry.utils.getType(current);
    switch ( ct ) {
      case "boolean":
      case "number":
        if ( (change.mode === CONST.ACTIVE_EFFECT_MODES.UPGRADE) && (delta > current) ) update = delta;
        else if ( (change.mode === CONST.ACTIVE_EFFECT_MODES.DOWNGRADE) && (delta < current) ) update = delta;
        break;
    }
    if ( (update !== current) && (update !== undefined) ) changes[change.key] = update;
  }

  /* -------------------------------------------- */

  /**
   * Apply an ActiveEffect that uses a CUSTOM application mode.
   * @param {Actor} actor                   The Actor to whom this effect should be applied
   * @param {EffectChangeData} change       The change data being applied
   * @param {*} current                     The current value being modified
   * @param {*} delta                       The parsed value of the change object
   * @param {object} changes                An object which accumulates changes to be applied
   * @protected
   */
  _applyCustom(actor, change, current, delta, changes) {
    const preHook = foundry.utils.getProperty(actor, change.key);
    Hooks.call("applyActiveEffect", actor, change, current, delta, changes);
    const postHook = foundry.utils.getProperty(actor, change.key);
    if ( (postHook !== preHook) && (postHook !== undefined) ) changes[change.key] = postHook;
  }

  /* -------------------------------------------- */

  /**
   * Retrieve the initial duration configuration.
   * @returns {{duration: {startTime: number, [startRound]: number, [startTurn]: number}}}
   */
  static getInitialDuration() {
    const data = {duration: {startTime: game.time.worldTime}};
    if ( game.combat ) {
      data.duration.startRound = game.combat.round;
      data.duration.startTurn = game.combat.turn ?? 0;
    }
    return data;
  }

  /* -------------------------------------------- */
  /*  Event Handlers                              */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async _preCreate(data, options, user) {
    const allowed = await super._preCreate(data, options, user);
    if ( allowed === false ) return false;

    // Set initial duration data for Actor-owned effects
    if ( this.parent instanceof Actor ) {
      const updates = this.constructor.getInitialDuration();
      for ( const k of Object.keys(updates.duration) ) {
        if ( Number.isNumeric(data.duration?.[k]) ) delete updates.duration[k]; // Prefer user-defined duration data
      }
      updates.transfer = false;
      this.updateSource(updates);
    }
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onCreate(data, options, userId) {
    super._onCreate(data, options, userId);
    if ( this.modifiesActor && (options.animate !== false) ) this._displayScrollingStatus(true);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);
    if ( !(this.target instanceof Actor) ) return;
    const activeChanged = "disabled" in changed;
    if ( activeChanged && (options.animate !== false) ) this._displayScrollingStatus(this.active);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onDelete(options, userId) {
    super._onDelete(options, userId);
    if ( this.modifiesActor && (options.animate !== false) ) this._displayScrollingStatus(false);
  }

  /* -------------------------------------------- */

  /**
   * Display changes to active effects as scrolling Token status text.
   * @param {boolean} enabled     Is the active effect currently enabled?
   * @protected
   */
  _displayScrollingStatus(enabled) {
    if ( !(this.statuses.size || this.changes.length) ) return;
    const actor = this.target;
    const tokens = actor.getActiveTokens(true);
    const text = `${enabled ? "+" : "−"}(${this.name})`;
    for ( const token of tokens ) {
      if ( !token.visible || token.document.isSecret ) continue;
      canvas.interface.createScrollingText(token.center, text, {
        anchor: CONST.TEXT_ANCHOR_POINTS.CENTER,
        direction: enabled ? CONST.TEXT_ANCHOR_POINTS.TOP : CONST.TEXT_ANCHOR_POINTS.BOTTOM,
        distance: (2 * token.h),
        fontSize: 28,
        stroke: 0x000000,
        strokeThickness: 4,
        jitter: 0.25
      });
    }
  }
}

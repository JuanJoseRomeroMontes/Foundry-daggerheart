import BaseActor from "@common/documents/actor.mjs";
import ClientDocumentMixin from "./abstract/client-document.mjs";
import Hooks from "@client/helpers/hooks.mjs";
import {getDocumentClass} from "@client/utils/helpers.mjs";

/**
 * @import EmbeddedCollection from "@common/abstract/embedded-collection.mjs";
 * @import Token from "@client/canvas/placeables/token.mjs";
 * @import Combat from "./combat.mjs";
 * @import Scene from "./scene.mjs";
 * @import TokenDocument from "./token.mjs";
 * @import ActiveEffect from "./active-effect.mjs";
 * @import Item from "./item.mjs";
 */

/**
 * The client-side Actor document which extends the common BaseActor model.
 *
 * ### Hook Events
 * - {@link hookEvents.applyCompendiumArt}
 * - {@link hookEvents.modifyTokenAttribute}
 *
 * @extends BaseActor
 * @mixes ClientDocumentMixin
 * @category Documents
 *
 * @see {@link foundry.documents.collections.Actors}: The world-level collection of Actor documents
 * @see {@link foundry.applications.sheets.ActorSheet}: The Actor configuration application
 *
 * @example Create a new Actor
 * ```js
 * let actor = await Actor.implementation.create({
 *   name: "New Test Actor",
 *   type: "character",
 *   img: "artwork/character-profile.jpg"
 * });
 * ```
 *
 * @example Retrieve an existing Actor
 * ```js
 * let actor = game.actors.get(actorId);
 * ```
 */
export default class Actor extends ClientDocumentMixin(BaseActor) {
  /** @inheritDoc */
  _configure(options={}) {
    super._configure(options);

    /**
     * Maintain a list of Token Documents that represent this Actor, stored by Scene. This list may include unpersisted
     * Token Documents (along with possibly unpersisted parent Scenes), including those with a null _id.
     * @type {IterableWeakMap<Scene, IterableWeakSet<TokenDocument>>}
     * @internal
     */
    Object.defineProperty(this, "_dependentTokens", {value: new foundry.utils.IterableWeakMap()});
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _initializeSource(source, options={}) {
    source = super._initializeSource(source, options);
    // Apply configured Actor art.
    const pack = game.packs.get(options.pack);
    if ( !source._id || !pack || !game.compendiumArt.enabled ) return source;
    const uuid = pack.getUuid(source._id);
    const art = game.compendiumArt.get(uuid) ?? {};
    if ( !art.actor && !art.token ) return source;
    if ( art.actor ) source.img = art.actor;
    if ( typeof art.token === "string" ) source.prototypeToken.texture.src = art.token;
    else if ( art.token ) foundry.utils.mergeObject(source.prototypeToken, art.token);
    Hooks.callAll("applyCompendiumArt", this.constructor, source, pack, art);
    return source;
  }

  /* -------------------------------------------- */

  /**
   * An object that tracks which tracks the changes to the data model which were applied by active effects
   * @type {object}
   */
  overrides = this.overrides ?? {};

  /**
   * The statuses that are applied to this actor by active effects
   * @type {Set<string>}
   */
  statuses = this.statuses ?? new Set();

  /**
   * A cached array of image paths which can be used for this Actor's token.
   * Null if the list has not yet been populated.
   * @type {string[]|null}
   */
  #tokenImages = null;

  /**
   * Cache the last drawn wildcard token to avoid repeat draws
   * @type {string|null}
   */
  #lastWildcard = null;

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * Provide a thumbnail image path used to represent this document.
   * @type {string}
   */
  get thumbnail() {
    return this.img;
  }

  /* -------------------------------------------- */

  /**
   * A convenience getter to an object that organizes all embedded Item instances by subtype. The object is cached and
   * lazily re-computed as needed.
   * @type {Record<string, Item[]>}
   * @see {@link foundry.abstract.EmbeddedCollection#documentsByType}
   */
  get itemTypes() {
    return this.items.documentsByType;
  }

  /* -------------------------------------------- */

  /**
   * Test whether an Actor document is a synthetic representation of a Token (if true) or a full Document (if false)
   * @type {boolean}
   */
  get isToken() {
    if ( !this.parent ) return false;
    return this.parent instanceof foundry.documents.TokenDocument;
  }

  /* -------------------------------------------- */

  /**
   * Retrieve the list of ActiveEffects that are currently applied to this Actor.
   * @type {ActiveEffect[]}
   */
  get appliedEffects() {
    const effects = [];
    for ( const effect of this.allApplicableEffects() ) {
      if ( effect.active ) effects.push(effect);
    }
    return effects;
  }

  /* -------------------------------------------- */

  /**
   * An array of ActiveEffect instances which are present on the Actor which have a limited duration.
   * @type {ActiveEffect[]}
   */
  get temporaryEffects() {
    const effects = [];
    for ( const effect of this.allApplicableEffects() ) {
      if ( effect.active && effect.isTemporary ) effects.push(effect);
    }
    return effects;
  }

  /* -------------------------------------------- */

  /**
   * Return a reference to the TokenDocument which owns this Actor as a synthetic override
   * @type {TokenDocument|null}
   */
  get token() {
    return this.parent instanceof foundry.documents.TokenDocument ? this.parent : null;
  }

  /* -------------------------------------------- */

  /**
   * Whether the Actor has at least one Combatant in the active Combat that represents it.
   * @returns {boolean}
   */
  get inCombat() {
    return !!game.combat?.getCombatantsByActor(this).length;
  }

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /** @inheritDoc */
  clone(data, context) {
    const cloned = super.clone(data, context);
    if ( context?.keepId && !context.save ) {
      for ( const [scene, tokens] of this._dependentTokens.entries() ) {
        cloned._dependentTokens.set(scene, new foundry.utils.IterableWeakSet(tokens));
      }
    }
    return cloned;
  }

  /* -------------------------------------------- */

  /**
   * Apply any transformations to the Actor data which are caused by ActiveEffects.
   */
  applyActiveEffects() {
    const overrides = {};
    this.statuses.clear();

    // Organize non-disabled effects by their application priority
    const changes = [];
    for ( const effect of this.allApplicableEffects() ) {
      if ( !effect.active ) continue;
      changes.push(...effect.changes.map(change => {
        const c = foundry.utils.deepClone(change);
        c.effect = effect;
        c.priority = c.priority ?? (c.mode * 10);
        return c;
      }));
      for ( const statusId of effect.statuses ) this.statuses.add(statusId);
    }
    changes.sort((a, b) => a.priority - b.priority);

    // Apply all changes
    for ( const change of changes ) {
      if ( !change.key ) continue;
      const changes = change.effect.apply(this, change);
      Object.assign(overrides, changes);
    }

    // Expand the set of final overrides
    this.overrides = foundry.utils.expandObject(overrides);
  }

  /* -------------------------------------------- */

  /**
   * Retrieve an Array of active tokens which represent this Actor in the current canvas Scene.
   * If the canvas is not currently active, or there are no linked actors, the returned Array will be empty.
   * If the Actor is a synthetic token actor, only the exact Token which it represents will be returned.
   *
   * @param {boolean} [linked=false]    Limit results to Tokens which are linked to the Actor. Otherwise, return all
   *                                    Tokens even those which are not linked.
   * @param {boolean} [document=false]  Return the Document instance rather than the PlaceableObject
   * @returns {Array<TokenDocument|Token>} An array of Token instances in the current Scene which reference this Actor.
   */
  getActiveTokens(linked=false, document=false) {
    if ( !canvas.ready ) return [];
    const tokens = [];
    for ( const t of this.getDependentTokens({ linked, scenes: canvas.scene }) ) {
      if ( t !== canvas.scene.tokens.get(t.id) ) continue;
      if ( document ) tokens.push(t);
      else if ( t.rendered ) tokens.push(t.object);
    }
    return tokens;
  }

  /* -------------------------------------------- */

  /**
   * Get all ActiveEffects that may apply to this Actor.
   * If CONFIG.ActiveEffect.legacyTransferral is true, this is equivalent to actor.effects.contents.
   * If CONFIG.ActiveEffect.legacyTransferral is false, this will also return all the transferred ActiveEffects on any
   * of the Actor's owned Items.
   * @yields {ActiveEffect}
   * @returns {Generator<ActiveEffect, void, void>}
   */
  *allApplicableEffects() {
    for ( const effect of this.effects ) {
      yield effect;
    }
    if ( CONFIG.ActiveEffect.legacyTransferral ) return;
    for ( const item of this.items ) {
      for ( const effect of item.effects ) {
        if ( effect.transfer ) yield effect;
      }
    }
  }

  /* -------------------------------------------- */

  /**
   * Return a data object which defines the data schema against which dice rolls can be evaluated.
   * By default, this is directly the Actor's system data, but systems may extend this to include additional properties.
   * If overriding or extending this method to add additional properties, care must be taken not to mutate the original
   * object.
   * @returns {object}
   */
  getRollData() {
    return this.system;
  }

  /* -------------------------------------------- */

  /**
   * Create a new Token document, not yet saved to the database, which represents the Actor.
   * @param {object} [data={}]            Additional data, such as x, y, rotation, etc. for the created token data
   * @param {object} [options={}]         The options passed to the TokenDocument constructor
   * @returns {Promise<TokenDocument>}    The created TokenDocument instance
   */
  async getTokenDocument(data={}, options={}) {
    const tokenData = this.prototypeToken.toObject();
    tokenData.actorId = this.id;

    if ( tokenData.randomImg && !data.texture?.src ) {
      let images = await this.getTokenImages();
      if ( (images.length > 1) && this.#lastWildcard ) {
        images = images.filter(i => i !== this.#lastWildcard);
      }
      const image = images[Math.floor(Math.random() * images.length)];
      tokenData.texture.src = this.#lastWildcard = image;
    }

    if ( !tokenData.actorLink ) {
      if ( tokenData.appendNumber ) {
        // Append the lowest number not in use by a token linked to this actor
        const tokens = canvas.scene.tokens.filter(t => t.actorId === this.id);
        const namePattern = new RegExp(`^${RegExp.escape(tokenData.name)} \\((\\d+)\\)$`);
        const usedNumbers = new Set(tokens.map(t => Number(namePattern.exec(t.name)?.[1]) || 0));
        const highestNumber = Math.max(...usedNumbers, tokens.length + 1);
        const newNumber = (Array(highestNumber).keys().find(n => !usedNumbers.has(n + 1)) ?? 0) + 1;
        tokenData.name = `${tokenData.name} (${newNumber})`;
      }

      if ( tokenData.prependAdjective ) {
        const adjectives = Object.values(
          foundry.utils.getProperty(game.i18n.translations, CONFIG.Token.adjectivesPrefix)
          || foundry.utils.getProperty(game.i18n._fallback, CONFIG.Token.adjectivesPrefix) || {});
        const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
        tokenData.name = `${adjective} ${tokenData.name}`;
      }
    }

    foundry.utils.mergeObject(tokenData, data);
    const cls = getDocumentClass("Token");
    return new cls(tokenData, options);
  }

  /* -------------------------------------------- */

  /**
   * Get an Array of Token images which could represent this Actor
   * @returns {Promise<string[]>}
   */
  async getTokenImages() {
    if ( !this.prototypeToken.randomImg ) return [this.prototypeToken.texture.src];
    if ( this.#tokenImages ) return this.#tokenImages;
    try {
      this.#tokenImages = await CONFIG.ux.FilePicker.requestTokenImages(this.id, {pack: this.pack});
    } catch(err) {
      this.#tokenImages = [];
      Hooks.onError("Actor#getTokenImages", err, {
        msg: "Error retrieving wildcard tokens",
        log: "error",
        notify: "error"
      });
    }
    return this.#tokenImages;
  }

  /* -------------------------------------------- */

  /**
   * Handle how changes to a Token attribute bar are applied to the Actor.
   * This allows for game systems to override this behavior and deploy special logic.
   * @param {string} attribute    The attribute path
   * @param {number} value        The target attribute value
   * @param {boolean} isDelta     Whether the number represents a relative change (true) or an absolute change (false)
   * @param {boolean} isBar       Whether the new value is part of an attribute bar, or just a direct value
   * @returns {Promise<Actor>}    The updated Actor document
   */
  async modifyTokenAttribute(attribute, value, isDelta=false, isBar=true) {
    const attr = foundry.utils.getProperty(this.system, attribute);
    const current = isBar ? attr.value : attr;
    const update = isDelta ? current + value : value;
    if ( update === current ) return this;

    // Determine the updates to make to the actor data
    let updates;
    if ( isBar ) updates = {[`system.${attribute}.value`]: Math.clamp(update, 0, attr.max)};
    else updates = {[`system.${attribute}`]: update};

    // Allow a hook to override these changes
    const allowed = Hooks.call("modifyTokenAttribute", {attribute, value, isDelta, isBar}, updates, this);
    return allowed !== false ? this.update(updates) : this;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  prepareData() {
    // Identify which special statuses had been active
    this.statuses ??= new Set();
    const specialStatuses = new Map();
    for ( const statusId of Object.values(CONFIG.specialStatusEffects) ) {
      specialStatuses.set(statusId, this.statuses.has(statusId));
    }

    super.prepareData();

    // Apply special statuses that changed to active tokens
    let tokens;
    for ( const [statusId, wasActive] of specialStatuses ) {
      const isActive = this.statuses.has(statusId);
      if ( isActive === wasActive ) continue;
      tokens ??= this.getDependentTokens({scenes: canvas.scene}).filter(t => t.rendered).map(t => t.object);
      for ( const token of tokens ) token._onApplyStatusEffect(statusId, isActive);
    }
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  prepareEmbeddedDocuments() {
    super.prepareEmbeddedDocuments();
    this.applyActiveEffects();
  }

  /* -------------------------------------------- */

  /**
   * Roll initiative for all Combatants in the currently active Combat encounter which are associated with this Actor.
   * If viewing a full Actor document, all Tokens which map to that actor will be targeted for initiative rolls.
   * If viewing a synthetic Token actor, only that particular Token will be targeted for an initiative roll.
   *
   * @param {object} options                              Configuration for how initiative for this Actor is rolled.
   * @param {boolean} [options.createCombatants=false]    Create new Combatant entries for Tokens associated with
   *                                                      this actor.
   * @param {boolean} [options.rerollInitiative=false]    Re-roll the initiative for this Actor if it has already
   *                                                      been rolled.
   * @param {object} [options.initiativeOptions={}]       Additional options passed to the Combat#rollInitiative method.
   * @returns {Promise<Combat|null>}                      A promise which resolves to the Combat document once rolls
   *                                                      are complete.
   */
  async rollInitiative({createCombatants=false, rerollInitiative=false, initiativeOptions={}}={}) {

    // Obtain (or create) a combat encounter
    let combat = game.combat;
    if ( !combat ) {
      if ( game.user.isGM && canvas.scene ) {
        const cls = getDocumentClass("Combat");
        combat = await cls.create({scene: canvas.scene.id, active: true});
      }
      else {
        ui.notifications.warn("COMBAT.NoneActive", {localize: true});
        return null;
      }
    }

    // Create new combatants
    if ( createCombatants ) {
      const tokens = this.getActiveTokens();
      const toCreate = [];
      if ( tokens.length ) {
        for ( const t of tokens ) {
          if ( t.inCombat ) continue;
          toCreate.push({tokenId: t.id, sceneId: t.scene.id, actorId: this.id, hidden: t.document.hidden});
        }
      } else toCreate.push({actorId: this.id, hidden: false});
      await combat.createEmbeddedDocuments("Combatant", toCreate);
    }

    // Roll initiative for combatants
    const combatants = combat.combatants.reduce((arr, c) => {
      if ( this.isToken && (c.token !== this.token) ) return arr;
      if ( !this.isToken && (c.actor !== this) ) return arr;
      if ( !rerollInitiative && (c.initiative !== null) ) return arr;
      arr.push(c.id);
      return arr;
    }, []);

    await combat.rollInitiative(combatants, initiativeOptions);
    return combat;
  }

  /* -------------------------------------------- */

  /**
   * Toggle a configured status effect for the Actor.
   * @param {string} statusId       A status effect ID defined in CONFIG.statusEffects
   * @param {object} [options={}]   Additional options which modify how the effect is created
   * @param {boolean} [options.active]        Force the effect to be active or inactive regardless of its current state
   * @param {boolean} [options.overlay=false] Display the toggled effect as an overlay
   * @returns {Promise<ActiveEffect|boolean|undefined>}  A promise which resolves to one of the following values:
   *                                 - ActiveEffect if a new effect need to be created
   *                                 - true if was already an existing effect
   *                                 - false if an existing effect needed to be removed
   *                                 - undefined if no changes need to be made
   */
  async toggleStatusEffect(statusId, {active, overlay=false}={}) {
    const status = CONFIG.statusEffects.find(e => e.id === statusId);
    if ( !status ) throw new Error(`Invalid status ID "${statusId}" provided to Actor#toggleStatusEffect`);
    const existing = [];

    // Find the effect with the static _id of the status effect
    if ( status._id ) {
      const effect = this.effects.get(status._id);
      if ( effect ) existing.push(effect.id);
    }

    // If no static _id, find all single-status effects that have this status
    else {
      for ( const effect of this.effects ) {
        const statuses = effect.statuses;
        if ( (statuses.size === 1) && statuses.has(status.id) ) existing.push(effect.id);
      }
    }

    // Remove the existing effects unless the status effect is forced active
    if ( existing.length ) {
      if ( active ) return true;
      await this.deleteEmbeddedDocuments("ActiveEffect", existing);
      return false;
    }

    // Create a new effect unless the status effect is forced inactive
    if ( !active && (active !== undefined) ) return;
    const ActiveEffect = getDocumentClass("ActiveEffect");
    const effect = await ActiveEffect.fromStatusEffect(statusId);
    if ( overlay ) effect.updateSource({"flags.core.overlay": true});
    return ActiveEffect.implementation.create(effect, {parent: this, keepId: true});
  }

  /* -------------------------------------------- */
  /*  Tokens                                      */
  /* -------------------------------------------- */

  /**
   * Get this actor's dependent tokens.
   * If the actor is a synthetic token actor, only the exact Token which it represents will be returned.
   * @param {object} [options]
   * @param {Scene|Scene[]} [options.scenes]  A single Scene, or list of Scenes to filter by.
   * @param {boolean} [options.linked]        Limit the results to tokens that are linked to the actor.
   * @returns {TokenDocument[]}
   */
  getDependentTokens({ scenes, linked=false }={}) {
    if ( this.isToken && !scenes ) return [this.token];
    if ( scenes ) scenes = Array.isArray(scenes) ? scenes : [scenes];
    else scenes = Array.from(this._dependentTokens.keys());

    if ( this.isToken ) {
      const parent = this.token.parent;
      return scenes.includes(parent) ? [this.token] : [];
    }

    const allTokens = [];
    for ( const scene of scenes ) {
      if ( !scene ) continue;
      const tokens = this._dependentTokens.get(scene);
      for ( const token of (tokens ?? []) ) {
        if ( !linked || token.actorLink ) allTokens.push(token);
      }
    }

    return allTokens;
  }

  /* -------------------------------------------- */

  /**
   * Register a token as a dependent of this actor.
   * @param {TokenDocument} token  The token.
   * @internal
   */
  _registerDependentToken(token) {
    if ( !token?.parent || (this.compendium !== token.compendium) ) return;
    if ( !this._dependentTokens.has(token.parent) ) {
      this._dependentTokens.set(token.parent, new foundry.utils.IterableWeakSet());
    }
    const tokens = this._dependentTokens.get(token.parent);
    tokens.add(token);
  }

  /* -------------------------------------------- */

  /**
   * Remove a token from this actor's dependents.
   * @param {TokenDocument} token  The token.
   * @internal
   */
  _unregisterDependentToken(token) {
    if ( !token?.parent ) return;
    const tokens = this._dependentTokens.get(token.parent);
    tokens?.delete(token);
  }

  /* -------------------------------------------- */

  /**
   * Prune a whole scene from this actor's dependent tokens.
   * @param {Scene} scene  The scene.
   * @internal
   */
  _unregisterDependentScene(scene) {
    this._dependentTokens.delete(scene);
  }

  /* -------------------------------------------- */
  /*  Event Handlers                              */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _onUpdate(changed, options, userId) {
    // Update prototype token config references to point to the new PrototypeToken object.
    Object.values(this.apps).forEach(app => {
      if ( !(app instanceof foundry.applications.sheets.TokenConfig) ) return;
      app.object = this.prototypeToken;
      app._previewChanges(changed.prototypeToken ?? {});
    });

    super._onUpdate(changed, options, userId);

    // Additional options only apply to base Actors
    if ( this.isToken ) return;

    this._updateDependentTokens(changed, options);

    // If the prototype token was changed, expire any cached token images
    if ( "prototypeToken" in changed ) this.#tokenImages = null;

    // If ownership changed for the actor reset token control
    if ( (("ownership" in changed) || ("==ownership" in changed)) && !game.user.isGM ) {
      for ( const token of this.getActiveTokens() ) {
        token.release();
        if ( !token.isOwner ) token.renderFlags.set({redraw: true});
      }
      canvas.tokens.cycleTokens(true, true);
    }
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onCreateDescendantDocuments(parent, collection, documents, data, options, userId) {
    // If this is a grandchild Active Effect creation, call reset to re-prepare and apply active effects, then call
    // super which will invoke sheet re-rendering.
    if ( !CONFIG.ActiveEffect.legacyTransferral && (parent instanceof foundry.documents.Item) ) this.reset();
    super._onCreateDescendantDocuments(parent, collection, documents, data, options, userId);
    this._onEmbeddedDocumentChange();
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onUpdateDescendantDocuments(parent, collection, documents, changes, options, userId) {
    // If this is a grandchild Active Effect update, call reset to re-prepare and apply active effects, then call
    // super which will invoke sheet re-rendering.
    if ( !CONFIG.ActiveEffect.legacyTransferral && (parent instanceof foundry.documents.Item) ) this.reset();
    super._onUpdateDescendantDocuments(parent, collection, documents, changes, options, userId);
    this._onEmbeddedDocumentChange();
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onDeleteDescendantDocuments(parent, collection, documents, ids, options, userId) {
    // If this is a grandchild Active Effect deletion, call reset to re-prepare and apply active effects, then call
    // super which will invoke sheet re-rendering.
    if ( !CONFIG.ActiveEffect.legacyTransferral && (parent instanceof foundry.documents.Item) ) this.reset();
    super._onDeleteDescendantDocuments(parent, collection, documents, ids, options, userId);
    this._onEmbeddedDocumentChange();
  }

  /* -------------------------------------------- */

  /**
   * Additional workflows to perform when any descendant document within this Actor changes.
   * @protected
   */
  _onEmbeddedDocumentChange() {
    if ( !this.isToken ) this._updateDependentTokens();
  }

  /* -------------------------------------------- */

  /**
   * Update the active TokenDocument instances which represent this Actor.
   * @param {object} [update={}]                               The update delta
   * @param {Partial<DatabaseUpdateOperation>} [options={}]    The database operation that was performed
   * @protected
   */
  _updateDependentTokens(update={}, options={}) {
    for ( const token of this.getDependentTokens() ) {
      token._onUpdateBaseActor(update, options);
    }
  }
}

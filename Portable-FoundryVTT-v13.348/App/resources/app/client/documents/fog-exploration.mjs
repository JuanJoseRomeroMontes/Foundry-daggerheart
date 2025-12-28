import BaseFogExploration from "@common/documents/fog-exploration.mjs";
import ClientDocumentMixin from "./abstract/client-document.mjs";

/**
 * The client-side FogExploration document which extends the common BaseFogExploration model.
 * @extends BaseFogExploration
 * @mixes ClientDocumentMixin
 * @category Documents
 *
 * @see {@link foundry.documents.collections.FogExplorations}: The world-level collection of
 *   FogExploration documents
 */
export default class FogExploration extends ClientDocumentMixin(BaseFogExploration) {
  /**
   * Obtain the fog of war exploration progress for a specific Scene and User.
   * @param {object} [query]        Parameters for which FogExploration document is retrieved
   * @param {string} [query.scene]    A certain Scene ID
   * @param {string} [query.user]     A certain User ID
   * @param {object} [options={}]   Additional options passed to DatabaseBackend#get
   * @returns {Promise<FogExploration|null>}
   */
  static async load({scene, user}={}, options={}) {
    const collection = game.collections.get("FogExploration");
    const sceneId = (scene || canvas.scene)?.id || null;
    user ??= game.user;
    if ( !sceneId || !user ) return null;
    if ( !(game.user.isGM || user.isSelf) ) {
      throw new Error("You do not have permission to access the FogExploration object of another user");
    }
    let exploration;

    // Return cached exploration
    if ( user.isSelf ) {
      exploration = collection.find(x => (x.user === user) && (x.scene === scene));
      if ( exploration ) return exploration;
    }

    // Return persisted exploration
    const query = {scene: sceneId, user: user.id};
    const response = await this.database.get(this, {query, ...options});
    exploration = response.length ? response.shift() : null;
    if ( exploration && user.isSelf ) collection.set(exploration.id, exploration);
    return exploration;
  }

  /* -------------------------------------------- */

  /**
   * Transform the explored base64 data into a PIXI.Texture object
   * @returns {PIXI.Texture|null}
   */
  getTexture() {
    if ( !this.explored ) return null;
    const bt = new PIXI.BaseTexture(this.explored, {alphaMode: PIXI.ALPHA_MODES.NPM});
    return new PIXI.Texture(bt);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onCreate(data, options, userId) {
    super._onCreate(data, options, userId);
    if ( (options.loadFog !== false) && (this.user === game.user) && (this.scene === canvas.scene) ) canvas.fog.load();
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);
    if ( (options.loadFog !== false) && (this.user === game.user) && (this.scene === canvas.scene) ) canvas.fog.load();
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onDelete(options, userId) {
    super._onDelete(options, userId);
    if ( (options.loadFog !== false) && (this.user === game.user) && (this.scene === canvas.scene) ) canvas.fog.load();
  }

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /** @inheritDoc */
  static get(...args) {
    if ( typeof args[0] === "object" ) {
      foundry.utils.logCompatibilityWarning("You are calling FogExploration.get by passing an object. This means you"
        + " are probably trying to load Fog of War exploration data, an operation which has been renamed to"
        + " FogExploration.load", {since: 12, until: 14});
      return this.load(...args);
    }
    return super.get(...args);
  }
}

import WorldCollection from "../abstract/world-collection.mjs";

/**
 * @import Playlist from "../playlist.mjs";
 * @import Scene from "../scene.mjs";
 */

/**
 * The singleton collection of Playlist documents which exist within the active World.
 * This Collection is accessible within the Game object as game.playlists.
 * @extends {WorldCollection<Playlist>}
 * @category Collections
 *
 * @see {@link foundry.documents.Playlist}: The Playlist document
 * @see {@link foundry.applications.sidebar.tabs.PlaylistDirectory}: The PlaylistDirectory sidebar
 *   directory
 */
export default class Playlists extends WorldCollection {

  /** @override */
  static documentName = "Playlist";

  /* -------------------------------------------- */

  /**
   * Return the subset of Playlist documents which are currently playing
   * @type {Playlist[]}
   */
  get playing() {
    return this.filter(s => s.playing);
  }

  /* -------------------------------------------- */

  /**
   * Perform one-time initialization to begin playback of audio.
   * @returns {Promise<void>}
   */
  async initialize() {
    await game.audio.unlock;
    for ( const playlist of this ) {
      for ( const sound of playlist.sounds ) sound.sync();
    }
    ui.playlists?.render();
  }

  /* -------------------------------------------- */

  /**
   * Handle changes to a Scene to determine whether to trigger changes to Playlist documents.
   * @param {Scene|null} scene        The new active Scene
   * @param {Scene|null} priorScene   The previously active Scene
   * @internal
   */
  async _onChangeScene(scene, priorScene) {
    const {playlist: p0, playlistSound: s0} = (priorScene || {});
    const {playlist: p1, playlistSound: s1} = scene ?? {};
    const soundChange = (p0 !== p1) || (s0 !== s1);
    if ( soundChange ) {
      if ( s0 ) await s0.update({playing: false});
      else if ( p0 ) await p0.stopAll();
      if ( s1 ) await s1.update({playing: true});
      else if ( p1 ) await p1.playAll();
    }
  }
}

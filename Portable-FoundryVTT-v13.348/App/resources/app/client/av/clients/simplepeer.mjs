import AVClient from "../client.mjs";

/**
 * An implementation of the AVClient which uses the simple-peer library and the Foundry socket server for signaling.
 * Credit to bekit#4213 for identifying simple-peer as a viable technology and providing a POC implementation.
 * @extends {AVClient}
 */
export default class SimplePeerAVClient extends AVClient {

  /**
   * The local Stream which captures input video and audio
   * @type {MediaStream}
   */
  localStream = null;

  /**
   * The dedicated audio stream used to measure volume levels for voice activity detection.
   * @type {MediaStream}
   */
  levelsStream = null;

  /**
   * A mapping of connected peers
   * @type {Map}
   */
  peers = new Map();

  /**
   * A mapping of connected remote streams
   * @type {Map}
   */
  remoteStreams = new Map();

  /**
   * Has the client been successfully initialized?
   * @type {boolean}
   */
  #initialized = false;

  /**
   * Is outbound broadcast of local audio enabled?
   * @type {boolean}
   */
  audioBroadcastEnabled = false;

  /**
   * The polling interval ID for connected users that might have unexpectedly dropped out of our peer network.
   * @type {number|null}
   */
  #connectionPoll = null;

  /* -------------------------------------------- */
  /*  Required AVClient Methods                   */
  /* -------------------------------------------- */

  /** @override */
  async connect() {
    await this.#connect();
    clearInterval(this.#connectionPoll);
    this.#connectionPoll = setInterval(this.#connect.bind(this), CONFIG.WebRTC.connectedUserPollIntervalS * 1000);
    return true;
  }

  /* -------------------------------------------- */

  /**
   * Try to establish a peer connection with each user connected to the server.
   */
  #connect() {
    const promises = [];
    for ( const user of game.users ) {
      if ( user.isSelf || !user.active ) continue;
      promises.push(this.initializePeerStream(user.id));
    }
    return Promise.all(promises);
  }

  /* -------------------------------------------- */

  /** @override */
  async disconnect() {
    clearInterval(this.#connectionPoll);
    this.#connectionPoll = null;
    await this.disconnectAll();
    return true;
  }

  /* -------------------------------------------- */

  /** @override */
  async initialize() {
    if ( this.#initialized ) return;
    console.debug(`Initializing SimplePeer client connection`);

    // Initialize the local stream
    await this.initializeLocalStream();

    // Set up socket listeners
    this.activateSocketListeners();

    // Register callback to close peer connections when the window is closed
    window.addEventListener("beforeunload", ev => this.disconnectAll());

    // Flag the client as initialized
    this.#initialized = true;
  }

  /* -------------------------------------------- */

  /** @override */
  getConnectedUsers() {
    return [...Array.from(this.peers.keys()), game.userId];
  }

  /* -------------------------------------------- */

  /** @override */
  getMediaStreamForUser(userId) {
    return userId === game.user.id ? this.localStream : this.remoteStreams.get(userId);
  }

  /* -------------------------------------------- */

  /** @override */
  getLevelsStreamForUser(userId) {
    return userId === game.userId ? this.levelsStream : this.getMediaStreamForUser(userId);
  }

  /* -------------------------------------------- */

  /** @override */
  isAudioEnabled() {
    return !!this.localStream?.getAudioTracks().length;
  }

  /* -------------------------------------------- */

  /** @override */
  isVideoEnabled() {
    return !!this.localStream?.getVideoTracks().length;
  }

  /* -------------------------------------------- */

  /** @override */
  toggleAudio(enabled) {
    const stream = this.localStream;
    if ( !stream ) return;

    // If "always on" broadcasting is not enabled, don't proceed
    if ( !this.audioBroadcastEnabled || this.isVoicePTT ) return;

    // Enable active broadcasting
    return this.toggleBroadcast(enabled);
  }

  /* -------------------------------------------- */

  /** @override */
  toggleBroadcast(enabled) {
    const stream = this.localStream;
    if ( !stream ) return;
    console.debug(`[SimplePeer] Toggling broadcast of outbound audio: ${enabled}`);
    this.audioBroadcastEnabled = enabled;
    for ( let t of stream.getAudioTracks() ) {
      t.enabled = enabled;
    }
  }

  /* -------------------------------------------- */

  /** @override */
  toggleVideo(enabled) {
    const stream = this.localStream;
    if ( !stream ) return;
    console.debug(`[SimplePeer] Toggling broadcast of outbound video: ${enabled}`);
    for (const track of stream.getVideoTracks()) {
      track.enabled = enabled;
    }
  }

  /* -------------------------------------------- */

  /** @override */
  async setUserVideo(userId, videoElement) {
    const stream = this.getMediaStreamForUser(userId);

    // Set the stream as the video element source
    if ("srcObject" in videoElement) videoElement.srcObject = stream;
    else videoElement.src = window.URL.createObjectURL(stream); // for older browsers

    // Forward volume to the configured audio sink
    if ( videoElement.sinkId === undefined ) {
      return console.warn(`[SimplePeer] Your web browser does not support output audio sink selection`);
    }
    const requestedSink = this.settings.get("client", "audioSink");
    await videoElement.setSinkId(requestedSink).catch(err => {
      console.warn(`[SimplePeer] An error occurred when requesting the output audio device: ${requestedSink}`);
    })
  }

  /* -------------------------------------------- */
  /*  Local Stream Management                     */
  /* -------------------------------------------- */

  /**
   * Initialize a local media stream for the current user
   * @returns {Promise<MediaStream>}
   */
  async initializeLocalStream() {
    console.debug(`[SimplePeer] Initializing local media stream for current User`);

    // If there is already an existing local media stream, terminate it
    if ( this.localStream ) this.localStream.getTracks().forEach(t => t.stop());
    this.localStream = null;

    if ( this.levelsStream ) this.levelsStream.getTracks().forEach(t => t.stop());
    this.levelsStream = null;

    // Determine whether the user can send audio
    const audioSrc = this.settings.get("client", "audioSrc");
    const canBroadcastAudio = this.master.canUserBroadcastAudio(game.user.id);
    const audioParams = (audioSrc && (audioSrc !== "disabled") && canBroadcastAudio) ? {
      deviceId: { ideal: audioSrc }
    } : false;

    // Configure whether the user can send video
    const videoSrc = this.settings.get("client", "videoSrc");
    const canBroadcastVideo = this.master.canUserBroadcastVideo(game.user.id);
    const videoParams = (videoSrc && (videoSrc !== "disabled") && canBroadcastVideo) ? {
      deviceId: { ideal: videoSrc },
      width: { ideal: 320 },
      height: { ideal: 240 }
    } : false;

    // FIXME: Firefox does not allow you to request a specific device, you can only use whatever the browser allows
    // https://bugzilla.mozilla.org/show_bug.cgi?id=1443294#c7
    if ( navigator.userAgent.match(/Firefox/) ) {
      delete videoParams["deviceId"];
    }

    if ( !videoParams && !audioParams ) return null;
    let stream = await this.#createMediaStream({video: videoParams, audio: audioParams});
    if ( (videoParams && audioParams) && (stream instanceof Error) ) {
      // Even if the game is set to both audio and video, the user may not have one of those devices, or they might have
      // blocked access to one of them. In those cases we do not want to prevent A/V loading entirely, so we must try
      // each of them separately to see what is available.
      if ( audioParams ) stream = await this.#createMediaStream({video: false, audio: audioParams});
      if ( (stream instanceof Error) && videoParams ) {
        stream = await this.#createMediaStream({video: videoParams, audio: false});
      }
    }

    if ( stream instanceof Error ) {
      const error = new Error(`[SimplePeer] Unable to acquire user media stream: ${stream.message}`);
      error.stack = stream.stack;
      console.error(error);
      return null;
    }

    this.localStream = stream;
    this.levelsStream = stream.clone();
    this.levelsStream.getVideoTracks().forEach(t => this.levelsStream.removeTrack(t));
    return stream;
  }

  /* -------------------------------------------- */

  /**
   * Attempt to create local media streams.
   * @param {{video: object, audio: object}} params       Parameters for the getUserMedia request.
   * @returns {Promise<MediaStream|Error>}                The created MediaStream or an error.
   */
  async #createMediaStream(params) {
    try {
      return await navigator.mediaDevices.getUserMedia(params);
    } catch(err) {
      return err;
    }
  }

  /* -------------------------------------------- */
  /*  Peer Stream Management                      */
  /* -------------------------------------------- */

  /**
   * Listen for Audio/Video updates on the av socket to broker connections between peers
   */
  activateSocketListeners() {
    game.socket.on("av", (request, userId) => {
      if ( request.userId !== game.user.id ) return; // The request is not for us, this shouldn't happen
      switch ( request.action ) {
        case "peer-signal":
          if ( request.activity ) this.master.settings.handleUserActivity(userId, request.activity);
          return this.receiveSignal(userId, request.data);
        case "peer-close":
          return this.disconnectPeer(userId);
      }
    });
  }

  /* -------------------------------------------- */

  /**
   * Initialize a stream connection with a new peer
   * @param {string} userId           The Foundry user ID for which the peer stream should be established
   * @returns {Promise<SimplePeer>}   A Promise which resolves once the peer stream is initialized
   */
  async initializePeerStream(userId) {
    const peer = this.peers.get(userId);
    if ( peer?.connected || peer?._connecting ) return peer;
    return this.connectPeer(userId, true);
  }

  /* -------------------------------------------- */

  /**
   * Receive a request to establish a peer signal with some other User id
   * @param {string} userId           The Foundry user ID who is requesting to establish a connection
   * @param {object} data             The connection details provided by SimplePeer
   */
  receiveSignal(userId, data) {
    console.debug(`[SimplePeer] Receiving signal from User [${userId}] to establish initial connection`);
    let peer = this.peers.get(userId);
    if ( !peer ) peer = this.connectPeer(userId, false);
    peer.signal(data);
  }

  /* -------------------------------------------- */

  /**
   * Connect to a peer directly, either as the initiator or as the receiver
   * @param {string} userId           The Foundry user ID with whom we are connecting
   * @param {boolean} isInitiator     Is the current user initiating the connection, or responding to it?
   * @returns {SimplePeer}            The constructed and configured SimplePeer instance
   */
  connectPeer(userId, isInitiator=false) {

    // Create the SimplePeer instance for this connection
    const peer = this.#createPeerConnection(userId, isInitiator);
    this.peers.set(userId, peer);

    // Signal to request that a remote user establish a connection with us
    peer.on("signal", data => {
      console.debug(`[SimplePeer] Sending signal to User [${userId}] to establish initial connection`);
      game.socket.emit("av", {
        action: "peer-signal",
        userId: userId,
        data: data,
        activity: this.master.settings.getUser(game.userId)
      }, {recipients: [userId]});
    });

    // Receive a stream provided by a peer
    peer.on("stream", stream => {
      console.debug(`[SimplePeer] Received media stream from User [${userId}]`);
      this.remoteStreams.set(userId, stream);
      this.master.render();
    });

    // Close a connection with a current peer
    peer.on("close", () => {
      console.debug(`[SimplePeer] Closed connection with remote User [${userId}]`);
      return this.disconnectPeer(userId);
    });

    // Handle errors
    peer.on("error", err => {
      if ( err.code !== "ERR_DATA_CHANNEL" ) {
        const error = new Error(`[SimplePeer] An unexpected error occurred with User [${userId}]: ${err.message}`);
        error.stack = err.stack;
        console.error(error);
      }
      if ( peer.connected ) return this.disconnectPeer(userId);
    });

    this.master.render();
    return peer;
  }

  /* -------------------------------------------- */

  /**
   * Create the SimplePeer instance for the desired peer connection.
   * Modules may implement more advanced connection strategies by overriding this method.
   * @param {string} userId           The Foundry user ID with whom we are connecting
   * @param {boolean} isInitiator     Is the current user initiating the connection, or responding to it?
   */
  #createPeerConnection(userId, isInitiator) {
    const options = {
      initiator: isInitiator,
      stream: this.localStream
    };

    this.#setupCustomTURN(options);
    return new SimplePeer(options);
  }

  /* -------------------------------------------- */

  /**
   * Setup the custom TURN relay to be used in subsequent calls if there is one configured.
   * TURN credentials are mandatory in WebRTC.
   * @param {object} options The SimplePeer configuration object.
   */
  #setupCustomTURN(options) {
    const { url, type, username, password } = this.settings.world.turn;
    if ( (type !== "custom") || !url || !username || !password ) return;
    const iceServer = { username, urls: url, credential: password };
    options.config = { iceServers: [iceServer] };
  }

  /* -------------------------------------------- */

  /**
   * Disconnect from a peer by stopping current stream tracks and destroying the SimplePeer instance
   * @param {string} userId           The Foundry user ID from whom we are disconnecting
   * @returns {Promise<void>}         A Promise which resolves once the disconnection is complete
   */
  async disconnectPeer(userId) {

    // Stop audio and video tracks from the remote stream
    const remoteStream = this.remoteStreams.get(userId);
    if ( remoteStream ) {
      this.remoteStreams.delete(userId);
      for ( let track of remoteStream.getTracks() ) {
        await track.stop();
      }
    }

    // Remove the peer
    const peer = this.peers.get(userId);
    if ( peer ) {
      this.peers.delete(userId);
      await peer.destroy();
    }

    // Re-render the UI on disconnection
    this.master.render();
  }

  /* -------------------------------------------- */

  /**
   * Disconnect from all current peer streams
   * @returns {Promise<Array>}       A Promise which resolves once all peers have been disconnected
   */
  async disconnectAll() {
    const promises = [];
    for ( let userId of this.peers.keys() ) {
      promises.push(this.disconnectPeer(userId));
    }
    return Promise.all(promises);
  }

  /* -------------------------------------------- */
  /*  Settings and Configuration                  */
  /* -------------------------------------------- */

  /** @override */
  async onSettingsChanged(changed) {
    const keys = new Set(Object.keys(foundry.utils.flattenObject(changed)));

    // Change audio or video sources
    const sourceChange = ["client.videoSrc", "client.audioSrc"].some(k => keys.has(k));
    if ( sourceChange ) await this.updateLocalStream();

    // Change voice broadcasting mode
    const modeChange = ["client.voice.mode", `client.users.${game.user.id}.muted`].some(k => keys.has(k));
    if ( modeChange ) {
      const isAlways = this.settings.client.voice.mode === "always";
      this.toggleAudio(isAlways && this.master.canUserShareAudio(game.user.id));
      this.master.broadcast(isAlways);
      this.master._initializeUserVoiceDetection(changed.client.voice?.mode);
      ui.webrtc.setUserIsSpeaking(game.user.id, this.master.broadcasting);
    }

    // Re-render the AV camera view
    const renderChange = ["client.audioSink", "client.muteAll", "client.disableVideo"].some(k => keys.has(k));
    if ( sourceChange || renderChange ) this.master.render();
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async updateLocalStream() {
    const oldStream = this.localStream;
    await this.initializeLocalStream();
    for ( let peer of this.peers.values() ) {
      if ( oldStream ) peer.removeStream(oldStream);
      if ( this.localStream ) peer.addStream(this.localStream);
    }
    // FIXME: This is a cheat, should be handled elsewhere
    this.master._initializeUserVoiceDetection(this.settings.client.voice.mode);
  }
}

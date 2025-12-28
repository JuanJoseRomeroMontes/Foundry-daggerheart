import {SpriteMesh} from "../../containers/_module.mjs";
import {BaseSamplerShader, ColorizeBrightnessShader} from "../../rendering/shaders/_module.mjs";
import {loadTexture} from "../../loader.mjs";
import {TOKEN_TURN_MARKER_MODES} from "@common/constants.mjs";
import Color from "@common/utils/color.mjs";

/**
 * @import Token from "../token.mjs";
 * @import {TurnMarkerAnimationConfigData} from "../_types.mjs"
 */

/**
 * The Turn Marker of a {@link foundry.canvas.placeables.Token}.
 */
export default class TokenTurnMarker extends PIXI.Container {
  /**
   * Construct a TokenTurnMarker by providing a Token object instance.
   * @param {Token} token    The Token that this Turn Marker belongs to
   */
  constructor(token) {
    if ( !(token instanceof foundry.canvas.placeables.Token) ) {
      throw new Error("The TokenTurnMarker may only be constructed with a Token instance.");
    }
    super();
    this.#token = token;
    this.zIndex = -Infinity;
  }

  /* -------------------------------------------- */

  /**
   * The Token who this Turn Marker belongs to.
   * @type {Token}
   */
  get token() {
    return this.#token;
  }

  #token;

  /* -------------------------------------------- */

  /**
   * The sprite of the Turn Marker.
   * @type {SpriteMesh}
   */
  mesh;

  /* -------------------------------------------- */

  /**
   * The animation configuration of the Turn Marker.
   * @type {TurnMarkerAnimationConfigData}
   */
  animation = {spin: 0, pulse: {speed: 0, min: 1, max: 1}};

  /**
   * Track whether the TokenTurnMarker has completed drawing.
   * 0 = Not yet drawn
   * 1 = Drawing
   * 2 = Drawn
   * @type {0|1|2}
   */
  #drawState = 0;

  /* -------------------------------------------- */

  /**
   * Draw the Turn Marker.
   * @returns {Promise<void>}
   */
  async draw() {
    if ( this.#drawState === 1 ) return; // Only draw once at a time
    this.#drawState = 1;
    if ( this.mesh ) {
      this.removeChild(this.mesh);
      this.mesh.destroy();
    }

    // Configure marker settings
    const defaultSettings = CONFIG.Combat.settings.turnMarker;
    const tokenSettings = this.#token.document.turnMarker;
    let config;
    switch ( this.#token.document.turnMarker.mode ) {
      case TOKEN_TURN_MARKER_MODES.DEFAULT:
        config = {...defaultSettings};
        break;
      case TOKEN_TURN_MARKER_MODES.CUSTOM:
        config = {...defaultSettings, ...tokenSettings};
        break;
    }
    if ( !config ) return;

    // Configure animation
    const animation = CONFIG.Combat.settings.getTurnMarkerAnimation(config.animation);
    const animationConfig = animation?.config ?? {};
    this.animation = foundry.utils.mergeObject({spin: 0, pulse: {speed: 0, min: 1, max: 1}}, animationConfig);

    // Create the SpriteMesh
    const fallback = CONFIG.Combat.fallbackTurnMarker;
    config.src ||= fallback;
    const texture = await loadTexture(config.src, {fallback});
    const mesh = new SpriteMesh(texture);
    mesh.anchor.set(0.5, 0.5);

    // Configure shader
    const shaderCls = animationConfig.shader ?? config.disposition ? ColorizeBrightnessShader : BaseSamplerShader;
    mesh.setShaderClass(shaderCls);
    this.#configureShader(mesh);
    const video = game.video.getVideoSource(texture);
    if ( video ) game.video.play(video, {volume: 0});

    // Add the Mesh and record as drawn
    this.mesh = this.addChild(mesh);
    this.#token.renderFlags.set({refreshPosition: true, refreshSize: true});
    this.#drawState = 2;
  }

  /* -------------------------------------------- */

  /**
   * Animate the Turn Marker.
   * @param {number} deltaTime    The delta time
   */
  animate(deltaTime) {
    if ( (this.#drawState !== 2) || !this.visible ) return;
    const a = this.animation;
    const t = canvas.app.ticker.lastTime;
    this.scale.set(a.pulse.min + ((a.pulse.max - a.pulse.min)
      * (0.5 + (0.5 * Math.sin(t * 2 * Math.PI * a.pulse.speed / 60000)))));
    this.rotation = (t * 2 * Math.PI * a.spin / 60000) % (2 * Math.PI);
  }

  /* -------------------------------------------- */

  /**
   * Configure shader uniforms according to shader class.
   * @param {SpriteMesh} mesh     The mesh being configured
   */
  #configureShader(mesh) {
    switch ( mesh.shader.constructor ) {
      case ColorizeBrightnessShader: {
        const u = mesh.shader.uniforms;
        Color.from(this.#token.getDispositionColor()).linear.applyRGB(u.tintLinear);
        u.grey = true;
        u.intensity = 1;
        break;
      }
    }
  }
}

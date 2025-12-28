import PrimaryCanvasObjectMixin from "./primary-canvas-object.mjs";
import CanvasAnimation from "../animation/canvas-animation.mjs";

/**
 * A mixin which decorates a DisplayObject with depth and/or occlusion properties.
 * @category Mixins
 * @param {typeof PIXI.DisplayObject} DisplayObject   The parent DisplayObject class being mixed
 */
export default function PrimaryOccludableObjectMixin(DisplayObject) {
  class PrimaryOccludableObject extends PrimaryCanvasObjectMixin(DisplayObject) {

    /**
     * Restrictions options packed into a single value with bitwise logic.
     * @type {foundry.utils.BitMask}
     */
    #restrictionState = new foundry.utils.BitMask({
      light: false,
      weather: false
    });

    /**
     * Is this occludable object hidden for Gamemaster visibility only?
     * @type {boolean}
     */
    hidden = false;

    /**
     * A flag which tracks whether the primary canvas object is currently in an occluded state.
     * @type {boolean}
     */
    occluded = false;

    /**
     * The occlusion mode of this occludable object.
     * @type {number}
     */
    occlusionMode = CONST.OCCLUSION_MODES.NONE;

    /**
     * The unoccluded alpha of this object.
     * @type {number}
     */
    unoccludedAlpha = 1;

    /**
     * The occlusion alpha of this object.
     * @type {number}
     */
    occludedAlpha = 0;

    /**
     * Fade this object on hover?
     * @type {boolean}
     * @defaultValue true
     */
    get hoverFade() {
      return this.#hoverFade;
    }

    set hoverFade(value) {
      if ( this.#hoverFade === value ) return;
      this.#hoverFade = value;
      const state = this._hoverFadeState;
      state.hovered = false;
      state.faded = false;
      state.fading = false;
      state.occlusion = 0;
    }

    /**
     * Fade this object on hover?
     * @type {boolean}
     */
    #hoverFade = true;

    /**
     * @typedef OcclusionState
     * @property {number} fade            The amount of FADE occlusion
     * @property {number} radial          The amount of RADIAL occlusion
     * @property {number} vision          The amount of VISION occlusion
     */

    /**
     * The amount of rendered FADE, RADIAL, and VISION occlusion.
     * @type {OcclusionState}
     * @internal
     */
    _occlusionState = {
      fade: 0.0,
      radial: 0.0,
      vision: 0.0
    };

    /**
     * @typedef HoverFadeState
     * @property {boolean} hovered        The hovered state
     * @property {number} hoveredTime     The last time when a mouse event was hovering this object
     * @property {boolean} faded          The faded state
     * @property {boolean} fading         The fading state
     * @property {number} fadingTime      The time the fade animation started
     * @property {number} occlusion       The amount of occlusion
     */

    /**
     * The state of hover-fading.
     * @type {HoverFadeState}
     * @internal
     */
    _hoverFadeState = {
      hovered: false,
      hoveredTime: 0,
      _hoveredTime: 0,
      faded: false,
      fading: false,
      fadingTime: 0,
      occlusion: 0.0
    };

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * Get the blocking option bitmask value.
     * @returns {number}
     * @internal
     */
    get _restrictionState() {
      return this.#restrictionState.valueOf();
    }

    /* -------------------------------------------- */

    /**
     * Is this object blocking light?
     * @type {boolean}
     */
    get restrictsLight() {
      return this.#restrictionState.hasState(this.#restrictionState.states.light);
    }

    set restrictsLight(enabled) {
      this.#restrictionState.toggleState(this.#restrictionState.states.light, enabled);
    }

    /* -------------------------------------------- */

    /**
     * Is this object blocking weather?
     * @type {boolean}
     */
    get restrictsWeather() {
      return this.#restrictionState.hasState(this.#restrictionState.states.weather);
    }

    set restrictsWeather(enabled) {
      this.#restrictionState.toggleState(this.#restrictionState.states.weather, enabled);
    }

    /* -------------------------------------------- */

    /**
     * Is this occludable object... occludable?
     * @type {boolean}
     */
    get isOccludable() {
      return this.occlusionMode > CONST.OCCLUSION_MODES.NONE;
    }

    /* -------------------------------------------- */

    /**
     * Debounce assignment of the PCO occluded state to avoid cases like animated token movement which can rapidly
     * change PCO appearance.
     * Uses a 50ms debounce threshold.
     * Objects which are in the hovered state remain occluded until their hovered state ends.
     * @type {function(occluded: boolean): void}
     */
    debounceSetOcclusion = foundry.utils.debounce(occluded => this.occluded = occluded, 50);

    /* -------------------------------------------- */

    /** @inheritDoc */
    updateCanvasTransform() {
      super.updateCanvasTransform();
      this.#updateHoverFadeState();
      this.#updateOcclusionState();
    }

    /* -------------------------------------------- */
    /*  Methods                                     */
    /* -------------------------------------------- */

    /**
     * Update the occlusion state.
     */
    #updateOcclusionState() {
      const state = this._occlusionState;
      state.fade = 0;
      state.radial = 0;
      state.vision = 0;
      const M = CONST.OCCLUSION_MODES;
      switch ( this.occlusionMode ) {
        case M.FADE: if ( this.occluded ) state.fade = 1; break;
        case M.RADIAL: state.radial = 1; break;
        case M.VISION:
          if ( canvas.masks.occlusion.vision ) state.vision = 1;
          else if ( this.occluded ) state.fade = 1;
          break;
      }
      const hoverFade = this._hoverFadeState.occlusion;
      if ( canvas.masks.occlusion.vision ) state.vision = Math.max(state.vision, hoverFade);
      else state.fade = Math.max(state.fade, hoverFade);
    }

    /* -------------------------------------------- */

    /**
     * Update the hover-fade state.
     */
    #updateHoverFadeState() {
      if ( !this.#hoverFade ) return;
      const state = this._hoverFadeState;
      const time = canvas.app.ticker.lastTime;
      const {delay, duration} = CONFIG.Canvas.hoverFade;
      if ( state.fading ) {
        const dt = time - state.fadingTime;
        if ( dt >= duration ) state.fading = false;
      } else if ( state.faded !== state.hovered ) {
        const dt = time - state.hoveredTime;
        if ( dt >= delay ) {
          state.faded = state.hovered;
          if ( dt - delay < duration ) {
            state.fading = true;
            state.fadingTime = time;
          }
        }
      }
      let occlusion = 1;
      if ( state.fading ) {
        if ( state.faded !== state.hovered ) {
          state.faded = state.hovered;
          state.fadingTime = time - (state.fadingTime + duration - time);
        }
        occlusion = CanvasAnimation.easeInOutCosine((time - state.fadingTime) / duration);
      }
      state.occlusion = state.faded ? occlusion : 1 - occlusion;
    }

    /* -------------------------------------------- */
    /*  Depth Rendering                             */
    /* -------------------------------------------- */

    /** @override */
    _shouldRenderDepth() {
      return !this.#restrictionState.isEmpty && !this.hidden;
    }

    /* -------------------------------------------- */

    /**
     * Test whether a specific Token occludes this PCO.
     * Occlusion is tested against 9 points, the center, the four corners-, and the four cardinal directions
     * @param {Token} token       The Token to test
     * @param {object} [options]  Additional options that affect testing
     * @param {boolean} [options.corners=true]  Test corners of the hit-box in addition to the token center?
     * @returns {boolean}         Is the Token occluded by the PCO?
     */
    testOcclusion(token, {corners=true}={}) {
      if ( token.document.elevation >= this.elevation ) return false;
      const {x, y, w, h} = token;
      let testPoints = [[w / 2, h / 2]];
      if ( corners ) {
        const pad = 2;
        const cornerPoints = [
          [pad, pad],
          [w / 2, pad],
          [w - pad, pad],
          [w - pad, h / 2],
          [w - pad, h - pad],
          [w / 2, h - pad],
          [pad, h - pad],
          [pad, h / 2]
        ];
        testPoints = testPoints.concat(cornerPoints);
      }
      for ( const [tx, ty] of testPoints ) {
        if ( this.containsCanvasPoint({x: x + tx, y: y + ty}) ) return true;
      }
      return false;
    }

    /* -------------------------------------------- */
    /*  Deprecations and Compatibility              */
    /* -------------------------------------------- */

    /**
     * @deprecated since v12
     * @ignore
     */
    get roof() {
      const msg = `${this.constructor.name}#roof is deprecated in favor of more granular options: 
      ${this.constructor.name}#restrictsLight and ${this.constructor.name}#restrictsWeather`;
      foundry.utils.logCompatibilityWarning(msg, {since: 12, until: 14});
      return this.restrictsLight && this.restrictsWeather;
    }

    /**
     * @deprecated since v12
     * @ignore
     */
    set roof(enabled) {
      const msg = `${this.constructor.name}#roof is deprecated in favor of more granular options: 
      ${this.constructor.name}#restrictsLight and ${this.constructor.name}#restrictsWeather`;
      foundry.utils.logCompatibilityWarning(msg, {since: 12, until: 14});
      this.restrictsWeather = enabled;
      this.restrictsLight = enabled;
    }

    /* -------------------------------------------- */

    /**
     * @deprecated since v12
     * @ignore
     */
    containsPixel(x, y, alphaThreshold=0.75) {
      const msg = `${this.constructor.name}#containsPixel is deprecated. Use ${this.constructor.name}#containsCanvasPoint instead.`;
      foundry.utils.logCompatibilityWarning(msg, {since: 12, until: 14});
      return this.containsCanvasPoint({x, y}, alphaThreshold + 1e-6);
    }
  }
  return PrimaryOccludableObject;
}

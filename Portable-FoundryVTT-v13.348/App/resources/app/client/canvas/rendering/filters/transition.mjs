import AbstractBaseFilter from "./base-filter.mjs";
import SpriteMesh from "../../containers/elements/sprite-mesh.mjs";
import CanvasAnimation from "../../animation/canvas-animation.mjs";

/**
 * A filter specialized for transition effects between a source object and a target texture.
 */
export default class TextureTransitionFilter extends AbstractBaseFilter {

  /**
   * If this filter requires padding (according to type)
   * @type {boolean}
   */
  #requirePadding = false;

  /* -------------------------------------------- */

  /**
   * Transition types for this shader.
   * @enum {string}
   */
  static get TYPES() {
    return TextureTransitionFilter.#TYPES;
  }

  static #TYPES = Object.freeze({
    FADE: "fade",
    SWIRL: "swirl",
    WATER_DROP: "waterDrop",
    MORPH: "morph",
    CROSSHATCH: "crosshatch",
    WIND: "wind",
    WAVES: "waves",
    WHITE_NOISE: "whiteNoise",
    HOLOGRAM: "hologram",
    HOLE: "hole",
    HOLE_SWIRL: "holeSwirl",
    GLITCH: "glitch",
    DOTS: "dots"
  });

  /* -------------------------------------------- */

  /**
   * Maps the type number to its string.
   * @type {ReadonlyArray<string>}
   */
  static #TYPE_NUMBER_TO_STRING = Object.freeze(Object.values(this.TYPES));

  /* -------------------------------------------- */

  /**
   * Maps the type string to its number.
   * @type {Readonly<{[type: string]: number}>}
   */
  static #TYPE_STRING_TO_NUMBER = Object.freeze(Object.fromEntries(this.#TYPE_NUMBER_TO_STRING.map((t, i) => [t, i])));

  /* -------------------------------------------- */

  /**
   * Types that requires padding
   * @type {ReadonlyArray<string>}
   */
  static #PADDED_TYPES = Object.freeze([
    this.#TYPES.SWIRL,
    this.#TYPES.WATER_DROP,
    this.#TYPES.WAVES,
    this.#TYPES.HOLOGRAM
  ]);

  /* -------------------------------------------- */

  /**
   * The transition type (see {@link TextureTransitionFilter.TYPES}).
   * @type {string}
   * @defaultValue TextureTransitionFilter.TYPES.FADE
   */
  get type() {
    return TextureTransitionFilter.#TYPE_NUMBER_TO_STRING[this.uniforms.type];
  }

  set type(type) {
    if ( !(type in TextureTransitionFilter.#TYPE_STRING_TO_NUMBER) ) throw new Error("Invalid texture transition type");
    this.uniforms.type = TextureTransitionFilter.#TYPE_STRING_TO_NUMBER[type];
    this.#requirePadding = TextureTransitionFilter.#PADDED_TYPES.includes(type);
  }

  /* -------------------------------------------- */

  /**
   * Sampler target for this filter.
   * @param {PIXI.Texture} targetTexture
   */
  set targetTexture(targetTexture) {
    if ( !targetTexture.uvMatrix ) {
      targetTexture.uvMatrix = new PIXI.TextureMatrix(targetTexture, 0.0);
      targetTexture.uvMatrix.update();
    }
    this.uniforms.targetTexture = targetTexture;
    this.uniforms.targetUVMatrix = targetTexture.uvMatrix.mapCoord.toArray(true);
  }

  /* -------------------------------------------- */

  /**
   * Animate a transition from a subject SpriteMesh/PIXI.Sprite to a given texture.
   * @param {PIXI.Sprite|SpriteMesh} subject                           The source mesh/sprite to apply a transition.
   * @param {PIXI.Texture} texture                                     The target texture.
   * @param {object} [options]
   * @param {string} [options.type=TYPES.FADE]                         The transition type (default to FADE.)
   * @param {string|symbol} [options.name]                             The name of the
   *   {@link foundry.canvas.animation.CanvasAnimation}.
   * @param {number} [options.duration=1000]                           The animation duration
   * @param {Function|string} [options.easing]                         The easing function of the animation
   * @returns {Promise<boolean>}   A Promise which resolves to true once the animation has concluded
   *                               or false if the animation was prematurely terminated
   */
  static async animate(subject, texture, {type=this.TYPES.FADE, name, duration, easing}={}) {
    if ( !((subject instanceof SpriteMesh) || (subject instanceof PIXI.Sprite)) ) {
      throw new Error("The subject must be a subclass of SpriteMesh or PIXI.Sprite");
    }
    if ( !(texture instanceof PIXI.Texture) ) {
      throw new Error("The target texture must be a subclass of PIXI.Texture");
    }

    // Create the filter and activate it on the subject
    const filter = this.create();
    filter.type = type;
    filter.targetTexture = texture;
    subject.filters ??= [];
    subject.filters.unshift(filter);

    // Create the animation
    const promise = CanvasAnimation.animate(
      [{
        attribute: "progress",
        parent: filter.uniforms, to: 1
      }],
      {name, duration, easing, context: subject}
    );

    // Replace the texture if the animation was completed
    promise.then(completed => {
      if ( completed ) subject.texture = texture;
    });

    // Remove the transition filter from the target once the animation was completed or terminated
    promise.finally(() => {
      subject.filters?.findSplice(f => f === filter);
    });
    return promise;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  static defaultUniforms = {
    tintAlpha: [1, 1, 1, 1],
    targetTexture: null,
    progress: 0,
    rotation: 0,
    anchor: {x: 0.5, y: 0.5},
    type: 1,
    filterMatrix: new PIXI.Matrix(),
    filterMatrixInverse: new PIXI.Matrix(),
    targetUVMatrix: new PIXI.Matrix()
  };

  /* -------------------------------------------- */

  /** @inheritDoc */
  static vertexShader = `
    precision ${PIXI.settings.PRECISION_FRAGMENT} float;

    attribute vec2 aVertexPosition;

    uniform mat3 projectionMatrix;
    uniform mat3 filterMatrix;
    uniform vec4 inputSize;
    uniform vec4 outputFrame;

    varying vec2 vTextureCoord;
    varying vec2 vFilterCoord;

    vec4 filterVertexPosition() {
      vec2 position = aVertexPosition * max(outputFrame.zw, vec2(0.)) + outputFrame.xy;
      return vec4((projectionMatrix * vec3(position, 1.0)).xy, 0.0, 1.0);
    }

    vec2 filterTextureCoord() {
      return aVertexPosition * (outputFrame.zw * inputSize.zw);
    }

    void main() {
      gl_Position = filterVertexPosition();
      vTextureCoord = filterTextureCoord();
      vFilterCoord = (filterMatrix * vec3(vTextureCoord, 1.0)).xy;
    }
  `;

  /* -------------------------------------------- */

  /** @inheritDoc */
  static fragmentShader = `
    precision ${PIXI.settings.PRECISION_FRAGMENT} float;
    ${this.CONSTANTS}
    ${this.PRNG}
    uniform float progress;
    uniform float rotation;
    uniform vec2 anchor;
    uniform int type;
    uniform sampler2D uSampler;
    uniform sampler2D targetTexture;
    uniform vec4 tintAlpha;
    uniform mat3 filterMatrixInverse;
    uniform mat3 targetUVMatrix;

    varying vec2 vTextureCoord;
    varying vec2 vFilterCoord;

    /* -------------------------------------------- */
    /*  UV Mapping Functions                        */
    /* -------------------------------------------- */

    /* Map filter coord to source texture coord */
    vec2 mapFuv2Suv(in vec2 uv) {
      return (filterMatrixInverse * vec3(uv, 1.0)).xy;
    }

    /* Map filter coord to target texture coord */
    vec2 mapFuv2Tuv(in vec2 uv) {
      return (targetUVMatrix * vec3(uv, 1.0)).xy;
    }

    /* -------------------------------------------- */
    /*  Clipping Functions                          */
    /* -------------------------------------------- */

    float getClip(in vec2 uv) {
      return step(3.5,
         step(0.0, uv.x) +
         step(0.0, uv.y) +
         step(uv.x, 1.0) +
         step(uv.y, 1.0));
    }

    /* -------------------------------------------- */
    /*  Texture Functions                           */
    /* -------------------------------------------- */

    vec4 colorFromSource(in vec2 uv) {
      return texture2D(uSampler, uv);
    }

    vec4 colorFromTarget(in vec2 uv) {
      return texture2D(targetTexture, mapFuv2Tuv(uv))
                       * getClip(uv);
    }

    /* -------------------------------------------- */
    /*  Simple transition                           */
    /* -------------------------------------------- */

    vec4 transition() {
      return mix(
        colorFromSource(vTextureCoord),
        colorFromTarget(vFilterCoord),
        progress
      );
    }
    
    /* -------------------------------------------- */
    /*  Morphing                                    */
    /* -------------------------------------------- */

    vec4 morph() {
      vec4 ca = colorFromSource(vTextureCoord);
      vec4 cb = colorFromTarget(vFilterCoord);
      float a = mix(ca.a, cb.a, progress);

      vec2 oa = (((ca.rg + ca.b) * 0.5) * 2.0 - 1.0);
      vec2 ob = (((cb.rg + cb.b) * 0.5) * 2.0 - 1.0);
      vec2 oc = mix(oa, ob, 0.5) * 0.2;

      float w0 = progress;
      float w1 = 1.0 - w0;
      return mix(colorFromSource(mapFuv2Suv(vFilterCoord + oc * w0)),
                 colorFromTarget(vFilterCoord - oc * w1),
                 progress) * smoothstep(0.0, 0.5, a);
    }

    /* -------------------------------------------- */
    /*  Water Drop                                  */
    /* -------------------------------------------- */

    vec4 drop() {
      vec2 dir = vFilterCoord - 0.5;
      float dist = length(dir);
      float da = clamp(1.6 - distance(vec2(0.0), vFilterCoord * 2.0 - 1.0), 0.0, 1.6) / 1.6;
      vec2 offset = mix(vec2(0.0),
                        dir * sin(dist * 35.0 - progress * 35.0),
                        min(min(progress, 1.0 - progress) * 2.0, da));
      return mix(colorFromSource(mapFuv2Suv(vFilterCoord + offset)),
                 colorFromTarget(vFilterCoord + offset),
                 progress);
    }

    /* -------------------------------------------- */
    /*  Waves effect                                */
    /* -------------------------------------------- */

    vec2 offset(in float progress, in float x, in float str) {
      float p = smoothstep(0.0, 1.0, min(progress, 1.0 - progress) * 2.0);
      float shifty = str * p * cos(30.0 * (progress + x));
      return vec2(0.0, shifty);
    }

    vec4 wavy() {
      vec4 ca = colorFromSource(vTextureCoord);
      vec4 cb = colorFromTarget(vFilterCoord);
      float a = mix(ca.a, cb.a, progress);
      vec2 shift = vFilterCoord + offset(progress, vFilterCoord.x, 0.20);
      vec4 c0 = colorFromSource(mapFuv2Suv(shift));
      vec4 c1 = colorFromTarget(shift);
      return mix(c0, c1, progress);
    }

    /* -------------------------------------------- */
    /*  White Noise                                 */
    /* -------------------------------------------- */

    float noise(vec2 co) {
      float a = 12.9898;
      float b = 78.233;
      float c = 43758.5453;
      float dt = dot(co.xy * progress, vec2(a, b));
      float sn = mod(dt, 3.14);
      return fract(sin(sn) * c);
    }

    vec4 whitenoise() {
      const float m = (1.0 / 0.15);
      vec4 noise = vec4(vec3(noise(vFilterCoord)), 1.0);
      vec4 cr = morph();
      float alpha = smoothstep(0.0, 0.75, cr.a);
      return mix(cr, noise * alpha, smoothstep(0.0, 0.1, min(progress, 1.0 - progress)));
    }

    /* -------------------------------------------- */
    /*  Swirling                                    */
    /* -------------------------------------------- */

    vec2 sphagetization(inout vec2 uv, in float p) {
      const float r = 1.0;
      float dist = length(uv);
      if ( dist < r ) {
        float percent = r - dist;
        float a = (p <= 0.5) ? mix(0.0, 1.0, p / 0.5) : mix(1.0, 0.0, (p - 0.5) / 0.5);
        float tt = percent * percent * a * 8.0 * PI;
        float s = sin(tt);
        float c = cos(tt);
        uv = vec2(dot(uv, vec2(c, -s)), dot(uv, vec2(s, c)));
      }
      return uv;
    }

    vec4 swirl() {
      float p = progress;
      vec2 uv = vFilterCoord - 0.5;
      uv = sphagetization(uv, p);
      uv += 0.5;
      vec4 c0 = colorFromSource(mapFuv2Suv(uv));
      vec4 c1 = colorFromTarget(uv);
      return mix(c0, c1, p) * smoothstep(0.0, 0.5, mix(c0.a, c1.a, progress));
    }

    /* -------------------------------------------- */
    /*  Cross Hatch                                 */
    /* -------------------------------------------- */

    vec4 crosshatch() {
      float dist = distance(vec2(0.5), vFilterCoord) / 3.0;
      float r = progress - min(random(vec2(vFilterCoord.y, 0.0)),
                               random(vec2(0.0, vFilterCoord.x)));
      return mix(colorFromSource(vTextureCoord),
                 colorFromTarget(vFilterCoord),
                 mix(0.0,
                     mix(step(dist, r),
                     1.0,
                     smoothstep(0.7, 1.0, progress)),
                 smoothstep(0.0, 0.3, progress)));
    }

    /* -------------------------------------------- */
    /*  Lateral Wind                                */
    /* -------------------------------------------- */

    vec4 wind() {
      const float s = 0.2;
      float r = random(vec2(0, vFilterCoord.y));
      float p = smoothstep(0.0, -s, vFilterCoord.x * (1.0 - s) + s * r - (progress * (1.0 + s)));
      return mix(
        colorFromSource(vTextureCoord),
        colorFromTarget(vFilterCoord),
        p
      );
    }

    /* -------------------------------------------- */
    /*  Holographic effect                          */
    /* -------------------------------------------- */

    vec2 roffset(in float progress, in float x, in float theta, in float str) {
      float shifty = (1.0 - progress) * str * progress * cos(10.0 * (progress + x));
      return vec2(0, shifty);
    }

    vec4 hologram() {
      float cosProg = 0.5 * (cos(2.0 * PI * progress) + 1.0);
      vec2 os = roffset(progress, vFilterCoord.x, 0.0, 0.24);
      vec4 fscol = colorFromSource(mapFuv2Suv(vFilterCoord + os));
      vec4 ftcol = colorFromTarget(vFilterCoord + os);

      float scintensity = max(max(fscol.r, fscol.g), fscol.b);
      float tcintensity = max(max(ftcol.r, ftcol.g), ftcol.b);

      vec4 tscol = vec4(0.0, fscol.g * 3.0, 0.0, 1.0) * scintensity;
      vec4 ttcol = vec4(ftcol.r * 3.0, 0.0, 0.0, 1.0) * tcintensity;

      vec4 iscol = vec4(0.0, fscol.g * 3.0, fscol.b * 3.0, 1.0) * scintensity;
      vec4 itcol = vec4(ftcol.r * 3.0, 0.0, ftcol.b * 3.0, 1.0) * tcintensity;

      vec4 smix = mix(mix(fscol, tscol, progress), iscol, 1.0 - cosProg);
      vec4 tmix = mix(mix(ftcol, ttcol, 1.0 - progress), itcol, 1.0 - cosProg);
      return mix(smix, tmix, progress);
    }

    /* -------------------------------------------- */
    /*  Hole effect                                 */
    /* -------------------------------------------- */

    vec4 hole() {
      vec2 uv = vFilterCoord;
      float s = smoothstep(0.0, 1.0, min(progress, 1.0 - progress) * 2.0);
      uv -= 0.5;
      uv *= (1.0 + s * 30.0);
      uv += 0.5;
      float clip = getClip(uv);

      vec4 sc = colorFromSource(mapFuv2Suv(uv)) * clip;
      vec4 tc = colorFromTarget(uv);
      return mix(sc, tc, smoothstep(0.4, 0.6, progress));
    }

    /* -------------------------------------------- */
    /*  Hole Swirl effect                           */
    /* -------------------------------------------- */

    vec4 holeSwirl() {
      vec2 uv = vFilterCoord;
      vec4 deepBlack = vec4(vec3(0.25), 1.0);
      float mp = min(progress, 1.0 - progress) * 2.0;
      float sw = smoothstep(0.0, 1.0, mp);
      uv -= 0.5;
      uv *= (1.0 + sw * 15.0);
      uv = sphagetization(uv, progress);
      uv += 0.5;
      float clip = getClip(uv);

      vec4 sc = colorFromSource(mapFuv2Suv(uv)) * clip;
      vec4 tc = colorFromTarget(uv);

      float sv = smoothstep(0.0, 0.35, mp);
      return mix(mix(sc, sc * deepBlack, sv), mix(tc, tc * deepBlack, sv), smoothstep(0.4, 0.6, progress));
    }
    
    /* -------------------------------------------- */
    /*  Glitch                                      */
    /* -------------------------------------------- */

    vec4 glitch() {
      // Precompute constant values
      vec2 inv64 = vec2(1.0 / 64.0);
      vec2 uvOffset = floor(vec2(progress) * vec2(1200.0, 3500.0)) * inv64;
      vec2 halfVec = vec2(0.5);
  
      // Compute block and normalized UV coordinates
      vec2 blk = floor(vFilterCoord / vec2(16.0));
      vec2 uvn = blk * inv64 + uvOffset;
  
      // Compute distortion only if progress > 0.0
      vec2 dist = progress > 0.0 
                  ? (fract(uvn) - halfVec) * 0.3 * (1.0 - progress) 
                  : vec2(0.0);
  
      // Precompute distorted coordinates
      vec2 coords[4];
      for ( int i = 0; i < 4; ++i ) {
        coords[i] = vFilterCoord + dist * (0.4 - 0.1 * float(i));
      }
  
      // Fetch colors and mix them
      vec4 colorResult;
      for ( int i = 0; i < 4; ++i ) {
        vec4 colorSrc = colorFromSource(mapFuv2Suv(coords[i]));
        vec4 colorTgt = colorFromTarget(coords[i]);
        colorResult[i] = mix(colorSrc[i], colorTgt[i], progress);
      }
      return colorResult;
    }
    
    /* -------------------------------------------- */
    /*  Dots                                        */
    /* -------------------------------------------- */
    
    vec4 dots() {
      vec2 halfVec = vec2(0.5);
      float distToCenter = distance(vFilterCoord, halfVec);
      float threshold = pow(progress, 3.0) / distToCenter;
      float distToDot = distance(fract(vFilterCoord * 30.0), halfVec);
  
      // Compute the factor to mix colors based on the threshold comparison
      float isTargetFactor = step(distToDot, threshold);
      vec4 targetColor = colorFromTarget(vFilterCoord);
      vec4 sourceColor = colorFromSource(vTextureCoord);
      return mix(sourceColor, targetColor, isTargetFactor);
    }

    /* -------------------------------------------- */
    /*  Main Program                                */
    /* -------------------------------------------- */

    void main() {
      vec4 result;
      if ( type == 1 ) {
        result = swirl();
      } else if ( type == 2 ) {
        result = drop();
      } else if ( type == 3 ) {
        result = morph();
      } else if ( type == 4 ) {
        result = crosshatch();
      } else if ( type == 5 ) {
        result = wind();
      } else if ( type == 6 ) {
        result = wavy();
      } else if ( type == 7 ) {
        result = whitenoise();
      } else if ( type == 8 ) {
        result = hologram();
      } else if ( type == 9 ) {
        result = hole();
      } else if ( type == 10 ) {
        result = holeSwirl();
      } else if ( type == 11 ) {
        result = glitch();
      } else if ( type == 12 ) {
        result = dots();
      } else {
        result = transition();
      }
      gl_FragColor = result * tintAlpha;
    }
  `;

  /* -------------------------------------------- */

  /** @inheritDoc */
  apply(filterManager, input, output, clear) {
    const filterMatrix = this.uniforms.filterMatrix;
    const {sourceFrame, destinationFrame, target} = filterManager.activeState;

    if ( this.#requirePadding ) {
      this.padding = Math.max(target.width, target.height) * 0.5 * canvas.stage.worldTransform.d;
    }
    else this.padding = 0;

    filterMatrix.set(destinationFrame.width, 0, 0, destinationFrame.height, sourceFrame.x, sourceFrame.y);
    const worldTransform = PIXI.Matrix.TEMP_MATRIX;
    const localBounds = target.getLocalBounds();

    worldTransform.copyFrom(target.transform.worldTransform);
    worldTransform.invert();
    filterMatrix.prepend(worldTransform);
    filterMatrix.translate(-localBounds.x, -localBounds.y);
    filterMatrix.scale(1.0 / localBounds.width, 1.0 / localBounds.height);

    const filterMatrixInverse = this.uniforms.filterMatrixInverse;
    filterMatrixInverse.copyFrom(filterMatrix);
    filterMatrixInverse.invert();
    filterManager.applyFilter(this, input, output, clear);
  }
}

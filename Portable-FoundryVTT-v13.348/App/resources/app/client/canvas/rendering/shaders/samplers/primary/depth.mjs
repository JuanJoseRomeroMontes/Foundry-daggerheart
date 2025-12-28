import BaseSamplerShader from "../base-sampler.mjs";
import BitMask from "../../../../../../common/utils/bitmask.mjs";

/**
 * @import {DepthBatchData} from "../_types.mjs"
 */

/**
 * The depth sampler shader.
 */
export default class DepthSamplerShader extends BaseSamplerShader {

  /* -------------------------------------------- */
  /*  Batched version Rendering                   */
  /* -------------------------------------------- */

  /** @override */
  static classPluginName = "batchDepth";

  /* ---------------------------------------- */

  /** @override */
  static batchGeometry = [
    {id: "aVertexPosition", size: 2, normalized: false, type: PIXI.TYPES.FLOAT},
    {id: "aTextureCoord", size: 2, normalized: false, type: PIXI.TYPES.FLOAT},
    {id: "aTextureId", size: 1, normalized: false, type: PIXI.TYPES.UNSIGNED_BYTE},
    {id: "aTextureAlphaThreshold", size: 1, normalized: true, type: PIXI.TYPES.UNSIGNED_BYTE},
    {id: "aDepthElevation", size: 1, normalized: true, type: PIXI.TYPES.UNSIGNED_BYTE},
    {id: "aRestrictionState", size: 1, normalized: false, type: PIXI.TYPES.UNSIGNED_BYTE},
    {id: "aOcclusionData", size: 4, normalized: true, type: PIXI.TYPES.UNSIGNED_BYTE}
  ];

  /* ---------------------------------------- */

  /** @override */
  static batchVertexSize = 6;

  /* -------------------------------------------- */

  /** @override */
  static reservedTextureUnits = 1; // We need a texture unit for the occlusion texture

  /* -------------------------------------------- */

  /** @override */
  static defaultUniforms = {
    screenDimensions: [1, 1],
    sampler: null,
    occlusionTexture: null,
    textureAlphaThreshold: 0,
    depthElevation: 0,
    occlusionElevation: 0,
    fadeOcclusion: 0,
    radialOcclusion: 0,
    visionOcclusion: 0,
    restrictsLight: false,
    restrictsWeather: false
  };

  /* -------------------------------------------- */

  /** @override */
  static batchDefaultUniforms(maxTex) {
    return {
      screenDimensions: [1, 1],
      occlusionTexture: maxTex
    };
  }

  /* -------------------------------------------- */

  /** @override */
  static _preRenderBatch(batchRenderer) {
    const uniforms = batchRenderer._shader.uniforms;
    uniforms.screenDimensions = canvas.screenDimensions;
    batchRenderer.renderer.texture.bind(canvas.masks.occlusion.renderTexture, uniforms.occlusionTexture);
  }

  /* ---------------------------------------- */

  /** @override */
  static _packInterleavedGeometry(element, attributeBuffer, indexBuffer, aIndex, iIndex) {
    const {float32View, uint8View} = attributeBuffer;

    // Write indices into buffer
    const packedVertices = aIndex / this.vertexSize;
    const indices = element.indices;
    for ( let i = 0; i < indices.length; i++ ) {
      indexBuffer[iIndex++] = packedVertices + indices[i];
    }

    // Prepare attributes
    const vertexData = element.vertexData;
    const uvs = element.uvs;
    const textureId = element._texture.baseTexture._batchLocation;
    const restrictionState = element.restrictionState;
    const textureAlphaThreshold = (element.textureAlphaThreshold * 255) | 0;
    const depthElevation = (canvas.masks.depth.mapElevation(element.elevation) * 255) | 0;
    const occlusionElevation = (canvas.masks.occlusion.mapElevation(element.elevation) * 255) | 0;
    const fadeOcclusion = (element.fadeOcclusion * 255) | 0;
    const radialOcclusion = (element.radialOcclusion * 255) | 0;
    const visionOcclusion = (element.visionOcclusion * 255) | 0;

    // Write attributes into buffer
    const vertexSize = this.vertexSize;
    for ( let i = 0, j = 0; i < vertexData.length; i += 2, j += vertexSize ) {
      let k = aIndex + j;
      float32View[k++] = vertexData[i];
      float32View[k++] = vertexData[i + 1];
      float32View[k++] = uvs[i];
      float32View[k++] = uvs[i + 1];
      k <<= 2;
      uint8View[k++] = textureId;
      uint8View[k++] = textureAlphaThreshold;
      uint8View[k++] = depthElevation;
      uint8View[k++] = restrictionState;
      uint8View[k++] = occlusionElevation;
      uint8View[k++] = fadeOcclusion;
      uint8View[k++] = radialOcclusion;
      uint8View[k++] = visionOcclusion;
    }
  }

  /* ---------------------------------------- */

  /** @override */
  static get batchVertexShader() {
    return `
      #version 300 es

      ${this.GLSL1_COMPATIBILITY_VERTEX}

      precision ${PIXI.settings.PRECISION_VERTEX} float;

      in vec2 aVertexPosition;
      in vec2 aTextureCoord;

      uniform vec2 screenDimensions;

      ${this._batchVertexShader}

      in float aTextureId;
      in float aTextureAlphaThreshold;
      in float aDepthElevation;
      in vec4 aOcclusionData;
      in float aRestrictionState;

      uniform mat3 projectionMatrix;
      uniform mat3 translationMatrix;

      out vec2 vTextureCoord;
      out vec2 vOcclusionCoord;
      flat out float vTextureId;
      flat out float vTextureAlphaThreshold;
      flat out float vDepthElevation;
      flat out float vOcclusionElevation;
      flat out float vFadeOcclusion;
      flat out float vRadialOcclusion;
      flat out float vVisionOcclusion;
      flat out uint vRestrictionState;

      void main() {
        vec2 vertexPosition;
        vec2 textureCoord;
        _main(vertexPosition, textureCoord);
        vec3 tPos = translationMatrix * vec3(vertexPosition, 1.0);
        gl_Position = vec4((projectionMatrix * tPos).xy, 0.0, 1.0);
        vTextureCoord = textureCoord;
        vOcclusionCoord = tPos.xy / screenDimensions;
        vTextureId = aTextureId;
        vTextureAlphaThreshold = aTextureAlphaThreshold;
        vDepthElevation = aDepthElevation;
        vOcclusionElevation = aOcclusionData.x;
        vFadeOcclusion = aOcclusionData.y;
        vRadialOcclusion = aOcclusionData.z;
        vVisionOcclusion = aOcclusionData.w;
        vRestrictionState = uint(aRestrictionState);
      }
    `;
  }

  /* -------------------------------------------- */

  /**
   * The batch vertex shader source. Subclasses can override it.
   * @type {string}
   * @protected
   */
  static _batchVertexShader = `
    void _main(out vec2 vertexPosition, out vec2 textureCoord) {
      vertexPosition = aVertexPosition;
      textureCoord = aTextureCoord;
    }
  `;

  /* ---------------------------------------- */

  /** @override */
  static get batchFragmentShader() {
    return `
      #version 300 es

      ${this.GLSL1_COMPATIBILITY_FRAGMENT}

      precision ${PIXI.settings.PRECISION_FRAGMENT} float;

      in vec2 vTextureCoord;
      flat in float vTextureId;

      uniform sampler2D uSamplers[%count%];

      ${DepthSamplerShader.#OPTIONS_CONSTANTS}
      ${this._batchFragmentShader}

      in vec2 vOcclusionCoord;
      flat in float vTextureAlphaThreshold;
      flat in float vDepthElevation;
      flat in float vOcclusionElevation;
      flat in float vFadeOcclusion;
      flat in float vRadialOcclusion;
      flat in float vVisionOcclusion;
      flat in uint vRestrictionState;
      
      uniform sampler2D occlusionTexture;

      out vec3 fragColor;

      void main() {
        float textureAlpha = _main();
        float textureAlphaThreshold = vTextureAlphaThreshold;
        float depthElevation = vDepthElevation;
        float occlusionElevation = vOcclusionElevation;
        float fadeOcclusion = vFadeOcclusion;
        float radialOcclusion = vRadialOcclusion;
        float visionOcclusion = vVisionOcclusion;
        bool restrictsLight = ((vRestrictionState & RESTRICTS_LIGHT) == RESTRICTS_LIGHT);
        bool restrictsWeather = ((vRestrictionState & RESTRICTS_WEATHER) == RESTRICTS_WEATHER);
        ${DepthSamplerShader.#FRAGMENT_MAIN}
      }
    `;
  }

  /* -------------------------------------------- */

  /**
   * The batch fragment shader source. Subclasses can override it.
   * @type {string}
   * @protected
   */
  static _batchFragmentShader = `
    float _main() {
      vec4 color;
      %forloop%
      return color.a;
    }
  `;

  /* -------------------------------------------- */
  /*  Non-Batched version Rendering               */
  /* -------------------------------------------- */

  /** @override */
  static get vertexShader() {
    return `
      #version 300 es

      ${this.GLSL1_COMPATIBILITY_VERTEX}

      precision ${PIXI.settings.PRECISION_VERTEX} float;

      in vec2 aVertexPosition;
      in vec2 aTextureCoord;

      uniform vec2 screenDimensions;

      ${this._vertexShader}

      uniform mat3 projectionMatrix;

      out vec2 vUvs;
      out vec2 vOcclusionCoord;

      void main() {
        vec2 vertexPosition;
        vec2 textureCoord;
        _main(vertexPosition, textureCoord);
        gl_Position = vec4((projectionMatrix * vec3(vertexPosition, 1.0)).xy, 0.0, 1.0);
        vUvs = textureCoord;
        vOcclusionCoord = vertexPosition / screenDimensions;
      }
    `;
  }

  /* -------------------------------------------- */

  /**
   * The vertex shader source. Subclasses can override it.
   * @type {string}
   * @protected
   */
  static _vertexShader = `
    void _main(out vec2 vertexPosition, out vec2 textureCoord) {
      vertexPosition = aVertexPosition;
      textureCoord = aTextureCoord;
    }
  `;

  /* -------------------------------------------- */

  /** @override */
  static get fragmentShader() {
    return `
      #version 300 es

      ${this.GLSL1_COMPATIBILITY_FRAGMENT}

      precision ${PIXI.settings.PRECISION_FRAGMENT} float;

      in vec2 vUvs;

      uniform sampler2D sampler;

      ${DepthSamplerShader.#OPTIONS_CONSTANTS}
      ${this._fragmentShader}

      in vec2 vOcclusionCoord;

      uniform sampler2D occlusionTexture;
      uniform float textureAlphaThreshold;
      uniform float depthElevation;
      uniform float occlusionElevation;
      uniform float fadeOcclusion;
      uniform float radialOcclusion;
      uniform float visionOcclusion;
      uniform bool restrictsLight;
      uniform bool restrictsWeather;

      out vec3 fragColor;

      void main() {
        float textureAlpha = _main();
        ${DepthSamplerShader.#FRAGMENT_MAIN}
      }
    `;
  }

  /* -------------------------------------------- */

  /**
   * The fragment shader source. Subclasses can override it.
   * @type {string}
   * @protected
   */
  static _fragmentShader = `
    float _main() {
      return texture(sampler, vUvs).a;
    }
  `;

  /* -------------------------------------------- */

  /** @inheritdoc */
  _preRender(mesh, renderer) {
    super._preRender(mesh, renderer);
    const uniforms = this.uniforms;
    uniforms.screenDimensions = canvas.screenDimensions;
    uniforms.textureAlphaThreshold = mesh.textureAlphaThreshold;
    const occlusionMask = canvas.masks.occlusion;
    uniforms.occlusionTexture = occlusionMask.renderTexture;
    uniforms.occlusionElevation = occlusionMask.mapElevation(mesh.elevation);
    uniforms.depthElevation = canvas.masks.depth.mapElevation(mesh.elevation);
    const occlusionState = mesh._occlusionState;
    uniforms.fadeOcclusion = occlusionState.fade;
    uniforms.radialOcclusion = occlusionState.radial;
    uniforms.visionOcclusion = occlusionState.vision;
    uniforms.restrictsLight = mesh.restrictsLight;
    uniforms.restrictsWeather = mesh.restrictsWeather;
  }

  /* -------------------------------------------- */

  /**
   * The restriction options bit mask constants.
   * @type {string}
   */
  static #OPTIONS_CONSTANTS = BitMask.generateShaderBitMaskConstants([
    "RESTRICTS_LIGHT",
    "RESTRICTS_WEATHER"
  ]);

  /* -------------------------------------------- */

  /**
   * The fragment source.
   * @type {string}
   */
  static #FRAGMENT_MAIN = `
    float inverseDepthElevation = 1.0 - depthElevation;
    fragColor = vec3(inverseDepthElevation, depthElevation, inverseDepthElevation);
    fragColor *= step(textureAlphaThreshold, textureAlpha);
    vec3 weight = 1.0 - step(occlusionElevation, texture(occlusionTexture, vOcclusionCoord).rgb);
    float occlusion = step(0.5, max(max(weight.r * fadeOcclusion, weight.g * radialOcclusion), weight.b * visionOcclusion));
    fragColor.r *= occlusion;
    fragColor.g *= 1.0 - occlusion;
    fragColor.b *= occlusion;
    if ( !restrictsLight ) {
      fragColor.r = 0.0;
      fragColor.g = 0.0;
    }
    if ( !restrictsWeather ) {
      fragColor.b = 0.0;
    }
  `;
}

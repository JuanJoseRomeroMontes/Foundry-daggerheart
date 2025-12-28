import BaseSamplerShader from "../base-sampler.mjs";

/**
 * @import {OccludableBatchData} from "../_types.mjs"
 */

/**
 * The occlusion sampler shader.
 */
export default class OccludableSamplerShader extends BaseSamplerShader {

  /**
   * The fragment shader code that applies occlusion.
   * @type {string}
   */
  static #OCCLUSION = `
    vec3 occluded = 1.0 - step(occlusionElevation, texture(occlusionTexture, vScreenCoord).rgb);
    float occlusion = max(occluded.r * fadeOcclusion, max(occluded.g * radialOcclusion, occluded.b * visionOcclusion));
    fragColor *= mix(unoccludedAlpha, occludedAlpha, occlusion);
  `;

  /* -------------------------------------------- */
  /*  Batched version Rendering                   */
  /* -------------------------------------------- */

  /** @override */
  static classPluginName = "batchOcclusion";

  /* ---------------------------------------- */

  /** @override */
  static batchGeometry = [
    {id: "aVertexPosition", size: 2, normalized: false, type: PIXI.TYPES.FLOAT},
    {id: "aTextureCoord", size: 2, normalized: false, type: PIXI.TYPES.FLOAT},
    {id: "aColor", size: 4, normalized: true, type: PIXI.TYPES.UNSIGNED_BYTE},
    {id: "aTextureId", size: 1, normalized: false, type: PIXI.TYPES.UNSIGNED_SHORT},
    {id: "aOcclusionAlphas", size: 2, normalized: true, type: PIXI.TYPES.UNSIGNED_BYTE},
    {id: "aOcclusionData", size: 4, normalized: true, type: PIXI.TYPES.UNSIGNED_BYTE}
  ];

  /* -------------------------------------------- */

  /** @override */
  static batchVertexSize = 7;

  /* -------------------------------------------- */

  /** @override */
  static reservedTextureUnits = 1; // We need a texture unit for the occlusion texture

  /* -------------------------------------------- */

  /** @override */
  static defaultUniforms = {
    screenDimensions: [1, 1],
    sampler: null,
    tintAlpha: [1, 1, 1, 1],
    occlusionTexture: null,
    unoccludedAlpha: 1,
    occludedAlpha: 0,
    occlusionElevation: 0,
    fadeOcclusion: 0,
    radialOcclusion: 0,
    visionOcclusion: 0
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
    const occlusionMask = canvas.masks.occlusion;
    const uniforms = batchRenderer._shader.uniforms;
    uniforms.screenDimensions = canvas.screenDimensions;
    batchRenderer.renderer.texture.bind(occlusionMask.renderTexture, uniforms.occlusionTexture);
  }

  /* ---------------------------------------- */

  /** @override */
  static _packInterleavedGeometry(element, attributeBuffer, indexBuffer, aIndex, iIndex) {
    const {float32View, uint8View, uint16View, uint32View} = attributeBuffer;

    // Write indices into buffer
    const packedVertices = aIndex / this.vertexSize;
    const indices = element.indices;
    for ( let i = 0; i < indices.length; i++ ) {
      indexBuffer[iIndex++] = packedVertices + indices[i];
    }

    // Prepare attributes
    const vertexData = element.vertexData;
    const uvs = element.uvs;
    const baseTexture = element._texture.baseTexture;
    const alpha = Math.min(element.worldAlpha, 1.0);
    const argb = PIXI.Color.shared.setValue(element._tintRGB).toPremultiplied(alpha, baseTexture.alphaMode > 0);
    const textureId = baseTexture._batchLocation;
    const unoccludedAlpha = (element.unoccludedAlpha * 255) | 0;
    const occludedAlpha = (element.occludedAlpha * 255) | 0;
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
      uint32View[k++] = argb;
      k <<= 1;
      uint16View[k++] = textureId;
      k <<= 1;
      uint8View[k++] = unoccludedAlpha;
      uint8View[k++] = occludedAlpha;
      uint8View[k++] = occlusionElevation;
      uint8View[k++] = fadeOcclusion;
      uint8View[k++] = radialOcclusion;
      uint8View[k++] = visionOcclusion;
    }
  }

  /* -------------------------------------------- */

  /** @override */
  static get batchVertexShader() {
    return `
      #version 300 es

      ${this.GLSL1_COMPATIBILITY_VERTEX}

      precision ${PIXI.settings.PRECISION_VERTEX} float;

      in vec2 aVertexPosition;
      in vec2 aTextureCoord;
      in vec4 aColor;

      uniform mat3 translationMatrix;
      uniform vec4 tint;
      uniform vec2 screenDimensions;

      ${this._batchVertexShader}

      in float aTextureId;
      in vec2 aOcclusionAlphas;
      in vec4 aOcclusionData;

      uniform mat3 projectionMatrix;

      out vec2 vTextureCoord;
      out vec2 vScreenCoord;
      flat out vec4 vColor;
      flat out float vTextureId;
      flat out float vUnoccludedAlpha;
      flat out float vOccludedAlpha;
      flat out float vOcclusionElevation;
      flat out float vFadeOcclusion;
      flat out float vRadialOcclusion;
      flat out float vVisionOcclusion;

      void main() {
        vec2 vertexPosition;
        vec2 textureCoord;
        vec4 color;
        _main(vertexPosition, textureCoord, color);
        gl_Position = vec4((projectionMatrix * vec3(vertexPosition, 1.0)).xy, 0.0, 1.0);
        vTextureCoord = textureCoord;
        vScreenCoord = vertexPosition / screenDimensions;
        vColor = color;
        vTextureId = aTextureId;
        vUnoccludedAlpha = aOcclusionAlphas.x;
        vOccludedAlpha = aOcclusionAlphas.y;
        vOcclusionElevation = aOcclusionData.x;
        vFadeOcclusion = aOcclusionData.y;
        vRadialOcclusion = aOcclusionData.z;
        vVisionOcclusion = aOcclusionData.w;
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
    void _main(out vec2 vertexPosition, out vec2 textureCoord, out vec4 color) {
      vertexPosition = (translationMatrix * vec3(aVertexPosition, 1.0)).xy;
      textureCoord = aTextureCoord;
      color = aColor * tint;
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
      in vec2 vScreenCoord;
      flat in vec4 vColor;
      flat in float vTextureId;

      uniform sampler2D uSamplers[%count%];

      ${this._batchFragmentShader}

      flat in float vUnoccludedAlpha;
      flat in float vOccludedAlpha;
      flat in float vOcclusionElevation;
      flat in float vFadeOcclusion;
      flat in float vRadialOcclusion;
      flat in float vVisionOcclusion;

      uniform sampler2D occlusionTexture;

      out vec4 fragColor;

      void main() {
        fragColor = _main();
        float unoccludedAlpha = vUnoccludedAlpha;
        float occludedAlpha = vOccludedAlpha;
        float occlusionElevation = vOcclusionElevation;
        float fadeOcclusion = vFadeOcclusion;
        float radialOcclusion = vRadialOcclusion;
        float visionOcclusion = vVisionOcclusion;
        ${OccludableSamplerShader.#OCCLUSION}
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
    vec4 _main() {
      vec4 color;
      %forloop%
      return color * vColor;
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
      out vec2 vScreenCoord;

      void main() {
        vec2 vertexPosition;
        vec2 textureCoord;
        _main(vertexPosition, textureCoord);
        gl_Position = vec4((projectionMatrix * vec3(vertexPosition, 1.0)).xy, 0.0, 1.0);
        vUvs = textureCoord;
        vScreenCoord = vertexPosition / screenDimensions;
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
      in vec2 vScreenCoord;

      uniform sampler2D sampler;
      uniform vec4 tintAlpha;

      ${this._fragmentShader}

      uniform sampler2D occlusionTexture;
      uniform float unoccludedAlpha;
      uniform float occludedAlpha;
      uniform float occlusionElevation;
      uniform float fadeOcclusion;
      uniform float radialOcclusion;
      uniform float visionOcclusion;

      out vec4 fragColor;

      void main() {
        fragColor = _main();
        ${OccludableSamplerShader.#OCCLUSION}
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
    vec4 _main() {
      return texture(sampler, vUvs) * tintAlpha;
    }
  `;

  /* -------------------------------------------- */

  /** @inheritdoc */
  _preRender(mesh, renderer) {
    super._preRender(mesh, renderer);
    const uniforms = this.uniforms;
    uniforms.screenDimensions = canvas.screenDimensions;
    const occlusionMask = canvas.masks.occlusion;
    uniforms.occlusionTexture = occlusionMask.renderTexture;
    uniforms.occlusionElevation = occlusionMask.mapElevation(mesh.elevation);
    uniforms.unoccludedAlpha = mesh.unoccludedAlpha;
    uniforms.occludedAlpha = mesh.occludedAlpha;
    const occlusionState = mesh._occlusionState;
    uniforms.fadeOcclusion = occlusionState.fade;
    uniforms.radialOcclusion = occlusionState.radial;
    uniforms.visionOcclusion = occlusionState.vision;
  }
}

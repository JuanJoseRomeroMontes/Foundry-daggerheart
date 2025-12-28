import AbstractBaseShader from "../base-shader.mjs";

/**
 * The shader used by {@link foundry.canvas.placeables.regions.RegionMesh}.
 */
export default class RegionShader extends AbstractBaseShader {

  /** @override */
  static vertexShader = `
    precision ${PIXI.settings.PRECISION_VERTEX} float;

    attribute vec2 aVertexPosition;

    uniform mat3 translationMatrix;
    uniform mat3 projectionMatrix;
    uniform vec2 canvasDimensions;
    uniform vec4 sceneDimensions;
    uniform vec2 screenDimensions;

    varying vec2 vCanvasCoord; // normalized canvas coordinates
    varying vec2 vSceneCoord; // normalized scene coordinates
    varying vec2 vScreenCoord; // normalized screen coordinates

    void main() {
      vec2 pixelCoord = aVertexPosition;
      vCanvasCoord = pixelCoord / canvasDimensions;
      vSceneCoord = (pixelCoord - sceneDimensions.xy) / sceneDimensions.zw;
      vec3 tPos = translationMatrix * vec3(aVertexPosition, 1.0);
      vScreenCoord = tPos.xy / screenDimensions;
      gl_Position = vec4((projectionMatrix * tPos).xy, 0.0, 1.0);
    }
  `;

  /** @override */
  static fragmentShader = `
    precision ${PIXI.settings.PRECISION_FRAGMENT} float;

    uniform vec4 tintAlpha;

    void main() {
      gl_FragColor = tintAlpha;
    }
  `;

  /* ---------------------------------------- */

  /** @override */
  static defaultUniforms = {
    canvasDimensions: [1, 1],
    sceneDimensions: [0, 0, 1, 1],
    screenDimensions: [1, 1],
    tintAlpha: [1, 1, 1, 1]
  };

  /* ---------------------------------------- */

  /** @override */
  _preRender(mesh, renderer) {
    const uniforms = this.uniforms;
    uniforms.tintAlpha = mesh._cachedTint;
    const dimensions = canvas.dimensions;
    uniforms.canvasDimensions[0] = dimensions.width;
    uniforms.canvasDimensions[1] = dimensions.height;
    uniforms.sceneDimensions = dimensions.sceneRect;
    uniforms.screenDimensions = canvas.screenDimensions;
  }
}

import AbstractBaseFilter from "./base-filter.mjs";

/**
 * This class defines an interface for masked custom filters
 */
export default class AbstractBaseMaskFilter extends AbstractBaseFilter {
  /**
   * The default vertex shader used by all instances of AbstractBaseMaskFilter
   * @type {string}
   */
  static vertexShader = `
  attribute vec2 aVertexPosition;

  uniform mat3 projectionMatrix;
  uniform vec2 screenDimensions;
  uniform vec4 inputSize;
  uniform vec4 outputFrame;

  varying vec2 vTextureCoord;
  varying vec2 vMaskTextureCoord;

  vec4 filterVertexPosition( void ) {
      vec2 position = aVertexPosition * max(outputFrame.zw, vec2(0.)) + outputFrame.xy;
      return vec4((projectionMatrix * vec3(position, 1.0)).xy, 0., 1.);
  }

  // getting normalized coord for the tile texture
  vec2 filterTextureCoord( void ) {
      return aVertexPosition * (outputFrame.zw * inputSize.zw);
  }

  // getting normalized coord for a screen sized mask render texture
  vec2 filterMaskTextureCoord( in vec2 textureCoord ) {
    return (textureCoord * inputSize.xy + outputFrame.xy) / screenDimensions;
  }

  void main() {
    vTextureCoord = filterTextureCoord();
    vMaskTextureCoord = filterMaskTextureCoord(vTextureCoord);
    gl_Position = filterVertexPosition();
  }`;

  /** @override */
  apply(filterManager, input, output, clear, currentState) {
    this.uniforms.screenDimensions = canvas.screenDimensions;
    filterManager.applyFilter(this, input, output, clear);
  }
}

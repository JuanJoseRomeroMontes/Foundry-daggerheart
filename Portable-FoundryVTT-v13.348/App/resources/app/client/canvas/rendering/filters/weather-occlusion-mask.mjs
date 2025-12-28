import AbstractBaseMaskFilter from "./base-mask-filter.mjs";

/**
 * The filter used by the weather layer to mask weather above occluded roofs.
 * @see {@link foundry.canvas.layers.WeatherEffects}
 */
export default class WeatherOcclusionMaskFilter extends AbstractBaseMaskFilter {

  /**
   * Elevation of this weather occlusion mask filter.
   * @type {number}
   */
  elevation = Infinity;

  /** @override */
  static vertexShader = `
    attribute vec2 aVertexPosition;
  
    // Filter globals uniforms
    uniform mat3 projectionMatrix;
    uniform mat3 terrainUvMatrix;
    uniform vec4 inputSize;
    uniform vec4 outputFrame;
    
    // Needed to compute mask and terrain normalized coordinates
    uniform vec2 screenDimensions;
    
    // Needed for computing scene sized texture coordinates 
    uniform vec2 sceneAnchor;
    uniform vec2 sceneDimensions;
    uniform bool useTerrain;
  
    varying vec2 vTextureCoord;
    varying vec2 vMaskTextureCoord;
    varying vec2 vTerrainTextureCoord;
    varying vec2 vSceneCoord;
  
    vec4 filterVertexPosition( void ) {
        vec2 position = aVertexPosition * max(outputFrame.zw, vec2(0.)) + outputFrame.xy;
        return vec4((projectionMatrix * vec3(position, 1.0)).xy, 0., 1.);
    }
  
    // getting normalized coord for the tile texture
    vec2 filterTextureCoord( void ) {
        return aVertexPosition * (outputFrame.zw * inputSize.zw);
    }
  
    // getting normalized coord for a screen sized mask render texture
    vec2 filterMaskTextureCoord( void ) {
      return (aVertexPosition * outputFrame.zw + outputFrame.xy) / screenDimensions;
    }
    
    vec2 filterTerrainSceneCoord( in vec2 textureCoord ) {
      return (textureCoord - (sceneAnchor / screenDimensions)) * (screenDimensions / sceneDimensions);
    }
    
    // get normalized terrain texture coordinates
    vec2 filterTerrainTextureCoord( in vec2 sceneCoord ) {
      return (terrainUvMatrix * vec3(vSceneCoord, 1.0)).xy;
    }
  
    void main() {
      vTextureCoord = filterTextureCoord();
      if ( useTerrain ) {
        vSceneCoord = filterTerrainSceneCoord(vTextureCoord);
        vTerrainTextureCoord = filterTerrainTextureCoord(vSceneCoord);
      }
      vMaskTextureCoord = filterMaskTextureCoord();
      gl_Position = filterVertexPosition();
    }`;

  /** @override */
  static fragmentShader = ` 
    // Occlusion mask uniforms
    uniform bool useOcclusion;
    uniform sampler2D occlusionTexture;
    uniform bool reverseOcclusion;
    uniform vec4 occlusionWeights;
    
    // Terrain mask uniforms
    uniform bool useTerrain;
    uniform sampler2D terrainTexture;
    uniform bool reverseTerrain;
    uniform vec4 terrainWeights;
    
    // Other uniforms
    varying vec2 vTextureCoord;
    varying vec2 vMaskTextureCoord;
    varying vec2 vTerrainTextureCoord;
    varying vec2 vSceneCoord;
    uniform sampler2D uSampler;
    uniform float depthElevation;
    uniform highp mat3 terrainUvMatrix;
    
    // Clip the terrain texture if out of bounds
    float getTerrainClip(vec2 uv) {
      return step(3.5,
         step(0.0, uv.x) +
         step(0.0, uv.y) +
         step(uv.x, 1.0) +
         step(uv.y, 1.0));
    }
    
    void main() {     
      // Base mask value 
      float mask = 1.0;
      
      // Process the occlusion mask
      if ( useOcclusion ) {
        float oMask = step(depthElevation, (254.5 / 255.0) - dot(occlusionWeights, texture2D(occlusionTexture, vMaskTextureCoord)));
        if ( reverseOcclusion ) oMask = 1.0 - oMask;
        mask *= oMask;
      }
                    
      // Process the terrain mask 
      if ( useTerrain ) {
        float tMask = dot(terrainWeights, texture2D(terrainTexture, vTerrainTextureCoord));
        if ( reverseTerrain ) tMask = 1.0 - tMask;
        mask *= (tMask * getTerrainClip(vSceneCoord));
      }
      
      // Process filtering and apply mask value
      gl_FragColor = texture2D(uSampler, vTextureCoord) * mask;
    }`;

  /** @override */
  static defaultUniforms = {
    depthElevation: 0,
    useOcclusion: true,
    occlusionTexture: null,
    reverseOcclusion: false,
    occlusionWeights: [0, 0, 1, 0],
    useTerrain: false,
    terrainTexture: null,
    reverseTerrain: false,
    terrainWeights: [1, 0, 0, 0],
    sceneDimensions: [0, 0],
    sceneAnchor: [0, 0],
    terrainUvMatrix: new PIXI.Matrix()
  };

  /** @override */
  apply(filterManager, input, output, clear, currentState) {
    if ( this.uniforms.useTerrain ) {
      const wt = canvas.stage.worldTransform;
      const z = wt.d;
      const sceneDim = canvas.scene.dimensions;

      // Computing the scene anchor and scene dimensions for terrain texture coordinates
      this.uniforms.sceneAnchor[0] = wt.tx + (sceneDim.sceneX * z);
      this.uniforms.sceneAnchor[1] = wt.ty + (sceneDim.sceneY * z);
      this.uniforms.sceneDimensions[0] = sceneDim.sceneWidth * z;
      this.uniforms.sceneDimensions[1] = sceneDim.sceneHeight * z;
    }
    this.uniforms.depthElevation = canvas.masks.depth.mapElevation(this.elevation);
    return super.apply(filterManager, input, output, clear, currentState);
  }
}

import BaseShaderMixin from "../mixins/base-shader-mixin.mjs";

/**
 * This class defines an interface which all shaders utilize.
 * @extends {PIXI.Shader}
 * @property {PIXI.Program} program The program to use with this shader.
 * @property {object} uniforms      The current uniforms of the Shader.
 * @mixes BaseShaderMixin
 * @abstract
 */
export default class AbstractBaseShader extends BaseShaderMixin(PIXI.Shader) {
  constructor(program, uniforms) {
    super(program, foundry.utils.deepClone(uniforms));

    /**
     * The initial values of the shader uniforms.
     * @type {object}
     */
    this.initialUniforms = uniforms;
  }

  /* -------------------------------------------- */

  /**
   * The raw vertex shader used by this class.
   * A subclass of AbstractBaseShader must implement the vertexShader static field.
   * @type {string}
   */
  static vertexShader = "";

  /**
   * The raw fragment shader used by this class.
   * A subclass of AbstractBaseShader must implement the fragmentShader static field.
   * @type {string|(...args: any[]) => string}
   */
  static fragmentShader = "";

  /**
   * The default uniform values for the shader.
   * A subclass of AbstractBaseShader must implement the defaultUniforms static field.
   * @type {object}
   */
  static defaultUniforms = {};

  /* -------------------------------------------- */

  /**
   * A factory method for creating the shader using its defined default values
   * @param {object} initialUniforms
   * @returns {AbstractBaseShader}
   */
  static create(initialUniforms) {
    const program = PIXI.Program.from(this.vertexShader, this.fragmentShader);
    const uniforms = foundry.utils.mergeObject(this.defaultUniforms, initialUniforms,
      {inplace: false, insertKeys: false});
    const shader = new this(program, uniforms);
    shader._configure();
    return shader;
  }

  /* -------------------------------------------- */

  /**
   * Reset the shader uniforms back to their initial values.
   */
  reset() {
    for (let [k, v] of Object.entries(this.initialUniforms)) {
      this.uniforms[k] = foundry.utils.deepClone(v);
    }
  }

  /* ---------------------------------------- */

  /**
   * A one time initialization performed on creation.
   * @protected
   */
  _configure() {}

  /* ---------------------------------------- */

  /**
   * Perform operations which are required before binding the Shader to the Renderer.
   * @param {PIXI.DisplayObject} mesh      The mesh display object linked to this shader.
   * @param {PIXI.Renderer} renderer       The renderer
   * @protected
   */
  _preRender(mesh, renderer) {}

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  get _defaults() {
    const msg = "AbstractBaseShader#_defaults is deprecated in favor of AbstractBaseShader#initialUniforms.";
    foundry.utils.logCompatibilityWarning(msg, {since: 12, until: 14});
    return this.initialUniforms;
  }
}

/**
 * Identify this class to be compatible with ShaderField
 * @type {boolean}
 * @internal
 * @readonly
 */
Object.defineProperty(AbstractBaseShader, "_isShaderFieldCompatible", {
  value: true,
  writable: false,
  enumerable: false,
  configurable: false
});

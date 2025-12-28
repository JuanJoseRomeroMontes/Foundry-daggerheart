import {DataField} from "@common/data/fields.mjs";
export * from "@common/data/fields.mjs"

/**
 * A special subclass of DataField used to reference an AbstractBaseShader definition. Client only.
 */
export class ShaderField extends DataField {
  /** @inheritdoc */
  static get _defaults() {
    const defaults = super._defaults;
    defaults.nullable = true;
    defaults.initial = undefined;
    return defaults;
  }

  /** @override */
  _cast(value) {
    if ( !(typeof value === "function" && value._isShaderFieldCompatible) ) {
      throw new Error("The value provided to a ShaderField must be a compatible Shader Class.");
    }
    return value;
  }
}

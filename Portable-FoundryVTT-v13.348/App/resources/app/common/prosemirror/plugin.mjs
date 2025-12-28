/**
 * @abstract
 */
export default class ProseMirrorPlugin {
  /**
   * An abstract class for building a ProseMirror Plugin.
   * @see {Plugin}
   * @param {Schema} schema  The schema to build the plugin against.
   */
  constructor(schema) {
    /**
     * The ProseMirror schema to build the plugin against.
     * @type {Schema}
     */
    Object.defineProperty(this, "schema", {value: schema});
  }

  /* -------------------------------------------- */

  /**
   * Build the plugin.
   * @param {Schema} schema     The ProseMirror schema to build the plugin against.
   * @param {object} [options]  Additional options to pass to the plugin.
   * @returns {Plugin}
   * @abstract
   */
  static build(schema, options={}) {
    throw new Error("Subclasses of ProseMirrorPlugin must implement a static build method.");
  }
}

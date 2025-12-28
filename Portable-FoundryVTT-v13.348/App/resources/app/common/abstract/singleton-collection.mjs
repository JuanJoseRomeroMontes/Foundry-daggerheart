import EmbeddedCollection from "./embedded-collection.mjs";

/**
 * This class provides a {@link foundry.utils.Collection} wrapper around a singleton embedded Document
 * so that it can be interacted with via a common interface.
 */
export default class SingletonEmbeddedCollection extends EmbeddedCollection {
  /** @inheritdoc */
  set(key, value) {
    if ( this.size && !this.has(key) ) {
      const embeddedName = this.documentClass.documentName;
      const parentName = this.model.documentName;
      throw new Error(`Cannot create singleton embedded ${embeddedName} [${key}] in parent ${parentName} `
        + `[${this.model.id}] as it already has one assigned.`);
    }
    return super.set(key, value);
  }

  /* -------------------------------------------- */

  /** @override */
  _set(key, value) {
    this.model._source[this.name] = value?._source ?? null;
  }

  /* -------------------------------------------- */

  /** @override */
  _delete(key) {
    this.model._source[this.name] = null;
  }
}

/** @module canvas */

/**
 * @import * as placeables from "./placeables/_module.mjs";
 */

export {default as Canvas} from "./board.mjs";
export {default as SceneManager} from "./scene-manager.mjs";
export {default as TextureLoader, getTexture, loadTexture, srcExists} from "./loader.mjs";
export {default as TextureExtractor} from "./texture-extractor.mjs";
export {default as FramebufferSnapshot} from "./framebuffer-snapshot.mjs";
export * as extensions from "./extensions/_module.mjs";
export * as sources from "./sources/_module.mjs";
export * as workers from "./workers/_module.mjs";
export * as containers from "./containers/_module.mjs";
export * as groups from "./groups/_module.mjs";
export * as layers from "./layers/_module.mjs";
export * as placeables from "./placeables/_module.mjs";
export * as primary from "./primary/_module.mjs";
export * as geometry from "./geometry/_module.mjs";
export * as interaction from "./interaction/_module.mjs";
export * as animation from "./animation/_module.mjs";
export * as rendering from "./rendering/_module.mjs";
export * as perception from "./perception/_module.mjs";

// Shim access to deprecated `tokens` property
const _tokens = {};
/**
 * @namespace
 * @deprecated since v13
 * @ignore
 * @see {@link foundry.canvas.placeables.tokens}
 */
export const tokens = new Proxy(_tokens, {
  get(_, prop) {
    foundry.utils.logCompatibilityWarning(
      'You are accessing "foundry.canvas.tokens" which is now namespaced under foundry.canvas.placeables.tokens',
      {since: 13, until: 15, once: true}
    );
    return foundry.canvas.placeables.tokens[prop];
  }
});

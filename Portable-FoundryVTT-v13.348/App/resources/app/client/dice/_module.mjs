/** @module dice */

/**
 * @import {RollParseNode} from "./_types.mjs";
 * @import {RollTermData} from "./terms/_types.mjs";
 */

export * as terms from "./terms/_module.mjs";
export * from "./_types.mjs";

import Parser from "./grammar.pegjs";
/** @type {{parse(formula: string): RollParseNode|RollTermData}} */
export const RollGrammar = Parser;

export {default as Roll} from "./roll.mjs";
export {default as RollParser} from "./parser.mjs";
export {default as MersenneTwister} from "./twister.mjs";

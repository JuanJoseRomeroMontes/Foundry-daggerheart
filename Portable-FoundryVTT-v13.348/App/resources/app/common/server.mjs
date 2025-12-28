/**
 * The Foundry Virtual Tabletop server-side ESModule entry point.
 * @module foundry
 */

/* ----------------------------------------- */
/*  Imports for JavaScript Usage             */
/* ----------------------------------------- */

import "./primitives/_module.mjs";
import * as CONST from "./constants.mjs";
import * as abstract from "./abstract/_module.mjs";
import * as data from "./data/_module.mjs";
import * as documents from "./documents/_module.mjs";
import * as packages from "./packages/_module.mjs";
import * as utils from "./utils/_module.mjs";
import * as config from "./config.mjs";
import * as grid from "./grid/_module.mjs";

/* ----------------------------------------- */
/*  Exports for ESModule and Typedoc Usage   */
/* ----------------------------------------- */

/**
 * Constant definitions used throughout the Foundry Virtual Tabletop framework.
 */
export * as CONST from "./constants.mjs";

/**
 * Abstract class definitions for fundamental concepts used throughout the Foundry Virtual Tabletop framework.
 */
export * as abstract from "./abstract/_module.mjs";

/**
 * Application configuration options
 */
export * as config from "./config.mjs";

/**
 * Data schema definitions for data models.
 */
export * as data from "./data/_module.mjs";

/**
 * Document definitions used throughout the Foundry Virtual Tabletop framework.
 */
export * as documents from "./documents/_module.mjs";

/**
 * Package data definitions, validations, and schema.
 */
export * as packages from "./packages/_module.mjs";

/**
 * Utility functions providing helpful functionality.
 */
export * as utils from "./utils/_module.mjs";

/**
 * Grid classes.
 */
export * as grid from "./grid/_module.mjs";

/* ----------------------------------------- */
/*  Server-Side Globals                      */
/* ----------------------------------------- */

globalThis.foundry = {
  CONST,
  abstract,
  data,
  utils,
  grid,
  documents,
  packages,
  config
};
globalThis.CONST = CONST;

// Specifically expose some global classes
Object.assign(globalThis, {
  Color: utils.Color,
  Collection: utils.Collection
});

// Immutable constants
for ( const c of Object.values(CONST) ) {
  Object.freeze(c);
}

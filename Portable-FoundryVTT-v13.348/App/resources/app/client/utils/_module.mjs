/** @module utils */

import {performIntegerSort} from "./helpers.mjs";

export * as types from "./_types.mjs";
export * from "@common/utils/_module.mjs";
export * from "./helpers.mjs";

/**
 * @deprecated since v13
 * @ignore
 */
export const SortingHelpers = {
  /**
   * Given a source object to sort, a target to sort relative to, and an Array of siblings in the container.
   * @param {...Parameters<performIntegerSort>} args
   * @deprecated since v13
   * @ignore
   */
  performIntegerSort(...args) {
    foundry.utils.logCompatibilityWarning("foundry.utils.SortingHelpers.performIntegerSort has been deprecated. Access "
      + "this helper at foundry.utils.performIntegerSort instead.", {since: 13, until: 15});
    return performIntegerSort(...args);
  }
};

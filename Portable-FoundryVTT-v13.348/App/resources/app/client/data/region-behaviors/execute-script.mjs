import RegionBehaviorType from "./base.mjs";
import * as fields from "../../../common/data/fields.mjs";
import {AsyncFunction} from "../../../common/utils/_module.mjs";

/**
 * @import {RegionEvent} from "@client/documents/_types.mjs";
 */

/**
 * The data model for a behavior that executes a script.
 *
 * @property {string} source    The source code of the script.
 */
export default class ExecuteScriptRegionBehaviorType extends RegionBehaviorType {

  /** @override */
  static LOCALIZATION_PREFIXES = ["BEHAVIOR.TYPES.executeScript", "BEHAVIOR.TYPES.base"];

  /* ---------------------------------------- */

  /** @override */
  static defineSchema() {
    return {
      events: this._createEventsField(),
      source: new fields.JavaScriptField({async: true, gmOnly: true})
    };
  }

  /* ---------------------------------------- */

  /** @override */
  async _handleRegionEvent(event) {
    try {
      // eslint-disable-next-line no-new-func
      const fn = new AsyncFunction("scene", "region", "behavior", "event", `{${this.source}\n}`);
      await fn.call(globalThis, this.scene, this.region, this.behavior, event);
    } catch(err) {
      console.error(err);
    }
  }
}


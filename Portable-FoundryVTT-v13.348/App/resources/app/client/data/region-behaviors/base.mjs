import TypeDataModel from "@common/abstract/type-data.mjs";
import * as fields from "@common/data/fields.mjs";

/**
 * @import {TokenMovementWaypoint} from "../../_types.mjs";
 * @import {RegionDocument, RegionBehavior, Scene} from "../../documents/_module.mjs";
 * @import {RegionEvent} from "@client/documents/_types.mjs";
 */

/**
 * The data model for a behavior that receives Region events.
 * @abstract
 *
 * @property {Set<string>} events    The Region events that are handled by the behavior.
 */
export default class RegionBehaviorType extends TypeDataModel {

  /**
   * Create the events field.
   * @param {object} options      Options which configure how the events field is declared
   * @param {string[]} [options.events]     The event names to restrict to.
   * @param {string[]} [options.initial]    The initial set of events that should be default for the field
   * @returns {fields.SetField}
   * @protected
   */
  static _createEventsField({events, initial}={}) {
    const setFieldOptions = {
      label: "BEHAVIOR.TYPES.base.FIELDS.events.label",
      hint: "BEHAVIOR.TYPES.base.FIELDS.events.hint"
    };
    if ( initial ) setFieldOptions.initial = initial;
    const field = new fields.SetField(new fields.StringField({
      required: true,
      choices: Object.values(CONST.REGION_EVENTS).concat(/** @deprecated since v13 */ ["behaviorStatus", "tokenMove", "tokenPreMove"])
        .reduce((obj, e) => {
          if ( events && !events.includes(e) ) return obj;
          obj[e] = `REGION.EVENTS.${e}.label`;
          return obj;
        }, {})
    }), setFieldOptions);
    field._toInput = function(config) {
      if ( !config.options ) {
        config.choices ??= this.element.choices;
        fields.StringField._prepareChoiceConfig(config);
      }
      /** @deprecated since v13 */
      config.options = config.options.filter(({value}) => (value !== "behaviorStatus") && (value !== "tokenMove") && (value !== "tokenPreMove"));
      return foundry.applications.fields.createMultiSelectInput(config);
    };
    return field;
  }

  /* ---------------------------------------- */

  /**
   * A RegionBehaviorType may register to always receive certain events by providing a record of handler functions.
   * These handlers are called with the behavior instance as its bound scope.
   * @type {Record<string, (this: RegionBehaviorType, event: RegionEvent) => Promise<void>>}
   */
  static events = {};

  /* ---------------------------------------- */

  /**
   * The events that are handled by the behavior.
   * @type {Set<string>}
   */
  events = this.events ?? new Set();

  /* ---------------------------------------- */

  /**
   * A convenience reference to the RegionBehavior which contains this behavior sub-type.
   * @type {RegionBehavior|null}
   */
  get behavior() {
    return this.parent;
  }

  /* ---------------------------------------- */

  /**
   * A convenience reference to the RegionDocument which contains this behavior sub-type.
   * @type {RegionDocument|null}
   */
  get region() {
    return this.behavior?.region ?? null;
  }

  /* ---------------------------------------- */

  /**
   * A convenience reference to the Scene which contains this behavior sub-type.
   * @type {Scene|null}
   */
  get scene() {
    return this.behavior?.scene ?? null;
  }

  /* ---------------------------------------- */

  /**
   * Handle the Region event.
   * @param {RegionEvent} event    The Region event
   * @returns {Promise<void>}
   * @protected
   */
  async _handleRegionEvent(event) {}

  /* ---------------------------------------- */

  /**
   * Get the terrain effects of this behavior for the movement of the given token.
   * This function is called only for behaviors that are not disabled.
   * The terrain data is created from the terrain effects
   * ({@link CONFIG.Token.movement.TerrainData.resolveTerrainEffects}).
   * Returns an empty array by default.
   * @template TerrainEffect
   * @param {TokenDocument} token    The token being or about to be moved within the region of this behavior
   * @param {Pick<TokenMovementWaypoint, "width"|"height"|"shape"|"action"> & {preview: boolean}} segment
   *                                 The segment data of the token's movement
   * @returns {TerrainEffect[]}      The terrain effects that apply to this token's movement
   * @protected
   */
  _getTerrainEffects(token, segment) {
    return [];
  }
}

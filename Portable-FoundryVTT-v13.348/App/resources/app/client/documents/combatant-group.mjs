import BaseCombatantGroup from "@common/documents/combatant-group.mjs";
import ClientDocumentMixin from "./abstract/client-document.mjs";

/**
 * @import Combatant from "./combatant.mjs";
 */

/**
 * The client-side CombatantGroup document which extends the common BaseCombatantGroup model.
 * @extends BaseCombatantGroup
 * @mixes ClientDocumentMixin
 * @category Documents
 *
 * @see {@link foundry.documents.Combat}: The Combat document which contains Combatant embedded documents
 */
export default class CombatantGroup extends ClientDocumentMixin(BaseCombatantGroup) {
  /**
   * A group is considered defeated if all its members are defeated, or it has no members.
   * @type {boolean}
   */
  defeated = this.defeated; // Workaround for subclass property instantiation issue.

  /**
   * A group is considered hidden if all its members are hidden, or it has no members.
   * @type {boolean}
   */
  hidden = this.hidden; // Workaround for subclass property instantiation issue.

  /**
   * The Combatant members of this group.
   * @type {Set<Combatant>}
   */
  members = this.members; // Workaround for subclass property instantiation issue.

  /* -------------------------------------------- */

  /** @inheritDoc */
  prepareBaseData() {
    super.prepareBaseData();
    this.hidden = true;
    this.defeated = true;
    if ( this.members ) this.members.clear();
    else this.members = new Set();
  }

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /**
   * Clear the movement history of all Tokens within this Combatant Group.
   * @returns {Promise<void>}
   */
  async clearMovementHistories() {
    await this.parent.clearMovementHistories(this.members);
  }
}

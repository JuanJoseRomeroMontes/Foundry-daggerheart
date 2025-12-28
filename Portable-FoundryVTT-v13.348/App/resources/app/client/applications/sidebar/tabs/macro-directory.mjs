import DocumentDirectory from "../document-directory.mjs";

/**
 * @import Macro from "@client/documents/macro.mjs";
 */

/**
 * The World Macro directory listing.
 * @extends {DocumentDirectory<Macro>}
 */
export default class MacroDirectory extends DocumentDirectory {
  /** @override */
  static DEFAULT_OPTIONS = {
    collection: "Macro"
  };

  /** @override */
  static tabName = "macros";
}

/**
 * @import {Document} from "@common/abstract/_module.mjs";
 * @import {EditorState} from "prosemirror-state";
 * @import {EditorView} from "prosemirror-view";
 * @import {MarkType, Node, NodeType} from "prosemirror-model";
 */

/**
 * @typedef ProseMirrorContentLinkOptions
 * @property {Document} [document]            The parent document housing this editor.
 * @property {boolean} [relativeLinks=false]  Whether to generate links relative to the parent document.
 */

/**
 * @typedef ProseMirrorMenuOptions
 * @property {Function} [onSave]        A function to call when the save button is pressed.
 * @property {boolean} [destroyOnSave]  Whether this editor instance is intended to be destroyed when saved.
 * @property {boolean} [compact]        Whether to display a more compact version of the menu.
 */

/**
 * @typedef ProseMirrorMenuItem
 * @property {string} action             A string identifier for this menu item.
 * @property {string} title              The description of the menu item.
 * @property {string} [class]            An optional class to apply to the menu item.
 * @property {string} [style]            An optional style to apply to the title text.
 * @property {string} [icon]             The menu item's icon HTML.
 * @property {MarkType} [mark]           The mark to apply to the selected text.
 * @property {NodeType} [node]           The node to wrap the selected text in.
 * @property {object} [attrs]            An object of attributes for the node or mark.
 * @property {number} [group]            Entries with the same group number will be grouped together in the drop-down.
 *                                       Lower-numbered groups appear higher in the list.
 * @property {number} [priority]         A numeric priority which determines whether this item is displayed as the
 *                                       dropdown title. Lower priority takes precedence.
 * @property {ProseMirrorCommand} [cmd]  The command to run when the menu item is clicked.
 * @property {boolean} [active=false]    Whether the current item is active under the given selection or cursor.
 */

/**
 * @typedef _ProseMirrorDropDownEntry
 * @property {ProseMirrorDropDownEntry[]} [children]  Any child entries.
 */

/**
 * @typedef {ProseMirrorMenuItem & _ProseMirrorDropDownEntry} ProseMirrorDropDownEntry
 */

/**
 * @typedef ProseMirrorDropDownConfig
 * @property {string} title                        The default title of the drop-down.
 * @property {string} cssClass                     The menu CSS class.
 * @property {string} [icon]                       An optional icon to use instead of a text label.
 * @property {ProseMirrorDropDownEntry[]} entries  The drop-down entries.
 */

/**
 * @callback ProseMirrorCommand
 * @param {EditorState} state               The current editor state.
 * @param {Function} dispatch               A function to dispatch a transaction.
 * @param {EditorView} view                 Escape-hatch for when the command needs to interact directly with the UI.
 * @returns {boolean}                       Whether the command has performed any action and consumed the event.
 */

/**
 * @callback MenuToggleBlockWrapCommand
 * @param {NodeType} node   The node to wrap the selection in.
 * @param {object} [attrs]  Attributes for the node.
 * @returns {ProseMirrorCommand}
 */

/**
 * @callback ProseMirrorNodeOutput
 * @param {Node} node        The ProseMirror node.
 * @returns {DOMOutputSpec}  The specification to build a DOM node for this ProseMirror node.
 */

/**
 * @callback ProseMirrorMarkOutput
 * @param {Mark} mark        The ProseMirror mark.
 * @param {boolean} inline   Is the mark appearing in an inline context?
 * @returns {DOMOutputSpec}  The specification to build a DOM node for this ProseMirror mark.
 */

/**
 * @callback ProseMirrorSliceTransformer
 * @param {Node} node    The candidate node.
 * @returns {Node|void}  A new node to replace the candidate node, or nothing if a replacement should not be made.
 */

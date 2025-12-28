import {Schema} from "prosemirror-model";
import {splitListItem} from "prosemirror-schema-list";
import {
  paragraph, blockquote, hr as horizontal_rule, heading, pre as code_block, br as hard_break
} from "./schema/core.mjs";
import {ol as ordered_list, ul as bullet_list, li as list_item, liText as list_item_text} from "./schema/lists.mjs";
import{
  builtInTableNodes, tableComplex as table_complex, colgroup, col, thead, tbody, tfoot, caption,
  captionBlock as caption_block, tableRowComplex as table_row_complex, tableCellComplex as table_cell_complex,
  tableCellComplexBlock as table_cell_complex_block, tableHeaderComplex as table_header_complex,
  tableHeaderComplexBlock as table_header_complex_block
} from "./schema/tables.mjs";
import {
  details, summary, summaryBlock as summary_block, dl, dt, dd, fieldset, legend, picture, audio, video, track, source,
  object, figure, figcaption, small, ruby, rp, rt, iframe
} from "./schema/other.mjs"
import {
  superscript, subscript, span, font, em, strong, underline, strikethrough, code
} from "./schema/marks.mjs";
import ImageNode from "./schema/image-node.mjs";
import LinkMark from "./schema/link-mark.mjs";
import ImageLinkNode from "./schema/image-link-node.mjs";
import SecretNode from "./schema/secret-node.mjs";
import AttributeCapture from "./schema/attribute-capture.mjs";

const doc = {
  content: "block+"
};

const text = {
  group: "inline"
};

const secret = SecretNode.make();
const link = LinkMark.make();
const image = ImageNode.make();
const imageLink = ImageLinkNode.make();

export const nodes = {
  // Core Nodes.
  doc, text, paragraph, blockquote, secret, horizontal_rule, heading, code_block, image_link: imageLink, image,
  hard_break,

  // Lists.
  ordered_list, bullet_list, list_item, list_item_text,

  // Tables
  table_complex, tbody, thead, tfoot, caption, caption_block, colgroup, col, table_row_complex, table_cell_complex,
  table_header_complex, table_cell_complex_block, table_header_complex_block,
  ...builtInTableNodes,

  // Misc.
  details, summary, summary_block, dl, dt, dd, fieldset, legend, picture, audio, video, track, source, object, figure,
  figcaption, small, ruby, rp, rt, iframe
};

export const marks = {superscript, subscript, span, font, link, em, strong, underline, strikethrough, code};

// Auto-generated specifications for HTML preservation.
["header", "main", "section", "article", "aside", "nav", "footer", "div", "address"].forEach(tag => {
  nodes[tag] = {
    content: "block+",
    group: "block",
    defining: true,
    parseDOM: [{tag}],
    toDOM: () => [tag, 0]
  };
});

["abbr", "cite", "mark", "q", "time", "ins"].forEach(tag => {
  marks[tag] = {
    parseDOM: [{tag}],
    toDOM: () => [tag, 0]
  };
});

const all = Object.values(nodes).concat(Object.values(marks));
const capture = new AttributeCapture();
all.forEach(capture.attributeCapture.bind(capture));

export const schema = new Schema({nodes, marks});

/* -------------------------------------------- */
/*  Handlers                                    */
/* -------------------------------------------- */

schema.nodes.list_item.split = splitListItem(schema.nodes.list_item);
schema.nodes.secret.split = SecretNode.split;
schema.marks.link.onClick = LinkMark.onClick;
schema.nodes.image_link.onClick = ImageLinkNode.onClick;

import {tableNodes} from "prosemirror-tables";
import {isElementEmpty, onlyInlineContent} from "./utils.mjs";

const CELL_ATTRS = {
  colspan: {default: 1},
  rowspan: {default: 1},
  colwidth: {default: null}
};

const MANAGED_CELL_ATTRS = {
  attributes: ["colspan", "rowspan", "data-colwidth"]
};

// If any of these elements are part of a table, consider it a 'complex' table and do not attempt to make it editable.
const COMPLEX_TABLE_ELEMENTS = new Set(["CAPTION", "COLGROUP", "THEAD", "TFOOT"]);

/* -------------------------------------------- */
/*  Utilities                                   */
/* -------------------------------------------- */

/**
 * Determine node attributes for a table cell when parsing the DOM.
 * @param {HTMLTableCellElement} cell  The table cell DOM node.
 * @returns {{colspan: number, rowspan: number}}
 */
function getTableCellAttrs(cell) {
  const colspan = cell.getAttribute("colspan") || 1;
  const rowspan = cell.getAttribute("rowspan") || 1;
  return {
    colspan: Number(colspan),
    rowspan: Number(rowspan)
  };
}

/**
 * Determine the HTML attributes to be set on the table cell DOM node based on its ProseMirror node attributes.
 * @param {Node} node  The table cell ProseMirror node.
 * @returns {object}   An object of attribute name -> attribute value.
 */
function setTableCellAttrs(node) {
  const attrs = {};
  const {colspan, rowspan} = node.attrs;
  if ( colspan !== 1 ) attrs.colspan = colspan;
  if ( rowspan !== 1 ) attrs.rowspan = rowspan;
  return attrs;
}

/**
 * Whether this element exists as part of a 'complex' table.
 * @param {HTMLElement} el  The element to test.
 * @returns {boolean|void}
 */
function inComplexTable(el) {
  const table = el.closest("table");
  if ( !table ) return;
  return Array.from(table.children).some(child => COMPLEX_TABLE_ELEMENTS.has(child.tagName));
}

/* -------------------------------------------- */
/*  Built-in Tables                             */
/* -------------------------------------------- */

export const builtInTableNodes = tableNodes({
  tableGroup: "block",
  cellContent: "block+"
});

/* -------------------------------------------- */
/*  'Complex' Tables                            */
/* -------------------------------------------- */

export const tableComplex = {
  content: "(caption | caption_block)? colgroup? thead? tbody tfoot?",
  isolating: true,
  group: "block",
  parseDOM: [{tag: "table", getAttrs: el => {
      if ( inComplexTable(el) === false ) return false;
    }}],
  toDOM: () => ["table", 0]
};

/* -------------------------------------------- */

export const colgroup = {
  content: "col*",
  isolating: true,
  parseDOM: [{tag: "colgroup"}],
  toDOM: () => ["colgroup", 0]
};

/* -------------------------------------------- */

export const col = {
  tableRole: "col",
  parseDOM: [{tag: "col"}],
  toDOM: () => ["col"]
};

/* -------------------------------------------- */

export const thead = {
  content: "table_row_complex+",
  isolating: true,
  parseDOM: [{tag: "thead"}],
  toDOM: () => ["thead", 0]
};

/* -------------------------------------------- */

export const tbody = {
  content: "table_row_complex+",
  isolating: true,
  parseDOM: [{tag: "tbody", getAttrs: el => {
      if ( inComplexTable(el) === false ) return false;
    }}],
  toDOM: () => ["tbody", 0]
};

/* -------------------------------------------- */

export const tfoot = {
  content: "table_row_complex+",
  isolating: true,
  parseDOM: [{tag: "tfoot"}],
  toDOM: () => ["tfoot", 0]
};

/* -------------------------------------------- */

export const caption = {
  content: "text*",
  isolating: true,
  parseDOM: [{tag: "caption", getAttrs: el => {
      if ( !isElementEmpty(el) && !onlyInlineContent(el) ) return false;
    }}],
  toDOM: () => ["caption", 0]
};

/* -------------------------------------------- */

export const captionBlock = {
  content: "block*",
  isolating: true,
  parseDOM: [{tag: "caption", getAttrs: el => {
      if ( isElementEmpty(el) || onlyInlineContent(el) ) return false;
    }}],
  toDOM: () => ["caption", 0]
};

/* -------------------------------------------- */

export const tableRowComplex = {
  content: "(table_cell_complex | table_header_complex | table_cell_complex_block | table_header_complex_block)*",
  parseDOM: [{tag: "tr", getAttrs: el => {
      if ( inComplexTable(el) === false ) return false;
    }}],
  toDOM: () => ["tr", 0]
};

/* -------------------------------------------- */

export const tableCellComplex = {
  content: "text*",
  attrs: CELL_ATTRS,
  managed: MANAGED_CELL_ATTRS,
  isolating: true,
  parseDOM: [{tag: "td", getAttrs: el => {
      if ( inComplexTable(el) === false ) return false;
      if ( !isElementEmpty(el) && !onlyInlineContent(el) ) return false;
      return getTableCellAttrs(el);
    }}],
  toDOM: node => ["td", setTableCellAttrs(node), 0]
};

/* -------------------------------------------- */

export const tableCellComplexBlock = {
  content: "block*",
  attrs: CELL_ATTRS,
  managed: MANAGED_CELL_ATTRS,
  isolating: true,
  parseDOM: [{tag: "td", getAttrs: el => {
      if ( inComplexTable(el) === false ) return false;
      if ( isElementEmpty(el) || onlyInlineContent(el) ) return false;
      return getTableCellAttrs(el);
    }}],
  toDOM: node => ["td", setTableCellAttrs(node), 0]
};

/* -------------------------------------------- */

export const tableHeaderComplex = {
  content: "text*",
  attrs: CELL_ATTRS,
  managed: MANAGED_CELL_ATTRS,
  isolating: true,
  parseDOM: [{tag: "th", getAttrs: el => {
      if ( inComplexTable(el) === false ) return false;
      if ( !isElementEmpty(el) && !onlyInlineContent(el) ) return false;
      return getTableCellAttrs(el);
    }}],
  toDOM: node => ["th", setTableCellAttrs(node), 0]
};

/* -------------------------------------------- */

export const tableHeaderComplexBlock = {
  content: "block*",
  attrs: CELL_ATTRS,
  managed: MANAGED_CELL_ATTRS,
  isolating: true,
  parseDOM: [{tag: "th", getAttrs: el => {
      if ( inComplexTable(el) === false ) return false;
      if ( isElementEmpty(el) || onlyInlineContent(el) ) return false;
      return getTableCellAttrs(el);
    }}],
  toDOM: node => ["th", setTableCellAttrs(node), 0]
};

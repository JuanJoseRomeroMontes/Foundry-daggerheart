export const em = {
  parseDOM: [{tag: "i"}, {tag: "em"}, {style: "font-style=italic"}],
  toDOM: () => ["em", 0]
};

/* -------------------------------------------- */

export const strong = {
  parseDOM: [
    {tag: "strong"},
    {tag: "b"},
    {style: "font-weight", getAttrs: weight => /^(bold(er)?|[5-9]\d{2})$/.test(weight) && null}
  ],
  toDOM: () => ["strong", 0]
};

/* -------------------------------------------- */

export const code = {
  parseDOM: [{tag: "code"}],
  toDOM: () => ["code", 0]
};

/* -------------------------------------------- */

export const underline = {
  parseDOM: [{tag: "u"}, {style: "text-decoration=underline"}],
  toDOM: () => ["span", {style: "text-decoration: underline;"}, 0]
};

/* -------------------------------------------- */

export const strikethrough = {
  parseDOM: [{tag: "s"}, {tag: "del"}, {style: "text-decoration=line-through"}],
  toDOM: () => ["s", 0]
};

/* -------------------------------------------- */

export const superscript = {
  parseDOM: [{tag: "sup"}, {style: "vertical-align=super"}],
  toDOM: () => ["sup", 0]
};

/* -------------------------------------------- */

export const subscript = {
  parseDOM: [{tag: "sub"}, {style: "vertical-align=sub"}],
  toDOM: () => ["sub", 0]
};

/* -------------------------------------------- */

export const span = {
  parseDOM: [{tag: "span", getAttrs: el => {
      if ( el.style.fontFamily ) return false;
      return {};
    }}],
  toDOM: () => ["span", 0]
};

/* -------------------------------------------- */

export const font = {
  attrs: {
    family: {}
  },
  parseDOM: [{tag: '*[style*="font-family:"]', getAttrs: el => ({ family: el.style.fontFamily })}],
  toDOM: node => ["span", {style: `font-family: ${node.attrs.family.replaceAll('"', "'")}`}]
};

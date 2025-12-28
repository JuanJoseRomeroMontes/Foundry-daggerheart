import {indentWithTab} from "@codemirror/commands";
import {html, htmlLanguage} from "@codemirror/lang-html";
import {esLint, javascript, javascriptLanguage} from "@codemirror/lang-javascript";
import {json, jsonLanguage, jsonParseLinter} from "@codemirror/lang-json";
import {HighlightStyle, indentUnit, syntaxHighlighting} from "@codemirror/language";
import {linter, lintGutter} from "@codemirror/lint";
import {markdown, markdownLanguage as gfMarkdown} from "@codemirror/lang-markdown";
import {keymap} from "@codemirror/view";
import {tags} from "@lezer/highlight";
import {basicSetup} from "codemirror";
import * as eslint from "eslint-linter-browserify";

/**
 * @import {Diagnostic} from "@codemirror/lint";
 * @import {Extension} from "@codemirror/state";
 * @import {EditorView} from "@codemirror/view";
 * @import {CodeMirrorLanguage} from "@common/data/_types.mjs";
 */

/**
 * CodeMirror language extensions
 * @type {Record<Exclude<CodeMirrorLanguage, "">, Extension[]>}
 */
export const LANGUAGES = {
  html: [basicSetup, html()],
  javascript: [
    basicSetup,
    javascript(),
    lintGutter(),
    linter(esLint(new eslint.Linter({configType: "flat"}), [
      {languageOptions: {ecmaVersion: 2023}},
      {
        processor: {
          preprocess: source => [`async () => {${source}\n}`], // Allow `await` and `return`
          postprocess: messages => messages.flat()
        }
      }
    ]))
  ],
  json: [basicSetup, json(), linter(jsonParseLinter())],
  markdown: [basicSetup, markdown({base: gfMarkdown, codeLanguages: name => {
    // "Fenced language" syntax highlighting; i.e., non-markdown languages in triple-backtick-delimited code blocks
    switch ( name ) {
      case "html":
        return htmlLanguage;
      case "js":
      case "javascript":
        return javascriptLanguage;
      case "json":
        return jsonLanguage;
      default:
        return null;
    }
  }})],
  plain: [basicSetup]
};

/**
 * CodeMirror HTML tag classes for parsed language tokens
 * @type {Extension}
 */
export const HIGHLIGHT_STYLE = syntaxHighlighting(HighlightStyle.define([
  // JS(ON)
  {tag: tags.keyword, class: "stx-keyword" },
  {tag: tags.comment, class: "stx-comment"},
  {tag: [tags.keyword, tags.operatorKeyword], class: "stx-keyword"},
  {tag: tags.operator, class: "stx-operator"},
  {tag: tags.brace, class: "stx-brace"},
  {tag: tags.paren, class: "stx-parenthesis"},
  {tag: tags.squareBracket, class: "stx-square-bracket"},
  {tag: tags.separator, class: "stx-separator"},
  {tag: [tags.function(tags.variableName), tags.definition(tags.function(tags.variableName))], class: "stx-func-name"},
  {tag: tags.function(tags.propertyName), class: "stx-method-name"},
  {tag: tags.definition(tags.variableName), class: "stx-var-name" },
  {tag: tags.local(tags.variableName), class: "stx-local-var"},
  {tag: tags.className, class: "stx-class-name"},
  {tag: tags.propertyName, class: "stx-prop-name"},
  {tag: tags.definition(tags.propertyName), class: "stx-prop-def"},
  {tag: tags.string, class: "stx-string"},
  {tag: tags.regexp, class: "stx-regexp" },
  {tag: tags.number, class: "stx-number"},
  {tag: tags.bool, class: "stx-boolean"},
  {tag: tags.invalid, class: "stx-invalid"},
  // HTML
  {tag: tags.angleBracket, class: "stx-angle-bracket"},
  {tag: tags.tagName, class: "stx-tag-name"},
  {tag: tags.attributeName, class: "stx-attr-name"},
  {tag: tags.attributeValue, class: "stx-attr-value"},
  // Markdown
  {tag: tags.meta, class: "stx-meta"},
  {tag: tags.contentSeparator, class: "stx-separator"},
  {tag: tags.heading, class: "stx-heading"},
  {tag: tags.link, class: "stx-link"},
  {tag: tags.url, class: "stx-url"},
  {tag: tags.emphasis, class: "stx-emphasis"},
  {tag: tags.strong, class: "stx-strong"},
  {tag: tags.strikethrough, class: "stx-strikethrough"},
  {tag: tags.list, class: "stx-list"},
  {tag: tags.quote, class: "stx-blockquote"},
  {tag: tags.monospace, class: "stx-codeblock"}
]));

/**
 * Configure extensions for managing indentation via keypress.
 * @param {number} spaces The number of spaces added/removed per press of TAB/SHIFT-TAB
 * @returns {Extension[]}
 */
export function configureIndentExtensions(spaces) {
  return spaces > 0 ? [indentUnit.of(" ".repeat(spaces)), keymap.of([indentWithTab])] : [];
}

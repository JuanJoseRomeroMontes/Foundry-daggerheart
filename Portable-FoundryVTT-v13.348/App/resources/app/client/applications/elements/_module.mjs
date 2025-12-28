/**
 * Custom HTMLElement implementations for use in template rendering.
 * @module elements
 */

import HTMLCodeMirrorElement from "./codemirror/element.mjs";
import HTMLDocumentTagsElement from "./document-tags.mjs";
import HTMLDocumentEmbedElement from "./document-embed.mjs";
import HTMLEnrichedContentElement from "./enriched-content.mjs";
import HTMLFilePickerElement from "./file-picker.mjs";
import HTMLHueSelectorSlider from "./hue-slider.mjs";
import {AbstractMultiSelectElement, HTMLMultiSelectElement, HTMLMultiCheckboxElement} from "./multi-select.mjs";
import HTMLSecretBlockElement from "./secret-block.mjs";
import HTMLStringTagsElement from "./string-tags.mjs";
import HTMLColorPickerElement from "./color-picker.mjs";
import HTMLRangePickerElement from "./range-picker.mjs";
import HTMLProseMirrorElement from "./prosemirror-editor.mjs";

export {default as AbstractFormInputElement} from "./form-element.mjs";
export {
  AbstractMultiSelectElement,
  HTMLCodeMirrorElement,
  HTMLColorPickerElement,
  HTMLDocumentEmbedElement,
  HTMLDocumentTagsElement,
  HTMLEnrichedContentElement,
  HTMLFilePickerElement,
  HTMLHueSelectorSlider,
  HTMLRangePickerElement,
  HTMLSecretBlockElement,
  HTMLStringTagsElement,
  HTMLProseMirrorElement,
  HTMLMultiSelectElement,
  HTMLMultiCheckboxElement
};

// Define custom elements
window.customElements.define(HTMLColorPickerElement.tagName, HTMLColorPickerElement);
window.customElements.define(HTMLCodeMirrorElement.tagName, HTMLCodeMirrorElement);
window.customElements.define(HTMLDocumentEmbedElement.tagName, HTMLDocumentEmbedElement);
window.customElements.define(HTMLDocumentTagsElement.tagName, HTMLDocumentTagsElement);
window.customElements.define(HTMLEnrichedContentElement.tagName, HTMLEnrichedContentElement);
window.customElements.define(HTMLFilePickerElement.tagName, HTMLFilePickerElement);
window.customElements.define(HTMLHueSelectorSlider.tagName, HTMLHueSelectorSlider);
window.customElements.define(HTMLMultiSelectElement.tagName, HTMLMultiSelectElement);
window.customElements.define(HTMLMultiCheckboxElement.tagName, HTMLMultiCheckboxElement);
window.customElements.define(HTMLRangePickerElement.tagName, HTMLRangePickerElement);
window.customElements.define(HTMLSecretBlockElement.tagName, HTMLSecretBlockElement);
window.customElements.define(HTMLStringTagsElement.tagName, HTMLStringTagsElement);
window.customElements.define(HTMLProseMirrorElement.tagName, HTMLProseMirrorElement);

import JournalEntryPageHandlebarsSheet from "./journal-entry-page-hbs-sheet.mjs";

/**
 * An Application responsible for displaying and editing a single pdf-type JournalEntryPage Document.
 * @extends JournalEntryPageHandlebarsSheet
 */
export default class JournalEntryPagePDFSheet extends JournalEntryPageHandlebarsSheet {
  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["pdf"],
    window: {
      icon: "fa-solid fa-file-pdf"
    }
  };

  /** @inheritDoc */
  static EDIT_PARTS = {
    header: super.EDIT_PARTS.header,
    content: {
      template: "templates/journal/pages/pdf/edit.hbs",
      classes: ["standard-form"]
    },
    footer: super.EDIT_PARTS.footer
  };

  /** @inheritDoc */
  static VIEW_PARTS = {
    content: {
      template: "templates/journal/pages/pdf/view.hbs",
      root: true
    }
  };

  /**
   * Maintain a cache of PDF sizes to avoid making HEAD requests every render.
   * @type {Record<string, number>}
   * @protected
   */
  static _sizes = {};

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContentContext(context, options) {
    await super._prepareContentContext(context, options);
    Object.assign(context, {
      src: this.page.src,
      srcInput: this.#createSourceInput.bind(this),
      params: this._getViewerParams()
    });
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onRender(context, options) {
    await super._onRender(context, options);
    const loadPDFButton = this.element.querySelector('[data-action="loadPDF"]');
    if ( loadPDFButton ) {
      loadPDFButton.disabled = !this.page.testUserPermission(game.user, "OBSERVER");
      loadPDFButton.addEventListener("click", this._onLoadPDF.bind(this));
    }
    const pdfLoader = this.element.querySelector(".load-pdf");
    if ( !this.isView || !pdfLoader ) return;
    let size = this.constructor._sizes[this.page.src];
    if ( size === undefined ) {
      try {
        const res = await fetch(this.page.src, {method: "HEAD"});
        this.constructor._sizes[this.page.src] = size = Number(res.headers.get("content-length"));
      } catch {}
    }
    if ( !isNaN(size) ) {
      const span = document.createElement("span");
      span.classList.add("hint");
      span.append(` (${foundry.utils.formatFileSize(size)})`);
      pdfLoader.querySelector("button").append(span);
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle a request to load a PDF.
   * @param {PointerEvent} event  The triggering event.
   * @protected
   */
  _onLoadPDF(event) {
    const target = event.currentTarget.parentElement;
    const frame = document.createElement("iframe");
    frame.src = `scripts/pdfjs/web/viewer.html?${this._getViewerParams()}`;
    target.replaceWith(frame);
  }

  /* -------------------------------------------- */

  /**
   * Marshall URL query parameters to pass to the PDF viewer.
   * @returns {URLSearchParams}
   * @protected
   */
  _getViewerParams() {
    const params = new URLSearchParams();
    if ( this.page.src ) {
      const src = URL.parseSafe(this.page.src) ? this.page.src : foundry.utils.getRoute(this.page.src);
      params.append("file", src);
    }
    return params;
  }

  /* -------------------------------------------- */

  /**
   * Create a FilePicker input for the PDF source field.
   * @param {DataField} field              The source field.
   * @param {FormInputConfig} inputConfig  The form input configuration.
   * @returns {HTMLFilePickerElement}
   */
  #createSourceInput(field, inputConfig) {
    return foundry.applications.elements.HTMLFilePickerElement.create({ type: "text", ...inputConfig });
  }
}

import {DocumentSheetV2, HandlebarsApplicationMixin} from "../api/_module.mjs";
import TextEditor from "../ux/text-editor.mjs";
import TableResultConfig from "./table-result-config.mjs";
import Hooks from "@client/helpers/hooks.mjs";

/**
 * @import {ApplicationClickAction} from "../_types.mjs";
 * @import RollTable from "@client/documents/roll-table.mjs";
 */

/**
 * The Application responsible for editing, displaying, and using a single {@link RollTable} document.
 * @extends DocumentSheetV2
 * @mixes HandlebarsApplication
 */
export default class RollTableSheet extends HandlebarsApplicationMixin(DocumentSheetV2) {

  /**
   * The operational mode in which a newly created instance of this sheet starts
   * @type {"edit"|"view"}
   */
  static #DEFAULT_MODE = "view";

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    classes: ["roll-table-sheet"],
    window: {
      contentClasses: ["standard-form"],
      icon: "fa-solid fa-table-list",
      resizable: true
    },
    position: {width: 720},
    form: {
      closeOnSubmit: false
    },
    actions: {
      // Edit mode:
      normalizeResults: RollTableSheet.#onNormalizeResults,
      createResult: RollTableSheet.#onCreateResult,
      openResultSheet: RollTableSheet.#onOpenResultSheet,
      deleteResult: RollTableSheet.#onDeleteResult,
      // View mode:
      drawSpecificResult: RollTableSheet.#onDrawSpecificResult,
      // Shared:
      changeMode: RollTableSheet.#onChangeMode,
      lockResult: RollTableSheet.#onLockResult,
      drawResult: RollTableSheet.#onDrawResult,
      resetResults: RollTableSheet.#onResetResults
    }
  };

  /** @override */
  static PARTS = {
    sheet: {
      template: "templates/sheets/roll-table/view.hbs",
      templates: ["templates/sheets/roll-table/result-details.hbs"],
      scrollable: ["table[data-results] tbody"],
      root: true
    },
    header: {template: "templates/sheets/roll-table/edit/header.hbs"},
    tabs: {template: "templates/generic/tab-navigation.hbs"},
    results: {
      template: "templates/sheets/roll-table/edit/results.hbs",
      templates: ["templates/sheets/roll-table/result-details.hbs"],
      scrollable: ["table[data-results] tbody"]
    },
    summary: {template: "templates/sheets/roll-table/edit/summary.hbs"},
    footer: {template: "templates/generic/form-footer.hbs"}
  };

  /**
   * Parts for each view
   */
  static MODE_PARTS = {
    edit: ["header", "tabs", "summary", "results", "footer"],
    view: ["sheet", "footer"]
  };

  /** @override */
  static TABS = {
    sheet: {
      tabs: [
        {id: "results", icon: "fa-solid fa-table-rows"},
        {id: "summary", icon: "fa-solid fa-memo-pad"}
      ],
      initial: "results",
      labelPrefix: "TABLE.TABS"
    }
  };

  /* -------------------------------------------- */

  /**
   * The operational mode of this sheet
   * @type {"edit"|"view"}
   */
  get mode() {
    return this.#mode;
  }

  /**
   * Change the operational mode of this sheet. Changing this value will also change the mode in which subsequent
   * RollTableSheet instances first render.
   * @param {"edit"|"view"} value
   */
  set mode(value) {
    this.#mode = RollTableSheet.#DEFAULT_MODE = value;
  }

  #mode = RollTableSheet.#DEFAULT_MODE;

  /**
   * Is the sheet in edit mode?
   * @type {boolean}
   */
  get isEditMode() {
    return this.#mode === "edit";
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _configureRenderOptions(options) {
    if ( !this.isEditable ) this.mode = "view";
    else if ( options.isFirstRender && !this.document.results.size ) this.mode = "edit";
    return super._configureRenderOptions(options);
  }

  /* -------------------------------------------- */

  /** @override */
  _configureRenderParts(options) {
    const parts = super._configureRenderParts(options);
    const allowedParts = this.constructor.MODE_PARTS[this.mode];
    for ( const partId in parts ) {
      if ( !allowedParts.includes(partId) ) delete parts[partId];
    }
    return parts;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _prepareTabs(group) {
    return this.isEditMode ? super._prepareTabs(group): {tabs: {}};
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    const {description, results, isOwner} = context.document;
    const getSortedResults = () => results.contents.sort(this._sortResults.bind(this));
    switch ( partId ) {
      case "results":
        context.tab = context.tabs.results;
        context.results = await Promise.all(getSortedResults().map(this._prepareResult.bind(this)));
        break;
      case "summary":
        context.tab = context.tabs.summary;
        context.descriptionHTML = await TextEditor.implementation.enrichHTML(description, {secrets: isOwner});
        context.formulaPlaceholder = `1d${results.size || 20}`;
        break;
      case "sheet": // Lone view-mode part
        context.descriptionHTML = await TextEditor.implementation.enrichHTML(description, {secrets: isOwner});
        context.formula = context.source.formula || `1d${results.size || 20}`;
        context.results = await Promise.all(getSortedResults().map(this._prepareResult.bind(this)));
        break;
      case "footer":
        context.buttons = [
          {
            type: "button",
            action: "resetResults",
            icon: "fa-solid fa-arrow-rotate-left",
            label: "TABLE.ACTIONS.ResetResults"
          },
          {
            type: "button",
            action: "drawResult",
            icon: "fa-solid fa-dice-d20",
            label: "TABLE.ACTIONS.DrawResult"
          }
        ];
        if ( this.isEditMode ) {
          context.buttons.unshift({
            type: "submit",
            icon: "fa-solid fa-floppy-disk",
            label: "TABLE.ACTIONS.Submit"
          });
        }
    }
    return context;
  }

  /* -------------------------------------------- */

  /**
   * Prepare sheet data for a single TableResult.
   * @param {TableResult} result    The result from which to prepare
   * @returns {Promise<object>}     The sheet data for this result
   * @protected
   */
  async _prepareResult(result) {

    // Show a single numeric value in view mode for zero-interval ranges
    const range = this.isEditMode
      ? [...result.range]
      : result.range[0] === result.range[1] ? result.range[0] : `${result.range[0]}–${result.range[1]}`;

    return {
      id: result.id,
      img: result.icon,
      name: result.name,
      description: await TextEditor.implementation.enrichHTML(result.description, {relativeTo: result,
        secrets: result.isOwner}),
      documentLink: result.documentToAnchor()?.outerHTML,
      weight: result.weight,
      range,
      drawn: result.drawn
    };
  }

  /* -------------------------------------------- */

  /**
   * Prepare the details HTML for a single result.
   * @param {TableResult} result
   * @returns {Promise<string>}
   * @protected
   */
  #getDetailsDisplay(result) {
    if ( !this.isEditMode ) return result.getHTML({collapsed: true});
    const name = result.name ? `<strong>${foundry.utils.escapeHTML(result.name)}</strong>` : "";
    const uuid = result.documentUuid ? `<div class="uuid">${result.documentUuid}</div>` : "";
    return [name, uuid].join(" ").trim();
  }

  /* -------------------------------------------- */

  /**
   * Compare a pair of results for sorted display in this sheet.
   * @param {object} resultA Sheet data for a result
   * @param {object} resultB Sheet data for a different result
   * @returns {number} A comparator return value expected by `Array#sort`
   * @protected
   */
  _sortResults(resultA, resultB) {
    return resultA.range[0] - resultB.range[0];
  }

  /* -------------------------------------------- */

  /**
   * Create a Table Result from initial data and with reasonable defaults.
   * @param {DeepPartial<TableResultData>} initialData
   * @protected
   */
  async _createResult(initialData={}) {
    // Get existing results
    const document = this.document;
    const results = foundry.utils.deepClone(document._source.results);
    const last = results.at(-1);

    // Get weight and range data
    const lastWeight = last?.weight ?? 1;
    const totalWeight = results.reduce((sum, r) => sum + r.weight, 0) || 1;
    const minRoll = results.length > 0 ? Math.min(...results.map(r => r.range[0])) : 0;
    const maxRoll = results.length > 0 ? Math.max(...results.map(r => r.range[1])) : 0;

    // Determine new starting range
    const spread = maxRoll - minRoll + 1;
    const perW = Math.round(spread / totalWeight);
    const range = [maxRoll + 1, maxRoll + Math.max(1, lastWeight * perW)];

    // Create the new Result
    const resultData = {
      type: last?.type ?? CONST.TABLE_RESULT_TYPES.TEXT,
      weight: lastWeight,
      range,
      ...initialData
    };
    await document.createEmbeddedDocuments("TableResult", [resultData], {renderSheet: false});
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _prepareSubmitData(event, form, formData, updateData) {
    const submitData = super._prepareSubmitData(event, form, formData, updateData);
    for (const result of submitData.results ?? []) {
      TableResultConfig.prepareResultUpdateData(result);
    }
    return submitData;
  }

  /** @inheritDoc */
  async submit(options) {
    if ( !this.isEditMode ) return;
    return super.submit(options);
  }

  /* -------------------------------------------- */
  /*  Life-Cycle Handlers                         */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async _preRender(context, options) {
    await super._preRender(context, options);

    // Wipe the window content after the first render and swap the mode CSS class
    if ( !options.isFirstRender && !this.element.classList.contains(`${this.mode}-mode`) ) {
      this.element.classList.toggle("edit-mode", this.isEditMode);
      this.element.classList.toggle("view-mode", !this.isEditMode);
      this.element.querySelector(".window-content").innerHTML = "";
    }
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onFirstRender(context, options) {
    this.element.classList.add(`${this.mode}-mode`);
    return super._onFirstRender(context, options);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onRender(context, options) {
    await super._onRender(context, options);

    // Drag and Drop
    new foundry.applications.ux.DragDrop.implementation({
      dropSelector: ".window-content",
      permissions: {
        dragstart: () => false,
        drop: () => this.isEditMode
      },
      callbacks: {
        drop: this._onDrop.bind(this)
      }
    }).bind(this.element);

    // Allow draws with replacement by observers even if the Table is not editable
    if ( !options.parts.includes("footer") ) return;
    const table = context.document;
    const drawButton = this.element.querySelector("button[data-action=drawResult]");
    if ( table.replacement && table.testUserPermission(game.user, "OBSERVER") ) {
      drawButton.disabled = false;
    }
    // Disallow draws without replacement from compendium Tables
    else if ( !table.replacement && table.pack ) {
      drawButton.disabled = true;
    }
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /** @override */
  _onRevealSecret(event) {
    const resultId = event.target.closest("[data-result-id]")?.dataset.resultId;
    if ( resultId ) {
      const result = this.document.results.get(resultId);
      if ( !result ) return;
      const modified = event.target.toggleRevealed(result.description);
      result.update({description: modified});
    } else {
      const modified = event.target.toggleRevealed(this.document.description);
      this.document.update({description: modified});
    }
  }

  /* -------------------------------------------- */

  /**
   * Create a Compendium or Document result from a dropped document.
   * @param {DragEvent} event The triggering drop event
   * @protected
   */
  async _onDrop(event) {
    const data = TextEditor.implementation.getDragEventData(event);
    const allowed = Hooks.call("dropRollTableSheetData", this.document, this, data);
    if ( allowed === false ) return;

    // Get the dropped document
    if ( !CONST.COMPENDIUM_DOCUMENT_TYPES.includes(data.type) ) return;
    const cls = foundry.utils.getDocumentClass(data.type);
    const document = await cls.fromDropData(data);
    if ( !document || document.isEmbedded ) return;
    if ( document === this.document ) {
      throw new Error(`${this.document.name} cannot have a result of itself.`);
    }

    // Delegate to the onCreate handler
    return this._createResult({
      name: document.name,
      img: document.img,
      type: CONST.TABLE_RESULT_TYPES.DOCUMENT,
      documentUuid: document.uuid
    });
  }

  /* -------------------------------------------- */

  /**
   * Alternate between view and edit modes.
   * @this {RollTableSheet}
   * @type {ApplicationClickAction}
   */
  static async #onChangeMode() {
    this.mode = this.isEditMode ? "view" : "edit";
    await this.render();
  }

  /* -------------------------------------------- */

  /**
   * Roll and draw a TableResult.
   * @this {RollTableSheet}
   * @type {ApplicationClickAction}
   */
  static async #onDrawResult(_event, button) {
    if ( this.form ) await this.submit({operation: {render: false}});
    button.disabled = true;
    const table = this.document;
    const tableRoll = await table.roll();
    const draws = table.getResultsForRoll(tableRoll.roll.total);
    if ( draws.length > 0 ) {
      if ( game.settings.get("core", "animateRollTable") ) await this._animateRoll(draws);
      await table.draw(tableRoll);
    }

    // Reenable the button if drawing with replacement since the draw won't trigger a sheet re-render
    if ( table.replacement ) button.disabled = false;
  }

  /* -------------------------------------------- */

  /**
   * Draw a single result without rolling.
   * @this {RollTableSheet}
   * @type {ApplicationClickAction}
   */
  static async #onDrawSpecificResult(event) {
    const resultId = event.target.closest("tr")?.dataset.resultId;
    const table = this.document;
    const result = table.results.get(resultId, {strict: true});
    await table.draw({results: [result]});
  }

  /* -------------------------------------------- */

  /**
   * Handle toggling the drawn status of the result in the table
   * @this {RollTableSheet}
   * @type {ApplicationClickAction}
   */
  static async #onLockResult(event) {
    if ( this.form ) await this.submit();
    const resultId = event.target.closest("tr")?.dataset.resultId;
    const result = this.document.results.get(resultId, {strict: true});
    await result.update({drawn: !result.drawn});
  }

  /* -------------------------------------------- */

  /**
   * Reset the drawn status of all TableResults.
   * @this {RollTableSheet}
   * @type {ApplicationClickAction}
   */
  static async #onResetResults() {
    await this.document.resetResults();
  }

  /* -------------------------------------------- */

  /**
   * Handle a button click to re-normalize dice result ranges across all RollTable results
   * @this {RollTableConfig}
   * @type {ApplicationClickAction}
   */
  static async #onNormalizeResults() {
    await this.submit();
    return this.document.normalize();
  }

  /* -------------------------------------------- */

  /**
   * Handle creating a TableResult in the RollTable document.
   * @this {RollTableConfig}
   * @type {ApplicationClickAction}
   */
  static async #onCreateResult() {
    await this.submit();
    await this._createResult();
  }

  /* -------------------------------------------- */

  /**
   * Handle toggling the drawn status of the result in the table
   * @this {RollTableConfig}
   * @type {ApplicationClickAction}
   */
  static async #onOpenResultSheet(event) {
    await this.submit();
    const resultId = event.target.closest("tr")?.dataset.resultId;
    const result = this.document.results.get(resultId, {strict: true});
    await result.sheet.render({force: true});
  }

  /* -------------------------------------------- */

  /**
   * Handle deletion of a TableResult in the RollTable document.
   * @this {RollTableConfig}
   * @type {ApplicationClickAction}
   */
  static async #onDeleteResult(event) {
    const resultId = event.target.closest("tr")?.dataset.resultId;
    await this.submit();
    const result = this.document.results.get(resultId, {strict: true});
    await result.delete();
  }

  /* -------------------------------------------- */
  /*  Result-Draw Animation                       */
  /* -------------------------------------------- */

  /**
   * Display a roulette style animation when a Roll Table result is drawn from the sheet.
   * @param {TableResult[]} results An Array of drawn table results to highlight
   * @returns {Promise<void>} A Promise that resolves once the animation is complete
   * @protected
   */
  async _animateRoll(results) {

    // Get the list of results and their indices
    const resultsList = this.element.querySelector("table[data-results] tbody");
    const drawnIds = new Set(results.map(r => r.id));
    const drawnItems = Array.from(resultsList.children).filter(li => drawnIds.has(li.dataset.resultId));

    // Set the animation timing
    const maxTime = 2000;
    const nResults = this.document.results.size;
    const nLoops = Math.min(Math.ceil(maxTime / (50 * nResults)), 4);
    const animTime = nLoops === 1 ? maxTime / nResults : 50;
    const animOffset = Math.round(resultsList.offsetHeight / (resultsList.children[0].offsetHeight * 2));

    // Animate the roulette
    await this._animateRoulette(resultsList, drawnIds, nLoops, animTime, animOffset);

    // Flash the results
    const flashes = drawnItems.map(li => this._flashResult(li));
    await Promise.all(flashes);
  }

  /* -------------------------------------------- */

  /**
   * Animate a "roulette" through the table until arriving at the final loop and a drawn result
   * @param {HTMLElement} resultsTable The list element being iterated
   * @param {Set<string>} drawnIds     The result IDs which have already been drawn
   * @param {number} nLoops            The number of times to loop through the animation
   * @param {number} animTime          The desired animation time in milliseconds
   * @param {number} animOffset        The desired pixel offset of the result within the list
   * @returns {Promise<void>} A Promise that resolves once the animation is complete
   * @protected
   */
  async _animateRoulette(resultsTable, drawnIds, nLoops, animTime, animOffset) {
    let loop = 0;
    let idx = 0;
    let item = null;
    return new Promise(resolve => {
      const animId = setInterval(() => {
        if (idx === 0) loop++;
        if (item) item.classList.remove("roulette");

        // Scroll to the next item
        item = resultsTable.children[idx];
        resultsTable.scrollTop = (idx - animOffset) * item.offsetHeight;

        // If we are on the final loop
        if ( (loop === nLoops) && drawnIds.has(item.dataset.resultId) ) {
          clearInterval(animId);
          return resolve();
        }

        // Continue the roulette and cycle the index
        item.classList.add("roulette");
        idx = idx < resultsTable.children.length - 1 ? idx + 1 : 0;
      }, animTime);
    });
  }

  /* -------------------------------------------- */

  /**
   * Display a flashing animation on the selected result to emphasize the draw
   * @param {HTMLElement} item The HTML li item of the winning result
   * @returns {Promise<void>} A Promise that resolves once the animation is complete
   * @protected
   */
  async _flashResult(item) {
    return new Promise(resolve => {
      let count = 0;
      const animId = setInterval(() => {
        if (count % 2) item.classList.remove("roulette");
        else item.classList.add("roulette");
        if (count === 7) {
          clearInterval(animId);
          resolve();
        }
        count++;
      }, 50);
    });
  }
}

/**
 * @callback SearchFilterCallback
 * @param {KeyboardEvent|null} event
 * @param {string} query
 * @param {RegExp} rgx
 * @param {HTMLElement} content
 * @returns {void}
 */

/**
 * @typedef SearchFilterConfiguration
 * Options which customize the behavior of the filter
 * @property {string} inputSelector    The CSS selector used to target the text input element.
 * @property {string} contentSelector  The CSS selector used to target the content container for these tabs.
 * @property {SearchFilterCallback} callback  A callback function which executes when the filter changes.
 * @property {string} [initial]        The initial value of the search query.
 * @property {number} [delay=200]      The number of milliseconds to wait for text input before processing.
 *                                     Default: `200`.
 */

/**
 * @typedef FieldFilter
 * @property {string} field                                     The dot-delimited path to the field being filtered
 * @property {string} [operator=SearchFilter.OPERATORS.EQUALS]  The search operator, from CONST.OPERATORS
 * @property {boolean} negate                                   Negate the filter, returning results which do NOT match
 *                                                              the filter criteria
 * @property {*} value                                          The value against which to test
 */

/**
 * A controller class for managing a text input widget that filters the contents of some other UI element.
 */
export default class SearchFilter {
  /**
   * @param {SearchFilterConfiguration} config     Configuration object for initializing the SearchFilter.
   */
  constructor(config={}) {
    const {
      inputSelector,
      contentSelector,
      initial = "",
      callback,
      delay = 200
    } = config;

    /**
     * The value of the current query string
     * @type {string}
     */
    this.query = initial;

    /**
     * A callback function to trigger when the tab is changed
     * @type {SearchFilterCallback|null}
     */
    this.callback = callback;

    this.#inputSelector = inputSelector;
    this.#contentSelector = contentSelector;
    this.#filter = foundry.utils.debounce(this.callback, delay);
  }

  /* -------------------------------------------- */

  /**
   * The CSS selector used to target the tab navigation element
   * @type {string}
   */
  #inputSelector;

  /* -------------------------------------------- */

  /**
   * The CSS selector used to target the tab content element
   * @type {string}
   */
  #contentSelector;

  /* -------------------------------------------- */

  /**
   * A debounced function which applies the search filtering.
   * Average typing speed is 167 ms per character, per https://stackoverflow.com/a/4098779
   * @type {SearchFilterCallback}
   */
  #filter;

  /* -------------------------------------------- */

  /**
   * The allowed Filter Operators which can be used to define a search filter
   * @enum {string}
   */
  static OPERATORS = Object.freeze({
    EQUALS: "equals",
    CONTAINS: "contains",
    STARTS_WITH: "starts_with",
    ENDS_WITH: "ends_with",
    LESS_THAN: "lt",
    LESS_THAN_EQUAL: "lte",
    GREATER_THAN: "gt",
    GREATER_THAN_EQUAL: "gte",
    BETWEEN: "between",
    IS_EMPTY: "is_empty"
  });

  /* -------------------------------------------- */

  /**
   * The regular expression corresponding to the query that should be matched against
   * @type {RegExp}
   */
  rgx;

  /**
   * A reference to the HTML navigation element the tab controller is bound to
   * @type {HTMLElement|null}
   * @internal
   */
  _input = null;

  /**
   * A reference to the HTML container element of the tab content
   * @type {HTMLElement|null}
   */
  #content = null;

  /* -------------------------------------------- */

  /**
   * Bind the SearchFilter controller to an HTML application
   * @param {HTMLElement} html
   */
  bind(html) {

    // Identify navigation element
    this._input = html.querySelector(this.#inputSelector);
    if ( !this._input ) return;
    this._input.value = this.query;

    // Identify content container
    if ( !this.#contentSelector ) this.#content = null;
    else if ( html.matches(this.#contentSelector) ) this.#content = html;
    else this.#content = html.querySelector(this.#contentSelector);

    // Register the handler for input changes
    // Use the input event which also captures clearing the filter
    // https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/input_event
    this._input.addEventListener("input", event => {
      event.preventDefault();
      this.filter(event, event.currentTarget.value);
    });

    // Apply the initial filtering conditions
    const event = new KeyboardEvent("input", {key: "Enter", code: "Enter"});
    this.filter(event, this.query);
  }

  /* -------------------------------------------- */

  /**
   * Release all bound HTML elements and reset the query.
   */
  unbind() {
    this._input = null;
    this.#content = null;
    this.query = "";
  }

  /* -------------------------------------------- */

  /**
   * Perform a filtering of the content by invoking the callback function
   * @param {KeyboardEvent|null} event The triggering keyboard event
   * @param {string} query             The input search string
   */
  filter(event, query) {
    if ( this._input ) this._input.value = query;
    this.query = SearchFilter.cleanQuery(query);
    this.rgx = new RegExp(RegExp.escape(this.query), "i");
    this.#filter(event, this.query, this.rgx, this.#content);
  }

  /* -------------------------------------------- */

  /**
   * Clean a query term to standardize it for matching.
   * See https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/normalize
   * @param {string} query    An input string which may contain leading/trailing spaces or diacritics
   * @returns {string}        A cleaned string of ASCII characters for comparison
   */
  static cleanQuery(query) {
    return query.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  /* -------------------------------------------- */

  /**
   * A helper method to test a value against a precomposed regex pattern.
   * @param {RegExp} rgx        The regular expression to test
   * @param {string} value      The value to test against
   * @returns {boolean}         Does the query match?
   */
  static testQuery(rgx, value) {
    return rgx.test(foundry.applications.ux.SearchFilter.cleanQuery(value));
  }

  /* -------------------------------------------- */

  /**
   * Test whether a given object matches a provided filter
   * @param {object} obj          An object to test against
   * @param {FieldFilter} filter  The filter to test
   * @returns {boolean}           Whether the object matches the filter
   */
  static evaluateFilter(obj, filter) {
    const docValue = foundry.utils.getProperty(obj, filter.field);
    const filterValue = filter.value;

    const evaluate = () => {
      switch (filter.operator) {
        case SearchFilter.OPERATORS.EQUALS:
          if ( docValue.equals instanceof Function ) return docValue.equals(filterValue);
          else return (docValue === filterValue);
        case SearchFilter.OPERATORS.CONTAINS:
          return Array.isArray(filterValue) ? filterValue.includes(docValue) : [filterValue].includes(docValue);
        case SearchFilter.OPERATORS.STARTS_WITH:
          return docValue.startsWith(filterValue);
        case SearchFilter.OPERATORS.ENDS_WITH:
          return docValue.endsWith(filterValue);
        case SearchFilter.OPERATORS.LESS_THAN:
          return (docValue < filterValue);
        case SearchFilter.OPERATORS.LESS_THAN_EQUAL:
          return (docValue <= filterValue);
        case SearchFilter.OPERATORS.GREATER_THAN:
          return (docValue > filterValue);
        case SearchFilter.OPERATORS.GREATER_THAN_EQUAL:
          return (docValue >= filterValue);
        case SearchFilter.OPERATORS.BETWEEN: {
          if ( !Array.isArray(filterValue) || filterValue.length !== 2 ) {
            throw new Error(`Invalid filter value for ${filter.operator} operator. Expected an array of length 2.`);
          }
          const [min, max] = filterValue;
          return (docValue >= min) && (docValue <= max);
        }
        case SearchFilter.OPERATORS.IS_EMPTY:
          return foundry.utils.isEmpty(docValue);
        default:
          return (docValue === filterValue);
      }
    };
    const result = evaluate();
    return filter.negate ? !result : result;
  }
}

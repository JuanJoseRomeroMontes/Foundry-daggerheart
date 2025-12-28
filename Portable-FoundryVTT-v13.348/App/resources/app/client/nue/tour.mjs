/**
 * @import {TooltipDirection} from "@client/helpers/interaction/tooltip-manager.mjs";
 */

/**
 * @typedef TourStep                          A step in a Tour
 * @property {string} id                      A machine-friendly id of the Tour Step
 * @property {string} title                   The title of the step, displayed in the tooltip header
 * @property {string} content                 Raw HTML content displayed during the step
 * @property {string} [selector]              A DOM selector which denotes an element to highlight during this step.
 *                                            If omitted, the step is displayed in the center of the screen.
 * @property {TooltipDirection} [tooltipDirection]  How the tooltip for the step should be displayed
 *                                            relative to the target element. If omitted, the best direction will
 *                                            be attempted to be auto-selected.
 * @property {boolean} [restricted]           Whether the Step is restricted to the GM only. Defaults to false.
 * @property {string} [sidebarTab]            Activates a particular sidebar tab. Usable in `SidebarTour` instances.
 * @property {string} [layer]                 Activates a particular canvas layer and its respective control group.
 *                                            Usable in `CanvasTour` instances.
 * @property {string} [tool]                  Activates a particular tool. Usable in `CanvasTour` instances.
 */

/**
 * @typedef TourConfig                        Tour configuration data
 * @property {string} namespace               The namespace this Tour belongs to. Typically, the name of the package
 *                                            which implements the tour should be used
 * @property {string} id                      A machine-friendly id of the Tour, must be unique within the provided
 *                                            namespace
 * @property {string} title                   A human-readable name for this Tour. Localized.
 * @property {TourStep[]} steps               The list of Tour Steps
 * @property {string} [description]           A human-readable description of this Tour. Localized.
 * @property {object} [localization]          A map of localizations for the Tour that should be merged into the
 *                                            default localizations
 * @property {boolean} [restricted]           Whether the Tour is restricted to the GM only. Defaults to false.
 * @property {boolean} [display]              Whether the Tour should be displayed in the Manage Tours UI. Defaults
 *                                            to false.
 * @property {boolean} [canBeResumed]         Whether the Tour can be resumed or if it always needs to start from the
 *                                            beginning. Defaults to false.
 * @property {string[]} [suggestedNextTours]  A list of namespaced Tours that might be suggested to the user when this
 *                                            Tour is completed. The first non-completed Tour in the array will be
 *                                            recommended.
 */

/**
 * A Tour that shows a series of guided steps.
 */
export default class Tour {
  /**
   * Construct a Tour by providing a configuration.
   * @param {TourConfig} config           The configuration of the Tour
   * @param {object} [options]            Additional options for configuring the tour
   * @param {string} [options.id]           A tour ID that supercedes TourConfig#id
   * @param {string} [options.namespace]    A tour namespace that supercedes TourConfig#namespace
   */
  constructor(config, {id, namespace}={}) {
    this.config = foundry.utils.deepClone(config);
    if ( this.config.localization ) foundry.utils.mergeObject(game.i18n._fallback, this.config.localization);
    this.#id = id ?? config.id;
    this.#namespace = namespace ?? config.namespace;
    this.#stepIndex = this.#loadProgress();
  }

  /**
   * A singleton reference which tracks the currently active Tour.
   * @type {Tour|null}
   */
  static #activeTour = null;

  static STATUS = Object.freeze({
    UNSTARTED: "unstarted",
    IN_PROGRESS: "in-progress",
    COMPLETED: "completed"
  });

  /**
   * Indicates if a Tour is currently in progress.
   * @returns {boolean}
   */
  static get tourInProgress() {
    return !!Tour.#activeTour;
  }

  /**
   * Returns the active Tour, if any
   * @returns {Tour|null}
   */
  static get activeTour() {
    return Tour.#activeTour;
  }

  /* -------------------------------------------- */

  /**
   * Handle a movement action to either progress or regress the Tour.
   * @param {string[]} movementDirections           The Directions being moved in
   * @returns {true|void}
   */
  static onMovementAction(movementDirections) {
    const ClientKeybindings = foundry.helpers.interaction.ClientKeybindings;
    if ( (movementDirections.includes(ClientKeybindings.MOVEMENT_DIRECTIONS.RIGHT))
      && (Tour.activeTour.hasNext) ) {
      Tour.activeTour.next();
      return true;
    }
    else if ( (movementDirections.includes(ClientKeybindings.MOVEMENT_DIRECTIONS.LEFT))
      && (Tour.activeTour.hasPrevious) ) {
      Tour.activeTour.previous();
      return true;
    }
  }

  /**
   * Configuration of the tour. This object is cloned to avoid mutating the original configuration.
   * @type {TourConfig}
   */
  config;

  /**
   * The HTMLElement which is the focus of the current tour step.
   * @type {HTMLElement}
   */
  targetElement;

  /**
   * The HTMLElement that fades out the rest of the screen
   * @type {HTMLElement}
   */
  fadeElement;

  /**
   * The HTMLElement that blocks input while a Tour is active
   */
  overlayElement;

  /**
   * Padding around a Highlighted Element
   * @type {number}
   */
  static HIGHLIGHT_PADDING = 10;

  /**
   * The unique identifier of the tour.
   * @type {string}
   */
  get id() {
    return this.#id;
  }

  set id(value) {
    if ( this.#id ) throw new Error("The Tour has already been assigned an ID");
    this.#id = value;
  }

  #id;

  /**
   * The human-readable title for the tour.
   * @type {string}
   */
  get title() {
    return game.i18n.localize(this.config.title);
  }

  /**
   * The human-readable description of the tour.
   * @type {string}
   */
  get description() {
    return game.i18n.localize(this.config.description);
  }

  /**
   * The package namespace for the tour.
   * @type {string}
   */
  get namespace() {
    return this.#namespace;
  }

  set namespace(value) {
    if ( this.#namespace ) throw new Error("The Tour has already been assigned a namespace");
    this.#namespace = value;
  }

  #namespace;

  /**
   * The key the Tour is stored under in game.tours, of the form `${namespace}.${id}`
   * @returns {string}
   */
  get key() {
    return `${this.#namespace}.${this.#id}`;
  }

  /**
   * The configuration of tour steps
   * @type {TourStep[]}
   */
  get steps() {
    return this.config.steps.filter(step => !step.restricted || game.user.isGM);
  }

  /**
   * Return the current Step, or null if the tour has not yet started.
   * @type {TourStep|null}
   */
  get currentStep() {
    return this.steps[this.#stepIndex] ?? null;
  }

  /**
   * The index of the current step; -1 if the tour has not yet started, or null if the tour is finished.
   * @type {number|null}
   */
  get stepIndex() {
    return this.#stepIndex;
  }

  #stepIndex = -1;

  /**
   * Returns True if there is a next TourStep
   * @type {boolean}
   */
  get hasNext() {
    return this.#stepIndex < this.steps.length - 1;
  }

  /**
   * Returns True if there is a previous TourStep
   * @type {boolean}
   */
  get hasPrevious() {
    return this.#stepIndex > 0;
  }

  /**
   * Return whether this Tour is currently eligible to be started?
   * This is useful for tours which can only be used in certain circumstances, like if the canvas is active.
   * @type {boolean}
   */
  get canStart() {
    return true;
  }

  /**
   * The current status of the Tour
   * @returns {TourStatus}
   */
  get status() {
    if ( this.#stepIndex === -1 ) return Tour.STATUS.UNSTARTED;
    else if (this.#stepIndex === this.steps.length) return Tour.STATUS.COMPLETED;
    else return Tour.STATUS.IN_PROGRESS;
  }

  /* -------------------------------------------- */
  /*  Tour Methods                                */
  /* -------------------------------------------- */

  /**
   * Advance the tour to a completed state.
   */
  async complete() {
    return this.progress(this.steps.length);
  }

  /* -------------------------------------------- */

  /**
   * Exit the tour at the current step.
   */
  exit() {
    if ( this.currentStep ) this._postStep();
    Tour.#activeTour = null;
  }

  /* -------------------------------------------- */

  /**
   * Reset the Tour to an un-started state.
   */
  async reset() {
    return this.progress(-1);
  }

  /* -------------------------------------------- */

  /**
   * Start the Tour at its current step, or at the beginning if the tour has not yet been started.
   */
  async start() {
    game.tooltip.clearPending();
    switch ( this.status ) {
      case Tour.STATUS.IN_PROGRESS:
        return this.progress((this.config.canBeResumed && this.hasPrevious) ? this.#stepIndex : 0);
      case Tour.STATUS.UNSTARTED:
      case Tour.STATUS.COMPLETED:
        return this.progress(0);
    }
  }

  /* -------------------------------------------- */

  /**
   * Progress the Tour to the next step.
   */
  async next() {
    if ( this.status === Tour.STATUS.COMPLETED ) {
      throw new Error(`Tour ${this.id} has already been completed`);
    }
    if ( !this.hasNext ) return this.complete();
    return this.progress(this.#stepIndex + 1);
  }

  /* -------------------------------------------- */

  /**
   * Rewind the Tour to the previous step.
   */
  async previous() {
    if ( !this.hasPrevious ) return;
    return this.progress(this.#stepIndex - 1);
  }

  /* -------------------------------------------- */

  /**
   * Progresses to a given Step
   * @param {number} stepIndex  The step to progress to
   */
  async progress(stepIndex) {

    // Ensure we are provided a valid tour step
    if ( !Number.between(stepIndex, -1, this.steps.length) ) {
      throw new Error(`Step index ${stepIndex} is not valid for Tour ${this.id} with ${this.steps.length} steps.`);
    }

    // Ensure that only one Tour is active at a given time
    if ( Tour.#activeTour && (Tour.#activeTour !== this) ) {
      if ( (stepIndex !== -1) && (stepIndex !== this.steps.length) ) throw new Error(`You cannot begin the ${this.title} Tour because the `
      + `${Tour.#activeTour.title} Tour is already in progress`);
      else Tour.#activeTour = null;
    }
    else Tour.#activeTour = this;

    // Tear down the prior step
    if ( Number.isFinite(this.#stepIndex) && (this.#stepIndex !== stepIndex) ) {
      await this._postStep();
      console.debug(`Tour [${this.namespace}.${this.id}] | Completed step ${this.#stepIndex+1} of ${this.steps.length}`);
    }

    // Change the step and save progress
    this.#stepIndex = stepIndex;
    await this.#saveProgress();

    // If the TourManager is active, update the UI
    await foundry.applications.instances.get("tours-management")?.render();

    if ( this.status === Tour.STATUS.UNSTARTED ) return Tour.#activeTour = null;
    if ( this.status === Tour.STATUS.COMPLETED ) {
      Tour.#activeTour = null;
      const suggestedTour = game.tours.get((this.config.suggestedNextTours || []).find(tourId => {
        const tour = game.tours.get(tourId);
        return tour && (tour.status !== Tour.STATUS.COMPLETED);
      }));

      if ( !suggestedTour ) return;
      return foundry.applications.api.DialogV2.confirm({
        window: {title: "TOURS.SuggestedTitle"},
        content: game.i18n.format("TOURS.SuggestedDescription", {
          currentTitle: this.title,
          nextTitle: suggestedTour.title
        }),
        yes: {
          callback: () => suggestedTour.start(),
          default: true
        },
        no: {
          callback: () => foundry.applications.instances.get("tours-management")?.maximize()
        }
      });
    }

    // Set up the next step
    await this._preStep();

    // Identify the target HTMLElement
    this.targetElement = null;
    const step = this.currentStep;
    if ( step.selector ) {
      this.targetElement = this._getTargetElement(step.selector);
      if ( !this.targetElement ) console.warn(`Tour [${this.id}] target element "${step.selector}" was not found`);
    }

    // Display the step
    try {
      await this._renderStep();
    }
    catch(e) {
      this.exit();
      throw e;
    }
  }

  /* -------------------------------------------- */

  /**
   * Query the DOM for the target element using the provided selector
   * @param {string} selector     A CSS selector
   * @returns {Element|null}      The target element, or null if not found
   * @protected
   */
  _getTargetElement(selector) {
    return document.querySelector(selector);
  }

  /* -------------------------------------------- */

  /**
   * Creates and returns a Tour by loading a JSON file
   * @param {string} filepath   The path to the JSON file
   * @returns {Promise<Tour>}
   */
  static async fromJSON(filepath) {
    const route = foundry.utils.getRoute(filepath, {prefix: foundry.ROUTE_PREFIX});
    const json = await foundry.utils.fetchJsonWithTimeout(route);
    return new this(json);
  }

  /* -------------------------------------------- */
  /*  Event Handlers                              */
  /* -------------------------------------------- */

  /**
   * Set-up operations performed before a step is shown.
   * @abstract
   * @protected
   */
  async _preStep() {}

  /* -------------------------------------------- */

  /**
   * Clean-up operations performed after a step is completed.
   * @abstract
   * @protected
   */
  async _postStep() {
    if ( this.currentStep && !this.currentStep.selector ) this.targetElement?.remove();
    else game.tooltip.deactivate();
    if ( this.fadeElement ) {
      this.fadeElement.remove();
      this.fadeElement = undefined;
    }
    if ( this.overlayElement ) this.overlayElement = this.overlayElement.remove();
  }

  /* -------------------------------------------- */

  /**
   * Renders the current Step of the Tour
   * @protected
   */
  async _renderStep() {
    const step = this.currentStep;
    const data = {
      title: game.i18n.localize(step.title),
      content: game.i18n.localize(step.content).split("\n"),
      step: this.#stepIndex + 1,
      totalSteps: this.steps.length,
      hasNext: this.hasNext,
      hasPrevious: this.hasPrevious
    };
    const content = await foundry.applications.handlebars.renderTemplate("templates/apps/tour-step.html", data);

    if ( step.selector ) {
      if ( !this.targetElement ) {
        throw new Error(`The expected targetElement ${step.selector} does not exist`);
      }
      this.targetElement.scrollIntoView();
      game.tooltip.activate(this.targetElement, {
        html: content,
        cssClass: "tour themed theme-dark",
        direction: step.tooltipDirection
      });
    }
    else {
      // Display a general mid-screen Step
      const wrapper = document.createElement("aside");
      wrapper.innerHTML = content;
      wrapper.classList.add("tour-center-step", "tour", "themed", "theme-dark");
      document.body.appendChild(wrapper);
      this.targetElement = wrapper;
    }

    // Fade out rest of screen
    this.fadeElement = document.createElement("div");
    this.fadeElement.classList.add("tour-fadeout");
    const targetBoundingRect = this.targetElement.getBoundingClientRect();

    this.fadeElement.style.width = `${targetBoundingRect.width + (step.selector ? Tour.HIGHLIGHT_PADDING : 0)}px`;
    this.fadeElement.style.height = `${targetBoundingRect.height + (step.selector ? Tour.HIGHLIGHT_PADDING : 0)}px`;
    this.fadeElement.style.top = `${targetBoundingRect.top - ((step.selector ? Tour.HIGHLIGHT_PADDING : 0) / 2)}px`;
    this.fadeElement.style.left = `${targetBoundingRect.left - ((step.selector ? Tour.HIGHLIGHT_PADDING : 0) / 2)}px`;
    document.body.appendChild(this.fadeElement);

    // Add Overlay to block input
    this.overlayElement = document.createElement("div");
    this.overlayElement.classList.add("tour-overlay");
    document.body.appendChild(this.overlayElement);

    // Activate Listeners
    const buttons = step.selector ? game.tooltip.tooltip.querySelectorAll(".step-button")
      : this.targetElement.querySelectorAll(".step-button");
    for ( const button of buttons ) {
      button.addEventListener("click", event => this.#onButtonClick(event, buttons));
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle Tour Button clicks
   * @param {Event} event   A click event
   * @param {HTMLElement[]} buttons   The step buttons
   */
  #onButtonClick(event, buttons) {
    event.preventDefault();

    // Disable all the buttons to prevent double-clicks
    for ( const button of buttons ) {
      button.classList.add("disabled");
    }

    // Handle action
    const action = event.currentTarget.dataset.action;
    switch ( action ) {
      case "exit": return this.exit();
      case "previous": return this.previous();
      case "next": return this.next();
      default: throw new Error(`Unexpected Tour button action - ${action}`);
    }
  }

  /* -------------------------------------------- */

  /**
   * Saves the current progress of the Tour to a world setting.
   * @returns {Promise<void>}
   */
  async #saveProgress() {
    const progress = game.settings.get("core", "tourProgress");
    if ( !(this.namespace in progress) ) progress[this.namespace] = {};
    progress[this.namespace][this.id] = this.#stepIndex;
    await game.settings.set("core", "tourProgress", progress);
  }

  /* -------------------------------------------- */

  /**
   * Returns the User's current progress of this Tour
   * @returns {null|number}
   */
  #loadProgress() {
    const progress = game.settings.get("core", "tourProgress");
    return progress?.[this.namespace]?.[this.id] ?? -1;
  }

  /* -------------------------------------------- */

  /**
   * Reloads the Tour's current step from the saved progress
   * @internal
   */
  _reloadProgress() {
    this.#stepIndex = this.#loadProgress();
  }
}

/**
 * @typedef {(typeof Tour.STATUS)[keyof typeof Tour.STATUS]} TourStatus
 */

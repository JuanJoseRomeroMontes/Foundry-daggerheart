
import Hooks from "./hooks.mjs";

/**
 * @import CalendarData from "@client/data/calendar.mjs";
 * @import {CalendarConfig, TimeComponents, TimeFormatter} from "@client/data/_types.mjs";
 */

/**
 * A singleton class at which keeps the official Server and World time stamps.
 * Uses a basic implementation of https://www.geeksforgeeks.org/cristians-algorithm/ for synchronization.
 * @see {@link foundry.Game#time}
 */
export default class GameTime {
  constructor() {
    this.initializeCalendar();
  }

  /**
   * The amount of time to delay before re-syncing the official server time.
   * @type {number}
   */
  static SYNC_INTERVAL_MS = 1000 * 60 * 5;

  /**
   * How many samples of latency history to retain?
   * @type {number}
   */
  static #PING_HISTORY_LENGTH = 10;

  /**
   * The most recently synchronized timestamps retrieved from the server.
   * @type {{clientTime: number, serverTime: number, worldTime: number, components: TimeComponents}}
   */
  #time = {};

  /**
   * The average one-way latency across the most recent 5 trips
   * @type {number}
   */
  #dt = 0;

  /**
   * The most recent five synchronization durations
   * @type {number[]}
   */
  #dts = [];

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * The calendar instance for in-world timekeeping.
   * @type {CalendarData}
   */
  get calendar() {
    return this.#calendar;
  }

  #calendar;

  /**
   * The "Earth" calendar instance for IRL timekeeping.
   * @type {CalendarData}
   */
  get earthCalendar() {
    return this.#earthCalendar;
  }

  #earthCalendar;

  /* -------------------------------------------- */

  /**
   * The current server time based on the last synchronization point and the approximated one-way latency.
   * @type {number}
   */
  get serverTime() {
    const t1 = Date.now();
    const dt = t1 - this.#time.clientTime;
    if ( dt > GameTime.SYNC_INTERVAL_MS ) this.sync();
    return this.#time.serverTime + dt;
  }

  /* -------------------------------------------- */

  /**
   * * The current World time expressed in seconds.
   * @type {number}
   */
  get worldTime() {
    return this.#time.worldTime;
  }

  /* -------------------------------------------- */

  /**
   * The current World time expressed as components.
   * @type {TimeComponents}
   */
  get components() {
    return this.#time.components;
  }

  /* -------------------------------------------- */

  /**
   * The average one-way latency between client and server in milliseconds.
   * @type {number}
   */
  get averageLatency() {
    return this.#dt;
  }

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /**
   * Initialize a calendar configuration.
   * This is called once automatically upon construction, but can be called manually if CONFIG.time changes.
   */
  initializeCalendar() {

    // In-world Calendar
    const {worldCalendarConfig, worldCalendarClass} = CONFIG.time;
    this.#calendar = new worldCalendarClass(foundry.utils.deepClone(worldCalendarConfig), {strict: true});

    // Earth Calendar
    const {earthCalendarConfig, earthCalendarClass} = CONFIG.time;
    this.#earthCalendar = new earthCalendarClass(foundry.utils.deepClone(earthCalendarConfig), {strict: true});

    // Initialize time components
    this.#time.components = this.#calendar.timeToComponents(this.#time.worldTime);
  }

  /* -------------------------------------------- */

  /**
   * Advance or rewind the world time according to a delta amount expressed either in seconds or as components.
   * @param {TimeComponents|number} delta     The number of seconds to advance (or rewind if negative) by
   * @param {object} [options]                Additional options passed to game.settings.set
   * @returns {Promise<number>}               The new game time
   */
  async advance(delta, options) {
    const seconds = typeof delta === "number" ? delta : this.#calendar.componentsToTime(delta);
    const worldTime = this.worldTime;
    await game.settings.set("core", "time", worldTime + seconds, options);
    return worldTime + seconds;
  }

  /* -------------------------------------------- */

  /**
   * Directly set the world time to a certain value expressed either in seconds or as components.
   * @param {TimeComponents|number} time      The desired world time
   * @param {object} [options]                Additional options passed to game.settings.set
   * @returns {Promise<number>}               The new game time
   */
  async set(time, options) {
    const seconds = typeof time === "number" ? time : this.#calendar.componentsToTime(time);
    await game.settings.set("core", "time", seconds, options);
    return seconds;
  }

  /* -------------------------------------------- */
  /*  Synchronization and Update Methods          */
  /* -------------------------------------------- */

  /**
   * Synchronize the local client game time with the official time kept by the server
   * @returns {Promise<GameTime>}
   */
  async sync() {

    // Get the official time from the server
    const t0 = Date.now();
    const time = await new Promise(resolve => {
      game.socket.emit("time", time => resolve(time));
    });
    const t1 = Date.now();

    // Adjust for trip duration
    if ( this.#dts.length >= GameTime.#PING_HISTORY_LENGTH ) this.#dts.shift();
    this.#dts.push(t1 - t0);

    // Re-compute the average one-way duration
    this.#dt = Math.round(this.#dts.reduce((total, t) => total + t, 0) / (this.#dts.length * 2));

    // Adjust the server time and return the adjusted time
    this.#time = Object.assign(time, {
      clientTime: t1 - this.#dt,
      components: this.#calendar.timeToComponents(time.worldTime)
    });
    ui.players?.refreshLatency();
    console.log(`${CONST.vtt} | Synchronized official game time in ${this.#dt}ms`);
    return this;
  }

  /* -------------------------------------------- */
  /*  Event Handlers and Callbacks                */
  /* -------------------------------------------- */

  /**
   * Handle follow-up actions when the official World time is changed
   * @param {number} worldTime      The new canonical World time.
   * @param {object} options        Options passed from the requesting client where the change was made
   * @param {string} userId         The ID of the User who advanced the time
   */
  onUpdateWorldTime(worldTime, options, userId) {
    const dt = worldTime - this.#time.worldTime;
    this.#time.worldTime = worldTime;
    this.#time.components = this.#calendar.timeToComponents(worldTime);
    Hooks.callAll("updateWorldTime", worldTime, dt, options, userId);
    if ( CONFIG.debug.time ) console.log(`The world time advanced by ${dt} seconds, and is now ${worldTime}.`);
  }
}

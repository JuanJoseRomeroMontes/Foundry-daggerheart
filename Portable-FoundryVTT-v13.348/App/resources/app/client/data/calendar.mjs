import DataModel from "@common/abstract/data.mjs";

/**
 * @import {CalendarConfig, CalendarData, TimeComponents, TimeFormatter} from "./_types.mjs";
 */

/**
 * Game Time Calendar configuration data model.
 * @extends {foundry.abstract.DataModel}
 * @mixes CalendarConfig
 * @template {TimeComponents} Components
 */
export default class CalendarData extends DataModel {

  /** @inheritDoc */
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      name: new fields.StringField({required: true, blank: false}),
      description: new fields.StringField(),
      years: new fields.SchemaField({
        yearZero: new fields.NumberField({required: true, nullable: false, integer: true, initial: 0}),
        firstWeekday: new fields.NumberField({required: true, nullable: false, min: 0, integer: true}),
        leapYear: new fields.SchemaField({
          leapStart: new fields.NumberField({required: true, nullable: false, integer: true}),
          leapInterval: new fields.NumberField({required: true, nullable: false, min: 2, integer: true})
        }, {required: true, nullable: true, initial: null})
      }),
      months: new fields.SchemaField({
        values: new fields.ArrayField(new fields.SchemaField({
          name: new fields.StringField({required: true, blank: false}),
          abbreviation: new fields.StringField(),
          ordinal: new fields.NumberField({required: true, nullable: false, min: 1, integer: true}),
          days: new fields.NumberField({required: true, nullable: false}),
          leapDays: new fields.NumberField({required: false, nullable: true})
        }))
      }, {required: true, nullable: true, initial: null}),
      days: new fields.SchemaField({
        values: new fields.ArrayField(new fields.SchemaField({
          name: new fields.StringField({required: true, blank: false}),
          abbreviation: new fields.StringField(),
          ordinal: new fields.NumberField({required: true, nullable: false, min: 1, integer: true})
        }), {required: true, nullable: false}),
        daysPerYear: new fields.NumberField({required: true, nullable: false, positive: true}),
        hoursPerDay: new fields.NumberField({required: true, nullable: false, positive: true}),
        minutesPerHour: new fields.NumberField({required: true, nullable: false, positive: true}),
        secondsPerMinute: new fields.NumberField({required: true, nullable: false, positive: true})
      }),
      seasons: new fields.SchemaField({
        values: new fields.ArrayField(new fields.SchemaField({
          name: new fields.StringField({required: true, blank: false}),
          abbreviation: new fields.StringField(),
          monthStart: new fields.NumberField({required: true, nullable: true, min: 0, integer: true}),
          monthEnd: new fields.NumberField({required: true, nullable: true, min: 0, integer: true}),
          dayStart: new fields.NumberField({required: true, nullable: true, min: 0, integer: true}),
          dayEnd: new fields.NumberField({required: true, nullable: true, min: 0, integer: true})
        }))
      }, {required: true, nullable: true, initial: null})
    };
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _initialize(options = {}) {
    super._initialize(options);

    // Prepare some derived data used in later calculations
    this.days.daysPerLeapYear = this.months.values.length ? this.months.values.reduce((sum, month) => {
      return sum + (month.days ?? 0);
    }, 0) : this.days.daysPerYear;
  }

  /* -------------------------------------------- */
  /*  Calendar Helper Methods                     */
  /* -------------------------------------------- */

  /**
   * Expand a world time integer into an object containing the relevant time components.
   * @param {Partial<Components>} components        An amount of time expressed as components
   * @returns {number}                              The cumulative time in seconds
   */
  componentsToTime(components) {
    const {secondsPerMinute, minutesPerHour, hoursPerDay, daysPerYear, daysPerLeapYear} = this.days;
    const year = components.year ?? 0;

    // Compute the total number of days before the current year
    let totalDays = 0;
    if ( !this.years.leapYear ) totalDays = year * daysPerYear; // No leap years
    else {
      const nLeapYears = this.countLeapYears(year);
      const nStandardYears = year - nLeapYears;
      totalDays = (nLeapYears * daysPerLeapYear) + (nStandardYears * daysPerYear);
    }
    totalDays += (components.day ?? 0);

    // Accumulate time from days, hours, minutes, and seconds
    let time = (totalDays * secondsPerMinute * minutesPerHour * hoursPerDay);
    time += ((components.hour ?? 0) * secondsPerMinute * minutesPerHour);
    time += ((components.minute ?? 0) * secondsPerMinute);
    time += (components.second ?? 0);
    return time;
  }

  /* -------------------------------------------- */

  /**
   * Modify some start time by adding a number of seconds or components to it. The delta components may be negative.
   * @param {number|Components} startTime           The initial time
   * @param {number|Components} deltaTime           Differential components to add
   * @returns {Components}                          The resulting time
   */
  add(startTime, deltaTime) {
    if ( typeof startTime === "object" ) startTime = this.componentsToTime(startTime);
    if ( typeof deltaTime === "object" ) deltaTime = this.componentsToTime(deltaTime);
    const endTime = startTime + deltaTime;
    return this.timeToComponents(endTime);
  }

  /* -------------------------------------------- */

  /**
   * Compute the difference between some new time and some other time.
   * @param {number|Components} endTime             A time to difference relative to the start time.
   * @param {number|Components} [startTime]         The starting time. If not provided the current world time is used.
   * @returns {Components}                          The time difference expressed as components
   */
  difference(endTime, startTime) {
    startTime ??= this.worldTime;
    if ( typeof startTime === "object" ) startTime = this.componentsToTime(startTime);
    if ( typeof endTime === "object" ) endTime = this.componentsToTime(endTime);
    const delta = endTime - startTime;
    return this.timeToComponents(delta);
  }

  /* -------------------------------------------- */

  /**
   * Format a time using one of several supported display formats.
   * @param {number|Components} [time]            The time components to format, by default the current world time.
   * @param {string|TimeFormatter} [formatter]    The formatter function applied to the time.
   *                                              If a string is provided, it must be a function configured in
   *                                              CONFIG.time.formatters.
   * @param {object} options                      Options passed to the formatter function
   * @returns {string}                            The formatted date and time string
   */
  format(time, formatter="timestamp", options={}) {
    const components = typeof time === "number" ? this.timeToComponents(time) : time;
    if ( typeof formatter !== "function" ) {
      const formatterName = formatter;
      formatter = CONFIG.time.formatters[formatterName] ?? this.constructor[formatterName];
      if ( !(formatter instanceof Function) ) {
        throw new Error(`The requested formatter "${formatterName}" did not resolve as a configured formatter
          function in CONFIG.time.formatters or as a named static function in the CalendarData class.`);
      }
    }
    return formatter(this, components, options);
  }

  /* -------------------------------------------- */

  /**
   * Test whether a year is a leap year.
   * @param {number} year                           The year to test
   * @returns {boolean}                             Is it a leap year?
   */
  isLeapYear(year) {
    if ( !this.years.leapYear ) return false;
    const {leapStart, leapInterval} = this.years.leapYear;
    if ( year < leapStart ) return false;
    return ((year - leapStart) % leapInterval) === 0;
  }

  /* -------------------------------------------- */

  /**
   * Count the number of leap years which have completed prior to some current year.
   * @param {number} year                           The current year
   * @returns {number}                              The number of leap years which have occurred prior to this year
   */
  countLeapYears(year) {
    if ( !this.years.leapYear?.leapInterval ) return 0;
    const {leapStart, leapInterval} = this.years.leapYear;
    if ( year < leapStart ) return 0;
    return Math.floor((year - leapStart) / leapInterval) + 1; // leapStart is a leap year
  }

  /* -------------------------------------------- */

  /**
   * Expand a world time integer into an object containing the relevant time components.
   * @param {number} time                     A time in seconds
   * @returns {Components}                    The time expressed as components
   */
  timeToComponents(time=0) {
    const {secondsPerMinute, minutesPerHour, hoursPerDay, daysPerYear} = this.days;
    const secondsPerDay = secondsPerMinute * minutesPerHour * hoursPerDay;

    // Compute year
    let {year, second, leapYear} = this._decomposeTimeYears(time);

    // Day of Year
    const day = Math.floor(second / secondsPerDay);
    second -= (day * secondsPerDay);

    // Month and Day Of Month
    let dayOfMonth = day;
    let month;
    for ( month=0; month<this.months.values.length; month++ ) {
      const m = this.months.values[month];
      const md = leapYear ? (m.leapDays ?? m.days) : m.days;
      if ( dayOfMonth < md ) break;
      dayOfMonth -= md;
    }

    // Day of Week
    const totalWeekdays = Math.floor(time / secondsPerDay) + this.years.firstWeekday;
    const dayOfWeek = totalWeekdays % this.days.values.length;

    // Hours
    const hourSeconds = secondsPerMinute * minutesPerHour;
    const hour = Math.floor(second / hourSeconds);
    second -= (hour * hourSeconds);

    // Minute
    const minute = Math.floor(second / secondsPerMinute);
    second -= (minute * secondsPerMinute);

    // Season
    let season;
    for ( season=0; season<this.seasons.values.length; season++ ) {
      const s = this.seasons.values[season];
      let {dayStart, dayEnd, monthStart, monthEnd} = s;
      const od = day + 1;
      const om = this.months.values[month].ordinal;

      // Match on days
      if ( (typeof dayStart === "number") && (typeof dayEnd === "number") ) {
        if ( dayEnd < dayStart ) {
          if ( od <= dayEnd ) dayStart -= daysPerYear;
          else if ( od >= dayStart ) dayEnd += daysPerYear;
        }
        if ( od.between(dayStart, dayEnd) ) break;
      }

      // Match on months
      else if ( (typeof monthStart === "number") && (typeof monthEnd === "number") ) {
        if ( monthEnd < monthStart ) {
          if ( om <= monthEnd ) monthStart -= this.months.values.length;
          else if ( om >= monthStart ) monthEnd += this.months.values.length;
        }
        if ( om.between(monthStart, monthEnd) ) break;
      }

      // No match
      else {
        season = undefined;
        break;
      }
    }
    return {day, dayOfMonth, dayOfWeek, hour, leapYear, minute, month, season, second, year};
  }

  /* -------------------------------------------- */

  /**
   * Decompose a timestamp in seconds to identify the number of completed years and remaining seconds.
   * Also returns whether the remaining seconds fall within a leap year.
   * This method is factored out so calendars which require advanced leap year handling can override this logic.
   * @param {number} time
   * @returns {year: number, seconds: number, leapYear: boolean}
   * @protected
   */
  _decomposeTimeYears(time) {
    const {secondsPerMinute, minutesPerHour, hoursPerDay, daysPerYear, daysPerLeapYear} = this.days;
    const secondsPerDay = secondsPerMinute * minutesPerHour * hoursPerDay;
    const secondsPerStandardYear = daysPerYear * secondsPerDay;
    const secondsPerLeapYear = daysPerLeapYear * secondsPerDay;

    // Initialize data
    let year = 0;
    let leapYear = false;
    let second = time;

    // Basic case - no leap years
    if ( !this.years.leapYear ) {
      year = Math.floor(second / secondsPerStandardYear);
      second -= (year * secondsPerStandardYear);
      return {year, second, leapYear};
    }

    // Advanced case - leap years
    const {leapStart, leapInterval} = this.years.leapYear;
    const firstLeapSeconds = Math.max(leapStart -1, 0) * secondsPerStandardYear;

    // Special case - time before leapStart
    if ( second < firstLeapSeconds ) {
      year = Math.floor(second / secondsPerStandardYear);
      second -= (year * secondsPerStandardYear);
      return {year, second, leapYear};
    }

    // Start by deducting standard years before leapStart
    const preLeapStartYears = Math.floor(Math.min(second, firstLeapSeconds) / secondsPerStandardYear);
    year += preLeapStartYears;
    second -= (preLeapStartYears * secondsPerStandardYear);

    // Next deduct complete leap intervals (1 leap year + leapInterval-1 standard years)
    const leapIntervalSeconds = (daysPerLeapYear + ((leapInterval - 1) * daysPerYear)) * secondsPerDay;
    const leapIntervals = Math.floor(second / leapIntervalSeconds);
    year += (leapIntervals * leapInterval);
    second -= (leapIntervals * secondsPerLeapYear);
    second -= (leapIntervals * (leapInterval - 1) * secondsPerStandardYear);

    // The current leap interval begins with a leap year
    if ( second >= secondsPerLeapYear ) {
      year++;
      second -= secondsPerLeapYear;
    }
    else leapYear = true; // It is currently a leap year

    // Remaining years within the leap interval are standard years
    const remainderYears = Math.floor(second / secondsPerStandardYear);
    year += remainderYears;
    second -= (remainderYears * secondsPerStandardYear);
    return {year, second, leapYear};
  }

  /* -------------------------------------------- */
  /*  Formatter Functions                         */
  /* -------------------------------------------- */

  /**
   * Format time components as a YYYY-MM-DD HH:MM:SS timestamp.
   * @type {TimeFormatter}
   */
  static formatTimestamp(calendar, components, _options) {
    const yyyy = components.year.paddedString(4);
    const month = calendar.months.values[components.month];
    const mm = month.ordinal.paddedString(2);
    const dd = (components.dayOfMonth + 1).paddedString(2);
    const h = components.hour.paddedString(2);
    const m = components.minute.paddedString(2);
    const s = components.second.paddedString(2);
    return `${yyyy}-${mm}-${dd} ${h}:${m}:${s}`;
  }

  /* -------------------------------------------- */

  /**
   * Format time components as "{years}, {days}, {hours}, {minutes}, {seconds} ago".
   * @type {TimeFormatter}
   */
  static formatAgo(_calendar, components, {short=false, maxTerms}={}) {
    const terms = {
      year: "TIME.Year",
      day: "TIME.Day",
      hour: "TIME.Hour",
      minute: "TIME.Minute",
      second: "TIME.Second"
    };
    const plurals = new Intl.PluralRules(game.i18n.lang);
    let hasNegative = false; // Was a negative-value component found?
    let parts = Object.entries(terms).reduce((arr, [k, t]) => {
      const v = Math.round(components[k]);
      if ( v < 0 ) hasNegative = true;
      if ( hasNegative || (v < 1) ) return arr;
      if ( short ) arr.push(`${v}${game.i18n.localize(t + ".abbr")}`);
      else arr.push(`${v} ${game.i18n.localize(`${t}.${plurals.select(v)}`).toLowerCase()}`);
      return arr;
    }, []);
    if ( !parts.length ) return game.i18n.localize("TIME.Now");
    if ( maxTerms ) parts = parts.slice(0, maxTerms);
    const since = short ? parts.join(" ") : game.i18n.getListFormatter().format(parts);
    return game.i18n.format("TIME.Since", {since});
  }
}

/* -------------------------------------------- */
/*  Baseline Calendar Configuration             */
/* -------------------------------------------- */

/**
 * @type {CalendarConfig}
 */
export const SIMPLIFIED_GREGORIAN_CALENDAR_CONFIG = {
  name: "Simplified Gregorian",
  description: "The Gregorian calendar with some simplifications regarding leap years or seasonal timing.",
  years: {
    yearZero: 0,
    firstWeekday: 0,
    leapYear: {
      leapStart: 8,
      leapInterval: 4
    }
  },
  months: {
    values: [
      {name: "CALENDAR.GREGORIAN.January", abbreviation: "CALENDAR.GREGORIAN.JanuaryAbbr", ordinal: 1, days: 31},
      {name: "CALENDAR.GREGORIAN.February", abbreviation: "CALENDAR.GREGORIAN.FebruaryAbbr", ordinal: 2, days: 28, leapDays: 29},
      {name: "CALENDAR.GREGORIAN.March", abbreviation: "CALENDAR.GREGORIAN.MarchAbbr", ordinal: 3, days: 31},
      {name: "CALENDAR.GREGORIAN.April", abbreviation: "CALENDAR.GREGORIAN.AprilAbbr", ordinal: 4, days: 30},
      {name: "CALENDAR.GREGORIAN.May", abbreviation: "CALENDAR.GREGORIAN.MayAbbr", ordinal: 5, days: 31},
      {name: "CALENDAR.GREGORIAN.June", abbreviation: "CALENDAR.GREGORIAN.JuneAbbr", ordinal: 6, days: 30},
      {name: "CALENDAR.GREGORIAN.July", abbreviation: "CALENDAR.GREGORIAN.JulyAbbr", ordinal: 7, days: 31},
      {name: "CALENDAR.GREGORIAN.August", abbreviation: "CALENDAR.GREGORIAN.AugustAbbr", ordinal: 8, days: 31},
      {name: "CALENDAR.GREGORIAN.September", abbreviation: "CALENDAR.GREGORIAN.SeptemberAbbr", ordinal: 9, days: 30},
      {name: "CALENDAR.GREGORIAN.October", abbreviation: "CALENDAR.GREGORIAN.OctoberAbbr", ordinal: 10, days: 31},
      {name: "CALENDAR.GREGORIAN.November", abbreviation: "CALENDAR.GREGORIAN.NovemberAbbr", ordinal: 11, days: 30},
      {name: "CALENDAR.GREGORIAN.December", abbreviation: "CALENDAR.GREGORIAN.DecemberAbbr", ordinal: 12, days: 31}
    ]
  },
  days: {
    values: [
      {name: "CALENDAR.GREGORIAN.Monday", abbreviation: "CALENDAR.GREGORIAN.MondayAbbr", ordinal: 1},
      {name: "CALENDAR.GREGORIAN.Tuesday", abbreviation: "CALENDAR.GREGORIAN.TuesdayAbbr", ordinal: 2},
      {name: "CALENDAR.GREGORIAN.Wednesday", abbreviation: "CALENDAR.GREGORIAN.WednesdayAbbr", ordinal: 3},
      {name: "CALENDAR.GREGORIAN.Thursday", abbreviation: "CALENDAR.GREGORIAN.ThursdayAbbr", ordinal: 4},
      {name: "CALENDAR.GREGORIAN.Friday", abbreviation: "CALENDAR.GREGORIAN.FridayAbbr", ordinal: 5},
      {name: "CALENDAR.GREGORIAN.Saturday", abbreviation: "CALENDAR.GREGORIAN.SaturdayAbbr", ordinal: 6, isRestDay: true},
      {name: "CALENDAR.GREGORIAN.Sunday", abbreviation: "CALENDAR.GREGORIAN.SundayAbbr", ordinal: 7, isRestDay: true}
    ],
    daysPerYear: 365,
    hoursPerDay: 24,
    minutesPerHour: 60,
    secondsPerMinute: 60
  },
  seasons: {
    values: [
      {name: "CALENDAR.GREGORIAN.Spring", monthStart: 3, monthEnd: 5},
      {name: "CALENDAR.GREGORIAN.Summer", monthStart: 6, monthEnd: 8},
      {name: "CALENDAR.GREGORIAN.Fall", monthStart: 9, monthEnd: 11},
      {name: "CALENDAR.GREGORIAN.Winter", monthStart: 12, monthEnd: 2}
    ]
  }
};

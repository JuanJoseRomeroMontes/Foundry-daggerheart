export * from "@common/data/_types.mjs";

/**
 * @typedef CombatConfigurationData
 * Default combat tracker settings used in Foundry VTT.
 * @property {string} resource            A resource identifier for the tracker.
 * @property {boolean} skipDefeated       Whether to skip defeated tokens during combat.
 * @property {object} turnMarker          Turn marker configuration.
 * @property {boolean} turnMarker.enabled     Whether the turn marker is enabled.
 * @property {string} turnMarker.path         The file path for the turn marker icon.
 * @property {string} turnMarker.animation    The identifier for the default turn marker animation.
 * @property {string} turnMarker.disposition  Tint the turn marker according to token disposition.
 */

/**
 * @typedef CalendarConfig
 * @property {string} name                                The name of the calendar being used.
 * @property {string} description                         A text description of the calendar configuration.
 * @property {CalendarConfigYears} years                  Configuration of years.
 * @property {CalendarConfigMonths|null} months           Configuration of months.
 * @property {CalendarConfigDays} days                    Configuration of days.
 * @property {CalendarConfigSeasons|null} seasons         Configuration of seasons.
 */

/**
 * @typedef CalendarConfigYears
 * A definition of a year within a calendar.
 * @property {number} [yearZero=0]                        The year which is presented as 0 when formatting a time
 *                                                        into a string representation.
 * @property {number} [firstWeekday=0]                    The index of days.values that is the first weekday at time=0
 * @property {CalendarConfigLeapYear|null} [leapYear]     A definition of how leap years work within a calendar.
 */

/**
 * @typedef CalendarConfigLeapYear
 * A definition of how leap years work within a calendar.
 * @property {number} leapStart                           The year number of the first leap year.
 * @property {number} leapInterval                        The number of years between leap years.
 */

/**
 * @typedef CalendarConfigMonths
 * Month related configuration for a calendar.
 * @property {CalendarConfigMonth[]} values               An array of months in the calendar year.
 */

/**
 * @typedef CalendarConfigMonth
 * A definition of a month within a calendar year.
 * @property {string} name                                The full name of the month.
 * @property {string} [abbreviation]                      The abbreviated name of the month.
 * @property {number} ordinal                             The ordinal position of this month in the year.
 * @property {number} days                                The number of days in the month.
 * @property {number} [leapDays]                          The number of days in the month during a leap year.
 *                                                        If not defined the value of days is used.
 * @property {number} [dayOffset=0]                       The amount to offset day numbers for this month.
 * @property {boolean} [intercalary=false]                If this month is an intercalary month.
 * @property {number|null} [startingWeekday=null]         The day of the week this month should always start on.
 *                                                        If the value is null the month will start on the next weekday
 *                                                        after the previous month
 */

/**
 * @typedef CalendarConfigDays
 * Day related configuration for a calendar.
 * @property {CalendarConfigDay[]} values                 The configuration of the days of the week.
 * @property {number} [daysPerYear=365]                   The number of days in a year.
 * @property {number} [hoursPerDay=24]                    The number of hours in a day.
 * @property {number} [minutesPerHour=60]                 The number of minutes in an hour.
 * @property {number} [secondsPerMinute=60]               The number of seconds in a minute.
 */

/**
 * @typedef CalendarConfigDay
 * A definition of the days of the week within a calendar.
 * @property {string} name                                The full name of the weekday.
 * @property {string} [abbreviation]                      The abbreviated name of the weekday.
 * @property {number} ordinal                             The ordinal position of this weekday in the week.
 * @property {boolean} [isRestDay=false]                  Is this weekday considered a rest day (weekend)?
 */

/**
 * @typedef CalendarConfigSeasons
 * Season related configuration for a calendar.
 * @property {CalendarConfigSeason[]} values              An array of seasons in the calendar year.
 */

/**
 * @typedef CalendarConfigSeason
 * A definition of a season within a calendar year. By default, seasons can be defined as aligning to either months or
 * specific ranges of days. A range in either months or in days must be specified.
 * @property {string} name                                The full name of the season.
 * @property {string} [abbreviation]                      The abbreviated name of the season.
 * @property {number|null} [monthStart]                   An ordinal month at the beginning of which the season starts.
 * @property {number|null} [monthEnd]                     An ordinal month at the end of which the season starts.
 * @property {number|null} [dayStart]                     A day of the year at the beginning of which the season starts.
 * @property {number|null} [dayEnd]                       A day of the year at the end of which the season ends.
 */

/**
 * @typedef TimeComponents
 * A decomposition of the integer world time in seconds into component parts.
 * Each component expresses the number of that temporal unit since the time=0 epoch.
 * @property {number} year                                The number of years completed since zero
 * @property {number} day                                 The number of days completed within the year
 * @property {number} hour                                The number of hours completed within the year
 * @property {number} minute                              The number of minutes completed within the hour
 * @property {number} second                              The number of seconds completed within the minute
 * @property {number} month                               The month, an index of the months.values array
 * @property {number} dayOfMonth                          The day of the month, starting from zero
 * @property {number} dayOfWeek                           The weekday, an index of the days.values array
 * @property {number} season                              The season, an index of the seasons.values array
 * @property {boolean} leapYear                           Is it a leap year?
 */

/**
 * @callback TimeFormatter
 * @param {CalendarData} calendar                         The configured calendar
 * @param {TimeComponents} components                     Time components to format
 * @param {object} options                                Additional formatting options
 * @returns {string}                                      The returned string format
 */

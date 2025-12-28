/**
 * @import ApplicationV2 from "../../client/applications/api/application.mjs"
 * @import {Constructor} from "../_types.mjs"
 * @import {EmittedEventListener} from "./_types.mjs"
 */

/**
 * Augment a base class with EventEmitter behavior.
 * @template {Function} TBaseClass
 * @param {TBaseClass} [BaseClass] Some base class to be augmented with event emitter functionality: defaults to an
 *                                 anonymous empty class.
 */
export default function EventEmitterMixin(BaseClass=class {}) {
  /**
   * A mixin class which implements the behavior of EventTarget.
   * This is useful in cases where a class wants EventTarget-like behavior but needs to extend some other class.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/EventTarget}
   */
  class EventEmitter extends BaseClass {

    /**
     * An array of event types which are valid for this class.
     * @type {string[]}
     */
    static emittedEvents = [];

    /**
     * A mapping of registered events.
     * @type {Record<string, Map<EmittedEventListener, {fn: EmittedEventListener, once: boolean}>>}
     */
    #events = {};

    /* -------------------------------------------- */

    /**
     * Add a new event listener for a certain type of event.
     * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener}
     * @param {string} type                     The type of event being registered for
     * @param {EmittedEventListener} listener   The listener function called when the event occurs
     * @param {object} [options={}]             Options which configure the event listener
     * @param {boolean} [options.once=false]      Should the event only be responded to once and then removed
     */
    addEventListener(type, listener, {once = false} = {}) {
      if ( !this.constructor.emittedEvents.includes(type) ) {
        throw new Error(`"${type}" is not a supported event of the ${this.constructor.name} class`);
      }
      this.#events[type] ||= new Map();
      this.#events[type].set(listener, {fn: listener, once});
    }

    /* -------------------------------------------- */

    /**
     * Remove an event listener for a certain type of event.
     * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/removeEventListener}
     * @param {string} type                     The type of event being removed
     * @param {EmittedEventListener} listener   The listener function being removed
     */
    removeEventListener(type, listener) {
      this.#events[type]?.delete(listener);
    }

    /* -------------------------------------------- */

    /**
     * Dispatch an event on this target.
     * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/dispatchEvent}
     * @param {Event} event                     The Event to dispatch
     * @returns {boolean}                       Was default behavior for the event prevented?
     */
    dispatchEvent(event) {
      if ( !(event instanceof Event) ) {
        throw new Error("EventEmitter#dispatchEvent must be provided an Event instance");
      }
      if ( !this.constructor.emittedEvents.includes(event?.type) ) {
        throw new Error(`"${event.type}" is not a supported event of the ${this.constructor.name} class`);
      }
      const listeners = this.#events[event.type];
      if ( !listeners ) return true;

      // Extend and configure the Event
      Object.defineProperties(event, {
        target: {value: this},
        stopPropagation: {value: function() {
          event.propagationStopped = true;
          Event.prototype.stopPropagation.call(this);
        }},
        stopImmediatePropagation: {value: function() {
          event.propagationStopped = true;
          Event.prototype.stopImmediatePropagation.call(this);
        }}
      });

      // Call registered listeners
      for ( const listener of listeners.values() ) {
        listener.fn(event);
        if ( listener.once ) this.removeEventListener(event.type, listener.fn);
        if ( event.propagationStopped ) break;
      }
      return event.defaultPrevented;
    }
  }
  return EventEmitter;
}

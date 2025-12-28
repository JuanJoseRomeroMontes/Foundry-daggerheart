/**
 * Create a new BitMask instance.
 * @param {Record<string, boolean>} [states=null] An object containing valid states and their corresponding initial boolean values (default is null).
 */
export default class BitMask extends Number {
  constructor(states=null) {
    super();
    this.#generateValidStates(states);
    this.#generateEnum();
    this.#value = this.#computeValue(states);
  }

  /**
   * The real value behind the bitmask instance.
   * @type {number}
   */
  #value;

  /**
   * The structure of valid states and their associated values.
   * @type {Map<string, number>}
   */
  #validStates;

  /**
   * The enum associated with this structure.
   * @type {Record<string, string>}
   * @readonly
   */
  states;

  /* -------------------------------------------- */
  /*  Internals                                   */
  /* -------------------------------------------- */

  /**
   * Generates the valid states and their associated values.
   * @param {Record<string, boolean>} [states=null] The structure defining the valid states and their associated values.
   */
  #generateValidStates(states) {
    this.#validStates = new Map();
    let bitIndex = 0;
    for ( const state of Object.keys(states || {}) ) {
      if ( bitIndex >= 32 ) throw new Error("A bitmask can't handle more than 32 states");
      this.#validStates.set(state, 1 << bitIndex++);
    }
  }

  /* -------------------------------------------- */

  /**
   * Generates an enum based on the provided valid states.
   */
  #generateEnum() {
    this.states = {};
    for ( const state of this.#validStates.keys() ) this.states[state] = state;
    Object.freeze(this.states);
  }

  /* -------------------------------------------- */

  /**
   * Calculate the default value of the bitmask based on the initial states
   * @param {Record<string, boolean>} [initialStates={}] The structure defining the valid states and their associated values.
   * @returns {number}
   */
  #computeValue(initialStates={}) {
    let defaultValue = 0;
    for ( const state in initialStates ) {
      if ( !initialStates.hasOwnProperty(state) ) continue;
      this.#checkState(state);
      if ( initialStates[state] ) defaultValue |= this.#validStates.get(state);
    }
    return defaultValue;
  }

  /* -------------------------------------------- */

  /**
   * Checks a state and throws an error if it doesn't exist.
   * @param {string} state   Name of the state to check.
   */
  #checkState(state) {
    if ( !this.#validStates.has(state) ) {
      throw new Error(`${state} is an invalid state for this BitMask instance: ${this.toJSON()}`);
    }
  }

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * True if this bitmask is empty (no active states).
   * @type {boolean}
   */
  get isEmpty() {
    return this.#value === 0;
  }

  /* -------------------------------------------- */
  /*  Methods for Handling states                 */
  /* -------------------------------------------- */

  /**
   * Check if a specific state is active.
   * @param {string} state The state to check.
   * @returns {boolean} True if the state is active, false otherwise.
   */
  hasState(state) {
    return (this.#value & this.#validStates.get(state)) !== 0;
  }

  /* -------------------------------------------- */

  /**
   * Add a state to the bitmask.
   * @param {string} state The state to add.
   * @throws {Error} Throws an error if the provided state is not valid.
   */
  addState(state) {
    this.#checkState(state);
    this.#value |= this.#validStates.get(state);
  }

  /* -------------------------------------------- */

  /**
   * Remove a state from the bitmask.
   * @param {string} state The state to remove.
   * @throws {Error} Throws an error if the provided state is not valid.
   */
  removeState(state) {
    this.#checkState(state);
    this.#value &= ~this.#validStates.get(state);
  }

  /* -------------------------------------------- */

  /**
   * Toggle the state of a specific state in the bitmask.
   * @param {string} state The state to toggle.
   * @param {boolean} [enabled] Toggle on (true) or off (false)? If undefined, the state is switched automatically.
   * @throws {Error} Throws an error if the provided state is not valid.
   */
  toggleState(state, enabled) {
    this.#checkState(state);
    if ( enabled === undefined ) return (this.#value ^= this.#validStates.get(state));
    if ( enabled ) this.addState(state);
    else this.removeState(state);
  }

  /* -------------------------------------------- */

  /**
   * Clear the bitmask, setting all states to inactive.
   */
  clear() {
    this.#value = 0;
  }

  /* -------------------------------------------- */
  /*  bitmask representations                     */
  /* -------------------------------------------- */

  /**
   * Get the current value of the bitmask.
   * @returns {number} The current value of the bitmask.
   */
  valueOf() {
    return this.#value;
  }

  /* -------------------------------------------- */

  /**
   * Get a string representation of the bitmask in binary format.
   * @returns {string} The string representation of the bitmask.
   */
  toString() {
    return String(this.#value.toString(2)).padStart(this.#validStates.size, '0');
  }

  /* -------------------------------------------- */

  /**
   * Checks if two bitmasks structures are compatible (the same valid states).
   * @param {BitMask} otherBitMask The bitmask structure to compare with.
   * @returns {boolean} True if the two bitmasks have the same structure, false otherwise.
   */
  isCompatible(otherBitMask) {
    const states1 = Array.from(this.#validStates.keys()).sort().join(',');
    const states2 = Array.from(otherBitMask.#validStates.keys()).sort().join(',');
    return states1 === states2;
  }

  /* -------------------------------------------- */

  /**
   * Serializes the bitmask to a JSON string.
   * @returns {string} The JSON string representing the bitmask.
   */
  toJSON() {
    return JSON.stringify(this.toObject());
  }

  /* -------------------------------------------- */

  /**
   * Creates a new BitMask instance from a JSON string.
   * @param {string} jsonString The JSON string representing the bitmask.
   * @returns {BitMask} A new BitMask instance created from the JSON string.
   */
  static fromJSON(jsonString) {
    const data = JSON.parse(jsonString);
    return new BitMask(data);
  }

  /* -------------------------------------------- */

  /**
   * Convert value of this BitMask to object representation according to structure.
   * @returns {Object} The data represented by the bitmask.
   */
  toObject() {
    const result = {};
    for ( const [validState, value] of this.#validStates ) result[validState] = ((this.#value & value) !== 0);
    return result;
  }

  /* -------------------------------------------- */

  /**
   * Creates a clone of this BitMask instance.
   * @returns {BitMask} A new BitMask instance with the same value and valid states as this instance.
   */
  clone() {
    return new BitMask(this.toObject());
  }

  /* -------------------------------------------- */
  /*  Static Helpers                              */
  /* -------------------------------------------- */

  /**
   * Generates shader constants based on the provided states.
   * @param {string[]} states An array containing valid states.
   * @returns {string} Shader bit mask constants generated from the states.
   */
  static generateShaderBitMaskConstants(states) {
    let shaderConstants = '';
    let bitIndex = 0;
    for ( const state of states ) {
      shaderConstants += `const uint ${state.toUpperCase()} = 0x${(1 << bitIndex).toString(16).toUpperCase()}U;\n`;
      bitIndex++;
    }
    return shaderConstants;
  }
}

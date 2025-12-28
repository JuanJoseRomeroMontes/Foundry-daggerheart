import * as primitives from "./_module.mjs";

declare global {
  interface Array<T> {
    deepFlatten: typeof primitives.Array.deepFlatten;
    equals: typeof primitives.Array.equals;
    filterJoin: typeof primitives.Array.filterJoin;
    findSplice: typeof primitives.Array.findSplice<T>;
    partition: typeof primitives.Array.partition<T>;
  }

  interface ArrayConstructor {
    fromRange: typeof primitives.Array.fromRange;
  }

  interface Date {
    isValid: typeof primitives.Date.isValid;
    toDateInputString: typeof primitives.Date.toDateInputString;
    toTimeInputString: typeof primitives.Date.toTimeInputString;
  }

  interface Math {
    SQRT3: typeof primitives.Math.SQRT3;
    SQRT1_3: typeof primitives.Math.SQRT1_3;
    clamp: typeof primitives.Math.clamp;
    clamped: typeof primitives.Math.clamped;
    mix: typeof primitives.Math.mix;
    normalizeDegrees: typeof primitives.Math.normalizeDegrees;
    normalizeRadians: typeof primitives.Math.normalizeRadians;
    roundDecimals: typeof primitives.Math.roundDecimals;
    toDegrees: typeof primitives.Math.toDegrees;
    toRadians: typeof primitives.Math.toRadians;
    oscillation: typeof primitives.Math.oscillation;
  }

  interface Number {
    almostEqual: typeof primitives.Number.almostEqual;
    between: typeof primitives.Number.between;
    ordinalString: typeof primitives.Number.ordinalString;
    paddedString: typeof primitives.Number.paddedString;
    signedString: typeof primitives.Number.signedString;
    toNearest: typeof primitives.Number.toNearest;
  }

  interface NumberConstructor {
    isNumeric: typeof primitives.Number.isNumeric;
    fromString: typeof primitives.Number.fromString;
  }

  interface RegExpConstructor {
    escape: typeof primitives.RegExp.escape;
  }

  interface Set<T> {
    equals: typeof primitives.Set.equals;
    every: typeof primitives.Set.every<T>;
    filter: typeof primitives.Set.filter<T>;
    find: typeof primitives.Set.find<T>;
    first: typeof primitives.Set.first<T>;
    intersects: typeof primitives.Set.intersects;

    /**
     * Create a new Set where every element is modified by a provided transformation function.
     * @param transform The transformation function to apply. Positional arguments are the value, the index of
     *                  iteration, and the set being transformed.
     * @returns A new Set of equal size containing transformed elements.
     * @see Array#map
     */
    map<U>(transform: (element: T, index: number, set: Set<T>) => U): Set<U>;

    /**
     * Create a new Set with elements that are filtered and transformed by a provided reducer function.
     * @param reducer     A reducer function applied to each value. Positional arguments are the accumulator, the value,
     *                    the index of iteration, and the set being reduced.
     * @param initial     The initial value of the returned accumulator.
     * @returns The final value of the accumulator.
     * @see Array#reduce
     */
    reduce<U>(reducer: (accum: U, element: T, index: number, set: Set<T>) => U, initial?: U): U;

    some: typeof primitives.Set.some<T>;
    toObject: typeof primitives.Set.toObject<T>;
  }

  interface String {
    capitalize: typeof primitives.String.capitalize;
    compare: typeof primitives.String.compare;
    titleCase: typeof primitives.String.titleCase;
    stripScripts: typeof primitives.String.stripScripts;
    slugify: typeof primitives.String.slugify;
  }

  interface ObjectConstructor {
    /**
     * Prevents the modification of existing property attributes and values, and prevents the addition of new properties.
     * @param o Object on which to lock the attributes.
     */
    freeze<const T>(o: T): Readonly<T>;
  }
}

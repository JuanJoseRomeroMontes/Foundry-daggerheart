/**
 * @import Color from "./utils/color.mjs"
 */

/* ----------------------------------------- */
/*  Reusable Type Definitions                */
/* ----------------------------------------- */

/**
 * @template T
 * @typedef {{
 *   readonly [K in keyof T]:
 *     T[K] extends (undefined | null | boolean | number | string | symbol | bigint | Function) ? T[K] :
 *     T[K] extends Array<infer V> ? ReadonlyArray<DeepReadonly<V>> :
 *     T[K] extends Map<infer K, infer V> ? ReadonlyMap<DeepReadonly<K>, DeepReadonly<V>> :
 *     T[K] extends Set<infer V> ? ReadonlySet<DeepReadonly<V>> : DeepReadonly<T[K]>
 * }} DeepReadonly
 * Make all properties in T recursively readonly.
 */

/**
 * A class constructor.
 * Used for functions with generic class constructor parameters.
 * @template [TApplication={}]
 * @typedef {new (...args: any[]) => TApplication} Constructor
 */

/** @typedef {Date | Function | Uint8Array | string | number | boolean | symbol | null | undefined} Builtin */

/**
 * A recursively-partial object
 * @template T
 * @typedef {T extends Builtin
 *   ? T
 *   : T extends Array<infer U>
 *   ? Array<DeepPartial<U>>
 *   : T extends ReadonlyArray<infer U>
 *   ? ReadonlyArray<DeepPartial<U>>
 *   : T extends {}
 *   ? { [K in keyof T]?: DeepPartial<T[K]> }
 *   : Partial<T>
 * } DeepPartial
 */

/**
 * @typedef Point
 * A 2D point, expressed as {x, y}.
 * @property {number} x    The x-coordinate
 * @property {number} y    The y-coordinate
 */

/**
 * @typedef {[x: number, y: number]} PointArray
 * A 2D point, expressed as an array [x, y].
 */

/**
 * @typedef ElevatedPoint
 * A 3D point, expessed as {x, y, elevation}.
 * @property {number} x            The x-coordinate in pixels
 * @property {number} y            The y-coordinate in pixels
 * @property {number} elevation    The elevation in grid units
 */

/**
 * @typedef Rectangle
 * A standard rectangle interface.
 * @property {number} x         The x-coordinate of the top-left corner
 * @property {number} y         The y-coordinate of the top-left corner
 * @property {number} width     The width
 * @property {number} height    The height
 */

/**
 * @typedef {NumberConstructor|StringConstructor|BooleanConstructor|ObjectConstructor} BuiltinType
 */

/**
 * @typedef {number|[red: number, green: number, blue: number]|string|Color} ColorSource
 */

/* ----------------------------------------- */
/*  Socket Requests and Responses            */
/* ----------------------------------------- */

/**
 * @typedef {Record<string, unknown>|Record<string, unknown>[]|string|string[]} RequestData
 */

/**
 * @typedef SocketRequest
 * @property {object} [options]
 * @property {boolean} [broadcast]
 */

/**
 * @typedef SocketResponse
 * @property {SocketRequest} request  The initial request
 * @property {Error} [error]          An error, if one occurred
 * @property {string} [status]        The status of the request
 * @property {string} [userId]        The ID of the requesting User
 * @property {RequestData} [data]     Data returned as a result of the request
 */

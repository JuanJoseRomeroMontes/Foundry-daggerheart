/**
 * Supported worker task actions
 * @enum {string}
 */
const WORKER_TASK_ACTIONS = {
  INIT: "init",
  LOAD: "load",
  EXECUTE: "execute"
};

/**
 * The name of this Worker thread
 * @type {string}
 */
let _workerName;

/**
 * Is this Worker operating in debug mode?
 * @type {boolean}
 */
let _debug = false;

/**
 * A registry of loaded functions
 * @type {Map<string, Function>}
 */
const functions = new Map();

/**
 * Handle messages provided from the main thread via worker#postMessage
 * @param {MessageEvent} event        The message provided from the main thread
 */
onmessage = async function(event) {
  const task = event.data;

  // Get the task result
  let response;
  let transfer;
  switch ( task.action ) {
    case WORKER_TASK_ACTIONS.INIT:
      response = await _handleInitializeWorker(task);
      break;
    case WORKER_TASK_ACTIONS.LOAD:
      response = await _handleLoadFunction(task);
      break;
    case WORKER_TASK_ACTIONS.EXECUTE:
      [response, transfer] = await _handleExecuteFunction(task);
      break;
  }

  // Respond with the result, and transfer objects back to the main thread
  postMessage(response, transfer);
};

/* -------------------------------------------- */

/**
 * Handle the initialization workflow for a new Worker
 * @param {object} [options={}]     Options which configure worker initialization
 * @param {number} [options.taskId]          The task ID being performed
 * @param {string} [options.workerName]      The worker name
 * @param {boolean} [options.debug]          Should the worker run in debug mode?
 * @param {boolean} [options.loadPrimitives] Should we automatically load primitives from module.mjs?
 * @param {string[]} [options.scripts]        An array of scripts to import.
 * @private
 */
async function _handleInitializeWorker({taskId, workerName, debug, loadPrimitives, scripts}={}) {
  _workerName = workerName;
  _debug = debug;
  if ( loadPrimitives ) await _loadLibrary("/common/utils/primitives/module.mjs");
  if ( scripts ) importScripts(...scripts);
  console.log(`Worker ${_workerName} | Initialized Worker`);
  return {taskId};
}

/* -------------------------------------------- */

/**
 * Currently Chrome and Safari support web worker modules which can use ES Module imports directly.
 * Firefox lags behind and this feature is not yet implemented: https://bugzilla.mozilla.org/show_bug.cgi?id=1247687
 * FIXME: Once Firefox supports module workers, we can import commons libraries into workers directly.
 * Until then, this is a hacky workaround to parse the source script into the global namespace of the worker thread.
 * @param {string} path           The commons ES Module to load
 * @returns {Promise<void>}       A Promise that resolves once the module has been "loaded"
 * @private
 */
async function _loadLibrary(path) {
  const source = await fetch(path).then(r => r.text());
  eval.call(globalThis, source);
}

/* -------------------------------------------- */

/**
 * Handle a request from the main thread to load a function into Worker memory.
 * @param {object} [options={}]
 * @param {number} [options.taskId]         The task ID being performed
 * @param {string} [options.functionName]   The name that the function should assume in the Worker global scope
 * @param {string} [options.functionBody]   The content of the function to be parsed.
 * @private
 */
async function _handleLoadFunction({taskId, functionName, functionBody}={}) {

  // Evaluate in an anonymous scope to prevent collision with variables defined in this function's scope
  const fn = eval(`(function() { return ${functionBody}; })()`);
  if ( !fn ) throw new Error(`Failed to load function ${functionName}`);
  Object.defineProperty(fn, "name", {value: functionName});

  // Record the function to the global scope
  functions.set(functionName, fn);
  globalThis[functionName] = fn;
  if ( _debug ) console.debug(`Worker ${_workerName} | Loaded function ${functionName}`);
  return {taskId};
}

/* -------------------------------------------- */

/**
 * Handle a request from the main thread to execute a function with provided parameters.
 * @param {object}   [options={}]
 * @param {number}   [options.taskId]         The task ID being performed
 * @param {string}   [options.functionName]   The name that the function should assume in the Worker global scope
 * @param {Array<*>} [options.args]           An array of arguments passed to the function
 * @returns {[message: object, transfer?: object[]]}
 * @private
 */
async function _handleExecuteFunction({taskId, functionName, args}) {
  // Checking that function exists
  const fn = this[functionName] || functions.get(functionName);
  if ( !fn ) throw new Error(`Function ${functionName} does not exist into Worker ${_workerName}`);

  try {
    const [result, transfer] = await fn(...args);
    if ( _debug ) console.debug(`Worker ${_workerName} | Executed function ${functionName}`);
    return [{taskId, result}, transfer];
  } catch(error) {
    if ( _debug ) console.debug(`Worker ${_workerName} | Failed to execute function ${functionName}`);
    console.error(error);
    return [{taskId, error}];
  }
}

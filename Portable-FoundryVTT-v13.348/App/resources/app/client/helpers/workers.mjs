/**
 * @typedef {Record<string, any>} WorkerTask
 * @property {number} [taskId]          An incrementing task ID used to reference task progress
 * @property {WorkerManager.WORKER_TASK_ACTIONS} action  The task action being performed, from
 *                                                       WorkerManager.WORKER_TASK_ACTIONS
 */

/**
 * An asynchronous web Worker which can load user-defined functions and await execution using Promises.
 * @param {string} name                 The worker name to be initialized
 * @param {object} [options={}]         Worker initialization options
 * @param {boolean} [options.debug=false]           Should the worker run in debug mode?
 * @param {boolean} [options.loadPrimitives=false]  Should the worker automatically load the primitives library?
 * @param {string[]} [options.scripts]              Should the worker operates in script modes? Optional scripts.
 */
export class AsyncWorker extends Worker {
  constructor(name, {debug=false, loadPrimitives=false, scripts}={}) {
    super(AsyncWorker.WORKER_HARNESS_JS);
    this.name = name;
    this.addEventListener("message", this.#onMessage.bind(this));
    this.addEventListener("error", this.#onError.bind(this));

    this.#ready = this.#dispatchTask({
      action: WorkerManager.WORKER_TASK_ACTIONS.INIT,
      workerName: name,
      scripts: scripts?.map(s => foundry.utils.getRoute(s)),
      debug,
      loadPrimitives
    });
  }

  /**
   * A path reference to the JavaScript file which provides companion worker-side functionality.
   * @type {string}
   */
  static WORKER_HARNESS_JS = "scripts/worker.js";

  /**
   * The name of this worker.
   * @type {string}
   */
  name;

  /**
   * A queue of active tasks that this Worker is executing.
   * @type {Map<number, {resolve: (result: any) => void, reject: (error: Error) => void}>}
   */
  #tasks = new Map();

  /**
   * An auto-incrementing task index.
   * @type {number}
   */
  #taskIndex = 0;

  /**
   * A Promise which resolves once the Worker is ready to accept tasks
   * @type {Promise}
   */
  get ready() {
    return this.#ready;
  }

  #ready;

  /* -------------------------------------------- */
  /*  Task Management                             */
  /* -------------------------------------------- */

  /**
   * Load a function onto a given Worker.
   * The function must be a pure function with no external dependencies or requirements on global scope.
   * @param {string} functionName   The name of the function to load
   * @param {Function} functionRef  A reference to the function that should be loaded
   * @returns {Promise<unknown>}    A Promise which resolves once the Worker has loaded the function.
   */
  async loadFunction(functionName, functionRef) {
    return this.#dispatchTask({
      action: WorkerManager.WORKER_TASK_ACTIONS.LOAD,
      functionName,
      functionBody: functionRef.toString()
    });
  }

  /* -------------------------------------------- */

  /**
   * Execute a task on a specific Worker.
   * @param {string} functionName   The named function to execute on the worker. This function must first have been
   *                                loaded.
   * @param {Array<*>} [args]       An array of parameters with which to call the requested function
   * @param {Array<*>} [transfer]   An array of transferable objects which are transferred to the worker thread.
   *                                See https://developer.mozilla.org/en-US/docs/Glossary/Transferable_objects
   * @returns {Promise<unknown>}    A Promise which resolves with the returned result of the function once complete.
   */
  async executeFunction(functionName, args=[], transfer=[]) {
    const action = WorkerManager.WORKER_TASK_ACTIONS.EXECUTE;
    return this.#dispatchTask({action, functionName, args}, transfer);
  }

  /* -------------------------------------------- */

  /**
   * Dispatch a task to a named Worker, awaiting confirmation of the result.
   * @param {WorkerTask} taskData   Data to dispatch to the Worker as part of the task.
   * @param {Array<*>} transfer     An array of transferable objects which are transferred to the worker thread.
   * @returns {Promise}             A Promise which wraps the task transaction.
   */
  async #dispatchTask(taskData={}, transfer=[]) {
    const taskId = taskData.taskId = this.#taskIndex++;
    return new Promise((resolve, reject) => {
      this.#tasks.set(taskId, {resolve, reject});
      this.postMessage(taskData, transfer);
    });
  }

  /* -------------------------------------------- */

  /**
   * Handle messages emitted by the Worker thread.
   * @param {MessageEvent} event      The dispatched message event
   */
  #onMessage(event) {
    const response = event.data;
    const task = this.#tasks.get(response.taskId);
    if ( !task ) return;
    this.#tasks.delete(response.taskId);
    if ( response.error ) return task.reject(response.error);
    return task.resolve(response.result);
  }

  /* -------------------------------------------- */

  /**
   * Handle errors emitted by the Worker thread.
   * @param {ErrorEvent} error        The dispatched error event
   */
  #onError(error) {
    error.message = `An error occurred in Worker ${this.name}: ${error.message}`;
    console.error(error);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  terminate() {
    super.terminate();
    const error = new Error(`Worker ${this.name} has been terminated`);
    for ( const task of this.#tasks.values() ) task.reject(error);
    this.#tasks.clear();
  }
}

/* -------------------------------------------- */

/**
 * A client-side class responsible for managing a set of web workers.
 * This interface is accessed as a singleton instance via game.workers.
 * @see {@link foundry.Game#workers}
 */
export class WorkerManager extends Map {
  constructor() {
    if ( game.workers instanceof WorkerManager ) {
      throw new Error("The singleton WorkerManager instance has already been constructed as Game#workers");
    }
    super();
  }

  /**
   * Supported worker task actions
   * @enum {string}
   */
  static WORKER_TASK_ACTIONS = Object.freeze({
    INIT: "init",
    LOAD: "load",
    EXECUTE: "execute"
  });

  /* -------------------------------------------- */
  /*  Worker Management                           */
  /* -------------------------------------------- */

  /**
   * Create a new named Worker.
   * @param {string} name                 The named Worker to create
   * @param {object} [config={}]          Worker configuration parameters passed to the AsyncWorker constructor
   * @returns {Promise<AsyncWorker>}      The created AsyncWorker which is ready to accept tasks
   */
  async createWorker(name, config={}) {
    if (this.has(name)) {
      throw new Error(`A Worker already exists with the name "${name}"`);
    }
    const worker = new AsyncWorker(name, config);
    this.set(name, worker);
    await worker.ready;
    return worker;
  }

  /* -------------------------------------------- */

  /**
   * Retire a current Worker, terminating it immediately.
   * @see Worker#terminate
   * @param {string} name           The named worker to terminate
   */
  retireWorker(name) {
    const worker = this.get(name);
    if ( !worker ) return;
    worker.terminate();
    this.delete(name);
  }
}

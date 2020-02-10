"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const worker_threads_1 = require("worker_threads");
// @ts-ignore
const v8_1 = require("v8");
const os_1 = require("os");
const worker_1 = require("./worker");
const WORKER_STATE_READY = 'ready';
const WORKER_STATE_SPAWNING = 'spawning';
const WORKER_STATE_BUSY = 'busy';
const WORKER_STATE_OFF = 'off';
const AVAILABLE_CPUS = os_1.cpus().length;
// calculated for teardown method
const NODE_VERSION_SPLIT = process.version.replace('v', '').split('.');
const NODE_VERSION_MAJOR = parseInt(NODE_VERSION_SPLIT[0]);
const NODE_VERSION_MINOR = parseInt(NODE_VERSION_SPLIT[1]);
class WorkerPool {
    constructor() {
        this.staticWorkerMap = new Map();
        this.maxWorkers = AVAILABLE_CPUS;
        this.taskQueue = [];
        this.workers = [];
    }
    resurrect(deadWorker) {
        // self healing procedure
        const worker = new worker_threads_1.Worker(worker_1.workerFile, { eval: true });
        deadWorker.status = WORKER_STATE_SPAWNING;
        deadWorker.worker = worker;
        worker.once('online', () => 
        // next tick, so the worker js gets interpreted
        process.nextTick(() => {
            deadWorker.status = WORKER_STATE_READY;
            // remove previous listeners, like the startup error handler
            worker.removeAllListeners();
            this.tick();
        }));
        // startup error handler: should not be thrown or at least handled
        worker.once('error', (error) => {
            console.error(error);
            deadWorker.status = WORKER_STATE_OFF;
            worker.removeAllListeners();
            this.tick();
        });
    }
    generateWorkerString(config, handler) {
        let variables = '';
        for (const key in config.ctx) {
            if (!config.ctx.hasOwnProperty(key))
                continue;
            let variable;
            switch (typeof config.ctx[key]) {
                case 'string':
                    variable = `'${config.ctx[key]}'`;
                    break;
                case 'object':
                    variable = JSON.stringify(config.ctx[key]);
                    break;
                default:
                    variable = config.ctx[key];
            }
            variables += `let ${key} = ${variable}\n`;
        }
        const dataSerialized = v8_1.serialize(config.data);
        const dataStr = JSON.stringify(dataSerialized);
        return `
      async function __executor__() {
        const v8 = require('v8')
        ${variables}
        const dataParsed = JSON.parse('${dataStr}')
        const dataBuffer = Buffer.from(dataParsed.data)
        const dataDeserialized = v8.deserialize(dataBuffer)
        return await (${handler.toString()})(dataDeserialized)
      }
      `;
    }
    generateStaticWorkerString(config, handler) {
        let workerStr = this.staticWorkerMap.get(handler);
        if (typeof (workerStr) == 'undefined') {
            const dataSerialized = v8_1.serialize(config.data);
            const dataStr = JSON.stringify(dataSerialized);
            workerStr = `
      async function __executor__(transferList) {
        const v8 = require('v8')
        const dataParsed = JSON.parse('${dataStr}')
        const dataBuffer = Buffer.from(dataParsed.data)
        const dataDeserialized = v8.deserialize(dataBuffer)
        return await (${handler.toString()})(dataDeserialized, transferList)
      }
      `;
            this.staticWorkerMap.set(handler, workerStr);
        }
        return workerStr;
    }
    tick() {
        // check for dead threads and resurrect them
        this.workers
            .filter(({ status }) => status === WORKER_STATE_OFF)
            .forEach((deadWorker) => this.resurrect(deadWorker));
        if (this.taskQueue.length === 0)
            return;
        let availableWorker;
        for (let i = 0; i < this.workers.length; i++) {
            if (this.workers[i].status === WORKER_STATE_READY) {
                availableWorker = this.workers[i];
                break;
            }
        }
        if (typeof availableWorker === 'undefined')
            return;
        const work = this.taskQueue.shift();
        availableWorker.status = WORKER_STATE_BUSY;
        const { worker } = availableWorker;
        const { handler, config, resolve, reject } = work;
        try {
            worker.once('message', (message) => {
                this.free(worker);
                if (typeof message.error === 'undefined' || message.error === null)
                    return resolve(message.data);
                const error = new Error(message.error.message);
                error.stack = message.error.stack;
                reject(error);
            });
            worker.once('error', (error) => {
                availableWorker.status = WORKER_STATE_OFF;
                reject(error);
                this.tick();
            });
            if (config.static) {
                worker.postMessage([this.generateStaticWorkerString(config, handler), true, config.transferList], config.transferList);
            }
            else {
                worker.postMessage([this.generateWorkerString(config, handler), false]);
            }
        }
        catch (err) {
            this.free(worker);
            reject(err);
        }
    }
    enqueue({ handler, config, resolve, reject }) {
        this.taskQueue.push({ handler, config, resolve, reject });
        this.tick();
    }
    free(worker) {
        for (let i = 0; i < this.workers.length; i++) {
            if (worker.threadId === this.workers[i].worker.threadId) {
                this.workers[i].status = WORKER_STATE_READY;
                // remove previous listeners
                this.workers[i].worker.removeAllListeners();
                this.tick();
                break;
            }
        }
    }
    setup(config = {}) {
        this.maxWorkers = config.maxWorkers > 0 ? config.maxWorkers : AVAILABLE_CPUS;
        if (this.maxWorkers > 10)
            console.warn(`Worker pool has more than 10 workers.\nYou should also increase the Max Listeners of Node.js (https://nodejs.org/docs/latest/api/events.html#events_emitter_setmaxlisteners_n)\nOtherwise, limit them with start({maxWorkers: 10})`);
        return new Promise((resolve, reject) => {
            let counterSuccess = 0;
            let counterFailure = 0;
            for (let i = 0; i < this.maxWorkers; i++) {
                const worker = new worker_threads_1.Worker(worker_1.workerFile, { eval: true });
                this.workers.push({
                    status: WORKER_STATE_SPAWNING,
                    worker
                });
                worker.once('online', (index => () => {
                    // next tick, so the worker js gets interpreted
                    process.nextTick(() => {
                        this.workers[index].status = WORKER_STATE_READY;
                        // remove previous listeners, like the startup error handler
                        this.workers[index].worker.removeAllListeners();
                        counterSuccess++;
                        // if there's at least one working thread, go ahead
                        if (counterSuccess > 0 &&
                            counterSuccess + counterFailure === this.maxWorkers)
                            resolve();
                    });
                })(i));
                // startup error handler: should not be thrown or at least handled
                worker.once('error', (index => (error) => {
                    this.workers[index].status = WORKER_STATE_OFF;
                    this.workers[index].worker.removeAllListeners();
                    counterFailure++;
                    // stop the worker pool if no worker is spawned
                    if (counterFailure === this.maxWorkers) {
                        reject(error);
                    }
                })(i));
            }
        });
    }
    async teardown() {
        if (NODE_VERSION_MAJOR >= 12 && NODE_VERSION_MINOR >= 5) {
            const terminationPromises = [];
            for (const { worker } of this.workers) {
                terminationPromises.push(worker.terminate());
            }
            await Promise.all(terminationPromises);
            this.workers = [];
        }
        else {
            const promise = new Promise(resolve => {
                let counter = 0;
                for (let i = 0; i < this.workers.length; i++) {
                    this.workers[i].worker.terminate(() => {
                        counter++;
                        if (counter === this.workers.length) {
                            this.workers = [];
                            resolve();
                        }
                    });
                }
            });
            await promise;
        }
    }
}
exports.default = new WorkerPool();
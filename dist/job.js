"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const worker_pool_1 = __importDefault(require("./worker-pool"));
const MISSING_HANDLER_ERROR = `job needs a function.\nTry with:\n> job(() => {...}, config)`;
const WRONG_CONTEXT_ERROR = `job needs an object as ctx.\nTry with:\n> job(() => {...}, {ctx: {...}})`;
const STATIC_CONTEXT_ERROR = `static job can't pass ctx.\nTry with:\n> job(() => {...}, {static: true, ctx: {}})`;
function job(handler, config = { ctx: {}, data: {} }) {
    return new Promise((resolve, reject) => {
        if (typeof handler !== 'function')
            return reject(new Error(MISSING_HANDLER_ERROR));
        config.ctx = config.ctx || {};
        config.data = config.data || {};
        if (config.static && Object.keys(config.ctx).length > 0)
            return reject(new Error(STATIC_CONTEXT_ERROR));
        if (typeof config.ctx !== 'object')
            return reject(new Error(WRONG_CONTEXT_ERROR));
        worker_pool_1.default.enqueue({ handler, config, resolve, reject });
    });
}
exports.job = job;
exports.stop = worker_pool_1.default.teardown.bind(worker_pool_1.default);
exports.start = worker_pool_1.default.setup.bind(worker_pool_1.default);

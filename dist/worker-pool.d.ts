import { Config, SetupConfig, Task, WorkerWrapper } from './interfaces';
declare class WorkerPool {
    private staticWorkerMap;
    private maxWorkers;
    private taskQueue;
    private workers;
    resurrect(deadWorker: WorkerWrapper): void;
    generateWorkerString(config: Config, handler: Function): string;
    generateStaticWorkerString(config: Config, handler: Function): string;
    tick(): void;
    enqueue({ handler, config, resolve, reject }: Task): void;
    free(worker: any): void;
    setup(config?: SetupConfig): Promise<void>;
    teardown(): Promise<void>;
}
declare const _default: WorkerPool;
export default _default;

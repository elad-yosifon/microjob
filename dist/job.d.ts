import { Config } from './interfaces';
import { SetupConfig } from './interfaces';
export declare function job<T, U extends {}, V extends {}, TL extends (ArrayBuffer | MessagePort)[]>(handler: (data: V, transferList: TL) => T, config?: Config<U, V>): Promise<T>;
export declare const stop: () => Promise<void>;
export declare const start: (config?: SetupConfig) => Promise<void>;

export interface EngineSimModuleOptions {
  readonly wasmBinary: Uint8Array;
  readonly noInitialRun?: boolean;
  readonly locateFile?: (path: string) => string;
}

export default function createEngineSimModule(options: EngineSimModuleOptions): Promise<unknown>;

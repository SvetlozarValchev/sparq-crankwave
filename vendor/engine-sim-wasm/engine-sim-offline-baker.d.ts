export interface EngineSimBakerModuleOptions {
  readonly wasmBinary: Uint8Array;
  readonly noInitialRun?: boolean;
  readonly locateFile?: (path: string) => string;
}

export default function createEngineSimBakerModule(
  options: EngineSimBakerModuleOptions
): Promise<unknown>;

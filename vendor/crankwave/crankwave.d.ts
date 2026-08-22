export interface CrankwaveModuleOptions {
  readonly wasmBinary: Uint8Array;
  readonly noInitialRun?: boolean;
  readonly locateFile?: (path: string) => string;
}

export default function createCrankwaveModule(options: CrankwaveModuleOptions): Promise<unknown>;

export interface CrankwaveBakerModuleOptions {
  readonly wasmBinary: Uint8Array;
  readonly noInitialRun?: boolean;
  readonly locateFile?: (path: string) => string;
}

export default function createCrankwaveBakerModule(
  options: CrankwaveBakerModuleOptions
): Promise<unknown>;

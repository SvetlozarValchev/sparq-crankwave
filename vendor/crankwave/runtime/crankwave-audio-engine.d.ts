export interface CrankwaveOperatingPoint {
  readonly rpm: number;
  readonly throttle01: number;
  readonly load01: number;
}

export interface CrankwaveAudioFormat {
  readonly sampleRateHz: number;
  readonly channelCount: 1;
  readonly sampleEncoding: 'float32';
  readonly interleaving: 'mono';
  readonly processFrames: number;
  readonly latencyFrames: number;
  readonly internalBlockFrames: number;
}

export class CrankwaveAudioEngine {
  static load(
    input: ArrayBuffer | ArrayBufferView,
    options?: { readonly crypto?: unknown; readonly sessionSeed?: string }
  ): Promise<CrankwaveAudioEngine>;

  readonly engineId: string;
  readonly sampleRate: number;
  readonly channelCount: 1;
  readonly minimumRpm: number;
  readonly maximumRpm: number;
  readonly blockFrames: number;
  readonly processFrames: number;
  readonly latencyFrames: number;
  readonly format: CrankwaveAudioFormat;
  readonly operatingPoint: CrankwaveOperatingPoint;
  readonly queuedFrames: number;

  loadManifoldPressurePa(rpm: number, load01: number): number;
  setOperatingPoint(value: CrankwaveOperatingPoint): CrankwaveOperatingPoint;
  reset(): CrankwaveOperatingPoint;
  process(value: CrankwaveOperatingPoint, frameCount?: number): Float32Array;
  render(frameCount?: number): Float32Array;
  diagnostics(): unknown;
}

export class CrankwaveAudioEngineError extends Error {
  readonly code: string;
}

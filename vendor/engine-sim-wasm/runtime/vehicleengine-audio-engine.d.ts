export interface VehicleEngineOperatingPoint {
  readonly rpm: number;
  readonly throttle01: number;
  readonly load01: number;
}

export interface VehicleEngineAudioFormat {
  readonly sampleRateHz: number;
  readonly channelCount: 1;
  readonly sampleEncoding: 'float32';
  readonly interleaving: 'mono';
  readonly processFrames: number;
  readonly latencyFrames: number;
  readonly internalBlockFrames: number;
}

export class VehicleEngineAudioEngine {
  static load(
    input: ArrayBuffer | ArrayBufferView,
    options?: { readonly crypto?: unknown; readonly sessionSeed?: string }
  ): Promise<VehicleEngineAudioEngine>;

  readonly engineId: string;
  readonly sampleRate: number;
  readonly channelCount: 1;
  readonly minimumRpm: number;
  readonly maximumRpm: number;
  readonly blockFrames: number;
  readonly processFrames: number;
  readonly latencyFrames: number;
  readonly format: VehicleEngineAudioFormat;
  readonly operatingPoint: VehicleEngineOperatingPoint;
  readonly queuedFrames: number;

  loadManifoldPressurePa(rpm: number, load01: number): number;
  setOperatingPoint(value: VehicleEngineOperatingPoint): VehicleEngineOperatingPoint;
  reset(): VehicleEngineOperatingPoint;
  process(value: VehicleEngineOperatingPoint, frameCount?: number): Float32Array;
  render(frameCount?: number): Float32Array;
  diagnostics(): unknown;
}

export class VehicleEngineAudioEngineError extends Error {
  readonly code: string;
}
